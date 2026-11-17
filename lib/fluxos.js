'use strict';
// Funções de alto nível chamadas pelos Code nodes do n8n. Todas puras: recebem dados,
// devolvem linhas para as Data Tables e chamadas para a Bot API.
const { novoId, formatBRL, formatData, diaISO, truncar } = require('./util');
const { nomeLoja } = require('./lojas');
const { avaliarSelo, precisaSnapshot } = require('./selo');
const { planejarLinks, consolidar, tagAmazon, parseManuais } = require('./links');
const { PLATAFORMAS } = require('./subid');
const shopee = require('./shopee');
const textos = require('./textos');
const { chamada, msgAdmin, paraAdmins, linkMensagem } = require('./telegram');
const { esquema } = require('./config');
const { sha256Hex } = require('./sha256');

const DIA = 24 * 60 * 60 * 1000;
const TECLADO = (texto) => ({ inline_keyboard: [[{ text: texto, callback_data: 'noop' }]] });

/* ---------- pendências de links (antes de publicar) ---------- */

function pendenciasLinks(oferta, cfg) {
  const manuais = parseManuais(oferta.links_manuais);
  const faltam = PLATAFORMAS.filter((p) => !manuais[p]);
  const out = [];
  if (!faltam.length) return out;
  if (oferta.loja === 'shopee' && !(cfg.shopee.app_id && cfg.shopee.secret)) {
    out.push(`BLOQUEIO: configure shopee.app_id/secret ou informe links manuais (${faltam.join(', ')})`);
  } else if (oferta.loja === 'amazon') {
    const sem = faltam.filter((p) => !tagAmazon(cfg, oferta.categoria, p));
    if (sem.length) out.push(`BLOQUEIO: falta tag da Amazon para ${sem.map((p) => oferta.categoria + '_' + p).join(', ')}`);
    else if (faltam.some((p) => !(cfg.amazon.tags[`${oferta.categoria}_${p}`] || cfg.amazon.tags[oferta.categoria]))) {
      out.push('Usando amazon.tag_padrao: atribuição por plataforma perdida');
    }
  } else if (oferta.loja === 'ml') {
    if (faltam.length === PLATAFORMAS.length) out.push('BLOQUEIO: Mercado Livre precisa dos links de afiliado (linhas tg/wac/wag/x)');
    else out.push(`ML sem link próprio para: ${faltam.join(', ')} (atribuição somada)`);
  } else if (oferta.loja === 'outra') {
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

/** Card de aprovação (sendMessage com prévia da imagem). */
function chamadaCard(linha, cfg, chatId) {
  const pend = pendenciasLinks(linha, cfg);
  const card = textos.cardAprovacao(cardView(linha, cfg), cfg, pend);
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
  return Object.assign({}, linha, {
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
  if (o.ref90 != null) precosNovos.push(linhaPreco(o.produto_id, o.loja, o.ref90, 'ref90', o.ref90_fonte, ts));
  const linha = linhaOferta(o, sel);
  return { oferta: linha, precosNovos, chamadas: [chamadaCard(linha, cfg, entrada.chat_id)] };
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

  // a | r | t → publicar
  if (oferta.selo !== 'ok') return fim([responder('Sem selo ✓ Desconto real: não dá para publicar.', true)]);
  const bloqueio = pendenciasLinks(oferta, cfg).find((p) => p.startsWith('BLOQUEIO'));
  if (bloqueio) return fim([responder(bloqueio.slice(0, 190), true)]);

  const pub = Object.assign({}, oferta, { relampago: cb.acao === 'r', top: cb.acao === 't' || !!oferta.top });
  let linkItens;
  try {
    linkItens = planejarLinks(pub, cfg, cb.ts);
  } catch (e) {
    return fim([responder('Erro ao gerar links: ' + e.message, true)]);
  }
  return {
    proximo: 'publicar',
    chamadas: [responder('Publicando…'), marcar('⏳ Publicando…')],
    update: Object.assign(base, { status: 'publicando', relampago: pub.relampago, top: pub.top }),
    oferta: pub,
    linkItens,
  };
}

/** Junta as respostas da Shopee aos itens planejados (mesma ordem). */
function lerRespostasShopee(itens, respostas) {
  return itens.map((it, i) => {
    if (it.metodo !== 'shopee') return it;
    const r = respostas[i] || {};
    const lido = r.error ? { erro: String(r.error.message || r.error) } : shopee.lerShortLink(r);
    return Object.assign({}, it, { http: undefined, url: lido.url || '', erro: lido.erro || '' });
  });
}

/* ---------- publicação ---------- */

function postGrupo(oferta, link, cfg, topicoChave, categoriaRegistro) {
  const t = cfg.telegram;
  const thread = t.topicos[topicoChave];
  const payload = {
    chat_id: t.grupo_id,
    parse_mode: 'HTML',
    text: textos.textoTelegram(oferta, link, cfg),
    // Imagem como prévia grande acima do texto: se a URL da imagem falhar, o post sai mesmo assim
    // (sendPhoto recusaria a mensagem inteira).
    link_preview_options: { url: oferta.imagem || link, prefer_large_media: true, show_above_text: !!oferta.imagem },
  };
  if (thread) payload.message_thread_id = thread;
  const ref = { registrar: true, oferta_id: oferta.oferta_id, plataforma: 'tg', categoria: categoriaRegistro, thread: thread || null };
  return chamada('grupo', 'sendMessage', payload, ref);
}

function prepararPublicacao(oferta, itens, cfg, ctx) {
  const ts = ctx.ts;
  const c = consolidar(itens);
  const exigidas = ['tg', 'wac', 'x'].concat(oferta.relampago ? ['wag'] : []);
  const faltando = exigidas.filter((p) => !c.links[p]);

  if (!cfg.telegram.grupo_id || faltando.length) {
    const motivo = !cfg.telegram.grupo_id ? 'grupo_id não configurado' : `sem link para: ${faltando.join(', ')}`;
    const card = textos.cardAprovacao(cardView(oferta, cfg), cfg, pendenciasLinks(oferta, cfg));
    return {
      ok: false,
      chamadas: [
        msgAdmin(ctx.chat_id, `❗ Não publiquei a oferta ${oferta.oferta_id}: ${motivo}\n${c.avisos.join('\n')}`.trim()),
        chamada('admin', 'editMessageReplyMarkup', { chat_id: ctx.chat_id, message_id: ctx.message_id, reply_markup: card.reply_markup }),
      ],
      linksRows: [],
      update: { oferta_id: oferta.oferta_id, status: 'pendente' },
    };
  }

  const cat = cfg.categorias[oferta.categoria] || { nome: oferta.categoria, emoji: '' };
  const chamadas = [postGrupo(oferta, c.links.tg, cfg, oferta.categoria, oferta.categoria)];
  if (oferta.top && cfg.telegram.topicos.top) chamadas.push(postGrupo(oferta, c.links.tg, cfg, 'top', 'top'));

  const ordem = ['1) Canal do WhatsApp', '2) X: post (anexe a imagem)', '3) X: 1ª resposta'];
  if (oferta.relampago) ordem.push('4) Grupo do WhatsApp (alerta relâmpago, cole em vez de encaminhar)');
  const cabecalho = [
    `✅ Publicada no Telegram: ${cat.emoji} ${cat.nome}${oferta.top ? ' + Top do Dia' : ''}`,
    `${truncar(oferta.titulo, 60)} · ${formatBRL(oferta.preco)}`,
    '',
    'Textos para copiar (um por mensagem):',
    ...ordem,
  ];
  if (c.avisos.length) cabecalho.push('', '⚠️ ' + c.avisos.join('\n⚠️ '));
  chamadas.push(msgAdmin(ctx.chat_id, cabecalho.join('\n')));
  chamadas.push(msgAdmin(ctx.chat_id, textos.textoWhatsAppCanal(oferta, c.links.wac, cfg)));
  chamadas.push(msgAdmin(ctx.chat_id, textos.textoX(oferta, cfg)));
  chamadas.push(msgAdmin(ctx.chat_id, textos.textoXResposta(c.links.x)));
  if (oferta.relampago) chamadas.push(msgAdmin(ctx.chat_id, textos.textoWhatsAppGrupo(oferta, c.links.wag, cfg)));
  chamadas.push(chamada('admin', 'editMessageReplyMarkup', {
    chat_id: ctx.chat_id, message_id: ctx.message_id,
    reply_markup: TECLADO(oferta.relampago ? '⚡ Publicada (relâmpago)' : '✅ Publicada'),
  }));

  const linksRows = PLATAFORMAS.filter((p) => c.links[p]).map((p) => ({
    oferta_id: oferta.oferta_id, categoria: oferta.categoria, plataforma: p, sub_id: c.sub_ids[p], url: c.links[p], ts,
    data: new Date(ts).toISOString(),
  }));
  return { ok: true, chamadas, linksRows, update: { oferta_id: oferta.oferta_id, status: 'aprovada' } };
}

/** Depois das chamadas: linhas da tabela `posts` e alertas de falha. */
function resultadoChamadas(chamadas, respostas, cfg, ts) {
  const posts = [];
  const falhas = [];
  chamadas.forEach((ch, i) => {
    const r = respostas[i] || {};
    if (r.ok === false || r.error) {
      // "message is not modified" ao editar teclado não é problema.
      const d = String(r.description || (r.error && r.error.message) || 'erro');
      if (!/not modified/i.test(d)) falhas.push(`${ch.metodo}: ${d}`);
      return;
    }
    if (ch.ref && ch.ref.registrar && r.result) {
      posts.push({
        oferta_id: ch.ref.oferta_id, plataforma: ch.ref.plataforma, categoria: ch.ref.categoria,
        message_id: r.result.message_id,
        link: linkMensagem(cfg.telegram.grupo_id, ch.ref.thread, r.result.message_id),
        ts, data: new Date(ts).toISOString(),
      });
    }
  });
  const alertas = falhas.length ? paraAdmins(cfg, '⚠️ Falhas na Bot API:\n' + falhas.join('\n').slice(0, 3500)) : [];
  return { posts, alertas, falhas };
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
    else if (ultimaEntrada[e.user_hash]) saidas[ultimaEntrada[e.user_hash]] = (saidas[ultimaEntrada[e.user_hash]] || 0) + 1;
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
  const texto = [
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
    '',
    'Lembrete: comissão e cliques ficam nos painéis da Shopee/Amazon/ML (filtre pelo sub-ID/tag).',
  ].join('\n');
  return { chamadas: paraAdmins(cfg, texto.slice(0, 4000)) };
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
    const base = { url: t.n8n_webhook_url, secret_token: t.webhook_secret, drop_pending_updates: true };
    if (t.dois_bots) {
      chamadas.push(chamada('admin', 'setWebhook', Object.assign({}, base, { allowed_updates: admin })));
      chamadas.push(chamada('grupo', 'getMe', {}));
      chamadas.push(chamada('grupo', 'setWebhook', Object.assign({}, base, { allowed_updates: grupo })));
    } else {
      chamadas.push(chamada('admin', 'setWebhook', Object.assign({}, base, { allowed_updates: admin.concat(grupo) })));
      avisos.push('Usando um bot só: ele recebe todas as mensagens do grupo (cada uma é 1 execução no n8n). Recomendo um bot publicador separado.');
    }
    chamadas.push(chamada('admin', 'setMyCommands', {
      commands: [
        { command: 'oferta', description: 'Enviar oferta para aprovação' },
        { command: 'convite', description: 'Criar link de convite nomeado' },
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
  } else {
    avisos.push('Falta grupo_id: adicione o bot publicador como admin do supergrupo (com Tópicos ativos); ele avisa o ID aos admins.');
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
  let erros = 0;
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
    else if (ch.metodo === 'setWebhook') linhas.push(`✅ Webhook ligado (${quem.toLowerCase()})`);
    else if (ch.metodo === 'getChat') {
      if (r.result.pinned_message) grupo_tem_fixada = true;
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
  return { texto, topicos, grupo_tem_fixada, chamadas: avisar ? paraAdmins(cfg, texto) : [] };
}

function segredoAleatorio(ts) {
  return sha256Hex(String(ts) + ':' + Math.random() + ':' + Math.random()).slice(0, 48);
}

module.exports = {
  pendenciasLinks, avaliarNovaOferta, decidirCallback, lerRespostasShopee, prepararPublicacao, resultadoChamadas,
  registrarConvite, montarBuscasShopee, avaliarCandidatos, relatorioDiario, setupChamadas, resumoSetup,
  segredoAleatorio, chamadaCard, esquema,
};
