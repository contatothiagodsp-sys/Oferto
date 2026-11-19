'use strict';
// Radar Multi-Fonte gratuito (Mercado Livre, Amazon, Shopee, Shein e TikTok Shop):
// · coleta promoções públicas (Promobit por loja e nicho, Shopee Affiliate Open API e canais t.me/s/ opcionais)
// · desempacota redirecionamentos em até 3 saltos e remove 100% de tags/afiliados de terceiros
// · injeta automaticamente o afiliado do próprio usuário, preserva cupom e parcelamento sem juros
// · respeita o esquema estrito das Data Tables e funciona em 1-clique (cards) ou /modo piloto (automático).
const { round2, formatBRL, slug, truncar, novoId, partesData, diaISO } = require('./util');
const { sha256Hex } = require('./sha256');
const { parseUrl, identificar, nomeLoja, urlCentralCupons, logoLoja, ehImagemProibida, ehImagemLojaOficial, normalizarImagemOferta } = require('./lojas');
const { ehCurto, lerLocation, textoRespostaHttp, desempacotarRedirLoja, extrairHrefCanonica } = require('./curtos');
const { extrairLinksProduto, extrairDoTexto, tituloDaUrl, limparTituloLoja, limparMencoesTerceiros, pareceChamadaOuGancho, classificarCategoria, bateTermoInteligente, normalizarBusca, CATEGORIA_PADRAO_LOJA, detectarEscopoCupom, detectarResgatePrevioCupom, detectarTagCampanha, reqPaginaProduto, lerPaginaProduto, qtdUnidadesOferta, recalcularParcelamentoComCupom, avaliarRepeticao24h } = require('./extrator');
const { montarReqsMercado, extrairHitsRespostaMercado, casarProdutosMercado, avaliarPrecoMercado, resumirAvisoMercado } = require('./mercado');
const { planejarLinks, parseManuais, statusAfiliadoFonte } = require('./links');
const shopee = require('./shopee');
const { avaliarSelo, precisaSnapshot, origemMin90 } = require('./selo');
const textos = require('./textos');
const { textoStatusRadar, interpretarComandoRadar } = require('./config');
const { msgAdmin } = require('./telegram');
const { chamadaCard, linhaOferta, linhaPreco, prepararPublicacao, lerRespostasShopee, temDestinoTelegram, TOP_LIMITE, limiteTopDia } = require('./fluxos');
const { agenteAtivo, bateTermoComSinonimos, calcularPenalidadeFadigaRecente, avaliarBoostMarketing } = require('./agentes');

const DIA = 24 * 60 * 60 * 1000;
const TECLADO_AUTO = { inline_keyboard: [[{ text: '⏳ Publicando automaticamente…', callback_data: 'noop' }]] };
const CANAIS_CURADOS_RADAR = ['canaltechofertas', 'xetdaspromocoes', 'promobit', 'nerdofertas'];

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
  paguemenos: 'https://www.promobit.com.br/promocoes/loja/pague-menos/',
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
  magalu: 'https://www.promobit.com.br/promocoes/loja/magazine-luiza/',
};

// Rodízio do radar agendado (a cada 2 min sem custo extra): grandes sempre; especializadas em 3 turnos (varre tudo em 6 min).
const LOJAS_SEMPRE = ['amazon', 'ml', 'shopee', 'shein', 'kabum'];
const LOJAS_TURNO = [
  ['terabyte', 'pichau', 'centauro', 'netshoes', 'nike', 'adidas', 'drogaraia', 'panvel', 'umusic'],
  ['renner', 'cea', 'riachuelo', 'dafiti', 'zattini', 'hering', 'belezanaweb', 'boticario', 'klinestore', 'kpopandyoushop'],
  ['tiktok', 'natura', 'sephora', 'epocacosmeticos', 'drogasil', 'pacheco', 'araujo', 'paguemenos', 'hopescolor', 'asiaticstore'],
];

const BUSCAS_AMAZON_KPOP = [
  { url: 'https://www.amazon.com.br/s?k=kpop+album&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { url: 'https://www.amazon.com.br/s?k=bts+album&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { url: 'https://www.amazon.com.br/s?k=stray+kids+album&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { url: 'https://www.amazon.com.br/s?k=blackpink+twice+album&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { url: 'https://www.amazon.com.br/s?k=lightstick+kpop&rh=p_85%3A19171728011', oficial: false },
  { url: 'https://www.amazon.com.br/s?k=photocard+kpop&rh=p_85%3A19171728011', oficial: false },
  { url: 'https://www.amazon.com.br/s?k=fichario+photocard+kpop&rh=p_85%3A19171728011', oficial: false },
  { url: 'https://www.amazon.com.br/s?k=bt21+oficial&rh=p_85%3A19171728011', oficial: false },
  { url: 'https://www.amazon.com.br/s?k=enhypen+seventeen+album&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { url: 'https://www.amazon.com.br/s?k=newjeans+aespa+ive+album&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { url: 'https://www.amazon.com.br/s?k=ateez+txt+album&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { url: 'https://www.amazon.com.br/s?k=le+sserafim+babymonster+illit+album&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { url: 'https://www.amazon.com.br/s?k=nct+exo+monsta+x+album&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { url: 'https://www.amazon.com.br/s?k=funko+pop+bts+blackpink&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { url: 'https://www.amazon.com.br/s?k=vinil+kpop+bts+blackpink&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { url: 'https://www.amazon.com.br/s?k=skzoo+bt21+oficial&rh=p_85%3A19171728011', oficial: false },
];

// Catálogos públicos VTEX de lojas brasileiras confiáveis (sem custo, estoque/desconto reais, independentes do Promobit)
const CATALOGOS_VTEX_PRIORITARIOS = [
  { loja: 'pacheco', cat: 'bebe', url: 'https://www.drogariaspacheco.com.br/api/catalog_system/pub/products/search/fraldas?O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'pacheco', cat: 'saude', url: 'https://www.drogariaspacheco.com.br/api/catalog_system/pub/products/search/creatina?O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'pacheco', cat: 'bebe', url: 'https://www.drogariaspacheco.com.br/api/catalog_system/pub/products/search/pampers?O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'pacheco', cat: 'saude', url: 'https://www.drogariaspacheco.com.br/api/catalog_system/pub/products/search/whey?O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'pacheco', cat: 'bebe', url: 'https://www.drogariaspacheco.com.br/api/catalog_system/pub/products/search/huggies?O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'pacheco', cat: 'saude', url: 'https://www.drogariaspacheco.com.br/api/catalog_system/pub/products/search/vitaminas?O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'pacheco', cat: 'saude', url: 'https://www.drogariaspacheco.com.br/api/catalog_system/pub/products/search/suplementos?O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'pacheco', cat: 'saude', url: 'https://www.drogariaspacheco.com.br/api/catalog_system/pub/products/search/oral-b?O=OrderByBestDiscountDESC&_from=0&_to=11' },
];

const CATALOGOS_VTEX_DIVERSOS = [
  { loja: 'epocacosmeticos', cat: 'perfumes', url: 'https://www.epocacosmeticos.com.br/api/catalog_system/pub/products/search?ft=perfume&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'epocacosmeticos', cat: 'beleza', url: 'https://www.epocacosmeticos.com.br/api/catalog_system/pub/products/search?ft=protetor+solar&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'pacheco', cat: 'beleza', url: 'https://www.drogariaspacheco.com.br/api/catalog_system/pub/products/search/protetor-solar?O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'epocacosmeticos', cat: 'beleza', url: 'https://www.epocacosmeticos.com.br/api/catalog_system/pub/products/search?ft=serum&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'cea', cat: 'moda', url: 'https://www.cea.com.br/api/catalog_system/pub/products/search/tenis?O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'hering', cat: 'moda', url: 'https://www.hering.com.br/api/catalog_system/pub/products/search?ft=camiseta&O=OrderByBestDiscountDESC&_from=0&_to=11' },
];

// Buscas oficiais Vendido e entregue pela Amazon (p_6=A1ZZFT5FULY4LN) para categorias com menor volume no Promobit/Telegram
const BUSCAS_AMAZON_NICHO = [
  { cat: 'bebe', url: 'https://www.amazon.com.br/s?k=fralda+pampers&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'saude', url: 'https://www.amazon.com.br/s?k=creatina+monohidratada&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'bebe', url: 'https://www.amazon.com.br/s?k=fralda+huggies&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'saude', url: 'https://www.amazon.com.br/s?k=whey+protein&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'beleza', url: 'https://www.amazon.com.br/s?k=protetor+solar+la+roche+cerave&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'bebe', url: 'https://www.amazon.com.br/s?k=lenco+umedecido+bebe&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'saude', url: 'https://www.amazon.com.br/s?k=escova+eletrica+oral+b&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'perfumes', url: 'https://www.amazon.com.br/s?k=perfume+eau+de+parfum&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'bebe', url: 'https://www.amazon.com.br/s?k=formula+infantil+nan+aptamil&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'saude', url: 'https://www.amazon.com.br/s?k=omega+3+multivitaminico&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'beleza', url: 'https://www.amazon.com.br/s?k=serum+principia+hidratante+cerave&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'bebe', url: 'https://www.amazon.com.br/s?k=brinquedo+educativo+fisher+price+lego&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
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
  kpop: [],
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
  const tsRef = (o.ts != null && Number.isFinite(Number(o.ts))) ? Number(o.ts) : Date.now();
  const rad = (cfg && cfg.radar) || {};
  if (o.modo === 'agendado' && rad.ativo === false) {
    return { ativo: false, opcoes: o, fontesWeb: [], fontesShopee: [] };
  }

  const lojas = (o.lojas && o.lojas.length)
    ? o.lojas
    : (rad.lojas && rad.lojas.length ? rad.lojas : ['amazon', 'ml', 'shopee', 'shein', 'tiktok']);
  const categorias = (o.categorias && o.categorias.length)
    ? o.categorias
    : (rad.categorias && rad.categorias.length ? rad.categorias : ['moda', 'beleza', 'perfumes', 'saude', 'casa', 'tech', 'bebe', 'kpop']);
  const limiteBase = Math.max(1, Number(o.limite) || Number(rad.max_por_ciclo) || 4);
  const limite = (o.modo === 'agendado' && !o.limite && !o.limite_explicito && rad.cadencia_dinamica !== false)
    ? Math.max(limiteBase, 8)
    : limiteBase;

  // Agendado com muitas lojas: grandes sempre + 3 turnos em ciclos de 2 min (varre todas em 6 min)
  let lojasBusca = lojas;
  if (o.modo === 'agendado' && !(o.lojas && o.lojas.length) && lojas.length > 8) {
    const turno = LOJAS_TURNO[Math.floor(tsRef / 120000) % LOJAS_TURNO.length];
    lojasBusca = lojas.filter((l) => LOJAS_SEMPRE.includes(l) || turno.includes(l) || !LOJAS_TURNO.some((t) => t.includes(l)));
  }

  const fontesWeb = [];
  const urlsVistas = new Set();
  const addWeb = (tipo, urlReal, extra) => {
    if (!urlReal || urlsVistas.has(urlReal)) return;
    urlsVistas.add(urlReal);
    fontesWeb.push(Object.assign({ tipo, url_real: urlReal, url: wrapUrlRadar(urlReal, cfg), headers: HDRS_WEB }, extra || {}));
  };

  const pbBloqueado = o.modo === 'agendado' && Number(o.pb_redir_bloqueado_ate) > tsRef;
  if (!o.apenas_cupons_loja) {
    if (!pbBloqueado) {
      for (const lj of lojasBusca) {
        if (FONTES_LOJA_PB[lj]) addWeb('promobit_loja', FONTES_LOJA_PB[lj], { loja_hint: lj });
      }
      if (!o.lojas || !o.lojas.length) {
        addWeb('promobit_alta', 'https://www.promobit.com.br/', {});
      }
      if (!o.lojas || !o.lojas.length || o.incluir_fontes_cat) {
        const catsTurn = (o.modo === 'agendado' && (!o.lojas || !o.lojas.length) && categorias.length > 3)
          ? categorias.filter((_, idx) => idx % 4 === (Math.floor(tsRef / 120000) % 4))
          : categorias;
        for (const cat of catsTurn) {
          for (const u of FONTES_CAT_PB[cat] || []) addWeb('promobit_cat', u, { categoria_hint: cat });
        }
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
    if (categorias.includes('kpop') && !(rad && rad.api_url)) {
      if (lojasBusca.includes('umusic') || (o.categorias && o.categorias.includes('kpop'))) {
        addWeb('umusic_vtex', 'https://www.umusicstore.com/api/catalog_system/pub/products/search/k-pop?O=OrderByBestDiscountDESC&_from=0&_to=19', {
          loja_hint: 'umusic',
          categoria_hint: 'kpop',
        });
      }
      const nuvemKpop = [
        { loja: 'klinestore', url: 'https://www.klinestore.com.br/produtos/' },
        { loja: 'hopescolor', url: 'https://www.hopescolor.com/produtos/' },
        { loja: 'asiaticstore', url: 'https://www.asiaticstore.com.br/produtos/' },
        { loja: 'kpopandyoushop', url: 'https://www.kpopandyoushop.com.br/produtos/' },
      ].filter((x) => lojas.includes(x.loja));
      if (nuvemKpop.length) {
        if (o.categorias && o.categorias.includes('kpop')) {
          for (const nk of nuvemKpop) addWeb('nuvemshop_kpop', nk.url, { loja_hint: nk.loja, categoria_hint: 'kpop' });
        } else {
          const nuvemDisp = nuvemKpop.filter((x) => lojasBusca.includes(x.loja));
          if (nuvemDisp.length) {
            const nk = nuvemDisp[Math.floor(tsRef / 120000) % nuvemDisp.length];
            addWeb('nuvemshop_kpop', nk.url, { loja_hint: nk.loja, categoria_hint: 'kpop' });
          }
        }
      }
      if (lojas.includes('amazon') && (!o.lojas || !o.lojas.length || o.lojas.includes('amazon'))) {
        const turnoAmz = Math.floor(tsRef / 120000);
        if (o.categorias && o.categorias.includes('kpop')) {
          for (const qIdx of [0, 4, 5, 7]) {
            const qa = BUSCAS_AMAZON_KPOP[qIdx];
            addWeb('amazon_busca', qa.url, { loja_hint: 'amazon', categoria_hint: 'kpop', loja_oficial: qa.oficial });
          }
        } else {
          const qa = BUSCAS_AMAZON_KPOP[turnoAmz % BUSCAS_AMAZON_KPOP.length];
          addWeb('amazon_busca', qa.url, { loja_hint: 'amazon', categoria_hint: 'kpop', loja_oficial: qa.oficial });
        }
      }
    }
    if (!(rad && rad.api_url)) {
      const turnoCiclo = Math.floor(tsRef / 120000);
      const vtexPrio = CATALOGOS_VTEX_PRIORITARIOS.filter((x) => lojas.includes(x.loja) && categorias.includes(x.cat));
      const vtexDiv = CATALOGOS_VTEX_DIVERSOS.filter((x) => lojas.includes(x.loja) && categorias.includes(x.cat));
      if (o.categorias && o.categorias.length) {
        const vtexMatch = vtexPrio.concat(vtexDiv).slice(0, 4);
        for (const vf of vtexMatch) {
          addWeb('vtex_catalogo', vf.url, { loja_hint: vf.loja, categoria_hint: vf.cat });
        }
      } else {
        if (vtexPrio.length) {
          const vf1 = vtexPrio[turnoCiclo % vtexPrio.length];
          addWeb('vtex_catalogo', vf1.url, { loja_hint: vf1.loja, categoria_hint: vf1.cat });
        }
        if (vtexDiv.length) {
          const vf2 = vtexDiv[turnoCiclo % vtexDiv.length];
          addWeb('vtex_catalogo', vf2.url, { loja_hint: vf2.loja, categoria_hint: vf2.cat });
        }
      }
      if (lojas.includes('amazon') && (!o.lojas || !o.lojas.length || o.lojas.includes('amazon'))) {
        const amzNicho = BUSCAS_AMAZON_NICHO.filter((x) => categorias.includes(x.cat));
        if (amzNicho.length) {
          if (o.categorias && o.categorias.length && !(o.categorias.length === 1 && o.categorias[0] === 'kpop')) {
            for (const qa of amzNicho.slice(0, 2)) {
              addWeb('amazon_busca', qa.url, { loja_hint: 'amazon', categoria_hint: qa.cat, loja_oficial: qa.oficial });
            }
          } else if (!(o.categorias && o.categorias.length)) {
            const qa = amzNicho[turnoCiclo % amzNicho.length];
            addWeb('amazon_busca', qa.url, { loja_hint: 'amazon', categoria_hint: qa.cat, loja_oficial: qa.oficial });
          }
        }
      }
    }
  }
  const cuponsAtivo = (cfg && cfg.cupons && cfg.cupons.radar_auto !== false) || o.apenas_cupons_loja;
  const turnoCupons = o.modo !== 'agendado' || o.apenas_cupons_loja || (Math.floor(tsRef / 120000) % 3 === 0);
  if (cuponsAtivo && turnoCupons && !o.termo && !o.apenas_em_alta && !(o.shop_ids && o.shop_ids.length) && !(o.shop_usernames && o.shop_usernames.length)) {
    addWeb('promobit_cupons', 'https://www.promobit.com.br/cupons/', {});
  }

  // Intercala fontes Promobit e não-Promobit e separa buscas da Amazon para evitar rajadas no mesmo domínio
  const pbWeb = fontesWeb.filter((f) => String(f.tipo || '').startsWith('promobit'));
  const amzWeb = fontesWeb.filter((f) => f.tipo === 'amazon_busca');
  const outrasWeb = fontesWeb.filter((f) => !String(f.tipo || '').startsWith('promobit') && f.tipo !== 'amazon_busca');
  const fontesWebOrd = [];
  if (amzWeb.length) fontesWebOrd.push(amzWeb.shift());
  const maxLenWeb = Math.max(pbWeb.length, outrasWeb.length);
  for (let i = 0; i < maxLenWeb; i++) {
    if (i < pbWeb.length) fontesWebOrd.push(pbWeb[i]);
    if (i < outrasWeb.length) fontesWebOrd.push(outrasWeb[i]);
  }
  while (amzWeb.length) fontesWebOrd.push(amzWeb.shift());

  const fontesShopee = [];
  if (!o.apenas_cupons_loja && lojas.includes('shopee') && cfg && cfg.shopee && cfg.shopee.app_id && cfg.shopee.secret) {
    const tsSeg = Math.floor(tsRef / 1000);
    const kpopShops = shopee.LOJAS_KPOP_SHOPEE || [];
    const kpopShopsComId = kpopShops.filter((x) => x.shop_id);
    const addKpopShop = (lk, kw) => {
      if (!lk || !lk.shop_id) return;
      fontesShopee.push({
        categoria: 'kpop',
        keyword: kw || `shop:${lk.username}`,
        shop_id: lk.shop_id,
        shop_username: lk.username,
        shop_name: lk.nome,
        loja_kpop_curada: true,
        http: shopee.reqOfertas(cfg.shopee, kw || '', { shopId: lk.shop_id, sortType: 2, limit: 20 }, tsSeg),
      });
    };
    if (o.shop_ids && o.shop_ids.length) {
      for (const sid of o.shop_ids) {
        const lk = kpopShops.find((x) => x.shop_id && x.shop_id === String(sid));
        fontesShopee.push({
          categoria: (categorias && categorias[0]) || 'kpop',
          keyword: o.termo || (lk ? `shop:${lk.username}` : `shop:${sid}`),
          shop_id: String(sid),
          shop_username: lk ? lk.username : '',
          shop_name: lk ? lk.nome : '',
          loja_kpop_curada: !!lk,
          http: shopee.reqOfertas(cfg.shopee, o.termo || '', { shopId: sid, sortType: 2, limit: 20 }, tsSeg),
        });
      }
    } else if (o.shop_usernames && o.shop_usernames.length) {
      for (const unameRaw of o.shop_usernames) {
        const uname = String(unameRaw || '').toLowerCase().trim();
        if (!uname) continue;
        const lk = kpopShops.find((x) => x.username === uname || (x.aliases || []).includes(uname));
        if (lk && lk.shop_id) {
          addKpopShop(lk, o.termo || '');
        } else {
          const kw1 = o.termo || (lk && lk.busca_keyword) || (lk && lk.nome) || uname;
          fontesShopee.push({
            categoria: (categorias && categorias[0]) || 'kpop',
            keyword: kw1,
            shop_username: (lk && lk.username) || uname,
            shop_name: (lk && lk.nome) || '',
            http: shopee.reqOfertas(cfg.shopee, kw1, { sortType: 2, limit: 20 }, tsSeg),
          });
          if (!o.termo && kw1.toLowerCase() !== 'album kpop') {
            fontesShopee.push({
              categoria: (categorias && categorias[0]) || 'kpop',
              keyword: 'album kpop',
              shop_username: (lk && lk.username) || uname,
              shop_name: (lk && lk.nome) || '',
              http: shopee.reqOfertas(cfg.shopee, 'album kpop', { sortType: 2, limit: 20 }, tsSeg),
            });
          }
        }
      }
    } else if (o.termo) {
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
      if (categorias.includes('kpop')) {
        for (const lk of kpopShopsComId) addKpopShop(lk, '');
      }
    } else {
      const minIdx = Math.floor(tsRef / 120000);
      for (const cat of categorias) {
        const kws = (cfg.shopee.buscas && cfg.shopee.buscas[cat]) || [];
        if (cat === 'kpop') {
          if (kws.length) {
            const kw1 = kws[minIdx % kws.length];
            fontesShopee.push({
              categoria: cat,
              keyword: kw1,
              http: shopee.reqOfertas(cfg.shopee, kw1, { sortType: 2, limit: 20 }, tsSeg),
            });
          }
          if (o.categorias && o.categorias.includes('kpop') && o.categorias.length === 1) {
            if (kws.length >= 2) {
              const kw1 = kws[minIdx % kws.length];
              const kw2 = kws[(minIdx + Math.floor(kws.length / 2)) % kws.length];
              if (kw2 !== kw1) {
                fontesShopee.push({
                  categoria: cat,
                  keyword: kw2,
                  http: shopee.reqOfertas(cfg.shopee, kw2, { sortType: 2, limit: 20 }, tsSeg),
                });
              }
            }
            for (const lk of kpopShopsComId) addKpopShop(lk, '');
          } else if (kpopShopsComId.length) {
            addKpopShop(kpopShopsComId[minIdx % kpopShopsComId.length], '');
          } else if (kws.length >= 2) {
            const kw1 = kws[minIdx % kws.length];
            const kw2 = kws[(minIdx + Math.floor(kws.length / 2)) % kws.length];
            if (kw2 !== kw1) {
              fontesShopee.push({
                categoria: cat,
                keyword: kw2,
                http: shopee.reqOfertas(cfg.shopee, kw2, { sortType: 2, limit: 20 }, tsSeg),
              });
            }
          }
        } else {
          if (!kws.length) continue;
          const kw = kws[minIdx % kws.length];
          fontesShopee.push({
            categoria: cat,
            keyword: kw,
            http: shopee.reqOfertas(cfg.shopee, kw, { sortType: 2, limit: 20 }, tsSeg),
          });
        }
      }
    }
  }

  return {
    ativo: true,
    opcoes: Object.assign({}, o, { lojas, categorias, limite }),
    fontesWeb: fontesWebOrd,
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
    } else if (Array.isArray(o.offerTags) && o.offerTags.some((t) => t && /parcelado/i.test(t.name || ''))) {
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

function decodificarEntidadesWeb(s) {
  return String(s || '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\u00AD]/g, '')
    .replace(/&(?:NegativeMediumSpace|ZeroWidthSpace|zwnj|zwj|shy|hairsp);/gi, '')
    .replace(/&(?:thinsp|ensp|emsp);/gi, ' ')
    .replace(/&ldquo;|&rdquo;|&bdquo;|&Prime;/gi, '"')
    .replace(/&lsquo;|&rsquo;|&sbquo;|&prime;|&apos;/gi, "'")
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&hellip;/gi, '…')
    .replace(/&bull;|&middot;/gi, '·')
    .replace(/&deg;/gi, '°')
    .replace(/&times;/gi, 'x')
    .replace(/&ordm;/gi, 'º')
    .replace(/&ordf;/gi, 'ª')
    .replace(/&reg;|&circledr;/gi, '®')
    .replace(/&trade;/gi, '™')
    .replace(/&#0*36;/g, '$')
    .replace(/&#0*33;/g, '!')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const n = parseInt(h, 16);
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : ' ';
    })
    .replace(/&#(\d+);/g, (_, d) => {
      const n = parseInt(d, 10);
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : ' ';
    })
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ');
}

function preservarQtdUnidadesTitulo(titulo, qtd) {
  const t = String(titulo || '').trim();
  const q = Number(qtd) || 1;
  if (!t || q < 2) return t;
  if (new RegExp(`^\\s*${q}\\s*x\\b`, 'i').test(t)) return t;
  if (new RegExp(`\\b(?:kit|combo|pack)\\s+(?:com\\s+)?${q}\\b`, 'i').test(t)) return t;
  if (new RegExp(`\\b${q}\\s*(?:un(?:id(?:ades?)?)?|unidades?|pe[cç]as?)\\b`, 'i').test(t)) return t;
  return truncar(`${q}x ${t}`, 180);
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

/**
 * Parser genérico da API pública VTEX (`/api/catalog_system/pub/products/search`) para lojas oficiais BR
 * (Universal Music Store, Drogarias Pacheco, Época Cosméticos, C&A, Hering, etc.).
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
  const out = [];
  const vistos = new Set();
  for (const p of lista) {
    if (!p || !p.productName) continue;
    const itens = Array.isArray(p.items) ? p.items : [];
    let best = null;
    for (const it of itens) {
      const sellers = Array.isArray(it && it.sellers) ? it.sellers : [];
      for (const sel of sellers) {
        const of = sel && sel.commertialOffer;
        if (of && Number(of.AvailableQuantity) > 0 && Number(of.Price) > 0) {
          best = { it, of };
          break;
        }
      }
      if (best) break;
    }
    if (!best) continue;
    const preco = round2(Number(best.of.Price));
    const list = round2(Number(best.of.ListPrice) || 0);
    if (!(preco > 0)) continue;
    const descPct = list > preco ? Math.round(((list - preco) / list) * 100) : 0;
    const uBruta = String(p.link || (lojaPadrao === 'umusic' && p.linkText ? `https://www.umusicstore.com/${p.linkText}/p` : '')).trim();
    const id = identificar(uBruta);
    if (id.erro) continue;
    const lojaFinal = id.loja !== 'outra' ? id.loja : lojaPadrao;
    if (!lojaFinal) continue;
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
      titulo: truncar(limparMencoesTerceiros(decodificarEntidadesWeb(p.productName)), 180),
      preco,
      preco_de: list > preco ? list : null,
      preco_sem_cupom: null,
      desconto_pct: descPct,
      cupom: '',
      cupom_auto: '',
      parcelamento: '',
      imagem: img,
      destaque: descPct >= 25,
      likes: descPct >= 20 ? 10 : 4,
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
  return lerCatalogoVtex(raw, { loja: 'umusic', categoria_hint: 'kpop', fonte_radar: 'umusic_vtex', prefixo_id: 'umu_' });
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

const RE_KPOP_TITULO = /\b(?:k-?pop|k pop|guerreiras do k-?pop|lightstick|army\s*bomb|carat\s*bong|candybong|moabong|nachimbong|neobong|photocard|photocards|lomo\s*card|lomocard|fich[aá]rio\s+photocard|toploader|bt21|skzoo|tinytan|aniteez|ppulbatu|season'?s?\s*greetings|photobook|dicon|digipack|digiversion|jewel\s*case|weverse|repackage|mini\s*album|skzhop|map of the soul|ready to be|[aá]lbum\b.*\b(?:bts|blackpink|stray\s*kids|twice|txt|enhypen|seventeen|aespa|newjeans|ive|ateez|le\s*sserafim|itzy|nct|exo|shinee|illit|babymonster|katseye|riize|boynextdoor)|bts|blackpink|stray\s*kids|twice|enhypen|seventeen|aespa|newjeans|ive|ateez|le\s*sserafim|itzy|nct\s*(?:127|dream|wish)|wayv|illit|babymonster|katseye|jungkook|jimin|taehyung|suga|agust\s*d|j-?hope|lisa|ros[eé]|jennie|jisoo|nayeon|jihyo|taemin|baekhyun)\b/i;

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
    if (catHint === 'kpop' && !RE_KPOP_TITULO.test(tit)) continue;

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

function aplicarMetadadosLojaKpopShopee(c, rawUrl) {
  if (!c || c.loja !== 'shopee') return;
  const kpopSh = shopee.identificarLojaKpopShopee({
    shopId: c.shop_id,
    shopName: c.shop_name,
    url: rawUrl || c.url,
  });
  if (!kpopSh) return;
  c.loja_kpop_curada = true;
  c.loja_confiavel = true;
  c.loja_indicada = true;
  if (kpopSh.oficial) c.loja_oficial = true;
  if (kpopSh.shop_id) c.shop_id = kpopSh.shop_id;
  c.shop_username = kpopSh.username;
  if (!c.shop_name) c.shop_name = kpopSh.nome;
  c.categoria_hint = 'kpop';
  c.categoria = 'kpop';
  c.categoria_indefinida = false;
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
  const catsPerm = new Set(o.categorias || rad.categorias || ['moda', 'beleza', 'perfumes', 'saude', 'casa', 'tech', 'bebe', 'kpop']);
  const shopIdsPerm = o.shop_ids && o.shop_ids.length ? new Set(o.shop_ids.map(String)) : null;
  const shopUsernamesPerm = o.shop_usernames && o.shop_usernames.length ? new Set(o.shop_usernames.map((u) => String(u).toLowerCase())) : null;
  const palavrasFiltro = !o.termo && rad.palavras && rad.palavras.length ? rad.palavras : [];
  const tsRef = (o.ts != null && Number.isFinite(Number(o.ts))) ? Number(o.ts) : Date.now();
  const pbRedirBloqueado = Number(opcoesExtra && opcoesExtra.pb_redir_bloqueado_ate) > tsRef;

  const brutos = [];
  (base.fontesWeb || []).forEach((f, i) => {
    const html = textoRespostaHttp((respWeb || [])[i]);
    if (!html) return;
    if (f.tipo === 'telegram_canal') brutos.push(...lerCanalTelegramPublico(html, f.canal));
    else if (f.tipo === 'gatry_home') brutos.push(...lerGatryHtml(html));
    else if (f.tipo === 'umusic_vtex') brutos.push(...lerUmusicVtex(html));
    else if (f.tipo === 'vtex_catalogo') brutos.push(...lerCatalogoVtex(html, { loja: f.loja_hint, categoria_hint: f.categoria_hint, fonte_radar: 'vtex_catalogo' }));
    else if (f.tipo === 'nuvemshop_kpop') brutos.push(...lerNuvemshopKpop(html, f.loja_hint || 'klinestore', f.url_real));
    else if (f.tipo === 'amazon_busca') brutos.push(...lerAmazonBuscaHtml(html, f.url_real, { categoria_hint: f.categoria_hint, loja_oficial: f.loja_oficial }));
    else brutos.push(...lerPromobitHtml(html, f));
  });
  (base.fontesShopee || []).forEach((f, i) => {
    const r = (respShopee || [])[i] || {};
    const lido = r.error ? { produtos: [] } : shopee.lerOfertas(r);
    for (const p of lido.produtos || []) {
      if (shopee.ehAnuncioServicoShopee(p.titulo)) continue;
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
    const tSlug = slug(c.titulo).slice(0, 36);
    if (vistosLote.has(chaveLote) || (tSlug.length >= 10 && vistosLote.has('t:' + tSlug))) continue;

    if (o.termo && !bateTermo(c, o.termo)) continue;
    const catKpopPre = (catsPerm.size === 1 && catsPerm.has('kpop'))
      ? classificarCategoria(c.titulo, cfg, c.categoria_fonte)
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
      const catAuto = classificarCategoria(c.titulo, cfg, c.categoria_fonte);
      const catRep = rep.eh_atualizacao && rep.anterior && rep.anterior.categoria && catsPerm.has(rep.anterior.categoria)
        ? rep.anterior.categoria
        : '';
      const catConfiavel = catAuto.confianca > 0 ? catAuto.categoria : (c.categoria_hint || CATEGORIA_PADRAO_LOJA[c.loja] || '');
      categoria = catConfiavel || catRep || catAuto.categoria;
      categoria_confianca = catAuto.confianca;
      categoria_indefinida = !catConfiavel && !catRep;
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

  // Ordena por qualidade e seleciona intercalando lojas e categorias + anti-fadiga 90 min + boost de fome (6h) para tópicos parados
  const mktAtivo = agenteAtivo(cfg, 'marketing');
  const contCat90m = {};
  const contLoja90m = {};
  const contCat6h = {};
  if (Array.isArray(ofertasRecentes) && ofertasRecentes.length) {
    const corte90m = tsRef - 90 * 60000;
    const corte6h = tsRef - 6 * 3600000;
    for (const r of ofertasRecentes) {
      if (!r || !r.ts || Number(r.ts) < corte6h) continue;
      if (r.status !== 'aprovada' && r.status !== 'publicando') continue;
      if (r.categoria) contCat6h[r.categoria] = (contCat6h[r.categoria] || 0) + 1;
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
  const maxCuponsLojaCiclo = o.apenas_cupons_loja ? limite : 1;
  const maxPbRedirCiclo = 5;
  let usadasCupomLoja = 0;
  let usadasPbRedir = 0;
  while (fila.length && escolhidos.length < limiteSelecao) {
    fila.sort((a, b) => {
      const pa = a.nota + bonusFomeCat(a.categoria) - fadigaBase(a) - (usadasCat[a.categoria] || 0) * 18 - (usadasLoja[a.loja || 'outra'] || 0) * 14;
      const pb = b.nota + bonusFomeCat(b.categoria) - fadigaBase(b) - (usadasCat[b.categoria] || 0) * 18 - (usadasLoja[b.loja || 'outra'] || 0) * 14;
      if (Math.abs(pb - pa) >= 0.01) return pb - pa;
      return (Number(!!b.afiliado_ativo) - Number(!!a.afiliado_ativo)) || (Number(!!b.oferece_afiliado) - Number(!!a.oferece_afiliado));
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
        if (c.loja === 'shopee') aplicarMetadadosLojaKpopShopee(c, c.url);
      }
    }
  });

  return { opcoes: Object.assign({}, o, { limite_alvo: limite }), candidatos: escolhidos, reqs1 };
}

function ehUrlHubNaoProduto(url) {
  return /shopee\.com\.br\/m\/cupom|amazon\.com\.br\/promotion\/psp\/|\/(?:m\/)?cupons(?:-diarios)?(?:[/?#]|$)/i.test(String(url || ''));
}

function tentarFallbackRedirAlt(c, idx, listaReqs, cfg) {
  if (!c || !Array.isArray(c.redir_url_alts) || !c.redir_url_alts.length) return false;
  const alt = c.redir_url_alts.shift();
  if (!alt) return false;
  if (ehCurto(alt)) {
    listaReqs.push({ idx, url: wrapUrlCurtoRadar(alt, cfg), headers: HDRS_WEB });
    return true;
  }
  const id = identificar(alt);
  if (!id.erro && id.loja !== 'outra' && !ehUrlHubNaoProduto(id.url_limpa)) {
    c.loja = id.loja;
    c.produto_id = id.produto_id;
    c.url = id.url_limpa;
    c.resolved = true;
    if (c.loja === 'shopee') aplicarMetadadosLojaKpopShopee(c, alt);
    return true;
  }
  return false;
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
    if (c.fonte_radar === 'promobit' && (st === 429 || ((st === 403 || st >= 500) && /Acesso Bloqueado|GoCache|Too Many Requests/i.test(textoRespostaHttp(r))))) {
      promobit429 = true;
      c._promobit_429 = true;
      return;
    }
    let url = lerLocation(r);
    if (!url) {
      if (!tentarFallbackRedirAlt(c, req.idx, reqs2, cfg)) c._descarte_motivo = 'sem_location_redir';
      return;
    }
    if (c.fonte_radar === 'promobit') promobitOk = true;
    url = desempacotarRedirLoja(url);
    if (/promobit\.com\.br|gatry\.com/i.test(url)) {
      if (!tentarFallbackRedirAlt(c, req.idx, reqs2, cfg)) c._descarte_motivo = 'redir_terceiro';
      return;
    }
    if (ehCurto(url)) {
      reqs2.push({ idx: req.idx, url: wrapUrlCurtoRadar(url, cfg), headers: HDRS_WEB });
      return;
    }
    if (!c.eh_cupom_loja && ehUrlHubNaoProduto(url)) {
      if (!tentarFallbackRedirAlt(c, req.idx, reqs2, cfg)) c._descarte_motivo = 'nao_produto';
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
      if (c.loja === 'shopee') aplicarMetadadosLojaKpopShopee(c, url);
    } else if (!tentarFallbackRedirAlt(c, req.idx, reqs2, cfg)) {
      c._descarte_motivo = 'nao_produto';
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
    if (!loc) {
      if (!tentarFallbackRedirAlt(c, req.idx, reqs3, cfg)) c._descarte_motivo = 'sem_location_redir2';
      return;
    }
    loc = desempacotarRedirLoja(loc);
    if (/promobit\.com\.br|gatry\.com/i.test(loc)) {
      if (!tentarFallbackRedirAlt(c, req.idx, reqs3, cfg)) c._descarte_motivo = 'redir_terceiro';
      return;
    }

    if (ehCurto(loc)) {
      reqs3.push({ idx: req.idx, url: wrapUrlRadar(loc, cfg), headers: HDRS_WEB });
      return;
    }
    if (!c.eh_cupom_loja && ehUrlHubNaoProduto(loc)) {
      if (!tentarFallbackRedirAlt(c, req.idx, reqs3, cfg)) c._descarte_motivo = 'nao_produto';
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
      if (c.loja === 'shopee') aplicarMetadadosLojaKpopShopee(c, loc);
    } else if (!tentarFallbackRedirAlt(c, req.idx, reqs3, cfg)) {
      c._descarte_motivo = 'nao_produto';
    }
  });
  cands.forEach((c, idx) => {
    if (c && c._social_url && !c.resolved && !reqs3.some((q) => q.idx === idx)) {
      reqs3.push({ idx, url: wrapUrlRadar(c._social_url, cfg), headers: HDRS_WEB });
    }
  });
  return { opcoes: estado.opcoes, candidatos: cands, reqs3 };
}

function extrairDadosHtmlSocial(html, tituloCand) {
  const txt = String(html || '');
  if (!txt) return null;
  const partes = txt.split('poly-card__portada').slice(1);
  const titLimpoCand = /^oferta\s+/i.test(String(tituloCand || '').trim()) ? '' : String(tituloCand || '');
  const toksCand = titLimpoCand.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length >= 3 && !/^(?:para|com|sem|por|mais|menos|oferta|promo|cupom|conto|precinho)$/.test(w));

  const cards = [];
  for (const rawP of partes) {
    const bloco = rawP.slice(0, 8000);
    const mHref = bloco.match(/href="(https:\/\/(?:www\.|produto\.)?mercadolivre\.com\.br\/[^"]+)"/i);
    if (!mHref) continue;
    const urlBruta = mHref[1].replace(/&amp;/g, '&');
    if (!/(?:\/(?:u?p)\/MLB(?:U)?\d{6,}|\/MLB-?\d{6,})/i.test(urlBruta)) continue;
    const ehFeatured = /card-featured/i.test(urlBruta) || /card-featured/i.test(bloco.slice(0, 2500));
    const mImg = bloco.match(/src="(https:\/\/[^"]*mlstatic\.com\/D_[^"]+)"/i);
    const mTit = bloco.match(/poly-component__title[^>]*>([\s\S]*?)<\/a>/i) || bloco.match(/alt="([^"]+)"/i);
    const titulo = mTit ? limparTituloLoja(mTit[1]) : '';
    const imagem = mImg ? normalizarImagemOferta(mImg[1]) : '';
    const mAnt = bloco.match(/andes-money-amount--previous[\s\S]{0,500}?andes-money-amount__fraction[^>]*>([\d.]+)<\/span>(?:[\s\S]{0,220}?andes-money-amount__cents[^>]*>(\d{2})<\/span>)?/i);
    const preco_de = mAnt ? Number((mAnt[2] ? `${mAnt[1]},${mAnt[2]}` : mAnt[1]).replace(/\./g, '').replace(',', '.')) : null;
    const mAtu = bloco.match(/poly-price__current[\s\S]{0,650}?andes-money-amount__fraction[^>]*>([\d.]+)<\/span>(?:[\s\S]{0,220}?andes-money-amount__cents[^>]*>(\d{2})<\/span>)?/i);
    const preco = mAtu ? Number((mAtu[2] ? `${mAtu[1]},${mAtu[2]}` : mAtu[1]).replace(/\./g, '').replace(',', '.')) : null;
    const mInst = bloco.match(/poly-price__installments[^>]*>([\s\S]{0,1200}?)<\/span>\s*<\/div>/i)
      || bloco.match(/poly-price__installments[^>]*>([\s\S]{0,1200}?sem\s+juros)/i);
    let parcelamento = '';
    if (mInst) {
      const txtInst = decodificarEntidadesWeb(mInst[1].replace(/<[^>]+>/g, ' ')).replace(/R\$\s*([\d.]+)\s*,\s*(\d{2})/g, 'R$ $1,$2').replace(/\s+/g, ' ').trim();
      const mP = txtInst.match(/\b(\d{1,2})\s*x\s*(?:de\s*)?R\$\s*([\d.]+,\d{2})(?:\s*sem\s*juros)?/i);
      if (mP && Number(mP[1]) >= 2) {
        parcelamento = `Em até ${mP[1]}x de R$ ${mP[2]}${/sem\s*juros/i.test(txtInst) ? ' sem juros' : ''}`;
      }
    }
    const mHigh = bloco.match(/poly-component__highlight[^>]*>([\s\S]{0,300}?)<\/span>/i);
    const campanha = detectarTagCampanha([mHigh ? mHigh[1].replace(/<[^>]+>/g, ' ') : '', titulo].join(' ')) || '';
    const normTit = (titulo + ' ' + urlBruta).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const batidos = toksCand.filter((t) => normTit.includes(t)).length;
    cards.push({
      url: urlBruta,
      ehFeatured,
      titulo,
      imagem,
      preco: Number.isFinite(preco) && preco > 0 ? preco : null,
      preco_de: Number.isFinite(preco_de) && preco_de > 0 ? preco_de : null,
      parcelamento,
      campanha,
      batidos,
    });
  }

  const ehListaGeral = /\/social\/[^"'\s<>]+\/lists\b/i.test(txt.slice(0, 15000));
  const feat = cards.find((x) => x.ehFeatured);

  if (toksCand.length >= 1) {
    if ( cards.length ) {
      const minReq = Math.min(2, toksCand.length);
      const ordenado = cards.slice().sort((a, b) => (b.batidos - a.batidos) || (Number(b.ehFeatured) - Number(a.ehFeatured)));
      const melhor = ordenado[0];
      if (feat && feat.batidos >= minReq && feat.batidos >= melhor.batidos) return feat;
      if (melhor && (melhor.batidos >= minReq || (melhor.ehFeatured && melhor.batidos >= 1))) return melhor;
      return null;
    }
  } else {
    if (feat) return feat;
    if (!ehListaGeral && cards.length === 1) return cards[0];
    if (ehListaGeral && cards.length > 1) return null;
  }

  const mFeat = txt.match(/https:\/\/(?:www\.|produto\.)?mercadolivre\.com\.br\/[^"'\s<>]*?(?:\/(?:u?p)\/MLB(?:U)?\d{6,}|\/MLB-?\d{6,})[^"'\s<>]*card-featured[^"'\s<>]*/i);
  if (mFeat) {
    const uFeat = mFeat[0].replace(/&amp;/g, '&');
    if (toksCand.length >= 1) {
      const normUF = uFeat.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (toksCand.filter((t) => normUF.includes(t)).length === 0) return null;
    }
    return { url: uFeat, titulo: '', imagem: '', preco: null, preco_de: null, parcelamento: '', campanha: '' };
  }
  if (!ehListaGeral) {
    const mMlb = txt.match(/https:\/\/(?:www\.|produto\.)?mercadolivre\.com\.br\/[^"'\s<>]*?(?:\/(?:u?p)\/MLB(?:U)?\d{6,}|\/MLB-?\d{6,}[^"'\s<>]*)/i);
    if (mMlb) {
      const urlCand = mMlb[0].replace(/&amp;/g, '&');
      if (toksCand.length >= 1) {
        const normU = urlCand.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const batU = toksCand.filter((t) => normU.includes(t)).length;
        if (batU === 0) return null;
      }
      return { url: urlCand, titulo: '', imagem: '', preco: null, preco_de: null, parcelamento: '', campanha: '' };
    }
  }
  const can = extrairHrefCanonica(txt);
  return can && !/\/social\//i.test(can) ? { url: can, titulo: '', imagem: '', preco: null, preco_de: null, parcelamento: '', campanha: '' } : null;
}

function extrairProdutoHtmlSocial(html, tituloCand) {
  const d = extrairDadosHtmlSocial(html, tituloCand);
  return (d && d.url) || '';
}

const LOJAS_ENRIQUECER_PAGINA = new Set([
  'amazon', 'ml', 'kabum', 'terabyte', 'pichau',
  'belezanaweb', 'epocacosmeticos', 'boticario', 'natura', 'sephora',
  'drogaraia', 'drogasil', 'pacheco', 'panvel', 'araujo', 'paguemenos',
  'centauro', 'netshoes', 'nike', 'adidas', 'renner', 'cea', 'riachuelo', 'dafiti', 'zattini', 'hering',
  'umusic', 'klinestore', 'hopescolor', 'asiaticstore', 'kpopandyoushop', 'kpopmerch', 'ktown4u',
]);

function resolverReqs3EmCands(cands, reqs3, resp3) {
  (reqs3 || []).forEach((req, k) => {
    const c = cands[req.idx];
    const r = (resp3 || [])[k];
    if (!c || !r) return;
    const html = textoRespostaHttp(r);
    const ehVitrineSocial = /\/social\//i.test(String(req.url || c._social_url || ''))
      || /poly-card__portada|poly-component__title/i.test(html);
    let social = null;
    let alvo = '';
    if (ehVitrineSocial && html) {
      social = extrairDadosHtmlSocial(html, c.titulo);
      alvo = social ? social.url : '';
    } else {
      alvo = lerLocation(r);
      if ((!alvo || /\/social\//i.test(alvo)) && html) {
        social = extrairDadosHtmlSocial(html, c.titulo);
        alvo = social ? social.url : '';
      }
    }
    alvo = desempacotarRedirLoja(alvo);
    if (!alvo || /promobit\.com\.br|gatry\.com/i.test(alvo)) {
      c._descarte_motivo = 'vitrine_sem_produto';
      return;
    }
    const id = identificar(alvo);
    if (!id.erro) {
      c.loja = id.loja;
      c.produto_id = id.produto_id;
      c.url = id.url_limpa;
      c.resolved = true;
      if (c.loja === 'shopee') aplicarMetadadosLojaKpopShopee(c, alvo);
      if (social) {
        if (social.imagem) {
          c.imagem = social.imagem;
          c._social_enriquecido = true;
        }
        if (social.titulo && social.titulo.length >= 6) {
          c.titulo = truncar(preservarQtdUnidadesTitulo(limparMencoesTerceiros(social.titulo), c._qtd_unidades), 180);
        }
        if (!(c._qtd_unidades >= 2) && (c.cupom || c.cupom_auto) && social.preco && social.preco > c.preco && !c.preco_sem_cupom) {
          c.preco_sem_cupom = round2(social.preco);
        }
        const pDeSoc = (social.preco_de && social.preco_de > c.preco)
          ? social.preco_de
          : (!(c._qtd_unidades >= 2) && (c.cupom || c.cupom_auto) && social.preco && social.preco > c.preco ? social.preco : null);
        if (!c.preco_de && pDeSoc) {
          c.preco_de = round2(pDeSoc);
          c.desconto_pct = round2(((c.preco_de - c.preco) / c.preco_de) * 100);
        }
        if (!c.parcelamento && social.parcelamento) {
          c.parcelamento = social.parcelamento;
          if ((c.cupom || c.cupom_auto) && social.preco && social.preco > c.preco) {
            recalcularParcelamentoComCupom({ preco: social.preco, parcelamento: social.parcelamento }, c, null, round2(social.preco - c.preco));
          }
        }
        if (!c.campanha && social.campanha) {
          c.campanha = social.campanha;
        }
      }
    }
  });
}

const FONTES_CATALOGO_DIRETO = new Set(['umusic_vtex', 'vtex_catalogo', 'nuvemshop_kpop', 'amazon_busca', 'shopee_api']);
const LOJAS_KPOP_ESPECIALIZADAS = new Set(['umusic', 'klinestore', 'hopescolor', 'asiaticstore', 'kpopandyoushop', 'kpopmerch', 'ktown4u', 'weverse']);

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
    c.imagem = normalizarImagemOferta(c.imagem);
    c.titulo = limparMencoesTerceiros(c.titulo);
    if (c.resolved && c.url) {
      if (c.loja === 'shopee') aplicarMetadadosLojaKpopShopee(c, c.url);
      const slugUrl = tituloDaUrl(c.url);
      const ehCatalogoDireto = FONTES_CATALOGO_DIRETO.has(c.fonte_radar);
      if (slugUrl && (!c.titulo || c.titulo.length < 10 || (!ehCatalogoDireto && pareceChamadaOuGancho(c.titulo)))) {
        c.titulo = preservarQtdUnidadesTitulo(slugUrl, c._qtd_unidades);
      }
      if (!c.loja_kpop_curada && (c.categoria_indefinida || slugUrl)) {
        const reCat = classificarCategoria(c.titulo, cfg, [c.categoria_fonte || '', slugUrl || '', c.url || ''].join(' '));
        if (reCat.confianca > 0) {
          c.categoria = reCat.categoria;
          c.categoria_confianca = reCat.confianca;
          c.categoria_indefinida = false;
        }
      }
    }
    const jaTemVitrineMl = c.loja === 'ml' && c._social_enriquecido && c.imagem && c.titulo;
    const jaTemCatalogoDireto = (c.fonte_radar === 'umusic_vtex' || c.fonte_radar === 'vtex_catalogo' || c.fonte_radar === 'nuvemshop_kpop') && c.titulo && c.preco > 0 && c.imagem;
    if (!c.eh_cupom_loja && c.resolved && c.url && LOJAS_ENRIQUECER_PAGINA.has(c.loja) && !jaTemVitrineMl && !jaTemCatalogoDireto) {
      const rp = reqPaginaProduto(c.url, cfg);
      reqsPag.push({ idx, url: rp.url, headers: rp.headers });
    }
    if (!c.eh_cupom_loja && c.resolved && c.titulo && c.preco > 0 && !LOJAS_KPOP_ESPECIALIZADAS.has(c.loja) && !c.loja_kpop_curada) {
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
    if (!c.parcelamento && lido.parcelamento) c.parcelamento = lido.parcelamento;
    if (lido.preco_parcelado && !c.preco_parcelado) c.preco_parcelado = lido.preco_parcelado;
    if (lido.pix && !c.pix) c.pix = true;
    if (lido.recorrencia && !c.recorrencia) c.recorrencia = true;
    if (lido.recorrencia_preco != null && c.recorrencia_preco == null) c.recorrencia_preco = lido.recorrencia_preco;
    if (lido.recorrencia_pct != null && c.recorrencia_pct == null) c.recorrencia_pct = lido.recorrencia_pct;
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
  if (c.cupom && c.cupom.length >= 4 && (c.em_alta || Number(c.ref_mercado) >= preco * 1.03 || /^(?:MP|BLACK|MELI|FULL|SHOP|PRIME|OFF|PERI|GAME)/i.test(c.cupom))) {
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
  let topHoje = (ofertasRecentes || [])
    .filter((r) => r && r.top && r.ts && diaISO(Number(r.ts), fuso) === hojeIso)
    .length;

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
      const reUrlCat = classificarCategoria(c.titulo, cfg, [c.categoria_fonte || '', c.url || ''].join(' '));
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
    const irTop = c.eh_cupom_loja
      ? (c.escopo_cupom === 'geral')
      : !!(autoTop && topHoje < maxTop
        && (c.desconto_pct >= 35
          || (c.desconto_pct >= 28 && (c.cupom || c.cupom_auto || c.destaque))
          || ((c.em_alta === 'explodindo' || c.em_alta === 'em_alta') && c.desconto_pct >= 20)));
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
  const tsBase = (o.ts != null && Number.isFinite(Number(o.ts))) ? Number(o.ts) : Date.now();
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
  lerCatalogoVtex,
  lerUmusicVtex,
  lerNuvemshopKpop,
  lerAmazonBuscaHtml,
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
