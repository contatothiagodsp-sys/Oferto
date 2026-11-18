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

const GANCHOS_SEM_PRECO = [
  '🔎 PREÇO CONFERIDO! Vale olhar agora:',
  '👀 DESTAQUE CONFERIDO NA LOJA:',
];

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
  const direto = Number(oferta && oferta.preco_de);
  if (Number.isFinite(direto) && direto > Number(oferta.preco)) return round2(direto);
  const m = lerManuaisObj(oferta);
  const salvo = Number(m.preco_de);
  if (Number.isFinite(salvo) && salvo > Number(oferta.preco)) return round2(salvo);
  return null;
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
  const mostrarPreco = !opcoes || opcoes.mostrarPreco !== false;
  const temCupom = !!(opcoes && opcoes.cupom);
  const semente = o.produto_id || o.oferta_id || o.titulo || 'x';

  if (!mostrarPreco) {
    return GANCHOS_SEM_PRECO[indiceDeterministico(semente, GANCHOS_SEM_PRECO.length)];
  }

  const min90 = o.min90 != null && o.min90 !== '' ? Number(o.min90) : null;
  if (min90 != null && Number.isFinite(min90)) {
    const pct = Math.floor(Number(o.desconto_pct) || 0);
    if (pct >= 30) return GANCHOS_QUEDA_FORTE[indiceDeterministico(semente, GANCHOS_QUEDA_FORTE.length)];
    if (pct >= 12) return GANCHOS_QUEDA_BOA[indiceDeterministico(semente, GANCHOS_QUEDA_BOA.length)];
    if (pct >= 1) return GANCHOS_HISTORICO[indiceDeterministico(semente, GANCHOS_HISTORICO.length)];
    // 0% (ou tolerância): nunca usar a palavra "desconto"
    return GANCHOS_IGUAL_MINIMO[indiceDeterministico(semente, GANCHOS_IGUAL_MINIMO.length)];
  }

  const econ = resumoEconomia(o, mostrarPreco);
  if (econ && econ.pct >= 30) return GANCHOS_QUEDA_FORTE[indiceDeterministico(semente, GANCHOS_QUEDA_FORTE.length)];
  if (econ && econ.pct >= 15) return GANCHOS_QUEDA_BOA[indiceDeterministico(semente, GANCHOS_QUEDA_BOA.length)];
  if (temCupom) return GANCHOS_COM_CUPOM[indiceDeterministico(semente, GANCHOS_COM_CUPOM.length)];

  const listaCat = GANCHOS_CATEGORIA[o.categoria] || GANCHOS_CATEGORIA.geral;
  return listaCat[indiceDeterministico(semente, listaCat.length)];
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
  urlEnviarWhatsApp,
  tecladoEnviarWhatsApp,
};
