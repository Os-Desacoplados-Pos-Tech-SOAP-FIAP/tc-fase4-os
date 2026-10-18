import { ISagaMetricas } from '../../src/application/saga/saga-metricas';
import { EtapaSaga } from '../../src/domain/saga/SagaInstance';

/** Guarda as chamadas na ordem em que aconteceram. */
export class FakeSagaMetricas implements ISagaMetricas {
  public iniciadas = 0;
  public concluidas = 0;
  public compensacoes: string[] = [];
  public etapas: { etapa: EtapaSaga; segundos: number }[] = [];

  iniciada(): void {
    this.iniciadas++;
  }
  concluida(): void {
    this.concluidas++;
  }
  compensada(motivo: string): void {
    this.compensacoes.push(motivo);
  }
  etapaConcluida(etapa: EtapaSaga, segundos: number): void {
    this.etapas.push({ etapa, segundos });
  }
}
