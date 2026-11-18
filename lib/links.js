'use strict';
const { PLATAFORMAS, campanhaPadrao, montarSubId } = require('./subid');
const shopee = require('./shopee');
const { PROGRAMAS_AFILIADO, nomeLoja, urlCentralCupons } = require('./lojas');

const LOJAS_CONFIANCA_DIRETA = new Set([
  'pacheco', 'belezanaweb', 'drogaraia', 'drogasil', 'epocacosmeticos',
  'boticario', 'sephora', 'pichau', 'panvel', 'araujo', 'paguemenos',
  'centauro', 'netshoes', 'nike', 'adidas', 'renner', 'cea', 'riachuelo', 'dafiti', 'zattini', 'hering',
]);

function anexarQuery(url, paramStr) {
  const q = String(paramStr || '').replace(/^[?&]+/, '').trim();
  if (!q) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${q}`;
}

function urlPorExtra(baseUrl, extra) {
  const e = String(extra || '').trim();
  if (!e) return '';
  if (/^https?:\/\//i.test(e)) {
    if (e.includes('{url}')) return e.replace(/\{url\}/g, encodeURIComponent(baseUrl));
    if (/[?&](?:url|murl|ued|dl|u)=$/i.test(e)) return e + encodeURIComponent(baseUrl);
    return e;
  }
  return anexarQuery(baseUrl, e);
}

function temAfiliadoAtivo(loja, cfg, manuais) {
  const m = parseManuais(manuais);
  if (m._afiliado || PLATAFORMAS.some((p) => !!m[p])) return true;
  const c = cfg || {};
  const af = c.afiliados || {};
  const extras = af.extras || {};
  if (loja === 'amazon') {
    const tags = (c.amazon && c.amazon.tags) || {};
    return !!(m._tag_url || (c.amazon && c.amazon.tag_padrao) || Object.values(tags).some(Boolean));
  }
  if (loja === 'ml') return !!(c.ml && c.ml.etiqueta);
  if (loja === 'shopee') return !!(c.shopee && c.shopee.app_id && c.shopee.secret);
  if (loja === 'shein') return !!(c.shein && c.shein.afiliado_id);
  if (loja === 'kabum') return !!(af.awin_id || extras.kabum);
  if (loja === 'terabyte') return !!(af.terabyte_id || m._parceiro_terabyte || extras.terabyte);
  if (loja === 'natura') return !!(af.natura_consultoria || m._consultoria_natura || af.rakuten_id || extras.natura);
  if (loja === 'pacheco' || loja === 'belezanaweb') return !!(af.rakuten_id || extras[loja]);
  const prog = PROGRAMAS_AFILIADO[loja];
  if (prog && prog.awin_mid && af.awin_id) return true;
  if (c.cupons && c.cupons.links && c.cupons.links[loja]) return true;
  return !!extras[loja];
}

function dicaAfiliado(loja, cfg, manuais) {
  const p = PROGRAMAS_AFILIADO[loja];
  if (!p) return null;
  if (temAfiliadoAtivo(loja, cfg, manuais)) return null;
  return Object.assign({ loja, nome: nomeLoja(loja) }, p);
}

/**
 * Planeja os 4 links de uma oferta (um por plataforma).
 * Retorna uma lista de itens:
 *   { plataforma, sub_id, metodo: 'pronto'|'shopee', url?, http?, aviso? }
 * - 'shopee': precisa chamar a API (http = { url, body, headers }).
 * - 'pronto': link já resolvido (Amazon com tag, manual, UTM).
 */
function planejarLinks(oferta, cfg, agora) {
  const prefixo = cfg.campanha_prefixo || 'bf26';
  const tz = cfg.fuso || 'America/Sao_Paulo';
  const manuais = parseManuais(oferta.links_manuais);
  const itens = [];

  for (const plataforma of PLATAFORMAS) {
    const campanha = campanhaPadrao(plataforma, agora, tz);
    const { sub_id, partes } = montarSubId({ prefixo, categoria: oferta.categoria, plataforma, campanha });
    const base = { plataforma, sub_id };

    if (manuais[plataforma]) {
      itens.push(Object.assign(base, { metodo: 'pronto', url: manuais[plataforma], aviso: '' }));
      continue;
    }

    const linkCupomLoja = manuais.eh_cupom_loja && cfg && cfg.cupons && cfg.cupons.links && cfg.cupons.links[oferta.loja];
    if (linkCupomLoja && !manuais._afiliado) {
      itens.push(Object.assign(base, { metodo: 'pronto', url: linkCupomLoja, aviso: '' }));
      continue;
    }

    if (oferta.loja === 'shopee') {
      if (cfg.shopee && cfg.shopee.app_id && cfg.shopee.secret) {
        // sub1..sub5 = prefixo, categoria, plataforma, campanha, oferta_id
        const subIds = partes.concat(String(oferta.oferta_id || '').replace(/[^a-z0-9]/gi, '')).filter(Boolean);
        itens.push(Object.assign(base, {
          metodo: 'shopee',
          http: shopee.reqShortLink(cfg.shopee, oferta.url, subIds),
          fallback_url: manuais._afiliado || oferta.url || '',
          fallback_aviso: manuais._afiliado
            ? 'API Shopee indisponível; usando link curto original'
            : 'API Shopee indisponível; usando link direto (sem comissão)',
        }));
      } else if (manuais._afiliado) {
        itens.push(Object.assign(base, { metodo: 'pronto', url: manuais._afiliado, aviso: '' }));
      } else {
        itens.push(Object.assign(base, { metodo: 'pronto', url: oferta.url, aviso: 'Shopee sem link de afiliado (link direto, sem comissão)' }));
      }
    } else if (oferta.loja === 'amazon') {
      const tag = tagAmazon(cfg, oferta.categoria, plataforma) || manuais._tag_url || '';
      if (tag) {
        itens.push(Object.assign(base, { metodo: 'pronto', url: `${oferta.url}?tag=${encodeURIComponent(tag)}`, aviso: '' }));
      } else if (manuais._afiliado) {
        itens.push(Object.assign(base, { metodo: 'pronto', url: manuais._afiliado, aviso: '' }));
      } else {
        itens.push(Object.assign(base, { metodo: 'pronto', url: oferta.url, aviso: `sem tag da Amazon para ${oferta.categoria}/${plataforma} (link direto, sem comissão)` }));
      }
    } else if (oferta.loja === 'ml') {
      // Sem API pública: aceita link único mercadolivre.com/sec (em _afiliado), links manuais ou etiqueta ml.etiqueta.
      const outro = PLATAFORMAS.map((p) => manuais[p]).find(Boolean);
      const etiqueta = cfg.ml && cfg.ml.etiqueta ? String(cfg.ml.etiqueta).trim() : '';
      if (outro) {
        itens.push(Object.assign(base, {
          metodo: 'pronto',
          url: outro,
          aviso: `ML sem link próprio para ${plataforma} (usando outro; atribuição somada)`,
        }));
      } else if (manuais._afiliado) {
        itens.push(Object.assign(base, { metodo: 'pronto', url: manuais._afiliado, aviso: '' }));
      } else if (etiqueta) {
        const [word, tool] = etiqueta.split(':');
        const sep = oferta.url.includes('?') ? '&' : '?';
        const q = tool
          ? `matt_word=${encodeURIComponent(word)}&matt_tool=${encodeURIComponent(tool)}`
          : `matt_word=${encodeURIComponent(word)}`;
        itens.push(Object.assign(base, { metodo: 'pronto', url: `${oferta.url}${sep}${q}`, aviso: '' }));
      } else {
        itens.push(Object.assign(base, {
          metodo: 'pronto',
          url: oferta.url,
          aviso: `ML sem link de afiliado para ${plataforma} (link direto, sem comissão)`,
        }));
      }
    } else if (oferta.loja === 'shein') {
      const af = cfg.shein && cfg.shein.afiliado_id ? String(cfg.shein.afiliado_id).trim() : '';
      if (manuais._afiliado) {
        itens.push(Object.assign(base, { metodo: 'pronto', url: manuais._afiliado, aviso: '' }));
      } else if (af) {
        const sep = oferta.url.includes('?') ? '&' : '?';
        const param = af.includes('=') ? af : `aff_id=${encodeURIComponent(af)}`;
        itens.push(Object.assign(base, { metodo: 'pronto', url: `${oferta.url}${sep}${param}`, aviso: '' }));
      } else {
        itens.push(Object.assign(base, {
          metodo: 'pronto',
          url: oferta.url,
          aviso: 'Shein sem afiliado configurado (link direto, sem comissão)',
        }));
      }
    } else if (oferta.loja === 'tiktok') {
      if (manuais._afiliado) {
        itens.push(Object.assign(base, { metodo: 'pronto', url: manuais._afiliado, aviso: '' }));
      } else {
        itens.push(Object.assign(base, {
          metodo: 'pronto',
          url: oferta.url,
          aviso: 'TikTok Shop sem link curto de afiliado (link direto, sem comissão)',
        }));
      }
    } else if (oferta.loja === 'kabum') {
      const af = (cfg && cfg.afiliados) || {};
      const ex = (af.extras && af.extras.kabum) || '';
      if (manuais._afiliado) {
        itens.push(Object.assign(base, { metodo: 'pronto', url: manuais._afiliado, aviso: '' }));
      } else if (ex) {
        itens.push(Object.assign(base, { metodo: 'pronto', url: urlPorExtra(oferta.url, ex), aviso: '' }));
      } else if (af.awin_id) {
        const uAwin = `https://www.awin1.com/cread.php?awinmid=17729&awinaffid=${encodeURIComponent(af.awin_id)}&clickref=${encodeURIComponent(sub_id)}&ued=${encodeURIComponent(oferta.url)}`;
        itens.push(Object.assign(base, { metodo: 'pronto', url: uAwin, aviso: '' }));
      } else {
        itens.push(Object.assign(base, { metodo: 'pronto', url: oferta.url, aviso: 'KaBuM! sem awin.afiliado_id (link direto confiável; veja /afiliados)' }));
      }
    } else if (oferta.loja === 'terabyte') {
      const af = (cfg && cfg.afiliados) || {};
      const ex = (af.extras && af.extras.terabyte) || '';
      const pTrb = af.terabyte_id || manuais._parceiro_terabyte || '';
      if (manuais._afiliado) {
        itens.push(Object.assign(base, { metodo: 'pronto', url: manuais._afiliado, aviso: '' }));
      } else if (ex) {
        itens.push(Object.assign(base, { metodo: 'pronto', url: urlPorExtra(oferta.url, ex), aviso: '' }));
      } else if (pTrb) {
        itens.push(Object.assign(base, { metodo: 'pronto', url: anexarQuery(oferta.url, 'p=' + encodeURIComponent(pTrb)), aviso: '' }));
      } else {
        itens.push(Object.assign(base, { metodo: 'pronto', url: oferta.url, aviso: 'Terabyte sem terabyte.afiliado_id (link direto confiável; veja /afiliados)' }));
      }
    } else if (oferta.loja === 'natura') {
      const af = (cfg && cfg.afiliados) || {};
      const ex = (af.extras && af.extras.natura) || '';
      const cons = af.natura_consultoria || manuais._consultoria_natura || '';
      if (manuais._afiliado) {
        itens.push(Object.assign(base, { metodo: 'pronto', url: manuais._afiliado, aviso: '' }));
      } else if (ex) {
        itens.push(Object.assign(base, { metodo: 'pronto', url: urlPorExtra(oferta.url, ex), aviso: '' }));
      } else if (cons) {
        itens.push(Object.assign(base, { metodo: 'pronto', url: anexarQuery(oferta.url, 'consultoria=' + encodeURIComponent(cons)), aviso: '' }));
      } else if (af.rakuten_id) {
        const uRk = `https://click.linksynergy.com/deeplink?id=${encodeURIComponent(af.rakuten_id)}&mid=49351&u1=${encodeURIComponent(sub_id)}&murl=${encodeURIComponent(oferta.url)}`;
        itens.push(Object.assign(base, { metodo: 'pronto', url: uRk, aviso: '' }));
      } else {
        itens.push(Object.assign(base, { metodo: 'pronto', url: oferta.url, aviso: 'Natura sem natura.consultoria/rakuten.id (link direto confiável; veja /afiliados)' }));
      }
    } else if (LOJAS_CONFIANCA_DIRETA.has(oferta.loja)) {
      const af = (cfg && cfg.afiliados) || {};
      const ex = (af.extras && af.extras[oferta.loja]) || '';
      const prog = PROGRAMAS_AFILIADO[oferta.loja];
      if (manuais._afiliado) {
        itens.push(Object.assign(base, { metodo: 'pronto', url: manuais._afiliado, aviso: '' }));
      } else if (ex) {
        itens.push(Object.assign(base, { metodo: 'pronto', url: urlPorExtra(oferta.url, ex), aviso: '' }));
      } else if (prog && prog.rakuten_mid && af.rakuten_id) {
        const uRk = `https://click.linksynergy.com/deeplink?id=${encodeURIComponent(af.rakuten_id)}&mid=${encodeURIComponent(prog.rakuten_mid)}&u1=${encodeURIComponent(sub_id)}&murl=${encodeURIComponent(oferta.url)}`;
        itens.push(Object.assign(base, { metodo: 'pronto', url: uRk, aviso: '' }));
      } else if (prog && prog.awin_mid && af.awin_id) {
        const uAw = `https://www.awin1.com/cread.php?awinmid=${encodeURIComponent(prog.awin_mid)}&awinaffid=${encodeURIComponent(af.awin_id)}&clickref=${encodeURIComponent(sub_id)}&ued=${encodeURIComponent(oferta.url)}`;
        itens.push(Object.assign(base, { metodo: 'pronto', url: uAw, aviso: '' }));
      } else {
        itens.push(Object.assign(base, {
          metodo: 'pronto',
          url: oferta.url,
          aviso: prog ? `${nomeLoja(oferta.loja)} com afiliado opcional (${prog.chave}); link direto ativo` : 'Loja confiável sem código de afiliado exigido (link direto ativo)',
        }));
      }
    } else if (manuais._afiliado) {
      itens.push(Object.assign(base, { metodo: 'pronto', url: manuais._afiliado, aviso: '' }));
    } else {
      const sep = oferta.url.includes('?') ? '&' : '?';
      itens.push(Object.assign(base, {
        metodo: 'pronto',
        url: `${oferta.url}${sep}utm_source=${plataforma}&utm_medium=social&utm_campaign=${sub_id}`,
        aviso: 'loja sem programa de afiliados configurado (sem comissão)',
      }));
    }
  }
  return itens;
}

function tagAmazon(cfg, categoria, plataforma) {
  const tags = (cfg.amazon && cfg.amazon.tags) || {};
  return tags[`${categoria}_${plataforma}`] || tags[categoria] || (cfg.amazon && cfg.amazon.tag_padrao) || '';
}

function parseManuais(v) {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v) || {}; } catch (e) { return {}; }
}

/** Consolida os itens resolvidos em { tg, wac, wag, x } + erros. */
function consolidar(itens) {
  const links = {};
  const sub_ids = {};
  const avisos = [];
  const faltando = [];
  for (const it of itens) {
    sub_ids[it.plataforma] = it.sub_id;
    if (it.url) links[it.plataforma] = it.url;
    else faltando.push(it.plataforma);
    if (it.aviso) avisos.push(it.aviso);
    if (it.erro) avisos.push(`${it.plataforma}: ${it.erro}`);
  }
  return { links, sub_ids, avisos, faltando };
}

function urlAbaCuponsAfiliado(loja, cfg) {
  const base = urlCentralCupons(loja, cfg);
  if (!base) return '';
  const c = cfg || {};
  if (c.cupons && c.cupons.links && c.cupons.links[loja]) return c.cupons.links[loja];
  if (loja === 'ml' && c.ml && c.ml.etiqueta) {
    const [word, tool] = String(c.ml.etiqueta).trim().split(':');
    if (word) {
      const sep = base.includes('?') ? '&' : '?';
      const q = tool
        ? `matt_word=${encodeURIComponent(word)}&matt_tool=${encodeURIComponent(tool)}`
        : `matt_word=${encodeURIComponent(word)}`;
      return `${base}${sep}${q}`;
    }
  }
  if (loja === 'amazon' && c.amazon && c.amazon.tag_padrao) {
    return `${base}${base.includes('?') ? '&' : '?'}tag=${encodeURIComponent(c.amazon.tag_padrao)}`;
  }
  if (loja === 'shein' && c.shein && c.shein.afiliado_id) {
    const af = String(c.shein.afiliado_id).trim();
    const param = af.includes('=') ? af : `aff_id=${encodeURIComponent(af)}`;
    return `${base}${base.includes('?') ? '&' : '?'}${param}`;
  }
  return base;
}

module.exports = { planejarLinks, consolidar, tagAmazon, parseManuais, temAfiliadoAtivo, dicaAfiliado, urlAbaCuponsAfiliado };
