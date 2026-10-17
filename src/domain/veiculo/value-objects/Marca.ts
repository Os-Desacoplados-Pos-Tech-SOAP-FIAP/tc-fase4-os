import { DomainError } from '../../shared/DomainError';
import { ValueObject } from '../../shared/ValueObject';

interface MarcaProps {
  value: string;
}

export class Marca extends ValueObject<MarcaProps> {
  private constructor(props: MarcaProps) {
    super(props);
  }

  public static create(input: string): Marca {
    const value = (input ?? '').trim();
    if (value.length < 2) {
      throw new DomainError('Marca inválida', 'MARCA_INVALIDA');
    }
    return new Marca({ value });
  }

  public get value(): string {
    return this.props.value;
  }
}
