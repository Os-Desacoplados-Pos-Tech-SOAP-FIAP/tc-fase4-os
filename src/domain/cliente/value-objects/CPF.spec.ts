import { DomainError } from '../../shared/DomainError';
import { CPF } from './CPF';

describe('CPF', () => {
  it('aceita CPF válido sem máscara', () => {
    const cpf = CPF.create('52998224725');
    expect(cpf.value).toBe('52998224725');
    expect(cpf.format()).toBe('529.982.247-25');
  });

  it('aceita CPF válido com máscara', () => {
    const cpf = CPF.create('529.982.247-25');
    expect(cpf.value).toBe('52998224725');
  });

  it('rejeita CPF inválido', () => {
    expect(() => CPF.create('11111111111')).toThrow(DomainError);
    expect(() => CPF.create('123')).toThrow(DomainError);
    expect(() => CPF.create('12345678900')).toThrow(DomainError);
  });
});
