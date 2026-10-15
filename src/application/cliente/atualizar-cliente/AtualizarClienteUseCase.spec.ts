import { InMemoryClienteRepository } from '../../../../test/fakes/in-memory-cliente.repository';
import { Cliente, TipoCliente } from '../../../domain/cliente/entities/Cliente';
import { UniqueID } from '../../../domain/shared/UniqueID';
import { RecursoNaoEncontradoError } from '../../errors';
import { AtualizarClienteUseCase } from './AtualizarClienteUseCase';

describe('AtualizarClienteUseCase', () => {
  let repo: InMemoryClienteRepository;
  let useCase: AtualizarClienteUseCase;
  let cliente: Cliente;

  beforeEach(() => {
    repo = new InMemoryClienteRepository();
    useCase = new AtualizarClienteUseCase(repo);
    cliente = Cliente.criar({ tipo: TipoCliente.PF, documento: '529.982.247-25', nome: 'João Silva', email: 'joao@email.com' });
    repo.clientes.push(cliente);
  });

  it('atualiza nome do cliente', async () => {
    const result = await useCase.execute({ id: cliente.id.toValue(), nome: 'João Atualizado' });
    expect(result.nome).toBe('João Atualizado');
  });

  it('atualiza email do cliente', async () => {
    const result = await useCase.execute({ id: cliente.id.toValue(), email: 'novo@email.com' });
    expect(result.email.value).toBe('novo@email.com');
  });

  it('lança RecursoNaoEncontradoError para cliente inexistente', async () => {
    await expect(useCase.execute({ id: new UniqueID().toValue(), nome: 'X' })).rejects.toBeInstanceOf(RecursoNaoEncontradoError);
  });
});
