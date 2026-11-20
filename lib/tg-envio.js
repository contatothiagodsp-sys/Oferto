'use strict';
// Motor Central de Publicação, Classificação de Erros, Fila de Prioridade e Isolamento Multicanal na Bot API do Telegram.
const { normalizarImagemOferta, ehImagemProibida } = require('./lojas');
const { ERRO_EDICAO_ESPERADO } = require('./edicao');

const RE_ERRO_REDE_AMBIGUO = /timeout\b.*\bexceeded|ETIMEDOUT|ESOCKETTIMEDOUT|ECONNRESET|ECONNABORTED|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|network\s+error/i;
const RE_FOTO_CURL_FALHOU = /failed to get HTTP URL content|wrong type of the web page content|IMAGE_PROCESS_FAILED|WEBPAGE_CURL_FAILED|PHOTO_INVALID_DIMENSIONS/i;
const RE_FOTO_REJEITADA = /failed to get HTTP URL content|wrong type of the web page content|IMAGE_PROCESS_FAILED|wrong file identifier|WEBPAGE_CURL_FAILED|PHOTO_INVALID_DIMENSIONS/i;

const PESOS_PRIORIDADE_FILA = {
  relampago: 100,
  queda_expressiva: 85,
  cupom_curto: 75,
  alta_demanda: 65,
  alta_qualidade: 55,
  regular: 40,
  institucional: 20,
};

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
 * Valida se o arquivo binário baixado para reenvio multipart (sendPhoto) é uma imagem
 * suportada pelo Telegram (JPEG, PNG ou GIF) e não está corrompida/truncada (ex.: 23 bytes ou .webp).
 */
function validarBinarioFotoTelegram(binario) {
  if (!binario || typeof binario !== 'object' || !binario.data) {
    return { valido: false, motivo: 'sem_dados_binarios' };
  }
  const mime = String(binario.mimeType || '').trim().toLowerCase();
  if (!/^image\/(?:jpe?g|png|gif)$/i.test(mime)) {
    return { valido: false, motivo: `mime_nao_suportado:${mime || 'vazio'}` };
  }
  const b64Len = String(binario.data).length;
  // Base64 de 280 chars equivale a ~210 bytes binários; arquivos menores (como PNG de 23 bytes) são inválidos
  if (b64Len < 280) {
    return { valido: false, motivo: `arquivo_truncado:${b64Len}` };
  }
  return { valido: true, mime, tamanho_b64: b64Len };
}

/**
 * Remove a URL de imagem quebrada/inacessível do link_preview_options quando o sendPhoto
 * falhou por erro de download/curl da imagem ou formato WebP, evitando que o sendMessage
 * seguinte trave por 45s tentando baixar a mesma URL quebrada no servidor do Telegram.
 */
function sanitizarFallbackTexto(fallback, urlFotoFalhou, motivoDesc) {
  if (!fallback || !fallback.payload) return fallback;
  const lpo = fallback.payload.link_preview_options;
  if (!lpo || !lpo.url) return fallback;
  const ehWebpOuAvif = /\.(?:webp|avif)(?:$|[?#])/i.test(String(urlFotoFalhou || lpo.url));
  const falhaFoto = RE_FOTO_CURL_FALHOU.test(String(motivoDesc || '')) || RE_FOTO_REJEITADA.test(String(motivoDesc || ''));
  const mesmaUrlFalhou = !!(urlFotoFalhou && lpo.url === urlFotoFalhou);
  if (!ehWebpOuAvif && !falhaFoto && !mesmaUrlFalhou) return fallback;
  if (urlFotoFalhou && lpo.url !== urlFotoFalhou && !ehWebpOuAvif) return fallback;
  return Object.assign({}, fallback, {
    payload: Object.assign({}, fallback.payload, {
      link_preview_options: { is_disabled: true },
    }),
  });
}

/**
 * Classifica de forma determinística qualquer resposta ou erro da Bot API do Telegram.
 * Estados possíveis: 'publicado', 'entrega_incerta', 'falha_recuperavel', 'falha_definitiva', 'rejeitado'.
 */
function classificarErroTelegram(resposta, chamada) {
  const r = resposta || {};
  const ch = chamada || {};
  if (r.ok !== false && !r.error && r.result) {
    return {
      ok: true,
      tipo: 'sucesso',
      estado: 'publicado',
      codigo: 200,
      message_id: r.result.message_id || null,
      tentar_novamente: false,
      proteger_idempotencia: false,
      descricao: '',
    };
  }

  const d = String(r.description || (r.error && r.error.message) || '').trim();
  const stErr = Number(r.error_code || (r.error && (r.error.httpCode || r.error.status)) || 0);

  if (!r.description && !r.error && r.ok !== false && !r.result) {
    return {
      ok: false,
      tipo: 'resposta_invalida',
      estado: 'falha_recuperavel',
      codigo: stErr || 0,
      tentar_novamente: false,
      proteger_idempotencia: true,
      descricao: 'Resposta vazia ou malformada da Bot API',
    };
  }

  // 1) HTTP 429 Too Many Requests (Rate Limit)
  if (stErr === 429 || /Too Many Requests/i.test(d)) {
    const ra = Number((r.parameters && r.parameters.retry_after) || (d.match(/retry after (\d+)/i) || [])[1] || 5);
    return {
      ok: false,
      tipo: 'rate_limit_429',
      estado: 'falha_recuperavel',
      codigo: 429,
      retry_after: Math.max(1, ra),
      tentar_novamente: true,
      proteger_idempotencia: false,
      descricao: d || 'Too Many Requests',
    };
  }

  // 2) Timeout / Queda de conexão / DNS (entrega ambígua: proteger idempotência para não duplicar no grupo)
  if (RE_ERRO_REDE_AMBIGUO.test(d)) {
    return {
      ok: false,
      tipo: 'timeout_ou_rede_ambigua',
      estado: 'entrega_incerta',
      codigo: stErr || 408,
      tentar_novamente: false,
      proteger_idempotencia: true,
      descricao: d,
    };
  }

  // 3) Erro 5xx do servidor do Telegram (500, 502, 503, 504)
  if (stErr >= 500 || /\b(?:Bad Gateway|Service Unavailable|Gateway Timeout|Internal Server Error)\b/i.test(d)) {
    return {
      ok: false,
      tipo: 'servidor_5xx',
      estado: 'falha_recuperavel',
      codigo: stErr || 502,
      tentar_novamente: false,
      proteger_idempotencia: true,
      descricao: d || `HTTP ${stErr || 502}`,
    };
  }

  // 4) Credenciais ou permissões inválidas (401 / 403)
  if (stErr === 401 || stErr === 403 || /\b(?:Unauthorized|Forbidden|not enough rights|bot was kicked|chat write forbidden| have no rights to send)\b/i.test(d)) {
    return {
      ok: false,
      tipo: 'credencial_ou_permissao',
      estado: 'falha_definitiva',
      codigo: stErr || 403,
      tentar_novamente: false,
      proteger_idempotencia: false,
      descricao: d,
    };
  }

  // 5) Rejeição de imagem no sendPhoto (400): permite fallback binário ou fallback para sendMessage
  if (ch.metodo === 'sendPhoto' && (RE_FOTO_REJEITADA.test(d) || (r.ok === false && ch.fallback))) {
    return {
      ok: false,
      tipo: 'imagem_rejeitada',
      estado: 'falha_recuperavel',
      codigo: stErr || 400,
      tentar_novamente: true,
      usar_fallback_foto: true,
      falha_curl_imagem: RE_FOTO_CURL_FALHOU.test(d),
      proteger_idempotencia: false,
      descricao: d,
    };
  }

  // 6) Parâmetros inválidos / erro definitivo 400
  return {
    ok: false,
    tipo: 'parametro_invalido_400',
    estado: stErr === 400 ? 'rejeitado' : 'falha_definitiva',
    codigo: stErr || 400,
    tentar_novamente: false,
    proteger_idempotencia: false,
    descricao: d || 'Erro desconhecido na Bot API',
  };
}

/**
 * Ordena uma fila de chamadas de publicação por prioridade comercial, descartando itens expirados
 * e intercalando destinos (chat_id / message_thread_id) para evitar rajadas no mesmo tópico/canal.
 */
function ordenarFilaPublicacao(chamadas, opcoes) {
  if (!Array.isArray(chamadas) || chamadas.length <= 1) return (chamadas || []).slice();
  const opts = opcoes || {};
  const agora = Number(opts.agora) || Date.now();
  const expirarMs = Number(opts.expirar_apos_ms) > 0 ? Number(opts.expirar_apos_ms) : 18 * 3600000;

  const validas = chamadas.filter((ch) => {
    if (!ch) return false;
    const tsItem = Number((ch.ref && ch.ref.ts) || ch.ts || 0);
    if (tsItem > 0 && agora - tsItem > expirarMs) return false;
    return true;
  });

  const comPeso = validas.map((ch, idx) => {
    const prio = String((ch.ref && ch.ref.prioridade) || ch.prioridade || 'regular').toLowerCase();
    const peso = PESOS_PRIORIDADE_FILA[prio] || PESOS_PRIORIDADE_FILA.regular;
    const dest = `${(ch.payload && ch.payload.chat_id) || ''}:${(ch.payload && ch.payload.message_thread_id) || ''}`;
    return { ch, idx, peso, dest };
  });

  comPeso.sort((a, b) => (b.peso - a.peso) || (a.idx - b.idx));

  // Intercala destinos iguais consecutivos dentro da mesma faixa de prioridade
  const out = [];
  const pendentes = comPeso.slice();
  while (pendentes.length > 0) {
    const ultimoDest = out.length ? out[out.length - 1].dest : '';
    const topoPeso = pendentes[0].peso;
    let pickIdx = 0;
    if (ultimoDest && pendentes[0].dest === ultimoDest) {
      const altIdx = pendentes.findIndex((x) => x.peso === topoPeso && x.dest !== ultimoDest);
      if (altIdx > 0) pickIdx = altIdx;
    }
    out.push(pendentes.splice(pickIdx, 1)[0]);
  }

  return out.map((x) => x.ch);
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
    const fotoRejeitada = RE_FOTO_REJEITADA.test(d);
    const urlPhoto = String((ch && ch.payload && ch.payload.photo) || '');
    const ehWebp = /\.webp(?:$|\?)/i.test(urlPhoto);
    if (tentarBin && ch && ch.metodo === 'sendPhoto' && ch.fallback && !ch._tentar_binario && !ehWebp && /^https?:\/\//i.test(urlPhoto) && !ehImagemProibida(urlPhoto) && normalizarImagemOferta(urlPhoto) && fotoRejeitada) {
      const urlFotoLimpa = normalizarImagemOferta(urlPhoto);
      indices.push(i);
      reenviar.push(Object.assign({}, ch, {
        _tentar_binario: true,
        _reenvio_idx: i,
        download_url: urlFotoLimpa,
        fallback: sanitizarFallbackTexto(ch.fallback, urlPhoto, d),
      }));
      espera = Math.max(espera, 1);
    } else if (ch && ch.fallback && (r.ok === false || (r.error && fotoRejeitada))) {
      // Foto recusada definitivamente (400): reenvia o mesmo post como texto (removendo preview da imagem se o curl dela falhou ou se for .webp).
      indices.push(i);
      reenviar.push(sanitizarFallbackTexto(ch.fallback, urlPhoto, d));
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

/**
 * Rastreia individualmente o estado de cada destino (`tg`, `tgc`, tópico) por oferta.
 * Uma falha em um canal/tópico secundário nunca invalida a publicação confirmada em outro destino.
 */
function rastrearEntregasPorDestino(chamadas, respostas, cfg, ts) {
  const entregas = [];
  const porOferta = {};

  (chamadas || []).forEach((ch, i) => {
    if (!ch || !ch.ref || !ch.ref.registrar) return;
    const r = (respostas && respostas[i]) || {};
    const cls = classificarErroTelegram(r, ch);
    const oid = String(ch.ref.oferta_id || '');
    const chat = ch.ref.chat || (cfg && cfg.telegram && cfg.telegram.grupo_id) || (ch.payload && ch.payload.chat_id) || '';
    const reg = {
      oferta_id: oid,
      plataforma: ch.ref.plataforma || 'tg',
      categoria: ch.ref.categoria || '',
      chat_id: chat,
      thread_id: ch.ref.thread || null,
      estado: cls.estado,
      tipo_erro: cls.ok ? '' : cls.tipo,
      codigo: cls.codigo,
      message_id: cls.message_id || null,
      link: cls.message_id ? linkPostTg(chat, ch.ref.thread, cls.message_id) : '',
      descricao: cls.descricao || '',
      ts: Number(ts) || Date.now(),
    };
    entregas.push(reg);
    if (oid) {
      if (!porOferta[oid]) {
        porOferta[oid] = { oferta_id: oid, publicados: 0, incertos: 0, falhas: 0, categorias_falha: [], destinos: [] };
      }
      porOferta[oid].destinos.push(reg);
      if (cls.estado === 'publicado') porOferta[oid].publicados++;
      else if (cls.estado === 'entrega_incerta') porOferta[oid].incertos++;
      else {
        porOferta[oid].falhas++;
        if (reg.categoria) porOferta[oid].categorias_falha.push(reg.categoria);
      }
    }
  });

  return { entregas, porOferta };
}

/** Depois das chamadas: linhas da tabela `posts`, isolamento por destino e alertas de falha. */
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

  const rastreio = rastrearEntregasPorDestino(chamadas, respostas, cfg, ts);
  const ofertasComSucesso = new Set(posts.map((p) => String(p.oferta_id)));
  const saiuOuAmbiguo = (r) => {
    if (!r) return false;
    if (r.ok !== false && !r.error && r.result) return true;
    const d = String(r.description || (r.error && r.error.message) || '');
    return RE_ERRO_REDE_AMBIGUO.test(d);
  };

  // Isolamento multicanal: só marca oferta como 'falha' se NENHUM destino daquela oferta teve publicação confirmada
  const naoSaiu = chamadas.filter((ch, i) => (
    ch && ch.ref && ch.ref.registrar
    && !saiuOuAmbiguo(respostas[i])
    && !ofertasComSucesso.has(String(ch.ref.oferta_id))
  ));

  let update = null;
  const updates = [];
  const oidsFalhaVistos = new Set();
  if (naoSaiu.length) {
    for (const chFalha of naoSaiu) {
      const oid = chFalha.ref.oferta_id;
      if (oid && !oidsFalhaVistos.has(oid)) {
        oidsFalhaVistos.add(oid);
        updates.push({ oferta_id: oid, status: 'falha' });
      }
    }
    update = updates[0] || null;
    const oidsTxt = oidsFalhaVistos.size > 0 ? [...oidsFalhaVistos].join(', ') : naoSaiu[0].ref.oferta_id;
    const card = chamadas.find((ch) => ch.metodo === 'editMessageReplyMarkup');
    if (card) {
      alertas.push(chamadaTg('admin', 'editMessageReplyMarkup', {
        chat_id: card.payload.chat_id, message_id: card.payload.message_id, reply_markup: TECLADO('⚠️ Não saiu no grupo'),
      }));
    }
    alertas.push(...paraAdminsTg(cfg, `❗ A oferta ${oidsTxt} NÃO saiu no grupo (${naoSaiu.map((ch) => ch.ref.categoria).join(', ')}). ` +
      'Ficou com status "falha". Para tentar de novo, mande a oferta outra vez com /oferta.'));
  }
  return {
    posts,
    alertas,
    falhas,
    update,
    updates,
    entregas: rastreio.entregas,
  };
}

module.exports = {
  RE_ERRO_REDE_AMBIGUO,
  RE_FOTO_CURL_FALHOU,
  RE_FOTO_REJEITADA,
  PESOS_PRIORIDADE_FILA,
  validarBinarioFotoTelegram,
  sanitizarFallbackTexto,
  classificarErroTelegram,
  ordenarFilaPublicacao,
  rastrearEntregasPorDestino,
  limiteTelegram,
  juntarReenvio,
  resultadoChamadas,
};
