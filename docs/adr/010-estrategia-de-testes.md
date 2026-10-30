# ADR 010 — Estratégia de testes e gates de qualidade

- **Status:** aceita
- **Data:** 2026-10-12 (decisão) · registrada em 2026-10-30
- **Serviços afetados:** OS, Catalog, Billing, Execution, Auth

## Contexto

O enunciado exige testes unitários em todos os serviços, pelo menos um fluxo completo em BDD, cobertura mínima de 80%
por serviço e validação de qualidade (SonarQube ou similar) no CI, com a `main` protegida por PR e checagens
automáticas. A saga atravessa quatro serviços, e o fluxo completo depende de mensageria, bancos diferentes e Mercado
Pago.

## Decisão

Pirâmide por camada, a mesma nos quatro serviços NestJS (scripts `test`, `test:int`, `test:e2e`, `test:cov` no
`package.json` de cada um):

| Camada | Como | Onde (OS) |
|---|---|---|
| Domínio, casos de uso, decisões do orquestrador | unitário com fakes em memória | `src/**/*.spec.ts`, fakes em `test/fakes/` |
| Repositórios, transação, trava, outbox | integração com Postgres real (service container no CI); no Execution, DynamoDB real no LocalStack | `test/integration/` |
| Adaptadores AWS (SNS/SQS, métricas de fila) | `aws-sdk-client-mock` | `src/infrastructure/messaging/sns-sqs.transport.spec.ts`, `src/infrastructure/messaging/sqs-inbox.consumer.spec.ts` |
| HTTP | e2e com o app Nest real e o banco de teste | `test/e2e/` |
| Fluxo completo da saga | BDD jest-cucumber, `# language: pt` | `test/bdd/features/saga-da-os.feature`, `test/bdd/saga-da-os.steps.ts` |

- **BDD no OS, 8 cenários:** fluxo feliz até a entrega, reprovação, expiração, diagnóstico sem serviço, falta de
  estoque, fila de execução cheia, pagamento recusado e mensagem entregue duas vezes. Sobe o app Nest real com o
  Postgres de teste; os outros serviços são simulados (eventos despachados no `MessageHandlerRegistry`, comandos lidos
  da tabela `Outbox`, Catalog fake em memória). Ver [README do OS — Testes e qualidade](../../README.md#testes-e-qualidade).
- **Smoke ponta a ponta** com os quatro serviços reais: `local/smoke.mjs` (`feliz`, `a`, `b`, `c`, `d`), contra o
  compose local ou contra o EKS, e falha se sobrar mensagem em qualquer DLQ
  ([local/README.md](../../local/README.md#smoke-automatizado)).
- **Gates:**
  - `coverageThreshold` global de 80% em linhas, branches, funções e statements no `jest.config.ts` de cada serviço
    (`jest.config.js` no auth);
  - SonarCloud no CI com `sonar.qualitygate.wait=true` (`sonar-project.properties`);
  - ruleset `protect-main` com checks obrigatórios `ci` e `SonarCloud Code Analysis` nos cinco repositórios de código
    (no `tc-fase4-infra`, só `ci`).

Cobertura e quality gate no SonarCloud em 30/10/2026:

| Projeto | Quality gate | Cobertura | Bugs | Vulnerabilidades |
|---|---|---|---|---|
| `tc-fase4-os` | OK | 97,2% | 0 | 0 |
| `tc-fase4-catalog` | OK | 95,9% | 0 | 0 |
| `tc-fase4-billing` | OK | 98,2% | 0 | 0 |
| `tc-fase4-execution` | OK | 96,6% | 0 | 0 |
| `tc-fase4-auth` | OK | 96,2% | 0 | 0 |

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| BDD ponta a ponta com os quatro serviços e LocalStack no CI | CI de um repositório dependeria das imagens dos outros três; lento e frágil. O smoke cobre esse caminho fora do CI. |
| Contract testing (Pact) | Mais uma ferramenta e um broker; o catálogo de eventos e o tolerant reader ([ADR 007](007-contratos-tolerant-reader.md)) bastam para o escopo. |
| Integração com banco em memória (SQLite, mock do Prisma) | Não exercita advisory lock, `FOR UPDATE`, índices parciais nem as transações da outbox. |

## Consequências

- **Positivas:**
  - As regras da saga são testadas sem rede; o BDD prova a saga inteira contra o banco real do OS.
  - Nenhum merge na `main` sem testes, cobertura e quality gate verdes.
- **Negativas / limitações aceitas:**
  - O BDD não exercita SNS/SQS nem os outros serviços; esse caminho só é provado pelo smoke, rodado à mão.
  - Mercado Pago real não entra em teste automatizado: CI e smoke usam `PAYMENT_PROVIDER=fake`.
  - O auth simula o Secrets Manager com `jest.mock`, não com `aws-sdk-client-mock` (`test/secrets.spec.ts` no auth).

## Referências

- [README do OS — Testes e qualidade](../../README.md#testes-e-qualidade), [CI/CD](../../README.md#cicd)
- `jest.config.ts`, `sonar-project.properties`, `.github/workflows/ci.yml`
- Painel do SonarCloud: [README do OS — Qualidade e cobertura](../../README.md#qualidade-e-cobertura) (e a seção
  equivalente no README de cada serviço)
