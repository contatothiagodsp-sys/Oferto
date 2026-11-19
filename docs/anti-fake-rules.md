# Regras anti-falso-desconto

Consolida as regras de anti-falso-desconto do prompt do projeto (seção 4), os parâmetros adotados em
[`decisions/fase2-respostas.md`](decisions/fase2-respostas.md) e o que segue **NÃO VERIFICADO**.
Código: [`lib/desconto.js`](../lib/desconto.js) (puro, sem I/O, valores em **centavos inteiros**).
Testes: [`tests/w4-desconto.test.js`](../tests/w4-desconto.test.js).

Princípio: **na dúvida, não publica.** Tudo o que não passa em todas as regras vai para a **revisão humana**
com o motivo. Não há descarte silencioso.

## 1. Preço final (P2-08)

`precoFinal = preço de vitrine + frete − cupom de produto` (`precoFinal()`).

- **Frete desconhecido não é zero.** `frete` nulo ou ausente = `freteConhecido:false` ⇒ a oferta não
  auto-publica (Q-18).
- **Cashback fica fora** (condicional, Q-19). Só entra com `considerar_cashback=true`.
- Cupom percentual: o desconto em centavos é arredondado **para baixo**.
- Cupom que zera ou passa do preço ⇒ preço inválido ⇒ revisão.

## 2. Referência: mediana de 30 dias (P2-16)

- `mediana30d()` usa só o **histórico próprio** (`bfx_precos`, Q-05), apenas o **preço de vitrine**:
  amostras `com_cupom:true` ficam de fora (P2-10).
- Janela: últimos 30 dias, **sem as últimas 12 h** (o preço do momento não entra na própria referência).
- Com um número par de amostras, a mediana é a média dos dois valores centrais **arredondada para baixo**. Isso gera um desconto menor, o que é conservador.
- O "De" da loja (`preco_de`) **nunca** é prova de desconto. O min90 fica só como dado auxiliar.

## 3. Os 3 bloqueios duros, em AND (P2-15)

A auto-publicação exige os **três**:

| # | Bloqueio | Regra adotada |
|---|---|---|
| 1 | Desconto real | `(mediana_30d − preço_final) / mediana_30d ≥ 12%` |
| 2 | Integridade | `consistente` ou `provisoria` (ver §4) |
| 3 | Posição | `preço_final ≤ mínimo_30d × 1,03` (`menor` ou `proximo_menor`) |

As provas antigas por OR ("baixou" contra o post anterior, cupom ≥5%, desconto sobre o "De", "em alta") **não valem**.

## 4. Integridade do histórico (Q-15)

| Resultado | Regra |
|---|---|
| `consistente` | ≥10 dias com amostra e extensão ≥20 dias (do dia mais antigo ao mais novo, dentro dos 30) |
| `provisoria` | ≥5 dias com amostra e extensão ≥10 dias |
| `insuficiente` | abaixo disso, ou sem amostras (`sem_ref`) |
| `suspeita` | "metade do dobro": alguma amostra dos 7 dias antes da queda ficou **>25%** acima da mediana das amostras anteriores a ela, e o preço atual está abaixo desse pico |
| `mista` | duas fontes (com ≥2 amostras cada) cujas medianas divergem mais de 15% |

`suspeita` tem precedência sobre `insuficiente`, porque o motivo informa mais ao revisor.

### O caso "metade do dobro"

A loja sobe o preço (por exemplo, de R$ 100 para R$ 200) e dias depois anuncia "50% OFF" a R$ 100. Esse caso é pego por três caminhos:
1. integridade `suspeita` (alta de mais de 25% nos 7 dias);
2. desconto real ≈ 0% sobre a mediana (que continua perto de R$ 100);
3. se a inflação durou o bastante para puxar a mediana para cima, o **bloqueio de posição** segura, porque o mínimo de 30 dias continua sendo R$ 100.

## 5. Regras de revisão (além dos bloqueios)

Cada uma, sozinha, manda para a revisão (`avaliarAutoPublicacao()`):

| Motivo | Regra | Origem |
|---|---|---|
| `fora_whitelist` | loja fora de `WHITELIST_AUTO = ml, amazon, magalu, shopee` | P2-07, Q-16 |
| `sem_afiliado` | `tem_afiliado:false` (ex.: Magalu sem afiliado configurado) | Q-16 |
| `sensivel_saude` / `sensivel_infantil` / `sensivel_financeiro` | por categoria (`saude`, `bebe`, `financeiro`) ou palavra-chave no título (saúde; bebê/infantil; cartão de crédito, empréstimo, seguro, investimento, conta digital…) | P2-03, Q-17 |
| `sem_ref` | nenhuma amostra própria em 30 dias | Q-22 |
| `integridade_*` | insuficiente, suspeita ou mista | Q-15 |
| `bloqueio_desconto` / `bloqueio_posicao` | bloqueios 1 e 3 | P2-15 |
| `frete_desconhecido` | frete nulo ou ausente | Q-18 |
| `fonte_terceiros` | `fonte_terceiros:true` ou origem de canal/site garimpado (Telegram, Promobit, Gatry, Pelando…) | Q-20 |
| `cupom_loja` | cupom de loja, sem produto | Q-12 |
| `sem_imagem` | `tem_imagem` diferente de `true` (padrão seguro: precisa vir explícito) | Q-10 |
| `preco_invalido` | preço não inteiro/≤0 ou cupom ≥ preço | P2-08 |

O card de revisão mostra os motivos em texto (`textoMotivos()`), inclusive no modo piloto (P2-19).

## 6. Revalidação antes do envio (P2-17)

Logo antes do `sendPhoto`, a página é relida e `revalidar(original, atual)` cancela com
`rejeitada_por_revalidacao` (preço antigo, preço novo, variação, ts) quando:
- o preço final subiu **mais de 3%** (frete novo conta);
- o cupom sumiu;
- o frete deixou de ser conhecido;
- a página ficou indisponível ou o preço ficou inválido.

## 7. Cota por canal (P2-06, Q-23)

`cotaCanal(postsHoje, canal, cfg)`: no máximo **5 posts por dia** (dia de São Paulo) por canal Telegram de
categoria, somando **todos** os publicadores automáticos (radar, auto_top, esquenta, vitrine…).
Envios com falha não contam. Linhas sem horário contam (conservador). O excedente não sai; o digest fica para a Fase 2b (Q-24).

## 8. Parâmetros (padrões em `PADRAO_DESCONTO`)

| Chave | Padrão |
|---|---|
| `desconto_min_pct` | 12 |
| `tolerancia_menor_pct` | 3 |
| `min_amostras_consistente` / `min_dias_consistente` | 10 / 20 |
| `min_amostras_provisoria` / `min_dias_provisoria` | 5 / 10 |
| `alta_suspeita_pct` / `janela_suspeita_dias` | 25 / 7 |
| `salto_fontes_pct` | 15 (suposição W4: a Q-15 não fixou) |
| `revalidacao_alta_pct` | 3 |
| `considerar_cashback` | false |
| `max_dia` | 5 |
| `janela_dias` / `excluir_recentes_h` | 30 / 12 |

## 9. NÃO VERIFICADO / fora do runtime

- **brmarket-mcp**: fica fora do runtime (Q-05). É só uma **fonte futura opcional**, e apenas a busca grátis
  (ML/Shopee, ~30 consultas/min/IP, cache de 10 min), **sem** tools pagas (x402/USDC, carteira cripto) e **sem** o
  `affiliateUrl` dele. Ele não tem histórico, não cobre Amazon nem Magalu, e o endpoint HTTP direto não foi
  verificado. Se for usado um dia, `shippingCents` ausente = frete desconhecido.
- **ReefAPI**: fora (Q-21). Cobertura BR, histórico de 30 dias e a regra de "1 conta só" não foram verificados.
- **Keepa**: paga, desligada (Q-21).
- **Comparador de mercado** (scraping Zoom/Amazon com User-Agent falso): não serve de base para os bloqueios.
  Sem referência, a oferta vai para revisão (fail-closed, Q-20).
- A lista de palavras-chave sensíveis é heurística: falsos positivos vão para revisão (aceito). Falsos negativos
  dependem também da categoria da oferta.
- Consequência aceita (Q-05): nos primeiros ~30 dias, quase toda oferta vai para revisão humana por falta de histórico.
