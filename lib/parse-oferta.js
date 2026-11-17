'use strict';
const { parsePreco, slug } = require('./util');
const { identificar } = require('./lojas');

const PLATAFORMAS = ['tg', 'wac', 'wag', 'x'];

const AJUDA = [
  'Amazon com a Keepa ligada: basta o link.',
  '/oferta casa https://www.amazon.com.br/dp/B0XXXXXXX',
  'Título, preço e ref90 vêm da Keepa; o que você digitar abaixo do link tem prioridade.',
  '',
  'Formato completo (uma informação por linha):',
  '',
  '/oferta casa',
  'https://www.amazon.com.br/dp/B0XXXXXXX',
  'Air Fryer Mondial 4L',
  'preço 349,90',
  'ref90 399,90 https://link-da-fonte-do-historico',
  'img https://link-da-imagem.jpg   (opcional)',
  'cupom BF10   (opcional; o preço informado já deve ser com o cupom)',
  '',
  'Opcional na 1ª linha: "top" para também ir ao Top do Dia.',
  'Mercado Livre e lojas sem API: inclua um link de afiliado por plataforma:',
  'tg https://...   wac https://...   wag https://...   x https://...',
  '',
  'Card sem ref90 (ex.: Shopee)? Responda ao card com: 399,90 https://link-da-fonte',
].join('\n');

function resolverCategoria(token, cfg) {
  const t = slug(token);
  const cats = Object.keys((cfg && cfg.categorias) || {}).filter((c) => c !== 'top');
  if (cats.includes(t)) return t;
  // aceita prefixo único: "bel" → beleza
  const pref = cats.filter((c) => c.startsWith(t) && t.length >= 3);
  return pref.length === 1 ? pref[0] : null;
}

/**
 * Lê o texto do /oferta. Retorna { ok:true, oferta } ou { ok:false, erros:[...] }.
 */
function parseOferta(texto, cfg) {
  const erros = [];
  const linhas = String(texto || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!linhas.length || !/^\/oferta(@\w+)?\b/i.test(linhas[0])) {
    return { ok: false, erros: ['A mensagem deve começar com /oferta'] };
  }

  const cab = linhas[0].split(/\s+/).slice(1);
  const flags = cab.map(slug);
  let categoria = null;
  // Formato curto: "/oferta casa https://www.amazon.com.br/dp/…" (link na 1ª linha).
  const linkCab = cab.find((tok) => /^https?:\/\//i.test(tok));
  for (const tok of cab) {
    if (tok === linkCab) continue;
    const c = resolverCategoria(tok, cfg);
    if (c) { categoria = c; break; }
  }
  if (!categoria) {
    const cats = Object.keys(cfg.categorias || {}).filter((c) => c !== 'top').join(', ');
    erros.push(`Categoria ausente ou desconhecida na 1ª linha. Use: ${cats}`);
  }

  const o = {
    categoria,
    top: flags.includes('top'),
    url: linkCab || null,
    titulo: null,
    preco: null,
    ref90: null,
    ref90_fonte: '',
    imagem: '',
    links_manuais: {},
  };

  for (const linha of linhas.slice(1)) {
    const m = linha.match(/^([a-zçãê0-9]+)\s*[:=]?\s+(.+)$/i);
    const chave = m ? slug(m[1]) : '';
    const resto = m ? m[2].trim() : '';

    if (['preco', 'por', 'valor'].includes(chave)) {
      o.preco = parsePreco(resto.split(/\s+/)[0]);
      if (o.preco == null) erros.push(`Preço inválido: "${resto}"`);
    } else if (['ref90', 'ref', 'min90', 'menor90'].includes(chave)) {
      const [valor, ...fonte] = resto.split(/\s+/);
      o.ref90 = parsePreco(valor);
      o.ref90_fonte = fonte.join(' ');
      if (o.ref90 == null) erros.push(`ref90 inválido: "${resto}"`);
    } else if (['cupom', 'cupon', 'codigo'].includes(chave)) {
      o.links_manuais.cupom = resto.split(/\s+/)[0].slice(0, 40);
    } else if (['img', 'imagem', 'foto'].includes(chave)) {
      if (/^https?:\/\//i.test(resto)) o.imagem = resto;
      else erros.push('img deve ser um link http(s)');
    } else if (PLATAFORMAS.includes(chave) && /^https?:\/\//i.test(resto)) {
      o.links_manuais[chave] = resto.split(/\s+/)[0];
    } else if (/^https?:\/\//i.test(linha) && !o.url) {
      o.url = linha.split(/\s+/)[0];
    } else if (!o.titulo) {
      o.titulo = linha.slice(0, 200);
    } else {
      erros.push(`Linha não reconhecida: "${linha.slice(0, 60)}"`);
    }
  }

  // Amazon com keepa.chave: título e preço são opcionais (o que faltar vem da Keepa).
  const viaKeepa = !!(o.url && cfg && cfg.keepa && cfg.keepa.chave && identificar(o.url).loja === 'amazon');
  if (!o.url) erros.push('Falta o link do produto');
  if (!o.titulo && !viaKeepa) erros.push('Falta o título (uma linha de texto livre)');
  if (o.preco == null && !viaKeepa && !erros.some((e) => e.startsWith('Preço'))) erros.push('Falta a linha "preço 349,90"');

  if (o.url) {
    const id = identificar(o.url);
    if (id.erro) erros.push(id.erro);
    else Object.assign(o, { loja: id.loja, produto_id: id.produto_id, url: id.url_limpa });
  }

  if (erros.length) return { ok: false, erros };
  return { ok: true, oferta: o };
}

/**
 * Resposta do admin a um card de aprovação ("🆕 Oferta <id> …") com o menor preço de 90 dias:
 * "399,90 https://fonte", "399,90" ou "ref90 399,90 https://fonte".
 * Retorna null se a mensagem não responde a um card; { erro } se o valor não foi entendido;
 * senão { oferta_id, ref90, ref90_fonte, message_id } (message_id = mensagem do card respondido).
 */
function parseRespostaCard(msg) {
  const rt = msg && msg.reply_to_message;
  if (!rt) return null;
  const m = String(rt.text || rt.caption || '').match(/^\s*🆕\s*Oferta\s+([a-z0-9]+)/i);
  if (!m) return null;
  const toks = String(msg.text || '').trim().split(/\s+/);
  if (/^(ref90|ref|min90|menor90)[:=]?$/i.test(toks[0] || '')) toks.shift();
  if (/^r\$$/i.test(toks[0] || '')) toks.shift();
  const ref90 = parsePreco(toks[0]);
  if (ref90 == null) {
    return { erro: 'Para corrigir o menor preço de 90 dias, responda ao card só com o valor e a fonte:\n399,90 https://link-da-fonte' };
  }
  return { oferta_id: m[1], ref90, ref90_fonte: toks.slice(1).join(' ').slice(0, 300), message_id: rt.message_id };
}

module.exports = { parseOferta, parseRespostaCard, resolverCategoria, PLATAFORMAS, AJUDA };
