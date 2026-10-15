import { InMemoryClienteRepository } from '../../../../test/fakes/in-memory-cliente.repository';
import { Cliente, TipoCliente } from '../../../domain/cliente/entities/Cliente';
import { ListarClientesUseCase } from './ListarClientesUseCase';

describe('ListarClientesUseCase', () => {
  it('retorna lista vazia', async () => {
    const repo = new InMemoryClienteRepository();
    const useCase = new ListarClientesUseCase(repo);
    expect(await useCase.execute()).toHaveLength(0);
  });

  it('retorna clientes cadastrados', async () => {
    const repo = new InMemoryClienteRepository();
    const useCase = new ListarClientesUseCase(repo);
    repo.clientes.push(Cliente.criar({ tipo: TipoCliente.PF, documento: '529.982.247-25', nome: 'João', email: 'j@email.com' }));
    repo.clientes.push(Cliente.criar({ tipo: TipoCliente.PJ, documento: '11.222.333/0001-81', nome: 'Empresa', email: 'e@email.com' }));
    expect(await useCase.execute()).toHaveLength(2);
  });
});
