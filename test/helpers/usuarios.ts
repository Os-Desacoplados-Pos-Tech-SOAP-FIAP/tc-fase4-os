import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../src/infrastructure/database/prisma.service';

export const SENHA_TESTE = 'senha-de-teste';

export async function criarUsuario(
  prisma: PrismaService,
  email: string,
  perfil: 'ADMINISTRADOR' | 'ATENDENTE' | 'MECANICO',
  ativo = true,
): Promise<string> {
  const id = randomUUID();
  await prisma.usuario.create({
    data: { id, nome: email.split('@')[0], email, senha: await bcrypt.hash(SENHA_TESTE, 4), perfil, ativo },
  });
  return id;
}
