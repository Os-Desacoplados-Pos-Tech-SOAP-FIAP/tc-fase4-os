#!/bin/bash
# Topologia completa da saga no LocalStack (mesmos nomes da AWS).
# Diferença para os init-*.sh de cada repo: a fila de entrada do OS assina os tópicos de eventos
# de Catalog, Execution e Billing, que é o que faz a saga andar.
set -euo pipefail
R=us-east-1
CONTA=000000000000

arn_da_fila() {
  awslocal sqs get-queue-attributes --region $R --queue-url "$1" \
    --attribute-names QueueArn --query Attributes.QueueArn --output text
}

criar_inbox() {
  local svc=$1 dlq_url dlq_arn
  dlq_url=$(awslocal sqs create-queue --region $R --queue-name "oficina-$svc-inbox-dlq.fifo" \
    --attributes FifoQueue=true --query QueueUrl --output text)
  dlq_arn=$(arn_da_fila "$dlq_url")
  awslocal sqs create-queue --region $R --queue-name "oficina-$svc-inbox.fifo" \
    --attributes "{\"FifoQueue\":\"true\",\"VisibilityTimeout\":\"30\",\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"$dlq_arn\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}" >/dev/null
}

assinar() {
  local topico=$1 fila_arn=$2
  awslocal sns subscribe --region $R \
    --topic-arn "arn:aws:sns:$R:$CONTA:$topico" \
    --protocol sqs --notification-endpoint "$fila_arn" --attributes RawMessageDelivery=true >/dev/null
}

for svc in os catalog billing execution; do
  criar_inbox "$svc"
done

OS_INBOX_ARN="arn:aws:sqs:$R:$CONTA:oficina-os-inbox.fifo"

for svc in catalog billing execution; do
  awslocal sns create-topic --region $R --name "oficina-$svc-events.fifo" \
    --attributes FifoTopic=true,ContentBasedDeduplication=false >/dev/null
  assinar "oficina-$svc-events.fifo" "$OS_INBOX_ARN"
  # Fila de inspeção: deixa ver em dev os eventos que cada serviço publicou.
  spy_url=$(awslocal sqs create-queue --region $R --queue-name "oficina-$svc-events-spy.fifo" \
    --attributes FifoQueue=true --query QueueUrl --output text)
  assinar "oficina-$svc-events.fifo" "$(arn_da_fila "$spy_url")"
done

awslocal dynamodb create-table --region $R --table-name oficina-execution \
  --attribute-definitions AttributeName=PK,AttributeType=S AttributeName=SK,AttributeType=S \
    AttributeName=GSI1PK,AttributeType=S AttributeName=GSI1SK,AttributeType=S \
  --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE \
  --global-secondary-indexes 'IndexName=GSI1,KeySchema=[{AttributeName=GSI1PK,KeyType=HASH},{AttributeName=GSI1SK,KeyType=RANGE}],Projection={ProjectionType=ALL}' \
  --billing-mode PAY_PER_REQUEST >/dev/null
awslocal dynamodb update-time-to-live --region $R --table-name oficina-execution \
  --time-to-live-specification Enabled=true,AttributeName=expiraEm >/dev/null

echo "oficina: topologia completa criada"
