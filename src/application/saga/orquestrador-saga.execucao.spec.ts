import { Cenario, criarCenario } from '../../../test/fakes/cenario';
import { StatusOS } from '../../domain/ordem-de-servico/StatusOS';
import { EtapaSaga } from '../../domain/saga/SagaInstance';
import { OrquestradorSaga } from './orquestrador-saga';
import { contexto, criarOrquestrador, incluirItens, INSUMO, osAberta, SERVICO } from '../../../test/fakes/saga';

const ENVIADO = { valorTotal: 321, validoAte: '2026-10-20T12:00:00.000Z' };

describe('OrquestradorSaga — reserva, pivô, execução e cobrança', () => {
  let c: Cenario;
  let orq: OrquestradorSaga;
  let osId: string;

  const status = async () => (await c.ordens.buscarPorId(osId))!.status;
  const etapa = async () => (await c.sagas.buscar(osId))!.etapa;

  async function aprovada(): Promise<void> {
    await orq.diagnosticoIniciado(contexto(osId));
    await incluirItens(c, osId, [SERVICO, INSUMO]);
    await orq.diagnosticoConcluido(contexto(osId));
    await orq.orcamentoEnviado(contexto(osId), ENVIADO);
    await orq.orcamentoAprovado(contexto(osId));
  }

  async function emExecucao(): Promise<void> {
    await aprovada();
    await orq.insumosReservados(contexto(osId));
    await orq.execucaoAceita(contexto(osId));
    await orq.reparoIniciado(contexto(osId));
  }

  beforeEach(async () => {
    c = criarCenario();
    orq = criarOrquestrador(c);
    osId = await osAberta(c);
  });

  it('insumos-reservados: pede a execução (pivô) só com os serviços', async () => {
    await aprovada();
    c.outbox.enviadas = [];
    await orq.insumosReservados(contexto(osId));
    expect(await etapa()).toBe(EtapaSaga.EXECUCAO_SOLICITADA);
    expect(c.outbox.ultima().destino).toBe('fila-execution');
    expect(c.outbox.ultima().envelope.type).toBe('execution.enfileirar-execucao.v1');
    expect(c.outbox.ultima().envelope.payload).toEqual({
      itens: [expect.objectContaining({ servicoId: SERVICO.referenciaId, descricao: 'Revisão geral' })],
    });
  });

  it('execucao-aceita marca o pivô; reparo-iniciado leva a OS para EM_EXECUCAO', async () => {
    await aprovada();
    await orq.insumosReservados(contexto(osId));
    await orq.execucaoAceita(contexto(osId));
    expect(await etapa()).toBe(EtapaSaga.EXECUCAO);
    expect((await c.sagas.buscar(osId))!.pivoAtingido).toBe(true);
    expect(await status()).toBe(StatusOS.APROVADA);
    await orq.reparoIniciado(contexto(osId));
    expect(await status()).toBe(StatusOS.EM_EXECUCAO);
  });

  it('execucao-concluida: FINALIZADA, saga COBRANCA, baixa reservas e pede cobrança', async () => {
    await emExecucao();
    c.outbox.enviadas = [];
    await orq.execucaoConcluida(contexto(osId));
    expect(await status()).toBe(StatusOS.FINALIZADA);
    expect(await etapa()).toBe(EtapaSaga.COBRANCA);
    expect(c.outbox.enviadas.map((m) => [m.destino, m.envelope.type])).toEqual([
      ['fila-catalog', 'catalog.baixar-reservas.v1'],
      ['fila-billing', 'billing.gerar-cobranca.v1'],
    ]);
  });

  it('cobranca-gerada grava o link; pagamento-confirmado leva a PAGA e conclui a saga', async () => {
    await emExecucao();
    await orq.execucaoConcluida(contexto(osId));
    await orq.cobrancaGerada(contexto(osId), { initPoint: 'https://pagar/1' });
    expect((await c.ordens.buscarPorId(osId))!.linkPagamento).toBe('https://pagar/1');
    await orq.pagamentoConfirmado(contexto(osId));
    expect(await status()).toBe(StatusOS.PAGA);
    expect(await etapa()).toBe(EtapaSaga.CONCLUIDA);
  });

  it('pagamento-recusado: registra, limpa o link e pede nova cobrança (E8)', async () => {
    await emExecucao();
    await orq.execucaoConcluida(contexto(osId));
    await orq.cobrancaGerada(contexto(osId), { initPoint: 'https://pagar/1' });
    c.outbox.enviadas = [];
    await orq.pagamentoRecusado(contexto(osId), { motivo: 'cc_rejected_other_reason' });

    const os = (await c.ordens.buscarPorId(osId))!;
    expect(os.status).toBe(StatusOS.FINALIZADA);
    expect(os.linkPagamento).toBeNull();
    expect(c.outbox.tipos()).toEqual(['billing.gerar-cobranca.v1']);
    expect((await c.ordens.historico(osId)).at(-1)?.motivo).toBe('Pagamento recusado: cc_rejected_other_reason');
  });

  it('depois de PAGA: cobrança, recusa e confirmação repetidas são ignoradas', async () => {
    await emExecucao();
    await orq.execucaoConcluida(contexto(osId));
    await orq.pagamentoConfirmado(contexto(osId));
    c.outbox.enviadas = [];

    await orq.cobrancaGerada(contexto(osId), { initPoint: 'https://pagar/2' });
    await orq.pagamentoRecusado(contexto(osId), { motivo: 'x' });
    await orq.pagamentoConfirmado(contexto(osId));

    const os = (await c.ordens.buscarPorId(osId))!;
    expect(os.status).toBe(StatusOS.PAGA);
    expect(os.linkPagamento).toBeNull();
    expect(c.outbox.enviadas).toEqual([]);
  });

  it('reparo-iniciado e execucao-concluida fora de ordem são ignorados', async () => {
    await aprovada();
    await orq.reparoIniciado(contexto(osId));
    await orq.execucaoConcluida(contexto(osId));
    expect(await status()).toBe(StatusOS.APROVADA);
    expect(await etapa()).toBe(EtapaSaga.RESERVA);
  });
});
