import { Cenario, criarCenario } from '../../../test/fakes/cenario';
import { StatusOS } from '../../domain/ordem-de-servico/StatusOS';
import { EtapaSaga } from '../../domain/saga/SagaInstance';
import { OrquestradorSaga } from './orquestrador-saga';
import { contexto, criarOrquestrador, incluirItens, INSUMO, osAberta, SERVICO } from '../../../test/fakes/saga';

describe('OrquestradorSaga — compensações (antes do pivô)', () => {
  let c: Cenario;
  let orq: OrquestradorSaga;
  let osId: string;

  const status = async () => (await c.ordens.buscarPorId(osId))!.status;
  const etapa = async () => (await c.sagas.buscar(osId))!.etapa;
  const ultimoMotivo = async () => (await c.ordens.historico(osId)).at(-1)?.motivo;

  beforeEach(async () => {
    c = criarCenario();
    orq = criarOrquestrador(c);
    osId = await osAberta(c);
    await orq.diagnosticoIniciado(contexto(osId));
    await incluirItens(c, osId, [SERVICO, INSUMO]);
    await orq.diagnosticoConcluido(contexto(osId));
    await orq.orcamentoEnviado(contexto(osId), { valorTotal: 321, validoAte: '2026-10-20T12:00:00.000Z' });
    await orq.orcamentoAprovado(contexto(osId));
    c.outbox.enviadas = [];
  });

  it('reserva-insumos-falhou: cancela o orçamento e, confirmado, a OS fica CANCELADA', async () => {
    await orq.reservaFalhou(contexto(osId), { motivo: 'ESTOQUE_INSUFICIENTE', mensagem: 'Sem estoque de Filtro de óleo' });
    expect(await etapa()).toBe(EtapaSaga.COMPENSANDO_ORCAMENTO);
    expect(await status()).toBe(StatusOS.APROVADA);
    expect(c.outbox.enviadas.map((m) => [m.destino, m.envelope.type, m.envelope.payload])).toEqual([
      ['fila-billing', 'billing.cancelar-orcamento.v1', { motivo: 'Reserva de insumos falhou: Sem estoque de Filtro de óleo' }],
    ]);

    await orq.orcamentoCancelado(contexto(osId));
    expect(await status()).toBe(StatusOS.CANCELADA);
    expect(await etapa()).toBe(EtapaSaga.COMPENSADA);
    expect(await ultimoMotivo()).toBe('Reserva de insumos falhou: Sem estoque de Filtro de óleo');
  });

  it('execucao-recusada: libera reservas, depois cancela o orçamento, depois CANCELADA (E6)', async () => {
    await orq.insumosReservados(contexto(osId));
    c.outbox.enviadas = [];

    await orq.execucaoRecusada(contexto(osId), { motivo: 'CAPACIDADE_ESGOTADA', mensagem: 'Fila de execução cheia' });
    expect(await etapa()).toBe(EtapaSaga.COMPENSANDO_RESERVAS);
    expect(c.outbox.tipos()).toEqual(['catalog.liberar-reservas.v1']);

    await orq.reservasLiberadas(contexto(osId));
    expect(await etapa()).toBe(EtapaSaga.COMPENSANDO_ORCAMENTO);
    expect(c.outbox.tipos()).toEqual(['catalog.liberar-reservas.v1', 'billing.cancelar-orcamento.v1']);
    expect(c.outbox.ultima().envelope.payload).toEqual({ motivo: 'Execução recusada: Fila de execução cheia' });

    await orq.orcamentoCancelado(contexto(osId));
    expect(await status()).toBe(StatusOS.CANCELADA);
    expect(await etapa()).toBe(EtapaSaga.COMPENSADA);
  });

  it('usa o código do motivo quando a falha vem sem mensagem', async () => {
    await orq.reservaFalhou(contexto(osId), { motivo: 'ESTOQUE_INSUFICIENTE' });
    expect(c.outbox.ultima().envelope.payload).toEqual({ motivo: 'Reserva de insumos falhou: ESTOQUE_INSUFICIENTE' });
  });

  it('insumos-reservados atrasado com a saga compensada → liberar-reservas, sem mudar estado', async () => {
    await orq.reservaFalhou(contexto(osId), { motivo: 'ESTOQUE_INSUFICIENTE' });
    await orq.orcamentoCancelado(contexto(osId));
    c.outbox.enviadas = [];

    await orq.insumosReservados(contexto(osId));
    expect(c.outbox.tipos()).toEqual(['catalog.liberar-reservas.v1']);
    expect(await status()).toBe(StatusOS.CANCELADA);
    expect(await etapa()).toBe(EtapaSaga.COMPENSADA);
  });

  it('reservas-liberadas e orcamento-cancelado fora da compensação são ignorados', async () => {
    await orq.reservasLiberadas(contexto(osId));
    await orq.orcamentoCancelado(contexto(osId));
    expect(await status()).toBe(StatusOS.APROVADA);
    expect(await etapa()).toBe(EtapaSaga.RESERVA);
    expect(c.outbox.enviadas).toEqual([]);
  });

  it('recusa da execução depois do pivô é ignorada (não há rollback pós-pivô)', async () => {
    await orq.insumosReservados(contexto(osId));
    await orq.execucaoAceita(contexto(osId));
    c.outbox.enviadas = [];
    await orq.execucaoRecusada(contexto(osId), { motivo: 'CAPACIDADE_ESGOTADA' });
    expect(await etapa()).toBe(EtapaSaga.EXECUCAO);
    expect(c.outbox.enviadas).toEqual([]);
  });

  it('falha no meio desfaz tudo (transação) e a mensagem pode ser reprocessada', async () => {
    const salvar = jest.spyOn(c.sagas, 'salvar').mockRejectedValueOnce(new Error('banco fora'));
    const ctx = contexto(osId);
    await expect(orq.reservaFalhou(ctx, { motivo: 'ESTOQUE_INSUFICIENTE' })).rejects.toThrow('banco fora');
    expect(await status()).toBe(StatusOS.APROVADA);
    expect(c.outbox.enviadas).toEqual([]);
    expect(c.processadas.ids.has(ctx.messageId)).toBe(false);

    salvar.mockRestore();
    await orq.reservaFalhou(ctx, { motivo: 'ESTOQUE_INSUFICIENTE' });
    expect(await etapa()).toBe(EtapaSaga.COMPENSANDO_ORCAMENTO);
  });
});
