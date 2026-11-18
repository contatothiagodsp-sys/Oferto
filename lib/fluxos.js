'use strict';
// Funções de alto nível chamadas pelos Code nodes do n8n. Todas puras: recebem dados,
// devolvem linhas para as Data Tables e chamadas para a Bot API.
const { novoId, formatBRL, formatData, diaISO, truncar, formatDataHora, escapeHtml, partesData } = require('./util');
const { nomeLoja } = require('./lojas');
const { avaliarSelo, precisaSnapshot, origemMin90 } = require('./selo');
const { planejarLinks, consolidar, tagAmazon, parseManuais, dicaAfiliado } = require('./links');
const { PLATAFORMAS } = require('./subid');
const shopee = require('./shopee');
const { reqKeepa } = require('./keepa');
const { reqPaginaProduto } = require('./extrator');
const { tecladoEnviarWhatsApp } = require('./copy');
const textos = require('./textos');
const { chamada, msgAdmin, paraAdmins, linkMensagem, linkPost, textoStartMembro, linkTopico, botoesCanais, montarDivulgacaoCanais } = require('./telegram');
const { esquema, CATEGORIAS } = require('./config');
const { sha256Hex } = require('./sha256');

const DIA = 24 * 60 * 60 * 1000;
const TECLADO = (texto) => ({ inline_keyboard: [[{ text: texto, callback_data: 'noop' }]] });
const TOP_LIMITE = 5;

/** Há onde publicar no Telegram? Grupo com tópicos e/ou canal da categoria (ou do Top). */
function temDestinoTelegram(categoria, cfg, top) {
  const t = (cfg && cfg.telegram) || {};
  const canais = t.canais || {};
  return !!(t.grupo_id || canais[categoria] || (top && canais.top));
}

/** Teclado do card depois de publicada: status + ⭐ Mandar ao Top (p) e ⛔ Encerrar (z) + ↪️ mover tópico se auto-classificada. */
function tecladoPublicada(oferta, topHoje, cfg) {
  const id = oferta.oferta_id;
  const status = oferta.relampago ? '⚡ Publicada (relâmpago)' : '✅ Publicada';
  const top = oferta.top
    ? { text: `⭐ No Top${topHoje ? ` (${topHoje}/${TOP_LIMITE} hoje)` : ''}`, callback_data: 'noop' }
    : { text: '⭐ Mandar ao Top', callback_data: `p|${id}` };
  const linhas = [[{ text: status, callback_data: 'noop' }], [top, { text: '⛔ Encerrar', callback_data: `z|${id}` }]];
  const man = parseManuais(oferta.links_manuais);
  if (man.categoria_auto) {
    const cats = (cfg && cfg.categorias) || CATEGORIAS;
    const outras = Object.entries(cats)
      .filter(([k]) => k !== 'top' && k !== oferta.categoria)
      .map(([k, info]) => ({ text: `↪️ ${info.emoji} ${info.nome.split(' ')[0]}`, callback_data: `m|${k}|${id}` }));
    if (outras.length) linhas.push(outras.slice(0, 4));
  }
  return { inline_keyboard: linhas };
}

/* ---------- pendências de links (antes de publicar) ---------- */

function pendenciasLinks(oferta, cfg) {
  const manuais = parseManuais(oferta.links_manuais);
  const faltam = PLATAFORMAS.filter((p) => !manuais[p]);
  const out = [];
  if (!faltam.length) return out;
  if (oferta.loja === 'shopee' && !(cfg.shopee.app_id && cfg.shopee.secret)) {
    if (manuais._afiliado) out.push('Usando link curto da Shopee (atribuição somada entre plataformas)');
    else out.push('Sem link de afiliado da Shopee: sairá com link direto (sem comissão)');
  } else if (oferta.loja === 'amazon') {
    const sem = faltam.filter((p) => !(tagAmazon(cfg, oferta.categoria, p) || manuais._tag_url || manuais._afiliado));
    if (sem.length) out.push(`Sem tag da Amazon (${sem.map((p) => oferta.categoria + '_' + p).join(', ')}): sairá com link direto (sem comissão)`);
    else if (faltam.some((p) => !(cfg.amazon.tags[`${oferta.categoria}_${p}`] || cfg.amazon.tags[oferta.categoria]))) {
      if (cfg.amazon.tag_padrao) out.push('Usando amazon.tag_padrao: atribuição por plataforma perdida');
      else if (manuais._tag_url) out.push(`Usando tag da própria URL (${manuais._tag_url})`);
      else if (manuais._afiliado) out.push('Usando link curto da Amazon (atribuição somada entre plataformas)');
    }
  } else if (oferta.loja === 'ml') {
    if (faltam.length === PLATAFORMAS.length) {
      if (manuais._afiliado) out.push('Usando link de afiliado do ML (atribuição somada entre plataformas)');
      else if (cfg.ml && cfg.ml.etiqueta) out.push('Usando etiqueta ml.etiqueta configurada');
      else out.push('Sem link de afiliado do ML: sairá com link direto (sem comissão)');
    } else {
      out.push(`ML sem link próprio para: ${faltam.join(', ')} (atribuição somada)`);
    }
  } else if (oferta.loja === 'shein') {
    if (!manuais._afiliado && !(cfg.shein && cfg.shein.afiliado_id)) {
      out.push('Sem afiliado da Shein (shein.afiliado_id): sairá com link direto (sem comissão)');
    }
  } else if (oferta.loja === 'tiktok') {
    if (!manuais._afiliado) {
      out.push('Sem link de afiliado do TikTok Shop: sairá com link direto (sem comissão)');
    }
  } else if (oferta.loja === 'outra' && !manuais._afiliado) {
    out.push('Loja sem programa de afiliados configurado: link sem comissão');
  }
  return out;
}

/* ---------- nova oferta (/oferta) ---------- */

function linhaOferta(o, sel, extra) {
  return Object.assign({
    oferta_id: o.oferta_id,
    produto_id: o.produto_id,
    loja: o.loja,
    categoria: o.categoria,
    titulo: o.titulo,
    url: o.url,
    imagem: o.imagem || '',
    preco: o.preco,
    min90: sel.min90,
    desconto_pct: sel.desconto_pct,
    ref90: sel.ref90,
    ref90_fonte: sel.ref90_fonte || '',
    selo: sel.selo,
    hist_registros: sel.historico.registros,
    hist_primeira: sel.historico.primeira || '',
    links_manuais: JSON.stringify(parseManuais(o.links_manuais)),
    origem: o.origem || 'manual',
    status: 'pendente',
    relampago: false,
    top: !!o.top,
    comissao_pct: o.comissao_pct || null,
    vendas: o.vendas || null,
    criada_por: o.criada_por || null,
    decidida_por: null,
    ts: o.ts,
    decidida_ts: null,
    data: new Date(o.ts).toISOString(),
  }, extra || {});
}

function linhaPreco(produto_id, loja, preco, fonte, fonte_url, ts) {
  return { produto_id, loja, preco, fonte, fonte_url: fonte_url || '', ts, data: new Date(ts).toISOString() };
}

/** Card de aprovação (sendMessage com prévia da imagem). extra: campos só da view (ex.: aviso_card da Keepa). */
function chamadaCard(linha, cfg, chatId, extra) {
  const pend = pendenciasLinks(linha, cfg);
  const card = textos.cardAprovacao(Object.assign(cardView(linha, cfg), extra || {}), cfg, pend);
  const preview = linha.imagem || linha.url;
  return chamada('admin', 'sendMessage', {
    chat_id: chatId,
    text: card.text,
    parse_mode: 'HTML',
    reply_markup: card.reply_markup,
    link_preview_options: { url: preview, prefer_large_media: true, show_above_text: true },
  });
}

function cardView(linha, cfg) {
  return Object.assign({}, linha, origemMin90(linha, cfg.selo), {
    hist_primeira: linha.hist_primeira ? formatData(linha.hist_primeira, cfg.fuso) : '',
  });
}

function avaliarNovaOferta(entrada, precosRows, cfg) {
  const ts = entrada.ts;
  const o = Object.assign({}, entrada.oferta, { oferta_id: novoId('o', ts), ts, criada_por: entrada.user_id, origem: 'manual' });
  const rows = (precosRows || []).filter((r) => r && r.produto_id === o.produto_id);
  const sel = avaliarSelo(rows, o.preco, {
    agora: ts, ref90: o.ref90, ref90_fonte: o.ref90_fonte, tolerancia_pct: cfg.selo.tolerancia_pct, dias: cfg.selo.dias,
  });
  const precosNovos = [];
  if (precisaSnapshot(rows, o.preco, ts)) precosNovos.push(linhaPreco(o.produto_id, o.loja, o.preco, 'coleta', '', ts));
  if (o.ref90 != null) precosNovos.push(linhaPreco(o.produto_id, o.loja, o.ref90, 'ref90', o.ref90_keepa ? 'keepa' : o.ref90_fonte, ts));
  const linha = linhaOferta(o, sel);
  const extra = (entrada.avisos_card || []).length ? { aviso_card: entrada.avisos_card.join('\n') } : null;

  let auto_publicar = null;
  if (cfg && cfg.auto && cfg.auto.publicar_direto && entrada.auto_link && !entrada.ja_publicada_24h) {
    const semBloqueio = !pendenciasLinks(linha, cfg).some((p) => p.startsWith('BLOQUEIO'));
    if (semBloqueio && textos.permitePublicarSelo(linha, cfg)) {
      const soTextos = !temDestinoTelegram(linha.categoria, cfg, linha.top);
      if (!soTextos) {
        linha.status = 'publicando';
        linha.decidida_por = entrada.user_id || null;
        linha.decidida_ts = ts;
      }
      const pubOferta = Object.assign({}, linha, origemMin90(linha, cfg.selo), { relampago: false, top: !!linha.top });
      try {
        const linkItens = planejarLinks(pubOferta, cfg, ts);
        auto_publicar = {
          oferta: pubOferta,
          linkItens,
          so_textos: soTextos,
          chat_id: entrada.chat_id,
          user_id: entrada.user_id,
          ts,
        };
      } catch (err) {
        linha.status = 'pendente';
        linha.decidida_por = null;
        linha.decidida_ts = null;
      }
    }
  }

  const chCard = chamadaCard(linha, cfg, entrada.chat_id, extra);
  if (auto_publicar && !auto_publicar.so_textos) {
    chCard.payload.reply_markup = TECLADO('⏳ Publicando automaticamente…');
  }

  return {
    oferta: linha,
    precosNovos,
    auto_publicar,
    chamadas: [chCard].concat(entrada.chamadas_extra || []),
  };
}

/**
 * Primeiro passo da rota "oferta", antes da Keepa, da leitura HTML e do selo.
 */
function prepararOferta(cls, ofertaRows, cfg) {
  const e = Object.assign({}, cls, { avisos_card: (cls.avisos_card || []).slice() });
  if (cls.resposta) {
    const r = cls.resposta;
    const row = (ofertaRows || []).find((x) => x && x.oferta_id === r.oferta_id);
    const erro = (texto) => ({ rota: 'responder', chamadas: [msgAdmin(cls.chat_id, texto)] });
    if (!row) return erro(`❗ Não achei a oferta ${r.oferta_id}.`);
    if (['aprovada', 'publicando'].includes(row.status)) {
      return erro(`❗ A oferta ${row.oferta_id} já foi aprovada: o ref90 não muda o que foi publicado. Para outra oferta, mande um /oferta novo.`);
    }
    const manRow = parseManuais(row.links_manuais);
    if (r.edicao_cupom) {
      // Resposta ao card com cupom/preço: "cupom MELI15 por 143,90", "cupom MELI15 15%" ou "de 229,90 anuncio 169,90 por 143,90 cupom MELI15"
      const man2 = Object.assign({}, manRow);
      const precoAnt = Number(row.preco);
      let novoPreco = r.preco != null ? Number(r.preco) : precoAnt;
      if (r.cupom) { man2.cupom = r.cupom; delete man2.cupom_auto; }
      if (r.parcelamento) man2.parcelamento = r.parcelamento;
      if (r.preco == null && (r.cupom_pct || r.cupom_valor) && precoAnt > 0) {
        const calc = r.cupom_pct ? Math.round(precoAnt * (100 - r.cupom_pct)) / 100 : Math.round((precoAnt - r.cupom_valor) * 100) / 100;
        if (calc > 0 && calc < precoAnt) novoPreco = calc;
      }
      const semCup = r.preco_sem_cupom || (r.preco_de && r.preco_de > novoPreco && r.preco != null && (r.cupom_pct || r.cupom_valor) ? r.preco_de : null)
        || (precoAnt > novoPreco ? precoAnt : null);
      if (semCup && semCup > novoPreco) man2.preco_sem_cupom = semCup;
      const deNovo = r.preco_de && r.preco_de > novoPreco ? r.preco_de : (man2.preco_de && Number(man2.preco_de) > novoPreco ? Number(man2.preco_de) : semCup);
      if (deNovo && deNovo > novoPreco) man2.preco_de = deNovo;
      e.oferta = {
        categoria: row.categoria, top: !!row.top, url: row.url, titulo: row.titulo, preco: novoPreco,
        ref90: row.ref90 != null && row.ref90 !== '' ? Number(row.ref90) : null, ref90_fonte: row.ref90_fonte || '',
        imagem: row.imagem || '', links_manuais: man2,
        loja: row.loja, produto_id: row.produto_id, comissao_pct: row.comissao_pct || null, vendas: row.vendas || null,
      };
    } else {
      e.oferta = {
        categoria: row.categoria, top: !!row.top, url: row.url, titulo: row.titulo, preco: Number(row.preco),
        ref90: r.ref90, ref90_fonte: r.ref90_fonte, imagem: row.imagem || '', links_manuais: manRow,
        loja: row.loja, produto_id: row.produto_id, comissao_pct: row.comissao_pct || null, vendas: row.vendas || null,
      };
    }
    e.substitui = row.oferta_id;
    if (row.status === 'pendente') {
      e.update = { oferta_id: row.oferta_id, status: 'editada', decidida_por: cls.user_id, decidida_ts: cls.ts };
      e.chamadas_extra = [chamada('admin', 'editMessageReplyMarkup', { chat_id: cls.chat_id, message_id: r.message_id, reply_markup: TECLADO('↩️ Substituída pelo card novo') })];
    }
    return e;
  }

  const o = cls.oferta || {};
  const man = parseManuais(o.links_manuais);

  // Detecta duplicidade nas últimas 24h (evita republicar sem querer no modo automático)
  const repetida = (ofertaRows || []).find((x) => x && x.produto_id === o.produto_id
    && x.status === 'aprovada' && Number(x.ts) >= (cls.ts || Date.now()) - DIA
    && (o.preco == null || Number(x.preco) <= Number(o.preco)));
  if (repetida) {
    e.ja_publicada_24h = true;
    e.avisos_card.push(`⚠️ Produto já publicado nas últimas 24h por ${formatBRL(Number(repetida.preco))}`);
  }

  if (o.loja === 'amazon' && !man.curto_pendente && cfg.keepa && cfg.keepa.chave && (!o.titulo || o.preco == null || o.ref90 == null || !o.imagem)) {
    try {
      e.keepa_http = reqKeepa(cfg, o.produto_id);
    } catch (err) {
      e.avisos_card.push('⚠️ Keepa: ' + err.message);
    }
  }

  // Modo automático por link: lê gratuitamente a página HTML quando falta título real, preço, imagem ou resolução de link curto
  if ((cls.auto_link || man.modo_link) && (!o.titulo || man.titulo_slug || man.curto_pendente || o.preco == null || !o.imagem)) {
    e.pagina_http = reqPaginaProduto(o.url_original || o.url, cfg);
  }
  return e;
}

/* ---------- clique num botão do card ---------- */

function decidirCallback(cb, ofertaRows, cfg) {
  const oferta = (ofertaRows || []).find((r) => r && r.oferta_id === cb.oferta_id);
  const responder = (texto, alerta) => chamada('admin', 'answerCallbackQuery', { callback_query_id: cb.callback_id, text: texto, show_alert: !!alerta });
  const marcar = (texto) => chamada('admin', 'editMessageReplyMarkup', { chat_id: cb.chat_id, message_id: cb.message_id, reply_markup: TECLADO(texto) });
  const fim = (chamadas, update) => ({ proximo: 'fim', chamadas, update: update || null, oferta: oferta || null, linkItens: [] });

  if (!oferta) return fim([responder('Oferta não encontrada.', true)]);
  if (oferta.status !== 'pendente') return fim([responder(`Esta oferta já está "${oferta.status}".`, true)]);

  const base = { oferta_id: oferta.oferta_id, decidida_por: cb.user_id, decidida_ts: cb.ts };

  if (cb.acao === 'c') {
    const nova = cb.nova_categoria;
    if (!nova || !cfg.categorias || !cfg.categorias[nova] || nova === 'top') {
      return fim([responder('Categoria inválida.', true)]);
    }
    const atualizada = Object.assign({}, oferta, { categoria: nova });
    const pend = pendenciasLinks(atualizada, cfg);
    const card = textos.cardAprovacao(cardView(atualizada, cfg), cfg, pend);
    return fim([
      responder(`Categoria alterada para ${cfg.categorias[nova].emoji} ${cfg.categorias[nova].nome}`),
      chamada('admin', 'editMessageText', {
        chat_id: cb.chat_id,
        message_id: cb.message_id,
        text: card.text,
        parse_mode: 'HTML',
        reply_markup: card.reply_markup,
        link_preview_options: { url: atualizada.imagem || atualizada.url, prefer_large_media: true, show_above_text: true },
      }),
    ], { oferta_id: oferta.oferta_id, categoria: nova });
  }

  if (cb.acao === 'x') {
    return fim([responder('Rejeitada.'), marcar('❌ Rejeitada')], Object.assign(base, { status: 'rejeitada' }));
  }
  if (cb.acao === 'e') {
    return fim([
      responder('Copie, corrija e envie de novo.'),
      marcar('✏️ Em edição'),
      chamada('admin', 'sendMessage', {
        chat_id: cb.chat_id,
        text: 'Toque no bloco para copiar, ajuste (principalmente o <b>ref90</b> e a fonte) e envie:\n\n<pre>' +
          textos.comandoEdicao(oferta).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</pre>',
        parse_mode: 'HTML',
      }),
    ], Object.assign(base, { status: 'editada' }));
  }

  // g → só gerar textos prontos (WhatsApp + Telegram), mesmo sem grupo_id configurado
  if (cb.acao === 'g') {
    const bloqueioG = pendenciasLinks(oferta, cfg).find((p) => p.startsWith('BLOQUEIO'));
    if (bloqueioG) return fim([responder(bloqueioG.slice(0, 190), true)]);
    const pubG = Object.assign({}, oferta, origemMin90(oferta, cfg.selo));
    let linkItensG;
    try {
      linkItensG = planejarLinks(pubG, cfg, cb.ts);
    } catch (e) {
      return fim([responder('Erro ao gerar links: ' + e.message, true)]);
    }
    return {
      proximo: 'publicar',
      so_textos: true,
      chamadas: [responder('Gerando textos prontos…')],
      update: base,
      oferta: pubG,
      linkItens: linkItensG,
    };
  }

  // a | r | t → publicar
  if (!textos.permitePublicarSelo(oferta, cfg)) {
    return fim([responder('Sem selo ✓ Desconto real: não dá para publicar.', true)]);
  }
  const bloqueio = pendenciasLinks(oferta, cfg).find((p) => p.startsWith('BLOQUEIO'));
  if (bloqueio) return fim([responder(bloqueio.slice(0, 190), true)]);

  const pub = Object.assign({}, oferta, origemMin90(oferta, cfg.selo), { relampago: cb.acao === 'r', top: cb.acao === 't' || !!oferta.top });
  let linkItens;
  try {
    linkItens = planejarLinks(pub, cfg, cb.ts);
  } catch (e) {
    return fim([responder('Erro ao gerar links: ' + e.message, true)]);
  }
  return {
    proximo: 'publicar',
    so_textos: false,
    chamadas: [responder('Publicando…'), marcar('⏳ Publicando…')],
    update: Object.assign(base, { status: 'publicando', relampago: pub.relampago, top: pub.top }),
    oferta: pub,
    linkItens,
  };
}

/** Junta as respostas da Shopee aos itens planejados (mesma ordem), com fallback para link curto original se houver. */
function lerRespostasShopee(itens, respostas) {
  return itens.map((it, i) => {
    if (it.metodo !== 'shopee') return it;
    const r = respostas[i] || {};
    const lido = r.error ? { erro: String(r.error.message || r.error) } : shopee.lerShortLink(r);
    if (!lido.url && it.fallback_url) {
      return Object.assign({}, it, { http: undefined, url: it.fallback_url, erro: '', aviso: it.fallback_aviso || 'API Shopee indisponível; usando link curto original' });
    }
    return Object.assign({}, it, { http: undefined, url: lido.url || '', erro: lido.erro || '' });
  });
}

/* ---------- publicação ---------- */

function postGrupo(oferta, link, cfg, topicoChave, categoriaRegistro, ts) {
  const t = cfg.telegram;
  const hora = Number(partesData(ts || Date.now(), cfg.fuso).hour);
  const thread = t.topicos[topicoChave];
  const payload = {
    chat_id: t.grupo_id,
    parse_mode: 'HTML',
    text: textos.textoTelegram(oferta, link, cfg),
    // Imagem como prévia grande acima do texto: se a URL da imagem falhar, o post sai mesmo assim
    // (sendPhoto recusaria a mensagem inteira).
    link_preview_options: { url: oferta.imagem || link, prefer_large_media: true, show_above_text: !!oferta.imagem },
    reply_markup: textos.botaoCompra(oferta, link, cfg),
  };
  if (thread) payload.message_thread_id = thread;
  // Silencioso entre 22h e 8h e na cópia para o Top do Dia. O relâmpago sempre notifica.
  if (!oferta.relampago && (hora >= 22 || hora < 8 || topicoChave === 'top')) payload.disable_notification = true;
  const ref = { registrar: true, oferta_id: oferta.oferta_id, plataforma: 'tg', categoria: categoriaRegistro, thread: thread || null };
  return chamada('grupo', 'sendMessage', payload, ref);
}

/** Cópia no canal só da categoria (canal.<cat>), se configurado. Mesmo texto e botões; registra como plataforma tgc. */
function postCanal(oferta, link, cfg, chave, ts) {
  const canal = cfg.telegram.canais && cfg.telegram.canais[chave];
  if (!canal) return null;
  const ch = postGrupo(oferta, link, cfg, chave, chave, ts);
  delete ch.payload.message_thread_id;
  ch.payload.chat_id = canal;
  if (chave === 'top' && !oferta.relampago) delete ch.payload.disable_notification;
  ch.ref = Object.assign({}, ch.ref, { plataforma: 'tgc', thread: null, chat: canal });
  return ch;
}

function msgWhatsApp(chatId, texto, rotulo) {
  const rm = tecladoEnviarWhatsApp(texto, rotulo);
  return msgAdmin(chatId, texto, rm ? { reply_markup: rm } : undefined);
}

function prepararPublicacao(oferta, itens, cfg, ctx) {
  const ts = ctx.ts;
  const c = consolidar(itens);
  const platsCfg = (cfg.publicar && Array.isArray(cfg.publicar.plataformas) && cfg.publicar.plataformas.length)
    ? cfg.publicar.plataformas
    : ['wag', 'wac', 'x'];
  const incluirWag = platsCfg.includes('wag') || !!oferta.relampago;
  const incluirWac = platsCfg.includes('wac');
  const incluirX = platsCfg.includes('x');

  const linksRows = PLATAFORMAS.filter((p) => c.links[p]).map((p) => ({
    oferta_id: oferta.oferta_id, categoria: oferta.categoria, plataforma: p, sub_id: c.sub_ids[p], url: c.links[p], ts,
    data: new Date(ts).toISOString(),
  }));

  // Modo "📋 Só textos" (ou auto-publicação quando grupo_id ainda não está configurado): entrega textos prontos para Telegram e WhatsApp!
  if (ctx.so_textos) {
    const linkTg = c.links.tg || c.links.wag || c.links.wac;
    const linkWag = c.links.wag || c.links.wac || c.links.tg;
    if (!linkTg) {
      return {
        ok: false,
        chamadas: [msgAdmin(ctx.chat_id, `❗ Não consegui gerar o link de afiliado da oferta ${oferta.oferta_id}.\n${c.avisos.join('\n')}`.trim())],
        linksRows: [],
        update: null,
      };
    }
    const itensCab = [
      '1) Post para Grupo/Canal do Telegram',
      '2) Post para Grupo do WhatsApp (toque no botão para enviar direto)',
    ];
    if (incluirWac && c.links.wac) itensCab.push(`${itensCab.length + 1}) Canal do WhatsApp`);
    if (incluirX && c.links.x) {
      itensCab.push(`${itensCab.length + 1}) X: post`);
      itensCab.push(`${itensCab.length + 1}) X: 1ª resposta`);
    }
    const chamadasTxt = [
      msgAdmin(ctx.chat_id, `📋 Textos prontos · ${truncar(oferta.titulo, 60)} (${formatBRL(oferta.preco)})\n${itensCab.join('\n')}`),
      chamada('admin', 'sendMessage', {
        chat_id: ctx.chat_id,
        parse_mode: 'HTML',
        text: textos.textoTelegram(oferta, linkTg, cfg),
        link_preview_options: { url: oferta.imagem || linkTg, prefer_large_media: true, show_above_text: !!oferta.imagem },
        reply_markup: textos.botaoCompra(oferta, linkTg, cfg),
      }),
      msgWhatsApp(ctx.chat_id, textos.textoWhatsAppGrupo(oferta, linkWag, cfg), '📲 Enviar no Grupo do WhatsApp'),
    ];
    if (incluirWac && c.links.wac) chamadasTxt.push(msgWhatsApp(ctx.chat_id, textos.textoWhatsAppCanal(oferta, c.links.wac, cfg), '📲 Enviar no Canal do WhatsApp'));
    if (incluirX && c.links.x) {
      chamadasTxt.push(msgAdmin(ctx.chat_id, textos.textoX(oferta, cfg)));
      chamadasTxt.push(msgAdmin(ctx.chat_id, textos.textoXResposta(c.links.x, oferta)));
    }
    return { ok: true, chamadas: chamadasTxt, linksRows, update: null };
  }

  const exigidas = ['tg']
    .concat(incluirWac ? ['wac'] : [])
    .concat(incluirX ? ['x'] : [])
    .concat(incluirWag ? ['wag'] : []);
  const faltando = exigidas.filter((p) => !c.links[p]);

  const temDestino = temDestinoTelegram(oferta.categoria, cfg, oferta.top);
  if (!temDestino || faltando.length) {
    const motivo = !temDestino ? 'grupo_id/canal da categoria não configurado (use /canais ou o botão "📋 Só textos")' : `sem link para: ${faltando.join(', ')}`;
    const card = textos.cardAprovacao(cardView(oferta, cfg), cfg, pendenciasLinks(oferta, cfg));
    const chFalha = [msgAdmin(ctx.chat_id, `❗ Não publiquei a oferta ${oferta.oferta_id}: ${motivo}\n${c.avisos.join('\n')}`.trim())];
    if (ctx.message_id) {
      chFalha.push(chamada('admin', 'editMessageReplyMarkup', { chat_id: ctx.chat_id, message_id: ctx.message_id, reply_markup: card.reply_markup }));
    }
    return {
      ok: false,
      chamadas: chFalha,
      linksRows: [],
      update: { oferta_id: oferta.oferta_id, status: 'pendente' },
    };
  }

  const cat = cfg.categorias[oferta.categoria] || { nome: oferta.categoria, emoji: '' };
  const temGrupo = !!cfg.telegram.grupo_id;
  const chamadas = temGrupo ? [postGrupo(oferta, c.links.tg, cfg, oferta.categoria, oferta.categoria, ts)] : [];
  if (temGrupo && oferta.top && cfg.telegram.topicos.top) chamadas.push(postGrupo(oferta, c.links.tg, cfg, 'top', 'top', ts));
  const canais = [postCanal(oferta, c.links.tg, cfg, oferta.categoria, ts), oferta.top ? postCanal(oferta, c.links.tg, cfg, 'top', ts) : null].filter(Boolean);
  chamadas.push(...canais);

  const ordem = [];
  if (incluirWac) ordem.push(`${ordem.length + 1}) Canal do WhatsApp`);
  if (incluirX) {
    ordem.push(`${ordem.length + 1}) X: post (anexe a imagem)`);
    ordem.push(`${ordem.length + 1}) X: 1ª resposta`);
  }
  if (incluirWag) ordem.push(`${ordem.length + 1}) Grupo do WhatsApp (toque em "📲 Enviar no WhatsApp" ou cole no grupo)`);

  const cabecalho = [
    temGrupo
      ? `✅ Publicada no Telegram: ${cat.emoji} ${cat.nome}${oferta.top ? ' + Top do Dia' : ''}${canais.length ? ` + ${canais.length} canal(is)` : ''}`
      : `✅ Publicada no canal: ${cat.emoji} ${cat.nome}${oferta.top && cfg.telegram.canais.top ? ' + Top do Dia' : ''} (${canais.length} canal(is))`,
    `${truncar(oferta.titulo, 60)} · ${formatBRL(oferta.preco)}`,
  ];
  if (ordem.length) cabecalho.push('', 'Textos prontos (um por mensagem):', ...ordem);
  if (c.avisos.length) cabecalho.push('', '⚠️ ' + c.avisos.join('\n⚠️ '));
  const dica = dicaAfiliado(oferta.loja, cfg, parseManuais(oferta.links_manuais));
  if (dica) cabecalho.push('', `💰 ${dica.nome} aceita afiliado (${dica.programa}): /config ${dica.chave} ${dica.exemplo} · veja /afiliados`);
  chamadas.push(msgAdmin(ctx.chat_id, cabecalho.join('\n')));

  if (incluirWac) chamadas.push(msgWhatsApp(ctx.chat_id, textos.textoWhatsAppCanal(oferta, c.links.wac, cfg), '📲 Enviar no Canal do WhatsApp'));
  if (incluirX) {
    chamadas.push(msgAdmin(ctx.chat_id, textos.textoX(oferta, cfg)));
    chamadas.push(msgAdmin(ctx.chat_id, textos.textoXResposta(c.links.x, oferta)));
  }
  if (incluirWag) chamadas.push(msgWhatsApp(ctx.chat_id, textos.textoWhatsAppGrupo(oferta, c.links.wag, cfg), '📲 Enviar no Grupo do WhatsApp'));

  if (ctx.message_id) {
    chamadas.push(chamada('admin', 'editMessageReplyMarkup', {
      chat_id: ctx.chat_id, message_id: ctx.message_id,
      reply_markup: tecladoPublicada(oferta, 0, cfg),
    }));
  }

  return { ok: true, chamadas, linksRows, update: { oferta_id: oferta.oferta_id, status: 'aprovada' } };
}

/* ---------- depois de publicada: ⭐ Mandar ao Top e ⛔ Encerrar ---------- */

/** Texto do post encerrado (a Marketing pode criar textos.textoEncerrado; este é o fallback). quando = timestamp (ms). */
function textoEncerradoPadrao(oferta, cfg, quando) {
  const c = (cfg.categorias && cfg.categorias[oferta.categoria]) || { emoji: '🏷️' };
  return [
    '⛔ <b>Oferta encerrada</b>',
    `${c.emoji} <s>${escapeHtml(truncar(oferta.titulo, 180))}</s>`,
    '',
    `O preço de ${formatBRL(oferta.preco)} acabou ou mudou (encerrada em ${formatDataHora(quando, cfg.fuso)}).`,
    'Ative as notificações do tópico para pegar a próxima.',
  ].join('\n');
}

/**
 * Clique em ⭐ Mandar ao Top (p) ou ⛔ Encerrar (z) no card de uma oferta já publicada.
 * postsRows: posts da oferta + posts desde a meia-noite (para contar o Top do dia). linksRows: links da oferta.
 */
function decidirPosPublicacao(cb, ofertaRows, postsRows, linksRows, cfg) {
  const t = cfg.telegram;
  const oferta = (ofertaRows || []).find((r) => r && r.oferta_id === cb.oferta_id);
  const responder = (texto, alerta) => chamada('admin', 'answerCallbackQuery', { callback_query_id: cb.callback_id, text: texto, show_alert: !!alerta });
  const card = (reply_markup) => chamada('admin', 'editMessageReplyMarkup', { chat_id: cb.chat_id, message_id: cb.message_id, reply_markup });
  const todos = (postsRows || []).filter((r) => r && (r.plataforma === 'tg' || r.plataforma === 'tgc') && r.message_id);
  const posts = todos.filter((r) => r.plataforma === 'tg');
  const topHoje = new Set((t.grupo_id ? posts : todos).filter((r) => r.categoria === 'top' && Number(r.ts) >= cb.desde).map((r) => r.oferta_id)).size;
  const fim = (chamadas, update) => ({ chamadas, update: update || null, top_hoje: topHoje });

  if (!oferta) return fim([responder('Oferta não encontrada.', true)]);
  const daOferta = (t.grupo_id ? posts : todos).filter((r) => r.oferta_id === oferta.oferta_id);

  if (cb.acao === 'z') {
    if (oferta.status === 'encerrada') return fim([responder('Esta oferta já está encerrada.', true), card(TECLADO('⛔ Encerrada'))]);
    if (oferta.status !== 'aprovada') return fim([responder(`Esta oferta está "${oferta.status}": só dá para encerrar oferta publicada.`, true)]);
    const texto = (textos.textoEncerrado || textoEncerradoPadrao)(oferta, cfg, cb.ts);
    const canalDe = (p) => p.plataforma === 'tgc' && t.canais && t.canais[p.categoria];
    const alvos = todos.filter((r) => r.oferta_id === oferta.oferta_id && (r.plataforma === 'tg' || canalDe(r)));
    const edicoes = alvos.map((p) => chamada('grupo', 'editMessageText', {
      chat_id: canalDe(p) || t.grupo_id, message_id: Number(p.message_id), text: texto, parse_mode: 'HTML',
      link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: [] },
    }));
    return fim([
      responder(edicoes.length ? `Encerrada: ${edicoes.length} post(s) editado(s) no grupo e canais.` : 'Encerrada (nenhum post no grupo encontrado).'),
      card(TECLADO('⛔ Encerrada')),
      ...edicoes,
    ], { oferta_id: oferta.oferta_id, status: 'encerrada' });
  }

  if (cb.acao === 'm') {
    if (oferta.status !== 'aprovada') return fim([responder(`Esta oferta está "${oferta.status}": só dá para mover oferta publicada.`, true)]);
    const nova = cb.nova_categoria;
    if (!nova || !cfg.categorias || !cfg.categorias[nova] || nova === 'top') {
      return fim([responder('Categoria inválida.', true)]);
    }
    if (nova === oferta.categoria) return fim([responder('Já está nessa categoria.')]);
    if (!t.grupo_id && !(t.canais && t.canais[nova])) {
      return fim([responder('Configure o canal desta categoria antes de mover (/canais).', true)]);
    }
    const ofertaNova = Object.assign({}, oferta, { categoria: nova });
    const antigoLink = (linksRows || []).find((r) => r && r.oferta_id === oferta.oferta_id && r.plataforma === 'tg' && r.url);
    let linkTg = (antigoLink && antigoLink.url) || oferta.url;
    try {
      const planejadoTg = planejarLinks(ofertaNova, cfg, cb.ts).find((i) => i.plataforma === 'tg');
      if (planejadoTg && planejadoTg.metodo === 'pronto' && planejadoTg.url) linkTg = planejadoTg.url;
    } catch (e) { /* mantém link existente */ }
    const canalDe = (p) => p.plataforma === 'tgc' && t.canais && t.canais[p.categoria];
    const antigos = todos.filter((r) => r.oferta_id === oferta.oferta_id && r.categoria !== 'top' && (r.plataforma === 'tg' || canalDe(r)));
    const remocoes = antigos.map((p) => chamada('grupo', 'deleteMessage', {
      chat_id: canalDe(p) || t.grupo_id,
      message_id: Number(p.message_id),
    }));
    const novos = [
      t.grupo_id ? postGrupo(ofertaNova, linkTg, cfg, nova, nova, cb.ts) : null,
      postCanal(ofertaNova, linkTg, cfg, nova, cb.ts),
    ].filter(Boolean);
    const catNova = cfg.categorias[nova];
    return fim([
      responder(`Movida para ${catNova.emoji} ${catNova.nome}!`),
      card(tecladoPublicada(ofertaNova, topHoje, cfg)),
      ...remocoes,
      ...novos,
    ], { oferta_id: oferta.oferta_id, categoria: nova });
  }

  // p · Mandar ao Top
  if (oferta.status !== 'aprovada') return fim([responder(`Esta oferta está "${oferta.status}": só vai ao Top publicada.`, true)]);
  if (!t.topicos.top && !(t.canais && t.canais.top)) return fim([responder('Top do Dia não configurado (topico.top ou canal.top).', true)]);
  if (daOferta.some((p) => p.categoria === 'top')) {
    return fim([responder('Já está no Top do Dia.'), card(tecladoPublicada(Object.assign({}, oferta, { top: true }), topHoje, cfg))]);
  }
  if (topHoje >= TOP_LIMITE) {
    return fim([responder(`O Top do Dia já tem ${topHoje}/${TOP_LIMITE} ofertas hoje. Limite atingido: amanhã libera de novo.`, true)]);
  }
  const link = (linksRows || []).find((r) => r && r.oferta_id === oferta.oferta_id && r.plataforma === 'tg' && r.url);
  if (!link) return fim([responder('Não achei o link do Telegram desta oferta (bfx_links).', true)]);
  const pub = Object.assign({}, oferta, { top: true });
  return fim([
    responder(`⭐ Enviada ao Top do Dia (${topHoje + 1}/${TOP_LIMITE} hoje).`),
    card(tecladoPublicada(pub, topHoje + 1, cfg)),
    t.grupo_id && t.topicos.top ? postGrupo(pub, link.url, cfg, 'top', 'top', cb.ts) : null,
    postCanal(pub, link.url, cfg, 'top', cb.ts),
  ].filter(Boolean), { oferta_id: oferta.oferta_id, top: true });
}

/* ---------- /start no bot publicador ---------- */

/** Mensagem do /start: genérica (todos os tópicos) ou do tópico do link de divulgação, com botões. */
function mensagemStart(cls, cfg, link) {
  const t = cfg.telegram;
  const c = cls.categoria && cfg.categorias[cls.categoria];
  const botoes = [];
  if (link) botoes.push([{ text: 'Entrar no grupo', url: link }]);
  let texto;
  if (c) {
    texto = [
      `${c.emoji} Bem-vindo às ofertas de ${c.nome}!`,
      '',
      `Aqui no ${cfg.marca} só entra desconto real: preço igual ou abaixo do menor dos últimos 90 dias.`,
      link ? 'Toque em "Entrar no grupo" e depois abra o tópico.' : '',
    ].filter(Boolean).join('\n');
    if (t.topicos[cls.categoria] && t.grupo_id) botoes.push([{ text: `Abrir ${c.emoji} ${c.nome}`, url: linkTopico(cfg, cls.categoria) }]);
  } else {
    texto = textoStartMembro(cfg, link);
    if (!t.grupo_id) botoes.push(...botoesCanais(cfg));
  }
  const payload = { chat_id: cls.chat_id, text: texto, link_preview_options: { is_disabled: true } };
  if (botoes.length) payload.reply_markup = { inline_keyboard: botoes };
  return chamada('grupo', 'sendMessage', payload);
}

/**
 * /start: usa o convite nomeado (cls.convite) se ele já está na bfx_convites; se não, pede um ao Telegram.
 * Devolve a resposta final, ou o createChatInviteLink (aí a resposta sai em startComConvite).
 */
function boasVindasStart(cls, conviteRows, cfg) {
  if (!cls.convite) return [mensagemStart(cls, cfg, cfg.telegram.grupo_link)];
  const existente = (conviteRows || []).find((r) => r && r.nome === cls.convite && r.url);
  if (existente) return [mensagemStart(cls, cfg, existente.url)];
  return [chamada('grupo', 'createChatInviteLink', { chat_id: cfg.telegram.grupo_id, name: cls.convite }, { convite: cls.convite })];
}

/** Depois do createChatInviteLink do /start: linha da bfx_convites e a resposta ao membro. */
function startComConvite(cls, chamadas, respostas, cfg) {
  const ch = (chamadas || [])[0];
  if (!ch || ch.metodo !== 'createChatInviteLink') return { linha: null, chamadas: [] };
  const r = (respostas || [])[0] || {};
  const url = r.ok && r.result && r.result.invite_link;
  if (!url) return { linha: null, chamadas: [mensagemStart(cls, cfg, cfg.telegram.grupo_link)] };
  return {
    linha: { nome: cls.convite, categoria: cls.categoria || 'geral', url, ts: cls.ts, data: new Date(cls.ts).toISOString() },
    chamadas: [mensagemStart(cls, cfg, url)],
  };
}

/* ---------- sugestões dos membros (antiflood) ---------- */

const SUGESTAO_INTERVALO = 10 * 60 * 1000;

/**
 * No máximo 1 "Valeu!" no grupo por membro a cada 10 min (o aviso aos admins sempre vai).
 * estado: objeto persistente do n8n ($getWorkflowStaticData); é alterado aqui.
 */
function filtrarSugestao(cls, estado, agora) {
  const est = estado || {};
  const mapa = (est.sugestoes = est.sugestoes || {});
  for (const [k, v] of Object.entries(mapa)) if (agora - v >= SUGESTAO_INTERVALO) delete mapa[k];
  const recente = mapa[cls.user_hash] != null;
  if (!recente) mapa[cls.user_hash] = agora;
  return (cls.chamadas || []).filter((c) => !(recente && c.ref && c.ref.sugestao_grupo));
}

/** Depois das chamadas: linhas da tabela `posts` e alertas de falha. */
/**
 * Chamadas barradas pelo limite do Telegram (429): quais reenviar e quanto esperar antes (segundos, até 60).
 */
function limiteTelegram(chamadas, respostas) {
  const indices = [];
  let espera = 0;
  chamadas.forEach((ch, i) => {
    const r = respostas[i] || {};
    const d = String(r.description || '');
    if (r.error_code === 429 || /Too Many Requests/i.test(d)) {
      indices.push(i);
      const ra = Number((r.parameters && r.parameters.retry_after) || (d.match(/retry after (\d+)/i) || [])[1] || 5);
      espera = Math.max(espera, ra + 1);
    }
  });
  return { espera: Math.min(espera, 60), indices, reenviar: indices.map((i) => chamadas[i]) };
}

/** Junta as respostas do reenvio nas posições originais. */
function juntarReenvio(respostas, limite, respostasReenvio) {
  const out = respostas.slice();
  (limite.indices || []).forEach((idx, k) => { if (respostasReenvio[k]) out[idx] = respostasReenvio[k]; });
  return out;
}

function resultadoChamadas(chamadas, respostas, cfg, ts) {
  const posts = [];
  const falhas = [];
  chamadas.forEach((ch, i) => {
    const r = respostas[i] || {};
    if (r.ok === false || r.error) {
      // "message is not modified" ao editar teclado ou "message to delete not found" ao mover não é problema.
      const d = String(r.description || (r.error && r.error.message) || 'erro');
      if (!/not modified/i.test(d) && !(ch.metodo === 'deleteMessage' && /message to delete not found/i.test(d))) {
        falhas.push(`${ch.metodo}: ${d}`);
      }
      return;
    }
    if (ch.ref && ch.ref.registrar && r.result) {
      posts.push({
        oferta_id: ch.ref.oferta_id, plataforma: ch.ref.plataforma, categoria: ch.ref.categoria,
        message_id: r.result.message_id,
        link: linkPost(ch.ref.chat || cfg.telegram.grupo_id, ch.ref.thread, r.result.message_id),
        ts, data: new Date(ts).toISOString(),
      });
    }
  });
  const alertas = falhas.length ? paraAdmins(cfg, '⚠️ Falhas na Bot API:\n' + falhas.join('\n').slice(0, 3500)) : [];
  // Post do grupo que não saiu (mesmo depois do reenvio): a oferta não fica "aprovada" sem post.
  const saiu = (r) => !!(r && r.ok !== false && !r.error && r.result);
  const naoSaiu = chamadas.filter((ch, i) => ch.ref && ch.ref.registrar && !saiu(respostas[i]));
  let update = null;
  if (naoSaiu.length) {
    const oid = naoSaiu[0].ref.oferta_id;
    update = { oferta_id: oid, status: 'falha' };
    const card = chamadas.find((ch) => ch.metodo === 'editMessageReplyMarkup');
    if (card) {
      alertas.push(chamada('admin', 'editMessageReplyMarkup', {
        chat_id: card.payload.chat_id, message_id: card.payload.message_id, reply_markup: TECLADO('⚠️ Não saiu no grupo'),
      }));
    }
    alertas.push(...paraAdmins(cfg, `❗ A oferta ${oid} NÃO saiu no grupo (${naoSaiu.map((ch) => ch.ref.categoria).join(', ')}). ` +
      'Ficou com status "falha". Para tentar de novo, mande a oferta outra vez com /oferta.'));
  }
  return { posts, alertas, falhas, update };
}

/* ---------- convites ---------- */

function registrarConvite(cls, resposta, cfg) {
  if (!resposta || !resposta.ok || !resposta.result) {
    const d = (resposta && (resposta.description || (resposta.error && resposta.error.message))) || 'erro desconhecido';
    return { linha: null, chamadas: [msgAdmin(cls.chat_id, `❗ Não consegui criar o convite: ${d}\nO bot publicador precisa ser admin com permissão "Convidar usuários".`)] };
  }
  const url = resposta.result.invite_link;
  return {
    linha: { nome: cls.nome, categoria: cls.categoria, url, ts: cls.ts, data: new Date(cls.ts).toISOString() },
    chamadas: [msgAdmin(cls.chat_id, `🔗 Convite "${cls.nome}" (${cls.categoria}):\n${url}\n\nUse este link só neste anúncio/campanha. As entradas aparecem no relatório diário.`)],
  };
}

/* ---------- coleta Shopee ---------- */

function montarBuscasShopee(cfg, ts) {
  const out = [];
  const tsSeg = Math.floor(ts / 1000);
  for (const [categoria, palavras] of Object.entries(cfg.shopee.buscas || {})) {
    if (!cfg.categorias[categoria]) continue;
    for (const keyword of palavras) {
      out.push({ categoria, keyword, http: shopee.reqOfertas(cfg.shopee, keyword, { sortType: 2, limit: 20 }, tsSeg) });
    }
  }
  return out;
}

function avaliarCandidatos(buscas, respostas, precosRows, ofertasRows, cfg, ts) {
  const s = cfg.shopee;
  const vistos = new Set();
  const produtos = [];
  const erros = [];
  buscas.forEach((b, i) => {
    const r = respostas[i] || {};
    const lido = r.error ? { erro: String(r.error.message || r.error), produtos: [] } : shopee.lerOfertas(r);
    if (lido.erro) erros.push(`${b.keyword}: ${lido.erro}`);
    for (const p of lido.produtos) {
      if (vistos.has(p.produto_id)) continue;
      vistos.add(p.produto_id);
      produtos.push(Object.assign(p, { categoria: b.categoria }));
    }
  });

  const porProduto = {};
  for (const r of precosRows || []) if (r && r.produto_id) (porProduto[r.produto_id] = porProduto[r.produto_id] || []).push(r);
  const recentes = {};
  for (const o of ofertasRows || []) {
    if (o && o.produto_id && o.ts >= ts - 3 * DIA) (recentes[o.produto_id] = recentes[o.produto_id] || []).push(o);
  }

  const precosNovos = [];
  const candidatas = [];
  for (const p of produtos) {
    const hist = porProduto[p.produto_id] || [];
    if (precisaSnapshot(hist, p.preco, ts)) precosNovos.push(linhaPreco(p.produto_id, 'shopee', p.preco, 'coleta', '', ts));
    if (p.desconto_loja_pct < s.min_desconto_pct || p.comissao_pct < s.min_comissao_pct || p.vendas < s.min_vendas) continue;
    if ((recentes[p.produto_id] || []).some((o) => Number(o.preco) <= p.preco)) continue;
    const sel = avaliarSelo(hist, p.preco, { agora: ts, tolerancia_pct: cfg.selo.tolerancia_pct, dias: cfg.selo.dias });
    if (sel.selo === 'acima') continue;
    if (sel.selo === 'sem_ref' && !s.enviar_sem_ref) continue;
    candidatas.push({ p, sel, nota: (sel.selo === 'ok' ? 1000 : 0) + p.desconto_loja_pct * p.comissao_pct });
  }
  candidatas.sort((a, b) => b.nota - a.nota);

  const ofertasNovas = [];
  const chamadas = [];
  for (const { p, sel } of candidatas.slice(0, s.max_cards)) {
    const o = Object.assign({}, p, { oferta_id: novoId('o', ts + ofertasNovas.length), ts, origem: 'shopee', top: false });
    const linha = linhaOferta(o, sel);
    ofertasNovas.push(linha);
    for (const admin of cfg.admins) chamadas.push(chamadaCard(linha, cfg, admin));
  }
  if (erros.length) chamadas.push(...paraAdmins(cfg, '⚠️ Coleta Shopee com erro:\n' + erros.slice(0, 10).join('\n')));
  return { precosNovos, ofertasNovas, chamadas, resumo: { buscas: buscas.length, produtos: produtos.length, candidatas: candidatas.length, cards: ofertasNovas.length, erros } };
}

/* ---------- relatório diário ---------- */

function relatorioDiario(dados, cfg, ts) {
  const hoje = diaISO(ts, cfg.fuso);
  const doDia = (r) => r && r.ts && diaISO(Number(r.ts), cfg.fuso) === hoje;
  const posts = (dados.posts || []).filter(doDia);
  const ofertas = (dados.ofertas || []).filter((r) => r && r.oferta_id);
  const entradas = (dados.entradas || []).filter((r) => r && r.tipo);
  const links = (dados.links || []).filter(doDia);

  const conta = (arr, chave) => arr.reduce((acc, r) => ((acc[r[chave] || '—'] = (acc[r[chave] || '—'] || 0) + 1), acc), {});
  const fmt = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v}`).join('\n') || '  —';

  const entHoje = entradas.filter(doDia);
  const porConvite = {};
  for (const e of entradas) {
    if (e.tipo !== 'entrada') continue;
    porConvite[e.convite_nome] = porConvite[e.convite_nome] || { entradas: 0, hoje: 0 };
    porConvite[e.convite_nome].entradas++;
    if (doDia(e)) porConvite[e.convite_nome].hoje++;
  }
  // Saídas por convite: liga a saída à última entrada do mesmo usuário.
  const ultimaEntrada = {};
  const saidas = {};
  for (const e of entradas.slice().sort((a, b) => a.ts - b.ts)) {
    if (e.tipo === 'entrada') ultimaEntrada[e.user_hash] = e.convite_nome;
    else if (e.tipo === 'saida' && ultimaEntrada[e.user_hash]) saidas[ultimaEntrada[e.user_hash]] = (saidas[ultimaEntrada[e.user_hash]] || 0) + 1;
  }
  const linhasConvite = Object.entries(porConvite)
    .sort((a, b) => b[1].entradas - a[1].entradas)
    .slice(0, 20)
    .map(([nome, v]) => {
      const s = saidas[nome] || 0;
      const ret = v.entradas ? Math.round(((v.entradas - s) / v.entradas) * 100) : 0;
      return `  ${nome}: +${v.hoje} hoje · ${v.entradas} total · ${s} saíram · retenção ${ret}%`;
    });

  const pendentes = ofertas.filter((o) => o.status === 'pendente');
  const ofertasHoje = ofertas.filter(doDia);
  const linhasRel = [
    `📊 ${cfg.marca}: resumo de ${formatData(ts, cfg.fuso)}`,
    '',
    `Ofertas recebidas hoje: ${ofertasHoje.length} (aprovadas ${ofertasHoje.filter((o) => o.status === 'aprovada').length}, rejeitadas ${ofertasHoje.filter((o) => o.status === 'rejeitada').length})`,
    `Selo nas recebidas: ${Object.entries(conta(ofertasHoje, 'selo')).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}`,
    `Pendentes agora: ${pendentes.length}`,
    '',
    `Posts no Telegram hoje: ${posts.length}`,
    fmt(conta(posts, 'categoria')),
    '',
    `Links gerados hoje por plataforma:`,
    fmt(conta(links, 'plataforma')),
    '',
    `Grupo do Telegram hoje: entradas +${entHoje.filter((e) => e.tipo === 'entrada').length} · saídas −${entHoje.filter((e) => e.tipo === 'saida').length}`,
    'Por link de convite:',
    linhasConvite.join('\n') || '  —',
    ...(entHoje.some((e) => e.tipo === 'start') ? ['', `/start no bot publicador hoje: ${entHoje.filter((e) => e.tipo === 'start').length}`, fmt(conta(entHoje.filter((e) => e.tipo === 'start'), 'convite_nome'))] : []),
    '',
    'Lembrete: comissão e cliques ficam nos painéis da Shopee/Amazon/ML (filtre pelo sub-ID/tag).',
  ];
  const semAfiliado = {};
  for (const o of ofertasHoje.filter((x) => x.status === 'aprovada')) {
    const d = dicaAfiliado(o.loja, cfg, parseManuais(o.links_manuais));
    if (d) semAfiliado[d.nome] = d;
  }
  const lojasDica = Object.values(semAfiliado);
  if (lojasDica.length) {
    linhasRel.push('', `💰 Publicadas hoje sem seu código de afiliado: ${lojasDica.map((d) => d.nome).join(', ')} → veja /afiliados`);
  }
  const texto = linhasRel.join('\n');
  const chamadas = paraAdmins(cfg, texto.slice(0, 4000));
  if (cfg.divulgar && cfg.divulgar.auto_diario !== false && Object.keys((cfg.telegram && cfg.telegram.canais) || {}).length >= 2) {
    chamadas.push(...montarDivulgacaoCanais('', cfg).chamadasGrupo);
  }
  return { chamadas };
}

/* ---------- setup ---------- */

function setupChamadas(cfg) {
  const t = cfg.telegram;
  const avisos = [];
  const chamadas = [];
  if (!t.bot_token) {
    avisos.push('Preencha bot_token na tabela config e rode o setup de novo.');
    return { chamadas, avisos };
  }
  chamadas.push(chamada('admin', 'getMe', {}));
  if (t.n8n_webhook_url) {
    const admin = ['message', 'callback_query'];
    const grupo = ['my_chat_member'].concat(cfg.rastrear_entradas ? ['chat_member'] : [], cfg.limpar_avisos ? ['message'] : []);
    // false: numa troca de túnel o Telegram entrega os cliques e mensagens que guardou enquanto o webhook estava fora.
    const base = { url: t.n8n_webhook_url, secret_token: t.webhook_secret, drop_pending_updates: false };
    if (t.dois_bots) {
      chamadas.push(chamada('admin', 'setWebhook', Object.assign({}, base, { allowed_updates: admin })));
      chamadas.push(chamada('grupo', 'getMe', {}));
      // ?bot=grupo: o router sabe qual bot recebeu o update e responde pelo mesmo (o filtro do túnel só olha o caminho).
      const urlGrupo = t.n8n_webhook_url + (t.n8n_webhook_url.includes('?') ? '&' : '?') + 'bot=grupo';
      chamadas.push(chamada('grupo', 'setWebhook', Object.assign({}, base, { url: urlGrupo, allowed_updates: grupo })));
    } else {
      chamadas.push(chamada('admin', 'setWebhook', Object.assign({}, base, { allowed_updates: admin.concat(grupo) })));
      avisos.push('Usando um bot só: ele recebe todas as mensagens do grupo (cada uma é 1 execução no n8n). Recomendo um bot publicador separado.');
    }
    chamadas.push(chamada('admin', 'setMyCommands', {
      commands: [
        { command: 'radar', description: 'Caçar promoções agora (roda sozinho a cada 10 min)' },
        { command: 'buscas', description: 'Definir palavras/nichos do radar' },
        { command: 'canais', description: 'Ligar os canais separados por categoria' },
        { command: 'divulgar', description: 'Divulgar os outros canais (com logo)' },
        { command: 'logo', description: 'Definir o logo de um canal' },
        { command: 'afiliados', description: 'Onde cadastrar código de afiliado' },
        { command: 'link', description: 'Extrair oferta só pelo link' },
        { command: 'modo', description: 'Modo piloto, rápido (0 cliques) ou card' },
        { command: 'config', description: 'Configuração rápida' },
        { command: 'oferta', description: 'Enviar oferta completa manual' },
        { command: 'convite', description: 'Criar link de convite nomeado' },
        { command: 'links', description: 'Links de divulgação por tópico' },
        { command: 'id', description: 'Mostrar meu ID' },
        { command: 'ajuda', description: 'Ajuda' },
      ],
    }));
  } else {
    avisos.push('Preencha n8n_webhook_url (Production URL do Webhook do workflow 01, já ativado) e rode o setup de novo.');
  }
  if (t.grupo_id) {
    chamadas.push(chamada('grupo', 'getChat', { chat_id: t.grupo_id }));
    for (const [chave, c] of Object.entries(cfg.categorias)) {
      if (!t.topicos[chave]) {
        chamadas.push(chamada('grupo', 'createForumTopic', { chat_id: t.grupo_id, name: `${c.emoji} ${c.nome}` }, { topico: chave }));
      }
    }
  } else if (Object.keys(t.canais || {}).length) {
    for (const canal of Object.values(t.canais)) chamadas.push(chamada('grupo', 'getChat', { chat_id: canal }));
  } else {
    avisos.push('Falta grupo_id ou canais: adicione o bot publicador como admin do supergrupo (com Tópicos) ou dos canais e use /canais.');
  }
  if (!cfg.admins.length) avisos.push('Falta admins: mande /id ao bot de aprovação e preencha a linha admins.');
  return { chamadas, avisos };
}

const QUEM = { admin: 'Bot de aprovação', grupo: 'Bot publicador' };

/** Erro da Bot API em português, com o que fazer. */
function erroAmigavel(d) {
  if (/Unauthorized|Not Found/i.test(d)) return 'token inválido: confira na bfx_config';
  if (/chat not found/i.test(d)) return 'grupo não encontrado: confira grupo_id e se o bot publicador está no grupo';
  if (/not enough rights|CHAT_ADMIN_REQUIRED|need administrator rights/i.test(d)) return 'falta permissão de admin para o bot publicador';
  if (/bad webhook|HTTPS url must be provided|Failed to resolve host/i.test(d)) return 'endereço do webhook inválido: confira n8n_webhook_url';
  if (/Too Many Requests|retry after/i.test(d)) return 'o Telegram pediu para ir mais devagar; rode de novo em 1 minuto';
  return d;
}

function resumoSetup(chamadas, respostas, avisos, cfg) {
  const linhas = [];
  const topicos = [];
  let grupo_tem_fixada = false;
  let grupo_fixada_id = 0;
  let erros = 0;
  const config = [];
  chamadas.forEach((ch, i) => {
    const r = respostas[i] || {};
    const quem = QUEM[ch.bot] || ch.bot;
    if (r.ok !== true) {
      erros++;
      const d = r.description || (r.error && r.error.message) || 'sem resposta';
      const oQue = { getMe: quem, setWebhook: `Webhook (${quem.toLowerCase()})`, setMyCommands: 'Comandos do bot', getChat: 'Grupo', createForumTopic: `Tópico ${ch.ref && ch.ref.topico}` }[ch.metodo] || ch.metodo;
      linhas.push(`❌ ${oQue}: ${erroAmigavel(d)}`);
      return;
    }
    if (ch.metodo === 'getMe') linhas.push(`✅ ${quem}: @${r.result.username}`);
    // @ do bot publicador para os links de divulgação (/links). Com um bot só, é o próprio bot de aprovação.
    if (ch.metodo === 'getMe' && r.result.username && (ch.bot === 'grupo' || !cfg.telegram.dois_bots) && r.result.username !== cfg.telegram.bot_grupo_username) {
      config.push({ chave: 'bot_grupo_username', valor: r.result.username });
    }
    else if (ch.metodo === 'setWebhook') linhas.push(`✅ Webhook ligado (${quem.toLowerCase()})`);
    else if (ch.metodo === 'getChat' && r.result.type === 'channel') {
      linhas.push(`✅ Canal: ${r.result.title}`);
    } else if (ch.metodo === 'getChat') {
      if (r.result.pinned_message) { grupo_tem_fixada = true; grupo_fixada_id = r.result.pinned_message.message_id || 0; }
      linhas.push(r.result.is_forum ? `✅ Grupo: ${r.result.title}` : `❌ Grupo ${r.result.title}: ative os Tópicos nas configurações do grupo`);
      if (!r.result.is_forum) erros++;
    } else if (ch.metodo === 'createForumTopic') {
      topicos.push({ chave: `topico.${ch.ref.topico}`, valor: String(r.result.message_thread_id) });
      const c = cfg.categorias[ch.ref.topico];
      linhas.push(`✅ Tópico criado: ${c ? c.emoji + ' ' + c.nome : ch.ref.topico}`);
    }
  });
  const texto = ['⚙️ Setup', ...linhas, ...(avisos.length ? ['', 'Falta fazer:', ...avisos.map((a) => '• ' + a)] : [])].join('\n');
  // Só manda mensagem quando há algo a fazer: erro, aviso ou tópico novo. Tudo ok = silêncio (o resumo fica no nó do n8n).
  const avisar = erros > 0 || avisos.length > 0 || topicos.length > 0;
  return { texto, topicos, config, grupo_tem_fixada, grupo_fixada_id, chamadas: avisar ? paraAdmins(cfg, texto) : [] };
}

function segredoAleatorio(ts) {
  return sha256Hex(String(ts) + ':' + Math.random() + ':' + Math.random()).slice(0, 48);
}

module.exports = {
  pendenciasLinks, avaliarNovaOferta, prepararOferta, decidirCallback, lerRespostasShopee, prepararPublicacao, resultadoChamadas,
  limiteTelegram, juntarReenvio, registrarConvite, montarBuscasShopee, avaliarCandidatos, relatorioDiario, setupChamadas, resumoSetup,
  segredoAleatorio, chamadaCard, esquema, linhaOferta, linhaPreco,
  decidirPosPublicacao, postCanal, textoEncerradoPadrao, tecladoPublicada, boasVindasStart, startComConvite, filtrarSugestao, TOP_LIMITE, temDestinoTelegram,
};
