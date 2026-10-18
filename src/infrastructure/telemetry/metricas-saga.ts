import { Injectable, OnModuleInit } from '@nestjs/common';
import type { Counter, Histogram } from '@opentelemetry/api';

import { CODIGOS_COMPENSACAO } from '../../application/saga/motivo-compensacao';
import { ISagaMetricas } from '../../application/saga/saga-metricas';
import { StatusOS } from '../../domain/ordem-de-servico/StatusOS';
import { EtapaSaga } from '../../domain/saga/SagaInstance';
import { PrismaService } from '../database/prisma.service';
import { LeituraEmCache, meter } from './metricas-mensageria';

/** Etapas duram de segundos (local) a horas/dias (aprovação do cliente): buckets em segundos. */
const BUCKETS_DURACAO_ETAPA = [1, 5, 15, 30, 60, 300, 900, 1800, 3600, 21_600, 86_400];

/** Implementação OpenTelemetry da porta de métricas da saga (no-op sem SDK). */
@Injectable()
export class MetricasSaga implements ISagaMetricas {
  private readonly iniciadas: Counter = meter().createCounter('saga_iniciadas_total', {
    description: 'Sagas iniciadas (OS abertas).',
  });
  private readonly concluidas: Counter = meter().createCounter('saga_concluidas_total', {
    description: 'Sagas concluídas (pagamento confirmado).',
  });
  private readonly compensacoes: Counter = meter().createCounter('saga_compensacoes_total', {
    description: 'Sagas que entraram em compensação, por código da falha.',
  });
  // Sem `unit`: o exportador acrescentaria o sufixo da unidade ao nome no Prometheus.
  private readonly duracaoEtapa: Histogram = meter().createHistogram('saga_duracao_etapa_segundos', {
    description: 'Tempo em cada etapa da saga, em segundos, medido na saída da etapa.',
    advice: { explicitBucketBoundaries: BUCKETS_DURACAO_ETAPA },
  });

  /**
   * O SDK só exporta um contador depois do primeiro `add`; sem o zero inicial, o increase()
   * do Prometheus perde o primeiro incremento depois do boot.
   */
  constructor() {
    this.iniciadas.add(0);
    this.concluidas.add(0);
    for (const motivo of CODIGOS_COMPENSACAO) this.compensacoes.add(0, { motivo });
  }

  iniciada(): void {
    this.iniciadas.add(1);
  }

  concluida(): void {
    this.concluidas.add(1);
  }

  compensada(motivo: string): void {
    this.compensacoes.add(1, { motivo });
  }

  etapaConcluida(etapa: EtapaSaga, segundos: number): void {
    this.duracaoEtapa.record(segundos, { etapa });
  }
}

type ContagemPorStatus = Map<StatusOS, number>;

/** Gauge de OS por status, lido do banco com cache e sem spans (como os gauges da mensageria). */
@Injectable()
export class GaugeOsPorStatus implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    const leitura = new LeituraEmCache<ContagemPorStatus>('os_por_status', () => this.contar());
    meter()
      .createObservableGauge('os_por_status', { description: 'Ordens de serviço por status atual.' })
      .addCallback(async (resultado) => {
        const contagem = await leitura.atual();
        if (!contagem) return;
        // Status sem OS saem com zero: a série não some do painel.
        for (const status of Object.values(StatusOS)) {
          resultado.observe(contagem.get(status) ?? 0, { status });
        }
      });
  }

  /** Usa o índice por status. */
  private async contar(): Promise<ContagemPorStatus> {
    const grupos = await this.prisma.ordemDeServico.groupBy({ by: ['status'], _count: { _all: true } });
    return new Map(grupos.map((g) => [g.status as StatusOS, g._count._all]));
  }
}
