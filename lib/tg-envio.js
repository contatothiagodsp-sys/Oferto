'use strict';
// Utilitários leves de entrega/reenvio na Bot API do Telegram (extraídos de lib/fluxos.js para tree-shaking).
const { normalizarImagemOferta, ehImagemProibida } = require('./lojas');
const { ERRO_EDICAO_ESPERADO } = require('./edicao');

const RE_ERRO_REDE_AMBIGUO = /timeout\b.*\bexceeded|ETIMEDOUT|ESOCKETTIMEDOUT|ECONNRESET|ECONNABORTED|ENOTFOUND|EAI_AGAIN|socket hang up/i;
const TECLADO = (texto) => ({ inline_keyboard: [[{ text: texto, callback_data: 'noop' }]] });

function chamadaTg(bot, metodo, payload, ref) {
  return { bot, metodo, payload, ref: ref || null };
}

function paraAdminsTg(cfg, texto, extra) {
  return ((cfg && cfg.admins) || []).map((id) => chamadaTg('admin', 'sendMessage', Object.assign({
    chat_id: id,
    text: texto,
    link_preview_options: { is_disabled: true },
  }, extra || {})));
}

function linkPostTg(chatId, threadId, messageId) {
  const s = String(chatId);
  if (s[0] === '@') return `https://t.me/${s.slice(1)}/${messageId}`;
  const interno = s.replace(/^-100/, '');
  return threadId ? `https://t.me/c/${interno}/${threadId}/${messageId}` : `https://t.me/c/${interno}/${messageId}`;
}

/**
 * Chamadas barradas pelo limite do Telegram (429) ou foto recusada pelo Telegram (400).
 * Nunca reenvia `fallback` em timeout/erro de rede ambíguo, pois o Telegram geralmente já entregou a foto.
 */
function limiteTelegram(chamadas, respostas, opts) {
  const indices = [];
  const reenviar = [];
  let espera = 0;
  const tentarBin = !!(opts && opts.tentarBinario);
  chamadas.forEach((ch, i) => {
    const r = respostas[i] || {};
    const d = String(r.description || (r.error && r.error.message) || '');
    const stErr = Number(r.error_code || (r.error && (r.error.httpCode || r.error.status)) || 0);
    if (r.error_code === 429 || /Too Many Requests/i.test(d)) {
      indices.push(i);
      reenviar.push(ch);
      const ra = Number((r.parameters && r.parameters.retry_after) || (d.match(/retry after (\d+)/i) || [])[1] || 5);
      espera = Math.max(espera, ra + 1);
      return;
    }
    // Timeout / queda de socket / 5xx: não reenvia como texto para evitar post duplicado no grupo.
    if (RE_ERRO_REDE_AMBIGUO.test(d) || stErr >= 500) {
      return;
    }
    const fotoRejeitada = /failed to get HTTP URL content|wrong type of the web page content|IMAGE_PROCESS_FAILED|wrong file identifier|WEBPAGE_CURL_FAILED|PHOTO_INVALID_DIMENSIONS/i.test(d);
    if (tentarBin && ch && ch.metodo === 'sendPhoto' && ch.fallback && !ch._tentar_binario && ch.payload && /^https?:\/\//i.test(String(ch.payload.photo || '')) && !ehImagemProibida(ch.payload.photo) && normalizarImagemOferta(ch.payload.photo) && fotoRejeitada) {
      const urlFotoLimpa = normalizarImagemOferta(ch.payload.photo);
      indices.push(i);
      reenviar.push(Object.assign({}, ch, { _tentar_binario: true, _reenvio_idx: i, download_url: urlFotoLimpa }));
      espera = Math.max(espera, 1);
    } else if (ch && ch.fallback && (r.ok === false || (r.error && fotoRejeitada))) {
      // Foto recusada definitivamente (400): reenvia o mesmo post como texto com prévia.
      indices.push(i);
      reenviar.push(ch.fallback);
      espera = Math.max(espera, 1);
    }
  });
  return { espera: Math.min(espera, 60), indices, reenviar };
}

/** Junta as respostas do reenvio nas posições originais. */
function juntarReenvio(respostas, limite, respostasReenvio) {
  const out = respostas.slice();
  (limite.indices || []).forEach((idx, k) => { if (respostasReenvio[k]) out[idx] = respostasReenvio[k]; });
  return out;
}

/** Depois das chamadas: linhas da tabela `posts` e alertas de falha. */
function resultadoChamadas(chamadas, respostas, cfg, ts) {
  const posts = [];
  const postsVistos = new Set();
  const falhas = [];
  chamadas.forEach((ch, i) => {
    const r = respostas[i] || {};
    if (r.ok === false || r.error) {
      const d = String(r.description || (r.error && r.error.message) || 'erro');
      if (!ERRO_EDICAO_ESPERADO.test(d) && !(ch.metodo === 'deleteMessage' && /message to delete not found/i.test(d))) {
        falhas.push(`${ch.metodo}: ${d}`);
      }
      return;
    }
    if (ch.ref && ch.ref.registrar && r.result) {
      const chavePost = `${ch.ref.oferta_id}|${ch.ref.plataforma}|${ch.ref.categoria || ''}`;
      const chaveMsg = `${ch.ref.oferta_id}|${ch.ref.plataforma}|${r.result.message_id}`;
      if (postsVistos.has(chavePost) || postsVistos.has(chaveMsg)) return;
      postsVistos.add(chavePost);
      postsVistos.add(chaveMsg);
      posts.push({
        oferta_id: ch.ref.oferta_id, plataforma: ch.ref.plataforma, categoria: ch.ref.categoria,
        message_id: r.result.message_id,
        link: linkPostTg(ch.ref.chat || cfg.telegram.grupo_id, ch.ref.thread, r.result.message_id),
        ts, data: new Date(ts).toISOString(),
      });
    }
  });
  const alertas = falhas.length ? paraAdminsTg(cfg, '⚠️ Falhas na Bot API:\n' + falhas.join('\n').slice(0, 3500)) : [];
  const saiuOuAmbiguo = (r) => {
    if (!r) return false;
    if (r.ok !== false && !r.error && r.result) return true;
    const d = String(r.description || (r.error && r.error.message) || '');
    return RE_ERRO_REDE_AMBIGUO.test(d);
  };
  const naoSaiu = chamadas.filter((ch, i) => ch.ref && ch.ref.registrar && !saiuOuAmbiguo(respostas[i]));
  let update = null;
  if (naoSaiu.length) {
    const oid = naoSaiu[0].ref.oferta_id;
    update = { oferta_id: oid, status: 'falha' };
    const card = chamadas.find((ch) => ch.metodo === 'editMessageReplyMarkup');
    if (card) {
      alertas.push(chamadaTg('admin', 'editMessageReplyMarkup', {
        chat_id: card.payload.chat_id, message_id: card.payload.message_id, reply_markup: TECLADO('⚠️ Não saiu no grupo'),
      }));
    }
    alertas.push(...paraAdminsTg(cfg, `❗ A oferta ${oid} NÃO saiu no grupo (${naoSaiu.map((ch) => ch.ref.categoria).join(', ')}). ` +
      'Ficou com status "falha". Para tentar de novo, mande a oferta outra vez com /oferta.'));
  }
  return { posts, alertas, falhas, update };
}

module.exports = {
  RE_ERRO_REDE_AMBIGUO,
  limiteTelegram,
  juntarReenvio,
  resultadoChamadas,
};
