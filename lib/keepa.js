'use strict';
// Keepa API (histórico de preços da Amazon), conferida no SDK oficial keepacom/api_backend.
//   GET {api}/product?key=K&domain=12&asin=X&stats=90&history=0[&buybox=1]
//   Preços em centavos de BRL; -1 = sem oferta. Índices: AMAZON=0, NEW=1, BUY_BOX_SHIPPING=18 (só com buybox=1).
//   Data Keepa ("keepaMinute") → Unix ms: (keepaMinute + 21564000) * 60000.
const { round2, formatDataHora } = require('./util');
const { identificar } = require('./lojas');
const { msgAdmin } = require('./telegram');

const KEEPA_API = 'https://api.keepa.com';
const KEEPA_DOMINIO_BR = 12;
const KEEPA_MIN0 = 21564000;
const KEEPA_IMG = 'https://m.media-amazon.com/images/I/';

function cfgKeepa(cfg) {
  return (cfg && cfg.keepa) || cfg || {};
}

/** "17/11 14:32" no fuso da config. */
function dataHoraCurta(quando, fuso) {
  return formatDataHora(quando, fuso).replace(' às ', ' ');
}

/** keepaMinute → ISO. */
function dataKeepa(keepaMinute) {
  return new Date((Number(keepaMinute) + KEEPA_MIN0) * 60000).toISOString();
}

/** ASIN a partir de produto_id ("amz_B0…"), de um link da Amazon ou do próprio ASIN. */
function asinDe(v) {
  const s = String(v || '').trim();
  const m = s.match(/^(?:amz_)?([A-Z0-9]{10})$/i);
  if (m) return m[1].toUpperCase();
  const id = identificar(s);
  return id.loja === 'amazon' ? id.produto_id.replace(/^amz_/, '') : null;
}

/** Item HTTP da consulta (o nó HTTP do n8n faz o GET). Mesmo formato de shopee.requisicao: { url, method, headers }. */
function reqKeepa(cfg, asin) {
  const k = cfgKeepa(cfg);
  if (!k.chave) throw new Error('Configure keepa.chave');
  const a = asinDe(asin);
  if (!a) throw new Error('ASIN inválido: ' + asin);
  const base = String(k.api || KEEPA_API).replace(/\/+$/, '');
  return {
    url: `${base}/product?key=${encodeURIComponent(k.chave)}&domain=${KEEPA_DOMINIO_BR}&asin=${a}&stats=90&history=0${k.buybox ? '&buybox=1' : ''}`,
    method: 'GET',
    headers: { Accept: 'application/json' },
  };
}

function tentaJson(s) {
  try { return JSON.parse(s); } catch (e) { return null; }
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Título sem HTML e sem espaços sobrando. */
function limparTitulo(t) {
  return String(t || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : ' ';
      }
      return ENTIDADES[e.toLowerCase()] != null ? ENTIDADES[e.toLowerCase()] : m;
    })
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

function imagemDe(p) {
  const img = (p.images || [])[0];
  const arq = (img && (img.l || img.m)) || String(p.imagesCSV || '').split(',')[0];
  return arq ? KEEPA_IMG + arq : '';
}

function semTokens(body) {
  const ms = Number(body && body.refillIn);
  return 'Keepa sem tokens' + (ms > 0 ? ` (recarrega em ~${Math.ceil(ms / 60000)} min)` : '');
}

/**
 * Lê a resposta do GET /product. Aceita o corpo JSON, o corpo em texto ou a resposta completa do nó HTTP
 * ({ statusCode, body }); erro de rede do n8n chega como { error }.
 * Retorna { ok, titulo, imagem, preco_atual, ref90, ref90_data, ref90_fonte, tokens_restantes, erro }
 * (+ tipo: índice de preço usado, preco_data: última atualização do produto na Keepa).
 * ok = tem ref90. Título, imagem e preço vêm preenchidos sempre que existirem, mesmo com ok = false.
 */
function lerKeepa(resposta, cfg, agora) {
  const k = cfgKeepa(cfg);
  const fuso = (cfg && cfg.fuso) || 'America/Sao_Paulo';
  const ts = agora == null ? Date.now() : new Date(agora).getTime();
  const out = {
    ok: false, titulo: '', imagem: '', preco_atual: null, ref90: null, ref90_data: '',
    ref90_fonte: `Keepa · consultado ${dataHoraCurta(ts, fuso)}`, tokens_restantes: null, erro: '',
    tipo: null, preco_data: '',
  };
  const falha = (erro) => Object.assign(out, { ok: false, erro });

  let r = typeof resposta === 'string' ? tentaJson(resposta) : resposta;
  if (!r || typeof r !== 'object') return falha('Keepa sem resposta');
  let status = 200;
  let body = r;
  if (r.statusCode != null && 'body' in r) {
    status = Number(r.statusCode);
    body = typeof r.body === 'string' ? tentaJson(r.body) || {} : r.body || {};
  }
  if (body.tokensLeft != null && Number.isFinite(Number(body.tokensLeft))) out.tokens_restantes = Number(body.tokensLeft);

  const e = body.error;
  const errTxt = !e ? '' : typeof e === 'object' ? [e.type, e.message, e.details].filter(Boolean).join(' ') : String(e);
  if (status === 429 || /NOT_ENOUGH_TOKEN|tokens? (left|exhausted)/i.test(errTxt)) return falha(semTokens(body));
  if ([401, 402, 403].includes(status) || /\bkey\b|apikey|access key|unauthori/i.test(errTxt)) {
    return falha('Keepa: chave inválida ou sem plano ativo (confira keepa.chave na bfx_config)');
  }
  if (status !== 200) return falha(`Keepa respondeu ${status}${errTxt ? ': ' + errTxt.slice(0, 120) : ''}`);
  if (e && !body.products) return falha('Keepa fora do ar: ' + errTxt.slice(0, 120));

  const p = (body.products || [])[0];
  if (!p) return falha(out.tokens_restantes != null && out.tokens_restantes < 1 ? semTokens(body) : 'Keepa sem dados deste produto');
  out.titulo = limparTitulo(p.title);
  out.imagem = imagemDe(p);
  if (Number(p.lastUpdate) > 0) out.preco_data = dataKeepa(p.lastUpdate);

  const st = p.stats || {};
  const cur = st.current || [];
  const min = st.minInInterval || [];
  const t = k.buybox && cur[18] > 0 ? 18 : cur[0] > 0 ? 0 : 1;
  out.tipo = t;
  if (cur[t] > 0) out.preco_atual = round2(cur[t] / 100);
  const m = min[t];
  if (Array.isArray(m) && m[1] > 0) {
    out.ref90 = round2(m[1] / 100);
    out.ref90_data = dataKeepa(m[0]);
  }
  if (out.ref90 == null) {
    if (!p.stats) return falha(out.tokens_restantes != null && out.tokens_restantes < 1 ? semTokens(body) : 'Keepa sem dados deste produto');
    return falha(out.preco_atual == null ? 'Keepa: produto sem oferta no momento' : 'Keepa sem menor preço de 90 dias deste produto');
  }
  out.ok = true;
  return out;
}

/**
 * Junta o resultado da Keepa na oferta do /oferta, antes do cálculo do selo.
 * O que o admin digitou tem prioridade; a Keepa só preenche o que falta (título, preço, ref90, imagem).
 * entrada: saída de prepararOferta ({ rota:'oferta', oferta, keepa_http?, avisos_card? ... }).
 * resposta: saída do nó HTTP da Keepa (ou null quando não houve consulta).
 * Retorna a entrada pronta para avaliarNovaOferta, ou { rota:'responder', chamadas } quando falta título/preço.
 */
function juntarKeepa(entrada, resposta, cfg) {
  if (!entrada || entrada.rota !== 'oferta' || !entrada.oferta) return entrada;
  const fuso = (cfg && cfg.fuso) || 'America/Sao_Paulo';
  const e = Object.assign({}, entrada, { oferta: Object.assign({}, entrada.oferta), avisos_card: (entrada.avisos_card || []).slice() });
  delete e.keepa_http;
  const o = e.oferta;
  let erro = '';
  if (entrada.keepa_http) {
    const k = lerKeepa(resposta, cfg, entrada.ts);
    erro = k.erro;
    const usados = [];
    if (!o.titulo && k.titulo) { o.titulo = k.titulo; usados.push('titulo'); }
    if (!o.imagem && k.imagem) { o.imagem = k.imagem; usados.push('imagem'); }
    if (o.preco == null && k.preco_atual != null) {
      o.preco = k.preco_atual;
      usados.push('preco');
      e.avisos_card.push(`💡 preço da Keepa (${dataHoraCurta(k.preco_data || entrada.ts, fuso)}): confira na loja antes de aprovar`);
    }
    if (o.ref90 == null && k.ref90 != null) {
      o.ref90 = k.ref90;
      o.ref90_fonte = k.ref90_fonte;
      o.ref90_keepa = true;
      usados.push('ref90');
    }
    if (k.erro) e.avisos_card.push('⚠️ ' + k.erro);
    e.keepa = { ok: k.ok, erro: k.erro, usados, tokens_restantes: k.tokens_restantes, preco_atual: k.preco_atual, ref90: k.ref90, ref90_data: k.ref90_data };
  }
  const faltam = [!o.titulo && 'o título', o.preco == null && 'o preço'].filter(Boolean);
  if (faltam.length) {
    const motivo = erro || 'Keepa desligada';
    return {
      rota: 'responder',
      chamadas: [msgAdmin(entrada.chat_id, [
        `❗ ${motivo}: falta ${faltam.join(' e ')}.`,
        'Mande de novo com as linhas que faltam, ex.:',
        `/oferta ${o.categoria || 'casa'} ${o.url || ''}`.trim(),
        'Air Fryer Mondial 4L',
        'preço 349,90',
      ].join('\n'))],
    };
  }
  return e;
}

module.exports = { KEEPA_API, asinDe, reqKeepa, lerKeepa, juntarKeepa, dataKeepa, limparTitulo };
