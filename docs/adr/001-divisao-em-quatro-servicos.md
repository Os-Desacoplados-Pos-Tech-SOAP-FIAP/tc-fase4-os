# ADR 001 — Divisão em quatro serviços de domínio

- **Status:** aceita
- **Data:** 2026-10-12 (decisão) · registrada em 2026-10-30
- **Serviços afetados:** OS, Catalog, Billing, Execution, Auth (Lambda)

## Contexto

O enunciado da Fase 4 pede no mínimo 3 microsserviços, cada um com repositório, infraestrutura e banco próprios, e
proíbe um serviço de acessar o banco de outro. O monolito da Fase 3 juntava atendimento (cliente, veículo, OS),
catálogo e estoque, orçamento e execução. A saga precisa de etapas distribuídas que possam falhar e ser desfeitas de
forma independente: reserva de estoque, orçamento e capacidade da oficina.

## Decisão

Quatro serviços de domínio, cada um no próprio repositório, com `terraform/` e banco próprios:

| Serviço | Responsabilidade | Banco |
|---|---|---|
| `tc-fase4-os` | atendimento (usuários, cliente, veículo, OS, histórico) e **orquestrador da saga** | Postgres |
| `tc-fase4-catalog` | serviços, insumos, estoque e reservas | Postgres |
| `tc-fase4-billing` | orçamento, aprovação pelo cliente, cobrança e pagamento (Mercado Pago) | Postgres |
| `tc-fase4-execution` | fila da oficina, diagnóstico, reparo, capacidade e métricas de tempo | DynamoDB |

- O `tc-fase4-auth` não é microsserviço de domínio: são duas Lambdas (login do cliente por CPF e authorizer do API
  Gateway), sem banco. O dono dos dados do cliente é o OS ([README do auth](https://github.com/Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-auth/blob/main/README.md)).
- Chamadas síncronas são só duas:
  - OS → Catalog para precificar item (`GET /servicos/:id`, `GET /insumos/:id`), em
    `src/infrastructure/catalogo/catalogo-http.ts`. Nome e preço viram snapshot no `ItemOrcamento`
    (`src/domain/ordem-de-servico/entities/ItemOrcamento.ts`).
  - Lambda → OS em `GET /internal/clientes/cpf/:cpf` (`src/modules/interno/interno.controller.ts`).
- Todo o resto da saga é assíncrono (ver [ADR 004](004-sns-sqs-fifo.md)).

Detalhe de cada serviço: [README do OS](../../README.md),
[Catalog](https://github.com/Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-catalog/blob/main/README.md),
[Billing](https://github.com/Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-billing/blob/main/README.md),
[Execution](https://github.com/Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-execution/blob/main/README.md).

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| 3 serviços, com catálogo e estoque dentro do OS | A reserva de estoque deixaria de ser uma etapa distribuída com compensação própria (`liberar-reservas`), e o OS misturaria atendimento com estoque. |
| 5º serviço só para Cliente/Veículo | Mais um RDS e mais uma chamada síncrona na abertura da OS, sem regra de negócio que justifique a fronteira. |
| Auth como microsserviço no EKS | A Fase 3 já tinha a Lambda de CPF; mantê-la serverless evita mais um Deployment e um banco. |

## Consequências

- **Positivas:**
  - Cada etapa da saga tem um dono claro: reserva (Catalog), orçamento e pagamento (Billing), capacidade, que é o
    pivô (Execution).
  - Cada serviço tem CI/CD, Terraform e banco independentes; um deploy não afeta os outros.
  - Atende "≥ 3 serviços" e "≥ 1 SQL e ≥ 1 NoSQL" ([ADR 006](006-bancos-por-servico.md)).
- **Negativas / limitações aceitas:**
  - A inclusão de item depende do Catalog no ar: fora do ar ou com timeout, a rota responde 503
    ([README do OS, Decisões](../../README.md#decisões)).
  - O preço é um snapshot: mudar o preço no Catalog não altera OS já precificadas.
  - A Lambda depende do OS para autenticar o cliente (503 `OS_INDISPONIVEL` se ele não responder).

## Referências

- [README do OS — Arquitetura geral](../../README.md#arquitetura-geral)
- [README do OS — Decisões](../../README.md#decisões)
- `src/infrastructure/catalogo/catalogo-http.ts`, `src/modules/interno/interno.controller.ts`
- [ADR 002](002-saga-orquestrada-com-pivo.md), [ADR 006](006-bancos-por-servico.md)
