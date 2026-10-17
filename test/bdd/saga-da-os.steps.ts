import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { autoBindSteps, loadFeature, StepDefinitions } from 'jest-cucumber';
import request from 'supertest';

import { criarEnvelope, MessageEnvelope } from '../../src/application/ports/message-envelope';
import {
  BILLING_EVENTS,
  CATALOG_EVENTS,
  EXECUTION_EVENTS,
} from '../../src/application/saga/saga-messages';
import { PerfilAcesso } from '../../src/common/auth/perfil';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { MessageHandlerRegistry } from '../../src/infrastructure/messaging/message-handler.registry';
import { INSUMO_FILTRO, SERVICO_REVISAO } from '../fakes/catalogo-em-memoria';
import { criarApp } from '../helpers/app';
import { criarClienteComVeiculo } from '../helpers/cadastros';
import { conectar, limparBanco } from '../helpers/database';
import { token } from '../helpers/tokens';

const feature = loadFeature('test/bdd/features/saga-da-os.feature');

const ATENDENTE = token(PerfilAcesso.ATENDENTE);
const MECANICO = token(PerfilAcesso.MECANICO, 'mecanico-bdd');

let app: INestApplication;
let prisma: PrismaService;
let registry: MessageHandlerRegistry;

/** Estado do cenário corrente (recriado no primeiro passo de cada cenário). */
let osId: string;
let ultimoEnvelope: MessageEnvelope;
let cobrancas = 0;

beforeAll(async () => {
  prisma = await conectar();
  app = await criarApp();
  registry = app.get(MessageHandlerRegistry);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(() => limparBanco(prisma));

const http = () => request(app.getHttpServer());

async function evento(tipo: string, payload: Record<string, unknown> = {}): Promise<void> {
  ultimoEnvelope = criarEnvelope(tipo, osId, { osId, ...payload });
  await registry.despachar(ultimoEnvelope);
}

async function abrirOsEmDiagnostico(itens: { tipo: string; referenciaId: string; quantidade: number }[]): Promise<void> {
  cobrancas = 0;
  const { clienteId, veiculoId } = await criarClienteComVeiculo(prisma);
  const aberta = await http().post('/api/os/ordens-de-servico').set('Authorization', ATENDENTE).send({ clienteId, veiculoId }).expect(201);
  osId = aberta.body.id;
  await evento(EXECUTION_EVENTS.DIAGNOSTICO_INICIADO, { mecanicoId: randomUUID() });
  for (const item of itens) {
    await http().post(`/api/os/ordens-de-servico/${osId}/itens`).set('Authorization', MECANICO).send(item).expect(201);
  }
}

async function comandosEnviados(): Promise<string[]> {
  const linhas = await prisma.outbox.findMany({ where: { groupId: osId }, orderBy: { seq: 'asc' } });
  return linhas.map((linha) => linha.type);
}

const SERVICO = { tipo: 'SERVICO', referenciaId: SERVICO_REVISAO, quantidade: 1 };
const INSUMO = { tipo: 'INSUMO', referenciaId: INSUMO_FILTRO, quantidade: 2 };

const passos: StepDefinitions = ({ given, when, then, and }) => {
  given('uma OS em diagnóstico com um serviço e um insumo', () => abrirOsEmDiagnostico([SERVICO, INSUMO]));
  given('uma OS em diagnóstico só com um insumo', () => abrirOsEmDiagnostico([INSUMO]));

  when('o Execution conclui o diagnóstico', () => evento(EXECUTION_EVENTS.DIAGNOSTICO_CONCLUIDO));
  and('a mesma mensagem de diagnóstico concluído chega de novo', () => registry.despachar(ultimoEnvelope));

  and('o Billing envia o orçamento', () =>
    evento(BILLING_EVENTS.ORCAMENTO_ENVIADO, {
      orcamentoId: randomUUID(),
      numeroOs: 1,
      valorTotal: 321,
      validoAte: new Date(Date.now() + 48 * 3_600_000).toISOString(),
    }),
  );
  and('o cliente aprova o orçamento', () => evento(BILLING_EVENTS.ORCAMENTO_APROVADO, { orcamentoId: randomUUID() }));
  and('o cliente reprova o orçamento', () => evento(BILLING_EVENTS.ORCAMENTO_REPROVADO, { orcamentoId: randomUUID() }));
  and('o orçamento expira', () => evento(BILLING_EVENTS.ORCAMENTO_EXPIRADO, { orcamentoId: randomUUID() }));
  and('o Billing confirma o cancelamento do orçamento', () => evento(BILLING_EVENTS.ORCAMENTO_CANCELADO));

  and('o Catalog reserva os insumos', () =>
    evento(CATALOG_EVENTS.INSUMOS_RESERVADOS, { reservaId: randomUUID(), itens: [{ insumoId: INSUMO_FILTRO, quantidade: 2 }] }),
  );
  and('o Catalog não consegue reservar os insumos', () =>
    evento(CATALOG_EVENTS.RESERVA_INSUMOS_FALHOU, { motivo: 'ESTOQUE_INSUFICIENTE', mensagem: 'Estoque insuficiente de Filtro de óleo' }),
  );
  and('o Catalog libera as reservas', () => evento(CATALOG_EVENTS.RESERVAS_LIBERADAS));

  and('o Execution aceita a execução', () => evento(EXECUTION_EVENTS.EXECUCAO_ACEITA));
  and('o Execution recusa a execução por falta de capacidade', () =>
    evento(EXECUTION_EVENTS.EXECUCAO_RECUSADA, { motivo: 'CAPACIDADE_ESGOTADA', mensagem: 'Fila de execução cheia' }),
  );
  and('o Execution inicia e conclui o reparo', async () => {
    await evento(EXECUTION_EVENTS.REPARO_INICIADO, { mecanicoId: randomUUID() });
    await evento(EXECUTION_EVENTS.SERVICO_EXECUTADO, { itemId: randomUUID(), servicoId: SERVICO_REVISAO, minutos: 40 });
    await evento(EXECUTION_EVENTS.EXECUCAO_CONCLUIDA, { minutos: 42 });
  });

  and('o Billing gera a cobrança', () => {
    cobrancas += 1;
    return evento(BILLING_EVENTS.COBRANCA_GERADA, {
      cobrancaId: randomUUID(),
      valor: 321,
      initPoint: `http://pagamento.teste/${cobrancas}`,
    });
  });
  and('o Billing recusa o pagamento', () =>
    evento(BILLING_EVENTS.PAGAMENTO_RECUSADO, { cobrancaId: randomUUID(), mpPaymentId: '1', motivo: 'cc_rejected_other_reason' }),
  );
  and('o Billing confirma o pagamento', () =>
    evento(BILLING_EVENTS.PAGAMENTO_CONFIRMADO, { cobrancaId: randomUUID(), mpPaymentId: '2', valor: 321 }),
  );
  and('o atendente entrega o veículo', () =>
    http().post(`/api/os/ordens-de-servico/${osId}/entrega`).set('Authorization', ATENDENTE).expect(200),
  );

  then(/^a OS fica com status "(.*)" e a saga na etapa "(.*)"$/, async (status: string, etapa: string) => {
    const resposta = await http().get(`/api/os/ordens-de-servico/${osId}`).set('Authorization', ATENDENTE).expect(200);
    expect({ status: resposta.body.status, etapa: resposta.body.etapaSaga }).toEqual({ status, etapa });
  });
  and('o orquestrador enviou, em ordem, os comandos:', async (tabela: { comando: string }[]) => {
    expect(await comandosEnviados()).toEqual(tabela.map((linha) => linha.comando));
  });
  and(/^o último comando enviado foi "(.*)"$/, async (comando: string) => {
    expect((await comandosEnviados()).at(-1)).toBe(comando);
  });
};

autoBindSteps([feature], [passos]);
