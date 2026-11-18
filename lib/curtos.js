'use strict';
/**
 * Links curtos de compartilhamento e afiliado (a.co, amzn.to, s.shopee.com.br, mercadolivre.com/sec…):
 * o router abre o link curto sem seguir o redirecionamento, lê o cabeçalho Location (ou link canônico)
 * e troca o link no update antes de classificar — preservando o link curto original para comissão.
 */
const { parseUrl } = require('./lojas');

const HOSTS_CURTOS = /^(a\.co|amzn\.to|amzn\.com|amzn\.eu|s\.shopee\.com\.br|shope\.ee|shp\.ee|meli\.la|divulgador\.magalu\.com|s\.click\.aliexpress\.com|a\.aliexpress\.com|shein\.top|shein\.onelink\.me|onelink\.shein\.com|vt\.tiktok\.com|vm\.tiktok\.com|click\.linksynergy\.com|awin1\.com|bit\.ly|tinyurl\.com|cutt\.ly|is\.gd|abre\.ai|encurtador\.com\.br)$/;

function ehCurto(url) {
  const u = parseUrl(url);
  if (!u) return false;
  const h = u.hostname.replace(/^www\./, '');
  if (HOSTS_CURTOS.test(h)) return true;
  if (/^mercadoli(vre|bre)\.com(\.br)?$/.test(h) && /^\/sec\//i.test(u.pathname)) return true;
  if (/(^|\.)tiktok\.com$/.test(h) && /^\/t\//i.test(u.pathname)) return true;
  return false;
}

function extrairTextoUpdate(body) {
  const m = body && (body.message || body.edited_message);
  if (!m) return { msg: null, texto: '' };
  const ents = (m.entities || []).concat(m.caption_entities || []);
  const urlsEnt = ents.filter((e) => e && e.type === 'text_link' && e.url).map((e) => e.url);
  const texto = [m.text || '', m.caption || '', ...urlsEnt].filter(Boolean).join('\n');
  return { msg: m, texto };
}

/**
 * Link curto de um comando (/oferta, /link, /auto) ou de qualquer mensagem privada de admin.
 * Retorna { curto, url } — `url` é o que o nó HTTP abre (em testes, passa por cfg.link_curto_api).
 */
function linkCurtoDoUpdate(body, cfg) {
  const { msg, texto } = extrairTextoUpdate(body);
  if (!msg || !texto.trim()) return null;
  const ehCmd = /^\s*\/(oferta|link|auto)(@\w+)?\b/i.test(texto);
  const ehPrivAdmin = msg.chat && msg.chat.type === 'private'
    && ((cfg && cfg.admins) || []).includes(msg.from && msg.from.id)
    && !(cfg && cfg.auto && cfg.auto.link_direto === false)
    && !/^\s*\/(id|links|convite|ajuda|start|modo|config|radar|cacar|buscas)\b/i.test(texto);
  if (!ehCmd && !ehPrivAdmin) return null;

  const candidatos = (texto.match(/https?:\/\/[^\s<>"']+/gi) || [])
    .map((u) => u.replace(/[).,;:!?\]>]+$/, ''));
  const curto = candidatos.find(ehCurto);
  if (!curto) return null;
  const api = cfg && cfg.link_curto_api;
  return { curto, url: api ? `${api}/curto?u=${encodeURIComponent(curto)}` : curto };
}

function desempacotarRedirLoja(url, prof) {
  const u = parseUrl(url);
  if (!u) return url;
  const h = u.hostname.replace(/^www\./, '');
  if ((prof || 0) < 2 && /^(click\.linksynergy\.com|awin1\.com|rstyle\.me)$/i.test(h)) {
    const dest = (u.search.match(/[?&](?:murl|ued|dl)=([^&#]+)/i) || [])[1];
    if (dest) {
      try {
        const dec = decodeURIComponent(dest);
        if (/^https?:\/\//i.test(dec)) return desempacotarRedirLoja(dec, (prof || 0) + 1);
      } catch (e) { /* mantém original */ }
    }
  }
  if (/^onelink\.shein\.com$/i.test(h)) {
    const gid = (u.search.match(/[?&]goods_id=(\d+)/i) || [])[1];
    if (gid) return `https://br.shein.com/product-p-${gid}.html`;
  }
  if (/(^|\.)mercadoli(vre|bre)\.com(\.br)?$/i.test(u.hostname) && /^\/gz\//i.test(u.pathname)) {
    const go = (u.search.match(/[?&](?:go|redirect|url)=([^&#]+)/i) || [])[1];
    if (go) {
      try {
        const dec = decodeURIComponent(go);
        if (/^https?:\/\//i.test(dec)) return dec;
      } catch (e) { /* mantém original */ }
    }
  }
  return url;
}

/** Extrai o texto HTML de uma resposta do nó HTTP do n8n (que usa .data em responseFormat='text' ou .body). */
function textoRespostaHttp(resp) {
  if (!resp) return '';
  if (typeof resp === 'string') return resp;
  if (typeof resp.body === 'string') return resp.body;
  if (typeof resp.data === 'string') return resp.data;
  return '';
}

function extrairHrefCanonica(html) {
  for (const tag of html.match(/<link\s+[^>]{5,800}>/gi) || []) {
    const rel = tag.match(/\brel\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const relVal = (rel && (rel[1] || rel[2] || '')).toLowerCase();
    if (!/\bcanonical\b/.test(relVal)) continue;
    const href = tag.match(/\bhref\s*=\s*(?:"(https?:\/\/[^"]+)"|'(https?:\/\/[^']+)')/i);
    const url = href && (href[1] || href[2]);
    if (url) return url.replace(/&amp;/g, '&');
  }
  for (const tag of html.match(/<meta\s+[^>]{5,800}>/gi) || []) {
    const prop = tag.match(/\b(?:property|name)\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (!prop || (prop[1] || prop[2] || '').toLowerCase() !== 'og:url') continue;
    const cont = tag.match(/\bcontent\s*=\s*(?:"(https?:\/\/[^"]+)"|'(https?:\/\/[^']+)')/i);
    const url = cont && (cont[1] || cont[2]);
    if (url) return url.replace(/&amp;/g, '&');
  }
  return '';
}

/** Location da resposta (fullResponse do nó HTTP) ou link canônico em páginas intermediárias (ex.: ML /sec/). */
function lerLocation(resp) {
  const h = (resp && resp.headers) || {};
  const loc = h.location || h.Location || '';
  let v = String(Array.isArray(loc) ? loc[0] : loc || '').trim();
  if (v.startsWith('//')) v = 'https:' + v;
  if (/^https?:\/\//i.test(v)) return desempacotarRedirLoja(v);
  const html = textoRespostaHttp(resp);
  if (html) {
    const mJs = html.match(/\bl\s*=\s*['"](https?:\/\/[^'"]+)['"]/);
    if (mJs) return desempacotarRedirLoja(mJs[1].replace(/&amp;/g, '&'));
    const mlFeat = html.match(/https:\/\/(?:www\.|produto\.)?mercadolivre\.com\.br\/[^"'\s<>]*?(?:\/p\/MLB\d+|MLB-?\d+)[^"'\s<>]*card-featured[^"'\s<>]*/i);
    if (mlFeat) return mlFeat[0].replace(/&amp;/g, '&');
    const ml = html.match(/https:\/\/(?:www\.|produto\.)?mercadolivre\.com\.br\/[^"'\s<>]*?(?:\/p\/MLB\d+|MLB-?\d+[^"'\s<>]*)/i);
    if (ml) return ml[0].replace(/&amp;/g, '&');
    const refresh = html.match(/http-equiv\s*=\s*(?:"refresh"|'refresh')[^>]*content\s*=\s*(?:"[^"]*url=(https?:\/\/[^"\s;>]+)"|'[^']*url=(https?:\/\/[^'\s;>]+)')/i);
    const refUrl = refresh && (refresh[1] || refresh[2]);
    if (refUrl && !ehCurto(refUrl)) return desempacotarRedirLoja(refUrl.replace(/&amp;/g, '&'));
    const canon = extrairHrefCanonica(html);
    if (canon && !ehCurto(canon)) return desempacotarRedirLoja(canon);
  }
  return '';
}

/**
 * Corpo do update com o link curto trocado pelo endereço completo. Sem Location, devolve o corpo como veio.
 */
function expandirUpdate(body, curto, resp) {
  const longo = lerLocation(resp);
  if (!body || !curto || !longo || ehCurto(longo)) return { body, expandido: '' };
  const novo = JSON.parse(JSON.stringify(body));
  const m = novo.message || novo.edited_message;
  if (typeof m.text === 'string') m.text = m.text.split(curto).join(longo);
  if (typeof m.caption === 'string') m.caption = m.caption.split(curto).join(longo);
  for (const k of ['entities', 'caption_entities']) {
    if (Array.isArray(m[k])) {
      for (const e of m[k]) if (e && e.url === curto) e.url = longo;
    }
  }
  return { body: novo, expandido: longo };
}

module.exports = { ehCurto, linkCurtoDoUpdate, lerLocation, expandirUpdate, textoRespostaHttp, extrairHrefCanonica, desempacotarRedirLoja };
