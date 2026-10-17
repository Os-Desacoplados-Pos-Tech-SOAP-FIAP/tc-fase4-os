import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { PerfilAcesso } from '../../src/common/auth/perfil';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { criarApp } from '../helpers/app';
import { criarClienteComVeiculo } from '../helpers/cadastros';
import { conectar, limparBanco } from '../helpers/database';
import { token } from '../helpers/tokens';

describe('Rotas pública e interna (e2e)', () => {
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

  it('cliente vê o status só da própria OS (E13)', async () => {
    const { clienteId, veiculoId } = await criarClienteComVeiculo(prisma);
    const os = await request(app.getHttpServer())
      .post('/api/os/ordens-de-servico')
      .set('Authorization', token(PerfilAcesso.ATENDENTE))
      .send({ clienteId, veiculoId })
      .expect(201);

    const status = await request(app.getHttpServer())
      .get(`/api/os/publico/os/${os.body.numero}/status`)
      .set('Authorization', token(PerfilAcesso.CLIENTE, clienteId))
      .expect(200);
    expect(status.body).toEqual({ numero: os.body.numero, status: 'RECEBIDA', valorTotal: 0, atualizadoEm: expect.any(String) });

    await request(app.getHttpServer())
      .get(`/api/os/publico/os/${os.body.numero}/status`)
      .set('Authorization', token(PerfilAcesso.CLIENTE, randomUUID()))
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/os/publico/os/${os.body.numero}/status`)
      .set('Authorization', token(PerfilAcesso.ATENDENTE))
      .expect(403);
    await request(app.getHttpServer()).get(`/api/os/publico/os/${os.body.numero}/status`).expect(401);
  });

  it('endpoint interno devolve o cliente por CPF só com o token interno (E11)', async () => {
    const { clienteId } = await criarClienteComVeiculo(prisma);
    const resposta = await request(app.getHttpServer())
      .get('/api/os/internal/clientes/cpf/529.982.247-25')
      .set('X-Internal-Token', process.env.INTERNAL_SERVICE_TOKEN as string)
      .expect(200);
    expect(resposta.body).toEqual({ id: clienteId, nome: 'Maria Souza', cpf: '52998224725' });

    await request(app.getHttpServer()).get('/api/os/internal/clientes/cpf/52998224725').expect(401);
    await request(app.getHttpServer())
      .get('/api/os/internal/clientes/cpf/52998224725')
      .set('X-Internal-Token', 'errado')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/os/internal/clientes/cpf/11144477735')
      .set('X-Internal-Token', process.env.INTERNAL_SERVICE_TOKEN as string)
      .expect(404);
  });
});
