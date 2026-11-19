'use strict';
// Shopee Affiliate Open API (GraphQL). VERIFICAR no painel de afiliados:
// endpoint, nomes de campos e regras de caracteres dos subIds.
const { sha256Hex } = require('./sha256');
const { round2 } = require('./util');

const ENDPOINT = 'https://open-api.affiliate.shopee.com.br/graphql';

// Lojas principais de K-Pop na Shopee Brasil indicadas pela comunidade (envio da Coreia do Sul, Hanteo/Circle).
const LOJAS_KPOP_SHOPEE = [
  {
    shop_id: '716812351',
    username: 'recordplanet.br',
    nome: 'Record Planet',
    url: 'https://shopee.com.br/recordplanet.br',
    aliases: ['recordplanet.br', 'recordplanet', 'record planet'],
  },
  {
    shop_id: '431836255',
    username: 'kpopmerch.br',
    nome: 'Kpopmerch',
    url: 'https://shopee.com.br/kpopmerch.br',
    aliases: ['kpopmerch.br', 'kpopmerch', 'kpop merch', 'kpopmerch official'],
  },
  {
    shop_id: '437474956',
    username: 'everykpop.br',
    nome: 'Every Kpop / ALIKO',
    url: 'https://shopee.com.br/everykpop.br',
    aliases: ['everykpop.br', 'everykpop', 'every kpop', 'aliko.br', 'aliko'],
  },
  {
    shop_id: '',
    username: 'kpopfever.br',
    nome: 'KPOP FEVER',
    url: 'https://shopee.com.br/kpopfever.br',
    aliases: ['kpopfever.br', 'kpopfever', 'kpop fever', 'k-pop fever'],
    busca_keyword: 'kpop fever',
  },
  {
    shop_id: '',
    username: 'pigeekv.br',
    nome: 'PiGEE.BR',
    url: 'https://shopee.com.br/pigeekv.br',
    aliases: ['pigeekv.br', 'pigeekv', 'pigeek', 'pigee.br', 'pigee br', 'pigee'],
    busca_keyword: 'pigeek',
  },
  {
    shop_id: '',
    username: 'withmuu.br',
    nome: 'Withmuu',
    oficial: true,
    url: 'https://shopee.com.br/withmuu.br',
    aliases: ['withmuu.br', 'withmuu', 'withmuu official', 'withmuu official store'],
    busca_keyword: 'withmuu',
  },
  {
    shop_id: '',
    username: 'soundwavekpop.br',
    nome: 'Soundwave',
    oficial: true,
    url: 'https://shopee.com.br/soundwavekpop.br',
    aliases: ['soundwavekpop.br', 'soundwavekpop', 'soundwave official', 'soundwave official store', 'soundwave kpop'],
    exact_names: ['soundwave'],
    busca_keyword: 'soundwave kpop',
  },
];

function identificarLojaKpopShopee(info) {
  const o = info || {};
  const sid = o.shopId != null ? String(o.shopId).trim() : (o.shop_id != null ? String(o.shop_id).trim() : '');
  if (sid) {
    const porId = LOJAS_KPOP_SHOPEE.find((l) => l.shop_id && l.shop_id === sid);
    if (porId) return porId;
  }
  const urlRaw = String(o.url || '').toLowerCase();
  if (urlRaw) {
    let urlDec = urlRaw;
    try { urlDec = decodeURIComponent(urlRaw); } catch (_) { /* mantém bruto */ }
    for (const urlStr of (urlDec !== urlRaw ? [urlRaw, urlDec] : [urlRaw])) {
      const mIds = urlStr.match(/-i\.(\d+)\.\d+/) || urlStr.match(/\/(?:product|opaanlp)\/(\d+)\/\d+/) || urlStr.match(/[?&]shop_?id=(\d+)/i);
      if (mIds) {
        const porUrlId = LOJAS_KPOP_SHOPEE.find((l) => l.shop_id && l.shop_id === mIds[1]);
        if (porUrlId) return porUrlId;
      }
      for (const l of LOJAS_KPOP_SHOPEE) {
        if (l.aliases.some((a) => a.includes('.') && new RegExp(`/${a.replace(/\./g, '\\.')}(?:/|\\?|#|$)`).test(urlStr))) return l;
        if (l.aliases.some((a) => !a.includes(' ') && !a.includes('.') && new RegExp(`shopee\\.com\\.br/(?:universal-link/)?${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:/\\d+)?(?:/|\\?|#|$)`).test(urlStr))) return l;
      }
    }
  }
  const nomeNorm = String(o.shopName || o.shop_name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (nomeNorm) {
    const padded = ' ' + nomeNorm + ' ';
    for (const l of LOJAS_KPOP_SHOPEE) {
      if (l.exact_names && l.exact_names.includes(nomeNorm)) return l;
      if (l.aliases.some((a) => padded.includes(' ' + a + ' '))) return l;
    }
  }
  return null;
}

const RE_SERVICO_SHOPEE = /\b(?:servi[cç]o\s+ao\s+cliente|customer\s+service|somente\s+para\s+c\/?s|link\s+de\s+pagamento|taxa\s+(?:de\s+)?envio|frete\s+extra|n[aã]o\s+compre\s+sem\s+combinar)\b/i;

function ehAnuncioServicoShopee(titulo) {
  return RE_SERVICO_SHOPEE.test(String(titulo || ''));
}

/** Monta { url, body (string exata enviada), headers } com a assinatura SHA256. */
function requisicao(cfgShopee, query, variables, timestampSeg) {
  if (!cfgShopee || !cfgShopee.app_id || !cfgShopee.secret) throw new Error('Configure shopee.app_id e shopee.secret');
  const body = JSON.stringify(variables ? { query, variables } : { query });
  const ts = String(timestampSeg != null ? timestampSeg : Math.floor(Date.now() / 1000));
  const assinatura = sha256Hex(String(cfgShopee.app_id) + ts + body + cfgShopee.secret);
  return {
    url: cfgShopee.endpoint || ENDPOINT,
    body,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `SHA256 Credential=${cfgShopee.app_id}, Timestamp=${ts}, Signature=${assinatura}`,
    },
  };
}

const Q_SHORTLINK = 'mutation($url:String!,$subIds:[String]){generateShortLink(input:{originUrl:$url,subIds:$subIds}){shortLink}}';

function reqShortLink(cfgShopee, originUrl, subIds, ts) {
  return requisicao(cfgShopee, Q_SHORTLINK, { url: originUrl, subIds: subIds.slice(0, 5) }, ts);
}

function lerShortLink(resposta) {
  const r = typeof resposta === 'string' ? JSON.parse(resposta) : resposta || {};
  if (r.errors && r.errors.length) return { erro: r.errors.map((e) => e.message).join('; ') };
  const link = r.data && r.data.generateShortLink && r.data.generateShortLink.shortLink;
  return link ? { url: link } : { erro: 'Resposta da Shopee sem shortLink' };
}

const Q_OFERTAS =
  'query($keyword:String,$sortType:Int,$page:Int,$limit:Int){productOfferV2(keyword:$keyword,sortType:$sortType,page:$page,limit:$limit){' +
  'nodes{itemId shopId shopName shopType productName priceMin priceMax priceDiscountRate commissionRate sales ratingStar imageUrl productLink offerLink}' +
  'pageInfo{page limit hasNextPage}}}';

const Q_OFERTAS_SHOP =
  'query($shopId:Int64,$keyword:String,$sortType:Int,$page:Int,$limit:Int){productOfferV2(shopId:$shopId,keyword:$keyword,sortType:$sortType,page:$page,limit:$limit){' +
  'nodes{itemId shopId shopName shopType productName priceMin priceMax priceDiscountRate commissionRate sales ratingStar imageUrl productLink offerLink}' +
  'pageInfo{page limit hasNextPage}}}';

/** sortType: 1 relevância, 2 mais vendidos, 5 maior comissão (VERIFICAR). */
function reqOfertas(cfgShopee, keyword, opts, ts) {
  const o = Object.assign({ sortType: 2, page: 1, limit: 20 }, opts || {});
  const shopId = o.shopId != null && String(o.shopId).trim() !== '' ? Number(o.shopId) : null;
  if (Number.isFinite(shopId) && shopId > 0) {
    const vars = { shopId, sortType: o.sortType, page: o.page, limit: o.limit };
    const kw = String(keyword || '').trim();
    if (kw) vars.keyword = kw;
    return requisicao(cfgShopee, Q_OFERTAS_SHOP, vars, ts);
  }
  return requisicao(cfgShopee, Q_OFERTAS, { keyword, sortType: o.sortType, page: o.page, limit: o.limit }, ts);
}

/** Normaliza a resposta do productOfferV2 em produtos. */
function lerOfertas(resposta) {
  const r = typeof resposta === 'string' ? JSON.parse(resposta) : resposta || {};
  if (r.errors && r.errors.length) return { erro: r.errors.map((e) => e.message).join('; '), produtos: [] };
  const nodes = (r.data && r.data.productOfferV2 && r.data.productOfferV2.nodes) || [];
  const produtos = nodes
    .map((n) => {
      const preco = Number(n.priceMin);
      // commissionRate costuma vir como fração em string ("0.12"); se vier > 1, já é percentual.
      let com = Number(n.commissionRate);
      if (Number.isFinite(com) && com <= 1) com = com * 100;
      const vendas = Number(n.sales) || 0;
      const nota = Number(n.ratingStar) || 0;
      const shopTypes = Array.isArray(n.shopType)
        ? n.shopType.map(Number)
        : (n.shopType != null && n.shopType !== '' && Number.isFinite(Number(n.shopType)) ? [Number(n.shopType)] : []);
      const urlProd = n.productLink || `https://shopee.com.br/product/${n.shopId}/${n.itemId}`;
      const lojaKpop = identificarLojaKpopShopee({ shopId: n.shopId, shopName: n.shopName, url: urlProd });
      const lojaKpopCurada = !!lojaKpop;
      const lojaOficial = shopTypes.includes(1) || !!(lojaKpop && lojaKpop.oficial);
      const lojaIndicada = lojaOficial || lojaKpopCurada || shopTypes.includes(2) || shopTypes.includes(4);
      const lojaConfiavel = lojaKpopCurada || lojaOficial || lojaIndicada || (nota >= 4.7 && vendas >= 15);
      return {
        loja: 'shopee',
        shop_id: n.shopId ? String(n.shopId) : (lojaKpop && lojaKpop.shop_id ? lojaKpop.shop_id : ''),
        shop_username: lojaKpop ? lojaKpop.username : '',
        shop_name: String(n.shopName || (lojaKpop ? lojaKpop.nome : '')).trim(),
        shop_type: shopTypes,
        loja_oficial: lojaOficial,
        loja_indicada: lojaIndicada,
        loja_confiavel: lojaConfiavel,
        loja_kpop_curada: lojaKpopCurada,
        loja_kpop_nome: lojaKpop ? lojaKpop.nome : '',
        produto_id: `shp_${n.shopId}_${n.itemId}`,
        titulo: String(n.productName || '').slice(0, 200),
        preco: Number.isFinite(preco) ? round2(preco) : null,
        desconto_loja_pct: Number(n.priceDiscountRate) || 0,
        comissao_pct: Number.isFinite(com) ? round2(com) : 0,
        vendas,
        nota,
        imagem: n.imageUrl || '',
        url: urlProd,
      };
    })
    .filter((p) => p.preco);
  return { produtos };
}

module.exports = {
  ENDPOINT, LOJAS_KPOP_SHOPEE, identificarLojaKpopShopee, ehAnuncioServicoShopee,
  requisicao, reqShortLink, lerShortLink, reqOfertas, lerOfertas,
};
