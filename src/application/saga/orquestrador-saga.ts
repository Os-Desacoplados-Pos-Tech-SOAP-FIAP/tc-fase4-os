import { Inject, Injectable, Logger } from '@nestjs/common';

import { INJECTION_TOKENS } from '../../common/constants/injection-tokens';
import { IClienteRepository } from '../../domain/cliente/repositories/IClienteRepository';
import { OrdemDeServico } from '../../domain/ordem-de-servico/entities/OrdemDeServico';
import { IOrdemDeServicoRepository } from '../../domain/ordem-de-servico/repositories/IOrdemDeServicoRepository';
import { StatusOS } from '../../domain/ordem-de-servico/StatusOS';
import { ISagaRepository } from '../../domain/saga/ISagaRepository';
import { EtapaSaga, SagaInstance } from '../../domain/saga/SagaInstance';
import { UniqueID } from '../../domain/shared/UniqueID';
import { ensureFound } from '../ensure-found';
import { DestinosComandos } from '../ports/destinos-comandos';
import { ContextoMensagem } from '../ports/message-envelope';
import { IOutbox } from '../ports/outbox';
import { IProcessedMessageRepository } from '../ports/processed-message.repository';
import { ITransactionManager } from '../ports/transaction-manager';
import { ITravaPorOs } from '../ports/trava-por-os';
import { ComandoSaga, comandos, enviarComandos } from './comandos-saga';
import { CobrancaGeradaLida, FalhaLida, OrcamentoEnviadoLido } from './saga-messages';

export interface ContextoEvento extends ContextoMensagem {
  /** Tipo do evento recebido (só para log). */
  tipo: string;
}

interface EstadoDaSaga {
  os: OrdemDeServico;
  saga: SagaInstance;
}

/** Evento fora da etapa esperada: nada é gravado além do registro de idempotência (E7). */
const IGNORADO = Symbol('ignorado');

type Decisao = ComandoSaga[] | typeof IGNORADO;

const NENHUM: ComandoSaga[] = [];

/**
 * Orquestrador da saga da OS (process manager, spec §4.2). Cada evento vira uma transação:
 * idempotência → trava da OS → carrega OS e saga → decide → grava OS, histórico, saga e
 * comandos juntos. O agregado OrdemDeServico guarda as regras de status; aqui só se decide
 * o próximo passo.
 */
@Injectable()
export class OrquestradorSaga {
  private readonly logger = new Logger(OrquestradorSaga.name);

  constructor(
    @Inject(INJECTION_TOKENS.TRANSACTION_MANAGER) private readonly transacao: ITransactionManager,
    @Inject(INJECTION_TOKENS.PROCESSED_MESSAGE_REPOSITORY)
    private readonly mensagensProcessadas: IProcessedMessageRepository,
    @Inject(INJECTION_TOKENS.TRAVA_POR_OS) private readonly trava: ITravaPorOs,
    @Inject(INJECTION_TOKENS.ORDEM_DE_SERVICO_REPOSITORY) private readonly ordens: IOrdemDeServicoRepository,
    @Inject(INJECTION_TOKENS.SAGA_REPOSITORY) private readonly sagas: ISagaRepository,
    @Inject(INJECTION_TOKENS.CLIENTE_REPOSITORY) private readonly clientes: IClienteRepository,
    @Inject(INJECTION_TOKENS.OUTBOX) private readonly outbox: IOutbox,
    @Inject(INJECTION_TOKENS.DESTINOS_COMANDOS) private readonly destinos: DestinosComandos,
  ) {}

  // ── Diagnóstico (Execution) ─────────────────────────────────────────────

  diagnosticoIniciado(ctx: ContextoEvento): Promise<void> {
    return this.processar(ctx, ({ os }) => {
      if (os.status !== StatusOS.RECEBIDA && os.status !== StatusOS.EM_DIAGNOSTICO) return IGNORADO;
      os.iniciarDiagnostico(); // repetido (reabertura) não muda nada
      return NENHUM;
    });
  }

  /** Passo 3: orçamento inválido reabre o diagnóstico (E5); válido vai para o Billing. */
  diagnosticoConcluido(ctx: ContextoEvento): Promise<void> {
    return this.processar(ctx, async ({ os, saga }) => {
      if (!saga.em(EtapaSaga.DIAGNOSTICO) || os.status !== StatusOS.EM_DIAGNOSTICO) return IGNORADO;

      const motivo = os.motivoOrcamentoInvalido();
      if (motivo) {
        os.reabrirDiagnostico(motivo);
        return [comandos.reabrirDiagnostico()];
      }
      const cliente = ensureFound(await this.clientes.buscarPorId(new UniqueID(os.clienteId)), 'Cliente');
      saga.avancar(EtapaSaga.ORCAMENTO);
      return [comandos.gerarOrcamento(os, { nome: cliente.nome, email: cliente.email.value })];
    });
  }

  // ── Orçamento (Billing) ─────────────────────────────────────────────────

  orcamentoEnviado(ctx: ContextoEvento, dados: OrcamentoEnviadoLido): Promise<void> {
    return this.processar(ctx, ({ os, saga }) => {
      const aguardando = os.status === StatusOS.EM_DIAGNOSTICO || os.status === StatusOS.AGUARDANDO_APROVACAO;
      if (!saga.em(EtapaSaga.ORCAMENTO) || !aguardando) return IGNORADO;
      os.registrarOrcamentoEnviado(dados.valorTotal, new Date(dados.validoAte));
      return NENHUM;
    });
  }

  /** Passo 5b: aprovação → reserva de insumos (compensável). */
  orcamentoAprovado(ctx: ContextoEvento): Promise<void> {
    return this.processar(ctx, ({ os, saga }) => {
      if (!this.aguardandoDecisao(os, saga)) return IGNORADO;
      os.aprovarOrcamento();
      saga.avancar(EtapaSaga.RESERVA);
      return [comandos.reservarInsumos(os)];
    });
  }

  /** Passo 5a: reprovação ou expiração encerram a saga (nada a compensar ainda). */
  orcamentoReprovado(ctx: ContextoEvento, motivo: string): Promise<void> {
    return this.processar(ctx, ({ os, saga }) => {
      if (!this.aguardandoDecisao(os, saga)) return IGNORADO;
      os.reprovarOrcamento(motivo);
      saga.avancar(EtapaSaga.ENCERRADA);
      return NENHUM;
    });
  }

  // ── Reserva (Catalog) e pivô (Execution) ────────────────────────────────

  /** Passo 6: com os insumos reservados, pede a execução (pivô). */
  insumosReservados(ctx: ContextoEvento): Promise<void> {
    return this.processar(ctx, ({ os, saga }) => {
      if (saga.em(EtapaSaga.RESERVA)) {
        saga.avancar(EtapaSaga.EXECUCAO_SOLICITADA);
        return [comandos.enfileirarExecucao(os)];
      }
      if (saga.terminada) {
        // Reserva atrasada com a saga já encerrada: devolve o estoque (sem reserva órfã).
        this.logger.warn({ msg: 'Reserva recebida com a saga encerrada; liberando', osId: ctx.correlationId, etapa: saga.etapa });
        return [comandos.liberarReservas()];
      }
      return IGNORADO;
    });
  }

  /** Passo 7: pivô atingido; daqui em diante não há compensação. */
  execucaoAceita(ctx: ContextoEvento): Promise<void> {
    return this.processar(ctx, ({ saga }) => {
      if (!saga.em(EtapaSaga.EXECUCAO_SOLICITADA)) return IGNORADO;
      saga.avancar(EtapaSaga.EXECUCAO);
      return NENHUM;
    });
  }

  // ── Compensações (spec §4.4, E6) ────────────────────────────────────────

  /** Falha na reserva: só o orçamento a desfazer. */
  reservaFalhou(ctx: ContextoEvento, falha: FalhaLida): Promise<void> {
    return this.processar(ctx, ({ saga }) => {
      if (!saga.em(EtapaSaga.RESERVA)) return IGNORADO;
      const motivo = `Reserva de insumos falhou: ${descrever(falha)}`;
      saga.compensar(EtapaSaga.COMPENSANDO_ORCAMENTO, motivo);
      return [comandos.cancelarOrcamento(motivo)];
    });
  }

  /** Recusa no pivô: desfaz em ordem inversa, primeiro as reservas. */
  execucaoRecusada(ctx: ContextoEvento, falha: FalhaLida): Promise<void> {
    return this.processar(ctx, ({ saga }) => {
      if (!saga.em(EtapaSaga.EXECUCAO_SOLICITADA)) return IGNORADO;
      saga.compensar(EtapaSaga.COMPENSANDO_RESERVAS, `Execução recusada: ${descrever(falha)}`);
      return [comandos.liberarReservas()];
    });
  }

  reservasLiberadas(ctx: ContextoEvento): Promise<void> {
    return this.processar(ctx, ({ saga }) => {
      if (!saga.em(EtapaSaga.COMPENSANDO_RESERVAS)) return IGNORADO;
      saga.avancar(EtapaSaga.COMPENSANDO_ORCAMENTO);
      return [comandos.cancelarOrcamento(motivoDaCompensacao(saga))];
    });
  }

  /** Última confirmação: só aqui a OS vira CANCELADA. */
  orcamentoCancelado(ctx: ContextoEvento): Promise<void> {
    return this.processar(ctx, ({ os, saga }) => {
      if (!saga.em(EtapaSaga.COMPENSANDO_ORCAMENTO) || os.status !== StatusOS.APROVADA) return IGNORADO;
      os.cancelar(motivoDaCompensacao(saga));
      saga.avancar(EtapaSaga.COMPENSADA);
      return NENHUM;
    });
  }

  // ── Execução (Execution) ────────────────────────────────────────────────

  reparoIniciado(ctx: ContextoEvento): Promise<void> {
    return this.processar(ctx, ({ os, saga }) => {
      if (!saga.em(EtapaSaga.EXECUCAO) || os.status !== StatusOS.APROVADA) return IGNORADO;
      os.iniciarExecucao();
      return NENHUM;
    });
  }

  /** Passo 9: baixa do estoque e cobrança saem juntas (só retentativa, pós-pivô). */
  execucaoConcluida(ctx: ContextoEvento): Promise<void> {
    return this.processar(ctx, ({ os, saga }) => {
      if (!saga.em(EtapaSaga.EXECUCAO) || os.status !== StatusOS.EM_EXECUCAO) return IGNORADO;
      os.finalizarExecucao();
      saga.avancar(EtapaSaga.COBRANCA);
      return [comandos.baixarReservas(), comandos.gerarCobranca()];
    });
  }

  // ── Cobrança (Billing) ──────────────────────────────────────────────────

  cobrancaGerada(ctx: ContextoEvento, dados: CobrancaGeradaLida): Promise<void> {
    return this.processar(ctx, ({ os }) => {
      if (os.status !== StatusOS.FINALIZADA) return IGNORADO; // PAGA: link antigo, ignora
      os.registrarCobranca(dados.initPoint);
      return NENHUM;
    });
  }

  /** Recusa gera nova cobrança com messageId novo (E8, D6 da Etapa 4). */
  pagamentoRecusado(ctx: ContextoEvento, falha: FalhaLida): Promise<void> {
    return this.processar(ctx, ({ os }) => {
      if (os.status !== StatusOS.FINALIZADA) return IGNORADO;
      os.registrarPagamentoRecusado(falha.motivo);
      return [comandos.gerarCobranca()];
    });
  }

  /** Passo 10. Com D7 da Etapa 4 podem chegar duas confirmações: a segunda é ignorada. */
  pagamentoConfirmado(ctx: ContextoEvento): Promise<void> {
    return this.processar(ctx, ({ os, saga }) => {
      if (os.status !== StatusOS.FINALIZADA || !saga.em(EtapaSaga.COBRANCA)) return IGNORADO;
      os.confirmarPagamento();
      saga.avancar(EtapaSaga.CONCLUIDA);
      return NENHUM;
    });
  }

  // ── Infra da transação ──────────────────────────────────────────────────

  private aguardandoDecisao(os: OrdemDeServico, saga: SagaInstance): boolean {
    return saga.em(EtapaSaga.ORCAMENTO) && os.status === StatusOS.AGUARDANDO_APROVACAO;
  }

  private async processar(
    ctx: ContextoEvento,
    decidir: (estado: EstadoDaSaga) => Decisao | Promise<Decisao>,
  ): Promise<void> {
    await this.transacao.run(async () => {
      if (!(await this.mensagensProcessadas.registrar(ctx.messageId))) return;
      await this.trava.travar(ctx.correlationId);
      const os = ensureFound(await this.ordens.buscarPorId(ctx.correlationId), 'Ordem de serviço');
      const saga = ensureFound(await this.sagas.buscar(ctx.correlationId), 'Saga da ordem de serviço');

      const decisao = await decidir({ os, saga });
      if (decisao === IGNORADO) {
        this.logger.warn({
          msg: 'Evento fora da etapa esperada; ignorado',
          type: ctx.tipo,
          messageId: ctx.messageId,
          osId: ctx.correlationId,
          status: os.status,
          etapa: saga.etapa,
        });
        return;
      }
      await this.ordens.salvar(os);
      await this.sagas.salvar(saga);
      await enviarComandos(this.outbox, this.destinos, ctx.correlationId, decisao, ctx.messageId);
    });
  }
}

const descrever = (falha: FalhaLida): string => falha.mensagem || falha.motivo;

const motivoDaCompensacao = (saga: SagaInstance): string =>
  saga.motivoCompensacao ?? 'Compensação da saga';
