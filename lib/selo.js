'use strict';
const { round2 } = require('./util');

const DIA = 24 * 60 * 60 * 1000;

/**
 * Calcula a referência de 90 dias e o selo.
 *
 * precos: linhas da tabela `precos` deste produto ({ preco, fonte: 'coleta'|'ref90', data })
 * preco: preço atual
 * opts: { agora, dias (90), tolerancia_pct (0), ref90 (manual, opcional), ref90_fonte }
 *
 * Regra (pública): ✓ Desconto real quando preço atual ≤ menor preço dos últimos 90 dias.
 * A referência vem de:
 *   - ref90 manual (comparador externo, com fonte), e/ou
 *   - histórico próprio, mas só se ele cobrir os 90 dias (primeiro registro há ≥ 90 dias).
 * Sem referência válida → selo "sem_ref" (não publica).
 */
function avaliarSelo(precos, preco, opts) {
  const o = Object.assign({ dias: 90, tolerancia_pct: 0, agora: new Date() }, opts || {});
  const agora = new Date(o.agora).getTime();
  const inicio = agora - o.dias * DIA;
  // Registros de hoje não contam como "histórico anterior" (evita comparar o preço com ele mesmo).
  const corteAnterior = agora - 12 * 60 * 60 * 1000;

  const linhas = (precos || [])
    .map((r) => ({ preco: Number(r.preco), fonte: r.fonte || 'coleta', data: new Date(r.data).getTime(), fonte_url: r.fonte_url || '' }))
    .filter((r) => Number.isFinite(r.preco) && r.preco > 0 && Number.isFinite(r.data));

  const coletas = linhas.filter((r) => r.fonte === 'coleta' && r.data >= inicio && r.data < corteAnterior);
  const coletasTodas = linhas.filter((r) => r.fonte === 'coleta');
  const primeiraColeta = coletasTodas.length ? Math.min(...coletasTodas.map((r) => r.data)) : null;
  const historicoCompleto = primeiraColeta != null && primeiraColeta <= inicio + DIA;
  const minHistorico = coletas.length ? Math.min(...coletas.map((r) => r.preco)) : null;

  // ref90 manual: o informado agora tem prioridade; senão o mais recente gravado nos últimos 7 dias.
  let ref90 = o.ref90 != null ? Number(o.ref90) : null;
  let ref90_fonte = o.ref90_fonte || '';
  if (ref90 == null) {
    const refs = linhas.filter((r) => r.fonte === 'ref90' && r.data >= agora - 7 * DIA).sort((a, b) => b.data - a.data);
    if (refs.length) { ref90 = refs[0].preco; ref90_fonte = refs[0].fonte_url; }
  }

  const candidatos = [];
  if (ref90 != null) candidatos.push(ref90);
  if (minHistorico != null && (historicoCompleto || ref90 != null)) candidatos.push(minHistorico);
  const min90 = candidatos.length ? Math.min(...candidatos) : null;

  let selo;
  if (min90 == null) selo = 'sem_ref';
  else if (preco <= min90 * (1 + (o.tolerancia_pct || 0) / 100)) selo = 'ok';
  else selo = 'acima';

  const desconto_pct = min90 != null ? round2(((min90 - preco) / min90) * 100) : null;

  return {
    selo,
    min90,
    desconto_pct,
    ref90,
    ref90_fonte,
    historico: {
      registros: coletas.length,
      minimo: minHistorico,
      primeira: primeiraColeta ? new Date(primeiraColeta).toISOString() : null,
      completo: historicoCompleto,
    },
  };
}

/** Grava um snapshot novo só se o preço mudou ou se o último tem mais de `horas`. */
function precisaSnapshot(precos, preco, agora, horas) {
  const coletas = (precos || []).filter((r) => (r.fonte || 'coleta') === 'coleta');
  if (!coletas.length) return true;
  const ult = coletas.reduce((a, b) => (new Date(a.data) > new Date(b.data) ? a : b));
  const idade = new Date(agora || Date.now()) - new Date(ult.data);
  return Number(ult.preco) !== Number(preco) || idade >= (horas || 20) * 60 * 60 * 1000;
}

/**
 * De onde veio o menor preço de 90 dias de uma oferta. Derivado das colunas já gravadas
 * (min90, ref90, ref90_fonte, hist_primeira, ts), sem coluna nova em bfx_ofertas.
 *   min90_origem: 'keepa' | 'manual' (ref90 informado pelo admin) | 'historico' (histórico próprio) | null (sem referência)
 *   min90_dias: dias que a referência cobre. Keepa e manual = 90; histórico = dias desde o 1º registro, até 90.
 */
function origemMin90(oferta, opts) {
  const o = oferta || {};
  const dias = (opts && opts.dias) || 90;
  const num = (v) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const min90 = num(o.min90);
  if (min90 == null) return { min90_origem: null, min90_dias: 0 };
  const ref90 = num(o.ref90);
  if (ref90 != null && ref90 <= min90 + 0.005) {
    return { min90_origem: /^keepa\b/i.test(String(o.ref90_fonte || '').trim()) ? 'keepa' : 'manual', min90_dias: dias };
  }
  const primeira = o.hist_primeira ? new Date(o.hist_primeira).getTime() : NaN;
  const ref = num(o.ts) || new Date((opts && opts.agora) || Date.now()).getTime();
  const cobertos = Number.isFinite(primeira) ? Math.floor((ref - primeira) / DIA) : 0;
  return { min90_origem: 'historico', min90_dias: Math.max(0, Math.min(dias, cobertos)) };
}

module.exports = { avaliarSelo, precisaSnapshot, origemMin90 };
