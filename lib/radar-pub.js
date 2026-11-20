'use strict';
// Publicação automática em lote do Radar (extraída de lib/radar.js para reduzir tamanho dos workflows via tree-shaking).
const { partesData } = require('./util');
const { parseManuais } = require('./links');
const { prepararPublicacao, lerRespostasShopee } = require('./fluxos');
const { ordenarFilaPublicacao } = require('./tg-envio');

/**
 * Executa a publicação automática em lote para ofertas do radar quando /modo piloto está ligado.
 */
function publicarLoteRadar(fin, respShopeeLinks, respCards, cfg, postsRecentes) {
  const planos = (fin && fin.autoPlanos) || [];
  if (!planos.length) return { updates: [], linksRows: [], chamadasPub: [], ofertasPublicadas: [], chamadasWhatsApp: [] };

  const resolvidosPorPlano = planos.map((p) => (p.linkItens || []).map((it) => Object.assign({}, it)));
  ((fin && fin.reqsShopeeLinks) || []).forEach((req, k) => {
    const r = (respShopeeLinks || [])[k] || {};
    const orig = resolvidosPorPlano[req.planoIdx] && resolvidosPorPlano[req.planoIdx][req.itemIdx];
    if (orig) resolvidosPorPlano[req.planoIdx][req.itemIdx] = lerRespostasShopee([orig], [r])[0];
  });

  const o = (fin && fin.opcoes) || {};
  const tsBase = (o.ts != null && Number.isFinite(Number(o.ts))) ? Number(o.ts) : Date.now();
  const fuso = (cfg && cfg.fuso) || 'America/Sao_Paulo';
  const hora = Number(partesData(tsBase, fuso).hour);
  const silenciosoNoite = o.modo === 'agendado' && (hora >= 22 || hora < 8);

  const updates = [];
  const linksRows = [];
  const chamadasPub = [];
  const ofertasPublicadas = [];
  const chamadasWhatsApp = [];
  planos.forEach((p, idx) => {
    const cardResp = p.cardIdx >= 0 ? (respCards || [])[p.cardIdx] : null;
    const msgId = cardResp && cardResp.ok && cardResp.result ? cardResp.result.message_id : 0;
    const pub = prepararPublicacao(p.oferta, resolvidosPorPlano[idx], cfg, {
      ts: p.ts,
      chat_id: p.chat_id,
      message_id: msgId,
      so_textos: !!p.so_textos,
      postsAnteriores: Array.isArray(postsRecentes) ? postsRecentes : [],
    });
    const manP = parseManuais(p.oferta && p.oferta.links_manuais);
    const prioOferta = (p.oferta && p.oferta.relampago)
      ? 'relampago'
      : (manP.prioridade_fila || ((p.oferta && p.oferta.top) ? 'alta_qualidade' : 'regular'));
    if (pub.update) updates.push(pub.update);
    if (pub.linksRows && pub.linksRows.length) linksRows.push(...pub.linksRows);
    if (pub.ok && !p.so_textos) ofertasPublicadas.push(p.oferta);
    if (pub.chamadasWhatsApp && pub.chamadasWhatsApp.length) chamadasWhatsApp.push(...pub.chamadasWhatsApp);
    if (pub.chamadas && pub.chamadas.length) {
      for (const ch of pub.chamadas) {
        if (silenciosoNoite && ch.bot === 'admin' && ch.metodo === 'sendMessage' && ch.payload) {
          ch.payload.disable_notification = true;
        }
        if (ch.ref) {
          ch.ref = Object.assign({ prioridade: prioOferta, ts: p.ts || tsBase }, ch.ref);
        } else {
          ch.prioridade = ch.prioridade || prioOferta;
          ch.ts = ch.ts || p.ts || tsBase;
        }
        chamadasPub.push(ch);
      }
    }
  });

  const chamadasOrdenadas = ordenarFilaPublicacao(chamadasPub, { agora: tsBase });
  return { updates, linksRows, chamadasPub: chamadasOrdenadas, ofertasPublicadas, chamadasWhatsApp };
}

module.exports = { publicarLoteRadar };
