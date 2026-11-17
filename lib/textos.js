'use strict';
const { formatBRL, formatDataHora, escapeHtml, truncar } = require('./util');
const { nomeLoja, naLoja } = require('./lojas');

const AVISO = 'Contém link de afiliado.';

function cat(cfg, categoria) {
  return (cfg.categorias && cfg.categorias[categoria]) || { nome: categoria, emoji: '🏷️' };
}

/** Cupom informado no /oferta (linha "cupom CODIGO"); fica guardado junto dos links manuais. */
function cupomDe(oferta) {
  if (oferta.cupom) return String(oferta.cupom);
  const m = typeof oferta.links_manuais === 'string' ? safeJson(oferta.links_manuais) : oferta.links_manuais || {};
  return m.cupom ? String(m.cupom) : '';
}

/** "12% abaixo do menor preço dos últimos 90 dias (R$ 399,90)" ou "no menor preço dos últimos 90 dias". */
function fraseDesconto(oferta) {
  const pct = Math.floor(Number(oferta.desconto_pct) || 0);
  if (pct >= 1) return `${pct}% abaixo do menor preço dos últimos 90 dias (${formatBRL(oferta.min90)})`;
  return 'no menor preço dos últimos 90 dias';
}

function quando(oferta, cfg) {
  return formatDataHora(oferta.preco_em || oferta.data || oferta.ts || new Date(), cfg.fuso);
}

/** "Ver na Amazon", "Ver no Mercado Livre", "Ver na loja". */
function verNa(loja) {
  return 'Ver ' + naLoja(loja);
}

/** Botão de compra do post no Telegram (aparece embaixo da mensagem, mais fácil de tocar que o link). */
function botaoCompra(oferta, link) {
  return { inline_keyboard: [[{ text: `🛒 ${verNa(oferta.loja)}`, url: link }]] };
}

/** Post do tópico no Telegram (HTML). O cupom vai em <code> para copiar com um toque. */
function textoTelegram(oferta, link, cfg) {
  const c = cat(cfg, oferta.categoria);
  const cupom = cupomDe(oferta);
  const linhas = [
    `${c.emoji} <b>${escapeHtml(truncar(oferta.titulo, 180))}</b>`,
    '',
    `💰 <b>${formatBRL(oferta.preco)}</b> ${naLoja(oferta.loja)}`,
    `✅ <b>Desconto real:</b> ${escapeHtml(fraseDesconto(oferta))}`,
  ];
  if (cupom) linhas.push(`🎟️ Cupom: <code>${escapeHtml(cupom)}</code> (toque para copiar; o preço já considera o cupom)`);
  linhas.push(
    '',
    `👉 <a href="${escapeHtml(link)}">${escapeHtml(verNa(oferta.loja))}</a>`,
    `🕒 Preço de ${quando(oferta, cfg)}. Pode mudar a qualquer momento.`,
    `<i>${AVISO}</i>`,
  );
  return linhas.join('\n');
}

/** Canal do WhatsApp (formatação *negrito* _itálico_ ```mono```). */
function textoWhatsAppCanal(oferta, link, cfg) {
  const c = cat(cfg, oferta.categoria);
  const cupom = cupomDe(oferta);
  const linhas = [
    `${c.emoji} *${truncar(oferta.titulo, 120)}*`,
    '',
    `💰 *${formatBRL(oferta.preco)}* ${naLoja(oferta.loja)}`,
    `✅ Desconto real: ${fraseDesconto(oferta)}`,
  ];
  if (cupom) linhas.push(`🎟️ Cupom: *${cupom}* (preço já com o cupom)`);
  linhas.push('', `👉 ${link}`, '', `🕒 Preço de ${quando(oferta, cfg)}. Pode mudar.`, `_${AVISO}_`);
  return linhas.join('\n');
}

/** Grupo do WhatsApp: alerta relâmpago, curto. */
function textoWhatsAppGrupo(oferta, link, cfg) {
  const cupom = cupomDe(oferta);
  const linhas = [
    '⚡ *ALERTA RELÂMPAGO* ⚡',
    '',
    `*${truncar(oferta.titulo, 90)}*`,
    `💰 *${formatBRL(oferta.preco)}* ${naLoja(oferta.loja)}`,
    `✅ ${fraseDesconto(oferta)}`,
  ];
  if (cupom) linhas.push(`🎟️ Cupom: *${cupom}*`);
  linhas.push('', `👉 ${link}`, '', `⏳ Pode acabar a qualquer momento (preço de ${quando(oferta, cfg)}).`, `_${AVISO}_`);
  return linhas.join('\n');
}

/** Post do X (sem link: o link vai na 1ª resposta). Respeita 280 caracteres. */
function textoX(oferta, cfg) {
  const pct = Math.floor(Number(oferta.desconto_pct) || 0);
  const linhaDesc = pct >= 1 ? `${pct}% abaixo do menor preço dos últimos 90 dias.` : 'No menor preço dos últimos 90 dias.';
  const cupom = cupomDe(oferta);
  const fixo = [
    '✅ Desconto real',
    '',
    '{T}',
    `${formatBRL(oferta.preco)} ${naLoja(oferta.loja)}. ${linhaDesc}`,
    ...(cupom ? [`Cupom: ${cupom}`] : []),
    '',
    'Link na resposta 👇 #publi',
  ].join('\n');
  const espaco = 280 - (fixo.length - 3);
  return fixo.replace('{T}', truncar(oferta.titulo, Math.max(30, espaco)));
}

function textoXResposta(link) {
  return `🔗 ${link}\n(contém link de afiliado)`;
}

const SELO_TXT = {
  ok: '✅ Desconto real',
  acima: '❌ Acima do menor preço de 90 dias: não publicar',
  sem_ref: '⚠️ Sem referência de 90 dias: informe ref90 (✏️ Editar)',
};

/** Card de aprovação enviado ao admin. */
function cardAprovacao(oferta, cfg, pendencias) {
  const c = cat(cfg, oferta.categoria);
  const ref = oferta.min90 != null ? formatBRL(oferta.min90) : '—';
  const fonte = oferta.ref90_fonte ? ` · fonte: ${escapeHtml(truncar(oferta.ref90_fonte, 80))}` : '';
  const desc = oferta.desconto_pct != null ? ` (${oferta.desconto_pct > 0 ? '−' : '+'}${Math.abs(oferta.desconto_pct).toFixed(1).replace('.', ',')}%)` : '';
  const extra = [];
  if (oferta.comissao_pct) extra.push(`comissão ~${oferta.comissao_pct}%`);
  if (oferta.vendas) extra.push(`${oferta.vendas} vendidos`);
  if (oferta.top) extra.push('⭐ marcada para o Top do Dia');
  if (cupomDe(oferta)) extra.push(`🎟️ cupom ${cupomDe(oferta)}`);

  const linhas = [
    `🆕 <b>Oferta ${escapeHtml(oferta.oferta_id)}</b> · ${c.emoji} ${escapeHtml(c.nome)}${oferta.origem === 'shopee' ? ' · coleta automática' : ''}`,
    '',
    `<b>${escapeHtml(truncar(oferta.titulo, 200))}</b>`,
    `${escapeHtml(nomeLoja(oferta.loja))} · <b>${formatBRL(oferta.preco)}</b>`,
    `Menor 90d: ${ref}${desc}${fonte}`,
    `Histórico próprio: ${oferta.hist_registros || 0} registro(s)${oferta.hist_primeira ? ' desde ' + oferta.hist_primeira : ''}`,
    `Selo: <b>${SELO_TXT[oferta.selo] || oferta.selo}</b>`,
  ];
  if (extra.length) linhas.push(escapeHtml(extra.join(' · ')));
  if (oferta.aviso_card) linhas.push(escapeHtml(oferta.aviso_card)); // origem do preço (💡 Keepa) e erros da Keepa; montado em fluxos.avaliarNovaOferta
  if (pendencias && pendencias.length) linhas.push('', '⚠️ ' + escapeHtml(pendencias.join('\n⚠️ ')));
  linhas.push('', `<a href="${escapeHtml(oferta.url)}">Abrir na loja</a>`);

  const id = oferta.oferta_id;
  const podePublicar = oferta.selo === 'ok' && !(pendencias || []).some((p) => p.startsWith('BLOQUEIO'));
  const teclado = [];
  if (podePublicar) {
    teclado.push([
      { text: '✅ Aprovar', callback_data: `a|${id}` },
      { text: '⚡ Relâmpago', callback_data: `r|${id}` },
    ]);
    teclado.push([{ text: '⭐ Aprovar + Top do Dia', callback_data: `t|${id}` }]);
  }
  teclado.push([
    { text: '✏️ Editar', callback_data: `e|${id}` },
    { text: '❌ Rejeitar', callback_data: `x|${id}` },
  ]);

  return { text: linhas.join('\n'), reply_markup: { inline_keyboard: teclado } };
}

/** Comando /oferta pré-preenchido para o admin copiar e corrigir. */
function comandoEdicao(oferta) {
  const manuais = typeof oferta.links_manuais === 'string' ? safeJson(oferta.links_manuais) : oferta.links_manuais || {};
  const linhas = [
    `/oferta ${oferta.categoria}${oferta.top ? ' top' : ''}`,
    oferta.url,
    oferta.titulo,
    `preço ${String(oferta.preco).replace('.', ',')}`,
    `ref90 ${oferta.ref90 ? String(oferta.ref90).replace('.', ',') : 'VALOR'} ${oferta.ref90_fonte || 'LINK-DA-FONTE'}`,
  ];
  if (oferta.imagem) linhas.push(`img ${oferta.imagem}`);
  for (const [p, u] of Object.entries(manuais)) linhas.push(`${p} ${u}`); // inclui "cupom CODIGO"
  return linhas.join('\n');
}

function safeJson(s) {
  try { return JSON.parse(s) || {}; } catch (e) { return {}; }
}

module.exports = {
  AVISO, fraseDesconto, cupomDe, botaoCompra, textoTelegram, textoWhatsAppCanal, textoWhatsAppGrupo, textoX, textoXResposta,
  cardAprovacao, comandoEdicao,
};
