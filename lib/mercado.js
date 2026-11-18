'use strict';
// Comparador gratuito de preço de mercado (Zoom + busca Amazon) e trava anti-"metade do dobro":
// · consulta páginas públicas via HTTP sem custo e sem bypass de bloqueio (erro/captcha = fallback silencioso)
// · casa estritamente o mesmo produto (kit vs avulso, volume ml/L/kg/GB/TB, códigos alfanuméricos, sem acessórios)
// · reprova ofertas mais caras ou empates com concorrente e recalibra "De:" inflado para a mediana real de mercado.
const { parsePreco, round2, formatBRL, truncar } = require('./util');
const { textoRespostaHttp } = require('./curtos');
const { normalizarImagemOferta } = require('./lojas');

const HDRS_ZOOM = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};

const HDRS_AMZ_BUSCA = {
  'User-Agent': 'WhatsApp/2.24.10.74 A',
  'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};

const STOP_MERCADO = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas', 'para', 'pra', 'por',
  'com', 'sem', 'o', 'a', 'os', 'as', 'um', 'uma', 'ao', 'aos', 'ate', 'que',
  'kit', 'duo', 'trio', 'combo', 'conjunto', 'coffret', 'pack', 'produtos', 'produto',
  'ptodutos', 'unidade', 'unidades', 'pecas', 'itens', 'total', 'tamanho', 'pacote',
  'edicao', 'edition', 'version', 'versao', 'original', 'oficial', 'oferta', 'promocao',
  'prof', 'professional', 'professionals', 'salon', 'luminous', 'reveal',
]);

const PALAVRAS_ACESSORIO = /\b(?:capa|capinha|pel[ií]cula|case|estojo|suporte|base\s+(?:carregadora|cooler)|cabo|carregador|fonte|controle\s+sem\s+fio|pulseira|refil|filtro|adesivo|skin|bolsa|mochila|maleta|limpa|higienizador)\b/i;
const PALAVRAS_KIT = /\b(?:kit|duo|trio|combo|conjunto|coffret|pack|\d+\s*(?:produtos|ptodutos|pe[cç]as|frascos|potes)|sh(?:ampoo)?\s*\+\s*cond(?:icionador)?)\b/i;

function decodificarTextoBasico(s) {
  return String(s || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;|&#0?39;/gi, "'")
    .replace(/&reg;|&trade;/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizarTextoMercado(s) {
  let txt = decodificarTextoBasico(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  txt = txt
    .replace(/\bptodutos\b/g, 'produtos')
    .replace(/\bprofessionals?\b/g, 'prof')
    .replace(/\bplaystation\s*(\d)\b/g, 'ps$1')
    .replace(/\b(\d+)\s*(?:l|lt|lts|litro|litros)\b/g, (_, n) => `${Number(n) * 1000}ml`)
    .replace(/\b(\d+)\s*kg\b/g, (_, n) => `${Number(n) * 1000}g`)
    .replace(/\b(\d+)\s*tb\b/g, (_, n) => `${Number(n) * 1000}gb`)
    .replace(/\bsh\b/g, 'shampoo')
    .replace(/\bcond\b/g, 'condicionador');
  return txt;
}

function limparQueryMercado(titulo) {
  let s = decodificarTextoBasico(titulo)
    .replace(/[®™©]/g, '')
    .replace(/\bplaystation(\d)\b/gi, 'PlayStation $1')
    .replace(/\([^)]{1,30}\)/g, ' ')
    .replace(/\s*[-|–]\s*(?:envio imediato|pronta entrega|original|lacrado|nf).*$/i, '')
    .replace(/,\s*[A-Z0-9-]{6,}$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return truncar(s, 85);
}

function mapearLojaNomeMercado(nomeLojaTxt) {
  const n = normalizarTextoMercado(nomeLojaTxt);
  if (/amazon/.test(n)) return 'amazon';
  if (/mercado\s*livre/.test(n)) return 'ml';
  if (/magalu|magazine\s*luiza/.test(n)) return 'magalu';
  if (/kabum/.test(n)) return 'kabum';
  if (/pichau/.test(n)) return 'pichau';
  if (/terabyte/.test(n)) return 'terabyte';
  if (/beleza\s*na\s*web/.test(n)) return 'belezanaweb';
  if (/epoca/.test(n)) return 'epocacosmeticos';
  if (/sephora/.test(n)) return 'sephora';
  if (/boticario/.test(n)) return 'boticario';
  if (/natura/.test(n)) return 'natura';
  if (/droga\s*raia/.test(n)) return 'drogaraia';
  if (/drogasil/.test(n)) return 'drogasil';
  if (/pacheco/.test(n)) return 'pacheco';
  if (/panvel/.test(n)) return 'panvel';
  if (/centauro/.test(n)) return 'centauro';
  if (/netshoes/.test(n)) return 'netshoes';
  if (/renner/.test(n)) return 'renner';
  if (/\bcea\b|c&a/.test(n)) return 'cea';
  if (/riachuelo/.test(n)) return 'riachuelo';
  if (/dafiti/.test(n)) return 'dafiti';
  if (/shopee/.test(n)) return 'shopee';
  if (/shein/.test(n)) return 'shein';
  return n.replace(/\s+/g, '');
}

/** Monta requisições HTTP públicas (Zoom + busca Amazon quando a oferta não é da Amazon). */
function montarReqsMercado(itens, cfg) {
  if (cfg && cfg.mercado && cfg.mercado.checar === false) return [];
  const reqs = [];
  for (const it of itens || []) {
    if (!it || it.eh_cupom_loja || !it.titulo || !(Number(it.preco) > 0)) continue;
    const q = limparQueryMercado(it.titulo);
    if (!q || q.length < 4) continue;
    const qEnc = encodeURIComponent(q);
    reqs.push({
      idx: it.idx,
      fonte: 'zoom',
      url: `https://www.zoom.com.br/search?q=${qEnc}`,
      headers: HDRS_ZOOM,
    });
    if (it.loja !== 'amazon') {
      reqs.push({
        idx: it.idx,
        fonte: 'amazon',
        url: `https://www.amazon.com.br/s?k=${qEnc}`,
        headers: HDRS_AMZ_BUSCA,
      });
    }
  }
  return reqs;
}

function extrairHitsRespostaMercado(fonte, resposta) {
  if (!resposta || resposta.error) return [];
  if (resposta.statusCode != null && Number(resposta.statusCode) >= 400) return [];
  const html = typeof resposta === 'string' ? resposta : textoRespostaHttp(resposta);
  if (!html) return [];
  if (/(?:validateCaptcha|Robot Check|Attention Required! \| Cloudflare)/i.test(html.slice(0, 12000))) return [];
  return fonte === 'amazon' ? lerHitsAmazonBusca(html) : lerHitsZoom(html);
}

function lerHitsZoom(resposta) {
  const html = typeof resposta === 'string' ? resposta : textoRespostaHttp(resposta);
  if (!html) return [];
  const m = html.match(/<script[^>]*id\s*=\s*["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return [];
  let raiz;
  try { raiz = JSON.parse(m[1]); } catch (e) { return []; }
  const props = (raiz && raiz.props) || {};
  const st = props.initialReduxState || {};
  const pp = props.pageProps || {};
  const lista = (st.hits && Array.isArray(st.hits.hits) && st.hits.hits)
    || (st.search && Array.isArray(st.search.hits) && st.search.hits)
    || (Array.isArray(pp.hits) && pp.hits)
    || [];
  const out = [];
  for (const h of lista) {
    if (!h || !h.name) continue;
    const preco = round2(Number(h.price || h.lowestPrice));
    if (!Number.isFinite(preco) || preco <= 0) continue;
    const lojaNome = String((h.bestOffer && h.bestOffer.merchantName) || h.merchantName || 'Mercado').trim();
    const img = normalizarImagemOferta(h.image || '');
    out.push({
      titulo: decodificarTextoBasico(h.name),
      preco,
      loja_nome: lojaNome,
      loja_id: mapearLojaNomeMercado(lojaNome),
      imagem: img,
      fonte: 'zoom',
    });
  }
  return out;
}

function lerHitsAmazonBusca(resposta) {
  const html = typeof resposta === 'string' ? resposta : textoRespostaHttp(resposta);
  if (!html) return [];
  const partes = html.split('data-asin="');
  const out = [];
  for (let i = 1; i < partes.length && out.length < 8; i++) {
    const asin = partes[i].slice(0, 10);
    if (!/^[A-Z0-9]{10}$/.test(asin)) continue;
    const bloco = partes[i].slice(0, 9000);
    if (/Patrocinado|Sponsored/i.test(bloco.slice(0, 2200))) continue;
    const mTit = bloco.match(/<h2[^>]*>[\s\S]*?<span[^>]*>([\s\S]{8,260}?)<\/span>/i);
    const mPr = bloco.match(/class="a-price"[^>]*>\s*<span class="a-offscreen">\s*(R\$\s*[\d.]+,\d{2})/i);
    if (!mTit || !mPr) continue;
    const preco = parsePreco(mPr[1]);
    if (!Number.isFinite(preco) || preco <= 0) continue;
    const mImg = bloco.match(/src="(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/i);
    out.push({
      titulo: decodificarTextoBasico(mTit[1]),
      preco,
      loja_nome: 'Amazon',
      loja_id: 'amazon',
      imagem: mImg ? mImg[1] : '',
      fonte: 'amazon',
    });
  }
  return out;
}

function tokensNucleo(norm) {
  return norm
    .split(/[^a-z0-9]+/)
    .filter((t) => t && t.length >= 2 && !STOP_MERCADO.has(t) && !/^\d+$/.test(t));
}

function extrairSpecsUnidades(norm) {
  const specs = { ml: new Set(), g: new Set(), gb: new Set(), pol: new Set() };
  for (const m of norm.matchAll(/\b(\d+(?:[.,]\d+)?)(ml|g|gb|pol|polegadas)\b/g)) {
    const val = m[1].replace(',', '.');
    const un = m[2] === 'polegadas' ? 'pol' : m[2];
    if (specs[un]) specs[un].add(val);
  }
  return specs;
}

function extrairQtdCombo(norm) {
  const m = norm.match(/\b(\d+)\s*(?:produtos|ptodutos|itens|pe[cç]as|frascos|potes)\b/);
  if (m) return Number(m[1]);
  const mLead = norm.match(/^(\d+)\s*(?:unidades|un\b)/);
  if (mLead) return Number(mLead[1]);
  if (/\btrio\b/.test(norm)) return 3;
  if (/\bduo\b/.test(norm)) return 2;
  const temSh = /\bshampoo\b/.test(norm);
  const temCond = /\bcondicionador\b/.test(norm);
  const temMasc = /\bmascara\b/.test(norm);
  if (temSh && temCond) return temMasc ? 3 : 2;
  return null;
}

function extrairCodigosModelo(norm) {
  const toks = norm.split(/[^a-z0-9]+/).filter(Boolean);
  const cods = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (/^(?:100|110|127|220|240)v$|^\d+x$|^\d+un$|^\d+(?:ml|g|gb|pol|mm|cm|hz|w|mah)$/.test(t)) continue;
    if (/[a-z]/.test(t) && /\d/.test(t) && t.length >= 3) {
      cods.push(t);
    } else if (/^[a-z]{1,4}$/.test(t) && i + 1 < toks.length && /^\d{2,5}$/.test(toks[i + 1])) {
      cods.push(t + toks[i + 1]);
    } else if (/^(?:v\d+|g\d+|rx|rtx|ddr\d|ps\d|xbox|s\d{2})$/.test(t)) {
      cods.push(t);
    }
  }
  return cods;
}

function detectarConcentracaoPerfume(norm) {
  if (/\beau\s+de\s+parfum\b|\bedp\b/.test(norm)) return 'edp';
  if (/\beau\s+de\s+toilette\b|\bedt\b/.test(norm)) return 'edt';
  if (/\bdeo\s+colonia\b|\bcolonia\b/.test(norm)) return 'colonia';
  return '';
}

function mesmoProdutoMercado(cand, hit) {
  if (!cand || !hit || !cand.titulo || !hit.titulo) return false;
  const pCand = Number(cand.preco);
  const pHit = Number(hit.preco);
  if (!(pCand > 0 && pHit > 0)) return false;
  if (pHit < pCand * 0.32 || pHit > pCand * 4.5) return false;

  const nC = normalizarTextoMercado(cand.titulo);
  const nH = normalizarTextoMercado(hit.titulo);

  // Regra A: acessório vs produto principal + gênero + concentração em perfumes
  const acC = PALAVRAS_ACESSORIO.test(nC);
  const acH = PALAVRAS_ACESSORIO.test(nH);
  if (acC !== acH) return false;

  const femC = /\bfeminino\b|\bpour\s+femme\b|\bfor\s+her\b|\bwomen\b/.test(nC);
  const mascC = /\bmasculino\b|\bpour\s+homme\b|\bfor\s+him\b|\bmen\b/.test(nC);
  const femH = /\bfeminino\b|\bpour\s+femme\b|\bfor\s+her\b|\bwomen\b/.test(nH);
  const mascH = /\bmasculino\b|\bpour\s+homme\b|\bfor\s+him\b|\bmen\b/.test(nH);
  if ((femC && mascH && !femH) || (mascC && femH && !mascH)) return false;

  const concC = detectarConcentracaoPerfume(nC);
  const concH = detectarConcentracaoPerfume(nH);
  if (concC && concH && concC !== concH) return false;

  // Regra B: kit/combo vs item avulso e paridade de quantidade/máscara/salon
  const kitC = PALAVRAS_KIT.test(nC);
  const kitH = PALAVRAS_KIT.test(nH);
  if (kitC !== kitH) return false;
  if (/\bmascara\b/.test(nC) !== /\bmascara\b/.test(nH)) return false;
  if (/\bsalon\b/.test(nC) && !/\bsalon\b/.test(nH) && !/\b1000ml\b/.test(nH)) return false;
  const qtdC = extrairQtdCombo(nC);
  const qtdH = extrairQtdCombo(nH);
  if (qtdC != null && qtdH != null && qtdC !== qtdH) return false;

  // Regra C: especificações de capacidade/volume/tamanho incompatíveis (inclui frasco pequeno vs cheio sem ml)
  const spC = extrairSpecsUnidades(nC);
  const spH = extrairSpecsUnidades(nH);
  for (const un of Object.keys(spC)) {
    if (spC[un].size && spH[un].size) {
      let inter = false;
      for (const v of spC[un]) if (spH[un].has(v)) inter = true;
      if (!inter) return false;
    }
  }
  if (!spC.ml.size && spH.ml.size && /\bperfume\b|\btoilette\b|\bparfum\b/.test(nC)) {
    const mlH = [...spH.ml].map(Number).filter((x) => x > 0);
    const menorMlH = mlH.length ? Math.min(...mlH) : 999;
    const pDeC = Number(cand.preco_de || 0);
    if (menorMlH <= 35 && (pCand > pHit || (pDeC > 0 && pDeC > pHit * 2.1))) return false;
  }

  // Regra D: códigos alfanuméricos de modelo precisam bater
  const nHSemEsp = nH.replace(/[^a-z0-9]/g, '');
  const cods = extrairCodigosModelo(nC);
  for (const cod of cods) {
    if (!nHSemEsp.includes(cod)) return false;
  }

  // Regra E: recall estrito (>= 72%) de tokens núcleo do título do candidato
  const tC = [...new Set(tokensNucleo(nC))];
  const tHSet = new Set(tokensNucleo(nH));
  if (!tC.length) return false;
  let batidos = 0;
  for (const t of tC) {
    if (tHSet.has(t) || nHSemEsp.includes(t)) batidos++;
  }
  const minBatidos = tC.length <= 3 ? Math.min(2, tC.length) : Math.max(3, Math.ceil(tC.length * 0.72));
  return batidos >= minBatidos;
}

function casarProdutosMercado(candidato, hits) {
  return (hits || []).filter((h) => mesmoProdutoMercado(candidato, h));
}

function calcularMediana(nums) {
  if (!nums.length) return null;
  const ord = nums.slice().sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  return ord.length % 2 === 1 ? round2(ord[meio]) : round2((ord[meio - 1] + ord[meio]) / 2);
}

/**
 * Avalia se a oferta faz sentido frente aos preços encontrados no mercado e calibra "De:" inflado.
 * Retorna { aprovar, motivo, concorrente, mediana, preco_de_ajustado, imagem_mercado, matches }.
 */
function avaliarPrecoMercado(candidato, hitsCasados, opcoes) {
  const c = candidato || {};
  const preco = Number(c.preco);
  const pDeOrig = c.preco_de != null && Number.isFinite(Number(c.preco_de)) ? round2(Number(c.preco_de)) : null;
  const temCupom = !!(c.cupom || c.cupom_auto || (c.links_manuais && (c.links_manuais.cupom || c.links_manuais.cupom_auto)));
  const modoRadar = !!(opcoes && opcoes.modo_radar);

  const validos = (hitsCasados || []).filter((h) => h && Number(h.preco) > 0);
  if (!validos.length) {
    let pDeSemHit = pDeOrig;
    if (!temCupom && pDeOrig && preco > 0 && pDeOrig > preco * 2.6 && Number(c.likes || 0) < 15 && Number(c.cliques || 0) < 120) {
      pDeSemHit = null;
    }
    return {
      aprovar: true,
      motivo: 'sem_referencia_mercado',
      concorrente: null,
      mediana: null,
      preco_de_ajustado: pDeSemHit,
      imagem_mercado: '',
      matches: 0,
    };
  }

  const outraLoja = validos
    .filter((h) => !c.loja || !h.loja_id || h.loja_id !== c.loja)
    .sort((a, b) => a.preco - b.preco);
  const menorConcorrente = outraLoja[0] || null;
  const mediana = calcularMediana(validos.map((h) => Number(h.preco)));
  const imagemMercado = (validos.find((h) => h.imagem) || {}).imagem || '';

  // Bloqueio 1: concorrente mais barato (ou praticamente empatado dentro de 1,5%)
  if (menorConcorrente && preco >= menorConcorrente.preco * 0.985) {
    return {
      aprovar: false,
      motivo: 'mais_barato_mercado',
      concorrente: menorConcorrente,
      mediana,
      preco_de_ajustado: pDeOrig,
      imagem_mercado: imagemMercado,
      matches: validos.length,
    };
  }

  // Bloqueio 2 (apenas radar automático): oferta sem economia relevante sobre a mediana real do mercado
  if (modoRadar && mediana && !temCupom && preco > mediana * 0.93 && (mediana - preco) < 40) {
    return {
      aprovar: false,
      motivo: 'sem_desconto_mercado',
      concorrente: menorConcorrente,
      mediana,
      preco_de_ajustado: pDeOrig,
      imagem_mercado: imagemMercado,
      matches: validos.length,
    };
  }

  // Trava anti-"metade do dobro": calibra "De:" acima de 1,25x da referência real de mercado
  let pDeCalibrado = pDeOrig;
  const refJusta = mediana || (menorConcorrente && menorConcorrente.preco) || null;
  if (refJusta && pDeOrig && pDeOrig > refJusta * 1.25) {
    pDeCalibrado = refJusta > preco * 1.04 ? round2(refJusta) : null;
  }

  return {
    aprovar: true,
    motivo: 'ok',
    concorrente: menorConcorrente,
    mediana,
    preco_de_ajustado: pDeCalibrado,
    imagem_mercado: imagemMercado,
    matches: validos.length,
  };
}

function resumirAvisoMercado(av) {
  if (!av) return '';
  if (av.motivo === 'mais_barato_mercado' && av.concorrente) {
    return `⚠️ Atenção: encontrado por ${formatBRL(av.concorrente.preco)} (${av.concorrente.loja_nome}) — mais barato que esta loja!`;
  }
  if (av.motivo === 'sem_desconto_mercado' && av.mediana) {
    return `⚠️ Mercado comum por ${formatBRL(av.mediana)} (desconto muito pequeno em relação à média real)`;
  }
  if (av.mediana || av.concorrente) {
    const ref = av.concorrente || { preco: av.mediana, loja_nome: 'mediana de mercado' };
    return `🔎 Mercado: ${formatBRL(ref.preco)} (${ref.loja_nome})`;
  }
  return '';
}

module.exports = {
  limparQueryMercado,
  montarReqsMercado,
  extrairHitsRespostaMercado,
  lerHitsZoom,
  lerHitsAmazonBusca,
  casarProdutosMercado,
  avaliarPrecoMercado,
  resumirAvisoMercado,
};
