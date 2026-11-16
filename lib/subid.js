'use strict';
const { slug, diaISO } = require('./util');

const PLATAFORMAS = ['tg', 'wac', 'wag', 'x'];

/** Campanha padrão por plataforma (seção 5 do plano). */
function campanhaPadrao(plataforma, data, timeZone) {
  const [, mm, dd] = diaISO(data || new Date(), timeZone).split('-');
  if (plataforma === 'tg') return 'auto';
  if (plataforma === 'wag') return 'relampago';
  return 'p' + mm + dd; // wac e x: post do dia (ex.: p1124)
}

/**
 * Sub-ID no padrão {prefixo}_{categoria}_{plataforma}_{campanha}.
 * Cada parte é só [a-z0-9] para valer em qualquer programa.
 */
function montarSubId({ prefixo, categoria, plataforma, campanha }) {
  const partes = [prefixo || 'bf26', categoria, plataforma, campanha].map(slug);
  if (partes.some((p) => !p)) throw new Error('Sub-ID incompleto: ' + JSON.stringify(partes));
  return { sub_id: partes.join('_'), partes };
}

module.exports = { PLATAFORMAS, campanhaPadrao, montarSubId };
