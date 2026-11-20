# Chaves da tabela `bfx_config`

Gerado por `node build/build-workflows.js`. Edite os valores no n8n: **Overview → Data tables → bfx_config**.
Linha vazia = usa o padrão (exceto `shopee.busca.*`: vazio = não coletar aquela categoria).

| Chave | Padrão | Para que serve |
|---|---|---|
| `marca` | `Ofertô` | Nome da marca (aparece nos textos e no relatório) |
| `admins` |  | IDs do Telegram de quem aprova (separados por vírgula). Descubra mandando /id ao bot de aprovação |
| `bot_token` |  | Token do BOT DE APROVAÇÃO (@BotFather). Conversa privada com os admins |
| `bot_token_grupo` |  | Token do BOT PUBLICADOR (admin do supergrupo/canais). Vazio = usa o bot de aprovação |
| `grupo_id` |  | ID do supergrupo (-100…). Vazio ou "nenhum" = publica só nos canais por categoria |
| `posts.foto` | `sim` | sim/nao: posts com imagem saem como FOTO no Telegram (se a foto falhar, sai como texto com prévia) |
| `grupo_link` |  | Link público do grupo (opcional, usado em respostas) |
| `n8n_webhook_url` |  | Production URL do nó Webhook do workflow 01 (copie do n8n) |
| `webhook_secret` |  | Gerado pelo setup. Não precisa mexer |
| `bot_grupo_username` |  | Gerado pelo setup: @ do bot publicador (usado nos links de divulgação do /links). Não precisa mexer |
| `hash_sal` |  | Gerado pelo setup: sal do hash de quem entra/sai do grupo. Não mude (os hashes antigos deixam de bater) |
| `grupo.textos` | `pendente` | pendente = o setup arruma o grupo uma vez (descrição, 📌 Regras & Segurança oculto, textos fixados e tópicos abertos para comentários nas ofertas) · atualizar = reescreve os textos já fixados, sem mandar mensagem nova · limpar = apaga TODAS as mensagens do grupo (inclusive de membros) e arruma de novo; leva ~4 min · ok = não mexe |
| `grupo.mensagens` |  | Gerado pelo setup: IDs das mensagens fixadas (usado pelo modo atualizar). Não precisa mexer |
| `grupo.limpar_avisos` | `sim` | sim/nao: o bot publicador apaga os avisos automáticos do grupo (entrou, saiu, fixou, fechou tópico, mudou nome/foto). Precisa da permissão Apagar mensagens. Com o bot admin, cada mensagem do grupo vira 1 execução do n8n |
| `grupo.antispam` | `sim` | sim/nao: com grupo.limpar_avisos ligado, o bot publicador apaga mensagens de membros com link de outro grupo, WhatsApp ou encurtador (links de loja viram sugestão para os admins) |
| `grupo.fechar_topicos_oferta` | `nao` | sim/nao: fecha os tópicos de ofertas para membros comuns no supergrupo (altere rápido com /topicos fechar ou /topicos abrir) |
| `rastrear_entradas` | `sim` | sim/nao: grava entradas e saídas por link de convite (1 execução do n8n por evento) |
| `campanha_prefixo` | `bf26` | Prefixo dos sub-IDs |
| `fuso` | `America/Sao_Paulo` | Fuso horário dos textos |
| `auto.link_direto` | `sim` | sim/nao: no privado, basta colar ou encaminhar o link do produto que o bot extrai título, preço, imagem e categoria sem exigir /oferta |
| `auto.publicar_direto` | `nao` | sim/nao: publica direto no grupo/canais do Telegram e já entrega o texto do WhatsApp sem precisar clicar em Aprovar (ative rápido com /modo rapido) |
| `auto.categoria_padrao` | `casa` | Categoria usada quando o bot não identifica pelas palavras do produto (casa, moda, beleza, perfumes, saude, bebe, tech) |
| `copy.chamativa` | `sim` | sim/nao: gera ganchos persuasivos, comparação De/Por e economia em R$ nos textos de Telegram e WhatsApp para atrair cliques |
| `copy.tom` | `sim` | sim/nao: adiciona abaixo do nome do produto uma frase curta no tom do público do nicho (fã de K-pop, gamer, hardware, casa, perfumes…). Sem IA, usa o banco de frases curado (custo zero) |
| `copy.ia` | `nao` | sim/nao: gera a frase de tom com a Claude API (precisa de copy.ia_chave; cobrado por uso). Em erro, timeout ou frase reprovada, cai no banco de frases |
| `copy.ia_chave` |  | Chave da Claude API (console.anthropic.com) usada por copy.ia. Vazio = IA desligada |
| `copy.ia_modelo` | `claude-opus-5-5` | Modelo da Claude API para a copy (ex.: claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5) |
| `copy.ia_timeout_ms` | `15000` | Tempo máximo (ms) de espera pela IA antes de usar o banco de frases |
| `copy.ia_max_por_ciclo` | `5` | Máximo de ofertas com copy por IA em cada rodada do radar (as demais usam o banco de frases) |
| `copy.ia_api` | `https://api.anthropic.com/v1/messages` | Endereço da Claude API (não altere; usado em testes) |
| `publicar.plataformas` | `wag,wac,x` | Quais textos prontos enviar ao aprovar: wag (Grupo WhatsApp), wac (Canal WhatsApp), x (X/Twitter). Use só wag para focar em Telegram + Grupo WhatsApp |
| `divulgar.auto_diario` | `sim` | sim/nao: divulga automaticamente 1x ao dia (22h05) o hub dos seus canais para estimular entradas cruzadas |
| `canais.auto_vincular` | `sim` | sim/nao: ao adicionar o bot publicador como admin num canal novo, identifica a categoria pelo nome, liga o canal, cria convite, coloca bio e fixa boas-vindas sozinho |
| `alertas.ativo` | `sim` | sim/nao: permite aos membros cadastrar alertas pessoais (/alerta ps5) no bot publicador e receber DM automática com seu link de afiliado |
| `alertas.max_por_membro` | `10` | Quantidade máxima de alertas ativos por membro |
| `post.botoes_extras` | `nao` | sim/nao: adiciona botões [🔔 Criar alerta] e [📲 Mandar no Zap] embaixo dos posts do Telegram |
| `guardiao.ativo` | `sim` | sim/nao: verifica a cada 30 min se ofertas publicadas esgotaram ou caíram >=6% extra e encerra/atualiza automaticamente |
| `vitrine.auto_noite` | `sim` | sim/nao: às 21h15 publica o resumão Top 5 Ofertas Ainda Ativas do Dia (também disponível com /resumao) |
| `vitrine.ultimo_dia` |  | Gerado automaticamente pelo guardião para não repetir a vitrine noturna no mesmo dia |
| `selo.tolerancia_pct` | `0` | Tolerância do selo em % acima do menor preço de 90 dias (recomendado: 0) |
| `selo.exigir_ref90` | `sim` | sim/nao: exigir referência de 90 dias no /oferta e na coleta Shopee (links colados direto já liberam aprovação sem ref90 quando não estão acima do histórico) |
| `shopee.app_id` |  | App ID da Shopee Affiliate Open API |
| `shopee.secret` |  | Secret da Shopee Affiliate Open API |
| `shopee.endpoint` | `https://open-api.affiliate.shopee.com.br/graphql` | Endpoint GraphQL (VERIFICAR no painel) |
| `shopee.min_desconto_pct` | `20` | Desconto mínimo anunciado pela loja para virar candidata |
| `shopee.min_comissao_pct` | `3` | Comissão mínima (%) |
| `shopee.min_vendas` | `50` | Vendas mínimas do produto |
| `shopee.max_cards` | `8` | Máximo de cards de aprovação por coleta |
| `shopee.enviar_sem_ref` | `sim` | sim/nao: enviar candidatas sem referência de 90 dias (para você informar o ref90) |
| `telegram_api` | `https://api.telegram.org` | Endereço da Bot API (não altere; usado em testes) |
| `link_curto_api` |  | Deixe vazio (usado só em testes para abrir links curtos a.co/amzn.to) |
| `pagina_api` |  | Deixe vazio (usado só em testes para ler o HTML da página do produto) |
| `amazon.tag_padrao` |  | Tag única da Amazon usada quando não há tag específica por categoria/plataforma (ex.: suatag-20) |
| `shein.afiliado_id` |  | Código ou parâmetro de afiliado da Shein (ex.: 123456 ou url_from=adhub…). Vazio = link direto ou link curto colado |
| `ml.etiqueta` |  | Opcional: matt_word:matt_tool de afiliado do Mercado Livre (ou cole links mercadolivre.com/sec/…) |
| `awin.afiliado_id` |  | Opcional: seu Publisher ID da Awin (monetiza automaticamente KaBuM! mid 17729) |
| `terabyte.afiliado_id` |  | Opcional: seu código de parceiro da TerabyteShop (?p=...) |
| `rakuten.id` |  | Opcional: seu ID criptografado Rakuten Advertising (monetiza Pacheco, Beleza na Web, Natura) |
| `natura.consultoria` |  | Opcional: código do seu Espaço Digital Natura (?consultoria=...) |
| `radar.ativo` | `sim` | sim/nao: ativa o Radar Multi-Fonte automático a cada 2 min sem custo extra (workflow 04) |
| `radar.publicar_direto` | `sim` | sim/nao: publica as promoções do radar automaticamente no Telegram e entrega o botão WhatsApp (desative com /modo aprovar) |
| `radar.auto_top` | `sim` | sim/nao: manda automaticamente promoções muito fortes (>=35% OFF ou >=28% + cupom) para o Top do Dia |
| `radar.top_max_dia` | `40` | Máximo de ofertas por dia no Top do Dia (ex.: 15 a 50; reserva 35% para o horário nobre 18h–23h) |
| `radar.lojas` | `amazon,ml,shopee,shein,tiktok,aliexpress,kabum,terabyte,pichau,acer,motorola,samsung,drogaraia,drogasil,pacheco,panvel,araujo,paguemenos,venancio,oficialfarma,maxtitanium,rihappy,alobebe,belezanaweb,epocacosmeticos,boticario,natura,sephora,mahogany,creamy,ikesaki,centauro,netshoes,nike,adidas,olympikus,mizuno,underarmour,farmrio,renner,cea,riachuelo,dafiti,zattini,hering,polishop,electrolux,brastemp,consul,magalu,umusic,klinestore,hopescolor,asiaticstore,kpopandyoushop,kpopalbums` | Lojas monitoradas pelo radar automático (Amazon, ML, Shopee, Shein, TikTok, AliExpress, KaBuM!, Terabyte, Pichau, farmácias, suplementos, beleza, casa, tech, moda e K-pop) |
| `radar.categorias` | `moda,beleza,perfumes,saude,casa,tech,bebe,kpop` | Categorias monitoradas pelo radar (moda, beleza, perfumes, saude, casa, tech, bebe, kpop) |
| `radar.palavras` |  | Filtro opcional de palavras no radar separadas por ; (vazio = aceita todas as boas ofertas das lojas/categorias; ajuste com /buscas) |
| `radar.min_desconto_pct` | `15` | Desconto mínimo (%) para entrar no radar (ofertas com cupom ou destaque da comunidade também entram) |
| `radar.preco_min` | `15` | Preço mínimo em R$ no radar (ignora banners de R$ 0,01 e itens isca) |
| `radar.max_por_ciclo` | `4` | Máximo base de promoções publicadas por rodada de 2 min do radar (nos picos de oferta escala até 8 com cadencia_dinamica) |
| `radar.cadencia_dinamica` | `sim` | sim/nao: ajusta o volume do radar conforme o horário (até 6–8 ofertas nos picos 11h–14h e 18h–23h quando há promoções fortes, e até 2 na madrugada) |
| `radar.canais_telegram` |  | Opcional: @canais públicos de ofertas no Telegram (separados por ;) para o radar garimpar via t.me/s/ e trocar pelo seu afiliado |
| `radar.canais_curados` | `sim` | sim/nao: inclui fontes públicas curadas gratuitas (@canaltechofertas, @xetdaspromocoes, @nerdofertas) no radar agendado, trocando pelo seu afiliado |
| `radar.api_url` |  | Deixe vazio (usado só em testes para simular fontes do radar) |
| `mercado.checar` | `sim` | sim/nao: compara automaticamente o preço em buscadores públicos (Zoom e busca Amazon) antes de publicar e bloqueia falsos descontos ou ofertas mais caras que a concorrência |
| `cupons.radar_auto` | `sim` | sim/nao: publica alertas automáticos de cupons gerais e lotes de horário das lojas (ex.: 19h Mercado Livre, Shopee, Shein, Amazon) |
| `cupons.esquenta_19h` | `sim` | sim/nao: às 18h45 publica um lembrete automático de Esquenta para resgatar cupons das 19h antes de acabarem |
| `cupons.ultimo_esquenta` |  | Gerado automaticamente para não repetir o alerta de esquenta das 18h45 no mesmo dia |
| `cupons.link_ml` |  | Seu link de afiliado (/sec/) para a Aba de Cupons do Mercado Livre (vazio = etiqueta ou link direto /cupons) |
| `cupons.link_amazon` |  | Seu link de afiliado para a Central de Cupons da Amazon (vazio = usa tag_padrao) |
| `cupons.link_shopee` |  | Seu link de afiliado para a Aba de Cupons da Shopee (vazio = gera via Shopee API) |
| `cupons.link_shein` |  | Seu link de afiliado para a Aba de Cupons da Shein |
| `cupons.logo_ml` |  | URL da logo oficial do Mercado Livre usada nos alertas de cupons (vazio = logo padrão) |
| `cupons.logo_amazon` |  | URL da logo oficial da Amazon usada nos alertas de cupons (vazio = logo padrão) |
| `cupons.logo_shopee` |  | URL da logo oficial da Shopee usada nos alertas de cupons (vazio = logo padrão) |
| `cupons.logo_shein` |  | URL da logo oficial da Shein usada nos alertas de cupons (vazio = logo padrão) |
| `agentes.cacador` | `sim` | sim/nao: ativa o Agente 1 · Caçador Multi-Fonte (Promobit + Canais Curados + Gatry) |
| `agentes.auditor` | `sim` | sim/nao: ativa o Agente 2 · Auditor de Preço & Prova Social (Zoom + Amazon) |
| `agentes.marketing` | `sim` | sim/nao: ativa o Agente 3 · Marketing, Anti-Fadiga (90 min) & Sazonalidade (Esquenta 18h45) |
| `agentes.concierge` | `sim` | sim/nao: ativa o Agente 4 · Concierge 24/7 no chat aberto/DM + expansão de sinônimos |
| `agentes.guardiao` | `sim` | sim/nao: ativa o Agente 5 · Guardião 30min, auto-atualização >=6% e limpeza de pendentes >18h |
| `admin.notificacao_piloto` | `completa` | completa/compacta: no /modo piloto, compacta elimina o card preliminar e manda 1 mensagem única com Top/Encerrar/Zap |
| `topico_chat_aberto` |  | message_thread_id opcional do tópico de Bate-papo & Pedidos liberado para o Concierge responder dúvidas |
| `whatsapp.webhook_url` |  | Opcional (Zero-Toque): URL de disparo HTTP para WhatsApp (Evolution API /message/sendText/, WAHA /api/sendText ou webhook) |
| `whatsapp.api_key` |  | Opcional: chave/token (apikey / Bearer) da API de WhatsApp configurada em whatsapp.webhook_url |
| `whatsapp.grupo_destino` |  | Opcional: JID/ID do grupo de WhatsApp para envio automático via whatsapp.webhook_url |
| `whatsapp.canal_destino` |  | Opcional: JID/ID do canal de WhatsApp para envio automático via whatsapp.webhook_url |
| `whatsapp.enviar_imagem` | `nao` | sim/nao: envia foto junto no disparo automático de WhatsApp (/message/sendMedia ou /api/sendImage) |
| `publicacao.dry_run` | `sim` | sim/nao: portão de segurança de envio (nao = publica de verdade no Telegram/WhatsApp; sim = simula sem chamar API) |
| `ritmo.max_dia` | `5` | Teto diário opcional por canal de categoria (Fase 2) |
| `ritmo.min_dia` | `3` | Mínimo diário opcional por canal de categoria (Fase 2) |
| `imagem.usar_foto_produto` | `sim` | sim/nao: usa a foto oficial do produto na arte do sidecar render (nao = ícone da categoria) |
| `render.url` | `http://render:3000` | URL interna do sidecar render 1080x1080 |
| `tunel.dominio` |  | Servidor local: domínio próprio aceito pelo workflow 90 · Túnel além de trycloudflare.com e ngrok (ex.: bot.seudominio.com.br). Vazio = só esses |
| `saude.ultimo_alerta` |  | Servidor local: gerado pelo workflow 91 · Saúde (anti-spam dos alertas). Não precisa mexer |
| `amazon.mostrar_preco` | `sim` | sim/nao: os posts da Amazon mostram o preço e o %. Com nao, dizem só "no menor preço dos últimos 90 dias" e "Veja o preço atual na Amazon" (recomendado para compliance do Amazon Associates ao ativar amazon.tag_padrao sem PA-API oficial) |
| `keepa.chave` |  | Chave da API da Keepa (plano pago). Com ela, o /oferta da Amazon aceita só o link: título, preço e ref90 vêm da Keepa. Vazio = desligado |
| `keepa.api` | `https://api.keepa.com` | Endereço da API da Keepa (não altere; usado em testes) |
| `keepa.buybox` | `nao` | sim/nao: usar o preço da Buy Box (com frete) em vez do preço da Amazon/novo. Pode custar tokens extras (VERIFICAR) |
| `afiliado.aliexpress` |  | Opcional: parâmetro/template de afiliado para AliExpress (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.boticario` |  | Opcional: parâmetro/template de afiliado para O Boticário (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.epocacosmeticos` |  | Opcional: parâmetro/template de afiliado para Época Cosméticos (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.sephora` |  | Opcional: parâmetro/template de afiliado para Sephora (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.mahogany` |  | Opcional: parâmetro/template de afiliado para Mahogany (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.creamy` |  | Opcional: parâmetro/template de afiliado para Creamy (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.ikesaki` |  | Opcional: parâmetro/template de afiliado para Ikesaki (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.drogaraia` |  | Opcional: parâmetro/template de afiliado para Droga Raia (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.drogasil` |  | Opcional: parâmetro/template de afiliado para Drogasil (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.panvel` |  | Opcional: parâmetro/template de afiliado para Panvel (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.araujo` |  | Opcional: parâmetro/template de afiliado para Drogaria Araujo (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.paguemenos` |  | Opcional: parâmetro/template de afiliado para Pague Menos (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.venancio` |  | Opcional: parâmetro/template de afiliado para Drogaria Venancio (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.oficialfarma` |  | Opcional: parâmetro/template de afiliado para Oficial Farma (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.maxtitanium` |  | Opcional: parâmetro/template de afiliado para Max Titanium (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.rihappy` |  | Opcional: parâmetro/template de afiliado para Ri Happy (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.alobebe` |  | Opcional: parâmetro/template de afiliado para Alô Bebê (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.pichau` |  | Opcional: parâmetro/template de afiliado para Pichau (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.acer` |  | Opcional: parâmetro/template de afiliado para Acer Store (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.motorola` |  | Opcional: parâmetro/template de afiliado para Motorola (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.samsung` |  | Opcional: parâmetro/template de afiliado para Samsung Shop (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.centauro` |  | Opcional: parâmetro/template de afiliado para Centauro (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.netshoes` |  | Opcional: parâmetro/template de afiliado para Netshoes (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.nike` |  | Opcional: parâmetro/template de afiliado para Nike (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.adidas` |  | Opcional: parâmetro/template de afiliado para Adidas (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.olympikus` |  | Opcional: parâmetro/template de afiliado para Olympikus (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.mizuno` |  | Opcional: parâmetro/template de afiliado para Mizuno (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.underarmour` |  | Opcional: parâmetro/template de afiliado para Under Armour (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.farmrio` |  | Opcional: parâmetro/template de afiliado para FARM Rio (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.renner` |  | Opcional: parâmetro/template de afiliado para Renner (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.cea` |  | Opcional: parâmetro/template de afiliado para C&A (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.riachuelo` |  | Opcional: parâmetro/template de afiliado para Riachuelo (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.dafiti` |  | Opcional: parâmetro/template de afiliado para Dafiti (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.zattini` |  | Opcional: parâmetro/template de afiliado para Zattini (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.hering` |  | Opcional: parâmetro/template de afiliado para Hering (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.polishop` |  | Opcional: parâmetro/template de afiliado para Polishop (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.electrolux` |  | Opcional: parâmetro/template de afiliado para Electrolux (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.brastemp` |  | Opcional: parâmetro/template de afiliado para Brastemp (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.consul` |  | Opcional: parâmetro/template de afiliado para Consul (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.magalu` |  | Opcional: parâmetro/template de afiliado para Magalu (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.umusic` |  | Opcional: parâmetro/template de afiliado para UMusic Store (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.klinestore` |  | Opcional: parâmetro/template de afiliado para K-Line Store (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.hopescolor` |  | Opcional: parâmetro/template de afiliado para Hopescolor (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.asiaticstore` |  | Opcional: parâmetro/template de afiliado para Asiatic Store (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.kpopandyoushop` |  | Opcional: parâmetro/template de afiliado para Kpop and You Shop (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.kpopalbums` |  | Opcional: parâmetro/template de afiliado para KpopAlbums (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.kpopmerch` |  | Opcional: parâmetro/template de afiliado para Kpopmerch (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.ktown4u` |  | Opcional: parâmetro/template de afiliado para Ktown4u (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.weverse` |  | Opcional: parâmetro/template de afiliado para Weverse Shop (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.cokodive` |  | Opcional: parâmetro/template de afiliado para Cokodive (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.daebak` |  | Opcional: parâmetro/template de afiliado para Daebak (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.cdjapan` |  | Opcional: parâmetro/template de afiliado para CDJapan (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.yesasia` |  | Opcional: parâmetro/template de afiliado para YesAsia (ex.: utm_source=meu_id ou URL com {url}) |
| `afiliado.kpop1004` |  | Opcional: parâmetro/template de afiliado para KPOP1004 (ex.: utm_source=meu_id ou URL com {url}) |
| `categoria_nome.top` |  | Nome exibido para Top do Dia (ex.: Top Ofertas & Bugs) |
| `topico.top` |  | message_thread_id do tópico Top do Dia (preenchido pelo setup) |
| `canal.top` |  | Canal só de Top do Dia (@usuario do canal ou ID -100…). Configure rápido via /canais |
| `canal_link.top` |  | Link de entrada do canal Top do Dia (automático se público @usuario; informe se for privado) |
| `canal_logo.top` |  | Logo do canal Top do Dia (URL https:// ou file_id via comando /logo) |
| `canal_desc.top` |  | Descrição curta usada na divulgação cruzada (/divulgar) do canal Top do Dia |
| `whatsapp.grupo.top` |  | Opcional: JID do grupo de WhatsApp específico de Top do Dia |
| `categoria_nome.casa` |  | Nome exibido para Casa & Eletro (ex.: Casa & Eletro) |
| `topico.casa` |  | message_thread_id do tópico Casa & Eletro (preenchido pelo setup) |
| `canal.casa` |  | Canal só de Casa & Eletro (@usuario do canal ou ID -100…). Configure rápido via /canais |
| `canal_link.casa` |  | Link de entrada do canal Casa & Eletro (automático se público @usuario; informe se for privado) |
| `canal_logo.casa` |  | Logo do canal Casa & Eletro (URL https:// ou file_id via comando /logo) |
| `canal_desc.casa` |  | Descrição curta usada na divulgação cruzada (/divulgar) do canal Casa & Eletro |
| `whatsapp.grupo.casa` |  | Opcional: JID do grupo de WhatsApp específico de Casa & Eletro |
| `categoria_nome.moda` |  | Nome exibido para Moda, Roupas & Tênis (ex.: Moda, Roupas & Tênis) |
| `topico.moda` |  | message_thread_id do tópico Moda, Roupas & Tênis (preenchido pelo setup) |
| `canal.moda` |  | Canal só de Moda, Roupas & Tênis (@usuario do canal ou ID -100…). Configure rápido via /canais |
| `canal_link.moda` |  | Link de entrada do canal Moda, Roupas & Tênis (automático se público @usuario; informe se for privado) |
| `canal_logo.moda` |  | Logo do canal Moda, Roupas & Tênis (URL https:// ou file_id via comando /logo) |
| `canal_desc.moda` |  | Descrição curta usada na divulgação cruzada (/divulgar) do canal Moda, Roupas & Tênis |
| `whatsapp.grupo.moda` |  | Opcional: JID do grupo de WhatsApp específico de Moda, Roupas & Tênis |
| `categoria_nome.beleza` |  | Nome exibido para Beleza & Skincare (ex.: Beleza & Skincare) |
| `topico.beleza` |  | message_thread_id do tópico Beleza & Skincare (preenchido pelo setup) |
| `canal.beleza` |  | Canal só de Beleza & Skincare (@usuario do canal ou ID -100…). Configure rápido via /canais |
| `canal_link.beleza` |  | Link de entrada do canal Beleza & Skincare (automático se público @usuario; informe se for privado) |
| `canal_logo.beleza` |  | Logo do canal Beleza & Skincare (URL https:// ou file_id via comando /logo) |
| `canal_desc.beleza` |  | Descrição curta usada na divulgação cruzada (/divulgar) do canal Beleza & Skincare |
| `whatsapp.grupo.beleza` |  | Opcional: JID do grupo de WhatsApp específico de Beleza & Skincare |
| `categoria_nome.perfumes` |  | Nome exibido para Perfumes & Fragrâncias (ex.: Perfumes & Fragrâncias) |
| `topico.perfumes` |  | message_thread_id do tópico Perfumes & Fragrâncias (preenchido pelo setup) |
| `canal.perfumes` |  | Canal só de Perfumes & Fragrâncias (@usuario do canal ou ID -100…). Configure rápido via /canais |
| `canal_link.perfumes` |  | Link de entrada do canal Perfumes & Fragrâncias (automático se público @usuario; informe se for privado) |
| `canal_logo.perfumes` |  | Logo do canal Perfumes & Fragrâncias (URL https:// ou file_id via comando /logo) |
| `canal_desc.perfumes` |  | Descrição curta usada na divulgação cruzada (/divulgar) do canal Perfumes & Fragrâncias |
| `whatsapp.grupo.perfumes` |  | Opcional: JID do grupo de WhatsApp específico de Perfumes & Fragrâncias |
| `categoria_nome.saude` |  | Nome exibido para Saúde, Suplementos & Farmácia (ex.: Saúde, Suplementos & Farmácia) |
| `topico.saude` |  | message_thread_id do tópico Saúde, Suplementos & Farmácia (preenchido pelo setup) |
| `canal.saude` |  | Canal só de Saúde, Suplementos & Farmácia (@usuario do canal ou ID -100…). Configure rápido via /canais |
| `canal_link.saude` |  | Link de entrada do canal Saúde, Suplementos & Farmácia (automático se público @usuario; informe se for privado) |
| `canal_logo.saude` |  | Logo do canal Saúde, Suplementos & Farmácia (URL https:// ou file_id via comando /logo) |
| `canal_desc.saude` |  | Descrição curta usada na divulgação cruzada (/divulgar) do canal Saúde, Suplementos & Farmácia |
| `whatsapp.grupo.saude` |  | Opcional: JID do grupo de WhatsApp específico de Saúde, Suplementos & Farmácia |
| `categoria_nome.bebe` |  | Nome exibido para Bebê & Família (ex.: Bebê & Família) |
| `topico.bebe` |  | message_thread_id do tópico Bebê & Família (preenchido pelo setup) |
| `canal.bebe` |  | Canal só de Bebê & Família (@usuario do canal ou ID -100…). Configure rápido via /canais |
| `canal_link.bebe` |  | Link de entrada do canal Bebê & Família (automático se público @usuario; informe se for privado) |
| `canal_logo.bebe` |  | Logo do canal Bebê & Família (URL https:// ou file_id via comando /logo) |
| `canal_desc.bebe` |  | Descrição curta usada na divulgação cruzada (/divulgar) do canal Bebê & Família |
| `whatsapp.grupo.bebe` |  | Opcional: JID do grupo de WhatsApp específico de Bebê & Família |
| `categoria_nome.tech` |  | Nome exibido para Tech & Games (ex.: Tech & Games) |
| `topico.tech` |  | message_thread_id do tópico Tech & Games (preenchido pelo setup) |
| `canal.tech` |  | Canal só de Tech & Games (@usuario do canal ou ID -100…). Configure rápido via /canais |
| `canal_link.tech` |  | Link de entrada do canal Tech & Games (automático se público @usuario; informe se for privado) |
| `canal_logo.tech` |  | Logo do canal Tech & Games (URL https:// ou file_id via comando /logo) |
| `canal_desc.tech` |  | Descrição curta usada na divulgação cruzada (/divulgar) do canal Tech & Games |
| `whatsapp.grupo.tech` |  | Opcional: JID do grupo de WhatsApp específico de Tech & Games |
| `categoria_nome.kpop` |  | Nome exibido para K-Pop & Álbuns Oficiais (ex.: K-Pop & Álbuns Oficiais) |
| `topico.kpop` |  | message_thread_id do tópico K-Pop & Álbuns Oficiais (preenchido pelo setup) |
| `canal.kpop` |  | Canal só de K-Pop & Álbuns Oficiais (@usuario do canal ou ID -100…). Configure rápido via /canais |
| `canal_link.kpop` |  | Link de entrada do canal K-Pop & Álbuns Oficiais (automático se público @usuario; informe se for privado) |
| `canal_logo.kpop` |  | Logo do canal K-Pop & Álbuns Oficiais (URL https:// ou file_id via comando /logo) |
| `canal_desc.kpop` |  | Descrição curta usada na divulgação cruzada (/divulgar) do canal K-Pop & Álbuns Oficiais |
| `whatsapp.grupo.kpop` |  | Opcional: JID do grupo de WhatsApp específico de K-Pop & Álbuns Oficiais |
| `shopee.busca.casa` | `air fryer; robo aspirador; cafeteira; ventilador; liquidificador; lava loucas` | Palavras-chave da coleta Shopee para Casa & Eletro (separe com ;) |
| `shopee.busca.moda` | `tenis nike; tenis adidas; conjunto shein; vestido feminino; jaqueta puffer; camiseta oversized; calca cargo; legging academia` | Palavras-chave da coleta Shopee para Moda, Roupas & Tênis (separe com ;) |
| `shopee.busca.beleza` | `protetor solar; serum principia; cerave; la roche posay; wella; mascara capilar; secador de cabelo; maquiagem` | Palavras-chave da coleta Shopee para Beleza & Skincare (separe com ;) |
| `shopee.busca.perfumes` | `perfume arabe; lattafa asad; fakhar black; khamrah; yara; club de nuit; sabah al ward; sauvage; 212 vip; le male; good girl; malbec` | Palavras-chave da coleta Shopee para Perfumes & Fragrâncias (separe com ;) |
| `shopee.busca.saude` | `creatina; whey protein; omega 3; multivitaminico; colageno verisol; escova eletrica oral b; irrigador oral` | Palavras-chave da coleta Shopee para Saúde, Suplementos & Farmácia (separe com ;) |
| `shopee.busca.bebe` | `fralda pampers; fralda huggies; lenco umedecido; formula infantil; brinquedo educativo` | Palavras-chave da coleta Shopee para Bebê & Família (separe com ;) |
| `shopee.busca.tech` | `ps5; xbox series; placa de video; ssd nvme; headset gamer; fone bluetooth; smartwatch; monitor gamer` | Palavras-chave da coleta Shopee para Tech & Games (separe com ;) |
| `shopee.busca.kpop` | `album kpop oficial; lightstick kpop oficial; photocard kpop oficial; fichario photocard kpop; toploader sleeves photocard; bt21 oficial; skzoo pelucia kpop; funko pop bts blackpink; chaveiro kpop oficial; bts album; stray kids album; blackpink album; twice album; txt album; enhypen album; seventeen album; aespa album; newjeans album; ive album; ateez album; le sserafim album; nct album; exo album; moletom kpop; revista dicon kpop` | Palavras-chave da coleta Shopee para K-Pop & Álbuns Oficiais (separe com ;) |
| `amazon.tag.casa_tg` |  | Tag da Amazon para Casa & Eletro no tg |
| `amazon.tag.casa_wac` |  | Tag da Amazon para Casa & Eletro no wac |
| `amazon.tag.casa_wag` |  | Tag da Amazon para Casa & Eletro no wag |
| `amazon.tag.casa_x` |  | Tag da Amazon para Casa & Eletro no x |
| `amazon.tag.moda_tg` |  | Tag da Amazon para Moda, Roupas & Tênis no tg |
| `amazon.tag.moda_wac` |  | Tag da Amazon para Moda, Roupas & Tênis no wac |
| `amazon.tag.moda_wag` |  | Tag da Amazon para Moda, Roupas & Tênis no wag |
| `amazon.tag.moda_x` |  | Tag da Amazon para Moda, Roupas & Tênis no x |
| `amazon.tag.beleza_tg` |  | Tag da Amazon para Beleza & Skincare no tg |
| `amazon.tag.beleza_wac` |  | Tag da Amazon para Beleza & Skincare no wac |
| `amazon.tag.beleza_wag` |  | Tag da Amazon para Beleza & Skincare no wag |
| `amazon.tag.beleza_x` |  | Tag da Amazon para Beleza & Skincare no x |
| `amazon.tag.perfumes_tg` |  | Tag da Amazon para Perfumes & Fragrâncias no tg |
| `amazon.tag.perfumes_wac` |  | Tag da Amazon para Perfumes & Fragrâncias no wac |
| `amazon.tag.perfumes_wag` |  | Tag da Amazon para Perfumes & Fragrâncias no wag |
| `amazon.tag.perfumes_x` |  | Tag da Amazon para Perfumes & Fragrâncias no x |
| `amazon.tag.saude_tg` |  | Tag da Amazon para Saúde, Suplementos & Farmácia no tg |
| `amazon.tag.saude_wac` |  | Tag da Amazon para Saúde, Suplementos & Farmácia no wac |
| `amazon.tag.saude_wag` |  | Tag da Amazon para Saúde, Suplementos & Farmácia no wag |
| `amazon.tag.saude_x` |  | Tag da Amazon para Saúde, Suplementos & Farmácia no x |
| `amazon.tag.bebe_tg` |  | Tag da Amazon para Bebê & Família no tg |
| `amazon.tag.bebe_wac` |  | Tag da Amazon para Bebê & Família no wac |
| `amazon.tag.bebe_wag` |  | Tag da Amazon para Bebê & Família no wag |
| `amazon.tag.bebe_x` |  | Tag da Amazon para Bebê & Família no x |
| `amazon.tag.tech_tg` |  | Tag da Amazon para Tech & Games no tg |
| `amazon.tag.tech_wac` |  | Tag da Amazon para Tech & Games no wac |
| `amazon.tag.tech_wag` |  | Tag da Amazon para Tech & Games no wag |
| `amazon.tag.tech_x` |  | Tag da Amazon para Tech & Games no x |
| `amazon.tag.kpop_tg` |  | Tag da Amazon para K-Pop & Álbuns Oficiais no tg |
| `amazon.tag.kpop_wac` |  | Tag da Amazon para K-Pop & Álbuns Oficiais no wac |
| `amazon.tag.kpop_wag` |  | Tag da Amazon para K-Pop & Álbuns Oficiais no wag |
| `amazon.tag.kpop_x` |  | Tag da Amazon para K-Pop & Álbuns Oficiais no x |
