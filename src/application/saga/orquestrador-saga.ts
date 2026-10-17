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
import { OrcamentoEnviadoLido } from './saga-messages';

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
