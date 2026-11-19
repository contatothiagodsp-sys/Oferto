'use strict';
// Planejamento de fontes do Radar Multi-Fonte (extraído de lib/radar.js para maximizar tree-shaking nos workflows).
const shopee = require('./shopee');

const CANAIS_CURADOS_RADAR = ['canaltechofertas', 'xetdaspromocoes', 'nerdofertas'];

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
  aliexpress: 'https://www.promobit.com.br/promocoes/loja/aliexpress/',
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
  ['terabyte', 'pichau', 'centauro', 'netshoes', 'nike', 'adidas', 'drogaraia', 'panvel', 'umusic', 'kpopalbums', 'oficialfarma', 'venancio', 'olympikus', 'polishop', 'acer'],
  ['renner', 'cea', 'riachuelo', 'dafiti', 'zattini', 'hering', 'belezanaweb', 'boticario', 'klinestore', 'kpopandyoushop', 'mahogany', 'creamy', 'rihappy', 'mizuno', 'electrolux', 'motorola'],
  ['tiktok', 'aliexpress', 'natura', 'sephora', 'epocacosmeticos', 'drogasil', 'pacheco', 'araujo', 'paguemenos', 'hopescolor', 'asiaticstore', 'ikesaki', 'maxtitanium', 'alobebe', 'underarmour', 'farmrio', 'brastemp', 'consul', 'samsung'],
];

const UMUSIC_VTEX_BUSCAS = [
  'https://www.umusicstore.com/api/catalog_system/pub/products/search/k-pop?fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=19',
  'https://www.umusicstore.com/api/catalog_system/pub/products/search?ft=bts&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=19',
  'https://www.umusicstore.com/api/catalog_system/pub/products/search?ft=blackpink&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=19',
  'https://www.umusicstore.com/api/catalog_system/pub/products/search?ft=lisa&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=19',
  'https://www.umusicstore.com/api/catalog_system/pub/products/search?ft=jennie&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=19',
];

// Catálogos públicos Shopify em BRL nativo (não coletar kpopmerch.com por ser USD).
const CATALOGOS_SHOPIFY_KPOP = [
  { loja: 'kpopalbums', cat: 'kpop', url: 'https://www.kpopalbums.com/products.json?limit=30', envio_internacional: true },
];

// Oficial Farma (Magento 2) — consultas estritamente não-Rx (suplementos, vitaminas, colágeno, creatina, magnésio, ômega 3).
const CATALOGOS_OFICIALFARMA = [
  { loja: 'oficialfarma', cat: 'saude', url: 'https://www.oficialfarma.com.br/catalogsearch/result/?q=creatina' },
  { loja: 'oficialfarma', cat: 'saude', url: 'https://www.oficialfarma.com.br/catalogsearch/result/?q=colageno' },
  { loja: 'oficialfarma', cat: 'saude', url: 'https://www.oficialfarma.com.br/catalogsearch/result/?q=vitaminas' },
  { loja: 'oficialfarma', cat: 'saude', url: 'https://www.oficialfarma.com.br/catalogsearch/result/?q=magnesio' },
  { loja: 'oficialfarma', cat: 'saude', url: 'https://www.oficialfarma.com.br/catalogsearch/result/?q=omega+3' },
  { loja: 'oficialfarma', cat: 'saude', url: 'https://www.oficialfarma.com.br/saude' },
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

// Catálogos públicos VTEX 1P (fq=sellerId:1, vendido e entregue pela própria loja oficial — sem 3P e sem raiz em farmácias)
const CATALOGOS_VTEX_PRIORITARIOS = [
  { loja: 'pacheco', cat: 'bebe', url: 'https://www.drogariaspacheco.com.br/api/catalog_system/pub/products/search/fraldas?fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'venancio', cat: 'saude', url: 'https://www.drogariavenancio.com.br/api/catalog_system/pub/products/search/creatina?fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'rihappy', cat: 'bebe', url: 'https://www.rihappy.com.br/api/catalog_system/pub/products/search?ft=lego&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'maxtitanium', cat: 'saude', url: 'https://www.maxtitanium.com.br/api/catalog_system/pub/products/search?ft=creatina&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'pacheco', cat: 'bebe', url: 'https://www.drogariasaopaulo.com.br/api/catalog_system/pub/products/search/fraldas?fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'pacheco', cat: 'saude', url: 'https://www.drogariaspacheco.com.br/api/catalog_system/pub/products/search/creatina?fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'venancio', cat: 'bebe', url: 'https://www.drogariavenancio.com.br/api/catalog_system/pub/products/search/fraldas?fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'paguemenos', cat: 'saude', url: 'https://www.paguemenos.com.br/api/catalog_system/pub/products/search?ft=creatina&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'alobebe', cat: 'bebe', url: 'https://www.alobebe.com.br/api/catalog_system/pub/products/search?ft=carrinho&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'pacheco', cat: 'saude', url: 'https://www.drogariasaopaulo.com.br/api/catalog_system/pub/products/search/creatina?fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'pacheco', cat: 'bebe', url: 'https://www.drogariaspacheco.com.br/api/catalog_system/pub/products/search/pampers?fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'maxtitanium', cat: 'saude', url: 'https://www.maxtitanium.com.br/api/catalog_system/pub/products/search?ft=whey&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'paguemenos', cat: 'bebe', url: 'https://www.paguemenos.com.br/api/catalog_system/pub/products/search/fraldas?fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'pacheco', cat: 'saude', url: 'https://www.drogariaspacheco.com.br/api/catalog_system/pub/products/search/whey?fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'rihappy', cat: 'bebe', url: 'https://www.rihappy.com.br/api/catalog_system/pub/products/search?ft=brinquedos&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'venancio', cat: 'saude', url: 'https://www.drogariavenancio.com.br/api/catalog_system/pub/products/search/vitaminas?fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'pacheco', cat: 'bebe', url: 'https://www.drogariaspacheco.com.br/api/catalog_system/pub/products/search/huggies?fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'pacheco', cat: 'saude', url: 'https://www.drogariasaopaulo.com.br/api/catalog_system/pub/products/search/whey?fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'alobebe', cat: 'bebe', url: 'https://www.alobebe.com.br/api/catalog_system/pub/products/search?ft=cadeirinha&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'pacheco', cat: 'saude', url: 'https://www.drogariaspacheco.com.br/api/catalog_system/pub/products/search/vitaminas?fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'pacheco', cat: 'bebe', url: 'https://www.drogariaspacheco.com.br/api/catalog_system/pub/products/search/lenco-umedecido?fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'pacheco', cat: 'saude', url: 'https://www.drogariaspacheco.com.br/api/catalog_system/pub/products/search/suplementos?fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'alobebe', cat: 'bebe', url: 'https://www.alobebe.com.br/api/catalog_system/pub/products/search?ft=fralda&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'pacheco', cat: 'saude', url: 'https://www.drogariaspacheco.com.br/api/catalog_system/pub/products/search/oral-b?fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'paguemenos', cat: 'saude', url: 'https://www.paguemenos.com.br/api/catalog_system/pub/products/search?ft=vitamina&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
];

const CATALOGOS_VTEX_DIVERSOS = [
  { loja: 'epocacosmeticos', cat: 'perfumes', url: 'https://www.epocacosmeticos.com.br/api/catalog_system/pub/products/search?ft=perfume&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'olympikus', cat: 'moda', url: 'https://www.olympikus.com.br/api/catalog_system/pub/products/search?ft=tenis&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'polishop', cat: 'casa', url: 'https://www.polishop.com.br/api/catalog_system/pub/products/search?ft=airfryer&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'acer', cat: 'tech', url: 'https://br-store.acer.com/api/catalog_system/pub/products/search?ft=monitor&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'creamy', cat: 'beleza', url: 'https://www.creamy.com.br/api/catalog_system/pub/products/search?fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'epocacosmeticos', cat: 'perfumes', url: 'https://www.epocacosmeticos.com.br/api/catalog_system/pub/products/search?ft=eau+de+parfum&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'mizuno', cat: 'moda', url: 'https://www.mizuno.com.br/api/catalog_system/pub/products/search?ft=tenis&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'electrolux', cat: 'casa', url: 'https://loja.electrolux.com.br/api/catalog_system/pub/products/search/eletroportateis?fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'motorola', cat: 'tech', url: 'https://www.motorola.com.br/api/catalog_system/pub/products/search?fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'ikesaki', cat: 'beleza', url: 'https://www.ikesaki.com.br/api/catalog_system/pub/products/search?ft=shampoo&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'mahogany', cat: 'perfumes', url: 'https://www.mahogany.com.br/api/catalog_system/pub/products/search?fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'underarmour', cat: 'moda', url: 'https://www.underarmour.com.br/api/catalog_system/pub/products/search?ft=tenis&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'brastemp', cat: 'casa', url: 'https://www.brastemp.com.br/api/catalog_system/pub/products/search/eletrodomesticos/geladeira?fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'samsung', cat: 'tech', url: 'https://shop.samsung.com/br/api/catalog_system/pub/products/search?ft=galaxy&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'epocacosmeticos', cat: 'beleza', url: 'https://www.epocacosmeticos.com.br/api/catalog_system/pub/products/search?ft=protetor+solar&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'farmrio', cat: 'moda', url: 'https://www.farmrio.com.br/api/catalog_system/pub/products/search?ft=vestido&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'consul', cat: 'casa', url: 'https://www.consul.com.br/api/catalog_system/pub/products/search/eletrodomesticos/geladeira?fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'acer', cat: 'tech', url: 'https://br-store.acer.com/api/catalog_system/pub/products/search?ft=notebook&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'venancio', cat: 'beleza', url: 'https://www.drogariavenancio.com.br/api/catalog_system/pub/products/search/protetor-solar?fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'ikesaki', cat: 'beleza', url: 'https://www.ikesaki.com.br/api/catalog_system/pub/products/search?ft=mascara&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'electrolux', cat: 'casa', url: 'https://loja.electrolux.com.br/api/catalog_system/pub/products/search/eletrodomesticos/geladeiras?fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'samsung', cat: 'tech', url: 'https://shop.samsung.com/br/api/catalog_system/pub/products/search?ft=tv&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'epocacosmeticos', cat: 'beleza', url: 'https://www.epocacosmeticos.com.br/api/catalog_system/pub/products/search?ft=serum&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'polishop', cat: 'casa', url: 'https://www.polishop.com.br/api/catalog_system/pub/products/search?ft=aspirador&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'pacheco', cat: 'beleza', url: 'https://www.drogariaspacheco.com.br/api/catalog_system/pub/products/search/protetor-solar?fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'ikesaki', cat: 'beleza', url: 'https://www.ikesaki.com.br/api/catalog_system/pub/products/search?ft=maquiagem&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'brastemp', cat: 'casa', url: 'https://www.brastemp.com.br/api/catalog_system/pub/products/search?ft=lavadora&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'epocacosmeticos', cat: 'beleza', url: 'https://www.epocacosmeticos.com.br/api/catalog_system/pub/products/search?ft=hidratante&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'consul', cat: 'casa', url: 'https://www.consul.com.br/api/catalog_system/pub/products/search?ft=lavadora&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
  { loja: 'farmrio', cat: 'moda', url: 'https://www.farmrio.com.br/api/catalog_system/pub/products/search?ft=blusa&fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11' },
];

// Buscas oficiais Vendido e entregue pela Amazon (p_6=A1ZZFT5FULY4LN) cobrindo todos os subgrupos
const BUSCAS_AMAZON_NICHO = [
  { cat: 'perfumes', url: 'https://www.amazon.com.br/s?k=perfume+lattafa+asad+khamrah&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'bebe', url: 'https://www.amazon.com.br/s?k=fralda+pampers&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'saude', url: 'https://www.amazon.com.br/s?k=creatina+monohidratada&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'moda', url: 'https://www.amazon.com.br/s?k=tenis+olympikus+masculino+feminino&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'casa', url: 'https://www.amazon.com.br/s?k=air+fryer&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'tech', url: 'https://www.amazon.com.br/s?k=ssd+nvme+1tb&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'beleza', url: 'https://www.amazon.com.br/s?k=protetor+solar+la+roche+cerave&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'perfumes', url: 'https://www.amazon.com.br/s?k=perfume+eau+de+parfum+importado&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'bebe', url: 'https://www.amazon.com.br/s?k=fralda+huggies&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'saude', url: 'https://www.amazon.com.br/s?k=whey+protein+dux+max+titanium&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'moda', url: 'https://www.amazon.com.br/s?k=tenis+adidas&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'casa', url: 'https://www.amazon.com.br/s?k=robo+aspirador&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'tech', url: 'https://www.amazon.com.br/s?k=controle+dualsense+ps5&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'beleza', url: 'https://www.amazon.com.br/s?k=wella+kerastase+mascara+capilar&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'perfumes', url: 'https://www.amazon.com.br/s?k=club+de+nuit+armaf+perfume&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'bebe', url: 'https://www.amazon.com.br/s?k=lenco+umedecido+bebe&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'saude', url: 'https://www.amazon.com.br/s?k=colageno+verisol+magnesio&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'moda', url: 'https://www.amazon.com.br/s?k=relogio+casio+original&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'casa', url: 'https://www.amazon.com.br/s?k=cafeteira+nespresso+stanley&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'tech', url: 'https://www.amazon.com.br/s?k=echo+dot+kindle&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'beleza', url: 'https://www.amazon.com.br/s?k=isdin+bioderma+protetor+solar&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'perfumes', url: 'https://www.amazon.com.br/s?k=perfume+arabe+masculino+feminino&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'bebe', url: 'https://www.amazon.com.br/s?k=formula+infantil+nan+aptamil&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'saude', url: 'https://www.amazon.com.br/s?k=escova+eletrica+oral+b+omron&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'moda', url: 'https://www.amazon.com.br/s?k=mochila+moletom+masculino&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'casa', url: 'https://www.amazon.com.br/s?k=panela+pressao+eletrica+wap&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'tech', url: 'https://www.amazon.com.br/s?k=headset+gamer+monitor+gamer&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'beleza', url: 'https://www.amazon.com.br/s?k=serum+principia+hidratante+cerave&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'bebe', url: 'https://www.amazon.com.br/s?k=brinquedo+educativo+fisher+price+lego&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
  { cat: 'saude', url: 'https://www.amazon.com.br/s?k=omega+3+multivitaminico&rh=p_6%3AA1ZZFT5FULY4LN', oficial: true },
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

function agenteCacadorAtivo(cfg) {
  return !(cfg && cfg.agentes && cfg.agentes.cacador === false);
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

/** Aplica paginação rotativa VTEX: página 0 (0..11), 1 (12..23) ou 2 (24..35). */
function paginarUrlVtex(url, paginaIdx) {
  const p = ((Number(paginaIdx) || 0) % 3 + 3) % 3;
  if (p === 0) return url;
  const from = p * 12;
  const to = from + 11;
  if (/_from=\d+&_to=\d+/.test(url)) {
    return url.replace(/_from=\d+&_to=\d+/, `_from=${from}&_to=${to}`);
  }
  return `${url}${url.includes('?') ? '&' : '?'}_from=${from}&_to=${to}`;
}

/**
 * Planeja as requisições web (Promobit + canais públicos Telegram + catálogos 1P VTEX/Magento/Shopify/Nuvemshop + Amazon 1P)
 * e Shopee API do ciclo do radar.
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
  const turnoCiclo = Math.floor(tsRef / 120000);
  if (o.modo === 'agendado' && !(o.lojas && o.lojas.length) && lojas.length > 8) {
    const turno = LOJAS_TURNO[turnoCiclo % LOJAS_TURNO.length];
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
          ? categorias.filter((_, idx) => idx % 4 === (turnoCiclo % 4))
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
    if (o.modo === 'agendado' && !(rad && rad.api_url) && (!o.lojas || !o.lojas.length) && rad.canais_curados !== false && agenteCacadorAtivo(cfg)) {
      for (const canal of CANAIS_CURADOS_RADAR) {
        addWeb('telegram_canal', `https://t.me/s/${canal}`, { canal, curado: true });
      }
    }
    if (categorias.includes('kpop') && !(rad && rad.api_url)) {
      if (lojasBusca.includes('umusic') || (o.categorias && o.categorias.includes('kpop'))) {
        if (o.categorias && o.categorias.includes('kpop')) {
          for (const uUm of UMUSIC_VTEX_BUSCAS.slice(0, 3)) {
            addWeb('umusic_vtex', uUm, { loja_hint: 'umusic', categoria_hint: 'kpop' });
          }
        } else {
          const uUm = UMUSIC_VTEX_BUSCAS[turnoCiclo % UMUSIC_VTEX_BUSCAS.length];
          addWeb('umusic_vtex', uUm, { loja_hint: 'umusic', categoria_hint: 'kpop' });
        }
      }
      const shopifyKpop = CATALOGOS_SHOPIFY_KPOP.filter((x) => lojas.includes(x.loja));
      if (shopifyKpop.length && ((o.categorias && o.categorias.includes('kpop')) || (o.lojas && o.lojas.includes('kpopalbums')) || lojasBusca.includes('kpopalbums'))) {
        const sk = shopifyKpop[turnoCiclo % shopifyKpop.length];
        addWeb('shopify_catalogo', sk.url, { loja_hint: sk.loja, categoria_hint: sk.cat, envio_internacional: !!sk.envio_internacional });
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
            const nk = nuvemDisp[turnoCiclo % nuvemDisp.length];
            addWeb('nuvemshop_kpop', nk.url, { loja_hint: nk.loja, categoria_hint: 'kpop' });
          }
        }
      }
      if (lojas.includes('amazon') && (!o.lojas || !o.lojas.length || o.lojas.includes('amazon'))) {
        if (o.categorias && o.categorias.includes('kpop')) {
          for (const qIdx of [0, 4, 5, 7]) {
            const qa = BUSCAS_AMAZON_KPOP[qIdx];
            addWeb('amazon_busca', qa.url, { loja_hint: 'amazon', categoria_hint: 'kpop', loja_oficial: qa.oficial });
          }
        } else {
          const qa = BUSCAS_AMAZON_KPOP[turnoCiclo % BUSCAS_AMAZON_KPOP.length];
          const pagAmzK = Math.floor(turnoCiclo / BUSCAS_AMAZON_KPOP.length) % 2;
          const uAmzK = pagAmzK === 1 ? `${qa.url}&page=2` : qa.url;
          addWeb('amazon_busca', uAmzK, { loja_hint: 'amazon', categoria_hint: 'kpop', loja_oficial: qa.oficial });
        }
      }
    }
    if (!(rad && rad.api_url)) {
      const vtexPrio = CATALOGOS_VTEX_PRIORITARIOS.filter((x) => lojas.includes(x.loja) && categorias.includes(x.cat));
      const vtexDiv = CATALOGOS_VTEX_DIVERSOS.filter((x) => lojas.includes(x.loja) && categorias.includes(x.cat));
      if ((o.categorias && o.categorias.length) || (o.lojas && o.lojas.length)) {
        const vtexMatch = vtexPrio.concat(vtexDiv).slice(0, 4);
        for (const vf of vtexMatch) {
          addWeb('vtex_catalogo', vf.url, { loja_hint: vf.loja, categoria_hint: vf.cat });
        }
      } else {
        if (vtexPrio.length) {
          const pagP = Math.floor(turnoCiclo / vtexPrio.length) % 3;
          const vf1 = vtexPrio[turnoCiclo % vtexPrio.length];
          addWeb('vtex_catalogo', paginarUrlVtex(vf1.url, pagP), { loja_hint: vf1.loja, categoria_hint: vf1.cat });
          if (vtexPrio.length >= 2) {
            const vf1b = vtexPrio[(turnoCiclo + Math.floor(vtexPrio.length / 2)) % vtexPrio.length];
            addWeb('vtex_catalogo', paginarUrlVtex(vf1b.url, pagP), { loja_hint: vf1b.loja, categoria_hint: vf1b.cat });
          }
        }
        if (vtexDiv.length) {
          const pagD = Math.floor(turnoCiclo / vtexDiv.length) % 3;
          const vf2 = vtexDiv[turnoCiclo % vtexDiv.length];
          addWeb('vtex_catalogo', paginarUrlVtex(vf2.url, pagD), { loja_hint: vf2.loja, categoria_hint: vf2.cat });
          if (vtexDiv.length >= 2) {
            const vf2b = vtexDiv[(turnoCiclo + Math.floor(vtexDiv.length / 2)) % vtexDiv.length];
            addWeb('vtex_catalogo', paginarUrlVtex(vf2b.url, pagD), { loja_hint: vf2b.loja, categoria_hint: vf2b.cat });
          }
        }
      }
      // Oficial Farma (Magento 2, estritamente não-Rx) em Saúde
      if (lojas.includes('oficialfarma') && categorias.includes('saude')) {
        if ((o.lojas && o.lojas.includes('oficialfarma')) || (o.categorias && o.categorias.includes('saude'))) {
          for (const ofCat of CATALOGOS_OFICIALFARMA.slice(0, 2)) {
            addWeb('magento_catalogo', ofCat.url, { loja_hint: ofCat.loja, categoria_hint: ofCat.cat });
          }
        } else if (lojasBusca.includes('oficialfarma') || (turnoCiclo % 2 === 0)) {
          const ofCat = CATALOGOS_OFICIALFARMA[turnoCiclo % CATALOGOS_OFICIALFARMA.length];
          addWeb('magento_catalogo', ofCat.url, { loja_hint: ofCat.loja, categoria_hint: ofCat.cat });
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
            const pagAmz = Math.floor(turnoCiclo / amzNicho.length) % 2;
            const qa = amzNicho[turnoCiclo % amzNicho.length];
            addWeb('amazon_busca', pagAmz === 1 ? `${qa.url}&page=2` : qa.url, { loja_hint: 'amazon', categoria_hint: qa.cat, loja_oficial: qa.oficial });
            if (amzNicho.length >= 2) {
              const qa2 = amzNicho[(turnoCiclo + Math.floor(amzNicho.length / 2)) % amzNicho.length];
              addWeb('amazon_busca', pagAmz === 1 ? `${qa2.url}&page=2` : qa2.url, { loja_hint: 'amazon', categoria_hint: qa2.cat, loja_oficial: qa2.oficial });
            }
          }
        }
      }
    }
  }
  const cuponsAtivo = (cfg && cfg.cupons && cfg.cupons.radar_auto !== false) || o.apenas_cupons_loja;
  const turnoCupons = o.modo !== 'agendado' || o.apenas_cupons_loja || (turnoCiclo % 3 === 0);
  if (cuponsAtivo && turnoCupons && !o.termo && !o.apenas_em_alta && !(o.shop_ids && o.shop_ids.length) && !(o.shop_usernames && o.shop_usernames.length)) {
    addWeb('promobit_cupons', 'https://www.promobit.com.br/cupons/', {});
  }

  // Intercala fontes Promobit e não-Promobit e separa buscas da Amazon uniformemente para evitar rajadas no mesmo domínio
  const pbWeb = fontesWeb.filter((f) => String(f.tipo || '').startsWith('promobit'));
  const amzWeb = fontesWeb.filter((f) => f.tipo === 'amazon_busca');
  const outrasWeb = fontesWeb.filter((f) => !String(f.tipo || '').startsWith('promobit') && f.tipo !== 'amazon_busca');
  const baseOrd = [];
  const maxLenWeb = Math.max(pbWeb.length, outrasWeb.length);
  for (let i = 0; i < maxLenWeb; i++) {
    if (i < pbWeb.length) baseOrd.push(pbWeb[i]);
    if (i < outrasWeb.length) baseOrd.push(outrasWeb[i]);
  }
  const fontesWebOrd = [];
  if (!amzWeb.length) {
    fontesWebOrd.push(...baseOrd);
  } else if (!baseOrd.length) {
    fontesWebOrd.push(...amzWeb);
  } else {
    const passo = Math.max(1, Math.floor(baseOrd.length / amzWeb.length));
    let ai = 0;
    for (let i = 0; i < baseOrd.length; i++) {
      if (ai < amzWeb.length && i % passo === 0 && (fontesWebOrd.length === 0 || fontesWebOrd[fontesWebOrd.length - 1].tipo !== 'amazon_busca')) {
        fontesWebOrd.push(amzWeb[ai++]);
      }
      fontesWebOrd.push(baseOrd[i]);
    }
    while (ai < amzWeb.length) fontesWebOrd.push(amzWeb[ai++]);
  }

  const fontesShopee = [];
  if (!o.apenas_cupons_loja && lojas.includes('shopee') && cfg && cfg.shopee && cfg.shopee.app_id && cfg.shopee.secret) {
    const tsSeg = Math.floor(tsRef / 1000);
    const kpopShops = shopee.LOJAS_KPOP_SHOPEE || [];
    const shopIdsResolvidos = (o.kpop_shop_ids && typeof o.kpop_shop_ids === 'object') ? o.kpop_shop_ids : {};
    const resolverIdKpop = (lk) => (lk && (lk.shop_id || shopIdsResolvidos[lk.username])) || '';
    const addKpopShop = (lk, kw) => {
      if (!lk) return;
      const sid = resolverIdKpop(lk);
      if (sid) {
        fontesShopee.push({
          categoria: 'kpop',
          keyword: kw || `shop:${lk.username}`,
          shop_id: String(sid),
          shop_username: lk.username,
          shop_name: lk.nome,
          loja_kpop_curada: true,
          http: shopee.reqOfertas(cfg.shopee, kw || '', { shopId: sid, sortType: 2, limit: 20 }, tsSeg),
        });
      } else if (lk.busca_keyword) {
        fontesShopee.push({
          categoria: 'kpop',
          keyword: kw || lk.busca_keyword,
          shop_username: lk.username,
          shop_name: lk.nome,
          resolver_shop_id: true,
          http: shopee.reqOfertas(cfg.shopee, kw || lk.busca_keyword, { sortType: 2, limit: 20 }, tsSeg),
        });
      }
    };
    const kpopShopsComId = kpopShops.filter((x) => !!resolverIdKpop(x));
    if (o.shop_ids && o.shop_ids.length) {
      for (const sid of o.shop_ids) {
        const lk = kpopShops.find((x) => resolverIdKpop(x) === String(sid));
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
        const sidRes = lk ? resolverIdKpop(lk) : '';
        if (lk && sidRes) {
          addKpopShop(lk, o.termo || '');
        } else {
          const kw1 = o.termo || (lk && lk.busca_keyword) || (lk && lk.nome) || uname;
          fontesShopee.push({
            categoria: (categorias && categorias[0]) || 'kpop',
            keyword: kw1,
            shop_username: (lk && lk.username) || uname,
            shop_name: (lk && lk.nome) || '',
            resolver_shop_id: !!lk,
            http: shopee.reqOfertas(cfg.shopee, kw1, { sortType: 2, limit: 20 }, tsSeg),
          });
          if (!o.termo && kw1.toLowerCase() !== 'album kpop') {
            fontesShopee.push({
              categoria: (categorias && categorias[0]) || 'kpop',
              keyword: 'album kpop',
              shop_username: (lk && lk.username) || uname,
              shop_name: (lk && lk.nome) || '',
              resolver_shop_id: !!lk,
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
      for (const cat of categorias) {
        const kws = (cfg.shopee.buscas && cfg.shopee.buscas[cat]) || [];
        if (cat === 'kpop') {
          if (kws.length) {
            const kw1 = kws[turnoCiclo % kws.length];
            fontesShopee.push({
              categoria: cat,
              keyword: kw1,
              http: shopee.reqOfertas(cfg.shopee, kw1, { sortType: 2, limit: 20 }, tsSeg),
            });
          }
          if (o.categorias && o.categorias.includes('kpop') && o.categorias.length === 1) {
            if (kws.length >= 2) {
              const kw1 = kws[turnoCiclo % kws.length];
              const kw2 = kws[(turnoCiclo + Math.floor(kws.length / 2)) % kws.length];
              if (kw2 !== kw1) {
                fontesShopee.push({
                  categoria: cat,
                  keyword: kw2,
                  http: shopee.reqOfertas(cfg.shopee, kw2, { sortType: 2, limit: 20 }, tsSeg),
                });
              }
            }
            for (const lk of kpopShops) addKpopShop(lk, '');
          } else if (kpopShops.length) {
            // Rodízio agendado inclui TODAS as 7 lojas K-pop da Shopee (3 com shop_id + 4 por busca_keyword com auto-resolução)
            addKpopShop(kpopShops[turnoCiclo % kpopShops.length], '');
          } else if (kws.length >= 2) {
            const kw1 = kws[turnoCiclo % kws.length];
            const kw2 = kws[(turnoCiclo + Math.floor(kws.length / 2)) % kws.length];
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
          const kw = kws[turnoCiclo % kws.length];
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

module.exports = {
  CANAIS_CURADOS_RADAR,
  HDRS_WEB,
  FONTES_LOJA_PB,
  LOJAS_SEMPRE,
  LOJAS_TURNO,
  UMUSIC_VTEX_BUSCAS,
  CATALOGOS_SHOPIFY_KPOP,
  CATALOGOS_OFICIALFARMA,
  BUSCAS_AMAZON_KPOP,
  CATALOGOS_VTEX_PRIORITARIOS,
  CATALOGOS_VTEX_DIVERSOS,
  BUSCAS_AMAZON_NICHO,
  FONTES_CAT_PB,
  wrapUrlRadar,
  wrapUrlCurtoRadar,
  paginarUrlVtex,
  planejarFontesRadar,
};
