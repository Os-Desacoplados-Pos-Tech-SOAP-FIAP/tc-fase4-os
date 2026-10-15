import { InMemoryVeiculoRepository } from '../../../../test/fakes/in-memory-veiculo.repository';
import { UniqueID } from '../../../domain/shared/UniqueID';
import { Veiculo } from '../../../domain/veiculo/entities/Veiculo';
import { ListarVeiculosUseCase } from './ListarVeiculosUseCase';

describe('ListarVeiculosUseCase', () => {
  let repo: InMemoryVeiculoRepository;
  let useCase: ListarVeiculosUseCase;
  let clienteId: UniqueID;

  beforeEach(() => {
    repo = new InMemoryVeiculoRepository();
    useCase = new ListarVeiculosUseCase(repo);
    clienteId = new UniqueID();
    repo.veiculos.push(Veiculo.criar({ placa: 'ABC1234', marca: 'Toyota', modelo: 'Corolla', ano: 2020, clienteId: clienteId.toValue() }));
    repo.veiculos.push(Veiculo.criar({ placa: 'XYZ9876', marca: 'Honda', modelo: 'Civic', ano: 2021, clienteId: new UniqueID().toValue() }));
  });

  it('lista todos os veículos', async () => {
    expect(await useCase.execute()).toHaveLength(2);
  });

  it('lista veículos por cliente', async () => {
    const result = await useCase.execute(clienteId.toValue());
    expect(result).toHaveLength(1);
    expect(result[0].placa.value).toBe('ABC1234');
  });
});
