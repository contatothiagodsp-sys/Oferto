'use strict';

/** Converte "R$ 1.299,90", "349,90", "349.90" ou 349.9 em número. Retorna null se inválido. */
function parsePreco(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) && valor > 0 ? round2(valor) : null;
  if (valor == null) return null;
  let s = String(valor).replace(/r\$/i, '').replace(/\s/g, '').trim();
  if (!s) return null;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? round2(n) : null;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** 1299.9 → "R$ 1.299,90" (espaço normal, sem NBSP). */
function formatBRL(n) {
  const [int, dec] = round2(n).toFixed(2).split('.');
  return 'R$ ' + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
}

/** Partes de data/hora num fuso (padrão: America/Sao_Paulo). */
function partesData(date, timeZone) {
  const d = date instanceof Date ? date : new Date(date);
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: timeZone || 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const p = {};
  for (const { type, value } of fmt.formatToParts(d)) p[type] = value;
  return p;
}

/** "16/11 às 14:32" */
function formatDataHora(date, timeZone) {
  const p = partesData(date, timeZone);
  return `${p.day}/${p.month} às ${p.hour}:${p.minute}`;
}

/** "16/11" */
function formatData(date, timeZone) {
  const p = partesData(date, timeZone);
  return `${p.day}/${p.month}`;
}

/** "2026-11-16" no fuso indicado (para agrupar por dia). */
function diaISO(date, timeZone) {
  const p = partesData(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Escapa texto para parse_mode HTML do Telegram. */
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Corta texto em `max` caracteres com reticências. */
function truncar(s, max) {
  const t = String(s || '').trim();
  return t.length <= max ? t : t.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}

/** ID curto e ordenável: "o" + base36(tempo) + 3 caracteres aleatórios. */
function novoId(prefixo, agora) {
  const t = (agora instanceof Date ? agora.getTime() : agora || Date.now()).toString(36);
  const r = Math.floor(Math.random() * 36 ** 3).toString(36).padStart(3, '0');
  return (prefixo || 'o') + t + r;
}

/** Mantém só letras e números minúsculos (seguro para sub-IDs). */
function slug(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Início do dia (00:00) no fuso indicado, em ms. */
function inicioDoDia(date, timeZone) {
  const ts = date instanceof Date ? date.getTime() : Number(date);
  const p = partesData(ts, timeZone);
  return ts - (Number(p.hour) * 60 + Number(p.minute)) * 60000 - (ts % 60000);
}

module.exports = { parsePreco, round2, formatBRL, formatDataHora, formatData, diaISO, escapeHtml, truncar, novoId, slug, partesData, inicioDoDia };
