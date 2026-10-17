import { UniqueID } from '../../src/domain/shared/UniqueID';
import { Veiculo } from '../../src/domain/veiculo/entities/Veiculo';
import { IVeiculoRepository } from '../../src/domain/veiculo/repositories/IVeiculoRepository';

export class InMemoryVeiculoRepository implements IVeiculoRepository {
  public veiculos: Veiculo[] = [];

  async salvar(veiculo: Veiculo): Promise<void> {
    this.veiculos = [...this.veiculos.filter((v) => !v.id.equals(veiculo.id)), veiculo];
  }
  async buscarPorId(id: UniqueID): Promise<Veiculo | null> {
    return this.veiculos.find((v) => v.id.equals(id)) ?? null;
  }
  async buscarPorPlaca(placa: string): Promise<Veiculo | null> {
    // Mesma normalização do PrismaVeiculoRepository: maiúsculas, sem hífen nem espaços.
    const normalizada = placa.toUpperCase().replace(/[-\s]/g, '');
    return this.veiculos.find((v) => v.placa.value === normalizada) ?? null;
  }
  async listar(): Promise<Veiculo[]> {
    return this.veiculos;
  }
  async listarPorCliente(clienteId: UniqueID): Promise<Veiculo[]> {
    return this.veiculos.filter((v) => v.clienteId.equals(clienteId));
  }
}
