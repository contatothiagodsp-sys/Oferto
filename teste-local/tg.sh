#!/bin/bash
# Envia um update falso do Telegram ao workflow 01: ./tg.sh '<json>'
cd "$(dirname "$0")"
curl -s -X POST http://127.0.0.1:5678/webhook/telegram-ofertas -H 'content-type: application/json' \
  -H "x-telegram-bot-api-secret-token: $(cat tmp/segredo)" -d "$1"; echo
