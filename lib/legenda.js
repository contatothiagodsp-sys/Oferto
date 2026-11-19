'use strict';
// Legenda curta do Telegram (P3-02/03/07) e lista única de termos proibidos (P3-01/04).
// Módulo puro: sem I/O, sem pacotes externos (é embutido nos Code nodes do n8n pelo build).
//
// Formato (HTML do Telegram, parse_mode=HTML):
//   🔥 <b>[Produto curto]</b> — R$ [preço c/ frete]
//   [Loja] · cupom <code>[CUPOM]</code>
//   <a href="[link curto]">[link curto sem https:// e www.]</a>
//   #publi · link de afiliado
//   Associado Amazon: ganhamos com compras qualificadas   ← só em posts da Amazon
//
// Contagem: o limite de 200 vale para o texto VISÍVEL, em unidades UTF-16 (String#length), que é
// como o Telegram conta a legenda depois de interpretar as entidades HTML: as tags (<b>, <code>, <a href>) não
// contam e "&amp;" conta como 1 caractere ("&"). Botões inline ficam fora da conta (OK-07).
// O nome do produto é o único trecho elástico: é cortado com "…" por ponto de código (nunca parte um
// par substituto UTF-16) até o total caber.
//
// Padrão seguro: qualquer dúvida (frete desconhecido, preço inválido, link ausente ou longo demais,
// termo proibido, sem espaço para o nome) devolve { ok:false, erro } e a oferta deve ir para revisão.
const { formatBRL, escapeHtml } = require('./util');
const { nomeLoja } = require('./lojas');

const LIMITE_LEGENDA = 200;
const MAX_EMOJIS = 2;
const MIN_NOME = 12; // menos que isso o nome deixa de identificar o produto → revisão
const MAX_NOME = 55; // alvo do backlog (~55 caracteres para o nome)
const MAX_CUPOM = 20;
const EMOJI_LEGENDA = '🔥';
const DISCLOSURE = '#publi · link de afiliado';
const DISCLOSURE_AMAZON = 'Associado Amazon: ganhamos com compras qualificadas';

/**
 * Termos que nunca podem sair num post (forma de exibição; a comparação normaliza acento e caixa).
 * "PREÇO HISTÓRICO" e "FARMÁCIA OFICIAL" são condicionais: liberados só com
 * opcoes.historicoVerificado / opcoes.vendedorVerificado (ver TERMOS_CONDICIONAIS).
 */
const TERMOS_PROIBIDOS = Object.freeze([
  'CORRE QUE ACABA',
  'SÓ HOJE',
  'ÚLTIMAS UNIDADES',
  'PREÇO HISTÓRICO',
  'ABAIXO DO HISTÓRICO',
  'RECORDE DE PREÇO',
  'MÍNIMA HISTÓRICA',
  'RARIDADE NO HISTÓRICO',
  'VALENDO HOJE',
  'HIT DO DIA',
  'BOMBANDO AGORA',
  'EM ALTA NO BRASIL',
  'FARMÁCIA OFICIAL',
]);

/** Termo → opção que o libera (só quando a verificação correspondente foi feita por quem chama). */
const TERMOS_CONDICIONAIS = Object.freeze({
  'PREÇO HISTÓRICO': 'historicoVerificado',
  'FARMÁCIA OFICIAL': 'vendedorVerificado',
});

/** "Só  hoje!" → " SO HOJE " (sem acento, maiúsculo, só letras/dígitos separados por 1 espaço, com bordas). */
function normalizarTermo(txt) {
  const s = String(txt == null ? '' : txt)
    // NFKD: letras de compatibilidade (𝐒𝐎, ＳＯ, ⓈⓄ) viram a forma básica antes de tirar os acentos.
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
  return ' ' + s + ' ';
}

const TERMOS_NORM = TERMOS_PROIBIDOS.map((t) => ({ termo: t, norm: normalizarTermo(t), cond: TERMOS_CONDICIONAIS[t] || null }));

/** Lista dos termos proibidos presentes no texto (vazia se nenhum). Casa palavra inteira. */
function termosProibidosEm(txt, opcoes) {
  const o = opcoes || {};
  const n = normalizarTermo(txt);
  return TERMOS_NORM.filter((t) => n.includes(t.norm) && !(t.cond && o[t.cond] === true)).map((t) => t.termo);
}

/** true se o texto contém algum termo de TERMOS_PROIBIDOS (acento e caixa ignorados). */
function contemTermoProibido(txt, opcoes) {
  return termosProibidosEm(txt, opcoes).length > 0;
}

/** Quantidade de caracteres \p{Extended_Pictographic} (uma família com ZWJ conta como várias). */
function contarEmojis(txt) {
  const m = String(txt == null ? '' : txt).match(/\p{Extended_Pictographic}/gu);
  return m ? m.length : 0;
}

/** Remove emojis e seus modificadores (ZWJ, VS16, tom de pele, bandeiras, keycap) e normaliza espaços. */
function semEmojis(txt) {
  return String(txt == null ? '' : txt)
    .replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}‍️︎⃣]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Corta em `max` unidades UTF-16 com "…", por ponto de código (nunca deixa substituto solto). */
function cortarNome(nome, max) {
  const s = String(nome || '');
  if (s.length <= max) return s;
  if (max < 1) return '';
  let out = '';
  for (const cp of s) {
    if (out.length + cp.length > max - 1) break;
    out += cp;
  }
  // Prefere terminar numa palavra inteira quando isso não desperdiça mais de 1/3 do espaço.
  const esp = out.lastIndexOf(' ');
  if (s[out.length] !== ' ' && esp >= Math.ceil(((max - 1) * 2) / 3)) out = out.slice(0, esp);
  out = out.replace(/[\s,;:.\-–—·/|(+&]+$/u, '');
  return out + '…';
}

/** Texto visível de um HTML do Telegram: sem tags e com as entidades básicas resolvidas. */
function textoVisivel(html) {
  return String(html == null ? '' : html)
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

const MIN_ALNUM_NOME = 3; // o nome publicado precisa de ao menos 3 letras/dígitos

/** Centavos inteiros ≥ 0 (só typeof number inteiro; string, boolean, array e objeto → null). */
function cents(v) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
}

/**
 * Frete em CENTAVOS inteiros, ou null se desconhecido.
 * Contrato de unidade alinhado a lib/desconto.js (P2-08): só nomes com unidade explícita.
 * Lê oferta.frete_cents (inteiro ≥ 0); sem ele, oferta.frete_gratis === true vale 0.
 * oferta.frete (unidade ambígua: reais no legado, centavos em desconto.js) é IGNORADO de propósito.
 * frete_conhecido === false sempre vence (desconhecido).
 */
function freteDe(oferta) {
  if (!oferta || typeof oferta !== 'object' || oferta.frete_conhecido === false) return null;
  if (oferta.frete_cents != null) return cents(oferta.frete_cents);
  if (oferta.frete_gratis === true) return 0;
  return null;
}

/**
 * Preço exibido em CENTAVOS (já com frete), ou null se não der para afirmar.
 * - oferta.preco_final_cents: preço final do portão (desconto.precoFinal().centavos ou
 *   avaliarAutoPublicacao().preco_final), que pela P2-08 JÁ inclui o frete → usado como está;
 * - senão oferta.preco_cents + frete.
 * Campos sem unidade (preco, preco_final, preco_com_frete) são ignorados: na dúvida, revisão.
 */
function precoExibidoCents(oferta, frete) {
  if (oferta.preco_final_cents != null) {
    const pf = cents(oferta.preco_final_cents);
    return pf != null && pf > 0 && pf >= frete ? pf : null;
  }
  const p = cents(oferta.preco_cents);
  return p != null && p > 0 ? p + frete : null;
}

function alnum(s) {
  const m = String(s).match(/[\p{L}\p{N}]/gu);
  return m ? m.length : 0;
}

function falha(erro, motivo) {
  return { ok: false, erro, motivo, destino: 'revisao' };
}

/**
 * Legenda curta (≤200 visíveis, ≤2 emojis) de uma oferta para o Telegram, em HTML.
 * @param {object} oferta  { titulo, loja, preco_final_cents? | preco_cents?, frete_cents? | frete_gratis?, frete_conhecido?, cupom? }
 *                         Valores em CENTAVOS inteiros (mesma unidade de lib/desconto.js). preco_final_cents já inclui o frete (P2-08).
 * @param {string} link    link curto/afiliado já pronto (aparece por extenso)
 * @param {object} [cfg]   { amazon: { mostrar_preco: false } } omite o preço nos posts da Amazon
 * @returns {{ok:true, html:string, texto:string, comprimento:number, emojis:number, nome:string, cortado:boolean}
 *          | {ok:false, erro:string, motivo:string, destino:'revisao'}}
 * Erros: frete_desconhecido, preco_invalido, link_ausente, sem_titulo, termo_proibido, sem_espaco.
 */
function legendaCurta(oferta, link, cfg) {
  const o = oferta || {};
  const c = cfg || {};
  const url = typeof link === 'string' ? link.trim() : '';
  const mUrl = /^https?:\/\/([^\s<>"\/?#]+)[^\s<>"]*$/i.exec(url);
  // Host com ponto, sem credenciais ("user@host") e não vazio depois de tirar "www.".
  const host = mUrl ? mUrl[1].replace(/^www\./i, '') : '';
  if (!/^[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+(?::\d{1,5})?$/u.test(host)) return falha('link_ausente', 'sem link http(s) válido');
  // Visível sem "https://" e "www." (economiza até 12 caracteres); o href leva a URL inteira.
  const urlVisivel = url.replace(/^https?:\/\/(?:www\.)?/i, '').replace(/\/$/, '');
  if (!urlVisivel) return falha('link_ausente', 'sem link http(s) válido');

  const frete = freteDe(o);
  if (frete == null) return falha('frete_desconhecido', 'frete desconhecido: a oferta vai para revisão (Q-18)');

  const ehAmazon = o.loja === 'amazon';
  const mostraPreco = !(ehAmazon && c.amazon && c.amazon.mostrar_preco === false);
  let precoTxt = '';
  if (mostraPreco) {
    const p = precoExibidoCents(o, frete);
    if (p == null) return falha('preco_invalido', 'preço ausente ou inválido (exige preco_final_cents ou preco_cents, inteiros em centavos)');
    precoTxt = ` — ${formatBRL(p / 100)} ${frete === 0 ? 'c/ frete grátis' : 'c/ frete'}`;
  }

  const nomeBase = semEmojis(typeof o.titulo === 'string' ? o.titulo : '').slice(0, 400);
  if (alnum(nomeBase) < MIN_ALNUM_NOME) return falha('sem_titulo', 'oferta sem título');

  const loja = semEmojis(nomeLoja(o.loja));
  const cupom = semEmojis(o.cupom).replace(/\s+/g, '').slice(0, MAX_CUPOM);
  const linhaLojaTxt = cupom ? `${loja} · cupom ${cupom}` : loja;
  const linhaLojaHtml = cupom ? `${escapeHtml(loja)} · cupom <code>${escapeHtml(cupom)}</code>` : escapeHtml(loja);
  const discl = ehAmazon ? `${DISCLOSURE}\n${DISCLOSURE_AMAZON}` : DISCLOSURE;

  // Tudo menos o nome, em texto visível.
  const fixo = `${EMOJI_LEGENDA} ${precoTxt}\n${linhaLojaTxt}\n${urlVisivel}\n${discl}`;
  const limite = Math.min(LIMITE_LEGENDA, Number(c.legenda_max) > 0 ? Number(c.legenda_max) : LIMITE_LEGENDA);
  const orcamento = Math.min(MAX_NOME, limite - fixo.length);
  if (orcamento < MIN_NOME) return falha('sem_espaco', `sobram ${orcamento} caracteres para o nome (mínimo ${MIN_NOME}); link ou cupom longos demais`);

  const nome = cortarNome(nomeBase, orcamento);
  if (alnum(nome) < MIN_ALNUM_NOME) return falha('sem_titulo', 'nome do produto sem letras/dígitos suficientes');
  const texto = `${EMOJI_LEGENDA} ${nome}${precoTxt}\n${linhaLojaTxt}\n${urlVisivel}\n${discl}`;
  const href = escapeHtml(url).replace(/"/g, '&quot;');
  const html = `${EMOJI_LEGENDA} <b>${escapeHtml(nome)}</b>${precoTxt}\n${linhaLojaHtml}\n<a href="${href}">${escapeHtml(urlVisivel)}</a>\n${discl}`;

  const proibidos = termosProibidosEm(texto);
  if (proibidos.length) return falha('termo_proibido', 'termo proibido: ' + proibidos.join(', '));

  const emojis = contarEmojis(texto);
  // Invariantes (garantidas pela construção; conferidas por segurança).
  if (texto.length > limite || emojis > MAX_EMOJIS || textoVisivel(html) !== texto) {
    return falha('sem_espaco', 'legenda fora do limite');
  }
  return { ok: true, html, texto, comprimento: texto.length, emojis, nome, cortado: nome !== nomeBase };
}

module.exports = {
  LIMITE_LEGENDA,
  MAX_EMOJIS,
  TERMOS_PROIBIDOS,
  TERMOS_CONDICIONAIS,
  DISCLOSURE,
  DISCLOSURE_AMAZON,
  normalizarTermo,
  termosProibidosEm,
  contemTermoProibido,
  contarEmojis,
  semEmojis,
  cortarNome,
  textoVisivel,
  freteDe,
  legendaCurta,
};
