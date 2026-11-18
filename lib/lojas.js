'use strict';
const { sha256Hex } = require('./sha256');

const NOMES = { amazon: 'Amazon', shopee: 'Shopee', ml: 'Mercado Livre', shein: 'Shein', tiktok: 'TikTok Shop', outra: 'Loja' };

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
    if (!m) return { erro: 'Link da Amazon sem código do produto (/dp/ASIN)' };
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
    const m = (u.pathname + u.search + u.hash).match(/MLB-?(\d{6,})/i);
    const pid = m ? 'ml_MLB' + m[1] : 'ml_' + sha256Hex(u.origin + u.pathname).slice(0, 12);
    const urlLimpa = /^\/gz\//i.test(u.pathname) && m
      ? `https://produto.mercadolivre.com.br/MLB-${m[1]}`
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

  return { loja: 'outra', produto_id: 'url_' + sha256Hex(host + u.pathname).slice(0, 12), url_limpa: u.origin + u.pathname };
}

function nomeLoja(loja) {
  return NOMES[loja] || NOMES.outra;
}

/** "na Amazon", "na Shopee", "na Shein", "no Mercado Livre", "no TikTok Shop", "na loja". */
function naLoja(loja) {
  if (loja === 'ml' || loja === 'tiktok') return 'no ' + NOMES[loja];
  if (loja === 'amazon' || loja === 'shopee' || loja === 'shein') return 'na ' + NOMES[loja];
  return 'na loja';
}

module.exports = { identificar, nomeLoja, naLoja, parseUrl };
