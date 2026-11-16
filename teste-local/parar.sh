#!/bin/bash
# Para o n8n e o mock do teste local.
cd "$(dirname "$0")"
[ -f tmp/pids ] && kill $(cat tmp/pids) 2>/dev/null; pkill -x "n8n start" 2>/dev/null; pkill -x "n8n task-runner" 2>/dev/null; rm -f tmp/pids; echo parado
