import { InMemoryClienteRepository } from '../../../../test/fakes/in-memory-cliente.repository';
import { Cliente, TipoCliente } from '../../../domain/cliente/entities/Cliente';
import { UniqueID } from '../../../domain/shared/UniqueID';
import { RecursoNaoEncontradoError } from '../../errors';
import { BuscarClienteUseCase } from './BuscarClienteUseCase';

describe('BuscarClienteUseCase', () => {
  let repo: InMemoryClienteRepository;
  let useCase: BuscarClienteUseCase;
  let cliente: Cliente;

  beforeEach(() => {
    repo = new InMemoryClienteRepository();
    useCase = new BuscarClienteUseCase(repo);
    cliente = Cliente.criar({ tipo: TipoCliente.PF, documento: '529.982.247-25', nome: 'João Silva', email: 'joao@email.com' });
    repo.clientes.push(cliente);
  });

  it('busca cliente por id', async () => {
    const result = await useCase.porId(cliente.id.toValue());
    expect(result.id.equals(cliente.id)).toBe(true);
  });

  it('lança RecursoNaoEncontradoError por id inexistente', async () => {
    await expect(useCase.porId(new UniqueID().toValue())).rejects.toBeInstanceOf(RecursoNaoEncontradoError);
  });

  it('busca cliente por documento', async () => {
    const result = await useCase.porDocumento('52998224725');
    expect(result.nome).toBe('João Silva');
  });

  it('lança RecursoNaoEncontradoError por documento inexistente', async () => {
    await expect(useCase.porDocumento('00000000000')).rejects.toBeInstanceOf(RecursoNaoEncontradoError);
  });
});
