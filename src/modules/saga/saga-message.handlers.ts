import { Injectable, OnModuleInit } from '@nestjs/common';
import { IsISO8601, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

import { MessageEnvelope } from '../../application/ports/message-envelope';
import { ContextoEvento, OrquestradorSaga } from '../../application/saga/orquestrador-saga';
import {
  BILLING_EVENTS,
  CATALOG_EVENTS,
  EXECUTION_EVENTS,
} from '../../application/saga/saga-messages';
import { MessageHandlerRegistry } from '../../infrastructure/messaging/message-handler.registry';
import { validarPayload } from '../../infrastructure/messaging/validar-payload';

class OrcamentoEnviadoMensagem {
  @IsNumber() @Min(0) valorTotal!: number;
  @IsISO8601() validoAte!: string;
}

class CobrancaGeradaMensagem {
  @IsString() @IsNotEmpty() initPoint!: string;
}

class FalhaMensagem {
  @IsString() @IsNotEmpty() motivo!: string;
  @IsOptional() @IsString() mensagem?: string;
}

const contexto = (envelope: MessageEnvelope): ContextoEvento => ({
  messageId: envelope.messageId,
  correlationId: envelope.correlationId,
  tipo: envelope.type,
});

/** Eventos sem decisão na saga: aceitos e descartados (a mensagem sai da fila). */
const semEfeito = async (): Promise<void> => undefined;

/**
 * Liga os eventos dos três serviços (fila de entrada do OS) ao orquestrador.
 * Tolerant reader: valida só os campos que a saga lê; o resto do payload é ignorado.
 */
@Injectable()
export class SagaMessageHandlers implements OnModuleInit {
  constructor(
    private readonly registry: MessageHandlerRegistry,
    private readonly saga: OrquestradorSaga,
  ) {}

  onModuleInit(): void {
    this.registrarExecution();
    this.registrarCatalog();
    this.registrarBilling();
  }

  private registrarExecution(): void {
    const r = this.registry;
    r.registrar(EXECUTION_EVENTS.DIAGNOSTICO_INICIADO, (e) => this.saga.diagnosticoIniciado(contexto(e)));
    r.registrar(EXECUTION_EVENTS.DIAGNOSTICO_CONCLUIDO, (e) => this.saga.diagnosticoConcluido(contexto(e)));
    r.registrar(EXECUTION_EVENTS.EXECUCAO_ACEITA, (e) => this.saga.execucaoAceita(contexto(e)));
    r.registrar(EXECUTION_EVENTS.EXECUCAO_RECUSADA, async (e) =>
      this.saga.execucaoRecusada(contexto(e), await lerFalha(e)),
    );
    r.registrar(EXECUTION_EVENTS.REPARO_INICIADO, (e) => this.saga.reparoIniciado(contexto(e)));
    r.registrar(EXECUTION_EVENTS.SERVICO_EXECUTADO, semEfeito);
    r.registrar(EXECUTION_EVENTS.EXECUCAO_CONCLUIDA, (e) => this.saga.execucaoConcluida(contexto(e)));
  }

  private registrarCatalog(): void {
    const r = this.registry;
    r.registrar(CATALOG_EVENTS.INSUMOS_RESERVADOS, (e) => this.saga.insumosReservados(contexto(e)));
    r.registrar(CATALOG_EVENTS.RESERVA_INSUMOS_FALHOU, async (e) =>
      this.saga.reservaFalhou(contexto(e), await lerFalha(e)),
    );
    r.registrar(CATALOG_EVENTS.RESERVAS_LIBERADAS, (e) => this.saga.reservasLiberadas(contexto(e)));
    r.registrar(CATALOG_EVENTS.ESTOQUE_BAIXADO, semEfeito);
  }

  private registrarBilling(): void {
    const r = this.registry;
    r.registrar(BILLING_EVENTS.ORCAMENTO_ENVIADO, async (e) => {
      const { valorTotal, validoAte } = await validarPayload(OrcamentoEnviadoMensagem, e.payload);
      await this.saga.orcamentoEnviado(contexto(e), { valorTotal, validoAte });
    });
    r.registrar(BILLING_EVENTS.ORCAMENTO_APROVADO, (e) => this.saga.orcamentoAprovado(contexto(e)));
    r.registrar(BILLING_EVENTS.ORCAMENTO_REPROVADO, (e) =>
      this.saga.orcamentoReprovado(contexto(e), 'Orçamento reprovado pelo cliente'),
    );
    r.registrar(BILLING_EVENTS.ORCAMENTO_EXPIRADO, (e) =>
      this.saga.orcamentoReprovado(contexto(e), 'Orçamento expirado sem resposta do cliente'),
    );
    r.registrar(BILLING_EVENTS.ORCAMENTO_CANCELADO, (e) => this.saga.orcamentoCancelado(contexto(e)));
    r.registrar(BILLING_EVENTS.COBRANCA_GERADA, async (e) => {
      const { initPoint } = await validarPayload(CobrancaGeradaMensagem, e.payload);
      await this.saga.cobrancaGerada(contexto(e), { initPoint });
    });
    r.registrar(BILLING_EVENTS.PAGAMENTO_CONFIRMADO, (e) => this.saga.pagamentoConfirmado(contexto(e)));
    r.registrar(BILLING_EVENTS.PAGAMENTO_RECUSADO, async (e) =>
      this.saga.pagamentoRecusado(contexto(e), await lerFalha(e)),
    );
  }
}

async function lerFalha(envelope: MessageEnvelope): Promise<{ motivo: string; mensagem?: string }> {
  const { motivo, mensagem } = await validarPayload(FalhaMensagem, envelope.payload);
  return { motivo, mensagem };
}
