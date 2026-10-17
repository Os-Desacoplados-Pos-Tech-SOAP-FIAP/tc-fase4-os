import { OrquestradorSaga } from '../../application/saga/orquestrador-saga';
import {
  BILLING_EVENTS,
  CATALOG_EVENTS,
  EXECUTION_EVENTS,
} from '../../application/saga/saga-messages';
import { criarEnvelope } from '../../application/ports/message-envelope';
import { MensagemInvalidaError } from '../../infrastructure/messaging/message-envelope.parser';
import { MessageHandlerRegistry } from '../../infrastructure/messaging/message-handler.registry';
import { SagaMessageHandlers } from './saga-message.handlers';

const OS = '55555555-5555-4555-8555-555555555555';

function orquestradorFalso() {
  const metodos = [
    'diagnosticoIniciado', 'diagnosticoConcluido', 'orcamentoEnviado', 'orcamentoAprovado',
    'orcamentoReprovado', 'insumosReservados', 'reservaFalhou', 'execucaoAceita', 'execucaoRecusada',
    'reservasLiberadas', 'orcamentoCancelado', 'reparoIniciado', 'execucaoConcluida', 'cobrancaGerada',
    'pagamentoRecusado', 'pagamentoConfirmado',
  ] as const;
  return Object.fromEntries(metodos.map((m) => [m, jest.fn().mockResolvedValue(undefined)])) as unknown as jest.Mocked<OrquestradorSaga>;
}

describe('SagaMessageHandlers', () => {
  let registry: MessageHandlerRegistry;
  let orq: jest.Mocked<OrquestradorSaga>;

  beforeEach(() => {
    registry = new MessageHandlerRegistry();
    orq = orquestradorFalso();
    new SagaMessageHandlers(registry, orq).onModuleInit();
  });

  const despachar = (tipo: string, payload: object = { osId: OS }) =>
    registry.despachar(criarEnvelope(tipo, OS, payload));
  const ctx = (tipo: string) => expect.objectContaining({ correlationId: OS, tipo, messageId: expect.any(String) });

  it.each([
    [EXECUTION_EVENTS.DIAGNOSTICO_INICIADO, 'diagnosticoIniciado'],
    [EXECUTION_EVENTS.DIAGNOSTICO_CONCLUIDO, 'diagnosticoConcluido'],
    [EXECUTION_EVENTS.EXECUCAO_ACEITA, 'execucaoAceita'],
    [EXECUTION_EVENTS.REPARO_INICIADO, 'reparoIniciado'],
    [EXECUTION_EVENTS.EXECUCAO_CONCLUIDA, 'execucaoConcluida'],
    [CATALOG_EVENTS.INSUMOS_RESERVADOS, 'insumosReservados'],
    [CATALOG_EVENTS.RESERVAS_LIBERADAS, 'reservasLiberadas'],
    [BILLING_EVENTS.ORCAMENTO_APROVADO, 'orcamentoAprovado'],
    [BILLING_EVENTS.ORCAMENTO_CANCELADO, 'orcamentoCancelado'],
    [BILLING_EVENTS.PAGAMENTO_CONFIRMADO, 'pagamentoConfirmado'],
  ] as const)('%s → %s', async (tipo, metodo) => {
    await despachar(tipo);
    expect(orq[metodo]).toHaveBeenCalledWith(ctx(tipo));
  });

  it('reprovado e expirado viram reprovação com motivos diferentes', async () => {
    await despachar(BILLING_EVENTS.ORCAMENTO_REPROVADO);
    await despachar(BILLING_EVENTS.ORCAMENTO_EXPIRADO);
    expect(orq.orcamentoReprovado.mock.calls.map((chamada) => chamada[1])).toEqual([
      'Orçamento reprovado pelo cliente',
      'Orçamento expirado sem resposta do cliente',
    ]);
  });

  it('lê só os campos usados (tolerant reader)', async () => {
    await despachar(BILLING_EVENTS.ORCAMENTO_ENVIADO, { osId: OS, valorTotal: 321, validoAte: '2026-10-20T12:00:00.000Z', extra: 1 });
    expect(orq.orcamentoEnviado).toHaveBeenCalledWith(ctx(BILLING_EVENTS.ORCAMENTO_ENVIADO), {
      valorTotal: 321,
      validoAte: '2026-10-20T12:00:00.000Z',
    });
    await despachar(BILLING_EVENTS.COBRANCA_GERADA, { initPoint: 'https://pagar/1', valor: 10 });
    expect(orq.cobrancaGerada).toHaveBeenCalledWith(ctx(BILLING_EVENTS.COBRANCA_GERADA), { initPoint: 'https://pagar/1' });
    await despachar(CATALOG_EVENTS.RESERVA_INSUMOS_FALHOU, { motivo: 'ESTOQUE_INSUFICIENTE', mensagem: 'sem filtro' });
    expect(orq.reservaFalhou).toHaveBeenCalledWith(ctx(CATALOG_EVENTS.RESERVA_INSUMOS_FALHOU), {
      motivo: 'ESTOQUE_INSUFICIENTE',
      mensagem: 'sem filtro',
    });
    await despachar(EXECUTION_EVENTS.EXECUCAO_RECUSADA, { motivo: 'CAPACIDADE_ESGOTADA' });
    expect(orq.execucaoRecusada).toHaveBeenCalledWith(ctx(EXECUTION_EVENTS.EXECUCAO_RECUSADA), {
      motivo: 'CAPACIDADE_ESGOTADA',
      mensagem: undefined,
    });
    await despachar(BILLING_EVENTS.PAGAMENTO_RECUSADO, { motivo: 'cc_rejected_other_reason' });
    expect(orq.pagamentoRecusado).toHaveBeenCalledWith(ctx(BILLING_EVENTS.PAGAMENTO_RECUSADO), {
      motivo: 'cc_rejected_other_reason',
      mensagem: undefined,
    });
  });

  it.each([
    [BILLING_EVENTS.ORCAMENTO_ENVIADO, { valorTotal: '321', validoAte: '2026-10-20T12:00:00.000Z' }],
    [BILLING_EVENTS.ORCAMENTO_ENVIADO, { valorTotal: 321, validoAte: 'amanhã' }],
    [BILLING_EVENTS.COBRANCA_GERADA, {}],
    [CATALOG_EVENTS.RESERVA_INSUMOS_FALHOU, { mensagem: 'sem motivo' }],
  ])('payload fora do contrato em %s → MensagemInvalidaError (DLQ)', async (tipo, payload) => {
    await expect(despachar(tipo, payload)).rejects.toBeInstanceOf(MensagemInvalidaError);
  });

  it('servico-executado e estoque-baixado são aceitos sem efeito', async () => {
    await despachar(EXECUTION_EVENTS.SERVICO_EXECUTADO);
    await despachar(CATALOG_EVENTS.ESTOQUE_BAIXADO);
    Object.values(orq).forEach((metodo) => expect(metodo).not.toHaveBeenCalled());
  });
});
