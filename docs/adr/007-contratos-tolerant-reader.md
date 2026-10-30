# ADR 007 — Contratos de mensagem com tolerant reader e versão no tipo

- **Status:** aceita
- **Data:** 2026-10-12 (decisão) · registrada em 2026-10-30
- **Serviços afetados:** OS, Catalog, Billing, Execution

## Contexto

Os quatro serviços trocam 9 comandos e 19 eventos ([Catálogo de eventos](../../README.md#catálogo-de-eventos)) e cada
um tem repositório e deploy próprios. Um campo novo num payload não pode exigir deploy simultâneo dos consumidores, e
uma mensagem fora do contrato não pode ser aplicada pela metade nem travar a fila.

## Decisão

- **Envelope único** `{ messageId, type, occurredAt, correlationId, causationId?, payload }`, com
  `correlationId = osId` (`src/application/ports/message-envelope.ts`, copiado em cada serviço).
- **Versão no tipo:** `<serviço>.<nome>.v1` (ex.: `catalog.insumos-reservados.v1`). Mudança incompatível = novo tipo
  `.v2`, publicado em paralelo até os consumidores migrarem.
- **Tolerant reader:** o consumidor valida só os campos que lê, com `class-validator`
  (`src/infrastructure/messaging/validar-payload.ts`), e ignora o resto. No OS, por exemplo, só `valorTotal` e
  `validoAte` em `orcamento-enviado`, `initPoint` em `cobranca-gerada` e `motivo`/`mensagem?` nas falhas
  (`src/modules/saga/saga-message.handlers.ts`).
- **Mensagem inválida vai para a DLQ:** envelope fora do contrato (`src/infrastructure/messaging/message-envelope.parser.ts`),
  payload sem os campos lidos ou tipo sem handler, inclusive outra versão
  (`src/infrastructure/messaging/message-handler.registry.ts`), falham, não são apagadas e chegam à DLQ após 3
  recebimentos ([ADR 004](004-sns-sqs-fifo.md)).
- **Fonte da verdade do contrato:** o [catálogo de eventos do README do OS](../../README.md#catálogo-de-eventos),
  com dono, fila/tópico e payload de cada mensagem. Os tipos em código ficam em um arquivo por serviço:
  - OS: `src/application/saga/saga-messages.ts`;
  - Catalog: `src/application/reserva/catalog-messages.ts`;
  - Billing: `src/application/billing-messages.ts`;
  - Execution: `src/application/execucao/execution-messages.ts`.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Biblioteca npm compartilhada de contratos | Acopla o deploy dos quatro repositórios a uma versão da lib; fora de escopo (spec §10). |
| Schema registry (Avro/JSON Schema, Glue Schema Registry) | Mais infraestrutura e mais uma dependência no caminho da mensagem para um volume pequeno de tipos. |
| Validação estrita do payload inteiro | Campo novo do produtor quebraria o consumidor antigo e mandaria mensagens válidas para a DLQ. |
| Versão em atributo da mensagem | O tipo com versão já roteia para o handler certo e aparece em log e métrica sem lógica extra. |

## Consequências

- **Positivas:**
  - Produtor adiciona campo sem coordenar deploy.
  - Mensagem incompatível falha cedo e fica visível na DLQ, sem efeito parcial.
- **Negativas / limitações aceitas:**
  - Os tipos são duplicados em cada repositório; a consistência depende do catálogo do README e dos testes de cada
    serviço, não de um compilador.
  - Uma `.v2` exige handler novo no OS; sem ele, a mensagem vai para a DLQ.
  - O OS conhece os contratos de todos os serviços (trade-off da orquestração, ver
    [ADR 002](002-saga-orquestrada-com-pivo.md)).

## Referências

- [README do OS — Envelope e entrega](../../README.md#envelope-e-entrega), [Comandos](../../README.md#comandos),
  [Eventos](../../README.md#eventos-todos-consumidos-pelo-os)
- `src/infrastructure/messaging/validar-payload.spec.ts`, `src/infrastructure/messaging/message-envelope.parser.spec.ts`
