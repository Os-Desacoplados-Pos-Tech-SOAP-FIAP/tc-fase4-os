import { DomainError } from '../../shared/DomainError';
import { Email } from './Email';

describe('Email', () => {
  it('aceita e-mail válido e normaliza para minúsculas', () => {
    const email = Email.create('Teste@Email.COM');
    expect(email.value).toBe('teste@email.com');
  });

  it('rejeita e-mail inválido', () => {
    expect(() => Email.create('semarroba')).toThrow(DomainError);
    expect(() => Email.create('teste@')).toThrow(DomainError);
    expect(() => Email.create('@dominio.com')).toThrow(DomainError);
  });
});
