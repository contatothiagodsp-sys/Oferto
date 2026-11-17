'use strict';
// Saúde do webhook (workflow 91 · Saúde, só no servidor local). Funções puras:
// quais getWebhookInfo chamar, que problemas as respostas mostram e quem avisar, com anti-spam.
const { chamada, paraAdmins } = require('./telegram');

const MIN = 60 * 1000;
const JANELA_ERRO = 10 * MIN; // last_error_date mais novo que isto = problema
const REPETIR_ALERTA = 60 * MIN; // no máximo 1 alerta por tipo de problema neste intervalo
const FILA_MAX = 20; // pending_update_count acima disto = problema

const QUEM = { admin: 'Bot de aprovação', grupo: 'Bot publicador' };

/** getWebhookInfo de cada bot configurado. Sem bot_token: nada a conferir. */
function saudeChamadas(cfg) {
  const t = cfg.telegram;
  if (!t.bot_token) return [];
  const out = [chamada('admin', 'getWebhookInfo', {})];
  if (t.dois_bots) out.push(chamada('grupo', 'getWebhookInfo', {}));
  return out;
}

/** Problemas encontrados nas respostas: [{ tipo, texto }]. `tipo` identifica o problema para o anti-spam. */
function problemasSaude(chamadas, respostas, cfg, agora) {
  const esperado = cfg.telegram.n8n_webhook_url;
  const out = [];
  chamadas.forEach((ch, i) => {
    const quem = QUEM[ch.bot] || ch.bot;
    const r = respostas[i] || {};
    if (r.ok !== true) {
      const d = String(r.description || (r.error && r.error.message) || 'sem resposta');
      if (r.error_code === 401 || r.error_code === 404 || /Unauthorized|Not Found/i.test(d)) {
        out.push({ tipo: `token_${ch.bot}`, texto: `${quem}: token inválido (${d}). Confira o token na bfx_config.` });
      } else {
        out.push({ tipo: `api_${ch.bot}`, texto: `${quem}: o Telegram não respondeu ao getWebhookInfo (${d.slice(0, 200)}).` });
      }
      return;
    }
    const w = r.result || {};
    // O publicador é registrado com ?bot=grupo (00 · Setup), quando há dois bots.
    const alvo = esperado && ch.bot === 'grupo' && cfg.telegram.dois_bots ? esperado + (esperado.includes('?') ? '&' : '?') + 'bot=grupo' : esperado;
    if (alvo && w.url !== alvo) {
      out.push({
        tipo: `url_${ch.bot}`,
        texto: w.url
          ? `${quem}: o webhook aponta para outro endereço (${w.url}). Rode o 00 · Setup ou reinicie o vigia.`
          : `${quem}: o webhook está desligado. Rode o 00 · Setup ou reinicie o vigia.`,
      });
    }
    const erroTs = Number(w.last_error_date || 0) * 1000;
    if (erroTs && agora - erroTs <= JANELA_ERRO) {
      const min = Math.max(0, Math.round((agora - erroTs) / MIN));
      out.push({
        tipo: `erro_${ch.bot}`,
        texto: `${quem}: o Telegram não conseguiu entregar ao n8n há ${min} min (${String(w.last_error_message || 'sem detalhe').slice(0, 200)}). Veja o túnel e o filtro.`,
      });
    }
    const fila = Number(w.pending_update_count || 0);
    if (fila > FILA_MAX) {
      out.push({ tipo: `fila_${ch.bot}`, texto: `${quem}: ${fila} atualizações esperando na fila do Telegram. O n8n está atrasado ou fora do ar.` });
    }
  });
  return out;
}

/** Lê o estado do anti-spam guardado em saude.ultimo_alerta (JSON). Valor inválido = estado vazio. */
function lerEstadoSaude(valor) {
  if (valor && typeof valor === 'object') return valor;
  try {
    const o = JSON.parse(String(valor || ''));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch (e) {
    return {};
  }
}

/**
 * Avalia a saúde e decide o que avisar.
 * Estado (saude.ultimo_alerta): { [tipo]: { desde, alerta, texto } }.
 * Retorna { problemas, chamadas (alertas aos admins), linhas (upsert na bfx_config, só se o estado mudou), resposta (para o vigia) }.
 */
function avaliarSaude(chamadas, respostas, cfg, agora) {
  const anterior = lerEstadoSaude(cfg.saude && cfg.saude.estado);
  const problemas = problemasSaude(chamadas, respostas, cfg, agora);
  const estado = {};
  const novos = [];
  for (const p of problemas) {
    const ant = anterior[p.tipo];
    if (!ant || !(agora - Number(ant.alerta || 0) < REPETIR_ALERTA)) {
      novos.push(p);
      estado[p.tipo] = { desde: ant ? ant.desde : agora, alerta: agora, texto: p.texto.slice(0, 300) };
    } else {
      estado[p.tipo] = ant;
    }
  }
  const resolvidos = Object.keys(anterior).filter((tipo) => !estado[tipo]).map((tipo) => anterior[tipo]);

  const linhas = [];
  if (novos.length) {
    linhas.push(`🚨 ${cfg.marca}: problema no bot`);
    linhas.push(...novos.map((p) => '• ' + p.texto));
  }
  if (resolvidos.length) {
    if (linhas.length) linhas.push('');
    linhas.push(`✅ ${cfg.marca}: resolvido`);
    linhas.push(...resolvidos.map((r) => '• ' + String((r && r.texto) || 'problema anterior')));
  }
  const mudou = JSON.stringify(estado) !== JSON.stringify(anterior);
  return {
    problemas,
    chamadas: linhas.length ? paraAdmins(cfg, linhas.join('\n').slice(0, 3500)) : [],
    linhas: mudou ? [{ chave: 'saude.ultimo_alerta', valor: JSON.stringify(estado) }] : [],
    // ok = false quando o aviso pelo Telegram não chega (token do bot de aprovação inválido): o vigia avisa o healthchecks.io.
    resposta: { ok: !problemas.some((p) => p.tipo === 'token_admin'), problemas: problemas.map((p) => p.tipo), avisos: novos.length + resolvidos.length },
  };
}

module.exports = { saudeChamadas, problemasSaude, lerEstadoSaude, avaliarSaude, SAUDE: { JANELA_ERRO, REPETIR_ALERTA, FILA_MAX } };
