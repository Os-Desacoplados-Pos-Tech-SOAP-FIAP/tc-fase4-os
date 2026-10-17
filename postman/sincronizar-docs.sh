#!/usr/bin/env bash
# Copia a collection e os ambientes para ../tc-fase4-docs/postman/ (cópia; a fonte é tc-fase4-os/postman).
# Uso: ./postman/sincronizar-docs.sh [caminho do tc-fase4-docs]
set -euo pipefail

ORIGEM="$(cd "$(dirname "$0")" && pwd)"
DOCS="${1:-$ORIGEM/../../tc-fase4-docs}"

if [ ! -d "$DOCS/.git" ]; then
  echo "Repositório de docs não encontrado em $DOCS" >&2
  exit 1
fi

DESTINO="$DOCS/postman"
mkdir -p "$DESTINO"
cp "$ORIGEM"/*.json "$DESTINO/"

cat > "$DESTINO/README.md" <<'EOF'
# Collection Postman (cópia)

Esta pasta é uma **cópia**. A fonte é [`tc-fase4-os/postman`](https://github.com/Os-Desacoplados-Pos-Tech-SOAP-FIAP/tc-fase4-os/tree/main/postman),
onde estão as instruções de uso (ambientes, ordem, token do orçamento e newman). Não edite aqui: altere no
`tc-fase4-os` e rode `postman/sincronizar-docs.sh`.

| Arquivo | Conteúdo |
|---|---|
| `oficina-fase4.postman_collection.json` | Fluxo da saga, cenários de falha e APIs por serviço |
| `local.postman_environment.json` | Compose local |
| `eks.postman_environment.json` | EKS atrás do API Gateway (placeholders) |
EOF

echo "Copiado para $DESTINO:"
ls -1 "$DESTINO"
