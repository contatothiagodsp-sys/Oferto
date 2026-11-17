'use strict';
/**
 * Links curtos de compartilhamento (a.co, amzn.to, s.shopee.com.br…): o app da loja gera esses links.
 * O router abre o link curto sem seguir o redirecionamento, lê o cabeçalho Location e troca o link no texto
 * do /oferta antes de classificar.
 */
const { parseUrl } = require('./lojas');

const HOSTS_CURTOS = /^(a\.co|amzn\.to|amzn\.com|amzn\.eu|s\.shopee\.com\.br|shope\.ee|meli\.la)$/;

function ehCurto(url) {
  const u = parseUrl(url);
  return !!(u && HOSTS_CURTOS.test(u.hostname.replace(/^www\./, '')));
}

function textoDoUpdate(body) {
  const m = body && (body.message || body.edited_message);
  return m && typeof m.text === 'string' ? m.text : '';
}

/**
 * Link curto do /oferta (ou null). Retorna { curto, url } — `url` é o que o nó HTTP abre
 * (o próprio link; em testes, passa pelo mock em cfg.link_curto_api).
 */
function linkCurtoDoUpdate(body, cfg) {
  const texto = textoDoUpdate(body);
  if (!/^\s*\/oferta\b/i.test(texto)) return null;
  const curto = (texto.match(/https?:\/\/[^\s<>"]+/gi) || []).find(ehCurto);
  if (!curto) return null;
  const api = cfg && cfg.link_curto_api;
  return { curto, url: api ? `${api}/curto?u=${encodeURIComponent(curto)}` : curto };
}

/** Location da resposta (fullResponse do nó HTTP). Aceita só http(s) absoluto. */
function lerLocation(resp) {
  const h = (resp && resp.headers) || {};
  const loc = h.location || h.Location || '';
  const v = Array.isArray(loc) ? loc[0] : loc;
  return /^https?:\/\//i.test(String(v || '')) ? String(v) : '';
}

/**
 * Corpo do update com o link curto trocado pelo endereço completo. Sem Location, devolve o corpo como veio
 * (o parser então explica que precisa do link completo).
 */
function expandirUpdate(body, curto, resp) {
  const longo = lerLocation(resp);
  if (!body || !curto || !longo || ehCurto(longo)) return { body, expandido: '' };
  const novo = JSON.parse(JSON.stringify(body));
  const m = novo.message || novo.edited_message;
  m.text = m.text.split(curto).join(longo);
  return { body: novo, expandido: longo };
}

module.exports = { ehCurto, linkCurtoDoUpdate, lerLocation, expandirUpdate };
