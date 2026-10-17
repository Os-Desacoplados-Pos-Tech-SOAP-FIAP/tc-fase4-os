# Senhas dos usuários do seed no EKS (D8-2). Com NODE_ENV=production o seed exige
# SEED_SENHA_ADMIN e SEED_SENHA_PADRAO; o CD lê estes segredos e monta o Secret os-secret.
# Para consultar: aws secretsmanager get-secret-value --secret-id oficina-fase4/os/SEED_SENHA_ADMIN
locals {
  senhas_seed = toset(["SEED_SENHA_ADMIN", "SEED_SENHA_PADRAO"])
}

resource "random_password" "seed" {
  for_each = local.senhas_seed

  length  = 24
  special = false
}

resource "aws_secretsmanager_secret" "seed" {
  for_each = local.senhas_seed

  name                    = "oficina-fase4/${local.servico}/${each.key}"
  description             = "Senha do seed do ${local.servico} (${each.key})"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "seed" {
  for_each = local.senhas_seed

  secret_id     = aws_secretsmanager_secret.seed[each.key].id
  secret_string = random_password.seed[each.key].result
}
