# A3 — Copywriter e Formatador · Fase 0-1 (descoberta + backlog)

Data: 2026-11-18 · Base: commit `f6ab859` · Escopo: textos (`lib/textos.js`, `lib/copy.js`, `lib/curtos.js`, `lib/links.js`), tamanho real dos captions, emojis, termos proibidos, identificação de afiliado, link curto, imagem do post.

Regras seguidas: nenhum código alterado; nenhuma chamada ao Telegram; nenhum deploy. Único comando executado além de leitura: `npm test` (88/88 ok). Os testes rodam só em `node:test` e em sandbox `vm`, sem `http`/`fetch`/`listen` (`grep` em `tests/*.js`). A medição de caption foi feita com um script no scratchpad que só chama as funções puras de `lib/` (sem rede).

## 1. Estado atual (fatos com evidência)

### 1.1 Texto do post (Telegram, HTML)
- Montado por `textoTelegram` (`lib/textos.js:417-465`): 1ª linha `emoji categoria · GANCHO · #publi` (`lib/textos.js:207-214`), título com link escondido em `<a>` (até 105 chars, `lib/textos.js:428,436`), bloco de preço (`lib/textos.js:282-346`), selo "Desconto real: X% abaixo do menor preço dos últimos 90 dias" (`lib/textos.js:156-169`), cupom, e uma linha final longa com hora do preço, aviso de frete, aviso de cupom e aviso de afiliado (`lib/textos.js:461-463`).
- Tamanho real medido (texto visível, como o Telegram conta, sem tags):

| Caso | TG visível | Emojis TG | WA canal | WA grupo |
|---|---|---|---|---|
| Amazon, ref90, -12% | 413 | 5 | 522 | 544 |
| ML, cupom + "De" da loja, parcelado | 448 | 7 | 681 | 703 |
| Shopee, -41% | 355 | 5 | 467 | 489 |
| Magalu, título curto, sem ref | 207 | 4 | 296 | 318 |

  Nenhum caso cabe em 200; todos passam de 2 emojis. O limite que o código respeita hoje é 1024 (legenda de foto: `lib/fluxos.js:451-452,482`; `lib/edicao.js:19`).

### 1.2 Imagem
- Não existe geração de imagem. Nenhuma lib de imagem no repo (`grep sharp|canvas|satori|resvg|pillow|jimp|1080` sem resultado; `package.json` não tem `dependencies`).
- O post sai como `sendPhoto` **com a URL da foto da loja/agregador** (`photo: oferta.imagem`, `lib/fluxos.js:484`), apenas quando há `oferta.imagem` e o texto cabe em 1024 (`lib/fluxos.js:482`). Sem imagem → `sendMessage` com prévia de link (`lib/fluxos.js:469`). Então a imagem **não é obrigatória** hoje.
- Origem da imagem: CDN do Promobit forçado em `/500/` = 500 px (`lib/lojas.js:320-342`), canais públicos de terceiros `t.me/s/` (`lib/radar.js:561,578`), Keepa (`lib/keepa.js:74,166`), página da loja (`lib/extrator.js:1114-1148`). Posts de cupom usam logo da loja (`lib/radar.js:439,771`).
- Vitrine "TOP N ofertas de hoje" é só texto (`lib/comunidade.js:571-595`). Alertas pessoais: só prévia de link (`lib/comunidade.js:496`). Não há grade 1-6 fotos.
- Restrição de arquitetura: a `lib/` é embutida nos Code nodes do n8n por um bundler próprio sem npm (`build/build-workflows.js:20-48`); até SHA-256 foi reimplementado em JS puro (`lib/sha256.js`, comparado com `crypto` em `tests/lib.test.js:27`). Todas as chamadas ao Telegram vão como JSON (`contentType: json/raw` nos workflows); não há upload multipart/binário hoje.

### 1.3 Termos e ganchos
- Os ganchos já evitam "CORRE QUE ACABA", "SÓ HOJE", "ÚLTIMAS UNIDADES" (nenhuma ocorrência em `lib/`), e o extrator remove ganchos de terceiros como "corre que vai acabar"/"imperdível" do texto importado (`lib/extrator.js:413`). A doc de conformidade proíbe urgência (`docs/kit-operacao/04-conformidade.md:13,36`).
- Mas há ganchos que afirmam histórico/recorde ou tempo sem verificação equivalente:
  - `🏆 ABAIXO DO HISTÓRICO`, `🥇 RECORDE DE PREÇO`, `💎 RARIDADE NO HISTÓRICO` (`lib/copy.js:35,38,40`) — usados quando o preço está ≥1% abaixo do **mínimo de 90 dias** (ou da janela menor "desde DD/MM"), não de um histórico completo (`lib/copy.js:255`).
  - `📍 MÍNIMA HISTÓRICA` (`lib/copy.js:48`) — usado quando o desconto é 0% vs. min90 (`lib/copy.js:239-241`).
  - `✨ VALENDO HOJE`, `🎯 ACHADO DO DIA`, `🔥 HIT DO DIA`, `🚨 BOMBANDO AGORA`, `🔥 EM ALTA NO BRASIL` (`lib/copy.js:22,24,70-77`) — afirmações de tempo/popularidade; "EM ALTA NO BRASIL" se apoia em cliques de comunidade, não em dado nacional.
  - `🔥🔥🔥 Queda histórica` em `termometroOferta` (`lib/copy.js:391`) — função exportada (`lib/copy.js:419`) mas sem uso em `lib/` (código morto, ainda vai no bundle).
  - `🩺 FARMÁCIA OFICIAL` (`lib/copy.js:106`) — alegação de "oficial" sem checagem.
- "PREÇO DESPENCOU / QUEDA FORTE" pode sair com base só no **"De" riscado da loja** (`lib/copy.js:207-216,263,274`), e o bloco de preço mostra esse "De" riscado (`lib/textos.js:315-322`). Isso contradiz a própria regra do projeto: "o 'de' que mostramos é o menor preço em 90 dias, nunca o preço riscado da loja" (`docs/kit-operacao/04-conformidade.md:29`). Na medição, o caso ML saiu com `🔥 PREÇO DESPENCOU` e "De R$ 499,90" sem nenhuma referência histórica.

### 1.4 Identificação de afiliado e publicidade
- `#publi` na 1ª linha de todo post (`lib/textos.js:14,207-214`), "Contém link de afiliado." no fim (`lib/textos.js:12,178-181`), frase do Associado Amazon (`lib/textos.js:13,180`), resposta do X com `#publi` (`lib/textos.js:581-584`). Atende hoje; o desafio é caber em 200.

### 1.5 Link curto
- `lib/curtos.js` **não encurta**: ele **expande** links curtos de terceiros (amzn.to, meli.la, s.shopee…) para classificar a oferta (`lib/curtos.js:1-6,9,136-149`).
- O link publicado é a URL longa com parâmetro de afiliado: Amazon `?tag=` (`lib/links.js:259`), ML `matt_word/matt_tool` (`lib/links.js:278-283`), Awin/Rakuten deeplinks longos (`lib/links.js:324,353,367-370`), UTM em lojas sem programa (`lib/links.js:382-386`). Só a Shopee gera link curto, pela API oficial de afiliados (`lib/shopee.js:27-36`, usado em `lib/links.js:239-250`).
- No Telegram o link fica escondido no título e nos botões (`lib/textos.js:226-280,436`), então hoje não há URL visível no texto.
- Não existe domínio próprio nem serviço de redirecionamento. O túnel de produção é o rápido da Cloudflare, cujo endereço **muda a cada reinício** (`servidor-local/docker-compose.yml:58-61`), e o Caddy só deixa passar o POST do webhook (`servidor-local/Caddyfile:2-12`). Um link curto servido por esse túnel quebraria a cada reinício.
- Checklist pendente: "conferir se link encurtado de terceiros é permitido" (`docs/kit-operacao/04-conformidade.md:78`).

### 1.6 Categorias
- Categorias atuais: `top, casa, moda, beleza, perfumes, saude, bebe, tech` (`lib/config.js:10-19`); "Tech & Games" é uma só. Não há "Eletrônicos" e "Games" separados como pede o alvo. `saude` e `bebe` (sensíveis: saúde/infantil) estão no radar por padrão (`lib/config.js:110`).

### 1.7 Frete e preço
- O texto diz "Frete: confira na loja" (`lib/textos.js:171-176`); o modelo de oferta não tem campo de frete. O formato-alvo pede "R$ [preço c/ frete]".
- O selo usa o **mínimo de 90 dias** (`lib/textos.js:135-164`); o alvo usa **mediana de 30 dias**. Muda a frase pública do selo.

### 1.8 Produção
- O radar publica sozinho por padrão: `radar.publicar_direto` padrão `sim` (`lib/config.js:107`) e auto Top do Dia `sim` (`lib/config.js:108`); o commit `cea6a19` diz "Radar volta a publicar sozinho" e o `docs/SALVAMENTO-PROJETO.md:67-68` registra deploy no `servidor-local`. **Conflita com "zero publicação real nesta etapa"**: nada foi mexido, só registrado como risco/pergunta.

## 2. Decisões e propostas (para o backlog, sem implementar)

### D1 — Motor de imagem: sidecar Node com `sharp` (proposta)
Opções avaliadas, todas custo zero:

| Opção | Prós | Contras | Veredito |
|---|---|---|---|
| A. Serviço Node 20 em container próprio (`oferto-imagem`), `sharp` (libvips) + overlay SVG com fonte OFL embutida | Mesma linguagem do projeto; testável com `node --test`; compõe foto + grade 1-6 + texto; JPEG 1080x1080 em memória | Novo container; o n8n precisa receber binário e mandar `sendPhoto` multipart | **Recomendada** |
| B. Mesmo sidecar com `satori` + `@resvg/resvg-js` (JSX→SVG→PNG) | Layout tipo flexbox, ótimo para templates por categoria | Mais dependências; ainda precisa compor a foto | Alternativa se o layout ficar complexo |
| C. Python + Pillow (sugestão do prompt) | Pillow é maduro | Segunda stack em produção (Python hoje só no `teste-local/cenarios.py`), testes fora do `node --test` | Não recomendada |
| D. Nó "Edit Image" do n8n (GraphicsMagick) | Sem container novo | **NÃO VERIFICADO** se `n8nio/n8n:2.47.7` traz GraphicsMagick; templates/fontes limitados; difícil de testar | Não recomendada |
| E. JS puro dentro do Code node | Nada novo | Code node sem npm e sem builtins (vide `lib/sha256.js`); rasterizar texto em JS puro é inviável | Descartada |

Detalhes propostos para A: endpoint interno `POST /render` só na rede do compose (sem passar pelo túnel/Caddy); lista de hosts de imagem permitidos (evita SSRF); fonte OFL (ex.: Inter/Noto Sans) dentro do repo; template por categoria; preço e desconto como maiores elementos; fonte ≥32 px; sem logo de loja na arte (`docs/kit-operacao/04-conformidade.md:46`); timeout curto e fallback para o fluxo atual (foto da URL ou texto) se o render falhar. Versões exatas de `sharp`/`satori`/`resvg` **NÃO VERIFICADAS** nesta fase.

### D2 — Formato de caption ≤200 com divulgação obrigatória
O formato-alvo não tem `#publi` nem aviso de afiliado/Amazon/hora do preço, que são exigências já assumidas no projeto (CONAR, Associados Amazon, CDC). Proposta que cabe em 200 (contado em UTF-16, como o código já faz):

```
🔥 Air Fryer Mondial Family 4L AF-30 — R$ 349,90 + frete
Mercado Livre · cupom OFERTO10
https://<link-curto>/k3x9
#publi · link de afiliado · preço de 24/11 12:30
```
= 161 chars. Na Amazon, com a frase completa do Associado (60 chars) no lugar de "link de afiliado": 171-190 chars. Daí um orçamento fixo de ~55-60 chars para o nome do produto (corte por `enxugarTituloOferta`). O selo/desconto e os avisos longos vão para a **imagem** (e/ou para a mensagem fixada), não para a legenda. Validar com o Jurídico se "preço de DD/MM HH:MM" pode sair da legenda e ficar só na imagem (pergunta Q3).

### D3 — Emojis ≤2
Proposta: só `🔥` na abertura (do formato-alvo) + no máximo 1 emoji de categoria; nenhum emoji nos ganchos e no bloco de preço. Os ganchos atuais (todos com emoji) viram texto da imagem ou são removidos.

### D4 — Lista de termos proibidos como teste
Criar uma lista única (ex.: `TERMOS_PROIBIDOS`) e um teste que varre todas as strings de `lib/copy.js`/`lib/textos.js` e os textos gerados: "corre", "só hoje", "últimas unidades", "acaba", "preço histórico", "mínima histórica", "recorde", "queda histórica", "abaixo do histórico", "raridade", "oficial" (sem checagem), "hoje"/"do dia" como promessa. "Histórico/recorde" só seria permitido quando a referência tiver cobertura verificada (≥ janela declarada).

### D5 — Link curto
Sem domínio e sem host estável, link curto de marca própria **não é viável a custo zero** hoje. Alternativas a decidir (Q1/Q2): (a) manter o link no botão inline e mostrar na legenda o link curto oficial do programa quando houver (Shopee via API; `amzn.to`/`meli.la` exigem geração manual — sem API pública, NÃO VERIFICADO); (b) ngrok com domínio estático grátis (não é marca própria; limites do plano grátis NÃO VERIFICADOS); (c) domínio pago + Cloudflare (custa; `oferto.ai` NÃO VERIFICADO e um `.ai` não é grátis). Antes de qualquer opção, confirmar nos termos de Amazon/ML se redirecionamento próprio ("cloaking") é permitido (`docs/kit-operacao/04-conformidade.md:78`).

## 3. Suposições
- S1: o limite de 200 conta o texto visível da legenda (sem tags HTML, link visível incluído), em unidades UTF-16 como `tamanhoVisivelHtml` (`lib/fluxos.js:444-450`).
- S2: os botões inline (`botaoCompra`) não contam nos 200 e podem continuar.
- S3: WhatsApp e X seguem o mesmo formato curto (o alvo não diferencia). O X já respeita 280 (`lib/textos.js:526-578`).
- S4: "Eletrônicos" e "Games" serão separados a partir de `tech`; `perfumes` cai em "Beleza"; `saude` e `bebe` vão para revisão humana.

## 4. Perguntas (para o sintetizador consolidar)
- Q1: Existe domínio próprio (ex.: `oferto.ai`)? NÃO VERIFICADO no repo. Se não, aceita-se link curto sem marca própria ou o link só no botão?
- Q2: Os termos de Amazon Associados e ML Afiliados permitem redirecionador próprio? NÃO VERIFICADO.
- Q3: A divulgação (`#publi`, "Como Associado da Amazon…", hora do preço) pode ficar parte na imagem/mensagem fixada para caber em 200, ou precisa estar na legenda?
- Q4: Termos de uso permitem baixar e **recompor** a foto do produto (Amazon/ML/Shopee) numa arte própria, e reaproveitar fotos vindas do CDN do Promobit e de canais de terceiros? NÃO VERIFICADO.
- Q5: Pode haver um container novo (sidecar de imagem) no `servidor-local`? E produção roda só no `servidor-local` ou também no n8n Cloud (o `package.json` ainda diz "n8n Cloud")?
- Q6: O radar está publicando sozinho em produção agora (`radar.publicar_direto = sim`)? Desligar (`/modo aprovar`) durante as fases de mudança de copy/imagem?
- Q7: Quando o frete for desconhecido, o formato "R$ [preço c/ frete]" deve dizer "+ frete", ou a oferta não auto-publica?
