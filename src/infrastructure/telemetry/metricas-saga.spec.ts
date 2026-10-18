import { Logger } from '@nestjs/common';
import { context, metrics } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { isTracingSuppressed } from '@opentelemetry/core';
import {
  AggregationTemporality,
  type HistogramMetricData,
  MeterProvider,
  MetricReader,
} from '@opentelemetry/sdk-metrics';

import { StatusOS } from '../../domain/ordem-de-servico/StatusOS';
import { EtapaSaga } from '../../domain/saga/SagaInstance';
import { PrismaService } from '../database/prisma.service';
import { GaugeOsPorStatus, MetricasSaga } from './metricas-saga';

/** Reader de teste: só coleta sob demanda. */
class LeitorDeTeste extends MetricReader {
  constructor() {
    super({ aggregationTemporalitySelector: () => AggregationTemporality.CUMULATIVE });
  }
  protected async onForceFlush(): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
}

describe('metricas-saga', () => {
  let leitor: LeitorDeTeste;
  let provider: MeterProvider;

  beforeAll(() => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  });
  beforeEach(() => {
    leitor = new LeitorDeTeste();
    provider = new MeterProvider({ readers: [leitor] });
    metrics.setGlobalMeterProvider(provider);
  });
  afterEach(async () => {
    metrics.disable();
    await provider.shutdown();
  });
  afterAll(() => context.disable());

  const coletar = async () => {
    const { resourceMetrics, errors } = await leitor.collect();
    expect(errors).toEqual([]);
    return resourceMetrics.scopeMetrics.flatMap((s) => s.metrics);
  };
  const metrica = async (nome: string) => (await coletar()).find((m) => m.descriptor.name === nome);
  const pontos = async (nome: string) =>
    (await metrica(nome))?.dataPoints.map((p) => ({ attributes: p.attributes, value: p.value }));

  describe('MetricasSaga', () => {
    it('conta sagas iniciadas e concluídas', async () => {
      const metricas = new MetricasSaga();
      metricas.iniciada();
      metricas.iniciada();
      metricas.concluida();

      expect(await pontos('saga_iniciadas_total')).toEqual([{ attributes: {}, value: 2 }]);
      expect(await pontos('saga_concluidas_total')).toEqual([{ attributes: {}, value: 1 }]);
    });

    it('conta compensações por motivo', async () => {
      const metricas = new MetricasSaga();
      metricas.compensada('ESTOQUE_INSUFICIENTE');
      metricas.compensada('ESTOQUE_INSUFICIENTE');
      metricas.compensada('CAPACIDADE_ESGOTADA');

      expect(await pontos('saga_compensacoes_total')).toEqual([
        { attributes: { motivo: 'ESTOQUE_INSUFICIENTE' }, value: 2 },
        { attributes: { motivo: 'CAPACIDADE_ESGOTADA' }, value: 1 },
      ]);
    });

    it('registra a duração de cada etapa num histograma em segundos', async () => {
      const metricas = new MetricasSaga();
      metricas.etapaConcluida(EtapaSaga.DIAGNOSTICO, 2);
      metricas.etapaConcluida(EtapaSaga.DIAGNOSTICO, 4);
      metricas.etapaConcluida(EtapaSaga.ORCAMENTO, 0.5);

      const histograma = (await metrica('saga_duracao_etapa_segundos')) as HistogramMetricData;
      expect(
        histograma.dataPoints.map((p) => ({ etapa: p.attributes.etapa, count: p.value.count, sum: p.value.sum })),
      ).toEqual([
        { etapa: 'DIAGNOSTICO', count: 2, sum: 6 },
        { etapa: 'ORCAMENTO', count: 1, sum: 0.5 },
      ]);
      // Buckets pensados para segundos a horas, não os padrões (feitos para milissegundos).
      expect(histograma.dataPoints[0].value.buckets.boundaries).toEqual([
        1, 5, 15, 30, 60, 300, 900, 1800, 3600, 21_600, 86_400,
      ]);
    });
  });

  describe('GaugeOsPorStatus', () => {
    let groupBy: jest.Mock;
    let agora: jest.SpyInstance;
    let instante: number;

    const criar = () => {
      const gauge = new GaugeOsPorStatus({ ordemDeServico: { groupBy } } as unknown as PrismaService);
      gauge.onModuleInit();
      return gauge;
    };
    const valorDe = async (status: StatusOS) =>
      (await pontos('os_por_status'))?.find((p) => p.attributes.status === status)?.value;

    beforeEach(() => {
      groupBy = jest.fn().mockResolvedValue([
        { status: StatusOS.RECEBIDA, _count: { _all: 2 } },
        { status: StatusOS.CANCELADA, _count: { _all: 1 } },
      ]);
      instante = 1_000_000;
      agora = jest.spyOn(Date, 'now').mockImplementation(() => instante);
    });
    afterEach(() => agora.mockRestore());

    it('observa a contagem de OS por status, com zero para os status sem OS', async () => {
      criar();
      const lidos = await pontos('os_por_status');
      expect(lidos).toHaveLength(Object.values(StatusOS).length);
      expect(await valorDe(StatusOS.RECEBIDA)).toBe(2);
      expect(await valorDe(StatusOS.CANCELADA)).toBe(1);
      expect(await valorDe(StatusOS.PAGA)).toBe(0);
      expect(groupBy).toHaveBeenCalledWith({ by: ['status'], _count: { _all: true } });
    });

    it('reaproveita a leitura por 30 s antes de consultar de novo', async () => {
      criar();
      await coletar();
      instante += 29_999;
      await coletar();
      expect(groupBy).toHaveBeenCalledTimes(1);

      groupBy.mockResolvedValue([{ status: StatusOS.RECEBIDA, _count: { _all: 5 } }]);
      instante += 1;
      expect(await valorDe(StatusOS.RECEBIDA)).toBe(5);
      expect(await valorDe(StatusOS.CANCELADA)).toBe(0);
    });

    it('falha na leitura não quebra a coleta: a métrica fica sem pontos', async () => {
      groupBy.mockRejectedValue(new Error('banco fora'));
      const aviso = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      try {
        criar();
        expect(await pontos('os_por_status')).toBeUndefined();
        expect(aviso).toHaveBeenCalledWith({
          msg: 'Falha ao ler métrica',
          metrica: 'os_por_status',
          err: { message: 'banco fora', name: 'Error' },
        });
      } finally {
        aviso.mockRestore();
      }
    });

    it('a leitura não gera spans (tracing suprimido)', async () => {
      let suprimido: boolean | undefined;
      groupBy.mockImplementation(async () => {
        suprimido = isTracingSuppressed(context.active());
        return [];
      });
      criar();
      await coletar();
      expect(suprimido).toBe(true);
    });
  });
});
