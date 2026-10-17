import { InMemoryClienteRepository } from '../../../../test/fakes/in-memory-cliente.repository';
import { Cliente, TipoCliente } from '../../../domain/cliente/entities/Cliente';
import { RecursoNaoEncontradoError } from '../../errors';
import { BuscarClientePorCpfUseCase } from './BuscarClientePorCpfUseCase';

describe('BuscarClientePorCpfUseCase', () => {
  let clientes: InMemoryClienteRepository;
  let useCase: BuscarClientePorCpfUseCase;

  beforeEach(async () => {
    clientes = new InMemoryClienteRepository();
    useCase = new BuscarClientePorCpfUseCase(clientes);
    await clientes.salvar(Cliente.criar({ tipo: TipoCliente.PF, documento: '529.982.247-25', nome: 'Maria Souza', email: 'maria@example.com' }));
    await clientes.salvar(Cliente.criar({ tipo: TipoCliente.PJ, documento: '11.222.333/0001-81', nome: 'Oficina Parceira', email: 'pj@example.com' }));
  });

  it('devolve só id, nome e CPF (com ou sem máscara)', async () => {
    const encontrado = await useCase.execute('529.982.247-25');
    expect(encontrado).toEqual({ id: expect.any(String), nome: 'Maria Souza', cpf: '52998224725' });
    expect(await useCase.execute('52998224725')).toEqual(encontrado);
  });

  it('inexistente ou PJ → 404', async () => {
    await expect(useCase.execute('111.444.777-35')).rejects.toBeInstanceOf(RecursoNaoEncontradoError);
    await expect(useCase.execute('11222333000181')).rejects.toBeInstanceOf(RecursoNaoEncontradoError);
  });
});
