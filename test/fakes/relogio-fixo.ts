import { IRelogio } from '../../src/application/ports/relogio';

export class RelogioFixo implements IRelogio {
  constructor(private atual = new Date(Date.UTC(2026, 9, 20, 10, 0))) {}
  agora(): Date {
    return new Date(this.atual);
  }
  avancarHoras(horas: number): void {
    this.atual = new Date(this.atual.getTime() + horas * 3_600_000);
  }
}
