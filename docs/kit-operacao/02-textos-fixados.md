# Textos fixados, descrições e boas-vindas

Copie cada bloco como está. O que está entre `[colchetes]` você precisa preencher.

## Critério do selo

É o mesmo texto em todos os espaços, para todo mundo ler a mesma regra.

```
✅ Como conferimos o preço
Só publicamos se o preço estiver igual ou abaixo do menor preço dos últimos 90 dias.
A referência vem do nosso histórico de preços ou de um comparador de preços. Se houver as duas, vale a mais baixa.
Se o histórico do produto for mais curto, o post avisa: "menor preço desde DD/MM".
Todo post traz a data e a hora do preço. Preço e estoque podem mudar a qualquer momento.
```

## Como fica um post (o bot gera)

Os textos saem prontos do bot. Este é o modelo, para você reconhecer cada parte e montar à mão se precisar.

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
```

| Parte | Regra |
|---|---|
| 1ª linha | Sempre com `#publi` (CONAR). No alerta: `⚡ ALERTA DE PREÇO · … · #publi`. |
| Selo com desconto ≥ 1% | "X% abaixo do menor preço dos últimos 90 dias (R$ Y)". |
| Selo com 0% | "Preço conferido: igual ao menor preço dos últimos 90 dias". **Nunca** a palavra "desconto". |
| Histórico < 90 dias | "menor preço desde DD/MM" no lugar de "dos últimos 90 dias". |
| Fonte do histórico | Não cite a ferramenta (ex.: Keepa) no post. Ela aparece só no card de aprovação. |
| Amazon com `amazon.mostrar_preco = nao` | Sem valor nem %: "no menor preço dos últimos 90 dias" e "👉 Veja o preço atual na Amazon". |
| Preço mudou | Encerre o post: "⛔ Oferta encerrada às HH:MM · o preço mudou", com o título riscado e sem link. |

## Mensagem antigolpe

Fixe em **todos** os espaços.

```
🔒 SEGURANÇA
A Ofertô NUNCA:
• pede pagamento, Pix ou dados pessoais;
• chama você no privado oferecendo promoção;
• pede código de verificação.
Todas as ofertas levam ao site oficial da loja (Amazon, Shopee, Mercado Livre…), e você paga direto lá.
Recebeu mensagem no privado em nome da Ofertô? É golpe: bloqueie e denuncie.

Contém links de afiliado: podemos ganhar comissão pelas compras, sem custo extra para você.
```

No Telegram, o bot fixa uma versão mais completa, **🔒 Segurança e privacidade**, que também explica o critério e quais dados guardamos (veja abaixo).

---

## Telegram

**Nome do grupo:** `Ofertô | Só desconto real`

**Descrição do grupo** (até 255 caracteres; o bot escreve sozinho):

```
Ofertô: promoções que valem a pena, sem desconto de mentira. Só postamos preço igual ou abaixo do menor dos últimos 90 dias, com data e hora. Top do Dia, Casa, Beleza, Bebê e Tech. Silencie o que não quiser. Contém links de afiliado.
```

**Nomes dos tópicos:** o bot cria os de oferta e renomeia o General para 💬 Conversa.

**Texto fixado em cada tópico** (o bot fixa; abaixo, o miolo de cada um). Todos terminam com o critério do selo, "🔔 deixe as notificações ligadas", "só o bot posta aqui" e o aviso de afiliado.

| Tópico | O que o membro ganha | Frequência |
|---|---|---|
| 🔥 Top do Dia | `O melhor do dia, de todas as categorias, num lugar só.` | `Até 5 ofertas por dia. Se for seguir um tópico só, siga este.` |
| 🏠 Casa & Eletro | `Air fryer, aspirador, cafeteira e o que deixa a casa mais fácil. No calor, ventilador e ar-condicionado.` | `De 4 a 8 ofertas por dia; na semana da Black Friday, mais.` |
| 🎁 Beleza & Presentes | `Perfume, maquiagem, cabelo e kits de presente, sem "de R$ 299 por R$ 149" inventado.` | idem |
| 👶 Bebê & Família | `Fralda, lenço, higiene e brinquedos. Sempre que dá, com o preço por unidade para comparar.` | idem |
| 💻 Tech – BF Honesta | `Fone, smartwatch, SSD e carregador com histórico conferido. Chega de "50% off" de mentira.` | `De 4 a 8 ofertas por dia, até 31/12.` |

**Fixadas no 💬 Conversa** (o bot fixa as duas, nesta ordem, para o **👋 Comece aqui** ficar no topo):

1. **🔒 Segurança e privacidade**

```
🔒 Segurança e privacidade
O Ofertô nunca pede Pix, pagamento, dados pessoais ou código, e nunca chama ninguém no privado.
Todo link leva ao site oficial da loja, e você paga direto lá.
Recebeu mensagem no privado em nosso nome? É golpe: bloqueie e denuncie.

✅ Como conferimos o preço
Só publicamos se o preço estiver igual ou abaixo do menor dos últimos 90 dias, pelo nosso histórico ou por um comparador de preços. Se o histórico do produto for mais curto, o post avisa: "menor preço desde DD/MM". Todo post traz a data e a hora do preço, que pode mudar.

👤 Seus dados
Para saber quais campanhas trazem gente, guardamos de quem entra ou sai só um código embaralhado, o nome do link de convite e a data. Nada de nome, @ ou telefone. Quer que apaguemos o seu? Mande mensagem a um admin (você chama; a gente nunca chama primeiro).

[aviso completo de afiliado]
```

2. **👋 Comece aqui** (substitui as antigas "regras" e as boas-vindas; cada nome de tópico vira um link direto para ele)

```
👋 Comece aqui
Bem-vindo ao Ofertô! Aqui só entra oferta que a gente conferiu: preço igual ou abaixo do menor dos últimos 90 dias. Promoção de mentira fica de fora.

Escolha o que você quer ver
🔥 Top do Dia: o melhor do dia, até 5
🏠 Casa & Eletro
🎁 Beleza & Presentes
👶 Bebê & Família
💻 Tech – BF Honesta
🔕 Silencie o que não quiser: toque no tópico → Silenciar.

Regras do 💬 Conversa
1. Respeito sempre. Sem política e sem assunto fora de compras.
2. Sem divulgar outros grupos, vender ou chamar no privado.
3. Viu preço errado num post? Responda ao post.
4. Quem descumprir sai sem aviso.

💡 Achou uma oferta boa? Mande sua sugestão aqui no Conversa, com o link da loja. Se passar no nosso critério, publicamos.
📣 Conhece alguém que ama uma promoção? Mande o link: [grupo_link]

Os posts contêm links de afiliado.
```

> **Grupo arrumado antes desta versão?** Use `grupo.textos = atualizar`: o bot reescreve as mensagens no lugar (a antiga "regras" vira o "Comece aqui"). A ordem das fixadas não muda nesse modo: para o "Comece aqui" ir para o topo, desafixe e fixe de novo a mensagem dele no app.

**Botões dos posts:** embaixo de cada oferta aparecem **🛒 Ver na [loja]** e, com `grupo_link` preenchido, **📣 Chamar amigos**, que abre o "compartilhar" do Telegram com o link do grupo e um texto curto da oferta.

---

## WhatsApp

### Perfil do WhatsApp Business

- **Nome:** `Ofertô`
- **Categoria:** Compras e varejo
- **Descrição:**

```
Só desconto real: ofertas com preço igual ou abaixo do menor dos últimos 90 dias. Não vendemos nada. Os links levam à loja oficial. Nunca pedimos pagamento nem dados. Contém links de afiliado.
```

- **Mensagem de ausência / saudação** (respostas automáticas do Business):

```
Oi! A Ofertô não atende pedidos nem vendas por aqui. As ofertas estão nos nossos canais e grupos. Nunca pedimos pagamento nem dados pessoais.
```

### Comunidade

- **Nome:** `Ofertô`
- **Descrição:**

```
Só desconto real. Escolha sua categoria e entre no grupo de avisos dela: Casa & Eletro, Beleza & Presentes, Bebê & Família e Tech (até 31/12). Só os admins enviam mensagens. Contém links de afiliado.
```

### Grupos de avisos (alertas de preço)

**Nomes:**
- `Ofertô ⚡ Casa & Eletro`
- `Ofertô ⚡ Beleza & Presentes`
- `Ofertô ⚡ Bebê & Família`
- `Ofertô ⚡ Tech`

**Descrição de cada grupo:**

```
⚡ Só os alertas de preço de [categoria]: as quedas mais fortes, conferidas no histórico de 90 dias. De 2 a 4 por dia, no máximo, para o celular não virar bagunça.
Para o feed completo, siga o canal: [link do canal da categoria]
Critério: preço igual ou abaixo do menor dos últimos 90 dias.
🔒 Nunca pedimos pagamento nem dados no privado. Contém links de afiliado.
```

**Texto dos alertas:** o bot entrega pronto, começando por `⚡ ALERTA DE PREÇO · [categoria] · #publi`. Não acrescente "corre", "últimas unidades" ou "pode acabar a qualquer momento": não sabemos o estoque, e urgência inventada é publicidade enganosa.

Fixe nos grupos a **mensagem antigolpe**, se a comunidade permitir fixar no grupo de avisos (**VERIFICAR**).

### Canais (feed curado)

**Nomes:**
- `Ofertô 🔥 Top do Dia`
- `Ofertô 🏠 Casa & Eletro`
- `Ofertô 🎁 Beleza & Presentes`
- `Ofertô 👶 Bebê & Família`
- `Ofertô 💻 Tech – BF Honesta`

**Descrição de cada canal:**

```
[Categoria] com preço conferido: igual ou abaixo do menor dos últimos 90 dias, com data e hora. De 6 a 10 ofertas por dia.
Quer só os alertas de preço? [link do grupo de avisos]
Contém links de afiliado. Como Associado da Amazon, ganhamos com compras qualificadas.
```

Para o Top do Dia, use: `As melhores ofertas reais de todas as categorias, em até 5 por dia.`

**1º post de cada canal** (fixe ou publique logo na criação):

```
Bem-vindo(a) ao canal [Categoria] da Ofertô.

Aqui é diferente: só publicamos oferta cujo preço está igual ou abaixo do menor preço dos últimos 90 dias. Se a "promoção" é de mentira, ela não aparece aqui.

Todo post mostra a data e a hora do preço, porque preço muda rápido na BF.

🔒 Nunca pedimos pagamento nem dados. Contém links de afiliado: podemos ganhar comissão, sem custo extra para você. Como Associado da Amazon, ganhamos com compras qualificadas.
```

---

## X

- **Nome:** `Ofertô`
- **@:** `@oferto` (ou a variação disponível)
- **Bio** (até 160 caracteres):

```
Promoções que valem a pena. Só desconto real: comparamos com o menor preço em 90 dias. Contém links de afiliado.
```

- **Link na bio:** o link de convite do Telegram `x_bio` (`/convite top x_bio`). Assim você sabe quantas pessoas entram pelo X.
- **Post fixado:**

```
Black Friday honesta: só postamos oferta com preço igual ou abaixo do menor dos últimos 90 dias.

Escolha sua categoria:

Telegram (tudo num grupo só, com tópicos): [link x_fixado]

WhatsApp (canais):
🔥 Top do Dia: [link]
🏠 Casa & Eletro: [link]
🎁 Beleza & Presentes: [link]
👶 Bebê & Família: [link]
💻 Tech: [link]
```

---

## Vitrine de links (sem site)

Como não há site, esta mensagem faz o papel da página inicial. Fixe no **Canal Top do Dia** e na descrição do grupo do Telegram, e use no Instagram e no X sempre que alguém perguntar "onde entro?".

```
📣 OFERTÔ: Promoções que valem a pena. Só desconto real.

TELEGRAM (tudo num grupo só, cada categoria num tópico):
[link de convite]

WHATSAPP: canais (feed com 6 a 10 ofertas/dia)
🔥 Top do Dia: [link]
🏠 Casa & Eletro: [link]
🎁 Beleza & Presentes: [link]
👶 Bebê & Família: [link]
💻 Tech (até 31/12): [link]

WHATSAPP: alertas de preço (2 a 4/dia)
Comunidade Ofertô: [link]

🔒 Nunca pedimos pagamento nem dados no privado. Contém links de afiliado.
```

**Use um link de convite do Telegram diferente em cada lugar** (`/convite top vitrine_wac`, `/convite top ig_bio` etc.). O relatório do bot mostra qual vitrine traz mais gente.

---

## Aviso completo de afiliado

Sem site, este texto vai na **descrição dos canais do WhatsApp** (no fim) e na mensagem **🔒 Segurança e privacidade** do Telegram (o bot já inclui). A frase da Amazon é a exigida pelos termos ([04](04-conformidade.md#amazon-associados)).

```
A Ofertô participa de programas de afiliados (Amazon, Shopee, Mercado Livre e outros) e pode ganhar comissão pelas compras feitas pelos links, sem custo extra para você. Como Associado da Amazon, ganhamos com compras qualificadas. Preços conferidos na data e hora de cada post; podem mudar a qualquer momento. Dos grupos, guardamos só um código embaralhado de quem entra ou sai, o nome do link de convite e a data, para medir campanhas (nada de nome, @ ou telefone). Para apagar o seu, fale com um admin.
```
