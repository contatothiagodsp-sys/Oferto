# Ofertas BF: bot do Telegram + n8n Cloud

Automação da seção 4 do plano ("publicar uma vez, distribuir em quatro"):

```
/oferta (você) ou coleta Shopee (a cada 2 h)
        → cálculo do menor preço em 90 dias + selo ✓ Desconto real
        → card de aprovação no seu Telegram (1 clique)
        → post automático no tópico da categoria (supergrupo do Telegram)
        → textos prontos para Canal WhatsApp, Grupo WhatsApp (relâmpago) e X
        → 1 link por plataforma, com sub-ID/tag próprio
```

## O que tem aqui

| Arquivo | O que é |
|---|---|
| `n8n/workflows/00-setup.json` | Rodar manualmente. Cria as Data Tables, as linhas de configuração, registra os webhooks e cria os tópicos do grupo. |
| `n8n/workflows/01-telegram-router.json` | O bot: recebe `/oferta`, cliques nos botões, `/convite` e entradas/saídas do grupo. |
| `n8n/workflows/02-coleta-shopee.json` | A cada 2 h (8h–22h) busca ofertas na Shopee Affiliate API e manda as candidatas para aprovação. |
| `n8n/workflows/03-relatorio-diario.json` | 22h05: resumo do dia (ofertas, posts, links, entradas por link de convite e retenção). |
| `docs/CONFIG.md` | Todas as chaves da tabela de configuração. |
| `lib/`, `tests/`, `build/` | Código-fonte da lógica (testado) e o gerador dos workflows. |
| `teste-local/` | Teste de ponta a ponta com n8n local e Telegram/Shopee falsos. |

Você **não precisa** rodar nada no computador: basta importar os 4 arquivos `.json` no n8n Cloud.

## Arquitetura em 1 minuto

- **Dois bots** no Telegram:
  - **bot de aprovação**: conversa privada com você (cards, botões, textos prontos);
  - **bot publicador**: admin do supergrupo; posta as ofertas e cria links de convite.
  - Motivo: no n8n Cloud cada evento recebido conta como **uma execução**. Um bot admin do grupo recebe todas as mensagens do tópico "Conversa"; com dois bots, o publicador só recebe entradas e saídas. Dá para usar um bot só (deixe `bot_token_grupo` vazio), mas não recomendo.
- **Configuração e dados** ficam em Data Tables do n8n (`bfx_config`, `bfx_precos`, `bfx_ofertas`, `bfx_links`, `bfx_posts`, `bfx_convites`, `bfx_entradas`). Você edita a config direto no painel.
  - Não crie outras tabelas com nomes que contenham esses trechos: o n8n procura tabela "por nome" com busca do tipo *contém*.
- **Privacidade (LGPD):** quem entra ou sai do grupo é gravado só como um código irreversível (`user_hash`), nunca com ID, nome ou telefone.

---

## Passo a passo (≈ 40 min)

### 1. Criar os dois bots (Telegram, @BotFather)

1. `/newbot` → nome e @ do **bot de aprovação** (ex.: `marca_aprova_bot`). Guarde o token.
2. `/newbot` → **bot publicador** (ex.: `marca_ofertas_bot`). Guarde o token.

### 2. Importar no n8n Cloud

1. Em **Workflows → Create → Import from file**, importe os 4 arquivos de `n8n/workflows/`, um de cada vez.
2. Abra **00 · Setup** e clique em **Execute workflow**. Isso cria as 7 tabelas e a tabela de configuração com os valores padrão.

### 3. Preencher a configuração (Overview → Data tables → `bfx_config`)

Preencha agora:

| chave | valor |
|---|---|
| `marca` | nome da marca (pode trocar depois) |
| `bot_token` | token do bot de aprovação |
| `bot_token_grupo` | token do bot publicador |

### 4. Ligar o webhook

1. Abra **01 · Telegram: aprovação e publicação** e clique em **Publish** (ativar).
2. Abra o nó **Webhook Telegram**, aba **Production URL**, e copie a URL (termina em `/webhook/telegram-ofertas`).
3. Cole a URL na linha `n8n_webhook_url` da `bfx_config`.
4. Rode o **00 · Setup** de novo. Ele registra os webhooks dos dois bots; o resultado aparece no nó **Resumo**.

### 5. Descobrir seu ID e virar admin

1. No Telegram, mande `/id` para o **bot de aprovação**.
2. Copie o número para a linha `admins`. Para mais de uma pessoa, separe os IDs com vírgula.

### 6. Criar o supergrupo com Tópicos

1. Crie um grupo e, em **Configurações do grupo**, ative **Tópicos**.
2. Adicione o **bot publicador** como **administrador** com as permissões **Gerenciar tópicos** e **Convidar usuários via link**.
3. O bot avisa você no privado com o **ID do grupo** (`-100…`) e confere as permissões. Copie o ID para `grupo_id`.
4. Se quiser, preencha `grupo_link` com o link público do grupo.
5. Rode o **00 · Setup** pela 3ª vez: ele cria os tópicos 🔥 Top do Dia, 🏠 Casa & Eletro, 🎁 Beleza & Presentes, 👶 Bebê & Família e 💻 Tech, grava os IDs na config e manda um resumo no seu Telegram.
6. Renomeie o tópico **General** para **💬 Conversa** e fixe as regras: "Nunca pedimos pagamento nem dados no privado. Contém links de afiliado." Para ofertas, só o bot posta.

### 7. Teste

Mande ao bot de aprovação:

```
/oferta casa
https://www.amazon.com.br/dp/B0XXXXXXXX
Air Fryer Mondial 4L
preço 349,90
ref90 399,90 https://link-do-comparador-com-o-historico
img https://link-da-imagem.jpg
```

Você deve receber o card. Clique **✅ Aprovar** e confira o post no tópico Casa & Eletro e as mensagens com os textos para WhatsApp e X.
Antes, crie as tags da Amazon (passo 8); sem elas o card avisa **BLOQUEIO** e não mostra o botão de aprovar.

### 8. Programas de afiliados

- **Amazon:** no Associates Central, em **Gerenciar IDs de rastreamento**, crie uma tag por **categoria × plataforma** (16 tags; ex.: `marcacasatg-20`, `marcacasawac-20`…).
  - Preencha as linhas `amazon.tag.casa_tg`, `amazon.tag.casa_wac` etc.
  - `amazon.tag_padrao` serve de fallback, mas aí você perde a separação por plataforma.
- **Shopee:** com acesso à **Affiliate Open API**, preencha `shopee.app_id` e `shopee.secret`. Ajuste as palavras-chave em `shopee.busca.<categoria>`, separadas por `;`. Depois, **Publish** no **02 · Coleta Shopee**.
- **Mercado Livre:** sem API. Gere os links no gerador de links do ML e inclua no `/oferta`, um por plataforma:
  ```
  tg https://mercadolivre.com/sec/...
  wac https://mercadolivre.com/sec/...
  wag https://mercadolivre.com/sec/...
  x https://mercadolivre.com/sec/...
  ```
- Por último, **Publish** no **03 · Relatório diário**.

---

## Uso diário

### Comandos (no privado com o bot de aprovação)

| Comando | Faz |
|---|---|
| `/oferta <categoria> [top]` + linhas | Cria a oferta e manda o card. Categorias: `casa`, `beleza`, `bebe`, `tech`. `top` também publica no Top do Dia. |
| `/convite <categoria> <nome>` | Cria um **link de convite nomeado** (ex.: `/convite beleza meta_beleza_v1`). Use um link por anúncio: o relatório mostra entradas, saídas e retenção por link. |
| `/id` | Mostra seu ID. |
| `/ajuda` | Lista os comandos. |

### Botões do card

- **✅ Aprovar** publica no tópico da categoria e manda 3 textos prontos: Canal WhatsApp, post do X e 1ª resposta do X (com o link).
- **⚡ Relâmpago** faz o mesmo e manda também o texto do **Grupo WhatsApp**.
  - **Cole** esse texto no grupo em vez de encaminhar do canal: o encaminhamento leva o link do canal (`wac`) e você perde a medição do grupo (`wag`).
- **⭐ Aprovar + Top do Dia** publica também no tópico Top do Dia.
- **✏️ Editar** devolve o `/oferta` preenchido para você corrigir (normalmente o `ref90`) e reenviar.
- **❌ Rejeitar** descarta a oferta.

Os botões de aprovar **só aparecem com o selo ✓**. Os cards da coleta Shopee chegam primeiro sem referência de 90 dias: use **✏️ Editar** e informe o `ref90`.

### Critério público do selo (para fixar no grupo e na landing)

> **✓ Desconto real:** o preço está **igual ou abaixo do menor preço dos últimos 90 dias**. A referência vem do nosso histórico, quando ele já cobre 90 dias, ou de um comparador de preços citado como fonte. Se houver as duas, vale a mais baixa. Todo post traz a data e a hora do preço, e o preço pode mudar.

### Sub-IDs gerados (seção 5 do plano)

| Plataforma | Shopee (sub1–sub5) | Amazon | Exemplo de sub-ID |
|---|---|---|---|
| Telegram | `bf26`, categoria, `tg`, `auto`, id da oferta | tag `<cat>_tg` | `bf26_casa_tg_auto` |
| Canal WhatsApp | … `wac`, `p<MMDD>` … | tag `<cat>_wac` | `bf26_beleza_wac_p1124` |
| Grupo WhatsApp | … `wag`, `relampago` … | tag `<cat>_wag` | `bf26_beleza_wag_relampago` |
| X | … `x`, `p<MMDD>` … | tag `<cat>_x` | `bf26_tech_x_p1124` |

Cada link gerado fica na tabela `bfx_links`, com oferta, plataforma e sub-ID, para cruzar com os relatórios dos programas.

---

## Execuções do n8n Cloud (confira o seu plano)

Cada evento abaixo é **1 execução**:
- cada `/oferta`;
- cada clique;
- cada `/convite`;
- cada entrada ou saída no grupo (com `rastrear_entradas = sim`);
- cada coleta da Shopee (8/dia, ≈ 240/mês);
- o relatório (30/mês).

Estimativa para o mês de pico (novembro), com 1.500–2.500 entradas, ~30% de saídas e ~60 ações suas por dia (`/oferta` + cliques): **≈ 4.000–6.000 execuções**. **VERIFICAR** o limite do seu plano. Se não couber, use `rastrear_entradas = nao` e rode o setup de novo: o app do Telegram já mostra quantas pessoas entraram por cada link de convite, mas aí você perde a retenção por link no relatório.

## Limitações conhecidas e itens a VERIFICAR

- **Shopee Affiliate API:** endpoint, nomes dos campos (`productOfferV2`, `generateShortLink`), formato de `commissionRate` e caracteres aceitos nos subIds foram implementados conforme a documentação pública conhecida. Confira no painel e, se algo divergir, ajuste `lib/shopee.js` e rode o build. A assinatura foi testada contra um servidor falso.
- **Histórico de 90 dias:** começa do zero hoje. Até completar 90 dias, o selo depende do `ref90` com fonte.
- **Amazon e Mercado Livre:** preço e título são informados por você. Não há raspagem de páginas, para não violar os termos das lojas.
- **Post com falha:** se o post no grupo falhar (ex.: bot sem permissão), a oferta fica como `aprovada` e você recebe um alerta "⚠️ Falhas na Bot API". Reenvie com `/oferta`.
- **X:** o bot entrega o texto pronto; a postagem é manual ou por agendador. Posts com link externo costumam ter menos alcance, por isso o link vai na 1ª resposta.
- **WhatsApp:** sem automação, de propósito: só a API oficial é segura contra banimento, e canais não têm API.

## Para quem for mexer no código

```bash
npm test
```

```bash
npm run build
```

- `npm test` roda os testes da lógica (`node --test`).
- `npm run build` regenera `n8n/workflows/*.json` e `docs/CONFIG.md`.
- **Não edite** o código dentro dos Code nodes no n8n: ele é gerado a partir de `lib/`. Edite `lib/`, rode o build e reimporte.
- Teste de ponta a ponta local (precisa de Node ≥ 24 e de `npm i n8n@2.47.7` numa pasta à parte):

```bash
N8N_DIR=/pasta/com/n8n ./teste-local/rodar.sh
```

```bash
python3 teste-local/cenarios.py
```

```bash
./teste-local/parar.sh
```
