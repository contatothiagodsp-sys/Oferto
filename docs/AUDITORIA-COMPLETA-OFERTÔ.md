# AUDITORIA TÉCNICA, ARQUITETURAL E DE PRODUTO COMPLETA — PLATAFORMA OFERTÔ

---

## 1. Reconstrução Completa da Arquitetura do Sistema

O **Ofertô** é uma plataforma automatizada de descoberta, auditoria, enriquecimento, copywriting, moderação e distribuição multicanal de ofertas comerciais para marketing de afiliados, operando com **custo obrigatório zero (R$ 0)** sobre **n8n Community (Docker local)** ou **n8n Cloud**, **Node.js**, **SQLite Data Tables** e **Telegram Bot API / WhatsApp / X**.

### 1.1. Topologia de Execução e Infraestrutura Local (`servidor-local/`)

```
Internet / Telegram Webhook
   │ (HTTPS)
   ▼
[tunel] (Cloudflare Quick Tunnel / Ngrok opcional)
   │
   ▼
[filtro] (Caddy 2.8.4 — reverse proxy estrito)
   │  ├── Permite exclusivamente: POST /webhook/telegram-ofertas
   │  └── Bloqueia qualquer outra rota externa com HTTP 404
   ▼
[n8n] (n8nio/n8n:2.47.7 · Node.js v26.13.0 · 127.0.0.1:5678 · SQLite /home/node/.n8n/database.sqlite)
   ├── [vigia]    → Monitora URL do túnel a cada 15s (chama WF 90) e executa healthcheck a cada 5 min (chama WF 91 + healthchecks.io)
   ├── [backup]   → Backup atômico diário via `sqlite3 .backup` + retenção de 7 dias em `servidor-local/backups/`
   ├── [preparar] → Importador idempotente protegido pela trava `PUBLICAR_WORKFLOWS=sim`
   └── [render]   → Sidecar opcional (perfil `render`, porta interna 3000) para geração de cards 1080x1080
```

### 1.2. Gerador de Workflows e Bundler com Tree-Shaking (`build/build-workflows.js`)

O código-fonte vive modularizado em `lib/*.js` e é compilado para os Code nodes do n8n por `build/build-workflows.js`:
- **Tree-shaking estático por nó**: `carregarIndiceLib()` analisa o grafo de dependências entre os módulos de `lib/` e injeta em cada Code node apenas o fecho transitivo dos símbolos `LIB.<fn>` efetivamente referenciados naquele nó.
- **Portão Dry-Run (`comPortao`)**: Todos os nós HTTP que enviam mensagens externas (Telegram e WhatsApp) passam automaticamente por um nó `If` (`publicacao.dry_run`) que desvia para um simulador sem rede quando `publicacao.dry_run = sim`.
- **Isolamento Produção vs. Desenvolvimento**:
  - `npm run build` gera os 6 workflows em `n8n/workflows/`.
  - `npm run release` gera os 8 workflows em `servidor-local/workflows/` (incluindo `90-tunel.json` e `91-saude.json`), que só entram no contêiner ativo quando o operador define explicitamente `PUBLICAR_WORKFLOWS=sim`.

### 1.3. Mapa dos Workflows (`n8n/workflows/` e `servidor-local/workflows/`)

| Workflow | Gatilho | Responsabilidade Principal |
|---|---|---|
| `00-setup.json` | Manual / Webhook WF 90 | Cria as 8 Data Tables, popula chaves padrão em `bfx_config`, registra webhooks dos 2 bots (`bot_token` e `bot_token_grupo`) e estrutura os 14 tópicos do supergrupo. |
| `01-telegram-router.json` | Webhook (`POST /webhook/telegram-ofertas`) | Roteador central: links colados, `/oferta`, `/link`, `/cupom`, `/radar`, `/buscas`, `/canais`, `/divulgar`, `/logo`, `/agentes`, `/afiliados`, `/modo`, `/config`, `/alerta`, `/buscar`, `/cupons`, `/tophoje`, `/demanda`, `/resumao`, Concierge 24/7, moderação `/admin`, callbacks de aprovação e disparo WhatsApp. |
| `02-coleta-shopee.json` | Cron (a cada 2h, 8h–22h) | Consulta a Shopee Affiliate Open API (GraphQL), avalia selo de 90 dias e envia cards de aprovação. |
| `03-relatorio-diario.json` | Cron (22h05 diário) | Consolida métricas do dia (ofertas, posts, cliques/entradas por convite, retenção, lojas sem afiliado) e dispara divulgação cruzada automática dos canais. |
| `04-radar-ofertas.json` | Cron (a cada 2 min) | Pipeline autônomo Multi-Agente: planeja fontes (60+ lojas, Promobit, catálogos 1P VTEX/Magento/Shopify/Nuvemshop, buscas Amazon 1P, Shopee API e canais curados), resolve até 3 saltos de redirecionamento, enriquece PDPs, audita preços no Zoom + Amazon, seleciona copy contextual e publica com fallback binário/texto. |
| `05-guardiao-ofertas.json` | Cron (`15,45 8-23 * * *`) | Verifica ofertas publicadas a cada 30 min (encerra esgotadas ou que subiram >=28%, atualiza ao vivo quedas extras >=6%), expira pendentes >18h, publica Esquenta de Cupons às 18h45 e Vitrine Top 5 às 21h15. |
| `90-tunel.json` | Webhook local (`vigia`) | Valida domínio do túnel (anti-SSRF), atualiza `n8n_webhook_url` em `bfx_config` e aciona o `00-setup`. |
| `91-saude.json` | Webhook local (`vigia` 5 min) | Consulta `getWebhookInfo` dos dois bots, detecta atrasos de entrega, filas acumuladas ou tokens inválidos e alerta admins com cooldown de 60 min. |

### 1.4. Persistência nas Data Tables (`lib/tabelas.js`)

| Tabela | Esquema e Papel Operacional |
|---|---|
| `bfx_config` | Par `chave` / `valor` com toda a configuração operacional, credenciais de bots, IDs de tópicos/canais e tags de afiliados. |
| `bfx_precos` | Histórico próprio de preços (`produto_id`, `loja`, `preco`, `fonte`, `fonte_url`, `ts`, `data`) usado pelo selo de 90 dias e pelo novo detector de queda recente. |
| `bfx_ofertas` | Ciclo de vida completo das ofertas (`pendente`, `publicando`, `aprovada`, `rejeitada`, `editada`, `encerrada`, `falha`) e metadados em `links_manuais` (JSON). |
| `bfx_links` | Rastreamento de links monetizados gerados por plataforma (`tg`, `tgc`, `wag`, `wac`, `x`) e `subid` (`bf26_<cat>_<plat>_...`). |
| `bfx_posts` | Registro das mensagens efetivamente entregues no Telegram (`oferta_id`, `plataforma`, `categoria`, `message_id`, `link`, `ts`). |
| `bfx_convites` | Links de convite rastreáveis criados via `/convite` para atribuição de campanhas. |
| `bfx_entradas` | Eventos LGPD-safe (`user_hash` SHA-256 + sal, `tipo`: `entrou`/`saiu`/`start`, `convite_nome`, `ts`). |
| `bfx_alertas` | Alertas pessoais de membros (`/alerta <termo> [preco_max]`), com `user_hash`, `chat_id` para DM no bot publicador e `ultimo_aviso_ts`. |

---

## 2. Avaliação Multidisciplinar das 8 Equipes Especialistas

### Equipe 1 — Product Management
- **Diagnóstico**: O Ofertô possui diferenciais raros (14 nichos, histórico próprio de preços, auditoria cruzada em comparadores, alertas pessoais `/alerta`, busca `/buscar` e transparência de selo), mas sofria com queda recente de volume de publicações nas últimas horas e com falta de destaque explícito do custo unitário e do motivo real pelo qual a oferta vale a pena.
- **Decisão**: Preservar rigorosamente a veracidade dos descontos enquanto eliminamos falsos bloqueios de auditoria, exibindo argumentos claros de valor (custo por unidade, queda contra histórico recente, comparação verificada com concorrente e atendimento a alertas da comunidade).

### Equipe 2 — Inteligência Artificial e Data Science
- **Diagnóstico**: A decisão de aprovação estava fragmentada entre filtros booleanos isolados em `lib/mercado.js`, `lib/radar.js` e `lib/selo.js`. Além disso, a tabela `bfx_precos` (com mais de 3.400 registros reais em produção) era ignorada pelo selo enquanto o produto não completava 90 dias corridos de acompanhamento.
- **Decisão**: Criar o motor **`lib/inteligencia.js` (Ofertô Intelligence)** com Contexto Compartilhado (`construirContextoOferta`), Compreensão de Produto (`entenderProdutoOferta`), Detector de Queda no Histórico Recente (`avaliarQuedaHistoricoRecente`), Pontuação Multicritério Explicável em 9 dimensões (`avaliarOportunidadeInteligente`), Telemetria de Funil (`construirRelatorioFunil`), Aprendizado Contínuo (`analisarAprendizadoHistorico`) e Autocura (`diagnosticarAutocura`).

### Equipe 3 — Marketing e Copywriting
- **Diagnóstico**: O motor `lib/tom.js` já possuía uma boa base de frases por nicho e validação contra promessas falsas (`validarCopy`), mas registrava apenas `{ texto, chaves }` na memória, sem classificar explicitamente a estrutura, estilo, tipo de abertura, argumento comercial, CTA, categoria e destino.
- **Decisão**: Expandir a memória contextual em `lib/tom.js` (`classificarMetadadosCopy`, `atribuirCopyTom`) para rastrear e penalizar repetição de `estrutura`, `estilo`, `tipo_abertura`, `argumento` e `cta`, garantindo variação real entre publicações consecutivas a custo zero.

### Equipe 4 — Arquitetura e Desenvolvimento
- **Diagnóstico**: O bundler com tree-shaking (`build/build-workflows.js`) exige módulos puros sem dependências externas do Node nos Code nodes. Qualquer novo módulo precisa respeitar o isolamento de `Config` e `90-tunel`.
- **Decisão**: Implementar `lib/inteligencia.js` 100% puro e determinístico, mantendo `tests/otimizacao.test.js` e a compilação em sandbox VM intactos.

### Equipe 5 — Automação e SRE
- **Diagnóstico**: A auditoria forense dentro do contêiner `oferto-n8n-1` e do SQLite `/dados/database.sqlite` revelou a causa exata de `⚠️ Falhas na Bot API: sendMessage: timeout of 45000ms exceeded`: combinação de Happy Eyeballs de 500ms para IPv6 inacessível no Node 26, acumulação de streams não consumidos (`responseFormat: 'autodetect'`) no `HttpRequestV3` do n8n 2.47.7, e `link_preview_options.url` no fallback de `sendMessage` apontando para URLs de imagem `.webp` ou corrompidas (23 bytes) que haviam acabado de falhar no `sendPhoto`.
- **Decisão**: Corrigir as 3 camadas (rede/Node, configuração HTTP do n8n e motor central de envio/fallback em `lib/tg-envio.js` + `build/build-workflows.js`).

### Equipe 6 — UX e Conversão
- **Diagnóstico**: Os posts de Telegram e WhatsApp precisam manter leitura rápida em menos de 3 segundos, destacando gancho, título limpo (`enxugarTituloOferta`), linha de copy humanizada, preço final, cupom (com aviso quando exige resgate prévio) e prova de economia.
- **Decisão**: Preservar a hierarquia visual escaneável e enriquecer o contexto com métricas unitárias e explicabilidade no card de administração.

### Equipe 7 — Segurança, Conformidade e Privacidade
- **Diagnóstico**: Auditados `.gitignore`, histórico Git, scripts de shell, Caddyfile, `90-tunel` (proteção anti-SSRF por whitelist de domínios), `render/baixar.js` (whitelist de CDNs HTTPS), LGPD (`user_hash` SHA-256 com `hash_sal`) e CONAR (`#publi` e disclosure Amazon Associates).
- **Decisão**: Manter todas as travas de segurança e conformidade ativas; nenhum segredo ou token é exposto em código ou documentação.

### Equipe 8 — Analytics e Crescimento
- **Diagnóstico**: Faltava visibilidade estruturada das etapas do funil do radar e um mecanismo que cruzasse alertas cadastrados por membros (`/alerta`) com o histórico de publicações dos últimos 7 dias para apontar demanda reprimida.
- **Decisão**: Implementar `construirRelatorioFunil` e `analisarAprendizadoHistorico` com trava de amostra mínima (`MIN_AMOSTRA = 3`).

---

## 3. Achados Técnicos e Forenses (Classificados por Criticidade)

### ACHADO 01 — [CRÍTICO] Auto-Bloqueio da Própria Loja na Auditoria de Mercado (Responsável por 90,4% dos descartes do Radar)
- **Arquivo / Função / Localização**: [`lib/mercado.js`](file:///c:/Users/tHg/Documents/Oferto/lib/mercado.js#L444-L477) → `avaliarPrecoMercado(candidato, hitsCasados, opcoes)`
- **Evidência em Produção (`database.sqlite`)**:
  - Na memória `staticData.global.radar_descartes` do workflow `04-radar-ofertas` (`wfRadar000000001`), de 800 ofertas descartadas, **723 (90,4%)** foram descartadas com motivo `reprovado_mercado`.
  - O volume de ofertas aprovadas caiu de **171/hora (20h)** para **33/hora (01h)** à medida que `radar_descartes` encheu com falsos positivos de `reprovado_mercado` (bloqueados por 6 horas).
- **Causa Raiz**:
  - Na linha 444, `outraLoja` filtrava corretamente os hits de concorrentes (`h.loja_id !== c.loja`), mas na linha 448 a `mediana` era calculada sobre `validos` (que **incluía os hits da própria loja candidata** no Zoom!).
  - Quando o Zoom retornava apenas 1 resultado e era da própria loja candidata (`outraLoja.length === 0`, muito comum em Época Cosméticos, Drogarias Pacheco, Venancio, Ikesaki e FARM Rio), `mediana` ficava idêntica a `preco`. Em seguida, o **Bloqueio 2** (`preco > mediana * fatorBloqueio2`) comparava o preço da loja contra ela mesma (`preco > preco * 0.93 === true`) e **reprovava a oferta (`sem_desconto_mercado` → `reprovado_mercado`)**!
  - Mesmo quando havia 1 concorrente mais caro (ex.: Pacheco a R$ 69,90 e Amazon a R$ 74,90), incluir o próprio R$ 69,90 da Pacheco no cálculo da mediana puxava a mediana para R$ 72,40 e fazia o Bloqueio 2 reprovar uma oferta legítima.
- **Impacto**: Eliminação em massa de ofertas legítimas de dezenas de lojas 1P e queda acentuada no volume de publicações.
- **Correção Implementada**:
  - Quando `outraLoja.length === 0` (nenhum concorrente encontrado além da própria loja), `avaliarPrecoMercado` retorna `aprovar: true, motivo: 'sem_referencia_mercado'` (mantendo a captura de `imagem_mercado` e a trava anti-"metade do dobro" para `preco_de > preco * 2.6`).
  - Quando `outraLoja.length > 0`, `mediana` passa a ser calculada exclusivamente sobre `outraLoja` (preços dos concorrentes).
- **Teste Automatizado**: `tests/oferto-intelligence.test.js` → `13.1.1 Auditor de Mercado: loja própria no Zoom nunca auto-bloqueia a oferta no Bloqueio 2`.

---

### ACHADO 02 — [CRÍTICO] `sendMessage: timeout of 45000ms exceeded` na Bot API do Telegram
- **Arquivos / Funções / Localizações**:
  1. [`servidor-local/docker-compose.yml`](file:///c:/Users/tHg/Documents/Oferto/servidor-local/docker-compose.yml#L27) → `NODE_OPTIONS`
  2. [`build/build-workflows.js`](file:///c:/Users/tHg/Documents/Oferto/build/build-workflows.js#L544-L598) → `httpTelegram`, `httpTelegramArquivo`, `Resumir foto radar` e `Preparar foto radar`
  3. [`lib/tg-envio.js`](file:///c:/Users/tHg/Documents/Oferto/lib/tg-envio.js#L32-L125) → `limiteTelegram`, `sanitizarFallbackTexto`, `validarBinarioFotoTelegram`
- **Evidência em Produção (`oferto-n8n-1` & `database.sqlite`)**:
  - Execução `1338` e oferta `omwntae4d1yk` (Hopescolor, imagem `.webp` da Nuvemshop): `sendPhoto` falhou com HTTP 400 (Telegram não aceita `.webp` em `sendPhoto`), entrou no fallback `sendMessage` com `link_preview_options: { url: "https://acdn-us.mitiendanube.com/...webp" }` e estourou **`sendMessage: timeout of 45000ms exceeded`**, deixando a oferta com `status = 'aprovada'` em `bfx_ofertas` e **0 registros em `bfx_posts`**.
  - Oferta `omwnpi2pc2e7` (Centauro via Promobit): a URL `https://i.promobit.com.br/500/static/p/136319628217950492111885046251.jpg` retorna HTTP 200 `image/png` com apenas **23 bytes** (arquivo truncado/corrompido). `Resumir foto radar` aceitava qualquer `/^image\//i` sem validar tamanho mínimo nem rejeitar `.webp`, enviando o arquivo corrompido de 23 bytes via multipart para `Telegram (reenvio foto)`, que falhava novamente.
- **Causa Raiz Tripla**:
  1. **Rede / IPv6 Happy Eyeballs no Contêiner (`Node v26.13.0`)**: Dentro de `oferto-n8n-1`, `dns.lookup('api.telegram.org', { all: true })` retorna IPv4 `149.154.166.110` (RTT base de ~225ms do Brasil até Amsterdã) e IPv6 `2001:67c:4e8:f004::9` (`ENETUNREACH` no Docker bridge). No Node 26, `autoSelectFamily` vem ativo com `autoSelectFamilyAttemptTimeout = 500ms`. Qualquer jitter ou retransmissão de SYN > 500ms durante rajadas faz o Node abortar a tentativa IPv4 aos 500ms e tentar a rota IPv6 inacessível.
  2. **Acúmulo de Streams Abertos no `HttpRequestV3` (`n8n 2.47.7`)**: `httpTelegram` e `httpTelegramArquivo` não definiam `responseFormat: 'json'`. No `HttpRequestV3.node.js:196,365`, o padrão `'autodetect'` ativa `useStream = true` (`responseType: 'stream'`), mantendo todos os sockets/streams `IncomingMessage` do lote abertos sem leitura até o término de `Promise.allSettled(requestPromises)`.
  3. **Reuso de URL de Imagem Quebrada/WebP no `link_preview_options` do Fallback**: Quando `sendPhoto` falhava porque a URL da imagem era `.webp` ou inacessível pelo crawler do Telegram (`failed to get HTTP URL content` / `WEBPAGE_CURL_FAILED`), o fallback `sendMessage` mantinha essa mesma URL quebrada em `link_preview_options.url`, forçando o servidor do Telegram a tentar baixá-la novamente durante o `sendMessage` até atingir o timeout de 45.000ms.
- **Correção Implementada**:
  1. Adicionado `--no-network-family-autoselection` ao `NODE_OPTIONS` em `servidor-local/docker-compose.yml`.
  2. Adicionado `responseFormat: 'json'` em `httpTelegram` e `httpTelegramArquivo` em `build/build-workflows.js`.
  3. Em `Resumir foto radar`, `Preparar foto radar` e `validarBinarioFotoTelegram`: exigido MIME `/^image\/(?:jpe?g|png|gif)$/i` e tamanho base64 `>= 280` (~210+ bytes reais, descartando arquivos corrompidos de 23 bytes e `.webp`).
  4. Em `limiteTelegram` e `Resumir foto radar`: `sanitizarFallbackTexto` desativa `link_preview_options` (`{ is_disabled: true }`) quando a imagem original é `.webp` ou falhou por erro de download/curl, garantindo entrega imediata do `sendMessage` de fallback.
- **Testes Automatizados**: `tests/oferto-intelligence.test.js` → `13.3.1`, `13.3.2` e `13.3.5`.

---

### ACHADO 03 — [ALTO] Descarte de Quedas Reais de Preço em Produtos com Histórico < 90 Dias (`sem_prova_de_desconto`)
- **Arquivos / Funções / Localizações**: [`lib/radar.js`](file:///c:/Users/tHg/Documents/Oferto/lib/radar.js#L1725-L1915) → `avaliarOfertaReal` e `finalizarRadar`; [`lib/inteligencia.js`](file:///c:/Users/tHg/Documents/Oferto/lib/inteligencia.js#L431-L483) → `avaliarQuedaHistoricoRecente`
- **Evidência em Produção**: Segunda maior causa de descarte no radar (`sem_prova_de_desconto`: 63 descartes recentes), enquanto `bfx_precos` já acumula 3.421 snapshots reais.
- **Causa Raiz**: `avaliarSelo` exige 90 dias completos desde a primeira coleta para emitir `selo: 'ok'`. Quando um produto monitorado há poucos dias caía de preço (ex.: R$ 429 → R$ 349 em `bfx_precos`) mas a loja não exibia preço riscado `"De:"` no HTML, `avaliarSelo` retornava `sem_ref` e `avaliarOfertaReal` descartava a oferta por `sem_prova_de_desconto`, bloqueando-a por 6 horas. Além disso, ofertas aprovadas pelo comparador de mercado com 7%–9% de vantagem sobre os concorrentes (sem `"De:"` na loja) eram barradas porque `avaliarOfertaReal` exigia 10% fixos na linha 1752.
- **Correção Implementada**:
  - Criado `avaliarQuedaHistoricoRecente(oferta, linhasPrecos, agora)` em `lib/inteligencia.js` e integrado em `finalizarRadar` e `avaliarOfertaReal`: quedas verificadas `>= 5%` e `>= R$ 2,00` contra coletas anteriores da própria `bfx_precos` (no menor patamar já observado) são reconhecidas como `queda_historico_recente`.
  - Ajustado o limiar de prova de mercado em `avaliarOfertaReal` para `>= 7%` e `>= R$ 3,00` (alinhado ao Bloqueio 2 do Auditor de Mercado).
  - Reduzido o TTL de descartes transientes `sem_prova_de_desconto` em `atualizarDescartesRadar` de 6h para 2h e ampliada a capacidade do cache de 800 para 1.200 chaves sem duplicar `radar_key === chave`.
- **Teste Automatizado**: `tests/oferto-intelligence.test.js` → `13.1.2 Detector de queda no histórico recente (bfx_precos < 90 dias) aprova queda real verificada`.

---

### ACHADO 04 — [ALTO] Falha de Isolamento Multicanal e Atualização Parcial de Status em Lotes (`resultadoChamadas`)
- **Arquivo / Função / Localização**: [`lib/tg-envio.js`](file:///c:/Users/tHg/Documents/Oferto/lib/tg-envio.js#L76-L125) → `resultadoChamadas`
- **Causa Raiz**:
  1. Se uma oferta era enviada para 2 destinos (ex.: tópico da categoria `tg` + canal `tgc` ou tópico `top`), e 1 destino funcionava enquanto o outro falhava, `naoSaiu` marcava a oferta inteira com `status: 'falha'`, violando o isolamento multicanal.
  2. Quando 2 ou mais ofertas falhavam totalmente no mesmo lote do radar, apenas `naoSaiu[0]` era retornada em `update`.
- **Correção Implementada**:
  - Criado `rastrearEntregasPorDestino` em `lib/tg-envio.js`.
  - Uma oferta só é marcada como `status: 'falha'` se **nenhum** destino daquela oferta obteve publicação confirmada (`!ofertasComSucesso.has(oid)`).
  - Retornado array `updates` com todas as ofertas do lote que falharam em 100% dos destinos (preservando `update: updates[0] || null` para retrocompatibilidade).
- **Teste Automatizado**: `tests/oferto-intelligence.test.js` → `13.3.3 Isolamento Multicanal`.

---

### ACHADO 05 — [MÉDIO] Memória de Copywriting Sem Metadados Estruturais de Estilo, Abertura, Argumento e CTA
- **Arquivo / Função / Localização**: [`lib/tom.js`](file:///c:/Users/tHg/Documents/Oferto/lib/tom.js#L1766-L1970) → `candidatasCopy`, `atribuirCopyTom`
- **Causa Raiz**: `copy_tom` armazenava apenas `{ texto, chaves }`, sem classificar nem penalizar repetição de estilo (`direto`, `informal`, `consultivo`, `tecnico`, `premium`, `economico`, `oportunidade`, `especializado`, etc.), tipo de abertura, argumento comercial e CTA.
- **Correção Implementada**: Criado `classificarMetadadosCopy` em `lib/tom.js`, adicionadas chaves de penalização de estilo (`e:`) e tipo de abertura (`g:`) em `PESO_CHAVE` e persistidos `{ texto, chaves, estrutura, estilo, tipo_abertura, argumento, cta, categoria, destino }` em `copy_tom`.
- **Teste Automatizado**: `tests/oferto-intelligence.test.js` → `13.2.1` e `13.2.2`.

---

### ACHADO 06 — [BAIXO] Divergências na Documentação (`README.md` e `servidor-local/README.md`)
- **Arquivos**: [`README.md`](file:///c:/Users/tHg/Documents/Oferto/README.md) e [`servidor-local/README.md`](file:///c:/Users/tHg/Documents/Oferto/servidor-local/README.md)
- **Causa Raiz**: O `README.md` mencionava números antigos de fases anteriores ("29 lojas", "28 lojas", "18 lojas", "7 nichos + Top", "4 arquivos" / "5 arquivos" de workflow), enquanto o código atual monitora **60+ lojas**, **13 categorias + Top (14 tópicos/canais)** e gera **6 workflows em `n8n/workflows/`** (**8 workflows em `servidor-local/workflows/`**).
- **Correção Implementada**: Documentação principal e guia do servidor local atualizados e alinhados com o estado real do código.

---

## 4. Auditoria de Segurança, Conformidade (CONAR/CDC) e Privacidade (LGPD)

| Domínio | Verificação | Status |
|---|---|---|
| **Segredos no Git / Código** | Varredura de `.env`, tokens do BotFather, chaves Shopee/Keepa/LLM e backups `.tar.gz`/`.sqlite`. `.gitignore` bloqueia `.env`, `backups/`, `*.sqlite`, `*.tar.gz`. | **CONFORME** (0 segredos no código ou histórico) |
| **Proteção de Credenciais no Chat** | `lib/config.js` (`CHAVES_SENSIVEIS`) mascara `bot_token`, `bot_token_grupo`, `webhook_secret`, `hash_sal`, `shopee.secret`, `keepa.chave`, `copy.ia_chave` e `whatsapp.api_key` no comando `/config`. | **CONFORME** |
| **Prevenção de SSRF** | `lib/tunel.js` valida estritamente o host do túnel (`trycloudflare.com`, `ngrok-free.app`, `ngrok.app` ou `tunel.dominio`). `render/baixar.js` exige HTTPS, bloqueia IPs privados/loopback e restringe downloads a CDNs de lojas na allowlist. | **CONFORME** |
| **Privacidade / LGPD** | `lib/fluxos.js` e `lib/comunidade.js` nunca gravam nome, `@username`, telefone ou ID puro de membros em `bfx_entradas`; apenas `user_hash = sha256(sal + ':' + userId)`. | **CONFORME** |
| **CONAR / Transparência Publicitária** | Todos os posts de Telegram, WhatsApp (Grupo e Canal) e X incluem `#publi` e aviso explícito de link de afiliado; links da Amazon incluem a frase obrigatória de Associado da Amazon e suportam `amazon.mostrar_preco = nao`. | **CONFORME** |
| **Integridade de Preços (CDC)** | `validarCopy` proíbe falsa escassez ("últimas unidades", "só hoje") e promessas médicas/cosméticas; `avaliarPrecoMercado` e `avaliarOportunidadeInteligente` bloqueiam "metade do dobro". | **CONFORME** |
