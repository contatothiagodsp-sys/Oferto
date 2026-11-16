'use strict';
const { sha256Hex } = require('./sha256');

const NOMES = { amazon: 'Amazon', shopee: 'Shopee', ml: 'Mercado Livre', outra: 'Loja' };

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
    // formatos: /produto-i.SHOPID.ITEMID  ou  /product/SHOPID/ITEMID
    let m = u.pathname.match(/-i\.(\d+)\.(\d+)/) || u.pathname.match(/\/product\/(\d+)\/(\d+)/);
    if (!m) return { erro: 'Link da Shopee sem ids da loja/produto (use o link da página do produto)' };
    return {
      loja: 'shopee',
      produto_id: `shp_${m[1]}_${m[2]}`,
      url_limpa: `https://shopee.com.br/product/${m[1]}/${m[2]}`,
    };
  }
  if (/^(s\.shopee\.com\.br|shope\.ee)$/.test(host)) {
    return { erro: 'Link curto da Shopee: envie o link completo da página do produto' };
  }

  if (/(^|\.)mercadoli(vre|bre)\.com(\.br)?$/.test(host) || /^(meli\.la|mercadolivre\.com)$/.test(host)) {
    const m = (u.pathname + u.search + u.hash).match(/MLB-?(\d{6,})/i);
    const pid = m ? 'ml_MLB' + m[1] : 'ml_' + sha256Hex(u.origin + u.pathname).slice(0, 12);
    return { loja: 'ml', produto_id: pid, url_limpa: u.origin + u.pathname };
  }

  return { loja: 'outra', produto_id: 'url_' + sha256Hex(host + u.pathname).slice(0, 12), url_limpa: u.origin + u.pathname };
}

function nomeLoja(loja) {
  return NOMES[loja] || NOMES.outra;
}

/** "na Amazon", "na Shopee", "no Mercado Livre", "na loja". */
function naLoja(loja) {
  if (loja === 'ml') return 'no Mercado Livre';
  if (loja === 'amazon' || loja === 'shopee') return 'na ' + NOMES[loja];
  return 'na loja';
}

module.exports = { identificar, nomeLoja, naLoja, parseUrl };
