import { DomainError } from '../../shared/DomainError';
import { ValueObject } from '../../shared/ValueObject';

interface PlacaProps {
  value: string;
}

export class Placa extends ValueObject<PlacaProps> {
  private static readonly ANTIGA = /^[A-Z]{3}\d{4}$/;
  private static readonly MERCOSUL = /^[A-Z]{3}\d[A-Z]\d{2}$/;

  private constructor(props: PlacaProps) {
    super(props);
  }

  public static create(input: string): Placa {
    const value = (input ?? '').toUpperCase().replace(/\s/g, '');
    const semHifen = value.replace('-', '');
    const isAntiga = Placa.ANTIGA.test(semHifen);
    const isMercosul = Placa.MERCOSUL.test(semHifen);
    if (!isAntiga && !isMercosul) {
      throw new DomainError(`Placa inválida: ${input}`, 'PLACA_INVALIDA');
    }
    return new Placa({ value: semHifen });
  }

  public get value(): string {
    return this.props.value;
  }

  public format(): string {
    const v = this.props.value;
    if (Placa.ANTIGA.test(v)) {
      return `${v.slice(0, 3)}-${v.slice(3, 7)}`;
    }
    return v;
  }
}
