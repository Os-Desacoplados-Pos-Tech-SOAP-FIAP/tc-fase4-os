import { Usuario } from '../entities/Usuario';

export interface IUsuarioRepository {
  buscarPorEmail(email: string): Promise<Usuario | null>;
  salvar(usuario: Usuario): Promise<void>;
}
