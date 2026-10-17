import { InMemoryVeiculoRepository } from '../../../../test/fakes/in-memory-veiculo.repository';
import { UniqueID } from '../../../domain/shared/UniqueID';
import { Veiculo } from '../../../domain/veiculo/entities/Veiculo';
import { ConflitoError, RecursoNaoEncontradoError } from '../../errors';
import { AtualizarVeiculoUseCase } from './AtualizarVeiculoUseCase';

describe('AtualizarVeiculoUseCase', () => {
  let repo: InMemoryVeiculoRepository;
  let useCase: AtualizarVeiculoUseCase;
  let veiculo: Veiculo;

  beforeEach(() => {
    repo = new InMemoryVeiculoRepository();
    useCase = new AtualizarVeiculoUseCase(repo);
    veiculo = Veiculo.criar({ placa: 'ABC1234', marca: 'Toyota', modelo: 'Corolla', ano: 2020, clienteId: new UniqueID().toValue() });
    repo.veiculos.push(veiculo);
  });

  it('atualiza placa e ano', async () => {
    const result = await useCase.execute({ id: veiculo.id.toValue(), placa: 'XYZ9876', ano: 2022 });
    expect(result.placa.value).toBe('XYZ9876');
    expect(result.ano.value).toBe(2022);
  });

  it('recusa placa que já pertence a outro veículo, mesmo com formatação diferente', async () => {
    const outro = Veiculo.criar({ placa: 'XYZ9876', marca: 'Fiat', modelo: 'Argo', ano: 2021, clienteId: new UniqueID().toValue() });
    repo.veiculos.push(outro);
    await expect(useCase.execute({ id: veiculo.id.toValue(), placa: 'xyz-9876' })).rejects.toEqual(
      expect.objectContaining({ code: 'PLACA_JA_CADASTRADA' }),
    );
    await expect(useCase.execute({ id: veiculo.id.toValue(), placa: 'xyz-9876' })).rejects.toBeInstanceOf(ConflitoError);
    expect(veiculo.placa.value).toBe('ABC1234');
  });

  it('aceita reenviar a própria placa', async () => {
    const result = await useCase.execute({ id: veiculo.id.toValue(), placa: 'abc-1234', ano: 2021 });
    expect(result.placa.value).toBe('ABC1234');
    expect(result.ano.value).toBe(2021);
  });

  it('lança RecursoNaoEncontradoError para veículo inexistente', async () => {
    await expect(useCase.execute({ id: new UniqueID().toValue() })).rejects.toBeInstanceOf(RecursoNaoEncontradoError);
  });
});
