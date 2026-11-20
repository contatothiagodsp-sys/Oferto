# TELEGRAM RELIABILITY — DIAGNÓSTICO FORENSE DO TIMEOUT DE 45000MS E ARQUITETURA DO MOTOR CENTRAL DE PUBLICAÇÃO

---

## 1. Diagnóstico Forense de Causa Raiz (`sendMessage: timeout of 45000ms exceeded`)

A investigação foi conduzida diretamente dentro do ambiente de execução ativo (`oferto-n8n-1` rodando `n8nio/n8n:2.47.7` sobre `Node.js v26.13.0`) e por inspeção somente leitura do banco SQLite de produção (`/dados/database.sqlite`).

### 1.1. Evidências Reais Coletadas no Banco de Produção e no Contêiner

1. **Oferta `omwntae4d1yk` (Hopescolor · K-Pop)**:
   - Imagem extraída: `https://acdn-us.mitiendanube.com/stores/004/051/358/products/...webp` (`HTTP 200 image/webp`, 197 KB).
   - O método `sendPhoto` da Bot API do Telegram rejeita URLs `.webp` com HTTP 400 (`failed to get HTTP URL content` / `wrong type of the web page content`).
   - O fluxo de retry do radar (`04-radar-ofertas`) acionou o fallback para `sendMessage` mantendo `link_preview_options: { url: "https://acdn-us.mitiendanube.com/...webp", prefer_large_media: true, show_above_text: true }`.
   - O nó HTTP aguardou 45 segundos e falhou com **`⚠️ Falhas na Bot API: sendMessage: timeout of 45000ms exceeded`**, deixando `omwntae4d1yk` com `status = 'aprovada'` em `bfx_ofertas` mas **sem nenhum registro em `bfx_posts`**.
2. **Oferta `omwnpi2pc2e7` (Centauro via Promobit)**:
   - Imagem extraída: `https://i.promobit.com.br/500/static/p/136319628217950492111885046251.jpg`.
   - Ao requisitar essa URL no CDN do Promobit, o servidor responde `HTTP 200 OK` com `Content-Type: image/png` e **`Content-Length: 23` bytes** (um arquivo de 23 bytes truncado/corrompido).
   - O nó `Resumir foto radar` verificava apenas `/^image\//i.test(mime)` sem validar o tamanho mínimo do binário, encaminhando os 23 bytes corrompidos para o upload multipart em `Telegram (reenvio foto)`, que também falhava com HTTP 400.
3. **Inspeção de Rede e DNS dentro de `oferto-n8n-1`**:
   - `dns.lookup('api.telegram.org', { all: true })` dentro do contêiner retorna:
     - IPv4: `149.154.166.110` (`family: 4`) — RTT TCP base de **222–229 ms** (Brasil → Data Center do Telegram em Amsterdã; handshake HTTPS completo em ~633 ms).
     - IPv6: `2001:67c:4e8:f004::9` (`family: 6`) — **inacessível** na bridge Docker (`connect ENETUNREACH 2001:67c:4e8:f004::9:443 - Local (:::0)`).
   - No Node.js `v26.13.0` do contêiner, `net.getDefaultAutoSelectFamily()` é `true` e `net.getDefaultAutoSelectFamilyAttemptTimeout()` é **`500` ms**.
   - Embora `--dns-result-order=ipv4first` estivesse definido, o algoritmo *Happy Eyeballs* (`autoSelectFamily`) do Node 26 aborta a tentativa IPv4 se o pacote `SYN-ACK` demorar mais de 500 ms (basta 1 retransmissão TCP ou jitter na rota internacional de 225 ms durante um lote de 15–20 chamadas) e tenta conectar no IPv6 inacessível.
4. **Inspeção do Código Interno do n8n 2.47.7 (`HttpRequestV3.node.js` & `@n8n/backend-network`)**:
   - Em `/usr/local/lib/node_modules/n8n/node_modules/n8n-nodes-base/dist/nodes/HttpRequest/V3/HttpRequestV3.node.js` (linhas 196 e 365): quando `options.response.response.responseFormat` não é especificado, o n8n assume `'autodetect'`, que define `requestOptions.useStream = true` (`axiosConfig.responseType = 'stream'`).
   - Além disso, o loop de itens do `HttpRequestV3` dispara todas as promises do lote apenas aguardando `sleep(batchInterval)` entre os disparos (`requestPromises.push(request)`), e **só lê e fecha os streams `IncomingMessage` após `await Promise.allSettled(requestPromises)` terminar para o lote inteiro**, criando um novo `EnvProxyHttpsAgent` (`keepAlive: false`) a cada requisição.

---

## 2. Solução Definitiva em 4 Camadas

### Camada 1 — Rede e Runtime Node.js no Contêiner (`servidor-local/docker-compose.yml`)
- Adicionada a flag `--no-network-family-autoselection` ao `NODE_OPTIONS`:
  ```yaml
  NODE_OPTIONS: "--max-old-space-size=1536 --dns-result-order=ipv4first --no-network-family-autoselection"
  ```
- **Efeito**: Desativa o aborto prematuro de 500 ms do Happy Eyeballs para a família IPv6 inacessível, garantindo que todas as conexões TLS para `149.154.166.110:443` usem exclusivamente a pilha IPv4 estável.

### Camada 2 — Consumo Imediato de JSON no `HttpRequestV3` (`build/build-workflows.js`)
- Em `httpTelegram` e `httpTelegramArquivo` ([`build/build-workflows.js`](file:///c:/Users/tHg/Documents/Oferto/build/build-workflows.js#L544-L598)), configurado explicitamente:
  ```js
  response: { response: { neverError: true, responseFormat: 'json' } }
  ```
- **Efeito**: O `HttpRequestV3` define `useStream = false`, fazendo o Axios consumir o corpo JSON e liberar o socket TLS imediatamente na chegada de cada resposta, eliminando o acúmulo de streams pendentes durante o lote.

### Camada 3 — Validação de Imagem Binária e Sanitização de `link_preview_options` (`lib/tg-envio.js` & `build/build-workflows.js`)
1. **Validação estrita de binário (`validarBinarioFotoTelegram` e nós `Resumir foto radar` / `Preparar foto radar`)**:
   - Exige MIME `/^image\/(?:jpe?g|png|gif)$/i` (rejeitando `image/webp`, `image/svg+xml` e `text/html`).
   - Exige `String(b.data).length >= 280` em base64 (mínimo de ~210 bytes reais, barrando arquivos truncados de 23 bytes como o do Promobit).
2. **Sanitização do Fallback de Texto (`sanitizarFallbackTexto`)**:
   - Quando `sendPhoto` falha por erro de download/curl da imagem (`failed to get HTTP URL content`, `WEBPAGE_CURL_FAILED`, `IMAGE_PROCESS_FAILED`, `wrong type of the web page content`) ou porque a URL é `.webp`, ou quando o download binário da foto falha/é reprovado, o fallback `sendMessage` recebe `link_preview_options: { is_disabled: true }`.
   - Isso impede que o servidor do Telegram tente baixar sincronamente a mesma URL quebrada durante o `sendMessage`, eliminando o travamento de 45.000 ms.

### Camada 4 — Motor Central de Publicação, Classificação de Erros, Fila e Isolamento Multicanal (`lib/tg-envio.js`)

O módulo [`lib/tg-envio.js`](file:///c:/Users/tHg/Documents/Oferto/lib/tg-envio.js) centraliza toda a inteligência de entrega na Bot API:

#### 4.1. Classificação Determinística de Erros (`classificarErroTelegram`)

| Tipo Classificado | Estado do Destino | Código / Condição | Ação Determinística |
|---|---|---|---|
| `sucesso` | `publicado` | `ok: true` com `result.message_id` | Registra `message_id` e link permanente em `bfx_posts`. |
| `rate_limit_429` | `falha_recuperavel` | HTTP 429 / `Too Many Requests` | Extrai `retry_after` oficial do Telegram e agenda reenvio após `retry_after + 1s`. |
| `timeout_ou_rede_ambigua` | `entrega_incerta` | `timeout ... exceeded`, `ETIMEDOUT`, `ECONNRESET`, `ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`, `socket hang up` | **Proteção de Idempotência (`proteger_idempotencia: true`)**: não reenvia como texto às cegas para nunca duplicar posts no grupo. |
| `servidor_5xx` | `falha_recuperavel` | HTTP 500, 502, 503, 504 | Protege idempotência em chamadas não-idempotentes e registra alerta operacional. |
| `imagem_rejeitada` | `falha_recuperavel` | HTTP 400 em `sendPhoto` (`failed to get HTTP URL content`, `IMAGE_PROCESS_FAILED`, etc.) | Aciona download binário validado (se JPEG/PNG/GIF) ou fallback imediato para `sendMessage` com preview sanitizado. |
| `credencial_ou_permissao` | `falha_definitiva` | HTTP 401 / 403 (`Unauthorized`, `Forbidden`, `bot was kicked`, `not enough rights`) | Não faz retry inútil; notifica admin imediatamente. |
| `parametro_invalido_400` | `rejeitado` | HTTP 400 (`can't parse entities`, `chat not found`, `message thread not found`) | Falha rápida sem retry e registra diagnóstico exato. |
| `resposta_invalida` | `falha_recuperavel` | Objeto vazio ou sem `ok`/`result` | Protege estado e evita crash de leitura. |

#### 4.2. Fila de Prioridade e Intercalação de Destinos (`ordenarFilaPublicacao`)
- Ordena chamadas pendentes segundo a hierarquia comercial:
  1. `relampago` (peso 100)
  2. `queda_expressiva` (peso 85)
  3. `cupom_curto` (peso 75)
  4. `alta_demanda` (peso 65)
  5. `alta_qualidade` (peso 55)
  6. `regular` (peso 40)
  7. `institucional` (peso 20)
- Expira automaticamente itens com mais de 18 horas (`expirar_apos_ms`).
- Intercala chamadas consecutivas de mesma prioridade destinadas a `chat_id:message_thread_id` distintos para suavizar o ritmo por chat.

#### 4.3. Isolamento Multicanal por Destino (`rastrearEntregasPorDestino` & `resultadoChamadas`)
- Cada destino (`tg` tópico da categoria, `tg` tópico Top do Dia, `tgc` canal dedicado da categoria) tem seu estado individual rastreado em `entregas`.
- **Isolamento de Falha**: Se uma oferta é publicada com sucesso no tópico do supergrupo (`tg`), mas falha no canal secundário (`tgc`) por falta de permissão (403), a publicação do supergrupo é preservada em `bfx_posts` e a oferta **não** é marcada como `status: 'falha'`.
- **Suporte a Lote Completo (`updates`)**: Quando múltiplas ofertas de um mesmo lote falham em 100% dos seus destinos, todas são retornadas em `updates` (mantendo `update: updates[0]` para compatibilidade com nós legados).
