import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PerfilAcesso } from '../../src/common/auth/perfil';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { CatalogoEmMemoria, INSUMO_FILTRO, SERVICO_REVISAO } from '../fakes/catalogo-em-memoria';
import { criarApp } from '../helpers/app';
import { conectar, limparBanco } from '../helpers/database';
import { criarClienteComVeiculo } from '../helpers/cadastros';
import { token } from '../helpers/tokens';

describe('Ordens de serviço (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let catalogo: CatalogoEmMemoria;
  const atendente = token(PerfilAcesso.ATENDENTE);
  const mecanico = token(PerfilAcesso.MECANICO);

  beforeAll(async () => {
    prisma = await conectar();
    catalogo = new CatalogoEmMemoria();
    app = await criarApp(catalogo);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });
  beforeEach(() => limparBanco(prisma));

  async function abrirOs(): Promise<{ id: string; numero: number }> {
    const { clienteId, veiculoId } = await criarClienteComVeiculo(prisma);
    const resposta = await request(app.getHttpServer())
      .post('/api/os/ordens-de-servico')
      .set('Authorization', atendente)
      .send({ clienteId, veiculoId, observacoes: 'Barulho' })
      .expect(201);
    return resposta.body;
  }

  async function iniciarDiagnostico(id: string): Promise<void> {
    await prisma.ordemDeServico.update({ where: { id }, data: { status: 'EM_DIAGNOSTICO', versao: { increment: 1 } } });
  }

  it('abre a OS RECEBIDA, saga DIAGNOSTICO e grava enfileirar-diagnostico na outbox', async () => {
    const os = await abrirOs();
    const consulta = await request(app.getHttpServer())
      .get(`/api/os/ordens-de-servico/${os.id}`)
      .set('Authorization', mecanico)
      .expect(200);
    expect(consulta.body).toEqual(expect.objectContaining({ status: 'RECEBIDA', etapaSaga: 'DIAGNOSTICO', itens: [], linkPagamento: null }));

    const outbox = await prisma.outbox.findMany({ where: { groupId: os.id } });
    expect(outbox).toEqual([
      expect.objectContaining({
        type: 'execution.enfileirar-diagnostico.v1',
        destination: process.env.EXECUTION_COMMANDS_QUEUE_URL,
      }),
    ]);
    expect((outbox[0].body as { payload: unknown }).payload).toEqual({ numeroOs: os.numero });
  });

  it('inclui itens no diagnóstico repassando o JWT ao Catalog', async () => {
    const os = await abrirOs();
    await iniciarDiagnostico(os.id);
    await request(app.getHttpServer())
      .post(`/api/os/ordens-de-servico/${os.id}/itens`)
      .set('Authorization', mecanico)
      .send({ tipo: 'SERVICO', referenciaId: SERVICO_REVISAO, quantidade: 1 })
      .expect(201);
    const resposta = await request(app.getHttpServer())
      .post(`/api/os/ordens-de-servico/${os.id}/itens`)
      .set('Authorization', mecanico)
      .send({ tipo: 'INSUMO', referenciaId: INSUMO_FILTRO, quantidade: 2 })
      .expect(201);
    expect(resposta.body.valorTotal).toBe(321);
    expect(resposta.body.itens).toHaveLength(2);
    expect(catalogo.autorizacoes.at(-1)).toBe(mecanico);
  });

  it('item com a OS RECEBIDA → 422; Catalog fora → 503; id inválido → 400', async () => {
    const os = await abrirOs();
    const corpo = { tipo: 'SERVICO', referenciaId: SERVICO_REVISAO, quantidade: 1 };
    const recusa = await request(app.getHttpServer())
      .post(`/api/os/ordens-de-servico/${os.id}/itens`)
      .set('Authorization', mecanico)
      .send(corpo)
      .expect(422);
    expect(recusa.body.code).toBe('OS_ITEM_FORA_DO_DIAGNOSTICO');
    await request(app.getHttpServer()).get('/api/os/ordens-de-servico/nao-e-uuid').set('Authorization', mecanico).expect(400);

    const foraDoAr = new CatalogoEmMemoria();
    foraDoAr.fora();
    const outroApp = await criarApp(foraDoAr);
    await request(outroApp.getHttpServer())
      .post(`/api/os/ordens-de-servico/${os.id}/itens`)
      .set('Authorization', mecanico)
      .send(corpo)
      .expect(503);
    await outroApp.close();
  });

  it('lista, consulta por número e mostra o histórico', async () => {
    const os = await abrirOs();
    const lista = await request(app.getHttpServer()).get('/api/os/ordens-de-servico?status=RECEBIDA').set('Authorization', atendente).expect(200);
    expect(lista.body.map((o: { id: string }) => o.id)).toEqual([os.id]);
    await request(app.getHttpServer()).get(`/api/os/ordens-de-servico/numero/${os.numero}`).set('Authorization', atendente).expect(200);
    const historico = await request(app.getHttpServer()).get(`/api/os/ordens-de-servico/${os.id}/historico`).set('Authorization', atendente).expect(200);
    expect(historico.body).toEqual([expect.objectContaining({ de: null, para: 'RECEBIDA', motivo: 'OS aberta' })]);
  });

  it('entrega só com a OS PAGA; mecânico não entrega', async () => {
    const os = await abrirOs();
    await request(app.getHttpServer()).post(`/api/os/ordens-de-servico/${os.id}/entrega`).set('Authorization', atendente).expect(422);
    await prisma.ordemDeServico.update({ where: { id: os.id }, data: { status: 'PAGA', versao: { increment: 1 } } });
    await request(app.getHttpServer()).post(`/api/os/ordens-de-servico/${os.id}/entrega`).set('Authorization', mecanico).expect(403);
    const entregue = await request(app.getHttpServer()).post(`/api/os/ordens-de-servico/${os.id}/entrega`).set('Authorization', atendente).expect(200);
    expect(entregue.body.status).toBe('ENTREGUE');
  });

  it('não existe mais avanço manual de status (spec §2.1)', async () => {
    const os = await abrirOs();
    await request(app.getHttpServer()).post(`/api/os/ordens-de-servico/${os.id}/status`).set('Authorization', atendente).expect(404);
  });
});
