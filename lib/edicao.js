'use strict';
// Edição de posts do grupo/canal que podem ser texto ou foto. Sem dependências (evita ciclo de require).

function chamada(bot, metodo, payload) {
  return { bot, metodo, payload, ref: null };
}

/**
 * Edição de um post do grupo/canal que pode ser texto OU foto (posts com imagem saem como sendPhoto).
 * Manda as duas formas; a que não serve falha com "there is no text/caption in the message to edit",
 * erro esperado e ignorado (veja ERRO_EDICAO_ESPERADO). Legenda só se o texto couber em 1024 caracteres.
 */
function edicoesPost(bot, base, textoHtml, extra) {
  const e = extra || {};
  const out = [chamada(bot, 'editMessageText', Object.assign({}, base, {
    text: textoHtml, parse_mode: 'HTML', link_preview_options: e.link_preview_options || { is_disabled: true },
  }, e.reply_markup ? { reply_markup: e.reply_markup } : {}))];
  const visivel = String(textoHtml || '').replace(/<[^>]+>/g, '').replace(/&(?:lt|gt|amp|quot|#\d+);/g, '_').length;
  if (visivel <= 1024) {
    out.push(chamada(bot, 'editMessageCaption', Object.assign({}, base, {
      caption: textoHtml, parse_mode: 'HTML',
    }, e.reply_markup ? { reply_markup: e.reply_markup } : {})));
  }
  return out;
}

/** Erros que não são problema: editar teclado igual, ou tentar texto num post-foto (e vice-versa). */
const ERRO_EDICAO_ESPERADO = /not modified|there is no (?:text|caption) in the message to edit/i;

module.exports = { edicoesPost, ERRO_EDICAO_ESPERADO };
