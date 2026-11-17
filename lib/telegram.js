'use strict';
const { parseOferta, resolverCategoria, AJUDA } = require('./parse-oferta');
const { sha256Hex } = require('./sha256');
const { slug, inicioDoDia } = require('./util');
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
  '/oferta – enviar uma oferta para aprovação (mande /oferta sozinho para ver o formato)',
  '/convite casa meta_casa_v1 – cria link de convite nomeado (atribuição por anúncio)',
  '/links – links de divulgação por tópico (t.me/bot?start=categoria)',
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
  '(?:^|[^\\w.-])(?:bit\\.ly|encurtador\\.com\\.br|tinyurl\\.com|cutt\\.ly|is\\.gd|abre\\.ai|s\\.shopee\\.com\\.br|shope\\.ee|amzn\\.to|a\\.co|meli\\.la)/',
  'mercadoli(?:vre|bre)\\.com/sec/',
].join('|'), 'i');
const LOJA_URL = /(?:https?:\/\/)?(?:[\w-]+\.)*(?:amazon|shopee|mercadolivre)\.com\.br\/[^\s<>"']*/gi;

/** Texto + legenda + links escondidos (text_link) de uma mensagem. */
function textoDaMensagem(msg) {
  const ents = (msg.entities || []).concat(msg.caption_entities || []);
  return [msg.text || '', msg.caption || ''].concat(ents.filter((e) => e.type === 'text_link' && e.url).map((e) => e.url)).join('\n');
}

/** Links de produto da Amazon, Shopee ou Mercado Livre (.com.br) no texto (até 3, sem repetir). */
function linksDeLoja(texto) {
  const out = [];
  const vistos = new Set();
  for (const bruto of String(texto || '').match(LOJA_URL) || []) {
    const url = (/^https?:\/\//i.test(bruto) ? bruto : 'https://' + bruto).replace(/[).,;:!?]+$/, '');
    const id = identificar(url);
    if (id.erro || !['amazon', 'shopee', 'ml'].includes(id.loja) || vistos.has(id.produto_id)) continue;
    vistos.add(id.produto_id);
    out.push({ url, loja: id.loja, url_limpa: id.url_limpa, produto_id: id.produto_id });
    if (out.length === 3) break;
  }
  return out;
}

/** Mensagem de membro no grupo: apaga spam ou agradece a sugestão de oferta. Null = nada a fazer. */
function mensagemDoGrupo(msg, cfg, ts) {
  const t = cfg.telegram;
  const from = msg.from || {};
  // Admins: IDs de cfg.admins, admin anônimo (sender_chat = o próprio grupo) e posts automáticos do canal vinculado.
  const ehAdmin = (cfg.admins || []).includes(from.id) || msg.is_automatic_forward ||
    (msg.sender_chat && String(msg.sender_chat.id) === String(t.grupo_id));
  if (ehAdmin || from.is_bot) return null;
  const texto = textoDaMensagem(msg);
  if (!texto.trim()) return null;
  const interno = String(t.grupo_id).replace(/^-100/, '');
  // Links para o próprio grupo (posts, tópicos, link público) não são spam.
  let semProprios = texto.split('t.me/c/' + interno + '/').join(' ');
  if (t.grupo_link) semProprios = semProprios.split(t.grupo_link).join(' ');
  if (cfg.antispam && cfg.limpar_avisos && SPAM.test(semProprios)) {
    return { rota: 'responder', motivo: 'spam', chamadas: [chamada('grupo', 'deleteMessage', { chat_id: t.grupo_id, message_id: msg.message_id })] };
  }
  const links = linksDeLoja(texto);
  if (!links.length) return null;
  const resposta = { chat_id: t.grupo_id, text: 'Valeu! Vamos conferir o preço 👀', disable_notification: true,
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
    `Mensagem: ${linkMensagem(t.grupo_id, null, msg.message_id)}`,
    '',
    ...blocos,
    '',
    `Confira o preço, troque CATEGORIA (${cats.join(', ')}) e os campos em maiúsculas, e envie aqui.`,
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

/** /start (ou qualquer mensagem) de membro no privado do bot publicador. Texto simples; a Marketing pode trocar depois. */
function textoStartMembro(cfg, link) {
  const t = cfg.telegram;
  const linhas = [`Oi! 👋 Aqui é o ${cfg.marca}: só oferta com desconto real, com preço igual ou abaixo do menor dos últimos 90 dias.`];
  if (link) linhas.push('', `👉 Entre no grupo: ${link}`);
  const topicos = t.grupo_id ? Object.entries(cfg.categorias || {}).filter(([k]) => t.topicos[k]).map(([k, c]) => `${c.emoji} ${c.nome}: ${linkTopico(cfg, k)}`) : [];
  if (topicos.length) linhas.push('', 'Tópicos (abrem depois que você entrar):', ...topicos);
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
  return [
    '🔗 Links de divulgação (abrem o bot publicador, que convida para o grupo e mostra o tópico):',
    '',
    linhas.join('\n\n'),
    '',
    `Por campanha, acrescente _nome no fim: https://t.me/${u}?start=beleza_meta1`,
    'Cada link gera um convite próprio (categoria_campanha) e os /start ficam no relatório.',
  ].join('\n');
}

/**
 * Classifica um update do Telegram.
 * Retorna { rota, ... } com rota em: oferta | callback | membro | convite | responder | ignorar.
 * Toda rota pode trazer `chamadas` (respostas imediatas).
 */
function classificarUpdate(body, headers, cfg, agora, query) {
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

  // Bot publicador entrou/saiu de um chat: avisa os admins com o ID (facilita o setup).
  if (u.my_chat_member) {
    const m = u.my_chat_member;
    const chat = m.chat || {};
    const novo = m.new_chat_member || {};
    const linhas = [
      `🤖 Bot publicador agora é "${novo.status}" em: ${chat.title || chat.id}`,
      `ID do chat: ${chat.id}`,
      `Tipo: ${chat.type}${chat.is_forum ? ' (com Tópicos ✅)' : chat.type === 'supergroup' ? ' (Tópicos desativados ⚠️)' : ''}`,
    ];
    if (novo.status === 'administrator') {
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
    const [acao, oferta_id] = String(q.data || '').split('|');
    if (['p', 'z'].includes(acao) && oferta_id) {
      // Depois de publicada: ⭐ Mandar ao Top (p) ou ⛔ Encerrar (z). `desde` = meia-noite local (limite diário do Top).
      return {
        rota: 'pospub', acao, oferta_id, callback_id: q.id,
        chat_id: q.message && q.message.chat && q.message.chat.id, message_id: q.message && q.message.message_id,
        user_id: from.id, ts, desde: inicioDoDia(ts, cfg.fuso),
      };
    }
    if (!['a', 'r', 't', 'e', 'x'].includes(acao) || !oferta_id) {
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
  // Avisos automáticos do grupo (entrou, saiu, fixou, fechou tópico...): o bot publicador apaga.
  if (msg && cfg.limpar_avisos && t.grupo_id && String(msg.chat && msg.chat.id) === String(t.grupo_id) && AVISOS.some((k) => msg[k])) {
    return { rota: 'responder', chamadas: [chamada('grupo', 'deleteMessage', { chat_id: t.grupo_id, message_id: msg.message_id })] };
  }
  if (msg && t.grupo_id && String(msg.chat && msg.chat.id) === String(t.grupo_id)) {
    const r = mensagemDoGrupo(msg, cfg, ts);
    if (r) return r;
  }
  if (!msg || !msg.text) return { rota: 'ignorar', motivo: 'sem texto' };
  const chat = msg.chat || {};
  const from = msg.from || {};
  const texto = msg.text.trim();
  const cmd = (texto.match(/^\/(\w+)(@\w+)?/) || [])[1];
  const cmdL = cmd ? cmd.toLowerCase() : '';

  if (chat.type !== 'private') return { rota: 'ignorar', motivo: 'mensagem de grupo' };
  // Resposta no privado pelo mesmo bot que recebeu a mensagem.
  const responder = (texto) => Object.assign(msgAdmin(chat.id, texto), { bot: origem });
  if (cmdL === 'id') {
    return { rota: 'responder', chamadas: [responder(`Seu ID: ${from.id}\nID deste chat: ${chat.id}`)] };
  }
  if (origem === 'grupo') {
    // Bot publicador: é o bot dos membros. /start <categoria>[_<campanha>] vem dos links de divulgação (t.me/bot?start=...).
    const payload = cmdL === 'start' ? String(texto.split(/\s+/)[1] || '').replace(/[^\w-]/g, '').slice(0, 64) : '';
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

  if (cmdL === 'links') return { rota: 'responder', chamadas: [msgAdmin(chat.id, textoLinks(cfg))] };

  if (cmdL === 'oferta') {
    if (texto.split('\n').filter((l) => l.trim()).length === 1 && !texto.includes('http')) {
      return { rota: 'responder', chamadas: [msgAdmin(chat.id, AJUDA)] };
    }
    const r = parseOferta(texto, cfg);
    if (!r.ok) return { rota: 'responder', chamadas: [msgAdmin(chat.id, '❗ ' + r.erros.join('\n❗ ') + '\n\n' + AJUDA)] };
    return { rota: 'oferta', oferta: r.oferta, chat_id: chat.id, user_id: from.id, ts };
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

  return { rota: 'responder', chamadas: [msgAdmin(chat.id, `${cfg.marca}: comandos disponíveis\n\n${COMANDOS}`)] };
}

/** Link para uma mensagem num supergrupo: https://t.me/c/<id sem -100>/<thread>/<msg>. */
function linkMensagem(grupoId, threadId, messageId) {
  const interno = String(grupoId).replace(/^-100/, '');
  return threadId ? `https://t.me/c/${interno}/${threadId}/${messageId}` : `https://t.me/c/${interno}/${messageId}`;
}

module.exports = { chamada, msgAdmin, paraAdmins, classificarUpdate, hashUsuario, linkMensagem, COMANDOS, textoStartMembro, linksDeLoja, lerStartPayload, textoLinks, linkTopico };
