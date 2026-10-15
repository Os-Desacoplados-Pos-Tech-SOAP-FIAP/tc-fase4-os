import { DomainError } from '../../shared/DomainError';
import { ValueObject } from '../../shared/ValueObject';

interface ModeloProps {
  value: string;
}

export class Modelo extends ValueObject<ModeloProps> {
  private constructor(props: ModeloProps) {
    super(props);
  }

  public static create(input: string): Modelo {
    const value = (input ?? '').trim();
    if (value.length < 1) {
      throw new DomainError('Modelo inválido', 'MODELO_INVALIDO');
    }
    return new Modelo({ value });
  }

  public get value(): string {
    return this.props.value;
  }
}
