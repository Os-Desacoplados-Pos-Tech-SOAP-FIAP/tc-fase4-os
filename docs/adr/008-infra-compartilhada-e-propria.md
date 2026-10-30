# ADR 008 — Infra compartilhada no `tc-fase4-infra`, infra de cada serviço no próprio repositório

- **Status:** aceita
- **Data:** 2026-10-12 (decisão) · registrada em 2026-10-30
- **Serviços afetados:** todos (`tc-fase4-infra`, OS, Catalog, Billing, Execution, Auth)

## Contexto

O enunciado pede que cada microsserviço tenha a própria infraestrutura e deploy automatizado em Kubernetes. Um cluster
EKS, uma VPC com NAT e um API Gateway por serviço multiplicariam o custo de um ambiente que só sobe em janelas de
ensaio e no dia da gravação. Ao mesmo tempo, um Terraform único acoplaria o deploy de todos.

## Decisão

**`tc-fase4-infra` cria o que é compartilhado** ([README da infra](https://github.com/Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-infra/blob/main/README.md)):

- VPC com 3 AZs e NAT único (`vpc.tf`);
- EKS com node group `t3.medium` min 2 / desired 3 / max 5, IRSA e access entries das esteiras (`eks.tf`);
- addons, incluindo o AWS Load Balancer Controller (`addons.tf`);
- SG do ALB interno e nome do IngressGroup `oficina-fase4` (`alb.tf`);
- API Gateway HTTP na raiz (`apigateway.tf`) e, na stack `gateway/`, rotas, authorizer e VPC Link
  (`gateway/apigateway.tf`);
- um repositório ECR por serviço (`ecr.tf`);
- segredos compartilhados `oficina-fase4/JWT_SECRET` e `oficina-fase4/INTERNAL_SERVICE_TOKEN` (`secrets.tf`);
- Grafana Alloy, opcional, ligado pelos secrets `GRAFANA_CLOUD_*` (`observability.tf`).

**Cada serviço cria o que é dele** no próprio `terraform/`:

- banco ([ADR 006](006-bancos-por-servico.md));
- fila de entrada, DLQ e, exceto o OS, tópico de eventos ([ADR 004](004-sns-sqs-fifo.md));
- role IRSA de menor privilégio presa à ServiceAccount `<serviço>/<serviço>`;
- segredos próprios (`DATABASE_URL`; `MP_*` no Billing; senhas do seed no OS).

No cluster, cada serviço tem namespace próprio (`k8s/base/namespace.yaml`) e publica o próprio Ingress no mesmo ALB
interno pelo IngressGroup (`k8s/base/ingress.yaml`). O CD de cada repositório faz o deploy só do seu serviço.

**Ligação entre stacks por remote state**, lido do bucket `tc-fase4-tfstate-538880133939`:

- todos os serviços leem `infra/terraform.tfstate`;
- o OS também lê os states de catalog, execution e billing (outputs `events_topic_arn`, `inbox_queue_arn`,
  `inbox_queue_url`) para assinar os tópicos e ganhar `SendMessage` nas filas (`terraform/remote-state.tf`).

**Ordem de subida:** infra → catalog, billing e execution (independentes entre si) → os → CD dos serviços → auth → gateway. A descida é
inversa, removendo os Ingress antes do Terraform dos serviços
([README da infra — Ordem de subida](https://github.com/Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-infra/blob/main/README.md#ordem-de-subida-descida--inversa)).

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Um cluster EKS por serviço | Custo de control plane, nodes e NAT multiplicado por 4; fora de escopo (spec §10). |
| Todo o Terraform num repositório só | Deploy acoplado: mudar a fila de um serviço exigiria aplicar a infra de todos; contraria "infraestrutura própria". |
| ARNs determinísticos no Terraform do OS, sem ler o state dos outros | Era a intenção da spec (§5.1). O código usa remote state, o que exige os três serviços aplicados antes do OS, mas evita montar ARN e URL de fila à mão. |
| ALB público por serviço | Quatro ALBs e quatro entradas públicas; o ALB interno único atrás do API Gateway concentra autenticação de borda. |

## Consequências

- **Positivas:**
  - Cada serviço sobe, muda e cai com os próprios workflows: `.github/workflows/terraform.yml` (apply/destroy com aprovação no
    environment `aws-infra`) e `.github/workflows/cd.yml` (deploy no EKS).
  - Um ALB, um NAT e um cluster para todos mantêm o custo em ~US$ 8–9/dia
    ([README da infra — Custo](https://github.com/Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-infra/blob/main/README.md#custo)).
- **Negativas / limitações aceitas:**
  - A ordem de subida e descida importa: o `plan` do OS falha sem os outputs dos três serviços, e a auth precisa do
    ALB criado pelos Ingress.
  - O cluster é ponto único: se o EKS cai, caem os quatro serviços.
  - O valor dos segredos compartilhados fica no state do Terraform (bucket S3 privado, versionado e criptografado).
  - A infra só fica no ar em janela de ensaio; fora dela, não há ambiente para testar na AWS.

## Referências

- [README do OS — Deploy no EKS](../../README.md#deploy-no-eks)
- `terraform/remote-state.tf`, `terraform/irsa.tf`, `k8s/base/ingress.yaml`
- [README da infra — Contrato para os serviços](https://github.com/Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-infra/blob/main/README.md#contrato-para-os-serviços)
