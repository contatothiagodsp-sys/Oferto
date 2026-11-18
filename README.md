# Ofertô: bot automático de ofertas para afiliados (Telegram + WhatsApp + n8n — R$ 0 de custo)

Automação "colou o link, está publicado":

```
Só colar/encaminhar o link no Telegram (ou coleta automática Shopee a cada 2 h)
        → expande links curtos preservando seu afiliado (mercadolivre.com/sec, s.shopee.com.br, amzn.to…)
        → extrai título, preço atual, preço "De:", cupom, imagem e categoria DE GRAÇA (sem API paga)
        → gera copy persuasiva com gancho de atenção, economia em R$ e avisos do CONAR (#publi)
        → publica no grupo do Telegram (1 clique no card, ou 0 cliques com /modo rapido)
        → entrega o texto pronto do Grupo do WhatsApp com botão [📲 Enviar no WhatsApp (1 toque)]
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

### 6b. (Opcional) Canal só de uma categoria

Para quem quer **só Tech**, por exemplo, sem conversa e sem os outros tópicos. O membro segue o canal e recebe só aquilo.

1. No Telegram, crie um **canal** (ex.: "Ofertô Tech"). Pode ser público (`@ofertos_tech`) ou privado.
2. Em **Administradores**, adicione o **bot publicador** com **Publicar mensagens** e **Editar mensagens de outros** (para o ⛔ Encerrar).
3. Na `bfx_config`, preencha `canal.tech` com `@ofertos_tech` (ou o ID `-100…` do canal privado). Para canal privado, preencha também `canal_link.tech` com o link de convite.
4. Pronto: toda oferta aprovada de Tech sai **no tópico e no canal**, com o mesmo texto e botão. O ⛔ Encerrar edita os dois, e `canal.top` recebe o Top do Dia.

Os canais aparecem no `/links`, no 👋 Comece aqui (rode `grupo.textos = atualizar`) e no `/start` do bot publicador. Os posts ficam em `bfx_posts` com `plataforma = tgc`. Use quantos quiser: `canal.top`, `canal.casa`, `canal.beleza`, `canal.bebe` e `canal.tech`.

### 7. Teste rápido (só colando o link!)

Primeiro, cadastre sua tag única da Amazon direto pelo chat (sem precisar criar 16 tags):

```
/config amazon.tag_padrao suatag-20
```

E se quiser focar **só em Grupo do Telegram + Grupo do WhatsApp** publicando direto sem nem precisar clicar em Aprovar:

```
/modo rapido
```

Agora **basta colar ou compartilhar do app qualquer link** na conversa privada com o bot (sem comando, sem categoria, sem digitar título nem preço!):

```
https://s.shopee.com.br/seu-link
```
ou
```
https://mercadolivre.com/sec/seu-link
```
ou
```
https://amzn.to/seu-link
```

O bot abre o link preservando seu código de afiliado, lê os metadados da página gratuitamente (título, preço, preço antigo "De:", imagem), escolhe a categoria sozinho, monta um texto chamativo com cálculo de economia e:
- **No `/modo aprovar` (padrão, 1 clique):** envia o card pronto (com troca rápida de categoria em 1 toque e botão `📋 Só textos` caso você ainda não tenha grupo no Telegram). Toque em **✅ Aprovar**.
- **No `/modo rapido` (0 cliques):** já publica direto no grupo do Telegram e te devolve na hora o texto do **Grupo do WhatsApp** com o botão **`[📲 Enviar no Grupo do WhatsApp]`** (1 toque abre o WhatsApp com o texto preenchido, sem risco de banimento do número!).
- **Se alguma loja bloquear a leitura automática do preço:** o bot já identifica o produto e o seu link de afiliado e pede `"💬 Falta só o preço!"` — basta responder à mensagem só com o número (ex.: `249,90` ou `de 349,90 por 249,90 cupom CASA10`).

Você também continua podendo usar o formato manual completo (`/oferta`) quando quiser informar `ref90` de 90 dias:

```
/oferta casa
https://www.amazon.com.br/dp/B0XXXXXXXX
Air Fryer Mondial 4L
preço 349,90
ref90 399,90 https://link-do-comparador-com-o-historico
img https://link-da-imagem.jpg
cupom BF10
```

### 8. Programas de afiliados (simplificado)

- **Amazon:** basta **1 tag** configurada com `/config amazon.tag_padrao suatag-20` (ou colar links `amzn.to/…` / `?tag=…` gerados no app/SiteStripe).
  - Quem quiser atribuição separada por **categoria × plataforma** pode preencher `amazon.tag.casa_tg`, `amazon.tag.casa_wac` etc.
  - `amazon.mostrar_preco` (padrão `sim`): com `nao`, os posts da Amazon não mostram valor nem %.
- **Shopee:** funciona de dois jeitos (ambos grátis):
  1. **Sem API:** compartilhe direto do app da Shopee (`https://s.shopee.com.br/…`); o bot mantém seu link curto de afiliado.
  2. **Com Affiliate Open API (grátis):** preencha `shopee.app_id` e `shopee.secret` para gerar sub-IDs por plataforma e ligar o **02 · Coleta Shopee** automática a cada 2 h!
- **Mercado Livre:** basta colar **1 link** do gerador de afiliados (`https://mercadolivre.com/sec/…` ou `meli.la/…`)! O bot descobre o produto real por trás do redirecionamento e mantém o seu link `/sec/` nos posts. (Se quiser um link por plataforma no `/oferta`, use as linhas `tg`, `wac`, `wag`, `x`).
- **Magalu / Magazine Você / KaBuM! / AliExpress:** cole seu link de divulgador (`divulgador.magalu.com/…`, `magazinevoce.com.br/…`, `s.click.aliexpress.com/…` ou link Awin `?awc=…`) que o bot preserva o link de comissão e extrai título, preço e foto da página.
- **Mesmo sem link ou tag de afiliado:** o botão **✅ Aprovar** (e o `/modo rapido`) continua liberado usando o link direto do produto — o card apenas mostra um aviso informativo de *"sem comissão"*.
- Por último, se quiser o resumo das 22h, clique em **Publish** no **03 · Relatório diário**.

### 9. Keepa (opcional): menor preço de 90 dias da Amazon automático

Com a Keepa ligada, o `/oferta` da Amazon aceita **só o link**: título, preço, imagem e `ref90` vêm da [Keepa](https://keepa.com).

1. Crie uma conta em keepa.com e assine o **plano da API** (pago; cerca de **€49/mês** no plano de entrada, com 20 tokens por minuto). **VERIFICAR** o preço e os tokens atuais em keepa.com → *API*. Cada consulta gasta cerca de 1 token.
2. Copie a chave de acesso (*Private API access key*) na página da API da sua conta.
3. Na `bfx_config`, cole a chave na linha **`keepa.chave`**. A chave fica **só nessa tabela**: não coloque em arquivo nem em `.env`.
   - Linha vazia = Keepa desligada (tudo volta a ser digitado à mão).
   - `keepa.buybox` = `sim` usa o preço da Buy Box (com frete) em vez do preço da Amazon ou do menor novo. Pode custar tokens extras (**VERIFICAR**). Padrão: `nao`.
   - `keepa.api`: não altere (serve para o teste local).
4. Se a linha `keepa.chave` ainda não existe, rode o **00 · Setup** uma vez: ele cria as linhas novas.

Como o preço é escolhido: Buy Box (se `keepa.buybox = sim` e houver), senão o preço vendido pela Amazon, senão o menor preço de novo. O `ref90` é o menor preço desse mesmo tipo nos últimos 90 dias, contando o de hoje, e a fonte no card fica "Keepa · consultado DD/MM HH:MM". O `ref90` também vai para a `bfx_precos` (`fonte = ref90`, `fonte_url = keepa`).

---

## Uso diário

### Comandos (no privado com o bot de aprovação)

| Comando | Faz |
|---|---|
| **Só colar o link** (ou encaminhar do app) | Extrai título, preço, imagem e categoria de graça, preserva seu link de afiliado e gera o card (ou publica direto no `/modo rapido`). Aceita preço/cupom junto na mesma mensagem (`<link> 199,90 cupom OFF10`). |
| `/modo rapido` · `/modo aprovar` · `/modo padrao` | Alterna entre **0 cliques** (publica direto no Telegram + entrega só Grupo WhatsApp) e **1 clique** (revisão no card). |
| `/config` · `/config <chave> <valor>` | Mostra ou altera configurações pelo chat (ex.: `/config amazon.tag_padrao suatag-20`, `/config publicar.plataformas wag`). |
| `/link [categoria] [top] <url>` | Igual a colar só o link, mas permite fixar a categoria ou `top` (também funciona dentro de um tópico do grupo). |
| `/oferta <categoria> [top]` + linhas | Formato manual completo (para informar `ref90` de 90 dias, links por plataforma etc.). |
| `/oferta <categoria> <link da Amazon>` | Formato curto do `/oferta` com Keepa ligada (passo 9, opcional). |
| `/convite <categoria> <nome>` | Cria um **link de convite nomeado** (ex.: `/convite beleza meta_beleza_v1`). Use um link por anúncio: o relatório mostra entradas, saídas e retenção por link. |
| `/links` | Lista os **links de divulgação por tópico** (`t.me/<bot publicador>?start=beleza`). Para campanha, acrescente `_nome`: `?start=beleza_meta1`. |
| `/id` | Mostra seu ID. |
| `/ajuda` | Lista os comandos. |

### Bot publicador no privado (membros)

- `/start` responde **pelo próprio bot publicador** (o webhook dele é registrado com `?bot=grupo`): boas-vindas, link do grupo e links dos tópicos. Sem `grupo_link`, o bot cria (uma vez) e reaproveita o convite nomeado `bot_start`.
- `/start beleza_meta1` (link do `/links`): boas-vindas do tópico, botão **Entrar no grupo** (convite nomeado `beleza_meta1`, criado uma vez e reaproveitado) e botão **Abrir 🎁 Beleza & Presentes**. Cada `/start` é gravado em `bfx_entradas` (`tipo = start`, payload em `convite_nome`) e aparece no relatório.
- `/id` só responde no privado.

### `/oferta` curto (Amazon com Keepa)

```
/oferta casa https://www.amazon.com.br/dp/B0XXXXXXXX
```

- O link pode ir na 1ª linha, junto da categoria (e de `top`, se quiser).
- Título, preço, `ref90` e imagem são **opcionais**: o que faltar vem da Keepa. **O que você digitar tem prioridade**. Exemplo, com o preço do cupom:
  ```
  /oferta casa https://www.amazon.com.br/dp/B0XXXXXXXX
  preço 279,90
  cupom BF10
  ```
- Quando o preço vem da Keepa, o card avisa: "💡 preço da Keepa (DD/MM HH:MM): confira na loja antes de aprovar". A Keepa atualiza o preço de tempos em tempos, então **abra a loja antes de aprovar**.
- Se a Keepa falhar (sem tokens, chave inválida, produto sem dados), o card sai com o que você digitou e mostra o aviso, por exemplo "⚠️ Keepa sem tokens". Se faltar título ou preço, o bot pede as linhas que faltam.
- A Keepa só é consultada quando falta alguma informação: com título, preço, `ref90` e `img` digitados, nenhum token é gasto.
- Links curtos do app (`a.co`, `amzn.to`) funcionam: o bot abre o link e usa o endereço completo.

### Corrigir o ref90 respondendo ao card

Para um card sem referência de 90 dias (ex.: coleta da Shopee), **responda à mensagem do card** (deslize para o lado ou toque em *Responder*) com o valor e a fonte:

```
399,90 https://link-do-comparador
```

Só o valor (`399,90`) também serve. O bot recalcula o selo e manda um **card novo**; o card antigo perde os botões ("↩️ Substituída pelo card novo") e a oferta antiga fica como `editada`. Não vale para oferta já aprovada.

### Botões do card

- **✅ Aprovar** publica no tópico da categoria e manda os textos prontos configurados em `publicar.plataformas` (por padrão: **Grupo WhatsApp** com botão `📲 Enviar no Grupo do WhatsApp`, **Canal WhatsApp** e **X**; use `/config publicar.plataformas wag` ou `/modo rapido` para receber só o Grupo WhatsApp).
  - No WhatsApp, **use o botão de 1 toque (ou cole o texto `wag`)** no grupo em vez de encaminhar do canal: o encaminhamento leva o link do canal (`wac`) e você perde a medição do grupo (`wag`).
- **⚡ Relâmpago** faz o mesmo com notificação imediata e abre o post do Telegram com "⚡ ALERTA DE PREÇO".
- **⭐ Aprovar + Top do Dia** publica também no tópico Top do Dia.
- **📋 Só textos (Zap/TG)** gera os textos prontos de Telegram e WhatsApp sem postar no grupo (útil para copiar ou quando `grupo_id` ainda não está configurado).
- **Botões de categoria (`🏠 Casa`, `💻 Tech`, `🎁 Beleza`, `👶 Bebê`)** trocam em 1 toque a categoria escolhida automaticamente pelo extrator.
- **✏️ Editar** devolve o `/link` (ou `/oferta`) preenchido preservando seu link de afiliado para você corrigir e reenviar.
- **❌ Rejeitar** descarta a oferta.

Depois de publicada, o card ganha:
- **⭐ Mandar ao Top**: copia o post para o Top do Dia (até **5 por dia**, contados desde a meia-noite; acima disso o bot avisa e não publica).
- **⛔ Encerrar**: edita os posts da oferta no grupo para "Oferta encerrada", tira o botão de compra e marca a oferta como `encerrada`.

Posts entre 22h e 8h e as cópias no Top do Dia saem **sem notificação**. O relâmpago sempre notifica.

### Moderação automática do 💬 Conversa

Com `grupo.limpar_avisos = sim` e `grupo.antispam = sim` (padrão), o bot publicador apaga mensagens de membros com link de outro grupo (`t.me/`), WhatsApp ou encurtador (`bit.ly`, `amzn.to`, `s.shopee.com.br`, `mercadolivre.com/sec`…). Admins (IDs de `admins`, admin anônimo e posts do canal vinculado) ficam de fora. Link de produto da Amazon, Shopee ou Mercado Livre (`.com.br`) vira **sugestão**: o bot responde "Valeu! Vamos conferir o preço 👀" (no máximo 1 vez a cada 10 min por membro) e manda aos admins o link com um `/oferta` pré-preenchido.

No `/oferta` manual e na coleta automática da Shopee (com `selo.exigir_ref90 = sim`), os botões de aprovar aparecem com o selo ✓ (já nos links colados direto no privado, o botão **✅ Aprovar** fica liberado desde que o preço não esteja `acima` do histórico). Os cards sem referência trazem links grátis para consultar o histórico (gráfico de 90 dias da Keepa para Amazon, Google Shopping e Buscapé); **responda ao card** com o `ref90` (veja acima) ou use **✏️ Editar**. O card também mostra de onde veio o menor preço (Keepa, histórico próprio ou manual) e a frase que vai sair no post.

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
- **Histórico de 90 dias:** começa do zero hoje. No modo automático por link (ou com `selo.exigir_ref90 = nao`), ofertas sem histórico de 90 dias saem com copy honesta sem citar 90 dias; quando há histórico ou `ref90`, o selo de 90 dias entra automaticamente.
- **Leitura gratuita de páginas:** quando você cola só o link, o bot lê os metadados públicos (JSON-LD, OpenGraph, `__NEXT_DATA__` e slug da URL). Lojas com bloqueio anti-bot em IPs de nuvem (como o Mercado Livre em algumas consultas) podem ocultar o preço no HTML; nesse caso o bot identifica título e link de afiliado sozinho e pede apenas que você responda à mensagem com o valor (ou mande `<link> 249,90`).
- **Keepa (opcional):** formato da API conferido no SDK oficial (`keepacom/api_backend`) e testado contra um servidor falso. **VERIFICAR** com a chave real: preço do plano e custo em tokens de `buybox=1`.
- **Post com falha:** se o post no grupo falhar (ex.: bot sem permissão), a oferta fica como `falha` e você recebe um alerta "❗ A oferta NÃO saiu no grupo".
- **X:** o bot entrega o texto pronto (desative com `/config publicar.plataformas wag` se usar só WhatsApp e Telegram).
- **WhatsApp:** usa botão oficial `📲 Enviar no WhatsApp (1 toque)` (`api.whatsapp.com/send`), que abre o texto já preenchido para enviar ao seu grupo em 1 toque, **100% grátis e sem risco de banir seu número** (APIs não-oficiais de WhatsApp causam bloqueio de conta).

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
