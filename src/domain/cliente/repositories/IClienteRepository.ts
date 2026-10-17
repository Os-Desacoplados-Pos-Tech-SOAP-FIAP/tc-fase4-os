import { UniqueID } from '../../shared/UniqueID';
import { Cliente } from '../entities/Cliente';

export interface IClienteRepository {
  salvar(cliente: Cliente): Promise<void>;
  buscarPorId(id: UniqueID): Promise<Cliente | null>;
  buscarPorDocumento(documento: string): Promise<Cliente | null>;
  listar(): Promise<Cliente[]>;
}
