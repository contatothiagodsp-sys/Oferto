'use strict';
// 3º salto (vitrine /social/ ML) + preparação de leitura de páginas e auditoria de mercado do Radar (extraído para tree-shaking).
const { round2, truncar } = require('./util');
const { identificar, normalizarImagemOferta } = require('./lojas');
const { lerLocation, textoRespostaHttp, desempacotarRedirLoja, extrairHrefCanonica } = require('./curtos');
const { tituloDaUrl, limparTituloLoja, limparMencoesTerceiros, pareceChamadaOuGancho, classificarCategoria, detectarTagCampanha, reqPaginaProduto, recalcularParcelamentoComCupom } = require('./extrator');
const { montarReqsMercado } = require('./mercado');
const { agenteAtivo } = require('./agentes');
const { decodificarEntidadesWeb, preservarQtdUnidadesTitulo, aplicarMetadadosLojaKpopShopee } = require('./radar-redir');

const LOJAS_ENRIQUECER_PAGINA = new Set([
  'amazon', 'ml', 'kabum', 'terabyte', 'pichau', 'acer', 'motorola', 'samsung',
  'belezanaweb', 'epocacosmeticos', 'boticario', 'natura', 'sephora', 'mahogany', 'creamy', 'ikesaki',
  'drogaraia', 'drogasil', 'pacheco', 'panvel', 'araujo', 'paguemenos', 'venancio', 'oficialfarma', 'maxtitanium',
  'rihappy', 'alobebe',
  'centauro', 'netshoes', 'nike', 'adidas', 'olympikus', 'mizuno', 'underarmour', 'farmrio',
  'renner', 'cea', 'riachuelo', 'dafiti', 'zattini', 'hering',
  'polishop', 'electrolux', 'brastemp', 'consul',
  'umusic', 'klinestore', 'hopescolor', 'asiaticstore', 'kpopandyoushop', 'kpopalbums', 'kpopmerch', 'ktown4u',
]);

const FONTES_CATALOGO_DIRETO = new Set([
  'umusic_vtex', 'vtex_catalogo', 'shopify_catalogo', 'magento_catalogo', 'nuvemshop_kpop', 'amazon_busca', 'shopee_api',
]);

const LOJAS_KPOP_ESPECIALIZADAS = new Set([
  'umusic', 'klinestore', 'hopescolor', 'asiaticstore', 'kpopandyoushop',
  'kpopalbums', 'kpopmerch', 'ktown4u', 'weverse', 'cokodive', 'daebak', 'cdjapan', 'yesasia', 'kpop1004',
]);

function extrairDadosHtmlSocial(html, tituloCand) {
  const txt = String(html || '');
  if (!txt) return null;
  const partes = txt.split('poly-card__portada').slice(1);
  const titLimpoCand = /^oferta\s+/i.test(String(tituloCand || '').trim()) ? '' : String(tituloCand || '');
  const toksCand = titLimpoCand.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length >= 3 && !/^(?:para|com|sem|por|mais|menos|oferta|promo|cupom|conto|precinho)$/.test(w));

  const cards = [];
  for (const rawP of partes) {
    const bloco = rawP.slice(0, 8000);
    const mHref = bloco.match(/href="(https:\/\/(?:www\.|produto\.)?mercadolivre\.com\.br\/[^"]+)"/i);
    if (!mHref) continue;
    const urlBruta = mHref[1].replace(/&amp;/g, '&');
    if (!/(?:\/(?:u?p)\/MLB(?:U)?\d{6,}|\/MLB-?\d{6,})/i.test(urlBruta)) continue;
    const ehFeatured = /card-featured/i.test(urlBruta) || /card-featured/i.test(bloco.slice(0, 2500));
    const mImg = bloco.match(/src="(https:\/\/[^"]*mlstatic\.com\/D_[^"]+)"/i);
    const mTit = bloco.match(/poly-component__title[^>]*>([\s\S]*?)<\/a>/i) || bloco.match(/alt="([^"]+)"/i);
    const titulo = mTit ? limparTituloLoja(mTit[1]) : '';
    const imagem = mImg ? normalizarImagemOferta(mImg[1]) : '';
    const mAnt = bloco.match(/andes-money-amount--previous[\s\S]{0,500}?andes-money-amount__fraction[^>]*>([\d.]+)<\/span>(?:[\s\S]{0,220}?andes-money-amount__cents[^>]*>(\d{2})<\/span>)?/i);
    const preco_de = mAnt ? Number((mAnt[2] ? `${mAnt[1]},${mAnt[2]}` : mAnt[1]).replace(/\./g, '').replace(',', '.')) : null;
    const mAtu = bloco.match(/poly-price__current[\s\S]{0,650}?andes-money-amount__fraction[^>]*>([\d.]+)<\/span>(?:[\s\S]{0,220}?andes-money-amount__cents[^>]*>(\d{2})<\/span>)?/i);
    const preco = mAtu ? Number((mAtu[2] ? `${mAtu[1]},${mAtu[2]}` : mAtu[1]).replace(/\./g, '').replace(',', '.')) : null;
    const mInst = bloco.match(/poly-price__installments[^>]*>([\s\S]{0,1200}?)<\/span>\s*<\/div>/i)
      || bloco.match(/poly-price__installments[^>]*>([\s\S]{0,1200}?sem\s+juros)/i);
    let parcelamento = '';
    if (mInst) {
      const txtInst = decodificarEntidadesWeb(mInst[1].replace(/<[^>]+>/g, ' ')).replace(/R\$\s*([\d.]+)\s*,\s*(\d{2})/g, 'R$ $1,$2').replace(/\s+/g, ' ').trim();
      const mP = txtInst.match(/\b(\d{1,2})\s*x\s*(?:de\s*)?R\$\s*([\d.]+,\d{2})(?:\s*sem\s*juros)?/i);
      if (mP && Number(mP[1]) >= 2) {
        parcelamento = `Em até ${mP[1]}x de R$ ${mP[2]}${/sem\s*juros/i.test(txtInst) ? ' sem juros' : ''}`;
      }
    }
    const mHigh = bloco.match(/poly-component__highlight[^>]*>([\s\S]{0,300}?)<\/span>/i);
    const campanha = detectarTagCampanha([mHigh ? mHigh[1].replace(/<[^>]+>/g, ' ') : '', titulo].join(' ')) || '';
    const normTit = (titulo + ' ' + urlBruta).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const batidos = toksCand.filter((t) => normTit.includes(t)).length;
    cards.push({
      url: urlBruta,
      ehFeatured,
      titulo,
      imagem,
      preco: Number.isFinite(preco) && preco > 0 ? preco : null,
      preco_de: Number.isFinite(preco_de) && preco_de > 0 ? preco_de : null,
      parcelamento,
      campanha,
      batidos,
    });
  }

  const ehListaGeral = /\/social\/[^"'\s<>]+\/lists\b/i.test(txt.slice(0, 15000));
  const feat = cards.find((x) => x.ehFeatured);

  if (toksCand.length >= 1) {
    if (cards.length) {
      const minReq = Math.min(2, toksCand.length);
      const ordenado = cards.slice().sort((a, b) => (b.batidos - a.batidos) || (Number(b.ehFeatured) - Number(a.ehFeatured)));
      const melhor = ordenado[0];
      if (feat && feat.batidos >= minReq && feat.batidos >= melhor.batidos) return feat;
      if (melhor && (melhor.batidos >= minReq || (melhor.ehFeatured && melhor.batidos >= 1))) return melhor;
      return null;
    }
  } else {
    if (feat) return feat;
    if (!ehListaGeral && cards.length === 1) return cards[0];
    if (ehListaGeral && cards.length > 1) return null;
  }

  const mFeat = txt.match(/https:\/\/(?:www\.|produto\.)?mercadolivre\.com\.br\/[^"'\s<>]*?(?:\/(?:u?p)\/MLB(?:U)?\d{6,}|\/MLB-?\d{6,})[^"'\s<>]*card-featured[^"'\s<>]*/i);
  if (mFeat) {
    const uFeat = mFeat[0].replace(/&amp;/g, '&');
    if (toksCand.length >= 1) {
      const normUF = uFeat.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (toksCand.filter((t) => normUF.includes(t)).length === 0) return null;
    }
    return { url: uFeat, titulo: '', imagem: '', preco: null, preco_de: null, parcelamento: '', campanha: '' };
  }
  if (!ehListaGeral) {
    const mMlb = txt.match(/https:\/\/(?:www\.|produto\.)?mercadolivre\.com\.br\/[^"'\s<>]*?(?:\/(?:u?p)\/MLB(?:U)?\d{6,}|\/MLB-?\d{6,}[^"'\s<>]*)/i);
    if (mMlb) {
      const urlCand = mMlb[0].replace(/&amp;/g, '&');
      if (toksCand.length >= 1) {
        const normU = urlCand.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const batU = toksCand.filter((t) => normU.includes(t)).length;
        if (batU === 0) return null;
      }
      return { url: urlCand, titulo: '', imagem: '', preco: null, preco_de: null, parcelamento: '', campanha: '' };
    }
  }
  const can = extrairHrefCanonica(txt);
  return can && !/\/social\//i.test(can) ? { url: can, titulo: '', imagem: '', preco: null, preco_de: null, parcelamento: '', campanha: '' } : null;
}

function extrairProdutoHtmlSocial(html, tituloCand) {
  const d = extrairDadosHtmlSocial(html, tituloCand);
  return (d && d.url) || '';
}

function resolverReqs3EmCands(cands, reqs3, resp3) {
  (reqs3 || []).forEach((req, k) => {
    const c = cands[req.idx];
    const r = (resp3 || [])[k];
    if (!c || !r) return;
    const html = textoRespostaHttp(r);
    const ehVitrineSocial = /\/social\//i.test(String(req.url || c._social_url || ''))
      || /poly-card__portada|poly-component__title/i.test(html);
    let social = null;
    let alvo = '';
    if (ehVitrineSocial && html) {
      social = extrairDadosHtmlSocial(html, c.titulo);
      alvo = social ? social.url : '';
    } else {
      alvo = lerLocation(r);
      if ((!alvo || /\/social\//i.test(alvo)) && html) {
        social = extrairDadosHtmlSocial(html, c.titulo);
        alvo = social ? social.url : '';
      }
    }
    alvo = desempacotarRedirLoja(alvo);
    if (!alvo || /promobit\.com\.br|gatry\.com/i.test(alvo)) {
      c._descarte_motivo = 'vitrine_sem_produto';
      return;
    }
    const id = identificar(alvo);
    if (!id.erro) {
      c.loja = id.loja;
      c.produto_id = id.produto_id;
      c.url = id.url_limpa;
      c.resolved = true;
      if (c.loja === 'shopee') aplicarMetadadosLojaKpopShopee(c, alvo);
      if (social) {
        if (social.imagem) {
          c.imagem = social.imagem;
          c._social_enriquecido = true;
        }
        if (social.titulo && social.titulo.length >= 6) {
          c.titulo = truncar(preservarQtdUnidadesTitulo(limparMencoesTerceiros(social.titulo), c._qtd_unidades), 180);
        }
        if (!(c._qtd_unidades >= 2) && (c.cupom || c.cupom_auto) && social.preco && social.preco > c.preco && !c.preco_sem_cupom) {
          c.preco_sem_cupom = round2(social.preco);
        }
        const pDeSoc = (social.preco_de && social.preco_de > c.preco)
          ? social.preco_de
          : (!(c._qtd_unidades >= 2) && (c.cupom || c.cupom_auto) && social.preco && social.preco > c.preco ? social.preco : null);
        if (!c.preco_de && pDeSoc) {
          c.preco_de = round2(pDeSoc);
          c.desconto_pct = round2(((c.preco_de - c.preco) / c.preco_de) * 100);
        }
        if (!c.parcelamento && social.parcelamento) {
          c.parcelamento = social.parcelamento;
          if ((c.cupom || c.cupom_auto) && social.preco && social.preco > c.preco) {
            recalcularParcelamentoComCupom({ preco: social.preco, parcelamento: social.parcelamento }, c, null, round2(social.preco - c.preco));
          }
        }
        if (!c.campanha && social.campanha) {
          c.campanha = social.campanha;
        }
      }
    }
  });
}

/**
 * Conclui o 3º salto (vitrines /social/ ML) e agenda a leitura gratuita das páginas dos produtos escolhidos
 * para capturar cupons ativos no anúncio (checkbox/código), preço sem cupom e parcelamento sem juros.
 */
function prepararPaginasRadar(estado, resp3, cfg) {
  const cands = (estado.candidatos || []).map((c) => Object.assign({}, c));
  resolverReqs3EmCands(cands, estado.reqs3, resp3);
  const reqsPag = [];
  const itensMercado = [];
  cands.forEach((c, idx) => {
    c.reqs3_done = true;
    c.imagem = normalizarImagemOferta(c.imagem);
    c.titulo = limparMencoesTerceiros(c.titulo);
    if (c.resolved && c.url) {
      if (c.loja === 'shopee') aplicarMetadadosLojaKpopShopee(c, c.url);
      const slugUrl = tituloDaUrl(c.url);
      const ehCatalogoDireto = FONTES_CATALOGO_DIRETO.has(c.fonte_radar);
      if (slugUrl && (!c.titulo || c.titulo.length < 10 || (!ehCatalogoDireto && pareceChamadaOuGancho(c.titulo)))) {
        c.titulo = preservarQtdUnidadesTitulo(slugUrl, c._qtd_unidades);
      }
      if (!c.loja_kpop_curada && (c.categoria_indefinida || slugUrl)) {
        const reCat = classificarCategoria(c.titulo, cfg, [c.categoria_fonte || '', slugUrl || '', c.url || ''].join(' '));
        if (reCat.confianca > 0) {
          c.categoria = reCat.categoria;
          c.categoria_confianca = reCat.confianca;
          c.categoria_indefinida = false;
        }
      }
    }
    const jaTemVitrineMl = c.loja === 'ml' && c._social_enriquecido && c.imagem && c.titulo;
    const jaTemCatalogoDireto = (c.fonte_radar === 'umusic_vtex' || c.fonte_radar === 'vtex_catalogo' || c.fonte_radar === 'shopify_catalogo' || c.fonte_radar === 'magento_catalogo' || c.fonte_radar === 'nuvemshop_kpop') && c.titulo && c.preco > 0 && c.imagem;
    if (!c.eh_cupom_loja && c.resolved && c.url && LOJAS_ENRIQUECER_PAGINA.has(c.loja) && !jaTemVitrineMl && !jaTemCatalogoDireto) {
      const rp = reqPaginaProduto(c.url, cfg);
      reqsPag.push({ idx, url: rp.url, headers: rp.headers });
    }
    if (!c.eh_cupom_loja && c.resolved && c.titulo && c.preco > 0 && !LOJAS_KPOP_ESPECIALIZADAS.has(c.loja) && !c.loja_kpop_curada) {
      itensMercado.push({ idx, titulo: c.titulo, loja: c.loja, preco: c.preco, eh_cupom_loja: false });
    }
  });
  const reqsMercado = agenteAtivo(cfg, 'auditor') ? montarReqsMercado(itensMercado, cfg) : [];
  return { opcoes: estado.opcoes, candidatos: cands, reqsPag, reqsMercado };
}

module.exports = {
  LOJAS_ENRIQUECER_PAGINA,
  FONTES_CATALOGO_DIRETO,
  LOJAS_KPOP_ESPECIALIZADAS,
  extrairDadosHtmlSocial,
  extrairProdutoHtmlSocial,
  resolverReqs3EmCands,
  prepararPaginasRadar,
};
