# ADR 002 — Saga orquestrada com transação pivô

- **Status:** aceita
- **Data:** 2026-10-12 (decisão) · registrada em 2026-10-30
- **Serviços afetados:** OS (orquestrador), Catalog, Billing, Execution

## Contexto

O enunciado exige Saga Pattern com rollback e compensação em caso de falha, orquestrado ou coreografado, com a escolha
justificada. A saga da OS tem uma etapa sem volta (a oficina aceitar a execução), compensações que precisam de ordem
(liberar estoque antes de cancelar o orçamento) e regras que dependem da etapa em que a OS está.

## Decisão

- **Orquestração** num único process manager, o `OrquestradorSaga` do OS
  (`src/application/saga/orquestrador-saga.ts`). Os outros serviços só recebem comandos na própria fila e publicam os
  próprios eventos; nenhum assina o tópico de outro.
- **Uma transação por evento:** idempotência (`ProcessedMessage`) → trava da OS (`pg_advisory_xact_lock`, em
  `src/infrastructure/repositories/PrismaTravaPorOs.ts`) → leitura da OS e da saga → decisão → gravação da OS, do
  histórico, da `SagaInstance` e dos comandos na outbox.
- **Estado da saga** em `SagaInstance` (`src/domain/saga/SagaInstance.ts`): etapa, `codigoCompensacao` e
  `motivoCompensacao`. As transições válidas ficam numa tabela no próprio arquivo.
- **Pivô:** `execution.enfileirar-execucao.v1` respondido com `execution.execucao-aceita.v1` (a capacidade da oficina,
  [Execution](https://github.com/Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-execution/blob/main/README.md#pivô-da-saga-enfileirar-execucao)).
  As etapas `EXECUCAO`, `COBRANCA` e `CONCLUIDA` são pós-pivô.
- **Antes do pivô, compensação sequencial em ordem inversa**, um passo por vez:
  - falta de estoque: `cancelar-orcamento` → `orcamento-cancelado` → OS `CANCELADA`;
  - fila cheia: `liberar-reservas` → `reservas-liberadas` → `cancelar-orcamento` → `orcamento-cancelado` → OS
    `CANCELADA`.

  A saga passa por `COMPENSANDO_RESERVAS` e/ou `COMPENSANDO_ORCAMENTO` até `COMPENSADA`. A OS só vira `CANCELADA` com
  a última confirmação; até lá continua `APROVADA`.
- **Depois do pivô, só retentativa:** `execucao-recusada` tardia é ignorada; pagamento recusado gera nova cobrança
  ([ADR 003](003-pagamento-no-final.md)).
- **Eventos fora de etapa são ignorados** (só o `messageId` é registrado, com log `warn`). Exceção: `insumos-reservados`
  que chega com a saga já `ENCERRADA` ou `COMPENSADA` gera `liberar-reservas`, para não prender estoque.
- O texto enviado ao cliente na compensação sai do código da falha (`src/application/saga/motivo-compensacao.ts`).

A tabela completa de reações por evento está no [README do OS — Reação a cada evento](../../README.md#reação-a-cada-evento),
e os diagramas de estado da OS e da saga em [Saga](../../README.md#saga).

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Coreografia (cada serviço reage aos eventos dos outros) | Cada serviço precisaria saber se o pivô já passou e em que ordem desfazer; a lógica da saga ficaria espalhada por três repositórios e não haveria visão central do estado de uma OS. |
| Orquestrador como serviço separado (ou Step Functions) | Mais um deploy e mais uma dependência; o OS já é dono da OS e do histórico que a saga atualiza. |
| Compensações em paralelo | A OS poderia ser cancelada com reserva ainda presa; a ordem inversa garante que tudo foi desfeito antes do `CANCELADA`. |

A justificativa completa está em [Por que orquestrada e não coreografada](../../README.md#por-que-orquestrada-e-não-coreografada).

## Consequências

- **Positivas:**
  - A regra inteira da saga fica num arquivo; `GET /ordens-de-servico/:id` mostra a `etapaSaga` e
    `GET /ordens-de-servico/:id/historico` conta o que aconteceu, sem cruzar logs de quatro serviços.
  - Serviço novo na saga muda o orquestrador, não os demais.
- **Negativas / limitações aceitas:**
  - O OS é ponto central: se ele para, a saga para. Mitigado por outbox, inbox idempotente e DLQ
    ([ADR 005](005-outbox-e-idempotencia.md)).
  - O OS conhece os contratos de todos ([ADR 007](007-contratos-tolerant-reader.md)).
  - Não há timeout de etapa: mensagem na DLQ para a saga daquela OS até o redrive manual
    ([Limitação conhecida: DLQ](../../README.md#limitação-conhecida-dlq)).

## Referências

- `src/application/saga/orquestrador-saga.ts`, `src/domain/saga/SagaInstance.ts`,
  `src/infrastructure/repositories/PrismaTravaPorOs.ts`
- Testes: `src/application/saga/orquestrador-saga.compensacao.spec.ts`, `test/bdd/features/saga-da-os.feature`
- [README do OS — Pivô, compensações e eventos atrasados](../../README.md#pivô-compensações-e-eventos-atrasados)
