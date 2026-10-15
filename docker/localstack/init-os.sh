#!/bin/bash
# Topologia FIFO usada pelo OS no LocalStack (mesmos nomes da AWS).
# As filas de entrada de Catalog, Billing e Execution são criadas aqui só para o teste local
# isolado do OS; no compose completo (tc-fase4-docs/local) cada serviço cria a sua.
set -euo pipefail
R=us-east-1

criar_inbox() {
  local svc=$1
  local dlq_url dlq_arn
  dlq_url=$(awslocal sqs create-queue --region $R --queue-name "oficina-$svc-inbox-dlq.fifo" \
    --attributes FifoQueue=true --query QueueUrl --output text)
  dlq_arn=$(awslocal sqs get-queue-attributes --region $R --queue-url "$dlq_url" \
    --attribute-names QueueArn --query Attributes.QueueArn --output text)
  awslocal sqs create-queue --region $R --queue-name "oficina-$svc-inbox.fifo" \
    --attributes "{\"FifoQueue\":\"true\",\"VisibilityTimeout\":\"30\",\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"$dlq_arn\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}" >/dev/null
}

for svc in os catalog billing execution; do
  criar_inbox "$svc"
done

echo "os: filas de entrada criadas (os, catalog, billing, execution)"
