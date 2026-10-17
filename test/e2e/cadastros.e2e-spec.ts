import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PerfilAcesso } from '../../src/common/auth/perfil';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { criarApp } from '../helpers/app';
import { conectar, limparBanco } from '../helpers/database';
import { token } from '../helpers/tokens';

describe('Clientes e veículos (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const atendente = token(PerfilAcesso.ATENDENTE);

  beforeAll(async () => {
    prisma = await conectar();
    app = await criarApp();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });
  beforeEach(() => limparBanco(prisma));

  it('cadastra cliente e veículo, busca por documento e placa', async () => {
    const cliente = await request(app.getHttpServer())
      .post('/api/os/clientes')
      .set('Authorization', atendente)
      .send({ tipo: 'PF', documento: '529.982.247-25', nome: 'Maria Souza', email: 'maria@example.com' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/os/veiculos')
      .set('Authorization', atendente)
      .send({ placa: 'ABC1D23', marca: 'Fiat', modelo: 'Argo', ano: 2022, clienteId: cliente.body.id })
      .expect(201);

    await request(app.getHttpServer()).get('/api/os/clientes/documento/52998224725').set('Authorization', atendente).expect(200);
    await request(app.getHttpServer()).get('/api/os/veiculos/placa/ABC1D23').set('Authorization', atendente).expect(200);
  });

  it('id ou clienteId fora do formato UUID → 400', async () => {
    await request(app.getHttpServer()).get('/api/os/clientes/nao-e-uuid').set('Authorization', atendente).expect(400);
    await request(app.getHttpServer()).put('/api/os/clientes/nao-e-uuid').set('Authorization', atendente).send({ nome: 'Maria' }).expect(400);
    await request(app.getHttpServer()).get('/api/os/veiculos/nao-e-uuid').set('Authorization', atendente).expect(400);
    await request(app.getHttpServer()).put('/api/os/veiculos/nao-e-uuid').set('Authorization', atendente).send({ marca: 'Fiat' }).expect(400);
    await request(app.getHttpServer()).get('/api/os/veiculos?clienteId=nao-e-uuid').set('Authorization', atendente).expect(400);
    await request(app.getHttpServer()).get('/api/os/veiculos').set('Authorization', atendente).expect(200);
  });

  it('campos acima do limite → 400', async () => {
    const longo = 'x'.repeat(121);
    await request(app.getHttpServer())
      .post('/api/os/clientes')
      .set('Authorization', atendente)
      .send({ tipo: 'PF', documento: '529.982.247-25', nome: longo, email: 'maria@example.com' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/os/clientes')
      .set('Authorization', atendente)
      .send({ tipo: 'PF', documento: '529.982.247-25', nome: 'Maria', email: 'maria@example.com', telefone: '9'.repeat(21) })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/os/veiculos')
      .set('Authorization', atendente)
      .send({ placa: 'ABC1D23', marca: longo, modelo: 'Argo', ano: 2101, clienteId: '99999999-9999-4999-8999-999999999999' })
      .expect(400);
  });

  it('mecânico não cadastra cliente', async () => {
    await request(app.getHttpServer())
      .post('/api/os/clientes')
      .set('Authorization', token(PerfilAcesso.MECANICO))
      .send({ tipo: 'PF', documento: '529.982.247-25', nome: 'Maria Souza', email: 'maria@example.com' })
      .expect(403);
  });
});
