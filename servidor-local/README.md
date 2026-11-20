# Servidor local: n8n Community no seu computador

O n8n Community é gratuito e roda no seu computador dentro do Docker. Este é o alvo ativo do projeto; aqui não existe limite de execuções. (Se houver também uma instância n8n Cloud com os mesmos workflows, ela fica fora da pausa e do dry-run deste servidor: confira e desligue-a. Situação **não verificada**, ver Q-01b em `docs/questions.md`.)

## Como funciona

```
Telegram ──https──▶ túnel Cloudflare ──▶ filtro ──▶ n8n (no seu computador)
                     (endereço público)    (só deixa passar o webhook do Telegram)
                                                      ▲
                                vigia: quando o endereço do túnel muda, avisa o n8n,
                                que grava a URL nova e refaz o webhook nos dois bots;
                                a cada 5 min confere a saúde do webhook (workflow 91)
```

| Contêiner | O que faz |
|---|---|
| `preparar` | Importa e publica os workflows desta pasta e depois termina. Só repete quando os arquivos mudam **e** o `.env` tem `PUBLICAR_WORKFLOWS=sim` (padrão seguro: não importa nada; veja [Atualizar o sistema](#dia-a-dia)). |
| `n8n` | O n8n. O painel abre **só neste computador**: http://localhost:5678. Tem healthcheck (`/healthz`): `filtro`, `vigia` e `backup` só sobem depois que ele fica **healthy**. |
| `render` | Gera a imagem 1080x1080 dos posts (`POST /render`). Fica só na rede interna do compose: sem porta no computador e fora do túnel. Código e Dockerfile em [`../render`](../render). Healthcheck em `/health`. **Opcional:** só sobe com `COMPOSE_PROFILES=render` no `.env` (fora do perfil, as ofertas vão para revisão). Só baixa fotos por HTTPS de hosts de CDN das lojas (allowlist em `render/baixar.js`). |
| `filtro` | Só deixa a internet chegar ao `POST /webhook/telegram-ofertas`. O resto responde 404. |
| `tunel` | Túnel rápido da Cloudflare: gera um endereço `https://…trycloudflare.com` sem conta e sem abrir portas no roteador. |
| `vigia` | A cada 15 s lê o endereço do túnel. Quando o endereço muda, chama o workflow **90 · Túnel**, que grava `n8n_webhook_url` e roda o **00 · Setup**. A cada 5 min chama o **91 · Saúde** e, se configurado, faz o ping no healthchecks.io (veja [Alertas](#alertas-saúde-do-bot)). |
| `backup` | 1 vez por dia gera `backups/oferto-AAAA-MM-DD.tar.gz` (banco + chave de criptografia) e guarda os 7 mais recentes (veja [Backup](#backup)). |
| `tunel-ngrok` | Só com o perfil `ngrok`: túnel com endereço fixo (veja [Endereço fixo](#endereço-fixo-com-ngrok)). |

**Limitações (para validar está ótimo, mas leve em conta):**
- **O computador precisa ficar ligado e acordado.** Desligado ou dormindo, o bot para de responder e a coleta da Shopee e o relatório das 22h não rodam. Desative a suspensão automática enquanto ele for o servidor.
- **O endereço do túnel muda** sempre que o Docker ou o computador reiniciam. O vigia refaz o webhook sozinho em menos de 1 minuto, e você recebe o resumo "⚙️ Setup" no Telegram.
- **O túnel rápido não tem garantia de disponibilidade.** Para a BF, use um túnel com endereço fixo (veja [Depois da validação](#depois-da-validação)).
- **Backup:** os dados ficam no volume `oferto_n8n_data` do Docker. O contêiner `backup` copia tudo 1 vez por dia para a pasta `backups/` (veja [Backup](#backup)).

---

## Passo a passo (≈ 30 min)

Cada ✋ é um ponto de conferência: só siga em frente se o resultado for o esperado.

### 1. Instalar o Docker

- **Windows 10/11 e macOS:** instale o **Docker Desktop** (docker.com → *Download Docker Desktop*). No Windows, aceite ativar o **WSL 2** se o instalador pedir e reinicie o computador.
- **Linux:** instale o Docker Engine com o plugin `compose` (pacote `docker-compose-plugin`).

Abra o Docker Desktop e espere aparecer **Engine running**. Depois, num terminal (PowerShell no Windows, Terminal no macOS), rode:

```bash
docker compose version
```

✋ Deve aparecer `Docker Compose version v2…`.

### 2. Baixar o projeto

Com o git instalado:

```bash
git clone https://github.com/contatothiagodsp-sys/Oferto.git
```

**Atenção: o repositório é PÚBLICO.** Qualquer pessoa pode ler o código e todo o histórico de commits. Nunca faça commit de `.env`, backups, tokens, IDs reais de grupo ou chaves (o `.gitignore` já bloqueia `.env`, `backups/`, `*.tar.gz` e `*.sqlite`). Tornar o repositório privado é decisão do dono. Se preferir não usar o git, baixe pelo site do GitHub: **Code → Download ZIP**, e descompacte.

✋ Deve existir a pasta `Oferto/servidor-local` com o arquivo `docker-compose.yml`.

### 3. Subir o servidor

Entre na pasta:

```bash
cd Oferto/servidor-local
```

Suba os contêineres:

```bash
docker compose up -d
```

Na primeira vez, o Docker baixa cerca de 1 GB de imagens, o que leva alguns minutos. Depois, confira:

```bash
docker compose ps -a
```

✋ Deve aparecer `n8n` e `filtro` (e `render`, se o perfil `render` estiver ligado) como **Up (healthy)** (o n8n leva até ~1,5 min para ficar healthy), `tunel`, `vigia` e `backup` como **Up**, e `preparar` como **Exited (0)**.

Na **primeira** instalação, o volume ainda está vazio: para o `preparar` importar os workflows, crie o `.env` a partir do modelo e ligue a importação só desta vez (PowerShell, dentro de `servidor-local`):

```powershell
Copy-Item .env.example .env
notepad .env   # troque a linha PUBLICAR_WORKFLOWS= por PUBLICAR_WORKFLOWS=sim, salve
docker compose up -d
docker compose restart n8n   # o n8n já estava rodando: reinicie para ele ativar os gatilhos importados
```

Depois que os workflows aparecerem no painel, volte a linha para `PUBLICAR_WORKFLOWS=` (vazio).

### 4. Criar sua conta no painel

1. Abra http://localhost:5678 no navegador.
2. Crie a conta de dono. Ela fica só no seu computador; use um e-mail seu e uma senha forte.
3. Em **Overview**, confira se os 8 workflows estão lá e publicados:
   - 00 · Setup
   - 01 · Telegram: aprovação e publicação
   - 02 · Coleta Shopee
   - 03 · Relatório diário
   - 04 · Radar Multi-Fonte de Ofertas
   - 05 · Guardião Automático de Ofertas
   - 90 · Túnel
   - 91 · Saúde

✋ Os 8 workflows aparecem na lista.

### 5. Conferir o túnel

```bash
docker compose logs vigia
```

✋ Deve aparecer `Vigia: webhook do Telegram apontado para https://….trycloudflare.com/webhook/telegram-ofertas`. Isso acontece em até 1 minuto depois de subir.

Nesse momento o vigia já rodou o setup uma vez, que criou as tabelas e a `bfx_config`. Como os tokens ainda estão vazios, nenhum bot foi registrado.

### 6. Configurar os bots

Siga o [README principal](../README.md#3-preencher-a-configuração-overview--data-tables--bfx_config) a partir do **passo 3**, com duas diferenças:

- **Passo 4 (Ligar o webhook):** pule a cópia da URL. O vigia já preencheu `n8n_webhook_url`; **não altere essa linha**. Depois de colar `bot_token` e `bot_token_grupo`, abra **00 · Setup** e clique em **Execute workflow**.
- **Execuções:** no servidor local não há limite de execuções, então pode deixar `rastrear_entradas = sim`.

✋ Ao mandar `/id` para o **bot de aprovação**, ele responde com o seu número.

Os passos 5 (admins), 6 (supergrupo com Tópicos e grupo_id), 7 (teste com `/oferta`) e 8 (programas de afiliados) são iguais aos do README principal.

---

## Dia a dia

Rode estes comandos sempre dentro da pasta `servidor-local`.

| Para | Comando |
|---|---|
| Ver se está tudo de pé | `docker compose ps -a` |
| Desligar | `docker compose down` (os dados ficam guardados) |
| Ligar de novo | `docker compose up -d` (o vigia refaz o webhook sozinho) |
| Ver o endereço atual do túnel | `docker compose logs vigia` |
| Ver erros do n8n | `docker compose logs n8n --tail 50` |

Com o Docker Desktop configurado para iniciar com o sistema (**Settings → General → Start Docker Desktop when you sign in**), os contêineres voltam sozinhos depois de reiniciar o computador, porque usam `restart: unless-stopped`.

**Atualizar o sistema** quando houver mudanças no repositório:

```bash
git pull
```

```bash
docker compose up -d
```

**Atenção:** os JSON de `servidor-local/workflows/` são versionados no git, então o `git pull` **altera** esses arquivos (localmente, `npm run release` também os reescreve; o `npm run build` escreve só em `n8n/workflows/`). O que impede que o `docker compose up -d` importe e publique essa versão nova é **só** a trava do `preparar.sh`: sem `PUBLICAR_WORKFLOWS=sim` no `.env`, ele termina sem importar nada. Confira o `.env` antes de cada `up` (`docker compose logs preparar` mostra "workflows NÃO importados"). Para aplicar uma versão nova de propósito: `PUBLICAR_WORKFLOWS=sim` no `.env`, `docker compose up -d`, `docker compose restart n8n` (para ativar os gatilhos novos), e depois volte a linha para vazio. **Atenção:** mudanças que você fizer nos workflows pelo painel são substituídas nessa hora. A configuração e os dados ficam nas Data Tables e não são afetados.

### Backup

O contêiner `backup` faz tudo sozinho, com o n8n ligado:

- 1 vez por dia cria `servidor-local/backups/oferto-AAAA-MM-DD.tar.gz` com:
  - `database.sqlite`: o banco do n8n (workflows, execuções e as Data Tables: config, ofertas, posts, entradas), copiado com `sqlite3 .backup`, que é seguro com o n8n rodando;
  - `config`: o arquivo com a **chave de criptografia** do n8n. Sem ela, o banco restaurado não abre as credenciais.
- Guarda os **7** arquivos mais recentes e apaga os mais antigos.
- Para conferir: `docker compose logs backup` e a pasta `backups/`.

Copie de vez em quando o arquivo mais recente para fora do computador (Google Drive, por exemplo). Ele contém os tokens dos bots, então **não compartilhe**. A pasta `backups/` está no `.gitignore` e nunca vai para o GitHub.

**Restaurar um backup** (no mesmo computador ou em outro, dentro da pasta `servidor-local`):

1. Desligue tudo:

   ```bash
   docker compose down
   ```

2. Apague o volume atual e crie um vazio. **Atenção:** isto apaga os dados atuais; se estiver em dúvida, faça antes uma cópia da pasta `backups/`.

   ```bash
   docker volume rm oferto_n8n_data
   ```

   ```bash
   docker volume create oferto_n8n_data
   ```

3. Descompacte o backup no volume (troque a data pelo arquivo que você quer):

   ```bash
   docker run --rm -v oferto_n8n_data:/dados -v "${PWD}/backups:/backups:ro" alpine:3.24.3 sh -c "tar xzf /backups/oferto-2026-11-26.tar.gz -C /dados && chown -R 1000:1000 /dados"
   ```

4. Ligue de novo:

   ```bash
   docker compose up -d
   ```

✋ Em http://localhost:5678 você entra com a mesma conta de antes, e as Data Tables têm os dados do dia do backup. O vigia refaz o webhook sozinho.

**Cuidado:** `docker compose down -v` (com `-v`) **apaga** o volume e todos os dados.

### Alertas: saúde do bot

O workflow **91 · Saúde** roda a cada 5 min (chamado pelo vigia), consulta o `getWebhookInfo` dos dois bots e manda mensagem aos admins quando:

- o Telegram não conseguiu entregar uma atualização ao n8n nos últimos 10 min (túnel ou filtro fora);
- há mais de 20 atualizações esperando na fila do Telegram;
- o webhook aponta para um endereço diferente de `n8n_webhook_url`;
- algum token é inválido.

Cada tipo de problema gera no máximo 1 alerta a cada 60 min (o controle fica na chave `saude.ultimo_alerta` da `bfx_config`), e chega uma mensagem "✅ resolvido" quando o problema some.

Se o computador dormir ou o n8n cair, ninguém sobra para mandar o alerta. Para isso existe o **healthchecks.io** (grátis):

1. Crie uma conta em healthchecks.io e um *check* com **Period 5 minutes** e **Grace 10 minutes**. Ligue o aviso por e-mail ou pelo Telegram (*Integrations*).
2. Copie a URL de ping (`https://hc-ping.com/…`).
3. Na pasta `servidor-local`, crie o arquivo `.env` a partir do modelo (`Copy-Item .env.example .env` no PowerShell, `cp .env.example .env` no Linux/macOS) e preencha a linha (troque pela sua URL):

   ```
   HC_URL=https://hc-ping.com/sua-url
   ```

4. Rode `docker compose up -d`.

✋ Em `docker compose logs vigia` aparece `healthchecks.io ligado`, e em até 5 min o check fica verde no site.

O vigia só faz o ping quando o 91 responde `ok`. Se o token do bot de aprovação estiver inválido (o alerta não chegaria pelo Telegram), ele avisa o healthchecks.io como falha. O `.env` só guarda endereços e chaves de serviços de infraestrutura; **os tokens dos bots nunca vão para o `.env`**, ficam só na `bfx_config`.

---

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| `preparar` com **Exited (1)** | Rode `docker compose logs preparar` e veja qual workflow falhou. |
| O vigia nunca mostra o endereço | Rode `docker compose logs tunel`. Redes corporativas ou antivírus podem bloquear a Cloudflare; teste em outra rede. |
| O bot não responde ao `/id` | 1) Confira o `bot_token` na `bfx_config`. 2) Rode o **00 · Setup** e leia o nó **Resumo**. 3) Em **Executions** do **01 · Telegram**, procure execuções com erro. |
| O resumo "⚙️ Setup" chega toda vez que você liga o computador | É normal: o endereço do túnel mudou e o webhook foi refeito. |
| Alerta "🚨 problema no bot" | Leia o motivo na mensagem. Erro de entrega ou fila: `docker compose ps -a` e `docker compose logs tunel filtro n8n --tail 50`. Endereço diferente: `docker compose restart vigia`. |
| `90 · Túnel` com erro "Endereço do túnel não permitido" | O túnel deu um endereço fora de trycloudflare.com e ngrok. Se for o seu domínio, preencha `tunel.dominio` na `bfx_config`. |
| `backup` reiniciando | `docker compose logs backup`. Na primeira vez ele baixa o sqlite da internet. |
| `n8n` fica **unhealthy** e `filtro`/`vigia`/`backup` não sobem | `docker compose logs n8n --tail 50`. Na primeira subida (ou depois de atualizar a imagem) as migrações podem passar de 1,5 min: espere e rode `docker compose up -d` de novo. |
| `render` **unhealthy** ou erro de build | `docker compose logs render --tail 50` e `docker compose build render`. **Um erro de build do render faz o `docker compose up -d` inteiro falhar** (nenhum serviço sobe). Para manter o bot no ar: tire `render` do `COMPOSE_PROFILES` no `.env` e rode `docker compose up -d` de novo (ou `docker compose up -d --no-build`). Sem render, as ofertas vão para revisão (sem imagem não publica). |
| A porta 5678 está em uso | Outro programa usa a porta. No `docker-compose.yml`, troque `127.0.0.1:5678:5678` por `127.0.0.1:5679:5678` e abra http://localhost:5679. |
| `⚠️ Falhas na Bot API: sendMessage: timeout of 45000ms exceeded` | Causado por Happy Eyeballs para IPv6 inacessível no contêiner ou prévia de imagem quebrada (`.webp`/23 bytes). Confira `NODE_OPTIONS` com `--no-network-family-autoselection` no `docker-compose.yml` e veja [`../docs/TELEGRAM-RELIABILITY.md`](../docs/TELEGRAM-RELIABILITY.md). |

---

## Depois da validação

Para a BF, o bot precisa de um endereço fixo e de uma máquina que não desligue. As opções, da mais simples à mais robusta:

1. **Endereço fixo com o mesmo computador:** ngrok com domínio estático grátis (abaixo). O computador continua precisando ficar ligado.
2. **Servidor na nuvem (VPS):** custa de R$ 25 a 40 por mês. Os mesmos arquivos desta pasta funcionam lá (resumo abaixo).
3. **n8n Cloud:** importe os arquivos de `n8n/workflows/`, seguindo o README principal. Os dados do servidor local não migram automaticamente; a config você copia à mão.

### Endereço fixo com ngrok

O compose já tem o túnel `tunel-ngrok`, desligado por padrão (perfil `ngrok`).

1. Crie uma conta grátis em ngrok.com. Em **Getting Started → Your Authtoken**, copie o authtoken. Em **Domains**, pegue o seu domínio estático grátis (algo como `nome-aleatorio.ngrok-free.app`).
2. Na pasta `servidor-local`, coloque no arquivo `.env` (junto com o `HC_URL`, se tiver):

   ```
   COMPOSE_PROFILES=ngrok
   TUNEL=ngrok
   NGROK_AUTHTOKEN=seu-authtoken-do-ngrok
   NGROK_DOMAIN=nome-aleatorio.ngrok-free.app
   ```

   O authtoken é do ngrok, não de um bot: pode ficar no `.env`. Não compartilhe esse arquivo.
3. Suba de novo:

   ```bash
   docker compose up -d
   ```

✋ Em `docker compose logs vigia` aparece `webhook do Telegram apontado para https://nome-aleatorio.ngrok-free.app/webhook/telegram-ofertas`, e o endereço não muda mais ao reiniciar.

- O vigia lê o endereço na API local do ngrok (`http://tunel-ngrok:4040/api/tunnels`). Se ela não responder, veja `docker compose logs tunel-ngrok` (authtoken ou domínio errados são os erros mais comuns).
- O túnel rápido da Cloudflare continua no ar, mas o webhook fica no ngrok. Para não usar mais a Cloudflare, pode rodar `docker compose stop tunel`.
- Para voltar ao túnel rápido: apague as linhas `COMPOSE_PROFILES`, `TUNEL` e `NGROK_*` do `.env`, rode `docker compose --profile ngrok down` e depois `docker compose up -d`.
- O workflow 90 só aceita endereços `trycloudflare.com`, `ngrok-free.app`, `ngrok-free.dev`, `ngrok.app` e `ngrok.dev`. Com um domínio próprio (Cloudflare Tunnel nomeado, VPS), preencha a chave `tunel.dominio` na `bfx_config` (por exemplo `bot.seudominio.com.br`).

### Migrar para uma VPS (resumo)

1. Contrate uma VPS com **Ubuntu 24.04** (1 vCPU e 2 GB de RAM bastam) e aponte um subdomínio seu (por exemplo `bot.seudominio.com.br`) para o IP dela (registro DNS tipo A).
2. Na VPS: instale o Docker Engine com o plugin compose, clone o repositório e libere só as portas 22, 80 e 443 no firewall (`ufw allow OpenSSH`, `ufw allow 80,443/tcp`, `ufw enable`).
3. Leve os dados: faça um backup aqui (pasta `backups/`), copie o `.tar.gz` para a VPS (`scp`) e restaure como em [Backup](#backup).
4. Use o mesmo `docker-compose.yml`, com três mudanças:
   - **sem túnel:** remova os serviços `tunel` e `tunel-ngrok`, e tire `tunel` do `depends_on` do vigia;
   - **Caddy com TLS no domínio:** no `Caddyfile`, troque `:80 {` por `bot.seudominio.com.br {` e publique as portas no `filtro` (`ports: ["80:80", "443:443"]`) com um volume para `/data` (onde o Caddy guarda o certificado). O Caddy tira o certificado HTTPS sozinho e continua deixando passar só o webhook do Telegram;
   - **vigia:** sem túnel, ele não acha endereço. Na `bfx_config`, preencha `tunel.dominio` = `bot.seudominio.com.br` e chame uma vez `curl -X POST http://localhost:5678/webhook/oferto-tunel -H 'content-type: application/json' -d '{"url":"https://bot.seudominio.com.br"}'` dentro da VPS (o vigia segue fazendo a conferência de saúde e o ping no healthchecks.io).
5. **Painel só por túnel SSH:** o n8n continua preso em `127.0.0.1:5678`. Do seu computador, rode `ssh -L 5678:localhost:5678 usuario@ip-da-vps` e abra http://localhost:5678 enquanto a sessão SSH estiver aberta.
6. Desligue o servidor do computador (`docker compose down`) só depois de o webhook apontar para a VPS, para os dois não responderem ao mesmo tempo.

Me peça quando quiser montar qualquer uma delas.
