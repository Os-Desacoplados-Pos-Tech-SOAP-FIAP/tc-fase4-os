# Infra compartilhada (VPC, EKS, ECR, segredos, ALB) vem do state do tc-fase4-infra.
data "terraform_remote_state" "infra" {
  backend = "s3"

  config = {
    bucket = "tc-fase4-tfstate-538880133939"
    key    = "infra/terraform.tfstate"
    region = "us-east-1"
  }
}

# Serviços orquestrados pela saga: o OS assina o tópico de eventos de cada um e envia
# comandos para a fila de entrada deles (outputs events_topic_arn, inbox_queue_arn e
# inbox_queue_url). Ordem de apply: infra -> catalog, execution, billing -> os.
data "terraform_remote_state" "servicos" {
  for_each = toset(["catalog", "execution", "billing"])

  backend = "s3"

  config = {
    bucket = "tc-fase4-tfstate-538880133939"
    key    = "${each.key}/terraform.tfstate"
    region = "us-east-1"
  }
}

locals {
  servico         = "os"
  nome            = "oficina-fase4-os"
  infra           = data.terraform_remote_state.infra.outputs
  servicos        = { for nome, state in data.terraform_remote_state.servicos : nome => state.outputs }
  service_account = "system:serviceaccount:os:os"
}
