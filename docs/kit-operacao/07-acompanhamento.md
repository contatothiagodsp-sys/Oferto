# Acompanhamento e decisão

## Nomes de campanha

Use o mesmo nome no anúncio da Meta, na UTM da landing e no link de convite do Telegram (`/convite`, até 32 caracteres). Assim os 3 relatórios se cruzam.

**Padrão:** `{origem}_{categoria}_{criativo}`

| Exemplo | Quer dizer |
|---|---|
| `meta_casa_c1` | Meta Ads, Casa & Eletro, criativo 1 |
| `meta_beleza_c2` | Meta Ads, Beleza, criativo 2 |
| `meta_bebe_rmk` | Meta Ads, Bebê, remarketing |
| `x_bio` | Link da bio do X |
| `x_ranking` | Link na resposta do ranking do dia |
| `org_landing` | Visita orgânica à landing |

**UTM dos botões da landing**, um conjunto por anúncio:

```
?utm_source=meta&utm_medium=paid&utm_campaign=bf26_casa&utm_content=meta_casa_c1
```

**Telegram:**

```
/convite casa meta_casa_c1
```

**Lembrete:** WhatsApp não tem link por anúncio (canal e grupo têm um link só). A medição de entradas por anúncio no WhatsApp vem do **clique no botão** da landing (Pixel).

## Planilha diária (preencher às 22h com o relatório do bot)

Crie uma planilha com estas colunas. Uma linha por **dia × categoria**.

| Coluna | De onde vem |
|---|---|
| data | — |
| categoria | casa / beleza / bebe / tech |
| gasto_meta | Gerenciador de Anúncios |
| cliques_botao_wag / _wac / _tg | Pixel (eventos dos botões da landing) |
| entradas_tg | Relatório do bot (por link de convite) |
| saidas_tg | Relatório do bot |
| membros_wag / membros_wac | Contagem no app (anotar 1 vez por dia) |
| custo_por_membro | gasto_meta ÷ novos membros (todas as plataformas) |
| posts | Relatório do bot (Telegram) + contagem manual (WhatsApp/X) |
| cliques_afiliado | Painéis Amazon / Shopee / ML, filtrando pela tag/sub-ID da categoria |
| comissao_gerada | Painéis dos programas (pendente) |
| correcoes | Quantas correções de preço/selo (ver [06](06-incidentes.md)) |
| remocoes | Quantas pessoas removidas (spam/golpe) |

## Regras de corte dos anúncios (do plano)

| Período | Regra |
|---|---|
| 20–23/11 (teste, R$ 125 por categoria) | **Cortar** a categoria se o custo por membro passar de **R$ 1,50** depois de **R$ 75** gastos |
| 23–27/11 (escala, R$ 900) | Só nas **2 melhores** categorias, e só se o custo por membro estiver **≤ R$ 1,00** |
| 26–30/11 (remarketing, R$ 250) | Quem visitou a landing e não clicou em nenhum botão |
| 01–20/12 (Natal, R$ 450) | Beleza & Presentes, Casa, Bebê; mesmo teto de custo |

**Teste A/B do plano:** em metade dos anúncios, botão principal **Grupo WhatsApp**; na outra metade, **Canal WhatsApp**. Use os sufixos `_a` / `_b` no nome da campanha (`meta_casa_c1_a`). Compare a retenção em 30 dias.

## Decisão de janeiro

Para cada categoria e plataforma (critérios da seção 8 do plano):

| Métrica | Manter | Ajustar | Encerrar ou fundir |
|---|---|---|---|
| Custo por membro (BF) | ≤ R$ 1,00 | R$ 1–2 | > R$ 2 |
| Membros ativos em 31/12 ÷ entradas | ≥ 50% | 30–50% | < 30% |
| Comissão gerada por membro ativo/mês (dez.) | ≥ R$ 0,40 | R$ 0,15–0,40 | < R$ 0,15 |
| Taxa de aprovação da comissão (jan./fev.) | ≥ 80% | 65–80% | < 65% |
| Plataforma: % da comissão gerada | ≥ 20% | 10–20% | < 10% com alto custo de operação |

**Lembretes:**
- A comissão da BF só é **aprovada** depois da janela de devolução e **paga** de 30 a 90 dias depois. Decida em janeiro com a comissão gerada e só considere validado com a aprovação confirmada.
- O Tech encerra em 31/12 de qualquer jeito. Os candidatos a substituí-lo em janeiro são **Pet** e **Moda**.
- Mantenha a **reserva de R$ 900** do estudo até a comissão de novembro ser paga.
