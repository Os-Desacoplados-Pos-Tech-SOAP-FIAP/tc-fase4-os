// Gera a collection e os ambientes desta pasta. Os JSON são saída deste script: edite aqui e rode
// `node postman/gerar-collection.mjs` (depois `postman/sincronizar-docs.sh` para a cópia do tc-fase4-docs).
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const destino = dirname(fileURLToPath(import.meta.url));

const AJUDANTE = `/**
 * Repete a consulta (pm.sendRequest) até pronto(corpo) ser verdadeiro: até 30 tentativas, 1 s entre elas.
 * Cobre os passos assíncronos da saga (SQS FIFO) para o newman rodar sem intervenção.
 */
function aguardar(opcoes) {
  const tentativas = opcoes.tentativas || 30;
  const url = pm.variables.replaceIn(opcoes.url);
  let feitas = 0;
  const tentar = () => {
    feitas += 1;
    pm.sendRequest({
      url: url,
      method: 'GET',
      header: [{ key: 'Authorization', value: 'Bearer ' + pm.variables.get(opcoes.token || 'tokenAdmin') }],
    }, (erro, res) => {
      let corpo;
      try { corpo = res.json(); } catch (e) { corpo = undefined; }
      if (!erro && res.code === 200 && opcoes.pronto(corpo)) return;
      if (feitas >= tentativas) {
        console.warn('Condição não atingida após ' + tentativas + ' tentativas: ' + (opcoes.descricao || url));
        return;
      }
      setTimeout(tentar, 1000);
    });
  };
  tentar();
}`;

const PARAR_SEM_TOKEN = `if (!pm.variables.get('tokenOrcamento')) {
  console.log('Defina tokenOrcamento (log do Billing) e rode a próxima parte.');
  if (pm.execution && pm.execution.setNextRequest) pm.execution.setNextRequest(null);
  else postman.setNextRequest(null);
}`;

const linhas = (texto) => texto.split('\n');

function request(nome, metodo, url, opcoes = {}) {
  const item = { name: nome, request: { method: metodo, header: [], url } };
  if (opcoes.descricao) item.request.description = opcoes.descricao;
  if (opcoes.token) {
    item.request.auth = { type: 'bearer', bearer: [{ key: 'token', value: `{{${opcoes.token}}}`, type: 'string' }] };
  } else {
    item.request.auth = { type: 'noauth' };
  }
  for (const [key, value] of Object.entries(opcoes.headers ?? {})) item.request.header.push({ key, value });
  if (opcoes.corpo !== undefined) {
    item.request.header.push({ key: 'Content-Type', value: 'application/json' });
    item.request.body = {
      mode: 'raw',
      raw: JSON.stringify(opcoes.corpo, null, 2),
      options: { raw: { language: 'json' } },
    };
  }
  const event = [];
  if (opcoes.pre) event.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: linhas(opcoes.pre) } });
  if (opcoes.teste) event.push({ listen: 'test', script: { type: 'text/javascript', exec: linhas(opcoes.teste) } });
  if (event.length) item.event = event;
  return item;
}

const pasta = (nome, item, descricao) => ({ name: nome, ...(descricao && { description: descricao }), item });

const status = (...codigos) =>
  `pm.test('status ${codigos.join(' ou ')}', () => pm.expect(pm.response.code).to.be.oneOf([${codigos.join(', ')}]));`;
const statusOs = (valor) => `pm.test('OS ${valor}', () => pm.expect(pm.response.json().status).to.eql('${valor}'));`;
const etapa = (valor) => `pm.test('etapaSaga ${valor}', () => pm.expect(pm.response.json().etapaSaga).to.eql('${valor}'));`;
const aguardarOs = (os, condicao, descricao) =>
  `${AJUDANTE}\naguardar({ url: '{{osUrl}}/ordens-de-servico/{{${os}}}', descricao: '${descricao}', pronto: (os) => ${condicao} });`;

const OS = '{{osUrl}}';
const CATALOG = '{{catalogUrl}}';
const EXECUTION = '{{executionUrl}}';
const BILLING = '{{billingUrl}}';

const COMO_PEGAR_TOKEN = [
  'O token do orçamento só aparece no log do Billing (e-mail simulado com o link `.../publico/orcamentos/<numero>?token=<token>`).',
  '',
  'Local: `docker compose -f local/docker-compose.yml logs billing | grep "orcamentos/{{numeroOs}}?token="`',
  '',
  'EKS: `kubectl logs -n billing deploy/billing --tail=-1 | grep "orcamentos/<numero>?token="`',
  '',
  'Copie o valor depois de `token=` para a variável de ambiente `tokenOrcamento` (veja `postman/README.md`).',
].join('\n');

// ---------------------------------------------------------------------------------------------
// Blocos reaproveitados pelo fluxo e pelos cenários
// ---------------------------------------------------------------------------------------------

function abrirOs(nome) {
  return request(nome, 'POST', `${OS}/ordens-de-servico`, {
    token: 'tokenAtendente',
    corpo: { clienteId: '{{clienteId}}', veiculoId: '{{veiculoId}}', observacoes: 'Barulho no motor' },
    descricao: 'Abre a OS (RECEBIDA). A saga grava `execution.enfileirar-diagnostico.v1` na outbox. Limpa `tokenOrcamento` da OS anterior.',
    teste: [
      status(201),
      statusOs('RECEBIDA'),
      'const os = pm.response.json();',
      "pm.environment.set('osId', os.id);",
      "pm.environment.set('numeroOs', String(os.numero));",
      "pm.environment.unset('tokenOrcamento');",
    ].join('\n'),
  });
}

/** Do diagnóstico até AGUARDANDO_APROVACAO, com o insumo da variável informada. */
function diagnostico(prefixo, insumoVar) {
  return [
    request(`${prefixo}.1 Ordem no Execution (aguarda o enfileirar-diagnostico)`, 'GET', `${EXECUTION}/ordens/{{osId}}`, {
      token: 'tokenMecanico',
      descricao: 'A OS chega ao Execution de forma assíncrona: 404 até o `enfileirar-diagnostico` ser consumido. O pre-request repete a consulta até a ordem existir. Resposta: `{ ordem, historico }`.',
      pre: `${AJUDANTE}\naguardar({ url: '{{executionUrl}}/ordens/{{osId}}', token: 'tokenMecanico', descricao: 'ordem no Execution', pronto: (r) => r && r.ordem && r.ordem.status === 'AGUARDANDO_DIAGNOSTICO' });`,
      teste: [
        status(200),
        "pm.test('ordem AGUARDANDO_DIAGNOSTICO', () => pm.expect(pm.response.json().ordem.status).to.eql('AGUARDANDO_DIAGNOSTICO'));",
        "pm.test('resposta com historico', () => pm.expect(pm.response.json()).to.have.property('historico'));",
      ].join('\n'),
    }),
    request(`${prefixo}.2 Iniciar diagnóstico`, 'POST', `${EXECUTION}/{{osId}}/diagnostico/iniciar`, {
      token: 'tokenMecanico',
      teste: status(200),
    }),
    request(`${prefixo}.3 Incluir serviço`, 'POST', `${OS}/ordens-de-servico/{{osId}}/itens`, {
      token: 'tokenMecanico',
      corpo: { tipo: 'SERVICO', referenciaId: '{{servicoId}}', quantidade: 1 },
      descricao: 'Itens só entram com a OS em EM_DIAGNOSTICO (evento `diagnostico-iniciado`, assíncrono). Preço vem do Catalog.',
      pre: aguardarOs('osId', "os && os.status === 'EM_DIAGNOSTICO'", 'OS EM_DIAGNOSTICO'),
      teste: status(201),
    }),
    request(`${prefixo}.4 Incluir insumo`, 'POST', `${OS}/ordens-de-servico/{{osId}}/itens`, {
      token: 'tokenMecanico',
      corpo: { tipo: 'INSUMO', referenciaId: `{{${insumoVar}}}`, quantidade: 2 },
      teste: status(201),
    }),
    request(`${prefixo}.5 Concluir diagnóstico`, 'POST', `${EXECUTION}/{{osId}}/diagnostico/concluir`, {
      token: 'tokenMecanico',
      descricao: 'O OS valida o orçamento e pede `billing.gerar-orcamento.v1`; o Billing manda o e-mail (simulado, no log).',
      teste: status(200),
    }),
    request(`${prefixo}.6 OS aguardando aprovação`, 'GET', `${OS}/ordens-de-servico/{{osId}}`, {
      token: 'tokenAdmin',
      descricao: `Espera o \`orcamento-enviado\`: OS AGUARDANDO_APROVACAO, etapaSaga ORCAMENTO e valorTotal.\n\n${COMO_PEGAR_TOKEN}\n\nSem \`tokenOrcamento\` definido, o runner para aqui.`,
      pre: aguardarOs('osId', "os && os.status === 'AGUARDANDO_APROVACAO'", 'OS AGUARDANDO_APROVACAO'),
      teste: [
        status(200),
        statusOs('AGUARDANDO_APROVACAO'),
        etapa('ORCAMENTO'),
        "pm.test('valorTotal maior que zero', () => pm.expect(Number(pm.response.json().valorTotal)).to.be.above(0));",
        PARAR_SEM_TOKEN,
      ].join('\n'),
    }),
  ];
}

function decidir(nome, decisao) {
  return request(nome, 'POST', `${BILLING}/publico/orcamentos/{{numeroOs}}/decisao`, {
    corpo: { token: '{{tokenOrcamento}}', decisao },
    descricao: `Rota pública (sem JWT). Exige \`tokenOrcamento\` da OS atual.\n\n${COMO_PEGAR_TOKEN}`,
    teste: status(200),
  });
}

function osAceita(nome, os = 'osId') {
  return request(nome, 'GET', `${OS}/ordens-de-servico/{{${os}}}`, {
    token: 'tokenAdmin',
    descricao: 'Aprovação → reserva de insumos → `execucao-aceita` (pivô). A OS continua APROVADA com etapaSaga EXECUCAO; só vira EM_EXECUCAO com o reparo iniciado.',
    pre: aguardarOs(os, "os && os.etapaSaga === 'EXECUCAO'", 'etapa EXECUCAO'),
    teste: [status(200), statusOs('APROVADA'), etapa('EXECUCAO')].join('\n'),
  });
}

/** Do reparo iniciado até a OS FINALIZADA. */
function reparo(prefixo, os = 'osId') {
  return [
    request(`${prefixo}.1 Iniciar reparo`, 'POST', `${EXECUTION}/{{${os}}}/reparo/iniciar`, {
      token: 'tokenMecanico',
      descricao: 'Espera a ordem AGUARDANDO_REPARO no Execution e grava `itemId` (primeiro item da execução).',
      pre: `${AJUDANTE}\naguardar({ url: '{{executionUrl}}/ordens/{{${os}}}', token: 'tokenMecanico', descricao: 'ordem AGUARDANDO_REPARO', pronto: (r) => r && r.ordem && r.ordem.status === 'AGUARDANDO_REPARO' });`,
      teste: [
        status(200),
        'const ordem = pm.response.json();',
        "pm.test('ordem com itens', () => pm.expect(ordem.itens).to.be.an('array').that.is.not.empty);",
        "pm.environment.set('itemId', ordem.itens[0].itemId);",
      ].join('\n'),
    }),
    request(`${prefixo}.2 OS em execução`, 'GET', `${OS}/ordens-de-servico/{{${os}}}`, {
      token: 'tokenAdmin',
      pre: aguardarOs(os, "os && os.status === 'EM_EXECUCAO'", 'OS EM_EXECUCAO'),
      teste: [status(200), statusOs('EM_EXECUCAO')].join('\n'),
    }),
    request(`${prefixo}.3 Apontamento INICIAR`, 'POST', `${EXECUTION}/{{${os}}}/itens/{{itemId}}/apontamento`, {
      token: 'tokenMecanico',
      corpo: { acao: 'INICIAR' },
      teste: status(200),
    }),
    request(`${prefixo}.4 Apontamento FINALIZAR`, 'POST', `${EXECUTION}/{{${os}}}/itens/{{itemId}}/apontamento`, {
      token: 'tokenMecanico',
      corpo: { acao: 'FINALIZAR' },
      teste: status(200),
    }),
    request(`${prefixo}.5 Concluir reparo`, 'POST', `${EXECUTION}/{{${os}}}/reparo/concluir`, {
      token: 'tokenMecanico',
      descricao: 'Libera a vaga do Execution; o OS vai a FINALIZADA e pede baixa do estoque e cobrança.',
      teste: status(200),
    }),
    request(`${prefixo}.6 OS finalizada`, 'GET', `${OS}/ordens-de-servico/{{${os}}}`, {
      token: 'tokenAdmin',
      pre: aguardarOs(os, "os && os.status === 'FINALIZADA'", 'OS FINALIZADA'),
      teste: [status(200), statusOs('FINALIZADA'), etapa('COBRANCA')].join('\n'),
    }),
  ];
}

const AGUARDAR_PENDENTE = (os) =>
  `${AJUDANTE}\naguardar({ url: '{{billingUrl}}/cobrancas/{{${os}}}', descricao: 'cobrança PENDENTE', pronto: (l) => Array.isArray(l) && l.some((c) => c.status === 'PENDENTE') });`;

/** Cobrança, pagamento aprovado e entrega. */
function pagamentoEntrega(prefixo, os = 'osId') {
  return [
    request(`${prefixo}.1 Cobrança pendente`, 'GET', `${BILLING}/cobrancas/{{${os}}}`, {
      token: 'tokenAdmin',
      descricao: 'A cobrança é assíncrona (`gerar-cobranca`): o pre-request espera uma PENDENTE. Com PAYMENT_PROVIDER=fake o initPoint aponta para o próprio /dev/pagamentos/<osId>/simular.',
      pre: AGUARDAR_PENDENTE(os),
      teste: [
        status(200),
        "pm.test('cobrança PENDENTE', () => pm.expect(pm.response.json().some((c) => c.status === 'PENDENTE')).to.be.true);",
      ].join('\n'),
    }),
    request(`${prefixo}.2 Simular pagamento aprovado`, 'POST', `${BILLING}/dev/pagamentos/{{${os}}}/simular`, {
      token: 'tokenAdmin',
      corpo: { aprovado: true },
      descricao: '404 enquanto não houver cobrança PENDENTE.',
      teste: status(200),
    }),
    request(`${prefixo}.3 Entregar veículo`, 'POST', `${OS}/ordens-de-servico/{{${os}}}/entrega`, {
      token: 'tokenAtendente',
      descricao: 'Só com a OS PAGA (`pagamento-confirmado`, assíncrono).',
      pre: aguardarOs(os, "os && os.status === 'PAGA'", 'OS PAGA'),
      teste: [status(200), statusOs('ENTREGUE')].join('\n'),
    }),
  ];
}

function historicoComMotivo(nome, os, inicio) {
  return request(nome, 'GET', `${OS}/ordens-de-servico/{{${os}}}/historico`, {
    token: 'tokenAdmin',
    teste: [
      status(200),
      `pm.test('histórico com "${inicio}..."', () => pm.expect(pm.response.json().some((h) => (h.motivo || '').startsWith('${inicio}'))).to.be.true);`,
    ].join('\n'),
  });
}

function osCancelada(nome, nomeHistorico, os, motivo) {
  return [
    request(nome, 'GET', `${OS}/ordens-de-servico/{{${os}}}`, {
      token: 'tokenAdmin',
      descricao: 'A OS só fica CANCELADA com a última confirmação da compensação (`orcamento-cancelado`).',
      pre: aguardarOs(os, "os && os.status === 'CANCELADA'", 'OS CANCELADA'),
      teste: [status(200), statusOs('CANCELADA'), etapa('COMPENSADA')].join('\n'),
    }),
    historicoComMotivo(nomeHistorico, os, motivo),
  ];
}

// ---------------------------------------------------------------------------------------------
// 1. Fluxo da saga
// ---------------------------------------------------------------------------------------------

const login = (nome, email, senhaVar, tokenVar) =>
  request(nome, 'POST', `${OS}/auth/login`, {
    corpo: { email, senha: `{{${senhaVar}}}` },
    teste: [status(200), `pm.environment.set('${tokenVar}', pm.response.json().accessToken);`].join('\n'),
  });

const fluxoParte1 = [
  login('1.1 Login admin', 'admin@oficina.local', 'senhaAdmin', 'tokenAdmin'),
  login('1.2 Login atendente', 'atendente@oficina.local', 'senhaPadrao', 'tokenAtendente'),
  login('1.3 Login mecânico', 'mecanico@oficina.local', 'senhaPadrao', 'tokenMecanico'),
  request('2.1 Criar serviço', 'POST', `${CATALOG}/servicos`, {
    token: 'tokenAdmin',
    corpo: { nome: 'Troca de óleo {{$timestamp}}', descricao: 'Troca de óleo e filtro', valorPadrao: 150 },
    teste: [status(201), "pm.environment.set('servicoId', pm.response.json().id);"].join('\n'),
  }),
  request('2.2 Criar insumo', 'POST', `${CATALOG}/insumos`, {
    token: 'tokenAdmin',
    corpo: { codigo: 'OLEO-{{$timestamp}}', nome: 'Óleo 5W30', tipo: 'INSUMO', valorUnitario: 45.5, quantidadeEstoque: 100 },
    descricao: 'O código é único; o sufixo `{{$timestamp}}` evita 409 INSUMO_CODIGO_DUPLICADO em execuções seguidas.',
    teste: [status(201), "pm.environment.set('insumoId', pm.response.json().id);"].join('\n'),
  }),
  abrirOs('3.1 Abrir OS'),
  ...diagnostico('4', 'insumoId').slice(0, 5),
  ...diagnostico('5', 'insumoId').slice(5).map((r) => ({ ...r, name: '5.1 OS aguardando aprovação' })),
  request('5.2 Histórico da OS', 'GET', `${OS}/ordens-de-servico/{{osId}}/historico`, {
    token: 'tokenAdmin',
    teste: [status(200), "pm.test('histórico é lista', () => pm.expect(pm.response.json()).to.be.an('array').that.is.not.empty);"].join('\n'),
  }),
  request('6.1 Orçamento no Billing (pegue o token no log)', 'GET', `${BILLING}/orcamentos/{{osId}}`, {
    token: 'tokenAdmin',
    descricao: `${COMO_PEGAR_TOKEN}\n\nSem \`tokenOrcamento\` definido, o runner para aqui: defina a variável e rode a "Parte 2".`,
    teste: [status(200), PARAR_SEM_TOKEN].join('\n'),
  }),
];

// O 5.1 já para sem token; no fluxo principal quem para é o 6.1, então tira a parada do 5.1.
const passo51 = fluxoParte1.find((r) => r.name === '5.1 OS aguardando aprovação');
const scriptTeste51 = passo51.event.find((e) => e.listen === 'test').script;
scriptTeste51.exec = linhas(scriptTeste51.exec.join('\n').replace(`\n${PARAR_SEM_TOKEN}`, ''));
passo51.request.description = 'Espera o `orcamento-enviado`: OS AGUARDANDO_APROVACAO, etapaSaga ORCAMENTO e valorTotal.';

const fluxoParte2 = [
  request('7.1 Cliente vê o orçamento', 'GET', `${BILLING}/publico/orcamentos/{{numeroOs}}?token={{tokenOrcamento}}`, {
    descricao: `Rota pública (sem JWT).\n\n${COMO_PEGAR_TOKEN}`,
    teste: status(200),
  }),
  decidir('7.2 Cliente aprova o orçamento', 'APROVADA'),
  osAceita('7.3 OS após o aceite (pivô)'),
  ...reparo('8'),
  ...pagamentoEntrega('9'),
  request('9.4 Histórico final', 'GET', `${OS}/ordens-de-servico/{{osId}}/historico`, {
    token: 'tokenAdmin',
    teste: [status(200), "pm.test('histórico chega a ENTREGUE', () => pm.expect(pm.response.json().some((h) => h.para === 'ENTREGUE')).to.be.true);"].join('\n'),
  }),
  request('9.5 Estoque baixado', 'GET', `${CATALOG}/insumos/{{insumoId}}`, {
    token: 'tokenAdmin',
    descricao: 'Baixa sai junto com a cobrança: 100 − 2 em estoque, nada reservado.',
    pre: `${AJUDANTE}\naguardar({ url: '{{catalogUrl}}/insumos/{{insumoId}}', descricao: 'reserva zerada', pronto: (i) => i && i.quantidadeReservada === 0 });`,
    teste: [
      status(200),
      "pm.test('estoque 98', () => pm.expect(pm.response.json().quantidadeEstoque).to.eql(98));",
      "pm.test('nada reservado', () => pm.expect(pm.response.json().quantidadeReservada).to.eql(0));",
    ].join('\n'),
  }),
];

const fluxo = pasta(
  '1. Fluxo da saga',
  [
    pasta('Parte 1 - até o orçamento enviado', fluxoParte1, 'Logins, catálogo, abertura da OS e diagnóstico. Termina com o orçamento enviado ao cliente (e-mail simulado no log do Billing).'),
    pasta('Parte 2 - aprovação até a entrega', fluxoParte2, 'Exige `tokenOrcamento` da OS aberta na Parte 1.'),
  ],
  'Mesma ordem do `local/oficina-fase4.http` e do `local/smoke.mjs`. Os passos assíncronos têm retentativa automática no pre-request (até 30 vezes, 1 s entre elas). O token do orçamento só existe no log do Billing: rode a Parte 1, defina `tokenOrcamento` e rode a Parte 2.',
);

// ---------------------------------------------------------------------------------------------
// 2. Cenários de falha
// ---------------------------------------------------------------------------------------------

const cenarioA = pasta('(a) Reprovação', [
  pasta('a - Parte 1', [abrirOs('a1.1 Abrir OS'), ...diagnostico('a2', 'insumoId')]),
  pasta('a - Parte 2', [
    decidir('a3.1 Cliente reprova o orçamento', 'REPROVADA'),
    request('a3.2 OS reprovada', 'GET', `${OS}/ordens-de-servico/{{osId}}`, {
      token: 'tokenAdmin',
      pre: aguardarOs('osId', "os && os.status === 'REPROVADA'", 'OS REPROVADA'),
      teste: [status(200), statusOs('REPROVADA'), etapa('ENCERRADA')].join('\n'),
    }),
  ]),
], 'Reprovação do orçamento: a OS termina REPROVADA e a saga ENCERRADA. Usa os tokens, `servicoId` e `insumoId` da pasta 1.');

const cenarioB = pasta('(b) Sem estoque', [
  pasta('b - Parte 1', [
    request('b1.1 Criar insumo sem estoque', 'POST', `${CATALOG}/insumos`, {
      token: 'tokenAdmin',
      corpo: { codigo: 'FILTRO-{{$timestamp}}', nome: 'Filtro esgotado', tipo: 'PECA', valorUnitario: 30, quantidadeEstoque: 0 },
      teste: [status(201), "pm.environment.set('insumoSemEstoqueId', pm.response.json().id);"].join('\n'),
    }),
    abrirOs('b1.2 Abrir OS'),
    ...diagnostico('b2', 'insumoSemEstoqueId'),
  ]),
  pasta('b - Parte 2', [
    decidir('b3.1 Cliente aprova o orçamento', 'APROVADA'),
    ...osCancelada('b3.2 OS cancelada', 'b3.3 Histórico com o motivo técnico', 'osId', 'Reserva de insumos falhou'),
  ]),
], 'A reserva falha (ESTOQUE_INSUFICIENTE), o Billing cancela o orçamento e a OS vira CANCELADA.');

const cenarioC = pasta('(c) Fila de execução cheia', [
  pasta('c - Parte 1 (primeira OS)', [
    request('c1.1 Fila do Execution sem vaga ocupada', 'GET', `${EXECUTION}/fila`, {
      token: 'tokenMecanico',
      descricao: 'Pré-condição: com EXECUTION_MAX_CONCURRENT=1, nenhuma outra OS pode estar AGUARDANDO_REPARO ou EM_REPARO.',
      teste: [
        status(200),
        "pm.test('nenhuma OS ocupando a vaga', () => pm.expect(pm.response.json().filter((o) => ['AGUARDANDO_REPARO', 'EM_REPARO'].includes(o.status))).to.be.empty);",
      ].join('\n'),
    }),
    abrirOs('c1.2 Abrir a primeira OS'),
    ...diagnostico('c2', 'insumoId'),
  ]),
  pasta('c - Parte 2 (primeira aceita, segunda OS)', [
    decidir('c3.1 Cliente aprova a primeira OS', 'APROVADA'),
    osAceita('c3.2 Primeira OS aceita (ocupa a vaga)'),
    abrirOs('c4.1 Abrir a segunda OS'),
    ...diagnostico('c5', 'insumoId'),
  ]),
  pasta('c - Parte 3 (segunda recusada, libera a vaga)', [
    decidir('c6.1 Cliente aprova a segunda OS', 'APROVADA'),
    ...osCancelada('c6.2 Segunda OS cancelada', 'c6.3 Histórico com o motivo técnico', 'osId', 'Execução recusada'),
    ...reparo('c7', 'osIdPrimeira'),
    ...pagamentoEntrega('c8', 'osIdPrimeira'),
  ]),
], 'Com uma OS aceita ocupando a vaga, a segunda é recusada (CAPACIDADE_ESGOTADA): o Catalog libera as reservas, o Billing cancela e a segunda OS vira CANCELADA. No fim a primeira OS é concluída para liberar a vaga.');

// A primeira OS aceita guarda o id para a Parte 3 (osId é sobrescrito pela segunda).
const c32 = cenarioC.item[1].item[1];
c32.event.find((e) => e.listen === 'test').script.exec.push(
  "pm.environment.set('osIdPrimeira', pm.environment.get('osId'));",
);

const cenarioD = pasta('(d) Pagamento recusado', [
  pasta('d - Parte 1', [abrirOs('d1.1 Abrir OS'), ...diagnostico('d2', 'insumoId')]),
  pasta('d - Parte 2', [
    decidir('d3.1 Cliente aprova o orçamento', 'APROVADA'),
    osAceita('d3.2 OS após o aceite (pivô)'),
    ...reparo('d4'),
    request('d5.1 Cobrança pendente', 'GET', `${BILLING}/cobrancas/{{osId}}`, {
      token: 'tokenAdmin',
      pre: AGUARDAR_PENDENTE('osId'),
      teste: [
        status(200),
        "const pendente = pm.response.json().find((c) => c.status === 'PENDENTE');",
        "pm.test('cobrança PENDENTE', () => pm.expect(pendente).to.exist);",
        "pm.environment.set('cobrancaRecusadaId', pendente && pendente.id);",
      ].join('\n'),
    }),
    request('d5.2 Simular pagamento recusado', 'POST', `${BILLING}/dev/pagamentos/{{osId}}/simular`, {
      token: 'tokenAdmin',
      corpo: { aprovado: false },
      teste: status(200),
    }),
    request('d5.3 Nova cobrança PENDENTE', 'GET', `${BILLING}/cobrancas/{{osId}}`, {
      token: 'tokenAdmin',
      descricao: 'A anterior fica RECUSADA e o Billing gera outra PENDENTE. Com o fake o initPoint é igual: compare pelo id.',
      pre: `${AJUDANTE}\nconst anterior = pm.variables.get('cobrancaRecusadaId');\naguardar({ url: '{{billingUrl}}/cobrancas/{{osId}}', descricao: 'nova cobrança', pronto: (l) => Array.isArray(l) && l.some((c) => c.id === anterior && c.status === 'RECUSADA') && l.some((c) => c.id !== anterior && c.status === 'PENDENTE') });`,
      teste: [
        status(200),
        "const anterior = pm.variables.get('cobrancaRecusadaId');",
        'const lista = pm.response.json();',
        "pm.test('anterior RECUSADA', () => pm.expect(lista.some((c) => c.id === anterior && c.status === 'RECUSADA')).to.be.true);",
        "pm.test('nova PENDENTE', () => pm.expect(lista.some((c) => c.id !== anterior && c.status === 'PENDENTE')).to.be.true);",
      ].join('\n'),
    }),
    historicoComMotivo('d5.4 Histórico com "Pagamento recusado"', 'osId', 'Pagamento recusado'),
    request('d5.5 OS continua FINALIZADA com novo link', 'GET', `${OS}/ordens-de-servico/{{osId}}`, {
      token: 'tokenAdmin',
      pre: aguardarOs('osId', 'os && Boolean(os.linkPagamento)', 'novo linkPagamento'),
      teste: [
        status(200),
        statusOs('FINALIZADA'),
        "pm.test('linkPagamento preenchido', () => pm.expect(pm.response.json().linkPagamento).to.be.a('string').that.is.not.empty);",
      ].join('\n'),
    }),
    ...pagamentoEntrega('d6'),
  ]),
], 'Depois do pivô não há rollback: a recusa registra o motivo e o Billing gera nova cobrança. No fim o pagamento é aprovado e a OS entregue.');

const cenarios = pasta(
  '2. Cenários de falha',
  [cenarioA, cenarioB, cenarioC, cenarioD],
  'Cada cenário abre uma OS nova e reaproveita as variáveis gravadas pela pasta 1 (tokens, `servicoId`, `insumoId`). Cada parte termina com um orçamento enviado: defina `tokenOrcamento` da OS atual antes da parte seguinte.',
);

// ---------------------------------------------------------------------------------------------
// 3. APIs por serviço
// ---------------------------------------------------------------------------------------------

const GERAR_CPF = `// CPF válido aleatório em cpfNovo (o documento é único).
const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
const dv = (n) => { const s = n.reduce((t, x, i) => t + x * (n.length + 1 - i), 0) % 11; return s < 2 ? 0 : 11 - s; };
d.push(dv(d)); d.push(dv(d));
pm.environment.set('cpfNovo', d.join(''));`;

const GERAR_PLACA = `// Placa Mercosul aleatória em placaNova (a placa é única).
const letra = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
const digito = () => Math.floor(Math.random() * 10);
pm.environment.set('placaNova', letra() + letra() + letra() + digito() + letra() + digito() + digito());`;

const health = (url) => request('Health', 'GET', `${url}/health`, { teste: status(200) });

const apiOs = pasta('OS Service', [
  pasta('Auth', [
    login('Login (funcionário)', 'admin@oficina.local', 'senhaAdmin', 'tokenAdmin'),
    request('Registrar usuário', 'POST', `${OS}/auth/registrar`, {
      token: 'tokenAdmin',
      corpo: { nome: 'Novo Atendente', email: 'atendente.{{$timestamp}}@oficina.local', senha: 'troque-esta-senha', perfil: 'ATENDENTE' },
      descricao: 'ADMINISTRADOR. Perfis de funcionário: ADMINISTRADOR, ATENDENTE, MECANICO.',
      teste: status(201),
    }),
  ]),
  pasta('Clientes', [
    request('Criar cliente', 'POST', `${OS}/clientes`, {
      token: 'tokenAtendente',
      corpo: { tipo: 'PF', documento: '{{cpfNovo}}', nome: 'Cliente Postman', email: 'cliente.{{$timestamp}}@exemplo.com', telefone: '31999990000' },
      pre: GERAR_CPF,
      teste: [status(201), "pm.environment.set('clienteNovoId', pm.response.json().id);"].join('\n'),
    }),
    request('Listar clientes', 'GET', `${OS}/clientes`, { token: 'tokenAtendente', teste: status(200) }),
    request('Cliente por id', 'GET', `${OS}/clientes/{{clienteId}}`, { token: 'tokenAtendente', teste: status(200) }),
    request('Cliente por documento', 'GET', `${OS}/clientes/documento/{{cpfCliente}}`, { token: 'tokenAtendente', teste: status(200) }),
    request('Atualizar cliente', 'PUT', `${OS}/clientes/{{clienteNovoId}}`, {
      token: 'tokenAtendente',
      corpo: { telefone: '31988887777' },
      descricao: 'Atualiza o cliente criado em "Criar cliente". Campos opcionais: nome, email, telefone.',
      teste: status(200),
    }),
  ]),
  pasta('Veículos', [
    request('Criar veículo', 'POST', `${OS}/veiculos`, {
      token: 'tokenAtendente',
      corpo: { placa: '{{placaNova}}', marca: 'Fiat', modelo: 'Argo', ano: 2022, clienteId: '{{clienteId}}' },
      pre: GERAR_PLACA,
      teste: [status(201), "pm.environment.set('veiculoNovoId', pm.response.json().id);"].join('\n'),
    }),
    request('Listar veículos do cliente', 'GET', `${OS}/veiculos?clienteId={{clienteId}}`, { token: 'tokenAtendente', teste: status(200) }),
    request('Veículo por id', 'GET', `${OS}/veiculos/{{veiculoId}}`, { token: 'tokenAtendente', teste: status(200) }),
    request('Veículo por placa', 'GET', `${OS}/veiculos/placa/BRA2E19`, { token: 'tokenAtendente', teste: status(200) }),
    request('Atualizar veículo', 'PUT', `${OS}/veiculos/{{veiculoNovoId}}`, {
      token: 'tokenAtendente',
      corpo: { modelo: 'Argo Trekking' },
      descricao: 'Atualiza o veículo criado em "Criar veículo". Campos opcionais: placa, marca, modelo, ano.',
      teste: status(200),
    }),
  ]),
  pasta('Ordens de serviço', [
    abrirOs('Abrir OS'),
    request('Listar OS por status', 'GET', `${OS}/ordens-de-servico?status=RECEBIDA`, {
      token: 'tokenAdmin',
      descricao: '`status` é opcional (StatusOS).',
      teste: status(200),
    }),
    request('OS por número', 'GET', `${OS}/ordens-de-servico/numero/{{numeroOs}}`, { token: 'tokenAdmin', teste: status(200) }),
    request('OS por id', 'GET', `${OS}/ordens-de-servico/{{osId}}`, { token: 'tokenAdmin', teste: status(200) }),
    request('Histórico da OS', 'GET', `${OS}/ordens-de-servico/{{osId}}/historico`, { token: 'tokenAdmin', teste: status(200) }),
    request('Incluir item', 'POST', `${OS}/ordens-de-servico/{{osId}}/itens`, {
      token: 'tokenMecanico',
      corpo: { tipo: 'SERVICO', referenciaId: '{{servicoId}}', quantidade: 1 },
      descricao: 'Só com a OS EM_DIAGNOSTICO e a saga em DIAGNOSTICO (senão 422). tipo: SERVICO | INSUMO.',
    }),
    request('Entregar veículo', 'POST', `${OS}/ordens-de-servico/{{osId}}/entrega`, {
      token: 'tokenAtendente',
      descricao: 'Só com a OS PAGA (senão 422).',
    }),
  ]),
  pasta('Público (cliente)', [
    request('Status da OS (cliente)', 'GET', `${OS}/publico/os/{{numeroOs}}/status`, {
      token: 'tokenCliente',
      descricao: 'Perfil CLIENTE: token da Lambda de autenticação por CPF (pasta "Auth (Lambda)"). Com token de funcionário responde 403; OS de outro cliente, 404. Local não tem Lambda.',
    }),
  ]),
  pasta('Interno', [
    request('Cliente por CPF (Lambda)', 'GET', `${OS}/internal/clientes/cpf/{{cpfCliente}}`, {
      headers: { 'X-Internal-Token': '{{internalToken}}' },
      descricao: 'Rota da Lambda de autenticação, fora do Swagger. Header `X-Internal-Token` = INTERNAL_SERVICE_TOKEN do serviço (preencha `internalToken` localmente; nunca versione o valor). No EKS o API Gateway bloqueia esta rota ao público.',
    }),
  ]),
  health(OS),
]);

const apiCatalog = pasta('Catalog Service', [
  pasta('Serviços', [
    request('Criar serviço', 'POST', `${CATALOG}/servicos`, {
      token: 'tokenAdmin',
      corpo: { nome: 'Alinhamento {{$timestamp}}', descricao: 'Alinhamento e balanceamento', valorPadrao: 90 },
      teste: [status(201), "pm.environment.set('servicoId', pm.response.json().id);"].join('\n'),
    }),
    request('Listar serviços', 'GET', `${CATALOG}/servicos`, { token: 'tokenAdmin', teste: status(200) }),
    request('Serviço por id', 'GET', `${CATALOG}/servicos/{{servicoId}}`, { token: 'tokenAdmin', teste: status(200) }),
    request('Atualizar serviço', 'PUT', `${CATALOG}/servicos/{{servicoId}}`, {
      token: 'tokenAdmin',
      corpo: { valorPadrao: 95, ativo: true },
      descricao: 'ADMINISTRADOR. Campos opcionais: nome, descricao, valorPadrao, ativo.',
      teste: status(200),
    }),
  ]),
  pasta('Insumos', [
    request('Criar insumo', 'POST', `${CATALOG}/insumos`, {
      token: 'tokenAdmin',
      corpo: { codigo: 'PEC-{{$timestamp}}', nome: 'Pastilha de freio', tipo: 'PECA', valorUnitario: 80, quantidadeEstoque: 10 },
      descricao: 'tipo: PECA | INSUMO. Código único (409 INSUMO_CODIGO_DUPLICADO).',
      teste: [status(201), "pm.environment.set('insumoId', pm.response.json().id);"].join('\n'),
    }),
    request('Listar insumos', 'GET', `${CATALOG}/insumos`, { token: 'tokenAdmin', teste: status(200) }),
    request('Insumo por id', 'GET', `${CATALOG}/insumos/{{insumoId}}`, { token: 'tokenAdmin', teste: status(200) }),
    request('Atualizar estoque', 'PATCH', `${CATALOG}/insumos/{{insumoId}}/estoque`, {
      token: 'tokenAdmin',
      corpo: { quantidade: 42 },
      descricao: 'Define a quantidade em estoque (inteiro >= 0). ADMINISTRADOR ou MECANICO.',
      teste: status(200),
    }),
  ]),
  pasta('Reservas', [
    request('Reservas da OS', 'GET', `${CATALOG}/reservas?osId={{osId}}`, { token: 'tokenAdmin', teste: status(200) }),
  ]),
  health(CATALOG),
]);

const apiExecution = pasta('Execution Service', [
  request('Fila de execução', 'GET', `${EXECUTION}/fila`, {
    token: 'tokenMecanico',
    descricao: 'Query opcional `status` (StatusExecucao: AGUARDANDO_DIAGNOSTICO, EM_DIAGNOSTICO, DIAGNOSTICO_CONCLUIDO, AGUARDANDO_REPARO, EM_REPARO, CONCLUIDA, EXECUCAO_RECUSADA).',
    teste: status(200),
  }),
  request('Ordem e histórico', 'GET', `${EXECUTION}/ordens/{{osId}}`, {
    token: 'tokenMecanico',
    descricao: 'Devolve `{ ordem, historico }`; 404 se a OS não está na oficina.',
  }),
  request('Iniciar diagnóstico', 'POST', `${EXECUTION}/{{osId}}/diagnostico/iniciar`, { token: 'tokenMecanico' }),
  request('Concluir diagnóstico', 'POST', `${EXECUTION}/{{osId}}/diagnostico/concluir`, { token: 'tokenMecanico' }),
  request('Iniciar reparo', 'POST', `${EXECUTION}/{{osId}}/reparo/iniciar`, { token: 'tokenMecanico' }),
  request('Apontamento', 'POST', `${EXECUTION}/{{osId}}/itens/{{itemId}}/apontamento`, {
    token: 'tokenMecanico',
    corpo: { acao: 'INICIAR' },
    descricao: 'acao: INICIAR | FINALIZAR.',
  }),
  request('Concluir reparo', 'POST', `${EXECUTION}/{{osId}}/reparo/concluir`, { token: 'tokenMecanico' }),
  request('Métrica: tempo médio de reparo', 'GET', `${EXECUTION}/metricas/tempo-medio`, {
    token: 'tokenAdmin',
    descricao: 'ADMINISTRADOR. `{ tempoMedioMinutos }`.',
    teste: status(200),
  }),
  request('Métrica: tempo médio por serviço', 'GET', `${EXECUTION}/metricas/tempo-medio-por-servico`, {
    token: 'tokenAdmin',
    descricao: 'ADMINISTRADOR.',
    teste: status(200),
  }),
  health(EXECUTION),
]);

const apiBilling = pasta('Billing Service', [
  request('Orçamento da OS', 'GET', `${BILLING}/orcamentos/{{osId}}`, { token: 'tokenAdmin' }),
  request('Orçamento público', 'GET', `${BILLING}/publico/orcamentos/{{numeroOs}}?token={{tokenOrcamento}}`, {
    descricao: `Rota pública.\n\n${COMO_PEGAR_TOKEN}`,
  }),
  request('Decisão do orçamento', 'POST', `${BILLING}/publico/orcamentos/{{numeroOs}}/decisao`, {
    corpo: { token: '{{tokenOrcamento}}', decisao: 'APROVADA' },
    descricao: 'Rota pública. decisao: APROVADA | REPROVADA.',
  }),
  request('Cobranças da OS', 'GET', `${BILLING}/cobrancas/{{osId}}`, { token: 'tokenAdmin' }),
  request('Simular pagamento (dev)', 'POST', `${BILLING}/dev/pagamentos/{{osId}}/simular`, {
    token: 'tokenAdmin',
    corpo: { aprovado: true },
    descricao: 'Só com PAYMENT_PROVIDER=fake. 404 sem cobrança PENDENTE. ADMINISTRADOR ou ATENDENTE.',
  }),
  request('Webhook Mercado Pago', 'POST', `${BILLING}/webhooks/mercadopago?data.id=123&type=payment`, {
    headers: { 'x-signature': 'ts=<timestamp>,v1=<assinatura>', 'x-request-id': '<request-id>' },
    corpo: { type: 'payment', data: { id: '123' } },
    descricao: 'Chamado pelo Mercado Pago. Sem `x-signature` válida a notificação é rejeitada; serve de referência do contrato.',
  }),
  health(BILLING),
]);

const apiAuth = pasta('Auth (Lambda)', [
  request('Autenticar cliente por CPF', 'POST', '{{authUrl}}', {
    corpo: { cpf: '{{cpfCliente}}' },
    descricao: 'API Gateway → Lambda `auth-cpf`. Valida o CPF, consulta o OS (`/internal/clientes/cpf/:cpf`) e devolve `access_token` (perfil CLIENTE), gravado em `tokenCliente`. Só existe no EKS: local não tem Lambda (`authUrl` vazio).',
    teste: [status(200), "pm.environment.set('tokenCliente', pm.response.json().access_token);"].join('\n'),
  }),
]);

const apis = pasta('3. APIs por serviço', [apiOs, apiCatalog, apiExecution, apiBilling, apiAuth],
  'Rotas principais de cada controller, inclusive as que o fluxo não usa. Dependem dos tokens da pasta 1 (ou do "Login" em OS Service > Auth).');

const collection = {
  info: {
    name: 'Oficina Fase 4 - Saga orquestrada',
    description: 'Oficina mecânica em microsserviços (OS, Catalog, Execution, Billing e Lambda de autenticação) com saga orquestrada pelo OS sobre SNS/SQS FIFO. Fonte: `tc-fase4-os/postman`. Veja `postman/README.md`.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: [fluxo, cenarios, apis],
};

const variavel = (key, value, descricao) => ({ key, value, type: key.startsWith('senha') || key.startsWith('token') || key === 'internalToken' ? 'secret' : 'default', enabled: true, ...(descricao && { description: descricao }) });

const GRAVADAS = ['tokenAdmin', 'tokenAtendente', 'tokenMecanico', 'tokenCliente', 'tokenOrcamento', 'servicoId', 'insumoId', 'insumoSemEstoqueId', 'osId', 'numeroOs', 'osIdPrimeira', 'itemId', 'cobrancaRecusadaId'];

function ambiente(nome, valores) {
  return {
    name: nome,
    values: [
      ...valores,
      variavel('clienteId', '0c000000-0000-4000-8000-000000000001', 'Cliente do seed'),
      variavel('veiculoId', '0d000000-0000-4000-8000-000000000001', 'Veículo do seed'),
      variavel('cpfCliente', '52998224725', 'CPF do cliente do seed'),
      ...GRAVADAS.map((key) => variavel(key, '', key === 'tokenOrcamento' ? 'Copie do log do Billing (veja postman/README.md)' : 'Gravada pelos scripts')),
    ],
    _postman_variable_scope: 'environment',
  };
}

const local = ambiente('Oficina - local (compose)', [
  variavel('osUrl', 'http://localhost:3001/api/os'),
  variavel('catalogUrl', 'http://localhost:3002/api/catalog'),
  variavel('executionUrl', 'http://localhost:3003/api/execution'),
  variavel('billingUrl', 'http://localhost:3004/api/billing'),
  variavel('authUrl', '', 'Local não tem Lambda de autenticação: a pasta "Auth (Lambda)" só roda no EKS.'),
  variavel('senhaAdmin', 'admin123', 'Senha local de desenvolvimento do seed'),
  variavel('senhaPadrao', 'senha123', 'Senha local de desenvolvimento do seed (atendente e mecânico)'),
  variavel('internalToken', '', 'INTERNAL_SERVICE_TOKEN do OS; preencha só na sua cópia, nunca versione'),
]);

const eks = ambiente('Oficina - EKS (API Gateway)', [
  variavel('osUrl', 'https://<api-gateway>/api/os', 'public_base_url da infra + /api/os'),
  variavel('catalogUrl', 'https://<api-gateway>/api/catalog'),
  variavel('executionUrl', 'https://<api-gateway>/api/execution'),
  variavel('billingUrl', 'https://<api-gateway>/api/billing'),
  variavel('authUrl', 'https://<api-gateway>/auth'),
  variavel('senhaAdmin', '', 'Vem do Secrets Manager: oficina-fase4/os/SEED_SENHA_ADMIN'),
  variavel('senhaPadrao', '', 'Vem do Secrets Manager: oficina-fase4/os/SEED_SENHA_PADRAO'),
  variavel('internalToken', '', 'Vem do Secrets Manager; o API Gateway bloqueia /internal ao público'),
]);

const salvar = (arquivo, dados) => writeFileSync(join(destino, arquivo), `${JSON.stringify(dados, null, 2)}\n`);
salvar('oficina-fase4.postman_collection.json', collection);
salvar('local.postman_environment.json', local);
salvar('eks.postman_environment.json', eks);
console.log('ok');
