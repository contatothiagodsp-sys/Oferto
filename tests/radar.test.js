'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const L = require('../lib');

const AGORA = new Date('2026-11-18T14:00:00Z').getTime();
const HS = { 'x-telegram-bot-api-secret-token': 'segredo' };

function cfgRadar(extra) {
  return L.montarConfig([
    { chave: 'admins', valor: '111' },
    { chave: 'bot_token', valor: 'TOK_ADM' },
    { chave: 'bot_token_grupo', valor: 'TOK_GRP' },
    { chave: 'grupo_id', valor: '-1001234567890' },
    { chave: 'webhook_secret', valor: 'segredo' },
    { chave: 'topico.casa', valor: '10' },
    { chave: 'topico.tech', valor: '11' },
    { chave: 'topico.beleza', valor: '12' },
    { chave: 'topico.bebe', valor: '13' },
    { chave: 'topico.top', valor: '2' },
    { chave: 'amazon.tag_padrao', valor: 'minhatag-20' },
    { chave: 'ml.etiqueta', valor: 'meu_meli_tag:998877' },
    { chave: 'shopee.app_id', valor: '183999' },
    { chave: 'shopee.secret', valor: 'segredo-shopee' },
    { chave: 'shein.afiliado_id', valor: 'shn_aff_1' },
  ].concat(extra || []));
}

const msgPriv = (text) => ({
  message: { message_id: 42, text, chat: { id: 111, type: 'private' }, from: { id: 111 } },
});

function rodarNode(bundleCode, inputsByNode, itemJson) {
  const $ = (nome) => ({
    all: () => (inputsByNode[nome] || []).map((j) => ({ json: j })),
    first: () => ({ json: (inputsByNode[nome] && inputsByNode[nome][0]) || {} }),
    item: { json: (inputsByNode[nome] && inputsByNode[nome][0]) || itemJson || {} },
  });
  const ctx = {
    $,
    $input: { all: () => [{ json: itemJson || {} }], first: () => ({ json: itemJson || {} }) },
    $json: itemJson || {},
    Object, Array, String, Number, Boolean, Math, Date, RegExp, JSON, Error, Set, Map,
    encodeURIComponent, decodeURIComponent, isNaN, isFinite, parseInt, parseFloat,
    console,
  };
  return vm.runInNewContext(`(function(){ ${bundleCode} })()`, ctx);
}

test('Logitech pedais vai para tech, aceita atalho sem barra e mover topico m|tech|<id>', () => {
  const cfg = cfgRadar();

  // 1) Classificação direta do título que antes caía no fallback Casa
  const catPedal = L.classificarCategoria(
    'Pedais de corrida Logitech G PRO Racing Personalizáveis e Design Modular | Molas e elastômeros totalmente personalizáveis',
    cfg,
    'Amazon Games e Consoles Acessórios Volantes e Pedais',
  );
  assert.equal(catPedal.categoria, 'tech');

  // 2) Página Amazon com breadcrumbs reais reforçando tech sobre palavras ambíguas de casa
  const prep = L.prepararOferta({
    rota: 'oferta',
    auto_link: true,
    chat_id: 111,
    user_id: 111,
    ts: AGORA,
    oferta: {
      loja: 'amazon',
      produto_id: 'amz_B09N999999',
      url: 'https://www.amazon.com.br/dp/B09N999999',
      categoria: 'casa',
      titulo: '',
      preco: null,
      imagem: '',
      links_manuais: { modo_link: true, categoria_auto: true },
    },
  }, [], cfg);
  const htmlPedal = [
    '<html><head><title>Pedais de corrida Logitech G PRO Racing Personalizáveis | Amazon</title></head><body>',
    '<div id="wayfinding-breadcrumbs_feature_div"><ul><li>Games e Consoles</li><li>Simuladores</li><li>Pedais de Corrida</li></ul></div>',
    '<span id="productTitle">Pedais de corrida Logitech G PRO Racing Personalizáveis e Design Modular</span>',
    '<span class="priceToPay"><span class="a-offscreen">R$ 2.730,18</span></span>',
    '<span class="basisPrice"><span class="a-offscreen">R$ 2.999,90</span></span>',
    '<img id="landingImage" data-old-hires="https://m.media-amazon.com/images/I/pedal.jpg" />',
    '</body></html>',
  ].join('');
  const joined = L.juntarPagina(prep, { statusCode: 200, data: htmlPedal }, cfg);
  assert.equal(joined.oferta.categoria, 'tech');

  // 3) Atalho sem barra ("tech https://...") fixa a categoria imediatamente
  const atalho = L.parseMensagemLink(msgPriv('tech https://www.amazon.com.br/dp/B09N999999 2730,18').message, cfg);
  assert.equal(atalho.ok, true);
  assert.equal(atalho.oferta.categoria, 'tech');
  assert.equal(atalho.oferta.links_manuais.categoria_auto, false);

  // 4) Botão ↪️ Mover tópico no card publicado mantém inline_keyboard[1] intacto (Top + Encerrar)
  const ofertaPub = Object.assign({}, joined.oferta, {
    oferta_id: 'o_pedal_1',
    categoria: 'casa',
    status: 'aprovada',
    selo: 'pronta',
    links_manuais: JSON.stringify({ modo_link: true, categoria_auto: true, _afiliado: '' }),
  });
  const kb = L.tecladoPublicada(ofertaPub, 0, cfg);
  assert.equal(kb.inline_keyboard[1][0].callback_data, 'p|o_pedal_1');
  assert.equal(kb.inline_keyboard[1][1].callback_data, 'z|o_pedal_1');
  assert.ok(kb.inline_keyboard[2].some((b) => b.callback_data === 'm|tech|o_pedal_1'));

  // 5) Callback m|tech|o_pedal_1 apaga post em Casa (thread 10), republica em Tech (thread 11) e registra novo post
  const clsCb = L.classificarUpdate({
    callback_query: { id: 'cb1', from: { id: 111 }, data: 'm|tech|o_pedal_1', message: { message_id: 88, chat: { id: 111, type: 'private' } } },
  }, HS, cfg, AGORA);
  assert.equal(clsCb.rota, 'pospub');
  assert.equal(clsCb.acao, 'm');
  assert.equal(clsCb.nova_categoria, 'tech');

  const decMove = L.decidirPosPublicacao(
    clsCb,
    [ofertaPub],
    [{ oferta_id: 'o_pedal_1', plataforma: 'tg', categoria: 'casa', message_id: 501, link: 'https://t.me/c/1234567890/10/501', ts: AGORA }],
    [{ oferta_id: 'o_pedal_1', categoria: 'casa', plataforma: 'tg', url: 'https://www.amazon.com.br/dp/B09N999999?tag=minhatag-20' }],
    cfg,
  );
  assert.deepEqual(decMove.update, { oferta_id: 'o_pedal_1', categoria: 'tech' });
  assert.ok(decMove.chamadas.some((c) => c.bot === 'grupo' && c.metodo === 'deleteMessage' && c.payload.message_id === 501));
  const novoPostTg = decMove.chamadas.find((c) => c.bot === 'grupo' && (c.metodo === 'sendPhoto' || c.metodo === 'sendMessage'));
  assert.equal(novoPostTg.payload.message_thread_id, 11);

  const resMove = L.resultadoChamadas(
    decMove.chamadas,
    decMove.chamadas.map((c) => ((c.metodo === 'sendPhoto' || c.metodo === 'sendMessage') ? { ok: true, result: { message_id: 777 } } : { ok: true, result: true })),
    cfg,
    AGORA,
  );
  assert.equal(resMove.posts.length, 1);
  assert.equal(resMove.posts[0].categoria, 'tech');

  const resIgnora = L.resultadoChamadas(
    [{ metodo: 'deleteMessage', bot: 'grupo', payload: { message_id: 501 } }],
    [{ ok: false, error_code: 400, description: 'Bad Request: message to delete not found' }],
    cfg,
    AGORA,
  );
  assert.equal(resIgnora.alertas.length, 0);
});

test('Cupons ativos + Produto + Cupom = quanto fica + parcelamento sem juros em Amazon e ML', () => {
  const cfg = cfgRadar();

  // 1) Amazon: cupom no buybox (15% + código BLACKPRIME15) + 12x de R$ 241,62 sem juros
  const prepAmz = L.prepararOferta(
    L.classificarUpdate(msgPriv('https://www.amazon.com.br/dp/B09PRIME15'), HS, cfg, AGORA),
    [],
    cfg,
  );
  const htmlAmz = [
    '<html><body>',
    '<div id="wayfinding-breadcrumbs_feature_div"><ul><li>Eletrônicos</li></ul></div>',
    '<span id="productTitle">Echo Studio Áudio Espacial</span>',
    '<span class="priceToPay"><span class="a-offscreen">R$ 2.899,44</span></span>',
    '<div id="couponsInBuybox_feature_div">Salve o cupom 15% no checkout com código BLACKPRIME15</div>',
    '<span>em até 12x de R$ 241,62 sem juros no cartão</span>',
    '</body></html>',
  ].join('');
  const amz = L.juntarPagina(prepAmz, { statusCode: 200, data: htmlAmz }, cfg);
  assert.equal(amz.oferta.links_manuais.cupom, 'BLACKPRIME15');
  assert.equal(amz.oferta.links_manuais.preco_sem_cupom, 2899.44);
  assert.equal(amz.oferta.preco, 2464.52);
  assert.match(amz.oferta.links_manuais.parcelamento, /12x.*sem juros/i);

  const linkAmz = 'https://www.amazon.com.br/dp/B09PRIME15?tag=minhatag-20';
  const tgAmz = L.textoTelegram(amz.oferta, linkAmz, cfg);
  assert.match(tgAmz, /🏷️ Produto: .* \+ 🎟️ Cupom .* =/);
  assert.match(tgAmz, /<code>BLACKPRIME15<\/code>/);
  assert.match(tgAmz, /💳 .*sem juros/i);
  assert.match(L.textoWhatsAppGrupo(amz.oferta, linkAmz, cfg), /Produto: .*Cupom.*=/);
  assert.match(L.textoWhatsAppCanal(amz.oferta, linkAmz, cfg), /sem juros/i);
  const cardTxt = L.cardAprovacao(amz.oferta, cfg, []).text;
  assert.match(cardTxt, /💳 .*sem juros/i);
  assert.match(cardTxt, /🎟️ cupom BLACKPRIME15/);

  // 2) Amazon com amazon.mostrar_preco = nao oculta R$, %, Produto+Cupom e parcelamento
  const cfgSemPreco = cfgRadar([{ chave: 'amazon.mostrar_preco', valor: 'nao' }]);
  const tgOculto = L.textoTelegram(amz.oferta, linkAmz, cfgSemPreco);
  assert.equal(/R\$|%|\bsem juros\b/i.test(tgOculto), false);

  // 3) Admin informando preço + cupom percentual + parcelamento no Mercado Livre ("Produto + Cupom = quanto fica")
  const pMl = L.parseMensagemLink(msgPriv('https://www.mercadolivre.com.br/produto/p/MLB123456 R$ 400,00 cupom MELI15 15% 10x sem juros').message, cfg);
  assert.equal(pMl.ok, true);
  assert.equal(pMl.oferta.preco, 340);
  assert.equal(pMl.oferta.links_manuais.preco_sem_cupom, 400);
  assert.equal(pMl.oferta.links_manuais.cupom, 'MELI15');
  assert.match(pMl.oferta.links_manuais.parcelamento, /10x.*sem juros/i);

  const tgMl = L.textoTelegram(pMl.oferta, 'https://www.mercadolivre.com.br/p/MLB123456', cfg);
  assert.match(tgMl, /🏷️ Produto: <s>R\$ 400,00<\/s> \+ 🎟️ Cupom <code>MELI15<\/code> =/);
  assert.match(tgMl, /R\$ 340,00/);
  assert.match(tgMl, /10x de R\$ 34,00 sem juros/);

  // 4) Mercado Livre /social/ extrai installments no_interest + R$ OFF
  const rSocial = L.lerPaginaProduto({
    statusCode: 200,
    data: '<html><head><link rel="canonical" href="https://www.mercadolivre.com.br/p/MLB777888999"/></head><body><script>{"name":"Fritadeira Air Fryer 5L","price":329.90,"installments":{"text":"10x {price}","no_interest":true,"values":[{"price":{"value":32.99}}]},"coupon":"R$ 30 OFF no anúncio"}</script></body></html>',
  }, 'https://www.mercadolivre.com.br/social/oferta-teste');
  assert.match(rSocial.parcelamento, /10x de R\$ 32,99 sem juros/i);
  assert.match(rSocial.cupom_auto, /R\$ 30 OFF/i);
});

test('Shein, TikTok Shop, deeplinks e etiqueta do Mercado Livre', () => {
  const cfg = cfgRadar();

  const sh = L.identificar('https://br.shein.com/Vestido-Midi-Elegante-p-12345678.html?aff_id=outro123&utm_source=x');
  assert.equal(sh.loja, 'shein');
  assert.equal(sh.produto_id, 'shn_12345678');
  assert.equal(L.naLoja('shein'), 'na Shein');
  assert.equal(sh.url_limpa.includes('aff_id='), false);

  const ttk = L.identificar('https://www.tiktok.com/view/product/1729400001234567890?utm_campaign=terceiro');
  assert.equal(ttk.loja, 'tiktok');
  assert.equal(ttk.produto_id, 'tk_1729400001234567890');
  assert.equal(L.naLoja('tiktok'), 'no TikTok Shop');

  // Vídeo comum do TikTok não deve ser tratado como produto
  assert.equal(L.identificar('https://www.tiktok.com/@creator/video/7400000000001').loja, 'outra');

  for (const u of [
    'https://onelink.shein.com/3/abc',
    'https://shein.top/xyz12',
    'https://vt.tiktok.com/ZSYabc123/',
    'https://www.tiktok.com/t/ZTNabc123/',
    'https://click.linksynergy.com/deeplink?id=123&mid=456&murl=https%3A%2F%2Fbr.shein.com%2Fp-999.html',
  ]) {
    assert.equal(L.ehCurto(u), true, u);
  }

  const unp = L.desempacotarRedirLoja('https://click.linksynergy.com/deeplink?id=terc&mid=45&murl=https%3A%2F%2Fbr.shein.com%2FVestido-p-999999.html%3Faff_id%3Doutro');
  assert.equal(unp, 'https://br.shein.com/Vestido-p-999999.html?aff_id=outro');
  assert.equal(L.identificar(unp).produto_id, 'shn_999999');

  // Etiqueta do Mercado Livre e Shein afiliado na montagem de links
  const mlLinks = L.planejarLinks({ loja: 'ml', categoria: 'tech', url: 'https://www.mercadolivre.com.br/p/MLB123456', links_manuais: {} }, cfg, AGORA);
  assert.ok(mlLinks.every((l) => l.url.includes('matt_word=meu_meli_tag') && l.url.includes('matt_tool=998877')));

  const shLinks = L.planejarLinks({ loja: 'shein', categoria: 'beleza', url: 'https://br.shein.com/Vestido-p-12345678.html', links_manuais: {} }, cfg, AGORA);
  assert.ok(shLinks.every((l) => l.url.includes('aff_id=shn_aff_1')));
});

test('Radar multi-fonte coleta, deduplica 72h, troca afiliados, suporta comandos e respeita tabelas', () => {
  const cfg = cfgRadar([{ chave: 'radar.canais_telegram', valor: 'canal_teste' }]);

  // 1) Comandos /radar, /radar off, /buscas e /modo piloto
  const rrPerf = L.interpretarComandoRadar('/radar perfume', cfg);
  assert.equal(rrPerf.acao, 'buscar');
  assert.equal(rrPerf.termo, 'perfume');

  const rrMl = L.interpretarComandoRadar('/radar ml eletro', cfg);
  assert.deepEqual(rrMl.lojas, ['ml']);
  assert.equal(rrMl.termo, 'eletro');

  const clsRadar = L.classificarUpdate(msgPriv('/radar perfume'), HS, cfg, AGORA);
  assert.equal(clsRadar.rota, 'radar');
  assert.equal(clsRadar.opcoes.termo, 'perfume');

  const clsOff = L.classificarUpdate(msgPriv('/radar off'), HS, cfg, AGORA);
  assert.equal(clsOff.rota, 'config');
  assert.deepEqual(clsOff.upserts, [{ chave: 'radar.ativo', valor: 'nao' }]);

  const clsBuscas = L.classificarUpdate(msgPriv('/buscas perfume, airfryer, monitor'), HS, cfg, AGORA);
  assert.equal(clsBuscas.rota, 'config');
  assert.equal(clsBuscas.upserts[0].chave, 'radar.palavras');
  assert.equal(clsBuscas.upserts[0].valor, 'perfume, airfryer, monitor');
  assert.deepEqual(
    cfgRadar([{ chave: 'radar.palavras', valor: 'perfume, airfryer' }]).radar.palavras,
    ['perfume', 'airfryer'],
  );

  const clsPiloto = L.classificarUpdate(msgPriv('/modo piloto'), HS, cfg, AGORA);
  assert.equal(clsPiloto.rota, 'config');
  assert.ok(clsPiloto.upserts.some((u) => u.chave === 'radar.publicar_direto' && u.valor === 'sim'));

  // 2) Planejamento multi-fonte (Promobit 5 lojas + categorias + Telegram público + Shopee API)
  const base = L.planejarFontesRadar(cfg, { modo: 'agendado', ts: AGORA });
  assert.equal(base.ativo, true);
  assert.ok(base.fontesWeb.some((f) => f.loja_hint === 'shein'));
  assert.ok(base.fontesWeb.some((f) => f.loja_hint === 'tiktok'));
  assert.ok(base.fontesWeb.some((f) => f.tipo === 'telegram_canal' && f.canal === 'canal_teste'));
  assert.equal(base.fontesShopee.length, 4);

  const mkPromobit = (offers) => ({
    statusCode: 200,
    data: `<html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { serverOffers: { offers } } } })}</script></head></html>`,
  });

  const respWeb = base.fontesWeb.map((f) => {
    if (f.loja_hint === 'amazon') {
      return mkPromobit([{
        offerId: 101, offerTitle: 'Perfume Lattafa Khamrah 100ml', offerPrice: 189.9, offerOldPrice: 289.9,
        offerCoupon: 'PERFUME15', offerInstructionsRaw: 'Em até 6x sem juros', storeDomain: 'amazon.com.br',
        offerIsHighlight: true, offerLikes: 18, categoryName: 'Perfumes', offerPhoto: '/101.jpg',
      }]);
    }
    if (f.loja_hint === 'ml') {
      return mkPromobit([{
        offerId: 102, offerTitle: 'Air Fryer Mondial 5L Inox', offerPrice: 249.9, offerOldPrice: 399.9,
        offerCoupon: 'MELI20', storeDomain: 'mercadolivre.com.br', offerLikes: 14, categoryName: 'Eletroportáteis',
      }]);
    }
    if (f.loja_hint === 'tiktok') {
      return mkPromobit([{
        offerId: 103, offerTitle: 'Kit Skincare Sérum Vitamina C', offerPrice: 49.9, offerOldPrice: 99.9,
        storeDomain: 'tiktok.com', offerLikes: 11, categoryName: 'Beleza',
      }]);
    }
    if (f.tipo === 'telegram_canal') {
      return {
        statusCode: 200,
        data: '<div class="tgme_widget_message_wrap" data-post="canal_teste/55"><div class="tgme_widget_message_text">Vestido Midi Floral por R$ 89,90 (de R$ 159,90) na Shein https://br.shein.com/Vestido-Midi-p-55555555.html?aff_id=terceiro</div></div>',
      };
    }
    return { statusCode: 200, data: '<html></html>' };
  });

  // Item duplicado recente (<72h) deve ser ignorado
  const sel = L.selecionarCandidatosRadar(
    Object.assign({}, base, { opcoes: Object.assign({}, base.opcoes, { limite: 5 }) }),
    respWeb,
    [],
    [{ oferta_id: 'o_old', produto_id: 'amz_JAFOI', titulo: 'Outro Produto', ts: AGORA - 3600000, links_manuais: '{"radar_key":"pb_999"}' }],
    [],
    cfg,
  );
  assert.equal(sel.candidatos.length, 4);
  assert.ok(sel.candidatos.some((c) => c.loja === 'shein'));
  assert.ok(sel.candidatos.some((c) => c.loja === 'tiktok'));

  // 3) 3 saltos removendo tags de terceiros (Promobit JS l='...', link curto -> ML /social/ -> MLB)
  const resp1 = sel.reqs1.map((rq) => {
    const c = sel.candidatos[rq.idx];
    if (c.loja === 'amazon') {
      return { statusCode: 200, data: `<script>var l = 'https://www.amazon.com.br/dp/B09PERFUM1?tag=promobit01-20';</script>` };
    }
    if (c.loja === 'ml') {
      return { statusCode: 302, headers: { location: 'https://mercadolivre.com/sec/promo123' } };
    }
    return { statusCode: 302, headers: { location: 'https://vt.tiktok.com/ZSY999abc/' } };
  });
  const p1 = L.aplicarRedirRadar1(sel, resp1, cfg);
  assert.equal(p1.candidatos.find((c) => c.loja === 'amazon').url, 'https://www.amazon.com.br/dp/B09PERFUM1');

  const resp2 = p1.reqs2.map((rq) => {
    const c = p1.candidatos[rq.idx];
    if (c.loja === 'ml') return { statusCode: 302, headers: { location: 'https://www.mercadolivre.com.br/social/promobit-ofertas' } };
    return { statusCode: 302, headers: { location: 'https://www.tiktok.com/view/product/1729400009998887770?utm_source=terc' } };
  });
  const p2 = L.aplicarRedirRadar2(p1, resp2, cfg);

  const resp3 = p2.reqs3.map(() => ({
    statusCode: 200,
    data: '<a href="https://www.mercadolivre.com.br/air-fryer/p/MLB44556677?matt_word=terceiro#card-featured">Ver</a>',
  }));

  const cfgPiloto = cfgRadar([{ chave: 'radar.publicar_direto', valor: 'sim' }]);
  const fin = L.finalizarRadar(p2, resp3, [], [], cfgPiloto);
  assert.equal(fin.ofertasNovas.length, 4);
  for (const o of fin.ofertasNovas) {
    assert.deepEqual(L.colunasInvalidas('bfx_ofertas', o), []);
    assert.equal(o.url.includes('promobit01-20'), false);
    assert.equal(o.url.includes('terceiro'), false);
  }
  for (const pr of fin.precosNovos) assert.deepEqual(L.colunasInvalidas('bfx_precos', pr), []);

  const lote = L.publicarLoteRadar(fin, [], fin.chamadas.map((_, i) => ({ ok: true, result: { message_id: 900 + i } })), cfgPiloto);
  assert.equal(lote.updates.length, 4);
  assert.ok(lote.linksRows.every((lr) => L.colunasInvalidas('bfx_links', lr).length === 0));
  const linkAmzFinal = lote.linksRows.find((lr) => lr.oferta_id === fin.ofertasNovas.find((o) => o.loja === 'amazon').oferta_id);
  assert.ok(linkAmzFinal.url.includes('tag=minhatag-20'));
});

test('Workflows gerados: 04-radar-ofertas e Rota 9 do router executam no sandbox vm', () => {
  const fRadar = path.join(__dirname, '..', 'n8n', 'workflows', '04-radar-ofertas.json');
  const fRouter = path.join(__dirname, '..', 'n8n', 'workflows', '01-telegram-router.json');
  const wfRadar = JSON.parse(fs.readFileSync(fRadar, 'utf8'));
  const wfRouter = JSON.parse(fs.readFileSync(fRouter, 'utf8'));

  const rota = wfRouter.nodes.find((n) => n.name === 'Rota');
  assert.equal(rota.parameters.numberOutputs, 11);

  const prepRouter = wfRouter.nodes.find((n) => n.name === 'Radar: Planejar');
  assert.ok(prepRouter, 'subfluxo radar conectado no router');

  const nodePlanejar = wfRadar.nodes.find((n) => n.name === 'Planejar');
  assert.ok(nodePlanejar, 'node Planejar presente no 04-radar-ofertas');
  const cfgRows = [
    { chave: 'radar.ativo', valor: 'sim' },
    { chave: 'radar.lojas', valor: 'amazon,ml,shein' },
    { chave: 'topico.tech', valor: '11' },
  ];
  const out = rodarNode(nodePlanejar.parameters.jsCode, { Config: [{ cfg: L.montarConfig(cfgRows) }] });
  assert.ok(Array.isArray(out) && out.length >= 1);
  assert.equal(out[0].json.ativo, true);
  assert.ok(out[0].json.fontesWeb.some((f) => f.loja_hint === 'shein'));
});
