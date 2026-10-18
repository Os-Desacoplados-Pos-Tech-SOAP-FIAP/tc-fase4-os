import { EtapaSaga } from '../../domain/saga/SagaInstance';

/**
 * Métricas de negócio da saga. Porta da aplicação: a implementação (OpenTelemetry) fica na
 * infraestrutura. Quem chama registra só depois do commit da transação, para não contar
 * processamentos desfeitos.
 */
export interface ISagaMetricas {
  /** Saga criada na abertura da OS. */
  iniciada(): void;
  /** Saga chegou a CONCLUIDA (pagamento confirmado). */
  concluida(): void;
  /** Saga entrou em compensação; `motivo` é o código da falha (cardinalidade fechada). */
  compensada(motivo: string): void;
  /** Saga saiu de `etapa` depois de `segundos` nela. */
  etapaConcluida(etapa: EtapaSaga, segundos: number): void;
}
