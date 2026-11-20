# CHANGELOG — OPERAÇÃO OFERTÔ (OFERTÔ INTELLIGENCE, MARKETING & TELEGRAM RELIABILITY UPGRADE)

---

## 1. Novos Módulos e Arquivos Criados

- [`lib/inteligencia.js`](file:///c:/Users/tHg/Documents/Oferto/lib/inteligencia.js):
  - **Motor Central Ofertô Intelligence (100% determinístico e custo zero)**:
    - `MARCAS_CONHECIDAS`, `LOJAS_1P_OFICIAIS`, `PESOS_DIMENSOES`
    - `extrairMetricasUnidade(titulo, preco)`: cálculo automático de custo proporcional por unidade (`R$/fralda`, `R$/cápsula`, `R$/tira`, `R$/item no kit`, volume/peso).
    - `extrairEspecificacoesProduto(titulo, categoria)`: extração de especificações técnicas verificadas (`GB/TB`, polegadas, `Hz`, painel `OLED/IPS/4K`, `5G/Wi-Fi 6/ANC`, capacidade em litros, `BTUs`, `Watts`, voltagem, concentração `EDP/EDT/Parfum`, `FPS`).
    - `entenderProdutoOferta(oferta, opcoes)`: compreensão estruturada da natureza do produto (`consumivel_estoque`, `duravel_upgrade`, `colecionavel_desejo`, `estilo_vestuario`, `uso_pratico`), marca, público-alvo, principal vantagem, tipo de melhoria de preço e melhor argumento comercial.
    - `avaliarQuedaHistoricoRecente(oferta, linhasPrecos, agora)`: detector de queda real de preço em `bfx_precos` para produtos com menos de 90 dias de acompanhamento.
    - `construirContextoOferta(candidato, opcoes)`: contexto compartilhado unificado entre os 5 agentes com proveniência (`origem`) e nível de confiança (`0..1`).
    - `avaliarOportunidadeInteligente(ctxOuCand, cfg, opcoes)`: motor de decisão multicritério explicável em 9 dimensões (`qualidade_economica`, `confiabilidade_dados`, `relevancia_comercial`, `interesse_demonstrado`, `competitividade`, `atualidade`, `novidade`, `potencial_conversao`, `qualidade_fonte`), guardrails anti-"metade do dobro", classificação de oportunidade e recomendação de fila/Top do Dia.
    - `construirRelatorioFunil(dados)`: telemetria completa do funil de candidatos do radar.
    - `analisarAprendizadoHistorico(dados, cfg, agora)`: aprendizado contínuo baseado nas Data Tables com trava de amostra mínima (`MIN_AMOSTRA = 3`) e detecção de demanda reprimida de membros (`/alerta`).
    - `diagnosticarAutocura(dados, cfg, agora)`: diagnóstico operacional e ações de autocura (ofertas órfãs sem `message_id`, saturação de descartes de mercado, cooldown 429 do Promobit e radar inativo).
- [`tests/oferto-intelligence.test.js`](file:///c:/Users/tHg/Documents/Oferto/tests/oferto-intelligence.test.js):
  - Suíte automatizada cobrindo Inteligência (13.1), Marketing & Copywriting Contextual (13.2), Confiabilidade do Telegram, Fila, Idempotência e Isolamento Multicanal (13.3) e Integridade, Aprendizado Contínuo e Autocura (13.4).
- **Documentação Técnica Obrigatória**:
  - [`docs/AUDITORIA-COMPLETA-OFERTÔ.md`](file:///c:/Users/tHg/Documents/Oferto/docs/AUDITORIA-COMPLETA-OFERTÔ.md)
  - [`docs/OFERTÔ-INTELLIGENCE.md`](file:///c:/Users/tHg/Documents/Oferto/docs/OFERTÔ-INTELLIGENCE.md)
  - [`docs/TELEGRAM-RELIABILITY.md`](file:///c:/Users/tHg/Documents/Oferto/docs/TELEGRAM-RELIABILITY.md)
  - [`docs/CHANGELOG-INTELLIGENCE-UPGRADE.md`](file:///c:/Users/tHg/Documents/Oferto/docs/CHANGELOG-INTELLIGENCE-UPGRADE.md)

---

## 2. Módulos e Arquivos Modificados

- [`lib/index.js`](file:///c:/Users/tHg/Documents/Oferto/lib/index.js):
  - Exportado o novo módulo `./inteligencia` no índice central da biblioteca.
- [`lib/mercado.js`](file:///c:/Users/tHg/Documents/Oferto/lib/mercado.js):
  - Corrigido o bug crítico em `avaliarPrecoMercado`: quando o Zoom retorna apenas a própria loja candidata (`outraLoja.length === 0`), não aplica o Bloqueio 2 contra o próprio preço da loja (que descartava 90,4% dos candidatos do radar como `reprovado_mercado`). Quando há concorrentes (`outraLoja.length > 0`), calcula a `mediana` exclusivamente sobre os preços dos concorrentes (`outraLoja`).
- [`lib/radar.js`](file:///c:/Users/tHg/Documents/Oferto/lib/radar.js):
  - Integrado `avaliarQuedaHistoricoRecente` em `finalizarRadar` e `avaliarOfertaReal` para aprovar quedas reais verificadas na própria tabela `bfx_precos` mesmo antes de completar 90 dias.
  - Alinhado o limiar de prova de mercado em `avaliarOfertaReal` (`>= 7%` e `>= R$ 3,00`).
  - Integrado `aplicarAutocuraDescartesRadar` em `selecionarCandidatosRadar` e reduzido o TTL de descartes transientes `sem_prova_de_desconto` de 6h para 2h (tanto em `recusadaRecente` quanto em `atualizarDescartesRadar`), ampliando o limite de retenção para 1.200 chaves sem duplicar `radar_key === chave`.
  - Enriquecido `links_manuais` das ofertas aprovadas no radar com `score_inteligencia`, `classificacao_inteligencia`, `prioridade_fila`, `tipo_oportunidade` e `resumo_unidade`, repassando `avMercado: c.av_mercado` para `construirContextoOferta`.
  - Adicionada telemetria completa do funil (`resumo.funil`, incluindo `total_encontrados`) no retorno de `finalizarRadar`.
- [`lib/radar-pub.js`](file:///c:/Users/tHg/Documents/Oferto/lib/radar-pub.js):
  - Integrado `ordenarFilaPublicacao` em `publicarLoteRadar`, propagando `prioridade_fila` e `ts` de cada oferta para priorizar oportunidades críticas (`relampago`, `queda_expressiva`, `cupom_curto`, `alta_demanda`, `alta_qualidade`, `regular`) e intercalar destinos no lote.
- [`lib/fluxos.js`](file:///c:/Users/tHg/Documents/Oferto/lib/fluxos.js):
  - Integrados `avaliarQuedaHistoricoRecente`, `construirContextoOferta` e `avaliarOportunidadeInteligente` em `avaliarNovaOferta` para enriquecer ofertas manuais e links colados no roteador (`01-telegram-router`).
  - Integrados `analisarAprendizadoHistorico` e `diagnosticarAutocura` em `relatorioDiario` (`03-relatorio-diario`), exibindo demanda reprimida de membros (`/alerta`), ranking de aprendizado 7d e diagnósticos de autocura.
  - Propagados `prioridade` e `ts` em `postGrupo` e protegidos `chamadaCard`, `decidirCallback` e `prepararPublicacao` (`so_textos`) contra URLs binárias `.webp`/`.avif` em `link_preview_options.url`.
- [`lib/comunidade.js`](file:///c:/Users/tHg/Documents/Oferto/lib/comunidade.js):
  - Integrado `diagnosticarAutocura` em `executarGuardiao` (`05-guardiao-ofertas`), incluindo recuperação automática de ofertas presas em `status = 'publicando'` há `>= 30 min` sem `message_id` confirmado em `bfx_posts`.
  - Protegidos `dispararAlertasOferta` e `executarGuardiao` contra URLs binárias `.webp`/`.avif` em `link_preview_options.url`.
- [`lib/textos.js`](file:///c:/Users/tHg/Documents/Oferto/lib/textos.js):
  - Enriquecido `cardAprovacao` com exibição explicável do score e classificação do Ofertô Intelligence (`🧠 score X/100`) e indicador de queda contra histórico recente (`📉 queda vs histórico recente`).
- [`lib/tom.js`](file:///c:/Users/tHg/Documents/Oferto/lib/tom.js):
  - Criado `classificarMetadadosCopy` para classificar e registrar `id_variacao`, `estrutura`, `estilo`, `tipo_abertura`, `argumento`, `cta`, `categoria`, `destino` e `data_utilizacao` em `links_manuais.copy_tom`.
  - Expandido `especificacoes` e `FRASES_SPEC.nvme` para reconhecer SSDs mesmo quando o título não traz a sigla `"NVMe"` (ex.: `"SSD Kingston NV2 1TB"`), gerando copy específica de armazenamento e velocidade.
  - Adicionados pesos de diversificação estrutural (`e:` estilo, `g:` tipo de abertura, `r:` argumento e `c:` CTA) em `PESO_CHAVE`.
- [`lib/tg-envio.js`](file:///c:/Users/tHg/Documents/Oferto/lib/tg-envio.js):
  - Implementado `classificarErroTelegram` cobrindo sucesso, HTTP 429 (`retry_after`), timeouts/erros de rede ambíguos (`entrega_incerta` com proteção de idempotência), HTTP 5xx, HTTP 401/403, HTTP 400 (rejeição de imagem vs. parâmetro inválido) e respostas malformadas.
  - Implementado `validarBinarioFotoTelegram` (exige JPEG/PNG/GIF e `>= 280` chars base64, rejeitando arquivos corrompidos de 23 bytes e `.webp`).
  - Implementado `sanitizarFallbackTexto` para desativar `link_preview_options` no `sendMessage` de fallback sempre que a imagem original falhar no `sendPhoto` ou for `.webp`/`.avif`, eliminando o timeout de 45.000 ms.
  - Implementado `ordenarFilaPublicacao` com priorização comercial, expiração de itens `> 18h` e intercalação de destinos (`chat_id:thread_id`).
  - Implementado `rastrearEntregasPorDestino` e isolamento multicanal em `resultadoChamadas` (sucesso em um destino nunca é sobrescrito por falha em destino secundário; retorno de `updates` e alerta consolidado para lotes com múltiplas falhas totais).
- [`build/build-workflows.js`](file:///c:/Users/tHg/Documents/Oferto/build/build-workflows.js) e `n8n/workflows/*.json`:
  - Definido `responseFormat: 'json'` em `httpTelegram` e `httpTelegramArquivo` para impedir que o `HttpRequestV3` do n8n 2.47.7 acumule streams abertos (`useStream: true`).
  - Atualizados os nós `Resumir foto radar` e `Preparar foto radar` para utilizar `LIB.validarBinarioFotoTelegram(b).valido` e desativar `link_preview_options` quando o binário falha.
  - Atualizados os nós `Status de falha` (`01-telegram-router`) e `Status falha radar` (`04-radar-ofertas`) para processar todos os itens de `updates` no lote e integrado `LIB.aplicarAutocuraDescartesRadar` em `Selecionar radar`.
  - Recompilados os 6 workflows de `n8n/workflows/` via `npm run build` (sem tocar em `servidor-local/workflows/`).
- [`servidor-local/docker-compose.yml`](file:///c:/Users/tHg/Documents/Oferto/servidor-local/docker-compose.yml):
  - Adicionado `--no-network-family-autoselection` em `NODE_OPTIONS` do serviço `n8n` para eliminar o aborto de 500 ms do Happy Eyeballs para IPv6 inacessível.
- [`README.md`](file:///c:/Users/tHg/Documents/Oferto/README.md) e [`servidor-local/README.md`](file:///c:/Users/tHg/Documents/Oferto/servidor-local/README.md):
  - Atualizados números de lojas (60+ lojas), categorias (13 nichos + Top = 14 tópicos/canais) e workflows (6 em `n8n/workflows/`, 8 em `servidor-local/workflows/`).
