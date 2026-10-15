import { InMemoryClienteRepository } from '../../../../test/fakes/in-memory-cliente.repository';
import { InMemoryVeiculoRepository } from '../../../../test/fakes/in-memory-veiculo.repository';
import { Cliente, TipoCliente } from '../../../domain/cliente/entities/Cliente';
import { UniqueID } from '../../../domain/shared/UniqueID';
import { ConflitoError, RecursoNaoEncontradoError } from '../../errors';
import { CadastrarVeiculoUseCase } from './CadastrarVeiculoUseCase';

describe('CadastrarVeiculoUseCase', () => {
  let veiculoRepo: InMemoryVeiculoRepository;
  let clienteRepo: InMemoryClienteRepository;
  let useCase: CadastrarVeiculoUseCase;
  let cliente: Cliente;

  beforeEach(() => {
    veiculoRepo = new InMemoryVeiculoRepository();
    clienteRepo = new InMemoryClienteRepository();
    useCase = new CadastrarVeiculoUseCase(veiculoRepo, clienteRepo);
    cliente = Cliente.criar({ tipo: TipoCliente.PF, documento: '529.982.247-25', nome: 'João Silva', email: 'joao@email.com' });
    clienteRepo.clientes.push(cliente);
  });

  it('cadastra veículo válido', async () => {
    const v = await useCase.execute({ placa: 'ABC1234', marca: 'Toyota', modelo: 'Corolla', ano: 2020, clienteId: cliente.id.toValue() });
    expect(v.placa.value).toBe('ABC1234');
    expect(veiculoRepo.veiculos).toHaveLength(1);
  });

  it('lança RecursoNaoEncontradoError para cliente inexistente', async () => {
    await expect(useCase.execute({ placa: 'ABC1234', marca: 'Toyota', modelo: 'Corolla', ano: 2020, clienteId: new UniqueID().toValue() }))
      .rejects.toBeInstanceOf(RecursoNaoEncontradoError);
  });

  it('lança ConflitoError para placa duplicada', async () => {
    await useCase.execute({ placa: 'ABC1234', marca: 'Toyota', modelo: 'Corolla', ano: 2020, clienteId: cliente.id.toValue() });
    await expect(useCase.execute({ placa: 'ABC1234', marca: 'Honda', modelo: 'Civic', ano: 2021, clienteId: cliente.id.toValue() }))
      .rejects.toBeInstanceOf(ConflitoError);
  });
});
