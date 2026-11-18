# Auditoria técnica (A1), fase 0-1

Data: 18/11/2026. Commit auditado: `f6ab859`. Auditor: A1 (código, arquitetura, segurança, dependências, Docker, CI e testes).
Escopo: só leitura. Nenhum código foi alterado, nenhuma API do Telegram foi chamada e nada foi publicado.

## 1. Resumo executivo

- **Produção está ligada e publicando sozinha agora.** `docker ps` (18/11) mostra `oferto-n8n-1`, `oferto-tunel-1`, `oferto-filtro-1`, `oferto-vigia-1` e `oferto-backup-1` rodando. O radar dispara a cada 2 min (`build/build-workflows.js:1032`), e `radar.publicar_direto` vem ligado por padrão (`lib/config.js:107`, `lib/config.js:213`). O commit `cea6a19` e o `docs/SALVAMENTO-PROJETO.md:77-85` registram "3 ofertas reais publicadas". Isso **conflita** com a exigência de "zero publicação real nesta etapa". Não mexi em nada; isso virou o risco R-01 e uma pergunta.
- **Os testes estão saudáveis.** `npm test` passou 88/88 em cerca de 0,8 s, sem rede: `lib/` é puro (sem `fetch`, `http` ou `child_process`) e os testes só usam `node:fs`, `node:vm` e `node:crypto`.
- **Não há dependências npm.** O `package.json` não tem `dependencies`, então a superfície de supply-chain é mínima.
- **Não achei segredos no repositório nem no histórico git.** Busquei padrões de token de bot Telegram, `sk-`, `ghp_`, `AKIA` e chaves PEM. Só aparecem fixtures de teste (`SHOPEE_SECRET = 'segredo-shopee'`). Mas o `.gitignore` **não cobre `.env`** nem `graphify-out/`.
- **Os requisitos-alvo estão quase todos ausentes ou parciais:**
  - não existe imagem gerada (o post usa a URL da foto da loja);
  - a legenda passa muito de 200 caracteres;
  - não existe mediana de 30 dias;
  - não existe whitelist de autopublicação;
  - não existe revalidação pré-envio com regra de 3%;
  - não existe dry-run;
  - não existe teto diário por canal;
  - o `/setup` de canal é parcial;
  - Docker não tem Dockerfile, healthcheck nem `.env.example`;
  - não existe CI.
- **Restrição de arquitetura decisiva:** toda a lógica roda dentro de Code nodes do n8n, num sandbox sem `Buffer`, `require` ou `crypto` (`docs/SALVAMENTO-PROJETO.md:45`). Gerar imagem 1080x1080 em memória **não cabe no Code node** e exige um serviço à parte (ver D-01).

## 2. Arquitetura atual (como está)

```
Fontes públicas (Promobit, t.me/s, Gatry, Shopee API) --> n8n 04 Radar (*/2 min)
   --> lib/radar.js: seleção, desempacotamento de link, mercado (Zoom + busca Amazon), selo 90d
   --> avaliarOfertaReal --> postGrupo/postCanal (sendPhoto com URL da loja, fallback para texto)
n8n 01 Router (webhook Telegram via Caddy + cloudflared) --> comandos, aprovação, onboarding de canal
n8n 05 Guardião (15,45 8-23) --> encerra esgotadas, edita "baixou ainda mais"
servidor-local/: n8n 2.47.7 + Caddy (filtro) + cloudflared/ngrok + vigia + backup (SQLite)
```

- O código-fonte fica em `lib/*.js` (cerca de 11,5 mil linhas). O `build/build-workflows.js` embute a `lib/` nos Code nodes e gera `n8n/workflows/*.json` e `servidor-local/workflows/*.json` (`build/build-workflows.js:11`, `build/build-workflows.js:1244-1245`).
- Os dois conjuntos de JSON só diferem pelo campo `id`. Não existe teste que garanta que o JSON gerado está em dia com a `lib/` (risco de drift se alguém esquecer `npm run build`).
- Configuração e segredos (tokens de bot, segredo do webhook, chave da Shopee) ficam na Data Table `bfx_config` do n8n (`lib/config.js:56-64`), em SQLite sem criptografia própria. O compose avisa para não pôr tokens no `.env` (`servidor-local/docker-compose.yml:5`).

## 3. Estado vs. requisitos-alvo

| # | Requisito | Estado | Evidência |
|---|---|---|---|
| 1a | `/setup` do bot como admin de canal | **Parcial**. O onboarding automático é disparado por `my_chat_member`: cria convite, faz `setChatDescription` (cortado em 255) e manda boas-vindas, que depois são fixadas com `pinChatMessage`. Faltam `getChatMember` explícito, `setChatTitle`, `setChatPhoto`, um comando `/setup` sob demanda e instruções por permissão faltante (hoje só aparece "pendente de permissão Publicar"). | `lib/comunidade.js:101-153`, `lib/comunidade.js:183`, `lib/comunidade.js:196-198`; setup geral em `lib/fluxos.js:1123-1252` (só `getMe`, `getChat`, `setWebhook`) |
| 1b | Imagem 1080x1080 obrigatória, gerada em memória, por categoria, com grade de 1-6 fotos | **Ausente**. O post sai com `sendPhoto` usando a URL externa da loja e cai para texto com prévia se a foto falhar, ou seja, a imagem **não** é obrigatória. Não há biblioteca de render no repo. | `lib/fluxos.js:451-489`, `lib/lojas.js:319-341`, `lib/config.js:59` |
| 2a | desconto_real = (mediana_30d − preço_final) / mediana_30d | **Ausente**. O selo usa o **menor preço de 90d**, vindo do histórico próprio ou de um ref90 manual/Keepa, não da mediana de 30d. A "mediana" existente é a mediana **atual** do Zoom, não histórica. | `lib/selo.js:19-68`, `lib/mercado.js:338-412` |
| 2b | preço_final = preço + frete − cupom − cashback | **Ausente**. O frete não entra no cálculo ("Frete: confira na loja"). | `lib/textos.js:172-177` |
| 2c | Bloqueio desconto_real >= 12% | **Diferente**. O radar aceita: desconto >= 15% sobre o "De" **anunciado pela fonte**; desconto >= 8% se o produto está "em alta"; cupom >= 5%; queda vs. post anterior; ou mercado >= 10% mais caro. Sem referência de mercado, `avaliarPrecoMercado` **aprova** (`sem_referencia_mercado`). | `lib/radar.js:1129-1150`, `lib/mercado.js:346-358` |
| 2d | Whitelist (ML, Amazon, Magalu, Shopee) | **Ausente**. O radar autopublica em 28 lojas, incluindo farmácias, Shein e TikTok, e **não** inclui Magalu. | `lib/config.js:42-47`, `lib/config.js:109` |
| 2e | Categorias sensíveis vão para revisão humana | **Ausente**. `radar.categorias` inclui `saude` e `bebe` com autopublicação. | `lib/config.js:110`, `lib/config.js:27-29` |
| 2f | Revalidação pré-envio (preço subiu > 3% ou cupom sumiu, então cancela) | **Parcial**. A página da loja é lida no ciclo e o % é recalculado. O guardião confere **depois** de publicar, a cada 30 min. Não existe regra de 3% nem o log `rejeitada_por_revalidacao`. | `lib/radar.js:1016-1080`, `lib/extrator.js:1543`, `build/build-workflows.js:1122` |
| 2g | Integridade da referência (consistente/provisória) | **Parcial**. `origemMin90` dá a origem (keepa/manual/historico) e os dias cobertos, mas não há a classificação pedida. | `lib/selo.js:76-99` |
| 3a | Legenda <= 200 caracteres, 3 linhas, <= 2 emojis | **Ausente**. `textoTelegram` monta 5-8 linhas: gancho, título de até 105 caracteres, bloco de preço, selo, cupom e rodapé com aviso de preço e afiliado. O limite usado é 1024 (o da legenda do Telegram). Há 4 ou mais emojis por post. | `lib/textos.js:417-466`, `lib/copy.js:225-283` |
| 3b | Proibido urgência falsa | **Parcial**. O comentário diz "sem urgência falsa" (`lib/copy.js:3`), mas existem ganchos como "RECORDE DE PREÇO", "MÍNIMA HISTÓRICA", "RARIDADE NO HISTÓRICO", "BOMBANDO AGORA" e "TODO MUNDO PROCURANDO". "MÍNIMA HISTÓRICA" sai com min90 de histórico próprio com menos de 90d. Não há validador/lista negra na saída. | `lib/copy.js:34-53`, `lib/copy.js:69-78`, `lib/copy.js:255` |
| 3c | Link curto de marca própria | **Ausente**. Só existe desempacotamento e preservação de encurtadores de terceiros. O domínio oferto.ai **NÃO VERIFICADO**. | `lib/curtos.js:9` |
| 3d | Identificar link de afiliado | **OK**. `#publi` na 1ª linha, "Contém link de afiliado." e a frase de Associado da Amazon. | `lib/textos.js:12-15`, `lib/textos.js:179-182` |
| 4a | Ritmo de 3-5 ofertas/dia/canal | **Ausente**. São até 4-8 por ciclo de 2 min (cadência dinâmica), sem teto diário. | `lib/radar.js:658-686`, `lib/config.js:114` |
| 4b | Modo digest | **Parcial**. Existem Top 5 às 21h15 e relatório diário, mas não há digest substituindo posts. | `docs/SALVAMENTO-PROJETO.md:36` |
| 4c | Dry-run obrigatório | **Ausente**. Só há ganchos de teste (`telegram_api`, `radar.api_url`, `link_curto_api` apontando para mock). | `lib/config.js:96-97`, `lib/config.js:118`, `teste-local/mock.js` |
| 5 | Docker: Dockerfile, compose, `.env.example`, `.gitignore`, healthcheck, Windows | **Parcial**. O compose funciona no Docker Desktop (documentado). Faltam Dockerfile (só imagens oficiais), healthcheck, `.env.example`, e `.env` no `.gitignore`. | `servidor-local/docker-compose.yml:1-104`, `servidor-local/README.md:40-43`, `.gitignore:1-5` |
| 6 | CI | **Ausente**. Não existe `.github/`. | (diretório inexistente) |

## 4. Segurança

| Item | Achado | Severidade |
|---|---|---|
| Segredos no histórico git | Nada encontrado (só fixtures). | ok |
| `.gitignore` | Falta `.env`, `*.env` e `graphify-out/`. Hoje não existe `servidor-local/.env`, mas o README manda criá-lo com `NGROK_AUTHTOKEN` e `HC_URL` (`servidor-local/README.md:246+`). Um `git add .` subiria isso. | alta (fácil) |
| Backups | `servidor-local/backups/*.tar.gz` (12 MB e 44 MB) contêm o SQLite com os tokens dos bots **e** a chave de criptografia do n8n, sem cifrar (`servidor-local/backup.sh:2-6`). Estão ignorados pelo git (`.gitignore:4`) mas soltos no disco. | média |
| Webhook | O segredo é exigido e um update sem segredo é recusado (`lib/telegram.js:430-432`). A comparação usa `!==` e não é de tempo constante (baixo risco). | ok/baixa |
| Geração de segredo | `segredoAleatorio` usa `Math.random` + sha256 (`lib/fluxos.js:1254-1256`), que não é CSPRNG (limitação do sandbox). | baixa |
| Exposição | O painel n8n fica só em `127.0.0.1:5678`. O Caddy só deixa passar `POST /webhook/telegram-ofertas` (`servidor-local/Caddyfile`). | ok |
| Scraping | User-Agent falso (`WhatsApp/2.24…`) na busca Amazon e UA de Chrome no Zoom (`lib/mercado.js:10-20`). Risco de ToS (Amazon Associados) e de bloqueio. | média (compliance) |
| Repositório remoto | `origin` = GitHub. A visibilidade (público/privado) está **NÃO VERIFICADA**. | pergunta |

## 5. Testes e qualidade

- `npm test`: 88/88 passando, offline. A cobertura é forte em `lib/` e há testes que executam Code nodes extraídos dos JSON via `node:vm` (`tests/comunidade.test.js:334`, `tests/auto-link.test.js:404-422`).
- Não há teste de "JSON gerado == build atual da `lib/`" (drift).
- O e2e (`teste-local/rodar.sh`) usa n8n real na **porta 5678, a mesma da produção** (`teste-local/rodar.sh:11`) e faz `pkill -x "n8n start"` (`teste-local/rodar.sh:15`). Com o Docker de produção ligado, o teste local colide de porta, e o `tg.sh` acabaria postando no webhook de produção (seria recusado pelo segredo, mas é um acoplamento perigoso).
- Com `node --test tests/*.test.js`, o glob é expandido pelo shell. No PowerShell/cmd do Windows isso pode não expandir (**NÃO VERIFICADO** aqui; rodei via Git Bash).

## 6. Dependências externas citadas no prompt

| Serviço | O que verifiquei | Status |
|---|---|---|
| brmarket-mcp | Pacote npm `brmarket-mcp` (0.2.1 no Socket.dev). Busca/compara ML + Shopee + AliExpress. Confirmado: shippingCents ausente = frete desconhecido. **Cada chamada é paga via x402 em USDC (cerca de US$ 0,01/chamada, carteira cripto)**. Não confirmei limite de 30 req/min/IP, cache de 10 min nem **histórico de 30 dias**. | Conflita com "custo zero absoluto". Histórico de 30d **NÃO VERIFICADO**. |
| ReefAPI | Só um perfil FinOps (apis.io) dizendo que cobra por créditos. 1000 créditos grátis e endpoint de histórico de preço **NÃO VERIFICADOS**. | NÃO VERIFICADO |
| Afilimax | Nenhuma referência no repo e não pesquisei. | NÃO VERIFICADO |
| oferto.ai | Nenhuma referência no repo. | NÃO VERIFICADO |
| Keepa | Já integrado, plano **pago**, desligado se vazio (`lib/config.js:145`). | ok (opcional) |

Fontes: socket.dev/npm/package/brmarket-mcp, glama.ai/mcp/servers/ms9yhj1qir, apis.io/finops/reefapi/reefapi-finops/

## 7. Riscos priorizados

| ID | Risco | Prob. | Impacto | Mitigação proposta (não aplicada) |
|---|---|---|---|---|
| R-01 | O sistema publica de verdade hoje (radar a cada 2 min, `publicar_direto=sim`) durante uma fase que exige zero publicação real | certa | alto | O dono decide: `/modo aprovar` (já existe), pausar o workflow 04 ou manter. Pergunta aberta. |
| R-02 | "Falso desconto": o radar aceita % sobre o "De" anunciado pela fonte e aprova sem referência de mercado | alta | alto (reputação/CDC) | Bucket 2: mediana de 30d + preço_final + 3 bloqueios duros |
| R-03 | Saúde e bebê autopublicados | média | alto | Fila humana por categoria |
| R-04 | brmarket-mcp é pago (USDC), o que quebra o custo zero | certa (se adotado) | médio | Decidir fonte de histórico. Manter histórico próprio (`bfx_precos`) + Keepa opcional. |
| R-05 | Imagem gerada exige serviço fora do sandbox n8n | certa | médio | D-01: sidecar Node no compose |
| R-06 | Legenda <= 200 vs. avisos obrigatórios (#publi + afiliado + frase Amazon cerca de 90 caracteres) | certa | médio (compliance) | Decidir se o aviso vai para a imagem ou para uma 4ª linha. Pergunta. |
| R-07 | `.env` fora do `.gitignore` | média | alto | Adicionar `.env`, `*.env`, `graphify-out/` |
| R-08 | Backups com tokens + chave sem cifrar | baixa | alto | Cifrar (age/gpg) ou mover para fora do repo |
| R-09 | Drift entre `lib/` e workflows JSON | média | médio | Teste "build é idempotente" + CI |
| R-10 | Colisão do e2e local com a produção (porta 5678) | média | médio | Porta própria no `rodar.sh` |
| R-11 | Scraping com UA falso (Amazon/Zoom) | média | médio | Revisar ToS e preferir APIs oficiais/afiliado |

## 8. Backlog técnico sugerido (por bucket do prompt)

**Bucket 1: /setup + imagem obrigatória**
1. Comando `/setup <@canal>` no bot de aprovação: `getChatMember(bot)`, depois checar `can_change_info`, `can_post_messages`, `can_pin_messages` e `can_invite_users`. Em seguida `setChatTitle`, `setChatDescription` (<= 255), `setChatPhoto` (multipart com o PNG do sidecar) e `pinChatMessage`, mais um texto instruindo o admin para cada permissão faltante. Reaproveitar `planejarAutoOnboardingCanal` (`lib/comunidade.js:101`). Precisa de dry-run (item 4c) antes de qualquer teste real.
2. Serviço `render` (D-01): `POST /render` com {template, categoria, produto, preço, desconto, fotos[1..6]}, que devolve JPEG 1080x1080. O n8n chama via HTTP Request (binário) e faz `sendPhoto` multipart. Sem imagem, **não publica** (troca o fallback para texto atual).
3. 5 templates (Eletrônicos, Casa, Moda, Games, Beleza) com preço e desconto em destaque e fonte >= 32 px. Os testes de snapshot usam o hash do PNG gerado com fonte embutida.

**Bucket 2: anti-falso-desconto**
4. `lib/desconto.js` puro: `precoFinal({preco, frete, cupom, cashback})` com frete desconhecido = bloqueio ou revisão, `mediana30d(rows)`, `integridadeRef(rows)` (consistente/provisória/insuficiente) e `posicaoPreco` (patamar).
5. Os 3 bloqueios duros + whitelist (`ml, amazon, magalu, shopee`) + categorias sensíveis vão para a fila de revisão (reusar o card de aprovação existente, `lib/textos.js:626`).
6. Revalidação pré-envio: reler o preço no nó imediatamente antes do `sendPhoto`. Se subiu > 3% ou o cupom sumiu, status `rejeitada_por_revalidacao`.
7. Fonte de histórico: decisão pendente (histórico próprio já gravado por `precisaSnapshot`, `lib/selo.js:71-78`).

**Bucket 3: textos curtos**
8. `legendaCurta(oferta)` com o formato exato, teto de 200 caracteres, contador de emojis <= 2 e lista negra de urgência (validador que lança exceção nos testes). Remover/condicionar os ganchos de `lib/copy.js:34-78`.
9. Encurtador de marca própria (depende de domínio, **NÃO VERIFICADO**). Alternativa custo-zero: rota `/l/<id>` no próprio n8n via Caddy (precisa de pergunta).

**Bucket 4: Docker/Git**
10. `.gitignore` (`.env`, `*.env`, `graphify-out/`, `servidor-local/backups/`); `servidor-local/.env.example`; `healthcheck` no n8n (`wget -qO- http://127.0.0.1:5678/healthz`) e no render; `Dockerfile` só para o sidecar render.
11. CI no GitHub Actions (gratuito para repo público; para privado há cota mensal, **NÃO VERIFICADO** o valor atual): `npm test` + `npm run build` + `git diff --exit-code`.
12. Teto diário por canal (3-5) + modo digest + flag `modo.dry_run=sim` global que troca `telegram_api` por um coletor local e loga as chamadas.

## 9. Pontos que já atendem (ok)

- 88 testes offline e rápidos; `lib/` pura e testável.
- Zero dependências npm.
- Webhook protegido por segredo, painel só local, Caddy filtrando.
- Disclosure de afiliado/`#publi` presente.
- Selo honesto (0% nunca vira "desconto", período "desde DD/MM" quando o histórico é curto) (`lib/textos.js:150-170`).
- Trava contra "metade do dobro" e desconto > 80% sem confirmação (`lib/radar.js:1139`, `lib/mercado.js:399-403`).
- Imagens Docker com tag fixada; backup diário com `PRAGMA quick_check`.

---

## 10. Adendo do sintetizador (A7), depois da verificação do A6

Esta seção **complementa** as seções 1-9 do A1 sem reescrevê-las. Ela junta as correções do verificador A6 e os riscos que só apareceram nos outros auditores (A2-A5) ou na verificação. O backlog consolidado está em [`backlog.md`](backlog.md) e as perguntas em [`questions.md`](questions.md).

### 10.1 Correções às seções 1-9

| Onde | Texto do A1 | Correção (A6) |
|---|---|---|
| §1, R-01 | "Produção está ligada e publicando sozinha agora" | Os contêineres estão no ar (confirmado). Que esteja **publicando** é inferência pelos **padrões** de `lib/config.js:106-108`: a `bfx_config` de produção não foi lida. Os "3 ofertas reais publicadas" (`docs/SALVAMENTO-PROJETO.md:85`) vieram de um e2e em n8n de teste (`:78`). Probabilidade de R-01: "alta (não confirmada)", não "certa". |
| §1, §8 | Sandbox "sem `Buffer`, `require` ou `crypto`" | É **convenção do projeto** (`docs/SALVAMENTO-PROJETO.md:45`), não limite técnico do n8n (`NODE_FUNCTION_ALLOW_*` existe). A conclusão (render fora do Code node) continua valendo. |
| §3 (1a) | Setup geral "só `getMe`, `getChat`, `setWebhook`" | Também usa `setMyCommands` (`lib/fluxos.js:1147`, `:1169`). `lib/grupo.js:122-191` já faz `setChatDescription` e pin no grupo e é reaproveitável. |
| §3 (4b) | Digest parcial | Confirmado. A base é a vitrine Top 5 e o `/resumao` (`lib/comunidade.js:1024`, `lib/telegram.js:699-700`). |
| §4 | Repositório remoto "NÃO VERIFICADA" | **Verificado: PUBLIC** (`gh repo view`), e `servidor-local/README.md:58` diz "privado". Severidade de `.gitignore` sem `.env` sobe. |
| §5 | e2e "`tg.sh` acabaria postando no webhook de produção" | Não publica: o update é recusado por segredo (`lib/telegram.js:431-432`), e o `pkill` do host não atinge o contêiner. As linhas certas são `teste-local/rodar.sh:12` e `:16`. Impacto baixo (R-10 continua, rebaixado). |
| §6 brmarket-mcp | "Cada chamada é paga" | O README v0.3.0 no registry npm diz: **busca grátis**, ~30 consultas/min/IP, cache de 10 min; tools pagas via x402 exigem **chave privada de carteira** no ambiente. Não há histórico, não cobre Amazon/Magalu, e o pacote pede para manter o `affiliateUrl` dele. ReefAPI: 1.000 créditos grátis confirmados por A2; o resto continua NÃO VERIFICADO. |

### 10.2 Riscos adicionais (não estavam na §7)

| ID | Risco | Prob. | Impacto | Mitigação proposta (não aplicada) | Backlog |
|---|---|---|---|---|---|
| R-12 | **Outros publicadores automáticos** além do radar: Esquenta 18h45 (`lib/comunidade.js:982-1012`), Top 5 21h15 (`lib/config.js:84`), `radar.auto_top` (`:108`), `cupons.radar_auto` (`:120`), `divulgar.auto_diario` (`:78`), reposts "baixou ainda mais" do Guardião (`lib/agentes.js:53`), e o WhatsApp automático (`build/build-workflows.js:219-222`, `:606`, `:965`). `/modo aprovar` não pausa nenhum deles. | alta | alto | A pausa (decisão do dono) cobre todas as chaves. Cota e dry-run cobrem todos os caminhos | P1-01, P1-06, P2-06 |
| R-13 | **Build = deploy.** `npm run build` escreve em `servidor-local/workflows/`, e o `preparar.sh` publica no próximo `compose up` (`build/build-workflows.js:11`, `:1245`; `servidor-local/preparar.sh:6-17`). O e2e também roda o build (`teste-local/rodar.sh:18`). | média | alto | Separar a saída do build ou travar o `preparar.sh` **antes** da Fase 2. Até lá, proibido rodar build/e2e | P1-03 |
| R-14 | **`/radar` por comando pula a trava anti-falso-desconto** (só roda em `modo==='agendado'`, `lib/radar.js:1226`) e mesmo assim auto-publica (`lib/radar.js:1193`, `:1300`) | média | alto | Trava em todos os modos, ou o comando só gera card | P2-01 |
| R-15 | **`/modo piloto` libera `sem_ref` globalmente** (`selo.exigir_ref90=nao`, `lib/config.js:668`, `:692`; `lib/textos.js:112-116`), inclusive em link colado (`lib/fluxos.js:203-205`) | média | alto | Auto-publicação nunca aceita `sem_ref` | P2-02 |
| R-16 | **Padrões religam a publicação** num Setup novo ou reset (`lib/config.js:213`, `:664-672`) | média | médio | Padrões `nao` e `dry_run=sim` | P1-02 |
| R-17 | **"De" riscado da loja** e "PREÇO DESPENCOU" sem referência própria, contrariando `docs/kit-operacao/04-conformidade.md:29-30` (`lib/copy.js:207-217`; `lib/textos.js:297-322`) | alta | alto (CDC/CONAR) | Sem referência válida, nada de "De", % nem gancho forte | P2-05 |
| R-18 | **Cupons de loja** passam sem verificação de preço e auto-publicam (`lib/radar.js:1130`, `:1215-1216`; `lib/config.js:120`) | média | médio | Regras próprias ou revisão | P2-09 |
| R-19 | **Republicação de conteúdo de terceiros** com troca do afiliado (`lib/config.js:117`; `lib/radar.js:686`) e uso de fotos de terceiros (`lib/radar.js:560`, `:578`) | média | alto (ToS/reputação) | Decisão jurídica; fontes de terceiros só em revisão | P2-04, P1-07 |
| R-20 | **Preço desenhado na imagem fica desatualizado** quando o Guardião edita só a legenda (`lib/edicao.js:13-25`) | certa (após a imagem) | alto (CDC) | `editMessageMedia` com nova renderização, ou preço fora da imagem | P1-15 |
| R-21 | **Vigia chama o Setup** (setWebhook e textos do grupo) sozinho quando o túnel rápido muda (`servidor-local/vigia.sh:3`; `servidor-local/docker-compose.yml:58`) | alta | baixo/médio | Domínio fixo (perfil ngrok) e não acoplar o novo `/setup` ao vigia | P1-05 |
| R-22 | **Repo PUBLIC** com `gh` autenticado com escopo `workflow`; possível ID real de grupo em testes (`tests/comunidade.test.js:20`) | certa | médio | Tornar privado ou corrigir a doc; placeholder no teste | P4-02, P4-04 |
| R-23 | **Dois alvos de deploy** (n8n Cloud × servidor-local, `package.json:5`). Uma instância Cloud ativa escaparia da pausa local | desconhecida | alto se existir | Pergunta Q-01b | P4-03 |
| R-24 | **Histórico próprio insuficiente.** Sem fonte externa grátis com histórico, a mediana de 30d leva ~30 dias de amostragem, e até lá quase tudo cai em revisão humana | certa | médio (operacional) | Amostragem agendada já na 1ª entrega e expectativa alinhada com o dono | P2-20 |

### 10.3 Ordem de prioridade consolidada

1. **Portão (antes de qualquer teste):** decidir e pausar todos os publicadores (R-01, R-12), travar build = deploy (R-13), padrões seguros (R-16) e dry-run com sink que simula respostas, cobrindo Telegram e WhatsApp.
2. **Bucket 1:** `/setup <@canal>` (reaproveitando `grupo.js`) e imagem obrigatória via sidecar de render (decisão D-S1 em `docs/decisions/A7-fase1.md`), sem fallback para texto.
3. **Bucket 2:** correções de 1 linha com impacto alto (R-14, R-15, sensíveis, "De" da loja), depois `lib/desconto.js` (mediana de 30d, `preco_final`, 3 bloqueios em AND), revalidação de 3%, whitelist, cota diária e fila/Despachante.
4. **Bucket 3:** `legendaCurta` ≤200 com disclosure, lista `TERMOS_PROIBIDOS` e ≤2 emojis.
5. **Bucket 4:** `.gitignore`, visibilidade do repo, Dockerfile/healthcheck/`.env.example`, backups cifrados e CI sem tocar `servidor-local/`.
