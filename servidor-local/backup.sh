#!/bin/sh
# Backup diário do n8n (contêiner "backup"):
#  - banco: cópia com "sqlite3 .backup", segura com o n8n ligado;
#  - arquivo config: tem a chave de criptografia do n8n (sem ela as credenciais do banco não abrem).
# Gera $DESTINO/oferto-AAAA-MM-DD.tar.gz uma vez por dia e guarda só os $BACKUP_DIAS mais recentes.
# O arquivo tem os tokens dos bots (estão na bfx_config): não compartilhe.
DADOS="${DADOS:-/dados}"
DESTINO="${DESTINO:-/backups}"
DIAS="${BACKUP_DIAS:-7}"
DB="$DADOS/database.sqlite"

if ! command -v sqlite3 >/dev/null 2>&1; then
  if ! apk add --no-cache sqlite tzdata >/dev/null; then
    echo "Backup: não consegui instalar o sqlite (sem internet?). Tento de novo em 10 min."
    sleep 600
    exit 1
  fi
fi
mkdir -p "$DESTINO"

fazer_backup() {
  ARQ="$DESTINO/oferto-$(date +%Y-%m-%d).tar.gz"
  [ -f "$ARQ" ] && return 0
  if [ ! -f "$DB" ]; then
    echo "Backup: $DB ainda não existe (o n8n já subiu uma vez?)."
    return 1
  fi
  TMP=$(mktemp -d)
  OK=""
  if (sqlite3 -cmd ".timeout 30000" "$DB" "VACUUM INTO '$TMP/database.sqlite';" 2>/dev/null \
    || (rm -f "$TMP/database.sqlite" && sqlite3 -cmd ".timeout 30000" "$DB" ".backup '$TMP/database.sqlite'")) \
    && [ "$(sqlite3 "$TMP/database.sqlite" 'PRAGMA quick_check;')" = "ok" ]; then
    if [ -f "$DADOS/config" ]; then cp "$DADOS/config" "$TMP/config"; fi
    if tar czf "$ARQ.tmp" -C "$TMP" . && mv "$ARQ.tmp" "$ARQ"; then OK=1; fi
  fi
  rm -rf "$TMP" "$ARQ.tmp"
  # Se o sqlite criou os arquivos -wal/-shm, devolve ao dono do banco (o usuário do n8n).
  for f in "$DB-wal" "$DB-shm"; do
    if [ -f "$f" ]; then chown "$(stat -c %u:%g "$DB")" "$f" 2>/dev/null; fi
  done
  if [ -z "$OK" ]; then
    echo "Backup: falhou ao copiar o banco. Tento de novo em 1 h."
    return 1
  fi
  echo "Backup: $ARQ criado."
  # Retenção: apaga os mais antigos (o nome tem a data, então a ordem alfabética é a cronológica).
  ls -1 "$DESTINO"/oferto-*.tar.gz 2>/dev/null | sort -r | tail -n +"$((DIAS + 1))" | while read -r velho; do
    rm -f "$velho" && echo "Backup: $velho apagado (mais de $DIAS dias)."
  done
}

echo "Backup: 1 cópia por dia em $DESTINO, guardando $DIAS dias."
while true; do
  fazer_backup
  [ -n "${UMA_VEZ:-}" ] && exit 0
  sleep 3600
done
