#!/bin/bash
# Teste local de ponta a ponta: n8n de verdade + Telegram/Shopee falsos (mock.js na porta 8787).
# Requisitos: Node >= 24 e o pacote n8n instalado em $N8N_DIR (ex.: npm i n8n@2.47.7 numa pasta à parte).
#   N8N_DIR=/caminho/para/pasta-com-node_modules ./teste-local/rodar.sh
# Porta do n8n de teste: N8N_TESTE_PORTA (padrão 5690). A 5678 é a da produção e é recusada (P1-04).
# O build vai para teste-local/tmp/build (nunca para servidor-local/, P1-03).
# Depois: ./teste-local/tg.sh '<json do update>'  e  node teste-local/inspect.js <workflowId> [nó|*]
set -e
cd "$(dirname "$0")"
: "${N8N_DIR:?defina N8N_DIR (pasta onde o n8n foi instalado com npm)}"
PORTA="${N8N_TESTE_PORTA:-5690}"
case "$PORTA" in ''|*[!0-9]*) echo "N8N_TESTE_PORTA inválida: $PORTA"; exit 1 ;; esac
if [ "$PORTA" = 5678 ]; then
  echo "ABORTADO: a porta 5678 é a do n8n de produção (oferto-n8n). Use outra em N8N_TESTE_PORTA."; exit 1
fi
# Algo já responde na porta de teste? Pode ser outro n8n (inclusive a produção mapeada em outra porta): não mexe.
if curl -s -m 2 "http://127.0.0.1:$PORTA/healthz" >/dev/null 2>&1; then
  echo "ABORTADO: já existe um serviço em 127.0.0.1:$PORTA. Pare-o (./parar.sh) ou escolha outra N8N_TESTE_PORTA."; exit 1
fi
# A porta de teste não pode ser a publicada por um contêiner da produção (oferto-*).
if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null | grep -E '^oferto' | grep -q ":$PORTA->"; then
  echo "ABORTADO: a porta $PORTA está publicada por um contêiner oferto-* (produção)."; exit 1
fi
N8N="$N8N_DIR/node_modules/n8n/bin/n8n"
mkdir -p tmp
echo "$PORTA" > tmp/porta
export N8N_USER_FOLDER="$PWD/tmp/home" N8N_DIAGNOSTICS_ENABLED=false N8N_PERSONALIZATION_ENABLED=false N8N_SECURE_COOKIE=false
export N8N_LISTEN_ADDRESS=127.0.0.1 N8N_PORT="$PORTA" GENERIC_TIMEZONE=America/Sao_Paulo N8N_LOG_LEVEL=warn
export N8N_RUNNERS_BROKER_PORT="${N8N_TESTE_BROKER_PORTA:-5691}"
export NO_PROXY=localhost,127.0.0.1 no_proxy=localhost,127.0.0.1
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy
# Para só os processos de uma rodada anterior DESTE teste (PIDs guardados). Sem pkill: no Linux o pkill
# enxerga os processos dos contêineres e poderia derrubar o n8n de produção.
{ [ -f tmp/pids ] && kill $(cat tmp/pids); } 2>/dev/null || true; rm -f tmp/pids; sleep 2
rm -rf tmp/home tmp/mock-log.jsonl tmp/segredo tmp/build tmp/wf
(cd .. && node build/build-workflows.js --out teste-local/tmp/build/cloud --local-out teste-local/tmp/build/local >/dev/null)
N8N_TESTE_PORTA="$PORTA" node prep.js
nohup node "$PWD/mock.js" > tmp/mock.out 2>&1 &
echo $! > tmp/pids
for f in tmp/wf/*.json; do node "$N8N" import:workflow --input="$f" >/dev/null 2>&1; done
for id in wfSetup000000001 wfRouter00000001 wfShopee00000001 wfRelat000000001 wfConfTeste00001 wfTunel000000001 wfSaude000000001; do node "$N8N" publish:workflow --id=$id >/dev/null 2>&1; done
nohup node "$N8N" start > tmp/n8n.out 2>&1 &
echo $! >> tmp/pids
for i in $(seq 1 60); do sleep 2; curl -s "http://127.0.0.1:$PORTA/healthz" | grep -q ok && break; done
# Dispara um workflow de teste; repete enquanto o webhook ainda não estiver registrado (404 logo após subir).
hook() {
  for i in $(seq 1 30); do
    code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$PORTA/webhook/teste-$1" -H 'content-type: application/json' -d '{}')
    [ "$code" = 200 ] && break; sleep 2
  done
  sleep "${2:-6}"
}
hook wfSetup000000001        # 1ª vez: cria tabelas e linhas de config
hook wfConfTeste00001 4      # grava a config de teste (tokens falsos, API em localhost:8787, publicacao.dry_run=nao)
hook wfSetup000000001 140    # 2ª vez: webhooks, tópicos e arrumação do grupo (6 s entre chamadas no grupo)
grep -o '"secret_token":"[^"]*"' tmp/mock-log.jsonl | head -1 | cut -d'"' -f4 > tmp/segredo || { echo "setup não chamou o Telegram falso; veja node teste-local/inspect.js wfSetup000000001 '*'"; exit 1; }
echo "n8n de teste pronto em http://127.0.0.1:$PORTA (log das chamadas: teste-local/tmp/mock-log.jsonl)"
