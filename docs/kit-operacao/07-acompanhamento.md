# Acompanhamento e decisão

## Funil sem site

Sem landing, o anúncio leva a pessoa direto ao grupo ou ao canal:

| Destino do anúncio | Link | Como medir as entradas por anúncio |
|---|---|---|
| **Telegram** | Um link de convite nomeado **por anúncio** (`/convite casa meta_casa_c1`) | **Exato:** o relatório do bot mostra entradas, saídas e retenção por link |
| **Canal do WhatsApp** da categoria | O link do canal (é um só) | **Aproximado:** cliques no link (Gerenciador de Anúncios) + aumento diário de seguidores do canal |
| **Comunidade do WhatsApp** (alertas) | O link da comunidade (é um só) | **Aproximado:** igual ao canal, com o número de membros |

**Consequências:**
- No WhatsApp não dá para saber qual anúncio trouxe cada membro. Para comparar anúncios do WhatsApp, use o **custo por clique no link** de cada anúncio; para comparar categorias, use o **custo por novo membro** do dia.
- **OPINIÃO:** como só o Telegram mede com exatidão, faça **1 anúncio por categoria com destino Telegram** em todo o período de teste. É a sua referência de qualidade (retenção real), e ela vale para calibrar os anúncios do WhatsApp.
- **Remarketing** (R$ 250 do plano, 26–30/11): sem Pixel, use um **público de engajamento**: quem assistiu a ≥ 50% dos vídeos ou interagiu com a Página ou o Instagram nos últimos 30 dias.
- **Alternativa (não recomendada no começo):** anúncio de **mensagem para o WhatsApp**. A conversa abre no número da marca, e a saudação automática manda a vitrine de links. Mede conversas por anúncio, mas acrescenta um passo e traz mensagens para responder.

## Nomes de campanha

Use o mesmo nome no anúncio da Meta e no link de convite do Telegram (`/convite`, até 32 caracteres). Assim os relatórios se cruzam.

**Padrão:** `{origem}_{categoria}_{criativo}`

| Exemplo | Quer dizer |
|---|---|
| `meta_casa_c1` | Meta Ads, Casa & Eletro, criativo 1 |
| `meta_beleza_c2` | Meta Ads, Beleza, criativo 2 |
| `meta_bebe_rmk` | Meta Ads, Bebê, remarketing |
| `x_bio` | Link da bio do X |
| `x_ranking` | Link na resposta do ranking do dia |
| `ig_bio` | Link da bio do Instagram |
| `vitrine_wac` | Link do Telegram na vitrine fixada no canal Top do Dia |

**Telegram** (um comando por anúncio ou lugar):

```
/convite casa meta_casa_c1
```

## Planilha diária (preencher às 22h com o relatório do bot)

Crie uma planilha com estas colunas. Uma linha por **dia × categoria**.

| Coluna | De onde vem |
|---|---|
| data | — |
| categoria | casa / beleza / bebe / tech |
| gasto_meta_tg / gasto_meta_wa | Gerenciador de Anúncios (separado por destino) |
| cliques_link_tg / cliques_link_wa | Gerenciador de Anúncios |
| entradas_tg / saidas_tg | Relatório do bot (por link de convite) |
| seguidores_wac | Contagem no canal da categoria (anotar 1 vez por dia, sempre no mesmo horário) |
| membros_wag | Contagem na comunidade/grupo (idem) |
| custo_por_membro_tg | gasto_meta_tg ÷ entradas_tg dos links `meta_` |
| custo_por_membro_wa | gasto_meta_wa ÷ (aumento de seguidores_wac + membros_wag). Inclui os orgânicos, então é um teto otimista. |
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
| 26–30/11 (remarketing, R$ 250) | Público de engajamento: viu ≥ 50% dos vídeos ou interagiu com a Página/Instagram |
| 01–20/12 (Natal, R$ 450) | Beleza & Presentes, Casa, Bebê; mesmo teto de custo |

**Teste A/B do plano** (adaptado): o mesmo criativo com 2 destinos, **Comunidade WhatsApp (alertas)** × **Canal WhatsApp**. Use os sufixos `_a` / `_b` (`meta_casa_c1_a`). Sem site, a comparação é pelo custo por novo membro e pela contagem de membros em 30 dias, não por pessoa.

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
