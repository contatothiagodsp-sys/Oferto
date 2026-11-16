#!/bin/sh
# Lê o endereço público do túnel e, quando ele muda, chama o workflow 90 do n8n.
ULTIMO=""
echo "Vigia: aguardando o endereço do túnel..."
while true; do
  HOST=$(curl -fsS --max-time 5 http://tunel:2000/quicktunnel 2>/dev/null | sed -n 's/.*"hostname":"\([^"]*\)".*/\1/p')
  if [ -n "$HOST" ] && [ "$HOST" != "$ULTIMO" ]; then
    # Espera o endereço novo responder na internet antes de registrar no Telegram.
    CODIGO=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$HOST/" 2>/dev/null)
    if [ "$CODIGO" = "404" ]; then
      if curl -fsS --max-time 120 -X POST http://n8n:5678/webhook/oferto-tunel \
           -H 'content-type: application/json' -d "{\"url\":\"https://$HOST\"}" >/dev/null 2>&1; then
        ULTIMO="$HOST"
        echo "Vigia: webhook do Telegram apontado para https://$HOST/webhook/telegram-ofertas"
      else
        echo "Vigia: o n8n ainda não respondeu; tentando de novo."
      fi
    fi
  fi
  sleep 15
done
