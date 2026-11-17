# Ofertô: bot de ofertas (Telegram + n8n)

Automação da seção 4 do plano ("publicar uma vez, distribuir em quatro"):

```
/oferta (você) ou coleta Shopee (a cada 2 h)
        → cálculo do menor preço em 90 dias + selo ✓ Desconto real
        → card de aprovação no seu Telegram (1 clique)
        → post automático no tópico da categoria (supergrupo do Telegram)
        → textos prontos para Canal WhatsApp, Grupo WhatsApp (alerta de preço) e X
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
| `servidor-local/` | n8n Community grátis no seu computador (Docker + túnel). Guia em [servidor-local/README.md](servidor-local/README.md). |
| `teste-local/` | Teste de ponta a ponta com n8n local e Telegram/Shopee falsos. |

## Onde rodar

| Opção | Custo | Como |
|---|---|---|
| **Seu computador** (n8n Community + Docker) | Grátis; o computador precisa ficar ligado | [servidor-local/README.md](servidor-local/README.md): sobe tudo com `docker compose up -d`, importa os workflows e liga o webhook sozinho |
| **n8n Cloud** | Plano pago após o teste grátis ([limite de execuções](#execuções-do-n8n-cloud-confira-o-seu-plano)) | Passo a passo abaixo: importar os 4 arquivos `.json` de `n8n/workflows/` |

Os workflows são os mesmos nas duas opções. No servidor local, os passos 2 e 4 abaixo são automáticos.

## Arquitetura em 1 minuto

- **Dois bots** no Telegram:
  - **bot de aprovação**: conversa privada com você (cards, botões, textos prontos);
  - **bot publicador**: admin do supergrupo; posta as ofertas e cria links de convite.
  - Motivo: no n8n Cloud cada evento recebido conta como **uma execução**. Um bot admin do grupo recebe todas as mensagens do tópico "Conversa"; com dois bots, o publicador só recebe entradas e saídas. Dá para usar um bot só (deixe `bot_token_grupo` vazio), mas não recomendo.
- **Configuração e dados** ficam em Data Tables do n8n (`bfx_config`, `bfx_precos`, `bfx_ofertas`, `bfx_links`, `bfx_posts`, `bfx_convites`, `bfx_entradas`). Você edita a config direto no painel.
  - Não crie outras tabelas com nomes que contenham esses trechos: o n8n procura tabela "por nome" com busca do tipo *contém*.
- **Privacidade (LGPD):** de quem entra ou sai do grupo, o bot grava só um código pseudonimizado (`user_hash`), o nome do link de convite e a data, nunca ID, nome, @ ou telefone. A mensagem fixada 🔒 Segurança e privacidade conta isso aos membros e diz como pedir a exclusão (falar com um admin).

---

## Passo a passo (≈ 40 min)

### 1. Criar os dois bots (Telegram, @BotFather)

1. `/newbot` → nome e @ do **bot de aprovação** (ex.: `oferto_aprova_bot`). Guarde o token.
2. `/newbot` → **bot publicador** (ex.: `oferto_ofertas_bot`). Guarde o token.

### 2. Importar no n8n Cloud

1. Em **Workflows → Create → Import from file**, importe os 4 arquivos de `n8n/workflows/`, um de cada vez.
2. Abra **00 · Setup** e clique em **Execute workflow**. Isso cria as 7 tabelas e a tabela de configuração com os valores padrão.

### 3. Preencher a configuração (Overview → Data tables → `bfx_config`)

Preencha agora:

| chave | valor |
|---|---|
| `marca` | `Ofertô` (já vem preenchido; pode trocar depois) |
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

> **Por que um grupo com tópicos, e não um grupo por categoria?** No Telegram, um só link serve para todos os anúncios. O membro silencia os tópicos que não quer, e o 💬 Conversa reúne a comunidade num lugar só, então o grupo cresce mais rápido e parece mais vivo. Com o bot, publicar num tópico ou em outro dá o mesmo trabalho. A medição por anúncio continua separada pelos links de convite nomeados. Separar por categoria faz sentido no **WhatsApp**, que não tem tópicos: lá, use um canal ou grupo por categoria (veja o kit de operação).

1. Crie um grupo e, em **Configurações do grupo**, ative **Tópicos**.
2. Adicione o **bot publicador** como **administrador** com estas permissões:
   - **Alterar informações do grupo**: para escrever a descrição;
   - **Fixar mensagens**: para fixar o 👋 Comece aqui, a segurança e os textos dos tópicos;
   - **Gerenciar tópicos**: para criar, renomear e fechar tópicos;
   - **Convidar usuários via link**: para o `/convite`;
   - **Apagar mensagens**: para apagar os avisos automáticos ("fulano entrou", "fixou uma mensagem", "fechou o tópico"). Para manter os avisos, mude `grupo.limpar_avisos` para `nao`.
3. O bot avisa você no privado com o **ID do grupo** (`-100…`) e mostra quais permissões estão faltando. Copie o ID para `grupo_id`.
4. Se quiser, preencha `grupo_link` com o link público do grupo.
5. Rode o **00 · Setup** pela 3ª vez. Ele:
   - cria os tópicos 🔥 Top do Dia, 🏠 Casa & Eletro, 🎁 Beleza & Presentes, 👶 Bebê & Família e 💻 Tech e grava os IDs na config;
   - escreve a descrição do grupo e renomeia o **General** para **💬 Conversa**;
   - publica e fixa no Conversa a mensagem 🔒 Segurança e privacidade (critério do selo, dados que guardamos e aviso de afiliado) e, por último, o **👋 Comece aqui** (boas-vindas, link direto para cada tópico, as 4 regras e o convite para chamar amigos), que fica no topo;
   - fixa em cada tópico um texto com o que o membro encontra ali e quantas ofertas esperar por dia;
   - **fecha** os tópicos de oferta: só admins e o bot postam neles;
   - manda no seu Telegram o resumo "🧩 Grupo arrumado" (e o "⚙️ Setup" só quando há algo a fazer).
6. A arrumação roda **uma vez**, mesmo se algum passo falhar, para nunca duplicar mensagens. O que falhar você faz à mão no app. Valores de `grupo.textos`:
   - `atualizar`: reescreve as mensagens fixadas no lugar, sem mandar nada novo. Use para **mudar os textos**.
   - `limpar`: **apaga todas as mensagens do grupo**, inclusive as de membros (os tópicos ficam), e arruma tudo de novo. Leva cerca de 4 minutos. Use para zerar o grupo de teste antes de abrir ao público; precisa da permissão **Apagar mensagens**.

### 7. Teste

Mande ao bot de aprovação:

```
/oferta casa
https://www.amazon.com.br/dp/B0XXXXXXXX
Air Fryer Mondial 4L
preço 349,90
ref90 399,90 https://link-do-comparador-com-o-historico
img https://link-da-imagem.jpg
cupom BF10
```

As linhas `img` e `cupom` são opcionais. Com cupom, informe em `preço` o valor **já com o cupom**; o post mostra o código para copiar com um toque e avisa "preço com cupom da loja, sujeito a limite e validade".

Você deve receber o card. Clique **✅ Aprovar** e confira o post no tópico Casa & Eletro e as mensagens com os textos para WhatsApp e X. O post sai assim:

```
🏠 Casa & Eletro · #publi
Air Fryer Mondial 4L

💰 R$ 349,90 na Amazon
🕒 Preço e disponibilidade de 24/11 às 12:30, sujeitos a alteração. Frete: confira na loja.
✅ Desconto real: 12% abaixo do menor preço dos últimos 90 dias (R$ 399,90)
🎟️ Cupom: BF10 (toque para copiar)
Preço com cupom da loja, sujeito a limite e validade.

👉 Ver na Amazon
Contém link de afiliado. Como Associado da Amazon, ganhamos com compras qualificadas.
[🛒 Ver na Amazon]
[📣 Chamar amigos]   ← só com grupo_link preenchido
```
Antes, crie as tags da Amazon (passo 8); sem elas o card avisa **BLOQUEIO** e não mostra o botão de aprovar.

### 8. Programas de afiliados

- **Amazon:** no Associates Central, em **Gerenciar IDs de rastreamento**, crie uma tag por **categoria × plataforma** (16 tags; ex.: `ofertocasatg-20`, `ofertocasawac-20`…).
  - Preencha as linhas `amazon.tag.casa_tg`, `amazon.tag.casa_wac` etc.
  - `amazon.tag_padrao` serve de fallback, mas aí você perde a separação por plataforma.
  - `amazon.mostrar_preco` (padrão `sim`): com `nao`, os posts da Amazon não mostram valor nem %; dizem "no menor preço dos últimos 90 dias" e "👉 Veja o preço atual na Amazon". Use se os termos exigirem preço vindo da API oficial.
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
- **⚡ Relâmpago** faz o mesmo, abre o post do Telegram com "⚡ ALERTA DE PREÇO" e manda também o texto do **Grupo WhatsApp** (alerta de preço, sem prometer escassez).
  - **Cole** esse texto no grupo em vez de encaminhar do canal: o encaminhamento leva o link do canal (`wac`) e você perde a medição do grupo (`wag`).
- **⭐ Aprovar + Top do Dia** publica também no tópico Top do Dia.
- **✏️ Editar** devolve o `/oferta` preenchido para você corrigir (normalmente o `ref90`) e reenviar.
- **❌ Rejeitar** descarta a oferta.

Os botões de aprovar **só aparecem com o selo ✓**. Os cards da coleta Shopee chegam primeiro sem referência de 90 dias: o card traz um link de busca no Google Shopping para você achar a referência; use **✏️ Editar** e informe o `ref90`. O card também mostra de onde veio o menor preço (Keepa, histórico próprio ou manual) e a frase que vai sair no post.

### Critério público do selo (para fixar nos grupos e canais)

> **✅ Como conferimos o preço:** só publicamos se o preço estiver **igual ou abaixo do menor preço dos últimos 90 dias**. A referência vem do nosso histórico ou de um comparador de preços. Se houver as duas, vale a mais baixa. Com desconto de 1% ou mais, o post diz "X% abaixo do menor preço dos últimos 90 dias (R$ Y)"; com 0%, "igual ao menor preço dos últimos 90 dias". Se o histórico for mais curto, "menor preço desde DD/MM". Todo post traz a data e a hora do preço, e o preço pode mudar.

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

## Kit de operação

Textos fixados, moderação, conformidade (CONAR, CDC, LGPD), rotina diária, incidentes e métricas: [docs/kit-operacao](docs/kit-operacao/README.md).
