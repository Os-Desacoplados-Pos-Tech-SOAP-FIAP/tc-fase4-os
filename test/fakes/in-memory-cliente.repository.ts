import { Cliente } from '../../src/domain/cliente/entities/Cliente';
import { IClienteRepository } from '../../src/domain/cliente/repositories/IClienteRepository';
import { UniqueID } from '../../src/domain/shared/UniqueID';

export class InMemoryClienteRepository implements IClienteRepository {
  public clientes: Cliente[] = [];

  async salvar(cliente: Cliente): Promise<void> {
    this.clientes = [...this.clientes.filter((c) => !c.id.equals(cliente.id)), cliente];
  }
  async buscarPorId(id: UniqueID): Promise<Cliente | null> {
    return this.clientes.find((c) => c.id.equals(id)) ?? null;
  }
  async buscarPorDocumento(documento: string): Promise<Cliente | null> {
    return this.clientes.find((c) => c.documento.value === documento.replace(/\D/g, '')) ?? null;
  }
  async listar(): Promise<Cliente[]> {
    return this.clientes;
  }
}
