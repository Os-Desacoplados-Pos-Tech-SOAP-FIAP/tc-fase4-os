import { UniqueID } from '../../shared/UniqueID';
import { Veiculo } from '../entities/Veiculo';

export interface IVeiculoRepository {
  salvar(veiculo: Veiculo): Promise<void>;
  buscarPorId(id: UniqueID): Promise<Veiculo | null>;
  buscarPorPlaca(placa: string): Promise<Veiculo | null>;
  listar(): Promise<Veiculo[]>;
  listarPorCliente(clienteId: UniqueID): Promise<Veiculo[]>;
}
