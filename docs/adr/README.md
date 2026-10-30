# Decisões de arquitetura (ADRs)

Registro das decisões da Fase 4. Cada ADR traz contexto, decisão, alternativas e consequências, e aponta onde a
decisão está implementada. Os detalhes de comportamento ficam no [README do OS](../../README.md) e nos READMEs de cada
serviço.

| Nº | Título | Resumo |
|---|---|---|
| 001 | [Divisão em quatro serviços de domínio](001-divisao-em-quatro-servicos.md) | OS, Catalog, Billing e Execution com repositório, infra e banco próprios; Auth é Lambda, não serviço de domínio. |
| 002 | [Saga orquestrada com transação pivô](002-saga-orquestrada-com-pivo.md) | O OS orquestra; `execucao-aceita` é o pivô; antes dele, compensação sequencial em ordem inversa; depois, só retentativa. |
| 003 | [Pagamento no final, depois da execução](003-pagamento-no-final.md) | Cobrança só após `execucao-concluida`; recusa gera novo link; Mercado Pago Checkout Pro com webhook validado. |
| 004 | [Mensageria com SNS FIFO e SQS FIFO](004-sns-sqs-fifo.md) | Inbox FIFO com DLQ por serviço, tópico FIFO de eventos, comandos direto na inbox do dono, ordem por OS. |
| 005 | [Outbox transacional e consumidor idempotente](005-outbox-e-idempotencia.md) | Mensagem gravada com o efeito, publicador único por serviço e `messageId` registrado na mesma transação. |
| 006 | [Um banco por serviço: Postgres e DynamoDB](006-bancos-por-servico.md) | Postgres 16 em OS, Catalog e Billing; DynamoDB de tabela única no Execution; nenhum acesso cruzado. |
| 007 | [Contratos com tolerant reader e versão no tipo](007-contratos-tolerant-reader.md) | Envelope único, tipos `.v1`, consumidor valida só o que lê; mensagem fora do contrato vai para a DLQ. |
| 008 | [Infra compartilhada × própria](008-infra-compartilhada-e-propria.md) | VPC, EKS, ALB, gateway, ECR e segredos comuns no `tc-fase4-infra`; banco, filas e IRSA no repositório de cada serviço. |
| 009 | [JWT único para clientes e funcionários](009-token-unificado.md) | JWT HS256 `{sub, perfil}` com segredo compartilhado; login de funcionário no OS e de cliente na Lambda por CPF. |
| 010 | [Estratégia de testes e gates de qualidade](010-estrategia-de-testes.md) | Unit com fakes, integração com banco real, e2e, BDD da saga no OS, smoke a–d; cobertura ≥ 80% e quality gate obrigatório. |
