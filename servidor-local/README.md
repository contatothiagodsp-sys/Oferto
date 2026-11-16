# Servidor local: n8n Community no seu computador

O n8n Community é gratuito e roda no seu computador dentro do Docker. Os workflows, as Data Tables e o bot são os mesmos do n8n Cloud, e aqui não existe limite de execuções.

## Como funciona

```
Telegram ──https──▶ túnel Cloudflare ──▶ filtro ──▶ n8n (no seu computador)
                     (endereço público)    (só deixa passar o webhook do Telegram)
                                                      ▲
                                vigia: quando o endereço do túnel muda, avisa o n8n,
                                que grava a URL nova e refaz o webhook nos dois bots
```

| Contêiner | O que faz |
|---|---|
| `preparar` | Importa e publica os 5 workflows desta pasta e depois termina. Só repete quando os arquivos mudam. |
| `n8n` | O n8n. O painel abre **só neste computador**: http://localhost:5678 |
| `filtro` | Só deixa a internet chegar ao `POST /webhook/telegram-ofertas`. O resto responde 404. |
| `tunel` | Túnel rápido da Cloudflare: gera um endereço `https://…trycloudflare.com` sem conta e sem abrir portas no roteador. |
| `vigia` | A cada 15 s lê o endereço do túnel. Quando o endereço muda, chama o workflow **90 · Túnel**, que grava `n8n_webhook_url` e roda o **00 · Setup**. |

**Limitações (para validar está ótimo, mas leve em conta):**
- **O computador precisa ficar ligado e acordado.** Desligado ou dormindo, o bot para de responder e a coleta da Shopee e o relatório das 22h não rodam. Desative a suspensão automática enquanto ele for o servidor.
- **O endereço do túnel muda** sempre que o Docker ou o computador reiniciam. O vigia refaz o webhook sozinho em menos de 1 minuto, e você recebe o resumo "⚙️ Setup" no Telegram.
- **O túnel rápido não tem garantia de disponibilidade.** Para a BF, use um túnel com endereço fixo (veja [Depois da validação](#depois-da-validação)).
- **Backup:** os dados ficam no volume `oferto_n8n_data` do Docker (veja [Backup](#backup)).

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

O repositório é seu e privado, então o git vai pedir login no GitHub. Se preferir não usar o git, baixe pelo site do GitHub: **Code → Download ZIP**, e descompacte.

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

✋ Deve aparecer `n8n`, `filtro`, `tunel` e `vigia` como **Up**, e `preparar` como **Exited (0)**.

### 4. Criar sua conta no painel

1. Abra http://localhost:5678 no navegador.
2. Crie a conta de dono. Ela fica só no seu computador; use um e-mail seu e uma senha forte.
3. Em **Overview**, confira se os 5 workflows estão lá e publicados:
   - 00 · Setup
   - 01 · Telegram: aprovação e publicação
   - 02 · Coleta Shopee
   - 03 · Relatório diário
   - 90 · Túnel

✋ Os 5 workflows aparecem na lista.

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

O `preparar` percebe que os arquivos mudaram e reimporta os workflows. **Atenção:** mudanças que você fizer nos workflows pelo painel são substituídas nessa hora. A configuração e os dados ficam nas Data Tables e não são afetados.

### Backup

Os dados (config, ofertas, posts, entradas) ficam no volume do Docker. Para copiar o volume para um arquivo `.tar.gz` na pasta atual:

1. Desligue o servidor:

   ```bash
   docker compose down
   ```

2. Copie o volume:

   ```bash
   docker run --rm -v oferto_n8n_data:/dados -v "${PWD}:/backup" alpine tar czf /backup/backup-n8n.tar.gz -C /dados .
   ```

3. Ligue de novo:

   ```bash
   docker compose up -d
   ```

Guarde o arquivo fora do computador (Google Drive, por exemplo). Ele contém os tokens dos bots, então **não compartilhe**.

**Cuidado:** `docker compose down -v` (com `-v`) **apaga** o volume e todos os dados.

---

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| `preparar` com **Exited (1)** | Rode `docker compose logs preparar` e veja qual workflow falhou. |
| O vigia nunca mostra o endereço | Rode `docker compose logs tunel`. Redes corporativas ou antivírus podem bloquear a Cloudflare; teste em outra rede. |
| O bot não responde ao `/id` | 1) Confira o `bot_token` na `bfx_config`. 2) Rode o **00 · Setup** e leia o nó **Resumo**. 3) Em **Executions** do **01 · Telegram**, procure execuções com erro. |
| O resumo "⚙️ Setup" chega toda vez que você liga o computador | É normal: o endereço do túnel mudou e o webhook foi refeito. |
| A porta 5678 está em uso | Outro programa usa a porta. No `docker-compose.yml`, troque `127.0.0.1:5678:5678` por `127.0.0.1:5679:5678` e abra http://localhost:5679. |

---

## Depois da validação

Para a BF, o bot precisa de um endereço fixo e de uma máquina que não desligue. As opções, da mais simples à mais robusta:

1. **Endereço fixo com o mesmo computador:**
   - **ngrok:** dá um domínio estático grátis por conta.
   - **Cloudflare Tunnel nomeado:** exige um domínio próprio, de cerca de R$ 40 por ano.

   Com qualquer um dos dois, o endereço deixa de mudar, mas o computador continua precisando ficar ligado.
2. **Servidor na nuvem (VPS):** custa de R$ 25 a 40 por mês. Os mesmos arquivos desta pasta funcionam lá.
3. **n8n Cloud:** importe os arquivos de `n8n/workflows/`, seguindo o README principal. Os dados do servidor local não migram automaticamente; a config você copia à mão.

Me peça quando quiser montar qualquer uma delas.
