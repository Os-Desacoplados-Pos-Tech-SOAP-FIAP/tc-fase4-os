import { Inject, Injectable } from '@nestjs/common';

import { PerfilAcesso } from '../../../common/auth/perfil';
import { INJECTION_TOKENS } from '../../../common/constants/injection-tokens';
import { Usuario } from '../../../domain/auth/entities/Usuario';
import { IUsuarioRepository } from '../../../domain/auth/repositories/IUsuarioRepository';
import { ConflitoError } from '../../errors';
import { IHashProvider } from '../../ports/hash-provider';

export interface RegistrarUsuarioInput {
  nome: string;
  email: string;
  senha: string;
  perfil: PerfilAcesso;
}

/** Só ADMINISTRADOR chega aqui (E14); o primeiro admin vem do seed. */
@Injectable()
export class RegistrarUsuarioUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.USUARIO_REPOSITORY)
    private readonly usuarios: IUsuarioRepository,
    @Inject(INJECTION_TOKENS.HASH_PROVIDER)
    private readonly hash: IHashProvider,
  ) {}

  async execute(input: RegistrarUsuarioInput) {
    if (await this.usuarios.buscarPorEmail(input.email)) {
      throw new ConflitoError('E-mail já cadastrado', 'EMAIL_JA_CADASTRADO');
    }
    const usuario = Usuario.criar({ ...input, senha: await this.hash.hash(input.senha) });
    await this.usuarios.salvar(usuario);
    return { id: usuario.id.toValue(), nome: usuario.nome, email: usuario.email, perfil: usuario.perfil };
  }
}
