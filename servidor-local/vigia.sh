#!/bin/sh
# Vigia do servidor local:
#  1) lê o endereço público do túnel e, quando ele muda, chama o workflow 90 (grava a URL e refaz o webhook);
#  2) a cada 5 min chama o workflow 91 (saúde). Resposta ok → ping no healthchecks.io (HC_URL, opcional).
#     Assim o healthchecks.io avisa quando o computador dorme ou o n8n cai (os pings param).
# TUNEL=cloudflare (padrão: túnel rápido) ou ngrok (domínio fixo; perfil "ngrok" do docker-compose.yml).
TUNEL="${TUNEL:-cloudflare}"
SAUDE_INTERVALO="${SAUDE_INTERVALO:-300}"
ULTIMO=""
SAUDE_ANTES=""
PROXIMA_SAUDE=$(( $(date +%s) + SAUDE_INTERVALO ))

endereco() {
  if [ "$TUNEL" = "ngrok" ]; then
    curl -fsS --max-time 5 http://tunel-ngrok:4040/api/tunnels 2>/dev/null \
      | sed -n 's/.*"public_url":"https:\/\/\([^"]*\)".*/\1/p' | head -n 1
  else
    curl -fsS --max-time 5 http://tunel:2000/quicktunnel 2>/dev/null | sed -n 's/.*"hostname":"\([^"]*\)".*/\1/p'
  fi
}

ping_hc() {
  [ -n "${HC_URL:-}" ] || return 0
  curl -fsS --max-time 10 --retry 3 -o /dev/null "$@" 2>/dev/null || echo "Vigia: não consegui avisar o healthchecks.io."
}

saude() {
  RESP=$(curl -sS --max-time 90 -X POST http://n8n:5678/webhook/oferto-saude \
    -H 'content-type: application/json' -d '{}' -w '\n%{http_code}' 2>/dev/null)
  CODIGO=$(printf '%s\n' "$RESP" | tail -n 1)
  CORPO=$(printf '%s\n' "$RESP" | sed '$d')
  if [ "$CODIGO" = "200" ] && printf '%s' "$CORPO" | grep -Eq '"ok": *true'; then
    AGORA="ok"
    ping_hc "$HC_URL"
  elif [ "$CODIGO" = "200" ]; then
    AGORA="problema: $CORPO"
    ping_hc --data-raw "$CORPO" "$HC_URL/fail"
  else
    AGORA="o n8n não respondeu à conferência de saúde (HTTP ${CODIGO:-000})"
  fi
  # Só escreve no log quando o resultado muda.
  if [ "$AGORA" != "$SAUDE_ANTES" ]; then
    echo "Vigia: saúde $AGORA"
    SAUDE_ANTES="$AGORA"
  fi
}

echo "Vigia: aguardando o endereço do túnel ($TUNEL)..."
[ -n "${HC_URL:-}" ] && echo "Vigia: healthchecks.io ligado (ping a cada $SAUDE_INTERVALO s)."
while true; do
  HOST=$(endereco)
  if [ -n "$HOST" ] && [ "$HOST" != "$ULTIMO" ]; then
    # Espera o endereço novo responder na internet antes de registrar no Telegram (o filtro responde 404 em "/").
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
  if [ "$(date +%s)" -ge "$PROXIMA_SAUDE" ]; then
    PROXIMA_SAUDE=$(( $(date +%s) + SAUDE_INTERVALO ))
    saude
  fi
  sleep 15
done
