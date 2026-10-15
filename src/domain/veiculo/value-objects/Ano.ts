import { DomainError } from '../../shared/DomainError';
import { ValueObject } from '../../shared/ValueObject';

interface AnoProps {
  value: number;
}

export class Ano extends ValueObject<AnoProps> {
  private constructor(props: AnoProps) {
    super(props);
  }

  public static create(input: number): Ano {
    const ano = Number(input);
    const atual = new Date().getFullYear();
    if (!Number.isInteger(ano) || ano < 1900 || ano > atual + 1) {
      throw new DomainError(`Ano inválido: ${input}`, 'ANO_INVALIDO');
    }
    return new Ano({ value: ano });
  }

  public get value(): number {
    return this.props.value;
  }
}
