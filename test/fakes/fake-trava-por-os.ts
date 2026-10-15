import { ITravaPorOs } from '../../src/application/ports/trava-por-os';

export class FakeTravaPorOs implements ITravaPorOs {
  public travadas: string[] = [];

  async travar(osId: string): Promise<void> {
    this.travadas.push(osId);
  }
}
