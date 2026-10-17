import { DomainError } from '../../shared/DomainError';
import { ValueObject } from '../../shared/ValueObject';

interface CNPJProps {
  value: string;
}

export class CNPJ extends ValueObject<CNPJProps> {
  private constructor(props: CNPJProps) {
    super(props);
  }

  public static create(input: string): CNPJ {
    const cleaned = (input ?? '').replace(/\D/g, '');
    if (!CNPJ.isValid(cleaned)) {
      throw new DomainError(`CNPJ inválido: ${input}`, 'CNPJ_INVALIDO');
    }
    return new CNPJ({ value: cleaned });
  }

  public get value(): string {
    return this.props.value;
  }

  public format(): string {
    const v = this.props.value;
    return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12, 14)}`;
  }

  private static isValid(cnpj: string): boolean {
    if (!cnpj || cnpj.length !== 14) return false;
    if (/^(\d)\1{13}$/.test(cnpj)) return false;

    const calc = (base: string): number => {
      const weights =
        base.length === 12
          ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
          : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      let sum = 0;
      for (let i = 0; i < base.length; i++) {
        sum += parseInt(base[i], 10) * weights[i];
      }
      const rest = sum % 11;
      return rest < 2 ? 0 : 11 - rest;
    };

    const d1 = calc(cnpj.slice(0, 12));
    if (d1 !== parseInt(cnpj[12], 10)) return false;
    const d2 = calc(cnpj.slice(0, 13));
    if (d2 !== parseInt(cnpj[13], 10)) return false;
    return true;
  }
}
