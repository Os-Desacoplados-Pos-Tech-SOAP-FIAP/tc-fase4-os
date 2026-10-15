import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { PerfilAcesso } from '../../../common/auth/perfil';
import { INJECTION_TOKENS } from '../../../common/constants/injection-tokens';
import { IUsuarioRepository } from '../../../domain/auth/repositories/IUsuarioRepository';
import { CredenciaisInvalidasError } from '../../errors';
import { IHashProvider } from '../../ports/hash-provider';

export interface LoginResult {
  accessToken: string;
  usuario: { id: string; nome: string; email: string; perfil: PerfilAcesso };
}

/** Login de funcionário. Emite o JWT único da Fase 4 (claim `perfil`), validado por todos os serviços. */
@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.USUARIO_REPOSITORY)
    private readonly usuarios: IUsuarioRepository,
    private readonly jwt: JwtService,
    @Inject(INJECTION_TOKENS.HASH_PROVIDER)
    private readonly hash: IHashProvider,
  ) {}

  async execute(email: string, senha: string): Promise<LoginResult> {
    const usuario = await this.usuarios.buscarPorEmail(email);
    const senhaConfere = usuario?.ativo === true && (await this.hash.compare(senha, usuario.senha));
    if (!usuario || !senhaConfere) throw new CredenciaisInvalidasError();

    const id = usuario.id.toValue();
    return {
      accessToken: this.jwt.sign({ sub: id, email: usuario.email, perfil: usuario.perfil }),
      usuario: { id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil },
    };
  }
}
