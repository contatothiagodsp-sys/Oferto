# A5 — DevOps e QA · Fase 0-1 (descoberta + backlog)

Data: 2026-11-18 · Escopo: Docker, .env.example, .gitignore, segredos, README Windows, branch, credenciais de push.
Regras seguidas: nenhum código alterado; nenhuma chamada ao Telegram; nenhum push; nenhum `docker compose up/run`.

## O que foi executado (somente leitura)

| Comando | Por quê | Resultado |
|---|---|---|
| `git ls-files`, `git check-ignore`, `git branch -a`, `git remote -v` | inventário | 76 arquivos rastreados; só `main` local; remoto `origin` (GitHub, HTTPS) |
| `git ls-remote --heads origin` | confirmar auth de leitura | ok: `main`, `correcao-radar-fotos-oferta-real` (já mergeada em main) |
| `gh auth status` (token redigido) | confirmar credencial de push | logado via keyring, escopos `repo`,`workflow`; `credential.helper=manager` |
| `gh repo view --json visibility` | visibilidade | **PUBLIC** |
| `git grep` + `git log --all -G` com padrões de token | scan de segredos (árvore + histórico) | nenhum token real encontrado (detalhe abaixo) |
| `npm test` | QA; antes conferi que `tests/*.js` só importam `node:test/assert/fs/path/vm/crypto` e `../lib` (sem http/https/fetch) | **88/88 passando**, ~1,2 s, Node v24.22.1 |
| `docker ps`, `docker inspect`, `docker logs --tail` (hosts mascarados) | estado de produção | **5 contêineres `oferto-*` rodando nesta máquina**, nenhum com healthcheck |
| `docker exec <c> command -v wget` | viabilidade de healthcheck | `wget` existe em `n8nio/n8n:2.47.7` e em `caddy:2.8.4-alpine` |

## Decisões / suposições

1. **Produção está ativa nesta máquina e publica sozinha.** `oferto-n8n-1`, `-tunel-1`, `-filtro-1`, `-vigia-1`, `-backup-1` estão Up; vigia registra "webhook do Telegram apontado" e "saúde ok". Padrões: `radar.ativo=sim` (lib/config.js:106) e `radar.publicar_direto=sim` (lib/config.js:107). Commit cea6a19 "Radar volta a publicar sozinho". Isso **conflita** com "zero publicação real nesta etapa". Não mexi. Vira pergunta P1.
2. **Nenhum `docker compose up` / `run preparar` deve ser rodado pelos agentes nesta fase**: `servidor-local/preparar.sh:15-16` faz `n8n publish:workflow` (ativa) em todos os 8 workflows, incluindo radar e guardião; com o volume `oferto_n8n_data` (que já tem tokens na `bfx_config`) isso publica de verdade.
3. **Não existe modo dry-run** (`grep -i "dry|simula"` em lib/ e build/ sem resultado). Requisito "dry-run obrigatório" é gap.
4. **Não existe Dockerfile.** O compose usa só imagens prontas (servidor-local/docker-compose.yml:28,38,52,60,68,79,91). Não há serviço Node próprio. Hipótese de arquitetura (a validar com A1/A2): a geração de imagem 1080x1080 em Node (ex.: `@napi-rs/canvas` ou `satori`+`@resvg/resvg-js`, ambos com binários prebuilt, custo zero) exige ou (a) imagem n8n customizada `FROM n8nio/n8n:2.47.7` + `NODE_FUNCTION_ALLOW_EXTERNAL`, ou (b) um sidecar Node mínimo (HTTP interno, sem porta exposta) chamado pelo n8n. Recomendo (b): mantém o n8n oficial intocado, isola dependência nativa, testável com `node --test`. Suporte de módulos externos no task-runner do n8n 2.47.7: **NÃO VERIFICADO**. Pillow (Python) descartado: adicionaria um segundo runtime ao projeto Node.
5. **Healthcheck**: viável sem instalar nada — n8n tem `/healthz` (usado em teste-local/rodar.sh:26) e `wget` dentro da imagem. Proposta: `healthcheck: wget -qO- http://127.0.0.1:5678/healthz` no serviço `n8n`, e `depends_on: condition: service_healthy` em filtro/vigia/backup.
6. **Segredos**: o projeto guarda tokens de bot só na Data Table `bfx_config` (servidor-local/docker-compose.yml:5, README.md:184). O `.env` só tem `HC_URL`, `TUNEL`, `COMPOSE_PROFILES`, `NGROK_*` (docker-compose.yml:4,70-72,82-83). Mantive essa decisão como base do `.env.example` proposto.
7. **Repositório é PUBLIC**, mas `servidor-local/README.md:58` diz "O repositório é seu e privado". Qualquer coisa commitada é pública. Pergunta P3.
8. **Branch `feat/audit-e-otimizacao` não existe** (local nem remoto). Não criei (criar branch não é edição de docs/). Fica para a fase de implementação.
9. Considerei `-1003927635700` (tests/comunidade.test.js:20,881,907,982) um possível ID real de supergrupo, porque foge dos placeholders (`-1001234567890`, `-1009876543210`). Não é segredo, mas expõe o ID do grupo num repo público. **NÃO VERIFICADO** se é real.

## Scan de segredos (sem valores)

Padrões buscados na árvore (`git grep`) e em todo o histórico (`git log --all -G`): token de bot Telegram `\d{8,10}:AA…`, `ghp_`/`github_pat_`, `AKIA…`, `AIza…`, `sk-…`, `xox?-`, `BEGIN … PRIVATE KEY`, `hc-ping.com/<uuid>`, `NGROK_AUTHTOKEN=<valor>`, `"encryptionKey"`, URLs `trycloudflare`/`ngrok` reais, e-mails pessoais, celulares BR.

- Árvore atual: **0 ocorrências de segredo real.** Ocorrências de palavras-chave são nomes de campo/config (lib/config.js:62,89,139,359-360), placeholders de teste (`segredo`, `abc`, `evo_key_123`: tests/lib.test.js:16,21; tests/comunidade.test.js:1073; teste-local/mock.js:6; teste-local/prep.js:22) ou docs.
- Histórico: **0 commits** casando os padrões de token. Nenhum `.env`, `.tar.gz`, `config` do n8n ou `database.sqlite` jamais adicionado (`git log --all --diff-filter=A`).
- Workflows JSON: sem bloco `"credentials"`, `pinData` vazio.
- Local, fora do git: `servidor-local/backups/oferto-2026-11-17.tar.gz` (12 MB) e `oferto-2026-11-18.tar.gz` (44 MB) contêm banco + chave de criptografia do n8n + tokens dos bots (servidor-local/backup.sh:4-6). Estão ignorados por `.gitignore:4` (`backups/`). Ficam sem criptografia no disco.

## Perguntas abertas (para o sintetizador)

- P1. A produção (5 contêineres nesta máquina, radar publicando a cada 2 min) deve continuar rodando durante as fases de mudança, ou devo propor `radar.publicar_direto=nao`/`/modo aprovar` como trava até o dry-run existir? Quem decide e quando?
- P2. Para os testes e2e (`teste-local/rodar.sh`) o n8n local usa `127.0.0.1:5678`, a mesma porta da produção (docker-compose.yml:45). Rodar e2e com a produção de pé vai falhar ou, pior, atingir o n8n de produção nos `curl http://127.0.0.1:5678/webhook/teste-*`. Usar outra porta no e2e?
- P3. O repo deve ser público? A doc diz privado.
- P4. O `-1003927635700` nos testes é o grupo real?
- P5. Geração de imagem: sidecar Node (recomendado) ou n8n customizado? Precisa de decisão de A1/A2.
- P6. Criar a branch `feat/audit-e-otimizacao` a partir de `main` (f6ab859) na fase 2?
