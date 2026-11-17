'use strict';
// Textos dos posts (Telegram, WhatsApp canal/grupo, X), do card de aprovação e do post encerrado.
// Regras do Jurídico aplicadas aqui (ver docs/kit-operacao/04-conformidade.md):
// · 1ª linha com #publi (CONAR) · selo honesto (0% não é "desconto") · cobertura do histórico ("desde DD/MM")
// · data/hora do preço + aviso de alteração e frete · cupom com limite e validade · frase de Associado da Amazon
// · amazon.mostrar_preco = nao: posts da Amazon sem valor nem %.
const { formatBRL, formatDataHora, formatData, escapeHtml, truncar } = require('./util');
const { nomeLoja, naLoja } = require('./lojas');

const AVISO = 'Contém link de afiliado.';
const AVISO_AMAZON = 'Como Associado da Amazon, ganhamos com compras qualificadas.';
const PUBLI = '#publi';
const CUPOM_AVISO = 'Preço com cupom da loja, sujeito a limite e validade.';
const DIA = 24 * 60 * 60 * 1000;

function cat(cfg, categoria) {
  return (cfg.categorias && cfg.categorias[categoria]) || { nome: categoria, emoji: '🏷️' };
}

/** Cupom informado no /oferta (linha "cupom CODIGO"); fica guardado junto dos links manuais. */
function cupomDe(oferta) {
  if (oferta.cupom) return String(oferta.cupom);
  const m = typeof oferta.links_manuais === 'string' ? safeJson(oferta.links_manuais) : oferta.links_manuais || {};
  return m.cupom ? String(m.cupom) : '';
}

/** Momento em que o preço foi conferido. */
function momentoPreco(oferta) {
  return oferta.preco_em || oferta.data || oferta.ts || new Date();
}

/** "24/11 às 12:30" */
function horaPreco(oferta, cfg) {
  return formatDataHora(momentoPreco(oferta), (cfg && cfg.fuso) || undefined);
}

/** Post da Amazon com amazon.mostrar_preco = nao: sem valor nem %. */
function mostraPreco(oferta, cfg) {
  return !(oferta.loja === 'amazon' && cfg && cfg.amazon && cfg.amazon.mostrar_preco === false);
}

/** Dias cobertos pela referência (min90_dias; ausente = 90). */
function diasCobertos(oferta) {
  const d = Number(oferta.min90_dias);
  return oferta.min90_dias != null && oferta.min90_dias !== '' && Number.isFinite(d) && d >= 0 && d < 90 ? Math.floor(d) : 90;
}

/** "dos últimos 90 dias" ou, com histórico menor, "desde 20/09". */
function periodo(oferta, cfg) {
  const dias = diasCobertos(oferta);
  if (dias >= 90) return 'dos últimos 90 dias';
  const base = new Date(momentoPreco(oferta)).getTime();
  return 'desde ' + formatData(new Date(base - dias * DIA), (cfg && cfg.fuso) || undefined);
}

/**
 * Frase do selo, sempre honesta:
 * ≥1%  → "12% abaixo do menor preço dos últimos 90 dias (R$ 399,90)"
 * 0%   → "igual ao menor preço dos últimos 90 dias" (sem a palavra "desconto")
 * sem preço (Amazon com mostrar_preco = nao) → "no menor preço dos últimos 90 dias"
 * Histórico com menos de 90 dias troca "dos últimos 90 dias" por "desde DD/MM".
 */
function fraseDesconto(oferta, cfg) {
  const per = periodo(oferta, cfg);
  if (!mostraPreco(oferta, cfg)) return `no menor preço ${per}`;
  const bruto = Number(oferta.desconto_pct) || 0;
  const pct = Math.floor(bruto);
  if (pct >= 1) return `${pct}% abaixo do menor preço ${per} (${formatBRL(oferta.min90)})`;
  // Só acontece com selo.tolerancia_pct > 0: o preço passou um pouco do mínimo. Dizemos isso.
  if (bruto < 0 && oferta.min90 != null) return `${Math.ceil(-bruto)}% acima do menor preço ${per} (${formatBRL(oferta.min90)})`;
  return `igual ao menor preço ${per}`;
}

/** Rótulo do selo: "Desconto real" só quando há desconto de verdade (≥ 1%). */
function rotuloSelo(oferta, cfg) {
  return mostraPreco(oferta, cfg) && Math.floor(Number(oferta.desconto_pct) || 0) >= 1 ? 'Desconto real' : 'Preço conferido';
}

/** "Preço e disponibilidade de 24/11 às 12:30, sujeitos a alteração. Frete: confira na loja." */
function avisoPreco(oferta, cfg) {
  return mostraPreco(oferta, cfg)
    ? `Preço e disponibilidade de ${horaPreco(oferta, cfg)}, sujeitos a alteração. Frete: confira na loja.`
    : `Conferido em ${horaPreco(oferta, cfg)}, sujeito a alteração. Frete: confira na loja.`;
}

/** Rodapé: aviso de afiliado (+ frase da Amazon nos posts da Amazon). */
function rodape(oferta) {
  return oferta.loja === 'amazon' ? `${AVISO} ${AVISO_AMAZON}` : AVISO;
}

/** "Ver na Amazon", "Ver no Mercado Livre", "Ver na loja". */
function verNa(loja) {
  return 'Ver ' + naLoja(loja);
}

/** Texto do link de compra: com mostrar_preco = nao, "Veja o preço atual na Amazon". */
function textoLink(oferta, cfg) {
  return mostraPreco(oferta, cfg) ? verNa(oferta.loja) : 'Veja o preço atual ' + naLoja(oferta.loja);
}

/** Linha de identificação (1ª linha do post): "🏠 Casa & Eletro · #publi" ou "⚡ ALERTA DE PREÇO · …". */
function primeiraLinha(oferta, cfg, html) {
  const c = cat(cfg, oferta.categoria);
  const b = (s) => (html ? `<b>${s}</b>` : `*${s}*`);
  const nome = html ? escapeHtml(c.nome) : c.nome;
  return oferta.relampago ? `⚡ ${b('ALERTA DE PREÇO')} · ${c.emoji} ${nome} · ${PUBLI}` : `${c.emoji} ${nome} · ${PUBLI}`;
}

/**
 * Botões embaixo do post no Telegram: 🛒 compra e, com grupo_link configurado, 📣 Chamar amigos
 * (abre o "compartilhar" do Telegram com o link do grupo e um texto curto).
 * cfg é opcional (sem ele, só o botão de compra).
 */
function botaoCompra(oferta, link, cfg) {
  const linhas = [[{ text: `🛒 ${verNa(oferta.loja)}`, url: link }]];
  const grupo = cfg && cfg.telegram && cfg.telegram.grupo_link;
  if (grupo) {
    const titulo = truncar(oferta.titulo, 60);
    const preco = mostraPreco(oferta, cfg)
      ? `por ${formatBRL(oferta.preco)} ${naLoja(oferta.loja)} (preço de ${horaPreco(oferta, cfg)})`
      : `${naLoja(oferta.loja)}, no menor preço ${periodo(oferta, cfg)}`;
    const texto = `Olha essa no ${cfg.marca || 'grupo'}: ${titulo} ${preco}. Entra no grupo, só tem oferta com preço conferido:`;
    linhas.push([{
      text: '📣 Chamar amigos',
      url: `https://t.me/share/url?url=${encodeURIComponent(grupo)}&text=${encodeURIComponent(texto)}`,
    }]);
  }
  return { inline_keyboard: linhas };
}

/** Post do tópico no Telegram (HTML). O cupom vai em <code> para copiar com um toque. */
function textoTelegram(oferta, link, cfg) {
  const cupom = cupomDe(oferta);
  const preco = mostraPreco(oferta, cfg);
  const linhas = [
    primeiraLinha(oferta, cfg, true),
    `<b>${escapeHtml(truncar(oferta.titulo, 180))}</b>`,
    '',
  ];
  if (preco) linhas.push(`💰 <b>${formatBRL(oferta.preco)}</b> ${naLoja(oferta.loja)}`);
  linhas.push(
    `🕒 <i>${escapeHtml(avisoPreco(oferta, cfg))}</i>`,
    `✅ <b>${rotuloSelo(oferta, cfg)}:</b> ${escapeHtml(fraseDesconto(oferta, cfg))}`,
  );
  if (cupom) linhas.push(`🎟️ Cupom: <code>${escapeHtml(cupom)}</code> (toque para copiar)`, `<i>${CUPOM_AVISO}</i>`);
  linhas.push(
    '',
    `👉 <a href="${escapeHtml(link)}">${escapeHtml(textoLink(oferta, cfg))}</a>`,
    `<i>${escapeHtml(rodape(oferta))}</i>`,
  );
  return linhas.join('\n');
}

/** Corpo comum do WhatsApp (formatação *negrito* _itálico_). */
function corpoWhatsApp(oferta, link, cfg, maxTitulo) {
  const cupom = cupomDe(oferta);
  const linhas = [`*${truncar(oferta.titulo, maxTitulo)}*`, ''];
  if (mostraPreco(oferta, cfg)) linhas.push(`💰 *${formatBRL(oferta.preco)}* ${naLoja(oferta.loja)}`);
  linhas.push(`🕒 _${avisoPreco(oferta, cfg)}_`, `✅ ${rotuloSelo(oferta, cfg)}: ${fraseDesconto(oferta, cfg)}`);
  if (cupom) linhas.push(`🎟️ Cupom: *${cupom}*`, `_${CUPOM_AVISO}_`);
  linhas.push('', mostraPreco(oferta, cfg) ? `👉 ${link}` : `👉 ${textoLink(oferta, cfg)}: ${link}`, '', `_${rodape(oferta)}_`);
  return linhas;
}

/** Canal do WhatsApp. */
function textoWhatsAppCanal(oferta, link, cfg) {
  return [primeiraLinha(Object.assign({}, oferta, { relampago: false }), cfg, false), ...corpoWhatsApp(oferta, link, cfg, 120)].join('\n');
}

/** Grupo do WhatsApp: alerta de preço, curto e sem prometer escassez. */
function textoWhatsAppGrupo(oferta, link, cfg) {
  const c = cat(cfg, oferta.categoria);
  return [`⚡ *ALERTA DE PREÇO* · ${c.emoji} ${c.nome} · ${PUBLI}`, ...corpoWhatsApp(oferta, link, cfg, 90)].join('\n');
}

/** Tamanho no X: emoji e caracteres fora do latim contam 2 (aproximação conservadora da regra do X). */
function tamanhoX(s) {
  let n = 0;
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0);
    n += cp <= 4351 || (cp >= 8192 && cp <= 8205) || (cp >= 8208 && cp <= 8223) || (cp >= 8242 && cp <= 8247) ? 1 : 2;
  }
  return n;
}

/** Post do X (sem link: o link vai na 1ª resposta). #publi no começo; respeita 280. */
function textoX(oferta, cfg) {
  const cupom = cupomDe(oferta);
  const preco = mostraPreco(oferta, cfg);
  const frase = fraseDesconto(oferta, cfg);
  const corpo = preco
    ? [`${formatBRL(oferta.preco)} ${naLoja(oferta.loja)}`, `✅ ${frase.charAt(0).toUpperCase()}${frase.slice(1)}`]
    : [`✅ ${frase.charAt(0).toUpperCase()}${frase.slice(1)} ${naLoja(oferta.loja)}`];
  const fimX = preco ? 'Link na resposta 👇' : `${textoLink(oferta, cfg)}: link na resposta 👇`;
  const cupomLinha = cupom ? [`🎟️ Cupom ${cupom}: ${CUPOM_AVISO.charAt(0).toLowerCase()}${CUPOM_AVISO.slice(1, -1)}`] : [];
  const hora = horaPreco(oferta, cfg);
  // Do aviso mais completo ao mais curto: usa o primeiro que deixa espaço para o título.
  const avisos = preco
    ? [avisoPreco(oferta, cfg), `Preço de ${hora}, sujeito a alteração.`]
    : [avisoPreco(oferta, cfg), `Conferido em ${hora}, sujeito a alteração.`];
  const montar = (aviso, cup) => [`${PUBLI} · {T}`, '', ...corpo, ...cup, aviso, '', fimX].join('\n');
  const tentativas = [];
  for (const a of avisos) tentativas.push(montar(a, cupomLinha));
  if (cupom) tentativas.push(montar(avisos[avisos.length - 1], [`🎟️ Cupom ${cupom} (da loja; tem limite e validade)`]));
  for (const t of tentativas) {
    const espaco = 280 - tamanhoX(t.replace('{T}', ''));
    if (espaco >= 40 || t === tentativas[tentativas.length - 1]) {
      let titulo = truncar(oferta.titulo, Math.max(10, espaco));
      while (tamanhoX(t.replace('{T}', titulo)) > 280 && titulo.length > 10) titulo = truncar(oferta.titulo, titulo.length - 1);
      return t.replace('{T}', titulo);
    }
  }
  return '';
}

/** 1ª resposta do X, com o link. oferta é opcional (sem ela, a loja é deduzida pelo link). */
function textoXResposta(link, oferta) {
  const amazon = oferta ? oferta.loja === 'amazon' : /^https?:\/\/([\w-]+\.)*(amazon\.com\.br|amzn\.to)\//i.test(String(link));
  return `🔗 ${link}\n${PUBLI} · Contém link de afiliado.${amazon ? ' ' + AVISO_AMAZON : ''}`;
}

/**
 * Post encerrado (o admin encerra quando o preço muda): título e preço riscados, sem link de compra.
 * quando: Date, timestamp ou ISO do encerramento (padrão: agora). Use com editMessageText e reply_markup vazio.
 */
function textoEncerrado(oferta, cfg, quando) {
  const fuso = (cfg && cfg.fuso) || undefined;
  const fim = quando == null ? new Date() : new Date(quando);
  const fimDH = formatDataHora(fim, fuso);
  const mesmoDia = formatData(fim, fuso) === formatData(momentoPreco(oferta), fuso);
  const hora = mesmoDia ? 'às ' + fimDH.split(' às ')[1] : 'em ' + fimDH;
  const c = cat(cfg, oferta.categoria);
  const linhas = [
    `⛔ <b>Oferta encerrada ${hora}</b> · o preço mudou`,
    `<s>${escapeHtml(truncar(oferta.titulo, 180))}</s>`,
  ];
  if (mostraPreco(oferta, cfg)) linhas.push(`<s>${formatBRL(oferta.preco)} ${naLoja(oferta.loja)}</s>`);
  linhas.push(
    '',
    `<i>Publicada com o preço de ${horaPreco(oferta, cfg)}. Link de compra removido.</i>`,
    `🔔 Ative as notificações de ${c.emoji} ${escapeHtml(c.nome)} para pegar a próxima.`,
  );
  return linhas.join('\n');
}

const SELO_TXT = {
  ok: '✅ Desconto real',
  acima: '❌ Acima do menor preço de 90 dias: não publicar',
  sem_ref: '⚠️ Sem referência de 90 dias: informe ref90 (✏️ Editar)',
};

const ORIGEM_TXT = { keepa: 'Keepa', historico: 'histórico próprio', manual: 'manual (ref90)' };

/** De onde veio o menor preço de 90 dias (para o card; o post público nunca cita a Keepa). */
function origemMin90(oferta) {
  if (oferta.min90_origem) return ORIGEM_TXT[oferta.min90_origem] || String(oferta.min90_origem);
  if (oferta.min90 == null) return '';
  if (oferta.ref90 != null && oferta.ref90 !== '' && Number(oferta.ref90) === Number(oferta.min90)) return ORIGEM_TXT.manual;
  return ORIGEM_TXT.historico;
}

/** Card de aprovação enviado ao admin. */
function cardAprovacao(oferta, cfg, pendencias) {
  const c = cat(cfg, oferta.categoria);
  const ref = oferta.min90 != null ? formatBRL(oferta.min90) : '—';
  const origem = origemMin90(oferta);
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
    `Menor 90d: ${ref}${desc}${origem ? ' · origem: ' + escapeHtml(origem) : ''}${fonte}`,
  ];
  if (diasCobertos(oferta) < 90) linhas.push(`Cobertura: ${diasCobertos(oferta)} dias (o post diz "menor preço ${periodo(oferta, cfg)}")`);
  linhas.push(
    `Histórico próprio: ${oferta.hist_registros || 0} registro(s)${oferta.hist_primeira ? ' desde ' + oferta.hist_primeira : ''}`,
    `Selo: <b>${SELO_TXT[oferta.selo] || oferta.selo}</b>`,
  );
  if (oferta.selo === 'ok') linhas.push(`No post: <i>${rotuloSelo(oferta, cfg)}: ${escapeHtml(fraseDesconto(oferta, cfg))}</i>`);
  if (!mostraPreco(oferta, cfg)) linhas.push('Post sem preço nem % (amazon.mostrar_preco = nao)');
  if (extra.length) linhas.push(escapeHtml(extra.join(' · ')));
  if (oferta.aviso_card) linhas.push(escapeHtml(oferta.aviso_card)); // origem do preço (💡 Keepa) e erros da Keepa; montado em fluxos.avaliarNovaOferta
  if (pendencias && pendencias.length) linhas.push('', '⚠️ ' + escapeHtml(pendencias.join('\n⚠️ ')));
  linhas.push('', `<a href="${escapeHtml(oferta.url)}">Abrir na loja</a>`);
  // Histórico grátis para conferir o ref90 à mão (depois é só responder ao card com o valor).
  const asin = oferta.loja === 'amazon' && (String(oferta.produto_id || '').match(/^amz_([A-Z0-9]{10})$/) || [])[1];
  if (asin && oferta.min90_origem !== 'keepa') {
    linhas.push(`📈 <a href="https://keepa.com/#!product/12-${asin}">Histórico de 90 dias grátis (gráfico da Keepa)</a>`);
  }
  if (oferta.selo === 'sem_ref') {
    const q = encodeURIComponent(truncar(oferta.titulo, 100));
    linhas.push(`🔎 <a href="${escapeHtml(`https://www.google.com/search?tbm=shop&q=${q}`)}">Google Shopping</a> · <a href="${escapeHtml(`https://www.buscape.com.br/search?q=${q}`)}">Buscapé (histórico)</a>`);
    linhas.push('↩️ Achou o menor preço? Responda a este card com o valor, ex.: 199,90');
  }

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
  AVISO, AVISO_AMAZON, fraseDesconto, cupomDe, botaoCompra, textoTelegram, textoWhatsAppCanal, textoWhatsAppGrupo, textoX, textoXResposta,
  textoEncerrado, tamanhoX, cardAprovacao, comandoEdicao,
};
