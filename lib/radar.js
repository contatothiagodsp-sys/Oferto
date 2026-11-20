'use strict';
// Radar Multi-Fonte gratuito (Mercado Livre, Amazon, Shopee, Shein e TikTok Shop):
// · coleta promoções públicas (Promobit por loja e nicho, Shopee Affiliate Open API e canais t.me/s/ opcionais)
// · desempacota redirecionamentos em até 3 saltos e remove 100% de tags/afiliados de terceiros
// · injeta automaticamente o afiliado do próprio usuário, preserva cupom e parcelamento sem juros
// · respeita o esquema estrito das Data Tables e funciona em 1-clique (cards) ou /modo piloto (automático).
const { round2, formatBRL, slug, truncar, novoId, partesData, diaISO } = require('./util');
const { sha256Hex } = require('./sha256');
const { parseUrl, identificar, nomeLoja, origemLoja, urlCentralCupons, logoLoja, ehImagemLojaOficial, normalizarImagemOferta } = require('./lojas');
const { ehCurto, textoRespostaHttp } = require('./curtos');
const { extrairLinksProduto, extrairDoTexto, tituloDaUrl, limparMencoesTerceiros, pareceChamadaOuGancho, ehFalsoKpop, classificarCategoria, bateTermoInteligente, normalizarBusca, CATEGORIA_PADRAO_LOJA, detectarEscopoCupom, detectarResgatePrevioCupom, detectarTagCampanha, lerPaginaProduto, qtdUnidadesOferta, recalcularParcelamentoComCupom, avaliarRepeticao24h } = require('./extrator');
const { extrairHitsRespostaMercado, casarProdutosMercado, avaliarPrecoMercado } = require('./mercado');
const { planejarLinks, statusAfiliadoFonte } = require('./links');
const shopee = require('./shopee');
const { avaliarSelo, precisaSnapshot, origemMin90 } = require('./selo');
const textos = require('./textos');
const { textoStatusRadar, interpretarComandoRadar } = require('./config');
const { msgAdmin } = require('./telegram');
const { chamadaCard, linhaOferta, linhaPreco, temDestinoTelegram, limiteTopDia } = require('./fluxos');
const { agenteAtivo, bateTermoComSinonimos, avaliarBoostMarketing } = require('./agentes');
const { HDRS_WEB, wrapUrlRadar, wrapUrlCurtoRadar, planejarFontesRadar } = require('./radar-fontes');
const { decodificarEntidadesWeb, preservarQtdUnidadesTitulo, aplicarMetadadosLojaKpopShopee, aplicarRedirRadar1, aplicarRedirRadar2 } = require('./radar-redir');
const { LOJAS_ENRIQUECER_PAGINA, FONTES_CATALOGO_DIRETO, LOJAS_KPOP_ESPECIALIZADAS, extrairDadosHtmlSocial, extrairProdutoHtmlSocial, resolverReqs3EmCands, prepararPaginasRadar } = require('./radar-paginas');
const { publicarLoteRadar } = require('./radar-pub');

const TECLADO_AUTO = { inline_keyboard: [[{ text: '⏳ Publicando automaticamente…', callback_data: 'noop' }]] };

const LISTA_PERFUMES_ARABES = [
  'lattafa', 'asad', 'fakhar', 'khamrah', 'yara', 'afnan', '9pm', 'club de nuit', 'armaf',
  'al haramain', 'amber oud', 'detour noir', 'rasasi', 'hawas', 'al wataniah', 'sabah al ward',
  'durrat al aroos', 'attar al wesal', 'maison alhambra', 'kismet', 'jean lowe', 'orientica',
  'royal amber', 'bharara', 'french avenue', 'liquid brun', 'paris corner', 'zimaya',
  'swiss arabian', 'shaghaf', 'turathi', 'perfume arabe',
];

const LISTA_PERFUMES_NICHO = [
  'parfums de marly', 'layton', 'delina', 'althair', 'herod', 'pegasus', 'creed', 'aventus',
  'nishane', 'hacivat', 'ani', 'xerjoff', 'naxos', 'erba pura', 'mancera', 'cedrat boise',
  'red tobacco', 'montale', 'arabians tonka', 'initio', 'side effect', 'oud for greatness',
  'amouage', 'tom ford', 'oud wood', 'tobacco vanille', 'ombre leather', 'baccarat rouge',
  'kurkdjian', 'le labo', 'santal 33', 'byredo', 'acqua di parma', 'roja', 'diptyque',
  'perfume de nicho',
];

const LISTA_PERFUMES_DESEJADOS = [
  'sauvage', 'bleu de chanel', 'coco mademoiselle', 'allure homme', '212 vip', '212 heroes',
  'good girl', 'bad boy', 'scandal', 'le male', 'la belle', 'invictus', 'one million', '1 million',
  'lady million', 'phantom', 'fame', 'acqua di gio', 'stronger with you', 'armani code',
  'my way', 'la vie est belle', 'idole', 'versace eros', 'dylan blue', 'ysl libre', 'myslf',
  'la nuit de l homme', 'gentleman givenchy', 'l interdit', 'azzaro wanted', 'the most wanted',
  'polo blue', 'montblanc explorer', 'chloe', 'prada paradoxe', 'luna rossa', 'light blue',
  'malbec', 'essencial oud', 'essencial unico', 'essencial exclusivo', 'lily', 'zaad',
  'elysee', 'floratta red', 'egeo',
];

const LISTA_TECH_DESEJADOS = [
  'ps5', 'playstation 5', 'dualsense', 'gta 6', 'gta vi', 'xbox series', 'switch 2',
  'steam deck', 'airpods', 'iphone 15', 'iphone 16', 'galaxy s24', 'galaxy s25',
  'rtx 4060', 'rtx 4070', 'rtx 5060', 'rtx 5070', 'ryzen 7', 'echo dot', 'kindle',
];

const LISTA_CASA_VIRAIS = [
  'stanley', 'robo aspirador', 'aspirador robo', 'nespresso', 'lava loucas', 'wap',
  'air fryer', 'pampers confort', 'pampers premium',
];

const LISTA_SAUDE_DESEJADOS = [
  'creatina', 'creapure', 'whey', 'growth', 'max titanium', 'dux', 'integralmedica',
  'soldiers', 'vitafor', 'essential nutrition', 'omega 3', 'melatonina', 'colageno verisol',
  'magnesio', 'coenzima q10', 'oral b', 'escova eletrica', 'irrigador oral', 'waterpik', 'omron',
];

const LISTA_BELEZA_DESEJADOS = [
  'principia', 'cerave', 'la roche', 'cicaplast', 'effaclar', 'isdin', 'vichy', 'bioderma',
  'cetaphil', 'eucerin', 'creamy', 'sallve', 'wella', 'kerastase', 'truss', 'elseve glicolico',
  'boca rosa', 'bruna tavares', 'oneblade', 'episol',
];

const LISTA_MODA_TENDENCIAS = [
  'dunk', 'air force', 'air max', 'samba', 'gazelle', 'ultraboost', 'new balance 550',
  'olympikus corre', 'jaqueta puffer', 'wide leg', 'calca cargo', 'oversized',
  'conjunto academia', 'conjunto shein', 'vans old skool', 'all star',
];

const LISTA_KPOP_DESEJADOS = [
  'lightstick', 'army bomb', 'carat bong', 'candybong', 'stray kids', 'bts', 'blackpink',
  'twice', 'enhypen', 'seventeen', 'newjeans', 'aespa', 'photocard', 'bt21', 'skzoo', 'hanteo',
];

function contemTermoLista(norm, lista) {
  return lista.some((kw) => {
    const k = kw.trim();
    return k && (norm.includes(' ' + k + ' ') || (k.length >= 5 && norm.includes(k)));
  });
}

/**
 * Avalia se o candidato está "em alta" (cliques/engajamento, pedidos da comunidade em bfx_alertas ou catálogo de mais procurados).
 * Retorna { nivel: '' | 'desejado' | 'em_alta' | 'explodindo', desejo_tipo, bonus, pedido_comunidade }.
 */
function avaliarEmAlta(cand, alertasAtivos) {
  const norm = normalizarBusca([cand && cand.titulo, cand && cand.categoria_fonte].filter(Boolean).join(' '));
  let desejo_tipo = '';
  let bonus = 0;

  if (contemTermoLista(norm, LISTA_PERFUMES_NICHO)) {
    desejo_tipo = 'perfume_nicho';
    bonus += 32 + (['ml', 'sephora', 'belezanaweb', 'epocacosmeticos'].includes(cand.loja) ? 8 : 0);
  } else if (contemTermoLista(norm, LISTA_PERFUMES_ARABES)) {
    desejo_tipo = 'perfume_arabe';
    bonus += 30 + (cand.loja === 'ml' ? 12 : 0);
  } else if (contemTermoLista(norm, LISTA_PERFUMES_DESEJADOS)) {
    desejo_tipo = 'perfume_desejado';
    bonus += 22 + (cand.loja === 'ml' ? 6 : 0);
  } else if (contemTermoLista(norm, LISTA_SAUDE_DESEJADOS)) {
    desejo_tipo = 'saude_desejada';
    bonus += 24 + (['drogaraia', 'drogasil', 'pacheco', 'panvel', 'araujo', 'amazon', 'ml'].includes(cand.loja) ? 6 : 0);
  } else if (contemTermoLista(norm, LISTA_BELEZA_DESEJADOS)) {
    desejo_tipo = 'beleza_desejada';
    bonus += 22 + (['belezanaweb', 'epocacosmeticos', 'sephora', 'drogaraia', 'amazon'].includes(cand.loja) ? 6 : 0);
  } else if (contemTermoLista(norm, LISTA_MODA_TENDENCIAS)) {
    desejo_tipo = 'moda_tendencia';
    bonus += 24 + (['shein', 'shopee', 'ml', 'centauro', 'netshoes', 'nike', 'adidas', 'renner'].includes(cand.loja) ? 6 : 0);
  } else if (contemTermoLista(norm, LISTA_TECH_DESEJADOS)) {
    desejo_tipo = 'tech_desejado';
    bonus += 26;
  } else if (contemTermoLista(norm, LISTA_KPOP_DESEJADOS)) {
    desejo_tipo = 'kpop_desejado';
    bonus += 24 + (cand.loja_oficial || cand.loja_kpop_curada ? 10 : 0);
  } else if (cand && cand.loja_kpop_curada) {
    desejo_tipo = 'kpop_desejado';
    bonus += 28;
  } else if (contemTermoLista(norm, LISTA_CASA_VIRAIS)) {
    desejo_tipo = 'casa_viral';
    bonus += 18;
  }

  let pedido_comunidade = false;
  for (const a of alertasAtivos || []) {
    if (!a || a.ativo === false || !a.termo) continue;
    if (bateTermoInteligente(cand.titulo, a.termo)) {
      pedido_comunidade = true;
      bonus += 35;
      break;
    }
  }

  const cliques = Number(cand && cand.cliques) || 0;
  const eng = Number(cand && cand.engajamento) || 0;
  const likes = Number(cand && cand.likes) || 0;
  const coms = Number(cand && cand.comentarios) || 0;
  const vendas = Number(cand && cand.vendas) || 0;

  let nivel = '';
  if (cliques >= 300 || eng >= 350 || likes >= 25 || coms >= 12 || vendas >= 500) {
    nivel = 'explodindo';
    bonus += 55;
  } else if ((cand && cand.em_alta_vitrine) || cliques >= 100 || eng >= 120 || likes >= 10 || coms >= 5 || vendas >= 200 || pedido_comunidade) {
    nivel = 'em_alta';
    bonus += 35;
  } else if (desejo_tipo) {
    nivel = 'desejado';
  }

  return { nivel, desejo_tipo, bonus, pedido_comunidade };
}

function normalizarLojaPromobit(storeDomain, storeParam, storeName) {
  const s = [storeDomain, storeParam, storeName].filter(Boolean).join(' ').toLowerCase();
  if (/amazon/.test(s)) return 'amazon';
  if (/mercadoli[vb]re|mercado-livre/.test(s)) return 'ml';
  if (/shopee/.test(s)) return 'shopee';
  if (/shein/.test(s)) return 'shein';
  if (/tiktok/.test(s)) return 'tiktok';
  if (/aliexpress/.test(s)) return 'aliexpress';
  if (/kabum/.test(s)) return 'kabum';
  if (/terabyte/.test(s)) return 'terabyte';
  if (/pichau/.test(s)) return 'pichau';
  if (/acer/.test(s)) return 'acer';
  if (/motorola/.test(s)) return 'motorola';
  if (/shop\.samsung|samsung\s*shop/.test(s)) return 'samsung';
  if (/drogaraia|droga-raia|droga raia/.test(s)) return 'drogaraia';
  if (/drogasil/.test(s)) return 'drogasil';
  if (/pacheco|drogariasaopaulo|drogaria-sao-paulo|drogaria\s+sao\s+paulo/.test(s)) return 'pacheco';
  if (/panvel/.test(s)) return 'panvel';
  if (/araujo/.test(s)) return 'araujo';
  if (/paguemenos|pague-menos|pague\s+menos/.test(s)) return 'paguemenos';
  if (/venancio/.test(s)) return 'venancio';
  if (/oficialfarma|oficial-farma|oficial\s+farma/.test(s)) return 'oficialfarma';
  if (/maxtitanium|max-titanium|max\s+titanium/.test(s)) return 'maxtitanium';
  if (/rihappy|ri-happy|ri\s+happy/.test(s)) return 'rihappy';
  if (/alobebe|alo-bebe|alo\s+bebe/.test(s)) return 'alobebe';
  if (/belezanaweb|beleza-na-web|beleza na web/.test(s)) return 'belezanaweb';
  if (/epoca/.test(s)) return 'epocacosmeticos';
  if (/boticario/.test(s)) return 'boticario';
  if (/natura/.test(s)) return 'natura';
  if (/sephora/.test(s)) return 'sephora';
  if (/mahogany/.test(s)) return 'mahogany';
  if (/creamy/.test(s)) return 'creamy';
  if (/ikesaki/.test(s)) return 'ikesaki';
  if (/centauro/.test(s)) return 'centauro';
  if (/netshoes/.test(s)) return 'netshoes';
  if (/\bnike\b/.test(s)) return 'nike';
  if (/adidas/.test(s)) return 'adidas';
  if (/olympikus/.test(s)) return 'olympikus';
  if (/mizuno/.test(s)) return 'mizuno';
  if (/underarmour|under-armour|under\s+armour/.test(s)) return 'underarmour';
  if (/farmrio|farm-rio|farm\s+rio/.test(s)) return 'farmrio';
  if (/renner|lojas-renner/.test(s)) return 'renner';
  if (/\bcea\b|c&a|cea\.com/.test(s)) return 'cea';
  if (/riachuelo/.test(s)) return 'riachuelo';
  if (/dafiti/.test(s)) return 'dafiti';
  if (/zattini/.test(s)) return 'zattini';
  if (/hering/.test(s)) return 'hering';
  if (/polishop/.test(s)) return 'polishop';
  if (/electrolux/.test(s)) return 'electrolux';
  if (/brastemp/.test(s)) return 'brastemp';
  if (/consul/.test(s)) return 'consul';
  if (/magalu|magazine\s*luiza|magazineluiza|magazinevoce/.test(s)) return 'magalu';
  return '';
}

const CUPOM_GENERICO = /^(?:GRATIS|FREE|OFF|CUPOM|PROMO|DESCONTO|OFERTA|APP|PRIME)$/i;
// Cupons exclusivos de outros sites de promoção (não funcionam para o seu público): descarta.
const CUPOM_TERCEIRO = /PROMOBIT|PELANDO|GATRY|MELIUZ|CUPONOMIA|OFERTAESPERTA|CUPOMVALIDO/i;

/** Extrai ofertas públicas (e cupons oficiais quando fonte = promobit_cupons) do HTML com __NEXT_DATA__ do Promobit. */
function lerPromobitHtml(html, fonte) {
  const txt = String(html || '');
  const m = txt.match(/<script[^>]*id\s*=\s*["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return [];
  let raiz;
  try { raiz = JSON.parse(m[1]); } catch (e) { return []; }
  const pp = (raiz && raiz.props && raiz.props.pageProps) || {};
  const srv = pp.serverOffers || {};
  const featRaw = Array.isArray(pp.serverFeaturedOffers)
    ? pp.serverFeaturedOffers
    : ((pp.serverFeaturedOffers && pp.serverFeaturedOffers.offers) || []);
  const featIds = new Set(featRaw.map((x) => x && x.offerId).filter(Boolean));
  const srvArr = Array.isArray(srv) ? srv : (srv.offers || srv.items || []);
  const srvIds = new Set(srvArr.map((x) => x && x.offerId).filter(Boolean));
  const arr = srvArr
    .concat(featRaw, Array.isArray(pp.sidebarFeaturedOffers) ? pp.sidebarFeaturedOffers : []);

  const ehFonteCupons = !!(fonte && fonte.tipo === 'promobit_cupons');
  const out = [];
  for (const o of arr) {
    if (!o || !o.offerId || !o.offerTitle) continue;
    const tipo = String(o.offerPriceType || '').toUpperCase();
    const temLojaInfo = !!(o.storeDomain || o.storeParam || o.storeName);
    const loja = normalizarLojaPromobit(o.storeDomain, o.storeParam, o.storeName) || (!temLojaInfo && fonte && fonte.loja_hint) || '';
    if (!loja) continue;

    const likes = Number(o.offerLikes) || 0;
    const cliques = Number(o.offerClicks) || 0;
    const comentarios = Number(o.offerComments) || 0;
    const engajamento = Number(o.offerEngagementScore) || 0;
    const instTxt = String(o.offerInstructionsRaw || o.offerInstructions || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    let cupom = '';
    const rawCoup = String(o.offerCoupon || '').trim();
    if (/^[A-Z0-9_-]{3,25}$/i.test(rawCoup) && !CUPOM_GENERICO.test(rawCoup) && !CUPOM_TERCEIRO.test(rawCoup)) {
      cupom = rawCoup.toUpperCase();
    }

    if (ehFonteCupons && tipo === 'COUPON') {
      const titCup = String(o.offerTitle || '').trim();
      if (/exclusivo\s+(?:promobit|pelando|gatry)|cuponomia|meliuz/i.test(titCup + ' ' + instTxt)) continue;
      if (CUPOM_TERCEIRO.test(rawCoup)) continue;
      if (!cupom && !/(?:cupom|cupons|desconto|off\b|lote|às\s+\d{1,2}h)/i.test(titCup)) continue;
      out.push({
        radar_key: 'pbc_' + o.offerId,
        eh_cupom_loja: true,
        loja,
        titulo: truncar(titCup, 160),
        instrucoes: instTxt,
        preco: 0,
        preco_de: null,
        preco_sem_cupom: null,
        desconto_pct: Number(o.offerDiscontPercentage) || 0,
        cupom,
        cupom_auto: !cupom ? truncar(String(o.offerShortTitle || titCup), 60) : '',
        parcelamento: '',
        pix: false,
        imagem: logoLoja(loja, null),
        destaque: !!o.offerIsHighlight || /TOP_OFFER/i.test(String(o.offerStatusName || '')),
        em_alta_vitrine: featIds.has(o.offerId),
        likes,
        cliques,
        comentarios,
        engajamento,
        exige_resgate_previo: detectarResgatePrevioCupom(titCup + ' ' + instTxt, cupom),
        categoria_fonte: [o.categoryName || '', o.subcategoryName || '', o.offerSlug || '', instTxt].filter(Boolean).join(' '),
        categoria_hint: '',
        redir_url: '',
        url: '',
        fonte_radar: 'promobit_cupons',
      });
      continue;
    }

    if (tipo === 'COUPON' || tipo === 'STARTING_AT') continue;
    const preco = round2(Number(o.offerPrice));
    if (!Number.isFinite(preco) || preco <= 1) continue;
    if (/^(?:cupom exclusivo|cupom de r\$|as melhores d[ao] )/i.test(String(o.offerTitle))) continue;

    // Trava anti-"metade do dobro": âncora inflada > 5,5x sem validação da comunidade é ignorada
    const pAnt = Number(o.offerOldPrice);
    let preco_de = Number.isFinite(pAnt) && pAnt > preco ? round2(pAnt) : null;
    if (preco_de && preco_de > preco * 5.5 && likes < 10 && cliques < 80) {
      preco_de = null;
    }
    let descPct = preco_de ? round2(((preco_de - preco) / preco_de) * 100) : (Number(o.offerDiscontPercentage) || 0);
    if (!Number.isFinite(descPct) || descPct < 0) descPct = 0;
    if (!preco_de && descPct >= 85 && likes < 10 && cliques < 80) descPct = 0;

    let parcelamento = '';
    const mParc = instTxt.match(/\b(\d{1,2}x)\s*(?:de\s*)?(?:R\$\s*([\d.]+,\d{2}))?\s*sem\s*juros\b/i);
    if (mParc) {
      parcelamento = mParc[2]
        ? `Em até ${mParc[1]} de R$ ${mParc[2]} sem juros`
        : `Em até ${mParc[1]} de ${formatBRL(preco / Number(mParc[1].replace(/\D/g, '')))} sem juros`;
    } else if (Array.isArray(o.offerTags) && o.offerTags.some((t) => t && /sem\s+juros/i.test(t.name || ''))) {
      parcelamento = 'Parcelamento sem juros disponível';
    }
    const pix = /\b(?:no\s+pix|[àa]\s+vista\s+no\s+pix)\b/i.test(instTxt)
      || (Array.isArray(o.offerTags) && o.offerTags.some((t) => t && /\bpix\b/i.test(t.name || '')));
    const pbTagsTxt = Array.isArray(o.offerTags) ? o.offerTags.map((t) => (t && t.name) || '').join(' ') : '';
    const campanhaPb = detectarTagCampanha([o.offerTitle, instTxt, pbTagsTxt, o.campaignName, o.eventName, o.badgeText].filter(Boolean).join(' '));

    let imagem = String(o.offerPhoto || '').trim();
    if (imagem.startsWith('/')) imagem = 'https://i.promobit.com.br' + imagem;
    else if (!/^https?:\/\//i.test(imagem)) imagem = '';
    imagem = normalizarImagemOferta(imagem);

    out.push({
      radar_key: 'pb_' + o.offerId,
      loja,
      titulo: truncar(String(o.offerTitle).trim(), 180),
      preco,
      preco_de,
      preco_sem_cupom: cupom && preco_de ? preco_de : null,
      desconto_pct: descPct,
      cupom,
      cupom_auto: '',
      parcelamento,
      pix,
      campanha: campanhaPb || '',
      exige_resgate_previo: detectarResgatePrevioCupom(String(o.offerTitle) + ' ' + instTxt, cupom),
      imagem,
      destaque: !!o.offerIsHighlight || /TOP_OFFER/i.test(String(o.offerStatusName || '')),
      em_alta_vitrine: featIds.has(o.offerId) || (fonte && fonte.tipo === 'promobit_alta' && likes >= 8),
      likes,
      cliques,
      comentarios,
      engajamento,
      categoria_fonte: [o.categoryName || '', o.subcategoryName || '', o.offerSlug || ''].filter(Boolean).join(' '),
      categoria_hint: (srvIds.has(o.offerId) && fonte && fonte.categoria_hint) || '',
      redir_url: `https://www.promobit.com.br/Redirect/to/${o.offerId}/`,
      url: '',
      fonte_radar: 'promobit',
    });
  }
  return out;
}

/** Extrai ofertas públicas de canais do Telegram via https://t.me/s/<canal>. */
function lerCanalTelegramPublico(html, canal) {
  const txt = String(html || '');
  const blocos = txt.split(/<div[^>]+class="[^"]*tgme_widget_message_wrap/i).slice(1);
  const out = [];
  for (const bloco of blocos) {
    const mPost = bloco.match(/data-post="([^"]+)"/i);
    const mTxt = bloco.match(/class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (!mTxt) continue;
    const linksHtml = [...mTxt[1].matchAll(/href="(https?:\/\/[^"]+)"/gi)].map((x) => x[1].replace(/&amp;/g, '&'));
    const textoPlano = decodificarEntidadesWeb(
      mTxt[1]
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' '),
    ).trim();
    if (/(?:^\s*🚨\s*cupons?\s+|cupom\s+ifood|v[aá]lido\s+na\s+lista)/i.test(textoPlano)) continue;
    const linksBrutos = extrairLinksProduto(textoPlano, linksHtml);
    if (!linksBrutos.length) continue;
    // Prioriza link de produto antes de links de "Resgate todos os cupons" (ex.: CanaltechOfertas põe /m/cupom-de-desconto antes)
    const links = linksBrutos.slice().sort((a, b) => {
      const scoreLink = (u) => {
        const idxH = mTxt[1].indexOf(u);
        const uCurto = u.replace(/^https?:\/\//i, '');
        const idxT = textoPlano.indexOf(u) >= 0 ? textoPlano.indexOf(u) : textoPlano.indexOf(uCurto);
        const ultLinha = (s) => String(s || '').split(/\r?\n|<br\s*\/?>/i).pop().replace(/<[^>]*>/g, ' ');
        const ctxT = idxT >= 0 ? ultLinha(textoPlano.slice(Math.max(0, idxT - 120), idxT)) : '';
        const ctxH = idxH >= 0 ? ultLinha(mTxt[1].slice(Math.max(0, idxH - 140), idxH)) : '';
        const ctx = ctxT + ' ' + ctxH;
        const ehHubCupom = /(?:resgate\s+todos\s+os\s+cupons|aba\s+de\s+cupons|resgatar\s+cupons?|todos\s+os\s+cupons)/i.test(ctx)
          || /\/m\/cupom|\/promotion\/psp\/|\/cupons(?:-diarios)?(?:[/?#]|$)/i.test(u);
        return ehHubCupom ? 1 : 0;
      };
      return scoreLink(a) - scoreLink(b);
    });
    // Detecta condição multi-unidade ("adicione 2 unidades", "👕 2x Camiseta", "leve 2 camisetas por R$ 96", "R$ 48 cada") ANTES de podar 1º parágrafo
    const mQtdUn = textoPlano.match(/(?:adicione|coloque|leve|compre|pegue|na\s+compra\s+de|levando|comprando)\s+(\d+)\s+(?:[\wÀ-ÿ]{2,15}\s+)?(?:unidades?|pe[cç]as?|itens?|no\s+carrinho|por\s+R\$)/i)
      || textoPlano.match(/(?:^|\n)[^\w\n]{0,6}(\d+)\s*x\s+(?!de\s+r\$)[A-ZÀ-ÿ]/i)
      || textoPlano.match(/\b(\d+)\s+unidades?\s+por\s+R\$/i);
    const qtdUnidades = mQtdUn && Number(mQtdUn[1]) >= 2 && Number(mQtdUn[1]) <= 12 ? Number(mQtdUn[1]) : 0;
    // Quando o canal usa 1º parágrafo de chamada seguido de linha em branco + nome do produto + linha em branco + preço (padrão @xetdaspromocoes), remove o parágrafo de chamada
    const paragrafos = textoPlano.split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter(Boolean);
    const baseTexto = (paragrafos.length >= 3
      && !/R\$|https?:/i.test(paragrafos[0])
      && !/^(?:R\$|de\s+R\$|use\s+o?\s*cupom|vendido|loja|compre|garanta|resgate|http|💵|🏷|✅)/i.test(paragrafos[1]))
      ? paragrafos.slice(1).join('\n\n')
      : textoPlano;
    const linhasBase = baseTexto
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !/\?\s*[^a-zA-Z0-9À-ÿ]*$/.test(l) || /R\$|https?:/i.test(l));
    const pareceChamada = (l, idx) => idx <= 1 && linhasBase.length >= 3
      && !/R\$|https?:/i.test(l)
      && (
        /^(?:📢|🚨|⚡|💥)\s*/u.test(l)
        || pareceChamadaOuGancho(l)
      )
      && linhasBase.slice(idx + 1).some((nx) => !/^(?:R\$|de\s+R\$|use\s+o?\s*cupom|vendido|loja|compre|garanta|resgate|http|💵|🏷|✅)/i.test(nx) && !pareceChamadaOuGancho(nx));
    const linhasFiltradas = linhasBase.filter((l, idx) => !pareceChamada(l, idx));
    const ext = extrairDoTexto(linhasFiltradas.length >= 2 ? linhasFiltradas.join('\n') : (linhasBase.length >= 2 ? linhasBase.join('\n') : textoPlano));
    if (!ext.preco) continue;

    const candidatosUrl = links.filter((u) => {
      const iu = identificar(u);
      return ehCurto(u) || (!iu.erro && iu.loja !== 'outra');
    });
    if (!candidatosUrl.length) continue;
    const u0 = candidatosUrl[0];
    const id = identificar(u0);
    const curto = ehCurto(u0);
    const alts = candidatosUrl.slice(1);

    // NUNCA extrai foto de tgme_widget_message_photo_wrap (cdn*.telesco.pe): fotos subidas por canais de terceiros contêm @handle/watermark!
    const key = mPost ? 'tg_' + mPost[1].replace(/[^\w-]/g, '_') : 'tg_' + truncar(slug(ext.titulo || u0), 24);
    const cupomLimpo = ext.cupom && !CUPOM_TERCEIRO.test(ext.cupom) ? ext.cupom : '';
    const titBruto = limparMencoesTerceiros(ext.titulo || '');
    const slugInicial = !curto ? tituloDaUrl(id.url_limpa || u0) : '';
    let titFinal = (!titBruto || pareceChamadaOuGancho(titBruto)) && slugInicial ? slugInicial : (titBruto || slugInicial || `Oferta ${canal}`);
    if (qtdUnidades >= 2 && !new RegExp(`^\\s*(?:${qtdUnidades}\\s*x\\b|kit\\s+(?:com\\s+)?${qtdUnidades}\\b)`, 'i').test(titFinal) && !new RegExp(`\\b${qtdUnidades}\\s*(?:un(?:id(?:ades)?)?|unidades)\\b`, 'i').test(titFinal)) {
      titFinal = `${qtdUnidades}x ${titFinal}`;
    }
    const notaCada = qtdUnidades >= 2 ? ` (${formatBRL(round2(ext.preco / qtdUnidades))} cada)` : '';
    const campanhaFinal = ext.campanha || (qtdUnidades >= 2 ? `Adicione ${qtdUnidades} unidades${notaCada}` : '');
    out.push({
      radar_key: key,
      loja: curto ? (id.loja && id.loja !== 'outra' ? id.loja : '') : id.loja,
      produto_id: !curto && id.produto_id ? id.produto_id : '',
      titulo: truncar(titFinal, 180),
      _qtd_unidades: qtdUnidades || 1,
      preco: ext.preco,
      preco_de: ext.preco_de,
      preco_sem_cupom: ext.preco_sem_cupom || ((cupomLimpo || ext.cupom_auto) && ext.preco_de ? ext.preco_de : null),
      desconto_pct: ext.preco_de ? round2(((ext.preco_de - ext.preco) / ext.preco_de) * 100) : 0,
      cupom: cupomLimpo,
      cupom_auto: ext.cupom_auto || '',
      parcelamento: ext.parcelamento || '',
      pix: !!ext.pix,
      recorrencia: !!ext.recorrencia,
      recorrencia_preco: ext.recorrencia_preco != null ? ext.recorrencia_preco : null,
      recorrencia_pct: ext.recorrencia_pct != null ? ext.recorrencia_pct : null,
      campanha: campanhaFinal,
      tamanhos: ext.tamanhos || '',
      exige_resgate_previo: !!ext.exige_resgate_previo,
      imagem: normalizarImagemOferta(ext.imagem || ''),
      destaque: false,
      likes: 5,
      categoria_fonte: truncar(textoPlano.replace(/https?:\/\/\S+/g, ' '), 260),
      categoria_hint: /^(?:canaltechofertas|ofertasdecomputador)$/i.test(String(canal || '')) ? 'tech' : '',
      redir_url: curto ? u0 : '',
      redir_url_alts: alts,
      url: curto ? '' : id.url_limpa,
      fonte_radar: 'telegram_' + (canal || 'canal'),
    });
  }
  return out;
}

/** Extrai promoções públicas do Gatry que contenham link direto de loja aceita ou encurtador suportado. */
function lerGatryHtml(html) {
  const txt = String(html || '');
  const blocos = txt.split(/<(?:article|li)[^>]*>/i).slice(1);
  const out = [];
  for (const b of blocos) {
    const trecho = b.split(/<\/(?:article|li)>/i)[0] || '';
    if (!trecho.includes('R$')) continue;
    const hrefs = [...trecho.matchAll(/href="(https?:\/\/[^"]+)"/gi)]
      .map((m) => decodificarEntidadesWeb(m[1]))
      .filter((u) => !/(?:^|\.)gatry\.com|cloudfront\.net|accounts\.google/i.test(u));
    const links = extrairLinksProduto('', hrefs);
    if (!links.length) continue;
    const u0 = links[0];
    const id = identificar(u0);
    const curto = ehCurto(u0);
    if (id.erro && !curto) continue;
    if (!curto && id.loja === 'outra') continue;

    const plano = decodificarEntidadesWeb(trecho.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    const mPr = plano.match(/R\$\s*([\d.]+,\d{2})/);
    if (!mPr) continue;
    const preco = Number(mPr[1].replace(/\./g, '').replace(',', '.'));
    if (!(preco > 0)) continue;

    const mTit = trecho.match(/<a[^>]*href="[^"]*\/promocoes\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
      || trecho.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i);
    const tit = limparMencoesTerceiros(decodificarEntidadesWeb((mTit ? mTit[1] : plano.split('—')[0]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()));
    if (!tit || tit.length < 4) continue;
    const mImg = trecho.match(/src="(https?:\/\/[^"]+\.(?:jpe?g|png|webp)[^"]*)"/i);
    const imgGatry = mImg && ehImagemLojaOficial(mImg[1]) ? normalizarImagemOferta(mImg[1]) : '';

    out.push({
      radar_key: 'gt_' + sha256Hex(u0 + '|' + tit).slice(0, 12),
      loja: curto ? (id.loja && id.loja !== 'outra' ? id.loja : '') : id.loja,
      produto_id: !curto && id.produto_id ? id.produto_id : '',
      titulo: truncar(tit, 180),
      preco,
      preco_de: null,
      preco_sem_cupom: null,
      desconto_pct: 0,
      cupom: '',
      cupom_auto: '',
      parcelamento: '',
      pix: /\bpix\b/i.test(plano),
      exige_resgate_previo: false,
      imagem: imgGatry,
      destaque: false,
      likes: 6,
      categoria_fonte: '',
      categoria_hint: '',
      redir_url: curto ? u0 : '',
      url: curto ? '' : id.url_limpa,
      fonte_radar: 'gatry',
    });
  }
  return out;
}

const RE_MEDICAMENTO_RX = /\b(?:gen[eé]rico|tarja\s+(?:vermelha|preta)|venda\s+sob\s+prescri[cç][aã]o|receita\s+(?:m[eé]dica|branca|azul|amarela)|comprimidos?\s+(?:revestidos?|mastig[aá]veis|sublinguais|de\s+libera[cç][aã]o|dispers[ií]veis)|solu[cç][aã]o\s+(?:oral|injet[aá]vel|oft[aá]lmica|nasal)|creme\s+vaginal|pomada\s+vaginal|xarope|ampolas?|suposit[oó]rios?|col[ií]rios?|antibi[oó]tico|antidepressivo|ansiol[ií]tico|cortic[oó]ide|anti-?hipertensivo|hipoglicemiante|verm[ií]fugo|antiparasit[aá]rio|anticoncepcional|anastrazol|tamoxifeno|letrozol|prednisona|prednisolona|betametasona|hidrocortisona|amoxicilina|azitromicina|clavulanato|ciprofloxacino|levofloxacino|clindamicina|metronidazol|cefalexina|ceftriaxona|fluconazol|itraconazol|tioconazol|tinidazol|miconazol|cetoconazol|nistatina|clotrimazol|gentamicina|aciclovir|albendazol|ivermectina|mebendazol|nitazoxanida|dipirona|ibuprofeno|paracetamol|diclofenaco|nimesulida|cetoprofeno|meloxicam|celecoxibe|etoricoxibe|tramadol|code[ií]na|morfina|losartana|valsartana|olmesartana|candesartana|anlodipino|atenolol|captopril|carvedilol|bisoprolol|nebivolol|hidroclorotiazida|furosemida|espironolactona|amiodarona|omeprazol|esomeprazol|pantoprazol|rabeprazol|lansoprazol|clonazepam|alprazolam|diazepam|lorazepam|bromazepam|midazolam|zolpidem|fluoxetina|sertralina|escitalopram|citalopram|venlafaxina|desvenlafaxina|duloxetina|bupropiona|pregabalina|gabapentina|topiramato|carbamazepina|lamotrigina|quetiapina|risperidona|olanzapina|haloperidol|clorpromazina|rivotril|metilfenidato|ritalina|venvanse|lisdexanfetamina|metformina|glimepirida|gliclazida|dapagliflozina|empagliflozina|insulina|ozempic|mounjaro|saxenda|wegovy|semaglutida|tirzepatida|sibutramina|orlistate|sinvastatina|rosuvastatina|atorvastatina|pitavastatina|livalo|estatina|ezetimiba|fenofibrato|ciprofibrato|levotiroxina|euthyrox|clopidogrel|rivaroxabana|apixabana|enoxaparina|tadalafila?|sildenafila?|vardenafila|finasterida|dutasterida|isotretino[ií]na|roacutan|alendronato|alopurinol|colchicina|montelucaste|budesonida|salbutamol|formoterol|dexametasona|ciproeptadina|apevitin|folifolin|desogestrel|levonorgestrel|etinilestradiol|misoprostol|dorflex|neosaldina|buscopan|oxandrolona|clomifeno|durateston|deposteron|minoxidil\s+oral|font\s*d|koli\s*d3?|adora\s*d3?)\b/i;

// Vitamina D3 / Colecalciferol >= 5.000 UI (inclui erros de digitação como 5.0000 UI / 1.0000 UI) exige prescrição no BR (ANVISA IN 28/2018 libera OTC até 2.000 UI).
const RE_VITAMINA_D_ALTA_DOSE = /\b(?:vitamina\s*d3?|colecalciferol|dprev|addera\s*d3?|depura)\b[^.\n]{0,45}\b(?:(?:[5-9]|[1-9]\d)\.?000|5\.?0000|1\.?0000)\s*u\.?i\.?\b|\b50\.?000\s*u\.?i\.?\b/i;

// Categorias VTEX de farmácias que indicam medicamento controlado/prescrição/antiparasitário/etc.
const RE_CAT_MEDICAMENTO_RX = /(?:^|\/|\s)(?:prescri[cç][aã]o|medicamentos?\s+(?:controlados?|especiais|tarjados?|gen[eé]ricos?|de\s+refer[eê]ncia|similares?)|antiparasit[aá]rios?|antibi[oó]ticos?|antidepressivos?|ansiol[ií]ticos?|anti-?hipertensivos?|antif[uú]ngicos?|fungos\s+e\s+micoses|cortic[oó]ides?|dermatol[oó]gicos?|ginecol[oó]gicos?|colesterol|diabetes|oncologia|psiquiatria|neurologia|cardiologia)(?:\/|\s|$)/i;
const LOJAS_FARMACIA = new Set(['pacheco', 'drogaraia', 'drogasil', 'panvel', 'araujo', 'paguemenos', 'venancio', 'oficialfarma']);

const RE_PECA_REPOSICAO = /\b(?:recipiente\s+evaporador|gaveta\s+de\s+acr[ií]lico|prateleira\s+(?:de\s+vidro\s+)?para|borracha\s+(?:da\s+)?porta|gaxeta|placa\s+(?:eletr[oô]nica|pot[eê]ncia|interface)|painel\s+de\s+controle|moldura\s+para|kit\s+filtro\s+para|filtro\s+para\s+aspirador|termostato|resist[eê]ncia\s+para|mangueira\s+de\s+entrada|protetor\s+descart[aá]vel|saco\s+descart[aá]vel|tampa\s+de\s+vidro\s+para|puxador\s+para|bot[aã]o\s+manipulador|kit\s+instala[cç][aã]o|pe[cç]a\s+de\s+reposi[cç][aã]o|man[ií]pulo|bico\s+injetor|bomba\s+de\s+drenagem|v[aá]lvula\s+solenoide|dobradi[cç]a|vedador|retentor|correia\s+para|adaptador\s+(?:para|mysa))\b/i;
const LOJAS_FILTRAR_PECAS = new Set(['polishop', 'electrolux', 'brastemp', 'consul', 'alobebe', 'samsung']);

function reconstruirUrlVtexOficial(uBruta, linkText, lojaPadrao, urlFonte, originExtra) {
  const s = String(uBruta || '').trim();
  const parsedFonte = urlFonte ? parseUrl(urlFonte) : null;
  const originOficial = originExtra
    || (parsedFonte && !/(?:\.vtexcommercestable\.com\.br|\.myvtex\.com)$/i.test(parsedFonte.hostname) ? parsedFonte.origin : '')
    || origemLoja(lojaPadrao)
    || '';
  if (!s) {
    return originOficial && linkText ? `${originOficial}/${String(linkText).replace(/^\/+/, '')}/p` : '';
  }
  const u = parseUrl(s);
  if (u && /(?:\.vtexcommercestable\.com\.br|\.myvtex\.com)$/i.test(u.hostname)) {
    const pathLimpo = u.pathname && u.pathname.length > 1
      ? u.pathname
      : (linkText ? `/${String(linkText).replace(/^\/+/, '')}/p` : '');
    if (originOficial && pathLimpo) return originOficial.replace(/\/+$/, '') + pathLimpo;
  }
  return s;
}

/**
 * Parser genérico da API pública VTEX (`/api/catalog_system/pub/products/search`) para lojas oficiais BR
 * (Universal Music Store, Drogarias Pacheco, Época Cosméticos, etc.).
 * Aceita exclusivamente oferta 1P da própria loja (`sellerId === '1'`), bloqueando 3P de marketplace.
 */
function lerCatalogoVtex(raw, extra) {
  let lista = raw;
  if (typeof raw === 'string') {
    try { lista = JSON.parse(raw); } catch (e) { return []; }
  }
  if (!Array.isArray(lista)) return [];
  const o = extra || {};
  const lojaPadrao = o.loja || '';
  const catHint = o.categoria_hint || '';
  const fonteRadar = o.fonte_radar || 'vtex_catalogo';
  const ehUmusic = fonteRadar === 'umusic_vtex';
  const out = [];
  const vistos = new Set();
  for (const p of lista) {
    if (!p || !p.productName) continue;
    const titLimpo = truncar(limparMencoesTerceiros(decodificarEntidadesWeb(p.productName)), 180);
    const catsVtexRaw = Array.isArray(p.categories) ? p.categories.join(' ') : '';
    if (!ehUmusic && (RE_MEDICAMENTO_RX.test(titLimpo) || RE_VITAMINA_D_ALTA_DOSE.test(titLimpo))) continue;
    if (!ehUmusic && (LOJAS_FARMACIA.has(lojaPadrao) || catHint === 'saude') && RE_CAT_MEDICAMENTO_RX.test(catsVtexRaw)) continue;
    const itens = Array.isArray(p.items) ? p.items : [];
    let best = null;
    for (const it of itens) {
      const sellers = Array.isArray(it && it.sellers) ? it.sellers : [];
      for (const sel of sellers) {
        if (sel && sel.sellerId != null && String(sel.sellerId) !== '1') continue;
        const of = sel && sel.commertialOffer;
        if (of && Number(of.AvailableQuantity) > 0 && Number(of.Price) > 0) {
          best = { it, of };
          break;
        }
      }
      if (best) break;
    }
    if (!best) continue;
    let preco = round2(Number(best.of.Price));
    let list = round2(Number(best.of.ListPrice) || 0);
    if (!(preco > 0)) continue;
    let pix = false;
    let parcelamento = '';
    let precoParcelado = null;
    const insts = Array.isArray(best.of.Installments) ? best.of.Installments : [];
    if (insts.length) {
      let menorPix = null;
      let melhorParc = null;
      const reCartaoLoja = /cart[aã]o\s+(?:da\s+loja|pr[oó]prio|samsung|magalu|carrefour|renner|cea|riachuelo)|nupay/i;
      for (const inst of insts) {
        if (!inst) continue;
        const n = Number(inst.NumberOfInstallments);
        const val = round2(Number(inst.Value));
        const tot = round2(Number(inst.TotalValuePlusInterestRate || (n * val)));
        const rate = Number(inst.InterestRate || 0);
        const sys = String(inst.PaymentSystemName || inst.Name || '');
        if (/\bpix\b/i.test(sys) && n === 1 && val > 0 && val < preco - 0.5) {
          if (menorPix == null || val < menorPix) menorPix = val;
        }
        if (rate === 0 && n >= 2 && val > 0 && !reCartaoLoja.test(sys)) {
          if (!melhorParc || n > melhorParc.n || (n === melhorParc.n && tot < melhorParc.tot)) {
            melhorParc = { n, val, tot };
          }
        }
      }
      if (menorPix != null && menorPix > 0 && menorPix < preco - 0.5) {
        precoParcelado = preco;
        preco = menorPix;
        pix = true;
      }
      if (melhorParc) {
        parcelamento = `Em até ${melhorParc.n}x de ${formatBRL(melhorParc.val)} sem juros`;
        if (melhorParc.tot > preco + 1) precoParcelado = melhorParc.tot;
      }
    }
    let descPct = list > preco ? Math.round(((list - preco) / list) * 100) : 0;
    // ListPrice absurdo (>85% OFF, ex.: R$ 69,90 por R$ 8.298) indica cadastro inflado, não desconto real
    if (descPct > 85) {
      list = 0;
      descPct = 0;
    }
    const uBruta = reconstruirUrlVtexOficial(p.link, p.linkText, lojaPadrao, o.url_fonte, o.origin);
    const id = identificar(uBruta);
    if (id.erro) continue;
    const lojaFinal = id.loja !== 'outra' ? id.loja : lojaPadrao;
    if (!lojaFinal) continue;
    if (LOJAS_FILTRAR_PECAS.has(lojaFinal) && RE_PECA_REPOSICAO.test(titLimpo)) continue;
    const imgBruta = best.it.images && best.it.images[0] && best.it.images[0].imageUrl;
    const img = normalizarImagemOferta(imgBruta || '');
    const pid = o.prefixo_id && p.productId ? `${o.prefixo_id}${p.productId}` : id.produto_id;
    if (vistos.has(pid)) continue;
    vistos.add(pid);
    const catsVtex = Array.isArray(p.categories) ? p.categories.join(' ').replace(/\//g, ' ') : '';
    out.push({
      radar_key: `${lojaFinal}_${p.productId || pid}`,
      loja: lojaFinal,
      produto_id: pid,
      titulo: titLimpo,
      preco,
      preco_de: list > preco ? list : null,
      preco_sem_cupom: null,
      desconto_pct: descPct,
      cupom: '',
      cupom_auto: '',
      parcelamento,
      preco_parcelado: precoParcelado,
      pix,
      imagem: img,
      destaque: ehUmusic ? (descPct >= 25) : false,
      likes: ehUmusic ? (descPct >= 20 ? 10 : 4) : 2,
      loja_oficial: true,
      loja_confiavel: true,
      categoria_fonte: [catHint, catsVtex].filter(Boolean).join(' '),
      categoria_hint: catHint,
      redir_url: '',
      url: id.url_limpa,
      resolved: true,
      fonte_radar: fonteRadar,
    });
  }
  return out;
}

/**
 * Parser da API pública VTEX da Universal Music Store Brasil (umusicstore.com) para K-Pop oficial com entrega nacional.
 */
function lerUmusicVtex(raw) {
  return lerCatalogoVtex(raw, { loja: 'umusic', categoria_hint: 'kpop', fonte_radar: 'umusic_vtex', prefixo_id: 'umu_', origin: 'https://www.umusicstore.com' });
}

/**
 * Parser da API pública Shopify (`/products.json`) em BRL nativo (ex.: kpopalbums.com).
 * Não coletar lojas em USD sem conversão explícita. Marca envio internacional para transparência no post.
 */
function lerCatalogoShopify(raw, extra) {
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch (e) { return []; }
  }
  const lista = Array.isArray(obj) ? obj : (obj && Array.isArray(obj.products) ? obj.products : []);
  if (!lista.length) return [];
  const o = extra || {};
  const lojaPadrao = o.loja || 'kpopalbums';
  const catHint = o.categoria_hint || 'kpop';
  const parsedFonte = o.url_fonte ? parseUrl(o.url_fonte) : null;
  const origin = o.origin || (parsedFonte && parsedFonte.origin) || origemLoja(lojaPadrao) || 'https://www.kpopalbums.com';
  const envioIntl = o.envio_internacional !== false;
  const out = [];
  const vistos = new Set();
  for (const p of lista) {
    if (!p || !p.title || !p.handle) continue;
    const vars = Array.isArray(p.variants) ? p.variants : [];
    const v = vars.find((x) => x && x.available !== false && Number(x.price) > 0 && Number(x.compare_at_price) > Number(x.price));
    if (!v) continue;
    const preco = round2(Number(v.price));
    const list = round2(Number(v.compare_at_price));
    if (!(preco > 0 && list > preco)) continue;
    const descPct = Math.round(((list - preco) / list) * 100);
    if (descPct <= 0 || descPct > 85) continue;
    const urlProd = `${origin.replace(/\/+$/, '')}/products/${String(p.handle).replace(/^\/+/, '')}`;
    const id = identificar(urlProd);
    if (id.erro || vistos.has(id.produto_id)) continue;
    vistos.add(id.produto_id);
    const titLimpo = truncar(limparMencoesTerceiros(decodificarEntidadesWeb(p.title)), 180);
    if (!titLimpo || titLimpo.length < 4) continue;
    const imgBruta = (p.images && p.images[0] && p.images[0].src) || (v.featured_image && v.featured_image.src) || '';
    const img = normalizarImagemOferta(imgBruta);
    const lojaFinal = id.loja !== 'outra' ? id.loja : lojaPadrao;
    out.push({
      radar_key: `${lojaFinal}_${p.id || id.produto_id}`,
      loja: lojaFinal,
      produto_id: id.produto_id,
      titulo: titLimpo,
      preco,
      preco_de: list,
      preco_sem_cupom: null,
      desconto_pct: descPct,
      cupom: '',
      cupom_auto: '',
      parcelamento: '',
      imagem: img,
      destaque: descPct >= 30,
      likes: descPct >= 25 ? 8 : 4,
      loja_oficial: true,
      loja_confiavel: true,
      envio_internacional: envioIntl,
      categoria_fonte: [catHint, p.product_type || '', Array.isArray(p.tags) ? p.tags.join(' ') : String(p.tags || '')].filter(Boolean).join(' '),
      categoria_hint: catHint,
      redir_url: '',
      url: id.url_limpa,
      resolved: true,
      fonte_radar: 'shopify_catalogo',
    });
  }
  return out;
}

/**
 * Parser de vitrine HTML Magento 2 (ex.: Oficial Farma — oficialfarma.com.br, estritamente não-Rx).
 * Lê cards `.product-item-info`, extrai link/título, `oldPrice` e `finalPrice` e aplica `RE_MEDICAMENTO_RX`.
 */
function lerCatalogoMagento(html, extra) {
  const s = String(html || '');
  if (!s) return [];
  const o = extra || {};
  const lojaPadrao = o.loja || 'oficialfarma';
  const catHint = o.categoria_hint || 'saude';
  const parsedFonte = o.url_fonte ? parseUrl(o.url_fonte) : null;
  const origin = o.origin || (parsedFonte && parsedFonte.origin) || origemLoja(lojaPadrao) || 'https://www.oficialfarma.com.br';
  const blocos = s.split(/class="product-item-info"/i).slice(1);
  const out = [];
  const vistos = new Set();
  for (const blocoRaw of blocos) {
    const bloco = blocoRaw.slice(0, 6000);
    const mLink = bloco.match(/<a[^>]*class="[^"]*product-item-link[^"]*"[^>]*href="(https?:\/\/[^"]+|\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
      || bloco.match(/<a[^>]*href="(https?:\/\/[^"]+|\/[^"]+)"[^>]*class="[^"]*product-item-link[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    if (!mLink) continue;
    let href = decodificarEntidadesWeb(mLink[1]).trim();
    if (href.startsWith('/')) href = origin.replace(/\/+$/, '') + href;
    const titLimpo = truncar(limparMencoesTerceiros(decodificarEntidadesWeb(mLink[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())), 180);
    if (!titLimpo || titLimpo.length < 4) continue;
    if (RE_MEDICAMENTO_RX.test(titLimpo) || RE_VITAMINA_D_ALTA_DOSE.test(titLimpo)) continue;

    const mOld = bloco.match(/data-price-amount="([\d.]+)"[^>]{0,120}data-price-type="oldPrice"/i)
      || bloco.match(/data-price-type="oldPrice"[^>]{0,120}data-price-amount="([\d.]+)"/i);
    const mFin = bloco.match(/data-price-amount="([\d.]+)"[^>]{0,120}data-price-type="finalPrice"/i)
      || bloco.match(/data-price-type="finalPrice"[^>]{0,120}data-price-amount="([\d.]+)"/i);
    const preco = mFin ? round2(Number(mFin[1])) : null;
    const precoDe = mOld ? round2(Number(mOld[1])) : null;
    if (!(preco > 0 && precoDe && precoDe > preco)) continue;
    const descPct = Math.round(((precoDe - preco) / precoDe) * 100);
    if (descPct <= 0 || descPct > 85) continue;

    const id = identificar(href);
    if (id.erro || vistos.has(id.produto_id)) continue;
    vistos.add(id.produto_id);
    const mImg = bloco.match(/<img[^>]*class="[^"]*product-image-photo[^"]*"[^>]*src="(https?:\/\/[^"]+)"/i)
      || bloco.match(/<img[^>]*src="(https?:\/\/[^"]+)"[^>]*class="[^"]*product-image-photo[^"]*"/i);
    const img = normalizarImagemOferta(mImg ? mImg[1] : '');
    const mPid = bloco.match(/id="product-item-info_(\d+)"/i) || bloco.match(/data-product-id="(\d+)"/i);
    const lojaFinal = id.loja !== 'outra' ? id.loja : lojaPadrao;
    out.push({
      radar_key: `${lojaFinal}_${(mPid && mPid[1]) || id.produto_id}`,
      loja: lojaFinal,
      produto_id: id.produto_id,
      titulo: titLimpo,
      preco,
      preco_de: precoDe,
      preco_sem_cupom: null,
      desconto_pct: descPct,
      cupom: '',
      cupom_auto: '',
      parcelamento: '',
      imagem: img,
      destaque: false,
      likes: 2,
      loja_oficial: true,
      loja_confiavel: true,
      categoria_fonte: catHint,
      categoria_hint: catHint,
      redir_url: '',
      url: id.url_limpa,
      resolved: true,
      fonte_radar: 'magento_catalogo',
    });
  }
  return out;
}

/**
 * Parser genérico para lojas brasileiras de K-Pop em Nuvemshop (K-Line Store, Hopescolor, Asiatic Store).
 * Lê os blocos `data-variants="..."` com preço em BRL, estoque disponível e preço anterior (`compare_at_price_number`).
 */
function lerNuvemshopKpop(html, loja, baseUrl) {
  const s = String(html || '');
  if (!s) return [];
  const out = [];
  const vistos = new Set();
  const extrairDoTrecho = (trecho, pidNum) => {
    const mDv = trecho.match(/data-variants="([^"]+)"/i);
    let preco = null;
    let precoDe = null;
    let descPct = 0;
    let imgBruta = '';
    let prodIdVar = '';
    if (mDv) {
      try {
        const vars = JSON.parse(decodificarEntidadesWeb(mDv[1]));
        if (Array.isArray(vars) && vars.length) {
          const v = vars.find((x) => x && x.available !== false && (x.stock == null || Number(x.stock) > 0) && Number(x.price_number) > 0) || null;
          if (v) {
            preco = round2(Number(v.price_number));
            precoDe = Number(v.compare_at_price_number) > preco ? round2(Number(v.compare_at_price_number)) : null;
            descPct = precoDe
              ? Math.round(((precoDe - preco) / precoDe) * 100)
              : (Number(v.discount_percentage_number) || 0);
            imgBruta = v.image_url || '';
            prodIdVar = v.product_id ? String(v.product_id) : '';
          }
        }
      } catch (e) { /* tenta fallback abaixo */ }
    }
    if (!(preco > 0 && descPct > 0)) {
      const mStockLbl = trecho.match(/data-store="product-item-label-stock"[^>]*>/i);
      if (mStockLbl && /data-store="product-item-label-stock"[^>]*>\s*Sem Estoque/i.test(trecho) && !/display\s*:\s*none/i.test(mStockLbl[0])) {
        return;
      }
      const mPrRaw = trecho.match(/data-product-price="(\d+)"/i);
      const mPrDisp = !mPrRaw && trecho.match(/js-price-display[^>]*>[\s\S]{0,60}?R\$\s*([\d.]+,\d{2})/i);
      const pFb = mPrRaw ? round2(Number(mPrRaw[1]) / 100) : (mPrDisp ? parsePrecoBR(mPrDisp[1]) : null);
      const mComp = trecho.match(/<[^>]*class="[^"]*js-compare-price-display[^"]*"[^>]*>([\s\S]{0,120}?)<\/[^>]+>/i);
      const pDeFb = (mComp && !/display\s*:\s*none/i.test(mComp[0]))
        ? parsePrecoBR((mComp[1].match(/([\d.]+,\d{2})/) || [])[1])
        : null;
      if (!(pFb > 0 && pDeFb && pDeFb > pFb)) return;
      preco = pFb;
      precoDe = pDeFb;
      descPct = Math.round(((precoDe - preco) / precoDe) * 100);
      if (descPct <= 0) return;
    }

    const mTag = trecho.match(/<a\b([^>]*href="(https?:\/\/[^"]+\/produtos\/[^"]+|\/produtos\/[^"]+)"[^>]*)>([\s\S]*?)<\/a>/i)
      || trecho.match(/<a\b([^>]*href="(https?:\/\/[^"]+|\/produtos\/[^"]+)"[^>]*)>([\s\S]*?)<\/a>/i);
    if (!mTag) return;
    let href = mTag[2];
    if (href.startsWith('/')) href = String(baseUrl || '').replace(/\/+$/, '') + href;
    const id = identificar(href);
    if (id.erro || vistos.has(id.produto_id)) return;

    const mTitleAttr = mTag[1].match(/\btitle="([^"]+)"/i);
    let tit = (mTitleAttr && mTitleAttr[1]) || '';
    if (!tit) {
      const mNome = trecho.match(/data-store="product-item-name-[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i)
        || trecho.match(/class="[^"]*js-item-name[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i);
      if (mNome) tit = mNome[1].replace(/<[^>]+>/g, ' ');
      else tit = String(mTag[3] || '').replace(/<[^>]+>/g, ' ');
    }
    tit = limparMencoesTerceiros(decodificarEntidadesWeb(tit).replace(/\s+/g, ' ').trim());
    if (!tit || tit.length < 4) return;

    if (!imgBruta) {
      const mImg = trecho.match(/(?:https?:)?\/\/acdn[^"'\s,]+(?:480|640|1024)[^"'\s,]*\.(?:webp|jpe?g|png)/i);
      if (mImg) imgBruta = mImg[0].startsWith('//') ? 'https:' + mImg[0] : mImg[0];
    }
    const img = normalizarImagemOferta(imgBruta);
    vistos.add(id.produto_id);
    out.push({
      radar_key: `${loja}_${prodIdVar || pidNum || id.produto_id}`,
      loja: id.loja !== 'outra' ? id.loja : loja,
      produto_id: id.produto_id,
      titulo: truncar(tit, 180),
      preco,
      preco_de: precoDe,
      preco_sem_cupom: null,
      desconto_pct: descPct,
      cupom: '',
      cupom_auto: '',
      parcelamento: '',
      imagem: img,
      destaque: descPct >= 30,
      likes: descPct >= 25 ? 8 : 4,
      categoria_fonte: 'kpop',
      categoria_hint: 'kpop',
      redir_url: '',
      url: id.url_limpa,
      resolved: true,
      fonte_radar: 'nuvemshop_kpop',
    });
  };

  if (/data-component="product-list-item"/i.test(s)) {
    const cards = s.split(/data-component="product-list-item"/i).slice(1);
    for (const card of cards) {
      const mPid = card.match(/data-component-value="(\d+)"/i) || card.match(/data-product-id="(\d+)"/i);
      extrairDoTrecho(card, mPid ? mPid[1] : '');
    }
    return out;
  }

  const re = /data-variants="([^"]+)"/gi;
  let m;
  while ((m = re.exec(s)) !== null) {
    const fimDv = m.index + m[0].length;
    const trecho = m[0] + ' ' + s.slice(fimDv, Math.min(s.length, fimDv + 16000));
    extrairDoTrecho(trecho, '');
  }
  if (!out.length && /js-item-product/i.test(s)) {
    const cards = s.split(/data-product-id="(\d+)"/i);
    for (let i = 1; i + 1 < cards.length; i += 2) {
      extrairDoTrecho(cards[i + 1].slice(0, 18000), cards[i]);
    }
  }
  return out;
}

const RE_KPOP_TITULO = /\b(?:k-?pop|k pop|lightstick|light\s*stick|army\s*bomb|carat\s*bong|candybong|moabong|nachimbong|neobong|photocard|photocards|lomo\s*card|lomocard|fich[aá]rio\s+photocard|toploader|bt21|skzoo|tinytan|aniteez|ppulbatu|season'?s?\s*greetings|photobook|dicon|digipack|digiversion|jewel\s*case|weverse|repackage|mini\s*album|skzhop|map of the soul|ready to be|[aá]lbum\b.*\b(?:bts|blackpink|stray\s*kids|twice|txt|enhypen|seventeen|aespa|newjeans|ive|ateez|le\s*sserafim|itzy|nct|exo|shinee|illit|babymonster|katseye|riize|boynextdoor|monsta\s*x|got7|p1harmony|dreamcatcher|red\s*velvet|nmixx|day6|bigbang)|bts|blackpink|stray\s*kids|twice|tomorrow\s*x\s*together|enhypen|seventeen|aespa|newjeans|ive\b|ateez|le\s*sserafim|itzy|nct\s*(?:127|dream|wish)?|wayv|exo\b|red\s*velvet|monsta\s*x|got7|p1harmony|dreamcatcher|shinee|illit|babymonster|katseye|riize|boynextdoor|zerobaseone|zb1|nmixx|kiss\s*of\s*life|g-?i-?dle|stayc|the\s*boyz|treasure|day6|super\s*junior|bigbang|2ne1|girls'?\s*generation|snsd|jungkook|jimin|taehyung|suga|agust\s*d|j-?hope|lisa|ros[eé]|jennie|jisoo|nayeon|jihyo|taemin|baekhyun)\b/i;

const RE_LIVRO_AMZ_BLOCO = /\b(?:Capa\s+comum|Capa\s+dura|eBook\s+Kindle|Edi[cç][aã]o\s+Kindle)\b/i;
const RE_LIVRO_KPOP_OFICIAL = /\b(?:photobook|memory\s*book|dicon|season'?s?\s*greetings|beyond\s+the\s+story|artbook|magazine|revista)\b/i;

const GRUPOS_KPOP_RE = [
  ['stray_kids', /\b(?:stray\s*kids|skzoo|skzhop|bang\s*chan|hyunjin|felix\s*skz|lee\s*know)\b/i],
  ['twice', /\b(?:twice|candybong|nayeon|jihyo|momo\s*twice|sana\s*twice|tzuyu|misamo)\b/i],
  ['seventeen', /\b(?:seventeen|carat\s*bong|carat\s*land|bss\s*seventeen)\b/i],
  ['enhypen', /\b(?:enhypen|en-?gene)\b/i],
  ['blackpink', /\b(?:blackpink|born\s*pink|lisa\b|jennie\b|jisoo\b|ros[eé]\b.*(?:rosie|blackpink|apt)|rosie\s*ros[eé])\b/i],
  ['newjeans', /\b(?:newjeans|new\s*jeans|njz)\b/i],
  ['aespa', /\b(?:aespa|whiplash|armageddon|my\s*world)\b/i],
  ['ive', /\b(?:ive\b|wonyoung|yujin\s*ive)\b/i],
  ['le_sserafim', /\b(?:le\s*sserafim|lesserafim|fim\s*in\s*bloom)\b/i],
  ['ateez', /\b(?:ateez|aniteez)\b/i],
  ['txt', /\b(?:tomorrow\s*x\s*together|\btxt\b|moabong|ppulbatu)\b/i],
  ['nct', /\b(?:nct(?:\s*(?:127|dream|wish|u))?|wayv|neobong)\b/i],
  ['exo', /\b(?:\bexo\b|baekhyun|kai\s*exo|chanyeol|suho|d\.?o\.?\s*exo)\b/i],
  ['itzy', /\b(?:itzy)\b/i],
  ['red_velvet', /\b(?:red\s*velvet|seulgi|irene\s*red|wendy\s*red)\b/i],
  ['monsta_x', /\b(?:monsta\s*x)\b/i],
  ['got7', /\b(?:got7|bambam|jackson\s*wang|yugyeom)\b/i],
  ['p1harmony', /\b(?:p1harmony)\b/i],
  ['dreamcatcher', /\b(?:dreamcatcher)\b/i],
  ['gidle', /\b(?:\(?g\)?i-?dle|gidle|yuqi|soyeon|miyeon|minnie\s*g)\b/i],
  ['shinee', /\b(?:shinee|taemin|key\s*shinee|onew|minho\s*shinee)\b/i],
  ['babymonster', /\b(?:babymonster|babymons7er|baby\s*monster)\b/i],
  ['illit', /\b(?:illit)\b/i],
  ['katseye', /\b(?:katseye)\b/i],
  ['zerobaseone', /\b(?:zerobaseone|zb1)\b/i],
  ['riize', /\b(?:riize)\b/i],
  ['boynextdoor', /\b(?:boynextdoor|boy\s*next\s*door)\b/i],
  ['nmixx', /\b(?:nmixx)\b/i],
  ['kiss_of_life', /\b(?:kiss\s*of\s*life)\b/i],
  ['bigbang', /\b(?:bigbang|big\s*bang|g-?dragon|taeyang)\b/i],
  ['girls_generation', /\b(?:girls'?\s*generation|snsd|taeyeon)\b/i],
  ['day6', /\b(?:day6)\b/i],
  ['treasure', /\b(?:treasure)\b/i],
  ['the_boyz', /\b(?:the\s*boyz)\b/i],
  ['stayc', /\b(?:stayc)\b/i],
  ['astro', /\b(?:astro|cha\s*eun-?woo)\b/i],
  ['super_junior', /\b(?:super\s*junior)\b/i],
  ['bts', /\b(?:bts|army\s*bomb|bt21|tinytan|tiny\s*tan|jungkook|jung\s*kook|jimin|taehyung|j-?hope|suga|agust\s*d|jin\s*(?:of\s*bts|bts|happy|the\s*astronaut)|v\s*bts|rm\s*bts|map\s*of\s*the\s*soul|permission\s*to\s*dance|beyond\s*the\s*story)\b/i],
];

function detectarGrupoKpop(titulo) {
  const s = String(titulo || '');
  if (!s) return '';
  for (const [grupo, re] of GRUPOS_KPOP_RE) {
    if (re.test(s)) return grupo;
  }
  return '';
}

function parsePrecoBR(s) {
  if (!s) return null;
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? round2(n) : null;
}

/**
 * Parser da busca pública da Amazon Brasil (ex.: Vendido pela Amazon `p_6=A1ZZFT5FULY4LN` e Prime `p_85=19171728011`).
 * Usa `data-a-strike="true"` exclusivamente para "De:", evitando confundir parcelas (10x de R$) com preço riscado.
 */
function lerAmazonBuscaHtml(html, baseUrl, extra) {
  const s = String(html || '');
  if (!s || /Type the characters you see|Digite os caracteres que voc[eê] v[eê]/i.test(s)) return [];
  const o = extra || {};
  const catHint = o.categoria_hint || '';
  const blocos = s.split('<div role="listitem"').slice(1);
  const out = [];
  const vistos = new Set();
  for (const bloco of blocos) {
    const head = bloco.slice(0, 500);
    if (/AdHolder|s-sponsored-list-item|Patrocinado/i.test(bloco.slice(0, 2200))) continue;
    if (/Temporariamente sem estoque|Indispon[ií]vel no momento|N[aã]o enviamos para o seu endere[cç]o|Compra\s+Internacional|Envio\s+internacional|Tributos\s+de\s+importa[cç][aã]o|Enviado\s+do\s+exterior/i.test(bloco)) continue;
    const mAsin = head.match(/data-asin="([A-Z0-9]{10})"/i);
    if (!mAsin) continue;
    const asin = mAsin[1].toUpperCase();
    if (vistos.has(asin)) continue;
    const mH2Aria = bloco.match(/<h2[^>]*aria-label="([^"]+)"/i);
    const mH2Span = bloco.match(/<h2[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i);
    const h2Aria = mH2Aria ? decodificarEntidadesWeb(mH2Aria[1]).replace(/\s+/g, ' ').trim() : '';
    const h2Span = mH2Span ? decodificarEntidadesWeb(mH2Span[1]).replace(/\s+/g, ' ').trim() : '';
    const titBruto = (!h2Aria || /^(?:escolha\s+da\s+amazon|mais\s+vendid[oa])/i.test(h2Aria) || (h2Span.length > h2Aria.length && h2Span.length >= 8))
      ? (h2Span || h2Aria)
      : h2Aria;
    let tit = limparMencoesTerceiros(titBruto);
    if (!tit || tit.length < 4) continue;
    const idxFimH2 = bloco.indexOf('</h2>');
    if (idxFimH2 >= 0) {
      const posH2 = decodificarEntidadesWeb(bloco.slice(idxFimH2 + 5, idxFimH2 + 550).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
      const mArt = posH2.match(/^(?:de|por)\s+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s().'&-]{1,42}?)(?=\s+(?:\d,\d|\d\s+de\s+5|CD|Disco|Capa|Edi[cç][aã]o|Formato|R\$|\|)|$)/i);
      if (mArt) {
        const artista = mArt[1].trim();
        if (artista.length >= 2 && !/^(?:amazon|outros|v[aá]rios)$/i.test(artista) && !tit.toLowerCase().includes(artista.toLowerCase())) {
          tit = `${artista} — ${tit}`;
        }
      }
    }
    if (catHint === 'kpop') {
      if (!RE_KPOP_TITULO.test(tit)) continue;
      if (ehFalsoKpop(tit)) continue;
      if (RE_LIVRO_AMZ_BLOCO.test(bloco) && !RE_LIVRO_KPOP_OFICIAL.test(tit)) continue;
    }

    // Preço atual: primeiro <span class="a-price"...> que NÃO é a-text-price (riscado/unitário)
    const mCur = bloco.match(/<span[^>]*class="a-price"[^>]*>[\s\S]{0,120}?<span class="a-offscreen">R\$(?:&nbsp;|\u00a0|\s)*([\d.]+,\d{2})<\/span>/i);
    const preco = parsePrecoBR(mCur && mCur[1]);
    if (!(preco > 0)) continue;

    // Preço riscado ("De:") exclusivamente em data-a-strike="true"
    const mStrike = bloco.match(/data-a-strike="true"[^>]*>[\s\S]{0,120}?<span class="a-offscreen">R\$(?:&nbsp;|\u00a0|\s)*([\d.]+,\d{2})<\/span>/i);
    const precoDe = parsePrecoBR(mStrike && mStrike[1]);
    const descPct = precoDe && precoDe > preco ? Math.round(((precoDe - preco) / precoDe) * 100) : 0;
    if (descPct <= 0) continue;

    // Imagem: tenta maior resolução do srcset da Amazon CDN, senão src s-image
    let imgBruta = '';
    const mImgTag = bloco.match(/<img[^>]*class="[^"]*s-image[^"]*"[^>]*>/i);
    if (mImgTag) {
      const mSet = mImgTag[0].match(/srcset="([^"]+)"/i);
      if (mSet) {
        const candSet = mSet[1].split(',').map((p) => p.trim().split(/\s+/)[0]).filter((u) => /^https?:\/\//i.test(u));
        if (candSet.length) imgBruta = candSet[candSet.length - 1];
      }
      if (!imgBruta) {
        const mSrc = mImgTag[0].match(/src="(https?:\/\/[^"]+)"/i);
        if (mSrc) imgBruta = mSrc[1];
      }
    }
    const img = normalizarImagemOferta(imgBruta);
    const urlProd = `https://www.amazon.com.br/dp/${asin}`;
    const ehPrime = /a-icon-prime|aria-label="[^"]*Prime/i.test(bloco);
    const ehOficial = !!o.loja_oficial || /p_6(?:=|%3D)A1ZZFT5FULY4LN/i.test(String(baseUrl || ''));
    const ehEscolhaAmz = /Escolha\s+da\s+Amazon/i.test(bloco);
    const ehBuscaPrimeP85 = /p_85(?:=|%3D)19171728011/i.test(String(baseUrl || ''));
    const mNota = bloco.match(/(\d(?:[.,]\d)?)\s+de\s+5\s+estrelas/i);
    const nota = mNota ? Number(mNota[1].replace(',', '.')) : 0;
    const mAval = bloco.match(/de\s+5\s+estrelas[\s\S]{0,180}?\(\s*([\d.,]+)\s*(mil)?\s*\)/i)
      || bloco.match(/aria-label="[^"]*?([\d.,]+)\s*(mil)?\s+avalia/i);
    let avaliacoes = 0;
    if (mAval) {
      const baseNum = Number(String(mAval[1]).replace(/\.(?=\d{3})/g, '').replace(',', '.')) || 0;
      avaliacoes = mAval[2] ? Math.round(baseNum * 1000) : Math.round(baseNum);
    }
    const lojaConfiavel = ehOficial || ehPrime || ehEscolhaAmz || (ehBuscaPrimeP85 && nota >= 4.4 && avaliacoes >= 20);
    vistos.add(asin);
    out.push({
      radar_key: 'amz_' + asin,
      loja: 'amazon',
      produto_id: 'amz_' + asin,
      titulo: truncar(tit, 180),
      preco,
      preco_de: precoDe,
      preco_sem_cupom: null,
      desconto_pct: descPct,
      cupom: '',
      cupom_auto: '',
      parcelamento: '',
      imagem: img,
      destaque: descPct >= 20 || ehOficial || ehEscolhaAmz,
      likes: ehOficial ? 10 : (ehPrime || ehEscolhaAmz ? 7 : 4),
      loja_oficial: ehOficial,
      loja_confiavel: lojaConfiavel,
      categoria_fonte: catHint || 'kpop',
      categoria_hint: catHint || 'kpop',
      redir_url: '',
      url: urlProd,
      resolved: true,
      fonte_radar: 'amazon_busca',
    });
  }
  return out;
}

function bateTermo(candidato, termo) {
  if (!String(termo || '').trim()) return true;
  return bateTermoComSinonimos([candidato.titulo, candidato.categoria_fonte].filter(Boolean).join(' '), termo);
}

/**
 * Cadência dinâmica do radar: escala para 4–6 envios nos picos (11h–14h e 18h–23h) quando há boas promoções,
 * mantendo até 2 envios na madrugada (01h–06h) e bloqueando falsas promoções pelo filtro anterior.
 */
function calcularLimiteDinamicoRadar(cfg, opcoes, elegiveis) {
  const rad = (cfg && cfg.radar) || {};
  const maxBase = Math.max(1, Number(rad.max_por_ciclo) || 4);
  const o = opcoes || {};
  if (o.limite_explicito || o.modo !== 'agendado' || rad.cadencia_dinamica === false) {
    return Math.max(1, Number(o.limite) || maxBase);
  }
  const tsRef = (o.ts != null && Number.isFinite(Number(o.ts))) ? Number(o.ts) : Date.now();
  const fuso = (cfg && cfg.fuso) || 'America/Sao_Paulo';
  const hora = Number(partesData(tsRef, fuso).hour);
  const fortes = (elegiveis || []).filter((e) => e && (
    e.cupom || e.eh_atualizacao || e.eh_cupom_loja || e.em_alta === 'explodindo' || e.em_alta === 'em_alta' || Number(e.desconto_pct) >= 25
  )).length;

  if (hora >= 1 && hora < 7) return Math.min(maxBase, 2);
  const pico = (hora >= 11 && hora <= 14) || (hora >= 18 && hora <= 23);
  if (pico) {
    if (fortes >= 5) return Math.max(maxBase, 8);
    if (fortes >= 3) return Math.max(maxBase, 6);
    if (fortes >= 1 || (elegiveis || []).length >= 4) return Math.max(maxBase, 5);
    return Math.max(maxBase, 4);
  }
  if (fortes >= 5) return Math.max(maxBase, 7);
  return maxBase;
}

/**
 * Filtra, deduplica (24h estrito + resposta quando baixa/cupom; 72h geral), classifica e seleciona com diversidade.
 * Prepara `reqs1` para resolver links intermediários (Promobit Redirect/to/ ou links curtos) e limpar afiliados de terceiros.
 */
function selecionarCandidatosRadar(base, respWeb, respShopee, ofertasRecentes, precosRows, cfg, alertasRows, descartesRecentes, opcoesExtra) {
  if (!base || base.ativo === false) {
    return { opcoes: (base && base.opcoes) || {}, candidatos: [], reqs1: [], shop_ids_descobertos: {} };
  }
  const o = base.opcoes || {};
  const rad = (cfg && cfg.radar) || {};
  const precoMin = Number(rad.preco_min) > 0 ? Number(rad.preco_min) : 15;
  const minDesc = Number(rad.min_desconto_pct) >= 0 ? Number(rad.min_desconto_pct) : 15;
  const lojasPerm = new Set(o.lojas || rad.lojas || ['amazon', 'ml', 'shopee', 'shein', 'tiktok']);
  const catsPerm = new Set(o.categorias || rad.categorias || ['saude', 'auto', 'beleza', 'tech', 'bebe', 'casa', 'moda', 'kpop', 'pet', 'livros', 'papelaria', 'mercado']);
  const shopIdsPerm = o.shop_ids && o.shop_ids.length ? new Set(o.shop_ids.map(String)) : null;
  const shopUsernamesPerm = o.shop_usernames && o.shop_usernames.length ? new Set(o.shop_usernames.map((u) => String(u).toLowerCase())) : null;
  const palavrasFiltro = !o.termo && rad.palavras && rad.palavras.length ? rad.palavras : [];
  const tsRef = (o.ts != null && Number.isFinite(Number(o.ts))) ? Number(o.ts) : Date.now();
  const pbRedirBloqueado = Number(opcoesExtra && opcoesExtra.pb_redir_bloqueado_ate) > tsRef;

  const brutos = [];
  const shopIdsDescobertos = {};
  (base.fontesWeb || []).forEach((f, i) => {
    const html = textoRespostaHttp((respWeb || [])[i]);
    if (!html) return;
    if (f.tipo === 'telegram_canal') brutos.push(...lerCanalTelegramPublico(html, f.canal));
    else if (f.tipo === 'gatry_home') brutos.push(...lerGatryHtml(html));
    else if (f.tipo === 'umusic_vtex') brutos.push(...lerUmusicVtex(html));
    else if (f.tipo === 'vtex_catalogo') brutos.push(...lerCatalogoVtex(html, { loja: f.loja_hint, categoria_hint: f.categoria_hint, fonte_radar: 'vtex_catalogo', url_fonte: f.url_real }));
    else if (f.tipo === 'shopify_catalogo') brutos.push(...lerCatalogoShopify(html, { loja: f.loja_hint, categoria_hint: f.categoria_hint, url_fonte: f.url_real, envio_internacional: f.envio_internacional }));
    else if (f.tipo === 'magento_catalogo') brutos.push(...lerCatalogoMagento(html, { loja: f.loja_hint, categoria_hint: f.categoria_hint, url_fonte: f.url_real }));
    else if (f.tipo === 'nuvemshop_kpop') brutos.push(...lerNuvemshopKpop(html, f.loja_hint || 'klinestore', f.url_real));
    else if (f.tipo === 'amazon_busca') brutos.push(...lerAmazonBuscaHtml(html, f.url_real, { categoria_hint: f.categoria_hint, loja_oficial: f.loja_oficial }));
    else brutos.push(...lerPromobitHtml(html, f));
  });
  (base.fontesShopee || []).forEach((f, i) => {
    const r = (respShopee || [])[i] || {};
    const lido = r.error ? { produtos: [] } : shopee.lerOfertas(r);
    for (const p of lido.produtos || []) {
      if (shopee.ehAnuncioServicoShopee(p.titulo)) continue;
      if (p.shop_username && p.shop_id && (f.resolver_shop_id || !shopee.LOJAS_KPOP_SHOPEE.find((x) => x.username === p.shop_username && x.shop_id))) {
        shopIdsDescobertos[p.shop_username] = String(p.shop_id);
      }
      const precoDe = p.desconto_loja_pct > 0 && p.desconto_loja_pct < 90
        ? round2(p.preco / (1 - p.desconto_loja_pct / 100))
        : null;
      const curada = p.shop_id ? !!p.loja_kpop_curada : !!(p.loja_kpop_curada || f.loja_kpop_curada);
      const candSh = {
        radar_key: 'shp_' + p.produto_id,
        loja: 'shopee',
        produto_id: p.produto_id,
        titulo: p.titulo,
        preco: p.preco,
        preco_de: precoDe && precoDe > p.preco ? precoDe : null,
        preco_sem_cupom: null,
        desconto_pct: p.desconto_loja_pct || 0,
        cupom: '',
        cupom_auto: '',
        parcelamento: '',
        imagem: p.imagem || '',
        destaque: p.vendas >= 200,
        likes: Math.min(20, Math.floor((p.vendas || 0) / 100)),
        comissao_pct: p.comissao_pct || 0,
        vendas: p.vendas || 0,
        shop_id: p.shop_id || f.shop_id || '',
        shop_username: p.shop_username || '',
        loja_oficial: !!p.loja_oficial,
        loja_indicada: !!(p.loja_indicada || curada),
        loja_confiavel: !!(p.loja_confiavel || curada),
        loja_kpop_curada: curada,
        shop_name: p.shop_name || (curada ? f.shop_name : '') || '',
        categoria_fonte: f.keyword || '',
        categoria_hint: f.categoria || '',
        redir_url: '',
        url: p.url,
        resolved: true,
        fonte_radar: 'shopee_api',
      };
      aplicarMetadadosLojaKpopShopee(candSh, candSh.url);
      brutos.push(candSh);
    }
  });

  const alertasAtivos = (alertasRows || []).filter((a) => a && a.ativo !== false && a.termo);
  // Recusadas há pouco pela trava de oferta real (memória do workflow): não ocupam vaga de novo por 6 h,
  // a não ser que o preço tenha caído desde a recusa.
  const descartes = descartesRecentes || {};
  const recusadaRecente = (c) => {
    const d = descartes[c.produto_id] || descartes[c.radar_key];
    return !!(d && tsRef - Number(d.ts) < 6 * 3600000 && !(Number(c.preco) < Number(d.preco) * 0.97));
  };
  const vistosLote = new Set();
  const elegiveis = [];
  for (const rawC of brutos) {
    if (!rawC || !rawC.titulo) continue;
    if (!rawC.eh_cupom_loja && (RE_MEDICAMENTO_RX.test(rawC.titulo) || ((LOJAS_FARMACIA.has(rawC.loja) || rawC.categoria_hint === 'saude') && RE_VITAMINA_D_ALTA_DOSE.test(rawC.titulo)))) continue;
    if (!rawC.eh_cupom_loja && rawC.categoria_hint === 'kpop' && ehFalsoKpop(rawC.titulo)) continue;
    if (pbRedirBloqueado && rawC.fonte_radar === 'promobit' && rawC.redir_url) continue;
    if (o.apenas_cupons_loja && !rawC.eh_cupom_loja) continue;
    if (!rawC.eh_cupom_loja && !(rawC.preco >= precoMin)) continue;
    if (rawC.loja === 'shopee' && shopee.ehAnuncioServicoShopee(rawC.titulo)) continue;
    if (rawC.loja && !lojasPerm.has(rawC.loja)) continue;
    if (!rawC.eh_cupom_loja && rawC.loja === 'shopee') aplicarMetadadosLojaKpopShopee(rawC, rawC.url);
    if (shopIdsPerm) {
      if (rawC.eh_cupom_loja) continue;
      if (rawC.shop_id) {
        if (!shopIdsPerm.has(String(rawC.shop_id))) continue;
      } else {
        const lkTxt = shopee.identificarLojaKpopShopee({
          shopName: [rawC.titulo, rawC.categoria_fonte].filter(Boolean).join(' '),
          url: rawC.url,
        });
        if (!lkTxt || !lkTxt.shop_id || !shopIdsPerm.has(lkTxt.shop_id)) continue;
      }
    }
    if (shopUsernamesPerm) {
      if (rawC.eh_cupom_loja) continue;
      const lkUser = shopee.identificarLojaKpopShopee({
        shopId: rawC.shop_id,
        shopName: rawC.shop_name || (rawC.fonte_radar === 'promobit' ? '' : [rawC.titulo, rawC.categoria_fonte].filter(Boolean).join(' ')),
        url: rawC.url,
      });
      const unameCand = ((lkUser && lkUser.username) || rawC.shop_username || '').toLowerCase();
      if (!unameCand || !shopUsernamesPerm.has(unameCand)) continue;
    }
    if (rawC.fonte_radar === 'shopee_api' && !rawC.loja_confiavel) continue;
    if (rawC.fonte_radar === 'amazon_busca' && !rawC.loja_confiavel) continue;

    let c = rawC;
    let escopoCup = null;
    if (c.eh_cupom_loja) {
      escopoCup = detectarEscopoCupom(c.titulo, c.instrucoes || '', c.loja);
      const urlHub = urlCentralCupons(c.loja, cfg);
      if (!urlHub) continue;
      const catsComp = escopoCup.categorias.filter((catK) => catsPerm.has(catK));
      if (!catsComp.length) continue;
      const prodCup = `cupom_${c.loja}_${sha256Hex(`${c.loja}|${c.cupom || ''}|${escopoCup.horario_lote || ''}|${slug(c.titulo)}`).slice(0, 10)}`;
      c = Object.assign({}, c, {
        produto_id: prodCup,
        url: urlHub,
        imagem: logoLoja(c.loja, cfg) || c.imagem || '',
        resolved: true,
        redir_url: '',
        escopo_cupom: escopoCup.escopo,
        categorias_cupom: catsComp,
        horario_lote: escopoCup.horario_lote || '',
        exige_resgate_previo: !!(c.exige_resgate_previo || escopoCup.exige_resgate_previo),
      });
    }

    if (o.modo === 'agendado' && recusadaRecente(c)) continue;
    const rep = avaliarRepeticao24h(c, ofertasRecentes, tsRef, { modo_radar: true, janela_radar_72h: true });
    if (rep.bloquear) continue;
    const chaveLote = c.produto_id || c.radar_key;
    const titSemVar = String(c.titulo || '').replace(/(?:\s*[-–|]\s*|\s+)(?:preto|branco|azul|verde|marrom|cinza|vermelho|amarelo|rosa|roxo|bege|nude|prata|dourado|laranja|tamanho\s+\w+|tam\.?\s*\w+|rn|p|m|g|gg|xg|xxg|g\/xg)\s*$/i, '');
    const tSlug = slug(titSemVar || c.titulo).slice(0, 26);
    if (vistosLote.has(chaveLote) || (tSlug.length >= 10 && vistosLote.has('t:' + tSlug))) continue;

    if (o.termo && !bateTermo(c, o.termo)) continue;
    const catKpopPre = (catsPerm.size === 1 && catsPerm.has('kpop'))
      ? classificarCategoria(c.titulo, cfg, c.categoria_fonte, c.loja)
      : null;
    const ehCatKpop = !!(catKpopPre && catKpopPre.confianca > 0 && catKpopPre.categoria === 'kpop');
    if (o.termos_lista && o.termos_lista.length && !(c.loja_kpop_curada || LOJAS_KPOP_ESPECIALIZADAS.has(c.loja) || ehCatKpop) && !o.termos_lista.some((kw) => bateTermo(c, kw))) continue;
    if (palavrasFiltro.length && !palavrasFiltro.some((kw) => bateTermo(c, kw))) continue;

    const alta = avaliarEmAlta(c, alertasAtivos);
    if (o.apenas_em_alta && !alta.nivel) continue;

    if (!c.eh_cupom_loja && o.modo === 'agendado' && !o.termo && !o.termos_lista) {
      // Precisa de indício numérico de economia. "Destaque"/curtidas sozinhos não bastam (antes, posts de
      // canais do Telegram entravam com likes fixo e passavam mesmo sem desconto nenhum).
      const okQual = rep.eh_atualizacao || c.desconto_pct >= minDesc || !!c.cupom
        || (!!alta.nivel && (c.desconto_pct >= 8 || !!c.cupom_auto));
      if (!okQual) continue;
    }

    let categoria;
    let categoria_confianca = 0;
    let categoria_indefinida = false;
    if (c.eh_cupom_loja && escopoCup) {
      categoria = escopoCup.escopo === 'geral' ? 'top' : c.categorias_cupom[0];
      categoria_confianca = 1;
    } else if (c.loja_kpop_curada && catsPerm.has('kpop')) {
      categoria = 'kpop';
      categoria_confianca = 1;
      categoria_indefinida = false;
    } else {
      const catAuto = classificarCategoria(c.titulo, cfg, c.categoria_fonte, c.loja);
      const catRep = rep.eh_atualizacao && rep.anterior && rep.anterior.categoria && catsPerm.has(rep.anterior.categoria)
        ? rep.anterior.categoria
        : '';
      const catConfiavel = catAuto.confianca > 0 ? catAuto.categoria : (c.categoria_hint || CATEGORIA_PADRAO_LOJA[c.loja] || '');
      categoria = catConfiavel || catRep || catAuto.categoria;
      categoria_confianca = catAuto.confianca;
      categoria_indefinida = !catConfiavel && !catRep;
      if (categoria === 'kpop' && !c.eh_cupom_loja && ehFalsoKpop(c.titulo)) continue;
      if (!catsPerm.has(categoria) && !(categoria_indefinida && (LOJAS_ENRIQUECER_PAGINA.has(c.loja) || c.redir_url))) continue;
    }

    vistosLote.add(chaveLote);
    if (tSlug.length >= 10) vistosLote.add('t:' + tSlug);

    const boostMkt = agenteAtivo(cfg, 'marketing') ? avaliarBoostMarketing(c, cfg) : { bonus: 0 };
    const stAf = statusAfiliadoFonte(c.loja, cfg, c.links_manuais);
    const bonusAfiliado = stAf.ativo ? 45 : (stAf.oferece_afiliado ? 22 : 0);
    const bonusKpopConf = categoria === 'kpop'
      ? (c.loja_kpop_curada ? (c.loja_oficial ? 38 : 32) : (c.loja_oficial ? 25 : (c.loja_indicada ? 12 : 0)))
      : (c.loja_oficial ? 18 : (c.loja_indicada ? 8 : 0));
    const nota = (c.destaque ? 40 : 0)
      + (c.cupom ? 25 : 0)
      + (c.eh_cupom_loja && c.horario_lote ? 25 : 0)
      + (rep.eh_atualizacao ? 25 : 0)
      + Math.min(60, Number(c.desconto_pct) || 0)
      + Math.min(30, (c.likes || 0) * 2)
      + Math.min(25, Math.floor((c.cliques || 0) / 30))
      + Math.min(25, (c.comissao_pct || 0) * 2)
      + alta.bonus
      + boostMkt.bonus
      + bonusAfiliado
      + bonusKpopConf;

    elegiveis.push(Object.assign({}, c, {
      categoria,
      categoria_confianca,
      categoria_indefinida,
      nota,
      afiliado_ativo: stAf.ativo,
      oferece_afiliado: stAf.oferece_afiliado,
      modo_afiliado: stAf.modo,
      em_alta: alta.nivel,
      desejo_tipo: alta.desejo_tipo,
      bonus_alta: alta.bonus,
      pedido_comunidade: alta.pedido_comunidade,
      eh_atualizacao: !!rep.eh_atualizacao,
      repost_de: rep.repost_de || '',
      preco_anterior: rep.preco_anterior != null ? rep.preco_anterior : null,
      motivo_repost: rep.motivo_repost || '',
    }));
  }

  // Ordena por qualidade e seleciona intercalando lojas, categorias e grupos K-pop + anti-fadiga 90 min + boost de fome (6h) para tópicos parados
  const mktAtivo = agenteAtivo(cfg, 'marketing');
  const contCat90m = {};
  const contLoja90m = {};
  const contCat6h = {};
  const contGrupoKpop6h = {};
  if (Array.isArray(ofertasRecentes) && ofertasRecentes.length) {
    const corte90m = tsRef - 90 * 60000;
    const corte6h = tsRef - 6 * 3600000;
    for (const r of ofertasRecentes) {
      if (!r || !r.ts || Number(r.ts) < corte6h) continue;
      if (r.status !== 'aprovada' && r.status !== 'publicando') continue;
      if (r.categoria) contCat6h[r.categoria] = (contCat6h[r.categoria] || 0) + 1;
      if (r.categoria === 'kpop' && r.titulo) {
        const grp = detectarGrupoKpop(r.titulo);
        if (grp) contGrupoKpop6h[grp] = (contGrupoKpop6h[grp] || 0) + 1;
      }
      if (mktAtivo && Number(r.ts) >= corte90m) {
        if (r.categoria) contCat90m[r.categoria] = (contCat90m[r.categoria] || 0) + 1;
        if (r.loja) contLoja90m[r.loja] = (contLoja90m[r.loja] || 0) + 1;
      }
    }
  }
  const bonusFomeCat = (cat) => {
    if (!cat || cat === 'top' || (o.categorias && o.categorias.length === 1)) return 0;
    const n6h = contCat6h[cat] || 0;
    if (n6h === 0) return 42;
    if (n6h === 1) return 24;
    if (n6h === 2) return 12;
    return 0;
  };
  const ajusteGrupoKpop = (item) => {
    if (!item || item.categoria !== 'kpop') return 0;
    const grp = detectarGrupoKpop(item.titulo);
    if (!grp) return 0;
    const n6h = contGrupoKpop6h[grp] || 0;
    if (n6h === 0) return 24;
    if (n6h === 1) return 10;
    return -Math.min(64, (n6h - 1) * 16);
  };
  const fadigaBase = (item) => mktAtivo
    ? Math.min(28, (contCat90m[item.categoria] || 0) * 7) + Math.min(20, (contLoja90m[item.loja] || 0) * 5)
    : 0;
  elegiveis.sort((a, b) => b.nota - a.nota);
  const limite = calcularLimiteDinamicoRadar(cfg, o, elegiveis);
  const limiteSelecao = (o.modo === 'agendado' && !o.limite_explicito) ? (limite + 6) : limite;
  const fila = elegiveis.slice();
  const escolhidos = [];
  const usadasCat = {};
  const usadasLoja = {};
  const usadasGrupoKpop = {};
  const maxCuponsLojaCiclo = o.apenas_cupons_loja ? limite : 1;
  const maxPbRedirCiclo = o.modo === 'agendado' ? 2 : Math.max(5, limite);
  let usadasCupomLoja = 0;
  let usadasPbRedir = 0;
  const pontuacaoFila = (x) => {
    const uCat = usadasCat[x.categoria] || 0;
    const grp = x.categoria === 'kpop' ? detectarGrupoKpop(x.titulo) : '';
    const pesoCat = (x.categoria === 'kpop' && uCat < 3 && (!grp || !usadasGrupoKpop[grp])) ? 10 : 18;
    return x.nota + bonusFomeCat(x.categoria) + ajusteGrupoKpop(x) - fadigaBase(x)
      - uCat * pesoCat
      - (usadasLoja[x.loja || 'outra'] || 0) * 14
      - (grp ? (usadasGrupoKpop[grp] || 0) * 45 : 0);
  };
  while (fila.length && escolhidos.length < limiteSelecao) {
    fila.sort((a, b) => {
      const pa = pontuacaoFila(a);
      const pb = pontuacaoFila(b);
      if (Math.abs(pb - pa) >= 0.01) return pb - pa;
      return (Number(!!b.afiliado_ativo) - Number(!!a.afiliado_ativo)) || (Number(!!b.oferece_afiliado) - Number(!!a.oferece_afiliado));
    });
    const item = fila.shift();
    if (item.eh_cupom_loja && usadasCupomLoja >= maxCuponsLojaCiclo) continue;
    if (item.fonte_radar === 'promobit' && item.redir_url && usadasPbRedir >= maxPbRedirCiclo) continue;
    const grpKpop = item.categoria === 'kpop' ? detectarGrupoKpop(item.titulo) : '';
    // Em modo agendado, evita repetir o mesmo grupo K-pop no mesmo ciclo para garantir variedade (Stray Kids, TWICE, SEVENTEEN, ENHYPEN, aespa, etc.)
    if (o.modo === 'agendado' && grpKpop && (usadasGrupoKpop[grpKpop] || 0) >= 1) continue;
    escolhidos.push(item);
    if (item.eh_cupom_loja) usadasCupomLoja++;
    if (item.fonte_radar === 'promobit' && item.redir_url) usadasPbRedir++;
    usadasCat[item.categoria] = (usadasCat[item.categoria] || 0) + 1;
    if (grpKpop) usadasGrupoKpop[grpKpop] = (usadasGrupoKpop[grpKpop] || 0) + 1;
    const ljK = item.loja || 'outra';
    usadasLoja[ljK] = (usadasLoja[ljK] || 0) + 1;
  }

  const reqs1 = [];
  escolhidos.forEach((c, idx) => {
    if (c.redir_url) {
      reqs1.push({ idx, url: wrapUrlRadar(c.redir_url, cfg), headers: HDRS_WEB });
    } else if (c.url && ehCurto(c.url)) {
      reqs1.push({ idx, url: wrapUrlCurtoRadar(c.url, cfg), headers: HDRS_WEB });
    } else if (c.url) {
      const id = identificar(c.url);
      if (!id.erro) {
        if (id.loja !== 'outra' || !c.loja) c.loja = id.loja;
        c.produto_id = id.produto_id;
        c.url = id.url_limpa;
        c.resolved = true;
        if (c.loja === 'shopee') aplicarMetadadosLojaKpopShopee(c, c.url);
      }
    }
  });

  return { opcoes: Object.assign({}, o, { limite_alvo: limite }), candidatos: escolhidos, reqs1, shop_ids_descobertos: shopIdsDescobertos };
}

function enriquecerCandidatosComPaginas(cands, reqsPag, respPaginas, cfg) {
  (reqsPag || []).forEach((req, k) => {
    const c = cands[req.idx];
    const rPag = (respPaginas || [])[k];
    if (!c || !rPag) return;
    const lido = lerPaginaProduto(rPag, c.url);
    if (!lido.ok && !lido.cupom && !lido.cupom_auto && !lido.parcelamento) return;

    if (c.fonte_radar === 'amazon_busca' && lido.compra_internacional) {
      c.expirada_na_loja = true;
      return;
    }
    if (c.fonte_radar === 'amazon_busca' && lido.enviado_por_amazon) {
      c.loja_oficial = true;
      c.loja_confiavel = true;
    }

    const ehCatalogoDireto = FONTES_CATALOGO_DIRETO.has(c.fonte_radar);
    if ((String(c.fonte_radar || '').startsWith('telegram_') || c.fonte_radar === 'gatry' || (!ehCatalogoDireto && pareceChamadaOuGancho(c.titulo)))
      && lido.titulo && lido.titulo.length >= 6 && !/^produto\s/i.test(lido.titulo)) {
      c.titulo = truncar(preservarQtdUnidadesTitulo(limparMencoesTerceiros(lido.titulo), c._qtd_unidades), 180);
    }
    c.imagem = normalizarImagemOferta(c.imagem);
    const imgLida = normalizarImagemOferta(lido.imagem);
    if (imgLida && (!c.imagem || /promobit\.com\.br|wsrv\.nl/i.test(c.imagem))) {
      c.imagem = imgLida;
    }
    if (c.loja === 'amazon' && lido.ok && lido.preco > 0) {
      c.parcelamento = lido.parcelamento || '';
      c.preco_parcelado = lido.preco_parcelado || null;
      c.recorrencia = !!lido.recorrencia;
      c.recorrencia_preco = lido.recorrencia && lido.recorrencia_preco != null ? lido.recorrencia_preco : null;
      c.recorrencia_pct = lido.recorrencia && lido.recorrencia_pct != null ? lido.recorrencia_pct : null;
    } else {
      if (!c.parcelamento && lido.parcelamento) c.parcelamento = lido.parcelamento;
      if (lido.preco_parcelado && !c.preco_parcelado) c.preco_parcelado = lido.preco_parcelado;
      if (lido.recorrencia && !c.recorrencia) c.recorrencia = true;
      if (lido.recorrencia_preco != null && c.recorrencia_preco == null) c.recorrencia_preco = lido.recorrencia_preco;
      if (lido.recorrencia_pct != null && c.recorrencia_pct == null) c.recorrencia_pct = lido.recorrencia_pct;
    }
    if (lido.pix && !c.pix) c.pix = true;
    if (lido.campanha && !c.campanha) c.campanha = lido.campanha;
    if (lido.tamanhos && !c.tamanhos) c.tamanhos = lido.tamanhos;
    if (!c.cupom && lido.cupom && !CUPOM_TERCEIRO.test(lido.cupom)) c.cupom = lido.cupom;
    if (lido.cupom_prime) c.cupom_prime = true;
    if (lido.exige_resgate_pagina) c.exige_resgate_pagina = true;

    const tinhaCupom = !!(c.cupom || c.cupom_auto);
    const qtdUn = Math.max(Number(c._qtd_unidades) || 1, qtdUnidadesOferta(c.titulo, null));
    if (qtdUn >= 2) c._qtd_unidades = qtdUn;
    const qtdPag = qtdUnidadesOferta(lido.titulo, null);
    const multiUnidade = qtdUn >= 2 && qtdPag === 1;
    const pisoCupom = lido.preco && lido.preco >= 10 ? Math.max(5, round2(lido.preco * 0.35)) : 0.01;
    if (!multiUnidade && tinhaCupom && lido.preco && lido.preco >= 20 && c.preco > 0 && c.preco < pisoCupom) {
      c.expirada_na_loja = true;
      return;
    }
    let cupomPaginaAplicado = false;
    if (!multiUnidade && lido.preco && lido.preco > 0 && (lido.cupom_pct || lido.cupom_valor)) {
      const precoRealComCup = lido.cupom_pct
        ? round2(lido.preco * (1 - lido.cupom_pct / 100))
        : round2(lido.preco - lido.cupom_valor);
      if (precoRealComCup >= pisoCupom && precoRealComCup < lido.preco) {
        cupomPaginaAplicado = true;
        if (precoRealComCup > c.preco * 1.35 && !(tinhaCupom && lido.preco > c.preco)) {
          c.expirada_na_loja = true;
          return;
        }
        // Se o candidato já veio com cupom + preço final mais baixo (ex.: BLACK100OFF = R$ 961 vs cupom parcial R$ 25 = R$ 1.036), preserva o preço com cupom real!
        if (tinhaCupom && c.preco > 0 && precoRealComCup > c.preco) {
          c.preco_sem_cupom = c.preco_sem_cupom || lido.preco;
          c.preco_de = (lido.preco_de && lido.preco_de > lido.preco)
            ? lido.preco_de
            : (c.preco_de && c.preco_de > lido.preco ? c.preco_de : lido.preco);
          recalcularParcelamentoComCupom(lido, c, null, round2(lido.preco - c.preco));
        } else {
          c.preco_sem_cupom = lido.preco;
          c.preco_de = (lido.preco_de && lido.preco_de > lido.preco)
            ? lido.preco_de
            : (c.preco_de && c.preco_de > lido.preco ? c.preco_de : lido.preco);
          c.preco = precoRealComCup;
          recalcularParcelamentoComCupom(lido, c, lido.cupom_pct, lido.cupom_valor);
        }
      }
    } else if (!multiUnidade && !tinhaCupom && lido.preco && lido.preco > 0) {
      if (lido.preco > c.preco * 1.35) {
        c.expirada_na_loja = true;
        return;
      }
      if (lido.preco > c.preco) c.preco = lido.preco;
    } else if (!multiUnidade && tinhaCupom && lido.preco && lido.preco > c.preco) {
      c.preco_sem_cupom = c.preco_sem_cupom || lido.preco;
      c.preco_de = (lido.preco_de && lido.preco_de > lido.preco)
        ? lido.preco_de
        : (c.preco_de && c.preco_de > lido.preco ? c.preco_de : lido.preco);
      recalcularParcelamentoComCupom(lido, c, null, round2(lido.preco - c.preco));
    } else if (multiUnidade && lido.preco && lido.preco > 0) {
      const precoLote = round2(lido.preco * qtdUn);
      if ((!c.preco_de || (c.preco_de <= lido.preco * 1.15 && precoLote > c.preco_de)) && precoLote > c.preco * 1.05) {
        c.preco_de = precoLote;
      }
    }
    if (!c.cupom && !c.cupom_auto && lido.cupom_auto && (cupomPaginaAplicado || !(lido.cupom_pct || lido.cupom_valor))) {
      c.cupom_auto = lido.cupom_auto;
    }
    if (lido.preco && lido.preco > 0) c.preco_confirmado_loja = true;
    // Sempre recalcula: se o preço na loja subiu até o "De", o desconto acabou (não pode ficar o % antigo).
    if (c.preco_de && c.preco_de > c.preco) {
      c.desconto_pct = round2(((c.preco_de - c.preco) / c.preco_de) * 100);
    } else {
      c.preco_de = null;
      c.desconto_pct = 0;
    }
    if (!c.loja_kpop_curada && (lido.categoria_loja || lido.titulo || c.url || c.categoria_indefinida)) {
      const reCat = classificarCategoria(c.titulo, cfg, [c.categoria_fonte || '', lido.categoria_loja || '', lido.titulo || '', c.url || ''].join(' '), c.loja);
      if (reCat.confianca > 0) {
        c.categoria = reCat.categoria;
        c.categoria_confianca = reCat.confianca;
        c.categoria_indefinida = false;
      } else if (c.categoria_indefinida && CATEGORIA_PADRAO_LOJA[c.loja]) {
        c.categoria = CATEGORIA_PADRAO_LOJA[c.loja];
        c.categoria_indefinida = false;
      }
    }
  });
}

function aplicarMercadoNosCandidatos(cands, reqsMercado, respMercado, opcoes) {
  if (!Array.isArray(reqsMercado) || !reqsMercado.length || !Array.isArray(respMercado) || !respMercado.length) return;
  const hitsPorIdx = {};
  reqsMercado.forEach((req, k) => {
    const r = respMercado[k];
    if (!r) return;
    const hits = extrairHitsRespostaMercado(req.fonte, r);
    if (!hits.length) return;
    (hitsPorIdx[req.idx] = hitsPorIdx[req.idx] || []).push(...hits);
  });
  cands.forEach((c, idx) => {
    if (!c || c.eh_cupom_loja || !c.resolved || c.expirada_na_loja) return;
    const casados = casarProdutosMercado(c, hitsPorIdx[idx] || []);
    const av = avaliarPrecoMercado(c, casados, opcoes);
    c.av_mercado = av;
    if (!av.aprovar) {
      c.reprovado_mercado = true;
      return;
    }
    if (av.preco_de_ajustado !== c.preco_de) {
      c.preco_de = av.preco_de_ajustado;
      c.desconto_pct = (c.preco_de && c.preco_de > c.preco)
        ? round2(((c.preco_de - c.preco) / c.preco_de) * 100)
        : 0;
    }
    c.imagem = normalizarImagemOferta(c.imagem);
    const imgQuebrada = !c.imagem || /promobit\.com\.br|wsrv\.nl/i.test(c.imagem);
    if (imgQuebrada && av.imagem_mercado) {
      c.imagem = normalizarImagemOferta(av.imagem_mercado) || c.imagem;
    }
    if (!c.imagem || /promobit\.com\.br|wsrv\.nl/i.test(c.imagem)) {
      // Fallback seguro de foto do catálogo quando o título do mercado bate marca+modelo/linha
      const baseTokTxt = [c.titulo || '', tituloDaUrl(c.url) || ''].join(' ');
      const toks = baseTokTxt.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
        .filter((w) => w.length >= 4 && !/^(?:para|com|sem|kit|promocao|oferta|desconto|masculino|feminino|unissex|adulto|original|shopee|amazon|mercado|livre)$/.test(w));
      const toksUnicos = [...new Set(toks)];
      if (toksUnicos.length >= 2) {
        const hitImg = (hitsPorIdx[idx] || []).find((h) => {
          if (!h || !h.imagem) return false;
          const nh = String(h.titulo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const hitsTok = toksUnicos.filter((t) => nh.includes(t)).length;
          return hitsTok >= Math.min(2, toksUnicos.length);
        });
        if (hitImg) c.imagem = normalizarImagemOferta(hitImg.imagem);
      }
    }
    if (av.concorrente || av.mediana) {
      const ref = av.concorrente || { preco: av.mediana, loja_nome: 'mercado' };
      c.ref_mercado = ref.preco;
      c.ref_mercado_loja = ref.loja_nome;
    }
  });
}

/**
 * Trava "oferta de verdade" do radar automático: só publica sozinho com PROVA numérica de economia.
 * Aceita (qualquer uma):
 *   - preço ≤ menor preço de 90 dias com referência real (selo ok);
 *   - queda de preço desde o nosso último post do mesmo produto;
 *   - cupom que realmente baixa o preço (preço sem cupom ≥ 5% acima) ou cupom oficial verificado;
 *   - desconto ≥ mínimo sobre o "De" (já calibrado pelo comparador de mercado), com preço ≥ 5% abaixo
 *     do "De" e economia de pelo menos R$ 3;
 *   - produto em alta/pedido por membro com desconto real ≥ 8%;
 *   - mercado (Zoom/Amazon) mostra o mesmo produto ≥ 10% mais caro em outro lugar.
 * Recusa: desconto > 80% sem confirmação do mercado nem da página da loja (típico "metade do dobro" ou erro).
 */
function avaliarOfertaReal(c, sel, cfg) {
  if (c.eh_cupom_loja) return { ok: true, motivo: 'cupom_loja' };
  const rad = (cfg && cfg.radar) || {};
  const minDesc = Number(rad.min_desconto_pct) >= 0 ? Number(rad.min_desconto_pct) : 15;
  const preco = Number(c.preco);
  if (!(preco > 0)) return { ok: false, motivo: 'sem_preco' };
  if (sel && sel.selo === 'acima') return { ok: false, motivo: 'acima_do_min90' };
  const pDe = Number(c.preco_de) > preco ? Number(c.preco_de) : 0;
  const desc = pDe ? round2(((pDe - preco) / pDe) * 100) : 0;
  const confirmado = !!(c.ref_mercado || c.preco_confirmado_loja || (sel && sel.selo === 'ok'));
  if (desc > 80 && !confirmado && !(c.cupom || c.cupom_auto)) return { ok: false, motivo: 'desconto_suspeito' };
  if (sel && sel.selo === 'ok') return { ok: true, motivo: 'min90' };
  if (c.eh_atualizacao && c.preco_anterior != null && preco < Number(c.preco_anterior)) return { ok: true, motivo: 'baixou' };
  const semCupom = Number(c.preco_sem_cupom);
  if (semCupom >= 30 && preco < semCupom * 0.35 && !(Number(c.ref_mercado) > 0 && Number(c.ref_mercado) <= preco * 1.4)) {
    return { ok: false, motivo: 'cupom_suspeito' };
  }
  if ((c.cupom || c.cupom_auto) && semCupom > 0 && semCupom >= preco * 1.05) return { ok: true, motivo: 'cupom' };
  if (c.cupom && c.cupom.length >= 4 && !CUPOM_TERCEIRO.test(c.cupom)) {
    return { ok: true, motivo: 'cupom' };
  }
  if (c.cupom_auto && (c.em_alta || Number(c.ref_mercado) >= preco * 1.03 || (pDe && desc >= 5))) {
    return { ok: true, motivo: 'cupom' };
  }
  if (pDe && desc >= Math.max(5, minDesc) && pDe - preco >= 3) return { ok: true, motivo: 'desconto' };
  // Produto em alta / pedido por membro: aceita desconto real menor (≥ 8%), mesma régua da seleção.
  if (pDe && c.em_alta && desc >= 8 && pDe - preco >= 3) return { ok: true, motivo: 'desconto_em_alta' };
  if (Number(c.ref_mercado) >= preco * 1.10) return { ok: true, motivo: 'mercado' };
  return { ok: false, motivo: 'sem_prova_de_desconto' };
}

/** Atualiza a memória de recusadas (staticData do workflow): grava as novas e apaga as com mais de 6 h. */
function atualizarDescartesRadar(memoria, descartadas, ts) {
  const out = {};
  const agora = Number(ts) || Date.now();
  for (const [k, v] of Object.entries(memoria || {})) {
    if (v && agora - Number(v.ts) < 6 * 3600000) out[k] = v;
  }
  for (const d of descartadas || []) {
    const reg = { ts: agora, preco: d.preco, motivo: d.motivo };
    if (d.chave) out[d.chave] = reg;
    if (d.radar_key) out[d.radar_key] = reg;
  }
  const chaves = Object.keys(out);
  if (chaves.length > 800) chaves.sort((a, b) => out[a].ts - out[b].ts).slice(0, chaves.length - 800).forEach((k) => delete out[k]);
  return out;
}

/**
 * Finaliza a resolução (3º salto / páginas / checagem de mercado), avalia selo/snapshots, auto-Top e gera cards ou auto-publicação.
 */
function finalizarRadar(estado, resp3, ofertasRecentes, precosRows, cfg, respPaginas, respMercado) {
  const cands = (estado.candidatos || []).map((c) => Object.assign({}, c));
  if ((estado.reqs3 || []).length && !cands.some((c) => c.reqs3_done)) {
    resolverReqs3EmCands(cands, estado.reqs3, resp3);
  }
  enriquecerCandidatosComPaginas(cands, estado.reqsPag, respPaginas, cfg);
  const o = estado.opcoes || {};
  aplicarMercadoNosCandidatos(cands, estado.reqsMercado, respMercado, { modo_radar: o.modo === 'agendado' });
  const ts = (o.ts != null && Number.isFinite(Number(o.ts))) ? Number(o.ts) : Date.now();
  const fuso = (cfg && cfg.fuso) || 'America/Sao_Paulo';
  const hora = Number(partesData(ts, fuso).hour);
  const silenciosoNoite = o.modo === 'agendado' && (hora >= 22 || hora < 8);
  const hojeIso = diaISO(ts, fuso);
  const topRecentesHoje = (ofertasRecentes || [])
    .filter((r) => r && r.top && r.ts && diaISO(Number(r.ts), fuso) === hojeIso);
  let topHoje = topRecentesHoje.length;
  const topPorCatHoje = {};
  for (const r of topRecentesHoje) {
    if (r.categoria) topPorCatHoje[r.categoria] = (topPorCatHoje[r.categoria] || 0) + 1;
  }
  const topCatCiclo = {};
  let topCiclo = 0;

  const porProduto = {};
  for (const r of precosRows || []) if (r && r.produto_id) (porProduto[r.produto_id] = porProduto[r.produto_id] || []).push(r);

  const lojasPerm = new Set(o.lojas || (cfg && cfg.radar && cfg.radar.lojas) || ['amazon', 'ml', 'shopee', 'shein', 'tiktok']);
  const catsPerm = new Set(o.categorias || (cfg && cfg.radar && cfg.radar.categorias) || []);
  const shopIdsPerm = o.shop_ids && o.shop_ids.length ? new Set(o.shop_ids.map(String)) : null;
  const shopUsernamesPerm = o.shop_usernames && o.shop_usernames.length ? new Set(o.shop_usernames.map((u) => String(u).toLowerCase())) : null;
  const destinoAdmins = o.modo === 'comando' && o.chat_id ? [o.chat_id] : ((cfg && cfg.admins) || []);
  const modoAuto = !!(cfg && cfg.radar && cfg.radar.publicar_direto);
  const autoTop = !(cfg && cfg.radar && cfg.radar.auto_top === false);
  const precoMin = Number(cfg && cfg.radar && cfg.radar.preco_min) > 0 ? Number(cfg.radar.preco_min) : 15;
  const limiteAlvo = Number(o.limite_alvo) > 0 ? Number(o.limite_alvo) : 0;

  const ofertasNovas = [];
  const precosNovos = [];
  const chamadas = [];
  const autoPlanos = [];
  const reqsShopeeLinks = [];
  const vistosFim = new Set();
  const descartadas = [];

  for (const c of cands) {
    if (limiteAlvo > 0 && ofertasNovas.length >= limiteAlvo) break;
    const regDescarte = (motivo) => descartadas.push({
      chave: c.produto_id || c.radar_key || '',
      radar_key: c.radar_key || '',
      titulo: truncar(c.titulo || '', 60),
      loja: c.loja || '',
      preco: c.preco,
      motivo,
    });
    if (!c.resolved || !c.url || !c.produto_id) {
      if (!c._promobit_429) regDescarte(c._descarte_motivo || 'sem_url_resolvida');
      continue;
    }
    if (c.expirada_na_loja || c.reprovado_mercado) {
      regDescarte(c.expirada_na_loja ? 'expirada_na_loja' : 'reprovado_mercado');
      continue;
    }
    if (!lojasPerm.has(c.loja)) {
      regDescarte('loja_nao_permitida');
      continue;
    }
    if (shopIdsPerm && !shopIdsPerm.has(String(c.shop_id || ''))) {
      regDescarte('loja_diferente');
      continue;
    }
    if (shopUsernamesPerm) {
      const lkFim = shopee.identificarLojaKpopShopee({ shopId: c.shop_id, shopName: c.shop_name, url: c.url });
      const unameFim = String((lkFim && lkFim.username) || c.shop_username || '').toLowerCase();
      if (!unameFim || !shopUsernamesPerm.has(unameFim)) {
        regDescarte('loja_diferente');
        continue;
      }
    }
    if (/promobit\.com\.br|gatry\.com/i.test(c.url)) {
      regDescarte('url_terceiro');
      continue;
    }
    if (vistosFim.has(c.produto_id)) continue;
    const repFim = avaliarRepeticao24h(c, ofertasRecentes, ts, { modo_radar: true, janela_radar_72h: true });
    if (repFim.bloquear) {
      regDescarte('repetida_recente');
      continue;
    }
    vistosFim.add(c.produto_id);

    if (!c.eh_cupom_loja && c.categoria_indefinida) {
      const reUrlCat = classificarCategoria(c.titulo, cfg, [c.categoria_fonte || '', c.url || ''].join(' '), c.loja);
      if (reUrlCat.confianca > 0) {
        c.categoria = reUrlCat.categoria;
        c.categoria_confianca = reUrlCat.confianca;
        c.categoria_indefinida = false;
      } else if (CATEGORIA_PADRAO_LOJA[c.loja]) {
        c.categoria = CATEGORIA_PADRAO_LOJA[c.loja];
        c.categoria_indefinida = false;
      }
    }

    const hist = c.eh_cupom_loja ? [] : (porProduto[c.produto_id] || []);
    const sel = c.eh_cupom_loja
      ? { selo: 'ok', min90: null, desconto_pct: null, ref90: null, ref90_fonte: '', historico: { registros: 0, primeira: '' } }
      : avaliarSelo(hist, c.preco, {
        agora: ts,
        tolerancia_pct: (cfg && cfg.selo && cfg.selo.tolerancia_pct) || 0,
        dias: (cfg && cfg.selo && cfg.selo.dias) || 90,
      });
    // Histórico de preço sempre (mesmo se descartada agora): é ele que comprova o desconto real depois.
    if (!c.eh_cupom_loja && precisaSnapshot(hist, c.preco, ts)) {
      precosNovos.push(linhaPreco(c.produto_id, c.loja, c.preco, 'coleta', '', ts));
    }
    const catFinal = (!c.eh_cupom_loja && c.categoria_indefinida && repFim.anterior && repFim.anterior.categoria && cfg && cfg.categorias && cfg.categorias[repFim.anterior.categoria])
      ? repFim.anterior.categoria
      : c.categoria;
    if (!c.eh_cupom_loja && catFinal && catsPerm.size && !catsPerm.has(catFinal)) {
      regDescarte('categoria_nao_permitida');
      continue;
    }
    if ((o.modo === 'agendado' || modoAuto) && !c.eh_cupom_loja && c.categoria_indefinida) {
      descartadas.push({ chave: c.produto_id || c.radar_key || '', radar_key: c.radar_key || '', titulo: truncar(c.titulo || '', 60), loja: c.loja, preco: c.preco, motivo: 'sem_categoria' });
      continue;
    }
    if (o.modo === 'agendado' && !c.eh_cupom_loja && !(Number(c.preco) >= precoMin)) {
      regDescarte('abaixo_preco_minimo');
      continue;
    }
    if (o.modo === 'agendado') {
      const real = avaliarOfertaReal(c, sel, cfg);
      if (!real.ok) {
        descartadas.push({ chave: c.produto_id || c.radar_key || '', radar_key: c.radar_key || '', titulo: truncar(c.titulo || '', 60), loja: c.loja, preco: c.preco, motivo: real.motivo });
        continue;
      }
    }

    const maxTop = limiteTopDia(cfg);
    // Reserva 35% do teto diário de Top para o horário nobre (18h–23h) quando maxTop >= 10, evitando zerar a noite
    const maxTopAgora = (o.modo === 'agendado' && maxTop >= 10 && hora < 18)
      ? Math.ceil(maxTop * 0.65)
      : maxTop;
    const maxTopCatDia = (o.modo === 'agendado' && maxTop >= 10)
      ? Math.max(3, Math.ceil(maxTop * 0.25))
      : maxTop;
    const catTopOk = !(o.modo === 'agendado' && maxTop >= 10)
      || (((topPorCatHoje[catFinal] || 0) < maxTopCatDia) && !topCatCiclo[catFinal]);
    const maxTopCiclo = o.modo === 'agendado' ? 2 : maxTop;
    const ehCatalogoDireto = FONTES_CATALOGO_DIRETO.has(c.fonte_radar);
    const provaTopCatalogo = !ehCatalogoDireto
      || Number(c.ref_mercado) >= Number(c.preco) * 1.15
      || (sel && sel.selo === 'ok')
      || !!c.cupom
      || !!c.cupom_auto
      || c.em_alta === 'explodindo';
    const irTop = c.eh_cupom_loja
      ? (c.escopo_cupom === 'geral')
      : !!(autoTop && topHoje < maxTopAgora && topCiclo < maxTopCiclo && catTopOk && provaTopCatalogo
        && (c.desconto_pct >= 35
          || (c.desconto_pct >= 28 && (c.cupom || c.cupom_auto || c.destaque))
          || ((c.em_alta === 'explodindo' || c.em_alta === 'em_alta') && c.desconto_pct >= 20)));
    if (irTop && !c.eh_cupom_loja) {
      topHoje++;
      topCiclo++;
      if (catFinal) {
        topPorCatHoje[catFinal] = (topPorCatHoje[catFinal] || 0) + 1;
        topCatCiclo[catFinal] = true;
      }
    }

    const manuais = {
      modo_link: true,
      categoria_auto: !c.eh_cupom_loja,
      radar_key: c.radar_key,
    };
    if (c.eh_cupom_loja) {
      manuais.eh_cupom_loja = true;
      manuais.escopo_cupom = c.escopo_cupom || 'geral';
      manuais.categorias_cupom = c.categorias_cupom || [];
      if (c.horario_lote) manuais.horario_lote = c.horario_lote;
    }
    if (c.exige_resgate_previo) manuais.exige_resgate_previo = true;
    if (c.preco_de) manuais.preco_de = c.preco_de;
    if (c.preco_sem_cupom) manuais.preco_sem_cupom = c.preco_sem_cupom;
    if (c.cupom) manuais.cupom = c.cupom;
    if (c.cupom_auto && !c.cupom) manuais.cupom_auto = c.cupom_auto;
    if (c.parcelamento) manuais.parcelamento = c.parcelamento;
    if (c.preco_parcelado) manuais.preco_parcelado = c.preco_parcelado;
    if (c.cupom_prime) manuais.cupom_prime = true;
    if (c.exige_resgate_pagina) manuais.exige_resgate_pagina = true;
    if (c.ref_mercado) {
      manuais.ref_mercado = c.ref_mercado;
      if (c.ref_mercado_loja) manuais.ref_mercado_loja = c.ref_mercado_loja;
    }
    if (c.pix) manuais.pix = true;
    if (c.recorrencia) manuais.recorrencia = true;
    if (c.recorrencia_preco != null) manuais.recorrencia_preco = c.recorrencia_preco;
    if (c.recorrencia_pct != null) manuais.recorrencia_pct = c.recorrencia_pct;
    if (c.campanha) manuais.campanha = c.campanha;
    if (c.tamanhos) manuais.tamanhos = c.tamanhos;
    if (c.em_alta) manuais.em_alta = c.em_alta;
    if (c.desejo_tipo) manuais.desejo_tipo = c.desejo_tipo;
    if (c.loja_kpop_curada) manuais.loja_kpop_curada = true;
    if (c.shop_name) manuais.shop_name = c.shop_name;
    if (c.shop_id) manuais.shop_id = c.shop_id;
    if (c.shop_username) manuais.shop_username = c.shop_username;
    if (c.cliques >= 80) manuais.cliques_comunidade = c.cliques;
    if (c.envio_internacional) manuais.envio_internacional = true;
    if (c.fonte_radar) manuais.fonte_radar = c.fonte_radar;
    const repostId = repFim.repost_de || c.repost_de || '';
    if (repostId) {
      manuais.repost_de = repostId;
      if (repFim.preco_anterior != null) manuais.preco_anterior = repFim.preco_anterior;
      else if (c.preco_anterior != null) manuais.preco_anterior = c.preco_anterior;
      manuais.motivo_repost = repFim.motivo_repost || c.motivo_repost || 'baixou';
    }

    c.imagem = normalizarImagemOferta(c.imagem);
    c.titulo = limparMencoesTerceiros(c.titulo);
    if (!FONTES_CATALOGO_DIRETO.has(c.fonte_radar) && pareceChamadaOuGancho(c.titulo)) {
      const slugFallback = tituloDaUrl(c.url);
      if (slugFallback) c.titulo = slugFallback;
    }
    const qtdUnFinal = Math.max(Number(c._qtd_unidades) || 1, qtdUnidadesOferta(c.titulo, null));
    if (qtdUnFinal >= 2) manuais._qtd_unidades = qtdUnFinal;
    c.titulo = preservarQtdUnidadesTitulo(c.titulo, qtdUnFinal);

    const offerObj = {
      oferta_id: novoId('o', ts + ofertasNovas.length),
      produto_id: c.produto_id,
      loja: c.loja,
      categoria: catFinal,
      titulo: c.titulo,
      url: c.url,
      imagem: c.imagem || '',
      preco: c.preco,
      links_manuais: manuais,
      origem: 'radar',
      top: irTop,
      comissao_pct: c.comissao_pct || null,
      vendas: c.vendas || null,
      criada_por: o.user_id || null,
      ts,
    };
    const linha = linhaOferta(offerObj, sel);
    const soTextos = !temDestinoTelegram(linha.categoria, cfg, irTop, manuais);

    let planoAuto = null;
    if (modoAuto && destinoAdmins.length && textos.permitePublicarSelo(linha, cfg)) {
      const pubOferta = Object.assign({}, linha, origemMin90(linha, cfg.selo), { relampago: false, top: irTop });
      try {
        const linkItens = planejarLinks(pubOferta, cfg, ts);
        if (!soTextos) {
          linha.status = 'publicando';
          linha.decidida_por = o.user_id || destinoAdmins[0] || null;
          linha.decidida_ts = ts;
        }
        planoAuto = {
          oferta: pubOferta,
          linkItens,
          so_textos: soTextos,
          chat_id: destinoAdmins[0],
          ts,
          cardIdx: -1,
        };
      } catch (err) {
        planoAuto = null;
      }
    }

    ofertasNovas.push(linha);
    const pilotoCompacto = !!(planoAuto && !planoAuto.so_textos && cfg && cfg.admin && cfg.admin.notificacao_piloto === 'compacta');
    if (!pilotoCompacto) {
      destinoAdmins.forEach((adminId, idxAdm) => {
        const chCard = chamadaCard(linha, cfg, adminId);
        if (silenciosoNoite) chCard.payload.disable_notification = true;
        if (planoAuto && !planoAuto.so_textos) chCard.payload.reply_markup = TECLADO_AUTO;
        if (planoAuto && idxAdm === 0) planoAuto.cardIdx = chamadas.length;
        chamadas.push(chCard);
      });
    }

    if (planoAuto) {
      const pIdx = autoPlanos.length;
      planoAuto.linkItens.forEach((it, itemIdx) => {
        if (it.metodo === 'shopee' && it.http) {
          reqsShopeeLinks.push({ planoIdx: pIdx, itemIdx, http: it.http });
        }
      });
      autoPlanos.push(planoAuto);
    }
  }

  if (!ofertasNovas.length && o.modo === 'comando' && o.chat_id) {
    const faltaApiShopee = ((o.shop_ids && o.shop_ids.length) || (o.shop_usernames && o.shop_usernames.length))
      && !(cfg && cfg.shopee && cfg.shopee.app_id && cfg.shopee.secret);
    const msgVazia = faltaApiShopee
      ? `🔎 Nenhuma promoção nova encontrada para "${o.rotulo || 'esta loja'}" no momento.\n💡 Para consultar produtos direto da loja na Shopee, preencha <code>shopee.app_id</code> e <code>shopee.secret</code> na tabela <code>bfx_config</code> do n8n.`
      : `🔎 Nenhuma promoção nova encontrada para "${o.rotulo || 'o filtro atual'}" no momento (tudo que saiu recente já foi exibido ou ainda não atingiu o desconto mínimo).\n💡 Tente /radar status ou outro termo como /radar perfume.`;
    chamadas.push(msgAdmin(o.chat_id, msgVazia, faltaApiShopee ? { parse_mode: 'HTML' } : undefined));
  }

  return {
    ofertasNovas,
    precosNovos,
    chamadas,
    autoPlanos,
    reqsShopeeLinks,
    opcoes: o,
    resumo: { candidatas: cands.length, enviadas: ofertasNovas.length, descartadas },
  };
}

module.exports = {
  textoStatusRadar,
  interpretarComandoRadar,
  calcularLimiteDinamicoRadar,
  planejarFontesRadar,
  lerPromobitHtml,
  lerCanalTelegramPublico,
  lerGatryHtml,
  lerCatalogoVtex,
  lerUmusicVtex,
  lerCatalogoShopify,
  lerCatalogoMagento,
  lerNuvemshopKpop,
  lerAmazonBuscaHtml,
  detectarGrupoKpop,
  avaliarEmAlta,
  selecionarCandidatosRadar,
  aplicarRedirRadar1,
  aplicarRedirRadar2,
  extrairDadosHtmlSocial,
  extrairProdutoHtmlSocial,
  prepararPaginasRadar,
  finalizarRadar,
  avaliarOfertaReal,
  atualizarDescartesRadar,
  publicarLoteRadar,
};
