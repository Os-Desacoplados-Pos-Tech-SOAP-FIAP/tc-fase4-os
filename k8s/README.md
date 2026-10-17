# Kubernetes (Kustomize)

Manifests do OS no EKS. Aplicados pelo CD (`.github/workflows/cd.yml`), não à mão.

```
k8s/base/
├── kustomization.yaml   # namespace os + imagem parametrizada (os -> <ecr>:<sha>)
├── namespace.yaml       # namespace os
├── serviceaccount.yaml  # SA os com a role IRSA (${IRSA_ROLE_ARN})
├── deployment.yaml      # initContainer prisma-migrate + app na porta 3000
├── service.yaml         # ClusterIP 80 -> 3000
└── ingress.yaml         # ALB interno compartilhado, /api/os, inclui /api/os/internal (${ALB_SG_ID})
```

Fora do Git, criados pelo CD a cada deploy:

- **ConfigMap `os-config`**: `NODE_ENV`, `PORT`, `AWS_REGION`, `MESSAGING_ENABLED`,
  `OTEL_SERVICE_NAME`, `INBOX_QUEUE_URL`, `CATALOG_COMMANDS_QUEUE_URL`,
  `EXECUTION_COMMANDS_QUEUE_URL`, `BILLING_COMMANDS_QUEUE_URL` (outputs do Terraform),
  `CATALOG_BASE_URL=http://catalog.catalog.svc.cluster.local/api/catalog`,
  `CATALOG_TIMEOUT_MS=3000`, `JWT_EXPIRES_IN=8h` e `OTEL_EXPORTER_OTLP_ENDPOINT` quando o
  Alloy está instalado.
- **Secret `os-secret`**: `DATABASE_URL`, `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN`,
  `SEED_SENHA_ADMIN` e `SEED_SENHA_PADRAO`, lidos do Secrets Manager.

`AWS_ENDPOINT_URL` nunca é definida no EKS: o SDK usa o endpoint padrão e as
credenciais da role IRSA.

## Validar (sem cluster)

```bash
kubectl kustomize k8s/base
```

`${IRSA_ROLE_ARN}` e `${ALB_SG_ID}` aparecem literais na saída; o CD os substitui com
`envsubst` antes do `kubectl apply`.
