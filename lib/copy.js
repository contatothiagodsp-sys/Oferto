'use strict';
// Copywriting automático e gratuito para Telegram e Grupo de WhatsApp:
// · ganchos persuasivos variados por faixa de queda, cupom ou categoria (sem urgência falsa)
// · destaque visual "De/Por" e economia real em R$ quando há referência anterior
// · link direto 1-toque para abrir o texto já preenchido no WhatsApp (api.whatsapp.com/send).
const { round2, formatBRL } = require('./util');

const GANCHOS_QUEDA_FORTE = [
  '🔥 PREÇO DESPENCOU! Olha essa oportunidade:',
  '💥 CAIU MUITO! Vale o clique agora:',
  '📉 BAIXOU FORTE! Preço excelente hoje:',
];

const GANCHOS_QUEDA_BOA = [
  '🎯 ACHADO DO DIA! Preço muito bom:',
  '🔥 BAIXOU DE VERDADE! Olha esse valor:',
  '✨ VALENDO MUITO A PENA HOJE:',
];

const GANCHOS_HISTORICO = [
  '🏆 ABAIXO DO HISTÓRICO! Preço conferido:',
  '📉 PREÇO LÁ EMBAIXO HOJE:',
  '✅ VALENDO O CLIQUE! Preço verificado:',
];

const GANCHOS_IGUAL_MINIMO = [
  '🎯 NO MENOR PATAMAR REGISTRADO:',
  '👀 VOLTOU AO MENOR VALOR:',
];

const GANCHOS_COM_CUPOM = [
  '🎟️ PINTANDO COM CUPOM ESPECIAL:',
  '💸 PREÇO REDUZIDO COM CUPOM:',
];

const GANCHOS_EXPLODINDO = [
  '🚨 BOMBANDO AGORA! Um dos itens mais procurados hoje em promoção:',
  '🔥 EM ALTA NO BRASIL! Muita gente clicando nesse valor:',
];

const GANCHOS_EM_ALTA = [
  '📈 PRODUTO EM ALTA! Subiu nas buscas com preço excelente:',
  '👀 SUPER PROCURADO HOJE! Olha essa oportunidade:',
];

const GANCHOS_ARABE = [
  '🕌 PERFUME ÁRABE EM ALTA! Fixação elogiada no precinho:',
  '🔥 CAMPEÃO DA PERFUMARIA ÁRABE EM OFERTA:',
];

const GANCHOS_NICHO = [
  '💎 PERFUMARIA DE NICHO! Fragrância super desejada em oferta:',
  '✨ ALTA PERFUMARIA COM PREÇO CONFERIDO:',
];

const GANCHOS_SEM_PRECO = [
  '🔎 PREÇO CONFERIDO! Vale olhar agora:',
  '👀 DESTAQUE CONFERIDO NA LOJA:',
];

const RE_PERFUME_ARABE = /\b(?:lattafa|asad|fakhar|khamrah|yara|afnan|9pm|club de nuit|armaf|al haramain|amber oud|detour noir|rasasi|hawas|al wataniah|sabah al ward|durrat al aroos|maison alhambra|orientica|royal amber|bharara|french avenue|liquid brun|paris corner|zimaya|swiss arabian|turathi|perfume [áa]rabe)\b/i;
const RE_PERFUME_NICHO = /\b(?:parfums de marly|layton|delina|althair|creed|aventus|nishane|hacivat|xerjoff|naxos|erba pura|mancera|cedrat boise|montale|initio|amouage|tom ford|oud wood|tobacco vanille|baccarat rouge|kurkdjian|le labo|santal 33|byredo|acqua di parma|perfume de nicho)\b/i;

const GANCHOS_CATEGORIA = {
  casa: [
    '🏠 ACHADO PRA CASA! Praticidade que compensa:',
    '✨ SUA CASA MERECE! Olha o preço que encontramos:',
    '🍳 FACILITA A ROTINA! Vale conferir:',
  ],
  tech: [
    '💻 ACHADO TECH! Custo-benefício excelente:',
    '⚡ UPGRADE CERTEIRO! Olha essa opção:',
    '🎧 DESTAQUE EM TECNOLOGIA HOJE:',
  ],
  beleza: [
    '✨ ACHADO DE BELEZA! Ótimo até pra presentear:',
    '🎁 DESTAQUE DO DIA EM AUTOCUIDADO:',
    '💖 QUERIDINHO COM ÓTIMO PREÇO:',
  ],
  bebe: [
    '👶 ECONOMIA PRA FAMÍLIA! Vale fazer estoque:',
    '🍼 ACHADO PRA QUEM TEM PEQUENO EM CASA:',
    '🧸 CUIDADO E ECONOMIA NUM SÓ LUGAR:',
  ],
  geral: [
    '🔥 OLHA ESSE ACHADO DE HOJE:',
    '👀 OPORTUNIDADE BOA PRA APROVEITAR:',
    '✨ PREÇO SELECIONADO HOJE:',
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
  const semente = o.produto_id || o.oferta_id || o.titulo || 'x';

  if (!mostrarPreco) {
    return GANCHOS_SEM_PRECO[indiceDeterministico(semente, GANCHOS_SEM_PRECO.length)];
  }

  const min90 = o.min90 != null && o.min90 !== '' ? Number(o.min90) : null;
  if (min90 != null && Number.isFinite(min90)) {
    const pct = Math.floor(Number(o.desconto_pct) || 0);
    if (pct <= 0) {
      // 0% (ou tolerância): nunca usar a palavra "desconto"
      return GANCHOS_IGUAL_MINIMO[indiceDeterministico(semente, GANCHOS_IGUAL_MINIMO.length)];
    }
    if (m.em_alta === 'explodindo') {
      return GANCHOS_EXPLODINDO[indiceDeterministico(semente, GANCHOS_EXPLODINDO.length)];
    }
    if (pct >= 30) return GANCHOS_QUEDA_FORTE[indiceDeterministico(semente, GANCHOS_QUEDA_FORTE.length)];
    if (m.desejo_tipo === 'perfume_arabe' || RE_PERFUME_ARABE.test(o.titulo || '')) {
      return GANCHOS_ARABE[indiceDeterministico(semente, GANCHOS_ARABE.length)];
    }
    if (m.desejo_tipo === 'perfume_nicho' || RE_PERFUME_NICHO.test(o.titulo || '')) {
      return GANCHOS_NICHO[indiceDeterministico(semente, GANCHOS_NICHO.length)];
    }
    if (pct >= 12) return GANCHOS_QUEDA_BOA[indiceDeterministico(semente, GANCHOS_QUEDA_BOA.length)];
    if (pct >= 1) return GANCHOS_HISTORICO[indiceDeterministico(semente, GANCHOS_HISTORICO.length)];
    return GANCHOS_IGUAL_MINIMO[indiceDeterministico(semente, GANCHOS_IGUAL_MINIMO.length)];
  }

  if (m.em_alta === 'explodindo') {
    return GANCHOS_EXPLODINDO[indiceDeterministico(semente, GANCHOS_EXPLODINDO.length)];
  }
  const econ = resumoEconomia(o, mostrarPreco);
  if (econ && econ.pct >= 35) return GANCHOS_QUEDA_FORTE[indiceDeterministico(semente, GANCHOS_QUEDA_FORTE.length)];
  if (m.desejo_tipo === 'perfume_arabe' || RE_PERFUME_ARABE.test(o.titulo || '')) {
    return GANCHOS_ARABE[indiceDeterministico(semente, GANCHOS_ARABE.length)];
  }
  if (m.desejo_tipo === 'perfume_nicho' || RE_PERFUME_NICHO.test(o.titulo || '')) {
    return GANCHOS_NICHO[indiceDeterministico(semente, GANCHOS_NICHO.length)];
  }
  if (econ && econ.pct >= 30) return GANCHOS_QUEDA_FORTE[indiceDeterministico(semente, GANCHOS_QUEDA_FORTE.length)];
  if (m.em_alta === 'em_alta') {
    return GANCHOS_EM_ALTA[indiceDeterministico(semente, GANCHOS_EM_ALTA.length)];
  }
  if (econ && econ.pct >= 15) return GANCHOS_QUEDA_BOA[indiceDeterministico(semente, GANCHOS_QUEDA_BOA.length)];
  if (temCupom) return GANCHOS_COM_CUPOM[indiceDeterministico(semente, GANCHOS_COM_CUPOM.length)];

  const listaCat = GANCHOS_CATEGORIA[o.categoria] || GANCHOS_CATEGORIA.geral;
  return listaCat[indiceDeterministico(semente, listaCat.length)];
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
  calcularPrecoUnitario,
  termometroOferta,
  urlEnviarWhatsApp,
  tecladoEnviarWhatsApp,
};
