'use strict';
const { sha256Hex } = require('./sha256');

const NOMES = {
  amazon: 'Amazon', shopee: 'Shopee', ml: 'Mercado Livre', shein: 'Shein', tiktok: 'TikTok Shop',
  kabum: 'KaBuM!', terabyte: 'Terabyte', pichau: 'Pichau',
  drogaraia: 'Droga Raia', drogasil: 'Drogasil', pacheco: 'Drogaria Pacheco', panvel: 'Panvel',
  araujo: 'Drogaria Araujo', paguemenos: 'Pague Menos',
  belezanaweb: 'Beleza na Web', epocacosmeticos: 'Época Cosméticos', boticario: 'O Boticário',
  natura: 'Natura', sephora: 'Sephora',
  centauro: 'Centauro', netshoes: 'Netshoes', nike: 'Nike', adidas: 'Adidas',
  renner: 'Renner', cea: 'C&A', riachuelo: 'Riachuelo', dafiti: 'Dafiti', zattini: 'Zattini', hering: 'Hering',
  outra: 'Loja',
};

const PROGRAMAS_AFILIADO = {
  amazon: { programa: 'Amazon Associados', chave: 'amazon.tag_padrao', exemplo: 'suatag-20' },
  ml: { programa: 'Mercado Livre Afiliados', chave: 'ml.etiqueta', exemplo: 'matt_word:matt_tool (ou link /sec/)' },
  shopee: { programa: 'Shopee Affiliate Open API', chave: 'shopee.app_id', exemplo: 'App ID + Secret' },
  shein: { programa: 'Shein Afiliados', chave: 'shein.afiliado_id', exemplo: 'seu_aff_id' },
  kabum: { programa: 'Awin (KaBuM! mid 17729)', chave: 'awin.afiliado_id', awin_mid: '17729', exemplo: 'seu Publisher ID da Awin' },
  terabyte: { programa: 'Terabyte Parceiros (?p=)', chave: 'terabyte.afiliado_id', exemplo: 'seu código p da Terabyte' },
  pacheco: { programa: 'Rakuten Advertising (mid 53522)', chave: 'rakuten.id', rakuten_mid: '53522', exemplo: 'seu ID criptografado Rakuten' },
  belezanaweb: { programa: 'Rakuten Advertising (mid 47089)', chave: 'rakuten.id', rakuten_mid: '47089', exemplo: 'seu ID criptografado Rakuten' },
  natura: { programa: 'Consultoria Natura ou Rakuten (mid 49351)', chave: 'natura.consultoria', rakuten_mid: '49351', exemplo: 'seu_espaco (ou rakuten.id)' },
  boticario: { programa: 'Rakuten / Awin / Lomadee', chave: 'afiliado.boticario', exemplo: 'utm/parâmetro do seu link de afiliado' },
  epocacosmeticos: { programa: 'Magazine Você / Rakuten', chave: 'afiliado.epocacosmeticos', exemplo: 'parâmetro de afiliado' },
  sephora: { programa: 'Rakuten / Awin', chave: 'afiliado.sephora', exemplo: 'parâmetro de afiliado' },
  drogaraia: { programa: 'Awin / Lomadee (Raia Drogasil)', chave: 'afiliado.drogaraia', exemplo: 'parâmetro de afiliado (opcional)' },
  drogasil: { programa: 'Awin / Lomadee (Raia Drogasil)', chave: 'afiliado.drogasil', exemplo: 'parâmetro de afiliado (opcional)' },
  centauro: { programa: 'Awin / Lomadee (Centauro)', chave: 'afiliado.centauro', exemplo: 'parâmetro/link de afiliado (opcional)' },
  netshoes: { programa: 'Awin / Rakuten / Lomadee (Netshoes)', chave: 'afiliado.netshoes', exemplo: 'parâmetro/link de afiliado (opcional)' },
  nike: { programa: 'Awin / Social Commerce (Nike)', chave: 'afiliado.nike', exemplo: 'parâmetro/link de afiliado (opcional)' },
  adidas: { programa: 'Awin / Social Commerce (Adidas)', chave: 'afiliado.adidas', exemplo: 'parâmetro/link de afiliado (opcional)' },
  renner: { programa: 'Awin / Lomadee (Renner)', chave: 'afiliado.renner', exemplo: 'parâmetro/link de afiliado (opcional)' },
  cea: { programa: 'Awin / Lomadee (C&A)', chave: 'afiliado.cea', exemplo: 'parâmetro/link de afiliado (opcional)' },
  riachuelo: { programa: 'Awin / Lomadee (Riachuelo)', chave: 'afiliado.riachuelo', exemplo: 'parâmetro/link de afiliado (opcional)' },
  dafiti: { programa: 'Awin / Lomadee (Dafiti)', chave: 'afiliado.dafiti', exemplo: 'parâmetro/link de afiliado (opcional)' },
  zattini: { programa: 'Awin / Rakuten (Zattini)', chave: 'afiliado.zattini', exemplo: 'parâmetro/link de afiliado (opcional)' },
  hering: { programa: 'Awin / Social Commerce (Hering)', chave: 'afiliado.hering', exemplo: 'parâmetro/link de afiliado (opcional)' },
};

const CENTRAL_CUPONS_LOJA = {
  ml: 'https://www.mercadolivre.com.br/cupons',
  amazon: 'https://www.amazon.com.br/coupons',
  shopee: 'https://shopee.com.br/m/cupons-diarios',
  shein: 'https://br.shein.com/',
  kabum: 'https://www.kabum.com.br/cupons',
  centauro: 'https://www.centauro.com.br/cupons',
  netshoes: 'https://www.netshoes.com.br/especial/cupons',
  nike: 'https://www.nike.com.br/ofertas',
  adidas: 'https://www.adidas.com.br/outlet',
  renner: 'https://www.lojasrenner.com.br/cupons',
  cea: 'https://www.cea.com.br/cupons',
  riachuelo: 'https://www.riachuelo.com.br/cupons',
  dafiti: 'https://www.dafiti.com.br/cupons/',
  zattini: 'https://www.zattini.com.br/especial/cupons',
  hering: 'https://www.hering.com.br/cupons',
  boticario: 'https://www.boticario.com.br/cupom-de-desconto/',
  natura: 'https://www.natura.com.br/c/cupons',
  belezanaweb: 'https://www.belezanaweb.com.br/cupons',
  drogaraia: 'https://www.drogaraia.com.br/cupons',
  drogasil: 'https://www.drogasil.com.br/cupons',
};

const LOGO_LOJA_PADRAO = {
  ml: 'https://www.google.com/s2/favicons?domain=mercadolivre.com.br&sz=256',
  amazon: 'https://www.google.com/s2/favicons?domain=amazon.com.br&sz=256',
  shopee: 'https://www.google.com/s2/favicons?domain=shopee.com.br&sz=256',
  shein: 'https://www.google.com/s2/favicons?domain=shein.com&sz=256',
  tiktok: 'https://www.google.com/s2/favicons?domain=tiktok.com&sz=256',
  kabum: 'https://www.google.com/s2/favicons?domain=kabum.com.br&sz=256',
  centauro: 'https://www.google.com/s2/favicons?domain=centauro.com.br&sz=256',
  netshoes: 'https://www.google.com/s2/favicons?domain=netshoes.com.br&sz=256',
  renner: 'https://www.google.com/s2/favicons?domain=lojasrenner.com.br&sz=256',
  cea: 'https://www.google.com/s2/favicons?domain=cea.com.br&sz=256',
  riachuelo: 'https://www.google.com/s2/favicons?domain=riachuelo.com.br&sz=256',
  dafiti: 'https://www.google.com/s2/favicons?domain=dafiti.com.br&sz=256',
  boticario: 'https://www.google.com/s2/favicons?domain=boticario.com.br&sz=256',
  natura: 'https://www.google.com/s2/favicons?domain=natura.com.br&sz=256',
};

const LOJAS_CAMINHO = [
  { rx: /(^|\.)drogaraia\.com\.br$/, loja: 'drogaraia', pref: 'dra_', origin: 'https://www.drogaraia.com.br' },
  { rx: /(^|\.)drogasil\.com\.br$/, loja: 'drogasil', pref: 'drs_', origin: 'https://www.drogasil.com.br' },
  { rx: /(^|\.)drogariaspacheco\.com\.br$/, loja: 'pacheco', pref: 'dpa_', origin: 'https://www.drogariaspacheco.com.br' },
  { rx: /(^|\.)drogariasaopaulo\.com\.br$/, loja: 'pacheco', pref: 'dpa_', origin: 'https://www.drogariasaopaulo.com.br' },
  { rx: /(^|\.)panvel\.com$/, loja: 'panvel', pref: 'pnv_', origin: 'https://www.panvel.com' },
  { rx: /(^|\.)araujo\.com\.br$/, loja: 'araujo', pref: 'arj_', origin: 'https://www.araujo.com.br' },
  { rx: /(^|\.)paguemenos\.com\.br$/, loja: 'paguemenos', pref: 'pgm_', origin: 'https://www.paguemenos.com.br' },
  { rx: /(^|\.)belezanaweb\.com\.br$/, loja: 'belezanaweb', pref: 'bnw_', origin: 'https://www.belezanaweb.com.br' },
  { rx: /(^|\.)epocacosmeticos\.com\.br$/, loja: 'epocacosmeticos', pref: 'epc_', origin: 'https://www.epocacosmeticos.com.br' },
  { rx: /(^|\.)boticario\.com\.br$/, loja: 'boticario', pref: 'bot_', origin: 'https://www.boticario.com.br' },
  { rx: /(^|\.)natura\.com\.br$/, loja: 'natura', pref: 'nat_', origin: 'https://www.natura.com.br' },
  { rx: /(^|\.)sephora\.com\.br$/, loja: 'sephora', pref: 'sep_', origin: 'https://www.sephora.com.br' },
  { rx: /(^|\.)centauro\.com\.br$/, loja: 'centauro', pref: 'cen_', origin: 'https://www.centauro.com.br' },
  { rx: /(^|\.)netshoes\.com\.br$/, loja: 'netshoes', pref: 'net_', origin: 'https://www.netshoes.com.br' },
  { rx: /(^|\.)nike\.com\.br$/, loja: 'nike', pref: 'nik_', origin: 'https://www.nike.com.br' },
  { rx: /(^|\.)adidas\.com\.br$/, loja: 'adidas', pref: 'adi_', origin: 'https://www.adidas.com.br' },
  { rx: /(^|\.)lojasrenner\.com\.br$/, loja: 'renner', pref: 'ren_', origin: 'https://www.lojasrenner.com.br' },
  { rx: /(^|\.)cea\.com\.br$/, loja: 'cea', pref: 'cea_', origin: 'https://www.cea.com.br' },
  { rx: /(^|\.)riachuelo\.com\.br$/, loja: 'riachuelo', pref: 'rch_', origin: 'https://www.riachuelo.com.br' },
  { rx: /(^|\.)dafiti\.com\.br$/, loja: 'dafiti', pref: 'daf_', origin: 'https://www.dafiti.com.br' },
  { rx: /(^|\.)zattini\.com\.br$/, loja: 'zattini', pref: 'zat_', origin: 'https://www.zattini.com.br' },
  { rx: /(^|\.)hering\.com\.br$/, loja: 'hering', pref: 'her_', origin: 'https://www.hering.com.br' },
];

const IGNORAR_PATH_LOJA = /^\/(?:checkout|customer|cart|carrinho|minha-conta|login|cadastro|catalogsearch|busca|search)\b/i;

/**
 * Parser mínimo de URL (o sandbox do Code node do n8n não expõe o global URL).
 * Retorna { origin, hostname, pathname, search, hash } ou null.
 */
function parseUrl(s) {
  const m = String(s || '').trim().match(/^(https?):\/\/([^/?#\s:@]+)(?::\d+)?([^?#\s]*)(\?[^#\s]*)?(#\S*)?$/i);
  if (!m) return null;
  const hostname = m[2].toLowerCase();
  return { origin: `${m[1].toLowerCase()}://${hostname}`, hostname, pathname: m[3] || '/', search: m[4] || '', hash: m[5] || '' };
}

/**
 * Identifica a loja e um produto_id estável a partir da URL.
 * Retorna { loja, produto_id, url_limpa, erro? }.
 */
function identificar(url) {
  const u = parseUrl(url);
  if (!u) return { erro: 'URL inválida' };
  const host = u.hostname.replace(/^www\./, '');

  // Desembrulha deeplinks de redes de afiliados (Rakuten/LinkSynergy, Awin, RewardStyle)
  if (/^(click\.linksynergy\.com|awin1\.com|www\.awin1\.com|rstyle\.me)$/.test(host)) {
    const dest = (u.search.match(/[?&](?:murl|ued|dl)=([^&#]+)/i) || [])[1];
    if (dest) {
      try {
        const dec = decodeURIComponent(dest);
        if (/^https?:\/\//i.test(dec) && dec !== url) return identificar(dec);
      } catch (e) { /* mantém análise normal */ }
    }
  }

  if (/(^|\.)amazon\.com\.br$/.test(host)) {
    const m = u.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/asin)\/([A-Z0-9]{10})/i);
    if (!m) {
      if (/^\/(?:coupons|gp\/goldbox|deals)(?:\/|$)/i.test(u.pathname)) {
        return {
          loja: 'amazon',
          produto_id: 'amz_cupom_' + sha256Hex(u.pathname.toLowerCase()).slice(0, 10),
          url_limpa: 'https://www.amazon.com.br' + u.pathname,
        };
      }
      return { erro: 'Link da Amazon sem código do produto (/dp/ASIN)' };
    }
    const asin = m[1].toUpperCase();
    return { loja: 'amazon', produto_id: 'amz_' + asin, url_limpa: `https://www.amazon.com.br/dp/${asin}` };
  }
  if (/^(amzn\.to|a\.co|amzn\.com)$/.test(host)) {
    return { erro: 'Link curto da Amazon: envie o link completo da página do produto (com /dp/)' };
  }

  if (/(^|\.)shopee\.com\.br$/.test(host)) {
    // formatos: /produto-i.SHOPID.ITEMID, /product/SHOPID/ITEMID, /opaanlp/SHOPID/ITEMID, /universal-link?redir=… ou /loja/ITEMID
    const redir = (u.search.match(/[?&](?:redir|url)=([^&#]+)/i) || [])[1];
    if (redir && /^\/(?:universal-link|opaanlp)/i.test(u.pathname)) {
      try {
        const dec = decodeURIComponent(redir);
        if (/^https?:\/\//i.test(dec) && dec !== url) return identificar(dec);
      } catch (e) { /* segue tentativa pelo pathname */ }
    }
    const caminhoSh = u.pathname.replace(/^\/universal-link(?=\/)/i, '');
    const m = caminhoSh.match(/-i\.(\d+)\.(\d+)/) || caminhoSh.match(/\/(?:product|opaanlp)\/(\d+)\/(\d+)/);
    if (m) {
      return {
        loja: 'shopee',
        produto_id: `shp_${m[1]}_${m[2]}`,
        url_limpa: `https://shopee.com.br/product/${m[1]}/${m[2]}`,
      };
    }
    const mQsShop = (u.search.match(/[?&]shop_?id=(\d+)/i) || [])[1];
    const mQsItem = (u.search.match(/[?&]item_?id=(\d+)/i) || [])[1];
    if (mQsShop && mQsItem) {
      return {
        loja: 'shopee',
        produto_id: `shp_${mQsShop}_${mQsItem}`,
        url_limpa: `https://shopee.com.br/product/${mQsShop}/${mQsItem}`,
      };
    }
    const mLoja = caminhoSh.match(/^\/([a-z0-9_.-]{3,})\/(\d{6,})\/?$/i);
    if (mLoja && !/^(?:product|opaanlp|universal-link|search|cart|user|buyer|seller|daily_discover|flash_sale|campaigns|m|blog|help|legal)$/i.test(mLoja[1])) {
      return {
        loja: 'shopee',
        produto_id: `shp_${mLoja[1].toLowerCase()}_${mLoja[2]}`,
        url_limpa: `https://shopee.com.br/${mLoja[1]}/${mLoja[2]}`,
      };
    }
    if (/^\/(?:m\/)?(?:cupons(?:-diarios)?|voucher|frete-gratis)(?:\/|$)/i.test(u.pathname)) {
      return {
        loja: 'shopee',
        produto_id: 'shp_cupom_' + sha256Hex(u.pathname.toLowerCase()).slice(0, 10),
        url_limpa: 'https://shopee.com.br' + u.pathname,
      };
    }
    return { erro: 'Link da Shopee sem ids da loja/produto (use o link da página do produto)' };
  }
  if (/^(s\.shopee\.com\.br|shope\.ee|shp\.ee)$/.test(host)) {
    return { erro: 'Link curto da Shopee: envie o link completo da página do produto' };
  }

  if (/(^|\.)mercadoli(vre|bre)\.com(\.br)?$/.test(host) || /^(meli\.la|mercadolivre\.com)$/.test(host)) {
    // Desembrulha parede /gz/account-verification?go=https%3A%2F%2F...
    const goParam = (u.search.match(/[?&](?:go|redirect|url)=([^&#]+)/i) || [])[1];
    if (goParam && /^\/gz\//i.test(u.pathname)) {
      try {
        const decGo = decodeURIComponent(goParam);
        if (/^https?:\/\/[^/\s]*mercadoli(vre|bre)/i.test(decGo) && decGo !== url) return identificar(decGo);
      } catch (e) { /* segue fallback */ }
    }
    const m = (u.pathname + u.search + u.hash).match(/MLB(U)?-?(\d{6,})/i);
    const pid = m ? 'ml_MLB' + (m[1] ? 'U' : '') + m[2] : 'ml_' + sha256Hex(u.origin + u.pathname).slice(0, 12);
    const urlLimpa = /^\/gz\//i.test(u.pathname) && m
      ? `https://produto.mercadolivre.com.br/MLB-${m[2]}`
      : u.origin + u.pathname;
    return { loja: 'ml', produto_id: pid, url_limpa: urlLimpa };
  }

  if (/^(shein\.top|shein\.onelink\.me)$/.test(host)) {
    return { erro: 'Link curto da Shein: envie o link completo do produto' };
  }
  if (/(^|\.)shein\.com$/.test(host)) {
    const mGid = u.pathname.match(/-p-(\d+)(?:-cat-\d+)?\.html/i) || u.search.match(/[?&]goods_id=(\d+)/i);
    if (mGid) {
      const gid = mGid[1];
      return { loja: 'shein', produto_id: 'shn_' + gid, url_limpa: `https://br.shein.com/product-p-${gid}.html` };
    }
    if (host === 'onelink.shein.com') {
      return { erro: 'Link curto da Shein: envie o link completo do produto' };
    }
    if (u.pathname.length > 3 && !/^\/(?:cart|user|risk|search)\b/i.test(u.pathname)) {
      return {
        loja: 'shein',
        produto_id: 'shn_' + sha256Hex(u.origin + u.pathname).slice(0, 12),
        url_limpa: 'https://br.shein.com' + u.pathname,
      };
    }
    return { erro: 'Link da Shein sem código do produto' };
  }

  if (/^(vt\.tiktok\.com|vm\.tiktok\.com)$/.test(host) || (/(^|\.)tiktok\.com$/.test(host) && /^\/t\//i.test(u.pathname))) {
    return { erro: 'Link curto do TikTok Shop: envie o link completo do produto' };
  }
  if (/(^|\.)tiktok\.com$/.test(host)) {
    const mTk = u.pathname.match(/\/(?:view\/)?product\/(\d+)/i) || u.search.match(/[?&]product_id=(\d+)/i);
    if (mTk) {
      const tid = mTk[1];
      return { loja: 'tiktok', produto_id: 'tk_' + tid, url_limpa: `https://www.tiktok.com/view/product/${tid}` };
    }
    if (host === 'shop.tiktok.com' && u.pathname.length > 1) {
      return {
        loja: 'tiktok',
        produto_id: 'tk_' + sha256Hex(u.origin + u.pathname).slice(0, 12),
        url_limpa: u.origin + u.pathname,
      };
    }
  }

  if (/(^|\.)kabum\.com\.br$/.test(host) && u.pathname.length > 1 && !IGNORAR_PATH_LOJA.test(u.pathname)) {
    const mKbm = u.pathname.match(/\/produto\/(\d+)/i);
    return {
      loja: 'kabum',
      produto_id: mKbm ? 'kbm_' + mKbm[1] : 'kbm_' + sha256Hex(u.pathname.toLowerCase()).slice(0, 12),
      url_limpa: 'https://www.kabum.com.br' + u.pathname,
    };
  }
  if (/(^|\.)terabyteshop\.com\.br$/.test(host) && u.pathname.length > 1 && !IGNORAR_PATH_LOJA.test(u.pathname)) {
    const mTrb = u.pathname.match(/\/produto\/(\d+)/i);
    return {
      loja: 'terabyte',
      produto_id: mTrb ? 'trb_' + mTrb[1] : 'trb_' + sha256Hex(u.pathname.toLowerCase()).slice(0, 12),
      url_limpa: 'https://www.terabyteshop.com.br' + u.pathname,
    };
  }
  if (/(^|\.)pichau\.com\.br$/.test(host) && u.pathname.length > 1 && !IGNORAR_PATH_LOJA.test(u.pathname)) {
    return {
      loja: 'pichau',
      produto_id: 'pch_' + sha256Hex(u.pathname.toLowerCase()).slice(0, 12),
      url_limpa: 'https://www.pichau.com.br' + u.pathname,
    };
  }

  for (const l of LOJAS_CAMINHO) {
    if (l.rx.test(host) && u.pathname.length > 1 && !IGNORAR_PATH_LOJA.test(u.pathname)) {
      return {
        loja: l.loja,
        produto_id: l.pref + sha256Hex(u.pathname.toLowerCase()).slice(0, 12),
        url_limpa: l.origin + u.pathname,
      };
    }
  }

  return { loja: 'outra', produto_id: 'url_' + sha256Hex(host + u.pathname).slice(0, 12), url_limpa: u.origin + u.pathname };
}

function nomeLoja(loja) {
  return NOMES[loja] || NOMES.outra;
}

/** "na Amazon", "na Shopee", "no KaBuM!", "na Droga Raia", "na loja". */
function naLoja(loja) {
  if (loja === 'boticario') return 'no O Boticário';
  if (['ml', 'tiktok', 'kabum'].includes(loja)) return 'no ' + NOMES[loja];
  if (loja !== 'outra' && NOMES[loja]) return 'na ' + NOMES[loja];
  return 'na loja';
}

function urlCentralCupons(loja, cfg) {
  const links = (cfg && cfg.cupons && cfg.cupons.links) || {};
  return links[loja] || CENTRAL_CUPONS_LOJA[loja] || '';
}

function normalizarImagemOferta(url) {
  const s = String(url || '').trim().replace(/&amp;/gi, '&');
  if (!/^https?:\/\//i.test(s)) return '';
  if (/^https?:\/\/wsrv\.nl\//i.test(s)) return s;
  const mPb = s.match(/^https?:\/\/(i\.promobit\.com\.br)(\/.*)$/i);
  if (mPb) {
    let path = mPb[2];
    if (!/^\/(?:500|268|180|120|ar)\//i.test(path)) {
      path = '/500' + (path.startsWith('/') ? path : '/' + path);
    }
    return `https://wsrv.nl/?url=${encodeURIComponent(mPb[1] + path)}&w=600&output=jpg`;
  }
  return s;
}

function logoLoja(loja, cfg) {
  const logos = (cfg && cfg.cupons && cfg.cupons.logos) || {};
  return logos[loja] || LOGO_LOJA_PADRAO[loja] || '';
}

module.exports = {
  identificar, nomeLoja, naLoja, parseUrl, PROGRAMAS_AFILIADO,
  CENTRAL_CUPONS_LOJA, LOGO_LOJA_PADRAO, urlCentralCupons, logoLoja, normalizarImagemOferta,
};
