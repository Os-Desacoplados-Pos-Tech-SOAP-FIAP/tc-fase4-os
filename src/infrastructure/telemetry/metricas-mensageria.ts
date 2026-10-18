import { GetQueueAttributesCommand, SQSClient } from '@aws-sdk/client-sqs';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { context, type Counter, type Meter, metrics } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';

import { PrismaService } from '../database/prisma.service';
import { erroParaLog } from '../messaging/erro-para-log';
import { MESSAGING_CONFIG, MessagingConfig } from '../messaging/messaging.config';
import { SQS_PUBLICACAO } from '../messaging/sns-sqs.transport';

/** Nome do meter: cada serviço usa o próprio. */
const NOME_METER = 'tc-fase4-os';

/** Leituras de banco/AWS por coleta ficam em cache: o scrape não vira carga. */
const CACHE_MS = 30_000;
const INTERVALO_AVISO_MS = 60_000;

export type ResultadoMensagem = 'ok' | 'erro';

/**
 * Sem SDK iniciado (testes, dev sem OTLP) o meter global é no-op. O meter é obtido no
 * construtor: o provider de métricas não tem proxy, então precisa já estar registrado.
 */
const meter = (): Meter => metrics.getMeter(NOME_METER);

@Injectable()
export class MetricasMensageria {
  private readonly processadas: Counter = meter().createCounter('mensagens_processadas_total', {
    description: 'Mensagens consumidas da fila de entrada, por tipo e resultado.',
  });

  mensagemProcessada(tipo: string, resultado: ResultadoMensagem): void {
    this.processadas.add(1, { tipo, resultado });
  }
}

/**
 * Valor lido sob demanda e reaproveitado por CACHE_MS. Falha não quebra a coleta: a
 * métrica fica sem ponto até a próxima tentativa e o aviso sai no máximo uma vez por minuto.
 */
class LeituraEmCache {
  private readonly logger = new Logger('MetricasMensageria');
  private valor?: number;
  private lidoEm = Number.NEGATIVE_INFINITY;
  private avisadoEm = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly metrica: string,
    private readonly ler: () => Promise<number>,
  ) {}

  async atual(): Promise<number | undefined> {
    const agora = Date.now();
    if (agora - this.lidoEm < CACHE_MS) return this.valor;
    this.lidoEm = agora;
    try {
      // Sem spans: a coleta periódica encheria o Tempo de traces sem valor.
      this.valor = await context.with(suppressTracing(context.active()), this.ler);
    } catch (erro) {
      this.valor = undefined;
      if (agora - this.avisadoEm >= INTERVALO_AVISO_MS) {
        this.avisadoEm = agora;
        this.logger.warn({ msg: 'Falha ao ler métrica', metrica: this.metrica, err: erroParaLog(erro) });
      }
    }
    return this.valor;
  }
}

/** Gauges da mensageria: outbox ainda não publicada e mensagens paradas na DLQ. */
@Injectable()
export class GaugesMensageria implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SQS_PUBLICACAO) private readonly sqs: SQSClient,
    @Inject(MESSAGING_CONFIG) private readonly config: MessagingConfig,
  ) {}

  onModuleInit(): void {
    this.registrar(
      'outbox_pendentes',
      'Mensagens da outbox ainda não publicadas.',
      // Usa o índice (publicadoEm, seq).
      () => this.prisma.outbox.count({ where: { publicadoEm: null } }),
    );

    const dlq = this.config.dlqQueueUrl;
    if (!dlq) return;
    this.registrar('dlq_mensagens', 'Mensagens na DLQ da fila de entrada (aproximado).', async () => {
      const resposta = await this.sqs.send(
        new GetQueueAttributesCommand({
          QueueUrl: dlq,
          AttributeNames: ['ApproximateNumberOfMessages'],
        }),
      );
      return Number(resposta.Attributes?.ApproximateNumberOfMessages ?? 0);
    });
  }

  private registrar(nome: string, description: string, ler: () => Promise<number>): void {
    const leitura = new LeituraEmCache(nome, ler);
    meter()
      .createObservableGauge(nome, { description })
      .addCallback(async (resultado) => {
        const valor = await leitura.atual();
        if (valor !== undefined) resultado.observe(valor);
      });
  }
}
