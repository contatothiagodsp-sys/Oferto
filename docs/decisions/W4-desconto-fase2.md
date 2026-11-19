# W4-desconto · Fase 2

Itens: P2-03, P2-06, P2-07, P2-08, P2-15, P2-16, P2-17, P2-19 (a parte pura).
Arquivos: `lib/desconto.js`, `tests/w4-desconto.test.js`, `docs/anti-fake-rules.md`.
Não houve rede, build nem commit. A integração em `radar.js`, `fluxos.js`, `config.js` e `index.js` é de outros donos (ver handoff).

## Decisões

- **D-W4-1 Centavos inteiros em tudo.** Valores não inteiros são descartados (amostra) ou tornam o preço inválido (oferta).
  As linhas legadas de `bfx_precos` (em reais) passam por `amostrasDeBfxPrecos()`, e `ref90` não conta como amostra.
- **D-W4-2 "Cobrindo N dias" (Q-15)** = extensão do histórico (do dia mais antigo ao mais novo, em dias contados a partir de `agora`).
  A leitura literal "10 amostras cobrindo 20 dias distintos" é impossível. As amostras contam **uma por dia**
  (10 coletas no mesmo dia não valem 10), o que é mais estrito e seguro.
- **D-W4-3 Janela** = últimos 30 dias, menos as últimas 12 h (o mesmo critério do `selo.js`).
- **D-W4-4 Mediana par** arredonda para baixo (conservador). O cupom percentual também arredonda o desconto para baixo.
- **D-W4-5 Suspeita**: uma amostra dos últimos 7 dias acima de 1,25× a mediana das amostras anteriores a ela, com o preço atual
  abaixo desse pico. Isso é mais amplo que o literal (também marca o preço que *continua* inflado nos 7 dias, mesmo
  que a alta seja antiga). É conservador e só manda mais casos para a revisão. A suspeita tem precedência sobre `insuficiente`.
- **D-W4-6 Mista** (suposição: a Q-15 não deu número): fontes com ≥2 amostras cujas medianas divergem >15% (`salto_fontes_pct`).
- **D-W4-7 Posição** devolve `null` sem amostras, e o avaliador transforma isso em `sem_ref`.
- **D-W4-8 Desconto e posição usam o preço final** (com frete e cupom de produto) contra a referência de vitrine.
  Isso é conservador com frete e permite que um cupom de produto real conte.
- **D-W4-9 Imagem**: `tem_imagem` precisa vir `true`. Ausente = `sem_imagem` (padrão seguro). Afiliado: só `tem_afiliado:false` bloqueia.
- **D-W4-10 Terceiros**: `fonte_terceiros:true` ou `origem` com canal/telegram/promobit/gatry/pelando/garimpo/comunidade/fórum.
- **D-W4-11 Financeiro**: lista por palavra-chave. "Cartão" sozinho não conta (evita pegar "cartão de memória"); conta "cartão de crédito",
  "cartão pré-pago" e "cartão consignado".
- **D-W4-12 Revalidação**: além de >3% e cupom sumido, também cancela quando a página está indisponível, o preço ficou inválido ou o frete deixou de ser
  conhecido. Se o original tinha frete desconhecido, a comparação é feita sem frete.
- **D-W4-13 Cota**: o dia é o de São Paulo (UTC−3 fixo, sem horário de verão desde 2019). Linhas sem `ts` contam, e falhas
  (`ok:false`, status erro/falhou) não contam. Aceita `max_dia` ou `ritmo.max_dia`.
- **D-W4-14 Nomes** escolhidos para não colidir no `Object.assign` do `lib/index.js` (ex.: `CATEGORIAS_SENSIVEIS_DESCONTO`).
