# Mensageria do OS com os mesmos nomes e atributos do LocalStack (local/localstack/init.sh):
# tudo FIFO, sem deduplicação por conteúdo (o MessageDeduplicationId é o messageId do
# envelope) e redrive após 3 tentativas.
#
# Sem tópico próprio (E3): o OS só envia comandos, direto para a fila de entrada de cada
# serviço, e consome os eventos dos três pela própria inbox.
resource "aws_sqs_queue" "dlq" {
  name                        = "oficina-${local.servico}-inbox-dlq.fifo"
  fifo_queue                  = true
  content_based_deduplication = false
}

resource "aws_sqs_queue" "inbox" {
  name                        = "oficina-${local.servico}-inbox.fifo"
  fifo_queue                  = true
  content_based_deduplication = false
  visibility_timeout_seconds  = 30

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 3
  })
}

# O SNS entrega na inbox só se a fila permitir: SendMessage para o serviço SNS, restrito
# aos três tópicos de eventos (aws:SourceArn).
data "aws_iam_policy_document" "inbox" {
  statement {
    sid       = "EventosDosServicos"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.inbox.arn]

    principals {
      type        = "Service"
      identifiers = ["sns.amazonaws.com"]
    }

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [for servico in local.servicos : servico.events_topic_arn]
    }
  }
}

resource "aws_sqs_queue_policy" "inbox" {
  queue_url = aws_sqs_queue.inbox.id
  policy    = data.aws_iam_policy_document.inbox.json
}

# Raw delivery: a inbox recebe o envelope publicado, sem o JSON de notificação do SNS
# (o consumidor espera o mesmo formato do LocalStack, que usa RawMessageDelivery=true).
resource "aws_sns_topic_subscription" "eventos" {
  for_each = local.servicos

  topic_arn            = each.value.events_topic_arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.inbox.arn
  raw_message_delivery = true

  # Sem a policy, as primeiras entregas seriam negadas e perdidas.
  depends_on = [aws_sqs_queue_policy.inbox]
}
