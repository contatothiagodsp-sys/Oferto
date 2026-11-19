# Templates de texto: legenda curta do Telegram

Fonte da verdade: `lib/legenda.js` (`legendaCurta`, `TERMOS_PROIBIDOS`, `contarEmojis`). Itens do backlog: P3-01, P3-02, P3-03, P3-04, P3-07. Decisões aplicadas: Q-06 (disclosure curto), Q-18 (frete desconhecido vai para revisão) e Q-25 (o limite de 200 vale para o Telegram).

> A integração em `lib/textos.js`/`lib/copy.js` (trocar a legenda longa por esta) é da Onda B. Hoje o módulo existe e está testado, mas ainda não é chamado pelos fluxos.

## Template

```text
🔥 [Produto curto] — R$ [preço c/ frete] c/ frete | c/ frete grátis
[Loja] · cupom [CUPOM]
[link curto, sem https:// e www.]
#publi · link de afiliado
Associado Amazon: ganhamos com compras qualificadas    ← só em posts da Amazon
```

Formato enviado: HTML do Telegram (`parse_mode=HTML`). O nome vai em `<b>`, o cupom em `<code>` e o link em `<a href="URL completa">URL sem esquema</a>`. Os caracteres `&`, `<` e `>` são escapados.

### Regras

- **Limite: 200 caracteres no texto VISÍVEL**, medidos em unidades UTF-16 (`String#length`). É assim que o Telegram conta a legenda depois de interpretar o HTML: as tags não contam e `&amp;` conta 1. Um emoji como 🔥 conta 2. Os botões inline ficam fora da conta (OK-07). `cfg.legenda_max` pode reduzir o limite, mas nunca aumentá-lo além de 200.
- **Nome do produto** é o único trecho elástico. Tem no máximo 55 caracteres e é cortado com `…` para caber no orçamento. O corte prefere o fim de uma palavra e nunca parte um par substituto UTF-16. Se sobrarem menos de 12 caracteres para o nome (link ou cupom longos demais), a função devolve `sem_espaco`.
- **Emojis: no máximo 2** (`\p{Extended_Pictographic}`). A legenda usa só 🔥. Emojis no nome, na loja e no cupom são removidos, assim como ZWJ, VS16, tom de pele, bandeiras e keycap. O emoji de categoria (permitido pelo P3-07) não é usado nesta versão.
- **Unidade: CENTAVOS inteiros**, a mesma de `lib/desconto.js` (P2-08). Só são lidos campos com a unidade no nome: `preco_final_cents`, `preco_cents` e `frete_cents` (`typeof number` e `Number.isInteger`, ≥ 0). Os campos sem unidade (`preco`, `frete`, `preco_final`, `preco_com_frete`) são **ignorados**: se só eles vierem, a oferta vai para revisão (`frete_desconhecido` ou `preco_invalido`). Isso impede publicar o preço 100 vezes maior ou menor por confusão entre reais e centavos.
- **Preço com frete:** `preco_final_cents` (vindo de `desconto.precoFinal().centavos` ou `avaliarAutoPublicacao().preco_final`) já inclui o frete (P2-08) e é exibido como está, sem somar o frete de novo. Sem ele, exibe `preco_cents + frete_cents`. O frete é lido de `frete_cents`; sem esse campo, `frete_gratis === true` vale 0. Com frete 0, a legenda diz "c/ frete grátis".
- **Integração com o portão (Onda B):** `legendaCurta({ titulo, loja, cupom, preco_final_cents: pf.centavos, frete_cents: oferta.frete, frete_conhecido: pf.freteConhecido }, link, cfg)`, onde `pf = desconto.precoFinal(oferta)` e `oferta` segue o contrato de centavos de `desconto.js`.
- **Frete desconhecido não publica:** a função devolve `{ ok:false, erro:'frete_desconhecido', destino:'revisao' }`. Isso inclui `frete_conhecido: false`, posts da Amazon sem preço e qualquer `frete_cents` que não seja inteiro ≥ 0 (string, `' '`, `false`, `true`, `[]`, objeto, fração). Um `frete_cents` inválido não é "salvo" por `frete_gratis`.
- **Amazon com `amazon.mostrar_preco = nao`:** a primeira linha sai sem preço.
- **Disclosure (Q-06):** `#publi · link de afiliado` em todo post. Nos posts Amazon entra também a frase curta de Associado. A frase completa ("Como Associado da Amazon, ganhamos com compras qualificadas.") fica na mensagem fixada do canal.
- **Termos proibidos:** se o texto final contiver algum termo de `TERMOS_PROIBIDOS`, a função devolve `termo_proibido`. A comparação ignora acento, caixa e pontuação, casa só palavra inteira e aplica NFKD, então letras de compatibilidade (negrito matemático 𝐒𝐎, fullwidth ＳＯ, circuladas Ⓢ) também são detectadas.
- **Outros erros (todos vão para revisão):** `link_ausente` (sem URL http(s) com host que tenha ponto, sem credenciais `user@` e com texto visível não vazio: `https://www.` falha), `preco_invalido`, `sem_titulo` (título, antes ou depois do corte, com menos de 3 letras/dígitos, por exemplo só pontuação) e `sem_espaco`.

### Termos proibidos (`TERMOS_PROIBIDOS`)

CORRE QUE ACABA · SÓ HOJE · ÚLTIMAS UNIDADES · PREÇO HISTÓRICO · ABAIXO DO HISTÓRICO · RECORDE DE PREÇO · MÍNIMA HISTÓRICA · RARIDADE NO HISTÓRICO · VALENDO HOJE · HIT DO DIA · BOMBANDO AGORA · EM ALTA NO BRASIL · FARMÁCIA OFICIAL

Há dois termos condicionais. "PREÇO HISTÓRICO" só é liberado com `{ historicoVerificado: true }`, e "FARMÁCIA OFICIAL" só com `{ vendedorVerificado: true }`. Quem chama precisa ter feito a verificação. Sem essa opção, os dois são bloqueados. `legendaCurta` nunca passa essas opções.

## Exemplos por categoria

> **Exemplos ilustrativos de formato.** Produtos genéricos, com preços, cupons e links **fictícios** (`EXEMPLO…`), criados só para mostrar o layout. Não são ofertas reais. Todos os exemplos foram gerados rodando a própria `legendaCurta` (`cfg = {}`), e a contagem é a que a função devolve (`comprimento`).

### Eletrônicos

Exemplo 1 (187 caracteres visíveis, 1 emoji, nome cortado):

```text
🔥 Fone de Ouvido Bluetooth Genérico com Cancelamento de… — R$ 149,90 c/ frete grátis
Amazon
amzn.to/EXEMPLO1
#publi · link de afiliado
Associado Amazon: ganhamos com compras qualificadas
```

Exemplo 2 (122 caracteres visíveis, 1 emoji):

```text
🔥 Carregador USB-C 20W Genérico — R$ 69,80 c/ frete
Mercado Livre
mercadolivre.com/sec/EXEMPLO2
#publi · link de afiliado
```

Exemplo 3 (154 caracteres visíveis, 1 emoji, nome cortado):

```text
🔥 Smartwatch Genérico Tela 1,8" com GPS, Monitor… — R$ 199,00 c/ frete grátis
Shopee · cupom EXEMPLO10
s.shopee.com.br/EXEMPLO3
#publi · link de afiliado
```

### Casa

Exemplo 1 (148 caracteres visíveis, 1 emoji, nome cortado):

```text
🔥 Jogo de Panelas Antiaderentes Genérico 5 Peças… — R$ 249,90 c/ frete grátis
Mercado Livre
mercadolivre.com/sec/EXEMPLO4
#publi · link de afiliado
```

Exemplo 2 (165 caracteres visíveis, 1 emoji):

```text
🔥 Aspirador de Pó Vertical Genérico 1200W — R$ 324,00 c/ frete
Amazon
amzn.to/EXEMPLO5
#publi · link de afiliado
Associado Amazon: ganhamos com compras qualificadas
```

Exemplo 3 (144 caracteres visíveis, 1 emoji):

```text
🔥 Organizador de Gaveta Genérico Kit 6 Peças — R$ 39,90 c/ frete grátis
Shopee · cupom CASA5
s.shopee.com.br/EXEMPLO6
#publi · link de afiliado
```

### Moda

Exemplo 1 (113 caracteres visíveis, 1 emoji):

```text
🔥 Camiseta Básica Genérica Algodão Unissex — R$ 64,80 c/ frete
C&A
cea.com.br/EXEMPLO7
#publi · link de afiliado
```

Exemplo 2 (161 caracteres visíveis, 1 emoji, nome cortado):

```text
🔥 Tênis de Corrida Genérico Masculino Leve e Respirável… — R$ 199,90 c/ frete grátis
Netshoes · cupom CORRE15
netshoes.com.br/EXEMPLO8
#publi · link de afiliado
```

Exemplo 3 (176 caracteres visíveis, 1 emoji):

```text
🔥 Mochila Genérica Notebook 15,6" Impermeável — R$ 129,90 c/ frete grátis
Amazon
amzn.to/EXEMPLO9
#publi · link de afiliado
Associado Amazon: ganhamos com compras qualificadas
```

### Games

Exemplo 1 (141 caracteres visíveis, 1 emoji, nome cortado):

```text
🔥 Controle Sem Fio Genérico Compatível com PC e Console… — R$ 179,90 c/ frete grátis
KaBuM!
kabum.com.br/EXEMPLO10
#publi · link de afiliado
```

Exemplo 2 (179 caracteres visíveis, 1 emoji):

```text
🔥 Headset Gamer Genérico 7.1 RGB — R$ 219,00 c/ frete grátis
Amazon · cupom GAME20
amzn.to/EXEMPLO11
#publi · link de afiliado
Associado Amazon: ganhamos com compras qualificadas
```

Exemplo 3 (142 caracteres visíveis, 1 emoji):

```text
🔥 Cartão Presente Genérico de Jogos R$ 100 — R$ 100,00 c/ frete grátis
Mercado Livre
mercadolivre.com/sec/EXEMPLO12
#publi · link de afiliado
```

### Beleza

Exemplo 1 (146 caracteres visíveis, 1 emoji):

```text
🔥 Perfume Genérico Feminino Eau de Parfum 100 ml — R$ 189,90 c/ frete grátis
Beleza na Web
belezanaweb.com.br/EXEMPLO13
#publi · link de afiliado
```

Exemplo 2 (185 caracteres visíveis, 1 emoji, nome cortado):

```text
🔥 Kit Skincare Genérico Sérum Vitamina C + Hidratante… — R$ 99,90 c/ frete grátis
Amazon
amzn.to/EXEMPLO14
#publi · link de afiliado
Associado Amazon: ganhamos com compras qualificadas
```

Exemplo 3 (135 caracteres visíveis, 1 emoji):

```text
🔥 Secador de Cabelo Genérico 2000W Íon — R$ 141,50 c/ frete
Shopee · cupom BELEZA8
s.shopee.com.br/EXEMPLO15
#publi · link de afiliado
```

### HTML enviado (Casa, exemplo 1)

```html
🔥 <b>Jogo de Panelas Antiaderentes Genérico 5 Peças…</b> — R$ 249,90 c/ frete grátis
Mercado Livre
<a href="https://mercadolivre.com/sec/EXEMPLO4">mercadolivre.com/sec/EXEMPLO4</a>
#publi · link de afiliado
```

### Sem preço (Amazon com `amazon.mostrar_preco = nao`), 135 caracteres

```text
🔥 Caixa de Som Genérica Bluetooth
Amazon
amzn.to/EXEMPLO
#publi · link de afiliado
Associado Amazon: ganhamos com compras qualificadas
```

### Frete desconhecido

```js
legendaCurta({ titulo: 'Produto Genérico', loja: 'ml', preco_cents: 1000 }, 'https://mercadolivre.com/sec/EXEMPLO', {})
// → { ok: false, erro: 'frete_desconhecido', motivo: 'frete desconhecido: a oferta vai para revisão (Q-18)', destino: 'revisao' }
```

## Checklist de Marketing (antes de liberar um template ou uma mudança de copy)

- [ ] A legenda visível tem ≤ 200 caracteres (UTF-16) em todas as combinações de loja, cupom e Amazon (`tests/w5-legenda.test.js`).
- [ ] A legenda tem no máximo 2 emojis (`contarEmojis`) e só o 🔥 é fixo.
- [ ] `#publi` e "link de afiliado" aparecem em todo post.
- [ ] Todo post da Amazon tem a frase curta de Associado, e a frase completa está na mensagem fixada do canal.
- [ ] Nenhum termo de `TERMOS_PROIBIDOS` aparece, nem com outra caixa, sem acento ou com pontuação no meio.
- [ ] Não há urgência nem escassez inventada ("só hoje", "últimas unidades"), nem popularidade sem métrica ("em alta", "bombando").
- [ ] Não há alegação de histórico ou recorde sem cobertura verificada. A frase do selo segue o P3-05.
- [ ] "Oficial" só aparece com vendedor verificado.
- [ ] O preço exibido inclui o frete, e "frete grátis" só aparece quando o frete é 0 de fato. Frete desconhecido vai para revisão.
- [ ] Post com cupom: o cupom aparece na linha da loja e passou pela revisão humana (Q-12).
- [ ] O link é o curto oficial do programa (Q-08/Q-09) e o href aponta para o link de afiliado correto.
- [ ] O nome cortado ainda identifica o produto (marca, modelo e capacidade). Se não identificar, ajustar o título na revisão.
- [ ] Exemplos e prints em docs usam produtos genéricos e preços marcados como fictícios.
