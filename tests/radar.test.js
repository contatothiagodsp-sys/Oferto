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
  assert.ok(kb.inline_keyboard.slice(2).flat().some((b) => b.callback_data === 'm|tech|o_pedal_1'));

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
  assert.match(tgAmz, /<s>R\$ 2\.899,44<\/s>.*<b>R\$ 2\.464,52<\/b>.*-15% com cupom/);
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
  assert.match(tgMl, /<s>R\$ 400,00<\/s>.*<b>R\$ 340,00<\/b>.*-15% com cupom/);
  assert.match(tgMl, /<code>MELI15<\/code>/);
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

  // 2) Rodízio automático em 2 turnos (a cada 5 min) e coleta completa sob demanda
  const turno0 = L.planejarFontesRadar(cfg, { modo: 'agendado', ts: AGORA });
  const turno1 = L.planejarFontesRadar(cfg, { modo: 'agendado', ts: AGORA + 300000 });
  assert.ok(turno0.fontesWeb.some((f) => f.loja_hint === 'kabum') && turno1.fontesWeb.some((f) => f.loja_hint === 'kabum'));
  assert.ok(turno0.fontesWeb.some((f) => f.loja_hint === 'shein'));
  assert.ok(turno1.fontesWeb.some((f) => f.loja_hint === 'tiktok'));

  const base = L.planejarFontesRadar(cfg, { modo: 'comando', ts: AGORA });
  assert.equal(base.ativo, true);
  assert.ok(base.fontesWeb.some((f) => f.loja_hint === 'shein'));
  assert.ok(base.fontesWeb.some((f) => f.loja_hint === 'tiktok'));
  assert.ok(base.fontesWeb.some((f) => f.tipo === 'telegram_canal' && f.canal === 'canal_teste'));
  assert.equal(base.fontesShopee.length, 7);

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

test('Workflows gerados: 04-radar-ofertas (cron 2 min + páginas) e Rota 9 do router executam no sandbox vm', () => {
  const fRadar = path.join(__dirname, '..', 'n8n', 'workflows', '04-radar-ofertas.json');
  const fRouter = path.join(__dirname, '..', 'n8n', 'workflows', '01-telegram-router.json');
  const wfRadar = JSON.parse(fs.readFileSync(fRadar, 'utf8'));
  const wfRouter = JSON.parse(fs.readFileSync(fRouter, 'utf8'));

  const trigRadar = wfRadar.nodes.find((n) => n.type === 'n8n-nodes-base.scheduleTrigger');
  assert.equal(trigRadar.parameters.rule.interval[0].expression, '*/2 * * * *');
  assert.equal(L.padrao().radar.publicar_direto, true);

  const rota = wfRouter.nodes.find((n) => n.name === 'Rota');
  assert.equal(rota.parameters.numberOutputs, 11);

  const prepRouter = wfRouter.nodes.find((n) => n.name === 'Radar: Planejar');
  assert.ok(prepRouter, 'subfluxo radar conectado no router');
  assert.ok(wfRadar.nodes.some((n) => n.name === 'Preparar páginas radar'));

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

test('Cupons 3 niveis (De -> anuncio + cupom = final), resposta ao card e enriquecimento no Radar', () => {
  const cfg = cfgRadar();

  // 1) Admin cola link + preço final + cupom; página retorna preço do anúncio maior -> monta 3 níveis!
  const prepMan = L.prepararOferta(
    L.classificarUpdate(msgPriv('https://www.mercadolivre.com.br/perfume-fakhar/p/MLB55667788 143,90 cupom FULL1811'), HS, cfg, AGORA),
    [],
    cfg,
  );
  const joinedMan = L.juntarPagina(prepMan, {
    statusCode: 200,
    data: '<html><body><h1 class="ui-pdp-title">Perfume Árabe Fakhar Black 100ml</h1><meta property="price" content="169.90"/><script>{"original_price":229.90}</script></body></html>',
  }, cfg);
  assert.equal(joinedMan.oferta.preco, 143.9);
  assert.equal(joinedMan.oferta.links_manuais.preco_sem_cupom, 169.9);
  assert.equal(joinedMan.oferta.links_manuais.preco_de, 229.9);
  assert.equal(joinedMan.oferta.categoria, 'perfumes');

  const postTg3 = L.textoTelegram(joinedMan.oferta, 'https://www.mercadolivre.com.br/p/MLB55667788', cfg);
  assert.match(postTg3, /💸 De <s>R\$ 229,90<\/s> \(no anúncio R\$ 169,90\) → 💰 <b>R\$ 143,90<\/b>/);
  assert.match(postTg3, /<code>FULL1811<\/code>/);
  assert.match(postTg3, /Funcionando pra quem resgatou!/);
  assert.match(postTg3, /aba de cupons/);
  const postZap3 = L.textoWhatsAppGrupo(joinedMan.oferta, 'https://www.mercadolivre.com.br/p/MLB55667788', cfg);
  assert.match(postZap3, /💸 De ~R\$ 229,90~ → no anúncio \*R\$ 169,90\* \+ 🎟️ Cupom \*FULL1811\* =/);

  // 2) Preço inteiro solto antes de cupom ("400 cupom MELI15 15%") funciona sem precisar digitar R$ ou ,00
  const bareInt = L.parseMensagemLink(msgPriv('https://www.mercadolivre.com.br/monitor/p/MLB99887766 400 cupom MELI15 15%').message, cfg);
  assert.equal(bareInt.ok, true);
  assert.equal(bareInt.oferta.preco, 340);
  assert.equal(bareInt.oferta.links_manuais.preco_sem_cupom, 400);

  // 3) Responder a um card pendente inserindo cupom e preço final recalcula tudo e gera card novo
  const rowPendente = {
    oferta_id: 'o_card_1',
    produto_id: 'ml_MLB55667788',
    loja: 'ml',
    categoria: 'beleza',
    titulo: 'Perfume Fakhar Black 100ml',
    url: 'https://www.mercadolivre.com.br/p/MLB55667788',
    preco: 169.9,
    status: 'pendente',
    links_manuais: JSON.stringify({ modo_link: true, preco_de: 229.9 }),
  };
  const clsResp = L.classificarUpdate({
    message: {
      message_id: 99,
      chat: { id: 111, type: 'private' },
      from: { id: 111 },
      text: 'cupom FULL1811 por 143,90',
      reply_to_message: { message_id: 77, text: '🆕 Oferta o_card_1 · 🎁 Beleza' },
    },
  }, HS, cfg, AGORA);
  assert.equal(clsResp.rota, 'oferta');
  const prepResp = L.prepararOferta(clsResp, [rowPendente], cfg);
  assert.equal(prepResp.oferta.preco, 143.9);
  assert.equal(prepResp.oferta.links_manuais.cupom, 'FULL1811');
  assert.equal(prepResp.oferta.links_manuais.preco_sem_cupom, 169.9);
  assert.equal(prepResp.oferta.links_manuais.preco_de, 229.9);

  // 4) Radar filtra cupom de terceiro (30PROMOBIT) e enriquece cupom ativo da página do produto via prepararPaginasRadar
  const pbFake = L.lerPromobitHtml(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { serverOffers: { offers: [
      { offerId: 1, offerTitle: 'Livro com cupom exclusivo', offerPrice: 20, offerCoupon: '30PROMOBIT', storeDomain: 'amazon.com.br' },
      { offerId: 2, offerTitle: 'Fone Sony com cupom no anúncio', offerPrice: 300, offerOldPrice: 500, storeDomain: 'amazon.com.br' },
    ] } } },
  })}</script>`, { loja_hint: 'amazon' });
  assert.equal(pbFake[0].cupom, '');

  const prepPag = L.prepararPaginasRadar({
    opcoes: { modo: 'agendado', ts: AGORA },
    candidatos: [Object.assign({}, pbFake[1], { categoria: 'tech', produto_id: 'amz_B09SONY123', url: 'https://www.amazon.com.br/dp/B09SONY123', resolved: true })],
    reqs3: [],
  }, [], cfg);
  assert.equal(prepPag.reqsPag.length, 1);

  const finPag = L.finalizarRadar(
    prepPag,
    [],
    [],
    [],
    cfg,
    [{ statusCode: 200, data: '<html><body><span id="productTitle">Fone Sony</span><span class="priceToPay"><span class="a-offscreen">R$ 300,00</span></span><div id="couponsInBuybox_feature_div">Salve o cupom 15% no checkout</div><span>10x de R$ 25,50 sem juros</span></body></html>' }],
  );
  assert.equal(finPag.ofertasNovas[0].preco, 255);
  assert.equal(finPag.ofertasNovas[0].top, true);
  const manFin = JSON.parse(finPag.ofertasNovas[0].links_manuais);
  assert.equal(manFin.cupom_auto, '15% OFF no anúncio');
  assert.equal(manFin.preco_sem_cupom, 300);
});

test('KaBuM!/Terabyte/Pichau + PS5/GTA 6 + Farmacias/Perfumarias + /afiliados + bloqueio sidebar', () => {
  // 1) Identificação de lojas e classificação Tech & Games + Perfumes/Farmácia/Bebê
  assert.equal(L.identificar('https://www.kabum.com.br/produto/1020026/headset-gamer?awinaffid=outro').produto_id, 'kbm_1020026');
  assert.equal(L.identificar('https://www.terabyteshop.com.br/produto/40449/gabinete-gamer?p=236394').produto_id, 'trb_40449');
  assert.equal(L.identificar('https://www.pichau.com.br/fonte-pichau-cluster-850w?utm_source=promobit').loja, 'pichau');
  assert.equal(L.identificar('https://www.drogaraia.com.br/fralda-huggies-123.html').loja, 'drogaraia');
  assert.equal(L.identificar('https://www.drogasil.com.br/protetor-solar-needs.html').loja, 'drogasil');
  assert.equal(L.identificar('https://www.drogariaspacheco.com.br/ninho/p').loja, 'pacheco');
  assert.equal(L.identificar('https://www.belezanaweb.com.br/produto/perfume-ckin2u').loja, 'belezanaweb');
  assert.equal(L.naLoja('kabum'), 'no KaBuM!');
  assert.equal(L.naLoja('boticario'), 'no O Boticário');
  assert.equal(L.naLoja('drogasil'), 'na Drogasil');

  const cfg = cfgRadar([
    { chave: 'awin.afiliado_id', valor: '991122' },
    { chave: 'terabyte.afiliado_id', valor: '774455' },
    { chave: 'rakuten.id', valor: 'rk_meu_id' },
  ]);

  assert.equal(L.classificarCategoria('GTA 6 Grand Theft Auto VI Mídia Física PS5', cfg).categoria, 'tech');
  assert.equal(L.classificarCategoria('Console PlayStation 5 Slim + Xbox Series X Controle', cfg).categoria, 'tech');
  assert.equal(L.classificarCategoria('Protetor Solar Needs FPS 50 Antiox', cfg).categoria, 'beleza');
  assert.equal(L.classificarCategoria('Fralda Calça Huggies Proteção Acolchoada M 100un', cfg).categoria, 'bebe');

  // 2) Links de afiliado Awin (KaBuM!), Terabyte (?p), Rakuten (Pacheco/BelezaNaWeb), Pichau/Drogasil limpos sem erro
  const lkKbm = L.planejarLinks({ oferta_id: 'o1', loja: 'kabum', categoria: 'tech', url: 'https://www.kabum.com.br/produto/1020026/headset' }, cfg, AGORA);
  assert.ok(lkKbm[0].url.includes('awin1.com/cread.php?awinmid=17729&awinaffid=991122'));

  const lkTrb = L.planejarLinks({ oferta_id: 'o2', loja: 'terabyte', categoria: 'tech', url: 'https://www.terabyteshop.com.br/produto/40449/gabinete' }, cfg, AGORA);
  assert.ok(lkTrb[0].url.includes('?p=774455'));

  const lkPch = L.planejarLinks({ oferta_id: 'o3', loja: 'pichau', categoria: 'tech', url: 'https://www.pichau.com.br/fonte-850w' }, cfg, AGORA);
  assert.equal(lkPch[0].url, 'https://www.pichau.com.br/fonte-850w');

  const lkPac = L.planejarLinks({ oferta_id: 'o4', loja: 'pacheco', categoria: 'beleza', url: 'https://www.drogariaspacheco.com.br/ninho/p' }, cfg, AGORA);
  assert.ok(lkPac[0].url.includes('click.linksynergy.com/deeplink?id=rk_meu_id&mid=53522'));

  // 3) Sinalização de lojas com programa de afiliado disponível ainda não configurado (/afiliados e dicaAfiliado)
  assert.equal(L.dicaAfiliado('drogasil', cfg, {}).chave, 'afiliado.drogasil');
  assert.equal(L.dicaAfiliado('kabum', cfg, {}), null); // awin.afiliado_id já configurado
  const clsAf = L.classificarUpdate(msgPriv('/afiliados'), HS, cfg, AGORA);
  assert.equal(clsAf.rota, 'responder');
  assert.match(clsAf.chamadas[0].payload.text, /Awin \(KaBuM! mid 17729\)/);
  assert.match(clsAf.chamadas[0].payload.text, /afiliado\.boticario/);

  // 4) Bloqueio de vazamento do sidebarFeaturedOffers (samsung.com fora da lista de lojas permitidas não vira amazon)
  const pbVaz = L.lerPromobitHtml(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: {
      pageProps: {
        serverOffers: { offers: [] },
        sidebarFeaturedOffers: [{ offerId: 777, offerTitle: 'Galaxy A57 5G', offerPrice: 1599, offerOldPrice: 3799, storeDomain: 'samsung.com', storeName: 'Samsung' }],
      },
    },
  })}</script>`, { loja_hint: 'amazon' });
  assert.equal(pbVaz.length, 0);
});

test('Modo Somente Canais: /canais, /logo, /divulgar (com logo), Outros canais e ?start=canais', () => {
  const cfg = cfgRadar([
    { chave: 'grupo_id', valor: 'nenhum' },
    { chave: 'bot_grupo_username', valor: '@oferto_pub_bot' },
    { chave: 'categoria_nome.tech', valor: 'Tech & Games' },
    { chave: 'categoria_nome.perfumes', valor: 'Perfumes & Fragrâncias' },
    { chave: 'canal.tech', valor: '@oferto_tech_games' },
    { chave: 'canal.perfumes', valor: '@oferto_perfumes_saude' },
    { chave: 'canal_logo.tech', valor: 'https://img.example/logo-tech.png' },
  ]);

  assert.equal(cfg.telegram.grupo_id, '');
  assert.equal(cfg.categorias.perfumes.nome, 'Perfumes & Fragrâncias');

  // 1) /canais ligar canal e /canais so_canais
  const clsCanal = L.classificarUpdate(msgPriv('/canais perfumes @oferto_perfumes_saude'), HS, cfg, AGORA);
  assert.equal(clsCanal.rota, 'config');
  assert.ok(clsCanal.upserts.some((u) => u.chave === 'canal.perfumes' && u.valor === '@oferto_perfumes_saude'));

  const clsLogo = L.classificarUpdate(msgPriv('/logo tech https://img.example/logo-tech.png'), HS, cfg, AGORA);
  assert.equal(clsLogo.rota, 'config');
  assert.deepEqual(clsLogo.upserts, [{ chave: 'canal_logo.tech', valor: 'https://img.example/logo-tech.png' }]);

  // 2) Publicação funciona sem grupo_id direto nos canais e inclui botão "🌐 Outros canais Ofertô"
  const oTech = {
    oferta_id: 'o_ch_1', produto_id: 'kbm_1020026', loja: 'kabum', categoria: 'tech',
    titulo: 'Headset Gamer Attack Shark', url: 'https://www.kabum.com.br/produto/1020026/headset',
    preco: 174, selo: 'sem_ref', status: 'aprovada', links_manuais: JSON.stringify({ modo_link: true }), ts: AGORA,
  };
  const pubCh = L.prepararPublicacao(oTech, L.planejarLinks(oTech, cfg, AGORA), cfg, { ts: AGORA, chat_id: 111 });
  assert.equal(pubCh.ok, true);
  const postCanal = pubCh.chamadas.find((c) => c.bot === 'grupo' && c.payload.chat_id === '@oferto_tech_games');
  assert.ok(postCanal);
  assert.ok(postCanal.payload.reply_markup.inline_keyboard[1][0].url.includes('t.me/oferto_pub_bot?start=canais'));

  // 3) /divulgar tech posta com sendPhoto usando o logo configurado para os outros canais + botão WhatsApp para o admin
  const clsDiv = L.classificarUpdate(msgPriv('/divulgar tech'), HS, cfg, AGORA);
  assert.equal(clsDiv.rota, 'responder');
  const fotoDiv = clsDiv.chamadas.find((c) => c.bot === 'grupo' && c.metodo === 'sendPhoto');
  assert.equal(fotoDiv.payload.chat_id, '@oferto_perfumes_saude');
  assert.equal(fotoDiv.payload.photo, 'https://img.example/logo-tech.png');
  assert.match(fotoDiv.payload.caption, /Ofertô Tech &amp; Games/);
  const admDiv = clsDiv.chamadas.find((c) => c.bot === 'admin');
  assert.match(admDiv.payload.reply_markup.inline_keyboard[0][0].url, /^https:\/\/api\.whatsapp\.com\/send/);

  // 4) ?start=canais no bot publicador entrega os botões de todos os canais
  const clsStart = L.classificarUpdate({
    message: { message_id: 7, text: '/start canais', chat: { id: 888, type: 'private' }, from: { id: 888 } },
  }, HS, cfg, AGORA, { bot: 'grupo' });
  const bv = L.boasVindasStart(clsStart, [], cfg);
  assert.equal(bv[0].payload.reply_markup.inline_keyboard.length, 2);
});
