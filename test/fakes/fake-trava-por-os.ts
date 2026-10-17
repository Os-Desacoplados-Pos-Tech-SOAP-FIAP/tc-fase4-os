import { ITravaPorOs } from '../../src/application/ports/trava-por-os';
import { FakeTransactionManager } from './fake-transaction.manager';

/**
 * Com uma transação falsa ligada, recusa `travar` fora de `run`, como o pg_advisory_xact_lock
 * real, que fora de transação é solto na hora e não protege nada.
 */
export class FakeTravaPorOs implements ITravaPorOs {
  public travadas: string[] = [];

  constructor(private readonly transacao?: FakeTransactionManager) {}

  async travar(osId: string): Promise<void> {
    if (this.transacao && !this.transacao.ativa) {
      throw new Error(`travar(${osId}) chamado fora da transação`);
    }
    this.travadas.push(osId);
  }
}
