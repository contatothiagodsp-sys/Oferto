'use strict';
const { parseOferta, parseRespostaCard, resolverCategoria, AJUDA } = require('./parse-oferta');
const { sha256Hex } = require('./sha256');
const { slug } = require('./util');

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
  '/id – mostra seu ID do Telegram',
  '/ajuda – esta mensagem',
].join('\n');

function hashUsuario(userId, cfg) {
  return sha256Hex(String(cfg.telegram.webhook_secret || 'sal') + ':' + userId).slice(0, 16);
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

/**
 * Classifica um update do Telegram.
 * Retorna { rota, ... } com rota em: oferta | callback | membro | convite | responder | ignorar.
 * Toda rota pode trazer `chamadas` (respostas imediatas).
 */
function classificarUpdate(body, headers, cfg, agora) {
  const t = cfg.telegram;
  const ts = new Date(agora || Date.now()).getTime();
  const h = headers || {};
  const segredo = h['x-telegram-bot-api-secret-token'] || h['X-Telegram-Bot-Api-Secret-Token'];
  if (t.webhook_secret && segredo !== t.webhook_secret) return { rota: 'ignorar', motivo: 'segredo inválido' };
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
  if (!msg || !msg.text) return { rota: 'ignorar', motivo: 'sem texto' };
  const chat = msg.chat || {};
  const from = msg.from || {};
  const texto = msg.text.trim();
  const cmd = (texto.match(/^\/(\w+)(@\w+)?/) || [])[1];
  const cmdL = cmd ? cmd.toLowerCase() : '';

  if (cmdL === 'id') {
    const extra = msg.message_thread_id ? `\nmessage_thread_id: ${msg.message_thread_id}` : '';
    return { rota: 'responder', chamadas: [msgAdmin(chat.id, `Seu ID: ${from.id}\nID deste chat: ${chat.id}${extra}`)] };
  }
  if (chat.type !== 'private') return { rota: 'ignorar', motivo: 'mensagem de grupo' };

  if (!admins.includes(from.id)) {
    const convite = t.grupo_link ? `\nEntre no grupo: ${t.grupo_link}` : '';
    return { rota: 'responder', chamadas: [msgAdmin(chat.id, `Oi! Aqui só tem desconto real 😉${convite}`)] };
  }

  // Resposta a um card de aprovação com o ref90 ("399,90 https://fonte"): card novo com o selo recalculado.
  const respCard = cmd ? null : parseRespostaCard(msg);
  if (respCard && respCard.erro) return { rota: 'responder', chamadas: [msgAdmin(chat.id, respCard.erro)] };
  if (respCard) return { rota: 'oferta', resposta: respCard, chat_id: chat.id, user_id: from.id, ts };

  if (cmdL === 'oferta') {
    if (texto.split('\n').filter((l) => l.trim()).length === 1 && !texto.includes('http')) {
      return { rota: 'responder', chamadas: [msgAdmin(chat.id, AJUDA)] };
    }
    const r = parseOferta(texto, cfg);
    if (!r.ok) return { rota: 'responder', chamadas: [msgAdmin(chat.id, '❗ ' + r.erros.join('\n❗ ') + '\n\nMande /oferta sozinho para ver o formato.')] };
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

module.exports = { chamada, msgAdmin, paraAdmins, classificarUpdate, hashUsuario, linkMensagem, COMANDOS };
