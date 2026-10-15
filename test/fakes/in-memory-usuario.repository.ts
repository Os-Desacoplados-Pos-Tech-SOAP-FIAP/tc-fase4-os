import { Usuario } from '../../src/domain/auth/entities/Usuario';
import { IUsuarioRepository } from '../../src/domain/auth/repositories/IUsuarioRepository';

export class InMemoryUsuarioRepository implements IUsuarioRepository {
  public usuarios: Usuario[] = [];

  async buscarPorEmail(email: string): Promise<Usuario | null> {
    return this.usuarios.find((u) => u.email === email) ?? null;
  }
  async salvar(usuario: Usuario): Promise<void> {
    this.usuarios.push(usuario);
  }
}
