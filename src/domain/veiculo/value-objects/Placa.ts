import { DomainError } from '../../shared/DomainError';
import { ValueObject } from '../../shared/ValueObject';

interface PlacaProps {
  value: string;
}

export class Placa extends ValueObject<PlacaProps> {
  private static readonly ANTIGA = /^[A-Z]{3}-?[0-9]{4}$/;
  private static readonly MERCOSUL = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;

  private constructor(props: PlacaProps) {
    super(props);
  }

  public static create(input: string): Placa {
    const value = (input ?? '').toUpperCase().replace(/\s/g, '');
    const sanitized = value.replace('-', '');
    const semHifen = sanitized;
    const isAntiga = /^[A-Z]{3}[0-9]{4}$/.test(semHifen);
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
    if (/^[A-Z]{3}[0-9]{4}$/.test(v)) {
      return `${v.slice(0, 3)}-${v.slice(3, 7)}`;
    }
    return v;
  }
}
