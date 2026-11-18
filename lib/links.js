'use strict';
const { PLATAFORMAS, campanhaPadrao, montarSubId } = require('./subid');
const shopee = require('./shopee');

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

module.exports = { planejarLinks, consolidar, tagAmazon, parseManuais };
