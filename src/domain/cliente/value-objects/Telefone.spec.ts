import { DomainError } from '../../shared/DomainError';
import { Telefone } from './Telefone';

describe('Telefone', () => {
  it('aceita telefone fixo (10 dígitos) e formata corretamente', () => {
    const tel = Telefone.create('1133334444');
    expect(tel.value).toBe('1133334444');
    expect(tel.format()).toBe('(11) 3333-4444');
  });

  it('aceita celular (11 dígitos) e formata corretamente', () => {
    const tel = Telefone.create('11987654321');
    expect(tel.value).toBe('11987654321');
    expect(tel.format()).toBe('(11) 98765-4321');
  });

  it('remove máscara ao criar', () => {
    const tel = Telefone.create('(11) 98765-4321');
    expect(tel.value).toBe('11987654321');
  });

  it('lança DomainError para número muito curto', () => {
    expect(() => Telefone.create('123456789')).toThrow(DomainError);
  });

  it('lança DomainError para número muito longo', () => {
    expect(() => Telefone.create('123456789012')).toThrow(DomainError);
  });

  it('lança DomainError para string vazia', () => {
    expect(() => Telefone.create('')).toThrow(DomainError);
  });
});
