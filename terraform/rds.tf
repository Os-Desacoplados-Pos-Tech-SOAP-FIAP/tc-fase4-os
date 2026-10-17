# PostgreSQL próprio do serviço (database per service), privado e acessível só
# pelos nodes do EKS. Configuração de estudo: sem backup, sem snapshot final e sem
# proteção contra exclusão, para o destroy dos ensaios ser rápido e barato.
resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_db_subnet_group" "this" {
  name       = local.nome
  subnet_ids = local.infra.private_subnets
}

# Regras como recursos separados (sem blocos inline), no mesmo padrão da infra.
resource "aws_security_group" "db" {
  name        = "${local.nome}-rds"
  description = "RDS do ${local.servico}: 5432 so a partir dos nodes do EKS"
  vpc_id      = local.infra.vpc_id

  tags = {
    Name = "${local.nome}-rds"
  }
}

resource "aws_vpc_security_group_ingress_rule" "db_from_nodes" {
  security_group_id            = aws_security_group.db.id
  description                  = "PostgreSQL a partir dos nodes do EKS"
  referenced_security_group_id = local.infra.node_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_db_instance" "this" {
  identifier     = local.nome
  engine         = "postgres"
  engine_version = "16"
  instance_class = "db.t4g.micro"

  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = "os"
  username = "os"
  password = random_password.db.result

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period = 0
  skip_final_snapshot     = true
  deletion_protection     = false
  apply_immediately       = true
}

# DATABASE_URL completa no Secrets Manager; o CD lê e monta o Secret do Kubernetes.
resource "aws_secretsmanager_secret" "database_url" {
  name                    = "oficina-fase4/${local.servico}/DATABASE_URL"
  description             = "Connection string do PostgreSQL do ${local.servico}"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = "postgresql://${aws_db_instance.this.username}:${random_password.db.result}@${aws_db_instance.this.endpoint}/${aws_db_instance.this.db_name}?schema=public&sslmode=require"
}
