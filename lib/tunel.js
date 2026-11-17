'use strict';
// Endereço público do túnel (workflow 90 · Túnel, só no servidor local).

// Túneis aceitos sem configurar nada: rápido da Cloudflare e ngrok (domínios aleatórios ou estáticos).
const HOSTS_TUNEL = [
  /^[a-z0-9-]+\.trycloudflare\.com$/,
  /^[a-z0-9-]+\.ngrok-free\.(app|dev)$/,
  /^[a-z0-9-]+\.ngrok\.(app|dev)$/,
];

/** Normaliza o domínio da chave tunel.dominio: sem esquema, barra final nem "*.". */
function normalizarDominio(d) {
  return String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^\*\./, '');
}

/**
 * Confere o endereço público do túnel antes de gravar n8n_webhook_url.
 * Aceita https://<x>.trycloudflare.com, <x>.ngrok-free.app, <x>.ngrok.app ou o domínio de tunel.dominio (e subdomínios).
 * Retorna { ok, base, erro }.
 */
function validarUrlTunel(url, dominio) {
  const base = String(url || '').trim().replace(/\/+$/, '');
  const m = base.match(/^https:\/\/([a-z0-9.-]+)$/i);
  if (!m) return { ok: false, base, erro: 'URL do túnel inválida: ' + base };
  const host = m[1].toLowerCase();
  const dom = normalizarDominio(dominio);
  const ok = HOSTS_TUNEL.some((re) => re.test(host)) || (!!dom && (host === dom || host.endsWith('.' + dom)));
  if (!ok) return { ok: false, base, erro: `Endereço do túnel não permitido: ${host}. Use trycloudflare.com, ngrok ou preencha tunel.dominio na bfx_config.` };
  return { ok: true, base: 'https://' + host, erro: '' };
}

module.exports = { validarUrlTunel, normalizarDominio, HOSTS_TUNEL };
