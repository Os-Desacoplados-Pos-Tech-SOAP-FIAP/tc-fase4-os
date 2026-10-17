import { DomainError } from '../../shared/DomainError';
import { CNPJ } from './CNPJ';

describe('CNPJ', () => {
  it('aceita CNPJ válido sem máscara', () => {
    const cnpj = CNPJ.create('11222333000181');
    expect(cnpj.value).toBe('11222333000181');
    expect(cnpj.format()).toBe('11.222.333/0001-81');
  });

  it('aceita CNPJ válido com máscara', () => {
    const cnpj = CNPJ.create('11.222.333/0001-81');
    expect(cnpj.value).toBe('11222333000181');
  });

  it('rejeita CNPJ inválido', () => {
    expect(() => CNPJ.create('00000000000000')).toThrow(DomainError);
    expect(() => CNPJ.create('11222333000100')).toThrow(DomainError);
  });
});
