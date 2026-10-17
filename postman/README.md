# Collection Postman

Collection do fluxo da saga, dos cenários de falha e das APIs dos quatro serviços e da Lambda de autenticação.
Ela segue a mesma ordem do [`local/oficina-fase4.http`](../local/oficina-fase4.http) e do
[`local/smoke.mjs`](../local/smoke.mjs).

| Arquivo | Conteúdo |
|---|---|
| `oficina-fase4.postman_collection.json` | Collection (schema v2.1) |
| `local.postman_environment.json` | Compose local (`local/`), portas 3001 a 3004 |
| `eks.postman_environment.json` | EKS atrás do API Gateway (placeholders) |
| `sincronizar-docs.sh` | Copia os JSON para `../tc-fase4-docs/postman/` |

## Importar

No Postman: **Import** → selecione os três arquivos `.json` desta pasta. Escolha o ambiente no seletor do canto
superior direito.

## Ambientes

| Variável | Local | EKS |
|---|---|---|
| `osUrl`, `catalogUrl`, `executionUrl`, `billingUrl` | `http://localhost:300{1..4}/api/<svc>` | `https://<api-gateway>/api/<svc>` (`public_base_url` da infra) |
| `authUrl` | vazio: local não tem Lambda | `https://<api-gateway>/auth` |
| `senhaAdmin`, `senhaPadrao` | `admin123` / `senha123` (padrões do seed) | vazias: vêm do Secrets Manager (`oficina-fase4/os/SEED_SENHA_ADMIN` e `SEED_SENHA_PADRAO`) |
| `internalToken` | vazio | vazio |
| `clienteId`, `veiculoId`, `cpfCliente` | cliente e veículo do seed | idem (o seed roda no deploy) |

`internalToken` é o `INTERNAL_SERVICE_TOKEN` do OS, usado só na rota `/internal`. Preencha apenas na sua cópia do
ambiente e nunca versione o valor. As demais variáveis (`tokenAdmin`, `tokenAtendente`, `tokenMecanico`,
`servicoId`, `insumoId`, `osId`, `numeroOs`, `itemId` etc.) são gravadas pelos scripts.

## Ordem

1. **`1. Fluxo da saga`**
   - **Parte 1:** logins, criação de serviço e insumo, abertura da OS, diagnóstico e orçamento enviado.
   - **Parte 2:** aprovação, pivô, reparo, cobrança, pagamento, entrega e baixa do estoque.
2. **`2. Cenários de falha`**: (a) reprovação, (b) sem estoque, (c) fila de execução cheia e (d) pagamento recusado.
   Cada um abre uma OS nova e reaproveita os tokens, o `servicoId` e o `insumoId` gravados pela pasta 1.
   - O (c) exige a vaga do Execution livre (`EXECUTION_MAX_CONCURRENT=1`): nenhuma outra OS em `AGUARDANDO_REPARO`
     ou `EM_REPARO`. O primeiro passo confere isso.
   - No fim do (c), a primeira OS é concluída e entregue, o que libera a vaga.
3. **`3. APIs por serviço`**: rotas avulsas de cada controller, inclusive as que o fluxo não usa (CRUD de
   clientes e veículos, métricas do Execution, webhook do Mercado Pago). Os resultados dependem do estado da OS em
   `osId`.

Os passos assíncronos (SQS FIFO) têm **retentativa automática** no pre-request: até 30 consultas, com 1 s entre
elas, até a OS ou a cobrança chegar ao estado esperado. Por exemplo, o Execution responde 404 até consumir o
`enfileirar-diagnostico`, e o `simular` responde 404 até a cobrança existir. Depois do aceite, a OS fica `APROVADA`
com `etapaSaga=EXECUCAO` e só vira `EM_EXECUCAO` com o `reparo/iniciar`.

## Token do orçamento

O token de aprovação só aparece no e-mail simulado, que é um log do Billing com o link
`.../publico/orcamentos/<numero>?token=<token>`. Cada parte que termina com um orçamento enviado para o runner
quando `tokenOrcamento` está vazio. Depois de pegar o token, defina `tokenOrcamento` no ambiente e rode a parte
seguinte. O `numeroOs` da OS atual está no ambiente.

```bash
# local (na raiz do tc-fase4-os)
docker compose -f local/docker-compose.yml logs billing | grep "orcamentos/<numeroOs>?token="

# EKS
kubectl logs -n billing deploy/billing --tail=-1 | grep "orcamentos/<numeroOs>?token="
```

Abrir uma OS limpa o `tokenOrcamento` da anterior.

## Newman

Com o compose local no ar ([`local/README.md`](../local/README.md)), rode na raiz do repositório:

```bash
COLL=postman/oficina-fase4.postman_collection.json

# Parte 1: até o orçamento enviado; exporta o ambiente com tokens, osId e numeroOs
npx --yes newman@6 run $COLL -e postman/local.postman_environment.json \
  --folder "Parte 1 - até o orçamento enviado" --export-environment /tmp/oficina-env.json

# Token do orçamento da OS aberta (sem imprimir)
NUM=$(node -e "console.log(require('/tmp/oficina-env.json').values.find(v => v.key === 'numeroOs').value)")
TOKEN=$(docker compose -f local/docker-compose.yml logs billing | grep -o "orcamentos/$NUM?token=[A-Za-z0-9_-]*" | tail -1 | sed 's/.*token=//')

# Parte 2: aprovação até a entrega
npx --yes newman@6 run $COLL -e /tmp/oficina-env.json --env-var "tokenOrcamento=$TOKEN" \
  --folder "Parte 2 - aprovação até a entrega" --export-environment /tmp/oficina-env.json
```

Os cenários seguem o mesmo padrão, com as subpastas `a - Parte 1`, `a - Parte 2` e assim por diante. O (c) tem
três partes, uma para cada orçamento. Rodar `--folder "1. Fluxo da saga"` inteiro executa a Parte 1 e para no
pedido do token.

No EKS, use `-e postman/eks.postman_environment.json` com as URLs e as senhas preenchidas por `--env-var`
(`senhaAdmin`, `senhaPadrao`) e pegue o token com `kubectl logs`.

## Cópia no repositório de docs

`./postman/sincronizar-docs.sh` copia os JSON para `../tc-fase4-docs/postman/` com um README que aponta para esta
pasta como fonte. A fonte de verdade é esta pasta: edite aqui e sincronize.
