#!/usr/bin/env node
// Smoke do fluxo completo da saga. Uso: node local/smoke.mjs [feliz|a|b|c|d|todos]
// Base URLs por env (padrão: compose local) para reaproveitar no EKS.
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const URL = {
  os: process.env.OS_URL ?? 'http://localhost:3001/api/os',
  catalog: process.env.CATALOG_URL ?? 'http://localhost:3002/api/catalog',
  execution: process.env.EXECUTION_URL ?? 'http://localhost:3003/api/execution',
  billing: process.env.BILLING_URL ?? 'http://localhost:3004/api/billing',
};
const CLIENTE_ID = '0c000000-0000-4000-8000-000000000001';
const VEICULO_ID = '0d000000-0000-4000-8000-000000000001';
const ESPERA_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 60000);
/** Pasta do docker-compose.yml: `docker compose` roda daqui (Git Bash no Windows e Linux). */
const PASTA_COMPOSE = dirname(fileURLToPath(import.meta.url));

function compose(...args) {
  return execFileSync('docker', ['compose', ...args], {
    cwd: PASTA_COMPOSE,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
}

async function chamar(metodo, url, { token, corpo, esperado = [200, 201] } = {}) {
  const resposta = await fetch(url, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  if (!esperado.includes(resposta.status)) {
    throw new Error(`${metodo} ${url} → ${resposta.status}: ${texto}`);
  }
  return texto ? JSON.parse(texto) : undefined;
}

async function login(email, senha) {
  return (await chamar('POST', `${URL.os}/auth/login`, { corpo: { email, senha } })).accessToken;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Repete `consulta` até `pronto(resultado)`; estoura com `erro()` se passar do prazo. */
async function esperar(consulta, pronto, erro) {
  const limite = Date.now() + ESPERA_MS;
  let ultimo;
  while (Date.now() < limite) {
    ultimo = await consulta();
    if (pronto(ultimo)) return ultimo;
    await dormir(1000);
  }
  throw new Error(await erro(ultimo));
}

const buscarOs = (ctx, osId) => chamar('GET', `${URL.os}/ordens-de-servico/${osId}`, { token: ctx.admin });
const historicoOs = (ctx, osId) => chamar('GET', `${URL.os}/ordens-de-servico/${osId}/historico`, { token: ctx.admin });

async function falhaDaOs(ctx, osId, os, esperado) {
  const historico = await historicoOs(ctx, osId);
  return `OS ${osId} ficou em ${os?.status}/${os?.etapaSaga}, esperado ${esperado}\n${JSON.stringify(historico, null, 2)}`;
}

/** Espera a OS chegar ao status; falha com o histórico se passar do prazo. */
function esperarStatus(ctx, osId, status) {
  return esperar(
    () => buscarOs(ctx, osId),
    (os) => os.status === status,
    (os) => falhaDaOs(ctx, osId, os, status),
  );
}

/** Espera a etapa da saga (ex.: EXECUCAO depois do execucao-aceita, sem mudar o status da OS). */
function esperarEtapa(ctx, osId, etapa) {
  return esperar(
    () => buscarOs(ctx, osId),
    (os) => os.etapaSaga === etapa,
    (os) => falhaDaOs(ctx, osId, os, `etapa ${etapa}`),
  );
}

/** Token de aprovação do e-mail simulado do Billing (log do container). */
async function tokenDoOrcamento(numero) {
  const padrao = new RegExp(`orcamentos/${numero}\\?token=([A-Za-z0-9_-]+)`, 'g');
  const achados = await esperar(
    async () => [...compose('logs', 'billing').matchAll(padrao)],
    (lista) => lista.length > 0,
    () => `token do orçamento da OS ${numero} não apareceu no log do billing`,
  );
  return achados.at(-1)[1];
}

async function prepararCatalogo(ctx) {
  const sufixo = Date.now().toString(36).toUpperCase();
  ctx.servico = await chamar('POST', `${URL.catalog}/servicos`, {
    token: ctx.admin, corpo: { nome: `Troca de óleo ${sufixo}`, descricao: 'Smoke', valorPadrao: 150 },
  });
  ctx.insumo = await chamar('POST', `${URL.catalog}/insumos`, {
    token: ctx.admin, corpo: { codigo: `OLEO-${sufixo}`, nome: 'Óleo 5W30', tipo: 'INSUMO', valorUnitario: 45.5, quantidadeEstoque: 100 },
  });
  ctx.insumoSemEstoque = await chamar('POST', `${URL.catalog}/insumos`, {
    token: ctx.admin, corpo: { codigo: `FILTRO-${sufixo}`, nome: 'Filtro esgotado', tipo: 'PECA', valorUnitario: 30, quantidadeEstoque: 0 },
  });
}

/** Abre a OS e conduz o diagnóstico até AGUARDANDO_APROVACAO; devolve OS e token do link. */
async function ateAguardandoAprovacao(ctx, insumo = ctx.insumo) {
  const os = await chamar('POST', `${URL.os}/ordens-de-servico`, {
    token: ctx.atendente, corpo: { clienteId: CLIENTE_ID, veiculoId: VEICULO_ID, observacoes: 'smoke' },
  });
  await esperarStatus(ctx, os.id, 'RECEBIDA');
  await esperarExecucao(ctx, os.id, 'AGUARDANDO_DIAGNOSTICO');
  await chamar('POST', `${URL.execution}/${os.id}/diagnostico/iniciar`, { token: ctx.mecanico });
  await esperarStatus(ctx, os.id, 'EM_DIAGNOSTICO');
  await chamar('POST', `${URL.os}/ordens-de-servico/${os.id}/itens`, {
    token: ctx.mecanico, corpo: { tipo: 'SERVICO', referenciaId: ctx.servico.id, quantidade: 1 },
  });
  await chamar('POST', `${URL.os}/ordens-de-servico/${os.id}/itens`, {
    token: ctx.mecanico, corpo: { tipo: 'INSUMO', referenciaId: insumo.id, quantidade: 2 },
  });
  await chamar('POST', `${URL.execution}/${os.id}/diagnostico/concluir`, { token: ctx.mecanico });
  await esperarStatus(ctx, os.id, 'AGUARDANDO_APROVACAO');
  return { os, token: await tokenDoOrcamento(os.numero) };
}

/**
 * O Execution só conhece a OS depois de consumir enfileirar-diagnostico (404 até lá).
 * GET /ordens/:osId devolve `{ ordem, historico }`; espera `ordem.status`.
 */
function esperarExecucao(ctx, osId, status) {
  return esperar(
    async () => {
      const r = await fetch(`${URL.execution}/ordens/${osId}`, { headers: { authorization: `Bearer ${ctx.mecanico}` } });
      return r.ok ? (await r.json()).ordem : undefined;
    },
    (ordem) => ordem?.status === status,
    (ordem) => `OS ${osId} no Execution ficou em ${ordem?.status ?? '(ausente)'}, esperado ${status}`,
  );
}

async function decidir(os, token, decisao) {
  await chamar('POST', `${URL.billing}/publico/orcamentos/${os.numero}/decisao`, { corpo: { token, decisao } });
}

/**
 * Aprovação → reserva → pivô. O execucao-aceita só muda a etapa da saga (EXECUCAO); a OS
 * continua APROVADA até o reparo-iniciado.
 */
async function ateExecucaoAceita(ctx, osId) {
  await esperarEtapa(ctx, osId, 'EXECUCAO');
  await esperarExecucao(ctx, osId, 'AGUARDANDO_REPARO');
}

/** Do aceite da execução até FINALIZADA (reparo completo com apontamentos). */
async function executarReparo(ctx, osId) {
  const ordem = await chamar('POST', `${URL.execution}/${osId}/reparo/iniciar`, { token: ctx.mecanico });
  await esperarStatus(ctx, osId, 'EM_EXECUCAO');
  for (const item of ordem.itens) {
    for (const acao of ['INICIAR', 'FINALIZAR']) {
      await chamar('POST', `${URL.execution}/${osId}/itens/${item.itemId}/apontamento`, { token: ctx.mecanico, corpo: { acao } });
    }
  }
  await chamar('POST', `${URL.execution}/${osId}/reparo/concluir`, { token: ctx.mecanico });
  return esperarStatus(ctx, osId, 'FINALIZADA');
}

const cobrancas = (ctx, osId) => chamar('GET', `${URL.billing}/cobrancas/${osId}`, { token: ctx.admin });

/** A cobrança nasce do gerar-cobranca (assíncrono): o simular dá 404 sem cobrança PENDENTE. */
async function esperarCobrancaPendente(ctx, osId) {
  const lista = await esperar(
    () => cobrancas(ctx, osId),
    (l) => l.some((c) => c.status === 'PENDENTE'),
    (l) => `OS ${osId} sem cobrança PENDENTE: ${JSON.stringify(l)}`,
  );
  return lista.find((c) => c.status === 'PENDENTE');
}

async function pagar(ctx, osId, aprovado) {
  await esperarCobrancaPendente(ctx, osId);
  await chamar('POST', `${URL.billing}/dev/pagamentos/${osId}/simular`, { token: ctx.admin, corpo: { aprovado } });
}

async function entregar(ctx, osId) {
  await esperarStatus(ctx, osId, 'PAGA');
  await chamar('POST', `${URL.os}/ordens-de-servico/${osId}/entrega`, { token: ctx.atendente });
  return esperarStatus(ctx, osId, 'ENTREGUE');
}

const CENARIOS = {
  async feliz(ctx) {
    const { os, token } = await ateAguardandoAprovacao(ctx);
    await decidir(os, token, 'APROVADA');
    await ateExecucaoAceita(ctx, os.id);
    await executarReparo(ctx, os.id);
    await pagar(ctx, os.id, true);
    await entregar(ctx, os.id);
    // Baixa do estoque sai junto com a cobrança: 100 − 2 em estoque, nada reservado.
    const insumo = await esperar(
      () => chamar('GET', `${URL.catalog}/insumos/${ctx.insumo.id}`, { token: ctx.admin }),
      (i) => i.quantidadeReservada === 0,
      (i) => `insumo ${ctx.insumo.id} com reserva ${i?.quantidadeReservada}, esperado 0`,
    );
    if (insumo.quantidadeEstoque !== 98) throw new Error(`estoque esperado 98, veio ${insumo.quantidadeEstoque}`);
  },
};

/** Nada pode ter caído em DLQ: o smoke falha se alguma tiver mensagem. */
function dlqsVazias() {
  const cheias = ['os', 'catalog', 'billing', 'execution']
    .map((svc) => {
      const total = compose(
        'exec', '-T', 'localstack', 'awslocal', 'sqs', 'get-queue-attributes', '--region', 'us-east-1',
        '--queue-url', `http://localhost:4566/000000000000/oficina-${svc}-inbox-dlq.fifo`,
        '--attribute-names', 'ApproximateNumberOfMessages',
        '--query', 'Attributes.ApproximateNumberOfMessages', '--output', 'text',
      ).trim();
      return { svc, total };
    })
    .filter(({ total }) => total !== '0');
  if (cheias.length) {
    throw new Error(`mensagens em DLQ: ${cheias.map(({ svc, total }) => `${svc}=${total}`).join(', ')}`);
  }
  console.log('✔ DLQs vazias');
}

async function main() {
  const escolha = process.argv[2] ?? 'todos';
  const ctx = {
    admin: await login('admin@oficina.local', 'admin123'),
    atendente: await login('atendente@oficina.local', 'senha123'),
    mecanico: await login('mecanico@oficina.local', 'senha123'),
  };
  await prepararCatalogo(ctx);
  const nomes = escolha === 'todos' ? Object.keys(CENARIOS) : [escolha];
  for (const nome of nomes) {
    if (!CENARIOS[nome]) throw new Error(`cenário desconhecido: ${nome}`);
    const inicio = Date.now();
    await CENARIOS[nome](ctx);
    console.log(`✔ ${nome} (${((Date.now() - inicio) / 1000).toFixed(1)}s)`);
  }
  dlqsVazias();
}

main().catch((erro) => {
  console.error(`✘ ${erro.message}`);
  process.exit(1);
});
