import { Logger } from '@nestjs/common';

import { Cenario, criarCenario } from '../../../test/fakes/cenario';
import { contexto, criarOrquestrador, incluirItens, INSUMO, osAberta, SERVICO } from '../../../test/fakes/saga';
import { EtapaSaga } from '../../domain/saga/SagaInstance';
import { OrquestradorSaga } from './orquestrador-saga';

const ENVIADO = { valorTotal: 321, validoAte: '2026-10-20T12:00:00.000Z' };
const INICIO = new Date('2026-10-17T12:00:00.000Z');

describe('OrquestradorSaga — métricas', () => {
  let c: Cenario;
  let orq: OrquestradorSaga;
  let osId: string;
  let warn: jest.SpyInstance;

  /** Avança o relógio e processa o evento. */
  const depois = async (segundos: number, evento: () => Promise<void>) => {
    jest.setSystemTime(Date.now() + segundos * 1000);
    await evento();
  };

  async function aprovada(): Promise<void> {
    await depois(1, () => orq.diagnosticoIniciado(contexto(osId)));
    await incluirItens(c, osId, [SERVICO, INSUMO]);
    await depois(2, () => orq.diagnosticoConcluido(contexto(osId)));
    await depois(3, () => orq.orcamentoEnviado(contexto(osId), ENVIADO));
    await depois(4, () => orq.orcamentoAprovado(contexto(osId)));
  }

  beforeEach(async () => {
    jest.useFakeTimers({ now: INICIO, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    c = criarCenario();
    orq = criarOrquestrador(c);
    osId = await osAberta(c);
  });

  afterEach(() => {
    warn.mockRestore();
    jest.useRealTimers();
  });

  it('fluxo feliz: duração de cada etapa desde a última gravação da saga e uma conclusão', async () => {
    await aprovada();
    await depois(5, () => orq.insumosReservados(contexto(osId)));
    await depois(6, () => orq.execucaoAceita(contexto(osId)));
    await depois(7, () => orq.reparoIniciado(contexto(osId)));
    await depois(8, () => orq.execucaoConcluida(contexto(osId)));
    await depois(9, () => orq.cobrancaGerada(contexto(osId), { initPoint: 'https://pagar/1' }));
    await depois(10, () => orq.pagamentoConfirmado(contexto(osId)));

    // O instante de entrada é o atualizadoEm da saga: eventos que regravam a saga sem mudar
    // de etapa (diagnóstico iniciado, orçamento enviado, reparo iniciado, cobrança gerada)
    // reiniciam a contagem.
    expect(c.metricas.etapas).toEqual([
      { etapa: EtapaSaga.DIAGNOSTICO, segundos: 2 },
      { etapa: EtapaSaga.ORCAMENTO, segundos: 4 },
      { etapa: EtapaSaga.RESERVA, segundos: 5 },
      { etapa: EtapaSaga.EXECUCAO_SOLICITADA, segundos: 6 },
      { etapa: EtapaSaga.EXECUCAO, segundos: 8 },
      { etapa: EtapaSaga.COBRANCA, segundos: 10 },
    ]);
    expect(c.metricas.concluidas).toBe(1);
    expect(c.metricas.compensacoes).toEqual([]);
  });

  it('falha na reserva conta uma compensação com o código da falha', async () => {
    await aprovada();
    await depois(1, () =>
      orq.reservaFalhou(contexto(osId), { motivo: 'ESTOQUE_INSUFICIENTE', mensagem: 'Sem estoque' }),
    );
    await depois(1, () => orq.orcamentoCancelado(contexto(osId)));

    expect(c.metricas.compensacoes).toEqual(['ESTOQUE_INSUFICIENTE']);
    expect(c.metricas.etapas.slice(-2).map((e) => e.etapa)).toEqual([
      EtapaSaga.RESERVA,
      EtapaSaga.COMPENSANDO_ORCAMENTO,
    ]);
    expect(c.metricas.concluidas).toBe(0);
  });

  it('recusa no pivô conta uma só compensação, mesmo passando por duas etapas de compensação', async () => {
    await aprovada();
    await depois(1, () => orq.insumosReservados(contexto(osId)));
    await depois(1, () =>
      orq.execucaoRecusada(contexto(osId), { motivo: 'CAPACIDADE_ESGOTADA', mensagem: 'Fila cheia' }),
    );
    await depois(1, () => orq.reservasLiberadas(contexto(osId)));
    await depois(1, () => orq.orcamentoCancelado(contexto(osId)));

    expect(c.metricas.compensacoes).toEqual(['CAPACIDADE_ESGOTADA']);
    expect(c.metricas.etapas.slice(-3).map((e) => e.etapa)).toEqual([
      EtapaSaga.EXECUCAO_SOLICITADA,
      EtapaSaga.COMPENSANDO_RESERVAS,
      EtapaSaga.COMPENSANDO_ORCAMENTO,
    ]);
  });

  it('evento sem mudança de etapa, ignorado ou repetido não registra nada', async () => {
    await orq.diagnosticoIniciado(contexto(osId)); // regrava a saga, mesma etapa
    await orq.execucaoAceita(contexto(osId)); // fora da etapa: ignorado
    await incluirItens(c, osId, [SERVICO, INSUMO]);
    const concluido = contexto(osId);
    await orq.diagnosticoConcluido(concluido);
    await orq.diagnosticoConcluido(concluido); // repetido: idempotência

    expect(c.metricas.etapas.map((e) => e.etapa)).toEqual([EtapaSaga.DIAGNOSTICO]);
  });

  it('registra só depois do commit e nada quando a transação é desfeita', async () => {
    await aprovada();
    const etapasAntes = c.metricas.etapas.length;
    jest.spyOn(c.outbox, 'publicar').mockRejectedValueOnce(new Error('banco fora'));
    await expect(orq.insumosReservados(contexto(osId))).rejects.toThrow('banco fora');
    expect(c.metricas.etapas).toHaveLength(etapasAntes);

    let emTransacao: boolean | undefined;
    jest.spyOn(c.metricas, 'etapaConcluida').mockImplementationOnce(() => {
      emTransacao = c.transacao.ativa;
    });
    await orq.insumosReservados(contexto(osId));
    expect(emTransacao).toBe(false);
  });
});
