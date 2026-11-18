'use strict';
// Extração automática e gratuita de ofertas a partir de apenas um link (ou mensagem encaminhada):
// · preserva links curtos de afiliado (mercadolivre.com/sec, s.shopee.com.br, amzn.to, divulgador.magalu…)
// · lê título, preço atual, preço antigo ("De:") e imagem via JSON-LD, __NEXT_DATA__, OpenGraph ou HTML da loja
// · reconstrói o título pelo slug da URL quando a loja bloqueia leitura da página (ex.: Mercado Livre)
// · classifica a categoria automaticamente pelas palavras do produto.
const { parsePreco, round2, formatBRL, slug, truncar, escapeHtml } = require('./util');
const { sha256Hex } = require('./sha256');
const { parseUrl, identificar, nomeLoja, urlCentralCupons, logoLoja, normalizarImagemOferta } = require('./lojas');
const { ehCurto, lerLocation, textoRespostaHttp, extrairHrefCanonica } = require('./curtos');
const { montarReqsMercado, extrairHitsRespostaMercado, casarProdutosMercado, avaliarPrecoMercado, resumirAvisoMercado } = require('./mercado');

function msgAdmin(chatId, texto, extra) {
  return {
    bot: 'admin',
    metodo: 'sendMessage',
    payload: Object.assign({ chat_id: chatId, text: texto, link_preview_options: { is_disabled: true } }, extra || {}),
    ref: null,
  };
}

const IGNORAR_HOST = /(?:^|\.)(t\.me|telegram\.me|telegram\.dog|wa\.me|whatsapp\.com|instagram\.com|facebook\.com|fb\.com|youtube\.com|youtu\.be|twitter\.com|x\.com|threads\.net|keepa\.com|buscape\.com\.br|zoom\.com\.br|google\.com|google\.com\.br|pinterest\.com|m\.media-amazon\.com|images-na\.ssl-images-amazon\.com|mlstatic\.com|susercontent\.com|shopeemobile\.com|imgur\.com|ibb\.co)$/i;

const EXT_IMAGEM = /\.(?:jpe?g|png|webp|gif|svg|avif|bmp)$/i;

const PRIORIDADE_LOJA = /(?:^|\.)(amazon\.com\.br|a\.co|amzn\.to|amzn\.com|link\.amazon|amzlinks\.in|shopee\.com\.br|s\.shopee\.com\.br|shope\.ee|shp\.ee|mercadoli(?:vre|bre)\.com(?:\.br)?|meli\.la|shein\.com|shein\.top|shein\.onelink\.me|onelink\.shein\.com|shop\.tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com|tiktok\.com|tidd\.ly|compre\.vc|magazineluiza\.com\.br|magazinevoce\.com\.br|divulgador\.magalu\.com|kabum\.com\.br|aliexpress\.com|s\.click\.aliexpress\.com|a\.aliexpress\.com|pichau\.com\.br|terabyteshop\.com\.br|drogaraia\.com\.br|drogasil\.com\.br|drogariaspacheco\.com\.br|drogariasaopaulo\.com\.br|panvel\.com|araujo\.com\.br|paguemenos\.com\.br|belezanaweb\.com\.br|epocacosmeticos\.com\.br|sephora\.com\.br|casasbahia\.com\.br|ponto\.com\.br|extra\.com\.br|fastshop\.com\.br|natura\.com\.br|boticario\.com\.br|centauro\.com\.br|netshoes\.com\.br|nike\.com\.br|adidas\.com\.br|lojasrenner\.com\.br|cea\.com\.br|riachuelo\.com\.br|dafiti\.com\.br|zattini\.com\.br|hering\.com\.br)$/i;

/** Link curto/redirecionador que já carrega o código de afiliado de quem gerou (exceto a.co, que é só compartilhamento). */
function ehAfiliadoCurto(url) {
  const u = parseUrl(url);
  if (!u) return false;
  const h = u.hostname.replace(/^www\./, '');
  if (/^(amzn\.to|s\.shopee\.com\.br|shope\.ee|shp\.ee|meli\.la|divulgador\.magalu\.com|s\.click\.aliexpress\.com|a\.aliexpress\.com|shein\.top|shein\.onelink\.me|vt\.tiktok\.com|vm\.tiktok\.com|tidd\.ly|compre\.vc)$/.test(h)) return true;
  if (/^mercadoli(vre|bre)\.com(\.br)?$/.test(h) && /^\/sec\//i.test(u.pathname)) return true;
  if (/(^|\.)tiktok\.com$/.test(h) && /^\/t\//i.test(u.pathname)) return true;
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

/** URL com parâmetros de afiliado de outras lojas (Magazine Você, Awin/KaBuM, AliExpress, Shein…). */
function temParamAfiliado(url) {
  const u = parseUrl(url);
  if (!u) return false;
  if (/magazinevoce\.com\.br|divulgador\.magalu\.com|s\.click\.aliexpress\.com|a\.aliexpress\.com/i.test(u.hostname)) return true;
  return /(?:^|[?&])(awc|aff_fcid|aff_fsk|aff_platform|aff_id|url_from|matt_tool|sk|parceiro|partner|ref_id|franq|utm_source=awin)=/i.test(u.search);
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
    if (/(^|\.)tiktok\.com$/.test(h)) {
      const ehLojaTikTok = h === 'shop.tiktok.com' || h === 'vt.tiktok.com' || h === 'vm.tiktok.com'
        || /^\/(?:t\/|view\/product\/|product\/)/i.test(u.pathname);
      if (!ehLojaTikTok) continue;
    }
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
    'formula infantil', 'nan ', 'aptamil', 'ninho fases', 'composto lacteo', 'granado bebe', 'johnsons baby',
    'brinquedo educativo', 'fisher price', 'boneca', 'hot wheels', 'lego', 'playmobil', 'massinha play',
    'infantil bebe', 'recem nascido', 'bebes', 'bebe e maternidade', 'brinquedos e jogos', 'chicco', 'buba',
    'avent', 'nuk', 'galzerano', 'burigotto', 'mattel', 'hasbro', 'nerf', 'barbie',
  ],
  perfumes: [
    'perfume', 'perfumaria', 'eau de parfum', 'eau de toilette', 'eau de cologne', 'deo parfum', 'deo colonia', 'desodorante colonia', 'colonia', 'colonia desodorante', 'agua perfumada', 'agua de colonia', 'body splash', 'body mist', 'spray corporal', 'fragrancia', 'perfumado', 'decant',
    'edp', 'edt', 'edc', 'parfum', 'toilette', 'extrait', 'extrait de parfum', 'elixir', 'pour homme', 'pour femme', 'for men', 'for women', 'kit perfume', 'cofre perfume', 'kit perfumaria',
    'perfume arabe', 'perfume de nicho', 'boticario', 'natura', 'eudora', 'phebo', 'granado', 'mahogany', 'wepink', 'in the box', 'nuancielo', 'thera', 'azza parfums', 'sacratu', 'paris elysees', 'la rive', 'jequiti', 'hinode', 'empire hinode', 'loccitane', 'l occitane', 'victorias secret', 'victoria s secret', 'sol de janeiro', 'cheirosa', 'avon far away', 'far away avon', 'pur blanca', 'avon attraction',
    'lattafa', 'asad', 'fakhar', 'yara', 'khamrah', 'floratta', 'malbec', 'egeo', 'lily', 'kaiak', 'essencial', 'zaad', 'elysee', 'ilia', 'quasar', 'uomini', 'glamour', 'portinari', 'arbo', 'accordes', 'natura humor', 'natura luna', 'natura una', 'biografia', 'kriska', 'coffee woman', 'coffee man',
    'sauvage', 'sauvage elixir', 'jadore', 'miss dior', 'fahrenheit', 'hypnotic poison', 'poison girl', 'good girl', 'bad boy', 'scandal', 'scandal pour homme', '212 vip', '212 sexy', '212 men', '212 nyc', 'ch men', 'invictus', 'one million', '1 million', 'lady million', 'olympea', 'pure xs', 'black xs', 'phantom', 'fame',
    'club de nuit', 'armaf', 'afnan', '9pm', 'sabah al ward', 'royal amber', 'durrat al aroos', 'attar al wesal',
    'rasasi', 'hawas', 'rabanne', 'paco rabanne', 'carolina herrera', '212 heroes', 'dior', 'chanel', 'bleu de chanel', 'coco mademoiselle', 'coco noir', 'chance chanel',
    'allure homme', 'versace', 'eros', 'eros flame', 'dylan blue', 'bright crystal', 'crystal noir', 'jean paul gaultier', 'le male', 'ultramale', 'le beau', 'la belle', 'azzaro', 'azzaro wanted', 'the most wanted',
    'armani', 'acqua di gio', 'stronger with you', 'armani code', 'lancome', 'la vie est belle', 'idole', 'my way', 'la nuit tresor', 'tresor', 'ysl', 'ysl libre', 'myslf', 'black opium', 'mon paris',
    'calvin klein', 'ck one', 'ck be', 'ck in2u', 'eternity', 'euphoria', 'hugo boss', 'boss bottled', 'ralph lauren', 'polo red', 'polo black', 'polo green', 'polo sport', 'polo ultra',
    'bvlgari', 'bulgari', 'issey miyake', 'l eau d issey', 'kenzo', 'tommy hilfiger', 'antonio banderas', 'blue seduction', 'the icon', 'ferrari black', 'scuderia ferrari', 'joop', 'animale', 'silver scent', 'jacques bogart', 'nautica voyage',
    'gucci', 'burberry', 'valentino', 'born in roma', 'givenchy', 'mugler', 'thierry mugler', 'narciso rodriguez', 'hermes', 'terre d hermes', 'lacoste blanc', 'lacoste essential', 'lacoste red', 'eau de lacoste', 'l 12 12', 'diesel', 'only the brave', 'moschino', 'toy boy', 'salvatore ferragamo',
    'cacharel', 'amor amor', 'anais anais', 'nina ricci', 'davidoff', 'cool water', 'guerlain', 'mon guerlain', 'shalimar', 'lalique', 'encre noire', 'viktor rolf', 'flowerbomb', 'spicebomb', 'jo malone', 'britney spears', 'fantasy britney', 'midnight fantasy', 'elizabeth arden', 'green tea', '5th avenue', 'clinique happy', 'jimmy choo', 'marc jacobs', 'daisy marc jacobs', 'yves saint laurent', 'bade al oud', 'qaed al fursan', 'eclaire', 'nebras', 'mayar', 'teriaq', 'angels share', 'kilian', 'maison margiela', 'replica margiela',
    'montblanc', 'montblanc explorer', 'legend montblanc', 'starwalker', 'prada', 'prada paradoxe', 'luna rossa', 'dolce gabbana', 'light blue', 'the one',
    'polo blue', 'l interdit', 'chloe', 'la nuit de l homme', 'gentleman givenchy',
    'al wataniah', 'al haramain', 'amber oud', 'detour noir', 'maison alhambra', 'orientica', 'bharara', 'french avenue', 'liquid brun',
    'paris corner', 'zimaya', 'swiss arabian', 'shaghaf', 'turathi', 'untold', 'kismet', 'jean lowe',
    'parfums de marly', 'layton', 'delina', 'althair', 'herod', 'pegasus', 'creed', 'aventus', 'nishane', 'hacivat', 'ani',
    'xerjoff', 'naxos', 'erba pura', 'mancera', 'cedrat boise', 'red tobacco', 'montale', 'arabians tonka', 'initio', 'side effect', 'oud for greatness',
    'amouage', 'tom ford', 'oud wood', 'tobacco vanille', 'ombre leather', 'baccarat rouge', 'kurkdjian', 'le labo', 'santal 33', 'byredo', 'acqua di parma',
    'roja', 'diptyque',
  ],
  saude: [
    'vitamina', 'vitaminas', 'multivitaminico', 'polivitaminico', 'omega 3', 'creatina', 'creapure', 'whey', 'whey protein', 'pre treino',
    'glutamina', 'bcaa', 'hipercalorico', 'barra de proteina', 'pasta de amendoim', 'growth', 'max titanium', 'dux', 'integralmedica',
    'soldiers', 'vitafor', 'essential nutrition', 'colageno', 'verisol', 'melatonina', 'magnesio', 'coenzima q10', 'probiotico', 'eletrolitos',
    'suplemento', 'suplementos', 'termometro', 'oximetro', 'medidor de pressao', 'aparelho de pressao', 'omron', 'g tech', 'inalador', 'nebulizador',
    'irrigador oral', 'waterpik', 'escova eletrica', 'oral b', 'colgate', 'sensodyne', 'listerine', 'enxaguante bucal', 'fio dental',
    'creme dental', 'pasta de dente', 'curativo', 'soro fisiologico', 'colirio', 'antialergico', 'antigripal', 'analgesico', 'meia de compressao',
    'farmacia', 'drogaria', 'saude e bem estar', 'saude e higiene', 'suplementos alimentares',
  ],
  beleza: [
    'hidratante', 'serum', 'serum vitamina c', 'vitamina c facial', 'acido hialuronico', 'acido glicolico', 'acido salicilico', 'niacinamida', 'retinol',
    'protetor solar', 'fps 30', 'fps 50', 'fps 60', 'fps 70', 'skincare', 'agua micelar', 'cleansing oil', 'sabonete facial', 'gel de limpeza',
    'creme facial', 'creme corporal', 'oleo corporal', 'desodorante', 'antitranspirante',
    'shampoo', 'condicionador', 'mascara capilar', 'oleo capilar', 'leave in', 'cronograma capilar', 'minoxidil',
    'secador de cabelo', 'chapinha', 'prancha alisadora', 'escova secadora', 'escova rotativa', 'modelador de cachos', 'babyliss',
    'maquiagem', 'base liquida', 'batom', 'gloss', 'lip oil', 'rimel', 'mascara de cilios', 'delineador', 'corretivo', 'po compacto',
    'paleta de sombras', 'blush', 'esmalte', 'depilador', 'aparador de pelos', 'barbeador', 'oneblade',
    'avon', 'quem disse berenice', 'boca rosa', 'bruna tavares', 'nativa spa', 'wella', 'kerastase', 'truss', 'loreal', 'elseve',
    'principia', 'cerave', 'la roche', 'vichy', 'neutrogena', 'isdin', 'bioderma', 'creamy', 'sallve', 'oceane',
    'absorvente', 'sabonete liquido', 'dove', 'nivea', 'rexona', 'gillette', 'needs', 'episol', 'actine', 'avene', 'cetaphil', 'eucerin', 'bepantol', 'cicaplast',
    'cuidados pessoais', 'beleza e cuidado pessoal',
  ],
  moda: [
    'vestido', 'blusa', 'cropped', 'bodysuit', 'body feminino', 'camiseta', 'camisa', 'polo', 'regata',
    'jaqueta', 'jaqueta puffer', 'corta vento', 'casaco', 'blazer', 'cardigan', 'moletom', 'hoodie', 'sueter',
    'calca', 'calca jeans', 'calca cargo', 'wide leg', 'pantacourt', 'legging', 'shorts', 'bermuda',
    'conjunto feminino', 'conjunto casual', 'conjunto academia', 'conjunto fitness', 'saia', 'jardineira', 'macacao',
    'tenis', 'sneaker', 'sapatenis', 'chuteira', 'calcado', 'tenis feminino', 'tenis masculino', 'tenis infantil', 'tenis corrida', 'sapato', 'bota', 'coturno',
    'air jordan', 'jordan', 'air force', 'air max', 'dunk', 'ultraboost', 'superstar', 'stan smith', 'gazelle', 'samba', 'chuck taylor', 'old skool', 'slip on',
    'sandalia', 'rasteirinha', 'salto', 'mule', 'mocassim', 'chinelo', 'papete', 'sapatilha',
    'bolsa', 'mochila', 'pochete', 'carteira', 'cinto', 'oculos de sol', 'bone', 'chapeu', 'relogio pulso',
    'pijama', 'lingerie', 'sutia', 'calcinha', 'cueca', 'meia', 'meias', 'biquini', 'maio', 'saida de praia',
    'moda feminina', 'moda masculina', 'moda casual', 'moda fitness', 'oversized', 'streetwear', 'alfaiataria',
    'shein', 'renner', 'riachuelo', 'dafiti', 'zattini', 'netshoes', 'centauro', 'hering', 'nike', 'adidas', 'puma', 'vans', 'converse', 'new balance', 'olympikus', 'mizuno', 'asics', 'fila', 'all star', 'skechers', 'under armour', 'reebok', 'diadora', 'umbro', 'penalty', 'topper', 'oakley', 'timberland', 'osklen', 'crocs', 'havaianas', 'melissa', 'vizzano', 'moleca', 'beira rio', 'dakota', 'via marte', 'schutz', 'arezzo', 'santa lolla', 'democrata', 'ferracini', 'pegada', 'west coast', 'reserva', 'lacoste', 'levis', 'colcci', 'moda', 'roupas', 'calcados',
  ],
  tech: [
    'fone', 'bluetooth', 'tws', 'headset', 'airpods', 'buds', 'headphone', 'caixa de som', 'jbl', 'echo dot',
    'echo pop', 'echo show', 'alexa', 'fire tv', 'kindle', 'roku', 'chromecast', 'mi box', 'smartwatch',
    'smartband', 'galaxy watch', 'apple watch', 'amazfit', 'garmin', 'celular', 'smartphone', 'iphone',
    'galaxy s', 'galaxy a', 'galaxy m', 'redmi', 'poco ', 'xiaomi', 'motorola', 'moto g', 'edge ', 'realme',
    'notebook', 'macbook', 'laptop', 'ultrabook', 'tablet', 'ipad', 'monitor', 'ultrawide', 'gamer', 'placa de video',
    'rtx', 'gtx', 'geforce', 'radeon', 'rx 6600', 'rx 7600', 'rx 7700', 'rx 7800', 'rtx 4060', 'rtx 4070',
    'rtx 5060', 'rtx 5070', 'processador', 'ryzen', 'intel core', 'core i5', 'core i7', 'placa mae', 'am4', 'am5',
    'ddr4', 'ddr5', 'matx', 'm atx', 'mid tower', 'mini tower', 'full modular', '80 plus', 'cybenetics', 'pcie',
    'memoria ram', 'ssd', 'nvme', 'hd externo', 'pendrive', 'cartao micro sd', 'teclado', 'teclado mecanico',
    'teclado sem fio', 'mouse', 'mouse sem fio', 'mouse gamer', 'mousepad', 'webcam', 'microfone', 'ring light',
    'playstation', 'ps5', 'ps 5', 'ps5 pro', 'ps5 slim', 'ps4', 'dualshock', 'dualsense', 'xbox', 'xbox series', 'series x',
    'series s', 'game pass', 'gta 6', 'gta vi', 'grand theft auto', 'rockstar', 'midia fisica', 'jogo ps5', 'jogo xbox',
    'nintendo switch', 'switch 2', 'controle sem fio', 'joystick', 'gamepad', 'console', 'steam deck', 'rog ally',
    'pedal', 'pedais', 'volante', 'simulador', 'racing', 'cockpit', 'cambio gamer', 'thrustmaster', 'fanatec', 'moza',
    'logitech', 'g pro', 'g29', 'g920', 'g923', 'razer', 'hyperx', 'corsair', 'redragon', 'steelseries', 'elgato',
    'asus', 'acer', 'lenovo', 'dell', 'alienware', 'msi', 'gigabyte', 'asrock', 'galax', 'kingston', 'crucial',
    'sandisk', 'seagate', 'xpg', 'lexar', 'mancer', 'pichau', 'terabyte', 'kabum', 'attack shark', 'superframe',
    'montech', 'deepcool', 'cooler master', 'tp link', 'intelbras', 'anker', 'baseus', 'ugreen', 'usbc', 'usb c',
    'hdmi', 'displayport', 'magsafe', 'powerbank', 'carregador turbo', 'carregador sem fio', 'power bank',
    'carregador portatil', 'cabo usb', 'hub usb', 'roteador', 'mesh', 'repetidor wifi', 'smart tv', 'qled', 'oled',
    'soundbar', 'drone', 'dji', 'gopro', 'insta360', 'projetor', 'tv box', 'gabinete', 'water cooler', 'watercooler',
    'cooler', 'ventoinha', 'fonte atx', 'cadeira gamer', 'mesa gamer', 'headset gamer', 'perifericos', 'hardware',
    'camera de seguranca', 'camera wifi', 'impressora', 'multifuncional', 'nobreak', 'filtro de linha', 'iclamper',
    'games e consoles', 'acessorios de jogos', 'pc gaming', 'computadores e informatica', 'celulares e comunicacao',
    'eletronicos', 'informatica',
  ],
  casa: [
    'air fryer', 'airfryer', 'fritadeira', 'panela', 'jogo de panelas', 'frigideira', 'pipoqueira', 'chaleira',
    'liquidificador', 'batedeira', 'mixer', 'processador de alimentos', 'mini processador', 'sanduicheira', 'grill', 'torradeira',
    'cafeteira', 'nespresso', 'dolce gusto', 'tres coracoes', 'microondas', 'micro ondas', 'forno eletrico',
    'fogao', 'cooktop', 'coifa', 'geladeira', 'refrigerador', 'freezer', 'frigobar', 'adega', 'cervejeira',
    'lava loucas', 'lavadora', 'maquina de lavar', 'lava e seca', 'tanquinho', 'secadora', 'centrifuga',
    'aspirador', 'robo aspirador', 'vaporetto', 'lavadora de alta pressao', 'wap ', 'mop', 'vassoura', 'varal',
    'ventilador', 'ar condicionado', 'climatizador', 'umidificador', 'desumidificador', 'purificador de agua',
    'ferro de passar', 'passadeira a vapor', 'colchao', 'travesseiro', 'jogo de cama', 'lencol',
    'edredom', 'cobertor', 'toalha de banho', 'cortina', 'tapete', 'sofa', 'poltrona', 'cadeira de escritorio',
    'jogo de mesa', 'mesa de jantar', 'mesa posta', 'mesa de centro', 'mesa escrivaninha', 'armario', 'guarda roupa', 'prateleira', 'organizador', 'pote hermetico', 'garrafa termica',
    'copo termico', 'stanley', 'talheres', 'faqueiro', 'aparelho de jantar', 'lampada', 'fita led', 'fechadura digital',
    'furadeira', 'parafusadeira', 'jogo de ferramentas', 'chave de fenda', 'lava roupas', 'sabao', 'amaciante',
    'omo ', 'downy', 'ariel', 'detergente', 'desinfetante', 'papel higienico', 'racao', 'pet shop', 'tapete higienico', 'areia para gato',
    'eletroportateis', 'eletrodomesticos', 'cozinha', 'casa e construcao', 'cama mesa e banho', 'ferramentas',
    'supermercado', 'mondial', 'arno', 'oster', 'philco', 'britania', 'electrolux', 'brastemp', 'consul', 'midea',
    'tramontina', 'bosch', 'makita', 'dewalt',
  ],
};

const CATEGORIA_PADRAO_LOJA = {
  kabum: 'tech',
  terabyte: 'tech',
  pichau: 'tech',
  drogaraia: 'saude',
  drogasil: 'saude',
  pacheco: 'saude',
  panvel: 'saude',
  araujo: 'saude',
  paguemenos: 'saude',
  belezanaweb: 'beleza',
  epocacosmeticos: 'beleza',
  boticario: 'perfumes',
  natura: 'beleza',
  sephora: 'beleza',
  shein: 'moda',
  centauro: 'moda',
  netshoes: 'moda',
  nike: 'moda',
  adidas: 'moda',
  renner: 'moda',
  cea: 'moda',
  riachuelo: 'moda',
  dafiti: 'moda',
  zattini: 'moda',
  hering: 'moda',
};

function normalizarBusca(s) {
  return ' ' + String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim() + ' ';
}

const GRUPOS_SINONIMOS = [
  ['ps5', 'playstation 5'],
  ['gta 6', 'gta vi', 'grand theft auto 6', 'grand theft auto vi'],
  ['xbox series', 'series x', 'series s'],
  ['switch 2', 'nintendo switch 2'],
  ['air fryer', 'airfryer', 'fritadeira eletrica'],
  ['robo aspirador', 'aspirador robo'],
  ['asad', 'lattafa asad'],
  ['fakhar', 'fakhar black'],
  ['khamrah', 'lattafa khamrah'],
  ['cdni', 'club de nuit'],
  ['br540', 'baccarat rouge'],
  ['creme dental', 'pasta de dente'],
];

/** Verifica se todos os tokens (ou sinônimos equivalentes) de `termo` ocorrem em `textoAlvo`. */
function bateTermoInteligente(textoAlvo, termo) {
  const normAlvo = normalizarBusca(textoAlvo);
  const normTermo = normalizarBusca(termo).trim();
  if (!normTermo || normAlvo.trim().length < 2) return false;
  if (normAlvo.includes(' ' + normTermo + ' ')) return true;
  for (const grp of GRUPOS_SINONIMOS) {
    if (grp.some((g) => normTermo === g || normTermo.includes(g))) {
      if (grp.some((g) => normAlvo.includes(' ' + g + ' '))) return true;
    }
  }
  const tokens = normTermo.split(' ').filter((w) => w.length >= 2 || /^\d$/.test(w));
  if (!tokens.length) return false;
  return tokens.every((w) => normAlvo.includes(' ' + w + ' ') || (w.length >= 4 && normAlvo.includes(' ' + w)));
}

function pontuarTextoCat(norm, lista, pesoFrase, pesoPalavra) {
  if (!norm || norm.trim().length < 2) return 0;
  let nota = 0;
  for (const kw of lista) {
    const k = kw.trim();
    if (!k) continue;
    if (k.includes(' ')) {
      if (norm.includes(' ' + k + ' ') || norm.includes(' ' + k)) nota += pesoFrase;
    } else if (norm.includes(' ' + k + ' ') || norm.includes(' ' + k + 's ')) {
      nota += pesoPalavra;
    }
  }
  return nota;
}

/** Escolhe a melhor categoria do produto dando peso maior ao título e peso complementar a breadcrumb/URL. */
function classificarCategoria(textoPrincipal, cfg, textoContexto) {
  const disponiveis = Object.keys((cfg && cfg.categorias) || PALAVRAS_CAT).filter((c) => c !== 'top');
  const padrao = (cfg && cfg.auto && cfg.auto.categoria_padrao && disponiveis.includes(cfg.auto.categoria_padrao))
    ? cfg.auto.categoria_padrao
    : (disponiveis.includes('casa') ? 'casa' : disponiveis[0] || 'casa');
  const normPrinc = normalizarBusca(textoPrincipal);
  const normCtx = normalizarBusca(textoContexto);
  if (normPrinc.trim().length < 2 && normCtx.trim().length < 2) return { categoria: padrao, confianca: 0 };

  let melhor = padrao;
  let maiorNota = 0;
  for (const cat of disponiveis) {
    const lista = PALAVRAS_CAT[cat] || [];
    let nota = pontuarTextoCat(normPrinc, lista, 4, 3) + pontuarTextoCat(normCtx, lista, 2, 1);
    const extras = (cfg && cfg.shopee && cfg.shopee.buscas && cfg.shopee.buscas[cat]) || [];
    for (const kw of extras) {
      const k = normalizarBusca(kw).trim();
      if (!k) continue;
      if (normPrinc.includes(' ' + k)) nota += 3;
      else if (normCtx.includes(' ' + k)) nota += 2;
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

function htmlParaTexto(s) {
  return decodificarHtml(
    String(s || '')
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/R\$\s*([\d.]+)\s+(\d{2})\b/g, 'R$ $1,$2')
    .replace(/\s+/g, ' ')
    .trim();
}

function extrairParcelamentoTexto(texto, precoFinal) {
  const s = String(texto || '');
  const mVal = s.match(/\b(\d{1,2})\s*x\s*(?:de\s*)?R\$\s*([\d.]+,\d{2})\s*sem\s*juros\b/i);
  if (mVal) return `Em até ${mVal[1]}x de R$ ${mVal[2]} sem juros`;
  const mSem = s.match(/\b(\d{1,2})\s*x\s*sem\s*juros\b/i);
  if (mSem) {
    const n = Number(mSem[1]);
    if (n >= 2 && precoFinal > 0) return `Em até ${n}x de ${formatBRL(round2(precoFinal / n))} sem juros`;
    return `Em até ${mSem[1]}x sem juros`;
  }
  const mCom = s.match(/\b(?:em\s+at[ée]\s+)?(\d{1,2})\s*x\s*(?:de\s*)?R\$\s*([\d.]+,\d{2})(?:\s*(?:com\s+juros|\(\s*total\s*R\$\s*[\d.]+,\d{2}\s*\)))?/i);
  if (mCom && (/\b(?:com\s+juros|total\s+R\$)/i.test(mCom[0]) || /\bparcelado\b/i.test(s))) {
    const n = Number(mCom[1]);
    if (n >= 2) return `Em até ${n}x de R$ ${mCom[2]}`;
  }
  return '';
}

function detectarResgatePrevioCupom(texto, cupom) {
  if (/^FULL\d{4}$/i.test(String(cupom || '').trim())) return true;
  return /\b(?:funcionando\s+(?:p\/|para|pra)\s+quem\s+resgatou|quem\s+(?:j[aá]\s+)?(?:resgatou|salvou|pegou|ativou)|resgatado\s+(?:ontem|no\s+dia\s+anterior|antes|previamente)|salvo\s+(?:ontem|antes|na\s+conta)|s[oó]\s+(?:p\/|para|pra)\s+quem\s+resgatou|resgate\s+antecipado|resgatou\s+ontem|ativou\s+antes)\b/i.test(String(texto || ''));
}

/** Extrai preço, preço antigo ("De:"), cupom, parcelamento sem juros, imagem e título de um texto livre / compartilhado. */
function extrairDoTexto(texto) {
  const bruto = String(texto || '').trim();
  const out = {
    titulo: null, preco: null, preco_de: null, preco_sem_cupom: null, ref90: null, ref90_fonte: '',
    cupom: '', cupom_auto: '', cupom_pct: null, cupom_valor: null, parcelamento: '', pix: false, imagem: '', top: false,
    exige_resgate_previo: false,
  };
  if (!bruto) return out;
  if (/\b(?:no\s+pix|via\s+pix|[àa]\s+vista\s+no\s+pix|desconto\s+no\s+pix|\d+%\s*(?:off\s+)?no\s+pix)\b/i.test(bruto)) {
    out.pix = true;
  }

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
  out.exige_resgate_previo = detectarResgatePrevioCupom(bruto, out.cupom);

  // Desconto explícito de cupom em % ou R$: "cupom CODIGO 15%", "cupom -50", "-15% no cupom"
  const mCupPct = bruto.match(/\bcupom(?:\s+[A-Z0-9_-]{2,25})?\s*[:=-]?\s*-?\s*(\d{1,2})\s*%/i)
    || bruto.match(/-?\s*(\d{1,2})\s*%\s*(?:off\s+)?no\s+cupom\b/i);
  if (mCupPct) {
    const pct = Number(mCupPct[1]);
    if (pct >= 1 && pct <= 90) out.cupom_pct = pct;
  }
  const mCupVal = bruto.match(/\bcupom(?:\s+[A-Z0-9_-]{2,25})?\s+(?:-?\s*R\$\s*|-)(\d{1,4}(?:[.,]\d{1,2})?)\b/i)
    || bruto.match(/-?\s*R\$\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:off\s+)?no\s+cupom\b/i);
  if (mCupVal && !out.cupom_pct) {
    const val = parsePreco(mCupVal[1]);
    if (val && val > 0) out.cupom_valor = val;
  }

  const semUrls = bruto.replace(/https?:\/\/[^\s<>"']+/gi, ' ');
  const mDeIso = semUrls.match(/(?:^|\s)de\s*[:=]?\s*[~*_]*(?:R\$\s*)?(\d{1,5}(?:[.,]\d{1,2})?)\b/i);
  const mAnuncio = semUrls.match(/(?:^|\s)(?:an[uú]ncio|sem[_ ]?cupom)\s*[:=]?\s*[~*_]*(?:R\$\s*)?(\d{1,5}(?:[.,]\d{1,2})?)\b/i);
  const mComCupFica = semUrls.match(/(?:^|\s)(?:R\$\s*)?(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:com|no|\+)?\s*cupom\b[\s\S]{0,40}?\b(?:fica|por|sai(?:\s+a)?)\s*[:=]?\s*(?:R\$\s*)?(\d{1,5}(?:[.,]\d{1,2})?)\b/i);
  if (mAnuncio) {
    const pAn = parsePreco(mAnuncio[1]);
    if (pAn) out.preco_sem_cupom = pAn;
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
  } else if (mComCupFica) {
    const pSemC = parsePreco(mComCupFica[1]);
    const pFin = parsePreco(mComCupFica[2]);
    if (pFin && pSemC && pSemC > pFin) {
      out.preco_sem_cupom = out.preco_sem_cupom || pSemC;
      out.preco_de = pSemC;
      out.preco = pFin;
    } else if (pFin) {
      out.preco = pFin;
    }
  }

  // Remove parcelas ("10x de R$ 29,90"), valores secundários antes/depois ("economia de R$ 50", "R$ 30 OFF", "R$ 15 de cashback") e preço unitário ("R$ 0,99 a tira", "R$ 4,97/un")
  const semRuido = bruto
    .replace(/\b\d{1,2}\s*x\s*(?:de\s*)?R\$\s*[\d.]+(?:,\d{1,2})?/gi, ' ')
    .replace(/\b(?:economia|desconto|off|frete|cupom|cupon|cashback|vale[- ]?compras?|parcelas?)\s*(?:de|:)?\s*R\$\s*[\d.]+(?:,\d{1,2})?/gi, ' ')
    .replace(/\bcupom(?:\s+[A-Z0-9_-]{2,25})?\s+(?:-?\s*R\$\s*|-)[\d.,]+/gi, ' ')
    .replace(/R\$\s*[\d.]+(?:,\d{1,2})?\s*(?:de\s+(?:desconto|economia|cashback|frete|cupom|off|vale)|off\b)/gi, ' ')
    .replace(/(?:\bsai(?:\s+a)?\s+)?R\$\s*[\d.]+(?:,\d{1,2})?\s*(?:\/\s*(?:un(?:id)?|kg|g|l|ml|m|tira|caps|comp|lata|garrafa|pacote|rolo|folha|dose)\b|(?:cada|por\s+(?:unidade|unid|tira|lata|garrafa|item|pe[cç]a)|a\s+(?:tira|unidade|lata|pe[cç]a))\b)/gi, ' ');

  if (out.preco == null) {
    // Exige R$, palavra explícita "preço/valor/fica", ou centavos (,dd) para nunca confundir "por 12 meses" com R$ 12
    const mComRS = semRuido.match(/(?:^|\s)(?:pre[cç]o|por|valor|apenas|somente|sai a|hoje|fica)\s*[:=]?\s*[*_]*R\$\s*([\d.]+(?:,\d{1,2})?)\b/i);
    const mExplicito = !mComRS && semRuido.match(/(?:^|\s)(?:pre[cç]o|valor|fica)\s*[:=]?\s*([\d.]+(?:,\d{1,2})?)\b/i);
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

  // Preço solto ao lado do link: "https://mercadolivre.com/sec/xxx 299,90" ou "por 143" ou "400 cupom MELI15 15%"
  if (out.preco == null) {
    const mPorBare = semUrls.match(/(?:^|\s)(?:por|fica)\s*[:=]?\s*(\d{2,5})(?!(?:\s*(?:x|meses|dias|anos|parcelas|vezes|gb|tb|ml|mg|w|l|v|kg|g)\b))(?:\s|$)/i);
    const mAnteCupom = !mPorBare && semUrls.match(/(?:^|\s)(\d{2,5}(?:[.,]\d{1,2})?)\s+(?:cupom|cupon|c[oó]digo)\b/i);
    const mSolto = !mPorBare && !mAnteCupom && semUrls.match(/(?:^|\s)(\d{1,4},\d{2})(?:\s|$)/);
    const cand = mPorBare || mAnteCupom || mSolto;
    if (cand) out.preco = parsePreco(cand[1]);
  }

  if (out.preco != null && out.preco_de == null && mDeIso) {
    const pDeIso = parsePreco(mDeIso[1]);
    if (pDeIso && pDeIso > out.preco) out.preco_de = pDeIso;
  }

  // Se o admin informou preço base + cupom com % ou R$ ("400 cupom MELI15 15%"), calcula quanto fica!
  if (out.preco != null && out.preco_sem_cupom == null && !mComCupFica && (out.cupom_pct || out.cupom_valor)) {
    const base = out.preco;
    const calculado = out.cupom_pct
      ? round2(base * (1 - out.cupom_pct / 100))
      : round2(base - out.cupom_valor);
    if (calculado > 0 && calculado < base) {
      out.preco_sem_cupom = base;
      if (out.preco_de == null) out.preco_de = base;
      out.preco = calculado;
    }
  }
  if (out.preco_sem_cupom && out.preco && out.preco_sem_cupom > out.preco && !out.preco_de) {
    out.preco_de = out.preco_sem_cupom;
  }
  if (!out.cupom && (out.cupom_pct || out.cupom_valor)) {
    out.cupom_auto = out.cupom_pct ? `${out.cupom_pct}% OFF no anúncio` : `${formatBRL(out.cupom_valor)} OFF no anúncio`;
  }
  out.parcelamento = extrairParcelamentoTexto(semUrls, out.preco);

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
    if (/^(?:pre[cç]o|por|valor|fica|de|an[uú]ncio|sem_cupom|ref90|min90|menor90|cupom|cupon|c[oó]digo|img|imagem|foto|tg|wac|wag|x)\s*[:=]?\s+\S/i.test(l)) continue;
    if (/^(?:💰|💸|🕒|✅|🎟️|👉|🔗|⚡\s*\*?ALERTA)/u.test(l)) continue;
    if (/^(?:de\s*:?\s*)?[~*_]*(?:R\$\s*)?\d[\d.,]*(?:\s*(?:por|→|->)\s*[~*_]*(?:R\$\s*)?\d[\d.,]*)?(?:\s+(?:cupom|cupon|c[oó]digo|no\s+pix|[àa]\s+vista|em\s+\d+x|fica|an[uú]ncio)\b.*|\s*)?$/i.test(l)) continue;
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
  if (/^(shein\.top|shein\.onelink\.me|onelink\.shein\.com)$/.test(h)) {
    return { loja: 'shein', produto_id: 'shn_' + hash, url_limpa: url, curto_pendente: true };
  }
  if (/^(vt\.tiktok\.com|vm\.tiktok\.com)$/.test(h) || (/(^|\.)tiktok\.com$/.test(h) && /^\/t\//i.test(u.pathname))) {
    return { loja: 'tiktok', produto_id: 'tk_' + hash, url_limpa: url, curto_pendente: true };
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
  const catsDisp = Object.keys((cfg && cfg.categorias) || {}).filter((c) => c !== 'top');
  const apelidosCat = {
    game: 'tech', games: 'tech', gamer: 'tech', ps5: 'tech', xbox: 'tech', gta: 'tech', gta6: 'tech',
    hardware: 'tech', pc: 'tech', informatica: 'tech',
    moda: 'moda', roupa: 'moda', roupas: 'moda', tenis: 'moda', calcado: 'moda', calcados: 'moda', vestuario: 'moda', look: 'moda', looks: 'moda',
    perfume: 'perfumes', perfumes: 'perfumes', perfumaria: 'perfumes', fragrancia: 'perfumes', arabe: 'perfumes', nicho: 'perfumes',
    saude: 'saude', farmacia: 'saude', drogaria: 'saude', suplemento: 'saude', suplementos: 'saude', creatina: 'saude', whey: 'saude',
    beleza: 'beleza', cosmeticos: 'beleza', skincare: 'beleza', maquiagem: 'beleza',
    eletro: 'casa', cozinha: 'casa', familia: 'bebe', fralda: 'bebe', fraldas: 'bebe', infantil: 'bebe',
  };
  const acharCat = (tok) => {
    const s = slug(tok);
    const alias = apelidosCat[s];
    if (alias && catsDisp.includes(alias)) return alias;
    if ((alias === 'perfumes' || alias === 'saude' || alias === 'moda') && catsDisp.includes('beleza')) return 'beleza';
    return catsDisp.find((c) => c === s) || (s.length >= 3 ? catsDisp.find((c) => c.startsWith(s)) : null);
  };
  if (/^\/(link|auto|oferta)\b/i.test(primeira)) {
    for (const tok of primeira.split(/\s+/).slice(1)) {
      if (/^https?:\/\//i.test(tok)) continue;
      if (slug(tok) === 'top') { flagTop = true; continue; }
      const achou = acharCat(tok);
      if (achou && !catExplicita) catExplicita = achou;
    }
  } else {
    const antesLink = primeira.split(/https?:\/\//i)[0].trim().split(/\s+/).filter(Boolean);
    if (antesLink.length >= 1 && antesLink.length <= 2 && /https?:\/\//i.test(primeira)) {
      const todasValidas = antesLink.every((tok) => slug(tok) === 'top' || !!acharCat(tok));
      if (todasValidas) {
        for (const tok of antesLink) {
          if (slug(tok) === 'top') flagTop = true;
          else if (!catExplicita) catExplicita = acharCat(tok);
        }
      }
    }
  }

  const urlEncontrada = links[0];
  const hopCurto = meta && meta.resp_curto ? lerLocation(meta.resp_curto) : '';
  const id = identificarLinkFlexivel(urlEncontrada, hopCurto);
  if (id.erro) return { erro: id.erro };

  const ext = extrairDoTexto(textoBruto);

  // Se o passo "Abrir link curto" já devolveu HTML (ex.: mercadolivre.com/sec sem 302), aproveita os metadados!
  let catLojaPre = '';
  const htmlCurto = meta && meta.resp_curto ? textoRespostaHttp(meta.resp_curto) : '';
  if (htmlCurto && htmlCurto.includes('<')) {
    const pre = lerPaginaProduto(meta.resp_curto, hopCurto || urlEncontrada);
    if (!ext.titulo && pre.titulo) ext.titulo = pre.titulo;
    if (ext.preco == null && pre.preco != null) ext.preco = pre.preco;
    if (ext.preco_de == null && pre.preco_de != null) ext.preco_de = pre.preco_de;
    if (!ext.imagem && pre.imagem) ext.imagem = pre.imagem;
    if (!ext.cupom && pre.cupom) ext.cupom = pre.cupom;
    if (!ext.cupom_auto && pre.cupom_auto) ext.cupom_auto = pre.cupom_auto;
    if (!ext.parcelamento && pre.parcelamento) ext.parcelamento = pre.parcelamento;
    if (pre.categoria_loja) catLojaPre = pre.categoria_loja;
  }

  const urlAlvo = hopCurto && !id.curto_pendente ? hopCurto : (hopCurto || urlEncontrada);
  const tituloSlug = !ext.titulo ? tituloDaUrl(urlEncontrada) || tituloDaUrl(urlAlvo) : '';
  const tituloInicial = ext.titulo || tituloSlug || null;

  let catFinal = catExplicita;
  if (!catFinal) {
    const autoCat = classificarCategoria(tituloInicial || textoBruto, cfg, [catLojaPre, urlEncontrada].join(' '));
    catFinal = autoCat.confianca > 0 ? autoCat.categoria : (CATEGORIA_PADRAO_LOJA[id.loja] || autoCat.categoria);
  }

  const manuais = { modo_link: true, categoria_auto: !catExplicita };
  if (ext.cupom) manuais.cupom = ext.cupom;
  if (ext.cupom_auto && !ext.cupom) manuais.cupom_auto = ext.cupom_auto;
  if (ext.cupom_pct) manuais.cupom_pct = ext.cupom_pct;
  if (ext.cupom_valor) manuais.cupom_valor = ext.cupom_valor;
  if (ext.parcelamento) manuais.parcelamento = ext.parcelamento;
  if (ext.pix) manuais.pix = true;
  if (ext.exige_resgate_previo) manuais.exige_resgate_previo = true;
  if (ext.preco_de) manuais.preco_de = ext.preco_de;
  if (ext.preco_sem_cupom) manuais.preco_sem_cupom = ext.preco_sem_cupom;
  else if (ext.preco_de && (ext.cupom_pct || ext.cupom_valor)) manuais.preco_sem_cupom = ext.preco_de;
  if (!ext.titulo && tituloSlug) manuais.titulo_slug = true;
  if (id.curto_pendente) manuais.curto_pendente = true;

  // Preserva afiliado: link curto original (mercadolivre.com/sec, s.shopee.com.br, amzn.to…), hop afiliado (bit.ly → amzn.to), tag da URL Amazon, ou afiliado de outra loja.
  const curtoOrig = (meta && meta.curto && ehAfiliadoCurto(meta.curto) ? meta.curto : '')
    || (ehAfiliadoCurto(urlEncontrada) ? urlEncontrada : '')
    || (hopCurto && ehAfiliadoCurto(hopCurto) ? urlEncontrada : '');
  if (curtoOrig) manuais._afiliado = curtoOrig;
  else if (id.loja === 'outra' && temParamAfiliado(urlEncontrada)) manuais._afiliado = urlEncontrada;

  const uOrig = parseUrl(urlAlvo) || parseUrl(urlEncontrada);
  if (id.loja === 'terabyte' && uOrig) {
    const pTrb = lerParam(uOrig.search, 'p');
    if (pTrb && pTrb !== '236394') manuais._parceiro_terabyte = pTrb;
  }
  if (id.loja === 'natura' && uOrig) {
    const pNat = lerParam(uOrig.search, 'consultoria');
    if (pNat) manuais._consultoria_natura = pNat;
  }

  const tagUrl = id.loja === 'amazon' ? tagAmazonDaUrl(urlEncontrada) : '';
  if (tagUrl) manuais._tag_url = tagUrl;

  return {
    ok: true,
    oferta: {
      categoria: catFinal,
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
  const autoCat = classificarCategoria(titulo, cfg, urlBase);
  const catRes = autoCat.confianca > 0 ? autoCat.categoria : (CATEGORIA_PADRAO_LOJA[id.loja] || autoCat.categoria);
  const manuais = { modo_link: true, categoria_auto: true };
  if (ext.cupom) manuais.cupom = ext.cupom;
  if (ext.cupom_auto && !ext.cupom) manuais.cupom_auto = ext.cupom_auto;
  if (ext.parcelamento) manuais.parcelamento = ext.parcelamento;
  if (ext.pix) manuais.pix = true;
  if (ext.exige_resgate_previo) manuais.exige_resgate_previo = true;
  if (ext.preco_de) manuais.preco_de = ext.preco_de;
  if (ext.preco_sem_cupom) manuais.preco_sem_cupom = ext.preco_sem_cupom;
  else if (ext.preco_de && (ext.cupom_pct || ext.cupom_valor)) manuais.preco_sem_cupom = ext.preco_de;
  const afUrl = mAf ? mAf[1].trim() : '';
  if (afUrl && ehAfiliadoCurto(afUrl)) manuais._afiliado = afUrl;
  else if (id.loja === 'outra' && temParamAfiliado(afUrl || urlBase)) manuais._afiliado = afUrl || urlBase;
  const tagUrl = id.loja === 'amazon' ? tagAmazonDaUrl(afUrl || urlBase) : '';
  if (tagUrl) manuais._tag_url = tagUrl;

  return {
    ok: true,
    oferta: {
      categoria: catRes,
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
  circledr: '®', reg: '®', trade: '™', ordm: 'º', ordf: 'ª',
  agrave: 'à', Agrave: 'À', aacute: 'á', airc: 'â', acirc: 'â', atilde: 'ã', Atilde: 'Ã',
  eacute: 'é', Eacute: 'É', ecirc: 'ê', iacute: 'í', Iacute: 'Í',
  oacute: 'ó', Oacute: 'Ó', ocirc: 'ô', otilde: 'õ', Otilde: 'Õ',
  uacute: 'ú', Uacute: 'Ú', ccedil: 'ç', Ccedil: 'Ç',
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
    .replace(/\s*[|\-–—:]\s*(?:Amazon\.com\.br|Mercado\s*Li[vb]re(?:\s*Brasil)?|Shopee\s*Brasil|KaBuM!?|Terabyte(?:Shop)?|Pichau|Magazine\s*Luiza|Magalu|AliExpress|Casas\s*Bahia|Ponto|Fast\s*Shop|Droga\s*Raia|Drogasil|Drogarias?\s*Pacheco|Drogaria\s*S[aã]o\s*Paulo|Panvel|Drogaria\s*Araujo|Pague\s*Menos|Beleza\s*na\s*Web|[ÉE]poca\s*Cosm[eé]ticos|O?\s*Botic[aá]rio|Natura|Sephora|Shein|TikTok\s*Shop).*$/i, '')
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
  const migalhas = [];
  const lerBreadcrumb = (nodo) => {
    if (!nodo || typeof nodo !== 'object') return;
    if (Array.isArray(nodo)) { nodo.forEach(lerBreadcrumb); return; }
    const t = nodo['@type'];
    const tipos = Array.isArray(t) ? t : (t ? [t] : []);
    if (tipos.includes('BreadcrumbList') && Array.isArray(nodo.itemListElement)) {
      for (const el of nodo.itemListElement) {
        const nome = (el && (el.name || (el.item && el.item.name))) || '';
        if (nome) migalhas.push(String(nome));
      }
    }
    if (nodo['@graph']) lerBreadcrumb(nodo['@graph']);
  };
  for (const m of blocos) {
    const txt = String(m[1] || '').trim();
    if (!txt) continue;
    try {
      const parsed = JSON.parse(txt);
      acharProdutosLd(parsed, prods, null);
      lerBreadcrumb(parsed);
    } catch (e) { /* JSON malformado: ignora */ }
  }
  const catBc = migalhas.length ? decodificarHtml(migalhas.join(' ')) : '';
  if (!prods.length) return catBc ? { titulo: '', imagem: '', preco: null, preco_de: null, categoria_loja: catBc } : null;

  const lidos = prods.map((p) => {
    const ofRes = extrairOfertaLd(p.offers);
    const catProd = typeof p.category === 'string' ? p.category : (p.category && p.category.name) || '';
    return {
      titulo: limparTituloLoja(p.name || ''),
      imagem: extrairImagemLd(p.image),
      preco: ofRes.preco,
      preco_de: ofRes.preco_de,
      categoria_loja: decodificarHtml([catBc, catProd].filter(Boolean).join(' ')),
    };
  });

  const melhor = lidos.find((x) => x.preco != null && x.titulo)
    || lidos.find((x) => x.preco != null)
    || lidos.find((x) => x.titulo)
    || lidos[0];
  const base = lidos.find((x) => x.titulo) || lidos[0];
  const baseImg = lidos.find((x) => x.imagem) || lidos[0];
  const baseCat = lidos.find((x) => x.categoria_loja) || lidos[0];
  return {
    titulo: melhor.titulo || base.titulo || '',
    imagem: melhor.imagem || baseImg.imagem || '',
    preco: melhor.preco,
    preco_de: melhor.preco_de,
    categoria_loja: melhor.categoria_loja || baseCat.categoria_loja || catBc,
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
  const out = {
    ok: false, titulo: '', preco: null, preco_de: null, preco_parcelado: null, parcelas_qtd: null,
    imagem: '', url_canonica: '', cupom: '', cupom_auto: '', cupom_pct: null, cupom_valor: null,
    cupom_prime: false, exige_resgate_pagina: false, parcelamento: '', pix: false, categoria_loja: '', motivo: '',
  };
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

  // 1) JSON-LD estruturado (Product / ProductGroup / BreadcrumbList)
  const ld = extrairJsonLd(html);
  if (ld) {
    if (ld.titulo) out.titulo = ld.titulo;
    if (ld.imagem) out.imagem = ld.imagem;
    if (ld.preco) out.preco = ld.preco;
    if (ld.preco_de) out.preco_de = ld.preco_de;
    if (ld.categoria_loja) out.categoria_loja = ld.categoria_loja;
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
    if (!out.imagem || /_BO30,255,255,255|_SR1910,1000|\/images\/G\//i.test(out.imagem)) {
      const mHi = html.match(/"hiRes"\s*:\s*"(https?:\/\/[^"]+\/images\/I\/[^"]+)"/)
        || html.match(/"large"\s*:\s*"(https?:\/\/[^"]+\/images\/I\/[^"]+)"/)
        || html.match(/data-old-hires\s*=\s*["'](https?:\/\/[^"']+\/images\/I\/[^"']+)["']/i)
        || html.match(/data-a-dynamic-image\s*=\s*["']\{(?:&quot;|")(https?:\/\/[^&"]+\/images\/I\/[^&"]+)(?:&quot;|")/i)
        || html.match(/id\s*=\s*["']landingImage["'][^>]*src\s*=\s*["'](https?:\/\/[^"']+\/images\/I\/[^"']+)["']/i)
        || html.match(/src\s*=\s*["'](https?:\/\/[^"']+\/images\/I\/[^"']+)["'][^>]*id\s*=\s*["']landingImage["']/i);
      if (mHi) out.imagem = mHi[1];
    }
    // apex-pricetopay-value / priceToPay traz o valor real à vista (Pix) mesmo quando JSON-LD retorna o valor parcelado
    const mApex = html.match(/apex-pricetopay-value[\s\S]{0,450}?a-offscreen[^>]*>\s*(R\$\s*[\d.]+,\d{2})/i)
      || html.match(/priceToPay[\s\S]{0,600}?a-offscreen[^>]*>\s*(R\$\s*[\d.]+,\d{2})/i)
      || (!out.preco && (html.match(/(?:corePriceDisplay_desktop_feature_div|corePrice_feature_div|apex_desktop)[\s\S]{0,1400}?a-offscreen[^>]*>\s*(R\$\s*[\d.]+,\d{2})/i)
        || html.match(/id\s*=\s*["'](?:priceblock_ourprice|priceblock_dealprice)["'][^>]*>\s*(R\$\s*[\d.]+,\d{2})/i)));
    if (mApex) {
      const pApex = parsePreco(mApex[1]);
      if (pApex && pApex > 0) out.preco = pApex;
    }
    if (!out.preco_de) {
      const mBasis = html.match(/basisPrice[\s\S]{0,600}?a-offscreen[^>]*>\s*(R\$\s*[\d.]+,\d{2})/i);
      const pDe = mBasis ? parsePreco(mBasis[1]) : null;
      if (pDe && out.preco && pDe > out.preco) out.preco_de = pDe;
    }
    if (!out.categoria_loja) {
      const mBcAmz = html.match(/id\s*=\s*["']wayfinding-breadcrumbs_feature_div["'][\s\S]{0,4000}?<\/div>/i);
      if (mBcAmz) out.categoria_loja = decodificarHtml(mBcAmz[0]);
    }
    // PIX e parcelamento sem juros na Amazon
    const txtAmzHead = htmlParaTexto(html.slice(0, 420000));
    if (/(?:\d{1,2}%\s*off\s*[àa]\s*vista|no\s+Pix\s+e\s+NuPay|[àa]\s+vista\s+no\s+Pix)/i.test(txtAmzHead)) {
      out.pix = true;
    }
    const mParcAmz = txtAmzHead.match(/\b(\d{1,2})\s*x\s+(?:de\s+)?R\$\s*([\d.]+,\d{2})\s+sem\s+juros\b/i);
    if (mParcAmz) {
      out.parcelas_qtd = Number(mParcAmz[1]);
      out.parcelamento = `Em até ${mParcAmz[1]}x de R$ ${mParcAmz[2]} sem juros`;
    } else {
      const mParcSemAmz = txtAmzHead.match(/\b(?:em\s+at[ée]\s+)?(\d{1,2})\s*x\s+sem\s+juros\b/i);
      if (mParcSemAmz && Number(mParcSemAmz[1]) >= 2) {
        out.parcelas_qtd = Number(mParcSemAmz[1]);
        out.parcelamento = out.preco > 0
          ? `Em até ${out.parcelas_qtd}x de ${formatBRL(round2(out.preco / out.parcelas_qtd))} sem juros`
          : `Em até ${out.parcelas_qtd}x sem juros`;
      }
    }
    const mTotParc = txtAmzHead.match(/total\s+parcelado\s*(?:de\s*)?R\$\s*([\d.]+,\d{2})/i);
    const pParcAmz = mTotParc ? parsePreco(mTotParc[1]) : (mParcAmz ? round2(Number(mParcAmz[1]) * parsePreco(mParcAmz[2])) : null);
    if (pParcAmz && out.preco && pParcAmz > out.preco + 0.5) {
      out.preco_parcelado = pParcAmz;
      if (!out.preco_de) out.preco_de = pParcAmz;
    }
    if (!out.parcelamento) {
      const mParcPago = txtAmzHead.match(/\b(?:em\s+at[ée]\s+)?(\d{1,2})\s*x\s+(?:de\s+)?R\$\s*([\d.]+,\d{2})(?=\s*(?:\(|total\s+parcelado|no\s+cart))/i);
      if (mParcPago && Number(mParcPago[1]) >= 2) {
        out.parcelas_qtd = Number(mParcPago[1]);
        out.parcelamento = `Em até ${mParcPago[1]}x de R$ ${mParcPago[2]}`;
        const totCalc = round2(out.parcelas_qtd * parsePreco(mParcPago[2]));
        if (!out.preco_parcelado && out.preco && totCalc > out.preco + 0.5) out.preco_parcelado = totCalc;
      }
    }

    // Varredura multi-bloco de cupons Amazon: pula armadilhas de "primeira compra" (100OFF) e prioriza o maior válido (ex.: 300TAO Prime)
    const blocosIndiv = [...html.matchAll(/<label[^>]*id\s*=\s*["']greenBadge[^"']*["'][^>]*>(?:(?!<label)[\s\S]){0,650}/gi)].map((m) => m[0]);
    const blocosCont = [...html.matchAll(/(?:id|class)\s*=\s*["'][^"']*(?:couponsInBuybox_feature_div|promoPriceBlockMessage_feature_div|vpcButton|couponBadge|newCouponBadge|reinvent_price_desktop_newAccordionRow)[^"']*["'][\s\S]{0,2200}/gi)].map((m) => m[0]);
    const candidatosCup = blocosIndiv.length ? blocosIndiv : blocosCont;
    let melhorCup = null;
    for (const rawBlk of candidatosCup) {
      const blk = decodificarHtml(rawBlk);
      if (/primeira\s+compra|1[ªa]\s+compra|novo(?:s)?\s+cliente(?:s)?|exclusivo\s+no\s+app\s+para\s+primeira|cart[aã]o\s+amazon/i.test(blk)) continue;
      let cod = '';
      const mCod = rawBlk.match(/promoMessageCXCW[^>]*>[\s\S]{0,160}?:\s*([A-Z0-9]{4,20})\b/)
        || rawBlk.match(/(?:c[oó]digo(?:\s+promocional)?\s*:?\s+|Salve\s+o\s+cupom[^<]{0,100}<\/label>[\s\S]{0,220}?:\s*)([A-Z0-9]{4,20})\b/i);
      if (mCod && !FALSO_CUPOM.test(mCod[1]) && !/^(?:salve|resgate|aplicar|cupom|prime|exclusivo)$/i.test(mCod[1]) && (/[0-9]/.test(mCod[1]) || mCod[1].length >= 5)) {
        cod = mCod[1].toUpperCase();
      }
      let pct = null;
      const mPct = blk.match(/(?:salve|marque|aplique|aplicar)\s+o\s+cupom(?:\s+de)?\s*(\d{1,2})\s*%|(?:cupom(?:\s+de)?|economize(?:\s+mais)?)\s*(\d{1,2})\s*%/i);
      if (mPct) {
        const p = Number(mPct[1] || mPct[2]);
        if (p >= 1 && p <= 90) pct = p;
      }
      let val = null;
      const mVal = !pct && blk.match(/(?:salve|marque|aplique|aplicar)\s+o\s+cupom(?:\s+de)?\s*R\$\s*([\d.]+(?:,\d{2})?)|(?:cupom(?:\s+de)?|economize(?:\s+mais)?)\s*R\$\s*([\d.]+(?:,\d{2})?)/i);
      if (mVal) {
        const v = parsePreco(mVal[1] || mVal[2]);
        if (v && v > 0) val = v;
      }
      if (!cod && !pct && !val) continue;
      const score = pct ? round2((out.preco || 100) * pct / 100) : (val || (cod ? 1 : 0));
      if (!melhorCup || score > melhorCup.score) {
        melhorCup = {
          score,
          cod,
          pct,
          val,
          prime: /Exclusivo\s+Prime/i.test(blk),
          resgate: /Salve\s+o\s+cupom|Resgatar|Marque\s+o\s+cupom|Ative\s+o\s+cupom/i.test(blk),
        };
      }
    }
    if (melhorCup) {
      if (melhorCup.cod) out.cupom = melhorCup.cod;
      if (melhorCup.pct) out.cupom_pct = melhorCup.pct;
      if (melhorCup.val) out.cupom_valor = melhorCup.val;
      out.cupom_prime = melhorCup.prime;
      out.exige_resgate_pagina = melhorCup.resgate;
      if (!out.cupom && (out.cupom_pct || out.cupom_valor)) {
        out.cupom_auto = out.cupom_pct ? `${out.cupom_pct}% OFF no anúncio` : `${formatBRL(out.cupom_valor)} OFF no anúncio`;
      }
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
    if (!out.imagem) {
      const mMlImg = html.match(/"pictures"\s*:\s*\[\s*\{\s*"url"\s*:\s*"(https:\/\/[^"]+mlstatic\.com[^"]+)"/)
        || html.match(/ui-pdp-gallery__figure__image[^>]*(?:data-zoom|src)\s*=\s*["'](https:\/\/[^"']+mlstatic\.com[^"']+)["']/i);
      if (mMlImg) out.imagem = mMlImg[1];
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
    if (!out.categoria_loja) {
      const mBcMl = html.match(/class\s*=\s*["'][^"']*andes-breadcrumb[^"']*["'][\s\S]{0,3000}?<\/(?:nav|ol|ul)>/i);
      if (mBcMl) out.categoria_loja = decodificarHtml(mBcMl[0]);
    }
    if (!out.parcelamento) {
      const txtMlDom = htmlParaTexto(html.slice(0, 420000));
      const mInstJson = html.match(/"installments"\s*:\s*\{[^}]{0,300}?"text"\s*:\s*"(\d{1,2}x)[^"]*"[^}]{0,220}?"no_interest"\s*:\s*true[\s\S]{0,260}?"value"\s*:\s*(\d+(?:\.\d+)?)/i);
      const mInstQty = !mInstJson && html.match(/"installments"\s*:\s*\{[^}]{0,260}?"quantity"\s*:\s*(\d{1,2})[^}]{0,260}?"amount"\s*:\s*(\d+(?:\.\d+)?)[^}]{0,260}?"rate"\s*:\s*(\d+(?:\.\d+)?)/i);
      if (mInstJson) {
        out.parcelas_qtd = Number(mInstJson[1].replace(/\D/g, ''));
        out.parcelamento = `Em até ${mInstJson[1]} de ${formatBRL(Number(mInstJson[2]))} sem juros`;
      } else if (mInstQty && Number(mInstQty[1]) >= 2 && Number(mInstQty[2]) > 0) {
        const q = Number(mInstQty[1]);
        const a = Number(mInstQty[2]);
        const rate = Number(mInstQty[3]);
        out.parcelas_qtd = q;
        out.parcelamento = `Em até ${q}x de ${formatBRL(a)}${rate === 0 ? ' sem juros' : ''}`;
        const tot = round2(q * a);
        if (out.preco && tot > out.preco + 0.5) out.preco_parcelado = tot;
      } else {
        const mInstDom = txtMlDom.match(/\b(\d{1,2})\s*x\s+(?:de\s+)?R\$\s*([\d.]+,\d{2})\s+sem\s+juros\b/i)
          || txtMlDom.match(/\bem\s+(?:at[ée]\s+)?(\d{1,2})\s*x\s+(?:de\s+)?R\$\s*([\d.]+,\d{2})\b/i);
        if (mInstDom && Number(mInstDom[1]) >= 2) {
          out.parcelas_qtd = Number(mInstDom[1]);
          const semJ = /sem\s+juros/i.test(mInstDom[0]);
          out.parcelamento = `Em até ${mInstDom[1]}x de R$ ${mInstDom[2]}${semJ ? ' sem juros' : ''}`;
          const totDom = round2(out.parcelas_qtd * parsePreco(mInstDom[2]));
          if (!semJ && out.preco && totDom > out.preco + 0.5) out.preco_parcelado = totDom;
        } else {
          const mInstSem = txtMlDom.match(/\b(\d{1,2})\s*x\s+sem\s+juros\b/i);
          if (mInstSem && Number(mInstSem[1]) >= 2) {
            out.parcelas_qtd = Number(mInstSem[1]);
            out.parcelamento = out.preco > 0
              ? `Em até ${out.parcelas_qtd}x de ${formatBRL(round2(out.preco / out.parcelas_qtd))} sem juros`
              : `Em até ${out.parcelas_qtd}x sem juros`;
          }
        }
      }
    }
    if (!out.cupom && !out.cupom_auto) {
      const blocoPill = (html.match(/class\s*=\s*["'][^"']*(?:ui-pdp-promotions-pill-label|ui-vpp-coupon|andes-badge)[^"']*["'][\s\S]{0,800}/i) || [''])[0];
      const textoMl = decodificarHtml(blocoPill ? (blocoPill + ' ' + html.slice(0, 60000)) : html);
      const mCupMl = textoMl.match(/(?:"coupon"\s*:\s*"|aplicar|ativar|marque|ganhe|cupom(?:\s+de)?)\s*(?:cupom(?:\s+de)?\s*)?(R\$\s*[\d.]+(?:,\d{2})?|\d{1,2}%)\s*(?:OFF|de desconto)\b/i);
      if (mCupMl) {
        if (mCupMl[1].includes('%')) out.cupom_pct = Number(mCupMl[1].replace(/\D/g, ''));
        else out.cupom_valor = parsePreco(mCupMl[1]);
        out.cupom_auto = `${mCupMl[1].trim()} OFF no anúncio`;
      }
    }
    const mCanon = html.match(/https:\/\/(?:www\.|produto\.)?mercadolivre\.com\.br\/[^"'\s<>]*?(?:\/p\/MLB\d+|MLB-?\d+[^"'\s<>]*)/i);
    if (mCanon) out.url_canonica = mCanon[0].replace(/&amp;/g, '&');
  }

  // Fallback universal de parcelamento sem juros e preço no PIX
  const txtHeadHtml = htmlParaTexto(html.slice(0, 320000));
  if (!out.parcelamento) {
    const mParc = txtHeadHtml.match(/\b(\d{1,2})\s*x\s+(?:de\s+)?R\$\s*([\d.]+,\d{2})\s+sem\s+juros\b/i);
    if (mParc) {
      out.parcelamento = `Em até ${mParc[1]}x de R$ ${mParc[2]} sem juros`;
    } else {
      const mParcSem = txtHeadHtml.match(/\bem\s+at[ée]\s+(\d{1,2})\s*x\s+sem\s+juros\b/i);
      if (mParcSem && Number(mParcSem[1]) >= 2) {
        const n = Number(mParcSem[1]);
        out.parcelamento = out.preco > 0
          ? `Em até ${n}x de ${formatBRL(round2(out.preco / n))} sem juros`
          : `Em até ${n}x sem juros`;
      }
    }
  }
  if (!out.pix && /(?:[àa]\s+vista\s+no\s+pix|pre[cç]o\s+no\s+pix|desconto\s+no\s+pix|\d{1,2}%\s*(?:off\s+)?no\s+pix)/i.test(txtHeadHtml)) {
    out.pix = true;
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
    if (/^(?:https?:)?\/\//i.test(metaImg)) out.imagem = metaImg;
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

  if (out.imagem) {
    out.imagem = normalizarImagemOferta(out.imagem);
    if (ehAmazon && /\/images\/G\//i.test(out.imagem)) out.imagem = '';
  }
  out.ok = !!(out.titulo || out.preco || out.imagem);
  return out;
}

function recalcularParcelamentoComCupom(lido, man, pct, val) {
  const parcBase = (lido && lido.parcelamento) || man.parcelamento || '';
  const mP = String(parcBase).match(/\b(\d{1,2})x(?:\s+de\s+R\$\s*([\d.]+,\d{2}))?(.*)$/i);
  if (!mP) return;
  const qtd = Number(mP[1]);
  const vParc = mP[2] ? parsePreco(mP[2]) : null;
  if (!(qtd >= 2)) return;
  const sufixoSemJuros = /sem\s+juros/i.test(parcBase) ? ' sem juros' : '';
  const baseTotal = (lido && lido.preco_parcelado > 0)
    ? lido.preco_parcelado
    : (vParc > 0 ? round2(qtd * vParc) : ((lido && lido.preco > 0) ? lido.preco : 0));
  if (!(baseTotal > 0)) return;
  const novoTotal = pct ? round2(baseTotal * (1 - pct / 100)) : (val ? round2(baseTotal - val) : baseTotal);
  if (!(novoTotal > 0 && novoTotal < baseTotal)) return;
  man.preco_parcelado = novoTotal;
  man.parcelamento = `Em até ${qtd}x de ${formatBRL(round2(novoTotal / qtd))}${sufixoSemJuros}`;
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
    const idGenerico = /^(?:ml|amz|shp|shn|tk|kbm|trb|pch|dra|drs|dpa|pnv|arj|pgm|bnw|epc|bot|nat|sep|url)_[0-9a-f]{12}$/.test(o.produto_id) || !!man.curto_pendente;
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
  if (lido.imagem && (!o.imagem || /promobit\.com\.br|wsrv\.nl|telesco\.pe|telegram\.org|t\.me/i.test(o.imagem))) o.imagem = lido.imagem;
  const precoVeioDaPagina = o.preco == null && lido.preco != null;
  if (precoVeioDaPagina) o.preco = lido.preco;
  if (man.preco_de == null && lido.preco_de != null && o.preco != null && lido.preco_de > o.preco) {
    man.preco_de = lido.preco_de;
  }
  if (!man.cupom && lido.cupom) man.cupom = lido.cupom;
  if (!man.cupom && !man.cupom_auto && lido.cupom_auto) man.cupom_auto = lido.cupom_auto;
  if (!man.parcelamento && lido.parcelamento) man.parcelamento = lido.parcelamento;
  if (!man.preco_parcelado && lido.preco_parcelado) man.preco_parcelado = lido.preco_parcelado;
  if (lido.cupom_prime) man.cupom_prime = true;
  if (lido.exige_resgate_pagina) man.exige_resgate_pagina = true;
  if (lido.pix && !man.pix) man.pix = true;

  if (precoVeioDaPagina && (man.cupom_pct || lido.cupom_pct || man.cupom_valor || lido.cupom_valor)) {
    const pct = man.cupom_pct || lido.cupom_pct;
    const val = man.cupom_valor || lido.cupom_valor;
    const novoPreco = pct ? round2(lido.preco * (1 - pct / 100)) : round2(lido.preco - val);
    if (novoPreco > 0 && novoPreco < lido.preco) {
      man.preco_sem_cupom = lido.preco;
      if (!man.preco_de) man.preco_de = (lido.preco_de && lido.preco_de > lido.preco) ? lido.preco_de : lido.preco;
      o.preco = novoPreco;
      recalcularParcelamentoComCupom(lido, man, pct, val);
    }
  } else if (!precoVeioDaPagina && o.preco != null && (man.cupom || man.cupom_auto) && lido.preco != null && lido.preco > o.preco) {
    // Admin informou o preço final com cupom (<link> 143,90 cupom FULL1811): preserva o valor do anúncio e o "De:"
    if (!man.preco_sem_cupom) man.preco_sem_cupom = lido.preco;
    if (!man.preco_de) man.preco_de = (lido.preco_de && lido.preco_de > lido.preco) ? lido.preco_de : lido.preco;
    const pctAd = man.cupom_pct || lido.cupom_pct;
    const valAd = man.cupom_valor || lido.cupom_valor || round2(lido.preco - o.preco);
    recalcularParcelamentoComCupom(lido, man, pctAd, pctAd ? null : valAd);
  }

  // Reclassifica categoria agora que temos o título real e a trilha/departamento da loja
  if (man.categoria_auto && (o.titulo || lido.categoria_loja)) {
    const novaCat = classificarCategoria(o.titulo || '', cfg, [lido.categoria_loja || '', o.url].join(' '));
    if (novaCat.confianca > 0) o.categoria = novaCat.categoria;
    else if (CATEGORIA_PADRAO_LOJA[o.loja]) o.categoria = CATEGORIA_PADRAO_LOJA[o.loja];
  }

  if (o.preco == null) {
    return { rota: 'responder', chamadas: [pedirPrecoRapido(e, cfg)] };
  }
  if (!o.titulo) {
    o.titulo = tituloDaUrl(o.url_original || o.url) || `Oferta ${nomeLoja(o.loja)}`;
  }
  return e;
}

function prepararMercadoOferta(entrada, cfg) {
  if (!entrada || entrada.rota !== 'oferta' || !entrada.oferta) return entrada;
  const o = entrada.oferta;
  const man = (o.links_manuais && typeof o.links_manuais === 'object') ? o.links_manuais : {};
  if (man.eh_cupom_loja || !(Number(o.preco) > 0) || !o.titulo) return entrada;
  const reqs = montarReqsMercado([{ idx: 0, titulo: o.titulo, loja: o.loja, preco: o.preco, eh_cupom_loja: false }], cfg);
  if (!reqs.length) return entrada;
  return Object.assign({}, entrada, { reqs_mercado: reqs });
}

function juntarMercadoOferta(entrada, resps, cfg) {
  if (!entrada || entrada.rota !== 'oferta' || !entrada.oferta) return entrada;
  if (!entrada.reqs_mercado) return entrada;
  const e = Object.assign({}, entrada, {
    oferta: Object.assign({}, entrada.oferta),
    avisos_card: (entrada.avisos_card || []).slice(),
  });
  const reqs = e.reqs_mercado;
  delete e.reqs_mercado;
  if (!Array.isArray(resps) || !resps.length) return e;
  const hits = [];
  reqs.forEach((req, k) => {
    if (resps[k]) hits.push(...extrairHitsRespostaMercado(req.fonte, resps[k]));
  });
  const casados = casarProdutosMercado(e.oferta, hits);
  const av = avaliarPrecoMercado(e.oferta, casados, { modo_radar: false });
  const man = Object.assign({}, (e.oferta.links_manuais && typeof e.oferta.links_manuais === 'object') ? e.oferta.links_manuais : {});
  if (!av.aprovar) {
    e.reprovado_mercado = true;
  } else if (av.concorrente || av.mediana) {
    const ref = av.concorrente || { preco: av.mediana, loja_nome: 'mercado' };
    man.ref_mercado = ref.preco;
    man.ref_mercado_loja = ref.loja_nome;
    if (man.preco_de && av.preco_de_ajustado !== undefined && man.preco_de > ref.preco * 1.25) {
      if (av.preco_de_ajustado) man.preco_de = av.preco_de_ajustado;
      else delete man.preco_de;
    }
    if (!e.oferta.imagem && av.imagem_mercado) e.oferta.imagem = av.imagem_mercado;
  }
  const msgM = resumirAvisoMercado(av);
  if (msgM && !e.avisos_card.includes(msgM)) e.avisos_card.push(msgM);
  e.oferta.links_manuais = man;
  return e;
}

/**
 * Verifica se a página atual do produto indica esgotamento ou forte subida de preço (>= 28%).
 * Respostas bloqueadas (403/429/5xx) ou páginas de captcha são ignoradas para evitar falsos encerramentos.
 */
function avaliarExpiracaoPagina(oferta, respHttp) {
  if (!oferta || !respHttp || typeof respHttp !== 'object') return { expirada: false };
  if (respHttp.error) return { expirada: false };
  const status = respHttp.statusCode != null ? Number(respHttp.statusCode) : 200;
  if (status === 404 || status === 410) return { expirada: true, motivo: 'página removida' };
  if (status >= 400) return { expirada: false };

  const html = textoRespostaHttp(respHttp);
  if (!html || html.length < 400) return { expirada: false };
  if (/(?:validateCaptcha|Robot Check|gz\/account-verification|Attention Required! \| Cloudflare|Digite os caracteres que voc[eê] v[eê])/i.test(html.slice(0, 15000))) {
    return { expirada: false };
  }

  // JSON-LD exclusivamente OutOfStock / SoldOut / Discontinued
  const availMatches = [...html.matchAll(/"availability"\s*:\s*"([^"]+)"/gi)].map((m) => m[1]);
  if (availMatches.length > 0 && availMatches.every((a) => /OutOfStock|SoldOut|Discontinued/i.test(a))) {
    return { expirada: true, motivo: 'esgotado' };
  }

  // Sinais textuais explícitos de indisponibilidade sem botão de compra ativo
  const semBotaoCompra = !/(?:adicionar\s+ao\s+carrinho|comprar\s+agora|buy-now-button|add-to-cart-button)/i.test(html);
  if (semBotaoCompra && /(?:Este produto n[aã]o est[aá] dispon[ií]vel|Produto indispon[ií]vel|Produto esgotado|An[uú]ncio pausado|Publica[cç][aã]o pausada|Ops!\s*Produto esgotado|Indispon[ií]vel no momento)/i.test(html.slice(0, 80000))) {
    return { expirada: true, motivo: 'esgotado' };
  }

  const lido = lerPaginaProduto(respHttp, oferta.url);
  if (lido.ok && lido.preco != null && lido.preco > 0) {
    let man = {};
    try {
      man = typeof oferta.links_manuais === 'string' ? (JSON.parse(oferta.links_manuais) || {}) : (oferta.links_manuais || {});
    } catch (e) { man = {}; }
    // Ofertas com cupom têm base no preço do anúncio sem cupom, para não encerrar se o cupom continua válido.
    const baseRef = Math.max(Number(oferta.preco) || 0, Number(man.preco_sem_cupom) || 0);
    if (baseRef > 0 && lido.preco >= baseRef * 1.28) {
      return { expirada: true, motivo: `preço subiu para ${formatBRL(lido.preco)}`, novo_preco: lido.preco };
    }
  }
  return { expirada: false };
}

function lerManuaisExtrator(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw) || {}; } catch (e) { return {}; }
}

function cupomRowExtrator(r, man) {
  const m = man || lerManuaisExtrator(r && r.links_manuais);
  return String((r && (r.cupom || r.cupom_auto)) || m.cupom || m.cupom_auto || '').toUpperCase().trim();
}

/**
 * Regra anti-repetição 24h (e 72h no radar):
 * - Nunca repete o mesmo produto nas últimas 24h com mesmo preço (ou mais caro) e sem cupom novo.
 * - Libera e marca `eh_atualizacao: true` SOMENTE se já foi publicado (`aprovada`/`publicando`)
 *   E houve queda real de preço (>= R$ 1,00 e >= 5%) OU entrou cupom novo sem subir o preço.
 */
function avaliarRepeticao24h(cand, ofertasRecentes, agora, opcoes) {
  const tsRef = Number(agora) || Date.now();
  const JANELA_24H = 24 * 60 * 60 * 1000;
  const JANELA_72H = 72 * 60 * 60 * 1000;
  const opts = opcoes || {};
  const manCand = lerManuaisExtrator(cand && cand.links_manuais);
  const pendente = !!(cand && (cand.curto_pendente || manCand.curto_pendente));
  const pidCand = !pendente && cand && cand.produto_id ? String(cand.produto_id) : '';
  const rKeyCand = String((cand && cand.radar_key) || manCand.radar_key || '');
  const tSlugCand = slug((cand && cand.titulo) || '').slice(0, 36);
  const cupomNovo = cupomRowExtrator(cand, manCand);
  const precoCandRaw = cand && cand.preco != null ? Number(cand.preco) : NaN;
  const precoNovo = Number.isFinite(precoCandRaw) && precoCandRaw > 0 ? precoCandRaw : null;

  const mesmas = [];
  for (const r of ofertasRecentes || []) {
    if (!r || !r.oferta_id) continue;
    if (r.status === 'rejeitada' || r.status === 'editada') continue;
    if (opts.ignorar_oferta_id && r.oferta_id === opts.ignorar_oferta_id) continue;
    const manR = lerManuaisExtrator(r.links_manuais);
    let igual = false;
    if (pidCand && r.produto_id) {
      igual = String(r.produto_id) === pidCand;
    } else if (rKeyCand && manR.radar_key) {
      igual = String(manR.radar_key) === rKeyCand;
    } else if (!pidCand && tSlugCand.length >= 12) {
      igual = slug(r.titulo || '').slice(0, 36) === tSlugCand;
    }
    if (!igual && rKeyCand && manR.radar_key && String(manR.radar_key) === rKeyCand) igual = true;
    if (igual) mesmas.push({ r, manR, ts: r.ts != null ? Number(r.ts) : tsRef });
  }
  if (!mesmas.length) return { bloquear: false, eh_atualizacao: false };

  const corte24h = tsRef - JANELA_24H;
  const doProd24h = mesmas.filter((x) => x.ts >= corte24h);

  const checarContra = (lista, permitirRepost) => {
    const ordenadas = lista.slice().sort((a, b) => b.ts - a.ts);
    const ref = ordenadas[0];
    const precos = ordenadas.map((x) => Number(x.r.preco)).filter((n) => Number.isFinite(n) && n > 0);
    const menor = precos.length ? Math.min(...precos) : null;
    const cuponsAnt = new Set(ordenadas.map((x) => cupomRowExtrator(x.r, x.manR)).filter(Boolean));
    if (precoNovo == null) {
      return { bloquear: true, motivo: 'ja_publicada_24h', anterior: ref.r, menor_preco: menor };
    }
    const baixou = menor != null && precoNovo <= menor - 1 && (menor - precoNovo) / menor >= 0.05;
    const entrouCupom = !!cupomNovo && !cuponsAnt.has(cupomNovo) && (menor == null || precoNovo <= menor + 0.01);
    if (permitirRepost && (baixou || entrouCupom)) {
      return {
        bloquear: false,
        eh_atualizacao: true,
        anterior: ref.r,
        repost_de: ref.r.oferta_id,
        preco_anterior: menor != null ? menor : (Number(ref.r.preco) || null),
        cupom_anterior: [...cuponsAnt][0] || '',
        motivo_repost: baixou && entrouCupom ? 'baixou_cupom' : (baixou ? 'baixou' : 'cupom'),
      };
    }
    if (permitirRepost) {
      return { bloquear: true, motivo: 'ja_publicada_24h', anterior: ref.r, menor_preco: menor };
    }
    // Registro pendente/sem status (ex.: candidato de coleta/radar ainda não aprovado): não duplica sem melhoria clara
    if (opts.modo_radar && (!menor || (!baixou && !entrouCupom))) {
      return { bloquear: true, motivo: 'pendente_recente', anterior: ref.r, menor_preco: menor };
    }
    return { bloquear: false, eh_atualizacao: false };
  };

  if (doProd24h.length) {
    const publicadas24h = doProd24h.filter((x) => x.r.status === 'aprovada' || x.r.status === 'publicando');
    if (publicadas24h.length) {
      return checarContra(publicadas24h, true);
    }
    const resPend = checarContra(doProd24h, false);
    if (resPend.bloquear) return resPend;
  }

  if (opts.janela_radar_72h) {
    const corte72h = tsRef - JANELA_72H;
    const doProd72h = mesmas.filter((x) => x.ts >= corte72h);
    if (doProd72h.length) {
      const publicadas72h = doProd72h.filter((x) => x.r.status === 'aprovada' || x.r.status === 'publicando');
      if (publicadas72h.length) {
        const ref72 = publicadas72h.sort((a, b) => b.ts - a.ts)[0];
        const menor72 = Math.min(...publicadas72h.map((x) => Number(x.r.preco)).filter((n) => Number.isFinite(n) && n > 0));
        const cupons72 = new Set(publicadas72h.map((x) => cupomRowExtrator(x.r, x.manR)).filter(Boolean));
        const baixou72 = precoNovo != null && Number.isFinite(menor72) && precoNovo <= menor72 - 1 && (menor72 - precoNovo) / menor72 >= 0.05;
        const cupom72 = !!cupomNovo && !cupons72.has(cupomNovo) && (!Number.isFinite(menor72) || precoNovo <= menor72 + 0.01);
        if (!baixou72 && !cupom72) {
          return { bloquear: true, motivo: 'recente_72h', anterior: ref72.r, menor_preco: menor72 };
        }
        return { bloquear: false, eh_atualizacao: false };
      }
      return { bloquear: true, motivo: 'recente_72h', anterior: doProd72h[0].r };
    }
  }

  return { bloquear: false, eh_atualizacao: false };
}

const LOJAS_CATEGORIAS_COMPAT = {
  ml: ['tech', 'moda', 'beleza', 'perfumes', 'saude', 'casa', 'bebe'],
  amazon: ['tech', 'moda', 'beleza', 'perfumes', 'saude', 'casa', 'bebe'],
  shopee: ['tech', 'moda', 'beleza', 'perfumes', 'saude', 'casa', 'bebe'],
  shein: ['moda', 'beleza', 'casa', 'bebe'],
  tiktok: ['moda', 'beleza', 'casa', 'tech'],
  kabum: ['tech'],
  terabyte: ['tech'],
  pichau: ['tech'],
  centauro: ['moda'],
  netshoes: ['moda'],
  nike: ['moda'],
  adidas: ['moda'],
  renner: ['moda'],
  cea: ['moda'],
  riachuelo: ['moda'],
  dafiti: ['moda'],
  zattini: ['moda'],
  hering: ['moda'],
  boticario: ['beleza', 'perfumes'],
  natura: ['beleza', 'perfumes'],
  sephora: ['beleza', 'perfumes'],
  belezanaweb: ['beleza', 'perfumes'],
  epocacosmeticos: ['beleza', 'perfumes'],
  drogaraia: ['saude', 'beleza', 'bebe'],
  drogasil: ['saude', 'beleza', 'bebe'],
  pacheco: ['saude', 'beleza', 'bebe'],
  panvel: ['saude', 'beleza', 'bebe'],
  araujo: ['saude', 'beleza', 'bebe'],
  paguemenos: ['saude', 'beleza', 'bebe'],
};

const PALAVRAS_CUPOM_CAT = {
  tech: ['tech', 'tecnologia', 'eletronico', 'eletronicos', 'informatica', 'celular', 'celulares', 'smartphone', 'smartphones', 'notebook', 'notebooks', 'game', 'games', 'gamer', 'hardware', 'pc', 'tv', 'tvs', 'audio', 'console', 'ps5', 'xbox'],
  moda: ['moda', 'roupa', 'roupas', 'vestuario', 'calcado', 'calcados', 'tenis', 'esportivo', 'esporte', 'esportes', 'acessorio', 'acessorios', 'fashion', 'camiseta', 'vestido', 'jeans', 'bolsa'],
  beleza: ['beleza', 'skincare', 'cosmetico', 'cosmeticos', 'maquiagem', 'cabelo', 'cabelos', 'dermocosmetico', 'dermocosmeticos'],
  perfumes: ['perfume', 'perfumes', 'perfumaria', 'fragrancia', 'fragrancias', 'perfume arabe'],
  saude: ['saude', 'suplemento', 'suplementos', 'farmacia', 'drogaria', 'vitamina', 'vitaminas', 'creatina', 'whey', 'medicamento', 'medicamentos'],
  casa: ['casa', 'eletro', 'eletrodomestico', 'eletrodomesticos', 'eletroportatil', 'eletroportateis', 'cozinha', 'supermercado', 'mercado', 'alimento', 'alimentos', 'bebida', 'bebidas', 'moveis', 'decoracao', 'lar'],
  bebe: ['bebe', 'bebes', 'fralda', 'fraldas', 'infantil', 'brinquedo', 'brinquedos', 'maternidade'],
};

function categoriasNoTrechoCupom(trechoNorm) {
  if (!trechoNorm || trechoNorm.trim().length < 2) return [];
  const achadas = [];
  for (const [cat, kws] of Object.entries(PALAVRAS_CUPOM_CAT)) {
    const baseLista = kws.concat((PALAVRAS_CAT[cat] || []).slice(0, 18));
    if (pontuarTextoCat(trechoNorm, baseLista, 2, 1) > 0) achadas.push(cat);
  }
  return achadas;
}

/**
 * Identifica o escopo de um cupom de loja: geral ("em todo o site" / lote de horário) vs restrito a categorias
 * (ex.: "cupom tech", "só em moda"), respeitando exceções ("exceto celulares").
 */
function detectarEscopoCupom(titulo, descricao, loja) {
  const bruto = [titulo, descricao].filter(Boolean).join(' ');
  const norm = normalizarBusca(bruto);
  const compatBase = (LOJAS_CATEGORIAS_COMPAT[loja] || ['tech', 'moda', 'beleza', 'perfumes', 'saude', 'casa', 'bebe']).slice();

  const mHora = bruto.match(/(?:às|as)\s*(\d{1,2})(?:h(?::?(\d{2}))?|\s*horas?)\b|\b(\d{1,2})h(?:00)?\b/i);
  const horaNum = mHora ? Number(mHora[1] || mHora[3]) : null;
  const horarioLote = Number.isFinite(horaNum) && horaNum >= 0 && horaNum <= 23
    ? `${horaNum}h${mHora[2] ? mHora[2] : ''}`
    : '';

  const mExceto = bruto.match(/\b(?:exceto|menos|nao\s+valido\s+para|não\s+v[aá]lido\s+para)\s+([^.;!\n]+)/i);
  const excluidas = mExceto ? categoriasNoTrechoCupom(normalizarBusca(mExceto[1])) : [];
  const semExceto = mExceto ? bruto.replace(mExceto[0], ' ') : bruto;
  const normSemExc = normalizarBusca(semExceto);

  const catsDetectadas = categoriasNoTrechoCupom(normSemExc).filter((c) => !excluidas.includes(c));
  const compatFiltradas = compatBase.filter((c) => !excluidas.includes(c));

  const temMarcaGeral = /\b(?:todo o site|todo site|toda a loja|toda loja|qualquer produto|lote de cupons|liberacao de cupons|libera cupons|abertura de cupons|cupons do dia|app todo)\b/i.test(normSemExc);
  const exigeResgatePrevio = detectarResgatePrevioCupom(bruto);

  if (compatBase.length === 1) {
    const c = compatBase[0];
    return { escopo: 'restrito', categorias: [c], principal: c, excluidas, horario_lote: horarioLote, exige_resgate_previo: exigeResgatePrevio };
  }
  if (!temMarcaGeral && catsDetectadas.length > 0 && catsDetectadas.length <= 3) {
    return {
      escopo: 'restrito',
      categorias: catsDetectadas,
      principal: catsDetectadas[0],
      excluidas,
      horario_lote: horarioLote,
      exige_resgate_previo: exigeResgatePrevio,
    };
  }
  const categoriasFinais = compatFiltradas.length ? compatFiltradas : compatBase;
  return {
    escopo: 'geral',
    categorias: categoriasFinais,
    principal: 'top',
    excluidas,
    horario_lote: horarioLote,
    exige_resgate_previo: exigeResgatePrevio,
  };
}

const LOJA_ALIAS_CUPOM = {
  ml: 'ml', meli: 'ml', mercadolivre: 'ml',
  amazon: 'amazon', amz: 'amazon',
  shopee: 'shopee',
  shein: 'shein',
  tiktok: 'tiktok',
  kabum: 'kabum',
  centauro: 'centauro',
  netshoes: 'netshoes',
  nike: 'nike',
  adidas: 'adidas',
  renner: 'renner',
  cea: 'cea',
  riachuelo: 'riachuelo',
  dafiti: 'dafiti',
  zattini: 'zattini',
  hering: 'hering',
  boticario: 'boticario',
  natura: 'natura',
  sephora: 'sephora',
  belezanaweb: 'belezanaweb',
  drogaraia: 'drogaraia',
  raia: 'drogaraia',
  drogasil: 'drogasil',
};

/**
 * Interpreta "/cupom <loja> [CODIGO] [categorias/horário/regras] [link]" para anúncios manuais de cupom/lote.
 */
function parseComandoCupomLoja(texto, cfg, meta) {
  const bruto = String(texto || '').trim();
  const semCmd = bruto.replace(/^\/cupom(?:@\w+)?\s*/i, '').trim();
  if (!semCmd) {
    return {
      erro: [
        '🎟️ Como anunciar um cupom ou lote de cupons da loja:',
        '',
        '/cupom <loja> <código ou horário + categorias>',
        '',
        'Exemplos:',
        '• /cupom ml Lote das 19h no Mercado Livre em todo o site',
        '• /cupom ml MELI15 15% OFF só em tech',
        '• /cupom shopee SHOP20 20% OFF em moda e beleza',
        '• /cupom amazon https://amzn.to/... Cupom de R$ 50 OFF em casa',
      ].join('\n'),
    };
  }

  const urls = extrairLinksProduto(semCmd);
  const urlInformada = urls[0] || '';
  let loja = '';
  if (urlInformada) {
    const hopCurto = meta && meta.resp_curto ? lerLocation(meta.resp_curto) : '';
    const idUrl = identificarLinkFlexivel(urlInformada, hopCurto);
    if (idUrl && idUrl.loja && idUrl.loja !== 'outra') loja = idUrl.loja;
  }

  const tokens = semCmd.split(/\s+/);
  let idxConsumo = -1;
  for (let i = 0; i < Math.min(tokens.length, 3); i++) {
    const tokNorm = slug(tokens[i]).replace(/[^a-z0-9]/g, '');
    if (LOJA_ALIAS_CUPOM[tokNorm]) {
      loja = LOJA_ALIAS_CUPOM[tokNorm];
      idxConsumo = i;
      break;
    }
  }
  if (!loja) {
    return {
      erro: '❗ Informe a loja após /cupom (ex.: /cupom ml ..., /cupom shopee ..., /cupom amazon ..., /cupom shein ...).',
    };
  }

  const restoTokens = idxConsumo >= 0 ? tokens.filter((_, i) => i !== idxConsumo) : tokens.slice();
  const textoSemUrls = restoTokens.filter((t) => !/^https?:\/\//i.test(t)).join(' ').trim();
  const ext = extrairDoTexto(textoSemUrls);
  let cupom = ext.cupom || '';
  if (!cupom) {
    for (const tok of restoTokens) {
      if (/^https?:\/\//i.test(tok)) continue;
      const lim = tok.replace(/[^A-Za-z0-9_-]/g, '');
      const ehUpperOuAlnum = (/^[A-Z0-9_-]{4,20}$/.test(lim) && !/^(TECH|MODA|CASA|BEBE|SAUDE|BELEZA|PERFUMES|SITE|TODO|TUDO|LOTE|HOJE|AGORA|CUPOM|CUPONS|AMAZON|SHOPEE|SHEIN|MELI|OFF)$/.test(lim))
        || (/^[A-Za-z]{2,}[0-9]{1,}[A-Za-z0-9_-]*$/.test(lim) && lim.length >= 4 && lim.length <= 20);
      if (ehUpperOuAlnum) {
        cupom = lim.toUpperCase();
        break;
      }
    }
  }

  const escopo = detectarEscopoCupom(textoSemUrls, '', loja);
  const nomeL = nomeLoja(loja);
  const titulo = textoSemUrls
    ? truncar(textoSemUrls.replace(/^[-–—:\s]+/, ''), 120)
    : `Cupons ${nomeL}${escopo.horario_lote ? ` · ${escopo.horario_lote}` : ''}`;

  const urlFinal = urlInformada || urlCentralCupons(loja, cfg) || 'https://www.mercadolivre.com.br/cupons';
  const curtoManual = (meta && meta.curto && ehAfiliadoCurto(meta.curto))
    ? meta.curto
    : (urlInformada && (ehAfiliadoCurto(urlInformada) || temParamAfiliado(urlInformada)) ? urlInformada : '');
  const prodId = `cupom_${loja}_${sha256Hex(`${loja}|${cupom}|${escopo.horario_lote}|${slug(titulo)}`).slice(0, 10)}`;
  const catsCfg = Object.keys((cfg && cfg.categorias) || PALAVRAS_CAT);
  const catsCompat = escopo.categorias.filter((c) => catsCfg.includes(c));
  const catPrincipal = escopo.escopo === 'geral'
    ? 'top'
    : (catsCompat[0] || (catsCfg.includes('beleza') ? 'beleza' : 'casa'));

  return {
    ok: true,
    oferta: {
      categoria: catPrincipal,
      top: escopo.escopo === 'geral',
      loja,
      produto_id: prodId,
      url: urlFinal,
      titulo,
      preco: 0,
      ref90: null,
      ref90_fonte: '',
      imagem: logoLoja(loja, cfg),
      links_manuais: Object.assign({
        eh_cupom_loja: true,
        escopo_cupom: escopo.escopo,
        categorias_cupom: catsCompat,
        horario_lote: escopo.horario_lote || '',
        descricao_cupom: titulo,
        cupom_auto: ext.cupom_auto || '',
        origem: 'manual_cupom',
      }, cupom ? { cupom } : {}, escopo.exige_resgate_previo || ext.exige_resgate_previo || detectarResgatePrevioCupom(textoSemUrls, cupom) ? { exige_resgate_previo: true } : {}, curtoManual ? { _afiliado: curtoManual } : {}),
    },
  };
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
  bateTermoInteligente,
  normalizarBusca,
  CATEGORIA_PADRAO_LOJA,
  detectarEscopoCupom,
  detectarResgatePrevioCupom,
  parseComandoCupomLoja,
  extrairDoTexto,
  parseMensagemLink,
  parseRespostaPreco,
  reqPaginaProduto,
  lerPaginaProduto,
  avaliarExpiracaoPagina,
  avaliarRepeticao24h,
  limparTituloLoja,
  recalcularParcelamentoComCupom,
  pedirPrecoRapido,
  juntarPagina,
  prepararMercadoOferta,
  juntarMercadoOferta,
};
