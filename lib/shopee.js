'use strict';
// Shopee Affiliate Open API (GraphQL). VERIFICAR no painel de afiliados:
// endpoint, nomes de campos e regras de caracteres dos subIds.
const { sha256Hex } = require('./sha256');
const { round2 } = require('./util');

const ENDPOINT = 'https://open-api.affiliate.shopee.com.br/graphql';

/** Monta { url, body (string exata enviada), headers } com a assinatura SHA256. */
function requisicao(cfgShopee, query, variables, timestampSeg) {
  if (!cfgShopee || !cfgShopee.app_id || !cfgShopee.secret) throw new Error('Configure shopee.app_id e shopee.secret');
  const body = JSON.stringify(variables ? { query, variables } : { query });
  const ts = String(timestampSeg || Math.floor(Date.now() / 1000));
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
  'nodes{itemId shopId productName priceMin priceMax priceDiscountRate commissionRate sales ratingStar imageUrl productLink offerLink}' +
  'pageInfo{page limit hasNextPage}}}';

/** sortType: 1 relevância, 2 mais vendidos, 5 maior comissão (VERIFICAR). */
function reqOfertas(cfgShopee, keyword, opts, ts) {
  const o = Object.assign({ sortType: 2, page: 1, limit: 20 }, opts || {});
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
      return {
        loja: 'shopee',
        produto_id: `shp_${n.shopId}_${n.itemId}`,
        titulo: String(n.productName || '').slice(0, 200),
        preco: Number.isFinite(preco) ? round2(preco) : null,
        desconto_loja_pct: Number(n.priceDiscountRate) || 0,
        comissao_pct: Number.isFinite(com) ? round2(com) : 0,
        vendas: Number(n.sales) || 0,
        nota: Number(n.ratingStar) || 0,
        imagem: n.imageUrl || '',
        url: n.productLink || `https://shopee.com.br/product/${n.shopId}/${n.itemId}`,
      };
    })
    .filter((p) => p.preco);
  return { produtos };
}

module.exports = { ENDPOINT, requisicao, reqShortLink, lerShortLink, reqOfertas, lerOfertas };
