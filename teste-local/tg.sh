#!/bin/bash
# Envia um update falso do Telegram ao workflow 01 do n8n de TESTE: ./tg.sh '<json>'
# Porta: N8N_TESTE_PORTA, ou a gravada pelo rodar.sh (tmp/porta), ou 5690. Nunca a 5678 (produção, P1-04).
cd "$(dirname "$0")"
PORTA="${N8N_TESTE_PORTA:-$(cat tmp/porta 2>/dev/null || echo 5690)}"
[ "$PORTA" = 5678 ] && { echo "ABORTADO: 5678 é a porta da produção."; exit 1; }
curl -s -X POST "http://127.0.0.1:$PORTA/webhook/telegram-ofertas" -H 'content-type: application/json' \
  -H "x-telegram-bot-api-secret-token: $(cat tmp/segredo)" -d "$1"; echo
