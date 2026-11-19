# W1-build · Fase 2 (P1-03, P1-04, P1-06, P1-14)

Arquivos: `build/build-workflows.js`, `servidor-local/preparar.sh`, `teste-local/*`, `package.json` (scripts), `tests/w1-build.test.js`.

## P1-03: build não é mais deploy
- `npm run build` grava **só** os 6 workflows em `n8n/workflows/` (ou em `--out <dir>`). Não toca `servidor-local/` nem `docs/CONFIG.md`.
- `--local-out <dir>` grava também os 8 do servidor local (com `id` fixo). Recusa `servidor-local/` (e subpastas) sem `--release`; `--out` nunca aceita `servidor-local/`.
- `npm run release` (`--release`) é o único caminho que escreve em `servidor-local/workflows/`. Ele **regenera** os 8 arquivos em vez de copiar de outra pasta: o build é determinístico (UUIDs por hash), então o resultado é o mesmo de uma cópia, sem manter um terceiro conjunto de JSON de 40 MB no repo (P4-10).
- `docs/CONFIG.md` só com `--doc-config` (`npm run build:doc-config`).
- `preparar.sh` sai com código 0 sem importar nada se `PUBLICAR_WORKFLOWS` não for `sim` (aceita sim/s/yes/y/true/1, sem diferenciar caixa). O compose já repassa `PUBLICAR_WORKFLOWS: ${PUBLICAR_WORKFLOWS:-nao}`.
- Validação: build com `--out`/`--local-out` num diretório temporário gerou os 8 arquivos sem erro; `git status` de `servidor-local/workflows`, `n8n/workflows` e `docs/CONFIG.md` ficou limpo.

## P1-06: portão único de dry-run
- `httpTelegram`, `httpTelegramArquivo` e `httpWhatsAppAuto` marcam o nó com `__portao`. O `WF.add` expande cada um em 4 nós:
  `<nome> · portão` (Switch) → saída 0 `<nome> · envio real` (o HTTP original, com retry etc.) / saída 1 `<nome> · simulado` (Code, sem rede) → `<nome>` (Code que repassa a resposta com `pairedItem`).
  Quem liga para `<nome>` entra no portão; `$('<nome>').all()`/`.isExecuted` e as conexões de saída continuam funcionando sem mudar nenhum chamador.
- Expressão do portão (`PORTAO_REAL`): envio real **só** se `cfg.publicacao.dry_run === false` ou texto `nao/não/n/no/false/0/off/desligado`. Chave ausente, `cfg.publicacao` ausente, `sim` ou qualquer valor estranho = dry-run. Erro na expressão para o workflow (não envia).
- Resposta simulada (`simularResposta`, embutida no Code node via `toString`):
  - envio de mensagem (`send*`, `copyMessage`, `forwardMessage`, `editMessage*`): `{ ok:true, result:{ message_id, date, chat:{id}, message_thread_id?, text?/caption?, simulado:true }, dry_run:{...} }`;
  - `sendMediaGroup`: lista de mensagens;
  - métodos que só confirmam (`set*`, `pin*`, `delete*`, `answer*`, `close/reopen/edit*ForumTopic`, `ban/unban/restrict/promote`...): `{ ok:true, result:true }`;
  - leituras e criações (`getMe`, `getChat`, `getWebhookInfo`, `createForumTopic`, `createChatInviteLink`...): `{ ok:false, error_code:0, description:'DRY-RUN: ...' }`. **Decisão:** não inventar username, tópico, link de convite ou estado de webhook que seriam gravados na `bfx_config`. Consequência: em dry-run o Setup lista esses itens como ❌ "DRY-RUN" e o 91 · Saúde pode marcar alerta (o alerta em si também é simulado).
  - WhatsApp: `{ ok:true, result:{ message_id, simulado:true }, dry_run:{...} }`. Não registra a URL (pode conter token).
- **message_id sintético é negativo** (`-(ms % 1e9 * 1000 + i) - 1`). O Telegram nunca usa id negativo, então um post simulado jamais coincide com um real: depois de desligar o dry-run, editar/fixar/apagar um id simulado falha no Telegram em vez de atingir um post real. `lib/fluxos.js:602` já ignora `message_id <= 0` na busca de repost.
- Log: cada envio simulado faz `console.log('[oferto dry-run] {simulado, no, tipo, metodo, bot, chat_id, message_thread_id, em}')` (sem texto do post nem token) e o mesmo objeto fica em `json.dry_run` no histórico da execução. Não gravei em tabela porque `lib/tabelas.js` não é meu (ver handoff).
- Teste `tests/w1-build.test.js` gera os workflows em memória e garante: todo nó HTTP que fala com a Bot API (URL com `telegram.api`/`bot_token`) ou WhatsApp é `· envio real` e só é alcançável pela saída 0 do portão com a expressão exata; todo HTTP fora do portão é GET ou o POST assinado da Shopee; nenhum Code node usa `this.helpers.httpRequest`, `fetch` ou `require('http(s)')`.
- Limite conhecido: os nós GET de leitura (`$json.url`) não são checados quanto ao destino em tempo de execução; a lib não gera URLs da Bot API para eles hoje.

## P1-14: `httpTelegramArquivo`
- Multipart: `contentType: 'multipart-form-data'` com um parâmetro `formBinaryData` (nome do campo em `arquivo.campo`, padrão `photo`; binário em `arquivo.binario`, padrão `data`). Os outros campos do payload vão na query string (a Bot API aceita), com objetos em JSON. Intervalo padrão 700 ms, timeout 60 s. Atrás do mesmo portão.
- **NÃO VERIFICADO** contra um n8n em execução: nomes dos parâmetros multipart do HTTP Request 4.2 (`bodyParameters.parameters[].parameterType/inputDataFieldName`) e `sendQuery/specifyQuery/jsonQuery`. Validar no e2e quando o render (P1-13) existir. A fábrica ainda não é usada por nenhum workflow (quem integra o render liga os nós).

## P1-04: e2e
- Porta `N8N_TESTE_PORTA` (padrão 5690), gravada em `teste-local/tmp/porta` e lida por `tg.sh`, `cenarios.py` e `prep.js`. Aborta se a porta for 5678, se algo já responder em `/healthz` na porta escolhida, ou se um contêiner `oferto-*` publicar essa porta. Broker de task runner em `N8N_TESTE_BROKER_PORTA` (padrão 5691) para não colidir com o padrão 5679.
- Removido `pkill -x "n8n start"`/`"n8n task-runner"` de `rodar.sh` e `parar.sh`: no Linux o `pkill` enxerga processos de contêiner e poderia derrubar a produção. Agora só os PIDs gravados em `tmp/pids`.
- O e2e faz o build em `teste-local/tmp/build/{cloud,local}`; `prep.js` lê de lá (antes copiava `90/91` de `servidor-local/workflows/`).
- `prep.js` grava `publicacao.dry_run=nao` na config de teste, porque o sink do e2e é o `mock.js` (127.0.0.1:8787). A 1ª execução do Setup, antes da config de teste, roda em dry-run (antes já rodava sem token).
- Não rodei o e2e (regra da tarefa).
