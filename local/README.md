# Fluxo local completo (4 serviços)

Compose com OS, Catalog, Execution e Billing, um Postgres e um LocalStack com toda a topologia da saga. Serve para
rodar o fluxo de ponta a ponta numa máquina, sem conta AWS (credenciais fictícias `test`/`test`).

## Pré-requisitos

- Docker com Compose v2.
- Node 20+ (só para o `smoke.mjs`; sem dependências).
- Os 4 repositórios clonados lado a lado. As imagens são construídas das pastas irmãs:

```bash
mkdir fase_04 && cd fase_04
git clone git@github.com:Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-os.git
git clone git@github.com:Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-catalog.git
git clone git@github.com:Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-execution.git
git clone git@github.com:Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-billing.git
```

## Subir

```bash
cd tc-fase4-os/local
cp .env.example .env          # JWT_SECRET e INTERNAL_SERVICE_TOKEN (mín. 16 caracteres), só valores locais
docker compose up -d --build --wait
```

Antes, derrube os composes isolados de cada repositório (`docker compose down` na raiz de cada um): todos publicam o
LocalStack na porta 4566. O compose falha logo no início se faltar alguma variável do `.env`.

O que sobe:

| Serviço | Porta | Observação |
|---|---|---|
| `os` | 3001 | `/api/os` (Swagger em `/api/os/docs`) |
| `catalog` | 3002 | `/api/catalog` |
| `execution` | 3003 | `/api/execution`, com `EXECUTION_MAX_CONCURRENT=1` (uma vaga, cenário c) |
| `billing` | 3004 | `/api/billing`, com `PAYMENT_PROVIDER=fake` |
| `postgres` | 5440 | bancos e usuários `catalog`, `billing` e `os` (senha igual ao nome) |
| `localstack` | 4566 | SQS, SNS e DynamoDB, criados por `localstack/init.sh` |
| `migrate-*` | — | execução única: `migrate-catalog` e `migrate-billing` no estágio `builder`; `migrate-os` na imagem final, como o initContainer do EKS (seed compilado) |

- **`NODE_ENV=production` nos serviços:** com `development`, o logger usa o transport `pino-pretty`. Ele é
  devDependency e não existe na imagem de produção, então o serviço não sobe. Por isso os logs saem em JSON. O
  `migrate-os` roda com `development`, porque é isso que libera as senhas padrão do seed.
- **Seed do OS:** usuários `admin@oficina.local`/`admin123`, `atendente@oficina.local`/`senha123` e
  `mecanico@oficina.local`/`senha123`, mais o cliente `0c000000-0000-4000-8000-000000000001` e o veículo
  `0d000000-0000-4000-8000-000000000001`. Ver o README principal.
- **Seed do Catalog:** 3 serviços (`a1000000-0000-4000-8000-00000000000{1,2,3}`: troca de óleo, alinhamento, freios)
  e 4 insumos (`b2000000-0000-4000-8000-00000000000{1..4}`). O `PAS-001` (`...0003`, pastilha de freio) tem estoque 0
  de propósito, para o cenário (b).
- **`localstack/init.sh`:** cria as 4 filas de entrada FIFO, cada uma com DLQ (`maxReceiveCount=3`), e os tópicos de
  eventos de Catalog, Billing e Execution. Cada tópico tem duas assinaturas com `RawMessageDelivery=true`: a
  `oficina-os-inbox.fifo`, que faz a saga andar, e uma fila de inspeção `*-events-spy.fifo`. Também cria a tabela
  DynamoDB `oficina-execution`.

## Smoke automatizado

```bash
node local/smoke.mjs todos     # ou: feliz | a | b | c | d
```

| Cenário | O que prova |
|---|---|
| `feliz` | abertura → diagnóstico → orçamento aprovado → reparo → pagamento → ENTREGUE; estoque baixado (98, reserva 0) |
| `a` | orçamento reprovado pelo link público → REPROVADA |
| `b` | insumo sem estoque → reserva falha → orçamento cancelado → CANCELADA |
| `c` | vaga única ocupada → segunda OS recusada no pivô → reservas liberadas → CANCELADA; a primeira segue até ENTREGUE |
| `d` | pagamento recusado → nova cobrança PENDENTE → pagamento aprovado → ENTREGUE |

No fim, o smoke falha se houver mensagem em qualquer DLQ. As URLs base vêm de `OS_URL`, `CATALOG_URL`,
`EXECUTION_URL` e `BILLING_URL`, para reaproveitar no EKS. O prazo de cada espera é `SMOKE_TIMEOUT_MS` (padrão
60000). O token do orçamento é lido do log do container `billing` (`docker compose logs`). Para rodar contra o EKS,
veja [Rodando o smoke contra o EKS](#rodando-o-smoke-contra-o-eks).

## Rodando o smoke contra o EKS

O mesmo `smoke.mjs` roda contra o cluster, com o Billing em `PAYMENT_PROVIDER=fake` (a rota
`/api/billing/dev/pagamentos/:osId/simular` responde 404 com `mercadopago`). Pré-requisitos: os 4 serviços implantados,
`kubectl` apontando para o cluster (`aws eks update-kubeconfig --name oficina-fase4 --region us-east-1`) e a AWS CLI
com permissão de leitura nas DLQs e nos segredos do seed.

| Variável | Local (padrão) | EKS |
|---|---|---|
| `OS_URL`, `CATALOG_URL`, `EXECUTION_URL`, `BILLING_URL` | `http://localhost:300{1..4}/api/<svc>` | `<public_base_url>/api/<svc>` (output da infra) |
| `SMOKE_TOKEN_SOURCE` | `docker` (`docker compose logs billing`) | `kubectl` (`kubectl logs -n billing deploy/billing --tail=-1`) |
| `SMOKE_DLQ_CHECK` | `docker` (`awslocal` no LocalStack) | `aws` (`aws sqs get-queue-attributes`), ou `off` para não checar |
| `SMOKE_DLQ_URLS` | — | URLs das 4 DLQs, separadas por vírgula (output `dlq_url` de cada Terraform) |
| `SMOKE_SENHA_ADMIN` | `admin123` | segredo `oficina-fase4/os/SEED_SENHA_ADMIN` |
| `SMOKE_SENHA_PADRAO` | `senha123` | segredo `oficina-fase4/os/SEED_SENHA_PADRAO` (atendente e mecânico) |
| `SMOKE_TIMEOUT_MS` | `60000` | aumente se a fila estiver lenta |

```bash
BASE=$(terraform -chdir=../tc-fase4-infra output -raw public_base_url)
dlq() { terraform -chdir="../tc-fase4-$1/terraform" output -raw dlq_url; }
segredo() { aws secretsmanager get-secret-value --secret-id "oficina-fase4/os/$1" --query SecretString --output text; }

export OS_URL=$BASE/api/os CATALOG_URL=$BASE/api/catalog EXECUTION_URL=$BASE/api/execution BILLING_URL=$BASE/api/billing
export SMOKE_TOKEN_SOURCE=kubectl SMOKE_DLQ_CHECK=aws
export SMOKE_DLQ_URLS="$(dlq os),$(dlq catalog),$(dlq billing),$(dlq execution)"
export SMOKE_SENHA_ADMIN="$(segredo SEED_SENHA_ADMIN)" SMOKE_SENHA_PADRAO="$(segredo SEED_SENHA_PADRAO)"

for cenario in feliz a b d; do node local/smoke.mjs "$cenario" || break; done
```

Rode a partir de `tc-fase4-os`, com os repositórios lado a lado e o `terraform init` feito em cada um. As senhas
ficam só no ambiente do terminal: não grave em arquivo. O cenário `c` supõe uma vaga só
(`EXECUTION_MAX_CONCURRENT=1`); no EKS o Execution sobe com `3`, a segunda OS é aceita e o `c` falha. Para rodá-lo lá,
baixe a variável para `1` no ConfigMap `execution-config` e reinicie o Deployment do Execution antes.

## Roteiro manual

`local/oficina-fase4.http` (extensão REST Client do VS Code) segue o mesmo fluxo em blocos numerados e tem seções
curtas para os cenários (a) a (d). Comportamentos assíncronos que o roteiro considera:

- `GET /api/execution/ordens/:osId` responde 404 até o Execution consumir o pedido de diagnóstico. Depois devolve
  `{ ordem, historico }`.
- Depois da aprovação e do aceite da execução, a OS continua `APROVADA`, com `etapaSaga=EXECUCAO`. Ela só vira
  `EM_EXECUCAO` com o `reparo/iniciar`.
- A cobrança é gerada de forma assíncrona: `POST /api/billing/dev/pagamentos/:osId/simular` responde 404 enquanto não
  houver cobrança `PENDENTE`.
- Com o gateway fake, o `initPoint` é o mesmo em todas as cobranças da OS. Para distinguir as cobranças, use o `id`
  em `GET /api/billing/cobrancas/:osId`.

## Onde olhar

- **E-mail simulado (link e token do orçamento):** `docker compose logs billing | grep token=`.
- **Eventos publicados:**
  `docker compose exec localstack awslocal sqs receive-message --region us-east-1 --queue-url http://localhost:4566/000000000000/oficina-catalog-events-spy.fifo --max-number-of-messages 10`
  (troque `catalog` por `billing` ou `execution`).
- **DLQs:**
  `docker compose exec localstack awslocal sqs get-queue-attributes --region us-east-1 --queue-url http://localhost:4566/000000000000/oficina-os-inbox-dlq.fifo --attribute-names ApproximateNumberOfMessages`
  (troque `os` pelos outros serviços).

No Git Bash, use `exec -T` se o terminal reclamar de TTY.

## Resetar

```bash
docker compose down -v
```

Apaga os bancos, as filas e a tabela. É necessário se um smoke abortar no meio com a vaga única ocupada: a OS fica
`APROVADA`/`EM_EXECUCAO` sem `reparo/concluir`, e as próximas aprovações caem no cenário (c).

## Diferenças para o EKS

- 3 RDS (um por serviço), não um Postgres com 3 bancos.
- Mercado Pago real (`PAYMENT_PROVIDER=mercadopago`, credenciais no Secrets Manager), não o gateway fake.
- Topologia SNS/SQS e tabela DynamoDB criadas pelo Terraform de cada serviço; as assinaturas dos tópicos na fila do
  OS, pelo Terraform do OS. Não há o `init.sh` nem as filas `*-events-spy.fifo`.
- Migrações pelo initContainer `prisma-migrate` e seed pelo CD (`kubectl exec`), não pelos serviços `migrate-*`.
