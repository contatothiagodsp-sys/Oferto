'use strict';
// Textos dos posts (Telegram, WhatsApp canal/grupo, X), do card de aprovação e do post encerrado.
// Regras do Jurídico aplicadas aqui (ver docs/kit-operacao/04-conformidade.md):
// · 1ª linha com #publi (CONAR) · selo honesto (0% não é "desconto") · cobertura do histórico ("desde DD/MM")
// · data/hora do preço + aviso de alteração e frete · cupom com limite e validade · frase de Associado da Amazon
// · amazon.mostrar_preco = nao: posts da Amazon sem valor nem %.
const { formatBRL, formatDataHora, formatData, escapeHtml, truncar } = require('./util');
const { nomeLoja, naLoja } = require('./lojas');
const { urlAbaCuponsAfiliado } = require('./links');
const { ganchoOferta, enxugarTituloOferta, indiceDeterministico, resumoEconomia, precoDeLoja, calcularPrecoUnitario, urlEnviarWhatsApp } = require('./copy');

const AVISO = 'Contém link de afiliado.';
const AVISO_AMAZON = 'Como Associado da Amazon, ganhamos com compras qualificadas.';
const PUBLI = '#publi';
const CUPOM_AVISO = 'Preço com cupom da loja, sujeito a limite e validade.';
const DIA = 24 * 60 * 60 * 1000;

function cat(cfg, categoria) {
  return (cfg.categorias && cfg.categorias[categoria]) || { nome: categoria, emoji: '🏷️' };
}

function lerManuais(oferta) {
  if (!oferta || !oferta.links_manuais) return {};
  return typeof oferta.links_manuais === 'string' ? safeJson(oferta.links_manuais) : oferta.links_manuais || {};
}

/** Cupom informado no /oferta ou extraído do texto/página; fica guardado junto dos links manuais. */
function cupomDe(oferta) {
  if (oferta.cupom) return String(oferta.cupom);
  const m = lerManuais(oferta);
  return m.cupom ? String(m.cupom) : '';
}

function cupomAutoDe(oferta) {
  if (oferta.cupom_auto) return String(oferta.cupom_auto);
  const m = lerManuais(oferta);
  return m.cupom_auto ? String(m.cupom_auto) : '';
}

function parcelamentoDe(oferta) {
  if (oferta.parcelamento) return String(oferta.parcelamento);
  const m = lerManuais(oferta);
  return m.parcelamento ? String(m.parcelamento) : '';
}

function pixDe(oferta) {
  if (!oferta) return false;
  if (oferta.pix) return true;
  const m = lerManuais(oferta);
  return !!m.pix;
}

function emAltaDe(oferta) {
  if (!oferta) return '';
  if (oferta.em_alta) return String(oferta.em_alta);
  const m = lerManuais(oferta);
  return m.em_alta ? String(m.em_alta) : '';
}

function atualizacaoDe(oferta) {
  if (!oferta) return null;
  const m = lerManuais(oferta);
  const repostDe = oferta.repost_de || m.repost_de || '';
  if (!repostDe) return null;
  const precoAntRaw = oferta.preco_anterior != null ? oferta.preco_anterior : m.preco_anterior;
  const precoAnt = precoAntRaw != null && precoAntRaw !== '' && Number.isFinite(Number(precoAntRaw)) ? Number(precoAntRaw) : null;
  return {
    repost_de: String(repostDe),
    preco_anterior: precoAnt,
    motivo_repost: String(oferta.motivo_repost || m.motivo_repost || 'baixou'),
  };
}

function linhaAtualizacao(oferta, cfg, html) {
  const at = atualizacaoDe(oferta);
  if (!at) return '';
  const preco = mostraPreco(oferta, cfg);
  const b = (s) => (html ? `<b>${s}</b>` : `*${s}*`);
  const esc = (s) => (html ? escapeHtml(s) : String(s));
  const temAnt = preco && at.preco_anterior != null && Number(at.preco_anterior) > Number(oferta.preco);
  const dif = temAnt ? ` (estava ${esc(formatBRL(at.preco_anterior))} no post anterior)` : '';
  if (at.motivo_repost === 'baixou_cupom') {
    if (!preco) return `🚨 ${b('ATUALIZAÇÃO: ENTROU CUPOM NOVO NESSA OFERTA!')}`;
    return `🚨 ${b('ATUALIZAÇÃO: BAIXOU AINDA MAIS + CUPOM!')}${dif}`;
  }
  if (at.motivo_repost === 'cupom') {
    return `🎟️ ${b('ATUALIZAÇÃO: ENTROU CUPOM NOVO NESSA OFERTA!')}`;
  }
  return `📉 ${b('ATUALIZAÇÃO: O PREÇO BAIXOU AINDA MAIS!')}${dif}`;
}

function precoSemCupomDe(oferta) {
  if (oferta.preco_sem_cupom != null && Number.isFinite(Number(oferta.preco_sem_cupom))) return Number(oferta.preco_sem_cupom);
  const m = lerManuais(oferta);
  return m.preco_sem_cupom != null && Number.isFinite(Number(m.preco_sem_cupom)) ? Number(m.preco_sem_cupom) : null;
}

function precoDeBrutoDe(oferta) {
  if (oferta.preco_de != null && Number.isFinite(Number(oferta.preco_de))) return Number(oferta.preco_de);
  const m = lerManuais(oferta);
  return m.preco_de != null && Number.isFinite(Number(m.preco_de)) ? Number(m.preco_de) : null;
}

function temRef90(oferta) {
  return !!(oferta && oferta.min90 != null && oferta.min90 !== '' && Number.isFinite(Number(oferta.min90)));
}

/** Oferta liberada pelo critério de preço: selo ok, cupom de loja, ou sem_ref quando veio por link direto ou selo.exigir_ref90 = nao. */
function permitePublicarSelo(oferta, cfg) {
  if (!oferta) return false;
  const m = lerManuais(oferta);
  if (m.eh_cupom_loja) return true;
  if (oferta.selo === 'ok') return true;
  if (oferta.selo === 'sem_ref') {
    return !!(m.modo_link || (cfg && cfg.selo && cfg.selo.exigir_ref90 === false));
  }
  return false;
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

const CTAS_LINK = [
  'Garantir',
  'Ver oferta',
  'Aproveitar',
  'Conferir',
  'Pegar',
  'Acessar oferta',
];

/** Texto do link de compra: com mostrar_preco = nao, "Veja o preço atual na Amazon". */
function textoLink(oferta, cfg) {
  const m = lerManuais(oferta);
  if (m.eh_cupom_loja) return 'Resgatar na Aba de Cupons ' + naLoja(oferta.loja);
  if (!mostraPreco(oferta, cfg)) return 'Veja o preço atual ' + naLoja(oferta.loja);
  const idx = indiceDeterministico(oferta.produto_id || oferta.oferta_id || oferta.titulo || 'x', CTAS_LINK.length);
  return `${CTAS_LINK[idx]} ${naLoja(oferta.loja)}`;
}

/** Linha de identificação (1ª linha do post): "🏠 Casa & Eletro · 🔥 EM ALTA · #publi" ou "⚡ ALERTA DE PREÇO · …". */
function primeiraLinha(oferta, cfg, html, gancho) {
  const c = cat(cfg, oferta.categoria);
  const b = (s) => (html ? `<b>${s}</b>` : `*${s}*`);
  const nome = html ? escapeHtml(c.nome) : c.nome;
  if (oferta.relampago) return `⚡ ${b('ALERTA DE PREÇO')} · ${c.emoji} ${nome} · ${PUBLI}`;
  if (html && gancho) return `${c.emoji} ${nome} · <b>${escapeHtml(gancho)}</b> · ${PUBLI}`;
  return `${c.emoji} ${nome} · ${PUBLI}`;
}

/**
 * Botões embaixo do post no Telegram: 🛒 compra e, com grupo_link configurado, 📣 Chamar amigos
 * (abre o "compartilhar" do Telegram com o link do grupo e um texto curto).
 */
function temResgatePrevio(oferta, cupom) {
  const m = lerManuais(oferta);
  const cod = cupom != null ? cupom : cupomDe(oferta);
  return !!(m.exige_resgate_previo || /^FULL\d{4}$/i.test(String(cod || '').trim()));
}

function botaoCompra(oferta, link, cfg) {
  const mCup = lerManuais(oferta);
  const cupom = cupomDe(oferta);
  const cupomAuto = cupomAutoDe(oferta);
  const resgatePrevio = temResgatePrevio(oferta, cupom);
  const textoBtn = mCup.eh_cupom_loja
    ? `🎟️ Resgatar Cupons ${naLoja(oferta.loja)}`
    : `🛒 ${verNa(oferta.loja)}`;
  const linhas = [[{ text: textoBtn, url: link }]];
  if (!mCup.eh_cupom_loja && (cupom || cupomAuto) && (oferta.loja === 'ml' || oferta.loja === 'shopee' || resgatePrevio)) {
    const urlAba = urlAbaCuponsAfiliado(oferta.loja, cfg);
    if (urlAba) {
      linhas.push([{ text: `🎟️ Resgatar Cupons ${naLoja(oferta.loja)}`, url: urlAba }]);
    }
  }
  const tg = (cfg && cfg.telegram) || {};
  const grupo = tg.grupo_link;
  if (grupo) {
    const titulo = truncar(enxugarTituloOferta(oferta.titulo, 60), 60);
    const preco = mCup.eh_cupom_loja
      ? `cupons ${naLoja(oferta.loja)}`
      : mostraPreco(oferta, cfg)
        ? `por ${formatBRL(oferta.preco)} ${naLoja(oferta.loja)} (preço de ${horaPreco(oferta, cfg)})`
        : `${naLoja(oferta.loja)}, no menor preço ${periodo(oferta, cfg)}`;
    const texto = `Olha essa no ${cfg.marca || 'grupo'}: ${titulo} ${preco}. Entra no grupo, só tem oferta com preço conferido:`;
    linhas.push([{
      text: '📣 Chamar amigos',
      url: `https://t.me/share/url?url=${encodeURIComponent(grupo)}&text=${encodeURIComponent(texto)}`,
    }]);
  }
  const qtdCanais = Object.keys(tg.canais || {}).length;
  if (!tg.grupo_id && qtdCanais >= 2 && tg.bot_grupo_username) {
    linhas.push([{
      text: `🌐 Outros canais ${cfg.marca || 'Ofertô'}`,
      url: `https://t.me/${tg.bot_grupo_username}?start=canais`,
    }]);
  }
  if (cfg && cfg.post && cfg.post.botoes_extras) {
    const extras = [];
    if (tg.bot_grupo_username) {
      extras.push({ text: '🔔 Criar alerta', url: `https://t.me/${tg.bot_grupo_username}?start=alerta` });
    }
    const marca = cfg.marca || 'Ofertô';
    const refConv = tg.bot_grupo_username ? `\nEntra no ${marca}: https://t.me/${tg.bot_grupo_username}?start=canais` : '';
    const zapTxt = mCup.eh_cupom_loja
      ? `🎟️ Cupons ${naLoja(oferta.loja)} no ${marca}: ${truncar(oferta.titulo, 70)}\n👉 ${link}${refConv}`
      : mostraPreco(oferta, cfg)
        ? `🔥 Olha essa oferta no ${marca}: ${truncar(enxugarTituloOferta(oferta.titulo, 70), 70)} por ${formatBRL(oferta.preco)} ${naLoja(oferta.loja)}\n👉 ${link}${refConv}`
        : `🔎 Olha essa oferta conferida no ${marca}: ${truncar(enxugarTituloOferta(oferta.titulo, 70), 70)} ${naLoja(oferta.loja)}\n👉 ${link}${refConv}`;
    const urlZap = urlEnviarWhatsApp(zapTxt);
    if (urlZap) extras.push({ text: '📲 Mandar no Zap', url: urlZap });
    if (extras.length) linhas.push(extras);
  }
  return { inline_keyboard: linhas };
}

function blocoPreco(oferta, econ, opts) {
  const { html, cupom, cupomAuto, parcelamento, pix } = opts;
  const stk = (s) => (html ? `<s>${s}</s>` : `~${s}~`);
  const b = (s) => (html ? `<b>${s}</b>` : `*${s}*`);
  const it = (s) => (html ? `<i>${s}</i>` : `_${s}_`);
  const esc = (s) => (html ? escapeHtml(s) : String(s));
  const pAtual = Number(oferta.preco);
  const pSemCup = precoSemCupomDe(oferta);
  const pDeBruto = precoDeBrutoDe(oferta);
  const tagPix = pix ? ' · 💠 PIX' : '';
  const variante = indiceDeterministico(oferta.produto_id || oferta.oferta_id || oferta.titulo || 'x', 3);
  const parcCurto = parcelamento ? parcelamento.replace(/^Em\s+at[ée]\s+/i, '') : '';
  const parcInline = html && parcCurto ? ` · 💳 ${b(esc(parcCurto))}` : '';

  const linhas = [];
  if ((cupom || cupomAuto) && pDeBruto && pSemCup && pDeBruto > pSemCup && pSemCup > pAtual) {
    const det = econ && econ.economia > 0 ? ` ${it(html ? `(-${econ.pct}%)` : `(-${econ.pct}% · econ. ${econ.economia_fmt})`)}` : '';
    if (html) {
      linhas.push(`💸 De ${stk(formatBRL(pDeBruto))} (no anúncio ${formatBRL(pSemCup)}) → 💰 ${b(formatBRL(pAtual))} ${naLoja(oferta.loja)}${tagPix}${det}${parcInline}`);
    } else {
      linhas.push(`💸 De ${stk(formatBRL(pDeBruto))} → no anúncio ${b(formatBRL(pSemCup))} + 🎟️ Cupom ${cupom ? `*${cupom}*` : `(${esc(cupomAuto)})`} =`);
      linhas.push(`💰 ${b(formatBRL(pAtual))} ${naLoja(oferta.loja)}${tagPix}${det}`);
    }
  } else if ((cupom || cupomAuto) && econ && econ.tipo === 'loja') {
    if (html) {
      linhas.push(`💸 De ${stk(econ.de_fmt)} → 💰 ${b(formatBRL(pAtual))} ${naLoja(oferta.loja)}${tagPix} ${it(`(-${econ.pct}% com cupom)`)}${parcInline}`);
    } else {
      const rotuloCupom = cupom ? '🏷️ Produto:' : '🏷️ No anúncio:';
      const prefixo = cupom ? '' : 'Cupom ativo ';
      const etiquetaCupom = cupom ? `*${cupom}*` : `(${esc(cupomAuto)})`;
      linhas.push(`${rotuloCupom} ${stk(econ.de_fmt)} + 🎟️ ${cupom ? 'Cupom ' : prefixo}${etiquetaCupom} =`);
      linhas.push(`💰 ${b(formatBRL(pAtual))} ${naLoja(oferta.loja)}${tagPix} ${it(`(economia de ${econ.economia_fmt} · -${econ.pct}%)`)}`);
    }
  } else if (econ && econ.tipo === 'loja') {
    if (variante === 0) {
      linhas.push(`💸 De ${stk(econ.de_fmt)} → 💰 ${b(formatBRL(pAtual))} ${naLoja(oferta.loja)}${tagPix} ${it(html ? `(-${econ.pct}%)` : `(-${econ.pct}% · econ. ${econ.economia_fmt})`)}${parcInline}`);
    } else if (variante === 1) {
      linhas.push(`💰 ${b(formatBRL(pAtual))} ${naLoja(oferta.loja)}${tagPix} ${it(`(antes ${stk(econ.de_fmt)} · -${econ.pct}%)`)}${parcInline}`);
    } else {
      linhas.push(`📉 ${b(formatBRL(pAtual))} ${naLoja(oferta.loja)}${tagPix} · ${stk(econ.de_fmt)} ${it(html ? `(-${econ.pct}% · economiza ${econ.economia_fmt})` : `(economiza ${econ.economia_fmt})`)}${parcInline}`);
    }
  } else if (econ && econ.tipo === 'min90' && econ.economia >= 5) {
    linhas.push(`💰 ${b(formatBRL(pAtual))} ${naLoja(oferta.loja)}${tagPix} ${it(html ? `(-${econ.pct}%)` : `(economia de ${econ.economia_fmt})`)}${parcInline}`);
  } else {
    linhas.push(`💰 ${b(formatBRL(pAtual))} ${naLoja(oferta.loja)}${tagPix}${parcInline}`);
  }
  const unit = calcularPrecoUnitario(oferta.titulo, pAtual);
  if (unit) linhas.push(`🧮 ${it(esc(unit))}`);
  if (html && opts.auditorAtivo !== false && pAtual > 0 && linhas.length) {
    const man = lerManuais(oferta);
    const refMerc = Number(man.ref_mercado);
    if (refMerc > 0 && refMerc >= pAtual * 1.12 && (refMerc - pAtual) >= 15) {
      const lojaConc = man.ref_mercado_loja && man.ref_mercado_loja !== 'mercado'
        && man.ref_mercado_loja.toLowerCase() !== nomeLoja(oferta.loja).toLowerCase()
        ? ` · ${escapeHtml(man.ref_mercado_loja)}`
        : ' no mercado';
      const semTags = linhas[0].replace(/<[^>]+>/g, '');
      if (semTags.length <= 105) {
        linhas[0] += ` · 📊 <i>(${formatBRL(refMerc)}${lojaConc})</i>`;
      }
    }
  }
  if (!html && parcelamento) linhas.push(`💳 ${b(esc(parcelamento))}`);
  return linhas;
}

function rotuloEscopoCupom(oferta, cfg) {
  const m = lerManuais(oferta);
  if (m.escopo_cupom === 'geral') return 'todo o site (verifique regras na loja)';
  const cats = Array.isArray(m.categorias_cupom) ? m.categorias_cupom : [];
  if (!cats.length) return 'itens selecionados na loja';
  const nomes = cats.map((c) => {
    const info = (cfg && cfg.categorias && cfg.categorias[c]) || {};
    return info.emoji ? `${info.emoji} ${info.nome || c}` : (info.nome || c);
  });
  return nomes.join(' · ');
}

function textoTelegramCupomLoja(oferta, link, cfg) {
  const m = lerManuais(oferta);
  const cupom = cupomDe(oferta);
  const horario = m.horario_lote ? ` · ⏰ ${escapeHtml(m.horario_lote)}` : '';
  const linAt = linhaAtualizacao(oferta, cfg, true);
  const titulo = enxugarTituloOferta(oferta.titulo || `Cupons ${nomeLoja(oferta.loja)}`, 105);
  const escopoTxt = rotuloEscopoCupom(oferta, cfg);
  const resgatePrevio = temResgatePrevio(oferta, cupom);
  const dicaResgate = resgatePrevio
    ? `✅ <b>Funcionando pra quem resgatou!</b> <a href="${escapeHtml(link)}">Resgate os próximos na aba de cupons</a>`
    : `💡 <b><a href="${escapeHtml(link)}">Resgate agora na aba de cupons</a></b> (vários só liberam pra quem salvou antes)`;
  const linhas = [
    `🎟️ <b>CUPONS ${escapeHtml(nomeLoja(oferta.loja).toUpperCase())}</b>${horario} · ${PUBLI}`,
  ];
  if (linAt) linhas.push(linAt);
  linhas.push(`<b><a href="${escapeHtml(link)}">${escapeHtml(titulo)}</a></b>`);
  if (cupom) {
    linhas.push(`🏷️ Cupom: <code>${escapeHtml(cupom)}</code> (toque p/ copiar) · ✅ ${escapeHtml(escopoTxt)}`);
  } else if (m.cupom_auto) {
    linhas.push(`🏷️ <b>${escapeHtml(m.cupom_auto)}</b> · ✅ ${escapeHtml(escopoTxt)}`);
  } else {
    linhas.push(`✅ <b>Válido em:</b> ${escapeHtml(escopoTxt)}`);
  }
  linhas.push(
    dicaResgate,
    `🕒 <i>${escapeHtml(avisoPreco(oferta, cfg))} · ${CUPOM_AVISO} · ${escapeHtml(rodape(oferta))}</i>`,
  );
  return linhas.join('\n');
}

function corpoWhatsAppCupomLoja(oferta, link, cfg, maxTitulo) {
  const m = lerManuais(oferta);
  const cupom = cupomDe(oferta);
  const horario = m.horario_lote ? ` · ⏰ ${m.horario_lote}` : '';
  const titulo = enxugarTituloOferta(oferta.titulo || `Cupons ${nomeLoja(oferta.loja)}`, maxTitulo || 110);
  const escopoTxt = rotuloEscopoCupom(oferta, cfg);
  const resgatePrevio = temResgatePrevio(oferta, cupom);
  const dicaResgate = resgatePrevio
    ? '✅ *Cupom funcionando pra quem resgatou!* Teste no checkout e já salve os próximos lotes na aba de cupons.'
    : '💡 *Resgate agora na aba de cupons!* Salve na conta mesmo pra usar depois — vários cupons só funcionam pra quem resgatou antes.';
  const linhas = [
    `🎟️ *CUPONS ${nomeLoja(oferta.loja).toUpperCase()}*${horario} · ${PUBLI}`,
    `*${titulo}*`,
  ];
  if (cupom) linhas.push(`🏷️ Cupom: *${cupom}*`, `_${CUPOM_AVISO}_`);
  else if (m.cupom_auto) linhas.push(`🏷️ *Benefício:* ${m.cupom_auto}`, `_${CUPOM_AVISO}_`);
  linhas.push(
    dicaResgate,
    `✅ Válido em: ${escopoTxt}`,
    `👉 *Resgatar na Aba de Cupons ${naLoja(oferta.loja)}:* ${link}`,
    `🕒 _${avisoPreco(oferta, cfg)}_`,
    `_${rodape(oferta)}_`,
  );
  return linhas;
}

/** Post do tópico no Telegram (HTML). O cupom vai em <code> para copiar com um toque. */
function textoTelegram(oferta, link, cfg) {
  const mCup = lerManuais(oferta);
  if (mCup.eh_cupom_loja) return textoTelegramCupomLoja(oferta, link, cfg);
  const cupom = cupomDe(oferta);
  const cupomAuto = cupomAutoDe(oferta);
  const parcelamento = parcelamentoDe(oferta);
  const pix = pixDe(oferta);
  const preco = mostraPreco(oferta, cfg);
  const linAt = linhaAtualizacao(oferta, cfg, true);
  const gancho = linAt ? '' : ganchoOferta(oferta, cfg, { mostrarPreco: preco, cupom: cupom || cupomAuto });
  const econ = resumoEconomia(oferta, preco);
  const tituloCurto = enxugarTituloOferta(oferta.titulo, 105);
  const resgatePrevio = temResgatePrevio(oferta, cupom);
  const urlAba = (cupom || cupomAuto) && (oferta.loja === 'ml' || oferta.loja === 'shopee' || resgatePrevio)
    ? urlAbaCuponsAfiliado(oferta.loja, cfg)
    : '';

  const linhas = [primeiraLinha(oferta, cfg, true, gancho)];
  if (linAt) linhas.push(linAt);
  linhas.push(preco ? `<b><a href="${escapeHtml(link)}">${escapeHtml(tituloCurto)}</a></b>` : `<b>${escapeHtml(tituloCurto)}</b>`);

  if (preco) {
    const auditorAtivo = !(cfg && cfg.agentes && cfg.agentes.auditor === false);
    linhas.push(...blocoPreco(oferta, econ, { html: true, cupom, cupomAuto, parcelamento, pix, auditorAtivo }));
  }
  if (temRef90(oferta) || !preco) {
    linhas.push(`✅ <b>${rotuloSelo(oferta, cfg)}:</b> ${escapeHtml(fraseDesconto(oferta, cfg))}`);
  }
  if (cupom) {
    if (resgatePrevio) {
      linhas.push(`🎟️ Cupom: <code>${escapeHtml(cupom)}</code> · ✅ <b>Funcionando pra quem resgatou!</b>${urlAba ? ` (<a href="${escapeHtml(urlAba)}">resgate os próximos na aba de cupons</a>)` : ''}`);
    } else if (mCup.exige_resgate_pagina) {
      linhas.push(`🎟️ <b>Pegue o cupom no anúncio:</b> <code>${escapeHtml(cupom)}</code>${mCup.cupom_prime ? ' <i>(Prime)</i>' : ''}`);
    } else if ((oferta.loja === 'ml' || oferta.loja === 'shopee') && urlAba) {
      linhas.push(`🎟️ Pegue na <a href="${escapeHtml(urlAba)}">aba de cupons</a> ou use <code>${escapeHtml(cupom)}</code>`);
    } else {
      linhas.push(`🎟️ Cupom: <code>${escapeHtml(cupom)}</code> (toque p/ copiar)`);
    }
  } else if (cupomAuto && preco) {
    linhas.push(`🎟️ <b>Ative no anúncio:</b> ${escapeHtml(cupomAuto)}${urlAba ? ` (<a href="${escapeHtml(urlAba)}">aba de cupons</a>)` : ''}`);
  }
  if (!preco) {
    linhas.push(`👉 <b><a href="${escapeHtml(link)}">${escapeHtml(textoLink(oferta, cfg))}</a></b>`);
  }
  linhas.push(
    `🕒 <i>${escapeHtml(avisoPreco(oferta, cfg))}${cupom || cupomAuto ? ` · ${CUPOM_AVISO}` : ''} · ${escapeHtml(rodape(oferta))}</i>`,
  );
  return linhas.join('\n');
}

/** Corpo comum do WhatsApp (formatação *negrito* _itálico_). */
function corpoWhatsApp(oferta, link, cfg, maxTitulo) {
  const mCup = lerManuais(oferta);
  if (mCup.eh_cupom_loja) return corpoWhatsAppCupomLoja(oferta, link, cfg, maxTitulo);
  const cupom = cupomDe(oferta);
  const cupomAuto = cupomAutoDe(oferta);
  const parcelamento = parcelamentoDe(oferta);
  const pix = pixDe(oferta);
  const preco = mostraPreco(oferta, cfg);
  const linAt = linhaAtualizacao(oferta, cfg, false);
  const gancho = linAt ? '' : ganchoOferta(oferta, cfg, { mostrarPreco: preco, cupom: cupom || cupomAuto });
  const econ = resumoEconomia(oferta, preco);
  const tituloCurto = enxugarTituloOferta(oferta.titulo, maxTitulo || 110);
  const resgatePrevio = temResgatePrevio(oferta, cupom);
  const urlAba = (cupom || cupomAuto) && (oferta.loja === 'ml' || oferta.loja === 'shopee' || resgatePrevio)
    ? urlAbaCuponsAfiliado(oferta.loja, cfg)
    : '';

  const linhas = [];
  if (linAt) linhas.push(linAt);
  else if (gancho) linhas.push(`*${gancho}*`);
  linhas.push(`*${tituloCurto}*`);

  if (preco) {
    linhas.push(...blocoPreco(oferta, econ, { html: false, cupom, cupomAuto, parcelamento, pix }));
  }
  linhas.push(`🕒 _${avisoPreco(oferta, cfg)}_`);
  if (temRef90(oferta) || !preco) {
    linhas.push(`✅ ${rotuloSelo(oferta, cfg)}: ${fraseDesconto(oferta, cfg)}`);
  }
  if (cupom) {
    linhas.push(`🎟️ Cupom: *${cupom}*`, `_${CUPOM_AVISO}_`);
    if (resgatePrevio && urlAba) {
      linhas.push(`✅ _Cupom funcionando pra quem resgatou! Garanta os próximos na aba de cupons: ${urlAba}_`);
    } else if (resgatePrevio) {
      linhas.push('✅ _Cupom funcionando pra quem resgatou previamente na conta!_');
    } else if ((oferta.loja === 'ml' || oferta.loja === 'shopee') && urlAba) {
      linhas.push(`💡 _Resgate/ative também na aba de cupons ${naLoja(oferta.loja)}: ${urlAba}_`);
    }
  } else if (cupomAuto && preco) {
    linhas.push(`🎟️ *Cupom no anúncio:* ${cupomAuto} (ative na loja)`, `_${CUPOM_AVISO}_`);
  }
  linhas.push(preco ? `👉 *${textoLink(oferta, cfg)}:* ${link}` : `👉 ${textoLink(oferta, cfg)}: ${link}`, `_${rodape(oferta)}_`);
  return linhas;
}

/** Canal do WhatsApp. */
function textoWhatsAppCanal(oferta, link, cfg) {
  if (lerManuais(oferta).eh_cupom_loja) return corpoWhatsAppCupomLoja(oferta, link, cfg, 115).join('\n');
  return [primeiraLinha(Object.assign({}, oferta, { relampago: false }), cfg, false), ...corpoWhatsApp(oferta, link, cfg, 115)].join('\n');
}

/** Grupo do WhatsApp: alerta de preço atrativo, curto e sem prometer escassez falsa. */
function textoWhatsAppGrupo(oferta, link, cfg) {
  if (lerManuais(oferta).eh_cupom_loja) return corpoWhatsAppCupomLoja(oferta, link, cfg, 90).join('\n');
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
  const mCup = lerManuais(oferta);
  const cupom = cupomDe(oferta);
  if (mCup.eh_cupom_loja) {
    const tit = enxugarTituloOferta(oferta.titulo || `Cupons ${nomeLoja(oferta.loja)}`, 95);
    const cod = cupom ? `🎟️ Cupom: ${cupom}` : `🎟️ Cupons ${naLoja(oferta.loja)}`;
    return `${PUBLI} · ${tit}\n${cod}\nAba de cupons na resposta 👇`;
  }
  const preco = mostraPreco(oferta, cfg);
  const econ = resumoEconomia(oferta, preco);
  let corpo;
  if (!preco) {
    const frase = fraseDesconto(oferta, cfg);
    corpo = [`✅ ${frase.charAt(0).toUpperCase()}${frase.slice(1)} ${naLoja(oferta.loja)}`];
  } else if (temRef90(oferta)) {
    const frase = fraseDesconto(oferta, cfg);
    corpo = [`${formatBRL(oferta.preco)} ${naLoja(oferta.loja)}`, `✅ ${frase.charAt(0).toUpperCase()}${frase.slice(1)}`];
  } else if (econ && econ.tipo === 'loja') {
    corpo = [`💸 De ${econ.de_fmt} por ${formatBRL(oferta.preco)} ${naLoja(oferta.loja)} (-${econ.pct}% na loja)`];
  } else {
    corpo = [`💰 ${formatBRL(oferta.preco)} ${naLoja(oferta.loja)}`];
  }
  const fimX = preco ? 'Link na resposta 👇' : `${textoLink(oferta, cfg)}: link na resposta 👇`;
  const cupomLinha = cupom ? [`🎟️ Cupom ${cupom}: ${CUPOM_AVISO.charAt(0).toLowerCase()}${CUPOM_AVISO.slice(1, -1)}`] : [];
  const hora = horaPreco(oferta, cfg);
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
  const man = lerManuais(oferta);
  const pDe = precoDeLoja(oferta);
  const ref = oferta.min90 != null ? formatBRL(oferta.min90) : '—';
  const origem = origemMin90(oferta);
  const fonte = oferta.ref90_fonte ? ` · fonte: ${escapeHtml(truncar(oferta.ref90_fonte, 80))}` : '';
  const desc = oferta.desconto_pct != null ? ` (${oferta.desconto_pct > 0 ? '−' : '+'}${Math.abs(oferta.desconto_pct).toFixed(1).replace('.', ',')}%)` : '';
  const extra = [];
  if (oferta.comissao_pct) extra.push(`comissão ~${oferta.comissao_pct}%`);
  if (oferta.vendas) extra.push(`${oferta.vendas} vendidos`);
  if (oferta.top) extra.push('⭐ marcada para o Top do Dia');
  if (cupomDe(oferta)) extra.push(`🎟️ cupom ${cupomDe(oferta)}`);
  else if (cupomAutoDe(oferta)) extra.push(`🎟️ cupom no anúncio: ${cupomAutoDe(oferta)}`);
  if (parcelamentoDe(oferta)) extra.push(`💳 ${parcelamentoDe(oferta)}`);
  if (pixDe(oferta)) extra.push('💠 no PIX');
  if (man.ref_mercado) extra.push(`🔎 mercado: ${formatBRL(man.ref_mercado)}${man.ref_mercado_loja ? ` (${man.ref_mercado_loja})` : ''}`);
  const emAltaC = emAltaDe(oferta);
  if (emAltaC) {
    const clq = man.cliques_comunidade ? ` (${man.cliques_comunidade} cliques)` : '';
    extra.push(emAltaC === 'explodindo' ? `🚨 bombando agora${clq}` : `🔥 em alta${clq}`);
  }
  const atCard = atualizacaoDe(oferta);
  if (atCard) extra.push(`↩️ responde ao post anterior (${atCard.repost_de})`);
  if (man._afiliado) extra.push('🔗 link de afiliado preservado');

  const liberadaSemRef = oferta.selo === 'sem_ref' && permitePublicarSelo(oferta, cfg);
  const rotuloStatusSelo = liberadaSemRef
    ? '✅ Pronta para publicar (sem ref90; post não cita 90 dias)'
    : (SELO_TXT[oferta.selo] || oferta.selo);

  const origemTag = oferta.origem === 'shopee'
    ? ' · coleta automática'
    : oferta.origem === 'radar'
      ? ' · 📡 radar automático'
      : man.modo_link
        ? ' · link automático'
        : '';

  const pDeBruto = precoDeBrutoDe(oferta);
  const pSemCup = precoSemCupomDe(oferta);
  const linhaPrecoCard = man.eh_cupom_loja
    ? `🎟️ Central de cupons (${escapeHtml(rotuloEscopoCupom(oferta, cfg))})`
    : (pDeBruto && pSemCup && pDeBruto > pSemCup && pSemCup > Number(oferta.preco))
      ? `<s>${formatBRL(pDeBruto)}</s> → no anúncio ${formatBRL(pSemCup)} → <b>${formatBRL(oferta.preco)}</b>`
      : `${pDe ? `<s>${formatBRL(pDe)}</s> → ` : ''}<b>${formatBRL(oferta.preco)}</b>`;

  const linhas = [
    `🆕 <b>Oferta ${escapeHtml(oferta.oferta_id)}</b> · ${c.emoji} ${escapeHtml(c.nome)}${origemTag}`,
    '',
    `<b>${escapeHtml(truncar(oferta.titulo, 200))}</b>`,
    `${escapeHtml(nomeLoja(oferta.loja))} · ${linhaPrecoCard}`,
    man.eh_cupom_loja ? 'Tipo: Cupom/lote oficial de loja' : `Menor 90d: ${ref}${desc}${origem ? ' · origem: ' + escapeHtml(origem) : ''}${fonte}`,
  ];
  if (temRef90(oferta) && diasCobertos(oferta) < 90) linhas.push(`Cobertura: ${diasCobertos(oferta)} dias (o post diz "menor preço ${periodo(oferta, cfg)}")`);
  linhas.push(
    `Histórico próprio: ${oferta.hist_registros || 0} registro(s)${oferta.hist_primeira ? ' desde ' + oferta.hist_primeira : ''}`,
    `Selo: <b>${rotuloStatusSelo}</b>`,
  );
  if (oferta.selo === 'ok') linhas.push(`No post: <i>${rotuloSelo(oferta, cfg)}: ${escapeHtml(fraseDesconto(oferta, cfg))}</i>`);
  if (man.modo_link) {
    const ganchoPrev = ganchoOferta(oferta, cfg, { mostrarPreco: mostraPreco(oferta, cfg), cupom: cupomDe(oferta) });
    if (ganchoPrev) linhas.push(`Chamada: <i>${escapeHtml(ganchoPrev)}</i>`);
  }
  if (!mostraPreco(oferta, cfg)) linhas.push('Post sem preço nem % (amazon.mostrar_preco = nao)');
  if (extra.length) linhas.push(escapeHtml(extra.join(' · ')));
  if (oferta.aviso_card) linhas.push(escapeHtml(oferta.aviso_card));
  if (pendencias && pendencias.length) linhas.push('', '⚠️ ' + escapeHtml(pendencias.join('\n⚠️ ')));
  linhas.push('', `<a href="${escapeHtml(oferta.url)}">Abrir na loja</a>`);

  const asin = oferta.loja === 'amazon' && (String(oferta.produto_id || '').match(/^amz_([A-Z0-9]{10})$/) || [])[1];
  if (asin && oferta.min90_origem !== 'keepa') {
    linhas.push(`📈 <a href="https://keepa.com/#!product/12-${asin}">Histórico de 90 dias grátis (gráfico da Keepa)</a>`);
  }
  if (oferta.selo === 'sem_ref') {
    const q = encodeURIComponent(truncar(oferta.titulo, 100));
    linhas.push(`🔎 <a href="${escapeHtml(`https://www.google.com/search?tbm=shop&q=${q}`)}">Google Shopping</a> · <a href="${escapeHtml(`https://www.buscape.com.br/search?q=${q}`)}">Buscapé (histórico)</a>`);
    linhas.push('↩️ Achou o menor preço? Responda a este card com o valor, ex.: 199,90');
  }
  linhas.push('🎟️ Cupom/preço: responda <code>cupom CODIGO por 149,90</code> (ou <code>cupom CODIGO 15%</code>)');

  const id = oferta.oferta_id;
  const semBloqueio = !(pendencias || []).some((p) => p.startsWith('BLOQUEIO'));
  const podePublicar = permitePublicarSelo(oferta, cfg) && semBloqueio;
  const teclado = [];
  if (podePublicar) {
    teclado.push([
      { text: '✅ Aprovar', callback_data: `a|${id}` },
      { text: '⚡ Relâmpago', callback_data: `r|${id}` },
    ]);
    const linhaTop = [{ text: '⭐ Aprovar + Top do Dia', callback_data: `t|${id}` }];
    if (man.modo_link) linhaTop.push({ text: '📋 Só textos (Zap/TG)', callback_data: `g|${id}` });
    teclado.push(linhaTop);
  } else if (man.modo_link && semBloqueio) {
    teclado.push([{ text: '📋 Só textos (Zap/TG)', callback_data: `g|${id}` }]);
  }

  // Troca de categoria em 1 toque quando o produto foi classificado automaticamente
  if (man.categoria_auto && cfg && cfg.categorias) {
    const outras = Object.entries(cfg.categorias)
      .filter(([k]) => k !== 'top' && k !== oferta.categoria)
      .map(([k, info]) => ({ text: `${info.emoji} ${info.nome.split(' ')[0]}`, callback_data: `c|${k}|${id}` }));
    if (outras.length) {
      teclado.push(outras.slice(0, 3));
      if (outras.length > 3) teclado.push(outras.slice(3, 6));
    }
  }

  teclado.push([
    { text: '✏️ Editar', callback_data: `e|${id}` },
    { text: '❌ Rejeitar', callback_data: `x|${id}` },
  ]);

  return { text: linhas.join('\n'), reply_markup: { inline_keyboard: teclado } };
}

/** Comando pré-preenchido (/link para ofertas automáticas sem ref90; /oferta no formato completo) para o admin copiar e corrigir. */
function comandoEdicao(oferta) {
  const manuais = lerManuais(oferta);
  const urlComTag = oferta.loja === 'amazon' && manuais._tag_url && !String(oferta.url || '').includes('tag=')
    ? `${oferta.url}?tag=${encodeURIComponent(manuais._tag_url)}`
    : oferta.url;

  if (manuais.modo_link && !oferta.ref90) {
    const precoLinha = manuais.preco_de && Number(manuais.preco_de) > Number(oferta.preco)
      ? `de ${String(manuais.preco_de).replace('.', ',')} por ${String(oferta.preco).replace('.', ',')}`
      : `preço ${String(oferta.preco).replace('.', ',')}`;
    const linhasLink = [
      `/link ${oferta.categoria}${oferta.top ? ' top' : ''}`,
      manuais._afiliado || urlComTag,
      oferta.titulo,
      precoLinha,
    ];
    if (oferta.imagem) linhasLink.push(`img ${oferta.imagem}`);
    if (manuais.cupom) linhasLink.push(`cupom ${manuais.cupom}`);
    return linhasLink.join('\n');
  }

  const linhas = [
    `/oferta ${oferta.categoria}${oferta.top ? ' top' : ''}`,
    urlComTag,
    oferta.titulo,
    `preço ${String(oferta.preco).replace('.', ',')}`,
    `ref90 ${oferta.ref90 ? String(oferta.ref90).replace('.', ',') : 'VALOR'} ${oferta.ref90_fonte || 'LINK-DA-FONTE'}`,
  ];
  if (oferta.imagem) linhas.push(`img ${oferta.imagem}`);
  if (manuais.cupom) linhas.push(`cupom ${manuais.cupom}`);
  const plats = ['tg', 'wac', 'wag', 'x'];
  const temPlatManual = plats.some((p) => manuais[p]);
  for (const p of plats) {
    if (manuais[p]) linhas.push(`${p} ${manuais[p]}`);
    else if (!temPlatManual && manuais._afiliado) linhas.push(`${p} ${manuais._afiliado}`);
  }
  return linhas.join('\n');
}

function safeJson(s) {
  try { return JSON.parse(s) || {}; } catch (e) { return {}; }
}

module.exports = {
  AVISO, AVISO_AMAZON, fraseDesconto, cupomDe, cupomAutoDe, parcelamentoDe, pixDe, emAltaDe, atualizacaoDe, linhaAtualizacao,
  temRef90, permitePublicarSelo, botaoCompra, textoTelegram, textoTelegramCupomLoja, corpoWhatsAppCupomLoja, rotuloEscopoCupom, textoWhatsAppCanal,
  textoWhatsAppGrupo, textoX, textoXResposta, textoEncerrado, tamanhoX, cardAprovacao, comandoEdicao,
};
