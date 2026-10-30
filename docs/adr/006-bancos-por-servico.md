# ADR 006 — Um banco por serviço: Postgres e DynamoDB

- **Status:** aceita
- **Data:** 2026-10-12 (decisão) · registrada em 2026-10-30
- **Serviços afetados:** OS, Catalog, Billing, Execution

## Contexto

O enunciado exige banco próprio por serviço, pelo menos um relacional e um não relacional, e proíbe um serviço de
acessar o banco de outro. A outbox ([ADR 005](005-outbox-e-idempotencia.md)) precisa gravar estado e mensagem de forma
atômica. A reserva de estoque é tudo ou nada sobre vários insumos; a fila da oficina e a capacidade são acesso por
chave com contador.

## Decisão

- **PostgreSQL 16 para OS, Catalog e Billing:** um RDS `db.t4g.micro` (20 GB gp3, privado) por serviço, em
  `terraform/rds.tf` de cada um (`oficina-fase4-os`, `oficina-fase4-catalog`, `oficina-fase4-billing`). Acesso por
  Prisma 5 (`prisma/schema.prisma`, migrações em `prisma/migrations/`).
  - Dados relacionais (cliente → veículo → OS → itens → histórico; orçamento → cobrança → pagamento) e transações ACID
    para a outbox e a idempotência na mesma transação do efeito.
  - **Reserva tudo ou nada no Catalog:** os insumos são travados com `SELECT … FOR UPDATE` em ordem de `id` (evita
    deadlock) e a reserva só é criada se todos têm saldo (`src/infrastructure/repositories/PrismaInsumoRepository.ts`
    no Catalog). Índice único parcial garante no máximo uma reserva `ATIVA` por OS
    (`prisma/migrations/20261012181000_reserva_ativa_unica_por_os/migration.sql`).
  - No Billing, versão otimista em orçamento e cobrança e no máximo uma cobrança `PENDENTE` por OS (índice único
    parcial, [README do Billing](https://github.com/Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-billing/blob/main/README.md#papel-na-saga)).
- **DynamoDB para o Execution:** tabela única `oficina-execution` (sob demanda, PK/SK, GSI1 da fila por status, TTL em
  `expiraEm`), em `terraform/dynamodb.tf`; desenho de chaves em `src/infrastructure/dynamo/chaves.ts`.
  - Capacidade da oficina com contador condicional: `ADD ativos` com `ativos < EXECUTION_MAX_CONCURRENT` no mesmo
    `TransactWriteItems` do aceite (`src/infrastructure/repositories/DynamoCapacidade.ts`).
  - Fila em ordem de chegada pelo GSI1 (`FILA#<status>` / `<enfileiradoEm>#<osId>`); tempo médio com contadores
    `ADD` (O(1)).
- **Nenhum serviço acessa o banco de outro:**
  - a `DATABASE_URL` de cada serviço fica no segredo `oficina-fase4/<serviço>/DATABASE_URL` e só entra no Secret do
    próprio namespace pelo CD;
  - só a role IRSA do Execution tem permissão no DynamoDB, restrita à tabela e aos índices dela (`terraform/irsa.tf`
    do Execution);
  - dados de outro serviço chegam por REST ou por mensagem ([ADR 001](001-divisao-em-quatro-servicos.md)).

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Um Postgres compartilhado com um schema por serviço | Viola "banco próprio por serviço" do enunciado e facilita join entre domínios. |
| DynamoDB em todos os serviços | Perde a transação relacional da reserva multi-insumo e do orçamento; a outbox viraria `TransactWriteItems` em todos, com limite de 100 itens. |
| Postgres também no Execution | Não atenderia "≥ 1 NoSQL"; a fila e o contador são acesso por chave, bom encaixe para DynamoDB. |
| MongoDB/DocumentDB | Mais um cluster pago e operado; DynamoDB é gerenciado e cobrado por uso. |

## Consequências

- **Positivas:**
  - Cada serviço evolui o próprio schema e faz deploy sem coordenar com os outros.
  - A capacidade do pivô é atômica mesmo com várias réplicas do Execution.
- **Negativas / limitações aceitas:**
  - Três RDS no ar pesam no custo diário ([ADR 008](008-infra-compartilhada-e-propria.md)).
  - O DynamoDB não tem transação interativa: no Execution, as leituras acontecem antes do commit e a consistência vem
    das condições do `TransactWriteItems` e da versão otimista
    ([README do Execution — Unidade de trabalho](https://github.com/Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-execution/blob/main/README.md#unidade-de-trabalho-e-concorrência)).
  - O SG de cada RDS libera a porta 5432 para o SG dos nodes do EKS, não por namespace; o isolamento entre serviços
    vem da credencial, não da rede.
  - Configuração de estudo: sem backup, sem snapshot final, sem PITR e sem proteção contra exclusão.

## Referências

- `terraform/rds.tf` (OS, Catalog, Billing), `terraform/dynamodb.tf` e `terraform/irsa.tf` (Execution)
- [README do Catalog — Reserva de estoque](https://github.com/Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-catalog/blob/main/README.md#reserva-de-estoque)
- [README do Execution — Modelo da tabela](https://github.com/Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-execution/blob/main/README.md#modelo-da-tabela)
