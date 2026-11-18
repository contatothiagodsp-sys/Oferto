# A4 — Engenheiro de Automação · Fase 0-1 (descoberta + backlog)

Data: 2026-11-18 · Base: commit `f6ab859` (grafo graphify do mesmo commit).
Escopo: coleta, fila de envio, ritmo/limite diário, digest, dry-run, integração Telegram
(`lib/telegram.js`, `lib/fluxos.js`, `lib/agentes.js`, `lib/grupo.js`, `lib/comunidade.js`, `build/build-workflows.js`).

Nada de código foi alterado. Nenhuma chamada à API do Telegram foi feita. Comandos executados:
`npm test` (88/88, os testes não importam `http`/`https`/`net` nem chamam `fetch`; verificado com grep em `tests/`)
e `docker ps` (só leitura, para conferir o estado de produção).

---

## 1. Estado atual de produção (RISCO — decisão do dono, não minha)

- `docker ps` (18/11): `oferto-n8n-1 Up 31 minutes`, `oferto-vigia-1`, `oferto-tunel-1`, `oferto-filtro-1` e `oferto-backup-1` estão rodando.
- `servidor-local/preparar.sh:15-16` publica (ativa) os 8 workflows, entre eles `wfRadar000000001` e `wfGuard000000001`.
- O radar roda a cada 2 min (`build/build-workflows.js:1032`, cron `*/2 * * * *`).
- `radar.publicar_direto` tem padrão `sim` (`lib/config.js:107`). Commit `cea6a19`: "Radar volta a publicar sozinho". Em `docs/SALVAMENTO-PROJETO.md:85` consta "3 ofertas reais publicadas como foto".
- **Conclusão:** é muito provável que o sistema esteja publicando de verdade agora. Isso vai contra a regra "zero publicação real nesta etapa".
- Existe um botão de desligar sem mexer em código: `/modo aprovar` grava `radar.publicar_direto=nao` e `auto.publicar_direto=nao` (`lib/config.js:706-724`). Outra opção é `radar.ativo=nao` (`lib/config.js:106`). **Eu não fiz nada disso.** Quem decide e aciona é o dono.

## 2. Decisões técnicas que proponho (para o sintetizador)

### D1 — Imagem 1080x1080 em Node, custo zero: serviço auxiliar `render` + `lib/imagem.js`
- **O que existe hoje:** o projeto não tem nenhuma dependência npm (`package.json` sem `dependencies`) e nenhuma biblioteca de imagem (grep por sharp/canvas/jimp/resvg/satori/puppeteer/Pillow: nada). As fotos são URLs de terceiros: CDN do Promobit (`lib/radar.js:483-486`, `lib/lojas.js:320`) ou logo da loja nos posts de cupom (`lib/radar.js:771`).
- **Escolha:** `lib/imagem.js` como função pura que monta um SVG 1080x1080 por categoria e devolve uma string. Assim dá para testar com `node --test` sem rede. Um contêiner pequeno `render` (Node 20 + `sharp`) baixa as fotos, compõe a grade de 1 a 6 fotos, rasteriza o SVG para JPEG **em memória** e responde em `POST /render`. As fontes OFL (ex.: Inter ou Roboto) ficam dentro da imagem do contêiner.
- **Por que não Pillow:** exigiria um segundo runtime (Python) num projeto que é Node, e a lógica e os testes já estão em `node --test`.
- **Por que não um Code node do n8n:** o Code node não carrega módulos externos sem `NODE_FUNCTION_ALLOW_EXTERNAL` e uma imagem n8n customizada. Hoje a imagem é a oficial fixa, `n8nio/n8n:2.47.7` (`servidor-local/docker-compose.yml:28,38`).
- **Por que não o nó "Edit Image" do n8n:** depende do GraphicsMagick dentro da imagem 2.47.7 (NÃO VERIFICADO) e o controle de layout e fontes é fraco.
- **Alternativa de reserva:** `@resvg/resvg-js` (SVG→PNG) no lugar do `sharp`, caso o binário do sharp dê problema no Docker Desktop/WSL. NÃO VERIFICADO no ambiente.
- **Licenças:** sharp (Apache-2.0) e resvg-js (MPL-2.0), segundo meu conhecimento. Confirmar a versão exata antes de fixar.

### D2 — Envio de foto em memória exige multipart
- `httpTelegram` manda tudo como JSON (`build/build-workflows.js:176-193`, `contentType: 'json'`). Com JSON só dá para mandar `photo` como URL ou `file_id`.
- `sendPhoto` com arquivo gerado e `setChatPhoto` precisam de `multipart/form-data`. Pela documentação da Bot API, `setChatPhoto` aceita **só** upload, sem URL nem file_id.
- **Proposta:** uma fábrica nova, `httpTelegramArquivo` (HTTP Request do n8n com corpo multipart e campo binário). O `file_id` devolvido no primeiro envio é guardado e reaproveitado nas cópias para os canais (`postCanal`, `lib/fluxos.js:493-506`), sem repetir o upload.

### D3 — Dry-run num ponto só
- Há 38 nós `httpTelegram(` no build (contado com Select-String). Pôr um "portão" nó a nó seria frágil.
- **Ponto único proposto:** a expressão de URL dentro de `httpTelegram` (`build/build-workflows.js:182`). Com `envio.dry_run=sim` (padrão `sim`), toda chamada do bot `grupo` com efeito público vai para um sink local que responde `{ok:true,result:{message_id:…}}` falso e grava o payload. Efeito público quer dizer: sendPhoto, sendMessage, sendMediaGroup, edit*, setChat*, pinChatMessage, deleteMessage(s), createForumTopic, closeForumTopic etc.
- O sink pode ser o próprio serviço `render` (rota `/bot<token>/<metodo>`) ou o `teste-local/mock.js`, que já existe (`teste-local/rodar.sh:2,20`).
- Já existe a chave `telegram_api` (`lib/config.js:96,268`), que redireciona a API inteira. Ela não serve como dry-run porque também desliga os bots de admin e o webhook.

### D4 — Fila de envio + despachante com horário
- Hoje a publicação é síncrona dentro da execução do radar: Finalizar → Publicar lote → Telegram (`build/build-workflows.js:897-918`). Não há fila, revalidação nem cota diária.
- **Proposta:** uma Data Table `bfx_fila` com os estados `pendente → aprovada → revalidando → enviada | rejeitada_por_revalidacao | rejeitada_sem_imagem | revisao_humana | digest`.
- O radar só **enfileira**. Um workflow novo, "06 · Despachante", roda nos horários configurados (ex.: 09h, 12h, 15h, 19h, 21h). Ele aplica, nesta ordem: cota diária por canal → revalidação de preço e cupom → portão de imagem → dry-run → envio.

### D5 — Portão de imagem: "post sem imagem é rejeitado antes da fila"
- **O que impede hoje:** `postGrupo` volta para `sendMessage` quando não há imagem (`lib/fluxos.js:482-483`). `limiteTelegram` reenvia como texto quando a foto é recusada (`lib/fluxos.js:895-899`). `posts.foto=nao` desliga a foto de vez (`lib/config.js:59`). O radar aceita candidato com `imagem: ''` (`lib/radar.js:1286`).
- **Proposta:** uma função pura `exigirImagem(oferta)`, chamada **antes de enfileirar** (ao fim de `finalizarRadar` e em `prepararPublicacao`). Sem foto de produto válida, ou se o render falhar, a oferta fica com `rejeitada_sem_imagem` e não chega a "Mensagens lote".
- Junto: remover o fallback para texto (`ch.fallback`) e tirar a opção `posts.foto=nao`.
- Logo de loja **não conta** como imagem do produto. Exceção a decidir: posts de cupom de loja (ver pergunta).

### D6 — `/setup` de canal
- **O que já existe:** o workflow 00-setup cuida do bot e do supergrupo (`lib/fluxos.js:1123-1199`, com `lib/grupo.js:123-183`: setChatDescription + pinChatMessage). Também existe o onboarding automático quando o bot vira admin de um canal (`lib/comunidade.js:101-214`). Ele lê os direitos do update `my_chat_member` (`can_change_info`, `can_post_messages`, `can_pin_messages`) e faz setChatDescription (`.slice(0,255)`, linha 119), boas-vindas, pin e convite.
- **O que falta:** um comando `/setup` (não existe no roteador `lib/telegram.js`), `getChatMember`, `setChatTitle`, `setChatPhoto` e a mensagem que ensina o admin a liberar cada permissão que faltar.
- **Proposta:** `lib/setup-canal.js` com funções puras no padrão de duas rodadas de `grupo.js`:
  1. `planejarSetupCanal` → `getMe` + `getChatMember(chat_id, bot_id)`.
  2. `avaliarPermissoes` → lista o que falta. Em canal, fixar exige `can_edit_messages`; em supergrupo, `can_pin_messages`. Conferir na documentação. Para mudar título, descrição e foto: `can_change_info`.
  3. `executarSetupCanal` → setChatTitle, setChatDescription (≤255), setChatPhoto (multipart, imagem do `render`), sendMessage e pinChatMessage. Tudo atrás do dry-run.
- Para a mensagem ao admin, reaproveitar `erroAmigavel` (`lib/fluxos.js:1204-1211`) e `ERROS` (`lib/grupo.js:185-191`).
- A Bot API não cria canais. O `/setup` só atua em canal que já existe e onde o bot já é admin.

### D7 — Ritmo de 3 a 5 por dia por canal
- **Hoje:** até 8 por ciclo de 2 min (`lib/radar.js:257-260`, `lib/radar.js:658-682`; `radar.max_por_ciclo=4`, `lib/config.js:114`). Não há teto diário por canal. Só o Top tem limite (`TOP_LIMITE = 5`, `lib/fluxos.js:22`). A anti-fadiga só muda a ordem dos candidatos, não limita (`lib/agentes.js:180-192`).
- **Proposta:**
  - chaves `ritmo.max_dia` (padrão 5), `ritmo.min_dia` (3) e `ritmo.intervalo_min` (ex.: 120 min);
  - contagem pela `bfx_posts`, que já registra `plataforma` tg/tgc, `ts` e `categoria` (`lib/fluxos.js:480`);
  - o que passar do teto vai para o digest ou sai da fila.

### D8 — Digest
- **O que existe:** a vitrine automática das 21h15, "Top 5 Ainda Ativas" (`lib/comunidade.js:1027`, `vitrine.auto_noite`, `lib/config.js:84`), o `/resumao` e o relatório diário das 22h05 para os admins (`build/build-workflows.js:1091-1111`).
- **Proposta:** `ritmo.modo=digest` junta as ofertas aprovadas do dia num único post com grade de 1 a 6 fotos (D1) e legenda curta.

### D9 — Revalidação antes do envio
- Não existe hoje: grep por `revalid` não acha nada.
- O guardião já busca a página do produto e detecta esgotado ou queda de preço (`lib/comunidade.js:864-884`, `avaliarExpiracaoPagina` / `avaliarQuedaExtraPagina`).
- **Proposta:** reaproveitar essas funções no Despachante (D4). Se o preço subiu mais de 3% ou o cupom sumiu, a oferta fica `rejeitada_por_revalidacao` e o motivo é registrado.

### D10 — Guardião x imagem com preço desenhado
- `edicoesPost` só edita texto e legenda (`lib/edicao.js:13-25`).
- Com o preço **dentro da imagem**, o "📉 BAIXOU AINDA MAIS" e o "⛔ encerrada" (`lib/comunidade.js:873-890`) deixariam a imagem com o preço antigo. Isso é risco de CDC.
- **Proposta:** `editMessageMedia` com a imagem regerada (multipart) ou uma tarja "ENCERRADA" gerada pelo `render`.

## 3. Suposições
- S1: "canal" no requisito quer dizer os canais por categoria (`canal.<cat>`, `lib/config.js:155`) e/ou o supergrupo com tópicos (`grupo_id`). As cotas valem por destino (chat_id + thread).
- S2: as 5 categorias de template do requisito (Eletrônicos, Casa, Moda, Games, Beleza) não batem com as 8 atuais (top, casa, moda, beleza, perfumes, saude, bebe, tech, em `lib/config.js:10-19`). "Games" hoje está dentro de `tech` ("Tech & Games"). Precisa de um mapeamento: virou pergunta.
- S3: Magalu está na whitelist do requisito, mas **não** aparece em `TODAS_LOJAS_RADAR` (`lib/config.js:42-47`). Sem coleta da Magalu, a whitelist fica com 3 lojas na prática.
- S4: não verifiquei brmarket-mcp, ReefAPI, Afilimax nem o domínio oferto.ai, porque estão fora do meu foco (A4). Ficam como NÃO VERIFICADO para A2/A3.
