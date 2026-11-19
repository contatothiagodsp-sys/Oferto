'use strict';
// Resolução de redirecionamentos (saltos 1 e 2) e helpers leves do Radar (extraídos de lib/radar.js para tree-shaking).
const { truncar } = require('./util');
const { identificar } = require('./lojas');
const { ehCurto, lerLocation, textoRespostaHttp, desempacotarRedirLoja } = require('./curtos');
const shopee = require('./shopee');
const { HDRS_WEB, wrapUrlRadar, wrapUrlCurtoRadar } = require('./radar-fontes');

function decodificarEntidadesWeb(s) {
  return String(s || '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\u00AD]/g, '')
    .replace(/&(?:NegativeMediumSpace|ZeroWidthSpace|zwnj|zwj|shy|hairsp);/gi, '')
    .replace(/&(?:thinsp|ensp|emsp);/gi, ' ')
    .replace(/&ldquo;|&rdquo;|&bdquo;|&Prime;/gi, '"')
    .replace(/&lsquo;|&rsquo;|&sbquo;|&prime;|&apos;/gi, "'")
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&hellip;/gi, '…')
    .replace(/&bull;|&middot;/gi, '·')
    .replace(/&deg;/gi, '°')
    .replace(/&times;/gi, 'x')
    .replace(/&ordm;/gi, 'º')
    .replace(/&ordf;/gi, 'ª')
    .replace(/&reg;|&circledr;/gi, '®')
    .replace(/&trade;/gi, '™')
    .replace(/&#0*36;/g, '$')
    .replace(/&#0*33;/g, '!')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const n = parseInt(h, 16);
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : ' ';
    })
    .replace(/&#(\d+);/g, (_, d) => {
      const n = parseInt(d, 10);
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : ' ';
    })
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ');
}

function preservarQtdUnidadesTitulo(titulo, qtd) {
  const t = String(titulo || '').trim();
  const q = Number(qtd) || 1;
  if (!t || q < 2) return t;
  if (new RegExp(`^\\s*${q}\\s*x\\b`, 'i').test(t)) return t;
  if (new RegExp(`\\b(?:kit|combo|pack)\\s+(?:com\\s+)?${q}\\b`, 'i').test(t)) return t;
  if (new RegExp(`\\b${q}\\s*(?:un(?:id(?:ades?)?)?|unidades?|pe[cç]as?)\\b`, 'i').test(t)) return t;
  return truncar(`${q}x ${t}`, 180);
}

function aplicarMetadadosLojaKpopShopee(c, rawUrl) {
  if (!c || c.loja !== 'shopee') return;
  const kpopSh = shopee.identificarLojaKpopShopee({
    shopId: c.shop_id,
    shopName: c.shop_name,
    url: rawUrl || c.url,
  });
  if (!kpopSh) return;
  c.loja_kpop_curada = true;
  c.loja_confiavel = true;
  c.loja_indicada = true;
  if (kpopSh.oficial) c.loja_oficial = true;
  if (kpopSh.shop_id) c.shop_id = kpopSh.shop_id;
  c.shop_username = kpopSh.username;
  if (!c.shop_name) c.shop_name = kpopSh.nome;
  c.categoria_hint = 'kpop';
  c.categoria = 'kpop';
  c.categoria_indefinida = false;
}

function ehUrlHubNaoProduto(url) {
  return /shopee\.com\.br\/m\/cupom|amazon\.com\.br\/promotion\/psp\/|\/(?:m\/)?cupons(?:-diarios)?(?:[/?#]|$)/i.test(String(url || ''));
}

function tentarFallbackRedirAlt(c, idx, listaReqs, cfg) {
  if (!c || !Array.isArray(c.redir_url_alts) || !c.redir_url_alts.length) return false;
  const alt = c.redir_url_alts.shift();
  if (!alt) return false;
  if (ehCurto(alt)) {
    listaReqs.push({ idx, url: wrapUrlCurtoRadar(alt, cfg), headers: HDRS_WEB });
    return true;
  }
  const id = identificar(alt);
  if (!id.erro && id.loja !== 'outra' && !ehUrlHubNaoProduto(id.url_limpa)) {
    c.loja = id.loja;
    c.produto_id = id.produto_id;
    c.url = id.url_limpa;
    c.resolved = true;
    if (c.loja === 'shopee') aplicarMetadadosLojaKpopShopee(c, alt);
    return true;
  }
  return false;
}

/**
 * 1º salto do radar: extrai a URL da loja a partir do /Redirect/to/<id>/ (ou link curto) e limpa afiliados alheios.
 */
function aplicarRedirRadar1(estado, resp1, cfg) {
  const cands = (estado.candidatos || []).map((c) => Object.assign({}, c));
  const reqs2 = [];
  let promobit429 = false;
  let promobitOk = false;
  (estado.reqs1 || []).forEach((req, k) => {
    const c = cands[req.idx];
    const r = (resp1 || [])[k];
    if (!c || !r) return;
    const st = Number(r.statusCode || (r.error && r.error.status) || 0);
    if (c.fonte_radar === 'promobit' && (st === 429 || ((st === 403 || st >= 500) && /Acesso Bloqueado|GoCache|Too Many Requests/i.test(textoRespostaHttp(r))))) {
      promobit429 = true;
      c._promobit_429 = true;
      return;
    }
    let url = lerLocation(r);
    if (!url) {
      if (!tentarFallbackRedirAlt(c, req.idx, reqs2, cfg)) c._descarte_motivo = 'sem_location_redir';
      return;
    }
    if (c.fonte_radar === 'promobit') promobitOk = true;
    url = desempacotarRedirLoja(url);
    if (/promobit\.com\.br|gatry\.com/i.test(url)) {
      if (!tentarFallbackRedirAlt(c, req.idx, reqs2, cfg)) c._descarte_motivo = 'redir_terceiro';
      return;
    }
    if (ehCurto(url)) {
      reqs2.push({ idx: req.idx, url: wrapUrlCurtoRadar(url, cfg), headers: HDRS_WEB });
      return;
    }
    if (!c.eh_cupom_loja && ehUrlHubNaoProduto(url)) {
      if (!tentarFallbackRedirAlt(c, req.idx, reqs2, cfg)) c._descarte_motivo = 'nao_produto';
      return;
    }
    if (/mercadoli(?:vre|bre)\.com(?:\.br)?\/social\//i.test(url) && !/(?:\/p\/|MLB-?)\d{6,}/i.test(url)) {
      c._social_url = url;
      return;
    }
    const id = identificar(url);
    if (!id.erro) {
      c.loja = id.loja;
      c.produto_id = id.produto_id;
      c.url = id.url_limpa;
      c.resolved = true;
      if (c.loja === 'shopee') aplicarMetadadosLojaKpopShopee(c, url);
    } else if (!tentarFallbackRedirAlt(c, req.idx, reqs2, cfg)) {
      c._descarte_motivo = 'nao_produto';
    }
  });
  return { opcoes: estado.opcoes, candidatos: cands, reqs2, promobit_429: promobit429, promobit_ok: promobitOk };
}

/**
 * 2º salto do radar: expande links curtos (amzn.to, s.shopee.com.br, meli.la, tiktok.com/t/…).
 * Se cair em vitrine /social/ do Mercado Livre sem MLB, agenda o 3º salto para abrir a vitrine.
 */
function aplicarRedirRadar2(estado, resp2, cfg) {
  const cands = (estado.candidatos || []).map((c) => Object.assign({}, c));
  const reqs3 = [];
  (estado.reqs2 || []).forEach((req, k) => {
    const c = cands[req.idx];
    const r = (resp2 || [])[k];
    if (!c || !r) return;
    let loc = lerLocation(r);
    if (!loc) {
      if (!tentarFallbackRedirAlt(c, req.idx, reqs3, cfg)) c._descarte_motivo = 'sem_location_redir2';
      return;
    }
    loc = desempacotarRedirLoja(loc);
    if (/promobit\.com\.br|gatry\.com/i.test(loc)) {
      if (!tentarFallbackRedirAlt(c, req.idx, reqs3, cfg)) c._descarte_motivo = 'redir_terceiro';
      return;
    }

    if (ehCurto(loc)) {
      reqs3.push({ idx: req.idx, url: wrapUrlRadar(loc, cfg), headers: HDRS_WEB });
      return;
    }
    if (!c.eh_cupom_loja && ehUrlHubNaoProduto(loc)) {
      if (!tentarFallbackRedirAlt(c, req.idx, reqs3, cfg)) c._descarte_motivo = 'nao_produto';
      return;
    }
    if (/mercadoli(?:vre|bre)\.com(?:\.br)?\/social\//i.test(loc) && !/(?:\/p\/|MLB-?)\d{6,}/i.test(loc)) {
      reqs3.push({ idx: req.idx, url: wrapUrlRadar(loc, cfg), headers: HDRS_WEB });
      return;
    }
    const id = identificar(loc);
    if (!id.erro) {
      c.loja = id.loja;
      c.produto_id = id.produto_id;
      c.url = id.url_limpa;
      c.resolved = true;
      if (c.loja === 'shopee') aplicarMetadadosLojaKpopShopee(c, loc);
    } else if (!tentarFallbackRedirAlt(c, req.idx, reqs3, cfg)) {
      c._descarte_motivo = 'nao_produto';
    }
  });
  cands.forEach((c, idx) => {
    if (c && c._social_url && !c.resolved && !reqs3.some((q) => q.idx === idx)) {
      reqs3.push({ idx, url: wrapUrlRadar(c._social_url, cfg), headers: HDRS_WEB });
    }
  });
  return { opcoes: estado.opcoes, candidatos: cands, reqs3 };
}

module.exports = {
  decodificarEntidadesWeb,
  preservarQtdUnidadesTitulo,
  aplicarMetadadosLojaKpopShopee,
  ehUrlHubNaoProduto,
  tentarFallbackRedirAlt,
  aplicarRedirRadar1,
  aplicarRedirRadar2,
};
