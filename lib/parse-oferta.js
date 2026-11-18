'use strict';
const { parsePreco, slug } = require('./util');
const { identificar } = require('./lojas');
const { extrairDoTexto } = require('./extrator');

const PLATAFORMAS = ['tg', 'wac', 'wag', 'x'];

const APELIDOS_CATEGORIA = {
  game: 'tech', games: 'tech', gamer: 'tech', ps5: 'tech', xbox: 'tech', gta: 'tech', gta6: 'tech',
  hardware: 'tech', pc: 'tech', informatica: 'tech', pcgamer: 'tech',
  perfume: 'perfumes', perfumes: 'perfumes', perfumaria: 'perfumes', fragrancia: 'perfumes', arabe: 'perfumes', arabes: 'perfumes', nicho: 'perfumes',
  saude: 'saude', farmacia: 'saude', drogaria: 'saude', suplemento: 'saude', suplementos: 'saude', vitamina: 'saude', vitaminas: 'saude',
  beleza: 'beleza', cosmeticos: 'beleza', skincare: 'beleza', maquiagem: 'beleza', cabelo: 'beleza',
  moda: 'moda', roupa: 'moda', roupas: 'moda', tenis: 'moda', calcado: 'moda', calcados: 'moda', vestuario: 'moda', look: 'moda', looks: 'moda',
  eletro: 'casa', cozinha: 'casa', lar: 'casa',
  familia: 'bebe', fralda: 'bebe', fraldas: 'bebe', infantil: 'bebe',
};

const AJUDA = [
  'Amazon com a Keepa ligada: basta o link (vale o link de compartilhar do app, a.co/…).',
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
  if (APELIDOS_CATEGORIA[t]) {
    const alvo = APELIDOS_CATEGORIA[t];
    if (cats.includes(alvo)) return alvo;
    if ((alvo === 'perfumes' || alvo === 'saude' || alvo === 'moda') && cats.includes('beleza')) return 'beleza';
  }
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
    const cats = Object.keys(cfg.categorias || {}).filter((c) => c !== 'top');
    const exemplo = linkCab ? cats.map((c) => `/oferta ${c} ${linkCab}`).join('\n') : '';
    erros.push(`Faltou a categoria (${cats.join(', ')}) logo depois do /oferta.${exemplo ? ' Copie a certa e mande de novo:\n' + exemplo : ''}`);
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
    const m = linha.match(/^([a-zçãê0-9_]+)\s*[:=]?\s+(.+)$/i);
    const chave = m ? slug(m[1]) : '';
    const resto = m ? m[2].trim() : '';

    if (['preco', 'por', 'valor', 'fica'].includes(chave)) {
      o.preco = parsePreco(resto.split(/\s+/)[0]);
      if (o.preco == null) erros.push(`Preço inválido: "${resto}"`);
    } else if (chave === 'de') {
      const pDe = parsePreco(resto.split(/\s+/)[0]);
      if (pDe != null) o.links_manuais.preco_de = pDe;
    } else if (['anuncio', 'sem_cupom', 'semcupom'].includes(chave)) {
      const pAn = parsePreco(resto.split(/\s+/)[0]);
      if (pAn != null) o.links_manuais.preco_sem_cupom = pAn;
    } else if (['parcelas', 'parcelamento'].includes(chave)) {
      o.links_manuais.parcelamento = resto.slice(0, 80);
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
 * Resposta do admin a um card de aprovação ("🆕 Oferta <id> …"):
 * - ref90: "399,90 https://fonte", "399,90" ou "ref90 399,90 https://fonte"
 * - cupom/preço: "cupom MELI15 por 143,90", "cupom MELI15 15%", "por 143,90" ou "de 229,90 anuncio 169,90 por 143,90 cupom MELI15"
 */
function parseRespostaCard(msg) {
  const rt = msg && msg.reply_to_message;
  if (!rt) return null;
  const m = String(rt.text || rt.caption || '').match(/^\s*🆕\s*Oferta\s+([a-z0-9_]+)/i);
  if (!m) return null;
  const textoMsg = String(msg.text || '').trim();
  if (/^\s*\/(?:oferta|link|auto|radar|buscas|modo|config|canais|divulgar|logo|afiliados|resumao|demanda|convite|links|id|ajuda|start)\b/i.test(textoMsg)) {
    return null;
  }

  const modoCupom = /\b(?:cupom|cupon|c[oó]digo|an[uú]ncio|sem_cupom|fica)\b|%/i.test(textoMsg)
    || /^(?:de|por|pre[cç]o|valor|an[uú]ncio)\s+/i.test(textoMsg);
  if (modoCupom) {
    const ext = extrairDoTexto(textoMsg);
    if (ext.preco == null && !ext.cupom && !ext.cupom_pct && !ext.cupom_valor && !ext.parcelamento) {
      return {
        erro: 'Não entendi o cupom ou valor. Exemplos:\n• cupom MELI15 por 143,90\n• cupom MELI15 15%\n• de 229,90 anuncio 169,90 por 143,90 cupom MELI15',
      };
    }
    return {
      oferta_id: m[1],
      edicao_cupom: true,
      preco: ext.preco,
      preco_de: ext.preco_de,
      preco_sem_cupom: ext.preco_sem_cupom,
      cupom: ext.cupom,
      cupom_pct: ext.cupom_pct,
      cupom_valor: ext.cupom_valor,
      parcelamento: ext.parcelamento,
      message_id: rt.message_id,
    };
  }

  const toks = textoMsg.split(/\s+/);
  if (/^(ref90|ref|min90|menor90)[:=]?$/i.test(toks[0] || '')) toks.shift();
  if (/^r\$$/i.test(toks[0] || '')) toks.shift();
  const ref90 = parsePreco(toks[0]);
  if (ref90 == null) {
    return { erro: 'Para corrigir o menor preço de 90 dias, responda ao card só com o valor e a fonte:\n399,90 https://link-da-fonte\nOu atualize o cupom: cupom CODIGO por 149,90' };
  }
  return { oferta_id: m[1], ref90, ref90_fonte: toks.slice(1).join(' ').slice(0, 300), message_id: rt.message_id };
}

module.exports = { parseOferta, parseRespostaCard, resolverCategoria, PLATAFORMAS, AJUDA, APELIDOS_CATEGORIA };
