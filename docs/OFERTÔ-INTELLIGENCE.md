# OFERTÔ INTELLIGENCE — ARQUITETURA DO MOTOR DE INTELIGÊNCIA, CONTEXTO COMPARTILHADO, DECISÃO E COPYWRITING (CUSTO ZERO)

---

## 1. Visão Geral e Princípio de Custo Zero (`R$ 0`)

O **Ofertô Intelligence** ([`lib/inteligencia.js`](file:///c:/Users/tHg/Documents/Oferto/lib/inteligencia.js)) é o motor transversal de inteligência da plataforma Ofertô. Ele foi projetado para operar **100% localmente, de forma determinística, explicável e sem nenhuma dependência de API paga** em produção.

Diferenciação arquitetural estrita:
1. **Inteligência em Produção (Custo R$ 0)**: Compreensão semântica de produtos, extração de especificações e custo unitário, detecção de queda no histórico próprio (`bfx_precos`), auditoria estatística contra concorrentes (Zoom + Amazon), avaliação multicritério em 9 dimensões, geração contextual de copywriting com memória estrutural anti-repetição, aprendizado contínuo baseado nos dados das Data Tables e autocura operacional.
2. **Suporte Opcional a LLM (`lib/tom-ia.js`)**: Mantido exclusivamente como recurso opcional desligado por padrão (`copy.ia = nao`), compatível com modelos locais gratuitos (Ollama) sem impactar a operação quando ausente.

---

## 2. Contexto Compartilhado entre Todos os Agentes (`construirContextoOferta`)

Antes da transformação, os 5 agentes (Caçador, Auditor, Marketing, Concierge e Guardião) operavam sobre campos parciais. Agora, `construirContextoOferta(candidato, opcoes)` consolida todos os sinais em uma estrutura única com **origem (`origem`)** e **nível de confiança (`confianca`: 0 a 1)** explícitos:

| Bloco de Contexto | Sinais Consolidados | Origem e Confiança |
|---|---|---|
| `produto_info` | Categoria, marca reconhecida (65+ marcas mapeadas), especificações técnicas (`1TB`, `144Hz`, `IPS`, `EDP`, `100ml`, `FPS 70`, `Bivolt`), quantidade de unidades, custo unitário (`R$/fralda`, `R$/cápsula`, `R$/item`), natureza do produto, público-alvo, principal vantagem e melhor argumento comercial. | `entenderProdutoOferta` |
| `loja_info` | ID da loja, nome amigável, indicador `oficial_1p` (51 lojas 1P oficiais), indicador `curada_kpop` e status de monetização ativa (`monetizada` via `statusAfiliadoFonte`). | `lib/lojas.js` + `lib/links.js` |
| `economia_info` | `preco_atual`, `preco_de`, `preco_sem_cupom`, `desconto_real_pct`, `economia_reais`, `fonte_referencia` (`keepa`, `historico_90d`, `historico_recente`, `mercado_zoom_amazon`, `cupom_verificado`, `anuncio_loja`), `parcelamento`, `pix`, `recorrencia`, `frete_gratis`, `queda_recente` e `ref_mercado`. | `pdp_confirmada` (0.96), `historico_90d` (0.95), `mercado_zoom_amazon` (0.88), `historico_recente` (0.85) |
| `cupom_info` | Código do cupom, cupom automático no anúncio, `exige_resgate_previo`, `exige_resgate_pagina` e `exclusivo_prime`. | `pdp_loja` (0.92) / `anuncio` (0.78) |
| `demanda_info` | Match contra alertas ativos de membros (`bfx_alertas`), total de alertas compatíveis, termos solicitados, campanha sazonal ativa e engajamento na comunidade (`curtidas`, `destaque`). | `bfx_alertas` + sinais sociais |
| `publicacao_info` | Status de repetição 24h/72h, indicador de atualização legítima (`eh_atualizacao`: queda adicional >= 5% ou cupom novo) e controle de anti-fadiga por categoria. | `bfx_ofertas` (`avaliarRepeticao24h`) |
| `qualidade_dados` | Confirmação de leitura da PDP (`pagina_confirmada`), validação de URL de imagem (`imagem_valida`) e mapa de sinais auditáveis. | `lerPaginaProduto` + `normalizarImagemOferta` |

---

## 3. Motor de Compreensão de Produto (`entenderProdutoOferta`)

Para que a comunicação e o ranking entendam *o que* está sendo vendido e *por que* a oferta é boa, `entenderProdutoOferta` classifica cada item em 5 dimensões semânticas:

1. **Natureza do Produto (`natureza`)**:
   - `consumivel_estoque`: fraldas, lenços umedecidos, suplementos (whey, creatina, vitaminas), café, itens de despensa/limpeza, ração/antipulgas pet, skincare diário.
   - `duravel_upgrade`: Smart TVs, smartphones, notebooks, consoles, placas de vídeo, monitores, eletrodomésticos, air fryers, ferramentas, pneus.
   - `colecionavel_desejo`: álbuns e lightsticks de K-pop, perfumes árabes/nicho/importados, boxes de livros, mangás e HQs.
   - `estilo_vestuario`: tênis de corrida, calçados casuais, vestuário e acessórios.
   - `uso_pratico`: papelaria, organização de home office, acessórios automotivos e utilidades domésticas.
2. **Cálculo Automático de Custo Unitário (`extrairMetricasUnidade`)**:
   - Extrai contagens (`196 Fraldas`, `120 Cápsulas`, `72 Tiras`, `Kit 12 Cuecas`, `Pack 6`) e calcula automaticamente o valor unitário (ex.: `R$ 0,90/fralda`), enriquecendo `links_manuais.resumo_unidade` e os argumentos comerciais.
3. **Tipo de Melhoria de Preço (`tipo_melhoria`)**:
   - `menor_historico_90d` (preço igual ou abaixo do mínimo de 90 dias)
   - `queda_pos_publicacao` (preço caiu ainda mais desde o último post no canal)
   - `queda_historico_recente` (queda verificada contra snapshots anteriores em `bfx_precos`)
   - `abaixo_concorrencia` (preço comprovadamente menor que nos concorrentes do Zoom/Amazon)
   - `cupom_acumulado` (cupom ativo reduzindo o valor final)
   - `pedido_comunidade` (item monitorado por membros no `/alerta`)
   - `recorrencia_ou_pix` (desconto real no Pix ou Programe e Poupe)
   - `desconto_direto_verificado` (desconto direto confirmado na página da loja)

---

## 4. Motor de Decisão Multicritério Explicável (`avaliarOportunidadeInteligente`)

Cada oportunidade recebe uma pontuação de **0 a 100** calculada pela média ponderada de **9 dimensões explicáveis**:

| # | Dimensão | Peso | O que avalia |
|---|---|---|---|
| 1 | `qualidade_economica` | **24%** | Desconto real %, economia em R$, posição contra menor preço de 90 dias, queda recente em `bfx_precos` e vantagem de custo unitário em kits/consumíveis. |
| 2 | `confiabilidade_dados` | **18%** | Preço confirmado na página da loja (PDP), loja oficial 1P/curada, imagem válida, cobertura de histórico/mercado e ausência de âncora inflada ("metade do dobro"). |
| 3 | `relevancia_comercial` | **12%** | Reconhecimento da marca (`MARCAS_CONHECIDAS`), riqueza de especificações identificadas, faixa de ticket e aderência à natureza da categoria. |
| 4 | `interesse_demonstrado` | **10%** | Match direto com alertas pessoais ativos de membros (`/alerta`) e validação social em fontes curadas. |
| 5 | `competitividade` | **10%** | Vantagem percentual em relação aos concorrentes auditados no Zoom e na busca da Amazon. |
| 6 | `atualidade` | **7%** | Frescor da verificação na loja, presença de campanha ativa ou janela de cupom. |
| 7 | `novidade` | **7%** | Ineditismo nas últimas 24h/72h ou atualização legítima por nova queda de preço / novo cupom. |
| 8 | `potencial_conversao` | **7%** | Afiliado configurado e monetizando, cupom fácil de aplicar, desconto no Pix, parcelamento sem juros e frete grátis. |
| 9 | `qualidade_fonte` | **5%** | Prioridade para PDP 1P confirmada, catálogos oficiais e lojas especializadas curadas. |

### 4.1. Guardrails de Segurança e Integridade
Uma pontuação alta em desconto nominal **nunca** compensa dados duvidosos. A oferta é automaticamente reprovada se:
- `confiabilidade_dados < 35` ou preço ausente/zero;
- Desconto nominal `>= 80%` sem confirmação no histórico ou em comparador de mercado (bloqueio anti-"metade do dobro");
- Preço atual acima do menor valor registrado nos últimos 90 dias (`selo === 'acima'`);
- Preço empatado ou mais caro que concorrente direto na auditoria de mercado (`mercado.aprovar === false`);
- Produto já publicado nas últimas 24h/72h sem nova queda `>= 5%` e sem cupom novo;
- Ausência completa de prova de economia real.

### 4.2. Classificação e Prioridade de Fila
- **Classificações**: `imperdivel` (82–100), `muito_forte` (70–81), `boa_oportunidade` (55–69), `regular` (42–54), `fraca` (<42).
- **Prioridade na Fila de Publicação (`prioridade_fila`)**: `relampago` > `queda_expressiva` > `cupom_curto` > `alta_demanda` > `alta_qualidade` > `regular` > `institucional`.

---

## 5. Detector de Queda no Histórico Recente (`avaliarQuedaHistoricoRecente`)

Quando um produto ainda não completou 90 dias de acompanhamento na tabela `bfx_precos`, `avaliarSelo` retorna `sem_ref`. Para não desperdiçar os milhares de snapshots já coletados pelo próprio Ofertô:
- `avaliarQuedaHistoricoRecente(oferta, linhasPrecos, agora)` filtra os registros anteriores do mesmo `loja + produto_id` em `bfx_precos`;
- Calcula o menor valor, o maior valor e a mediana das coletas anteriores;
- Se o preço atual estiver no piso histórico observado (`<= menorAnterior * 1.01`) e representar uma queda `>= 5%` e `>= R$ 2,00` frente à referência anterior, aprova a evidência `queda_historico_recente`, destravando publicações legítimas com prova real do próprio banco.

---

## 6. Copywriting Contextual e Memória Estrutural Anti-Repetição (`lib/tom.js` & `lib/copy.js`)

O motor de linguagem natural determinístico em [`lib/tom.js`](file:///c:/Users/tHg/Documents/Oferto/lib/tom.js) e [`lib/copy.js`](file:///c:/Users/tHg/Documents/Oferto/lib/copy.js) foi expandido com `classificarMetadadosCopy`:

- **Diversidade de Estilos**: `direto`, `informal`, `consultivo`, `entusiasmado`, `economico`, `tecnico`, `premium`, `descontraido`, `oportunidade`, `informativo`, `especializado`.
- **Tipos de Abertura**: `especificacao_tecnica`, `colecao_fandom`, `identificacao_publico`, `reposicao_rotina`, `upgrade_desejo`, `dor_cotidiana`, `curadoria_garimpo`.
- **Argumentos Comerciais**: `cupom_ativo`, `queda_verificada`, `especificacao_destaque`, `estoque_inteligente`, `praticidade_rotina`, `custo_beneficio_nicho`.
- **CTAs**: `aplicar_cupom`, `reforcar_estoque`, `salvar_wishlist`, `compartilhar_turma`, `aproveitar_queda`, `conferir_detalhes`.
- **Memória Persistida em `links_manuais.copy_tom`**:
  ```json
  {
    "texto": "Fone novo é daqueles upgrades que você usa o dia inteiro. Nesse valor compensa demais.",
    "chaves": ["f:...", "i:fone novo", "a:...", "z:...", "e:entusiasmado", "g:upgrade_desejo"],
    "estrutura": "combo_abertura_fecho",
    "estilo": "entusiasmado",
    "tipo_abertura": "upgrade_desejo",
    "argumento": "queda_verificada",
    "cta": "aproveitar_queda",
    "categoria": "tech",
    "destino": "multicanal"
  }
  ```

---

## 7. Aprendizado Contínuo (`analisarAprendizadoHistorico`) e Autocura (`diagnosticarAutocura`)

1. **Aprendizado Contínuo (`analisarAprendizadoHistorico`)**:
   - Consolida janelas de 7 dias sobre `bfx_ofertas`, `bfx_posts`, `bfx_alertas` e `bfx_entradas`;
   - Exige `MIN_AMOSTRA = 3` antes de ranquear categorias ou lojas;
   - Identifica as categorias com maior conversão (publicações confirmadas + entradas por link de convite), as lojas com maior taxa de aprovação e desconto real médio, os melhores horários de descoberta e a **demanda reprimida** (termos cadastrados no `/alerta` com 0 ofertas publicadas nos últimos 7 dias).
2. **Autocura Operacional (`diagnosticarAutocura`)**:
   - Detecta ofertas órfãs (`status = 'aprovada'` ou `'publicando'` há mais de 15 min sem `message_id` em `bfx_posts`);
   - Detecta saturação anormal de descartes de mercado (`> 80%` em `radar_descartes`);
   - Reporta cooldown anti-429 do Promobit e inatividade do radar em horário comercial (`9h–22h BRT`), emitindo ações estruturadas de recuperação (`acoes_autocura`).
