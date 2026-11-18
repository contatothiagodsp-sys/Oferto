'use strict';
const { parseOferta, parseRespostaCard, resolverCategoria, AJUDA } = require('./parse-oferta');
const { interpretarComandoConfig, interpretarComandoRadar, interpretarComandoLogo, resolverCategoriaCfg } = require('./config');
const { tecladoEnviarWhatsApp } = require('./copy');
const { ehAfiliadoCurto, tagAmazonDaUrl, extrairLinksProduto, parseMensagemLink, parseRespostaPreco, parseComandoCupomLoja } = require('./extrator');
const { planejarAutoOnboardingCanal, parseComandoAlerta } = require('./comunidade');
const { agenteAtivo, detectarPedidoOfertaChat, interpretarComandoAgentes } = require('./agentes');
const { sha256Hex } = require('./sha256');
const { slug, inicioDoDia, escapeHtml, truncar } = require('./util');
const { identificar } = require('./lojas');

/** Uma chamada à Bot API. bot: 'admin' (aprovação) ou 'grupo' (publicador). */
function chamada(bot, metodo, payload, ref) {
  return { bot, metodo, payload, ref: ref || null };
}

function msgAdmin(chatId, texto, extra) {
  return chamada('admin', 'sendMessage', Object.assign({ chat_id: chatId, text: texto, link_preview_options: { is_disabled: true } }, extra || {}));
}

/** Mesma mensagem para todos os admins. */
function paraAdmins(cfg, texto, extra) {
  return (cfg.admins || []).map((id) => msgAdmin(id, texto, extra));
}

const COMANDOS = [
  '📡 /radar – caça promoções agora (automático a cada 2 min nos picos)',
  '🔥 /radar alta · /radar moda · /radar cupons – bombando, roupas/tênis e cupons de lojas',
  '🔎 /radar arabes · /radar kabum · /radar farmacia – busca rápida por loja/nicho',
  '🎟️ /cupom ml Lote das 19h – anuncia lote/cupom da loja com logo e aba de cupons',
  '🎯 /buscas – definir palavras/nichos automáticos do radar',
  '🔗 Só colar o link – extrai dados, cupom, parcelamento e gera os textos na hora',
  '📢 /canais – ligar canais separados (auto-conecta ao adicionar o bot como admin!)',
  '🖼️ /logo moda <url> – logo do canal (ou foto com legenda /logo moda no publicador)',
  '📣 /divulgar [moda] – divulga os outros canais (com logo)',
  '🏆 /resumao – gera o Top 5 Ofertas Ainda Ativas do Dia (Telegram + WhatsApp)',
  '📊 /demanda – mostra o que os membros mais pedem via /alerta',
  '🤖 /agentes – status e controle dos 5 agentes autônomos (caçador, auditor, marketing, concierge, guardião)',
  '💼 /afiliados – onde cadastrar código de afiliado em cada loja',
  '/modo piloto – tudo automático (radar 2 min + links + guardião)',
  '/modo aprovar – recebe card antes de publicar',
  '/config – ver ou ajustar configurações rápidas',
  '/oferta – formato completo manual (mande /oferta sozinho para ver)',
  '/convite casa meta_casa_v1 – cria link de convite nomeado',
  '/links – links de divulgação por tópico',
  '/id – mostra seu ID do Telegram',
  '/ajuda – esta mensagem',
].join('\n');

function hashUsuario(userId, cfg) {
  // Sal próprio (hash_sal, gerado pelo setup); instalações antigas sem ele seguem com o webhook_secret.
  return sha256Hex(String(cfg.hash_sal || cfg.telegram.webhook_secret || 'sal') + ':' + userId).slice(0, 16);
}

const MEMBRO = ['member', 'administrator', 'creator', 'restricted'];

function ehMembro(cm) {
  if (!cm) return false;
  if (cm.status === 'restricted') return cm.is_member !== false;
  return MEMBRO.includes(cm.status);
}

// Mensagens de serviço que o bot apaga. Nunca inclua forum_topic_created: apagar essa mensagem apaga o tópico inteiro.
const AVISOS = [
  'new_chat_members', 'left_chat_member', 'new_chat_title', 'new_chat_photo', 'delete_chat_photo', 'pinned_message',
  'forum_topic_edited', 'forum_topic_closed', 'forum_topic_reopened', 'general_forum_topic_hidden', 'general_forum_topic_unhidden',
  'message_auto_delete_timer_changed', 'video_chat_scheduled', 'video_chat_started', 'video_chat_ended', 'video_chat_participants_invited',
  'boost_added', 'chat_background_set',
];

// Antispam do 💬 Conversa: convites de outros grupos, WhatsApp e encurtadores (inclusive links curtos de afiliado).
const SPAM = new RegExp([
  '(?:^|[^\\w.-])(?:t|telegram)\\.(?:me|dog)/',
  'chat\\.whatsapp\\.com',
  'api\\.whatsapp\\.com',
  '(?:^|[^\\w.-])wa\\.me/',
  '(?:^|[^\\w.-])(?:bit\\.ly|encurtador\\.com\\.br|tinyurl\\.com|cutt\\.ly|is\\.gd|abre\\.ai|s\\.shopee\\.com\\.br|shope\\.ee|amzn\\.to|a\\.co|meli\\.la|shein\\.top|shein\\.onelink\\.me|vt\\.tiktok\\.com|vm\\.tiktok\\.com|tidd\\.ly|compre\\.vc)/',
  'mercadoli(?:vre|bre)\\.com/sec/',
  '(?:www\\.)?tiktok\\.com/t/',
].join('|'), 'i');
const LOJA_URL = /(?:https?:\/\/)?(?:[\w-]+\.)*(?:(?:amazon|shopee|mercadolivre|kabum|terabyteshop|pichau|drogaraia|drogasil|drogariaspacheco|belezanaweb|epocacosmeticos|natura|boticario|sephora|araujo|paguemenos|centauro|netshoes|nike|adidas|lojasrenner|cea|riachuelo|dafiti|zattini|hering)\.com\.br|panvel\.com|(?:br\.)?shein\.com|www\.tiktok\.com\/view\/product)\/[^\s<>"']*/gi;

/** Texto + legenda + links escondidos (text_link) de uma mensagem. */
function textoDaMensagem(msg) {
  const ents = (msg.entities || []).concat(msg.caption_entities || []);
  return [msg.text || '', msg.caption || ''].concat(ents.filter((e) => e.type === 'text_link' && e.url).map((e) => e.url)).join('\n');
}

/** Links de produto da Amazon, Shopee, Mercado Livre, Shein ou TikTok Shop no texto (até 3, sem repetir). */
function linksDeLoja(texto) {
  const out = [];
  const vistos = new Set();
  for (const bruto of String(texto || '').match(LOJA_URL) || []) {
    const url = (/^https?:\/\//i.test(bruto) ? bruto : 'https://' + bruto).replace(/[).,;:!?]+$/, '');
    const id = identificar(url);
    if (id.erro || id.loja === 'outra' || vistos.has(id.produto_id)) continue;
    vistos.add(id.produto_id);
    out.push({ url, loja: id.loja, url_limpa: id.url_limpa, produto_id: id.produto_id });
    if (out.length === 3) break;
  }
  return out;
}

function ehChatGrupoModerado(chat, cfg) {
  if (!chat) return false;
  const t = (cfg && cfg.telegram) || {};
  if (t.grupo_id && String(chat.id) === String(t.grupo_id)) return true;
  return chat.type === 'supergroup' || chat.type === 'group';
}

function nomeUsuarioTg(u) {
  if (!u) return 'Alguém';
  const nome = [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.username || `ID ${u.id}`;
  return u.username && !nome.includes(u.username) ? `${nome} (@${u.username})` : nome;
}

/**
 * Comando /admin (ou /denuncia, /report, @admin) no chat do grupo ou comentários dos canais:
 * apaga o comando, envia aviso discreto e notifica os admins no privado com botões de ação em 1 clique.
 */
function denunciaDoGrupo(msg, cfg) {
  if (!msg || !msg.chat) return null;
  const from = msg.from || {};
  if (from.is_bot) return null;
  const textoBruto = String(msg.text || msg.caption || '').trim();
  const m = textoBruto.match(/^(?:\/(?:admin|denuncia|denunciar|report)(?:@\w+)?|@admin)\b\s*([\s\S]*)$/i);
  if (!m) return null;

  const chatId = msg.chat.id;
  const threadId = msg.is_topic_message && msg.message_thread_id ? msg.message_thread_id : null;
  const rep = msg.reply_to_message || null;
  const motivo = m[1].trim() || 'Não informado (uso rápido de /admin)';

  const chamadas = [
    chamada('grupo', 'deleteMessage', { chat_id: chatId, message_id: msg.message_id }),
    chamada('grupo', 'sendMessage', Object.assign(
      {
        chat_id: chatId,
        text: '🛡️ A moderação foi acionada e já recebeu a denúncia para análise.',
        disable_notification: true,
      },
      threadId ? { message_thread_id: threadId } : {},
      rep && rep.message_id ? { reply_parameters: { message_id: rep.message_id, allow_sending_without_reply: true } } : {},
    )),
  ];

  const tituloChat = msg.chat.title ? `${msg.chat.title} (${chatId})` : String(chatId);
  const linhas = [
    '🚨 <b>DENÚNCIA NO CHAT (/admin)</b>',
    `💬 <b>Grupo:</b> ${escapeHtml(tituloChat)}`,
    `👤 <b>Quem acionou:</b> ${escapeHtml(nomeUsuarioTg(from))}`,
    `📝 <b>Motivo:</b> ${escapeHtml(truncar(motivo, 300))}`,
  ];
  const botoes = [];
  if (rep && rep.message_id) {
    const textoAlvo = rep.text || rep.caption || '[mídia sem texto]';
    linhas.push(
      '',
      `⚠️ <b>Mensagem denunciada (#${rep.message_id}):</b>`,
      `• <b>Autor:</b> ${escapeHtml(nomeUsuarioTg(rep.from))}${rep.from && rep.from.id ? ` (<code>${rep.from.id}</code>)` : ''}`,
      `• <b>Conteúdo:</b> <i>${escapeHtml(truncar(textoAlvo, 400))}</i>`,
      `🔗 ${linkMensagem(chatId, threadId, rep.message_id)}`,
    );
    botoes.push([{ text: '🗑️ Apagar mensagem', callback_data: `mod_del|${chatId}|${rep.message_id}` }]);
    const alvoId = rep.from && rep.from.id;
    const alvoProtegido = !alvoId || (rep.from && rep.from.is_bot) || (cfg.admins || []).includes(alvoId);
    if (!alvoProtegido) {
      botoes.push([
        { text: '🔇 Silenciar 24h', callback_data: `mod_mute|${chatId}|${alvoId}|${rep.message_id}` },
        { text: '🚫 Apagar + Banir', callback_data: `mod_ban|${chatId}|${alvoId}|${rep.message_id}` },
      ]);
    }
  } else {
    linhas.push('', `🔗 ${linkMensagem(chatId, threadId, msg.message_id)}`);
  }

  for (const adm of cfg.admins || []) {
    chamadas.push(chamada('admin', 'sendMessage', Object.assign(
      {
        chat_id: adm,
        text: linhas.join('\n'),
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      },
      botoes.length ? { reply_markup: { inline_keyboard: botoes } } : {},
    )));
  }

  return { rota: 'responder', motivo: 'denuncia_admin', chamadas };
}

/** Mensagem de membro no grupo: apaga spam, processa /admin ou agradece a sugestão de oferta. Null = nada a fazer. */
function mensagemDoGrupo(msg, cfg, ts) {
  const t = cfg.telegram;
  const chatId = (msg && msg.chat && msg.chat.id) || t.grupo_id;
  const from = msg.from || {};
  // Admins: IDs de cfg.admins, admin anônimo (sender_chat = o próprio grupo) e posts automáticos do canal vinculado.
  const ehAdmin = (cfg.admins || []).includes(from.id) || msg.is_automatic_forward ||
    (msg.sender_chat && String(msg.sender_chat.id) === String(chatId));
  if (ehAdmin || from.is_bot) return null;
  const texto = textoDaMensagem(msg);
  if (!texto.trim()) return null;
  const interno = String(chatId).replace(/^-100/, '');
  // Links para o próprio grupo (posts, tópicos, link público) não são spam.
  let semProprios = texto.split('t.me/c/' + interno + '/').join(' ');
  if (t.grupo_link) semProprios = semProprios.split(t.grupo_link).join(' ');
  if (cfg.antispam && cfg.limpar_avisos && SPAM.test(semProprios)) {
    return { rota: 'responder', motivo: 'spam', chamadas: [chamada('grupo', 'deleteMessage', { chat_id: chatId, message_id: msg.message_id })] };
  }
  const links = linksDeLoja(texto);
  if (!links.length) {
    if (agenteAtivo(cfg, 'concierge')) {
      const threadMsg = Number(msg.message_thread_id) || 0;
      const chatAberto = Number(t.topico_chat_aberto) || 0;
      const ehTopicoOferta = t.grupo_id && String(chatId) === String(t.grupo_id) && threadMsg > 0
        && threadMsg !== chatAberto
        && Object.values(t.topicos || {}).some((id) => Number(id) === threadMsg);
      if (!ehTopicoOferta) {
        const ped = detectarPedidoOfertaChat(texto);
        if (ped) {
          return {
            rota: 'vitrine',
            bot: 'grupo',
            modo: 'concierge',
            eh_cupom: !!ped.eh_cupom,
            termo: ped.termo,
            preco_max: ped.preco_max || 0,
            chat_id: chatId,
            thread_id: msg.is_topic_message && threadMsg ? threadMsg : 0,
            reply_to_message_id: msg.message_id,
            user_hash: hashUsuario(from.id, cfg),
            ts,
          };
        }
      }
    }
    return null;
  }
  const resposta = { chat_id: chatId, text: 'Valeu! Vamos conferir o preço 👀', disable_notification: true,
    reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true } };
  if (msg.is_topic_message && msg.message_thread_id) resposta.message_thread_id = msg.message_thread_id;
  const cats = Object.keys(cfg.categorias || {}).filter((k) => k !== 'top');
  const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const blocos = links.map((l) => [
    `🔗 ${esc(l.url)}`,
    '<pre>' + esc(['/oferta CATEGORIA', l.url_limpa, 'TÍTULO', 'preço VALOR', 'ref90 VALOR LINK-DA-FONTE'].join('\n')) + '</pre>',
  ].join('\n'));
  const aviso = [
    '💡 <b>Sugestão de membro no grupo</b>',
    `Mensagem: ${linkMensagem(chatId, null, msg.message_id)}`,
    '',
    ...blocos,
    '',
    `Confira o preço, troque CATEGORIA (${cats.join(', ')}) e os campos em maiúsculas, e envie aqui.`,
    '💡 <i>Dica rápida: basta colar só o link acima aqui na conversa que o bot puxa os dados sozinho!</i>',
  ].join('\n');
  return {
    rota: 'sugestao',
    user_hash: hashUsuario(from.id, cfg),
    ts,
    chamadas: [
      chamada('grupo', 'sendMessage', resposta, { sugestao_grupo: true }),
      ...paraAdmins(cfg, aviso, { parse_mode: 'HTML' }),
    ],
  };
}

/** Link de um tópico: público (t.me/usuario/thread) se o grupo_link for público; senão t.me/c/… (abre para membros). */
function linkTopico(cfg, chave) {
  const t = cfg.telegram;
  const m = String(t.grupo_link || '').match(/^https?:\/\/t\.me\/([A-Za-z]\w{3,})\/?$/);
  return m ? `https://t.me/${m[1]}/${t.topicos[chave]}` : linkMensagem(t.grupo_id, null, t.topicos[chave]);
}

/** Link de entrada do canal de uma categoria (canal_link.<cat> ou t.me/<@usuario>), ou ''. */
function linkCanal(cfg, chave) {
  const t = cfg.telegram;
  if (t.canais_link && t.canais_link[chave]) return t.canais_link[chave];
  const c = t.canais && t.canais[chave];
  return c && c[0] === '@' ? `https://t.me/${c.slice(1)}` : '';
}

/** Link de um post: no canal (@usuario → t.me/usuario/id; ID → t.me/c/…) ou no grupo. */
function linkPost(chatId, threadId, messageId) {
  const s = String(chatId);
  return s[0] === '@' ? `https://t.me/${s.slice(1)}/${messageId}` : linkMensagem(s, threadId, messageId);
}

/** Link de entrada de um canal; sem link público, cai no bot publicador (?start=<cat>). */
function linkEntradaCanal(cfg, chave) {
  const l = linkCanal(cfg, chave);
  if (l) return l;
  const u = cfg.telegram && cfg.telegram.bot_grupo_username;
  return u && cfg.telegram.canais && cfg.telegram.canais[chave] ? `https://t.me/${u}?start=${chave}` : '';
}

/** Botões de entrada para cada canal configurado (exceto `excluir`). */
function botoesCanais(cfg, excluir) {
  const out = [];
  for (const [k, c] of Object.entries(cfg.categorias || {})) {
    if (k === excluir) continue;
    const l = linkEntradaCanal(cfg, k);
    if (l) out.push([{ text: `${c.emoji} ${c.nome}`, url: l }]);
  }
  return out;
}

/**
 * /divulgar [categoria]: post de divulgação cruzada dos canais (com o logo do canal em destaque, se houver),
 * enviado ao grupo (se existir) e a todos os outros canais, + texto pronto para o WhatsApp para o admin.
 */
function montarDivulgacaoCanais(arg, cfg, chatIdAdmin) {
  const t = cfg.telegram || {};
  const canais = t.canais || {};
  const chaves = Object.keys(canais);
  const avisoAdm = (txt) => (chatIdAdmin ? [msgAdmin(chatIdAdmin, txt)] : []);
  if (!chaves.length) {
    return { chamadas: avisoAdm('⚠️ Nenhum canal ligado ainda. Use /canais para conectar (ex.: /canais tech @seu_canal).'), chamadasGrupo: [] };
  }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const foco = arg ? resolverCategoriaCfg(arg, cfg) : null;
  if (arg && (!foco || !canais[foco])) {
    return { chamadas: avisoAdm(`⚠️ Canal "${arg}" não configurado. Ligados: ${chaves.join(', ')}`), chamadasGrupo: [] };
  }
  const marca = cfg.marca || 'Ofertô';
  const descs = t.canais_desc || {};
  let texto;
  let teclado;
  let logo = '';
  if (foco) {
    const c = cfg.categorias[foco] || { emoji: '📢', nome: foco };
    logo = (t.canais_logo || {})[foco] || '';
    texto = [
      `${c.emoji} <b>Conheça o canal ${esc(marca)} ${esc(c.nome)}!</b>`,
      '',
      esc(descs[foco] || ''),
      '',
      '✅ Só promoção com preço conferido, cupom e parcelamento explicados.',
      '🔔 Ative as notificações para não perder os bugs de preço.',
    ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
    const l = linkEntradaCanal(cfg, foco);
    teclado = l ? [[{ text: `🚀 Entrar no canal ${c.nome}`, url: l }]] : [];
  } else {
    const linhas = chaves.map((k) => {
      const c = cfg.categorias[k] || { emoji: '📢', nome: k };
      return `${c.emoji} <b>${esc(c.nome)}</b>${descs[k] ? ` — ${esc(descs[k])}` : ''}`;
    });
    texto = [
      `📢 <b>Os canais do ${esc(marca)}</b>`,
      'Siga só o que você gosta e receba as melhores promoções direto no celular:',
      '',
      ...linhas,
      '',
      '👇 Toque para entrar:',
    ].join('\n');
    teclado = botoesCanais(cfg);
  }
  const destinos = [];
  if (t.grupo_id) destinos.push({ chat_id: t.grupo_id, thread: t.topicos && t.topicos.top });
  for (const k of chaves) if (k !== foco) destinos.push({ chat_id: canais[k] });
  const chamadasGrupo = destinos.map((d) => {
    const base = { chat_id: d.chat_id, parse_mode: 'HTML', reply_markup: { inline_keyboard: teclado }, disable_notification: true };
    if (d.thread) base.message_thread_id = d.thread;
    return logo
      ? chamada('grupo', 'sendPhoto', Object.assign(base, { photo: logo, caption: texto.slice(0, 1024) }))
      : chamada('grupo', 'sendMessage', Object.assign(base, { text: texto, link_preview_options: { is_disabled: true } }));
  });
  const textoZap = texto.replace(/<b>|<\/b>/g, '*').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    + '\n\n' + (foco ? [linkEntradaCanal(cfg, foco)] : chaves.map((k) => `${(cfg.categorias[k] || {}).emoji || ''} ${(cfg.categorias[k] || {}).nome || k}: ${linkEntradaCanal(cfg, k)}`)).filter(Boolean).join('\n');
  const chamadas = chamadasGrupo.slice();
  if (chatIdAdmin) {
    const rm = tecladoEnviarWhatsApp(textoZap, '📲 Divulgar canais no WhatsApp');
    chamadas.push(msgAdmin(chatIdAdmin, `✅ Divulgação enviada para ${destinos.length} destino(s)${logo ? ' com o logo do canal' : ''}.\n\nTexto pronto para o WhatsApp:\n\n${textoZap}`, rm ? { reply_markup: rm } : undefined));
  }
  return { chamadas, chamadasGrupo };
}

/** /start (ou qualquer mensagem) de membro no privado do bot publicador. Texto simples; a Marketing pode trocar depois. */
function textoStartMembro(cfg, link) {
  const t = cfg.telegram;
  const linhas = [`Oi! 👋 Aqui é o ${cfg.marca}: só oferta com desconto real, com preço igual ou abaixo do menor dos últimos 90 dias.`];
  if (link) linhas.push('', `👉 Entre no grupo: ${link}`);
  const topicos = t.grupo_id ? Object.entries(cfg.categorias || {}).filter(([k]) => t.topicos[k]).map(([k, c]) => `${c.emoji} ${c.nome}: ${linkTopico(cfg, k)}`) : [];
  if (topicos.length) linhas.push('', 'Tópicos (abrem depois que você entrar):', ...topicos);
  const canais = Object.entries(cfg.categorias || {}).map(([k, c]) => [c, linkCanal(cfg, k)]).filter(([, l]) => l).map(([c, l]) => `${c.emoji} ${c.nome}: ${l}`);
  if (canais.length) linhas.push('', 'Quer só uma categoria, sem conversa? Siga o canal:', ...canais);
  linhas.push('', '🔔 Recursos no privado comigo:', '• /alerta <produto> — te aviso no privado quando entrar em promoção', '• /buscar <termo> · /cupons · /tophoje');
  linhas.push('', 'Silencie os tópicos que não quiser. Nunca pedimos Pix nem chamamos ninguém no privado.');
  return linhas.join('\n');
}

/** Payload do /start: "beleza" ou "beleza_meta1" → { categoria, campanha, convite: "beleza_meta1" | "beleza_bot" }. */
function lerStartPayload(payload, cfg) {
  const [catTok, ...resto] = String(payload || '').split('_');
  if (!catTok) return null;
  const categoria = cfg.categorias && cfg.categorias[catTok.toLowerCase()] ? catTok.toLowerCase() : resolverCategoria(catTok, cfg);
  if (!categoria) return null;
  const campanha = resto.join('_').replace(/[^\w.-]/g, '');
  return { categoria, campanha, convite: `${categoria}_${campanha || 'bot'}`.slice(0, 32) };
}

/** Links de divulgação por tópico (comando /links do admin). */
function textoLinks(cfg) {
  const u = cfg.telegram.bot_grupo_username;
  if (!u) return 'Ainda não sei o @ do bot publicador: rode o 00-setup (ele grava bot_grupo_username) e mande /links de novo.';
  const linhas = Object.entries(cfg.categorias || {}).map(([k, c]) => `${c.emoji} ${c.nome}\nhttps://t.me/${u}?start=${k}`);
  const canaisLinks = Object.entries(cfg.categorias || {}).map(([k, c]) => [c, linkCanal(cfg, k)]).filter(([, l]) => l).map(([c, l]) => `${c.emoji} ${c.nome}: ${l}`);
  return [
    '🔗 Links de divulgação (abrem o bot publicador, que convida para o grupo e mostra o tópico):',
    '',
    linhas.join('\n\n'),
    '',
    `Por campanha, acrescente _nome no fim: https://t.me/${u}?start=beleza_meta1`,
    'Cada link gera um convite próprio (categoria_campanha) e os /start ficam no relatório.',
  ].concat(canaisLinks.length ? ['', '📢 Canais por categoria (só ofertas, para quem quer um tema só):', ...canaisLinks] : []).join('\n');
}

/**
 * Classifica um update do Telegram.
 * Retorna { rota, ... } com rota em: oferta | callback | membro | convite | config | responder | pospub | start | sugestao | ignorar.
 * Toda rota pode trazer `chamadas` (respostas imediatas).
 */
function classificarUpdate(body, headers, cfg, agora, query, meta) {
  const t = cfg.telegram;
  // Bot que recebeu o update: o webhook do publicador é registrado com ?bot=grupo. Responde pelo mesmo bot.
  const origem = query && query.bot === 'grupo' ? 'grupo' : 'admin';
  const ts = new Date(agora || Date.now()).getTime();
  const h = headers || {};
  const segredo = h['x-telegram-bot-api-secret-token'] || h['X-Telegram-Bot-Api-Secret-Token'];
  // Sem webhook_secret configurado não dá para saber se o update veio do Telegram: recusa.
  if (!t.webhook_secret) return { rota: 'ignorar', motivo: 'webhook_secret vazio: rode o 00 · Setup' };
  if (segredo !== t.webhook_secret) return { rota: 'ignorar', motivo: 'segredo inválido' };
  const u = body || {};
  const admins = cfg.admins || [];

  // Bot publicador entrou/saiu de um chat: em canais com nome reconhecível faz auto-onboarding; senão avisa os admins.
  if (u.my_chat_member) {
    const m = u.my_chat_member;
    const chat = m.chat || {};
    const novo = m.new_chat_member || {};
    if (novo.status === 'administrator' && chat.type === 'channel') {
      const auto = planejarAutoOnboardingCanal(m, cfg, ts);
      if (auto) return auto;
    }
    const linhas = [
      `🤖 Bot publicador agora é "${novo.status}" em: ${chat.title || chat.id}`,
      `ID do chat: ${chat.id}`,
      `Tipo: ${chat.type}${chat.is_forum ? ' (com Tópicos ✅)' : chat.type === 'supergroup' ? ' (Tópicos desativados ⚠️)' : ''}`,
    ];
    if (novo.status === 'administrator' && chat.type === 'channel') {
      const ref = chat.username ? '@' + chat.username : chat.id;
      linhas.push('', 'É um canal! Para ligar a uma categoria, copie e mande um destes:',
        `/canais tech ${ref}`, `/canais moda ${ref}`, `/canais perfumes ${ref}`, `/canais beleza ${ref}`, `/canais saude ${ref}`, `/canais casa ${ref}`, `/canais bebe ${ref}`, `/canais top ${ref}`);
    } else if (novo.status === 'administrator') {
      const p = (v) => (v ? 'sim' : 'NÃO ⚠️');
      linhas.push(`Permissões: convidar via link ${p(novo.can_invite_users)} · gerenciar tópicos ${p(novo.can_manage_topics)} · fixar mensagens ${p(novo.can_pin_messages)} · alterar informações ${p(novo.can_change_info)} · apagar mensagens ${cfg.limpar_avisos ? p(novo.can_delete_messages) : 'não precisa'}`);
      linhas.push('', `Copie o ID acima para a linha grupo_id da tabela config e rode o 00-setup de novo.`);
    }
    return { rota: 'responder', chamadas: paraAdmins(cfg, linhas.join('\n')) };
  }

  if (u.chat_member) {
    const m = u.chat_member;
    if (String(m.chat && m.chat.id) !== String(t.grupo_id)) return { rota: 'ignorar', motivo: 'outro chat' };
    const antes = ehMembro(m.old_chat_member);
    const depois = ehMembro(m.new_chat_member);
    if (antes === depois) return { rota: 'ignorar', motivo: 'sem mudança de participação' };
    const user = (m.new_chat_member && m.new_chat_member.user) || m.from || {};
    if (user.is_bot) return { rota: 'ignorar', motivo: 'bot' };
    return {
      rota: 'membro',
      linha: {
        user_hash: hashUsuario(user.id, cfg),
        tipo: depois ? 'entrada' : 'saida',
        convite_nome: depois ? (m.invite_link && m.invite_link.name) || (m.via_join_request ? 'pedido' : 'sem_link') : '',
        ts,
        data: new Date(ts).toISOString(),
      },
    };
  }

  if (u.callback_query) {
    const q = u.callback_query;
    const from = q.from || {};
    if (!admins.includes(from.id)) {
      return { rota: 'responder', chamadas: [chamada('admin', 'answerCallbackQuery', { callback_query_id: q.id, text: 'Sem permissão.' })] };
    }
    const partesCb = String(q.data || '').split('|');
    const acao = partesCb[0];
    if (acao === 'mod_del' && partesCb[1] && Number(partesCb[2])) {
      const chatAlvo = Number(partesCb[1]) || partesCb[1];
      const msgAlvo = Number(partesCb[2]);
      return {
        rota: 'responder',
        chamadas: [
          chamada('grupo', 'deleteMessage', { chat_id: chatAlvo, message_id: msgAlvo }),
          chamada('admin', 'answerCallbackQuery', { callback_query_id: q.id, text: '🗑️ Mensagem removida!' }),
          chamada('admin', 'editMessageReplyMarkup', {
            chat_id: q.message && q.message.chat && q.message.chat.id,
            message_id: q.message && q.message.message_id,
            reply_markup: { inline_keyboard: [[{ text: '🗑️ Mensagem removida pela moderação', callback_data: 'noop' }]] },
          }),
        ],
      };
    }
    if ((acao === 'mod_mute' || acao === 'mod_ban') && partesCb[1] && Number(partesCb[2])) {
      const chatAlvo = Number(partesCb[1]) || partesCb[1];
      const userAlvo = Number(partesCb[2]);
      const msgAlvo = Number(partesCb[3]) || 0;
      const chamadasMod = [];
      if (msgAlvo > 0) chamadasMod.push(chamada('grupo', 'deleteMessage', { chat_id: chatAlvo, message_id: msgAlvo }));
      if (acao === 'mod_mute') {
        chamadasMod.push(chamada('grupo', 'restrictChatMember', {
          chat_id: chatAlvo,
          user_id: userAlvo,
          permissions: { can_send_messages: false, can_send_audios: false, can_send_documents: false, can_send_photos: false, can_send_videos: false, can_send_other_messages: false },
          until_date: Math.floor(ts / 1000) + 86400,
        }));
      } else {
        chamadasMod.push(chamada('grupo', 'banChatMember', {
          chat_id: chatAlvo,
          user_id: userAlvo,
          revoke_messages: true,
        }));
      }
      const rot = acao === 'mod_mute' ? '🔇 Usuário silenciado por 24h' : '🚫 Usuário banido e mensagens removidas';
      chamadasMod.push(
        chamada('admin', 'answerCallbackQuery', { callback_query_id: q.id, text: rot }),
        chamada('admin', 'editMessageReplyMarkup', {
          chat_id: q.message && q.message.chat && q.message.chat.id,
          message_id: q.message && q.message.message_id,
          reply_markup: { inline_keyboard: [[{ text: rot, callback_data: 'noop' }]] },
        }),
      );
      return { rota: 'responder', chamadas: chamadasMod };
    }
    if (acao === 'c' && partesCb[1] && partesCb[2]) {
      return {
        rota: 'callback', acao: 'c', nova_categoria: partesCb[1], oferta_id: partesCb[2],
        callback_id: q.id, chat_id: q.message && q.message.chat && q.message.chat.id,
        message_id: q.message && q.message.message_id, user_id: from.id, ts,
      };
    }
    const oferta_id = partesCb[1];
    if (['p', 'z'].includes(acao) && oferta_id) {
      // Depois de publicada: ⭐ Mandar ao Top (p) ou ⛔ Encerrar (z). `desde` = meia-noite local (limite diário do Top).
      return {
        rota: 'pospub', acao, oferta_id, callback_id: q.id,
        chat_id: q.message && q.message.chat && q.message.chat.id, message_id: q.message && q.message.message_id,
        user_id: from.id, ts, desde: inicioDoDia(ts, cfg.fuso),
      };
    }
    if (acao === 'm' && partesCb[1] && partesCb[2]) {
      return {
        rota: 'pospub', acao: 'm', nova_categoria: partesCb[1], oferta_id: partesCb[2],
        callback_id: q.id, chat_id: q.message && q.message.chat && q.message.chat.id,
        message_id: q.message && q.message.message_id, user_id: from.id, ts, desde: inicioDoDia(ts, cfg.fuso),
      };
    }
    if (!['a', 'r', 't', 'g', 'e', 'x'].includes(acao) || !oferta_id) {
      return { rota: 'responder', chamadas: [chamada('admin', 'answerCallbackQuery', { callback_query_id: q.id })] };
    }
    return {
      rota: 'callback',
      acao,
      oferta_id,
      callback_id: q.id,
      chat_id: q.message && q.message.chat && q.message.chat.id,
      message_id: q.message && q.message.message_id,
      user_id: from.id,
      ts,
    };
  }

  const msg = u.message;
  const chatModerado = msg && msg.chat && (String(msg.chat.id) === String(t.grupo_id) || (origem === 'grupo' && ehChatGrupoModerado(msg.chat, cfg)));
  // Avisos automáticos do grupo (entrou, saiu, fixou, fechou tópico...): o bot publicador apaga.
  if (msg && cfg.limpar_avisos && chatModerado && AVISOS.some((k) => msg[k])) {
    return { rota: 'responder', chamadas: [chamada('grupo', 'deleteMessage', { chat_id: msg.chat.id, message_id: msg.message_id })] };
  }
  // Comando /admin (denúncia nos comentários ou no chat do grupo) funciona para qualquer membro (ou admin testando).
  if (msg && chatModerado) {
    const rep = denunciaDoGrupo(msg, cfg);
    if (rep) return rep;
  }
  // Admin mandou /oferta, /link, /auto (ou outro comando de admin) no grupo: o bot apaga do grupo e trata como se fosse no privado.
  // Dentro de um tópico de categoria, sem categoria na 1ª linha, usa a do tópico.
  const textoMsgBruto = msg ? String(msg.text || msg.caption || '').trim() : '';
  if (msg && textoMsgBruto && t.grupo_id && String(msg.chat && msg.chat.id) === String(t.grupo_id)
      && admins.includes(msg.from && msg.from.id) && /^\/(oferta|link|auto|convite|links|radar|cacar|buscas|canais|divulgar|afiliados|resumao|demanda|agentes|agente|topicos)(@\w+)?\b/i.test(textoMsgBruto)) {
    const linhas = textoMsgBruto.split('\n');
    const cab = linhas[0].split(/\s+/);
    const doTopico = Object.keys(t.topicos || {}).find((k) => k !== 'top' && Number(t.topicos[k]) === Number(msg.message_thread_id));
    if (/^\/(oferta|link|auto)/i.test(cab[0]) && doTopico && !cab.slice(1).some((tok) => !/^https?:/i.test(tok) && resolverCategoria(tok, cfg))) {
      cab.splice(1, 0, doTopico);
      linhas[0] = cab.join(' ');
    }
    const privado = { message: Object.assign({}, msg, { text: linhas.join('\n'), caption: undefined, chat: { id: msg.from.id, type: 'private' }, message_thread_id: undefined, reply_to_message: undefined }) };
    const r = classificarUpdate(privado, headers, cfg, agora, { bot: 'admin' }, meta);
    r.imediatas = [chamada('grupo', 'deleteMessage', { chat_id: t.grupo_id, message_id: msg.message_id })];
    return r;
  }
  if (msg && chatModerado) {
    const r = mensagemDoGrupo(msg, cfg, ts);
    if (r) return r;
  }
  if (!msg || !textoMsgBruto) return { rota: 'ignorar', motivo: 'sem texto' };
  const chat = msg.chat || {};
  const from = msg.from || {};
  const texto = textoMsgBruto;
  const entsPriv = (msg.entities || []).concat(msg.caption_entities || []);
  const urlsEntPriv = entsPriv.filter((e) => e && e.type === 'text_link' && e.url).map((e) => e.url);
  const cmd = (texto.match(/^\/(\w+)(@\w+)?/) || [])[1];
  const cmdL = cmd ? cmd.toLowerCase() : '';

  if (chat.type !== 'private') return { rota: 'ignorar', motivo: 'mensagem de grupo' };
  // Resposta no privado pelo mesmo bot que recebeu a mensagem.
  const responder = (textoResp) => Object.assign(msgAdmin(chat.id, textoResp), { bot: origem });
  if (cmdL === 'id') {
    return { rota: 'responder', chamadas: [responder(`Seu ID: ${from.id}\nID deste chat: ${chat.id}`)] };
  }
  // Admin mandou comando de admin ou link de produto ao bot publicador no privado: trata como se fosse ao bot de aprovação.
  const linkAutoLigado = !(cfg.auto && cfg.auto.link_direto === false);
  const fotoId = Array.isArray(msg.photo) && msg.photo.length ? msg.photo[msg.photo.length - 1].file_id : '';
  if (cmdL === 'logo' && admins.includes(from.id)) {
    const rl = interpretarComandoLogo(texto, fotoId, origem, cfg);
    const resp = responder(rl.mensagem);
    if (rl.upserts && rl.upserts.length) return { rota: 'config', upserts: rl.upserts, chamadas: [resp] };
    return { rota: 'responder', chamadas: [resp] };
  }
  if (origem === 'grupo' && admins.includes(from.id)) {
    const temArgsCupom = cmdL === 'cupom' && texto.trim().split(/\s+/).length > 1;
    if (['oferta', 'link', 'auto', 'modo', 'config', 'buscas', 'radar', 'cacar', 'convite', 'links', 'ajuda', 'canais', 'divulgar', 'afiliados', 'resumao', 'demanda', 'agentes', 'agente', 'topicos'].includes(cmdL)
        || temArgsCupom
        || (!cmdL && linkAutoLigado && extrairLinksProduto(texto, urlsEntPriv).length > 0)) {
      return classificarUpdate(body, headers, cfg, agora, { bot: 'admin' }, meta);
    }
  }
  if (origem === 'grupo') {
    const cmdAlerta = parseComandoAlerta(texto);
    if (cmdAlerta) {
      return Object.assign({ rota: 'alerta', chat_id: chat.id, user_hash: hashUsuario(from.id, cfg), ts }, cmdAlerta);
    }
    const payload = cmdL === 'start' ? String(texto.split(/\s+/)[1] || '').replace(/[^\w-]/g, '').slice(0, 64) : '';
    const payL = payload.toLowerCase();
    if (['cupons', 'cupom'].includes(cmdL) || (cmdL === 'start' && payL === 'cupons')) {
      return { rota: 'vitrine', bot: 'grupo', modo: 'cupons', chat_id: chat.id, ts };
    }
    if (['tophoje', 'top'].includes(cmdL) || (cmdL === 'start' && payL === 'tophoje')) {
      return { rota: 'vitrine', bot: 'grupo', modo: 'tophoje', chat_id: chat.id, ts };
    }
    if (['buscar', 'pesquisar', 'achar'].includes(cmdL)) {
      return { rota: 'vitrine', bot: 'grupo', modo: 'buscar', termo: texto.replace(/^\/\w+(?:@\w+)?\s*/i, '').trim(), chat_id: chat.id, ts };
    }
    if (cmdL === 'canais') {
      const bts = botoesCanais(cfg);
      if (bts.length) {
        return {
          rota: 'responder',
          chamadas: [chamada('grupo', 'sendMessage', {
            chat_id: chat.id,
            text: `📢 Canais do ${cfg.marca || 'Ofertô'} por categoria — entre só no que você gosta:`,
            reply_markup: { inline_keyboard: bts },
          })],
        };
      }
    }
    if (!cmdL && agenteAtivo(cfg, 'concierge')) {
      const pedPriv = detectarPedidoOfertaChat(texto);
      if (pedPriv) {
        return {
          rota: 'vitrine',
          bot: 'grupo',
          modo: 'concierge',
          eh_cupom: !!pedPriv.eh_cupom,
          termo: pedPriv.termo,
          preco_max: pedPriv.preco_max || 0,
          chat_id: chat.id,
          user_hash: hashUsuario(from.id, cfg),
          ts,
        };
      }
    }
    // Bot publicador: é o bot dos membros. /start <categoria>[_<campanha>] vem dos links de divulgação (t.me/bot?start=...).
    const sp = lerStartPayload(payload, cfg);
    // Convite: por categoria/campanha; genérico = grupo_link ou, sem ele, o convite nomeado bot_start.
    const convite = !t.grupo_id ? '' : sp ? sp.convite : t.grupo_link ? '' : 'bot_start';
    const linha = cmdL === 'start'
      ? { user_hash: hashUsuario(from.id, cfg), tipo: 'start', convite_nome: payload || 'sem_payload', ts, data: new Date(ts).toISOString() }
      : null;
    return { rota: 'start', chat_id: chat.id, categoria: sp ? sp.categoria : '', convite, linha, ts };
  }

  if (!admins.includes(from.id)) {
    const convite = t.grupo_link ? `\nEntre no grupo: ${t.grupo_link}` : '';
    return { rota: 'responder', chamadas: [responder(`Oi! Aqui só tem desconto real 😉${convite}`)] };
  }

  if (cmdL === 'resumao') {
    return { rota: 'vitrine', bot: 'admin', modo: 'resumao_admin', chat_id: chat.id, user_id: from.id, ts };
  }
  if (cmdL === 'demanda') {
    return { rota: 'vitrine', bot: 'admin', modo: 'demanda', chat_id: chat.id, user_id: from.id, ts };
  }

  if (cmdL === 'links') return { rota: 'responder', chamadas: [msgAdmin(chat.id, textoLinks(cfg))] };
  if (cmdL === 'divulgar') {
    const arg = texto.replace(/^\/\w+(?:@\w+)?\s*/i, '').trim();
    return { rota: 'responder', chamadas: montarDivulgacaoCanais(arg, cfg, chat.id).chamadas };
  }
  if (['modo', 'config', 'buscas', 'canais', 'afiliados', 'topicos'].includes(cmdL)) {
    const rc = interpretarComandoConfig(texto, cfg);
    const chamadasCfg = [msgAdmin(chat.id, rc.mensagem), ...(rc.chamadasExtras || [])];
    if (rc.upserts && rc.upserts.length) {
      return { rota: 'config', upserts: rc.upserts, chamadas: chamadasCfg };
    }
    return { rota: 'responder', chamadas: chamadasCfg };
  }
  if (cmdL === 'agentes' || cmdL === 'agente') {
    const ra = interpretarComandoAgentes(texto, cfg);
    const respAg = msgAdmin(chat.id, ra.mensagem, { parse_mode: 'HTML' });
    if (ra.upserts && ra.upserts.length) {
      return { rota: 'config', upserts: ra.upserts, chamadas: [respAg] };
    }
    return { rota: 'responder', chamadas: [respAg] };
  }
  if (cmdL === 'cupom') {
    const rc = parseComandoCupomLoja(texto, cfg, meta);
    if (rc.erro) return { rota: 'responder', chamadas: [msgAdmin(chat.id, rc.erro)] };
    return { rota: 'oferta', oferta: rc.oferta, auto_link: true, chat_id: chat.id, user_id: from.id, ts };
  }
  if (cmdL === 'radar' || cmdL === 'cacar') {
    const rr = interpretarComandoRadar(texto, cfg);
    if (rr.acao === 'config') {
      return { rota: 'config', upserts: rr.upserts, chamadas: [msgAdmin(chat.id, rr.mensagem)] };
    }
    if (rr.acao === 'status') {
      return { rota: 'responder', chamadas: [msgAdmin(chat.id, rr.mensagem)] };
    }
    return {
      rota: 'radar',
      chat_id: chat.id,
      user_id: from.id,
      ts,
      opcoes: rr,
      imediatas: [msgAdmin(chat.id, `🔎 Buscando (${rr.rotulo}) em Mercado Livre, Amazon, Shopee, Shein, Moda, Beleza & Farmácias…`)],
    };
  }

  // Resposta a um card de aprovação com o ref90 ("399,90 https://fonte"): card novo com o selo recalculado.
  const respCard = cmd ? null : parseRespostaCard(msg);
  if (respCard && respCard.erro) return { rota: 'responder', chamadas: [msgAdmin(chat.id, respCard.erro)] };
  if (respCard) return { rota: 'oferta', resposta: respCard, chat_id: chat.id, user_id: from.id, ts };

  // Resposta rápida a "💬 Falta só o preço!" quando a loja bloqueou a leitura automática da página.
  const respPreco = cmd ? null : parseRespostaPreco(msg, cfg);
  if (respPreco && respPreco.erro) return { rota: 'responder', chamadas: [msgAdmin(chat.id, respPreco.erro)] };
  if (respPreco && respPreco.ok) return { rota: 'oferta', oferta: respPreco.oferta, auto_link: true, chat_id: chat.id, user_id: from.id, ts };

  if (cmdL === 'oferta') {
    if (texto.split('\n').filter((l) => l.trim()).length === 1 && !texto.includes('http')) {
      return { rota: 'responder', chamadas: [msgAdmin(chat.id, AJUDA)] };
    }
    const r = parseOferta(texto, cfg);
    if (!r.ok) {
      // Só faltam título/preço: devolve o /oferta pronto para completar (com o link já expandido).
      const faltas = r.erros.every((e) => /^Falta (o título|a linha "preço)/.test(e));
      const modelo = faltas ? ['', 'Copie, complete e mande:', texto.split('\n')[0], 'Título do produto', 'preço 0,00', 'ref90 0,00 https://link-do-historico',
        ...(cfg.keepa && cfg.keepa.chave ? [] : ['', '💡 Dica: mande só o link (sem /oferta) que o bot tenta ler o título e o preço de graça! Com Keepa (keepa.chave), o /oferta também preenche o ref90.'])] : ['', 'Mande /oferta sozinho para ver o formato, ou cole apenas o link do produto na conversa.'];
      return { rota: 'responder', chamadas: [msgAdmin(chat.id, ['❗ ' + r.erros.join('\n❗ '), ...modelo].join('\n'))] };
    }
    if (meta && meta.curto && ehAfiliadoCurto(meta.curto)) r.oferta.links_manuais._afiliado = meta.curto;
    if (r.oferta.loja === 'amazon') {
      const urlBruta = (texto.match(/https?:\/\/[^\s<>"']+/gi) || [])[0] || '';
      const tagU = tagAmazonDaUrl(urlBruta);
      if (tagU) r.oferta.links_manuais._tag_url = tagU;
    }
    return { rota: 'oferta', oferta: r.oferta, chat_id: chat.id, user_id: from.id, ts };
  }

  if (cmdL === 'link' || cmdL === 'auto') {
    const r = parseMensagemLink(msg, cfg, meta);
    if (!r) {
      return {
        rota: 'responder',
        chamadas: [msgAdmin(chat.id, '🔗 Cole qualquer link de produto aqui na conversa (nem precisa de comando!)\nEx.: https://s.shopee.com.br/... ou https://mercadolivre.com/sec/... ou https://amzn.to/...')],
      };
    }
    if (r.erro) return { rota: 'responder', chamadas: [msgAdmin(chat.id, '❗ ' + r.erro)] };
    return { rota: 'oferta', oferta: r.oferta, auto_link: true, chat_id: chat.id, user_id: from.id, ts };
  }

  if (cmdL === 'convite') {
    const [, catTok, nomeTok] = texto.split(/\s+/);
    const categoria = catTok ? resolverCategoria(catTok, cfg) || (slug(catTok) === 'top' ? 'top' : null) : null;
    const nome = String(nomeTok || '').replace(/[^\w.-]/g, '').slice(0, 32);
    if (!categoria || !nome) {
      return { rota: 'responder', chamadas: [msgAdmin(chat.id, 'Uso: /convite <categoria> <nome_da_campanha>\nEx.: /convite beleza meta_beleza_v1 (até 32 caracteres)')] };
    }
    if (!t.grupo_id) return { rota: 'responder', chamadas: [msgAdmin(chat.id, 'Configure grupo_id antes de criar convites.')] };
    return {
      rota: 'convite',
      categoria,
      nome,
      chat_id: chat.id,
      ts,
      chamadas: [chamada('grupo', 'createChatInviteLink', { chat_id: t.grupo_id, name: nome })],
    };
  }

  // Modo automático sem comando: o admin só colou/encaminhou um link ou compartilhamento do app da loja!
  if (!cmd && linkAutoLigado) {
    const r = parseMensagemLink(msg, cfg, meta);
    if (r && r.erro) return { rota: 'responder', chamadas: [msgAdmin(chat.id, '❗ ' + r.erro)] };
    if (r && r.ok) return { rota: 'oferta', oferta: r.oferta, auto_link: true, chat_id: chat.id, user_id: from.id, ts };
  }

  return { rota: 'responder', chamadas: [msgAdmin(chat.id, `${cfg.marca}: comandos disponíveis\n\n${COMANDOS}`)] };
}

/** Link para uma mensagem num supergrupo: https://t.me/c/<id sem -100>/<thread>/<msg>. */
function linkMensagem(grupoId, threadId, messageId) {
  const interno = String(grupoId).replace(/^-100/, '');
  return threadId ? `https://t.me/c/${interno}/${threadId}/${messageId}` : `https://t.me/c/${interno}/${messageId}`;
}

module.exports = { linkCanal, linkPost, chamada, msgAdmin, paraAdmins, classificarUpdate, hashUsuario, linkMensagem, COMANDOS, textoStartMembro, linksDeLoja, lerStartPayload, textoLinks, linkTopico, botoesCanais, linkEntradaCanal, montarDivulgacaoCanais, denunciaDoGrupo };
