#!/bin/sh
# Importa e publica os workflows de /oferto/workflows quando o conteúdo muda.
# Seguro por padrão (P1-03): só importa com PUBLICAR_WORKFLOWS=sim (no .env do compose).
# O conteúdo de servidor-local/workflows/ só muda com "npm run release" (o "npm run build" não escreve aqui).
# Atenção: alterações feitas nos workflows pelo painel são substituídas na próxima importação.
set -e
case "$(printf '%s' "${PUBLICAR_WORKFLOWS:-nao}" | tr 'A-Z' 'a-z')" in
  sim|s|yes|y|true|1) ;;
  *)
    echo "PUBLICAR_WORKFLOWS não é 'sim': workflows NÃO importados (nada muda no n8n)."
    exit 0
    ;;
esac
MARCA=/home/node/.n8n/.oferto-workflows
HASH=$(cat /oferto/workflows/*.json | md5sum | cut -d' ' -f1)
if [ -f "$MARCA" ] && [ "$(cat "$MARCA")" = "$HASH" ]; then
  echo "Workflows já estão atualizados."
  exit 0
fi
for f in /oferto/workflows/*.json; do
  echo "Importando $(basename "$f")"
  n8n import:workflow --input="$f"
done
for id in wfSetup000000001 wfRouter00000001 wfShopee00000001 wfRelat000000001 wfRadar000000001 wfGuard000000001 wfTunel000000001 wfSaude000000001; do
  n8n publish:workflow --id="$id"
done
echo "$HASH" > "$MARCA"
echo "Workflows importados e publicados."
