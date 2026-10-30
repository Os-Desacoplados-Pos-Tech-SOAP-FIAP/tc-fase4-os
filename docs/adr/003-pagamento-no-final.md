# ADR 003 — Pagamento no final, depois da execução

- **Status:** aceita
- **Data:** 2026-10-12 (decisão) · registrada em 2026-10-30
- **Serviços afetados:** OS, Billing

## Contexto

O enunciado pede integração com o Mercado Pago e atualização do status da OS após o pagamento. O momento da cobrança
define o que a saga precisa desfazer: um pagamento feito antes do pivô ([ADR 002](002-saga-orquestrada-com-pivo.md))
teria de ser estornado quando a reserva falha ou a fila está cheia. Estorno no Mercado Pago e sinal antecipado estão
fora de escopo (spec §10).

## Decisão

- **Cobrança só depois de `execution.execucao-concluida.v1`.** Nesse evento o orquestrador muda a OS para `FINALIZADA`,
  a saga para `COBRANCA` e envia `catalog.baixar-reservas.v1` e `billing.gerar-cobranca.v1` na mesma transação
  ([Reação a cada evento](../../README.md#reação-a-cada-evento)).
- **Sequência final:** `FINALIZADA` → `PAGA` (`billing.pagamento-confirmado.v1`, saga `CONCLUIDA`) → `ENTREGUE`
  (`POST /ordens-de-servico/:id/entrega`, só com a OS `PAGA`, em
  `src/application/ordem-de-servico/entregar-veiculo/EntregarVeiculoUseCase.ts`).
- **Pagamento recusado não compensa:** é pós-pivô. O OS registra `Pagamento recusado: <motivo>` no histórico, limpa o
  `linkPagamento` e envia outro `billing.gerar-cobranca.v1` (novo `messageId`). A OS continua `FINALIZADA` e o Billing
  cria uma nova cobrança com outro link.
- **Mercado Pago Checkout Pro**, pela API REST, sem SDK (`POST /checkout/preferences`, `GET /v1/payments/:id`), atrás
  da porta `PaymentGateway` do Billing:
  - `MercadoPagoGateway` (`src/infrastructure/payment/mercado-pago.gateway.ts` no Billing);
  - `FakePaymentGateway` (`src/infrastructure/payment/fake-payment.gateway.ts`) para local e testes, com a rota
    `POST /dev/pagamentos/:osId/simular`, que só existe com `PAYMENT_PROVIDER=fake`.
- **Webhook** `POST /webhooks/mercadopago`: assinatura `x-signature` (HMAC-SHA256 com `MP_WEBHOOK_SECRET`,
  `src/infrastructure/payment/assinatura-mercado-pago.ts`) e status sempre confirmado na API do Mercado Pago, nunca
  lido do corpo ([README do Billing — Decisões](https://github.com/Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-billing/blob/main/README.md#decisões)).
- O provedor no EKS vem da variável de repositório `PAYMENT_PROVIDER` do Billing; sem ela vale `fake` e o CD emite um
  warning (`.github/workflows/cd.yml` do Billing).

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Sinal ou pagamento antecipado na aprovação do orçamento | A compensação de reserva e de fila cheia passaria a exigir estorno no Mercado Pago (fora de escopo, spec §10) e o pagamento viraria uma etapa compensável a mais. |
| Pagamento como parte do pivô | Misturaria duas decisões (capacidade e cobrança) num ponto sem volta; uma recusa de cartão cancelaria uma execução possível. |
| Status do pagamento lido do corpo do webhook | Corpo pode ser forjado; a consulta à API do Mercado Pago é a fonte da verdade. |

## Consequências

- **Positivas:**
  - Nenhuma compensação envolve dinheiro: antes do pivô nada foi cobrado.
  - Recusa de cartão é só retentativa com novo link; o histórico de cobranças fica em `GET /cobrancas/:osId`.
- **Negativas / limitações aceitas:**
  - A oficina executa o serviço antes de receber. Para o escopo do desafio, o veículo só é entregue com a OS `PAGA`.
  - Um `approved` que chegue depois de outra cobrança já paga confirma mesmo assim e loga erro para estorno manual
    ([README do Billing — Decisões](https://github.com/Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-billing/blob/main/README.md#decisões)).
  - No modo `fake` o `initPoint` não é link clicável; o pagamento é simulado pela rota de dev.

## Referências

- [README do OS — Pivô, compensações e eventos atrasados](../../README.md#pivô-compensações-e-eventos-atrasados)
- [README do Billing — Papel na saga](https://github.com/Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-billing/blob/main/README.md#papel-na-saga)
  e [Mercado Pago](https://github.com/Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-billing/blob/main/README.md#mercado-pago)
- Billing: `src/application/cobranca/gerar-cobranca/GerarCobrancaUseCase.ts`,
  `src/application/cobranca/processar-notificacao-pagamento/ProcessarNotificacaoPagamentoUseCase.ts`
- BDD: cenário "Pagamento recusado gera um novo link de pagamento" em `test/bdd/features/saga-da-os.feature`
