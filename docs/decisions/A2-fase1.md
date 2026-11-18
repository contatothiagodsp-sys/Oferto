# A2 · Anti-Falso-Desconto — Fase 0-1 (descoberta + backlog)

Data: 2026-11-18 · Commit analisado: `f6ab859` · Autor: agente A2 (analista)
Escopo: só leitura de código + 1 busca web por fonte. Nenhum código alterado, nenhuma chamada ao Telegram,
nada publicado. `npm test` rodado (88/88 ok); antes, conferido que `tests/*.test.js` não abre rede
(sem `fetch`/`http`/`child_process`; URLs nos testes são só strings).

## 1. Como funciona hoje (evidência)

| Peça | O que faz | Evidência |
|---|---|---|
| Selo 90d | Referência = **mínimo** (não mediana) do histórico próprio em 90 dias, ou `ref90` manual/Keepa. Selo `ok` se preço ≤ min90 × (1+tolerância). Sem referência → `sem_ref`. | `lib/selo.js:19-69` (min em `:34`, `:47`; regra em `:50-52`) |
| `desconto_pct` do selo | `(min90 − preço)/min90` — compara com o mínimo, não com a mediana. | `lib/selo.js:54` |
| Histórico próprio | Tabela `bfx_precos` (produto, loja, preço, fonte, ts). Sem frete, sem flag "com cupom". Snapshot só quando o produto aparece no radar/oferta e o preço mudou ou passaram 20 h. | `lib/tabelas.js:11`; `lib/selo.js:72-78`; `lib/radar.js:1222-1225`; `lib/fluxos.js:197-200` |
| Histórico "completo" | Só se o 1º registro tem ≥ 90 dias. | `lib/selo.js:33` |
| Origem da referência | `keepa` / `manual` / `historico` + dias cobertos. | `lib/selo.js:86-100` |
| Keepa | Plano **pago**, só Amazon, só no `/oferta` manual; usa `minInInterval` de 90d. | `lib/config.js:145-147`; `lib/keepa.js:141-152`, `:230-240`, `:256-298` |
| Comparador de mercado | Scraping de Zoom + busca Amazon (UA de WhatsApp), casamento estrito de produto, mediana **transversal** (preços de hoje, não 30 dias). | `lib/mercado.js:10-20`, `:104-128`, `:254-323`, `:329-334`, `:340-413` |
| Mercado sem resultado | **Aprova** (`sem_referencia_mercado`) — fail-open. | `lib/mercado.js:347-361` |
| Trava do radar | `avaliarOfertaReal`: basta **uma** de 7 provas (min90, baixou, cupom ≥5%, desconto vs "De" ≥ 15%, em alta ≥ 8%, mercado ≥ 10%). | `lib/radar.js:1129-1149` |
| Pré-filtro do radar | desconto ≥ `min_desconto_pct` (15) ou cupom ou em alta. | `lib/radar.js:795-801`; `lib/config.js:112` |
| Anti "metade do dobro" | "De" > 1,25× mediana de mercado é recalibrado; desconto > 80% sem confirmação é recusado. | `lib/mercado.js:397-402`; `lib/radar.js:1139` |
| Cupom no preço | Preço final com cupom % ou R$ quando a página mostra. Cashback é **descartado** do texto; frete ignorado ("Frete: confira na loja"). | `lib/radar.js:1040-1055`; `lib/extrator.js:508-513`; `lib/textos.js:171-176` |
| Releitura da página | No mesmo ciclo do radar, antes de publicar; só marca expirada se preço subir **> 35%**. | `lib/radar.js:1016-1075` (`:1045`, `:1056`) |
| Guardião pós-post | A cada 30 min, encerra post se página 404/esgotado ou preço **≥ +28%**. | `lib/comunidade.js:850-885`; `lib/extrator.js:1509-1540` |
| Lojas | 28 lojas no radar (inclui farmácias, Shein, TikTok). **Magalu não existe** em `lojas.js`. | `lib/config.js:42-48`; `lib/mercado.js:79` (só nome) |
| Categorias | `saude` e `bebe` monitoradas e publicadas por padrão. | `lib/config.js:110`, `:216`; `lib/radar.js:84-87`, `:97` |
| Publicação automática | `radar.publicar_direto` padrão **sim**; cron a cada 2 min; radar marca `modo_link:true`, e isso libera `sem_ref`. | `lib/config.js:107`, `:213`; `n8n/workflows/04-radar-ofertas.json:13`; `lib/radar.js:1239-1241`; `lib/textos.js:109-118` |
| Volume | `max_por_ciclo` 4 (até 8 nos picos) a cada 2 min. | `lib/config.js:114-115` |
| Log de recusas | Só `staticData` do workflow, 6 h, máx. 800 chaves (não é durável). | `lib/radar.js:1152-1168` |

## 2. Fontes externas (busca web pontual, 18/11/2026)

### brmarket-mcp — EXISTE (parcialmente verificado)
Fonte: registro npm `registry.npmjs.org/brmarket-mcp` (README da v0.3.0, MIT; publicado em 2026-09-07).
- Confirmado no README: busca `search_brazilian_marketplaces` **grátis**, sem carteira; ML + Shopee + AliExpress;
  preços em centavos de BRL, `dataAsOf`; limite best-effort **~30 consultas distintas/min/IP**; consultas idênticas
  vêm de **cache de 10 min** e não contam; **`shippingCents` ausente = frete DESCONHECIDO, nunca grátis**
  (o README cita `shippingCents` para AliExpress); resposta traz `sources` por marketplace (`ok/error/timeout/not_configured`).
- **Não tem histórico de preços**: só o preço atual. Ele não fornece `mediana_30d`. A série de 30 dias
  precisa ser montada por nós (snapshots próprios).
- Não cobre Amazon nem Magalu.
- O modelo de receita é a **comissão de afiliado do próprio brmarket** (o README pede para manter o `affiliateUrl` deles).
  Isso conflita com os links de afiliado do Ofertô. Uso proposto: **só como referência de preço**, nunca os links dele. Isso precisa de decisão humana (ToS).
- Há ferramentas pagas via x402 (USDC em Base/Solana). **Não usar**: quebra o custo zero e envolve cripto.
- É um servidor MCP (stdio). O endpoint HTTP direto (`GET /v1/search` do Worker) aparece no README, mas a URL
  base e a política de uso fora do MCP estão **NÃO VERIFICADAS**.

### ReefAPI — EXISTE, limites parcialmente VERIFICADOS
Fonte: `reefapi.com/pricing`.
- Confirmado: **1.000 créditos grátis**, sem cartão, não expiram; cobrança por crédito (chamada leve = 1).
- **NÃO VERIFICADO**: regra "1 conta só", cobertura de marketplaces BR (ML, Amazon BR, Shopee, Magalu não aparecem
  na página), existência de endpoint de **histórico de 30 dias**, limite por chave.
- Conclusão: hoje não dá para assumir que a ReefAPI calcula `mediana_30d`. Com 1.000 créditos fixos, ela dura pouco
  para 3-5 ofertas/dia × N canais × revalidação.

## 3. Decisões e suposições (A2)

- **D-A2-1 (proposta):** a `mediana_30d` sai do **histórico próprio** (`bfx_precos`). Esse histórico passa a ser
  alimentado por amostragem agendada (brmarket-mcp para ML/Shopee; página da loja para Amazon/Magalu),
  e não só quando o produto aparece no radar. Keepa fica desligada (é paga). ReefAPI fica como fallback pontual, só depois de confirmar a cobertura BR.
- **D-A2-2 (proposta):** um módulo puro novo (ex.: `lib/desconto.js`) com
  `avaliarDescontoReal({serie30d, preco, frete, cupom, cashback, loja, categoria})` →
  `{ preco_final, mediana_30d, desconto_real, integridade: consistente|provisoria|insuficiente, posicao, bloqueios[], destino: auto|revisao|rejeitar }`.
  Ele substitui o OR de `avaliarOfertaReal` por **AND dos 3 bloqueios duros** quando o destino é publicação automática.
- **D-A2-3 (proposta):** frete desconhecido não pode virar zero. Ou a oferta vai para revisão, ou `preco_final` é marcado como
  "frete desconhecido" e a oferta não auto-publica. Isso segue a semântica do brmarket.
- **D-A2-4 (suposição):** "integridade consistente" = ≥ N amostras distribuídas em ≥ 21 dos 30 dias, sem salto >X% entre
  amostras de fontes diferentes. "Provisória" = menos amostras mas ≥ 7 dias. **Os parâmetros N e X são PERGUNTA.**
- **D-A2-5 (suposição):** "posição no/próximo do menor patamar" = `preco_final ≤ min_30d × (1 + 3%)`. O valor de 3% é **PERGUNTA**.
  Hoje `selo.js` já faz "≤ min90 × (1+tolerância)", e isso pode ser reaproveitado.
- **D-A2-6:** a revalidação pré-envio (`>3%` ou cupom sumiu ⇒ cancela e registra `rejeitada_por_revalidacao`) precisa de
  uma releitura logo antes do `sendPhoto`, e de uma tabela de log durável (`bfx_rejeicoes` ou status em `bfx_ofertas`).
- **D-A2-7:** nada foi desligado em produção. O risco de publicação automática hoje fica registrado como pergunta (ver §4).

## 4. Riscos e perguntas para o sintetizador

1. **Produção publica sozinha hoje?** O padrão é `radar.publicar_direto=sim` (`lib/config.js:107`, `:213`) com cron de 2 min
   (`n8n/workflows/04-radar-ofertas.json:13`). O commit `cea6a19` diz "Radar volta a publicar sozinho", e
   `docs/SALVAMENTO-PROJETO.md:71-85` relata "3 ofertas reais publicadas". Isso conflita com "zero publicação real nesta etapa".
   O dono deve rodar `/modo aprovar` ou trocar a config? (A2 não mexeu.)
2. Ofertas do radar sem nenhum histórico (`sem_ref`) são liberadas porque o radar marca `modo_link:true`
   (`lib/radar.js:1240` + `lib/textos.js:115-116`). Bloquear já, antes da Fase 2?
3. Aceitam usar o brmarket-mcp só como referência de preço, ignorando o `affiliateUrl` dele? O README pede o contrário.
4. A whitelist-alvo inclui Magalu, mas não há suporte a Magalu em `lib/lojas.js`. Implementar ou tirar da whitelist?
5. As outras 24 lojas atuais (farmácias, moda, Shein, TikTok) vão todas para revisão humana?
6. `saude` e `bebe` hoje auto-publicam. Confirmam que viram revisão humana? Qual é a categoria "financeiro" (não existe hoje)?
7. Quais são os parâmetros de integridade (N amostras, cobertura em dias, salto máximo) e o "próximo do menor patamar" (%)?
8. Cashback: o extrator descarta (`lib/extrator.js:508-513`). Ele deve entrar no `preco_final` (regra-alvo) mesmo sendo condicional?
</content>
</invoke>
