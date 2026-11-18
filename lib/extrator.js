'use strict';
// Extração automática e gratuita de ofertas a partir de apenas um link (ou mensagem encaminhada):
// · preserva links curtos de afiliado (mercadolivre.com/sec, s.shopee.com.br, amzn.to, divulgador.magalu…)
// · lê título, preço atual, preço antigo ("De:") e imagem via JSON-LD, __NEXT_DATA__, OpenGraph ou HTML da loja
// · reconstrói o título pelo slug da URL quando a loja bloqueia leitura da página (ex.: Mercado Livre)
// · classifica a categoria automaticamente pelas palavras do produto.
const { parsePreco, slug, truncar, escapeHtml } = require('./util');
const { sha256Hex } = require('./sha256');
const { parseUrl, identificar, nomeLoja } = require('./lojas');
const { ehCurto, lerLocation, textoRespostaHttp, extrairHrefCanonica } = require('./curtos');

function msgAdmin(chatId, texto, extra) {
  return {
    bot: 'admin',
    metodo: 'sendMessage',
    payload: Object.assign({ chat_id: chatId, text: texto, link_preview_options: { is_disabled: true } }, extra || {}),
    ref: null,
  };
}

const IGNORAR_HOST = /(?:^|\.)(t\.me|telegram\.me|telegram\.dog|wa\.me|whatsapp\.com|instagram\.com|facebook\.com|fb\.com|youtube\.com|youtu\.be|tiktok\.com|twitter\.com|x\.com|threads\.net|keepa\.com|buscape\.com\.br|zoom\.com\.br|google\.com|google\.com\.br|pinterest\.com|m\.media-amazon\.com|images-na\.ssl-images-amazon\.com|mlstatic\.com|susercontent\.com|shopeemobile\.com|imgur\.com|ibb\.co)$/i;

const EXT_IMAGEM = /\.(?:jpe?g|png|webp|gif|svg|avif|bmp)$/i;

const PRIORIDADE_LOJA = /(?:^|\.)(amazon\.com\.br|a\.co|amzn\.to|amzn\.com|shopee\.com\.br|s\.shopee\.com\.br|shope\.ee|shp\.ee|mercadoli(?:vre|bre)\.com(?:\.br)?|meli\.la|magazineluiza\.com\.br|magazinevoce\.com\.br|divulgador\.magalu\.com|kabum\.com\.br|aliexpress\.com|s\.click\.aliexpress\.com|a\.aliexpress\.com|pichau\.com\.br|terabyteshop\.com\.br|casasbahia\.com\.br|ponto\.com\.br|extra\.com\.br|fastshop\.com\.br|natura\.com\.br|boticario\.com\.br)$/i;

/** Link curto/redirecionador que já carrega o código de afiliado de quem gerou (exceto a.co, que é só compartilhamento). */
function ehAfiliadoCurto(url) {
  const u = parseUrl(url);
  if (!u) return false;
  const h = u.hostname.replace(/^www\./, '');
  if (/^(amzn\.to|s\.shopee\.com\.br|shope\.ee|shp\.ee|meli\.la|divulgador\.magalu\.com|s\.click\.aliexpress\.com|a\.aliexpress\.com)$/.test(h)) return true;
  if (/^mercadoli(vre|bre)\.com(\.br)?$/.test(h) && /^\/sec\//i.test(u.pathname)) return true;
  if (/^magazinevoce\.com\.br$/.test(h)) return true;
  return false;
}

/** Lê um parâmetro da query string sem depender de APIs ausentes no sandbox do n8n. */
function lerParam(search, nome) {
  const s = String(search || '').replace(/^\?/, '');
  if (!s) return '';
  for (const par of s.split('&')) {
    const eq = par.indexOf('=');
    const k = eq >= 0 ? par.slice(0, eq) : par;
    if (k.toLowerCase() === nome.toLowerCase()) {
      const v = eq >= 0 ? par.slice(eq + 1) : '';
      try { return decodeURIComponent(v.replace(/\+/g, ' ')).trim(); } catch (e) { return v.trim(); }
    }
  }
  return '';
}

/** Extrai ?tag=… de uma URL da Amazon quando presente. */
function tagAmazonDaUrl(url) {
  const u = parseUrl(url);
  if (!u || !/(^|\.)amazon\.com\.br$/.test(u.hostname)) return '';
  const tag = lerParam(u.search, 'tag');
  return /^[a-z0-9][\w-]{1,40}$/i.test(tag) ? tag : '';
}

/** URL com parâmetros de afiliado de outras lojas (Magazine Você, Awin/KaBuM, AliExpress…). */
function temParamAfiliado(url) {
  const u = parseUrl(url);
  if (!u) return false;
  if (/magazinevoce\.com\.br|divulgador\.magalu\.com|s\.click\.aliexpress\.com|a\.aliexpress\.com/i.test(u.hostname)) return true;
  return /(?:^|[?&])(awc|aff_fcid|aff_fsk|aff_platform|sk|parceiro|partner|ref_id|franq|utm_source=awin)=/i.test(u.search);
}

/** Todos os links http(s) de um texto + entidades text_link, filtrando redes sociais/comparadores e priorizando lojas. */
function extrairLinksProduto(texto, urlsExtras) {
  const brutos = (String(texto || '').match(/https?:\/\/[^\s<>"']+/gi) || []).concat(urlsExtras || []);
  const limpos = [];
  const vistos = new Set();
  for (const b of brutos) {
    const url = String(b || '').replace(/[).,;:!?\]>]+$/, '').trim();
    const u = parseUrl(url);
    if (!u) continue;
    const h = u.hostname.replace(/^www\./, '');
    if (IGNORAR_HOST.test(h)) continue;
    if (EXT_IMAGEM.test(u.pathname || '')) continue;
    if (vistos.has(url)) continue;
    vistos.add(url);
    limpos.push({ url, prio: PRIORIDADE_LOJA.test(h) ? 0 : 1 });
  }
  limpos.sort((a, b) => a.prio - b.prio);
  return limpos.map((x) => x.url);
}

/* ---------- reconstrução de título pelo slug da URL ---------- */

const ACENTOS_SLUG = {
  geracao: 'Geração', eletrica: 'Elétrica', eletrico: 'Elétrico', eletronica: 'Eletrônica', eletronico: 'Eletrônico',
  oleo: 'Óleo', robo: 'Robô', cafe: 'Café', bebe: 'Bebê', portatil: 'Portátil', agua: 'Água', vacuo: 'Vácuo',
  algodao: 'Algodão', lenco: 'Lenço', lencos: 'Lenços', lencol: 'Lençol', hidratacao: 'Hidratação',
  nutricao: 'Nutrição', reconstrucao: 'Reconstrução', colonia: 'Colônia', relogio: 'Relógio', camera: 'Câmera',
  memoria: 'Memória', video: 'Vídeo', audio: 'Áudio', pressao: 'Pressão', fogao: 'Fogão', colchao: 'Colchão',
  sabao: 'Sabão', locao: 'Loção', racao: 'Ração', iluminacao: 'Iluminação', ventilacao: 'Ventilação',
  depilacao: 'Depilação', massagem: 'Massagem', termica: 'Térmica', termico: 'Térmico', sem: 'sem', com: 'com',
  automatica: 'Automática', automatico: 'Automático', ergonomica: 'Ergonômica', ergonomico: 'Ergonômico',
  magnetico: 'Magnético', magnetica: 'Magnética', dobravel: 'Dobrável', recarregavel: 'Recarregável',
  impermeavel: 'Impermeável', silencioso: 'Silencioso', silenciosa: 'Silenciosa', infantil: 'Infantil',
  unitario: 'Unitário', sanitaria: 'Sanitária', mecanico: 'Mecânico', mecanica: 'Mecânica',
};

const SIGLAS = new Set([
  'tv', 'ssd', 'hd', 'nvme', 'usb', 'usbc', 'hdmi', 'tws', 'led', 'rgb', 'qled', 'oled', 'uhd', 'fhd',
  '4k', '8k', '5g', '4g', 'wifi', 'anc', 'jbl', 'lg', 'hp', 'ps5', 'ps4', 'pc', 'cpu', 'gpu',
  'rtx', 'gtx', 'amd', 'ram', 'ips', 'va', 'fps', 'uv',
]);

const PREPOSICOES = new Set(['de', 'da', 'do', 'das', 'dos', 'com', 'sem', 'para', 'por', 'em', 'no', 'na', 'nos', 'nas', 'e', 'a', 'o']);

function humanizarSlug(bruto) {
  let s = String(bruto || '');
  try { s = decodeURIComponent(s); } catch (e) { /* mantém como veio */ }
  s = s
    .replace(/^MLB-?\d+-/i, '')
    .replace(/-_JM$/i, '')
    .replace(/-i\.\d+\.\d+$/i, '')
    .replace(/[-_+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s || /^\d+$/.test(s)) return '';
  const palavras = s.split(' ').filter(Boolean);
  if (palavras.length < 2 && s.length < 6) return '';
  const fmt = palavras.map((w, idx) => {
    const low = w.toLowerCase();
    if (ACENTOS_SLUG[low]) {
      const ac = ACENTOS_SLUG[low];
      return idx === 0 ? ac.charAt(0).toUpperCase() + ac.slice(1) : ac;
    }
    if (idx > 0 && PREPOSICOES.has(low)) return low;
    if (/^\d+(?:[.,]\d+)?(?:l|ml|w|kw|v|gb|tb|mb|mah|hz|ghz|pol|mm|cm|m|kg|g|un|pcs|x)$/i.test(w)) {
      return w.toUpperCase();
    }
    if (low === 'bivolt' || low === 'bluetooth' || low === 'kit') return low.charAt(0).toUpperCase() + low.slice(1);
    if (SIGLAS.has(low)) return low.toUpperCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });
  return truncar(fmt.join(' '), 180);
}

/** Tenta extrair o nome do produto pelo caminho da URL (ML, Shopee, Amazon, Magalu, KaBuM e lojas em geral). */
function tituloDaUrl(url) {
  const u = parseUrl(url);
  if (!u) return '';
  const p = u.pathname || '';
  const segs = p.split('/').filter(Boolean);
  if (!segs.length) return '';

  // Amazon: /Nome-do-Produto/dp/B0XXXX
  const idxDp = segs.findIndex((s) => /^(dp|gp)$/i.test(s));
  if (idxDp > 0) return humanizarSlug(segs[idxDp - 1]);

  // Mercado Livre / Magalu: /nome-do-produto/p/ID
  const idxP = segs.findIndex((s) => s.toLowerCase() === 'p');
  if (idxP > 0) return humanizarSlug(segs[idxP - 1]);

  // Mercado Livre clássico: /MLB-123456-nome-do-produto-_JM
  const mlb = segs.find((s) => /^MLB-?\d+-/i.test(s));
  if (mlb) return humanizarSlug(mlb);

  // Shopee: /Nome-do-Produto-i.123.456
  const shp = segs.find((s) => /-i\.\d+\.\d+$/i.test(s));
  if (shp) return humanizarSlug(shp);

  // KaBuM!: /produto/12345/nome-do-produto
  const idxProd = segs.findIndex((s) => /^produtos?$/i.test(s));
  if (idxProd >= 0 && segs[idxProd + 2]) return humanizarSlug(segs[idxProd + 2]);

  // Genérico: maior segmento com cara de slug (ignora rotas intermediárias como /gz/account-verification ou /social/nick)
  if (/^(gz|social|sec|universal-link|opaanlp|lista|perfil|ofertas)$/i.test(segs[0])) return '';
  const candidatos = segs
    .filter((s) => s.includes('-') && /[a-z]{3,}/i.test(s) && !/^(sec|gz|social|account-verification|universal-link|opaanlp|product|dp|gp)$/i.test(s))
    .sort((a, b) => b.length - a.length);
  return candidatos.length ? humanizarSlug(candidatos[0]) : '';
}

/* ---------- auto-classificação de categoria ---------- */

const PALAVRAS_CAT = {
  bebe: [
    'fralda', 'pampers', 'huggies', 'mamypoko', 'babysec', 'turma da monica baby', 'lenco umedecido',
    'pomada de assadura', 'hipoglos', 'bepantol baby', 'mamadeira', 'chupeta', 'bebe conforto', 'carrinho de bebe',
    'cadeirinha', 'berco', 'babador', 'extrator de leite', 'bombinha de leite', 'enxoval', 'maternidade',
    'formula infantil', 'nan ', 'aptamil', 'granado bebe', 'johnsons baby', 'brinquedo educativo', 'fisher price',
    'boneca', 'hot wheels', 'lego', 'playmobil', 'massinha play', 'infantil bebe', 'recem nascido',
  ],
  beleza: [
    'perfume', 'eau de parfum', 'eau de toilette', 'colonia', 'body splash', 'desodorante', 'antitranspirante',
    'hidratante', 'serum', 'vitamina c', 'acido hialuronico', 'niacinamida', 'retinol', 'protetor solar', 'skincare',
    'agua micelar', 'sabonete facial', 'gel de limpeza', 'creme facial', 'creme corporal', 'oleo corporal',
    'shampoo', 'condicionador', 'mascara capilar', 'oleo capilar', 'leave in', 'cronograma capilar',
    'secador de cabelo', 'chapinha', 'prancha alisadora', 'escova secadora', 'escova rotativa', 'modelador de cachos',
    'babyliss', 'maquiagem', 'batom', 'gloss', 'rimel', 'mascara de cilios', 'delineador', 'corretivo', 'po compacto',
    'paleta de sombras', 'blush', 'esmalte', 'depilador', 'aparador de pelos', 'barbeador', 'oneblade',
    'boticario', 'natura', 'eudora', 'avon', 'quem disse berenice', 'wella', 'kerastase', 'loreal', 'elseve',
    'principia', 'cerave', 'la roche', 'vichy', 'neutrogena', 'isdin', 'bioderma', 'creamy', 'sallve', 'oceane',
  ],
  tech: [
    'fone', 'bluetooth', 'tws', 'headset', 'airpods', 'buds', 'headphone', 'caixa de som', 'jbl', 'echo dot',
    'echo pop', 'echo show', 'alexa', 'fire tv', 'kindle', 'roku', 'chromecast', 'mi box', 'smartwatch',
    'smartband', 'galaxy watch', 'apple watch', 'amazfit', 'garmin', 'celular', 'smartphone', 'iphone',
    'galaxy s', 'galaxy a', 'galaxy m', 'redmi', 'poco ', 'xiaomi', 'motorola', 'moto g', 'edge ', 'realme',
    'notebook', 'macbook', 'laptop', 'ultrabook', 'tablet', 'ipad', 'monitor', 'ultrawide', 'gamer', 'placa de video',
    'rtx', 'radeon', 'processador', 'ryzen', 'core i5', 'core i7', 'placa mae', 'memoria ram', 'ssd', 'nvme',
    'hd externo', 'pendrive', 'cartao micro sd', 'teclado mecanico', 'teclado sem fio', 'mouse sem fio', 'mouse gamer',
    'mousepad', 'webcam', 'microfone', 'ring light', 'playstation', 'ps5', 'ps4', 'dualshock', 'dualsense',
    'xbox', 'nintendo switch', 'controle sem fio', 'joystick', 'carregador turbo', 'power bank', 'carregador portatil',
    'cabo usb', 'hub usb', 'roteador', 'mesh', 'repetidor wifi', 'smart tv', 'qled', 'oled', 'soundbar',
    'camera de seguranca', 'camera wifi', 'impressora', 'multifuncional', 'nobreak', 'filtro de linha', 'iclamper',
  ],
  casa: [
    'air fryer', 'airfryer', 'fritadeira', 'panela', 'jogo de panelas', 'frigideira', 'pipoqueira', 'chaleira',
    'liquidificador', 'batedeira', 'mixer', 'processador de alimentos', 'sanduicheira', 'grill', 'torradeira',
    'cafeteira', 'nespresso', 'dolce gusto', 'tres coracoes', 'microondas', 'micro ondas', 'forno eletrico',
    'fogao', 'cooktop', 'coifa', 'geladeira', 'refrigerador', 'freezer', 'frigobar', 'adega', 'cervejeira',
    'lava loucas', 'lavadora', 'maquina de lavar', 'lava e seca', 'tanquinho', 'secadora', 'centrifuga',
    'aspirador', 'robo aspirador', 'vaporetto', 'lavadora de alta pressao', 'wap ', 'mop', 'vassoura',
    'ventilador', 'ar condicionado', 'climatizador', 'umidificador', 'desumidificador', 'purificador de agua',
    'ferro de passar', 'passadeira a vapor', 'vaporizador', 'colchao', 'travesseiro', 'jogo de cama', 'lencol',
    'edredom', 'cobertor', 'toalha de banho', 'cortina', 'tapete', 'sofa', 'poltrona', 'cadeira de escritorio',
    'mesa', 'armario', 'guarda roupa', 'prateleira', 'organizador', 'pote hermetico', 'garrafa termica',
    'copo termico', 'stanley', 'talheres', 'faqueiro', 'aparelho de jantar', 'lampada', 'fita led', 'fechadura digital',
    'furadeira', 'parafusadeira', 'jogo de ferramentas', 'chave de fenda', 'lava roupas', 'omo ', 'downy', 'ariel',
    'detergente', 'desinfetante', 'papel higienico', 'racao', 'pet ',
  ],
};

function normalizarBusca(s) {
  return ' ' + String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim() + ' ';
}

/** Escolhe a melhor categoria do produto com base no título e na URL. */
function classificarCategoria(texto, cfg) {
  const disponiveis = Object.keys((cfg && cfg.categorias) || PALAVRAS_CAT).filter((c) => c !== 'top');
  const padrao = (cfg && cfg.auto && cfg.auto.categoria_padrao && disponiveis.includes(cfg.auto.categoria_padrao))
    ? cfg.auto.categoria_padrao
    : (disponiveis.includes('casa') ? 'casa' : disponiveis[0] || 'casa');
  const norm = normalizarBusca(texto);
  if (norm.trim().length < 2) return { categoria: padrao, confianca: 0 };

  let melhor = padrao;
  let maiorNota = 0;
  for (const cat of disponiveis) {
    const lista = PALAVRAS_CAT[cat] || [];
    let nota = 0;
    for (const kw of lista) {
      const k = kw.trim();
      if (!k) continue;
      if (k.includes(' ')) {
        if (norm.includes(' ' + k + ' ') || norm.includes(' ' + k)) nota += 3;
      } else if (norm.includes(' ' + k + ' ') || norm.includes(' ' + k + 's ')) {
        nota += 2;
      }
    }
    const extras = (cfg && cfg.shopee && cfg.shopee.buscas && cfg.shopee.buscas[cat]) || [];
    for (const kw of extras) {
      const k = normalizarBusca(kw).trim();
      if (k && norm.includes(' ' + k)) nota += 3;
    }
    if (nota > maiorNota) {
      maiorNota = nota;
      melhor = cat;
    }
  }
  return { categoria: melhor, confianca: maiorNota };
}

/* ---------- extração do texto compartilhado / encaminhado ---------- */

const LIXO_LINHA = /^(?:#publi\b|cont[eé]m link de afiliado|como associado da amazon|pre[cç]o e disponibilidade|conferido em \d|frete:\s*confira|entre no (?:nosso )?grupo|siga (?:nosso|o) canal|compre aqui|ver na |veja o pre[cç]o|link na bio|chamar amigos|encontre na shopee|compre agora)/i;

const GANCHO_GENERICO = /^(?:pre[cç]o despencou|caiu muito|baixou forte|achado do dia|baixou de verdade|valendo muito a pena|abaixo do hist[oó]rico|pre[cç]o l[aá] embaixo|valendo o clique|no menor patamar|voltou ao menor valor|pintando com cupom|pre[cç]o reduzido com cupom|pre[cç]o conferido|destaque conferido|achado pra casa|sua casa merece|facilita a rotina|achado tech|upgrade certeiro|destaque em tecnologia|achado de beleza|destaque do dia|queridinho com [oó]timo pre[cç]o|economia pra fam[ií]lia|achado pra quem tem pequeno|cuidado e economia|olha esse achado|oportunidade boa|pre[cç]o selecionado|oferta rel[aâ]mpago|corre que vai acabar|menor pre[cç]o|bugou|imperd[ií]vel)(?:\b|[!:.\s])/i;

const FALSO_CUPOM = /^(?:da|do|das|dos|na|no|nas|nos|em|com|sem|por|para|pelo|pela|abaixo|acima|antes|depois|loja|aqui|dispon[ií]vel|disponivel|aplicado|autom[aá]tico|automatico|de|off|exclusivo|limitado|especial|gr[aá]tis|gratis|selecionado|tela|p[aá]gina|pagina|app|site|carrinho|checkout|primeira)$/i;

/** Extrai preço, preço antigo ("De:"), cupom, imagem e título de um texto livre / encaminhado / compartilhado do app. */
function extrairDoTexto(texto) {
  const bruto = String(texto || '').trim();
  const out = { titulo: null, preco: null, preco_de: null, ref90: null, ref90_fonte: '', cupom: '', imagem: '', top: false };
  if (!bruto) return out;

  // Imagem explícita: "img https://..."
  const mImg = bruto.match(/(?:^|\n)\s*(?:img|imagem|foto)\s*[:=]?\s*(https?:\/\/\S+)/i);
  if (mImg) out.imagem = mImg[1].replace(/[).,;:!?\]>]+$/, '');

  // Cupom: "cupom CASA10", "use o cupom: PROMO20", "código de desconto: OFF15"
  for (const m of bruto.matchAll(/(?:cupom|cupon|c[oó]digo(?:\s+(?:de\s+desconto|promocional))?)\s*(?:de\s+desconto)?\s*[:=-]?\s*([A-Z0-9][A-Z0-9_-]{2,30})\b/gi)) {
    const cand = m[1];
    if (FALSO_CUPOM.test(cand)) continue;
    // "Código: 12345678" puramente numérico longo costuma ser SKU da loja, não cupom
    if (/^c[oó]digo$/i.test(m[0].split(/\s|[:=-]/)[0]) && /^\d{6,}$/.test(cand)) continue;
    out.cupom = cand.toUpperCase();
    break;
  }

  // "de R$ 499,90 por R$ 299,90", "De ~R$ 299,90~ por: 💰 *R$ 199,90*", "De R$ 1.999 por R$ 1.499" ou "de 499,90 por 299,90"
  const mDePor = bruto.match(/\bde\s*:?\s*[~*_]*\s*R\$\s*([\d.]+(?:,\d{1,2})?)\s*[~*_]*\s*(?:por|→|->)\s*:?\s*[\s~*_💰🔥💸✅]*R\$\s*([\d.]+(?:,\d{1,2})?)\b/iu)
    || bruto.match(/\bde\s*:?\s*[~*_]*\s*(?:R\$\s*)?([\d.]+,\d{2})\s*[~*_]*\s*(?:por|→|->)\s*:?\s*[\s~*_💰🔥💸✅]*(?:R\$\s*)?([\d.]+(?:,\d{1,2})?)\b/iu)
    || bruto.match(/[~❌]\s*R\$\s*([\d.]+(?:,\d{1,2})?)\s*[~]?\s*(?:por|→|->|\s+[✅💰🔥]*)\s*[*_]*R\$\s*([\d.]+(?:,\d{1,2})?)\b/iu)
    || bruto.match(/R\$\s*([\d.]+(?:,\d{1,2})?)\s*(?:→|->)\s*R\$\s*([\d.]+(?:,\d{1,2})?)/i);
  if (mDePor) {
    const pDe = parsePreco(mDePor[1]);
    const pPor = parsePreco(mDePor[2]);
    if (pPor && pDe && pDe > pPor) { out.preco_de = pDe; out.preco = pPor; }
    else if (pPor) out.preco = pPor;
  }

  // Remove parcelas ("10x de R$ 29,90"), valores secundários antes/depois ("economia de R$ 50", "R$ 30 OFF", "R$ 15 de cashback") e preço unitário ("R$ 0,99 a tira", "R$ 4,97/un")
  const semRuido = bruto
    .replace(/\b\d{1,2}\s*x\s*(?:de\s*)?R\$\s*[\d.]+(?:,\d{1,2})?/gi, ' ')
    .replace(/\b(?:economia|desconto|off|frete|cupom|cupon|cashback|vale[- ]?compras?|parcelas?)\s*(?:de|:)?\s*R\$\s*[\d.]+(?:,\d{1,2})?/gi, ' ')
    .replace(/R\$\s*[\d.]+(?:,\d{1,2})?\s*(?:de\s+(?:desconto|economia|cashback|frete|cupom|off|vale)|off\b)/gi, ' ')
    .replace(/(?:\bsai(?:\s+a)?\s+)?R\$\s*[\d.]+(?:,\d{1,2})?\s*(?:\/\s*(?:un(?:id)?|kg|g|l|ml|m|tira|caps|comp|lata|garrafa|pacote|rolo|folha|dose)\b|(?:cada|por\s+(?:unidade|unid|tira|lata|garrafa|item|pe[cç]a)|a\s+(?:tira|unidade|lata|pe[cç]a))\b)/gi, ' ');

  if (out.preco == null) {
    // Exige R$, ou palavra explícita "preço/valor", ou centavos (,dd) para nunca confundir "por 12 meses" com R$ 12
    const mComRS = semRuido.match(/(?:^|\s)(?:pre[cç]o|por|valor|apenas|somente|sai a|hoje)\s*[:=]?\s*[*_]*R\$\s*([\d.]+(?:,\d{1,2})?)\b/i);
    const mExplicito = !mComRS && semRuido.match(/(?:^|\s)(?:pre[cç]o|valor)\s*[:=]?\s*([\d.]+(?:,\d{1,2})?)\b/i);
    const mCentavos = !mComRS && !mExplicito && semRuido.match(/(?:^|\s)(?:por|apenas|somente|sai a|hoje)\s*[:=]?\s*([\d.]+,\d{2})\b/i);
    const achado = mComRS || mExplicito || mCentavos;
    if (achado) out.preco = parsePreco(achado[1]);
  }
  if (out.preco == null) {
    const todosR = [...semRuido.matchAll(/R\$\s*([\d.]+(?:,\d{1,2})?)/gi)].map((m) => parsePreco(m[1])).filter(Boolean);
    if (todosR.length >= 2 && todosR[0] > todosR[1] && todosR[1] >= todosR[0] * 0.15 && out.preco_de == null) {
      out.preco_de = todosR[0];
      out.preco = todosR[1];
    } else if (todosR.length >= 1) {
      out.preco = todosR[0];
    }
  }

  // Preço solto ao lado do link: "https://mercadolivre.com/sec/xxx 299,90"
  const semUrls = bruto.replace(/https?:\/\/[^\s<>"']+/gi, ' ');
  if (out.preco == null) {
    const mSolto = semUrls.match(/(?:^|\s)(\d{1,4},\d{2})(?:\s|$)/);
    if (mSolto) out.preco = parsePreco(mSolto[1]);
  }

  // ref90 explícito caso o admin tenha escrito
  const mRef = bruto.match(/\b(?:ref90|min90|menor90)\s*[:=]?\s*(?:R\$\s*)?([\d.,]+)(?:\s+(https?:\/\/\S+))?/i);
  if (mRef) {
    out.ref90 = parsePreco(mRef[1]);
    out.ref90_fonte = mRef[2] || '';
  }

  // Wrappers clássicos de compartilhamento de apps (Shopee, Amazon, Mercado Livre)
  const mShopeeApp = semUrls.match(/d[eê]\s+uma\s+olhada\s+em\s+(.+?)\s+por\s+R\$\s*[\d.,]+/i)
    || semUrls.match(/confira\s+(.+?)\s+com\s+\d+%\s+de\s+desconto/i);
  if (mShopeeApp && mShopeeApp[1].trim().length >= 4) {
    out.titulo = truncar(mShopeeApp[1].trim(), 180);
    return out;
  }

  const linhas = bruto
    .split(/\r?\n/)
    .map((l) => l.replace(/https?:\/\/[^\s<>"']+/gi, '').trim())
    .map((l) => l.replace(/^(?:confira este produto na amazon|olha o que eu encontrei no mercado livre|encontrei no mercado livre|olha essa oferta|achado)\s*[:=-]\s*/i, '').trim())
    .map((l) => l.replace(/\s+por\s+R\$\s*[\d.,]+(?:\s+na\s+shopee.*|\s+[àa]\s+vista.*)?$/i, '').trim())
    .filter(Boolean);

  const candidatosTitulo = [];
  for (const l of linhas) {
    if (/^\/(link|auto|oferta)\b/i.test(l)) continue;
    if (LIXO_LINHA.test(l)) continue;
    if (/^(?:pre[cç]o|por|valor|ref90|min90|menor90|cupom|cupon|c[oó]digo|img|imagem|foto|tg|wac|wag|x)\s*[:=]?\s+\S/i.test(l)) continue;
    if (/^(?:💰|💸|🕒|✅|🎟️|👉|🔗|⚡\s*\*?ALERTA)/u.test(l)) continue;
    if (/^(?:de\s*:?\s*)?[~*_]*(?:R\$\s*)?\d[\d.,]*(?:\s*(?:por|→|->)\s*[~*_]*(?:R\$\s*)?\d[\d.,]*)?(?:\s+(?:cupom|cupon|c[oó]digo|no\s+pix|[àa]\s+vista|em\s+\d+x)\b.*|\s*)?$/i.test(l)) continue;
    const limpa = l
      .replace(/^[*_~`🔥✨💥🚨👀🛒🏷️🎯📉🏆🏠💻🎁👶🍼🧸⚡🍳💖]+\s*/gu, '')
      .replace(/\s+(?:de\s+(?:R\$\s*)?[\d.,]+\s+)?por\s+R\$\s*[\d.,]+.*$/i, '')
      .replace(/\s+R\$\s*[\d.,]+\s*$/i, '')
      .replace(/\s+\d{1,4},\d{2}\s*$/, '')
      .replace(/[*_~`]+$/g, '')
      .trim();
    if (limpa.length >= 5 && /[a-záéíóúâêôãõç]{3,}/i.test(limpa)) {
      candidatosTitulo.push(limpa);
    }
  }
  const real = candidatosTitulo.find((c) => !GANCHO_GENERICO.test(c)) || candidatosTitulo[0] || null;
  if (real) out.titulo = truncar(real, 180);
  return out;
}

/** Fallback para links curtos não expandidos no 1º salto (ex.: bloqueio temporário ou duplo redirecionamento). */
function identificarLinkFlexivel(url, urlHop) {
  const id = identificar(url);
  if (!id.erro) return id;
  if (!ehCurto(url)) return id;
  if (urlHop && !ehCurto(urlHop)) {
    const idHop = identificar(urlHop);
    if (!idHop.erro) return idHop;
  }
  const alvo = urlHop || url;
  const u = parseUrl(alvo) || parseUrl(url);
  const h = u ? u.hostname.replace(/^www\./, '') : '';
  const hash = sha256Hex(url).slice(0, 12);
  if (/^(amzn\.to|a\.co|amzn\.com|amzn\.eu)$/.test(h)) {
    return { loja: 'amazon', produto_id: 'amz_' + hash, url_limpa: url, curto_pendente: true };
  }
  if (/^(s\.shopee\.com\.br|shope\.ee|shp\.ee)$/.test(h)) {
    return { loja: 'shopee', produto_id: 'shp_' + hash, url_limpa: url, curto_pendente: true };
  }
  if (/^(meli\.la)$/.test(h) || (/^mercadoli(vre|bre)\.com(\.br)?$/.test(h) && /^\/sec\//i.test(u.pathname))) {
    return { loja: 'ml', produto_id: 'ml_' + hash, url_limpa: url, curto_pendente: true };
  }
  return { loja: 'outra', produto_id: 'url_' + hash, url_limpa: url, curto_pendente: true };
}

/**
 * Monta uma oferta automática a partir de uma mensagem com link (sem exigir /oferta, título, categoria nem preço).
 * meta: { curto, expandido, resp_curto } quando havia link curto aberto antes.
 */
function parseMensagemLink(msg, cfg, meta) {
  const ents = ((msg && msg.entities) || []).concat((msg && msg.caption_entities) || []);
  const urlsEnt = ents.filter((e) => e && e.type === 'text_link' && e.url).map((e) => e.url);
  const textoBruto = [msg && msg.text, msg && msg.caption].filter(Boolean).join('\n').trim();
  const links = extrairLinksProduto(textoBruto, urlsEnt);
  if (!links.length) return null;

  let catExplicita = null;
  let flagTop = false;
  const primeira = (textoBruto.split(/\r?\n/)[0] || '').trim();
  if (/^\/(link|auto|oferta)\b/i.test(primeira)) {
    const toks = primeira.split(/\s+/).slice(1);
    const cats = Object.keys((cfg && cfg.categorias) || {}).filter((c) => c !== 'top');
    for (const tok of toks) {
      if (/^https?:\/\//i.test(tok)) continue;
      const s = slug(tok);
      if (s === 'top') { flagTop = true; continue; }
      const achou = cats.find((c) => c === s) || (s.length >= 3 ? cats.find((c) => c.startsWith(s)) : null);
      if (achou && !catExplicita) catExplicita = achou;
    }
  }

  const urlEncontrada = links[0];
  const hopCurto = meta && meta.resp_curto ? lerLocation(meta.resp_curto) : '';
  const id = identificarLinkFlexivel(urlEncontrada, hopCurto);
  if (id.erro) return { erro: id.erro };

  const ext = extrairDoTexto(textoBruto);

  // Se o passo "Abrir link curto" já devolveu HTML (ex.: mercadolivre.com/sec sem 302), aproveita os metadados!
  const htmlCurto = meta && meta.resp_curto ? textoRespostaHttp(meta.resp_curto) : '';
  if (htmlCurto && htmlCurto.includes('<')) {
    const pre = lerPaginaProduto(meta.resp_curto, hopCurto || urlEncontrada);
    if (!ext.titulo && pre.titulo) ext.titulo = pre.titulo;
    if (ext.preco == null && pre.preco != null) ext.preco = pre.preco;
    if (ext.preco_de == null && pre.preco_de != null) ext.preco_de = pre.preco_de;
    if (!ext.imagem && pre.imagem) ext.imagem = pre.imagem;
  }

  const urlAlvo = hopCurto && !id.curto_pendente ? hopCurto : (hopCurto || urlEncontrada);
  const tituloSlug = !ext.titulo ? tituloDaUrl(urlEncontrada) || tituloDaUrl(urlAlvo) : '';
  const tituloInicial = ext.titulo || tituloSlug || null;

  const autoCat = catExplicita
    ? { categoria: catExplicita, confianca: 99 }
    : classificarCategoria([tituloInicial || '', urlEncontrada, textoBruto].join(' '), cfg);

  const manuais = { modo_link: true, categoria_auto: !catExplicita };
  if (ext.cupom) manuais.cupom = ext.cupom;
  if (ext.preco_de) manuais.preco_de = ext.preco_de;
  if (!ext.titulo && tituloSlug) manuais.titulo_slug = true;
  if (id.curto_pendente) manuais.curto_pendente = true;

  // Preserva afiliado: link curto original (mercadolivre.com/sec, s.shopee.com.br, amzn.to…), hop afiliado (bit.ly → amzn.to), tag da URL Amazon, ou afiliado de outra loja.
  const curtoOrig = (meta && meta.curto && ehAfiliadoCurto(meta.curto) ? meta.curto : '')
    || (ehAfiliadoCurto(urlEncontrada) ? urlEncontrada : '')
    || (hopCurto && ehAfiliadoCurto(hopCurto) ? urlEncontrada : '');
  if (curtoOrig) manuais._afiliado = curtoOrig;
  else if (id.loja === 'outra' && temParamAfiliado(urlEncontrada)) manuais._afiliado = urlEncontrada;

  const tagUrl = id.loja === 'amazon' ? tagAmazonDaUrl(urlEncontrada) : '';
  if (tagUrl) manuais._tag_url = tagUrl;

  return {
    ok: true,
    oferta: {
      categoria: autoCat.categoria,
      top: flagTop || ext.top,
      url: id.url_limpa,
      url_original: urlAlvo,
      loja: id.loja,
      produto_id: id.produto_id,
      titulo: tituloInicial,
      preco: ext.preco,
      ref90: ext.ref90,
      ref90_fonte: ext.ref90_fonte,
      imagem: ext.imagem || '',
      links_manuais: manuais,
    },
  };
}

/**
 * Quando a loja bloqueou a leitura automática do preço, o bot pede "💬 Falta só o preço!".
 * O admin responde à mensagem só com o valor (ex.: "279,90" ou "de 399 por 279,90 cupom OFF10").
 */
function parseRespostaPreco(msg, cfg) {
  const rt = msg && msg.reply_to_message;
  if (!rt) return null;
  const txtPrompt = String(rt.text || rt.caption || '');
  if (!/^\s*💬\s*Falta s[oó] o pre[cç]o/i.test(txtPrompt)) return null;

  const ents = (rt.entities || []).concat(rt.caption_entities || []);
  const urlsEnt = ents.filter((e) => e && e.type === 'text_link' && e.url).map((e) => e.url);
  const links = extrairLinksProduto(txtPrompt, urlsEnt);
  if (!links.length) return null;

  const textoResp = String(msg.text || msg.caption || '').trim();
  const ext = extrairDoTexto(textoResp);
  if (ext.preco == null) {
    const pDireto = parsePreco(textoResp.split(/\s+/)[0]);
    if (pDireto != null) ext.preco = pDireto;
  }
  if (ext.preco == null) {
    return { erro: 'Responda só com o valor atual do produto (ex.: 279,90 ou de 399,90 por 279,90 cupom CASA10).' };
  }

  // Recupera link de afiliado, link limpo e título exibidos no prompt
  const mTit = txtPrompt.match(/📦\s*(.+)/);
  const mAf = txtPrompt.match(/🔗\s*(https?:\/\/\S+)/i);
  const urlBase = links.find((u) => !ehAfiliadoCurto(u)) || links[0];
  const id = identificarLinkFlexivel(urlBase);
  if (id.erro) return { erro: id.erro };

  const titPrompt = mTit ? mTit[1].trim() : '';
  const titulo = ext.titulo
    || (!/^Produto\s+/i.test(titPrompt) && titPrompt)
    || tituloDaUrl(urlBase)
    || titPrompt
    || `Oferta ${nomeLoja(id.loja)}`;
  const autoCat = classificarCategoria([titulo, urlBase].join(' '), cfg);
  const manuais = { modo_link: true, categoria_auto: true };
  if (ext.cupom) manuais.cupom = ext.cupom;
  if (ext.preco_de) manuais.preco_de = ext.preco_de;
  const afUrl = mAf ? mAf[1].trim() : '';
  if (afUrl && ehAfiliadoCurto(afUrl)) manuais._afiliado = afUrl;
  else if (id.loja === 'outra' && temParamAfiliado(afUrl || urlBase)) manuais._afiliado = afUrl || urlBase;
  const tagUrl = id.loja === 'amazon' ? tagAmazonDaUrl(afUrl || urlBase) : '';
  if (tagUrl) manuais._tag_url = tagUrl;

  return {
    ok: true,
    oferta: {
      categoria: autoCat.categoria,
      top: false,
      url: id.url_limpa,
      url_original: urlBase,
      loja: id.loja,
      produto_id: id.produto_id,
      titulo: truncar(titulo, 180),
      preco: ext.preco,
      ref90: ext.ref90,
      ref90_fonte: ext.ref90_fonte,
      imagem: ext.imagem || '',
      links_manuais: manuais,
    },
  };
}

/* ---------- leitura HTML / JSON-LD / __NEXT_DATA__ / OpenGraph / DOM da loja ---------- */

const ENT_HTML = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  aacute: 'á', airc: 'â', acirc: 'â', atilde: 'ã', eacute: 'é', ecirc: 'ê',
  iacute: 'í', oacute: 'ó', ocirc: 'ô', otilde: 'õ', uacute: 'ú', ccedil: 'ç', Ccedil: 'Ç',
};

function decodificarHtml(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : ' ';
      }
      return ENT_HTML[e] || ENT_HTML[e.toLowerCase()] || m;
    })
    .replace(/[\u00a0\s]+/g, ' ')
    .trim();
}

function limparTituloLoja(t) {
  let s = decodificarHtml(t);
  s = s
    .replace(/\s+-\s+R\$\s*[\d.,]+.*$/i, '')
    .replace(/\s*[|\-–—]\s*(?:Amazon\.com\.br|Mercado\s*Li[vb]re(?:\s*Brasil)?|Shopee\s*Brasil|KaBuM!|Magazine\s*Luiza|Magalu|AliExpress|Casas\s*Bahia|Ponto|Fast\s*Shop).*$/i, '')
    .replace(/^Amazon\.com\.br\s*:\s*/i, '')
    .replace(/\s+na\s+Amazon\.com\.br$/i, '')
    .trim();
  if (s.length < 4 || /^\d+$/.test(s)) return '';
  if (/^(?:amazon(?:\.com\.br)?|mercado\s*li[vb]re|shopee(?:\s*brasil)?|kabum!?|magazine\s*luiza|acesso\s*negado|access\s*denied|account\s*verification|just\s*a\s*moment|robot\s*check|lista\s*de\s*produtos|recomenda[cç][oõ]es\s*de\b.*|confira\s*minha\s*lista.*|n[aã]o\s*foi\s*poss[ií]vel\s*encontrar.*)$/i.test(s)) {
    return '';
  }
  return truncar(s, 200);
}

function lerAtributoHtml(tag, padraoNomes) {
  const rx = new RegExp(`\\b(?:${padraoNomes})\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const m = tag.match(rx);
  return m ? (m[1] != null ? m[1] : m[2] || '') : '';
}

function lerMeta(html, nomes) {
  const tags = html.match(/<meta\s+[^>]{3,1200}>/gi) || [];
  for (const alvo of nomes) {
    const a = alvo.toLowerCase();
    for (const tag of tags) {
      const chave = lerAtributoHtml(tag, 'property|name|itemprop');
      if (!chave || chave.toLowerCase() !== a) continue;
      const val = lerAtributoHtml(tag, 'content');
      if (val && val.trim()) return decodificarHtml(val);
    }
  }
  return '';
}

function acharProdutosLd(nodo, lista, heranca) {
  if (!nodo || typeof nodo !== 'object') return;
  if (Array.isArray(nodo)) {
    for (const item of nodo) acharProdutosLd(item, lista, heranca);
    return;
  }
  const t = nodo['@type'];
  const tipos = Array.isArray(t) ? t : (t ? [t] : []);
  const ehProd = tipos.includes('Product');
  const ehGrupo = tipos.includes('ProductGroup');
  const baseHeranca = (ehGrupo || ehProd)
    ? { name: nodo.name || (heranca && heranca.name) || '', image: nodo.image || (heranca && heranca.image) || '' }
    : heranca;
  if (ehProd || (ehGrupo && nodo.offers)) {
    lista.push(heranca ? Object.assign({ name: heranca.name, image: heranca.image }, nodo) : nodo);
  }
  if (nodo.hasVariant) acharProdutosLd(nodo.hasVariant, lista, baseHeranca);
  if (nodo.mainEntity) acharProdutosLd(nodo.mainEntity, lista, baseHeranca);
  if (nodo['@graph']) acharProdutosLd(nodo['@graph'], lista, heranca);
  if (ehGrupo && !nodo.offers && !nodo.hasVariant && nodo.name) {
    lista.push(nodo);
  }
}

/** Converte preços vindos de JSON-LD / meta schema.org (onde ponto é sempre decimal, ex.: "199.900" → 199.9). */
function parsePrecoEstruturado(v) {
  if (typeof v === 'number') return parsePreco(v);
  if (v == null) return null;
  const s = String(v).trim();
  if (/^\d+\.\d+$/.test(s)) return parsePreco(Number(s));
  return parsePreco(s);
}

function extrairImagemLd(img) {
  if (!img) return '';
  if (typeof img === 'string') return /^https?:\/\//i.test(img) ? img : '';
  if (Array.isArray(img)) {
    for (const item of img) {
      const u = extrairImagemLd(item);
      if (u) return u;
    }
    return '';
  }
  if (typeof img === 'object') {
    const u = img.url || img.contentUrl || '';
    return /^https?:\/\//i.test(u) ? u : '';
  }
  return '';
}

function extrairOfertaLd(offers) {
  if (!offers) return { preco: null, preco_de: null };
  const lista = Array.isArray(offers) ? offers : [offers];
  let preco = null;
  let preco_de = null;
  for (const ofItem of lista) {
    if (!ofItem || typeof ofItem !== 'object') continue;
    const disponivel = !ofItem.availability || /InStock|PreOrder|LimitedAvailability|OnlineOnly/i.test(String(ofItem.availability));
    let pCand = parsePrecoEstruturado(ofItem.price != null ? ofItem.price : ofItem.lowPrice);
    let pAlto = parsePrecoEstruturado(ofItem.highPrice);
    if (!pAlto && Array.isArray(ofItem.priceSpecification)) {
      const listSpec = ofItem.priceSpecification.find((sp) => sp && /ListPrice/i.test(String(sp.priceType || '')));
      if (listSpec) pAlto = parsePrecoEstruturado(listSpec.price);
    }
    if (Array.isArray(ofItem.offers) && ofItem.offers.length) {
      const sub = extrairOfertaLd(ofItem.offers);
      if (pCand == null && sub.preco != null) pCand = sub.preco;
      if (pAlto == null && sub.preco_de != null) pAlto = sub.preco_de;
    }
    if (pCand != null && (preco == null || disponivel)) {
      preco = pCand;
      if (pAlto && pAlto > preco) preco_de = pAlto;
      if (disponivel) break;
    }
  }
  return { preco, preco_de };
}

function extrairJsonLd(html) {
  const blocos = [...html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const prods = [];
  for (const m of blocos) {
    const txt = String(m[1] || '').trim();
    if (!txt) continue;
    try { acharProdutosLd(JSON.parse(txt), prods, null); } catch (e) { /* JSON malformado: ignora */ }
  }
  if (!prods.length) return null;

  const lidos = prods.map((p) => {
    const ofRes = extrairOfertaLd(p.offers);
    return {
      titulo: limparTituloLoja(p.name || ''),
      imagem: extrairImagemLd(p.image),
      preco: ofRes.preco,
      preco_de: ofRes.preco_de,
    };
  });

  const melhor = lidos.find((x) => x.preco != null && x.titulo)
    || lidos.find((x) => x.preco != null)
    || lidos.find((x) => x.titulo)
    || lidos[0];
  const base = lidos.find((x) => x.titulo) || lidos[0];
  const baseImg = lidos.find((x) => x.imagem) || lidos[0];
  return {
    titulo: melhor.titulo || base.titulo || '',
    imagem: melhor.imagem || baseImg.imagem || '',
    preco: melhor.preco,
    preco_de: melhor.preco_de,
  };
}

/** Procura dados de produto em __NEXT_DATA__ (usado por KaBuM!, Magalu, Magazine Você…). */
function extrairNextData(html) {
  const m = html.match(/<script[^>]*id\s*=\s*["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  let raiz;
  try { raiz = JSON.parse(m[1]); } catch (e) { return null; }
  const pp = (raiz && raiz.props && raiz.props.pageProps) || {};
  const prod = pp.product || (pp.data && pp.data.product) || pp.initialProduct || null;
  if (!prod || typeof prod !== 'object') return null;

  const titulo = limparTituloLoja(prod.title || prod.name || '');
  const prObj = prod.price && typeof prod.price === 'object' ? prod.price : {};
  const preco = parsePreco(prod.priceWithDiscount || prObj.bestPrice || prObj.price || prod.discountPrice || (typeof prod.price !== 'object' ? prod.price : null));
  const pAntigo = parsePreco(prod.oldPrice || prObj.fullPrice || prObj.originalPrice || prod.listPrice);
  const preco_de = pAntigo && preco && pAntigo > preco ? pAntigo : null;
  const imgCandidata = (Array.isArray(prod.photos) && prod.photos[0])
    || (Array.isArray(prod.images) && (typeof prod.images[0] === 'string' ? prod.images[0] : prod.images[0] && prod.images[0].url))
    || prod.image || '';
  return {
    titulo,
    preco,
    preco_de,
    imagem: /^https?:\/\//i.test(String(imgCandidata || '')) ? String(imgCandidata) : '',
  };
}

/** Requisição HTTP GET para ler metadados públicos da página do produto (em testes aceita cfg.pagina_api). */
function reqPaginaProduto(url, cfg) {
  const api = cfg && cfg.pagina_api;
  return {
    url: api ? `${api}/pagina?u=${encodeURIComponent(url)}` : url,
    method: 'GET',
    headers: {
      'User-Agent': 'WhatsApp/2.24.10.74 A',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9',
    },
  };
}

/** Lê a resposta HTML da página do produto e devolve { ok, titulo, preco, preco_de, imagem, url_canonica }. */
function lerPaginaProduto(resposta, url) {
  const out = { ok: false, titulo: '', preco: null, preco_de: null, imagem: '', url_canonica: '', motivo: '' };
  if (!resposta) { out.motivo = 'sem_resposta'; return out; }

  let status = 200;
  let html = '';
  if (typeof resposta === 'string') {
    html = resposta;
  } else if (typeof resposta === 'object') {
    if (resposta.error) { out.motivo = 'erro_rede'; return out; }
    if (resposta.statusCode != null) status = Number(resposta.statusCode);
    const txt = textoRespostaHttp(resposta);
    html = txt || (resposta.body && typeof resposta.body === 'object' ? JSON.stringify(resposta.body) : '');
  }
  if (status >= 400 || !html) { out.motivo = 'http_' + status; return out; }

  // 1) JSON-LD estruturado (Product / ProductGroup)
  const ld = extrairJsonLd(html);
  if (ld) {
    if (ld.titulo) out.titulo = ld.titulo;
    if (ld.imagem) out.imagem = ld.imagem;
    if (ld.preco) out.preco = ld.preco;
    if (ld.preco_de) out.preco_de = ld.preco_de;
  }

  // 2) __NEXT_DATA__ (KaBuM!, Magalu…)
  if (!out.titulo || !out.preco || !out.imagem) {
    const nd = extrairNextData(html);
    if (nd) {
      if (!out.titulo && nd.titulo) out.titulo = nd.titulo;
      if (!out.preco && nd.preco) out.preco = nd.preco;
      if (!out.preco_de && nd.preco_de) out.preco_de = nd.preco_de;
      if (!out.imagem && nd.imagem) out.imagem = nd.imagem;
    }
  }

  // Detecta telas de bloqueio/captcha quando não havia JSON-LD nem __NEXT_DATA__
  if (!out.titulo && /(?:gz\/account-verification|validateCaptcha|Robot Check|Digite os caracteres que voc[eê] v[eê]|N[aã]o foi poss[ií]vel encontrar esta p[aá]gina|N[aã]o [eé] poss[ií]vel acessar a p[aá]gina|Attention Required! \| Cloudflare)/i.test(html.slice(0, 15000))) {
    out.motivo = 'bloqueio_loja';
    return out;
  }

  // 3) Seletores específicos da Amazon Brasil
  const ehAmazon = /amazon\.com\.br/i.test(String(url || '')) || /id="productTitle"|corePrice_feature_div/i.test(html);
  if (ehAmazon) {
    if (!out.titulo) {
      const mTit = html.match(/id\s*=\s*["'](?:productTitle|title)["'][^>]*>([\s\S]*?)<\/(?:span|h1)>/i);
      if (mTit) out.titulo = limparTituloLoja(mTit[1]);
    }
    if (!out.imagem) {
      const mHi = html.match(/"hiRes"\s*:\s*"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/)
        || html.match(/"large"\s*:\s*"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/)
        || html.match(/data-old-hires\s*=\s*["'](https:\/\/m\.media-amazon\.com\/images\/I\/[^"']+)["']/i);
      if (mHi) out.imagem = mHi[1];
    }
    if (!out.preco) {
      const mPr = html.match(/priceToPay[\s\S]{0,600}?a-offscreen[^>]*>\s*(R\$\s*[\d.]+,\d{2})/i)
        || html.match(/(?:corePriceDisplay_desktop_feature_div|corePrice_feature_div|apex_desktop)[\s\S]{0,1400}?a-offscreen[^>]*>\s*(R\$\s*[\d.]+,\d{2})/i)
        || html.match(/id\s*=\s*["'](?:priceblock_ourprice|priceblock_dealprice)["'][^>]*>\s*(R\$\s*[\d.]+,\d{2})/i);
      if (mPr) out.preco = parsePreco(mPr[1]);
    }
    if (!out.preco_de) {
      const mBasis = html.match(/basisPrice[\s\S]{0,600}?a-offscreen[^>]*>\s*(R\$\s*[\d.]+,\d{2})/i);
      const pDe = mBasis ? parsePreco(mBasis[1]) : null;
      if (pDe && out.preco && pDe > out.preco) out.preco_de = pDe;
    }
    const mAmzCan = html.match(/https:\/\/www\.amazon\.com\.br\/[^"'\s<>]*\/dp\/[A-Z0-9]{10}/i);
    if (mAmzCan) out.url_canonica = mAmzCan[0].replace(/&amp;/g, '&');
  }

  // 4) Seletores específicos do Mercado Livre (PDP e vitrine /social/ de afiliados)
  const ehML = /mercadoli(?:vre|bre)/i.test(String(url || '')) || /ui-pdp-title|poly-component__title|andes-money-amount/i.test(html);
  if (ehML) {
    if (!out.titulo) {
      const mMlTit = html.match(/class\s*=\s*["'][^"']*ui-pdp-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)
        || html.match(/class\s*=\s*["'][^"']*poly-component__title[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|h2|h3|span)>/i);
      if (mMlTit) out.titulo = limparTituloLoja(mMlTit[1]);
    }
    if (!out.preco) {
      const metaPrMl = lerMeta(html, ['price']);
      if (metaPrMl) out.preco = parsePrecoEstruturado(metaPrMl);
    }
    if (!out.preco) {
      const mAtu = html.match(/(?:ui-pdp-price__second-line|poly-price__current)[\s\S]{0,650}?andes-money-amount__fraction[^>]*>([\d.]+)<\/span>(?:[\s\S]{0,220}?andes-money-amount__cents[^>]*>(\d{2})<\/span>)?/i);
      if (mAtu) out.preco = parsePreco(mAtu[2] ? `${mAtu[1]},${mAtu[2]}` : mAtu[1]);
    }
    if (!out.preco_de) {
      const mAnt = html.match(/andes-money-amount--previous[\s\S]{0,500}?andes-money-amount__fraction[^>]*>([\d.]+)<\/span>(?:[\s\S]{0,220}?andes-money-amount__cents[^>]*>(\d{2})<\/span>)?/i)
        || html.match(/"original_price"\s*:\s*(\d+(?:\.\d+)?)/);
      if (mAnt) {
        const pDe = parsePreco(mAnt[2] ? `${mAnt[1]},${mAnt[2]}` : mAnt[1]);
        if (pDe && out.preco && pDe > out.preco) out.preco_de = pDe;
      }
    }
    const mCanon = html.match(/https:\/\/(?:www\.|produto\.)?mercadolivre\.com\.br\/[^"'\s<>]*?(?:\/p\/MLB\d+|MLB-?\d+[^"'\s<>]*)/i);
    if (mCanon) out.url_canonica = mCanon[0].replace(/&amp;/g, '&');
  }

  // 5) OpenGraph e meta tags universais
  const ogTitleBruto = lerMeta(html, ['og:title', 'twitter:title', 'title'])
    || ((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  if (!out.preco && ogTitleBruto) {
    const mOgPr = ogTitleBruto.match(/R\$\s*([\d.]+(?:,\d{1,2})?)/i);
    if (mOgPr) out.preco = parsePreco(mOgPr[1]);
  }
  if (!out.titulo && ogTitleBruto) {
    out.titulo = limparTituloLoja(ogTitleBruto);
  }
  if (!out.imagem) {
    const metaImg = lerMeta(html, ['og:image:secure_url', 'og:image', 'twitter:image']);
    if (/^https?:\/\//i.test(metaImg)) out.imagem = metaImg;
  }
  if (!out.preco) {
    const metaPr = lerMeta(html, ['product:price:amount', 'og:price:amount', 'price', 'twitter:data1']);
    if (metaPr) out.preco = parsePrecoEstruturado(metaPr);
  }
  if (!out.preco) {
    const ogDesc = lerMeta(html, ['og:description', 'description']);
    const mDescPr = ogDesc && ogDesc.match(/(?:por\s+|somente\s+|^)\s*R\$\s*([\d.]+,\d{2})/i);
    if (mDescPr) out.preco = parsePreco(mDescPr[1]);
  }

  if (!out.url_canonica) {
    const can = extrairHrefCanonica(html);
    if (/^https?:\/\//i.test(can)) out.url_canonica = can;
  }

  out.ok = !!(out.titulo || out.preco || out.imagem);
  return out;
}

/** Mensagem enxuta quando a loja bloqueou a leitura do preço num link cru: basta responder com o valor! */
function pedirPrecoRapido(entrada, cfg) {
  const o = (entrada && entrada.oferta) || {};
  const man = (o.links_manuais && typeof o.links_manuais === 'object') ? o.links_manuais : {};
  const tit = o.titulo || tituloDaUrl(o.url_original || o.url) || `Produto ${nomeLoja(o.loja)}`;
  const linkMostrar = man._afiliado || o.url_original || o.url;
  const catObj = (cfg && cfg.categorias && cfg.categorias[o.categoria]) || { emoji: '🏷️', nome: o.categoria || 'casa' };
  const linhas = [
    '💬 <b>Falta só o preço!</b>',
    `📦 ${escapeHtml(truncar(tit, 140))}`,
    `${catObj.emoji} ${escapeHtml(catObj.nome)}`,
    `🔗 ${escapeHtml(linkMostrar)}`,
  ];
  if (o.url && o.url !== linkMostrar) linhas.push(`🔎 ${escapeHtml(o.url)}`);
  linhas.push(
    '',
    'A loja bloqueou a leitura automática do valor atual.',
    '↩️ <b>Responda esta mensagem só com o preço</b> (ex.: <code>249,90</code> ou <code>de 349,90 por 249,90 cupom OFF10</code>) para gerar tudo pronto!',
  );
  return msgAdmin(entrada.chat_id, linhas.join('\n'), { parse_mode: 'HTML' });
}

/**
 * Junta os metadados lidos da página HTML do produto (gratuito, sem Keepa).
 * O que o admin digitou sempre tem prioridade; reclassifica a categoria quando descobre o título real.
 */
function juntarPagina(entrada, resposta, cfg) {
  if (!entrada || entrada.rota !== 'oferta' || !entrada.oferta) return entrada;
  if (!entrada.pagina_http) return entrada;

  const e = Object.assign({}, entrada, {
    oferta: Object.assign({}, entrada.oferta),
    avisos_card: (entrada.avisos_card || []).slice(),
  });
  delete e.pagina_http;
  const o = e.oferta;
  const man = Object.assign({}, (o.links_manuais && typeof o.links_manuais === 'object') ? o.links_manuais : {});
  o.links_manuais = man;

  const lido = lerPaginaProduto(resposta, o.url_original || o.url);
  if (lido.url_canonica) {
    const idCan = identificar(lido.url_canonica);
    const idGenerico = /^(?:ml|amz|shp|url)_[0-9a-f]{12}$/.test(o.produto_id) || !!man.curto_pendente;
    if (!idCan.erro && idGenerico && (idCan.loja === o.loja || o.loja === 'outra')) {
      o.loja = idCan.loja;
      o.produto_id = idCan.produto_id;
      o.url = idCan.url_limpa;
      if (o.loja === 'amazon' && !man._tag_url) {
        const tCan = tagAmazonDaUrl(lido.url_canonica);
        if (tCan) man._tag_url = tCan;
      }
    }
    if (!o.titulo && !lido.titulo) {
      const slugCan = tituloDaUrl(lido.url_canonica);
      if (slugCan) lido.titulo = slugCan;
    }
  }
  delete man.curto_pendente;

  if ((!o.titulo || man.titulo_slug) && lido.titulo) {
    o.titulo = lido.titulo;
    delete man.titulo_slug;
  }
  if (!o.imagem && lido.imagem) o.imagem = lido.imagem;
  if (o.preco == null && lido.preco != null) o.preco = lido.preco;
  if (man.preco_de == null && lido.preco_de != null && o.preco != null && lido.preco_de > o.preco) {
    man.preco_de = lido.preco_de;
  }

  // Reclassifica categoria agora que temos o título real da página
  if (man.categoria_auto && o.titulo) {
    const novaCat = classificarCategoria([o.titulo, o.url].join(' '), cfg);
    if (novaCat.confianca > 0) o.categoria = novaCat.categoria;
  }

  if (o.preco == null) {
    return { rota: 'responder', chamadas: [pedirPrecoRapido(e, cfg)] };
  }
  if (!o.titulo) {
    o.titulo = tituloDaUrl(o.url_original || o.url) || `Oferta ${nomeLoja(o.loja)}`;
  }
  return e;
}

module.exports = {
  ehAfiliadoCurto,
  lerParam,
  tagAmazonDaUrl,
  temParamAfiliado,
  extrairLinksProduto,
  humanizarSlug,
  tituloDaUrl,
  classificarCategoria,
  extrairDoTexto,
  parseMensagemLink,
  parseRespostaPreco,
  reqPaginaProduto,
  lerPaginaProduto,
  limparTituloLoja,
  pedirPrecoRapido,
  juntarPagina,
};
