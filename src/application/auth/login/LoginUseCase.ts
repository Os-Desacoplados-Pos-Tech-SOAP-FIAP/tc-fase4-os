import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';

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
  /**
   * Hash de uma string descartável, comparado quando o usuário não existe ou está inativo: o login
   * leva o mesmo tempo nos dois casos (evita enumeração de e-mails por tempo). Gerado uma vez pelo
   * próprio provedor (mesmo custo do bcrypt real), sem hash fixo no código.
   */
  private hashDeMentira?: Promise<string>;

  constructor(
    @Inject(INJECTION_TOKENS.USUARIO_REPOSITORY)
    private readonly usuarios: IUsuarioRepository,
    private readonly jwt: JwtService,
    @Inject(INJECTION_TOKENS.HASH_PROVIDER)
    private readonly hash: IHashProvider,
  ) {}

  async execute(email: string, senha: string): Promise<LoginResult> {
    const usuario = await this.usuarios.buscarPorEmail(email);
    const podeEntrar = usuario?.ativo === true;
    // Compara sempre (com o hash de mentira se preciso) para o tempo não revelar se o e-mail existe.
    const senhaConfere = await this.hash.compare(senha, podeEntrar ? usuario.senha : await this.obterHashDeMentira());
    if (!usuario || !podeEntrar || !senhaConfere) throw new CredenciaisInvalidasError();

    const id = usuario.id.toValue();
    return {
      accessToken: this.jwt.sign({ sub: id, email: usuario.email, perfil: usuario.perfil }),
      usuario: { id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil },
    };
  }

  private obterHashDeMentira(): Promise<string> {
    this.hashDeMentira ??= this.hash.hash(randomUUID());
    return this.hashDeMentira;
  }
}
