'use strict';
// Radar Multi-Fonte gratuito (Mercado Livre, Amazon, Shopee, Shein e TikTok Shop):
// · coleta promoções públicas (Promobit por loja e nicho, Shopee Affiliate Open API e canais t.me/s/ opcionais)
// · desempacota redirecionamentos em até 3 saltos e remove 100% de tags/afiliados de terceiros
// · injeta automaticamente o afiliado do próprio usuário, preserva cupom e parcelamento sem juros
// · respeita o esquema estrito das Data Tables e funciona em 1-clique (cards) ou /modo piloto (automático).
const { round2, formatBRL, slug, truncar, novoId, partesData, diaISO } = require('./util');
const { sha256Hex } = require('./sha256');
const { parseUrl, identificar, nomeLoja, urlCentralCupons, logoLoja, normalizarImagemOferta } = require('./lojas');
const { ehCurto, lerLocation, textoRespostaHttp, desempacotarRedirLoja, extrairHrefCanonica } = require('./curtos');
const { extrairLinksProduto, extrairDoTexto, classificarCategoria, bateTermoInteligente, normalizarBusca, CATEGORIA_PADRAO_LOJA, detectarEscopoCupom, detectarResgatePrevioCupom, reqPaginaProduto, lerPaginaProduto, recalcularParcelamentoComCupom, avaliarRepeticao24h } = require('./extrator');
const { montarReqsMercado, extrairHitsRespostaMercado, casarProdutosMercado, avaliarPrecoMercado, resumirAvisoMercado } = require('./mercado');
const { planejarLinks, parseManuais } = require('./links');
const shopee = require('./shopee');
const { avaliarSelo, precisaSnapshot, origemMin90 } = require('./selo');
const textos = require('./textos');
const { textoStatusRadar, interpretarComandoRadar } = require('./config');
const { msgAdmin } = require('./telegram');
const { chamadaCard, linhaOferta, linhaPreco, prepararPublicacao, lerRespostasShopee, temDestinoTelegram, TOP_LIMITE } = require('./fluxos');
const { agenteAtivo, bateTermoComSinonimos, calcularPenalidadeFadigaRecente, avaliarBoostMarketing } = require('./agentes');

const DIA = 24 * 60 * 60 * 1000;
const TECLADO_AUTO = { inline_keyboard: [[{ text: '⏳ Publicando automaticamente…', callback_data: 'noop' }]] };
const CANAIS_CURADOS_RADAR = ['canaltechofertas', 'xetdaspromocoes'];

const HDRS_WEB = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};

const FONTES_LOJA_PB = {
  amazon: 'https://www.promobit.com.br/promocoes/loja/amazon/',
  ml: 'https://www.promobit.com.br/promocoes/loja/mercado-livre/',
  shopee: 'https://www.promobit.com.br/promocoes/loja/shopee/',
  shein: 'https://www.promobit.com.br/promocoes/loja/shein/',
  tiktok: 'https://www.promobit.com.br/promocoes/loja/tiktok-shop/',
  kabum: 'https://www.promobit.com.br/promocoes/loja/kabum/',
  terabyte: 'https://www.promobit.com.br/promocoes/loja/terabyteshop/',
  pichau: 'https://www.promobit.com.br/promocoes/loja/pichau/',
  drogaraia: 'https://www.promobit.com.br/promocoes/loja/droga-raia/',
  drogasil: 'https://www.promobit.com.br/promocoes/loja/drogasil/',
  pacheco: 'https://www.promobit.com.br/promocoes/loja/drogarias-pacheco/',
  panvel: 'https://www.promobit.com.br/promocoes/loja/panvel/',
  araujo: 'https://www.promobit.com.br/promocoes/loja/drogaria-araujo/',
  belezanaweb: 'https://www.promobit.com.br/promocoes/loja/beleza-na-web/',
  epocacosmeticos: 'https://www.promobit.com.br/promocoes/loja/epoca-cosmeticos/',
  boticario: 'https://www.promobit.com.br/promocoes/loja/boticario/',
  natura: 'https://www.promobit.com.br/promocoes/loja/natura/',
  sephora: 'https://www.promobit.com.br/promocoes/loja/sephora/',
  centauro: 'https://www.promobit.com.br/promocoes/loja/centauro/',
  netshoes: 'https://www.promobit.com.br/promocoes/loja/netshoes/',
  nike: 'https://www.promobit.com.br/promocoes/loja/nike/',
  adidas: 'https://www.promobit.com.br/promocoes/loja/adidas/',
  renner: 'https://www.promobit.com.br/promocoes/loja/lojas-renner/',
  cea: 'https://www.promobit.com.br/promocoes/loja/cea/',
  riachuelo: 'https://www.promobit.com.br/promocoes/loja/riachuelo/',
  dafiti: 'https://www.promobit.com.br/promocoes/loja/dafiti/',
  zattini: 'https://www.promobit.com.br/promocoes/loja/zattini/',
  hering: 'https://www.promobit.com.br/promocoes/loja/hering/',
};

// Rodízio do radar agendado (a cada 2 min sem custo extra): grandes sempre; especializadas em 3 turnos (varre tudo em 6 min).
const LOJAS_SEMPRE = ['amazon', 'ml', 'shopee', 'shein', 'kabum'];
const LOJAS_TURNO = [
  ['terabyte', 'pichau', 'centauro', 'netshoes', 'nike', 'adidas', 'drogaraia', 'panvel'],
  ['renner', 'cea', 'riachuelo', 'dafiti', 'zattini', 'hering', 'belezanaweb', 'boticario'],
  ['tiktok', 'natura', 'sephora', 'epocacosmeticos', 'drogasil', 'pacheco', 'araujo', 'paguemenos'],
];

const FONTES_CAT_PB = {
  moda: [],
  beleza: [
    'https://www.promobit.com.br/promocoes/perfumes-e-beleza/',
  ],
  perfumes: [
    'https://www.promobit.com.br/promocoes/perfume/s/',
    'https://www.promobit.com.br/promocoes/perfumes-e-beleza/',
  ],
  saude: [
    'https://www.promobit.com.br/promocoes/saude-e-higiene/',
  ],
  casa: [
    'https://www.promobit.com.br/promocoes/eletroportateis/',
    'https://www.promobit.com.br/promocoes/eletrodomesticos/',
  ],
  tech: [
    'https://www.promobit.com.br/promocoes/eletronicos-audio-e-video/',
    'https://www.promobit.com.br/promocoes/informatica/',
    'https://www.promobit.com.br/promocoes/games/',
    'https://www.promobit.com.br/promocoes/console-playstation-5/s/',
  ],
  bebe: ['https://www.promobit.com.br/promocoes/bebes-e-criancas/'],
};

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

function wrapUrlRadar(urlReal, cfg) {
  const api = cfg && cfg.radar && cfg.radar.api_url;
  return api ? `${api}/radar?u=${encodeURIComponent(urlReal)}` : urlReal;
}

function wrapUrlCurtoRadar(urlReal, cfg) {
  const apiCurto = cfg && cfg.link_curto_api;
  if (apiCurto) return `${apiCurto}/curto?u=${encodeURIComponent(urlReal)}`;
  return wrapUrlRadar(urlReal, cfg);
}

/**
 * Planeja as requisições web (Promobit + canais públicos Telegram) e Shopee API do ciclo do radar.
 */
function planejarFontesRadar(cfg, opcoes) {
  const o = Object.assign({ modo: 'agendado', ts: Date.now() }, opcoes || {});
  const rad = (cfg && cfg.radar) || {};
  if (o.modo === 'agendado' && rad.ativo === false) {
    return { ativo: false, opcoes: o, fontesWeb: [], fontesShopee: [] };
  }

  const lojas = (o.lojas && o.lojas.length)
    ? o.lojas
    : (rad.lojas && rad.lojas.length ? rad.lojas : ['amazon', 'ml', 'shopee', 'shein', 'tiktok']);
  const categorias = (o.categorias && o.categorias.length)
    ? o.categorias
    : (rad.categorias && rad.categorias.length ? rad.categorias : ['moda', 'beleza', 'perfumes', 'saude', 'casa', 'tech', 'bebe']);
  const limiteBase = Math.max(1, Number(o.limite) || Number(rad.max_por_ciclo) || 4);
  const limite = (o.modo === 'agendado' && !o.limite && !o.limite_explicito && rad.cadencia_dinamica !== false)
    ? Math.max(limiteBase, 8)
    : limiteBase;

  // Agendado com muitas lojas: grandes sempre + 3 turnos em ciclos de 2 min (varre todas em 6 min)
  let lojasBusca = lojas;
  if (o.modo === 'agendado' && !(o.lojas && o.lojas.length) && lojas.length > 8) {
    const turno = LOJAS_TURNO[Math.floor((o.ts || Date.now()) / 120000) % LOJAS_TURNO.length];
    lojasBusca = lojas.filter((l) => LOJAS_SEMPRE.includes(l) || turno.includes(l) || !LOJAS_TURNO.some((t) => t.includes(l)));
  }

  const fontesWeb = [];
  const urlsVistas = new Set();
  const addWeb = (tipo, urlReal, extra) => {
    if (!urlReal || urlsVistas.has(urlReal)) return;
    urlsVistas.add(urlReal);
    fontesWeb.push(Object.assign({ tipo, url_real: urlReal, url: wrapUrlRadar(urlReal, cfg), headers: HDRS_WEB }, extra || {}));
  };

  if (!o.apenas_cupons_loja) {
    for (const lj of lojasBusca) {
      if (FONTES_LOJA_PB[lj]) addWeb('promobit_loja', FONTES_LOJA_PB[lj], { loja_hint: lj });
    }
    if (!o.lojas || !o.lojas.length) {
      addWeb('promobit_alta', 'https://www.promobit.com.br/', {});
    }
    if (!o.lojas || !o.lojas.length || o.incluir_fontes_cat) {
      for (const cat of categorias) {
        for (const u of FONTES_CAT_PB[cat] || []) addWeb('promobit_cat', u, { categoria_hint: cat });
      }
    }
    for (const canal of rad.canais_telegram || []) {
      const limpo = String(canal || '').replace(/^@/, '').trim();
      if (limpo) addWeb('telegram_canal', `https://t.me/s/${limpo}`, { canal: limpo });
    }
    if (o.modo === 'agendado' && !(rad && rad.api_url) && (!o.lojas || !o.lojas.length) && rad.canais_curados !== false && agenteAtivo(cfg, 'cacador')) {
      for (const canal of CANAIS_CURADOS_RADAR) {
        addWeb('telegram_canal', `https://t.me/s/${canal}`, { canal, curado: true });
      }
      addWeb('gatry_home', 'https://gatry.com/', { curado: true });
    }
  }
  const cuponsAtivo = (cfg && cfg.cupons && cfg.cupons.radar_auto !== false) || o.apenas_cupons_loja;
  if (cuponsAtivo && !o.termo && !o.apenas_em_alta) {
    addWeb('promobit_cupons', 'https://www.promobit.com.br/cupons/', {});
  }

  const fontesShopee = [];
  if (lojas.includes('shopee') && cfg && cfg.shopee && cfg.shopee.app_id && cfg.shopee.secret) {
    const tsSeg = Math.floor((o.ts || Date.now()) / 1000);
    if (o.termo) {
      fontesShopee.push({
        categoria: '',
        keyword: o.termo,
        http: shopee.reqOfertas(cfg.shopee, o.termo, { sortType: 2, limit: 20 }, tsSeg),
      });
    } else if (o.termos_lista && o.termos_lista.length) {
      for (const kw of o.termos_lista.slice(0, 2)) {
        fontesShopee.push({
          categoria: (categorias && categorias[0]) || 'beleza',
          keyword: kw,
          http: shopee.reqOfertas(cfg.shopee, kw, { sortType: 2, limit: 20 }, tsSeg),
        });
      }
    } else {
      const horaIdx = Math.floor((o.ts || Date.now()) / 3600000);
      for (const cat of categorias) {
        const kws = (cfg.shopee.buscas && cfg.shopee.buscas[cat]) || [];
        if (!kws.length) continue;
        const kw = kws[horaIdx % kws.length];
        fontesShopee.push({
          categoria: cat,
          keyword: kw,
          http: shopee.reqOfertas(cfg.shopee, kw, { sortType: 2, limit: 20 }, tsSeg),
        });
      }
    }
  }

  return {
    ativo: true,
    opcoes: Object.assign({}, o, { lojas, categorias, limite }),
    fontesWeb,
    fontesShopee,
  };
}

function normalizarLojaPromobit(storeDomain, storeParam, storeName) {
  const s = [storeDomain, storeParam, storeName].filter(Boolean).join(' ').toLowerCase();
  if (/amazon/.test(s)) return 'amazon';
  if (/mercadoli[vb]re|mercado-livre/.test(s)) return 'ml';
  if (/shopee/.test(s)) return 'shopee';
  if (/shein/.test(s)) return 'shein';
  if (/tiktok/.test(s)) return 'tiktok';
  if (/kabum/.test(s)) return 'kabum';
  if (/terabyte/.test(s)) return 'terabyte';
  if (/pichau/.test(s)) return 'pichau';
  if (/drogaraia|droga-raia|droga raia/.test(s)) return 'drogaraia';
  if (/drogasil/.test(s)) return 'drogasil';
  if (/pacheco|drogariasaopaulo/.test(s)) return 'pacheco';
  if (/panvel/.test(s)) return 'panvel';
  if (/araujo/.test(s)) return 'araujo';
  if (/paguemenos|pague-menos/.test(s)) return 'paguemenos';
  if (/belezanaweb|beleza-na-web|beleza na web/.test(s)) return 'belezanaweb';
  if (/epoca/.test(s)) return 'epocacosmeticos';
  if (/boticario/.test(s)) return 'boticario';
  if (/natura/.test(s)) return 'natura';
  if (/sephora/.test(s)) return 'sephora';
  if (/centauro/.test(s)) return 'centauro';
  if (/netshoes/.test(s)) return 'netshoes';
  if (/\bnike\b/.test(s)) return 'nike';
  if (/adidas/.test(s)) return 'adidas';
  if (/renner|lojas-renner/.test(s)) return 'renner';
  if (/\bcea\b|c&a|cea\.com/.test(s)) return 'cea';
  if (/riachuelo/.test(s)) return 'riachuelo';
  if (/dafiti/.test(s)) return 'dafiti';
  if (/zattini/.test(s)) return 'zattini';
  if (/hering/.test(s)) return 'hering';
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
    } else if (Array.isArray(o.offerTags) && o.offerTags.some((t) => t && /parcelado/i.test(t.name || ''))) {
      parcelamento = 'Parcelamento sem juros disponível';
    }
    const pix = /\b(?:no\s+pix|[àa]\s+vista\s+no\s+pix)\b/i.test(instTxt)
      || (Array.isArray(o.offerTags) && o.offerTags.some((t) => t && /\bpix\b/i.test(t.name || '')));

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

function decodificarEntidadesWeb(s) {
  return String(s || '')
    .replace(/&#0*36;/g, '$')
    .replace(/&#0*33;/g, '!')
    .replace(/&#0*39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');
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
    const links = extrairLinksProduto(textoPlano, linksHtml);
    if (!links.length) continue;
    const linhasFiltradas = textoPlano
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !/\?\s*$/.test(l) || /R\$|https?:/i.test(l));
    const ext = extrairDoTexto(linhasFiltradas.length >= 2 ? linhasFiltradas.join('\n') : textoPlano);
    if (!ext.preco) continue;

    const u0 = links[0];
    const id = identificar(u0);
    const curto = ehCurto(u0);
    if (id.erro && !curto) continue;
    if (!curto && id.loja === 'outra') continue;

    const mImg = bloco.match(/tgme_widget_message_photo_wrap[^>]*style="[^"]*background-image:url\('([^']+)'\)/i);
    const key = mPost ? 'tg_' + mPost[1].replace(/[^\w-]/g, '_') : 'tg_' + truncar(slug(ext.titulo || u0), 24);
    const cupomLimpo = ext.cupom && !CUPOM_TERCEIRO.test(ext.cupom) ? ext.cupom : '';
    out.push({
      radar_key: key,
      loja: curto ? (id.loja && id.loja !== 'outra' ? id.loja : '') : id.loja,
      produto_id: !curto && id.produto_id ? id.produto_id : '',
      titulo: truncar(ext.titulo || `Oferta ${canal}`, 180),
      preco: ext.preco,
      preco_de: ext.preco_de,
      preco_sem_cupom: ext.preco_sem_cupom || ((cupomLimpo || ext.cupom_auto) && ext.preco_de ? ext.preco_de : null),
      desconto_pct: ext.preco_de ? round2(((ext.preco_de - ext.preco) / ext.preco_de) * 100) : 0,
      cupom: cupomLimpo,
      cupom_auto: ext.cupom_auto || '',
      parcelamento: ext.parcelamento || '',
      pix: !!ext.pix,
      exige_resgate_previo: !!ext.exige_resgate_previo,
      imagem: normalizarImagemOferta(ext.imagem || (mImg ? mImg[1] : '')),
      destaque: false,
      likes: 5,
      categoria_fonte: '',
      categoria_hint: '',
      redir_url: curto ? u0 : '',
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
    const tit = decodificarEntidadesWeb((mTit ? mTit[1] : plano.split('—')[0]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    if (!tit || tit.length < 4) continue;
    const mImg = trecho.match(/src="(https?:\/\/[^"]+\.(?:jpe?g|png|webp)[^"]*)"/i);

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
      imagem: normalizarImagemOferta(mImg ? mImg[1] : ''),
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
  const tsRef = o.ts || Date.now();
  const fuso = (cfg && cfg.fuso) || 'America/Sao_Paulo';
  const hora = Number(partesData(tsRef, fuso).hour);
  const fortes = (elegiveis || []).filter((e) => e && (
    e.cupom || e.eh_atualizacao || e.eh_cupom_loja || e.em_alta === 'explodindo' || e.em_alta === 'em_alta' || Number(e.desconto_pct) >= 25
  )).length;

  if (hora >= 1 && hora < 7) return Math.min(maxBase, 2);
  const pico = (hora >= 11 && hora <= 14) || (hora >= 18 && hora <= 23);
  if (pico) {
    if (fortes >= 6) return Math.max(maxBase, 8);
    if (fortes >= 3) return Math.max(maxBase, 6);
    if (fortes >= 1 || (elegiveis || []).length >= 4) return Math.max(maxBase, 5);
    return Math.max(maxBase, 4);
  }
  if (fortes >= 4) return Math.max(maxBase, 5);
  return maxBase;
}

/**
 * Filtra, deduplica (24h estrito + resposta quando baixa/cupom; 72h geral), classifica e seleciona com diversidade.
 * Prepara `reqs1` para resolver links intermediários (Promobit Redirect/to/ ou links curtos) e limpar afiliados de terceiros.
 */
function selecionarCandidatosRadar(base, respWeb, respShopee, ofertasRecentes, precosRows, cfg, alertasRows, descartesRecentes, opcoesExtra) {
  if (!base || base.ativo === false) {
    return { opcoes: (base && base.opcoes) || {}, candidatos: [], reqs1: [] };
  }
  const o = base.opcoes || {};
  const rad = (cfg && cfg.radar) || {};
  const precoMin = Number(rad.preco_min) > 0 ? Number(rad.preco_min) : 15;
  const minDesc = Number(rad.min_desconto_pct) >= 0 ? Number(rad.min_desconto_pct) : 15;
  const lojasPerm = new Set(o.lojas || rad.lojas || ['amazon', 'ml', 'shopee', 'shein', 'tiktok']);
  const catsPerm = new Set(o.categorias || rad.categorias || ['moda', 'beleza', 'perfumes', 'saude', 'casa', 'tech', 'bebe']);
  const palavrasFiltro = !o.termo && rad.palavras && rad.palavras.length ? rad.palavras : [];
  const tsRef = o.ts || Date.now();
  const pbRedirBloqueado = Number(opcoesExtra && opcoesExtra.pb_redir_bloqueado_ate) > tsRef;

  const brutos = [];
  (base.fontesWeb || []).forEach((f, i) => {
    const html = textoRespostaHttp((respWeb || [])[i]);
    if (!html) return;
    if (f.tipo === 'telegram_canal') brutos.push(...lerCanalTelegramPublico(html, f.canal));
    else if (f.tipo === 'gatry_home') brutos.push(...lerGatryHtml(html));
    else brutos.push(...lerPromobitHtml(html, f));
  });
  (base.fontesShopee || []).forEach((f, i) => {
    const r = (respShopee || [])[i] || {};
    const lido = r.error ? { produtos: [] } : shopee.lerOfertas(r);
    for (const p of lido.produtos || []) {
      const precoDe = p.desconto_loja_pct > 0 && p.desconto_loja_pct < 90
        ? round2(p.preco / (1 - p.desconto_loja_pct / 100))
        : null;
      brutos.push({
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
        categoria_fonte: f.keyword || '',
        categoria_hint: f.categoria || '',
        redir_url: '',
        url: p.url,
        resolved: true,
        fonte_radar: 'shopee_api',
      });
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
    if (pbRedirBloqueado && rawC.fonte_radar === 'promobit' && rawC.redir_url) continue;
    if (o.apenas_cupons_loja && !rawC.eh_cupom_loja) continue;
    if (!rawC.eh_cupom_loja && !(rawC.preco >= precoMin)) continue;
    if (rawC.loja && !lojasPerm.has(rawC.loja)) continue;

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
    const tSlug = slug(c.titulo).slice(0, 36);
    if (vistosLote.has(chaveLote) || (tSlug.length >= 10 && vistosLote.has('t:' + tSlug))) continue;

    if (o.termo && !bateTermo(c, o.termo)) continue;
    if (o.termos_lista && o.termos_lista.length && !o.termos_lista.some((kw) => bateTermo(c, kw))) continue;
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
    } else {
      const catAuto = classificarCategoria(c.titulo, cfg, c.categoria_fonte);
      const catRep = rep.eh_atualizacao && rep.anterior && rep.anterior.categoria && catsPerm.has(rep.anterior.categoria)
        ? rep.anterior.categoria
        : '';
      const catConfiavel = catAuto.confianca > 0 ? catAuto.categoria : (c.categoria_hint || CATEGORIA_PADRAO_LOJA[c.loja] || '');
      categoria = catConfiavel || catRep || catAuto.categoria;
      categoria_confianca = catAuto.confianca;
      categoria_indefinida = !catConfiavel && !catRep;
      if (!catsPerm.has(categoria) && !(categoria_indefinida && LOJAS_ENRIQUECER_PAGINA.has(c.loja))) continue;
    }

    vistosLote.add(chaveLote);
    if (tSlug.length >= 10) vistosLote.add('t:' + tSlug);

    const boostMkt = agenteAtivo(cfg, 'marketing') ? avaliarBoostMarketing(c, cfg) : { bonus: 0 };
    const nota = (c.destaque ? 40 : 0)
      + (c.cupom ? 25 : 0)
      + (c.eh_cupom_loja && c.horario_lote ? 25 : 0)
      + (rep.eh_atualizacao ? 25 : 0)
      + Math.min(60, Number(c.desconto_pct) || 0)
      + Math.min(30, (c.likes || 0) * 2)
      + Math.min(25, Math.floor((c.cliques || 0) / 30))
      + Math.min(25, (c.comissao_pct || 0) * 2)
      + alta.bonus
      + boostMkt.bonus;

    elegiveis.push(Object.assign({}, c, {
      categoria,
      categoria_confianca,
      categoria_indefinida,
      nota,
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

  // Ordena por qualidade e seleciona intercalando lojas e categorias + anti-fadiga 90 min para abastecer todos os grupos
  const mktAtivo = agenteAtivo(cfg, 'marketing');
  elegiveis.sort((a, b) => b.nota - a.nota);
  const limite = calcularLimiteDinamicoRadar(cfg, o, elegiveis);
  const fila = elegiveis.slice();
  const escolhidos = [];
  const usadasCat = {};
  const usadasLoja = {};
  const maxCuponsLojaCiclo = o.apenas_cupons_loja ? limite : 1;
  const maxPbRedirCiclo = 4;
  let usadasCupomLoja = 0;
  let usadasPbRedir = 0;
  while (fila.length && escolhidos.length < limite) {
    fila.sort((a, b) => {
      const fadA = mktAtivo ? calcularPenalidadeFadigaRecente(a, ofertasRecentes, tsRef) : 0;
      const fadB = mktAtivo ? calcularPenalidadeFadigaRecente(b, ofertasRecentes, tsRef) : 0;
      const pa = a.nota - fadA - (usadasCat[a.categoria] || 0) * 18 - (usadasLoja[a.loja || 'outra'] || 0) * 14;
      const pb = b.nota - fadB - (usadasCat[b.categoria] || 0) * 18 - (usadasLoja[b.loja || 'outra'] || 0) * 14;
      return pb - pa;
    });
    const item = fila.shift();
    if (item.eh_cupom_loja && usadasCupomLoja >= maxCuponsLojaCiclo) continue;
    if (item.fonte_radar === 'promobit' && item.redir_url && usadasPbRedir >= maxPbRedirCiclo) continue;
    escolhidos.push(item);
    if (item.eh_cupom_loja) usadasCupomLoja++;
    if (item.fonte_radar === 'promobit' && item.redir_url) usadasPbRedir++;
    usadasCat[item.categoria] = (usadasCat[item.categoria] || 0) + 1;
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
        c.loja = id.loja;
        c.produto_id = id.produto_id;
        c.url = id.url_limpa;
        c.resolved = true;
      }
    }
  });

  return { opcoes: o, candidatos: escolhidos, reqs1 };
}

/**
 * 1º salto do radar: extrai a URL da loja a partir do /Redirect/to/<id>/ (ou link curto) e limpa afiliados alheios.
 */
function aplicarRedirRadar1(estado, resp1, cfg) {
  const cands = (estado.candidatos || []).map((c) => Object.assign({}, c));
  const reqs2 = [];
  let promobit429 = false;
  let promobitOk = false;
  (estado.reqs1 || []).forEach((req, k) => {
    const c = cands[req.idx];
    const r = (resp1 || [])[k];
    if (!c || !r) return;
    const st = Number(r.statusCode || (r.error && r.error.status) || 0);
    if (st === 429 && c.fonte_radar === 'promobit') {
      promobit429 = true;
      return;
    }
    let url = lerLocation(r);
    if (!url) return;
    if (c.fonte_radar === 'promobit') promobitOk = true;
    url = desempacotarRedirLoja(url);
    if (/promobit\.com\.br|gatry\.com/i.test(url)) return;
    if (ehCurto(url)) {
      reqs2.push({ idx: req.idx, url: wrapUrlCurtoRadar(url, cfg), headers: HDRS_WEB });
      return;
    }
    if (/mercadoli(?:vre|bre)\.com(?:\.br)?\/social\//i.test(url) && !/(?:\/p\/|MLB-?)\d{6,}/i.test(url)) {
      c._social_url = url;
      return;
    }
    const id = identificar(url);
    if (!id.erro) {
      c.loja = id.loja;
      c.produto_id = id.produto_id;
      c.url = id.url_limpa;
      c.resolved = true;
    }
  });
  return { opcoes: estado.opcoes, candidatos: cands, reqs2, promobit_429: promobit429, promobit_ok: promobitOk };
}

/**
 * 2º salto do radar: expande links curtos (amzn.to, s.shopee.com.br, meli.la, tiktok.com/t/…).
 * Se cair em vitrine /social/ do Mercado Livre sem MLB, agenda o 3º salto para abrir a vitrine.
 */
function aplicarRedirRadar2(estado, resp2, cfg) {
  const cands = (estado.candidatos || []).map((c) => Object.assign({}, c));
  const reqs3 = [];
  (estado.reqs2 || []).forEach((req, k) => {
    const c = cands[req.idx];
    const r = (resp2 || [])[k];
    if (!c || !r) return;
    let loc = lerLocation(r);
    if (!loc) return;
    loc = desempacotarRedirLoja(loc);
    if (/promobit\.com\.br|gatry\.com/i.test(loc)) return;

    if (ehCurto(loc)) {
      reqs3.push({ idx: req.idx, url: wrapUrlRadar(loc, cfg), headers: HDRS_WEB });
      return;
    }
    if (/mercadoli(?:vre|bre)\.com(?:\.br)?\/social\//i.test(loc) && !/(?:\/p\/|MLB-?)\d{6,}/i.test(loc)) {
      reqs3.push({ idx: req.idx, url: wrapUrlRadar(loc, cfg), headers: HDRS_WEB });
      return;
    }
    const id = identificar(loc);
    if (!id.erro) {
      c.loja = id.loja;
      c.produto_id = id.produto_id;
      c.url = id.url_limpa;
      c.resolved = true;
    }
  });
  cands.forEach((c, idx) => {
    if (c && c._social_url && !c.resolved && !reqs3.some((q) => q.idx === idx)) {
      reqs3.push({ idx, url: wrapUrlRadar(c._social_url, cfg), headers: HDRS_WEB });
    }
  });
  return { opcoes: estado.opcoes, candidatos: cands, reqs3 };
}

function extrairProdutoHtmlSocial(html) {
  const mFeat = html.match(/https:\/\/(?:www\.|produto\.)?mercadolivre\.com\.br\/[^"'\s<>]*?(?:\/p\/MLB\d+|MLB-?\d+)[^"'\s<>]*card-featured[^"'\s<>]*/i);
  if (mFeat) return mFeat[0].replace(/&amp;/g, '&');
  const mMlb = html.match(/https:\/\/(?:www\.|produto\.)?mercadolivre\.com\.br\/[^"'\s<>]*?(?:\/p\/MLB\d+|MLB-?\d+[^"'\s<>]*)/i);
  if (mMlb) return mMlb[0].replace(/&amp;/g, '&');
  const can = extrairHrefCanonica(html);
  return can || '';
}

const LOJAS_ENRIQUECER_PAGINA = new Set([
  'amazon', 'ml', 'kabum', 'terabyte', 'pichau',
  'belezanaweb', 'epocacosmeticos', 'boticario', 'natura', 'sephora',
  'drogaraia', 'drogasil', 'pacheco', 'panvel', 'araujo', 'paguemenos',
  'centauro', 'netshoes', 'nike', 'adidas', 'renner', 'cea', 'riachuelo', 'dafiti', 'zattini', 'hering',
]);

function resolverReqs3EmCands(cands, reqs3, resp3) {
  (reqs3 || []).forEach((req, k) => {
    const c = cands[req.idx];
    const r = (resp3 || [])[k];
    if (!c || !r) return;
    let alvo = lerLocation(r);
    if (!alvo || /\/social\//i.test(alvo)) {
      const html = textoRespostaHttp(r);
      if (html) alvo = extrairProdutoHtmlSocial(html);
    }
    alvo = desempacotarRedirLoja(alvo);
    if (!alvo || /promobit\.com\.br|gatry\.com/i.test(alvo)) return;
    const id = identificar(alvo);
    if (!id.erro) {
      c.loja = id.loja;
      c.produto_id = id.produto_id;
      c.url = id.url_limpa;
      c.resolved = true;
    }
  });
}

/**
 * Conclui o 3º salto (vitrines /social/ ML) e agenda a leitura gratuita das páginas dos produtos escolhidos
 * para capturar cupons ativos no anúncio (checkbox/código), preço sem cupom e parcelamento sem juros.
 */
function prepararPaginasRadar(estado, resp3, cfg) {
  const cands = (estado.candidatos || []).map((c) => Object.assign({}, c));
  resolverReqs3EmCands(cands, estado.reqs3, resp3);
  const reqsPag = [];
  const itensMercado = [];
  cands.forEach((c, idx) => {
    c.reqs3_done = true;
    if (!c.eh_cupom_loja && c.resolved && c.url && LOJAS_ENRIQUECER_PAGINA.has(c.loja)) {
      const rp = reqPaginaProduto(c.url, cfg);
      reqsPag.push({ idx, url: rp.url, headers: rp.headers });
    }
    if (!c.eh_cupom_loja && c.resolved && c.titulo && c.preco > 0) {
      itensMercado.push({ idx, titulo: c.titulo, loja: c.loja, preco: c.preco, eh_cupom_loja: false });
    }
  });
  const reqsMercado = agenteAtivo(cfg, 'auditor') ? montarReqsMercado(itensMercado, cfg) : [];
  return { opcoes: estado.opcoes, candidatos: cands, reqsPag, reqsMercado };
}

function enriquecerCandidatosComPaginas(cands, reqsPag, respPaginas, cfg) {
  (reqsPag || []).forEach((req, k) => {
    const c = cands[req.idx];
    const rPag = (respPaginas || [])[k];
    if (!c || !rPag) return;
    const lido = lerPaginaProduto(rPag, c.url);
    if (!lido.ok && !lido.cupom && !lido.cupom_auto && !lido.parcelamento) return;

    if ((String(c.fonte_radar || '').startsWith('telegram_') || c.fonte_radar === 'gatry') && lido.titulo && lido.titulo.length >= 6 && !/^produto\s/i.test(lido.titulo)) {
      c.titulo = truncar(lido.titulo, 180);
    }
    if (lido.imagem && (!c.imagem || /promobit\.com\.br|wsrv\.nl|telesco\.pe|telegram\.org|t\.me|\/images\/G\//i.test(c.imagem))) {
      c.imagem = normalizarImagemOferta(lido.imagem);
    }
    if (!c.parcelamento && lido.parcelamento) c.parcelamento = lido.parcelamento;
    if (lido.preco_parcelado && !c.preco_parcelado) c.preco_parcelado = lido.preco_parcelado;
    if (lido.pix && !c.pix) c.pix = true;
    if (!c.cupom && lido.cupom && !CUPOM_TERCEIRO.test(lido.cupom)) c.cupom = lido.cupom;
    if (lido.cupom_prime) c.cupom_prime = true;
    if (lido.exige_resgate_pagina) c.exige_resgate_pagina = true;

    const tinhaCupom = !!(c.cupom || c.cupom_auto);
    if (!c.cupom && !c.cupom_auto && lido.cupom_auto) c.cupom_auto = lido.cupom_auto;

    if (lido.preco && lido.preco > 0 && (lido.cupom_pct || lido.cupom_valor)) {
      const precoRealComCup = lido.cupom_pct
        ? round2(lido.preco * (1 - lido.cupom_pct / 100))
        : round2(lido.preco - lido.cupom_valor);
      if (precoRealComCup > 0 && precoRealComCup < lido.preco) {
        if (precoRealComCup > c.preco * 1.35) {
          c.expirada_na_loja = true;
          return;
        }
        c.preco_sem_cupom = lido.preco;
        c.preco_de = (lido.preco_de && lido.preco_de > lido.preco)
          ? lido.preco_de
          : (c.preco_de && c.preco_de > lido.preco ? c.preco_de : lido.preco);
        c.preco = precoRealComCup;
        recalcularParcelamentoComCupom(lido, c, lido.cupom_pct, lido.cupom_valor);
      }
    } else if (!tinhaCupom && lido.preco && lido.preco > 0) {
      if (lido.preco > c.preco * 1.35) {
        c.expirada_na_loja = true;
        return;
      }
      if (lido.preco > c.preco) c.preco = lido.preco;
    } else if (tinhaCupom && lido.preco && lido.preco > c.preco) {
      c.preco_sem_cupom = c.preco_sem_cupom || lido.preco;
      c.preco_de = (lido.preco_de && lido.preco_de > lido.preco)
        ? lido.preco_de
        : (c.preco_de && c.preco_de > lido.preco ? c.preco_de : lido.preco);
    }
    if (lido.preco && lido.preco > 0) c.preco_confirmado_loja = true;
    // Sempre recalcula: se o preço na loja subiu até o "De", o desconto acabou (não pode ficar o % antigo).
    if (c.preco_de && c.preco_de > c.preco) {
      c.desconto_pct = round2(((c.preco_de - c.preco) / c.preco_de) * 100);
    } else {
      c.preco_de = null;
      c.desconto_pct = 0;
    }
    if (lido.categoria_loja || lido.titulo || c.url || c.categoria_indefinida) {
      const reCat = classificarCategoria(c.titulo, cfg, [c.categoria_fonte || '', lido.categoria_loja || '', lido.titulo || '', c.url || ''].join(' '));
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
    if ((!c.imagem || /wsrv\.nl|telesco\.pe|telegram\.org|t\.me|\/images\/G\//i.test(c.imagem)) && av.imagem_mercado) {
      c.imagem = normalizarImagemOferta(av.imagem_mercado);
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
 *   - cupom que realmente baixa o preço (preço sem cupom ≥ 5% acima);
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
  if ((c.cupom || c.cupom_auto) && semCupom > 0 && semCupom >= preco * 1.05) return { ok: true, motivo: 'cupom' };
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
  const ts = o.ts || Date.now();
  const fuso = (cfg && cfg.fuso) || 'America/Sao_Paulo';
  const hora = Number(partesData(ts, fuso).hour);
  const silenciosoNoite = o.modo === 'agendado' && (hora >= 22 || hora < 8);
  const hojeIso = diaISO(ts, fuso);
  let topHoje = (ofertasRecentes || [])
    .filter((r) => r && r.top && r.ts && diaISO(Number(r.ts), fuso) === hojeIso)
    .length;

  const porProduto = {};
  for (const r of precosRows || []) if (r && r.produto_id) (porProduto[r.produto_id] = porProduto[r.produto_id] || []).push(r);

  const lojasPerm = new Set(o.lojas || (cfg && cfg.radar && cfg.radar.lojas) || ['amazon', 'ml', 'shopee', 'shein', 'tiktok']);
  const catsPerm = new Set(o.categorias || (cfg && cfg.radar && cfg.radar.categorias) || []);
  const destinoAdmins = o.modo === 'comando' && o.chat_id ? [o.chat_id] : ((cfg && cfg.admins) || []);
  const modoAuto = !!(cfg && cfg.radar && cfg.radar.publicar_direto);
  const autoTop = !(cfg && cfg.radar && cfg.radar.auto_top === false);

  const ofertasNovas = [];
  const precosNovos = [];
  const chamadas = [];
  const autoPlanos = [];
  const reqsShopeeLinks = [];
  const vistosFim = new Set();
  const descartadas = [];

  for (const c of cands) {
    if (!c.resolved || !c.url || !c.produto_id) continue;
    if (c.expirada_na_loja || c.reprovado_mercado) continue;
    if (!lojasPerm.has(c.loja)) continue;
    if (/promobit\.com\.br|gatry\.com/i.test(c.url)) continue;
    if (vistosFim.has(c.produto_id)) continue;
    const repFim = avaliarRepeticao24h(c, ofertasRecentes, ts, { modo_radar: true, janela_radar_72h: true });
    if (repFim.bloquear) continue;
    vistosFim.add(c.produto_id);

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
    if (!c.eh_cupom_loja && catFinal && catsPerm.size && !catsPerm.has(catFinal)) continue;
    if ((o.modo === 'agendado' || modoAuto) && !c.eh_cupom_loja && c.categoria_indefinida) {
      descartadas.push({ chave: c.produto_id || c.radar_key || '', radar_key: c.radar_key || '', titulo: truncar(c.titulo || '', 60), loja: c.loja, preco: c.preco, motivo: 'sem_categoria' });
      continue;
    }
    if (o.modo === 'agendado') {
      const real = avaliarOfertaReal(c, sel, cfg);
      if (!real.ok) {
        descartadas.push({ chave: c.produto_id || c.radar_key || '', radar_key: c.radar_key || '', titulo: truncar(c.titulo || '', 60), loja: c.loja, preco: c.preco, motivo: real.motivo });
        continue;
      }
    }

    const irTop = c.eh_cupom_loja
      ? (c.escopo_cupom === 'geral')
      : !!(autoTop && topHoje < TOP_LIMITE
        && (c.desconto_pct >= 40 || (c.desconto_pct >= 30 && (c.cupom || c.cupom_auto || c.destaque)) || (c.em_alta === 'explodindo' && c.desconto_pct >= 20)));
    if (irTop && !c.eh_cupom_loja) topHoje++;

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
    if (c.em_alta) manuais.em_alta = c.em_alta;
    if (c.desejo_tipo) manuais.desejo_tipo = c.desejo_tipo;
    if (c.cliques >= 80) manuais.cliques_comunidade = c.cliques;
    const repostId = repFim.repost_de || c.repost_de || '';
    if (repostId) {
      manuais.repost_de = repostId;
      if (repFim.preco_anterior != null) manuais.preco_anterior = repFim.preco_anterior;
      else if (c.preco_anterior != null) manuais.preco_anterior = c.preco_anterior;
      manuais.motivo_repost = repFim.motivo_repost || c.motivo_repost || 'baixou';
    }

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
    chamadas.push(msgAdmin(
      o.chat_id,
      `🔎 Nenhuma promoção nova encontrada para "${o.rotulo || 'o filtro atual'}" no momento (tudo que saiu recente já foi exibido ou ainda não atingiu o desconto mínimo).\n💡 Tente /radar status ou outro termo como /radar perfume.`,
    ));
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

/**
 * Executa a publicação automática em lote para ofertas do radar quando /modo piloto está ligado.
 */
function publicarLoteRadar(fin, respShopeeLinks, respCards, cfg, postsRecentes) {
  const planos = (fin && fin.autoPlanos) || [];
  if (!planos.length) return { updates: [], linksRows: [], chamadasPub: [], ofertasPublicadas: [], chamadasWhatsApp: [] };

  const resolvidosPorPlano = planos.map((p) => (p.linkItens || []).map((it) => Object.assign({}, it)));
  ((fin && fin.reqsShopeeLinks) || []).forEach((req, k) => {
    const r = (respShopeeLinks || [])[k] || {};
    const orig = resolvidosPorPlano[req.planoIdx] && resolvidosPorPlano[req.planoIdx][req.itemIdx];
    if (orig) resolvidosPorPlano[req.planoIdx][req.itemIdx] = lerRespostasShopee([orig], [r])[0];
  });

  const o = (fin && fin.opcoes) || {};
  const tsBase = o.ts || Date.now();
  const fuso = (cfg && cfg.fuso) || 'America/Sao_Paulo';
  const hora = Number(partesData(tsBase, fuso).hour);
  const silenciosoNoite = o.modo === 'agendado' && (hora >= 22 || hora < 8);

  const updates = [];
  const linksRows = [];
  const chamadasPub = [];
  const ofertasPublicadas = [];
  const chamadasWhatsApp = [];
  planos.forEach((p, idx) => {
    const cardResp = p.cardIdx >= 0 ? (respCards || [])[p.cardIdx] : null;
    const msgId = cardResp && cardResp.ok && cardResp.result ? cardResp.result.message_id : 0;
    const pub = prepararPublicacao(p.oferta, resolvidosPorPlano[idx], cfg, {
      ts: p.ts,
      chat_id: p.chat_id,
      message_id: msgId,
      so_textos: !!p.so_textos,
      postsAnteriores: Array.isArray(postsRecentes) ? postsRecentes : [],
    });
    if (pub.update) updates.push(pub.update);
    if (pub.linksRows && pub.linksRows.length) linksRows.push(...pub.linksRows);
    if (pub.ok && !p.so_textos) ofertasPublicadas.push(p.oferta);
    if (pub.chamadasWhatsApp && pub.chamadasWhatsApp.length) chamadasWhatsApp.push(...pub.chamadasWhatsApp);
    if (pub.chamadas && pub.chamadas.length) {
      for (const ch of pub.chamadas) {
        if (silenciosoNoite && ch.bot === 'admin' && ch.metodo === 'sendMessage' && ch.payload) {
          ch.payload.disable_notification = true;
        }
        chamadasPub.push(ch);
      }
    }
  });

  return { updates, linksRows, chamadasPub, ofertasPublicadas, chamadasWhatsApp };
}

module.exports = {
  textoStatusRadar,
  interpretarComandoRadar,
  calcularLimiteDinamicoRadar,
  planejarFontesRadar,
  lerPromobitHtml,
  lerCanalTelegramPublico,
  lerGatryHtml,
  avaliarEmAlta,
  selecionarCandidatosRadar,
  aplicarRedirRadar1,
  aplicarRedirRadar2,
  prepararPaginasRadar,
  finalizarRadar,
  avaliarOfertaReal,
  atualizarDescartesRadar,
  publicarLoteRadar,
};
