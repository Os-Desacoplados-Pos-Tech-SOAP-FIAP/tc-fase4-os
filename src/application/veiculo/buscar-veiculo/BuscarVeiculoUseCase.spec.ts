import { InMemoryVeiculoRepository } from '../../../../test/fakes/in-memory-veiculo.repository';
import { UniqueID } from '../../../domain/shared/UniqueID';
import { Veiculo } from '../../../domain/veiculo/entities/Veiculo';
import { RecursoNaoEncontradoError } from '../../errors';
import { BuscarVeiculoUseCase } from './BuscarVeiculoUseCase';

describe('BuscarVeiculoUseCase', () => {
  let repo: InMemoryVeiculoRepository;
  let useCase: BuscarVeiculoUseCase;
  let veiculo: Veiculo;

  beforeEach(() => {
    repo = new InMemoryVeiculoRepository();
    useCase = new BuscarVeiculoUseCase(repo);
    veiculo = Veiculo.criar({ placa: 'ABC1234', marca: 'Toyota', modelo: 'Corolla', ano: 2020, clienteId: new UniqueID().toValue() });
    repo.veiculos.push(veiculo);
  });

  it('busca veículo por id', async () => {
    const result = await useCase.porId(veiculo.id.toValue());
    expect(result.id.equals(veiculo.id)).toBe(true);
  });

  it('lança RecursoNaoEncontradoError por id inexistente', async () => {
    await expect(useCase.porId(new UniqueID().toValue())).rejects.toBeInstanceOf(RecursoNaoEncontradoError);
  });

  it('busca veículo por placa', async () => {
    const result = await useCase.porPlaca('ABC1234');
    expect(result.placa.value).toBe('ABC1234');
  });

  it('lança RecursoNaoEncontradoError por placa inexistente', async () => {
    await expect(useCase.porPlaca('ZZZ0000')).rejects.toBeInstanceOf(RecursoNaoEncontradoError);
  });
});
