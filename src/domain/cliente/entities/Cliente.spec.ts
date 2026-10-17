import { DomainError } from '../../shared/DomainError';
import { Cliente, TipoCliente } from './Cliente';

describe('Cliente', () => {
  it('cria cliente PF com CPF válido', () => {
    const cliente = Cliente.criar({
      tipo: TipoCliente.PF,
      documento: '529.982.247-25',
      nome: 'João Silva',
      email: 'joao@email.com',
    });
    expect(cliente.nome).toBe('João Silva');
    expect(cliente.tipo).toBe(TipoCliente.PF);
    expect(cliente.email.value).toBe('joao@email.com');
  });

  it('cria cliente PJ com CNPJ válido', () => {
    const cliente = Cliente.criar({
      tipo: TipoCliente.PJ,
      documento: '11.222.333/0001-81',
      nome: 'Empresa SA',
      email: 'empresa@email.com',
    });
    expect(cliente.tipo).toBe(TipoCliente.PJ);
  });

  it('cria cliente com telefone', () => {
    const cliente = Cliente.criar({
      tipo: TipoCliente.PF,
      documento: '529.982.247-25',
      nome: 'João Silva',
      email: 'joao@email.com',
      telefone: '11999999999',
    });
    expect(cliente.telefone).toBeDefined();
  });

  it('lança DomainError para nome curto', () => {
    expect(() =>
      Cliente.criar({
        tipo: TipoCliente.PF,
        documento: '529.982.247-25',
        nome: 'Jo',
        email: 'joao@email.com',
      }),
    ).toThrow(DomainError);
  });

  it('atualiza nome e email', () => {
    const cliente = Cliente.criar({
      tipo: TipoCliente.PF,
      documento: '529.982.247-25',
      nome: 'João Silva',
      email: 'joao@email.com',
    });
    cliente.atualizar({ nome: 'João Atualizado', email: 'novo@email.com' });
    expect(cliente.nome).toBe('João Atualizado');
    expect(cliente.email.value).toBe('novo@email.com');
  });

  it('lança DomainError ao atualizar nome curto', () => {
    const cliente = Cliente.criar({
      tipo: TipoCliente.PF,
      documento: '529.982.247-25',
      nome: 'João Silva',
      email: 'joao@email.com',
    });
    expect(() => cliente.atualizar({ nome: 'Jo' })).toThrow(DomainError);
  });
});
