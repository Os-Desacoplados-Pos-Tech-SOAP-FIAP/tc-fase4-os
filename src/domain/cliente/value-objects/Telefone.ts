import { DomainError } from '../../shared/DomainError';
import { ValueObject } from '../../shared/ValueObject';

interface TelefoneProps {
  value: string;
}

export class Telefone extends ValueObject<TelefoneProps> {
  private constructor(props: TelefoneProps) {
    super(props);
  }

  public static create(input: string): Telefone {
    const cleaned = (input ?? '').replace(/\D/g, '');
    if (cleaned.length < 10 || cleaned.length > 11) {
      throw new DomainError(`Telefone inválido: ${input}`, 'TELEFONE_INVALIDO');
    }
    return new Telefone({ value: cleaned });
  }

  public get value(): string {
    return this.props.value;
  }

  public format(): string {
    const v = this.props.value;
    if (v.length === 11) {
      return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7, 11)}`;
    }
    return `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6, 10)}`;
  }
}
