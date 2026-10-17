import { ITransactionManager } from '../../src/application/ports/transaction-manager';

export interface ParticipanteTransacao {
  snapshot(): unknown;
  restaurar(estado: unknown): void;
}

export class FakeTransactionManager implements ITransactionManager {
  private readonly participantes: ParticipanteTransacao[] = [];
  public execucoes = 0;
  private profundidade = 0;

  /** Há um `run` em andamento (inclusive aninhado). */
  get ativa(): boolean {
    return this.profundidade > 0;
  }

  participar(...participantes: ParticipanteTransacao[]): this {
    this.participantes.push(...participantes);
    return this;
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    this.execucoes++;
    this.profundidade++;
    const estados = this.participantes.map((p) => p.snapshot());
    try {
      return await work();
    } catch (erro) {
      this.participantes.forEach((p, i) => p.restaurar(estados[i]));
      throw erro;
    } finally {
      this.profundidade--;
    }
  }
}
