'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const L = require('../lib');
const B = require('../build/build-workflows');
const RF = require('../lib/radar-fontes');

const AGORA_14H = Date.parse('2026-11-19T14:00:00-03:00');
const AGORA_19H = Date.parse('2026-11-19T19:30:00-03:00');

function cfgAudit(extra) {
  return L.montarConfig([
    { chave: 'admins', valor: '111' },
    { chave: 'bot_token', valor: '123:ABC' },
    { chave: 'grupo_id', valor: '-1001234567890' },
    { chave: 'topico.top', valor: '3' },
    { chave: 'topico.beleza', valor: '4' },
    { chave: 'topico.casa', valor: '5' },
    { chave: 'topico.bebe', valor: '6' },
    { chave: 'topico.tech', valor: '7' },
    { chave: 'topico.perfumes', valor: '101' },
    { chave: 'topico.saude', valor: '102' },
    { chave: 'topico.moda', valor: '144' },
    { chave: 'topico.kpop', valor: '276' },
  ].concat(extra || []));
}

test('Bloco A: fix vtexcommercestable.com.br (Época e Max Titanium), RE_MEDICAMENTO_RX e RE_PECA_REPOSICAO', () => {
  const itensEpoca = L.lerCatalogoVtex([
    {
      productId: '9001',
      productName: 'Perfume Lattafa Khamrah Eau de Parfum 100ml',
      link: 'https://epocacosmeticos.vtexcommercestable.com.br/perfume-lattafa-khamrah-100ml/p',
      categories: ['/Perfumes/Importados/'],
      items: [{
        images: [{ imageUrl: 'https://epocacosmeticos.vteximg.com.br/arquivos/ids/123/khamrah.jpg' }],
        sellers: [{ sellerId: '1', commertialOffer: { AvailableQuantity: 5, Price: 199.9, ListPrice: 319.9 } }],
      }],
    },
  ], { loja: 'epocacosmeticos', categoria_hint: 'perfumes', url_fonte: 'https://www.epocacosmeticos.com.br/api/catalog_system/pub/products/search?ft=perfume' });

  assert.equal(itensEpoca.length, 1);
  assert.equal(itensEpoca[0].loja, 'epocacosmeticos');
  assert.equal(itensEpoca[0].url, 'https://www.epocacosmeticos.com.br/perfume-lattafa-khamrah-100ml/p');
  assert.ok(!itensEpoca[0].url.includes('vtexcommercestable'));

  const itensMax = L.lerCatalogoVtex([
    {
      productId: '9002',
      productName: 'Creatina Monohidratada 300g Max Titanium',
      link: 'https://lojamaxtitanium.vtexcommercestable.com.br/creatina-300g/p',
      items: [{
        images: [{ imageUrl: 'https://lojamaxtitanium.vtexassets.com/arquivos/ids/10/creatina.jpg' }],
        sellers: [{ sellerId: '1', commertialOffer: { AvailableQuantity: 10, Price: 49.9, ListPrice: 89.9 } }],
      }],
    },
  ], { loja: 'maxtitanium', categoria_hint: 'saude' });
  assert.equal(itensMax.length, 1);
  assert.equal(itensMax[0].loja, 'maxtitanium');
  assert.equal(itensMax[0].url, 'https://www.maxtitanium.com.br/creatina-300g/p');

  // RE_MEDICAMENTO_RX reforçado bloqueia Rx/oncológico/antiparasitário e libera suplementos
  const farmMix = L.lerCatalogoVtex([
    { productId: 'rx1', productName: 'Anastrazol 1mg 30 Comprimidos Revestidos', link: 'https://www.drogariavenancio.com.br/anastrazol/p', items: [{ sellers: [{ sellerId: '1', commertialOffer: { AvailableQuantity: 5, Price: 45, ListPrice: 90 } }] }] },
    { productId: 'rx2', productName: 'Albendazol 400mg 3 Comprimidos Mastigáveis', link: 'https://www.paguemenos.com.br/albendazol/p', items: [{ sellers: [{ sellerId: '1', commertialOffer: { AvailableQuantity: 5, Price: 19, ListPrice: 35 } }] }] },
    { productId: 'rx3', productName: 'Tadalafila 20mg 4 Comprimidos', link: 'https://www.drogariasaopaulo.com.br/tadalafila/p', items: [{ sellers: [{ sellerId: '1', commertialOffer: { AvailableQuantity: 5, Price: 25, ListPrice: 50 } }] }] },
    { productId: 'ok1', productName: 'Vitamina D3 2000UI 60 Cápsulas Lavitan', link: 'https://www.drogariavenancio.com.br/vitamina-d3/p', items: [{ sellers: [{ sellerId: '1', commertialOffer: { AvailableQuantity: 5, Price: 22.9, ListPrice: 39.9 } }] }] },
  ], { loja: 'venancio', categoria_hint: 'saude' });
  assert.equal(farmMix.length, 1);
  assert.equal(farmMix[0].titulo, 'Vitamina D3 2000UI 60 Cápsulas Lavitan');

  // RE_PECA_REPOSICAO bloqueia peças avulsas de eletrodomésticos e libera eletros reais
  const eletroMix = L.lerCatalogoVtex([
    { productId: 'p1', productName: 'Recipiente Evaporador para Geladeira Brastemp', link: 'https://www.brastemp.com.br/recipiente-evaporador/p', items: [{ sellers: [{ sellerId: '1', commertialOffer: { AvailableQuantity: 5, Price: 49.9, ListPrice: 89.9 } }] }] },
    { productId: 'p2', productName: 'Geladeira Brastemp Frost Free 385 Litros Duplex', link: 'https://www.brastemp.com.br/geladeira-385l/p', items: [{ sellers: [{ sellerId: '1', commertialOffer: { AvailableQuantity: 5, Price: 2599, ListPrice: 3298 } }] }] },
  ], { loja: 'brastemp', categoria_hint: 'casa' });
  assert.equal(eletroMix.length, 1);
  assert.match(eletroMix[0].titulo, /Geladeira Brastemp/);
});

test('Bloco A: lib/mercado.js (drogariasaopaulo=pacheco, marca em títulos curtos <=4 tokens e Bloqueio 2 < R$ 80)', () => {
  // drogariasaopaulo mapeia para pacheco (mesmo grupo DPSP) — não compete contra si mesma
  const avDpsp = L.avaliarPrecoMercado(
    { loja: 'pacheco', titulo: 'Fralda Pampers Confort Sec G 60', preco: 69.9, preco_de: 109.9 },
    [
      { titulo: 'Fralda Pampers Confort Sec G 60', preco: 69.9, loja_nome: 'Drogaria São Paulo', loja_id: 'pacheco' },
      { titulo: 'Fralda Pampers Confort Sec G 60', preco: 84.9, loja_nome: 'Amazon', loja_id: 'amazon' },
    ],
    { modo_radar: true },
  );
  assert.equal(avDpsp.aprovar, true);

  // Proteção de marca em títulos curtos <= 4 tokens
  const casadosErrado = L.casarProdutosMercado(
    { titulo: 'Creatina em Pó Lavitan 300g', preco: 49.9 },
    [
      { titulo: 'Creatina Monohidratada FTW 300g', preco: 39.9, loja_id: 'amazon' },
      { titulo: 'Creatina em Pó Lavitan 300g', preco: 64.9, loja_id: 'amazon' },
    ],
  );
  assert.equal(casadosErrado.length, 1);
  assert.match(casadosErrado[0].titulo, /Lavitan/i);

  // Bloqueio 2 calibrado para ticket < R$ 80 (5% vs 7% acima de R$ 80)
  const avTicketBaixoOk = L.avaliarPrecoMercado(
    { loja: 'pacheco', titulo: 'Vitamina C Lavitan 60 Comprimidos', preco: 37.5, preco_de: 49.9 },
    [{ titulo: 'Vitamina C Lavitan 60 Comprimidos', preco: 40.0, loja_id: 'amazon' }],
    { modo_radar: true },
  );
  assert.equal(avTicketBaixoOk.aprovar, true, '6.25% abaixo da mediana em ticket < R$ 80 deve aprovar');

  const avTicketBaixoBloq = L.avaliarPrecoMercado(
    { loja: 'pacheco', titulo: 'Vitamina C Lavitan 60 Comprimidos', preco: 39.0, preco_de: 49.9 },
    [{ titulo: 'Vitamina C Lavitan 60 Comprimidos', preco: 40.0, loja_id: 'amazon' }],
    { modo_radar: true },
  );
  assert.equal(avTicketBaixoBloq.aprovar, false);
  assert.equal(avTicketBaixoBloq.motivo, 'sem_desconto_mercado');

  const avTicketAltoBloq = L.avaliarPrecoMercado(
    { loja: 'pacheco', titulo: 'Whey Protein Isolado Dux 900g', preco: 188.0, preco_de: 249.9 },
    [{ titulo: 'Whey Protein Isolado Dux 900g', preco: 200.0, loja_id: 'amazon' }],
    { modo_radar: true },
  );
  assert.equal(avTicketAltoBloq.aprovar, false, '6% abaixo da mediana em ticket >= R$ 80 continua bloqueado');
});

test('Bloco A: paginação rotativa VTEX (0..11, 12..23, 24..35) e reserva de Top para 18h-23h', () => {
  const baseVtex = 'https://www.drogariaspacheco.com.br/api/catalog_system/pub/products/search/fraldas?fq=sellerId:1&O=OrderByBestDiscountDESC&_from=0&_to=11';
  assert.ok(RF.paginarUrlVtex(baseVtex, 0).includes('_from=0&_to=11'));
  assert.ok(RF.paginarUrlVtex(baseVtex, 1).includes('_from=12&_to=23'));
  assert.ok(RF.paginarUrlVtex(baseVtex, 2).includes('_from=24&_to=35'));
  assert.ok(RF.paginarUrlVtex(baseVtex, 3).includes('_from=0&_to=11'));

  // Reserva 35% do Top para 18h-23h quando maxTop=20 (antes das 18h trava em 13; após 18h libera até 20)
  const cfg = cfgAudit([{ chave: 'radar.top_max_dia', valor: '20' }]);
  const top13Hoje = Array.from({ length: 13 }, (_, i) => ({
    oferta_id: 't' + i,
    produto_id: 'amz_T0000000' + String(i).padStart(2, '0'),
    categoria: ['casa', 'moda', 'tech', 'beleza'][i % 4],
    top: true,
    ts: AGORA_14H - (i + 1) * 600000,
  }));
  const candForte = {
    radar_key: 'pb_777',
    produto_id: 'amz_B0PRIME001',
    loja: 'amazon',
    categoria: 'perfumes',
    categoria_confianca: 1,
    categoria_indefinida: false,
    titulo: 'Perfume Lattafa Khamrah 100ml',
    preco: 159.9,
    preco_de: 299.9,
    desconto_pct: 47,
    imagem: 'https://m.media-amazon.com/images/I/51x.jpg',
    url: 'https://www.amazon.com.br/dp/B0PRIME001',
    resolved: true,
    fonte_radar: 'promobit',
  };
  const fin14h = L.finalizarRadar(
    { opcoes: { modo: 'agendado', ts: AGORA_14H, categorias: ['perfumes'], lojas: ['amazon'], limite_alvo: 2 }, candidatos: [Object.assign({}, candForte)], reqs3: [], reqsPag: [], reqsMercado: [] },
    [], top13Hoje, [], cfg, [], [],
  );
  assert.equal(fin14h.ofertasNovas[0].top, false, 'Às 14h, após 13/20 (65%), reserva 35% para 18h-23h');

  const fin19h = L.finalizarRadar(
    { opcoes: { modo: 'agendado', ts: AGORA_19H, categorias: ['perfumes'], lojas: ['amazon'], limite_alvo: 2 }, candidatos: [Object.assign({}, candForte)], reqs3: [], reqsPag: [], reqsMercado: [] },
    [], top13Hoje, [], cfg, [], [],
  );
  assert.equal(fin19h.ofertasNovas[0].top, true, 'Às 19h30 (prime-time), libera a reserva de 35%');
});

test('Bloco B + Oficial Farma: Shopify KpopAlbums (BRL + envio internacional), Magento Oficial Farma, AliExpress e Shopee 4 lojas K-Pop', () => {
  // 1) KpopAlbums Shopify parser + aviso envio internacional no Telegram
  const shopifyJson = JSON.stringify({
    products: [
      {
        id: 101,
        title: 'STRAY KIDS - ATE Mini Album',
        handle: 'stray-kids-ate-mini-album',
        product_type: 'Album',
        images: [{ src: 'https://cdn.shopify.com/s/files/1/0001/products/ate.jpg' }],
        variants: [{ available: true, price: '129.90', compare_at_price: '199.90' }],
      },
      {
        id: 102,
        title: 'Sold Out Album',
        handle: 'sold-out-album',
        variants: [{ available: false, price: '99.90', compare_at_price: '159.90' }],
      },
    ],
  });
  const kpa = L.lerCatalogoShopify(shopifyJson, { loja: 'kpopalbums', categoria_hint: 'kpop', envio_internacional: true });
  assert.equal(kpa.length, 1);
  assert.equal(kpa[0].loja, 'kpopalbums');
  assert.equal(kpa[0].url, 'https://www.kpopalbums.com/products/stray-kids-ate-mini-album');
  assert.equal(kpa[0].envio_internacional, true);
  assert.equal(kpa[0].desconto_pct, 35);
  assert.ok(!RF.CATALOGOS_SHOPIFY_KPOP.some((x) => x.loja === 'kpopmerch'), 'Não coletar kpopmerch.com (USD)');

  const cfg = cfgAudit();
  const tgIntl = L.textoTelegram({
    oferta_id: 'o_kpa', produto_id: kpa[0].produto_id, loja: 'kpopalbums', categoria: 'kpop',
    titulo: kpa[0].titulo, preco: kpa[0].preco, selo: 'sem_ref',
    links_manuais: JSON.stringify({ preco_de: kpa[0].preco_de, envio_internacional: true }),
  }, kpa[0].url, cfg);
  assert.match(tgIntl, /Envio internacional/i);

  // 2) Lojas K-pop internacionais + AliExpress reconhecidas em lojas.js/links.js/config.js
  for (const [u, esp] of [
    ['https://www.kpopalbums.com/products/bts-proof', 'kpopalbums'],
    ['https://www.cokodive.com/products/army-bomb', 'cokodive'],
    ['https://daebak.co/products/twice-lightstick', 'daebak'],
    ['https://www.cdjapan.co.jp/product/UPCH-1234', 'cdjapan'],
    ['https://www.yesasia.com/global/bts-album/12345', 'yesasia'],
    ['https://kpop1004.com/products/blackpink-vinyl', 'kpop1004'],
    ['https://pt.aliexpress.com/item/1005007654321.html?aff=1', 'aliexpress'],
    ['https://www.oficialfarma.com.br/creatina-monohidratada-200g', 'oficialfarma'],
  ]) {
    const id = L.identificar(u);
    assert.equal(id.loja, esp, u);
    assert.ok(L.PROGRAMAS_AFILIADO[esp], `PROGRAMAS_AFILIADO.${esp}`);
  }
  assert.equal(L.identificar('https://pt.aliexpress.com/item/1005007654321.html').produto_id, 'ali_1005007654321');
  assert.equal(L.naLoja('aliexpress'), 'no AliExpress');

  // 3) Oficial Farma Magento 2 parser + afiliado.oficialfarma + bloqueio Rx
  const htmlOficialFarma = `
    <div class="product-item-info" id="product-item-info_123">
      <img class="product-image-photo" src="https://www.oficialfarma.com.br/media/catalog/product/c/r/creatina.jpg?optimize=medium&amp;width=338" />
      <a class="product-item-link" href="https://www.oficialfarma.com.br/creatina-monohidratada-200g">Creatina Monohidratada 200g</a>
      <span id="old-price-123" data-price-amount="39.92" data-price-type="oldPrice"></span>
      <span id="product-price-123" data-price-amount="26" data-price-type="finalPrice"></span>
    </div>
    <div class="product-item-info" id="product-item-info_999">
      <a class="product-item-link" href="https://www.oficialfarma.com.br/tadalafila-20mg">Tadalafila 20mg 30 Cápsulas</a>
      <span data-price-amount="50" data-price-type="oldPrice"></span>
      <span data-price-amount="30" data-price-type="finalPrice"></span>
    </div>
  `;
  const itensOf = L.lerCatalogoMagento(htmlOficialFarma, { loja: 'oficialfarma', categoria_hint: 'saude' });
  assert.equal(itensOf.length, 1);
  assert.equal(itensOf[0].loja, 'oficialfarma');
  assert.equal(itensOf[0].preco, 26);
  assert.equal(itensOf[0].preco_de, 39.92);
  assert.equal(itensOf[0].desconto_pct, 35);
  assert.ok(itensOf[0].imagem.includes('oficialfarma.com.br'));

  const cfgAfOf = cfgAudit([{ chave: 'afiliado.oficialfarma', valor: 'utm_source=oferto_aff' }]);
  const linksOf = L.planejarLinks({ oferta_id: 'o_of', loja: 'oficialfarma', categoria: 'saude', url: itensOf[0].url }, cfgAfOf, AGORA_14H);
  assert.ok(linksOf[0].url.includes('utm_source=oferto_aff'));

  // 4) Shopee 4 lojas K-pop sem shop_id rodam via busca_keyword no agendado e auto-resolvem shop_id
  const cfgSh = cfgAudit([{ chave: 'shopee.app_id', valor: '12345' }, { chave: 'shopee.secret', valor: 'sec' }]);
  const tsKpopFever = 3 * 120000; // índice 3 = kpopfever.br
  const planSh = L.planejarFontesRadar(cfgSh, { modo: 'agendado', ts: tsKpopFever, categorias: ['kpop'] });
  const fKpopFever = planSh.fontesShopee.find((f) => f.shop_username === 'kpopfever.br');
  assert.ok(fKpopFever, 'kpopfever.br deve entrar no rodízio agendado via busca_keyword');
  assert.equal(fKpopFever.resolver_shop_id, true);

  const respShMock = planSh.fontesShopee.map((f) => (f.shop_username === 'kpopfever.br' ? {
    data: {
      productOfferV2: {
        nodes: [{
          itemId: '987654321', shopId: '555666777', shopName: 'KPOP FEVER',
          productName: 'Album BTS Proof Oficial', priceMin: '149.90', priceDiscountRate: 30,
          commissionRate: '0.08', sales: 120, ratingStar: '4.9',
          imageUrl: 'https://down-br.img.susercontent.com/file/abc.jpg',
          productLink: 'https://shopee.com.br/kpopfever.br/987654321',
        }],
      },
    },
  } : { data: { productOfferV2: { nodes: [] } } }));
  const selSh = L.selecionarCandidatosRadar(planSh, [], respShMock, [], [], cfgSh, []);
  assert.equal(selSh.shop_ids_descobertos['kpopfever.br'], '555666777');

  const planShResolvido = L.planejarFontesRadar(cfgSh, { modo: 'agendado', ts: tsKpopFever, categorias: ['kpop'], kpop_shop_ids: selSh.shop_ids_descobertos });
  const fKpopFeverRes = planShResolvido.fontesShopee.find((f) => f.shop_username === 'kpopfever.br');
  assert.equal(fKpopFeverRes.shop_id, '555666777', 'Após descoberta, passa a consultar direto por shopId');

  // 5) UMusic expandido + Amazon 1P cobrindo todos os subgrupos
  assert.ok(RF.UMUSIC_VTEX_BUSCAS.some((u) => u.includes('ft=bts')));
  assert.ok(RF.UMUSIC_VTEX_BUSCAS.some((u) => u.includes('ft=blackpink')));
  assert.ok(RF.UMUSIC_VTEX_BUSCAS.some((u) => u.includes('ft=lisa')));
  assert.ok(RF.UMUSIC_VTEX_BUSCAS.some((u) => u.includes('ft=jennie')));
  for (const cat of ['perfumes', 'beleza', 'saude', 'bebe', 'moda', 'casa', 'tech']) {
    assert.ok(RF.BUSCAS_AMAZON_NICHO.some((q) => q.cat === cat), `BUSCAS_AMAZON_NICHO deve cobrir ${cat}`);
  }
});

test('Bloco C + D: Enxugar Nuvemshop/Magento/páginas/mercado, batch/timeout, tree-shaking, docker-compose, backup.sh e config segura', () => {
  const { local } = B.gerar();
  const wfRadar = local['04-radar-ofertas.json'];
  const wfRel = local['03-relatorio-diario.json'];

  assert.equal(wfRel.settings.saveDataSuccessExecution, 'none');

  // Checar mercado radar (batchSize=2, batchInterval=250) e Baixar foto radar (timeout=8000)
  const noMerc = wfRadar.nodes.find((n) => n.name === 'Checar mercado radar');
  assert.deepEqual(noMerc.parameters.options.batching.batch, { batchSize: 2, batchInterval: 250 });
  const noFoto = wfRadar.nodes.find((n) => n.name === 'Baixar foto radar');
  assert.equal(noFoto.parameters.options.timeout, 8000);

  // Tree-shaking modularizado: nós leves não carregam fluxos/extrator/radar completos
  const noChecarEnv = wfRadar.nodes.find((n) => n.name === 'Checar envio radar');
  const noResLote = wfRadar.nodes.find((n) => n.name === 'Resultado lote radar');
  const noPlan = wfRadar.nodes.find((n) => n.name === 'Planejar');
  const noRed1 = wfRadar.nodes.find((n) => n.name === 'Aplicar redir 1');
  for (const no of [noChecarEnv, noResLote, noPlan, noRed1]) {
    assert.ok(!no.parameters.jsCode.includes('"fluxos":function'), `${no.name} não deve embutir fluxos`);
    assert.ok(!no.parameters.jsCode.includes('"extrator":function'), `${no.name} não deve embutir extrator`);
    assert.ok(!no.parameters.jsCode.includes('"radar":function'), `${no.name} não deve embutir radar`);
  }

  // Enxugar fontes web: Nuvemshop gigante (header 420KB antes do 1º card) preserva o card!
  const noEnxWeb = wfRadar.nodes.find((n) => n.name === 'Enxugar fontes web');
  const htmlNuvemGigante = '<html><head><title>K</title></head><body><nav>' + 'n'.repeat(420000) + '</nav><div data-component="product-list-item" data-product-id="77"><a href="https://www.hopescolor.com/produtos/bts-album/" title="BTS Album Oficial">BTS</a><div data-variants="[{&quot;available&quot;:true,&quot;price_number&quot;:199.9,&quot;compare_at_price_number&quot;:299.9,&quot;image_url&quot;:&quot;https://acdn-us.mitiendanube.com/stores/1/products/bts.jpg&quot;}]"></div></div></body></html>';
  const htmlOfGigante = '<html><head><title>OF</title></head><body><header>' + 'h'.repeat(400000) + '</header><div class="product-item-info" id="product-item-info_5"><a class="product-item-link" href="https://www.oficialfarma.com.br/colageno-verisol">Colágeno Verisol 250g</a><span data-price-amount="80" data-price-type="oldPrice"></span><span data-price-amount="49.9" data-price-type="finalPrice"></span></div></body></html>';
  const fnEnxWeb = vm.runInNewContext(`(function($, $input){ ${noEnxWeb.parameters.jsCode} })`, {});
  const resEnxWeb = fnEnxWeb(
    () => ({ first: () => ({ json: { fontesWeb: [{ tipo: 'nuvemshop_kpop' }, { tipo: 'magento_catalogo' }] } }) }),
    { all: () => [{ json: { statusCode: 200, body: htmlNuvemGigante } }, { json: { statusCode: 200, body: htmlOfGigante } }] },
  );
  const parsedNuvem = L.lerNuvemshopKpop(resEnxWeb[0].json.body, 'hopescolor', 'https://www.hopescolor.com/produtos/');
  assert.equal(parsedNuvem.length, 1, 'Enxugar Nuvemshop deve iniciar no 1º card antes de truncar em 350 KB');
  const parsedMag = L.lerCatalogoMagento(resEnxWeb[1].json.body, { loja: 'oficialfarma', categoria_hint: 'saude' });
  assert.equal(parsedMag.length, 1, 'Enxugar Magento deve iniciar no 1º card antes de truncar em 350 KB');

  // Enxugar páginas radar e Enxugar mercado radar existem e funcionam em VM
  const noEnxPag = wfRadar.nodes.find((n) => n.name === 'Enxugar páginas radar');
  const noEnxMerc = wfRadar.nodes.find((n) => n.name === 'Enxugar mercado radar');
  assert.ok(noEnxPag && noEnxMerc);

  const fnEnxPag = vm.runInNewContext(`(function($input){ ${noEnxPag.parameters.jsCode} })`, {});
  const htmlPdp = '<html><head><style>.a{color:red}</style><script type="application/ld+json">{"@type":"Product","name":"Fone"}</script><script>window.lixo="' + 'x'.repeat(80000) + '";</script></head><body><h1>Fone</h1><svg><path/></svg></body></html>';
  const resPag = fnEnxPag({ all: () => [{ json: { statusCode: 200, body: htmlPdp, headers: { cookie: 'big' } } }] });
  assert.ok(resPag[0].json.body.includes('application/ld+json'));
  assert.ok(!resPag[0].json.body.includes('window.lixo'));
  assert.ok(!('headers' in resPag[0].json));

  const fnEnxMerc = vm.runInNewContext(`(function($, $input){ ${noEnxMerc.parameters.jsCode} })`, {});
  const htmlZoom = '<html><head>' + 'x'.repeat(20000) + '</head><body><script id="__NEXT_DATA__" type="application/json">' + JSON.stringify({ props: { initialReduxState: { hits: { hits: [{ name: 'Prod', price: 100 }] } }, hugeExtra: 'z'.repeat(300000) } }) + '</script></body></html>';
  const resMerc = fnEnxMerc(
    () => ({ first: () => ({ json: { reqsMercado: [{ fonte: 'zoom' }] } }) }),
    { all: () => [{ json: { statusCode: 200, body: htmlZoom, headers: { x: 'y' } } }] },
  );
  assert.ok(resMerc[0].json.body.length < 500, 'Enxugar mercado Zoom deve descartar campos gigantes');
  assert.ok(resMerc[0].json.body.includes('"Prod"'));

  // docker-compose.yml e backup.sh
  const dc = fs.readFileSync(path.join(__dirname, '..', 'servidor-local', 'docker-compose.yml'), 'utf8');
  assert.match(dc, /EXECUTIONS_DATA_SAVE_ON_SUCCESS:\s*"none"/);
  assert.match(dc, /EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS:\s*"false"/);
  const bk = fs.readFileSync(path.join(__dirname, '..', 'servidor-local', 'backup.sh'), 'utf8');
  assert.match(bk, /PRAGMA wal_checkpoint\(TRUNCATE\);/);

  // Bloco D seguro em lib/config.js
  const cfgPadrao = L.padrao();
  assert.equal(cfgPadrao.radar.top_max_dia, 40);
  assert.equal(cfgPadrao.amazon.mostrar_preco, true);
  assert.equal(cfgPadrao.telegram.fechar_topicos_oferta, false);
  assert.match(cfgPadrao.telegram.canais_desc.beleza, /Skincare/i);
  assert.match(cfgPadrao.telegram.canais_desc.kpop, /KpopAlbums/i);
  assert.match(cfgPadrao.telegram.canais_desc.saude, /Oficial Farma/i);
});
