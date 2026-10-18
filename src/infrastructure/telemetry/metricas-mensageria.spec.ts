import { GetQueueAttributesCommand, SQSClient } from '@aws-sdk/client-sqs';
import { Logger } from '@nestjs/common';
import { context, metrics } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { isTracingSuppressed } from '@opentelemetry/core';
import { AggregationTemporality, MeterProvider, MetricReader } from '@opentelemetry/sdk-metrics';
import { mockClient } from 'aws-sdk-client-mock';

import { PrismaService } from '../database/prisma.service';
import { lerMessagingConfig } from '../messaging/messaging.config';
import { GaugesMensageria, MetricasMensageria } from './metricas-mensageria';

/** Reader de teste: só coleta sob demanda. */
class LeitorDeTeste extends MetricReader {
  constructor() {
    super({ aggregationTemporalitySelector: () => AggregationTemporality.CUMULATIVE });
  }
  protected async onForceFlush(): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
}

const DLQ = 'http://localstack:4566/000000000000/oficina-os-inbox-dlq.fifo';

describe('metricas-mensageria', () => {
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
  const pontos = async (nome: string) =>
    (await coletar())
      .find((m) => m.descriptor.name === nome)
      ?.dataPoints.map((p) => ({ attributes: p.attributes, value: p.value }));

  describe('MetricasMensageria', () => {
    it('conta mensagens processadas por tipo e resultado', async () => {
      const metricas = new MetricasMensageria();
      metricas.mensagemProcessada('a.v1', 'ok');
      metricas.mensagemProcessada('a.v1', 'ok');
      metricas.mensagemProcessada('a.v1', 'erro');

      expect(await pontos('mensagens_processadas_total')).toEqual([
        { attributes: { tipo: 'a.v1', resultado: 'ok' }, value: 2 },
        { attributes: { tipo: 'a.v1', resultado: 'erro' }, value: 1 },
      ]);
    });
  });

  describe('GaugesMensageria', () => {
    const sqs = mockClient(SQSClient);
    let count: jest.Mock;
    let agora: jest.SpyInstance;
    let instante: number;

    const criar = (env: NodeJS.ProcessEnv = { DLQ_QUEUE_URL: DLQ }) => {
      const gauges = new GaugesMensageria(
        { outbox: { count } } as unknown as PrismaService,
        new SQSClient({}),
        lerMessagingConfig(env),
      );
      gauges.onModuleInit();
      return gauges;
    };

    beforeEach(() => {
      sqs.reset();
      sqs.on(GetQueueAttributesCommand).resolves({ Attributes: { ApproximateNumberOfMessages: '5' } });
      count = jest.fn().mockResolvedValue(3);
      instante = 1_000_000;
      agora = jest.spyOn(Date, 'now').mockImplementation(() => instante);
    });
    afterEach(() => agora.mockRestore());

    it('outbox_pendentes conta as linhas ainda não publicadas', async () => {
      criar();
      expect(await pontos('outbox_pendentes')).toEqual([{ attributes: {}, value: 3 }]);
      expect(count).toHaveBeenCalledWith({ where: { publicadoEm: null } });
    });

    it('dlq_mensagens lê ApproximateNumberOfMessages da DLQ', async () => {
      criar();
      expect(await pontos('dlq_mensagens')).toEqual([{ attributes: {}, value: 5 }]);
      expect(sqs.commandCalls(GetQueueAttributesCommand)[0].args[0].input).toEqual({
        QueueUrl: DLQ,
        AttributeNames: ['ApproximateNumberOfMessages'],
      });
    });

    it('reaproveita a leitura por 30 s antes de consultar de novo', async () => {
      criar();
      await coletar();
      instante += 29_999;
      await coletar();
      expect(count).toHaveBeenCalledTimes(1);
      expect(sqs.commandCalls(GetQueueAttributesCommand)).toHaveLength(1);

      count.mockResolvedValue(7);
      instante += 1;
      expect(await pontos('outbox_pendentes')).toEqual([{ attributes: {}, value: 7 }]);
      expect(sqs.commandCalls(GetQueueAttributesCommand)).toHaveLength(2);
    });

    it('sem DLQ_QUEUE_URL não registra dlq_mensagens', async () => {
      criar({});
      const nomes = (await coletar()).map((m) => m.descriptor.name);
      expect(nomes).toEqual(['outbox_pendentes']);
      expect(sqs.commandCalls(GetQueueAttributesCommand)).toHaveLength(0);
    });

    it('falha na leitura não quebra a coleta e avisa no máximo uma vez por minuto', async () => {
      sqs.on(GetQueueAttributesCommand).rejects(new Error('sqs fora'));
      const aviso = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      try {
        criar();
        expect(await pontos('dlq_mensagens')).toBeUndefined(); // sem ponto nesta coleta
        expect(await pontos('outbox_pendentes')).toEqual([{ attributes: {}, value: 3 }]);
        expect(aviso).toHaveBeenCalledTimes(1);
        expect(aviso).toHaveBeenCalledWith({
          msg: 'Falha ao ler métrica',
          metrica: 'dlq_mensagens',
          err: { message: 'sqs fora', name: 'Error' },
        });

        instante += 30_000; // nova tentativa, ainda dentro do minuto do aviso
        await coletar();
        expect(sqs.commandCalls(GetQueueAttributesCommand)).toHaveLength(2);
        expect(aviso).toHaveBeenCalledTimes(1);

        instante += 30_000;
        await coletar();
        expect(aviso).toHaveBeenCalledTimes(2);
      } finally {
        aviso.mockRestore();
      }
    });

    it('a leitura não gera spans (tracing suprimido)', async () => {
      let suprimido: boolean | undefined;
      count.mockImplementation(async () => {
        suprimido = isTracingSuppressed(context.active());
        return 0;
      });
      criar();
      await coletar();
      expect(suprimido).toBe(true);
    });
  });
});
