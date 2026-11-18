'use strict';
// Radar Multi-Fonte gratuito (Mercado Livre, Amazon, Shopee, Shein e TikTok Shop):
// · coleta promoções públicas (Promobit por loja e nicho, Shopee Affiliate Open API e canais t.me/s/ opcionais)
// · desempacota redirecionamentos em até 3 saltos e remove 100% de tags/afiliados de terceiros
// · injeta automaticamente o afiliado do próprio usuário, preserva cupom e parcelamento sem juros
// · respeita o esquema estrito das Data Tables e funciona em 1-clique (cards) ou /modo piloto (automático).
const { round2, formatBRL, slug, truncar, novoId } = require('./util');
const { parseUrl, identificar, nomeLoja } = require('./lojas');
const { ehCurto, lerLocation, textoRespostaHttp, desempacotarRedirLoja, extrairHrefCanonica } = require('./curtos');
const { extrairLinksProduto, extrairDoTexto, classificarCategoria } = require('./extrator');
const { planejarLinks, parseManuais } = require('./links');
const shopee = require('./shopee');
const { avaliarSelo, precisaSnapshot, origemMin90 } = require('./selo');
const textos = require('./textos');
const { textoStatusRadar, interpretarComandoRadar } = require('./config');
const { msgAdmin } = require('./telegram');
const { chamadaCard, linhaOferta, linhaPreco, prepararPublicacao, lerRespostasShopee } = require('./fluxos');

const DIA = 24 * 60 * 60 * 1000;
const TECLADO_AUTO = { inline_keyboard: [[{ text: '⏳ Publicando automaticamente…', callback_data: 'noop' }]] };

const HDRS_WEB = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};

const FONTES_LOJA_PB = {
  amazon: 'https://www.promobit.com.br/promocoes/loja/amazon/',
  ml: 'https://www.promobit.com.br/promocoes/loja/mercado-livre/',
  shopee: 'https://www.promobit.com.br/promocoes/loja/shopee/',
  shein: 'https://www.promobit.com.br/promocoes/loja/shein/',
  tiktok: 'https://www.promobit.com.br/promocoes/loja/tiktok-shop/',
};

const FONTES_CAT_PB = {
  beleza: ['https://www.promobit.com.br/promocoes/perfumes-e-beleza/'],
  casa: [
    'https://www.promobit.com.br/promocoes/eletroportateis/',
    'https://www.promobit.com.br/promocoes/eletrodomesticos/',
  ],
  tech: ['https://www.promobit.com.br/promocoes/eletronicos-audio-e-video/'],
  bebe: ['https://www.promobit.com.br/promocoes/bebes-e-criancas/'],
};

function wrapUrlRadar(urlReal, cfg) {
  const api = cfg && cfg.radar && cfg.radar.api_url;
  return api ? `${api}/radar?u=${encodeURIComponent(urlReal)}` : urlReal;
}

function wrapUrlCurtoRadar(urlReal, cfg) {
  const apiCurto = cfg && cfg.link_curto_api;
  if (apiCurto) return `${apiCurto}/curto?u=${encodeURIComponent(urlReal)}`;
  return wrapUrlRadar(urlReal, cfg);
}

/**
 * Planeja as requisições web (Promobit + canais públicos Telegram) e Shopee API do ciclo do radar.
 */
function planejarFontesRadar(cfg, opcoes) {
  const o = Object.assign({ modo: 'agendado', ts: Date.now() }, opcoes || {});
  const rad = (cfg && cfg.radar) || {};
  if (o.modo === 'agendado' && rad.ativo === false) {
    return { ativo: false, opcoes: o, fontesWeb: [], fontesShopee: [] };
  }

  const lojas = (o.lojas && o.lojas.length)
    ? o.lojas
    : (rad.lojas && rad.lojas.length ? rad.lojas : ['amazon', 'ml', 'shopee', 'shein', 'tiktok']);
  const categorias = (o.categorias && o.categorias.length)
    ? o.categorias
    : (rad.categorias && rad.categorias.length ? rad.categorias : ['beleza', 'casa', 'tech', 'bebe']);
  const limite = Math.max(1, Number(o.limite) || Number(rad.max_por_ciclo) || 3);

  const fontesWeb = [];
  const urlsVistas = new Set();
  const addWeb = (tipo, urlReal, extra) => {
    if (!urlReal || urlsVistas.has(urlReal)) return;
    urlsVistas.add(urlReal);
    fontesWeb.push(Object.assign({ tipo, url_real: urlReal, url: wrapUrlRadar(urlReal, cfg), headers: HDRS_WEB }, extra || {}));
  };

  for (const lj of lojas) {
    if (FONTES_LOJA_PB[lj]) addWeb('promobit_loja', FONTES_LOJA_PB[lj], { loja_hint: lj });
  }
  if (!o.lojas || !o.lojas.length) {
    for (const cat of categorias) {
      for (const u of FONTES_CAT_PB[cat] || []) addWeb('promobit_cat', u, { categoria_hint: cat });
    }
  }
  for (const canal of rad.canais_telegram || []) {
    const limpo = String(canal || '').replace(/^@/, '').trim();
    if (limpo) addWeb('telegram_canal', `https://t.me/s/${limpo}`, { canal: limpo });
  }

  const fontesShopee = [];
  if (lojas.includes('shopee') && cfg && cfg.shopee && cfg.shopee.app_id && cfg.shopee.secret) {
    const tsSeg = Math.floor((o.ts || Date.now()) / 1000);
    if (o.termo) {
      fontesShopee.push({
        categoria: '',
        keyword: o.termo,
        http: shopee.reqOfertas(cfg.shopee, o.termo, { sortType: 2, limit: 20 }, tsSeg),
      });
    } else {
      const horaIdx = Math.floor((o.ts || Date.now()) / 3600000);
      for (const cat of categorias) {
        const kws = (cfg.shopee.buscas && cfg.shopee.buscas[cat]) || [];
        if (!kws.length) continue;
        const kw = kws[horaIdx % kws.length];
        fontesShopee.push({
          categoria: cat,
          keyword: kw,
          http: shopee.reqOfertas(cfg.shopee, kw, { sortType: 2, limit: 20 }, tsSeg),
        });
      }
    }
  }

  return {
    ativo: true,
    opcoes: Object.assign({}, o, { lojas, categorias, limite }),
    fontesWeb,
    fontesShopee,
  };
}

function normalizarLojaPromobit(storeDomain, storeParam, storeName) {
  const s = [storeDomain, storeParam, storeName].filter(Boolean).join(' ').toLowerCase();
  if (/amazon/.test(s)) return 'amazon';
  if (/mercadoli[vb]re/.test(s)) return 'ml';
  if (/shopee/.test(s)) return 'shopee';
  if (/shein/.test(s)) return 'shein';
  if (/tiktok/.test(s)) return 'tiktok';
  return '';
}

const CUPOM_GENERICO = /^(?:GRATIS|FREE|OFF|CUPOM|PROMO|DESCONTO|OFERTA|APP|PRIME)$/i;

/** Extrai ofertas públicas do HTML com __NEXT_DATA__ do Promobit. */
function lerPromobitHtml(html, fonte) {
  const txt = String(html || '');
  const m = txt.match(/<script[^>]*id\s*=\s*["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return [];
  let raiz;
  try { raiz = JSON.parse(m[1]); } catch (e) { return []; }
  const pp = (raiz && raiz.props && raiz.props.pageProps) || {};
  const srv = pp.serverOffers || {};
  const arr = (Array.isArray(srv) ? srv : (srv.offers || srv.items || []))
    .concat(Array.isArray(pp.sidebarFeaturedOffers) ? pp.sidebarFeaturedOffers : []);

  const out = [];
  for (const o of arr) {
    if (!o || !o.offerId || !o.offerTitle) continue;
    const tipo = String(o.offerPriceType || '').toUpperCase();
    if (tipo === 'COUPON' || tipo === 'STARTING_AT') continue;
    const preco = round2(Number(o.offerPrice));
    if (!Number.isFinite(preco) || preco <= 1) continue;
    if (/^(?:cupom exclusivo|cupom de r\$|as melhores d[ao] )/i.test(String(o.offerTitle))) continue;

    const loja = normalizarLojaPromobit(o.storeDomain, o.storeParam, o.storeName) || (fonte && fonte.loja_hint) || '';
    if (!loja) continue;

    const pAnt = Number(o.offerOldPrice);
    const preco_de = Number.isFinite(pAnt) && pAnt > preco ? round2(pAnt) : null;
    let descPct = preco_de ? round2(((preco_de - preco) / preco_de) * 100) : (Number(o.offerDiscontPercentage) || 0);
    if (!Number.isFinite(descPct) || descPct < 0) descPct = 0;

    let cupom = '';
    const rawCoup = String(o.offerCoupon || '').trim();
    if (/^[A-Z0-9_-]{3,25}$/i.test(rawCoup) && !CUPOM_GENERICO.test(rawCoup)) {
      cupom = rawCoup.toUpperCase();
    }
    const instTxt = String(o.offerInstructionsRaw || o.offerInstructions || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    let parcelamento = '';
    const mParc = instTxt.match(/\b(\d{1,2}x)\s*(?:de\s*)?(?:R\$\s*([\d.]+,\d{2}))?\s*sem\s*juros\b/i);
    if (mParc) {
      parcelamento = mParc[2]
        ? `Em até ${mParc[1]} de R$ ${mParc[2]} sem juros`
        : `Em até ${mParc[1]} de ${formatBRL(preco / Number(mParc[1].replace(/\D/g, '')))} sem juros`;
    } else if (Array.isArray(o.offerTags) && o.offerTags.some((t) => t && /parcelado/i.test(t.name || ''))) {
      parcelamento = 'Parcelamento sem juros disponível';
    }

    let imagem = String(o.offerPhoto || '').trim();
    if (imagem.startsWith('/')) imagem = 'https://i.promobit.com.br' + imagem;
    else if (!/^https?:\/\//i.test(imagem)) imagem = '';

    out.push({
      radar_key: 'pb_' + o.offerId,
      loja,
      titulo: truncar(String(o.offerTitle).trim(), 180),
      preco,
      preco_de,
      preco_sem_cupom: cupom && preco_de ? preco_de : null,
      desconto_pct: descPct,
      cupom,
      cupom_auto: '',
      parcelamento,
      imagem,
      destaque: !!o.offerIsHighlight || /TOP_OFFER/i.test(String(o.offerStatusName || '')),
      likes: Number(o.offerLikes) || 0,
      categoria_fonte: [o.categoryName || '', o.subcategoryName || '', o.offerSlug || ''].filter(Boolean).join(' '),
      categoria_hint: (fonte && fonte.categoria_hint) || '',
      redir_url: `https://www.promobit.com.br/Redirect/to/${o.offerId}/`,
      url: '',
      fonte_radar: 'promobit',
    });
  }
  return out;
}

/** Extrai ofertas públicas de canais do Telegram via https://t.me/s/<canal>. */
function lerCanalTelegramPublico(html, canal) {
  const txt = String(html || '');
  const blocos = txt.split(/<div[^>]+class="[^"]*tgme_widget_message_wrap/i).slice(1);
  const out = [];
  for (const bloco of blocos) {
    const mPost = bloco.match(/data-post="([^"]+)"/i);
    const mTxt = bloco.match(/class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (!mTxt) continue;
    const linksHtml = [...mTxt[1].matchAll(/href="(https?:\/\/[^"]+)"/gi)].map((x) => x[1].replace(/&amp;/g, '&'));
    const textoPlano = mTxt[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .trim();
    const links = extrairLinksProduto(textoPlano, linksHtml);
    if (!links.length) continue;
    const ext = extrairDoTexto(textoPlano);
    if (!ext.preco) continue;

    const u0 = links[0];
    const id = identificar(u0);
    const curto = ehCurto(u0);
    if (id.erro && !curto) continue;
    if (!curto && !['amazon', 'ml', 'shopee', 'shein', 'tiktok'].includes(id.loja)) continue;

    const mImg = bloco.match(/tgme_widget_message_photo_wrap[^>]*style="[^"]*background-image:url\('([^']+)'\)/i);
    const key = mPost ? 'tg_' + mPost[1].replace(/[^\w-]/g, '_') : 'tg_' + truncar(slug(ext.titulo || u0), 24);
    out.push({
      radar_key: key,
      loja: curto ? (id.loja && id.loja !== 'outra' ? id.loja : '') : id.loja,
      produto_id: !curto && id.produto_id ? id.produto_id : '',
      titulo: truncar(ext.titulo || `Oferta ${canal}`, 180),
      preco: ext.preco,
      preco_de: ext.preco_de,
      preco_sem_cupom: (ext.cupom || ext.cupom_auto) && ext.preco_de ? ext.preco_de : null,
      desconto_pct: ext.preco_de ? round2(((ext.preco_de - ext.preco) / ext.preco_de) * 100) : 0,
      cupom: ext.cupom || '',
      cupom_auto: ext.cupom_auto || '',
      parcelamento: ext.parcelamento || '',
      imagem: ext.imagem || (mImg ? mImg[1] : ''),
      destaque: false,
      likes: 5,
      categoria_fonte: '',
      categoria_hint: '',
      redir_url: curto ? u0 : '',
      url: curto ? '' : id.url_limpa,
      fonte_radar: 'telegram_' + (canal || 'canal'),
    });
  }
  return out;
}

function normTextoFiltro(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function bateTermo(candidato, termo) {
  const alvo = normTextoFiltro([candidato.titulo, candidato.categoria_fonte].join(' '));
  const palavras = normTextoFiltro(termo).split(' ').filter((w) => w.length >= 2);
  if (!palavras.length) return true;
  return palavras.every((w) => alvo.includes(w));
}

function jaEnviadaRecentemente(cand, recentesSet, keysSet, titulosSet) {
  if (cand.radar_key && keysSet.has(cand.radar_key)) return true;
  if (cand.produto_id && recentesSet.has(cand.produto_id)) return true;
  const titSlug = slug(cand.titulo).slice(0, 36);
  if (titSlug.length >= 10 && titulosSet.has(titSlug)) return true;
  return false;
}

/**
 * Filtra, deduplica (72h), classifica e seleciona com diversidade entre lojas as melhores promoções do radar.
 * Prepara `reqs1` para resolver links intermediários (Promobit Redirect/to/ ou links curtos) e limpar afiliados de terceiros.
 */
function selecionarCandidatosRadar(base, respWeb, respShopee, ofertasRecentes, precosRows, cfg) {
  if (!base || base.ativo === false) {
    return { opcoes: (base && base.opcoes) || {}, candidatos: [], reqs1: [] };
  }
  const o = base.opcoes || {};
  const rad = (cfg && cfg.radar) || {};
  const precoMin = Number(rad.preco_min) > 0 ? Number(rad.preco_min) : 15;
  const minDesc = Number(rad.min_desconto_pct) >= 0 ? Number(rad.min_desconto_pct) : 15;
  const lojasPerm = new Set(o.lojas || rad.lojas || ['amazon', 'ml', 'shopee', 'shein', 'tiktok']);
  const catsPerm = new Set(o.categorias || rad.categorias || ['beleza', 'casa', 'tech', 'bebe']);
  const palavrasFiltro = !o.termo && rad.palavras && rad.palavras.length ? rad.palavras : [];

  const brutos = [];
  (base.fontesWeb || []).forEach((f, i) => {
    const html = textoRespostaHttp((respWeb || [])[i]);
    if (!html) return;
    if (f.tipo === 'telegram_canal') brutos.push(...lerCanalTelegramPublico(html, f.canal));
    else brutos.push(...lerPromobitHtml(html, f));
  });
  (base.fontesShopee || []).forEach((f, i) => {
    const r = (respShopee || [])[i] || {};
    const lido = r.error ? { produtos: [] } : shopee.lerOfertas(r);
    for (const p of lido.produtos || []) {
      const precoDe = p.desconto_loja_pct > 0 && p.desconto_loja_pct < 90
        ? round2(p.preco / (1 - p.desconto_loja_pct / 100))
        : null;
      brutos.push({
        radar_key: 'shp_' + p.produto_id,
        loja: 'shopee',
        produto_id: p.produto_id,
        titulo: p.titulo,
        preco: p.preco,
        preco_de: precoDe && precoDe > p.preco ? precoDe : null,
        preco_sem_cupom: null,
        desconto_pct: p.desconto_loja_pct || 0,
        cupom: '',
        cupom_auto: '',
        parcelamento: '',
        imagem: p.imagem || '',
        destaque: p.vendas >= 200,
        likes: Math.min(20, Math.floor((p.vendas || 0) / 100)),
        comissao_pct: p.comissao_pct || 0,
        vendas: p.vendas || 0,
        categoria_fonte: f.keyword || '',
        categoria_hint: f.categoria || '',
        redir_url: '',
        url: p.url,
        resolved: true,
        fonte_radar: 'shopee_api',
      });
    }
  });

  // Deduplicação contra ofertas recentes (72h)
  const corte = (o.ts || Date.now()) - 3 * DIA;
  const recentesSet = new Set();
  const keysSet = new Set();
  const titulosSet = new Set();
  for (const r of ofertasRecentes || []) {
    if (!r || !r.oferta_id || (r.ts && Number(r.ts) < corte)) continue;
    if (r.produto_id) recentesSet.add(r.produto_id);
    const tSlug = slug(r.titulo || '').slice(0, 36);
    if (tSlug.length >= 10) titulosSet.add(tSlug);
    const man = parseManuais(r.links_manuais);
    if (man.radar_key) keysSet.add(man.radar_key);
  }

  const vistosLote = new Set();
  const elegiveis = [];
  for (const c of brutos) {
    if (!c || !c.titulo || !(c.preco >= precoMin)) continue;
    if (c.loja && !lojasPerm.has(c.loja)) continue;
    if (jaEnviadaRecentemente(c, recentesSet, keysSet, titulosSet)) continue;
    const chaveLote = c.produto_id || c.radar_key;
    const tSlug = slug(c.titulo).slice(0, 36);
    if (vistosLote.has(chaveLote) || (tSlug.length >= 10 && vistosLote.has('t:' + tSlug))) continue;

    if (o.termo && !bateTermo(c, o.termo)) continue;
    if (palavrasFiltro.length && !palavrasFiltro.some((kw) => bateTermo(c, kw))) continue;

    if (o.modo === 'agendado' && !o.termo) {
      const okQual = c.desconto_pct >= minDesc || !!c.cupom || !!c.destaque || (c.likes || 0) >= 5;
      if (!okQual) continue;
    }

    const catAuto = classificarCategoria(c.titulo, cfg, c.categoria_fonte);
    const categoria = catAuto.confianca > 0 ? catAuto.categoria : (c.categoria_hint || catAuto.categoria);
    if (!catsPerm.has(categoria)) continue;

    vistosLote.add(chaveLote);
    if (tSlug.length >= 10) vistosLote.add('t:' + tSlug);

    const nota = (c.destaque ? 40 : 0)
      + (c.cupom ? 25 : 0)
      + Math.min(60, Number(c.desconto_pct) || 0)
      + Math.min(30, (c.likes || 0) * 2)
      + Math.min(25, (c.comissao_pct || 0) * 2);

    elegiveis.push(Object.assign({}, c, { categoria, nota }));
  }

  // Ordena por qualidade e seleciona em rodízio entre lojas para variedade
  elegiveis.sort((a, b) => b.nota - a.nota);
  const porLoja = {};
  for (const c of elegiveis) {
    const k = c.loja || 'outra';
    (porLoja[k] = porLoja[k] || []).push(c);
  }
  const limite = Math.max(1, Number(o.limite) || 3);
  const escolhidos = [];
  const ordemLojas = Object.keys(porLoja).sort((a, b) => porLoja[b][0].nota - porLoja[a][0].nota);
  while (escolhidos.length < limite) {
    let pegou = false;
    for (const k of ordemLojas) {
      if (porLoja[k].length && escolhidos.length < limite) {
        escolhidos.push(porLoja[k].shift());
        pegou = true;
      }
    }
    if (!pegou) break;
  }

  const reqs1 = [];
  escolhidos.forEach((c, idx) => {
    if (c.redir_url) {
      reqs1.push({ idx, url: wrapUrlRadar(c.redir_url, cfg), headers: HDRS_WEB });
    } else if (c.url && ehCurto(c.url)) {
      reqs1.push({ idx, url: wrapUrlCurtoRadar(c.url, cfg), headers: HDRS_WEB });
    } else if (c.url) {
      const id = identificar(c.url);
      if (!id.erro) {
        c.loja = id.loja;
        c.produto_id = id.produto_id;
        c.url = id.url_limpa;
        c.resolved = true;
      }
    }
  });

  return { opcoes: o, candidatos: escolhidos, reqs1 };
}

/**
 * 1º salto do radar: extrai a URL da loja a partir do /Redirect/to/<id>/ (ou link curto) e limpa afiliados alheios.
 */
function aplicarRedirRadar1(estado, resp1, cfg) {
  const cands = (estado.candidatos || []).map((c) => Object.assign({}, c));
  const reqs2 = [];
  (estado.reqs1 || []).forEach((req, k) => {
    const c = cands[req.idx];
    const r = (resp1 || [])[k];
    if (!c || !r) return;
    let url = lerLocation(r);
    if (!url) return;
    url = desempacotarRedirLoja(url);
    if (/promobit\.com\.br|gatry\.com/i.test(url)) return;
    if (ehCurto(url)) {
      reqs2.push({ idx: req.idx, url: wrapUrlCurtoRadar(url, cfg), headers: HDRS_WEB });
      return;
    }
    const id = identificar(url);
    if (!id.erro) {
      c.loja = id.loja;
      c.produto_id = id.produto_id;
      c.url = id.url_limpa;
      c.resolved = true;
    }
  });
  return { opcoes: estado.opcoes, candidatos: cands, reqs2 };
}

/**
 * 2º salto do radar: expande links curtos (amzn.to, s.shopee.com.br, meli.la, tiktok.com/t/…).
 * Se cair em vitrine /social/ do Mercado Livre sem MLB, agenda o 3º salto para abrir a vitrine.
 */
function aplicarRedirRadar2(estado, resp2, cfg) {
  const cands = (estado.candidatos || []).map((c) => Object.assign({}, c));
  const reqs3 = [];
  (estado.reqs2 || []).forEach((req, k) => {
    const c = cands[req.idx];
    const r = (resp2 || [])[k];
    if (!c || !r) return;
    let loc = lerLocation(r);
    if (!loc) return;
    loc = desempacotarRedirLoja(loc);
    if (/promobit\.com\.br|gatry\.com/i.test(loc)) return;

    if (ehCurto(loc)) {
      reqs3.push({ idx: req.idx, url: wrapUrlRadar(loc, cfg), headers: HDRS_WEB });
      return;
    }
    if (/mercadoli(?:vre|bre)\.com(?:\.br)?\/social\//i.test(loc) && !/(?:\/p\/|MLB-?)\d{6,}/i.test(loc)) {
      reqs3.push({ idx: req.idx, url: wrapUrlRadar(loc, cfg), headers: HDRS_WEB });
      return;
    }
    const id = identificar(loc);
    if (!id.erro) {
      c.loja = id.loja;
      c.produto_id = id.produto_id;
      c.url = id.url_limpa;
      c.resolved = true;
    }
  });
  return { opcoes: estado.opcoes, candidatos: cands, reqs3 };
}

function extrairProdutoHtmlSocial(html) {
  const mFeat = html.match(/https:\/\/(?:www\.|produto\.)?mercadolivre\.com\.br\/[^"'\s<>]*?(?:\/p\/MLB\d+|MLB-?\d+)[^"'\s<>]*card-featured[^"'\s<>]*/i);
  if (mFeat) return mFeat[0].replace(/&amp;/g, '&');
  const mMlb = html.match(/https:\/\/(?:www\.|produto\.)?mercadolivre\.com\.br\/[^"'\s<>]*?(?:\/p\/MLB\d+|MLB-?\d+[^"'\s<>]*)/i);
  if (mMlb) return mMlb[0].replace(/&amp;/g, '&');
  const can = extrairHrefCanonica(html);
  return can || '';
}

/**
 * Finaliza a resolução (3º salto se houve /social/ ML), avalia selo/snapshots e gera cards ou auto-publicação.
 */
function finalizarRadar(estado, resp3, ofertasRecentes, precosRows, cfg) {
  const cands = (estado.candidatos || []).map((c) => Object.assign({}, c));
  (estado.reqs3 || []).forEach((req, k) => {
    const c = cands[req.idx];
    const r = (resp3 || [])[k];
    if (!c || !r) return;
    let alvo = lerLocation(r);
    if (!alvo || /\/social\//i.test(alvo)) {
      const html = textoRespostaHttp(r);
      if (html) alvo = extrairProdutoHtmlSocial(html);
    }
    alvo = desempacotarRedirLoja(alvo);
    if (!alvo || /promobit\.com\.br|gatry\.com/i.test(alvo)) return;
    const id = identificar(alvo);
    if (!id.erro) {
      c.loja = id.loja;
      c.produto_id = id.produto_id;
      c.url = id.url_limpa;
      c.resolved = true;
    }
  });

  const o = estado.opcoes || {};
  const ts = o.ts || Date.now();
  const corte = ts - 3 * DIA;
  const recentesSet = new Set();
  for (const r of ofertasRecentes || []) {
    if (r && r.produto_id && (!r.ts || Number(r.ts) >= corte)) recentesSet.add(r.produto_id);
  }
  const porProduto = {};
  for (const r of precosRows || []) if (r && r.produto_id) (porProduto[r.produto_id] = porProduto[r.produto_id] || []).push(r);

  const destinoAdmins = o.modo === 'comando' && o.chat_id ? [o.chat_id] : ((cfg && cfg.admins) || []);
  const modoAuto = !!(cfg && cfg.radar && cfg.radar.publicar_direto);
  const soTextos = !(cfg && cfg.telegram && cfg.telegram.grupo_id);

  const ofertasNovas = [];
  const precosNovos = [];
  const chamadas = [];
  const autoPlanos = [];
  const reqsShopeeLinks = [];
  const vistosFim = new Set();

  for (const c of cands) {
    if (!c.resolved || !c.url || !c.produto_id) continue;
    if (/promobit\.com\.br|gatry\.com/i.test(c.url)) continue;
    if (recentesSet.has(c.produto_id) || vistosFim.has(c.produto_id)) continue;
    vistosFim.add(c.produto_id);

    const hist = porProduto[c.produto_id] || [];
    const sel = avaliarSelo(hist, c.preco, {
      agora: ts,
      tolerancia_pct: (cfg && cfg.selo && cfg.selo.tolerancia_pct) || 0,
      dias: (cfg && cfg.selo && cfg.selo.dias) || 90,
    });
    if (precisaSnapshot(hist, c.preco, ts)) {
      precosNovos.push(linhaPreco(c.produto_id, c.loja, c.preco, 'coleta', '', ts));
    }

    const manuais = {
      modo_link: true,
      categoria_auto: true,
      radar_key: c.radar_key,
    };
    if (c.preco_de) manuais.preco_de = c.preco_de;
    if (c.preco_sem_cupom) manuais.preco_sem_cupom = c.preco_sem_cupom;
    if (c.cupom) manuais.cupom = c.cupom;
    if (c.cupom_auto && !c.cupom) manuais.cupom_auto = c.cupom_auto;
    if (c.parcelamento) manuais.parcelamento = c.parcelamento;

    const offerObj = {
      oferta_id: novoId('o', ts + ofertasNovas.length),
      produto_id: c.produto_id,
      loja: c.loja,
      categoria: c.categoria,
      titulo: c.titulo,
      url: c.url,
      imagem: c.imagem || '',
      preco: c.preco,
      links_manuais: manuais,
      origem: 'radar',
      comissao_pct: c.comissao_pct || null,
      vendas: c.vendas || null,
      criada_por: o.user_id || null,
      ts,
    };
    const linha = linhaOferta(offerObj, sel);

    let planoAuto = null;
    if (modoAuto && destinoAdmins.length && textos.permitePublicarSelo(linha, cfg)) {
      const pubOferta = Object.assign({}, linha, origemMin90(linha, cfg.selo), { relampago: false, top: false });
      try {
        const linkItens = planejarLinks(pubOferta, cfg, ts);
        if (!soTextos) {
          linha.status = 'publicando';
          linha.decidida_por = o.user_id || destinoAdmins[0] || null;
          linha.decidida_ts = ts;
        }
        planoAuto = {
          oferta: pubOferta,
          linkItens,
          so_textos: soTextos,
          chat_id: destinoAdmins[0],
          ts,
          cardIdx: -1,
        };
      } catch (err) {
        planoAuto = null;
      }
    }

    ofertasNovas.push(linha);
    destinoAdmins.forEach((adminId, idxAdm) => {
      const chCard = chamadaCard(linha, cfg, adminId);
      if (planoAuto && !planoAuto.so_textos) chCard.payload.reply_markup = TECLADO_AUTO;
      if (planoAuto && idxAdm === 0) planoAuto.cardIdx = chamadas.length;
      chamadas.push(chCard);
    });

    if (planoAuto) {
      const pIdx = autoPlanos.length;
      planoAuto.linkItens.forEach((it, itemIdx) => {
        if (it.metodo === 'shopee' && it.http) {
          reqsShopeeLinks.push({ planoIdx: pIdx, itemIdx, http: it.http });
        }
      });
      autoPlanos.push(planoAuto);
    }
  }

  if (!ofertasNovas.length && o.modo === 'comando' && o.chat_id) {
    chamadas.push(msgAdmin(
      o.chat_id,
      `🔎 Nenhuma promoção nova encontrada para "${o.rotulo || 'o filtro atual'}" no momento (tudo que saiu recente já foi exibido ou ainda não atingiu o desconto mínimo).\n💡 Tente /radar status ou outro termo como /radar perfume.`,
    ));
  }

  return {
    ofertasNovas,
    precosNovos,
    chamadas,
    autoPlanos,
    reqsShopeeLinks,
    opcoes: o,
    resumo: { candidatas: cands.length, enviadas: ofertasNovas.length },
  };
}

/**
 * Executa a publicação automática em lote para ofertas do radar quando /modo piloto está ligado.
 */
function publicarLoteRadar(fin, respShopeeLinks, respCards, cfg) {
  const planos = (fin && fin.autoPlanos) || [];
  if (!planos.length) return { updates: [], linksRows: [], chamadasPub: [] };

  const resolvidosPorPlano = planos.map((p) => (p.linkItens || []).map((it) => Object.assign({}, it)));
  ((fin && fin.reqsShopeeLinks) || []).forEach((req, k) => {
    const r = (respShopeeLinks || [])[k] || {};
    const orig = resolvidosPorPlano[req.planoIdx] && resolvidosPorPlano[req.planoIdx][req.itemIdx];
    if (orig) resolvidosPorPlano[req.planoIdx][req.itemIdx] = lerRespostasShopee([orig], [r])[0];
  });

  const updates = [];
  const linksRows = [];
  const chamadasPub = [];
  planos.forEach((p, idx) => {
    const cardResp = p.cardIdx >= 0 ? (respCards || [])[p.cardIdx] : null;
    const msgId = cardResp && cardResp.ok && cardResp.result ? cardResp.result.message_id : 0;
    const pub = prepararPublicacao(p.oferta, resolvidosPorPlano[idx], cfg, {
      ts: p.ts,
      chat_id: p.chat_id,
      message_id: msgId,
      so_textos: !!p.so_textos,
    });
    if (pub.update) updates.push(pub.update);
    if (pub.linksRows && pub.linksRows.length) linksRows.push(...pub.linksRows);
    if (pub.chamadas && pub.chamadas.length) chamadasPub.push(...pub.chamadas);
  });

  return { updates, linksRows, chamadasPub };
}

module.exports = {
  textoStatusRadar,
  interpretarComandoRadar,
  planejarFontesRadar,
  lerPromobitHtml,
  lerCanalTelegramPublico,
  selecionarCandidatosRadar,
  aplicarRedirRadar1,
  aplicarRedirRadar2,
  finalizarRadar,
  publicarLoteRadar,
};
