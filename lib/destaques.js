'use strict';
// Destaques e ficha técnica da página do produto (lerPaginaProduto chama extrairDestaquesPagina).
//
// A copy do post (lib/leitura.js) e a ficha da IA (lib/tom-ia.js) usam esses dados como fatos extras
// além do título: "Capacidade: 4,2 L", "Bateria até 30 horas", "Cancelamento de ruído ativo"…
// Só o que a loja escreveu. Texto vindo da loja é DADO: é limpo de HTML, de links e de frases de
// marketing/instrução e cortado em tamanho fixo antes de ser gravado em links_manuais.
//
// Fontes, em ordem: JSON-LD Product (additionalProperty, material, color, description), Amazon
// (feature-bullets, productOverview, tabelas techSpec/detailBullets), Mercado Livre (highlighted specs,
// tabela de características) e, por último, a meta description.
//
// Puro e sem I/O.

const MAX_DESTAQUES = 6;
const MAX_FICHA = 12;
const MAX_TXT = 140;

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#34': '"' };

function decodificar(s) {
  return String(s || '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
      if (ENTIDADES[e.toLowerCase()] != null) return ENTIDADES[e.toLowerCase()];
      if (/^#x/i.test(e)) return String.fromCodePoint(parseInt(e.slice(2), 16));
      if (/^#\d/.test(e)) return String.fromCodePoint(Number(e.slice(1)));
      return m;
    });
}

/** HTML de um trecho → texto de uma linha, sem tags, scripts, estilos nem espaços extras. */
function textoLimpo(html) {
  return decodificar(String(html || '')
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[​-‏﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Frases de loja que não são fato do produto (SAC, garantia de loja, frete, instrução, marketing vazio).
const RE_LIXO = /(?:https?:|www\.|@|clique|compre|aproveite|garanta|frete|entrega|envio|devolu|reembolso|garantia\s+(?:da\s+loja|de\s+satisfa)|nota\s+fiscal|sac\b|atendimento|whatsapp|cupom|desconto|promo[cç][aã]o|pre[cç]o|r\$|parcel|ignore|instru[cç]|assistente|\bia\b|prompt|produto\s+100%|melhor\s+(?:do\s+)?mercado|qualidade\s+premium|n[º°o]\s*1\b)/i;
// Chaves de ficha técnica que não ajudam a copy (identificadores, logística, garantia).
const RE_CHAVE_INUTIL = /(?:^|\s)(?:ean|gtin|sku|asin|c[oó]digo|modelo\s+do\s+item|n[uú]mero\s+(?:do\s+)?(?:modelo|pe[cç]a)|refer[eê]ncia|fabricante|importador|peso\s+(?:do\s+)?(?:envio|pacote|embalagem)|dimens[oõ]es\s+do\s+(?:pacote|envio)|garantia|classifica[cç][aã]o|ranking|avalia[cç][aã]o|dispon[ií]vel\s+desde|primeira\s+data|pa[ií]s\s+de\s+origem|anvisa|inmetro|registro|lote|validade|data)/i;

function cortar(s, max) {
  const t = String(s || '').trim();
  if (t.length <= max) return t;
  const c = t.slice(0, max);
  const sp = c.lastIndexOf(' ');
  return (sp > max * 0.6 ? c.slice(0, sp) : c).replace(/[\s,;:.-]+$/, '') + '…';
}

function destaqueValido(s) {
  const t = String(s || '').trim();
  if (t.length < 8 || t.length > 400) return false;
  if (RE_LIXO.test(t)) return false;
  if ((t.match(/[A-ZÀ-Ý]/g) || []).length / Math.max(1, (t.match(/\p{L}/gu) || []).length) > 0.6) return false; // caixa alta
  return true;
}

function nodosLd(html) {
  const out = [];
  const visitar = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(visitar); return; }
    const t = n['@type'];
    const tipos = Array.isArray(t) ? t : [t];
    if (tipos.some((x) => /^(?:Product|ProductGroup|IndividualProduct)$/i.test(String(x || '')))) out.push(n);
    if (n['@graph']) visitar(n['@graph']);
    if (n.hasVariant) visitar(n.hasVariant);
  };
  for (const m of String(html || '').matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visitar(JSON.parse(String(m[1] || '').trim())); } catch (e) { /* JSON malformado */ }
  }
  return out;
}

function valorLd(v) {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(valorLd).filter(Boolean).slice(0, 3).join(', ');
  if (typeof v === 'object') return valorLd(v.name || v.value || '');
  return '';
}

/** Linhas <tr><th>chave</th><td>valor</td></tr> (ou td/td) de um trecho de HTML. */
function linhasTabela(trecho) {
  const out = [];
  for (const m of String(trecho || '').matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cel = [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => textoLimpo(c[1]));
    if (cel.length >= 2 && cel[0] && cel[1]) out.push([cel[0], cel[1]]);
  }
  return out;
}

function blocoPorId(html, re, tam) {
  const i = html.search(re);
  return i >= 0 ? html.slice(i, i + (tam || 30000)) : '';
}

/**
 * Destaques (frases curtas) e ficha técnica (chave → valor) da página do produto.
 * @returns {{destaques: string[], ficha: Object<string,string>}}
 */
function extrairDestaquesPagina(html, url) {
  const h = String(html || '');
  const destaques = [];
  const ficha = {};
  if (!h) return { destaques, ficha };
  const vistos = new Set();
  const addDestaque = (s) => {
    if (destaques.length >= MAX_DESTAQUES) return;
    const t = textoLimpo(s).replace(/^[•·\-–—*✓✔►▶]+\s*/, '');
    if (!destaqueValido(t)) return;
    const k = t.toLowerCase().slice(0, 40);
    if (vistos.has(k)) return;
    vistos.add(k);
    destaques.push(cortar(t, MAX_TXT));
  };
  const addFicha = (k, v) => {
    const chave = cortar(textoLimpo(k).replace(/[:\s]+$/, ''), 40);
    const valor = cortar(textoLimpo(v), 60);
    if (!chave || !valor || Object.keys(ficha).length >= MAX_FICHA) return;
    if (RE_CHAVE_INUTIL.test(chave) || RE_LIXO.test(valor) || ficha[chave]) return;
    if (/^(?:n[aã]o|sim|n\/a|-|não se aplica)$/i.test(valor) && !/bivolt|sem\s+fio|prova/i.test(chave)) return;
    ficha[chave] = valor;
  };

  // 1) JSON-LD
  for (const p of nodosLd(h)) {
    const props = Array.isArray(p.additionalProperty) ? p.additionalProperty : [];
    props.forEach((pr) => addFicha(valorLd(pr && pr.name), valorLd(pr && pr.value)));
    ['material', 'color', 'size', 'pattern'].forEach((k) => { if (p[k]) addFicha({ material: 'Material', color: 'Cor', size: 'Tamanho', pattern: 'Estampa' }[k], valorLd(p[k])); });
  }

  // 2) Amazon
  if (/amazon\.com\.br/i.test(String(url || '')) || /id\s*=\s*["']feature-bullets["']/i.test(h)) {
    const fb = blocoPorId(h, /id\s*=\s*["']feature-bullets["']/i, 20000);
    const fimFb = fb.search(/<\/ul>/i);
    for (const m of (fimFb > 0 ? fb.slice(0, fimFb) : fb).matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) addDestaque(m[1]);
    const ov = blocoPorId(h, /id\s*=\s*["']productOverview_feature_div["']/i, 15000);
    linhasTabela(ov.slice(0, Math.max(0, ov.search(/<\/table>/i)) || 15000)).forEach(([k, v]) => addFicha(k, v));
    for (const re of [/id\s*=\s*["']productDetails_techSpec_section_1["']/i, /id\s*=\s*["']productDetails_detailBullets_sections1["']/i, /id\s*=\s*["']technicalSpecifications_section_1["']/i]) {
      const tb = blocoPorId(h, re, 30000);
      linhasTabela(tb.slice(0, Math.max(0, tb.search(/<\/table>/i)) || 30000)).forEach(([k, v]) => addFicha(k, v));
    }
  }

  // 3) Mercado Livre
  if (/mercadoli[vb]re\.com/i.test(String(url || '')) || /ui-pdp-|ui-vpp-highlighted-specs/i.test(h)) {
    for (const m of h.matchAll(/class\s*=\s*["'][^"']*ui-vpp-highlighted-specs__features-list-item[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)) addDestaque(m[1]);
    for (const m of h.matchAll(/class\s*=\s*["'][^"']*ui-pdp-family--REGULAR[^"']*ui-vpp-highlighted-specs__key-value__labels__key-value[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi)) {
      const t = textoLimpo(m[1]);
      const i = t.indexOf(':');
      if (i > 0) addFicha(t.slice(0, i), t.slice(i + 1));
    }
    const tab = blocoPorId(h, /class\s*=\s*["'][^"']*(?:andes-table|ui-vpp-striped-specs)/i, 40000);
    linhasTabela(tab).forEach(([k, v]) => addFicha(k, v));
  }

  // 4) Descrição curta (JSON-LD description ou meta description) quando faltou destaque.
  if (destaques.length < 2) {
    const ld = nodosLd(h).map((p) => valorLd(p.description)).find(Boolean) || '';
    const meta = (h.match(/<meta[^>]+(?:name|property)\s*=\s*["'](?:og:)?description["'][^>]*content\s*=\s*["']([^"']{20,600})["']/i) || [])[1] || '';
    const desc = textoLimpo(ld || meta);
    desc.split(/(?<=[.!?;])\s+|\s+[•·]\s+/).forEach(addDestaque);
  }

  return { destaques, ficha };
}

/** Texto único (destaques + ficha) para os leitores de fatos e para a validação de números. */
function textoDetalhes(destaques, ficha) {
  const d = Array.isArray(destaques) ? destaques : [];
  const f = ficha && typeof ficha === 'object' ? Object.entries(ficha).map(([k, v]) => `${k}: ${v}`) : [];
  return d.concat(f).join(' · ');
}

module.exports = { extrairDestaquesPagina, textoDetalhes };
