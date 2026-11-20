'use strict';

/**
 * Ofertô Intelligence — Motor Central de Contexto Compartilhado, Compreensão de Produto,
 * Decisão Multicritério Explicável (9 Dimensões), Telemetria de Funil, Aprendizado Contínuo
 * e Autocura Operacional (Custo Zero / 100% Determinístico).
 */

const {
  round2,
  formatBRL,
  slug,
  truncar,
} = require('./util');
const {
  nomeLoja,
  LOJAS_KPOP_INT,
} = require('./lojas');
const {
  statusAfiliadoFonte,
} = require('./links');
const {
  resumoEconomia,
} = require('./copy');
const {
  bateTermoComSinonimos,
} = require('./agentes');
const { detectarNicho } = require('./tom');

const DIA_MS = 24 * 60 * 60 * 1000;
const HORA_MS = 60 * 60 * 1000;

/* ---------- 1. Dicionário de Marcas e Especificações para Compreensão de Produto ---------- */

const MARCAS_CONHECIDAS = [
  // Tech, Hardware & Games
  { id: 'apple', nome: 'Apple', re: /\b(?:apple|iphone|ipad|macbook|airpods|apple\s+watch)\b/i, peso: 18 },
  { id: 'samsung', nome: 'Samsung', re: /\b(?:samsung|galaxy\s+[aszmfe]\d*|qled|crystal\s+uhd|odyssey)\b/i, peso: 16 },
  { id: 'sony', nome: 'Sony', re: /\b(?:sony|playstation|ps5|ps4|dualsense|wh-1000xm\d)\b/i, peso: 17 },
  { id: 'nintendo', nome: 'Nintendo', re: /\b(?:nintendo|switch\s+oled|joy-con)\b/i, peso: 17 },
  { id: 'microsoft', nome: 'Microsoft', re: /\b(?:xbox\s+series|microsoft)\b/i, peso: 16 },
  { id: 'motorola', nome: 'Motorola', re: /\b(?:motorola|moto\s+g\d*|edge\s+\d+)\b/i, peso: 14 },
  { id: 'xiaomi', nome: 'Xiaomi', re: /\b(?:xiaomi|redmi|poco\s+[xfmc]\d)\b/i, peso: 15 },
  { id: 'lg', nome: 'LG', re: /\b(?:lg\s+oled|lg\s+ultragear|smart\s+tv\s+lg|\blg\b)\b/i, peso: 15 },
  { id: 'logitech', nome: 'Logitech', re: /\b(?:logitech|g\s*pro\s*x|mx\s+master)\b/i, peso: 15 },
  { id: 'jbl', nome: 'JBL', re: /\b(?:jbl|boombox|charge\s+\d|flip\s+\d|partybox)\b/i, peso: 15 },
  { id: 'amd', nome: 'AMD', re: /\b(?:amd|ryzen\s+[3579]|radeon\s+rx)\b/i, peso: 16 },
  { id: 'nvidia', nome: 'NVIDIA', re: /\b(?:nvidia|geforce|rtx\s+\d{4})\b/i, peso: 17 },
  { id: 'intel', nome: 'Intel', re: /\b(?:intel\s+core|core\s+i[3579])\b/i, peso: 15 },
  { id: 'kingston', nome: 'Kingston', re: /\b(?:kingston|nv2|nv3|fury\s+beast)\b/i, peso: 14 },
  { id: 'corsair', nome: 'Corsair', re: /\b(?:corsair|vengeance)\b/i, peso: 14 },
  { id: 'acer', nome: 'Acer', re: /\b(?:acer|nitro\s+5|nitro\s+v15|aspire\s+\d)\b/i, peso: 14 },
  { id: 'asus', nome: 'ASUS', re: /\b(?:asus|rog\s+strix|tuf\s+gaming|vivobook)\b/i, peso: 15 },
  { id: 'lenovo', nome: 'Lenovo', re: /\b(?:lenovo|ideapad|legion|thinkpad|loq)\b/i, peso: 14 },
  { id: 'dell', nome: 'Dell', re: /\b(?:dell|inspiron|alienware)\b/i, peso: 15 },
  // Perfumaria (Árabe, Nicho, Designer, Nacional)
  { id: 'lattafa', nome: 'Lattafa', re: /\b(?:lattafa|asad|khamrah|yara|fakhar|bade'?e\s+al\s+oud)\b/i, peso: 17 },
  { id: 'afnan', nome: 'Afnan', re: /\b(?:afnan|9\s*pm|turathi|supremacy)\b/i, peso: 16 },
  { id: 'armaf', nome: 'Armaf', re: /\b(?:armaf|club\s+de\s+nuit)\b/i, peso: 16 },
  { id: 'al_haramain', nome: 'Al Haramain', re: /\b(?:al\s+haramain|amber\s+oud)\b/i, peso: 16 },
  { id: 'rasasi', nome: 'Rasasi', re: /\b(?:rasasi|hawas)\b/i, peso: 16 },
  { id: 'orientica', nome: 'Orientica', re: /\b(?:orientica|royal\s+amber)\b/i, peso: 15 },
  { id: 'dior', nome: 'Dior', re: /\b(?:dior|sauvage|miss\s+dior|j'adore)\b/i, peso: 18 },
  { id: 'chanel', nome: 'Chanel', re: /\b(?:chanel|bleu\s+de\s+chanel|coco\s+mademoiselle)\b/i, peso: 18 },
  { id: 'ysl', nome: 'YSL', re: /\b(?:yves\s+saint\s+laurent|\bysl\b|libre\s+edp|myslf)\b/i, peso: 17 },
  { id: 'carolina_herrera', nome: 'Carolina Herrera', re: /\b(?:carolina\s+herrera|good\s+girl|bad\s+boy|212\s+vip)\b/i, peso: 17 },
  { id: 'paco_rabanne', nome: 'Rabanne', re: /\b(?:paco\s+rabanne|rabanne|1\s+million|invictus|olympea|phantom|fame)\b/i, peso: 16 },
  { id: 'jpg', nome: 'Jean Paul Gaultier', re: /\b(?:jean\s+paul\s+gaultier|le\s+male|scandal|la\s+belle)\b/i, peso: 17 },
  { id: 'boticario', nome: 'O Boticário', re: /\b(?:o\s+botic[aá]rio|malbec|lily|egeo|floratta|quasar)\b/i, peso: 15 },
  { id: 'natura', nome: 'Natura', re: /\b(?:natura|essencial\s+oud|kaiak|ili[aá]|luna|tododia|ekos)\b/i, peso: 15 },
  // Beleza, Skincare & Dermocosméticos
  { id: 'la_roche', nome: 'La Roche-Posay', re: /\b(?:la\s+roche[-\s]posay|anthelios|effaclar|cicaplast)\b/i, peso: 17 },
  { id: 'cerave', nome: 'CeraVe', re: /\b(?:cerave)\b/i, peso: 16 },
  { id: 'vichy', nome: 'Vichy', re: /\b(?:vichy|mineral\s+89|normaderm|dercos)\b/i, peso: 16 },
  { id: 'bioderma', nome: 'Bioderma', re: /\b(?:bioderma|sensibio|sebium)\b/i, peso: 16 },
  { id: 'isdin', nome: 'ISDIN', re: /\b(?:isdin|fusion\s+water)\b/i, peso: 16 },
  { id: 'creamy', nome: 'Creamy', re: /\b(?:creamy\s+skincare|\bcreamy\b)\b/i, peso: 15 },
  { id: 'principia', nome: 'Principia', re: /\b(?:principia)\b/i, peso: 14 },
  { id: 'sallve', nome: 'Sallve', re: /\b(?:sallve)\b/i, peso: 14 },
  { id: 'kerastase', nome: 'Kérastase', re: /\b(?:k[eé]rastase)\b/i, peso: 17 },
  { id: 'wella', nome: 'Wella', re: /\b(?:wella|oil\s+reflections|invigo)\b/i, peso: 16 },
  { id: 'loreal', nome: "L'Oréal", re: /\b(?:l'or[eé]al|elseve|absolut\s+repair)\b/i, peso: 14 },
  // Saúde & Suplementos
  { id: 'max_titanium', nome: 'Max Titanium', re: /\b(?:max\s+titanium|top\s+whey|horus)\b/i, peso: 15 },
  { id: 'integralmedica', nome: 'Integralmédica', re: /\b(?:integralm[eé]dica|darkness)\b/i, peso: 15 },
  { id: 'dux', nome: 'DUX Nutrition', re: /\b(?:dux\s+nutrition|\bdux\b\s+whey)\b/i, peso: 16 },
  { id: 'growth', nome: 'Growth', re: /\b(?:growth\s+supplements)\b/i, peso: 15 },
  // Casa & Eletro
  { id: 'mondial', nome: 'Mondial', re: /\b(?:mondial)\b/i, peso: 13 },
  { id: 'philips_walita', nome: 'Philips Walita', re: /\b(?:philips\s+walita|walita|\bphilips\b)\b/i, peso: 15 },
  { id: 'oster', nome: 'Oster', re: /\b(?:oster)\b/i, peso: 14 },
  { id: 'electrolux', nome: 'Electrolux', re: /\b(?:electrolux)\b/i, peso: 15 },
  { id: 'brastemp', nome: 'Brastemp', re: /\b(?:brastemp)\b/i, peso: 16 },
  { id: 'consul', nome: 'Consul', re: /\b(?:consul)\b/i, peso: 14 },
  { id: 'arno', nome: 'Arno', re: /\b(?:arno)\b/i, peso: 14 },
  { id: 'nespresso', nome: 'Nespresso', re: /\b(?:nespresso)\b/i, peso: 16 },
  { id: 'stanley', nome: 'Stanley', re: /\b(?:stanley)\b/i, peso: 16 },
  { id: 'tramontina', nome: 'Tramontina', re: /\b(?:tramontina)\b/i, peso: 15 },
  // Moda & Esporte
  { id: 'nike', nome: 'Nike', re: /\b(?:nike|air\s+max|air\s+force|pegasus|downshifter|revolution\s+\d)\b/i, peso: 16 },
  { id: 'adidas', nome: 'Adidas', re: /\b(?:adidas|ultraboost|adi2000|grand\s+court|duramo|coreracer)\b/i, peso: 16 },
  { id: 'olympikus', nome: 'Olympikus', re: /\b(?:olympikus|corre\s+[34]|velo|challenger)\b/i, peso: 15 },
  { id: 'mizuno', nome: 'Mizuno', re: /\b(?:mizuno|wave\s+prophecy|wave\s+creation)\b/i, peso: 15 },
  { id: 'asics', nome: 'Asics', re: /\b(?:asics|gel[-\s]nimbus|gel[-\s]kayano|novablast)\b/i, peso: 16 },
  { id: 'puma', nome: 'Puma', re: /\b(?:puma)\b/i, peso: 14 },
  { id: 'vans', nome: 'Vans', re: /\b(?:vans|old\s+skool|ultrarange)\b/i, peso: 15 },
  { id: 'farm', nome: 'FARM Rio', re: /\b(?:farm\s+rio|\bfarm\b)\b/i, peso: 15 },
  { id: 'hering', nome: 'Hering', re: /\b(?:hering)\b/i, peso: 13 },
  // Bebê & Família
  { id: 'pampers', nome: 'Pampers', re: /\b(?:pampers|confort\s+sec|premium\s+care|pants)\b/i, peso: 17 },
  { id: 'huggies', nome: 'Huggies', re: /\b(?:huggies|supreme\s+care|natural\s+care)\b/i, peso: 16 },
  { id: 'mamypoko', nome: 'MamyPoko', re: /\b(?:mamypoko)\b/i, peso: 15 },
  { id: 'granado', nome: 'Granado', re: /\b(?:granado)\b/i, peso: 14 },
  // Pet
  { id: 'royal_canin', nome: 'Royal Canin', re: /\b(?:royal\s+canin)\b/i, peso: 16 },
  { id: 'premier_pet', nome: 'PremieR', re: /(?:^|[^\p{L}])(?:premier\s+pet|ra[cç][aã]o\s+premier|golden\s+f[oó]rmula|golden\s+(?:c[aã]es|gatos|special|mega))(?![\p{L}])/iu, peso: 15 },
  { id: 'pedigree', nome: 'Pedigree', re: /\bpedigree\b/i, peso: 14 },
  { id: 'whiskas', nome: 'Whiskas', re: /\bwhiskas\b/i, peso: 14 },
  { id: 'bravecto', nome: 'Bravecto', re: /\b(?:bravecto|simparic|nexgard)\b/i, peso: 17 },
  // Auto & Ferramentas
  { id: 'vonixx', nome: 'Vonixx', re: /\b(?:vonixx|v-floc|blend\s+cera|sintraz)\b/i, peso: 15 },
  { id: 'bosch', nome: 'Bosch', re: /\b(?:bosch)\b/i, peso: 15 },
  { id: 'makita', nome: 'Makita', re: /\b(?:makita)\b/i, peso: 16 },
  { id: 'dewalt', nome: 'DeWalt', re: /\b(?:dewalt)\b/i, peso: 16 },
  { id: 'wap', nome: 'WAP', re: /\b(?:wap)\b/i, peso: 14 },
];

const LOJAS_1P_OFICIAIS = new Set([
  'amazon', 'kabum', 'terabyte', 'pichau', 'acer', 'motorola', 'samsung',
  'drogaraia', 'drogasil', 'pacheco', 'panvel', 'araujo', 'paguemenos', 'venancio',
  'oficialfarma', 'maxtitanium', 'rihappy', 'alobebe', 'belezanaweb', 'epocacosmeticos',
  'boticario', 'natura', 'sephora', 'mahogany', 'creamy', 'ikesaki',
  'centauro', 'netshoes', 'nike', 'adidas', 'olympikus', 'mizuno', 'underarmour',
  'farmrio', 'renner', 'cea', 'riachuelo', 'dafiti', 'zattini', 'hering',
  'polishop', 'electrolux', 'brastemp', 'consul', 'magalu',
  'petz', 'cobasi', 'petlove', 'kalunga', 'pneustore', 'umusic',
]);

function lerManuaisSeguro(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw) || {}; } catch (e) { return {}; }
}

/**
 * Extrai métricas de unidade/volume/quantidade do título para cálculo de custo unitário
 * (ex.: R$ por fralda, R$ por cápsula, R$ por 100ml, R$ por kg, R$ por item no kit).
 */
function extrairMetricasUnidade(titulo, preco) {
  const t = String(titulo || '');
  const p = Number(preco) || 0;
  if (!t) return { qtd: 1, unidade: '', custo_unitario: null, resumo_unidade: '' };

  // 1) Fraldas / Tiras / Cápsulas / Comprimidos / Sachês / Lenços
  const mContagem = t.match(/\b(?:com|c\/|kit(?:\s+com)?|leva|pacote(?:\s+com)?)?\s*(\d{2,4})\s*(tiras?|fraldas?|c[aá]psulas?|caps|comprimidos?|sach[eê]s?|folhas?|unidades?|unid\.?|un\b|len[cç]os?)\b/i);
  if (mContagem) {
    const qtd = Number(mContagem[1]);
    const rawUn = mContagem[2].toLowerCase();
    let labelUn = 'un.';
    if (/fralda/.test(rawUn)) labelUn = 'fralda';
    else if (/tira/.test(rawUn)) labelUn = 'tira';
    else if (/c[aá]ps|caps/.test(rawUn)) labelUn = 'cápsula';
    else if (/comprimido/.test(rawUn)) labelUn = 'comp.';
    else if (/len[cç]o/.test(rawUn)) labelUn = 'lenço';
    else if (/sach[eê]/.test(rawUn)) labelUn = 'sachê';
    if (qtd >= 10 && qtd <= 2000) {
      const cu = p > 0 ? round2(p / qtd) : null;
      return {
        qtd,
        unidade: labelUn,
        custo_unitario: cu,
        resumo_unidade: cu && cu >= 0.05 ? `${formatBRL(cu)}/${labelUn}` : `${qtd} ${labelUn}s`,
      };
    }
  }

  // 2) Kits / Packs (ex.: "Kit 3 Camisetas", "Pack 12 Cervejas", "4x Desodorante")
  const mKit = t.match(/\b(?:kit(?:\s+com)?|pack(?:\s+com)?|combo(?:\s+com)?|leve)\s*([2-9]|1[0-9]|2[04])\s*(?:unidades?|un\.?|pe[cç]as?|pares?|itens?|camisetas?|latas?|garrafas?)?\b/i)
    || t.match(/^\s*([2-9]|1[0-2])\s*x\s+[A-Za-zÀ-ÿ]/i);
  if (mKit) {
    const qtd = Number(mKit[1]);
    if (qtd >= 2 && qtd <= 24) {
      const cu = p > 0 ? round2(p / qtd) : null;
      return {
        qtd,
        unidade: 'item',
        custo_unitario: cu,
        resumo_unidade: cu && cu >= 1 ? `${formatBRL(cu)} cada no kit c/ ${qtd}` : `Kit c/ ${qtd}`,
      };
    }
  }

  // 3) Volume / Peso (ml, L, g, kg)
  // "5G"/"4G" é rede de celular, não 5 gramas: ignora e segue para a próxima medida do título.
  const mVol = [...t.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(ml|litros?|l|kg|g|gramas?)\b/gi)]
    .find((mm) => !(/^[345]$/.test(mm[1]) && mm[2] === 'G'));
  if (mVol) {
    const val = Number(String(mVol[1]).replace(',', '.'));
    const un = mVol[2].toLowerCase();
    if (Number.isFinite(val) && val > 0) {
      const label = /^l/.test(un) ? 'L' : (/^k/.test(un) ? 'kg' : (/^g/.test(un) ? 'g' : 'ml'));
      return {
        qtd: val,
        unidade: label,
        custo_unitario: null,
        resumo_unidade: `${String(mVol[1]).replace('.', ',')}${label}`,
      };
    }
  }

  return { qtd: 1, unidade: '', custo_unitario: null, resumo_unidade: '' };
}

/**
 * Extrai especificações técnicas e atributos comerciais verificados do título do produto.
 */
function extrairEspecificacoesProduto(titulo, categoria) {
  const t = String(titulo || '');
  const specs = [];
  const add = (s) => {
    const v = String(s || '').trim();
    if (v && !specs.some((x) => x.toLowerCase() === v.toLowerCase()) && specs.length < 6) specs.push(v);
  };

  // Memória / Armazenamento
  for (const m of t.matchAll(/\b(\d{1,4})\s*(GB|TB)\b/gi)) {
    add(`${m[1]}${m[2].toUpperCase()}`);
  }
  // Tela / Polegadas / Taxa de atualização
  const mPol = t.match(/\b(\d{2}(?:[.,]\d)?)\s*(?:polegadas?|pol\.?|["”])\b/i);
  if (mPol) add(`${mPol[1].replace('.', ',')}"`);
  const mHz = t.match(/\b(60|75|100|120|144|165|180|240|360)\s*Hz\b/i);
  if (mHz) add(`${mHz[1]}Hz`);
  // Resolução / Painel
  const mPainel = t.match(/\b(4K|UHD|Full\s*HD|FHD|QHD|OLED|AMOLED|QLED|Mini\s*LED|IPS)\b/i);
  if (mPainel) add(mPainel[1].toUpperCase().replace(/\s+/g, ' '));
  // Conectividade / Recursos Tech
  const mConn = t.match(/\b(5G|Wi-?Fi\s*6E?|Bluetooth\s*5(?:\.\d)?|ANC|NFC| MagSafe)\b/i);
  if (mConn) add(mConn[1].trim());
  // Capacidade Eletro / Casa (Litros, BTU, Watts, Voltagem)
  const mLitros = t.match(/\b(\d{1,3}(?:[.,]\d)?)\s*(?:litros?|L)\b/i);
  if (mLitros && (categoria === 'casa' || /air\s*fryer|fritadeira|forno|geladeira|aspirador|caixa|mochila|garrafa/i.test(t))) {
    add(`${mLitros[1].replace('.', ',')}L`);
  }
  const mBtu = t.match(/\b(\d{1,2}\.?\d{3})\s*BTUs?\b/i);
  if (mBtu) add(`${mBtu[1]} BTUs`);
  const mWatts = t.match(/\b(\d{3,4})\s*W\b/i);
  if (mWatts) add(`${mWatts[1]}W`);
  const mVolt = t.match(/\b(110V|127V|220V|Bivolt)\b/i);
  if (mVolt) add(mVolt[1]);
  // Perfumaria (Concentração e Volume)
  if (categoria === 'perfumes' || /\b(?:eau\s+de\s+parfum|eau\s+de\s+toilette|edp|edt|parfum|col[oô]nia|body\s+splash)\b/i.test(t)) {
    if (/\b(?:eau\s+de\s+parfum|\bedp\b)\b/i.test(t)) add('Eau de Parfum (EDP)');
    else if (/\b(?:eau\s+de\s+toilette|\bedt\b)\b/i.test(t)) add('Eau de Toilette (EDT)');
    else if (/\b(?:extrait\s+de\s+parfum|\bparfum\b)\b/i.test(t)) add('Parfum');
    else if (/\bbody\s+splash\b/i.test(t)) add('Body Splash');
    const mMl = t.match(/\b(\d{2,3})\s*ml\b/i);
    if (mMl) add(`${mMl[1]}ml`);
  }
  // Beleza / Skincare (FPS, ativos)
  const mFps = t.match(/\b(FPS\s*\d{2,3})\b/i);
  if (mFps) add(mFps[1].toUpperCase().replace(/\s+/, ' '));

  return specs;
}

/**
 * Compreensão estruturada do produto: natureza, marca, especificações, custo unitário,
 * público-alvo, tipo de melhoria de preço e melhor argumento comercial.
 */
const CATEGORIA_POR_NICHO = {
  kpop: 'kpop', tech: 'tech', hardware: 'tech', games: 'tech', moda: 'moda', beleza: 'beleza', perfumes: 'perfumes',
  bebe: 'bebe', saude: 'saude', suplementos: 'saude', cuidado: 'saude', auto: 'auto', pet: 'pet', livros: 'livros',
  papelaria: 'papelaria', mercado: 'mercado', casa: 'casa', ferramentas: 'casa',
};

/** Categoria deduzida do título (roteador de nicho do tom). 'casa' quando nada bate. */
function categoriaPeloTitulo(titulo) {
  try { return CATEGORIA_POR_NICHO[detectarNicho({ titulo }).nicho] || 'casa'; } catch (e) { return 'casa'; }
}

function entenderProdutoOferta(oferta, opcoes) {
  const o = oferta || {};
  const opts = opcoes || {};
  const man = lerManuaisSeguro(o.links_manuais);
  const titulo = String(o.titulo || '');
  // Sem categoria (link colado, tópico "top"), o nicho lido do título decide. Antes tudo virava 'casa' e
  // um fone sem categoria recebia natureza e público de utilidade doméstica.
  const catInformada = String(o.categoria || '').toLowerCase();
  const cat = catInformada && catInformada !== 'top' ? catInformada : categoriaPeloTitulo(titulo);
  const preco = Number(o.preco) || 0;

  let marcaObj = null;
  for (const m of MARCAS_CONHECIDAS) {
    if (m.re.test(titulo)) {
      marcaObj = m;
      break;
    }
  }

  const unidadeInfo = extrairMetricasUnidade(titulo, preco);
  const specs = extrairEspecificacoesProduto(titulo, cat);
  if (unidadeInfo.resumo_unidade && !specs.includes(unidadeInfo.resumo_unidade)) {
    specs.push(unidadeInfo.resumo_unidade);
  }

  // Natureza do produto e público-alvo
  let natureza = 'uso_pratico';
  let publicoAlvo = 'consumidor atento a custo-benefício';
  let principalVantagem = 'economia direta na compra';

  if (cat === 'bebe' || /\b(?:fralda|len[cç]o\s+umedecido|f[oó]rmula\s+infantil|sabonete\s+l[ií]quido\s+infantil)\b/i.test(titulo)) {
    natureza = /carrinho|beb[eê]\s+conforto|cadeirinha|ber[cç]o|bab[aá]\s+eletr[oô]nica/i.test(titulo) ? 'duravel_upgrade' : 'consumivel_estoque';
    publicoAlvo = 'pais e famílias com crianças pequenas';
    principalVantagem = natureza === 'consumivel_estoque' ? 'redução do custo por unidade no estoque do mês' : 'equipamento essencial de enxoval com desconto';
  } else if (cat === 'saude' || /\b(?:whey|creatina|vitamina|col[aá]geno|suplemento|tira.*glicemia|fralda\s+geri[aá]trica)\b/i.test(titulo)) {
    natureza = 'consumivel_estoque';
    publicoAlvo = /\b(?:whey|creatina|pr[eé][-\s]treino|bcaa|glutamina)\b/i.test(titulo)
      ? 'quem treina e mantém suplementação contínua'
      : 'quem mantém rotina diária de saúde e bem-estar';
    principalVantagem = 'reposição contínua sem pagar preço cheio de farmácia';
  } else if (cat === 'perfumes') {
    natureza = 'colecionavel_desejo';
    const ehArabe = /\b(?:lattafa|afnan|armaf|al\s+haramain|rasasi|orientica|asad|khamrah|yara|fakhar|club\s+de\s+nuit|amber\s+oud|[aá]rabe)\b/i.test(titulo);
    publicoAlvo = ehArabe ? 'fãs e colecionadores de perfumaria árabe' : 'apreciadores de perfumaria e fragrâncias';
    principalVantagem = 'oportunidade de adquirir fragrância original abaixo da tabela';
  } else if (cat === 'beleza') {
    natureza = /secador|chapinha|prancha|modelador|escova\s+secadora|escova\s+rotativa|depilador|barbeador/i.test(titulo)
      ? 'duravel_upgrade'
      : 'consumivel_estoque';
    publicoAlvo = 'quem mantém rotina de skincare, cabelo ou autocuidado';
    principalVantagem = natureza === 'consumivel_estoque' ? 'reposição da rotina com economia real' : 'praticidade de salão em casa';
  } else if (cat === 'tech') {
    natureza = 'duravel_upgrade';
    if (/\b(?:ps5|playstation|xbox|nintendo\s+switch|dualsense|headset\s+gamer|mouse\s+gamer|teclado\s+mec[aâ]nico|jogo\b)\b/i.test(titulo)) {
      publicoAlvo = 'gamers de console e PC';
      principalVantagem = 'upgrade de setup e jogatina pagando menos';
    } else if (/\b(?:rtx|rx\s+\d{4}|ryzen|core\s+i[3579]|ssd|nvme|ddr[45]|placa[-\s]m[aã]e|monitor|fonte\s+\d{3}w)\b/i.test(titulo)) {
      publicoAlvo = 'quem monta ou faz upgrade de PC e home office';
      principalVantagem = 'desempenho por real investido no hardware';
    } else {
      publicoAlvo = 'quem busca tecnologia confiável para rotina e lazer';
      principalVantagem = 'upgrade tecnológico com desconto verificado';
    }
  } else if (cat === 'kpop') {
    natureza = 'colecionavel_desejo';
    publicoAlvo = 'fãs e colecionadores de K-pop';
    principalVantagem = 'item oficial de coleção ou show com preço acessível';
  } else if (cat === 'casa') {
    natureza = /sab[aã]o|amaciante|lava[-\s]roupas|detergente|desinfetante|papel\s+higi[eê]nico|finish/i.test(titulo)
      ? 'consumivel_estoque'
      : 'duravel_upgrade';
    publicoAlvo = 'quem equipa a casa ou abastece a despensa';
    principalVantagem = natureza === 'consumivel_estoque' ? 'economia imediata na despensa da casa' : 'praticidade diária na cozinha e na rotina doméstica';
  } else if (cat === 'moda') {
    natureza = 'estilo_vestuario';
    publicoAlvo = /corrida|running|treino|olympikus\s+corre|pegasus|ultraboost|novablast/i.test(titulo)
      ? 'corredores e praticantes de atividade física'
      : 'quem busca renovar calçados e vestuário';
    principalVantagem = 'peça de marca reconhecida abaixo do valor de vitrine';
  } else if (cat === 'pet') {
    natureza = /ra[cç][aã]o|areia|tapete\s+higi[eê]nico|antipulgas|bravecto|simparic|nexgard|sach[eê]|petisco/i.test(titulo)
      ? 'consumivel_estoque'
      : 'uso_pratico';
    publicoAlvo = 'tutores de cães e gatos';
    principalVantagem = 'cuidado e estoque do pet sem pesar no orçamento mensal';
  } else if (cat === 'mercado') {
    natureza = 'consumivel_estoque';
    publicoAlvo = 'quem abastece a despensa e busca reduzir a conta do mercado';
    principalVantagem = 'preço abaixo da gôndola entregue em casa';
  } else if (cat === 'livros') {
    natureza = 'colecionavel_desejo';
    publicoAlvo = 'leitores e colecionadores de livros, HQs e mangás';
    principalVantagem = 'edição para a estante com desconto real sobre a capa';
  } else if (cat === 'papelaria') {
    natureza = 'uso_pratico';
    publicoAlvo = 'estudantes, concurseiros, artistas e home office';
    principalVantagem = 'organização e material de qualidade gastando menos';
  } else if (cat === 'auto') {
    natureza = /shampoo|cera|limpador|v-floc|aditivo|[oó]leo/i.test(titulo) ? 'consumivel_estoque' : 'duravel_upgrade';
    publicoAlvo = 'motoristas, motociclistas e entusiastas de estética automotiva';
    principalVantagem = 'manutenção e equipamento veicular com economia';
  }

  // Tipo de melhoria de preço e melhor argumento comercial
  const selo = o.selo || (opts.seloInfo && opts.seloInfo.selo) || '';
  const min90Val = Number(o.min90 != null ? o.min90 : (opts.seloInfo && opts.seloInfo.min90)) || 0;
  const pctSelo = Number(o.desconto_pct != null ? o.desconto_pct : (opts.seloInfo && opts.seloInfo.desconto_pct)) || 0;
  const temCupom = !!(o.cupom || man.cupom || man.cupom_auto);
  const refMercado = Number(man.ref_mercado || (opts.avMercado && (opts.avMercado.concorrente && opts.avMercado.concorrente.preco || opts.avMercado.mediana))) || 0;
  const pedidoMembro = !!(o.pedido_comunidade || man.pedido_comunidade || (opts.totalAlertasMatch && opts.totalAlertasMatch > 0));
  const ehRepostQueda = !!(o.eh_atualizacao || man.repost_de || (opts.repeticao && opts.repeticao.eh_atualizacao));
  const quedaHistRecente = !!(o.queda_historico_recente || man.queda_historico_recente || (opts.quedaRecente && opts.quedaRecente.queda_verificada));

  let tipoMelhoria = 'desconto_direto_verificado';
  let melhorArgumento = 'preço promocional verificado na loja';

  if (selo === 'abaixo' || (selo === 'ok' && ((min90Val > 0 && min90Val > preco) || pctSelo >= 1))) {
    tipoMelhoria = 'menor_historico_90d';
    melhorArgumento = 'abaixo do menor preço registrado nos últimos 90 dias';
  } else if (selo === 'igual' || selo === 'ok') {
    tipoMelhoria = 'menor_historico_90d';
    melhorArgumento = 'empatado no menor patamar dos últimos 90 dias';
  } else if (ehRepostQueda) {
    tipoMelhoria = 'queda_pos_publicacao';
    melhorArgumento = 'caiu ainda mais desde a última vez que apareceu no canal';
  } else if (quedaHistRecente) {
    tipoMelhoria = 'queda_historico_recente';
    melhorArgumento = 'queda real confirmada em relação às coletas anteriores do nosso histórico';
  } else if (temCupom && refMercado > preco * 1.08) {
    tipoMelhoria = 'cupom_acumulado';
    melhorArgumento = 'cupom ativo somado a preço já abaixo da concorrência';
  } else if (refMercado > preco * 1.1) {
    tipoMelhoria = 'abaixo_concorrencia';
    melhorArgumento = `mais barato que nas outras lojas (${formatBRL(refMercado)})`;
  } else if (temCupom) {
    tipoMelhoria = 'cupom_acumulado';
    melhorArgumento = 'cupom ativo que derruba o valor final no checkout';
  } else if (pedidoMembro) {
    tipoMelhoria = 'pedido_comunidade';
    melhorArgumento = 'item monitorado pelos alertas de membros da comunidade';
  } else if (man.recorrencia || man.pix) {
    tipoMelhoria = 'recorrencia_ou_pix';
    melhorArgumento = man.recorrencia ? 'desconto extra ativando compra recorrente' : 'desconto real para pagamento à vista no Pix';
  }

  return {
    categoria: cat,
    marca: marcaObj ? marcaObj.nome : '',
    marca_id: marcaObj ? marcaObj.id : '',
    marca_peso: marcaObj ? marcaObj.peso : 0,
    especificacoes: specs,
    qtd_unidades: unidadeInfo.qtd,
    unidade_medida: unidadeInfo.unidade,
    custo_unitario: unidadeInfo.custo_unitario,
    resumo_unidade: unidadeInfo.resumo_unidade,
    natureza,
    publico_alvo: publicoAlvo,
    principal_vantagem: principalVantagem,
    tipo_melhoria: tipoMelhoria,
    melhor_argumento: melhorArgumento,
  };
}

/* ---------- 2. Detector de Queda no Histórico Recente (bfx_precos < 90 dias) ---------- */

/**
 * Avalia se o produto teve queda real de preço comparando com coletas anteriores da nossa
 * própria tabela `bfx_precos`, mesmo quando o histórico ainda não completou 90 dias.
 * Evita descartar ofertas legítimas como `sem_prova_de_desconto`.
 */
function avaliarQuedaHistoricoRecente(oferta, linhasPrecos, agora) {
  const o = oferta || {};
  const precoAtual = Number(o.preco);
  if (!o.loja || !o.produto_id || !Number.isFinite(precoAtual) || precoAtual <= 0) {
    return { queda_verificada: false, pontos: 0 };
  }
  const tsAgora = Number(agora) || Date.now();
  const inicio90d = tsAgora - 90 * DIA_MS;
  const corteMinimoAntiguidade = tsAgora - 20 * 60 * 1000; // pelo menos 20 min atrás (ou coletas anteriores)

  const linhasDoProd = (linhasPrecos || []).filter((r) => {
    if (!r || r.loja !== o.loja || String(r.produto_id) !== String(o.produto_id)) return false;
    if (r.fonte && r.fonte !== 'coleta') return false;
    const p = Number(r.preco);
    const ts = Number(r.ts) || (r.data ? new Date(r.data).getTime() : NaN);
    return Number.isFinite(p) && p > 0 && Number.isFinite(ts) && ts >= inicio90d;
  });

  if (!linhasDoProd.length) return { queda_verificada: false, pontos: 0 };

  const tsDe = (r) => Number(r.ts) || (r.data ? new Date(r.data).getTime() : 0);
  const anteriores = linhasDoProd.filter((r) => tsDe(r) <= corteMinimoAntiguidade || Number(r.preco) !== precoAtual);
  const baseAnalise = anteriores.length ? anteriores : linhasDoProd;
  const precosAnt = baseAnalise.map((r) => Number(r.preco)).sort((a, b) => a - b);
  const menorAnt = precosAnt[0];
  const maiorAnt = precosAnt[precosAnt.length - 1];
  const meio = Math.floor(precosAnt.length / 2);
  const medianaAnt = precosAnt.length % 2
    ? precosAnt[meio]
    : round2((precosAnt[meio - 1] + precosAnt[meio]) / 2);

  // Não pode estar acima do menor preço já observado em mais de 1%
  const refComparacao = medianaAnt > precoAtual ? medianaAnt : maiorAnt;
  const economia = round2(refComparacao - precoAtual);
  const descontoPct = refComparacao > 0 ? Math.floor(((refComparacao - precoAtual) / refComparacao) * 100) : 0;

  // Queda real verificada: preço atual <= menor anterior (ou bateu novo mínimo) e caiu >= 5% (mínimo R$ 2,00) vs mediana/anterior
  const bateuMinimoOuCaiu = precoAtual <= menorAnt * 1.01 && descontoPct >= 5 && economia >= 2;

  return {
    queda_verificada: bateuMinimoOuCaiu,
    pontos: linhasDoProd.length,
    preco_anterior: refComparacao,
    menor_observado: menorAnt,
    mediana_observada: medianaAnt,
    maior_observado: maiorAnt,
    desconto_pct: descontoPct,
    economia: economia > 0 ? economia : 0,
  };
}

/* ---------- 3. Contexto Compartilhado entre Todos os Agentes ---------- */

/**
 * Constrói o Contexto Compartilhado de Inteligência da Oferta, reunindo todos os sinais
 * disponíveis com origem e nível de confiança explícitos (0 a 1).
 */
function construirContextoOferta(candidato, opcoes) {
  const c = candidato || {};
  const opts = opcoes || {};
  const cfg = opts.cfg || {};
  const agora = Number(opts.agora) || Date.now();
  const man = lerManuaisSeguro(c.links_manuais);

  const precoAtual = Number(c.preco) || 0;
  const precoDe = Number(c.preco_de != null ? c.preco_de : man.preco_de) || null;
  const precoSemCupom = Number(c.preco_sem_cupom != null ? c.preco_sem_cupom : man.preco_sem_cupom) || null;
  const cupomCodigo = String(c.cupom || man.cupom || '').trim();
  const cupomAuto = String(c.cupom_auto || man.cupom_auto || '').trim();
  const temCupom = !!(cupomCodigo || cupomAuto);

  const quedaRecente = opts.quedaRecente || avaliarQuedaHistoricoRecente(c, opts.precosRows || [], agora);
  const avMercado = opts.avMercado || c.av_mercado || null;
  const seloInfo = opts.seloInfo || (c.selo ? {
    selo: c.selo,
    min90: c.min90,
    desconto_pct: c.desconto_pct,
    pontos: c.pontos != null ? c.pontos : c.hist_registros,
    ref90_fonte: c.ref90_fonte,
  } : null);

  // Match de alertas de membros (com suporte a sinônimos e filtro correto de booleano ativo === false)
  let alertasMatches = [];
  if (Array.isArray(opts.alertasRows) && opts.alertasRows.length && c.titulo) {
    const titLow = slug(c.titulo).replace(/-/g, ' ');
    alertasMatches = opts.alertasRows.filter((a) => {
      if (!a || a.ativo === false || String(a.ativo || '').toLowerCase() === 'nao' || !a.termo) return false;
      const tNorm = slug(a.termo).replace(/-/g, ' ').trim();
      if (!tNorm || tNorm.length < 2) return false;
      const precoMax = Number(a.preco_max);
      if (Number.isFinite(precoMax) && precoMax > 0 && precoAtual > 0 && precoAtual > precoMax) return false;
      return bateTermoComSinonimos(c.titulo, a.termo) || titLow.includes(tNorm);
    });
  }

  const totalAlertasMatch = Number(opts.totalAlertasMatch != null ? opts.totalAlertasMatch : alertasMatches.length) || 0;
  const prodInfo = entenderProdutoOferta(c, {
    seloInfo,
    avMercado,
    quedaRecente,
    totalAlertasMatch,
    repeticao: opts.repeticao,
  });

  // Economia consolidada
  const econSelo = resumoEconomia(Object.assign({}, c, { links_manuais: man }), true);
  const refMercadoPreco = Number(
    man.ref_mercado
    || c.ref_mercado
    || (avMercado && ((avMercado.concorrente && avMercado.concorrente.preco) || avMercado.mediana))
    || 0
  );
  const refMercadoLoja = String(
    man.ref_mercado_loja
    || c.ref_mercado_loja
    || (avMercado && avMercado.concorrente && avMercado.concorrente.loja_nome)
    || ''
  );

  let descontoRealPct = Number(c.desconto_pct) || (econSelo ? econSelo.pct : 0);
  let economiaReais = econSelo ? econSelo.economia : 0;
  let fonteReferencia = 'sem_referencia';
  let confiancaEconomia = 0.35;

  const seloBruto = (seloInfo && seloInfo.selo) || 'sem_ref';
  const min90Selo = Number(seloInfo && seloInfo.min90) || Number(c.min90) || 0;
  const pctSelo = Number(seloInfo && seloInfo.desconto_pct) || Number(c.desconto_pct) || 0;
  const seloNormalizado = seloBruto === 'ok'
    ? ((min90Selo > precoAtual || pctSelo >= 1) ? 'abaixo' : 'igual')
    : seloBruto;
  const histPontos = Math.max(
    Number(seloInfo && (seloInfo.pontos != null ? seloInfo.pontos : (seloInfo.historico && seloInfo.historico.registros))) || 0,
    Number(c.hist_registros) || 0,
    Number(quedaRecente && quedaRecente.pontos) || 0
  );
  const paginaConfirmada = !!(c.pagina_confirmada || c.preco_confirmado_loja || man.pagina_confirmada || man.preco_confirmado_loja);

  if (seloNormalizado === 'abaixo' || seloNormalizado === 'igual' || seloNormalizado === 'curto') {
    const refFonte = String(c.ref90_fonte || (seloInfo && seloInfo.ref90_fonte) || '');
    fonteReferencia = /^keepa\b/i.test(refFonte) ? 'keepa' : (seloNormalizado === 'curto' ? 'historico_recente' : 'historico_90d');
    confiancaEconomia = seloNormalizado === 'curto' ? 0.82 : 0.95;
    if (min90Selo > precoAtual) {
      const pct90 = Math.floor(((min90Selo - precoAtual) / min90Selo) * 100);
      if (pct90 > descontoRealPct) descontoRealPct = pct90;
      economiaReais = Math.max(economiaReais, round2(min90Selo - precoAtual));
    }
  } else if (quedaRecente && quedaRecente.queda_verificada) {
    fonteReferencia = 'historico_recente';
    confiancaEconomia = 0.85;
    if (quedaRecente.desconto_pct > descontoRealPct) descontoRealPct = quedaRecente.desconto_pct;
    economiaReais = Math.max(economiaReais, quedaRecente.economia);
  } else if (refMercadoPreco > precoAtual) {
    fonteReferencia = 'mercado_zoom_amazon';
    confiancaEconomia = 0.88;
    const pctMerc = Math.floor(((refMercadoPreco - precoAtual) / refMercadoPreco) * 100);
    if (pctMerc > descontoRealPct) descontoRealPct = pctMerc;
    economiaReais = Math.max(economiaReais, round2(refMercadoPreco - precoAtual));
  } else if (temCupom && precoSemCupom && precoSemCupom > precoAtual) {
    fonteReferencia = 'cupom_verificado';
    confiancaEconomia = 0.85;
    const pctCup = Math.floor(((precoSemCupom - precoAtual) / precoSemCupom) * 100);
    if (pctCup > descontoRealPct) descontoRealPct = pctCup;
    economiaReais = Math.max(economiaReais, round2(precoSemCupom - precoAtual));
  } else if (precoDe && precoDe > precoAtual) {
    fonteReferencia = 'anuncio_loja';
    confiancaEconomia = paginaConfirmada ? 0.72 : 0.58;
    const pctDe = Math.floor(((precoDe - precoAtual) / precoDe) * 100);
    if (pctDe > descontoRealPct) descontoRealPct = pctDe;
    economiaReais = Math.max(economiaReais, round2(precoDe - precoAtual));
  }

  const lojaId = String(c.loja || 'outra');
  const stAf = statusAfiliadoFonte(lojaId, cfg, man);
  const monetizada = Boolean((stAf && stAf.ativo) || stAf === 2 || man._afiliado || man._tag_url || c.afiliado_ativo);
  const oficial1P = LOJAS_1P_OFICIAIS.has(lojaId);
  const kpopCurada = !!(
    c.loja_kpop_curada
    || man.loja_kpop_curada
    || ['umusic', 'klinestore', 'hopescolor', 'asiaticstore', 'kpopandyoushop', 'kpopalbums'].includes(lojaId)
    || (Array.isArray(LOJAS_KPOP_INT) && LOJAS_KPOP_INT.includes(lojaId))
  );
  const imagemUrl = String(c.imagem || '');
  const imagemValida = /^https:\/\//i.test(imagemUrl) && !/\.svg(?:$|\?)/i.test(imagemUrl);

  const sinais = {
    preco: {
      valor: precoAtual,
      origem: paginaConfirmada ? 'pdp_confirmada' : (c.fonte || c.fonte_radar || man.origem || 'extrator'),
      confianca: paginaConfirmada ? 0.96 : (precoAtual > 0 ? 0.78 : 0),
    },
    economia: {
      desconto_pct: descontoRealPct,
      economia_reais: economiaReais,
      origem: fonteReferencia,
      confianca: confiancaEconomia,
    },
    cupom: {
      ativo: temCupom,
      codigo: cupomCodigo,
      cupom_auto: cupomAuto,
      exige_resgate_previo: !!(c.exige_resgate_previo || man.exige_resgate_previo),
      exige_resgate_pagina: !!(c.exige_resgate_pagina || man.exige_resgate_pagina),
      exclusivo_prime: !!(c.cupom_prime || man.cupom_prime),
      origem: paginaConfirmada ? 'pdp_loja' : (c.fonte || c.fonte_radar || 'anuncio'),
      confianca: temCupom ? (paginaConfirmada ? 0.92 : 0.78) : 0,
    },
    mercado: {
      checado: !!(avMercado && !avMercado.sem_dados),
      aprovar: avMercado ? avMercado.aprovar !== false : !c.reprovado_mercado,
      ref_preco: refMercadoPreco || null,
      ref_loja: refMercadoLoja,
      origem: 'zoom_amazon',
      confianca: (avMercado && !avMercado.sem_dados) || refMercadoPreco > 0 ? 0.88 : 0,
    },
    historico: {
      selo: seloNormalizado,
      selo_bruto: seloBruto,
      pontos: histPontos,
      queda_recente: !!(quedaRecente && quedaRecente.queda_verificada),
      origem: 'bfx_precos',
      confianca: (seloNormalizado && seloNormalizado !== 'sem_ref') ? 0.95 : ((quedaRecente && quedaRecente.queda_verificada) ? 0.85 : 0.3),
    },
  };

  return {
    ts_contexto: agora,
    produto_info: prodInfo,
    loja_info: {
      id: lojaId,
      nome: nomeLoja(lojaId),
      oficial_1p: oficial1P,
      curada_kpop: kpopCurada,
      monetizada,
    },
    economia_info: {
      preco_atual: precoAtual,
      preco_de: precoDe,
      preco_sem_cupom: precoSemCupom,
      desconto_real_pct: descontoRealPct,
      economia_reais: economiaReais,
      fonte_referencia: fonteReferencia,
      parcelamento: String(c.parcelamento || man.parcelamento || ''),
      pix: !!(c.pix || man.pix),
      recorrencia: !!(c.recorrencia || man.recorrencia),
      recorrencia_preco: Number(c.recorrencia_preco || man.recorrencia_preco) || null,
      frete_gratis: !!(c.frete_gratis || man.frete_gratis),
      queda_recente: quedaRecente,
      ref_mercado: refMercadoPreco || null,
      ref_mercado_loja: refMercadoLoja,
    },
    cupom_info: sinais.cupom,
    demanda_info: {
      pedido_membro: !!(c.pedido_comunidade || man.pedido_comunidade || totalAlertasMatch > 0),
      total_alertas_match: totalAlertasMatch,
      termos_alerta: alertasMatches.map((a) => a.termo).slice(0, 5),
      campanha: String(c.campanha || man.campanha || ''),
      destaque_comunidade: !!(c.destaque || Number(c.curtidas) >= 25),
      curtidas: Number(c.curtidas) || 0,
      comentarios: Number(c.comentarios) || 0,
    },
    publicacao_info: {
      eh_atualizacao: !!(c.eh_atualizacao || man.repost_de || (opts.repeticao && opts.repeticao.eh_atualizacao)),
      motivo_repost: String(c.motivo_repost || man.motivo_repost || (opts.repeticao && opts.repeticao.motivo_repost) || ''),
      bloquear_repeticao: !!(opts.repeticao && opts.repeticao.bloquear),
      motivo_repeticao: String((opts.repeticao && opts.repeticao.motivo) || ''),
      fadiga_recente: !!opts.fadigaRecente,
    },
    qualidade_dados: {
      pagina_confirmada: paginaConfirmada,
      imagem_valida: imagemValida,
      eh_cupom_loja: !!(c.eh_cupom_loja || man.eh_cupom_loja),
      sinais,
    },
  };
}

/* ---------- 4. Motor de Decisão Multicritério Explicável (9 Dimensões) ---------- */

const PESOS_DIMENSOES = {
  qualidade_economica: 0.24,
  confiabilidade_dados: 0.18,
  relevancia_comercial: 0.12,
  interesse_demonstrado: 0.10,
  competitividade: 0.10,
  atualidade: 0.07,
  novidade: 0.07,
  potencial_conversao: 0.07,
  qualidade_fonte: 0.05,
};

function clampScore(n) {
  return Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
}

/**
 * Avalia uma oportunidade em 9 dimensões explicáveis (0 a 100), aplicando guardrails
 * contra falsos descontos ("metade do dobro", falta de confirmação, preço acima do histórico)
 * e produzindo justificativa completa de aprovação ou descarte.
 */
function avaliarOportunidadeInteligente(ctxOuCand, cfg, opcoes) {
  const ctx = (ctxOuCand && ctxOuCand.produto_info && ctxOuCand.economia_info)
    ? ctxOuCand
    : construirContextoOferta(ctxOuCand, Object.assign({ cfg }, opcoes));

  const econ = ctx.economia_info;
  const prod = ctx.produto_info;
  const loja = ctx.loja_info;
  const cup = ctx.cupom_info;
  const dem = ctx.demanda_info;
  const pub = ctx.publicacao_info;
  const qual = ctx.qualidade_dados;
  const sinais = qual.sinais;

  const motivosAprovacao = [];
  const motivosReprovacao = [];

  // Caso especial: Anúncio de lote/cupom geral de loja (/cupom ou radar de cupons)
  if (qual.eh_cupom_loja) {
    return {
      aprovar: true,
      pontuacao: 85,
      classificacao: 'muito_forte',
      tipo_oportunidade: 'lote_cupom_loja',
      prioridade_fila: 'cupom_curto',
      recomendacao_topo: true,
      dimensoes: {
        qualidade_economica: 85,
        confiabilidade_dados: 85,
        relevancia_comercial: 88,
        interesse_demonstrado: 82,
        competitividade: 80,
        atualidade: 95,
        novidade: 90,
        potencial_conversao: loja.monetizada ? 92 : 75,
        qualidade_fonte: 85,
      },
      argumentos_comerciais: ['Cupom de loja com janela curta de resgate'],
      motivos_aprovacao: ['Lote ou cupom de loja verificado'],
      motivos_reprovacao: [],
      resumo_explicavel: `Cupom/lote ${loja.nome} aprovado (85/100)`,
    };
  }

  // 1) Qualidade Econômica (0..100)
  let scEconomica = 25;
  const pct = econ.desconto_real_pct;
  const reais = econ.economia_reais;
  if (sinais.historico.selo === 'abaixo') {
    scEconomica = 82 + Math.min(18, pct);
    motivosAprovacao.push(`Abaixo do menor preço de 90 dias (-${pct}% / -${formatBRL(reais)})`);
  } else if (sinais.historico.selo === 'igual') {
    scEconomica = 76;
    motivosAprovacao.push('Empatado no menor preço de 90 dias');
  } else if (sinais.historico.queda_recente) {
    scEconomica = 70 + Math.min(25, (econ.queda_recente.desconto_pct || pct));
    motivosAprovacao.push(`Queda real no histórico recente (-${econ.queda_recente.desconto_pct}% vs coletas anteriores)`);
  } else if (pct >= 35) {
    scEconomica = 84 + Math.min(14, Math.floor((pct - 35) / 2));
  } else if (pct >= 20) {
    scEconomica = 68 + Math.round((pct - 20) * 1.0);
  } else if (pct >= 10) {
    scEconomica = 52 + Math.round((pct - 10) * 1.5);
  } else if (pct >= 5 && (cup.ativo || dem.pedido_membro)) {
    scEconomica = 50 + pct;
  }
  if (reais >= 150) scEconomica += 8;
  else if (reais >= 50) scEconomica += 5;
  if (prod.custo_unitario && prod.qtd_unidades >= 2) scEconomica += 4;
  scEconomica = clampScore(scEconomica);

  // 2) Confiabilidade dos Dados (0..100)
  let scConfiabilidade = 45;
  if (qual.pagina_confirmada) scConfiabilidade += 22;
  if (loja.oficial_1p || loja.curada_kpop) scConfiabilidade += 14;
  if (qual.imagem_valida) scConfiabilidade += 8;
  if (sinais.historico.selo === 'abaixo' || sinais.historico.selo === 'igual') scConfiabilidade += 15;
  else if (sinais.historico.queda_recente) scConfiabilidade += 12;
  if (sinais.mercado.checado && sinais.mercado.aprovar && econ.ref_mercado) scConfiabilidade += 12;

  // Penalização de "metade do dobro" não corroborado por mercado ou histórico
  const descontoNominalSuspeito = pct >= 80
    && sinais.historico.selo !== 'abaixo'
    && !sinais.historico.queda_recente
    && !(econ.ref_mercado && econ.ref_mercado >= econ.preco_atual * 1.5);
  if (descontoNominalSuspeito) {
    scConfiabilidade = Math.min(scConfiabilidade, 22);
    motivosReprovacao.push(`Desconto nominal suspeito (${pct}%) sem confirmação de histórico ou mercado`);
  }
  if (!(econ.preco_atual > 0)) {
    scConfiabilidade = 0;
    motivosReprovacao.push('Preço atual ausente ou inválido');
  }
  scConfiabilidade = clampScore(scConfiabilidade);

  // 3) Relevância Comercial (0..100)
  let scRelevancia = 52 + prod.marca_peso;
  if (prod.especificacoes.length >= 2) scRelevancia += 8;
  if (econ.preco_atual >= 35 && econ.preco_atual <= 2500) scRelevancia += 8;
  if (prod.natureza === 'consumivel_estoque' || prod.natureza === 'duravel_upgrade' || prod.natureza === 'colecionavel_desejo') {
    scRelevancia += 6;
  }
  scRelevancia = clampScore(scRelevancia);

  // 4) Interesse Demonstrado / Demanda (0..100)
  let scInteresse = 45;
  if (dem.pedido_membro) {
    scInteresse += 38 + Math.min(17, dem.total_alertas_match * 5);
    motivosAprovacao.push(`Atende alerta ativo de membro${dem.total_alertas_match > 1 ? ` (${dem.total_alertas_match} alertas)` : ''}`);
  }
  if (dem.destaque_comunidade) {
    scInteresse += 20;
    motivosAprovacao.push('Alto engajamento e validação na comunidade');
  } else if (dem.curtidas >= 10) {
    scInteresse += 10;
  }
  scInteresse = clampScore(scInteresse);

  // 5) Competitividade entre Lojas (0..100)
  let scCompetitividade = 58;
  if (!sinais.mercado.aprovar) {
    scCompetitividade = 10;
    motivosReprovacao.push('Preço acima da concorrência na auditoria de mercado (Zoom/Amazon)');
  } else if (econ.ref_mercado && econ.ref_mercado > econ.preco_atual) {
    const pctMerc = Math.round(((econ.ref_mercado - econ.preco_atual) / econ.ref_mercado) * 100);
    scCompetitividade = clampScore(68 + Math.min(32, pctMerc * 1.4));
    if (pctMerc >= 8) {
      motivosAprovacao.push(`${pctMerc}% mais barato que na concorrência (${econ.ref_mercado_loja || 'mercado'}: ${formatBRL(econ.ref_mercado)})`);
    }
  } else if (loja.oficial_1p || loja.curada_kpop) {
    scCompetitividade = 64;
  }

  // 6) Atualidade (0..100)
  let scAtualidade = qual.pagina_confirmada ? 88 : 70;
  if (dem.campanha) scAtualidade += 8;
  if (cup.ativo) scAtualidade += 4;
  scAtualidade = clampScore(scAtualidade);

  // 7) Novidade e Não-Repetição (0..100)
  let scNovidade = 82;
  if (pub.bloquear_repeticao) {
    scNovidade = 0;
    motivosReprovacao.push(`Repetida recentemente sem nova queda de preço ou cupom (${pub.motivo_repeticao || '24h/72h'})`);
  } else if (pub.eh_atualizacao) {
    scNovidade = 94;
    motivosAprovacao.push(`Atualização legítima de oferta anterior (${pub.motivo_repost || 'preço caiu ou entrou cupom'})`);
  } else if (pub.fadiga_recente) {
    scNovidade = 42;
  }

  // 8) Potencial de Conversão (0..100)
  let scConversao = 50;
  if (loja.monetizada) scConversao += 18;
  if (cup.ativo) {
    scConversao += 12;
    motivosAprovacao.push(cup.codigo ? `Cupom ativo (${cup.codigo})` : `Desconto automático no anúncio (${cup.cupom_auto})`);
  }
  if (econ.pix) scConversao += 6;
  if (econ.parcelamento && /sem\s+juros/i.test(econ.parcelamento)) scConversao += 7;
  if (econ.frete_gratis) scConversao += 5;
  if (qual.imagem_valida) scConversao += 5;
  scConversao = clampScore(scConversao);

  // 9) Qualidade da Fonte (0..100)
  let scFonte = 60;
  if (qual.pagina_confirmada && loja.oficial_1p) scFonte = 92;
  else if (qual.pagina_confirmada) scFonte = 84;
  else if (loja.curada_kpop) scFonte = 85;
  else if (loja.oficial_1p) scFonte = 74;

  const dimensoes = {
    qualidade_economica: scEconomica,
    confiabilidade_dados: scConfiabilidade,
    relevancia_comercial: scRelevancia,
    interesse_demonstrado: scInteresse,
    competitividade: scCompetitividade,
    atualidade: scAtualidade,
    novidade: scNovidade,
    potencial_conversao: scConversao,
    qualidade_fonte: scFonte,
  };

  let pontuacao = 0;
  for (const [dim, peso] of Object.entries(PESOS_DIMENSOES)) {
    pontuacao += (dimensoes[dim] || 0) * peso;
  }
  pontuacao = clampScore(pontuacao);

  // Guardrails estritos de integridade
  if (sinais.historico.selo === 'acima') {
    motivosReprovacao.push('Preço atual acima do menor valor registrado nos últimos 90 dias');
  }
  const temProvaEconomia = sinais.historico.selo === 'abaixo'
    || sinais.historico.selo === 'igual'
    || sinais.historico.selo === 'curto'
    || sinais.historico.queda_recente
    || cup.ativo
    || pub.eh_atualizacao
    || loja.curada_kpop
    || (econ.ref_mercado && econ.ref_mercado >= econ.preco_atual * 1.08)
    || (pct >= 8 && (dem.pedido_membro || dem.destaque_comunidade))
    || pct >= Math.max(10, Number((cfg && cfg['radar.min_desconto_pct']) || 15));

  if (!temProvaEconomia) {
    motivosReprovacao.push('Sem prova suficiente de economia real (histórico, mercado, cupom ou desconto mínimo)');
  }

  const aprovar = motivosReprovacao.length === 0
    && scConfiabilidade >= 35
    && econ.preco_atual > 0
    && !pub.bloquear_repeticao
    && sinais.mercado.aprovar
    && sinais.historico.selo !== 'acima';

  if (aprovar && !motivosAprovacao.length) {
    motivosAprovacao.push(`Desconto verificado de ${pct}% em ${loja.nome}`);
  }

  let classificacao = 'fraca';
  if (pontuacao >= 82) classificacao = 'imperdivel';
  else if (pontuacao >= 70) classificacao = 'muito_forte';
  else if (pontuacao >= 55) classificacao = 'boa_oportunidade';
  else if (pontuacao >= 42) classificacao = 'regular';

  let prioridadeFila = 'regular';
  if (sinais.historico.selo === 'abaixo' && pct >= 35) prioridadeFila = 'relampago';
  else if (pct >= 35 || (pub.eh_atualizacao && pct >= 20)) prioridadeFila = 'queda_expressiva';
  else if (cup.ativo && (pct >= 15 || econ.economia_reais >= 30)) prioridadeFila = 'cupom_curto';
  else if (dem.pedido_membro || dem.destaque_comunidade) prioridadeFila = 'alta_demanda';
  else if (pontuacao >= 72) prioridadeFila = 'alta_qualidade';

  const recomendacaoTopo = aprovar && (
    pontuacao >= 76
    || pct >= 35
    || (cup.ativo && pct >= 25)
    || (sinais.historico.selo === 'abaixo' && pct >= 20)
  );

  const argumentos = [prod.melhor_argumento];
  if (prod.resumo_unidade) argumentos.push(`Custo proporcional: ${prod.resumo_unidade}`);
  if (econ.parcelamento && /sem\s+juros/i.test(econ.parcelamento)) argumentos.push(econ.parcelamento);
  if (econ.pix) argumentos.push('Desconto à vista no Pix');

  return {
    aprovar,
    pontuacao,
    classificacao,
    tipo_oportunidade: prod.tipo_melhoria,
    prioridade_fila: prioridadeFila,
    recomendacao_topo: recomendacaoTopo,
    dimensoes,
    argumentos_comerciais: argumentos,
    motivos_aprovacao: motivosAprovacao,
    motivos_reprovacao: motivosReprovacao,
    resumo_explicavel: aprovar
      ? `Aprovada (${pontuacao}/100 · ${classificacao}): ${motivosAprovacao.slice(0, 2).join(' + ')}`
      : `Reprovada (${pontuacao}/100): ${motivosReprovacao[0] || 'critério mínimo não atingido'}`,
  };
}

/* ---------- 5. Telemetria de Funil de Candidatos ---------- */

/**
 * Consolida os estágios do funil de descoberta → extração → auditoria → aprovação → publicação.
 */
function construirRelatorioFunil(dados) {
  const d = dados || {};
  const reprovacoesPorMotivo = Object.assign({}, d.reprovacoes_por_motivo || {});
  const totalReprovados = Number(d.reprovado != null
    ? d.reprovado
    : Object.values(reprovacoesPorMotivo).reduce((acc, v) => acc + (Number(v) || 0), 0));

  return {
    encontrado: Number(d.encontrado) || 0,
    extraido: Number(d.extraido) || 0,
    dados_incompletos: Number(d.dados_incompletos) || 0,
    duplicado: Number(d.duplicado) || 0,
    em_auditoria: Number(d.em_auditoria) || 0,
    aprovado: Number(d.aprovado) || 0,
    reprovado: totalReprovados,
    reprovacoes_por_motivo: reprovacoesPorMotivo,
    aguardando_publicacao: Number(d.aguardando_publicacao) || 0,
    publicado: Number(d.publicado) || 0,
    falha_publicacao: Number(d.falha_publicacao) || 0,
    taxa_aprovacao_pct: (Number(d.em_auditoria) > 0)
      ? round2(((Number(d.aprovado) || 0) / Number(d.em_auditoria)) * 100)
      : 0,
  };
}

/* ---------- 6. Aprendizado Contínuo Baseado em Dados Reais ---------- */

/**
 * Analisa o histórico operacional (`bfx_ofertas`, `bfx_posts`, `bfx_alertas`, `bfx_entradas`)
 * para identificar categorias, lojas, horários e tipos de oportunidades de maior resultado,
 * respeitando tamanho mínimo de amostra para evitar conclusões falsas.
 */
function analisarAprendizadoHistorico(dados, cfg, agora) {
  const d = dados || {};
  const tsAgora = Number(agora) || Date.now();
  const janela7d = tsAgora - 7 * DIA_MS;
  const MIN_AMOSTRA = 3;

  const ofertas = (d.ofertas || []).filter((o) => o && Number(o.ts) >= janela7d);
  const posts = (d.posts || []).filter((p) => p && Number(p.ts) >= janela7d);
  const alertas = (d.alertas || []).filter((a) => a && a.ativo !== false && String(a.ativo || '').toLowerCase() !== 'nao' && a.termo);
  const entradas = (d.entradas || []).filter((e) => e && Number(e.ts) >= janela7d && (e.tipo === 'entrada' || e.tipo === 'entrou'));

  const postsPorOferta = new Set(posts.filter((p) => p.message_id).map((p) => String(p.oferta_id)));

  const porCategoria = {};
  const porLoja = {};
  const porHora = {};

  for (const o of ofertas) {
    const cat = String(o.categoria || 'casa');
    const loja = String(o.loja || 'outra');
    const aprovada = o.status === 'aprovada' || o.status === 'encerrada';
    const publicada = postsPorOferta.has(String(o.oferta_id));
    const man = lerManuaisSeguro(o.links_manuais);
    const econ = resumoEconomia(Object.assign({}, o, { links_manuais: man }), true);
    const pct = econ ? econ.pct : (Number(o.desconto_pct) || 0);

    if (!porCategoria[cat]) porCategoria[cat] = { total: 0, aprovadas: 0, publicadas: 0, soma_desconto: 0, entradas: 0, alertas: 0 };
    porCategoria[cat].total++;
    if (aprovada) porCategoria[cat].aprovadas++;
    if (publicada) porCategoria[cat].publicadas++;
    if (pct > 0) porCategoria[cat].soma_desconto += pct;

    if (!porLoja[loja]) porLoja[loja] = { total: 0, aprovadas: 0, publicadas: 0, soma_desconto: 0 };
    porLoja[loja].total++;
    if (aprovada) porLoja[loja].aprovadas++;
    if (publicada) porLoja[loja].publicadas++;
    if (pct > 0) porLoja[loja].soma_desconto += pct;

    if (aprovada && Number.isFinite(Number(o.ts))) {
      const h = new Date(Number(o.ts) - 3 * HORA_MS).getUTCHours();
      porHora[h] = (porHora[h] || 0) + 1;
    }
  }

  for (const e of entradas) {
    const nome = String(e.convite_nome || '').toLowerCase();
    for (const cat of Object.keys(porCategoria)) {
      if (nome.includes(cat)) porCategoria[cat].entradas++;
    }
  }

  // Demanda reprimida: alertas de membros sem oferta aprovada recente
  const demandaTermos = {};
  for (const a of alertas) {
    const t = slug(a.termo).replace(/-/g, ' ').trim();
    if (!t || t.length < 2) continue;
    if (!demandaTermos[t]) demandaTermos[t] = { termo: a.termo, pedidos: 0, atendidos_7d: 0 };
    demandaTermos[t].pedidos++;
  }
  const titulosAprovados = ofertas
    .filter((o) => o.status === 'aprovada' || o.status === 'encerrada')
    .map((o) => ({ raw: String(o.titulo || ''), norm: slug(o.titulo || '').replace(/-/g, ' ') }));
  for (const [tNorm, info] of Object.entries(demandaTermos)) {
    info.atendidos_7d = titulosAprovados.filter((tit) => tit.norm.includes(tNorm) || bateTermoComSinonimos(tit.raw, info.termo)).length;
  }

  const categoriasRanking = Object.entries(porCategoria)
    .filter(([, v]) => v.total >= MIN_AMOSTRA)
    .map(([cat, v]) => ({
      categoria: cat,
      total: v.total,
      aprovadas: v.aprovadas,
      publicadas: v.publicadas,
      desconto_medio_pct: v.aprovadas > 0 ? Math.round(v.soma_desconto / v.aprovadas) : 0,
      taxa_aprovacao_pct: round2((v.aprovadas / v.total) * 100),
      entradas: v.entradas,
    }))
    .sort((a, b) => (b.publicadas * 2 + b.entradas * 5) - (a.publicadas * 2 + a.entradas * 5));

  const lojasRanking = Object.entries(porLoja)
    .filter(([, v]) => v.total >= MIN_AMOSTRA)
    .map(([loja, v]) => ({
      loja,
      nome: nomeLoja(loja),
      total: v.total,
      aprovadas: v.aprovadas,
      publicadas: v.publicadas,
      desconto_medio_pct: v.aprovadas > 0 ? Math.round(v.soma_desconto / v.aprovadas) : 0,
      taxa_aprovacao_pct: round2((v.aprovadas / v.total) * 100),
    }))
    .sort((a, b) => b.aprovadas - a.aprovadas);

  const melhoresHorarios = Object.entries(porHora)
    .map(([h, qtd]) => ({ hora: Number(h), aprovadas: qtd }))
    .sort((a, b) => b.aprovadas - a.aprovadas)
    .slice(0, 5);

  const demandaReprimida = Object.values(demandaTermos)
    .filter((x) => x.atendidos_7d === 0)
    .sort((a, b) => b.pedidos - a.pedidos)
    .slice(0, 8);

  return {
    amostra_suficiente: ofertas.length >= MIN_AMOSTRA,
    total_ofertas_7d: ofertas.length,
    total_posts_7d: posts.length,
    categorias_ranking: categoriasRanking,
    lojas_ranking: lojasRanking,
    melhores_horarios: melhoresHorarios,
    demanda_reprimida: demandaReprimida,
  };
}

/* ---------- 7. Autocura Operacional (Self-Healing) ---------- */

/**
 * Diagnostica anomalias operacionais (radar parado, bloqueio de fonte, queda brusca de volume,
 * ofertas aprovadas sem post por falha da Bot API, fila travada) e gera ações seguras de recuperação.
 */
function diagnosticarAutocura(dados, cfg, agora) {
  const d = dados || {};
  const c = cfg || {};
  const tsAgora = Number(agora) || Date.now();
  const problemas = [];
  const acoesAutocura = [];

  const ofertas = Array.isArray(d.ofertas) ? d.ofertas : [];
  const posts = Array.isArray(d.posts) ? d.posts : [];
  const memoria = d.memoria || {};

  // 1) Detectar ofertas "aprovada" ou "publicando" recentes que ficaram órfãs sem post no Telegram
  const postsIds = new Set(posts.filter((p) => p && p.message_id).map((p) => String(p.oferta_id)));
  const corteOrfasMin = tsAgora - 15 * 60 * 1000; // há mais de 15 min
  const corteOrfasMax = tsAgora - 24 * HORA_MS;   // nas últimas 24h
  const orfasSemPost = ofertas.filter((o) => {
    if (!o || !o.oferta_id) return false;
    const ts = Number(o.ts) || 0;
    if (ts < corteOrfasMax || ts > corteOrfasMin) return false;
    if (o.status !== 'aprovada' && o.status !== 'publicando') return false;
    return !postsIds.has(String(o.oferta_id));
  });

  if (orfasSemPost.length > 0) {
    problemas.push({
      codigo: 'ofertas_sem_entrega_confirmada',
      severidade: 'alta',
      mensagem: `${orfasSemPost.length} oferta(s) aprovada(s) nas últimas 24h sem confirmação de message_id em bfx_posts.`,
      oferta_ids: orfasSemPost.map((o) => o.oferta_id).slice(0, 10),
    });
    acoesAutocura.push({
      acao: 'liberar_repost_orfas',
      descricao: 'Permite reprocessamento seguro das ofertas cujo envio expirou sem message_id confirmado.',
      oferta_ids: orfasSemPost.map((o) => o.oferta_id).slice(0, 10),
    });
  }

  // 2) Detectar saturação ou falso-positivo em radar_descartes (suporta tanto objeto/mapa de produção quanto array)
  const rawDescartes = memoria.radar_descartes;
  const descartes = Array.isArray(rawDescartes)
    ? rawDescartes
    : (rawDescartes && typeof rawDescartes === 'object' ? Object.values(rawDescartes) : []);
  if (descartes.length >= 50) {
    const porMotivo = {};
    for (const item of descartes) {
      const m = (item && item.motivo) || 'outro';
      porMotivo[m] = (porMotivo[m] || 0) + 1;
    }
    const reprovMerc = porMotivo.reprovado_mercado || 0;
    const taxaMerc = reprovMerc / descartes.length;
    if (taxaMerc >= 0.80) {
      problemas.push({
        codigo: 'descarte_mercado_excessivo',
        severidade: 'alta',
        mensagem: `${Math.round(taxaMerc * 100)}% dos descartes recentes (${reprovMerc}/${descartes.length}) vieram de reprovado_mercado.`,
      });
      acoesAutocura.push({
        acao: 'expurgar_descartes_mercado_antigos',
        descricao: 'Reduz TTL de descartes de mercado para reavaliar candidatos com a calibração de concorrentes.',
      });
    }
  }

  // 3) Detectar bloqueio temporário 429 do Promobit
  const pbBloqAte = Number(memoria.pb_redir_bloqueado_ate) || 0;
  if (pbBloqAte > tsAgora) {
    const minRest = Math.ceil((pbBloqAte - tsAgora) / 60000);
    problemas.push({
      codigo: 'promobit_redir_429',
      severidade: 'media',
      mensagem: `Redirecionador Promobit em cooldown anti-429 por mais ${minRest} min (fontes diretas e canais curados seguem ativos).`,
    });
  }

  // 4) Detectar radar parado em horário comercial (8h–23h BRT)
  const horaBrt = new Date(tsAgora - 3 * HORA_MS).getUTCHours();
  const radarAtivoCfg = String(c['radar.ativo'] || 'sim') !== 'nao';
  if (radarAtivoCfg && horaBrt >= 9 && horaBrt <= 22 && ofertas.length > 0) {
    const ultimoTs = Math.max(...ofertas.map((o) => Number(o.ts) || 0));
    const minSemOferta = Math.floor((tsAgora - ultimoTs) / 60000);
    if (ultimoTs > 0 && minSemOferta >= 90) {
      problemas.push({
        codigo: 'radar_sem_novas_ofertas',
        severidade: 'alta',
        mensagem: `Nenhuma oferta registrada há ${minSemOferta} minutos com radar ativo em horário comercial.`,
      });
      acoesAutocura.push({
        acao: 'limpar_cache_descartes_transientes',
        descricao: 'Limpa descartes transientes (sem_prova_de_desconto) para destravar novas coletas.',
      });
    }
  }

  return {
    saudavel: problemas.length === 0,
    ts_diagnostico: tsAgora,
    problemas,
    acoes_autocura: acoesAutocura,
  };
}

/**
 * Executa autocura segura sobre o cache `radar_descartes` (objeto `{ [chave]: { ts, preco, motivo } }`)
 * quando detectada saturação anormal de descartes de mercado (>= 80% com >= 50 itens), reduzindo o TTL
 * de `reprovado_mercado` para 30 min e de `sem_prova_de_desconto` para 60 min sem loop destrutivo.
 */
function aplicarAutocuraDescartesRadar(memoriaDescartes, agora) {
  if (!memoriaDescartes || typeof memoriaDescartes !== 'object' || Array.isArray(memoriaDescartes)) {
    return { curado: false, removidos: 0, memoria: memoriaDescartes || {} };
  }
  const tsAgora = Number(agora) || Date.now();
  const entradas = Object.entries(memoriaDescartes);
  if (entradas.length < 50) {
    return { curado: false, removidos: 0, memoria: memoriaDescartes };
  }
  let reprovMerc = 0;
  for (const [, v] of entradas) {
    if (v && v.motivo === 'reprovado_mercado') reprovMerc++;
  }
  if (reprovMerc / entradas.length < 0.80) {
    return { curado: false, removidos: 0, memoria: memoriaDescartes };
  }
  const novaMemoria = {};
  let removidos = 0;
  for (const [k, v] of entradas) {
    if (!v) continue;
    const idade = tsAgora - (Number(v.ts) || 0);
    if (v.motivo === 'reprovado_mercado' && idade > 30 * 60 * 1000) {
      removidos++;
      continue;
    }
    if (v.motivo === 'sem_prova_de_desconto' && idade > 60 * 60 * 1000) {
      removidos++;
      continue;
    }
    novaMemoria[k] = v;
  }
  return { curado: removidos > 0, removidos, memoria: novaMemoria };
}

module.exports = {
  MARCAS_CONHECIDAS,
  LOJAS_1P_OFICIAIS,
  PESOS_DIMENSOES,
  extrairMetricasUnidade,
  extrairEspecificacoesProduto,
  entenderProdutoOferta,
  avaliarQuedaHistoricoRecente,
  construirContextoOferta,
  avaliarOportunidadeInteligente,
  construirRelatorioFunil,
  analisarAprendizadoHistorico,
  diagnosticarAutocura,
  aplicarAutocuraDescartesRadar,
};
