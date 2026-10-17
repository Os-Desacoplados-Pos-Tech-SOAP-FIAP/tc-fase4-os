# --- Recursos do serviço (lidos pelo CD) ---

output "namespace" {
  description = "Namespace do serviço no EKS."
  value       = local.servico
}

output "inbox_queue_url" {
  description = "URL da fila de entrada (INBOX_QUEUE_URL; recebe os eventos dos 3 serviços)."
  value       = aws_sqs_queue.inbox.url
}

output "inbox_queue_arn" {
  description = "ARN da fila de entrada."
  value       = aws_sqs_queue.inbox.arn
}

output "dlq_url" {
  description = "URL da DLQ da fila de entrada (verificação do smoke)."
  value       = aws_sqs_queue.dlq.url
}

output "irsa_role_arn" {
  description = "Role IRSA do pod (anotação eks.amazonaws.com/role-arn da ServiceAccount)."
  value       = aws_iam_role.app.arn
}

output "database_url_secret_name" {
  description = "Nome do segredo DATABASE_URL no Secrets Manager."
  value       = aws_secretsmanager_secret.database_url.name
}

output "seed_senha_admin_secret_name" {
  description = "Nome do segredo SEED_SENHA_ADMIN (senha do admin@oficina.local)."
  value       = aws_secretsmanager_secret.seed["SEED_SENHA_ADMIN"].name
}

output "seed_senha_padrao_secret_name" {
  description = "Nome do segredo SEED_SENHA_PADRAO (senha do atendente e do mecânico)."
  value       = aws_secretsmanager_secret.seed["SEED_SENHA_PADRAO"].name
}

# --- Repassados dos serviços orquestrados (comandos da saga) ---

output "catalog_commands_queue_url" {
  description = "Fila de entrada do Catalog (CATALOG_COMMANDS_QUEUE_URL)."
  value       = local.servicos["catalog"].inbox_queue_url
}

output "execution_commands_queue_url" {
  description = "Fila de entrada do Execution (EXECUTION_COMMANDS_QUEUE_URL)."
  value       = local.servicos["execution"].inbox_queue_url
}

output "billing_commands_queue_url" {
  description = "Fila de entrada do Billing (BILLING_COMMANDS_QUEUE_URL)."
  value       = local.servicos["billing"].inbox_queue_url
}

# --- Repassados da infra, para o CD ler tudo de um único state ---

output "ecr_repository_url" {
  description = "Repositório ECR do serviço."
  value       = local.infra.ecr_repository_urls[local.servico]
}

output "alb_security_group_id" {
  description = "SG do ALB interno (anotação alb.ingress.kubernetes.io/security-groups)."
  value       = local.infra.alb_security_group_id
}

output "jwt_secret_name" {
  description = "Nome do segredo JWT_SECRET compartilhado no Secrets Manager."
  value       = local.infra.jwt_secret_name
}

output "internal_token_secret_name" {
  description = "Nome do segredo INTERNAL_SERVICE_TOKEN (compartilhado com a Lambda) no Secrets Manager."
  value       = local.infra.internal_token_secret_name
}
