# ADR 005 — Outbox transacional e consumidor idempotente

- **Status:** aceita
- **Data:** 2026-10-12 (decisão) · registrada em 2026-10-30
- **Serviços afetados:** OS, Catalog, Billing, Execution

## Contexto

Cada passo da saga grava estado e publica uma mensagem. Gravar no banco e publicar no SNS/SQS são duas operações sem
transação comum (dual write): se o pod cair entre as duas, ou o estado muda sem a mensagem sair (a saga trava) ou a
mensagem sai sem o estado (efeito fantasma). Além disso, SQS FIFO entrega at-least-once, então a mesma mensagem pode
ser processada duas vezes ([ADR 004](004-sns-sqs-fifo.md)).

## Decisão

Entrega at-least-once ponta a ponta: a mensagem é gravada junto com o efeito, publicada até dar certo, e o consumidor
descarta o que já processou.

| | Postgres (OS, Catalog, Billing) | DynamoDB (Execution) |
|---|---|---|
| Estado + mensagem | tabela `Outbox` na mesma transação Prisma do efeito | item `OUTBOX` no mesmo `TransactWriteItems` do efeito (`src/infrastructure/dynamo/dynamo-unit-of-work.ts`) |
| Publicador | worker no pod (ciclo de 1 s, lotes de 10), `src/infrastructure/messaging/outbox.publisher.ts` | worker no pod (ciclo de 1 s), `src/infrastructure/messaging/outbox.publisher.ts` |
| Publicador único | `pg_try_advisory_xact_lock`; réplica sem o lock espera o próximo ciclo | lease no item `LOCK/OUTBOX_PUBLISHER` (escrita condicional, 30 s), `src/infrastructure/messaging/outbox-lease.ts` |
| Ordem | por OS (`seq`); falha bloqueia só a própria OS (`tentativas`, `ultimoErro`) | por OS (SK `<osId>#<versão>#<índice>#<messageId>`); falha bloqueia só a própria OS |
| Idempotência de entrada | `ProcessedMessage(messageId)` na transação do efeito (`createMany` com `skipDuplicates`, `src/infrastructure/repositories/PrismaProcessedMessageRepository.ts`) | item `MSG#<messageId>` com put condicional `attribute_not_exists(PK)` no mesmo commit, TTL de 7 dias (`src/infrastructure/repositories/DynamoProcessedMessageRepository.ts`) |

Os caminhos da coluna Postgres existem com o mesmo nome em `tc-fase4-os`, `tc-fase4-catalog` e `tc-fase4-billing`;
os da coluna DynamoDB são do `tc-fase4-execution`.

- O `traceparent` é capturado na escrita da outbox e enviado como atributo da mensagem.
- Reenvio de uma mensagem já publicada (ex.: transação do publicador desfeita depois do envio) é absorvido pela
  deduplicação FIFO (`MessageDeduplicationId = messageId`) e pela idempotência do consumidor.
- No OS, idempotência, trava da OS e efeito rodam na mesma transação do `OrquestradorSaga`
  (`src/application/saga/orquestrador-saga.ts`); se a transação falha, o `messageId` não fica registrado e a
  retentativa reprocessa normalmente.

Detalhes por serviço: [README do OS — Envelope e entrega](../../README.md#envelope-e-entrega),
[Catalog — Outbox](https://github.com/Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-catalog/blob/main/README.md#outbox-publicação),
[Billing — Outbox e inbox](https://github.com/Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-billing/blob/main/README.md#outbox-e-inbox),
[Execution — Outbox com lease](https://github.com/Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-execution/blob/main/README.md#outbox-com-lease).

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Publicar direto depois do commit | Se o pod cair entre o commit e o envio, a mensagem se perde e a saga daquela OS para sem erro visível. |
| CDC (Debezium) ou DynamoDB Streams | Mais infraestrutura (conector, Kafka Connect ou Lambda de stream) para resolver o que uma tabela e um worker resolvem. |
| Vários publicadores em paralelo (`FOR UPDATE SKIP LOCKED`) | Duas réplicas publicando poderiam tirar de ordem mensagens da mesma OS; um publicador eleito mantém a ordem por OS. |
| Exactly-once | SQS não oferece; idempotência no consumidor é o caminho padrão. |

## Consequências

- **Positivas:**
  - Nenhum estado muda sem a mensagem correspondente, e reentrega não duplica efeito.
  - O OS pode cair: comandos ficam na outbox e eventos esperam na inbox.
  - O mesmo desenho nos três serviços Postgres; o Execution adapta com lease e `TransactWriteItems`.
- **Negativas / limitações aceitas:**
  - Latência de até ~1 s por salto (ciclo do worker).
  - Um único publicador por serviço limita a vazão da outbox; suficiente para o volume do desafio.
  - `Outbox` e `ProcessedMessage` crescem sem limpeza nos serviços Postgres
    ([Catalog — Trade-offs](https://github.com/Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-catalog/blob/main/README.md#trade-offs-conhecidos)).
  - O lease do Execution não cobre diferença de relógio entre réplicas.

## Referências

- OS: `src/infrastructure/messaging/outbox.publisher.ts`, `src/infrastructure/repositories/PrismaOutbox.ts`,
  `src/infrastructure/repositories/PrismaProcessedMessageRepository.ts`
- Testes: `test/integration/outbox.publisher.int-spec.ts`; cenário BDD "Mensagem entregue duas vezes não repete
  efeitos" em `test/bdd/features/saga-da-os.feature`
- [ADR 004](004-sns-sqs-fifo.md), [ADR 006](006-bancos-por-servico.md)
