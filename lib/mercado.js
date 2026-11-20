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
const PALAVRAS_KIT = /\b(?:kit|duo|trio|combo|conjunto|coffret|pack|\d+\s*(?:produtos|ptodutos|pe[cç]as|frascos|potes|pares)|sh(?:ampoo)?\s*\+\s*cond(?:icionador)?)\b/i;

function decodificarTextoBasico(s) {
  return String(s || '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\u00AD]/g, '')
    .replace(/&(?:NegativeMediumSpace|ZeroWidthSpace|zwnj|zwj|shy|hairsp);/gi, '')
    .replace(/&(?:nbsp|thinsp|ensp|emsp);/gi, ' ')
    .replace(/&ldquo;|&rdquo;|&bdquo;|&Prime;/gi, '"')
    .replace(/&lsquo;|&rsquo;|&sbquo;|&prime;|&apos;/gi, "'")
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&hellip;/gi, '…')
    .replace(/&deg;/gi, '°')
    .replace(/&times;/gi, 'x')
    .replace(/&quot;/gi, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const n = parseInt(h, 16);
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : ' ';
    })
    .replace(/&#(\d+);/g, (_, d) => {
      const n = parseInt(d, 10);
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : ' ';
    })
    .replace(/&reg;|&trade;/gi, '')
    .replace(/&amp;/gi, '&')
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
    .replace(/\b(\d+(?:[.,]\d+)?)\s+(ml|g|mg|gb|pol|polegadas|w|v|hz|mah)\b/g, '$1$2')
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
  if (/pacheco|drogaria\s*sao\s*paulo|dpsp/.test(n)) return 'pacheco';
  if (/panvel/.test(n)) return 'panvel';
  if (/araujo/.test(n)) return 'araujo';
  if (/pague\s*menos/.test(n)) return 'paguemenos';
  if (/venancio/.test(n)) return 'venancio';
  if (/oficial\s*farma/.test(n)) return 'oficialfarma';
  if (/max\s*titanium/.test(n)) return 'maxtitanium';
  if (/ri\s*happy/.test(n)) return 'rihappy';
  if (/alo\s*bebe/.test(n)) return 'alobebe';
  if (/mahogany/.test(n)) return 'mahogany';
  if (/creamy/.test(n)) return 'creamy';
  if (/ikesaki/.test(n)) return 'ikesaki';
  if (/centauro/.test(n)) return 'centauro';
  if (/netshoes/.test(n)) return 'netshoes';
  if (/olympikus/.test(n)) return 'olympikus';
  if (/mizuno/.test(n)) return 'mizuno';
  if (/under\s*armour/.test(n)) return 'underarmour';
  if (/farm\s*rio/.test(n)) return 'farmrio';
  if (/renner/.test(n)) return 'renner';
  if (/\bcea\b|c&a/.test(n)) return 'cea';
  if (/riachuelo/.test(n)) return 'riachuelo';
  if (/dafiti/.test(n)) return 'dafiti';
  if (/polishop/.test(n)) return 'polishop';
  if (/electrolux/.test(n)) return 'electrolux';
  if (/brastemp/.test(n)) return 'brastemp';
  if (/consul/.test(n)) return 'consul';
  if (/acer/.test(n)) return 'acer';
  if (/motorola/.test(n)) return 'motorola';
  if (/samsung/.test(n)) return 'samsung';
  if (/aliexpress/.test(n)) return 'aliexpress';
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
      imagem: mImg ? normalizarImagemOferta(mImg[1]) : '',
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
  const m = norm.match(/\b(\d+)\s*(?:produtos|ptodutos|itens|pe[cç]as|frascos|potes|pares|unidades|unid)\b/);
  if (m && Number(m[1]) >= 2) return Number(m[1]);
  const mLead = norm.match(/^(\d+)\s*(?:x\b|unidades|un\b)/);
  if (mLead && Number(mLead[1]) >= 2) return Number(mLead[1]);
  const mMult = norm.match(/\b([2-9]|1[0-2])\s*x\b(?!\s*(?:de\s*r\$|sem\s+juros|com\s+juros))/);
  if (mMult) return Number(mMult[1]);
  const mKitN = norm.match(/\b(?:kit|combo|pack|leve)\s+(?:com\s+)?([2-9]|1[0-2])\b/);
  if (mKitN) return Number(mKitN[1]);
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

const TOKENS_GENERICOS_PRODUTO = new Set([
  'creatina', 'whey', 'protein', 'proteina', 'monohidratada', 'concentrado', 'isolado', 'hidrolisado',
  'po', 'capsulas', 'capsula', 'comprimidos', 'comprimido', 'sache', 'saches', 'frasco', 'pote', 'refil',
  'fralda', 'fraldas', 'lenco', 'lencos', 'umedecido', 'umedecidos', 'toalha', 'toalhas',
  'shampoo', 'condicionador', 'mascara', 'protetor', 'solar', 'serum', 'hidratante', 'locao', 'creme',
  'gel', 'oleo', 'agua', 'micelar', 'sabonete', 'desodorante', 'antitranspirante', 'balm', 'labial',
  'perfume', 'colonia', 'deo', 'eau', 'toilette', 'parfum', 'body', 'splash',
  'vitamina', 'vitaminas', 'colageno', 'omega', 'magnesio', 'melatonina', 'suplemento', 'multivitaminico',
  'tenis', 'camiseta', 'camisa', 'vestido', 'calca', 'jaqueta', 'moletom', 'shorts', 'bermuda', 'sandalia', 'chinelo',
  'masculino', 'feminino', 'unissex', 'infantil', 'bebe', 'adulto', 'facial', 'corporal', 'capilar',
  'preto', 'preta', 'branco', 'branca', 'azul', 'rosa', 'cinza', 'verde', 'vermelho', 'vermelha', 'bege', 'marrom',
  'fps', 'pro', 'max', 'plus', 'ultra', 'lite', 'mini', 'extra', 'zero', 'puro', 'pura', 'natural', 'diario', 'noite', 'dia',
  'escova', 'eletrica', 'dental', 'pasta', 'dente', 'fio',
  'monitor', 'gamer', 'mouse', 'teclado', 'fone', 'bluetooth', 'headset', 'caixa', 'som', 'ssd', 'nvme', 'memoria', 'ram', 'placa', 'video', 'notebook', 'smartphone', 'celular', 'smart', 'tv',
  'geladeira', 'refrigerador', 'fogao', 'lavadora', 'microondas', 'air', 'fryer', 'airfryer', 'fritadeira', 'aspirador', 'robo', 'cafeteira', 'panela', 'pressao', 'liquidificador', 'ventilador', 'ferro', 'passar',
  'lego', 'brinquedo', 'carrinho', 'cadeirinha',
]);

function tokenBateMercado(t, tHSet, nHSemEsp) {
  return tHSet.has(t) || (t.length >= 3 && nHSemEsp.includes(t));
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
  if (qtdC != null && qtdC >= 2 && qtdH == null) return false;
  if (qtdC != null && qtdC >= 3 && qtdH == null && pHit < pCand * 0.78) return false;

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
  if (spC.ml.size && !spH.ml.size && Math.max(...[...spC.ml].map(Number)) >= 450 && pHit < pCand * 0.78) return false;
  if (spC.g.size && !spH.g.size && Math.max(...[...spC.g].map(Number)) >= 450 && pHit < pCand * 0.78) return false;
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

  // Regra E: recall estrito (>= 72%) de tokens núcleo do título do candidato + proteção de marca em títulos curtos (<= 4 tokens)
  const tC = [...new Set(tokensNucleo(nC))];
  const tHSet = new Set(tokensNucleo(nH));
  if (!tC.length) return false;
  let batidos = 0;
  for (const t of tC) {
    if (tokenBateMercado(t, tHSet, nHSemEsp)) batidos++;
  }
  const minBatidos = tC.length <= 3 ? Math.min(2, tC.length) : Math.max(3, Math.ceil(tC.length * 0.72));
  if (batidos < minBatidos) return false;

  // Proteção de marca/linha em títulos curtos (<= 4 tokens): evita casar "Creatina em Pó Lavitan 300g" com "Creatina Monohidratada FTW 300g"
  if (tC.length <= 4) {
    const distC = tC.filter((t) => t.length >= 3 && !TOKENS_GENERICOS_PRODUTO.has(t) && !/^\d+(?:[.,]\d+)?(?:ml|g|mg|gb|pol|w|v|hz|mah)$/.test(t));
    if (distC.length) {
      const distBatidos = distC.filter((t) => tokenBateMercado(t, tHSet, nHSemEsp)).length;
      const minDist = distC.length === 1 ? 1 : Math.ceil(distC.length * 0.75);
      if (distBatidos < minDist) return false;
    }
  }
  return true;
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
  const imagemMercado = (validos.find((h) => h.imagem) || {}).imagem || '';
  if (!outraLoja.length) {
    let pDeSemConcorrente = pDeOrig;
    if (!temCupom && pDeOrig && preco > 0 && pDeOrig > preco * 2.6 && Number(c.likes || 0) < 15 && Number(c.cliques || 0) < 120) {
      pDeSemConcorrente = null;
    }
    return {
      aprovar: true,
      motivo: 'sem_referencia_mercado',
      concorrente: null,
      mediana: null,
      preco_de_ajustado: pDeSemConcorrente,
      imagem_mercado: imagemMercado,
      matches: 0,
    };
  }
  const menorConcorrente = outraLoja[0] || null;
  const mediana = calcularMediana(outraLoja.map((h) => Number(h.preco)));

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
  // Para ticket < R$ 80 o spread entre grandes lojas é mais estreito (calibra limiar de 7% para 5%).
  const fatorBloqueio2 = preco < 80 ? 0.95 : 0.93;
  if (modoRadar && mediana && !temCupom && preco > mediana * fatorBloqueio2 && (mediana - preco) < 40) {
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
  normalizarTextoMercado,
  extrairQtdCombo,
  limparQueryMercado,
  montarReqsMercado,
  extrairHitsRespostaMercado,
  lerHitsZoom,
  lerHitsAmazonBusca,
  casarProdutosMercado,
  avaliarPrecoMercado,
  resumirAvisoMercado,
};
