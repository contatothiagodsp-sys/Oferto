'use strict';
// Configuração: padrões no código + valores da Data Table `config` (chave/valor),
// que você edita no painel do n8n. O workflow 00-setup cria as linhas que faltam.

const { PROGRAMAS_AFILIADO, nomeLoja } = require('./lojas');
const { temAfiliadoAtivo } = require('./links');

const PLATAFORMAS = ['tg', 'wac', 'wag', 'x'];

const CATEGORIAS = {
  top: { nome: 'Top do Dia', emoji: '🔥' },
  casa: { nome: 'Casa & Eletro', emoji: '🏠' },
  moda: { nome: 'Moda, Roupas & Tênis', emoji: '👗' },
  beleza: { nome: 'Beleza & Skincare', emoji: '💄' },
  perfumes: { nome: 'Perfumes & Fragrâncias', emoji: '✨' },
  saude: { nome: 'Saúde, Suplementos & Farmácia', emoji: '💊' },
  bebe: { nome: 'Bebê & Família', emoji: '👶' },
  tech: { nome: 'Tech & Games', emoji: '💻' },
};

const CANAIS_SUGERIDOS = {
  top: { nome: 'Ofertô VIP · Top Ofertas & Bugs', categoria_nome: 'Top Ofertas & Bugs', desc: 'Só os maiores tombos de preço, bugs relâmpago e cupons fortes do dia.' },
  tech: { nome: 'Ofertô Tech & Games', categoria_nome: 'Tech & Games', desc: 'PC Gamer (KaBuM!, Terabyte, Pichau), PS5, Xbox, Smartphones e Áudio.' },
  moda: { nome: 'Ofertô Moda, Roupas & Tênis', categoria_nome: 'Moda, Roupas & Tênis', desc: 'Achados Shein, Shopee e ML, tênis em alta, cupons relâmpago e lojas oficiais (Nike, Adidas, Centauro, Renner, C&A).' },
  beleza: { nome: 'Ofertô Beleza & Skincare', categoria_nome: 'Beleza & Skincare', desc: 'Skincare (Principia, CeraVe, La Roche), Maquiagem e Cabelos com preço real conferido.' },
  perfumes: { nome: 'Ofertô Perfumes · Árabes, Importados & Nicho', categoria_nome: 'Perfumes & Fragrâncias', desc: 'Perfumes Árabes no Mercado Livre (Lattafa, Asad, Khamrah, Yara), Nicho, Importados, Boticário e Natura.' },
  saude: { nome: 'Ofertô Saúde, Suplementos & Farmácia', categoria_nome: 'Saúde, Suplementos & Farmácia', desc: 'Creatina, Whey (Growth, Dux, Max), Vitaminas, Oral-B e Farmácias Confiáveis.' },
  casa: { nome: 'Ofertô Casa & Eletro', categoria_nome: 'Casa & Eletro', desc: 'Air Fryer, Robô Aspirador, Cafeteiras e Casa Inteligente com histórico real.' },
  bebe: { nome: 'Ofertô Bebê & Família', categoria_nome: 'Bebê & Família', desc: 'Fraldas por tira, Lenços, Fórmulas Infantis e Brinquedos.' },
};

const BUSCAS_PADRAO = {
  casa: 'air fryer; robo aspirador; cafeteira; ventilador; liquidificador; lava loucas',
  moda: 'tenis nike; tenis adidas; conjunto shein; vestido feminino; jaqueta puffer; camiseta oversized; calca cargo; legging academia',
  beleza: 'protetor solar; serum principia; cerave; la roche posay; wella; mascara capilar; secador de cabelo; maquiagem',
  perfumes: 'perfume arabe; lattafa asad; fakhar black; khamrah; yara; club de nuit; sabah al ward; sauvage; 212 vip; le male; good girl; malbec',
  saude: 'creatina; whey protein; omega 3; multivitaminico; colageno verisol; escova eletrica oral b; irrigador oral',
  bebe: 'fralda pampers; fralda huggies; lenco umedecido; formula infantil; brinquedo educativo',
  tech: 'ps5; xbox series; placa de video; ssd nvme; headset gamer; fone bluetooth; smartwatch; monitor gamer',
};

const TODAS_LOJAS_RADAR = [
  'amazon', 'ml', 'shopee', 'shein', 'tiktok', 'kabum', 'terabyte', 'pichau',
  'drogaraia', 'drogasil', 'pacheco', 'panvel', 'araujo',
  'belezanaweb', 'epocacosmeticos', 'boticario', 'natura', 'sephora',
  'centauro', 'netshoes', 'nike', 'adidas', 'renner', 'cea', 'riachuelo', 'dafiti', 'zattini', 'hering',
];

const LOJAS_ACEITAS = TODAS_LOJAS_RADAR.concat(['paguemenos']);

/** Esquema da tabela `config`: chave, tipo, padrão e descrição (vira a linha-modelo). */
function esquema() {
  const s = [
    { chave: 'marca', tipo: 'texto', padrao: 'Ofertô', desc: 'Nome da marca (aparece nos textos e no relatório)' },
    { chave: 'admins', tipo: 'lista_num', padrao: '', desc: 'IDs do Telegram de quem aprova (separados por vírgula). Descubra mandando /id ao bot de aprovação' },
    { chave: 'bot_token', tipo: 'segredo', padrao: '', desc: 'Token do BOT DE APROVAÇÃO (@BotFather). Conversa privada com os admins' },
    { chave: 'bot_token_grupo', tipo: 'segredo', padrao: '', desc: 'Token do BOT PUBLICADOR (admin do supergrupo/canais). Vazio = usa o bot de aprovação' },
    { chave: 'grupo_id', tipo: 'texto', padrao: '', desc: 'ID do supergrupo (-100…). Vazio ou "nenhum" = publica só nos canais por categoria' },
    { chave: 'grupo_link', tipo: 'texto', padrao: '', desc: 'Link público do grupo (opcional, usado em respostas)' },
    { chave: 'n8n_webhook_url', tipo: 'texto', padrao: '', desc: 'Production URL do nó Webhook do workflow 01 (copie do n8n)' },
    { chave: 'webhook_secret', tipo: 'segredo', padrao: '', desc: 'Gerado pelo setup. Não precisa mexer' },
    { chave: 'bot_grupo_username', tipo: 'texto', padrao: '', desc: 'Gerado pelo setup: @ do bot publicador (usado nos links de divulgação do /links). Não precisa mexer' },
    { chave: 'hash_sal', tipo: 'segredo', padrao: '', desc: 'Gerado pelo setup: sal do hash de quem entra/sai do grupo. Não mude (os hashes antigos deixam de bater)' },
    { chave: 'grupo.textos', tipo: 'texto', padrao: 'pendente', desc: 'pendente = o setup arruma o grupo uma vez (descrição, 📌 Regras & Segurança oculto, textos fixados e tópicos abertos para comentários nas ofertas) · atualizar = reescreve os textos já fixados, sem mandar mensagem nova · limpar = apaga TODAS as mensagens do grupo (inclusive de membros) e arruma de novo; leva ~4 min · ok = não mexe' },
    { chave: 'grupo.mensagens', tipo: 'texto', padrao: '', desc: 'Gerado pelo setup: IDs das mensagens fixadas (usado pelo modo atualizar). Não precisa mexer' },
    { chave: 'grupo.limpar_avisos', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: o bot publicador apaga os avisos automáticos do grupo (entrou, saiu, fixou, fechou tópico, mudou nome/foto). Precisa da permissão Apagar mensagens. Com o bot admin, cada mensagem do grupo vira 1 execução do n8n' },
    { chave: 'grupo.antispam', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: com grupo.limpar_avisos ligado, o bot publicador apaga mensagens de membros com link de outro grupo, WhatsApp ou encurtador (links de loja viram sugestão para os admins)' },
    { chave: 'grupo.fechar_topicos_oferta', tipo: 'texto', padrao: 'nao', desc: 'sim/nao: fecha os tópicos de ofertas para membros comuns no supergrupo (altere rápido com /topicos fechar ou /topicos abrir)' },
    { chave: 'rastrear_entradas', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: grava entradas e saídas por link de convite (1 execução do n8n por evento)' },
    { chave: 'campanha_prefixo', tipo: 'texto', padrao: 'bf26', desc: 'Prefixo dos sub-IDs' },
    { chave: 'fuso', tipo: 'texto', padrao: 'America/Sao_Paulo', desc: 'Fuso horário dos textos' },
    { chave: 'auto.link_direto', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: no privado, basta colar ou encaminhar o link do produto que o bot extrai título, preço, imagem e categoria sem exigir /oferta' },
    { chave: 'auto.publicar_direto', tipo: 'texto', padrao: 'nao', desc: 'sim/nao: publica direto no grupo/canais do Telegram e já entrega o texto do WhatsApp sem precisar clicar em Aprovar (ative rápido com /modo rapido)' },
    { chave: 'auto.categoria_padrao', tipo: 'texto', padrao: 'casa', desc: 'Categoria usada quando o bot não identifica pelas palavras do produto (casa, moda, beleza, perfumes, saude, bebe, tech)' },
    { chave: 'copy.chamativa', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: gera ganchos persuasivos, comparação De/Por e economia em R$ nos textos de Telegram e WhatsApp para atrair cliques' },
    { chave: 'publicar.plataformas', tipo: 'texto', padrao: 'wag,wac,x', desc: 'Quais textos prontos enviar ao aprovar: wag (Grupo WhatsApp), wac (Canal WhatsApp), x (X/Twitter). Use só wag para focar em Telegram + Grupo WhatsApp' },
    { chave: 'divulgar.auto_diario', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: divulga automaticamente 1x ao dia (22h05) o hub dos seus canais para estimular entradas cruzadas' },
    { chave: 'canais.auto_vincular', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: ao adicionar o bot publicador como admin num canal novo, identifica a categoria pelo nome, liga o canal, cria convite, coloca bio e fixa boas-vindas sozinho' },
    { chave: 'alertas.ativo', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: permite aos membros cadastrar alertas pessoais (/alerta ps5) no bot publicador e receber DM automática com seu link de afiliado' },
    { chave: 'alertas.max_por_membro', tipo: 'numero', padrao: '10', desc: 'Quantidade máxima de alertas ativos por membro' },
    { chave: 'post.botoes_extras', tipo: 'texto', padrao: 'nao', desc: 'sim/nao: adiciona botões [🔔 Criar alerta] e [📲 Mandar no Zap] embaixo dos posts do Telegram' },
    { chave: 'guardiao.ativo', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: verifica a cada 2h se ofertas publicadas esgotaram ou subiram forte de preço e encerra o post automaticamente' },
    { chave: 'vitrine.auto_noite', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: às 21h15 publica o resumão Top 5 Ofertas Ainda Ativas do Dia (também disponível com /resumao)' },
    { chave: 'vitrine.ultimo_dia', tipo: 'texto', padrao: '', desc: 'Gerado automaticamente pelo guardião para não repetir a vitrine noturna no mesmo dia' },
    { chave: 'selo.tolerancia_pct', tipo: 'numero', padrao: '0', desc: 'Tolerância do selo em % acima do menor preço de 90 dias (recomendado: 0)' },
    { chave: 'selo.exigir_ref90', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: exigir referência de 90 dias no /oferta e na coleta Shopee (links colados direto já liberam aprovação sem ref90 quando não estão acima do histórico)' },
    { chave: 'shopee.app_id', tipo: 'texto', padrao: '', desc: 'App ID da Shopee Affiliate Open API' },
    { chave: 'shopee.secret', tipo: 'segredo', padrao: '', desc: 'Secret da Shopee Affiliate Open API' },
    { chave: 'shopee.endpoint', tipo: 'texto', padrao: 'https://open-api.affiliate.shopee.com.br/graphql', desc: 'Endpoint GraphQL (VERIFICAR no painel)' },
    { chave: 'shopee.min_desconto_pct', tipo: 'numero', padrao: '20', desc: 'Desconto mínimo anunciado pela loja para virar candidata' },
    { chave: 'shopee.min_comissao_pct', tipo: 'numero', padrao: '3', desc: 'Comissão mínima (%)' },
    { chave: 'shopee.min_vendas', tipo: 'numero', padrao: '50', desc: 'Vendas mínimas do produto' },
    { chave: 'shopee.max_cards', tipo: 'numero', padrao: '8', desc: 'Máximo de cards de aprovação por coleta' },
    { chave: 'shopee.enviar_sem_ref', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: enviar candidatas sem referência de 90 dias (para você informar o ref90)' },
    { chave: 'telegram_api', tipo: 'texto', padrao: 'https://api.telegram.org', desc: 'Endereço da Bot API (não altere; usado em testes)' },
    { chave: 'link_curto_api', tipo: 'texto', padrao: '', desc: 'Deixe vazio (usado só em testes para abrir links curtos a.co/amzn.to)' },
    { chave: 'pagina_api', tipo: 'texto', padrao: '', desc: 'Deixe vazio (usado só em testes para ler o HTML da página do produto)' },
    { chave: 'amazon.tag_padrao', tipo: 'texto', padrao: '', desc: 'Tag única da Amazon usada quando não há tag específica por categoria/plataforma (ex.: suatag-20)' },
    { chave: 'shein.afiliado_id', tipo: 'texto', padrao: '', desc: 'Código ou parâmetro de afiliado da Shein (ex.: 123456 ou url_from=adhub…). Vazio = link direto ou link curto colado' },
    { chave: 'ml.etiqueta', tipo: 'texto', padrao: '', desc: 'Opcional: matt_word:matt_tool de afiliado do Mercado Livre (ou cole links mercadolivre.com/sec/…)' },
    { chave: 'awin.afiliado_id', tipo: 'texto', padrao: '', desc: 'Opcional: seu Publisher ID da Awin (monetiza automaticamente KaBuM! mid 17729)' },
    { chave: 'terabyte.afiliado_id', tipo: 'texto', padrao: '', desc: 'Opcional: seu código de parceiro da TerabyteShop (?p=...)' },
    { chave: 'rakuten.id', tipo: 'texto', padrao: '', desc: 'Opcional: seu ID criptografado Rakuten Advertising (monetiza Pacheco, Beleza na Web, Natura)' },
    { chave: 'natura.consultoria', tipo: 'texto', padrao: '', desc: 'Opcional: código do seu Espaço Digital Natura (?consultoria=...)' },
    { chave: 'radar.ativo', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: ativa o Radar Multi-Fonte automático a cada 2 min sem custo extra (workflow 04)' },
    { chave: 'radar.publicar_direto', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: publica as promoções do radar automaticamente no Telegram e entrega o botão WhatsApp (desative com /modo aprovar)' },
    { chave: 'radar.auto_top', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: manda automaticamente promoções muito fortes (>=40% OFF ou >=30% + cupom) para o Top do Dia (até 5/dia)' },
    { chave: 'radar.lojas', tipo: 'texto', padrao: TODAS_LOJAS_RADAR.join(','), desc: 'Lojas monitoradas pelo radar automático (Amazon, ML, Shopee, Shein, TikTok, KaBuM!, Terabyte, Pichau, farmácias, beleza e moda)' },
    { chave: 'radar.categorias', tipo: 'texto', padrao: 'moda,beleza,perfumes,saude,casa,tech,bebe', desc: 'Categorias monitoradas pelo radar (moda, beleza, perfumes, saude, casa, tech, bebe)' },
    { chave: 'radar.palavras', tipo: 'texto', padrao: '', desc: 'Filtro opcional de palavras no radar separadas por ; (vazio = aceita todas as boas ofertas das lojas/categorias; ajuste com /buscas)' },
    { chave: 'radar.min_desconto_pct', tipo: 'numero', padrao: '15', desc: 'Desconto mínimo (%) para entrar no radar (ofertas com cupom ou destaque da comunidade também entram)' },
    { chave: 'radar.preco_min', tipo: 'numero', padrao: '15', desc: 'Preço mínimo em R$ no radar (ignora banners de R$ 0,01 e itens isca)' },
    { chave: 'radar.max_por_ciclo', tipo: 'numero', padrao: '4', desc: 'Máximo base de promoções publicadas por rodada de 2 min do radar (nos picos de oferta escala até 8 com cadencia_dinamica)' },
    { chave: 'radar.cadencia_dinamica', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: ajusta o volume do radar conforme o horário (até 6–8 ofertas nos picos 11h–14h e 18h–23h quando há promoções fortes, e até 2 na madrugada)' },
    { chave: 'radar.canais_telegram', tipo: 'texto', padrao: '', desc: 'Opcional: @canais públicos de ofertas no Telegram (separados por ;) para o radar garimpar via t.me/s/ e trocar pelo seu afiliado' },
    { chave: 'radar.canais_curados', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: inclui fontes públicas curadas gratuitas (@canaltechofertas, @xetdaspromocoes, Gatry) no radar agendado, trocando pelo seu afiliado' },
    { chave: 'radar.api_url', tipo: 'texto', padrao: '', desc: 'Deixe vazio (usado só em testes para simular fontes do radar)' },
    { chave: 'mercado.checar', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: compara automaticamente o preço em buscadores públicos (Zoom e busca Amazon) antes de publicar e bloqueia falsos descontos ou ofertas mais caras que a concorrência' },
    { chave: 'cupons.radar_auto', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: publica alertas automáticos de cupons gerais e lotes de horário das lojas (ex.: 19h Mercado Livre, Shopee, Shein, Amazon)' },
    { chave: 'cupons.esquenta_19h', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: às 18h45 publica um lembrete automático de Esquenta para resgatar cupons das 19h antes de acabarem' },
    { chave: 'cupons.ultimo_esquenta', tipo: 'texto', padrao: '', desc: 'Gerado automaticamente para não repetir o alerta de esquenta das 18h45 no mesmo dia' },
    { chave: 'cupons.link_ml', tipo: 'texto', padrao: '', desc: 'Seu link de afiliado (/sec/) para a Aba de Cupons do Mercado Livre (vazio = etiqueta ou link direto /cupons)' },
    { chave: 'cupons.link_amazon', tipo: 'texto', padrao: '', desc: 'Seu link de afiliado para a Central de Cupons da Amazon (vazio = usa tag_padrao)' },
    { chave: 'cupons.link_shopee', tipo: 'texto', padrao: '', desc: 'Seu link de afiliado para a Aba de Cupons da Shopee (vazio = gera via Shopee API)' },
    { chave: 'cupons.link_shein', tipo: 'texto', padrao: '', desc: 'Seu link de afiliado para a Aba de Cupons da Shein' },
    { chave: 'cupons.logo_ml', tipo: 'texto', padrao: '', desc: 'URL da logo oficial do Mercado Livre usada nos alertas de cupons (vazio = logo padrão)' },
    { chave: 'cupons.logo_amazon', tipo: 'texto', padrao: '', desc: 'URL da logo oficial da Amazon usada nos alertas de cupons (vazio = logo padrão)' },
    { chave: 'cupons.logo_shopee', tipo: 'texto', padrao: '', desc: 'URL da logo oficial da Shopee usada nos alertas de cupons (vazio = logo padrão)' },
    { chave: 'cupons.logo_shein', tipo: 'texto', padrao: '', desc: 'URL da logo oficial da Shein usada nos alertas de cupons (vazio = logo padrão)' },
    { chave: 'agentes.cacador', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: ativa o Agente 1 · Caçador Multi-Fonte (Promobit + Canais Curados + Gatry)' },
    { chave: 'agentes.auditor', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: ativa o Agente 2 · Auditor de Preço & Prova Social (Zoom + Amazon)' },
    { chave: 'agentes.marketing', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: ativa o Agente 3 · Marketing, Anti-Fadiga (90 min) & Sazonalidade (Esquenta 18h45)' },
    { chave: 'agentes.concierge', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: ativa o Agente 4 · Concierge 24/7 no chat aberto/DM + expansão de sinônimos' },
    { chave: 'agentes.guardiao', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: ativa o Agente 5 · Guardião 30min, auto-atualização >=6% e limpeza de pendentes >18h' },
    { chave: 'admin.notificacao_piloto', tipo: 'texto', padrao: 'completa', desc: 'completa/compacta: no /modo piloto, compacta elimina o card preliminar e manda 1 mensagem única com Top/Encerrar/Zap' },
    { chave: 'topico_chat_aberto', tipo: 'numero', padrao: '', desc: 'message_thread_id opcional do tópico de Bate-papo & Pedidos liberado para o Concierge responder dúvidas' },
    { chave: 'whatsapp.webhook_url', tipo: 'texto', padrao: '', desc: 'Opcional (Zero-Toque): URL de disparo HTTP para WhatsApp (Evolution API /message/sendText/, WAHA /api/sendText ou webhook)' },
    { chave: 'whatsapp.api_key', tipo: 'segredo', padrao: '', desc: 'Opcional: chave/token (apikey / Bearer) da API de WhatsApp configurada em whatsapp.webhook_url' },
    { chave: 'whatsapp.grupo_destino', tipo: 'texto', padrao: '', desc: 'Opcional: JID/ID do grupo de WhatsApp para envio automático via whatsapp.webhook_url' },
    { chave: 'whatsapp.canal_destino', tipo: 'texto', padrao: '', desc: 'Opcional: JID/ID do canal de WhatsApp para envio automático via whatsapp.webhook_url' },
    { chave: 'tunel.dominio', tipo: 'texto', padrao: '', desc: 'Servidor local: domínio próprio aceito pelo workflow 90 · Túnel além de trycloudflare.com e ngrok (ex.: bot.seudominio.com.br). Vazio = só esses' },
    { chave: 'saude.ultimo_alerta', tipo: 'texto', padrao: '', desc: 'Servidor local: gerado pelo workflow 91 · Saúde (anti-spam dos alertas). Não precisa mexer' },
    { chave: 'amazon.mostrar_preco', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: os posts da Amazon mostram o preço e o %. Com nao, dizem só "no menor preço dos últimos 90 dias" e "Veja o preço atual na Amazon" (use se os termos exigirem preço vindo da API oficial)' },
    { chave: 'keepa.chave', tipo: 'segredo', padrao: '', desc: 'Chave da API da Keepa (plano pago). Com ela, o /oferta da Amazon aceita só o link: título, preço e ref90 vêm da Keepa. Vazio = desligado' },
    { chave: 'keepa.api', tipo: 'texto', padrao: 'https://api.keepa.com', desc: 'Endereço da API da Keepa (não altere; usado em testes)' },
    { chave: 'keepa.buybox', tipo: 'texto', padrao: 'nao', desc: 'sim/nao: usar o preço da Buy Box (com frete) em vez do preço da Amazon/novo. Pode custar tokens extras (VERIFICAR)' },
  ];
  for (const l of ['boticario', 'epocacosmeticos', 'sephora', 'drogaraia', 'drogasil', 'pichau', 'centauro', 'netshoes', 'nike', 'adidas', 'renner', 'cea', 'riachuelo', 'dafiti', 'zattini', 'hering']) {
    s.push({ chave: `afiliado.${l}`, tipo: 'texto', padrao: '', desc: `Opcional: parâmetro/template de afiliado para ${nomeLoja(l)} (ex.: utm_source=meu_id ou URL com {url})` });
  }
  for (const c of Object.keys(CATEGORIAS)) {
    s.push({ chave: `categoria_nome.${c}`, tipo: 'texto', padrao: '', desc: `Nome exibido para ${CATEGORIAS[c].nome} (ex.: ${(CANAIS_SUGERIDOS[c] && CANAIS_SUGERIDOS[c].categoria_nome) || CATEGORIAS[c].nome})` });
    s.push({ chave: `topico.${c}`, tipo: 'numero', padrao: '', desc: `message_thread_id do tópico ${CATEGORIAS[c].nome} (preenchido pelo setup)` });
    s.push({ chave: `canal.${c}`, tipo: 'texto', padrao: '', desc: `Canal só de ${CATEGORIAS[c].nome} (@usuario do canal ou ID -100…). Configure rápido via /canais` });
    s.push({ chave: `canal_link.${c}`, tipo: 'texto', padrao: '', desc: `Link de entrada do canal ${CATEGORIAS[c].nome} (automático se público @usuario; informe se for privado)` });
    s.push({ chave: `canal_logo.${c}`, tipo: 'texto', padrao: '', desc: `Logo do canal ${CATEGORIAS[c].nome} (URL https:// ou file_id via comando /logo)` });
    s.push({ chave: `canal_desc.${c}`, tipo: 'texto', padrao: '', desc: `Descrição curta usada na divulgação cruzada (/divulgar) do canal ${CATEGORIAS[c].nome}` });
  }
  for (const c of Object.keys(BUSCAS_PADRAO)) {
    s.push({ chave: `shopee.busca.${c}`, tipo: 'lista_txt', padrao: BUSCAS_PADRAO[c], desc: `Palavras-chave da coleta Shopee para ${CATEGORIAS[c].nome} (separe com ;)` });
  }
  for (const c of Object.keys(CATEGORIAS).filter((k) => k !== 'top')) {
    for (const p of PLATAFORMAS) {
      s.push({ chave: `amazon.tag.${c}_${p}`, tipo: 'texto', padrao: '', desc: `Tag da Amazon para ${CATEGORIAS[c].nome} no ${p}` });
    }
  }
  return s;
}

function padrao() {
  const canaisDesc = {};
  for (const [k, v] of Object.entries(CANAIS_SUGERIDOS)) canaisDesc[k] = v.desc;
  return {
    marca: 'Ofertô',
    admins: [],
    fuso: 'America/Sao_Paulo',
    campanha_prefixo: 'bf26',
    rastrear_entradas: true,
    limpar_avisos: true,
    antispam: true,
    hash_sal: '',
    categorias: JSON.parse(JSON.stringify(CATEGORIAS)),
    telegram: {
      bot_token: '', bot_token_grupo: '', grupo_id: '', grupo_link: '', n8n_webhook_url: '', webhook_secret: '', bot_grupo_username: '',
      api: 'https://api.telegram.org', topicos: {}, topico_chat_aberto: 0, canais: {}, canais_link: {}, canais_logo: {}, canais_desc: canaisDesc,
      grupo_textos: 'pendente', grupo_mensagens: {}, fechar_topicos_oferta: false,
    },
    selo: { tolerancia_pct: 0, dias: 90, exigir_ref90: true },
    auto: { link_direto: true, publicar_direto: false, categoria_padrao: 'casa' },
    admin: { notificacao_piloto: 'completa' },
    agentes: { cacador: true, auditor: true, marketing: true, concierge: true, guardiao: true },
    whatsapp: { webhook_url: '', api_key: '', grupo_destino: '', canal_destino: '' },
    copy: { chamativa: true },
    publicar: { plataformas: ['wag', 'wac', 'x'] },
    divulgar: { auto_diario: true },
    canais_auto: true,
    alertas: { ativo: true, max_por_membro: 10 },
    post: { botoes_extras: false },
    guardiao: { ativo: true },
    vitrine: { auto_noite: true, ultimo_dia: '' },
    shopee: {
      app_id: '', secret: '', endpoint: 'https://open-api.affiliate.shopee.com.br/graphql',
      min_desconto_pct: 20, min_comissao_pct: 3, min_vendas: 50, max_cards: 8, enviar_sem_ref: true,
      buscas: {},
    },
    amazon: { tag_padrao: '', tags: {}, mostrar_preco: true },
    shein: { afiliado_id: '' },
    ml: { etiqueta: '' },
    afiliados: { awin_id: '', terabyte_id: '', rakuten_id: '', natura_consultoria: '', extras: {} },
    radar: {
      ativo: true,
      publicar_direto: true,
      auto_top: true,
      lojas: TODAS_LOJAS_RADAR.slice(),
      categorias: ['moda', 'beleza', 'perfumes', 'saude', 'casa', 'tech', 'bebe'],
      palavras: [],
      min_desconto_pct: 15,
      preco_min: 15,
      max_por_ciclo: 4,
      cadencia_dinamica: true,
      canais_telegram: [],
      canais_curados: true,
      api_url: '',
    },
    mercado: { checar: true },
    cupons: { radar_auto: true, esquenta_19h: true, ultimo_esquenta: '', links: {}, logos: {} },
    tunel: { dominio: '' },
    saude: { estado: {} },
    keepa: { chave: '', api: 'https://api.keepa.com', buybox: false },
  };
}

const simNao = (v) => /^(s|sim|y|yes|true|1)$/i.test(String(v).trim());
const num = (v) => {
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

/** Monta o cfg a partir das linhas da tabela `config` ({ chave, valor }). */
function montarConfig(linhas) {
  const cfg = padrao();
  const valores = {};
  for (const e of esquema()) if (e.padrao !== '') valores[e.chave] = e.padrao;
  for (const r of linhas || []) {
    if (!r || !r.chave) continue;
    const chave = String(r.chave).trim();
    const valor = r.valor == null ? '' : String(r.valor).trim();
    // Linha existente e vazia: vale o padrão, exceto nas buscas da Shopee (vazio = não coletar).
    if (valor !== '' || /^shopee\.busca\./.test(chave)) valores[chave] = valor;
  }

  for (const [k, v] of Object.entries(valores)) {
    let m;
    if (k === 'admins') cfg.admins = v.split(/[\s,;]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0);
    else if (['marca', 'fuso', 'campanha_prefixo'].includes(k)) cfg[k] = v;
    else if (k === 'rastrear_entradas') cfg.rastrear_entradas = simNao(v);
    else if (k === 'grupo.limpar_avisos') cfg.limpar_avisos = simNao(v);
    else if (k === 'grupo.antispam') cfg.antispam = simNao(v);
    else if (k === 'grupo.fechar_topicos_oferta') cfg.telegram.fechar_topicos_oferta = simNao(v);
    else if (k === 'hash_sal') cfg.hash_sal = v;
    else if (k === 'bot_grupo_username') cfg.telegram.bot_grupo_username = v.replace(/^@/, '');
    else if (k === 'grupo_id') cfg.telegram.grupo_id = /^(nenhum|desativado|off|-)$/i.test(v) ? '' : v;
    else if (['bot_token', 'bot_token_grupo', 'grupo_link', 'n8n_webhook_url', 'webhook_secret'].includes(k)) cfg.telegram[k] = v;
    else if (k === 'grupo.textos') cfg.telegram.grupo_textos = v.toLowerCase();
    else if (k === 'grupo.mensagens') { try { const o = JSON.parse(v); if (o && typeof o === 'object') cfg.telegram.grupo_mensagens = o; } catch (e) { /* valor inválido: ignora */ } }
    else if (k === 'telegram_api') cfg.telegram.api = v.replace(/\/+$/, '');
    else if (k === 'link_curto_api') cfg.link_curto_api = v.replace(/\/+$/, '');
    else if (k === 'pagina_api') cfg.pagina_api = v.replace(/\/+$/, '');
    else if (k === 'auto.link_direto') cfg.auto.link_direto = simNao(v);
    else if (k === 'auto.publicar_direto') cfg.auto.publicar_direto = simNao(v);
    else if (k === 'auto.categoria_padrao') { if (cfg.categorias[v.toLowerCase()] && v.toLowerCase() !== 'top') cfg.auto.categoria_padrao = v.toLowerCase(); }
    else if (k === 'copy.chamativa') cfg.copy.chamativa = simNao(v);
    else if (k === 'publicar.plataformas') {
      const ps = v.toLowerCase().split(/[\s,;]+/).filter((p) => ['wag', 'wac', 'x'].includes(p));
      if (ps.length) cfg.publicar.plataformas = [...new Set(ps)];
    }
    else if (k === 'divulgar.auto_diario') cfg.divulgar.auto_diario = simNao(v);
    else if (k === 'canais.auto_vincular') cfg.canais_auto = simNao(v);
    else if (k === 'alertas.ativo') cfg.alertas.ativo = simNao(v);
    else if (k === 'alertas.max_por_membro' && num(v) != null) cfg.alertas.max_por_membro = Math.max(1, num(v));
    else if (k === 'post.botoes_extras') cfg.post.botoes_extras = simNao(v);
    else if (k === 'guardiao.ativo') cfg.guardiao.ativo = simNao(v);
    else if (k === 'vitrine.auto_noite') cfg.vitrine.auto_noite = simNao(v);
    else if (k === 'vitrine.ultimo_dia') cfg.vitrine.ultimo_dia = v;
    else if ((m = k.match(/^categoria_nome\.(\w+)$/))) { if (cfg.categorias[m[1]] && v) cfg.categorias[m[1]].nome = v; }
    else if ((m = k.match(/^topico\.(\w+)$/))) { if (num(v)) cfg.telegram.topicos[m[1]] = num(v); }
    else if ((m = k.match(/^canal\.(\w+)$/))) { cfg.telegram.canais[m[1]] = /^(@\w{4,}|-100\d+)$/.test(v) ? v : ''; if (!cfg.telegram.canais[m[1]]) delete cfg.telegram.canais[m[1]]; }
    else if ((m = k.match(/^canal_link\.(\w+)$/))) { if (/^https:\/\/t\.me\//.test(v)) cfg.telegram.canais_link[m[1]] = v; }
    else if ((m = k.match(/^canal_logo\.(\w+)$/))) { if (v) cfg.telegram.canais_logo[m[1]] = v; }
    else if ((m = k.match(/^canal_desc\.(\w+)$/))) { if (v) cfg.telegram.canais_desc[m[1]] = v; }
    else if (k === 'selo.tolerancia_pct') cfg.selo.tolerancia_pct = num(v) || 0;
    else if (k === 'selo.exigir_ref90') cfg.selo.exigir_ref90 = simNao(v);
    else if ((m = k.match(/^shopee\.busca\.(\w+)$/))) cfg.shopee.buscas[m[1]] = v.split(';').map((s) => s.trim()).filter(Boolean);
    else if (k === 'shopee.enviar_sem_ref') cfg.shopee.enviar_sem_ref = simNao(v);
    else if ((m = k.match(/^shopee\.(min_desconto_pct|min_comissao_pct|min_vendas|max_cards)$/))) { if (num(v) != null) cfg.shopee[m[1]] = num(v); }
    else if ((m = k.match(/^shopee\.(app_id|secret|endpoint)$/))) cfg.shopee[m[1]] = v;
    else if (k === 'amazon.tag_padrao') cfg.amazon.tag_padrao = v;
    else if (k === 'shein.afiliado_id') cfg.shein.afiliado_id = v;
    else if (k === 'ml.etiqueta') cfg.ml.etiqueta = v;
    else if (k === 'awin.afiliado_id') cfg.afiliados.awin_id = v;
    else if (k === 'terabyte.afiliado_id') cfg.afiliados.terabyte_id = v;
    else if (k === 'rakuten.id') cfg.afiliados.rakuten_id = v;
    else if (k === 'natura.consultoria') cfg.afiliados.natura_consultoria = v;
    else if ((m = k.match(/^afiliado\.(\w+)$/))) cfg.afiliados.extras[m[1]] = v;
    else if (k === 'radar.ativo') cfg.radar.ativo = simNao(v);
    else if (k === 'radar.publicar_direto') cfg.radar.publicar_direto = simNao(v);
    else if (k === 'radar.auto_top') cfg.radar.auto_top = simNao(v);
    else if (k === 'radar.lojas') {
      const ls = v.toLowerCase().split(/[\s,;]+/).filter((l) => LOJAS_ACEITAS.includes(l));
      if (ls.length) cfg.radar.lojas = [...new Set(ls)];
    } else if (k === 'radar.categorias') {
      const cs = v.toLowerCase().split(/[\s,;]+/).filter((c) => ['moda', 'beleza', 'perfumes', 'saude', 'casa', 'tech', 'bebe'].includes(c));
      if (cs.length) cfg.radar.categorias = [...new Set(cs)];
    } else if (k === 'radar.palavras') cfg.radar.palavras = v.split(/[;,]+/).map((s) => s.trim()).filter(Boolean);
    else if (k === 'radar.min_desconto_pct' && num(v) != null) cfg.radar.min_desconto_pct = num(v);
    else if (k === 'radar.preco_min' && num(v) != null) cfg.radar.preco_min = num(v);
    else if (k === 'radar.max_por_ciclo' && num(v) != null) cfg.radar.max_por_ciclo = Math.max(1, num(v));
    else if (k === 'radar.cadencia_dinamica') cfg.radar.cadencia_dinamica = simNao(v);
    else if (k === 'radar.canais_telegram') cfg.radar.canais_telegram = v.split(/[;\s,]+/).map((s) => s.replace(/^@/, '').trim()).filter(Boolean);
    else if (k === 'radar.canais_curados') cfg.radar.canais_curados = simNao(v);
    else if (k === 'radar.api_url') cfg.radar.api_url = v.replace(/\/+$/, '');
    else if (k === 'mercado.checar') cfg.mercado.checar = simNao(v);
    else if (k === 'cupons.radar_auto') cfg.cupons.radar_auto = simNao(v);
    else if (k === 'cupons.esquenta_19h') cfg.cupons.esquenta_19h = simNao(v);
    else if (k === 'cupons.ultimo_esquenta') cfg.cupons.ultimo_esquenta = v;
    else if ((m = k.match(/^cupons\.link_(\w+)$/))) { if (/^https?:\/\//i.test(v)) cfg.cupons.links[m[1]] = v; }
    else if ((m = k.match(/^cupons\.logo_(\w+)$/))) { if (v) cfg.cupons.logos[m[1]] = v; }
    else if ((m = k.match(/^agentes\.(cacador|auditor|marketing|concierge|guardiao)$/))) cfg.agentes[m[1]] = simNao(v);
    else if (k === 'admin.notificacao_piloto') cfg.admin.notificacao_piloto = v.toLowerCase() === 'compacta' ? 'compacta' : 'completa';
    else if (k === 'topico_chat_aberto' && num(v)) cfg.telegram.topico_chat_aberto = num(v);
    else if (k === 'whatsapp.webhook_url') cfg.whatsapp.webhook_url = v;
    else if (k === 'whatsapp.api_key') cfg.whatsapp.api_key = v;
    else if (k === 'whatsapp.grupo_destino') cfg.whatsapp.grupo_destino = v;
    else if (k === 'whatsapp.canal_destino') cfg.whatsapp.canal_destino = v;
    else if (k === 'tunel.dominio') cfg.tunel.dominio = v;
    else if (k === 'saude.ultimo_alerta') { try { const o = JSON.parse(v); if (o && typeof o === 'object' && !Array.isArray(o)) cfg.saude.estado = o; } catch (e) { /* valor inválido: ignora */ } }
    else if (k === 'amazon.mostrar_preco') cfg.amazon.mostrar_preco = simNao(v);
    else if ((m = k.match(/^amazon\.tag\.(\w+)$/))) cfg.amazon.tags[m[1]] = v;
    else if (k === 'keepa.chave') cfg.keepa.chave = v;
    else if (k === 'keepa.api') cfg.keepa.api = v.replace(/\/+$/, '');
    else if (k === 'keepa.buybox') cfg.keepa.buybox = simNao(v);
  }
  if (!cfg.telegram.bot_token_grupo) cfg.telegram.bot_token_grupo = cfg.telegram.bot_token;
  cfg.telegram.dois_bots = cfg.telegram.bot_token_grupo !== cfg.telegram.bot_token;
  return cfg;
}

/** Linhas do esquema que ainda não existem na tabela (para o setup inserir). */
function linhasFaltantes(linhas) {
  const existentes = new Set((linhas || []).map((r) => r && r.chave));
  return esquema()
    .filter((e) => !existentes.has(e.chave))
    .map((e) => ({ chave: e.chave, valor: e.padrao, descricao: e.desc }));
}

const CHAVES_PROTEGIDAS_CHAT = new Set([
  'bot_token', 'bot_token_grupo', 'webhook_secret', 'n8n_webhook_url', 'admins', 'hash_sal',
  'telegram_api', 'link_curto_api', 'pagina_api', 'keepa.api', 'radar.api_url', 'shopee.secret', 'keepa.chave', 'whatsapp.api_key',
]);

function resolverCategoriaCfg(tok, cfg) {
  const s = String(tok || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  if (!s) return null;
  const cats = Object.keys((cfg && cfg.categorias) || CATEGORIAS);
  const mapa = {
    top: 'top', vip: 'top', geral: 'top', bugs: 'top',
    tech: 'tech', game: 'tech', games: 'tech', gamer: 'tech', ps5: 'tech', xbox: 'tech', gta: 'tech', gta6: 'tech', hardware: 'tech', pc: 'tech', informatica: 'tech',
    moda: 'moda', roupa: 'moda', roupas: 'moda', tenis: 'moda', calcado: 'moda', calcados: 'moda', vestuario: 'moda', look: 'moda', looks: 'moda', bolsa: 'moda', acessorio: 'moda', acessorios: 'moda',
    perfumes: 'perfumes', perfume: 'perfumes', perfumaria: 'perfumes', arabe: 'perfumes', arabes: 'perfumes', nicho: 'perfumes', fragrancia: 'perfumes', fragrancias: 'perfumes',
    saude: 'saude', farmacia: 'saude', farmacias: 'saude', drogaria: 'saude', drogarias: 'saude', suplemento: 'saude', suplementos: 'saude', creatina: 'saude', whey: 'saude', vitaminas: 'saude', fitness: 'saude',
    beleza: 'beleza', skincare: 'beleza', cosmeticos: 'beleza', maquiagem: 'beleza', cabelo: 'beleza', cabelos: 'beleza',
    casa: 'casa', eletro: 'casa', cozinha: 'casa', lar: 'casa',
    bebe: 'bebe', familia: 'bebe', fralda: 'bebe', fraldas: 'bebe', infantil: 'bebe',
  };
  if (mapa[s]) {
    const alvo = mapa[s];
    if (cats.includes(alvo)) return alvo;
    if ((alvo === 'perfumes' || alvo === 'saude' || alvo === 'moda') && cats.includes('beleza')) return 'beleza';
  }
  return cats.find((c) => c === s) || (s.length >= 3 ? cats.find((c) => c.startsWith(s)) : null);
}

function textoAfiliados(cfg) {
  const ativas = [];
  const pendentes = [];
  for (const [loja, info] of Object.entries(PROGRAMAS_AFILIADO)) {
    const line = `${nomeLoja(loja)} — ${info.programa}`;
    if (temAfiliadoAtivo(loja, cfg, {})) ativas.push(`✅ ${line}`);
    else pendentes.push(`• ${line}\n  Ative com: /config ${info.chave} ${info.exemplo}`);
  }
  return [
    '💼 Mapa de Afiliados das Lojas do Ofertô',
    '',
    'Ativas na sua conta:',
    ...(ativas.length ? ativas : ['(nenhuma configurada ainda — já publica links diretos confiáveis!)']),
    '',
    'Lojas do Radar que aceitam código de afiliado (configure conforme for liberado):',
    ...(pendentes.length ? pendentes : ['Todas configuradas! 🎉']),
    '',
    'Lojas confiáveis já liberadas sem precisar de código:',
    '• Pichau, Panvel, Drogaria Araujo, Pague Menos, TikTok Shop (publicam limpas automaticamente).',
  ].join('\n');
}

function interpretarComandoCanais(texto, cfg) {
  const limpo = String(texto || '').trim();
  const partes = limpo.split(/\s+/);
  const sub = (partes[1] || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const t = (cfg && cfg.telegram) || {};
  const canais = t.canais || {};
  const logos = t.canais_logo || {};

  if (!sub || sub === 'status' || sub === 'ajuda') {
    const linhas = Object.keys(CATEGORIAS).map((k) => {
      const cat = (cfg && cfg.categorias && cfg.categorias[k]) || CATEGORIAS[k];
      const sug = CANAIS_SUGERIDOS[k] || {};
      const canal = canais[k] || '(ainda não ligado)';
      const logoSt = logos[k] ? '🖼️ com logo' : 'sem logo';
      return `${cat.emoji} ${k} → ${sug.nome || cat.nome}\n   Canal: ${canal} · Logo: ${logoSt}`;
    });
    const pubAt = t.bot_grupo_username ? `@${t.bot_grupo_username}` : 'bot publicador';
    return {
      upserts: [],
      mensagem: [
        '📢 Estrutura de Canais Separados (Ofertô)',
        '',
        ...linhas,
        '',
        '🚀 Auto-conexão em 1 passo (zero trabalho):',
        '1) Crie os canais no Telegram com estes nomes sugeridos e adicione o ' + pubAt + ' como Admin (Publicar, Editar, Fixar, Convidar, Alterar info):',
        `   • ${CANAIS_SUGERIDOS.tech.nome}`,
        `   • ${CANAIS_SUGERIDOS.moda.nome}`,
        `   • ${CANAIS_SUGERIDOS.beleza.nome}`,
        `   • ${CANAIS_SUGERIDOS.perfumes.nome}`,
        `   • ${CANAIS_SUGERIDOS.saude.nome}`,
        `   • ${CANAIS_SUGERIDOS.casa.nome}`,
        `   • ${CANAIS_SUGERIDOS.bebe.nome}`,
        `   • ${CANAIS_SUGERIDOS.top.nome}`,
        '   → O bot detecta o nicho pelo nome, salva o canal, cria link de convite, coloca a descrição e fixa as boas-vindas SOZINHO!',
        '',
        'Comandos rápidos:',
        '• /canais moda @meu_canal (ou -100ID)',
        '• /canais nomes   (aplica os nomes oficiais nas categorias)',
        '• /logo moda https://... (ou foto com legenda /logo moda no publicador)',
        '• /canais so_canais   (desliga o supergrupo quando quiser publicar só nos canais)',
        '• /canais migrar   (desliga o grupo antigo E apaga os tópicos antigos no Telegram)',
        '• /canais apagar_topico <id>   (apaga um tópico específico do supergrupo)',
        '• /divulgar   (divulgação cruzada de todos os canais com logo)',
      ].join('\n'),
    };
  }

  if (sub === 'nomes' || sub === 'renomear') {
    const upserts = [
      { chave: 'categoria_nome.top', valor: CANAIS_SUGERIDOS.top.categoria_nome },
      { chave: 'categoria_nome.tech', valor: CANAIS_SUGERIDOS.tech.categoria_nome },
      { chave: 'categoria_nome.moda', valor: CANAIS_SUGERIDOS.moda.categoria_nome },
      { chave: 'categoria_nome.beleza', valor: CANAIS_SUGERIDOS.beleza.categoria_nome },
      { chave: 'categoria_nome.perfumes', valor: CANAIS_SUGERIDOS.perfumes.categoria_nome },
      { chave: 'categoria_nome.saude', valor: CANAIS_SUGERIDOS.saude.categoria_nome },
      { chave: 'categoria_nome.casa', valor: CANAIS_SUGERIDOS.casa.categoria_nome },
      { chave: 'categoria_nome.bebe', valor: CANAIS_SUGERIDOS.bebe.categoria_nome },
    ];
    return {
      upserts,
      mensagem: [
        '✅ Nomes das categorias atualizados para os canais:',
        `• 🔥 top → ${CANAIS_SUGERIDOS.top.categoria_nome}`,
        `• 💻 tech → ${CANAIS_SUGERIDOS.tech.categoria_nome}`,
        `• 👗 moda → ${CANAIS_SUGERIDOS.moda.categoria_nome}`,
        `• 💄 beleza → ${CANAIS_SUGERIDOS.beleza.categoria_nome}`,
        `• ✨ perfumes → ${CANAIS_SUGERIDOS.perfumes.categoria_nome}`,
        `• 💊 saude → ${CANAIS_SUGERIDOS.saude.categoria_nome}`,
        `• 🏠 casa → ${CANAIS_SUGERIDOS.casa.categoria_nome}`,
        `• 👶 bebe → ${CANAIS_SUGERIDOS.bebe.categoria_nome}`,
      ].join('\n'),
    };
  }

  if (sub === 'migrar' || sub === 'migrarcanais') {
    const forcar = partes.slice(2).some((p) => /^confirmar$/i.test(p));
    if (!Object.keys(canais).length && !forcar) {
      return {
        upserts: [],
        mensagem: '⚠️ Nenhum canal separado está conectado ainda! Adicione o bot publicador como admin nos canais novos (veja /canais) ou mande /canais migrar confirmar para limpar os tópicos do grupo mesmo assim.',
      };
    }
    const topicos = t.topicos || {};
    const chamadasExtras = [];
    const upserts = [{ chave: 'grupo_id', valor: 'nenhum' }];
    const apagados = [];
    if (t.grupo_id) {
      for (const [kCat, tid] of Object.entries(topicos)) {
        const numId = Number(tid);
        if (Number.isFinite(numId) && numId > 1) {
          chamadasExtras.push({ bot: 'grupo', metodo: 'deleteForumTopic', payload: { chat_id: t.grupo_id, message_thread_id: numId } });
          upserts.push({ chave: `topico.${kCat}`, valor: '' });
          apagados.push(`${kCat} (#${numId})`);
        }
      }
    }
    return {
      upserts,
      chamadasExtras,
      mensagem: [
        '🚀 Migração para Canais concluída!',
        `• Modo Somente Canais ativado (${Object.keys(canais).length} canal(is) ligado(s)).`,
        apagados.length
          ? `• ${apagados.length} tópico(s) antigos removidos do supergrupo: ${apagados.join(', ')}.`
          : '• Nenhum tópico restante para apagar no supergrupo.',
        '• Use /divulgar para mandar o hub de canais.',
      ].join('\n'),
    };
  }

  if (sub === 'apagartopico' || sub === 'apagar_topico' || sub === 'deletartopico') {
    const tid = Number(partes[2]);
    if (!t.grupo_id) {
      return { upserts: [], mensagem: '⚠️ Nenhum supergrupo configurado em grupo_id.' };
    }
    if (!Number.isFinite(tid) || tid <= 1) {
      return { upserts: [], mensagem: 'Uso: /canais apagar_topico <id_do_topico> (ex.: /canais apagar_topico 42)' };
    }
    const upserts = [];
    for (const [kCat, vTid] of Object.entries(t.topicos || {})) {
      if (Number(vTid) === tid) upserts.push({ chave: `topico.${kCat}`, valor: '' });
    }
    return {
      upserts,
      chamadasExtras: [{ bot: 'grupo', metodo: 'deleteForumTopic', payload: { chat_id: t.grupo_id, message_thread_id: tid } }],
      mensagem: `🗑️ Tópico #${tid} enviado para exclusão no supergrupo.`,
    };
  }

  if (sub === 'socanais' || sub === 'so_canais' || sub === 'apenascanais') {
    if (!Object.keys(canais).length) {
      return {
        upserts: [],
        mensagem: '⚠️ Ligue pelo menos 1 canal antes de desligar o grupo principal (ex.: /canais tech @seu_canal).',
      };
    }
    return {
      upserts: [{ chave: 'grupo_id', valor: 'nenhum' }],
      mensagem: '✅ Modo Somente Canais ativado! Os posts agora saem direto nos canais configurados (sem depender de grupo/tópicos) e ganham o botão "🌐 Outros canais".',
    };
  }

  const cat = resolverCategoriaCfg(partes[1], cfg);
  const destino = (partes[2] || '').trim();
  const linkPriv = (partes[3] || '').trim();
  if (!cat || !/^(@\w{4,}|-100\d+)$/.test(destino)) {
    return {
      upserts: [],
      mensagem: 'Uso: /canais <tech|moda|beleza|perfumes|saude|casa|bebe|top> <@canal_ou_-100id> [https://t.me/+convite]',
    };
  }
  const upserts = [{ chave: `canal.${cat}`, valor: destino }];
  if (CANAIS_SUGERIDOS[cat] && CANAIS_SUGERIDOS[cat].categoria_nome) {
    upserts.push({ chave: `categoria_nome.${cat}`, valor: CANAIS_SUGERIDOS[cat].categoria_nome });
  }
  if (/^https:\/\/t\.me\//.test(linkPriv)) {
    upserts.push({ chave: `canal_link.${cat}`, valor: linkPriv });
  }
  const sug = CANAIS_SUGERIDOS[cat] || {};
  return {
    upserts,
    mensagem: [
      `✅ Canal de ${sug.nome || cat} conectado: ${destino}`,
      `• Categoria configurada como: ${sug.categoria_nome || cat}`,
      '• Certifique-se de que o bot publicador é administrador desse canal.',
      '• Para enviar o logo desse canal: /logo ' + cat + ' https://url-da-imagem (ou mande a foto no bot publicador com legenda /logo ' + cat + ').',
    ].join('\n'),
  };
}

function interpretarComandoLogo(texto, fileId, origem, cfg) {
  const limpo = String(texto || '').trim();
  const partes = limpo.split(/\s+/);
  const cat = resolverCategoriaCfg(partes[1], cfg);
  const urlImg = partes.slice(2).find((p) => /^https?:\/\//i.test(p)) || '';
  if (!cat) {
    return {
      upserts: [],
      mensagem: 'Uso: /logo <tech|moda|beleza|perfumes|saude|casa|bebe|top> <url_https_da_imagem>\nOu envie a foto diretamente para o bot publicador com a legenda: /logo moda',
    };
  }
  if (urlImg) {
    return {
      upserts: [{ chave: `canal_logo.${cat}`, valor: urlImg }],
      mensagem: `🖼️ Logo do canal ${cat} salvo via URL! Use /divulgar ${cat} para testar.`,
    };
  }
  if (fileId) {
    if (origem === 'admin' && cfg && cfg.telegram && cfg.telegram.dois_bots) {
      const pub = cfg.telegram.bot_grupo_username ? `@${cfg.telegram.bot_grupo_username}` : 'bot publicador';
      return {
        upserts: [],
        mensagem: `ℹ️ Como você usa 2 bots, o Telegram exige que o arquivo seja enviado no ${pub} para que ele possa postar a foto nos canais.\nEncaminhe essa foto para ${pub} com a legenda /logo ${cat} — ou use um link direto: /logo ${cat} https://...`,
      };
    }
    return {
      upserts: [{ chave: `canal_logo.${cat}`, valor: fileId }],
      mensagem: `🖼️ Logo do canal ${cat} salvo com sucesso! Use /divulgar ${cat} para publicar a chamada com o logo.`,
    };
  }
  return {
    upserts: [],
    mensagem: `Envie a imagem com legenda /logo ${cat} (no ${cfg && cfg.telegram && cfg.telegram.bot_grupo_username ? '@' + cfg.telegram.bot_grupo_username : 'bot'}) ou passe a URL: /logo ${cat} https://...`,
  };
}

/**
 * Interpreta /modo, /config, /buscas, /afiliados, /canais e /logo enviados pelo admin no privado.
 * Retorna { upserts: [{ chave, valor }], mensagem }.
 */
function interpretarComandoTopicos(texto, cfg) {
  const partes = String(texto || '').trim().split(/\s+/);
  const sub = (partes[1] || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const t = (cfg && cfg.telegram) || {};
  if (!t.grupo_id) {
    return { upserts: [], mensagem: '⚠️ Nenhum supergrupo configurado em grupo_id.' };
  }
  const topicos = Object.entries(t.topicos || {}).filter(([, v]) => Number(v) > 1);
  if (!topicos.length) {
    return { upserts: [], mensagem: '⚠️ Nenhum tópico de ofertas configurado.' };
  }
  if (sub === 'fechar' || sub === 'trancar') {
    return {
      upserts: [{ chave: 'grupo.fechar_topicos_oferta', valor: 'sim' }],
      chamadasExtras: topicos.map(([, tid]) => ({ bot: 'grupo', metodo: 'closeForumTopic', payload: { chat_id: t.grupo_id, message_thread_id: Number(tid) } })),
      mensagem: `🔒 Trancando ${topicos.length} tópico(s) de ofertas para membros comuns (só o bot publica; para liberar de novo use /topicos abrir).`,
    };
  }
  if (sub === 'abrir' || sub === 'destrancar') {
    return {
      upserts: [{ chave: 'grupo.fechar_topicos_oferta', valor: 'nao' }],
      chamadasExtras: topicos.map(([, tid]) => ({ bot: 'grupo', metodo: 'reopenForumTopic', payload: { chat_id: t.grupo_id, message_thread_id: Number(tid) } })),
      mensagem: `🔓 Reabrindo ${topicos.length} tópico(s) de ofertas para respostas/comentários.`,
    };
  }
  return {
    upserts: [],
    mensagem: `Estado atual: ${t.fechar_topicos_oferta ? '🔒 tópicos de oferta fechados para membros' : '💬 tópicos abertos'}\nUso: /topicos fechar ou /topicos abrir`,
  };
}

function interpretarComandoConfig(texto, cfg) {
  const limpo = String(texto || '').trim();
  const partes = limpo.split(/\s+/);
  const cmd = (partes[0] || '').replace(/^\/|@\w+$/g, '').toLowerCase();

  if (cmd === 'afiliados') return { upserts: [], mensagem: textoAfiliados(cfg) };
  if (cmd === 'canais') return interpretarComandoCanais(limpo, cfg);
  if (cmd === 'logo') return interpretarComandoLogo(limpo, '', 'admin', cfg);
  if (cmd === 'topicos') return interpretarComandoTopicos(limpo, cfg);

  if (cmd === 'modo') {
    const sub = (partes[1] || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (sub === 'piloto' || sub === 'autopiloto' || sub === 'total') {
      return {
        upserts: [
          { chave: 'auto.link_direto', valor: 'sim' },
          { chave: 'auto.publicar_direto', valor: 'sim' },
          { chave: 'radar.ativo', valor: 'sim' },
          { chave: 'radar.publicar_direto', valor: 'sim' },
          { chave: 'selo.exigir_ref90', valor: 'nao' },
          { chave: 'publicar.plataformas', valor: 'wag' },
          { chave: 'copy.chamativa', valor: 'sim' },
          { chave: 'post.botoes_extras', valor: 'sim' },
          { chave: 'alertas.ativo', valor: 'sim' },
          { chave: 'guardiao.ativo', valor: 'sim' },
          { chave: 'vitrine.auto_noite', valor: 'sim' },
          { chave: 'admin.notificacao_piloto', valor: 'compacta' },
        ],
        mensagem: [
          '🤖 Modo Piloto Automático ativado!',
          '• O Radar Multi-Fonte roda automaticamente a cada 5 min com cadência inteligente nos horários de pico (18 lojas: ML, Amazon, Shopee, Shein, TikTok, KaBuM!, Terabyte, Pichau, Farmácias e Perfumarias) e já publica direto no Telegram.',
          '• Alertas pessoais (/alerta), Guardião anti-oferta esgotada (2h), Vitrine 21h15 e botões virais estão ativos.',
          '• E tudo chega aqui com o botão de 1 toque para enviar no Grupo do WhatsApp!',
          '',
          'Para testar na hora: mande /radar (ou /modo aprovar para voltar à revisão por card).',
        ].join('\n'),
      };
    }
    if (sub === 'rapido' || sub === 'auto' || sub === 'automatico') {
      return {
        upserts: [
          { chave: 'auto.link_direto', valor: 'sim' },
          { chave: 'auto.publicar_direto', valor: 'sim' },
          { chave: 'selo.exigir_ref90', valor: 'nao' },
          { chave: 'publicar.plataformas', valor: 'wag' },
          { chave: 'copy.chamativa', valor: 'sim' },
          { chave: 'post.botoes_extras', valor: 'sim' },
        ],
        mensagem: [
          '⚡ Modo Rápido ativado!',
          '• Basta colar ou encaminhar qualquer link de produto aqui no privado.',
          '• O bot extrai os dados, publica direto no Telegram (grupo/canais configurados) e já te entrega o texto pronto do Grupo do WhatsApp com botão de 1 toque.',
          '',
          'Para publicar o Radar automático também sem clicar, use: /modo piloto (ou /modo aprovar para revisar antes).',
        ].join('\n'),
      };
    }
    if (sub === 'aprovar' || sub === 'card') {
      return {
        upserts: [
          { chave: 'auto.link_direto', valor: 'sim' },
          { chave: 'auto.publicar_direto', valor: 'nao' },
          { chave: 'radar.publicar_direto', valor: 'nao' },
        ],
        mensagem: [
          '✅ Modo 1-Clique (com card de aprovação) ativado!',
          '• Basta colar o link (ou usar /radar): o bot monta o card completo e você publica com 1 toque em Aprovar.',
        ].join('\n'),
      };
    }
    if (sub === 'padrao') {
      return {
        upserts: [
          { chave: 'auto.link_direto', valor: 'sim' },
          { chave: 'auto.publicar_direto', valor: 'nao' },
          { chave: 'radar.publicar_direto', valor: 'nao' },
          { chave: 'selo.exigir_ref90', valor: 'sim' },
          { chave: 'publicar.plataformas', valor: 'wag,wac,x' },
          { chave: 'copy.chamativa', valor: 'sim' },
          { chave: 'admin.notificacao_piloto', valor: 'completa' },
        ],
        mensagem: '🔄 Modo padrão restaurado (card de aprovação + todas as plataformas).',
      };
    }
    const estadoAtual = cfg && cfg.auto && cfg.auto.publicar_direto
      ? (cfg.radar && cfg.radar.publicar_direto ? '🤖 Piloto Automático (links + radar publicam direto)' : '⚡ Rápido (0 cliques ao colar link)')
      : '✅ 1-Clique (revisa o card antes de publicar)';
    return {
      upserts: [],
      mensagem: [
        `⚙️ Modo atual: ${estadoAtual}`,
        '',
        'Escolha como quer trabalhar:',
        '• /modo piloto — radar automático (2 min com cadência de pico) + links colados publicam direto no Telegram',
        '• /modo rapido — só links colados publicam direto (radar manda cards para revisão)',
        '• /modo aprovar — recebe o card antes de publicar tanto nos links colados quanto no radar',
        '• /modo padrao — card de aprovação + textos para WhatsApp (grupo e canal) e X',
      ].join('\n'),
    };
  }

  if (cmd === 'buscas') {
    const arg = limpo.replace(/^\/\w+(?:@\w+)?\s*/i, '').trim();
    const r = (cfg && cfg.radar) || {};
    if (!arg) {
      const shBuscas = Object.entries((cfg && cfg.shopee && cfg.shopee.buscas) || {})
        .map(([k, v]) => `  ${k}: ${(v || []).join('; ') || '—'}`)
        .join('\n') || '  (padrão)';
      return {
        upserts: [],
        mensagem: [
          '🎯 Filtros do Radar e Coleta',
          '',
          `• Radar ativo (a cada 2 min): ${r.ativo !== false ? 'sim ✅' : 'nao'}`,
          `• Lojas (${(r.lojas || []).length}): ${(r.lojas || []).join(', ') || 'todas'}`,
          `• Palavras do radar (radar.palavras): ${(r.palavras || []).length ? r.palavras.join('; ') : '(todas as boas ofertas de Tech, Moda, Beleza, Perfumes, Saúde, Casa e Bebê)'}`,
          '• Buscas Shopee API:',
          shBuscas,
          '',
          'Para filtrar o radar só pelo que você vende:',
          '/buscas ps5; gta 6; perfume; air fryer; placa de video',
          '/buscas limpar   (volta a pegar todas as boas ofertas)',
          '/buscas tech ps5; xbox series; placa de video; ssd nvme',
        ].join('\n'),
      };
    }
    const normArg = arg.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (normArg === 'limpar' || normArg === 'todas' || normArg === 'todos') {
      return {
        upserts: [{ chave: 'radar.palavras', valor: '' }],
        mensagem: '✅ Filtro de palavras do radar limpo! Agora ele caça todas as boas ofertas das categorias ativas.',
      };
    }
    const prim = (partes[1] || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (['casa', 'moda', 'beleza', 'perfumes', 'saude', 'bebe', 'tech'].includes(prim) && partes.length >= 3) {
      const termos = limpo.replace(/^\/\w+(?:@\w+)?\s+\S+\s+/i, '').trim();
      return {
        upserts: [{ chave: `shopee.busca.${prim}`, valor: termos }],
        mensagem: `✅ Busca da categoria ${prim} atualizada para: ${termos}`,
      };
    }
    return {
      upserts: [{ chave: 'radar.palavras', valor: arg }],
      mensagem: `✅ Palavras do radar atualizadas para: ${arg}`,
    };
  }

  // /config
  const chave = (partes[1] || '').trim();
  const valor = partes.slice(2).join(' ').trim();
  if (!chave) {
    const a = (cfg && cfg.auto) || {};
    const rad = (cfg && cfg.radar) || {};
    const af = (cfg && cfg.afiliados) || {};
    const plats = ((cfg && cfg.publicar && cfg.publicar.plataformas) || ['wag', 'wac', 'x']).join(', ');
    const nCanais = Object.keys((cfg && cfg.telegram && cfg.telegram.canais) || {}).length;
    return {
      upserts: [],
      mensagem: [
        `⚙️ Configuração rápida (${(cfg && cfg.marca) || 'Ofertô'})`,
        '',
        `• Colar só o link (auto.link_direto): ${a.link_direto !== false ? 'sim ✅' : 'nao'}`,
        `• Publicar sem clicar (auto.publicar_direto): ${a.publicar_direto ? 'sim ⚡' : 'nao (1 clique no card)'}`,
        `• Radar 2 min (radar.ativo): ${rad.ativo !== false ? 'sim 📡' : 'nao'} · Auto-publicar: ${rad.publicar_direto ? 'sim 🤖' : 'nao'} · Cadência pico: ${rad.cadencia_dinamica !== false ? 'sim 📈' : 'nao'} · Lojas: ${(rad.lojas || []).length}`,
        `• Auto Top do Dia >=40% (radar.auto_top): ${rad.auto_top !== false ? 'sim ⭐' : 'nao'}`,
        `• Textos entregues (publicar.plataformas): ${plats}`,
        `• Grupo: ${(cfg && cfg.telegram && cfg.telegram.grupo_id) || '(somente canais)'} · Canais separados ligados: ${nCanais}`,
        `• Amazon tag: ${(cfg && cfg.amazon && cfg.amazon.tag_padrao) || '(não definida)'} · ML etiqueta: ${(cfg && cfg.ml && cfg.ml.etiqueta) || '(opcional)'}`,
        `• Awin/KaBuM!: ${af.awin_id || '(opcional)'} · Terabyte (?p): ${af.terabyte_id || '(opcional)'} · Rakuten: ${af.rakuten_id || '(opcional)'}`,
        '',
        'Atalhos úteis:',
        '/radar   (caçar promoções agora)',
        '/afiliados   (ver o que já monetiza vs. o que falta configurar)',
        '/canais   (configurar os canais separados + nomes)',
        '/divulgar   (divulgar os outros canais entre si)',
      ].join('\n'),
    };
  }

  const def = esquema().find((e) => e.chave === chave);
  if (!def) {
    return { upserts: [], mensagem: `❗ Chave "${chave}" não existe. Mande /config sozinho para ver os atalhos.` };
  }
  if (CHAVES_PROTEGIDAS_CHAT.has(chave) || def.tipo === 'segredo') {
    return { upserts: [], mensagem: `🔒 Por segurança, a chave "${chave}" só pode ser editada no painel do n8n (Data Table bfx_config).` };
  }
  if (!valor) {
    return { upserts: [], mensagem: `Uso: /config ${chave} <novo_valor>\nDescrição: ${def.desc}` };
  }
  return {
    upserts: [{ chave, valor }],
    mensagem: `✅ Configuração salva: ${chave} = ${valor}`,
  };
}

function textoStatusRadar(cfg) {
  const r = (cfg && cfg.radar) || {};
  const lojasTxt = (r.lojas || []).map((l) => nomeLoja(l)).join(', ') || 'todas';
  const modo = r.publicar_direto ? '🤖 Piloto Automático (publica direto no Telegram + botão WhatsApp)' : '✅ 1-Clique (envia card para aprovar)';
  return [
    '📡 Status do Radar Multi-Fonte',
    '',
    `• Ativo (a cada 2 min): ${r.ativo !== false ? 'sim ✅' : 'nao'} · Cadência de pico: ${r.cadencia_dinamica !== false ? 'sim 📈' : 'nao'}`,
    `• Modo do radar: ${modo}`,
    `• Lojas (${(r.lojas || []).length}): ${lojasTxt}`,
    `• Categorias: ${(r.categorias || []).join(', ')}`,
    `• Filtro de palavras: ${(r.palavras || []).length ? r.palavras.join('; ') : '(todas as boas ofertas)'}`,
    `• Desconto mínimo: ${r.min_desconto_pct ?? 15}% · Preço mín.: R$ ${r.preco_min ?? 15} · Base/rodada: ${r.max_por_ciclo ?? 4} (escala nos picos)`,
    `• Cupons de loja no radar: ${(cfg && cfg.cupons && cfg.cupons.radar_auto !== false) ? 'sim 🎟️' : 'nao'}`,
    `• Canais extras Telegram: ${(r.canais_telegram || []).length ? r.canais_telegram.map((c) => '@' + c).join(', ') : '(nenhum)'}`,
    '',
    'Comandos rápidos:',
    '/radar   (caçar agora — prioriza o que está em alta)',
    '/radar alta   (só produtos bombando / mais procurados)',
    '/radar moda · /radar cupons   (Shein, Shopee, ML, Tênis & Cupons)',
    '/radar arabes · /radar nicho   (Perfumes Árabes no ML e Nicho)',
    '/radar skincare · /radar suplementos · /radar farmacia',
    '/radar kabum · /radar terabyte · /radar pichau',
    '/radar perfume · /radar ps5 · /radar gta 6 · /radar ml · /radar amazon',
    '/buscas ps5; perfume; placa de video   (filtrar nichos)',
    '/afiliados   (ver onde cadastrar código de afiliado)',
  ].join('\n');
}

function interpretarComandoRadar(texto, cfg) {
  const limpo = String(texto || '').trim();
  const arg = limpo.replace(/^\/\w+(?:@\w+)?\s*/i, '').trim();
  const r = (cfg && cfg.radar) || {};
  const padraoLim = Math.max(1, Number(r.max_por_ciclo) || 4);
  if (!arg) {
    return { acao: 'buscar', limite: padraoLim, limite_explicito: true, rotulo: 'todas as lojas' };
  }
  const norm = arg.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (norm === 'status' || norm === 'config' || norm === 'ajuda' || norm === 'fontes') {
    return { acao: 'status', mensagem: textoStatusRadar(cfg) };
  }
  if (['off', 'parar', 'pausar', 'nao'].includes(norm)) {
    return {
      acao: 'config',
      upserts: [{ chave: 'radar.ativo', valor: 'nao' }],
      mensagem: '⏸️ Radar automático pausado. Para religar: /radar on (ou mande /radar a qualquer momento para buscar manualmente).',
    };
  }
  if (['on', 'ligar', 'ativar', 'sim'].includes(norm)) {
    return {
      acao: 'config',
      upserts: [{ chave: 'radar.ativo', valor: 'sim' }],
      mensagem: '📡 Radar automático ativado! Ele busca promoções a cada 2 min com cadência dinâmica nos picos (ou mande /radar agora).',
    };
  }
  const catsCfg = Object.keys((cfg && cfg.categorias) || CATEGORIAS);
  const catPerfumes = catsCfg.includes('perfumes') ? 'perfumes' : 'beleza';
  const catSaude = catsCfg.includes('saude') ? 'saude' : 'beleza';
  const catModa = catsCfg.includes('moda') ? 'moda' : 'beleza';
  const grupoArabes = {
    lojas: ['ml', 'amazon', 'shopee', 'belezanaweb', 'epocacosmeticos'],
    categorias: [catPerfumes],
    incluir_fontes_cat: true,
    termos_lista: [
      'lattafa', 'asad', 'fakhar', 'khamrah', 'yara', 'afnan', '9pm', 'club de nuit', 'armaf',
      'al haramain', 'rasasi', 'hawas', 'al wataniah', 'sabah al ward', 'maison alhambra',
      'orientica', 'bharara', 'french avenue', 'liquid brun', 'paris corner', 'zimaya',
      'swiss arabian', 'perfume arabe',
    ],
    rotulo: 'Perfumes Árabes (ML & Lojas)',
  };
  const grupoNicho = {
    lojas: ['ml', 'amazon', 'belezanaweb', 'epocacosmeticos', 'sephora'],
    categorias: [catPerfumes],
    incluir_fontes_cat: true,
    termos_lista: [
      'parfums de marly', 'layton', 'delina', 'althair', 'creed', 'aventus', 'nishane', 'hacivat',
      'xerjoff', 'naxos', 'erba pura', 'mancera', 'cedrat boise', 'montale', 'initio', 'amouage',
      'tom ford', 'oud wood', 'tobacco vanille', 'baccarat rouge', 'le labo', 'santal 33',
      'byredo', 'acqua di parma', 'perfume de nicho',
    ],
    rotulo: 'Perfumes de Nicho',
  };
  const grupoSuplementos = {
    categorias: [catSaude],
    incluir_fontes_cat: true,
    termos_lista: ['creatina', 'creapure', 'whey', 'pre treino', 'omega 3', 'vitamina', 'colageno', 'magnesio', 'melatonina', 'barra de proteina'],
    rotulo: 'Suplementos & Saúde 💊',
  };
  const grupoSkincare = {
    categorias: ['beleza'],
    incluir_fontes_cat: true,
    termos_lista: ['principia', 'cerave', 'la roche', 'isdin', 'vichy', 'bioderma', 'creamy', 'sallve', 'protetor solar', 'serum', 'niacinamida', 'retinol', 'acido hialuronico', 'cicaplast'],
    rotulo: 'Skincare & Dermocosméticos 💄',
  };
  const grupoAlta = { apenas_em_alta: true, incluir_fontes_cat: true, rotulo: 'Produtos em Alta Agora 🔥' };
  const grupoCupons = { apenas_cupons_loja: true, incluir_fontes_cat: true, rotulo: 'Cupons & Lotes das Lojas 🎟️' };
  const grupoModa = {
    lojas: ['shein', 'shopee', 'ml', 'amazon', 'centauro', 'netshoes', 'nike', 'adidas', 'renner', 'cea', 'riachuelo', 'dafiti', 'zattini', 'hering'],
    categorias: [catModa],
    incluir_fontes_cat: true,
    termos_lista: ['tenis', 'nike', 'adidas', 'shein', 'vestido', 'jaqueta', 'camiseta', 'moletom', 'calca', 'roupa', 'bolsa', 'chinelo', 'sapatilha', 'conjunto'],
    rotulo: 'Moda, Roupas & Tênis 👗',
  };
  const grupoFarmacia = {
    lojas: ['drogaraia', 'drogasil', 'pacheco', 'panvel', 'araujo', 'paguemenos'],
    categorias: [...new Set([catSaude, 'beleza', 'bebe'])],
    rotulo: 'Farmácias Confiáveis',
  };
  const mapaGrupos = {
    farmacia: grupoFarmacia,
    farmacias: grupoFarmacia,
    drogaria: grupoFarmacia,
    drogarias: grupoFarmacia,
    suplemento: grupoSuplementos,
    suplementos: grupoSuplementos,
    skincare: grupoSkincare,
    dermo: grupoSkincare,
    dermocosmeticos: grupoSkincare,
    moda: grupoModa,
    roupa: grupoModa,
    roupas: grupoModa,
    tenis: grupoModa,
    calcado: grupoModa,
    calcados: grupoModa,
    vestuario: grupoModa,
    looks: grupoModa,
    cupons: grupoCupons,
    cupom: grupoCupons,
    hardware: { lojas: ['kabum', 'terabyte', 'pichau', 'amazon', 'ml'], rotulo: 'PC & Hardware' },
    alta: grupoAlta,
    emalta: grupoAlta,
    'em alta': grupoAlta,
    bombando: grupoAlta,
    quentes: grupoAlta,
    arabes: grupoArabes,
    arabe: grupoArabes,
    'perfume arabe': grupoArabes,
    'perfumes arabes': grupoArabes,
    nicho: grupoNicho,
    'perfume de nicho': grupoNicho,
    'perfumes de nicho': grupoNicho,
  };
  if (mapaGrupos[norm]) {
    return Object.assign({ acao: 'buscar', limite: 5, limite_explicito: true }, mapaGrupos[norm]);
  }
  const mapaLojas = {
    amazon: 'amazon', amz: 'amazon',
    ml: 'ml', mercadolivre: 'ml', 'mercado livre': 'ml',
    shopee: 'shopee',
    shein: 'shein',
    tiktok: 'tiktok', 'tiktok shop': 'tiktok', 'tiktok shopping': 'tiktok', tk: 'tiktok',
    kabum: 'kabum', kbm: 'kabum',
    terabyte: 'terabyte', terabyteshop: 'terabyte', trb: 'terabyte',
    pichau: 'pichau', pch: 'pichau',
    drogaraia: 'drogaraia', raia: 'drogaraia', 'droga raia': 'drogaraia',
    drogasil: 'drogasil',
    pacheco: 'pacheco', 'drogaria pacheco': 'pacheco', 'drogarias pacheco': 'pacheco', 'drogaria sao paulo': 'pacheco',
    panvel: 'panvel',
    araujo: 'araujo', 'drogaria araujo': 'araujo',
    paguemenos: 'paguemenos', 'pague menos': 'paguemenos',
    belezanaweb: 'belezanaweb', bnw: 'belezanaweb', 'beleza na web': 'belezanaweb',
    epocacosmeticos: 'epocacosmeticos', epoca: 'epocacosmeticos', 'epoca cosmeticos': 'epocacosmeticos',
    boticario: 'boticario', oboticario: 'boticario', 'o boticario': 'boticario',
    natura: 'natura',
    sephora: 'sephora',
    centauro: 'centauro',
    netshoes: 'netshoes',
    nike: 'nike',
    adidas: 'adidas',
    renner: 'renner', 'lojas renner': 'renner',
    cea: 'cea', 'c&a': 'cea', 'c e a': 'cea',
    riachuelo: 'riachuelo', rchlo: 'riachuelo',
    dafiti: 'dafiti',
    zattini: 'zattini',
    hering: 'hering',
  };
  const cats = Object.keys((cfg && cfg.categorias) || CATEGORIAS).filter((c) => c !== 'top');
  const apelidosBusca = {
    games: 'tech', gamer: 'tech', game: 'tech', informatica: 'tech',
    perfumaria: catPerfumes, fragrancias: catPerfumes,
    vitaminas: catSaude, creatina: catSaude, whey: catSaude,
    maquiagem: 'beleza', cabelos: 'beleza', cosmeticos: 'beleza',
    roupa: catModa, roupas: catModa, tenis: catModa, calcados: catModa, vestuario: catModa,
  };
  const acharCat = (s) => cats.find((c) => c === s)
    || (apelidosBusca[s] && cats.includes(apelidosBusca[s]) ? apelidosBusca[s] : null)
    || (s.length >= 4 && s !== 'perfume' ? cats.find((c) => c.startsWith(s)) : null);

  if (mapaLojas[norm]) {
    const lj = mapaLojas[norm];
    return { acao: 'buscar', lojas: [lj], limite: 4, limite_explicito: true, rotulo: nomeLoja(lj) };
  }
  const aliasesOrdenados = Object.keys(mapaLojas).sort((a, b) => b.length - a.length);
  for (const alias of aliasesOrdenados) {
    if (!norm.startsWith(alias + ' ')) continue;
    const lj = mapaLojas[alias];
    const restoNorm = norm.slice(alias.length).trim();
    const restoOrig = arg.replace(new RegExp('^' + alias.replace(/\s+/g, '\\s+') + '\\s+', 'i'), '').trim();
    const catSub = acharCat(restoNorm);
    if (catSub) {
      const info = (cfg && cfg.categorias && cfg.categorias[catSub]) || CATEGORIAS[catSub] || { nome: catSub };
      return { acao: 'buscar', lojas: [lj], categorias: [catSub], limite: 4, limite_explicito: true, rotulo: `${nomeLoja(lj)} · ${info.nome || catSub}` };
    }
    if (restoOrig) {
      return { acao: 'buscar', lojas: [lj], termo: restoOrig, limite: 4, limite_explicito: true, rotulo: `${nomeLoja(lj)} · ${restoOrig}` };
    }
  }
  const catAchada = acharCat(norm);
  if (catAchada) {
    const info = (cfg && cfg.categorias && cfg.categorias[catAchada]) || CATEGORIAS[catAchada] || { nome: catAchada };
    return { acao: 'buscar', categorias: [catAchada], limite: 4, limite_explicito: true, rotulo: info.nome || catAchada };
  }
  return { acao: 'buscar', termo: arg, limite: 4, limite_explicito: true, rotulo: arg };
}

module.exports = {
  PLATAFORMAS, CATEGORIAS, CANAIS_SUGERIDOS, TODAS_LOJAS_RADAR,
  esquema, padrao, montarConfig, linhasFaltantes,
  interpretarComandoConfig, interpretarComandoCanais, interpretarComandoLogo, textoAfiliados,
  textoStatusRadar, interpretarComandoRadar, resolverCategoriaCfg,
};
