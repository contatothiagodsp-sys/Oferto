'use strict';
// Copywriting automático e gratuito para Telegram e Grupo de WhatsApp:
// · ganchos persuasivos variados por faixa de queda, cupom ou categoria (sem urgência falsa)
// · destaque visual "De/Por" e economia real em R$ quando há referência anterior
// · link direto 1-toque para abrir o texto já preenchido no WhatsApp (api.whatsapp.com/send).
const { round2, formatBRL } = require('./util');

const GANCHOS_QUEDA_FORTE = [
  '🔥 PREÇO DESPENCOU',
  '💥 CAIU MUITO',
  '📉 QUEBRA DE PREÇO',
  '⚡ BATEU LÁ EMBAIXO',
  '🚨 QUEDA FORTE',
  '💣 PREÇO NO CHÃO',
  '🏷️ DESCONTAÇO REAL',
  '🎯 QUEDA BRUSCA',
  '✨ SUPER DESCONTO',
  '💸 ECONOMIA PESADA',
];

const GANCHOS_QUEDA_BOA = [
  '🎯 ACHADO DO DIA',
  '🔥 BAIXOU DE VERDADE',
  '✨ VALENDO HOJE',
  '📉 CAIU LEGAL',
  '👀 OLHO NESSE PREÇO',
  '💡 COMPRA INTELIGENTE',
  '🛒 PRECINHO JUSTO',
  '🏷️ OPORTUNIDADE BOA',
  '✅ VALE A PENA',
  '⚡ GARIMPO CERTEIRO',
];

const GANCHOS_HISTORICO = [
  '🏆 ABAIXO DO HISTÓRICO',
  '📉 PREÇO LÁ EMBAIXO',
  '✅ MENOR PATAMAR',
  '🥇 RECORDE DE PREÇO',
  '📊 MELHOR VALOR RECENTE',
  '💎 RARIDADE NO HISTÓRICO',
  '🔎 NO MENOR PREÇO',
  '📌 ABAIXO DO NORMAL',
];

const GANCHOS_IGUAL_MINIMO = [
  '🎯 MENOR PATAMAR',
  '👀 VOLTOU AO MÍNIMO',
  '📍 MÍNIMA HISTÓRICA',
  '⚖️ MELHOR PREÇO',
  '🔎 NO PISO DE PREÇO',
  '✅ MELHOR VALOR DA LOJA',
  '📌 MENOR NÍVEL',
  '✨ PREÇO CONFERIDO',
];

const GANCHOS_COM_CUPOM = [
  '🎟️ COM CUPOM ESPECIAL',
  '💸 BAIXOU COM CUPOM',
  '✂️ CUPOM ATIVO',
  '🏷️ OFERTA + CUPOM',
  '⚡ COM CUPOM NA LOJA',
  '🔥 CUPOM NA ÁREA',
  '🎯 BAIXOU NO CUPOM',
  '💡 CUPOM LIBERADO',
  '🛍️ ECONOMIA NO CUPOM',
  '✅ CUPOM CONFERIDO',
];

const GANCHOS_EXPLODINDO = [
  '🚨 BOMBANDO AGORA',
  '🔥 EM ALTA NO BRASIL',
  '📈 FEBRE DE BUSCAS',
  '🚀 DISPAROU ENTRE OS MAIS PROCURADOS',
  '⭐ SUCESSO DE CLIQUES',
  '👀 TODO MUNDO PROCURANDO',
  '🏆 QUERIDINHO DO MOMENTO',
  '🔥 HIT DO DIA',
];

const GANCHOS_EM_ALTA = [
  '📈 PRODUTO EM ALTA',
  '👀 SUPER PROCURADO',
  '🔍 DESTAQUE NAS BUSCAS',
  '⭐ SUBINDO NO RADAR',
  '🔥 EM ALTA HOJE',
  '🎯 TENDÊNCIA DO DIA',
];

const GANCHOS_ARABE = [
  '🕌 PERFUME ÁRABE',
  '🔥 PERFUMARIA ÁRABE',
  '✨ FRAGRÂNCIA ÁRABE',
  '👑 PERFUME ÁRABE EM ALTA',
];

const GANCHOS_NICHO = [
  '💎 PERFUME DE NICHO',
  '✨ ALTA PERFUMARIA',
  '🥂 NICHO EM OFERTA',
  '🎩 FRAGRÂNCIA DE NICHO',
];

const GANCHOS_SAUDE = [
  '💊 SAÚDE & SUPLEMENTOS',
  '💪 TREINO NO PRECINHO',
  '🩺 FARMÁCIA OFICIAL',
  '⚡ SUPLEMENTO CONFERIDO',
];

const GANCHOS_MODA = [
  '👗 ACHADO DE MODA',
  '👟 TÊNIS NO PRECINHO',
  '✨ LOOK TENDÊNCIA',
  '🔥 MODA EM ALTA',
  '🛍️ GARIMPO ESTILOSO',
  '🧢 STREETWEAR NO PREÇO',
];

const GANCHOS_SEM_PRECO = [
  '🔎 PREÇO CONFERIDO',
  '👀 DESTAQUE NA LOJA',
  '📌 ACHADO VERIFICADO',
  '✨ CONFERIDO NA LOJA',
];

const RE_PERFUME_ARABE = /\b(?:lattafa|asad|fakhar|khamrah|yara|afnan|9pm|club de nuit|armaf|al haramain|amber oud|detour noir|rasasi|hawas|al wataniah|sabah al ward|durrat al aroos|maison alhambra|orientica|royal amber|bharara|french avenue|liquid brun|paris corner|zimaya|swiss arabian|turathi|perfume [áa]rabe)\b/i;
const RE_PERFUME_NICHO = /\b(?:parfums de marly|layton|delina|althair|creed|aventus|nishane|hacivat|xerjoff|naxos|erba pura|mancera|cedrat boise|montale|initio|amouage|tom ford|oud wood|tobacco vanille|baccarat rouge|kurkdjian|le labo|santal 33|byredo|acqua di parma|perfume de nicho)\b/i;

const GANCHOS_CATEGORIA = {
  casa: [
    '🏠 ACHADO PRA CASA',
    '✨ CASA & COZINHA',
    '🍳 ELETRO NO PRECINHO',
    '🛋️ CONFORTO NO LAR',
  ],
  tech: [
    '💻 ACHADO TECH',
    '⚡ UPGRADE NO PREÇO',
    '🎧 DESTAQUE TECH',
    '🎮 GAMER NO PRECINHO',
  ],
  moda: GANCHOS_MODA,
  beleza: [
    '💄 BELEZA & SKINCARE',
    '✨ AUTOCUIDADO HOJE',
    '💖 QUERIDINHO DE BELEZA',
    '🧴 SKINCARE EM CONTA',
  ],
  perfumes: [
    '✨ PERFUME EM OFERTA',
    '💎 FRAGRÂNCIA CONFERIDA',
    '🔥 PERFUMARIA HOJE',
    '🌹 DESTAQUE EM PERFUME',
  ],
  saude: GANCHOS_SAUDE,
  bebe: [
    '👶 ECONOMIA PRO BEBÊ',
    '🍼 ACHADO FAMÍLIA',
    '💚 FRALDA NO PRECINHO',
    '🧸 CUIDADO DIÁRIO',
  ],
  geral: [
    '🔥 ACHADO DE HOJE',
    '👀 OPORTUNIDADE BOA',
    '✨ PREÇO SELECIONADO',
    '🎯 GARIMPO DO DIA',
  ],
};

function indiceDeterministico(semente, tamanho) {
  const s = String(semente || 'oferto');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h) % tamanho;
}

function lerManuaisObj(oferta) {
  if (!oferta || !oferta.links_manuais) return {};
  if (typeof oferta.links_manuais === 'object') return oferta.links_manuais;
  try { return JSON.parse(oferta.links_manuais) || {}; } catch (e) { return {}; }
}

/** Preço anterior ("De:") extraído da página ou texto compartilhado, quando maior que o preço atual. */
function precoDeLoja(oferta) {
  const atual = Number(oferta && oferta.preco);
  const m = lerManuaisObj(oferta);
  const cands = [Number(oferta && oferta.preco_de), Number(m.preco_de), Number(m.preco_sem_cupom)]
    .filter((v) => Number.isFinite(v) && v > atual);
  return cands.length ? round2(Math.max(...cands)) : null;
}

/**
 * Calcula economia em R$ e % (seja contra min90 verificado, seja contra o "De:" anunciado na loja).
 * Retorna null quando não há comparação acima do preço atual ou quando mostrar_preco = false.
 */
function resumoEconomia(oferta, mostrarPreco) {
  if (!mostrarPreco || !oferta || !Number.isFinite(Number(oferta.preco))) return null;
  const preco = Number(oferta.preco);
  const min90 = oferta.min90 != null && oferta.min90 !== '' ? Number(oferta.min90) : null;
  if (min90 != null && Number.isFinite(min90) && min90 > preco) {
    const econ = round2(min90 - preco);
    const pct = Math.floor(((min90 - preco) / min90) * 100);
    if (pct >= 1 && econ >= 1) {
      return { tipo: 'min90', de: min90, de_fmt: formatBRL(min90), economia: econ, economia_fmt: formatBRL(econ), pct };
    }
  }
  if (min90 == null) {
    const pDe = precoDeLoja(oferta);
    if (pDe && pDe > preco) {
      const econ = round2(pDe - preco);
      const pct = Math.floor(((pDe - preco) / pDe) * 100);
      if (pct >= 3 && econ >= 1) {
        return { tipo: 'loja', de: pDe, de_fmt: formatBRL(pDe), economia: econ, economia_fmt: formatBRL(econ), pct };
      }
    }
  }
  return null;
}

/**
 * Escolhe o gancho persuasivo ideal para atrair cliques sem violar regras do CONAR/CDC.
 * Retorna '' se copy.chamativa === false.
 */
function ganchoOferta(oferta, cfg, opcoes) {
  if (cfg && cfg.copy && cfg.copy.chamativa === false) return '';
  const o = oferta || {};
  const m = lerManuaisObj(o);
  const mostrarPreco = !opcoes || opcoes.mostrarPreco !== false;
  const temCupom = !!(opcoes && opcoes.cupom);
  const sementeBase = String(o.produto_id || o.oferta_id || o.titulo || 'x') + (temCupom ? '|cup' : '');

  if (!mostrarPreco) {
    return GANCHOS_SEM_PRECO[indiceDeterministico(sementeBase, GANCHOS_SEM_PRECO.length)];
  }

  const min90 = o.min90 != null && o.min90 !== '' ? Number(o.min90) : null;
  if (min90 != null && Number.isFinite(min90)) {
    const pct = Math.floor(Number(o.desconto_pct) || 0);
    if (pct <= 0) {
      // 0% (ou tolerância): nunca usar a palavra "desconto"
      return GANCHOS_IGUAL_MINIMO[indiceDeterministico(sementeBase, GANCHOS_IGUAL_MINIMO.length)];
    }
    if (m.em_alta === 'explodindo') {
      return GANCHOS_EXPLODINDO[indiceDeterministico(sementeBase, GANCHOS_EXPLODINDO.length)];
    }
    if (pct >= 30) return GANCHOS_QUEDA_FORTE[indiceDeterministico(sementeBase, GANCHOS_QUEDA_FORTE.length)];
    if (m.desejo_tipo === 'perfume_arabe' || RE_PERFUME_ARABE.test(o.titulo || '')) {
      return GANCHOS_ARABE[indiceDeterministico(sementeBase, GANCHOS_ARABE.length)];
    }
    if (m.desejo_tipo === 'perfume_nicho' || RE_PERFUME_NICHO.test(o.titulo || '')) {
      return GANCHOS_NICHO[indiceDeterministico(sementeBase, GANCHOS_NICHO.length)];
    }
    if (temCupom && pct < 20) return GANCHOS_COM_CUPOM[indiceDeterministico(sementeBase, GANCHOS_COM_CUPOM.length)];
    if (pct >= 12) return GANCHOS_QUEDA_BOA[indiceDeterministico(sementeBase, GANCHOS_QUEDA_BOA.length)];
    if (pct >= 1) return GANCHOS_HISTORICO[indiceDeterministico(sementeBase, GANCHOS_HISTORICO.length)];
    return GANCHOS_IGUAL_MINIMO[indiceDeterministico(sementeBase, GANCHOS_IGUAL_MINIMO.length)];
  }

  if (m.em_alta === 'explodindo') {
    return GANCHOS_EXPLODINDO[indiceDeterministico(sementeBase, GANCHOS_EXPLODINDO.length)];
  }
  const econ = resumoEconomia(o, mostrarPreco);
  if (econ && econ.pct >= 35) return GANCHOS_QUEDA_FORTE[indiceDeterministico(sementeBase, GANCHOS_QUEDA_FORTE.length)];
  if (m.desejo_tipo === 'perfume_arabe' || RE_PERFUME_ARABE.test(o.titulo || '')) {
    return GANCHOS_ARABE[indiceDeterministico(sementeBase, GANCHOS_ARABE.length)];
  }
  if (m.desejo_tipo === 'perfume_nicho' || RE_PERFUME_NICHO.test(o.titulo || '')) {
    return GANCHOS_NICHO[indiceDeterministico(sementeBase, GANCHOS_NICHO.length)];
  }
  if (econ && econ.tipo === 'loja') {
    if (m.desejo_tipo === 'saude_desejada') {
      return GANCHOS_SAUDE[indiceDeterministico(sementeBase, GANCHOS_SAUDE.length)];
    }
    if (econ.pct >= 30) return GANCHOS_QUEDA_FORTE[indiceDeterministico(sementeBase, GANCHOS_QUEDA_FORTE.length)];
  } else if (m.desejo_tipo === 'saude_desejada') {
    return GANCHOS_SAUDE[indiceDeterministico(sementeBase, GANCHOS_SAUDE.length)];
  }
  if (m.em_alta === 'em_alta') {
    return GANCHOS_EM_ALTA[indiceDeterministico(sementeBase, GANCHOS_EM_ALTA.length)];
  }
  if (temCupom) return GANCHOS_COM_CUPOM[indiceDeterministico(sementeBase, GANCHOS_COM_CUPOM.length)];
  if (econ && econ.pct >= 15) return GANCHOS_QUEDA_BOA[indiceDeterministico(sementeBase, GANCHOS_QUEDA_BOA.length)];

  const listaCat = GANCHOS_CATEGORIA[o.categoria] || GANCHOS_CATEGORIA.geral;
  return listaCat[indiceDeterministico(sementeBase, listaCat.length)];
}

const PRESERVAR_UPPER = new Set([
  'USB', 'SSD', 'HD', 'NVME', 'RTX', 'GTX', 'AMD', 'PS5', 'PS4', 'TV', 'TWS', 'LED', 'OLED', 'QLED', '4K', '8K', '5G',
  'AM4', 'AM5', 'DDR4', 'DDR5', 'IPS', 'RGB', 'FPS', 'UV', 'SPF', 'NFC', 'JBL', 'LG', 'HP', 'WAP', 'DXR', 'RGB', 'NBA',
]);

/**
 * Remove sufixos poluídos de SEO de marketplaces ("- Frete Grátis", "| Envio Full", "Original com NF"),
 * suaviza TÍTULOS EM CAIXA ALTA sem perder siglas/especificações e corta limpo no tamanho ideal.
 */
function enxugarTituloOferta(titulo, max) {
  let s = String(titulo || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  s = s
    .replace(/\s*(?:[-–|•]\s*)?(?:frete\s+gr[aá]tis|envio\s+(?:imediato|full|r[aá]pido)|pronta\s+entrega|em\s+estoque|original\s+com\s+nota\s+fiscal|com\s+nota\s+fiscal|12x\s+sem\s+juros|nf-?e)\b.*$/i, '')
    .replace(/\[(?:nf-?e|pronta entrega|original|lacrado|novo)\]/gi, '')
    .replace(/\((?:pronta entrega|envio imediato|lacrado|nf-?e)\)/gi, '')
    .replace(/^[★☆•🔥⚡✨🚨💥\s]+/, '')
    .replace(/[|\-–•\s]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  const letras = s.replace(/[^a-zA-ZÀ-ÿ]/g, '');
  const maiusc = s.replace(/[^A-ZÀ-Ý]/g, '');
  if (letras.length >= 12 && maiusc.length / letras.length > 0.72) {
    s = s.split(' ').map((w, idx) => {
      if (/[<>]/.test(w)) return w;
      const limpo = w.replace(/[^A-Za-zÀ-ÿ0-9]/g, '');
      const upper = limpo.toUpperCase();
      if (PRESERVAR_UPPER.has(upper) || /^\d+(?:ML|L|G|KG|MG|GB|TB|MB|W|V|HZ|CM|MM|POL|FPS)$/i.test(limpo)) {
        return w.toUpperCase();
      }
      const low = w.toLowerCase();
      if (idx > 0 && ['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'sem', 'para', 'em', 'na', 'no'].includes(low)) return low;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }).join(' ');
  }

  const lim = max || 130;
  if (s.length <= lim) return s;
  const corte = s.slice(0, lim - 1);
  const lastSp = corte.lastIndexOf(' ');
  const base = lastSp > Math.floor(lim * 0.6) ? corte.slice(0, lastSp) : corte;
  return base.trimEnd() + '…';
}

const RE_ELETRO_NAO_CONSUMIVEL = /\b(?:air\s*fryer|fritadeira|panela|forno|micro[- ]?ondas|geladeira|refrigerador|freezer|frigobar|mochila|maleta|lixeira|balde|caixa\s+(?:organizadora|t[eé]rmica)|pote|garrafa\s+t[eé]rmica|copo\s+t[eé]rmico|jarra|chaleira|pipoqueira|umidificador|climatizador|purificador|aspirador|lavadora|lava\s*e\s*seca|secadora|tanquinho|termo|cooler|termost[aá]tica)\b/i;
const RE_LIQUIDO_CONSUMIVEL = /\b(?:sab[aã]o|lava[- ]?roupas|amaciante|desinfetante|detergente|alvejante|[aá]gua\s+sanit[aá]ria|omo|ariel|downy|ype|yp[eê]|comfort|shampoo|condicionador|leite|azeite|[oó]leo|suco|refrigerante|cerveja|vinho|enxaguante|listerine)\b/i;
const RE_PESO_CONSUMIVEL = /\b(?:ra[cç][aã]o|petisco|areia\s+(?:higi[eê]nica|sanit[aá]ria)|whey|creatina|prote[ií]na|sab[aã]o|caf[eé]|arroz|feij[aã]o|a[cç][uú]car|leite|farinha|granola|aveia|pedigree|whiskas|golden|premier|f[oó]rmula|aptamil|nescau|toddy|hipercal[oó]rico)\b/i;

/**
 * Calcula preço por unidade/medida em consumíveis óbvios (fraldas, cápsulas, doses, lenços, litros de sabão, kg de ração/suplemento).
 * Retorna '' quando não se aplica (eletrônicos, eletrodomésticos, perfumes, roupas).
 */
function calcularPrecoUnitario(titulo, preco) {
  const tit = String(titulo || '').trim();
  const p = Number(preco);
  if (!tit || !Number.isFinite(p) || p <= 0) return '';

  const formatar = (qtd, minQtd, maxQtd, rotulo) => {
    if (!Number.isFinite(qtd) || qtd < minQtd || qtd > maxQtd) return '';
    const u = round2(p / qtd);
    if (u < 0.05 || u >= p * 0.9) return '';
    return `Sai a ${formatBRL(u)} ${rotulo}`;
  };

  let m;
  if ((m = tit.match(/\b(\d{1,2})\s*x\s*(\d{1,3})\s*(tiras?|fraldas?)\b/i))) {
    return formatar(Number(m[1]) * Number(m[2]), 4, 2000, 'por tira');
  }
  if ((m = tit.match(/\b(\d{2,4})\s*(tiras?|fraldas?)\b/i))) {
    return formatar(Number(m[1]), 10, 2000, 'por tira');
  }
  if ((m = tit.match(/\b(\d{1,4})\s*(c[aá]psulas?|comprimidos?|sach[eê]s?|doses?|tabletes?|pastilhas?)\b/i))) {
    const rot = /c[aá]ps/i.test(m[2]) ? 'por cápsula' : /sach/i.test(m[2]) ? 'por sachê' : /dose/i.test(m[2]) ? 'por dose' : 'por un.';
    return formatar(Number(m[1]), 10, 2000, rot);
  }
  if ((m = tit.match(/\b(\d{1,4})\s*(rolos?)\b/i))) {
    return formatar(Number(m[1]), 4, 500, 'por rolo');
  }
  if ((m = tit.match(/\b(\d{2,4})\s*(len[cç]os?|folhas?|absorventes?)\b/i))) {
    return formatar(Number(m[1]), 12, 5000, 'por un.');
  }
  if ((m = tit.match(/\b(\d{1,3})\s*(latas?|long\s*necks?|garrafas?)\b/i))) {
    return formatar(Number(m[1]), 4, 200, 'por un.');
  }
  if ((m = tit.match(/\b(?:kit|pack|c\/|com)\s*(\d{1,3})\s*(?:unidades?|unid\.?|un\.?|pe[cç]as?)\b/i))) {
    return formatar(Number(m[1]), 4, 500, 'por un.');
  }
  if (!RE_ELETRO_NAO_CONSUMIVEL.test(tit)) {
    if (RE_LIQUIDO_CONSUMIVEL.test(tit) && (m = tit.match(/\b(\d{1,2}(?:[.,]\d+)?)\s*(?:litros?|l)\b/i))) {
      return formatar(Number(m[1].replace(',', '.')), 1.5, 25, 'por litro');
    }
    if (RE_PESO_CONSUMIVEL.test(tit) && (m = tit.match(/\b(\d{1,2}(?:[.,]\d+)?)\s*kg\b/i))) {
      return formatar(Number(m[1].replace(',', '.')), 1, 35, 'por kg');
    }
  }
  return '';
}

/** Rótulo visual de intensidade do desconto quando >= 12% e mostrarPreco = true. */
function termometroOferta(oferta, econ, mostrarPreco) {
  if (!mostrarPreco || !oferta) return '';
  const pct = Math.max(Math.floor(Number(oferta.desconto_pct) || 0), (econ && econ.pct) || 0);
  if (pct >= 40) return '🔥🔥🔥 Queda histórica';
  if (pct >= 25) return '🔥🔥 Super oferta';
  if (pct >= 12) return '🔥 Bom desconto';
  return '';
}

/** URL de compartilhamento 1-toque para abrir o WhatsApp com o texto já pronto (respeita limite de 2000 bytes da Bot API). */
function urlEnviarWhatsApp(texto) {
  const t = String(texto || '').trim();
  if (!t) return '';
  const url = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(t);
  return url.length <= 2000 ? url : '';
}

/** Inline keyboard com botão de 1 toque para enviar a oferta direto no Grupo/Canal do WhatsApp. */
function tecladoEnviarWhatsApp(texto, rotulo) {
  const url = urlEnviarWhatsApp(texto);
  if (!url) return undefined;
  return { inline_keyboard: [[{ text: rotulo || '📲 Enviar no WhatsApp (1 toque)', url }]] };
}

module.exports = {
  precoDeLoja,
  resumoEconomia,
  ganchoOferta,
  enxugarTituloOferta,
  indiceDeterministico,
  calcularPrecoUnitario,
  termometroOferta,
  urlEnviarWhatsApp,
  tecladoEnviarWhatsApp,
};
