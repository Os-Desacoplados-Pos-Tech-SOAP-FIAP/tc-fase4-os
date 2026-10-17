import { Injectable } from '@nestjs/common';
import { PerfilAcesso as PerfilAcessoRow, Usuario as PrismaUsuario } from '@prisma/client';

import { PerfilAcesso } from '../../common/auth/perfil';
import { Usuario } from '../../domain/auth/entities/Usuario';
import { IUsuarioRepository } from '../../domain/auth/repositories/IUsuarioRepository';
import { UniqueID } from '../../domain/shared/UniqueID';
import { PrismaTransactionManager } from '../database/prisma-transaction.manager';

@Injectable()
export class PrismaUsuarioRepository implements IUsuarioRepository {
  constructor(private readonly db: PrismaTransactionManager) {}

  private toDomain(row: PrismaUsuario): Usuario {
    return Usuario.restaurar(
      {
        nome: row.nome,
        email: row.email,
        senha: row.senha,
        perfil: row.perfil as PerfilAcesso,
        ativo: row.ativo,
        criadoEm: row.criadoEm,
        atualizadoEm: row.atualizadoEm,
      },
      new UniqueID(row.id),
    );
  }

  async buscarPorEmail(email: string): Promise<Usuario | null> {
    const row = await this.db.client.usuario.findUnique({ where: { email } });
    return row ? this.toDomain(row) : null;
  }

  async salvar(usuario: Usuario): Promise<void> {
    const data = {
      nome: usuario.nome,
      email: usuario.email,
      senha: usuario.senha,
      perfil: usuario.perfil as PerfilAcessoRow,
      ativo: usuario.ativo,
    };
    await this.db.client.usuario.upsert({
      where: { id: usuario.id.toValue() },
      create: { id: usuario.id.toValue(), ...data },
      update: data,
    });
  }
}
