import { INestApplication } from '@nestjs/common';
import { verify } from 'jsonwebtoken';
import request from 'supertest';

import { PerfilAcesso } from '../../src/common/auth/perfil';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { criarApp } from '../helpers/app';
import { conectar, limparBanco } from '../helpers/database';
import { token } from '../helpers/tokens';
import { criarUsuario, SENHA_TESTE } from '../helpers/usuarios';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = await conectar();
    app = await criarApp();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });
  beforeEach(() => limparBanco(prisma));

  it('login devolve JWT com perfil, validado pelos outros serviços com o mesmo segredo', async () => {
    await criarUsuario(prisma, 'atendente@oficina.local', 'ATENDENTE');
    const resposta = await request(app.getHttpServer())
      .post('/api/os/auth/login')
      .send({ email: 'atendente@oficina.local', senha: SENHA_TESTE })
      .expect(200);
    const payload = verify(resposta.body.accessToken, process.env.JWT_SECRET as string) as Record<string, unknown>;
    expect(payload).toEqual(expect.objectContaining({ perfil: 'ATENDENTE', email: 'atendente@oficina.local' }));
  });

  it('senha errada, usuário inativo e usuário inexistente → 401 com a mesma mensagem', async () => {
    await criarUsuario(prisma, 'ativo@oficina.local', 'ATENDENTE');
    await criarUsuario(prisma, 'inativo@oficina.local', 'MECANICO', false);
    for (const corpo of [
      { email: 'ativo@oficina.local', senha: 'senha-errada' },
      { email: 'inativo@oficina.local', senha: SENHA_TESTE },
      { email: 'ninguem@oficina.local', senha: SENHA_TESTE },
    ]) {
      const resposta = await request(app.getHttpServer()).post('/api/os/auth/login').send(corpo).expect(401);
      expect(resposta.body.code).toBe('CREDENCIAIS_INVALIDAS');
    }
  });

  it('senha acima de 72 caracteres → 400 no login e no registro', async () => {
    const longa = 's'.repeat(73);
    await request(app.getHttpServer()).post('/api/os/auth/login').send({ email: 'a@oficina.local', senha: longa }).expect(400);
    await request(app.getHttpServer())
      .post('/api/os/auth/registrar')
      .set('Authorization', token(PerfilAcesso.ADMINISTRADOR))
      .send({ nome: 'Caio', email: 'caio@oficina.local', senha: longa, perfil: 'MECANICO' })
      .expect(400);
  });

  it('registrar exige ADMINISTRADOR (E14) e não aceita perfil CLIENTE', async () => {
    const novo = { nome: 'Caio', email: 'caio@oficina.local', senha: 'senha123', perfil: 'MECANICO' };
    await request(app.getHttpServer()).post('/api/os/auth/registrar').send(novo).expect(401);
    await request(app.getHttpServer())
      .post('/api/os/auth/registrar')
      .set('Authorization', token(PerfilAcesso.ATENDENTE))
      .send(novo)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/os/auth/registrar')
      .set('Authorization', token(PerfilAcesso.ADMINISTRADOR))
      .send({ ...novo, perfil: 'CLIENTE' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/os/auth/registrar')
      .set('Authorization', token(PerfilAcesso.ADMINISTRADOR))
      .send(novo)
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/os/auth/registrar')
      .set('Authorization', token(PerfilAcesso.ADMINISTRADOR))
      .send(novo)
      .expect(409);
  });
});
