import { DomainError } from '../../shared/DomainError';
import { ValueObject } from '../../shared/ValueObject';

interface CPFProps {
  value: string;
}

export class CPF extends ValueObject<CPFProps> {
  private constructor(props: CPFProps) {
    super(props);
  }

  public static create(input: string): CPF {
    const cleaned = (input ?? '').replace(/\D/g, '');
    if (!CPF.isValid(cleaned)) {
      throw new DomainError(`CPF inválido: ${input}`, 'CPF_INVALIDO');
    }
    return new CPF({ value: cleaned });
  }

  public get value(): string {
    return this.props.value;
  }

  public format(): string {
    const v = this.props.value;
    return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9, 11)}`;
  }

  private static isValid(cpf: string): boolean {
    if (!cpf || cpf.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(cpf)) return false;

    const calc = (base: string, factorStart: number): number => {
      let sum = 0;
      for (let i = 0; i < base.length; i++) {
        sum += parseInt(base[i], 10) * (factorStart - i);
      }
      const rest = (sum * 10) % 11;
      return rest === 10 ? 0 : rest;
    };

    const d1 = calc(cpf.slice(0, 9), 10);
    if (d1 !== parseInt(cpf[9], 10)) return false;
    const d2 = calc(cpf.slice(0, 10), 11);
    if (d2 !== parseInt(cpf[10], 10)) return false;
    return true;
  }
}
