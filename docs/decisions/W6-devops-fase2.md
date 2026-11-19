# W6-devops: decisões da Fase 2 (P4-01, P4-04, P4-07, README)

## P4-01 `.gitignore`
- Adicionados `.env`, `.env.*`, `!.env.example`, `graphify-out/`, `*.tar.gz`, `*.sqlite`. Conferido com `git check-ignore` (o `.env.example` continua versionável).

## P4-04 ID real nos testes (Q-27)
- O ID de grupo citado na Q-27 (provavelmente real; não repetido aqui de propósito) foi trocado pelo placeholder fictício `-1001234567890` nas 4 ocorrências de `tests/comunidade.test.js`. O teste passa (11/11).
- **Fica para o dono:** o ID continua no **histórico** do git e em `docs/questions.md` e `docs/decisions/A5-fase1.md` (arquivos de outros donos). Reescrever o histórico de um repo público não foi feito (fora do escopo e destrutivo). O `bot_grupo_username` `Ofertobr_ofertas_bot` no mesmo teste pode ser o @ real do bot; não foi trocado (não pedido, e o @ de bot é público por natureza).

## P4-07 compose, healthchecks, `.env.example`, render
- `servidor-local/.env.example`: só chaves vazias e comentadas (`PUBLICAR_WORKFLOWS`, `HC_URL`, `TUNEL`, `COMPOSE_PROFILES`, `NGROK_AUTHTOKEN`, `NGROK_DOMAIN`). Valor vazio cai no padrão do compose. Nenhum token de bot.
- `preparar` recebe `PUBLICAR_WORKFLOWS: ${PUBLICAR_WORKFLOWS:-nao}` (Q-02). A checagem dentro do `preparar.sh` é de outro dono (handoff).
- Healthchecks:
  - `n8n`: `wget -qO /dev/null http://127.0.0.1:5678/healthz` (`start_period` 90s para migrações).
  - `filtro` (Caddy): a porta 80 responde 404 a quase tudo de propósito, então a saúde é lida na API admin local (`127.0.0.1:2019/config/`).
  - `tunel-ngrok`: `wget` em `127.0.0.1:4040/api/tunnels`.
  - `render`: `node -e fetch(.../health)`, porque `node:*-slim` não tem wget/curl.
  - Sem healthcheck: `tunel` (cloudflared é distroless, sem shell), `vigia` (é ele quem confere a saúde dos outros), `backup` (dorme entre execuções), `preparar` (roda e termina).
- `depends_on`:
  - `filtro`, `vigia` e `backup` → `n8n: service_healthy` (`/healthz` já é usado em `teste-local/rodar.sh`).
  - `tunel` e `tunel-ngrok` → `filtro: service_started` (e não healthy). Motivo: a checagem pela API admin do Caddy **não foi executada** (não é permitido subir contêineres). Se ela falhar por algum detalhe da imagem, o túnel sobe mesmo assim e o status só fica "unhealthy".
  - O `n8n` **não** depende do `render`: sem render o bot continua de pé e as ofertas vão para revisão (Q-10).
- `render`: `build: ../render`, sem `ports` (só `expose: 3000`), `PORT=3000`, `read_only`, `tmpfs /tmp`, `cap_drop: ALL`, `no-new-privileges`.
  - **Suposição sobre a rede:** "rede interna apenas" foi lido como *não alcançável de fora* (sem porta publicada e fora do túnel/Caddy). O serviço fica na rede padrão do compose, **não** numa rede `internal: true`, porque o render precisa baixar as fotos dos produtos das CDNs das lojas. Se o W2 passar a receber os bytes das fotos pelo n8n, dá para trocar para uma rede `internal: true`.
- Validação: `docker compose -f servidor-local/docker-compose.yml config --quiet` (exit 0) e com `--profile ngrok`. **Nenhum** up/down/restart foi executado; os healthchecks em tempo de execução estão **NÃO VERIFICADOS**.
- Efeito na produção: nenhum até o próximo `docker compose up`. Nesse momento, sem `PUBLICAR_WORKFLOWS=sim`, o `preparar` não reimporta (depois do handoff no `preparar.sh`), e o build do `render` exige que `render/Dockerfile` exista.

## README
- Raiz: aviso de repo **PÚBLICO** (Q-26); seção Windows com pausa da produção (chaves da Q-01 via `/config`, ação do dono), dry-run padrão, build x release, testes, render, `/setup`, `.env`.
- `servidor-local/README.md`: "privado" → "PÚBLICO"; tabela de contêineres com `render` e healthchecks; primeira instalação com `PUBLICAR_WORKFLOWS=sim`; atualização via `npm run release`; n8n Cloud deixa de ser alvo ativo (Q-01b).
- Os comandos `/config publicacao.dry_run`, `npm run release` e `/setup <@canal>` foram documentados conforme as respostas adotadas; a implementação é de outros agentes.

## Correções da revisão (corretor do W6)
- **ID real neste arquivo:** a versão anterior deste arquivo repetia o ID real; removido (só o placeholder aparece).
- **"git pull não muda o que roda" era falso:** os 8 JSON de `servidor-local/workflows/` são versionados e mudam em quase todo commit, então o `git pull` os altera. Os dois READMEs, o `.env.example` e o comentário do compose agora dizem que a **única** trava é o `preparar.sh` sem `PUBLICAR_WORKFLOWS=sim`. Conferido: o `preparar.sh` atual (entregue pelo W1) já sai com exit 0 sem importar quando a variável não é `sim`/`s`/`yes`/`y`/`true`/`1`, e o `package.json` já tem `release`. A alternativa (tirar `servidor-local/workflows/` do git) não foi feita: muda o fluxo do W1 e da primeira instalação.
- **render quebrava o `up`:** `render/` agora existe (W2), mas o Dockerfile faz `COPY --from=lib` e exige o contexto nomeado `lib`; com `build: ../render` puro o build falharia e abortaria o `docker compose up -d` inteiro. Agora: `build.context: ../render` + `additional_contexts: { lib: ../lib }` (compose ≥ 2.17; local: v5.7.0), e o serviço fica no perfil `render` (`COMPOSE_PROFILES=render`). Sem o perfil, o `up` nem monta a imagem e as ofertas vão para revisão (padrão seguro). README corrigido: com o perfil ligado, um build quebrado derruba o `up` inteiro; a saída é tirar o perfil. `docker compose config` conferido sem perfil (render ausente) e com `render,ngrok` (exit 0). Build da imagem **não** executado.
- **n8n não ativava gatilhos novos:** como só a env do `preparar` muda, o compose não recria o `n8n`. Os READMEs mandam `docker compose restart n8n` depois do `up` com `PUBLICAR_WORKFLOWS=sim`. Não usei `depends_on.restart: true` para evitar reinícios do n8n fora do deploy. (Inferido do comportamento do compose v2; não executado.)
- **Rede do render (SSRF):** mantido na rede padrão, porque precisa de saída para as CDNs. O risco está mitigado no código do W2: `render/baixar.js` só aceita HTTPS na porta 443, sem credenciais, recusa IP literal e só baixa de hosts de uma allowlist de CDNs das lojas, revalidando redirecionamentos; nomes do compose (`n8n`, `tunel`, `filtro`, `vigia`) não casam com a allowlist. Resíduo: não há checagem de IP privado depois do DNS (DNS rebinding em domínio da allowlist é improvável). Handoff ao W2 registrado.
- `render`: `PORT=3000` no compose sobrepõe o padrão 8080 do Dockerfile; o healthcheck do compose usa 3000.
