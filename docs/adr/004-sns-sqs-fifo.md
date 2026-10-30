# ADR 004 — Mensageria com SNS FIFO e SQS FIFO

- **Status:** aceita
- **Data:** 2026-10-12 (decisão) · registrada em 2026-10-30
- **Serviços afetados:** OS, Catalog, Billing, Execution

## Contexto

A saga é assíncrona e as mensagens de uma mesma OS precisam chegar em ordem: um `orcamento-aprovado` processado antes
do `orcamento-enviado` quebraria a máquina de estados. O enunciado aceita RabbitMQ, Kafka ou SQS. A infra é AWS (EKS),
sobe só em janelas de ensaio e o custo diário precisa ficar baixo.

## Decisão

- **Uma fila SQS FIFO de entrada por serviço**, `oficina-<serviço>-inbox.fifo`, com **DLQ FIFO**
  `oficina-<serviço>-inbox-dlq.fifo` e `maxReceiveCount = 3`, visibility timeout de 30 s, sem deduplicação por
  conteúdo (`terraform/messaging.tf` de cada serviço).
- **Um tópico SNS FIFO de eventos** `oficina-<serviço>-events.fifo` para Catalog, Billing e Execution. O **OS não tem
  tópico**: nenhum serviço consome eventos dele.
- **Comandos** vão direto do OS para a inbox do dono (`SendMessage`). A role IRSA do OS só tem `sqs:SendMessage` nas
  três inboxes (`terraform/irsa.tf`).
- **Eventos:** a inbox do OS assina os três tópicos com `raw_message_delivery`; a queue policy dela só aceita
  `sqs:SendMessage` do SNS com `aws:SourceArn` dos três tópicos (`terraform/messaging.tf`).
- **Ordem e deduplicação:** `MessageGroupId = correlationId = osId` e `MessageDeduplicationId = messageId`. O atributo
  `type` repete o tipo e o `traceparent` segue como atributo quando há trace
  (`src/infrastructure/messaging/sns-sqs.transport.ts`).
- **Consumo:** long-poll de 20 s, lotes de 10; falha não apaga a mensagem; depois de uma falha, as seguintes da mesma
  OS no lote são puladas (`src/infrastructure/messaging/sqs-inbox.consumer.ts`).
- **Local:** a mesma topologia no LocalStack, criada por `local/localstack/init.sh`.

Detalhes do envelope e da entrega: [README do OS — Envelope e entrega](../../README.md#envelope-e-entrega).

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| RabbitMQ ou Kafka dentro do EKS | Operar broker, persistência e mais nodes no cluster, além de mais um ponto de falha a subir e derrubar a cada ensaio. |
| Amazon MSK | Custo fixo alto para um ambiente que sobe por janela. |
| SQS standard | Sem ordem por OS e com entrega duplicada mais frequente; a saga precisaria reordenar mensagens. |
| Tópico SNS também para o OS | Ninguém consome eventos do OS; comandos têm um único destino. |

## Consequências

- **Positivas:**
  - Ordem garantida por OS e paralelismo entre OS diferentes (um grupo FIFO por OS).
  - Serviço gerenciado, cobrado por uso, criado e destruído pelo Terraform de cada serviço.
  - Um serviço novo só precisa do próprio tópico; quem consome assina na própria stack.
- **Negativas / limitações aceitas:**
  - **DLQ sem reprocessamento automático:** o serviço não lê a DLQ; a correção é redrive manual. O alerta
    "DLQ com mensagens" é criado no Grafana Cloud
    ([guia de observabilidade](https://github.com/Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-infra/blob/main/observability/README.md#4-alertas)).
    Ver [Limitação conhecida: DLQ](../../README.md#limitação-conhecida-dlq).
  - Uma mensagem "poison" segura as seguintes da mesma OS até ir para a DLQ, e as puladas também podem chegar lá
    ([README do Catalog — Trade-offs](https://github.com/Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-catalog/blob/main/README.md#trade-offs-conhecidos)).
  - Entrega at-least-once: o consumidor precisa ser idempotente ([ADR 005](005-outbox-e-idempotencia.md)).
  - As inboxes de Catalog, Billing e Execution não têm queue policy; só a política IAM restringe quem envia comandos.
  - O Terraform do OS lê os states de catalog, execution e billing (`terraform/remote-state.tf`), então eles precisam
    ser aplicados antes ([ADR 008](008-infra-compartilhada-e-propria.md)).

## Referências

- `terraform/messaging.tf`, `terraform/irsa.tf`, `terraform/remote-state.tf`, `local/localstack/init.sh`
- `src/infrastructure/messaging/sns-sqs.transport.ts`, `src/infrastructure/messaging/sqs-inbox.consumer.ts`
- [README do OS — Catálogo de eventos](../../README.md#catálogo-de-eventos)
