#!/bin/bash
# Para o n8n e o mock do teste local (só os PIDs que o rodar.sh guardou; sem pkill, para não atingir a produção).
cd "$(dirname "$0")"
[ -f tmp/pids ] && kill $(cat tmp/pids) 2>/dev/null; rm -f tmp/pids; echo parado
