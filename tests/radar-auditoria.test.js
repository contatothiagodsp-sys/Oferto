'use strict';
// Auditoria 18/11: radar parado (bfx_alertas ausente), posts sem imagem e promoções sem desconto real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const L = require('../lib');

const AGORA = new Date('2026-11-18T15:00:00Z').getTime();
const cfgBase = (extra) => L.montarConfig([
  { chave: 'admins', valor: '111' }, { chave: 'grupo_id', valor: '-100123' },
  { chave: 'topico.casa', valor: '10' }, { chave: 'topico.tech', valor: '11' }, { chave: 'topico.top', valor: '2' },
].concat(extra || []));
const lerWf = (arq) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'n8n', 'workflows', arq), 'utf8'));

test('radar não para se a tabela bfx_alertas não existir: cria sozinho e segue em frente', () => {
  for (const arq of ['01-telegram-router.json', '04-radar-ofertas.json', '05-guardiao-ofertas.json', '03-relatorio-diario.json']) {
    const wf = lerWf(arq);
    const nosAlertas = wf.nodes.filter((n) => n.type === 'n8n-nodes-base.dataTable' && JSON.stringify(n.parameters).includes('"bfx_alertas"'));
    for (const n of nosAlertas) assert.equal(n.onError, 'continueRegularOutput', `${arq}: ${n.name} precisa seguir mesmo sem a tabela`);
  }
  const radar = lerWf('04-radar-ofertas.json');
  const garantir = radar.nodes.find((n) => n.name === 'Garantir tabela de alertas');
  assert.ok(garantir, 'nó que cria bfx_alertas no radar');
  assert.equal(garantir.parameters.operation, 'create');
  assert.equal(garantir.parameters.options.createIfNotExists, true);
  assert.equal(garantir.onError, 'continueRegularOutput');
  assert.equal(radar.connections['A cada 2 minutos (radar)'].main[0][0].node, 'Garantir tabela de alertas');
  assert.equal(radar.connections['Garantir tabela de alertas'].main[0][0].node, 'Ler config');
});

test('radar reenvia o que o Telegram barrou (429) ou a foto recusada, antes de gravar os posts', () => {
  const radar = lerWf('04-radar-ofertas.json');
  const c = radar.connections;
  assert.equal(c['Telegram (pub radar)'].main[0][0].node, 'Checar envio radar');
  assert.equal(c['Checar envio radar'].main[0][0].node, 'Reenviar radar?');
  assert.equal(c['Reenviar radar?'].main[0][0].node, 'Esperar Telegram radar');
  assert.equal(c['Reenviar radar?'].main[1][0].node, 'Resultado lote radar');
  assert.equal(c['Telegram (reenvio radar)'].main[0][0].node, 'Resultado lote radar');
  const pub = radar.nodes.find((n) => n.name === 'Telegram (pub radar)');
  assert.ok(pub.parameters.options.batching.batch.batchInterval >= 500, 'ritmo abaixo do limite do Telegram');
  const router = lerWf('01-telegram-router.json');
  assert.equal(router.connections['Telegram (publicada)'].main[0][0].node, 'Checar envio (publicada)');
});

test('imagem: CDN direto do Promobit (/500/), wsrv antigo desembrulhado', () => {
  assert.equal(L.normalizarImagemOferta('https://i.promobit.com.br/static/p/93.webp'), 'https://i.promobit.com.br/500/static/p/93.webp');
  assert.equal(L.normalizarImagemOferta('https://i.promobit.com.br/500/1.jpg'), 'https://i.promobit.com.br/500/1.jpg');
  assert.equal(L.normalizarImagemOferta('https://wsrv.nl/?url=i.promobit.com.br%2F500%2F1.png&w=600&output=jpg'), 'https://i.promobit.com.br/500/1.png');
  assert.equal(L.normalizarImagemOferta('http://http2.mlstatic.com/D_1.jpg'), 'https://http2.mlstatic.com/D_1.jpg');
  assert.equal(L.normalizarImagemOferta('javascript:alert(1)'), '');
});

test('oferta de verdade: só publica sozinho com prova numérica de economia', () => {
  const cfg = cfgBase();
  const semRef = { selo: 'sem_ref' };
  const ok = (c, sel) => L.avaliarOfertaReal(Object.assign({ preco: 100 }, c), sel || semRef, cfg);
  assert.equal(ok({}).ok, false, 'sem "De", sem cupom e sem histórico: não é promoção comprovada');
  assert.equal(ok({}).motivo, 'sem_prova_de_desconto');
  assert.equal(ok({ preco_de: 110 }).ok, false, '9% < mínimo de 15%');
  assert.equal(ok({ preco_de: 130 }).ok, true);
  assert.equal(ok({ preco_de: 110, em_alta: 'em_alta' }).ok, true, 'em alta aceita ≥ 8%');
  assert.equal(ok({ preco_de: 1000 }).motivo, 'desconto_suspeito', '90% sem confirmação = metade do dobro / erro');
  assert.equal(ok({ preco_de: 1000, preco_confirmado_loja: true }).ok, true);
  assert.equal(ok({ cupom: 'X10', preco_sem_cupom: 112 }).ok, true);
  assert.equal(ok({ cupom: 'X10', preco_sem_cupom: 101 }).ok, false, 'cupom que quase não muda o preço');
  assert.equal(ok({ ref_mercado: 115 }).ok, true, 'mercado ≥ 10% mais caro');
  assert.equal(ok({ eh_atualizacao: true, preco_anterior: 120 }).ok, true);
  assert.equal(ok({ preco_de: 200 }, { selo: 'acima' }).ok, false, 'acima do menor preço de 90 dias');
  assert.equal(ok({}, { selo: 'ok' }).ok, true, 'menor preço de 90 dias');
  assert.equal(L.avaliarOfertaReal({ eh_cupom_loja: true }, semRef, cfg).ok, true);
});

test('post de canal do Telegram sem desconto não entra mais no radar agendado (likes fixo deixava passar)', () => {
  const cfg = cfgBase([{ chave: 'radar.canais_curados', valor: 'nao' }, { chave: 'radar.canais_telegram', valor: '@canal' }]);
  const plan = L.planejarFontesRadar(cfg, { modo: 'agendado', ts: AGORA });
  const bloco = (n, texto) => `<div class="tgme_widget_message_wrap"><div data-post="canal/${n}"><div class="tgme_widget_message_text js-message_text">${texto}</div></div></div>`;
  const html = '<html>' +
    bloco(1, 'Protetor Solar FPS 50 200ml<br>R$ 43<br><a href="https://www.amazon.com.br/dp/B0SEMDESC1">https://www.amazon.com.br/dp/B0SEMDESC1</a>') +
    bloco(2, 'Air Fryer Mondial 4L<br>De R$ 499 por R$ 299<br><a href="https://www.amazon.com.br/dp/B0COMDESC1">https://www.amazon.com.br/dp/B0COMDESC1</a>') +
    '</html>';
  const respWeb = plan.fontesWeb.map((f) => (f.tipo === 'telegram_canal' ? { statusCode: 200, body: html } : { statusCode: 404, body: '' }));
  const sel = L.selecionarCandidatosRadar(plan, respWeb, [], [], [], cfg, []);
  const ids = sel.candidatos.map((c) => c.produto_id);
  assert.ok(ids.some((id) => /B0COMDESC1/.test(id)), 'com desconto real entra');
  assert.ok(!ids.some((id) => /B0SEMDESC1/.test(id)), 'sem desconto fica de fora');
});

test('finalizar: descarta sem prova, registra o preço e lembra a recusa por 6 h', () => {
  const cfg = cfgBase([{ chave: 'radar.publicar_direto', valor: 'sim' }]);
  const cand = (id, extra) => Object.assign({
    resolved: true, loja: 'amazon', produto_id: 'amz_' + id, radar_key: 'pb_' + id, url: 'https://www.amazon.com.br/dp/' + id,
    titulo: 'Produto ' + id + ' de teste', preco: 100, categoria: 'casa', imagem: 'https://m.media-amazon.com/images/I/' + id + '.jpg',
  }, extra);
  const est = { opcoes: { modo: 'agendado', ts: AGORA }, candidatos: [cand('B0AAAAAAA1'), cand('B0BBBBBBB2', { preco_de: 150, desconto_pct: 33.33 })], reqs3: [], reqsPag: [] };
  const fin = L.finalizarRadar(est, [], [], [], cfg, [], []);
  assert.deepEqual(fin.ofertasNovas.map((o) => o.produto_id), ['amz_B0BBBBBBB2']);
  assert.equal(fin.resumo.descartadas.length, 1);
  assert.equal(fin.resumo.descartadas[0].motivo, 'sem_prova_de_desconto');
  assert.ok(fin.precosNovos.some((p) => p.produto_id === 'amz_B0AAAAAAA1'), 'histórico gravado mesmo descartada');
  // publicado como FOTO no tópico
  const lote = L.publicarLoteRadar(fin, [], [], cfg, []);
  const post = lote.chamadasPub.find((c) => c.bot === 'grupo');
  assert.equal(post.metodo, 'sendPhoto');
  assert.equal(post.payload.photo, 'https://m.media-amazon.com/images/I/B0BBBBBBB2.jpg');
  assert.equal(post.fallback.metodo, 'sendMessage');

  const mem = L.atualizarDescartesRadar({ velho: { ts: AGORA - 7 * 3600000, preco: 1 } }, fin.resumo.descartadas, AGORA);
  assert.ok(mem.amz_B0AAAAAAA1 && !mem.velho);
  // no ciclo seguinte a recusada não ocupa vaga; se o preço cair 3%+, volta a ser avaliada
  const cfgC = cfgBase([{ chave: 'radar.canais_curados', valor: 'nao' }, { chave: 'radar.canais_telegram', valor: '@canal' }]);
  const planC = L.planejarFontesRadar(cfgC, { modo: 'agendado', ts: AGORA + 120000 });
  const htmlCanal = (preco) => '<div class="tgme_widget_message_wrap"><div data-post="canal/9"><div class="tgme_widget_message_text js-message_text">' +
    `Cafeteira Teste 9<br>De R$ 200 por R$ ${preco}<br><a href="https://www.amazon.com.br/dp/B0DDDDDDD9">link</a></div></div></div>`;
  const resp = (preco) => planC.fontesWeb.map((f) => (f.tipo === 'telegram_canal' ? { statusCode: 200, body: htmlCanal(preco) } : { statusCode: 404, body: '' }));
  const memC = { amz_B0DDDDDDD9: { ts: AGORA, preco: 150, motivo: 'mais_barato_mercado' } };
  const ids = (preco) => L.selecionarCandidatosRadar(planC, resp(preco), [], [], [], cfgC, [], memC).candidatos.map((c) => c.produto_id);
  assert.ok(!ids(150).includes('amz_B0DDDDDDD9'), 'recusada há pouco, mesmo preço: pula');
  assert.ok(ids(140).includes('amz_B0DDDDDDD9'), 'preço caiu desde a recusa: reavalia');
});

test('enriquecimento: se o preço na loja subiu até o "De", o desconto zera (não fica % antigo)', () => {
  const cfg = cfgBase();
  const est = {
    opcoes: { modo: 'agendado', ts: AGORA },
    candidatos: [{ resolved: true, loja: 'amazon', produto_id: 'amz_B0CCCCCCC3', url: 'https://www.amazon.com.br/dp/B0CCCCCCC3', titulo: 'Liquidificador Teste 3', preco: 70, preco_de: 100, desconto_pct: 30, categoria: 'casa' }],
    reqs3: [],
    reqsPag: [{ idx: 0, url: 'https://www.amazon.com.br/dp/B0CCCCCCC3' }],
  };
  const pag = { statusCode: 200, body: '<html><script type="application/ld+json">' + JSON.stringify({ '@type': 'Product', name: 'Liquidificador Teste 3', offers: { '@type': 'Offer', price: '89.90' } }) + '</script></html>' };
  const fin = L.finalizarRadar(est, [], [], [], cfg, [pag], []);
  const todos = fin.ofertasNovas.concat(fin.resumo.descartadas);
  assert.equal(todos.length, 1);
  if (fin.ofertasNovas.length) {
    assert.ok(Number(fin.ofertasNovas[0].preco) >= 89.9);
  } else {
    assert.equal(fin.resumo.descartadas[0].preco, 89.9);
  }
});

test('editar post que pode ser foto: manda texto e legenda; o erro da forma errada é ignorado', () => {
  const eds = L.edicoesPost ? L.edicoesPost('grupo', { chat_id: -1, message_id: 5 }, '<b>Encerrada</b>') : require('../lib/edicao').edicoesPost('grupo', { chat_id: -1, message_id: 5 }, '<b>Encerrada</b>');
  assert.deepEqual(eds.map((e) => e.metodo), ['editMessageText', 'editMessageCaption']);
  assert.equal(eds[1].payload.caption, '<b>Encerrada</b>');
  const cfg = cfgBase();
  const r = L.resultadoChamadas(eds, [
    { ok: false, error_code: 400, description: 'Bad Request: there is no text in the message to edit' },
    { ok: true, result: { message_id: 5 } },
  ], cfg, AGORA);
  assert.equal(r.falhas.length, 0);
  assert.equal(r.alertas.length, 0);
});

test('Code nodes novos do radar rodam no sandbox (sem $getWorkflowStaticData nos testes)', () => {
  const radar = lerWf('04-radar-ofertas.json');
  const fin = radar.nodes.find((n) => n.name === 'Finalizar radar');
  assert.match(fin.parameters.jsCode, /\$getWorkflowStaticData\('global'\)/);
  assert.match(fin.parameters.jsCode, /typeof \$getWorkflowStaticData === 'function'/);
  const sel = radar.nodes.find((n) => n.name === 'Selecionar radar');
  assert.match(sel.parameters.jsCode, /radar_descartes/);
  // compila
  for (const n of radar.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) {
    assert.doesNotThrow(() => new vm.Script(`(function(){ ${n.parameters.jsCode} })`), n.name);
  }
});

test('imagem: telesco.pe é substituída pela foto real da Amazon/ML; postGrupo não usa telesco.pe na prévia fallback', () => {
  const radar = require('../lib/radar');
  const fluxos = require('../lib/fluxos');
  const cfg = cfgBase();
  const cands = [{
    radar_key: 'tg_xet_1',
    loja: 'amazon',
    produto_id: 'amz_B0G7HBDWRP',
    url: 'https://www.amazon.com.br/dp/B0G7HBDWRP',
    titulo: 'Creme Kérastase',
    preco: 259,
    preco_de: 429,
    desconto_pct: 39.63,
    imagem: 'https://cdn1.telesco.pe/file/abc123',
    resolved: true,
    fonte_radar: 'telegram_xetdaspromocoes',
  }];
  const htmlAmz = `<html><head><meta property="og:image" content="https://m.media-amazon.com/images/I/51xUlrViq1L.jpg_BO30,255,255,255_SR1910,1000.jpg"/></head><body><div id="corePrice_feature_div"><span class="a-offscreen">R$ 259,00</span></div><script>"hiRes":"https://m.media-amazon.com/images/I/51xUlrViq1L._AC_SL1500_.jpg"</script></body></html>`;
  const est = { opcoes: { modo: 'agendado', ts: AGORA }, candidatos: cands, reqsPag: [{ idx: 0, url: cands[0].url }], reqsMercado: [] };
  const fin = radar.finalizarRadar(est, [], [], [], cfg, [{ statusCode: 200, body: htmlAmz }], []);
  assert.equal(fin.ofertasNovas.length, 1);
  assert.equal(fin.ofertasNovas[0].imagem, 'https://m.media-amazon.com/images/I/51xUlrViq1L._AC_SL1500_.jpg');

  const cfgPub = cfgBase([{ chave: 'bot_token_grupo', valor: 'tok' }, { chave: 'posts.foto', valor: 'sim' }]);
  const ofPub = {
    oferta_id: 'o1', loja: 'amazon', categoria: 'casa', titulo: 'Produto',
    preco: 100, url: 'https://www.amazon.com.br/dp/B000000001',
    imagem: 'https://cdn1.telesco.pe/file/expirado', selo: 'ok',
  };
  const itensPub = L.planejarLinks(ofPub, cfgPub, AGORA);
  const pub = L.prepararPublicacao(ofPub, itensPub, cfgPub, { ts: AGORA, chat_id: 111, message_id: 1 });
  const ch = pub.chamadas.find((c) => c.bot === 'grupo' && c.metodo === 'sendPhoto');
  assert.ok(ch, 'deve tentar sendPhoto');
  assert.equal(ch.fallback.metodo, 'sendMessage');
  assert.equal(ch.fallback.payload.link_preview_options.url, 'https://www.amazon.com.br/dp/B000000001');
});

test('promobit 429 ativa cooldown e não desperdiça vagas; ML /social/ no redir 1 vai para vitrine 3', () => {
  const radar = require('../lib/radar');
  const cfg = cfgBase([{ chave: 'radar.canais_curados', valor: 'sim' }, { chave: 'radar.min_desconto_pct', valor: '15' }]);
  const plan = radar.planejarFontesRadar(cfg, { modo: 'agendado', ts: AGORA });
  const pbHtml = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { serverOffers: { offers: [{
      offerId: 901, offerTitle: 'Oferta Promobit 50% OFF', offerPrice: 100, offerOldPrice: 200,
      offerLikes: 20, offerClicks: 100, storeDomain: 'amazon.com.br', offerPhoto: '/500/a.png',
    }] } } },
  })}</script>`;
  const tgHtml = `<div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="xetdaspromocoes/99"><div class="tgme_widget_message_text">Air Fryer Philco<br/>De R$ 400,00 por R$ 220,00<br/><a href="https://meli.la/abc123">https://meli.la/abc123</a></div></div></div>`;
  const respWeb = plan.fontesWeb.map((f) => (f.tipo === 'telegram_canal' ? { statusCode: 200, body: tgHtml } : { statusCode: 200, body: pbHtml }));

  const sel1 = radar.selecionarCandidatosRadar(plan, respWeb, [], [], [], cfg, [], {});
  assert.ok(sel1.candidatos.some((c) => c.fonte_radar === 'promobit'));
  const pbIdx = sel1.reqs1.findIndex((r) => sel1.candidatos[r.idx].fonte_radar === 'promobit');
  const tgIdx = sel1.reqs1.findIndex((r) => sel1.candidatos[r.idx].fonte_radar !== 'promobit');
  const resp1 = sel1.reqs1.map((_, i) => (i === pbIdx
    ? { statusCode: 429, headers: {} }
    : { statusCode: 301, headers: { location: 'https://www.mercadolivre.com.br/social/xetdaspromocoes?matt_word=x' } }));
  const ap1 = radar.aplicarRedirRadar1(sel1, resp1, cfg);
  assert.equal(ap1.promobit_429, true);
  assert.equal(ap1.candidatos[sel1.reqs1[tgIdx].idx].resolved, undefined);
  const ap2 = radar.aplicarRedirRadar2(ap1, [], cfg);
  assert.equal(ap2.reqs3.length, 1);
  assert.match(ap2.reqs3[0].url, /mercadolivre\.com\.br\/social\/xetdaspromocoes/);

  // Com cooldown ativo, Promobit é pulado e só fontes funcionais ocupam as vagas
  const sel2 = radar.selecionarCandidatosRadar(plan, respWeb, [], [], [], cfg, [], {}, { pb_redir_bloqueado_ate: AGORA + 600000 });
  assert.ok(sel2.candidatos.every((c) => c.fonte_radar !== 'promobit'));
  assert.ok(sel2.candidatos.length >= 1);
});

test('imagem: Amazon logo /images/G/ é substituído por landingImage, og:image // funciona e mercado substitui wsrv.nl', () => {
  const extrator = require('../lib/extrator');
  const radar = require('../lib/radar');

  const htmlAmzLogo = `<html><head><meta property="og:image" content="https://m.media-amazon.com/images/G/32/social_share/amazon_logo._CB123_.png"/></head><body><span id="productTitle">Echo Dot 5</span><img src="https://m.media-amazon.com/images/I/71xoR4A6q-L._AC_SL1000_.jpg" id="landingImage"/></body></html>`;
  const lidoAmz = extrator.lerPaginaProduto({ statusCode: 200, body: htmlAmzLogo }, 'https://www.amazon.com.br/dp/B09B8VGCR8');
  assert.equal(lidoAmz.imagem, 'https://m.media-amazon.com/images/I/71xoR4A6q-L._AC_SL1000_.jpg');

  const htmlProtoRel = `<html><head><meta property="og:image" content="//cdn.loja.com.br/produto.jpg"/></head><body><h1>Produto Teste</h1></body></html>`;
  const lidoRel = extrator.lerPaginaProduto({ statusCode: 200, body: htmlProtoRel }, 'https://www.loja.com.br/p/1');
  assert.equal(lidoRel.imagem, 'https://cdn.loja.com.br/produto.jpg');

  const cands = [{
    radar_key: 'pb_1', loja: 'kabum', produto_id: 'kbm_1', url: 'https://www.kabum.com.br/produto/1',
    titulo: 'SSD NVMe 1TB Kingston', preco: 350, preco_de: 500, desconto_pct: 30,
    imagem: 'https://wsrv.nl/?url=i.promobit.com.br%2F500%2Fx.png', resolved: true,
  }];
  const reqsMercado = [{ idx: 0, fonte: 'zoom', url: 'https://www.zoom.com.br/search?q=ssd' }];
  const respMercado = [{
    statusCode: 200,
    body: `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          hits: [{ name: 'SSD NVMe 1TB Kingston', price: 420, merchantName: 'Amazon', image: 'https://i.zst.com.br/thumbs/12/ssd.jpg' }],
        },
      },
    })}</script>`,
  }];
  const est = { opcoes: { modo: 'agendado', ts: AGORA }, candidatos: cands, reqsPag: [], reqsMercado };
  const fin = radar.finalizarRadar(est, [], [], [], cfgBase(), [], respMercado);
  assert.equal(fin.ofertasNovas.length, 1);
  assert.equal(fin.ofertasNovas[0].imagem, 'https://i.zst.com.br/thumbs/12/ssd.jpg');
});

test('categoria: perfumes com Vaporizador/EDT/sem "perfume" e calçados vão para perfumes/moda, nunca casa; radar descarta sem_categoria e ignora anterior casa errado', () => {
  const extrator = require('../lib/extrator');
  const radar = require('../lib/radar');
  const comunidade = require('../lib/comunidade');
  const cfg = cfgBase();

  const perfumes = [
    'Ralph Lauren Polo Red EDT 125ml Vaporizador',
    'Antonio Banderas Blue Seduction Masculino 100ml',
    'Nautica Voyage EDT 100ml',
    'Bvlgari Man in Black EDP 100ml',
    'Ferrari Black Scuderia EDT 125ml',
  ];
  for (const tit of perfumes) {
    const c = extrator.classificarCategoria(tit, cfg);
    assert.equal(c.categoria, 'perfumes', `Esperava perfumes para: ${tit}, veio ${c.categoria}`);
    assert.ok(c.confianca > 0);
  }

  const calcados = [
    'Sapatênis Masculino Democrata Denim',
    'Chuteira Umbro Society Class',
    'Skechers Go Walk Joy Feminino',
  ];
  for (const tit of calcados) {
    const c = extrator.classificarCategoria(tit, cfg);
    assert.equal(c.categoria, 'moda', `Esperava moda para: ${tit}, veio ${c.categoria}`);
    assert.ok(c.confianca > 0);
  }

  // Item sem categoria confiável no radar agendado não pode cair em Casa & Eletro
  const htmlSemCat = `<html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: {
      pageProps: {
        serverOffers: {
          offers: [
            {
              offerId: 901,
              offerTitle: 'Produto Misterioso Xpto 5000',
              offerPrice: 99,
              offerOldPrice: 199,
              offerPhoto: 'https://i.promobit.com.br/500/x.jpg',
              storeDomain: 'amazon.com.br',
              offerLikes: 10,
            },
            {
              offerId: 902,
              offerTitle: 'Ralph Lauren Polo Red EDT 125ml Vaporizador',
              offerPrice: 299,
              offerOldPrice: 499,
              offerPhoto: 'https://i.promobit.com.br/500/p.jpg',
              storeDomain: 'mercadolivre.com.br',
              offerLikes: 15,
            },
          ],
        },
      },
    },
  })}</script></head></html>`;

  const respsWeb = [
    { statusCode: 200, body: htmlSemCat },
  ];
  const reqsWeb = [{ tipo: 'promobit_alta', url: 'https://www.promobit.com.br/' }];
  // Simula oferta antiga do mesmo perfume erroneamente salva em 'casa'
  const ofertasAntigas = [{
    oferta_id: 'o_old_casa',
    produto_id: 'pb_902',
    loja: 'ml',
    categoria: 'casa',
    titulo: 'Ralph Lauren Polo Red EDT 125ml Vaporizador',
    preco: 399,
    status: 'aprovada',
    ts: AGORA - 3600 * 1000,
  }];

  const sel = radar.selecionarCandidatosRadar(
    { opcoes: { modo: 'agendado', ts: AGORA }, fontesWeb: reqsWeb },
    respsWeb,
    [],
    ofertasAntigas,
    [],
    cfg,
    [],
    [],
  );

  const candPerf = sel.candidatos.find((x) => x.radar_key === 'pb_902');
  assert.ok(candPerf, 'perfume deve ser selecionado');
  assert.equal(candPerf.categoria, 'perfumes', 'não deve herdar categoria casa errada da oferta anterior');

  const candSemCat = sel.candidatos.find((x) => x.radar_key === 'pb_901');
  assert.ok(candSemCat && candSemCat.categoria_indefinida === true);

  // Resolve ambos e finaliza: pb_901 sem categoria definida deve ser descartado como sem_categoria (não ir para casa)
  candSemCat.resolved = true;
  candSemCat.url = 'https://www.amazon.com.br/dp/B000000001';
  candSemCat.produto_id = 'amz_B000000001';
  candPerf.resolved = true;
  candPerf.url = 'https://www.mercadolivre.com.br/ralph-lauren-polo-red/p/MLB123';
  candPerf.produto_id = 'ml_MLB123';

  const est = { opcoes: { modo: 'agendado', ts: AGORA }, candidatos: [candSemCat, candPerf], reqsPag: [], reqsMercado: [] };
  const fin = radar.finalizarRadar(est, [], [], ofertasAntigas, cfg, [], []);
  assert.equal(fin.ofertasNovas.length, 1);
  assert.equal(fin.ofertasNovas[0].categoria, 'perfumes');
  assert.ok(fin.resumo.descartadas.some((d) => d.radar_key === 'pb_901' && d.motivo === 'sem_categoria'));

  // /alerta de termo desconhecido grava 'geral', não 'casa'
  const al = comunidade.processarAlertaMembro(
    { rota: 'comunidade', subtipo: 'alerta', termo: 'xpto_desconhecido_99', chat_id: 1, user_hash: 'u1', ts: AGORA },
    [],
    cfg,
  );
  assert.equal(al.inserir[0].categoria, 'geral');
});

test('boost/radar: sidebarFeaturedOffers não herda categoria_hint casa, /radar perfumes enriquece antes de filtrar, modoAuto descarta sem_categoria e /oferta não regride para casa', () => {
  const extrator = require('../lib/extrator');
  const radar = require('../lib/radar');
  const fluxos = require('../lib/fluxos');
  const cfg = cfgBase();

  // 1) Perfumes comuns sem a palavra "perfume" (e sem falso positivo de 'pet' em 'frasco pet')
  for (const tit of [
    'Avon Far Away 50ml',
    'Lacoste Essential 125ml',
    'Hinode Empire 100ml',
    'Cacharel Amor Amor 100ml',
    'Britney Spears Fantasy 100ml',
    'Frasco PET Spray Corporal 100ml',
  ]) {
    const cls = extrator.classificarCategoria(tit, cfg);
    assert.notEqual(cls.categoria, 'casa', `${tit} não deve ir para casa (foi ${cls.categoria})`);
  }

  // 2) Promobit categoria eletroportateis (categoria_hint: 'casa') não vaza 'casa' para sidebarFeaturedOffers
  const htmlPbCat = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: {
      pageProps: {
        serverOffers: {
          offers: [{
            offerId: 101, offerTitle: 'Air Fryer Mondial 4L', offerPrice: 250, offerOldPrice: 400,
            offerLikes: 20, offerClicks: 100, storeDomain: 'amazon.com.br', offerPhoto: '/500/af.png',
          }],
        },
        sidebarFeaturedOffers: [{
          offerId: 102, offerTitle: 'Item Misterioso XYZ 100ml', offerPrice: 120, offerOldPrice: 200,
          offerLikes: 15, offerClicks: 80, storeDomain: 'amazon.com.br', offerPhoto: '/500/x.png',
        }],
      },
    },
  })}</script>`;
  const pbExtraidos = radar.lerPromobitHtml(htmlPbCat, { tipo: 'promobit_cat', categoria_hint: 'casa' });
  const pb101 = pbExtraidos.find((x) => x.radar_key === 'pb_101');
  const pb102 = pbExtraidos.find((x) => x.radar_key === 'pb_102');
  assert.equal(pb101.categoria_hint, 'casa');
  assert.equal(pb102.categoria_hint, '');

  // 3) /radar perfumes (o.categorias = ['perfumes']) mantém candidato indefinido da Amazon para enriquecer pela página
  const selPerf = radar.selecionarCandidatosRadar(
    {
      opcoes: { modo: 'comando', categorias: ['perfumes'], lojas: ['amazon'], ts: AGORA },
      fontesWeb: [{ tipo: 'promobit_loja', loja_hint: 'amazon' }],
    },
    [{
      statusCode: 200,
      body: `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
        props: {
          pageProps: {
            serverOffers: {
              offers: [{
                offerId: 201, offerTitle: 'Kit Presente Luxo 100ml', offerPrice: 199, offerOldPrice: 350,
                offerLikes: 25, offerClicks: 120, storeDomain: 'amazon.com.br', offerPhoto: '/500/p.png',
              }],
            },
          },
        },
      })}</script>`,
    }],
    [], [], [], cfg, [], [],
  );
  assert.equal(selPerf.candidatos.length, 1);
  const cand201 = selPerf.candidatos[0];
  cand201.resolved = true;
  cand201.url = 'https://www.amazon.com.br/dp/B0PERF0001';
  cand201.produto_id = 'amz_B0PERF0001';
  cand201.imagem = 'https://m.media-amazon.com/images/G/32/social_share/amazon_logo.png';

  const htmlAmzPerf = `<html><head><meta property="og:image" content="https://m.media-amazon.com/images/I/61perf._AC_SL1000_.jpg"/></head><body><span id="productTitle">Perfume Importado Eau de Parfum 100ml</span><div id="corePrice_feature_div"><span class="a-offscreen">R$ 199,00</span></div></body></html>`;
  const finPerf = radar.finalizarRadar(
    { opcoes: selPerf.opcoes, candidatos: [cand201], reqsPag: [{ idx: 0, url: cand201.url }], reqsMercado: [] },
    [], [], [], cfg, [{ statusCode: 200, body: htmlAmzPerf }], [],
  );
  assert.equal(finPerf.ofertasNovas.length, 1);
  assert.equal(finPerf.ofertasNovas[0].categoria, 'perfumes');
  assert.equal(finPerf.ofertasNovas[0].imagem, 'https://m.media-amazon.com/images/I/61perf._AC_SL1000_.jpg');

  // 4) o.modo === 'comando' com publicar_direto=true (modoAuto) descarta sem_categoria em vez de publicar em casa
  const cfgAuto = cfgBase([{ chave: 'radar.publicar_direto', valor: 'sim' }]);
  const candSem = {
    radar_key: 'pb_301', loja: 'amazon', produto_id: 'amz_B0SEMCAT01',
    url: 'https://www.amazon.com.br/dp/B0SEMCAT01', titulo: 'Item Genérico Sem Palavra Chave',
    preco: 100, preco_de: 200, desconto_pct: 50, categoria: 'casa', categoria_indefinida: true, resolved: true,
  };
  const finAuto = radar.finalizarRadar(
    { opcoes: { modo: 'comando', ts: AGORA }, candidatos: [candSem], reqsPag: [], reqsMercado: [] },
    [], [], [], cfgAuto, [], [],
  );
  assert.equal(finAuto.ofertasNovas.length, 0);
  assert.ok(finAuto.resumo.descartadas.some((d) => d.motivo === 'sem_categoria'));

  // 5) /oferta repost em fluxos.js não regride perfume de volta para 'casa' anterior
  const prevCasa = [{
    oferta_id: 'o_old_1', produto_id: 'amz_B0PERF9999', loja: 'amazon', categoria: 'casa',
    titulo: 'Ralph Lauren Polo Red EDT 125ml', preco: 450, status: 'aprovada', ts: AGORA - 3600 * 1000,
  }];
  const entPerf = {
    rota: 'oferta', chat_id: 1, user_id: 1, ts: AGORA,
    oferta: {
      categoria: 'perfumes', loja: 'amazon', produto_id: 'amz_B0PERF9999',
      url: 'https://www.amazon.com.br/dp/B0PERF9999',
      titulo: 'Ralph Lauren Polo Red EDT 125ml', preco: 350,
      links_manuais: { modo_link: true, categoria_auto: true },
    },
    avisos_card: [],
  };
  const proc = fluxos.avaliarNovaOferta(entPerf, [], cfg, prevCasa);
  assert.equal(proc.oferta.categoria, 'perfumes');
});

test('repost exige queda mínima >= 5% (>= R$ 1) e parcelamento HTML/JSON sempre aparece com total parcelado', () => {
  const extrator = require('../lib/extrator');
  const textos = require('../lib/textos');
  const cfg = cfgBase();

  const pubAnterior = [{
    oferta_id: 'o_neu_1', produto_id: 'amz_B0NEUTRO01', loja: 'amazon', categoria: 'beleza',
    titulo: 'Creme Hidratante Facial Matte 3 em 1 Neutrogena 100g', preco: 25.77, status: 'aprovada',
    ts: AGORA - 8 * 60 * 1000,
  }];
  // R$ 25,77 -> R$ 25,00 (R$ 0,77 / 2,99%): bloqueado tanto em 24h quanto em 72h
  const repCurto = extrator.avaliarRepeticao24h(
    { produto_id: 'amz_B0NEUTRO01', preco: 25.00 },
    pubAnterior,
    AGORA,
  );
  assert.equal(repCurto.bloquear, true);
  assert.equal(repCurto.motivo, 'ja_publicada_24h');

  const rep72 = extrator.avaliarRepeticao24h(
    { produto_id: 'amz_B0NEUTRO01', preco: 25.00 },
    [{ ...pubAnterior[0], ts: AGORA - 30 * 3600 * 1000 }],
    AGORA,
    { modo_radar: true, janela_radar_72h: true },
  );
  assert.equal(rep72.bloquear, true);
  assert.equal(rep72.motivo, 'recente_72h');

  // R$ 25,77 -> R$ 24,40 (R$ 1,37 / 5,3%): libera atualização
  const repOk = extrator.avaliarRepeticao24h(
    { produto_id: 'amz_B0NEUTRO01', preco: 24.40 },
    pubAnterior,
    AGORA,
  );
  assert.equal(repOk.bloquear, false);
  assert.equal(repOk.eh_atualizacao, true);

  // Amazon com spans separando parcelas
  const htmlAmz = '<html><body><span id="productTitle">Fritadeira Mondial</span><span class="priceToPay"><span class="a-offscreen">R$ 299,00</span></span><div><span>ou em até <b>10x</b> de <span>R$ 29,90</span> sem juros</span></div></body></html>';
  const lidoAmz = extrator.lerPaginaProduto({ statusCode: 200, body: htmlAmz }, 'https://www.amazon.com.br/dp/B0AIRF1234');
  assert.equal(lidoAmz.parcelamento, 'Em até 10x de R$ 29,90 sem juros');

  // ML com JSON quantity/amount/rate:0
  const htmlMl = '<html><body><h1 class="ui-pdp-title">Perfume Polo Red 125ml</h1><script>{"installments":{"quantity":10,"amount":34.0,"rate":0}}</script></body></html>';
  const lidoMl = extrator.lerPaginaProduto({ statusCode: 200, body: htmlMl }, 'https://www.mercadolivre.com.br/polo-red/p/MLB999');
  assert.equal(lidoMl.parcelamento, 'Em até 10x de R$ 34,00 sem juros');

  // Exibição em blocoPreco com total parcelado quando > Pix
  const tg = textos.textoTelegram({
    oferta_id: 'o_pix_parc', loja: 'amazon', categoria: 'tech',
    titulo: 'Console PS5 Slim Digital', preco: 3800,
    links_manuais: { preco_de: 4500, pix: true, parcelamento: 'Em até 12x de R$ 350,00 sem juros', preco_parcelado: 4200 },
  }, 'https://amzn.to/ps5', cfg);
  assert.match(tg, /💳 <b>12x de R\$ 350,00 sem juros<\/b> <i>\(total R\$ 4\.200,00\)<\/i>/);
  assert.doesNotMatch(tg, /Como Associado da Amazon/);
});

test('cupom Amazon R$ 100 não infla preço com cupom parcial de R$ 25 + desconto com recorrência avisa cancelamento grátis e valor', () => {
  const extrator = require('../lib/extrator');
  const radar = require('../lib/radar');
  const textos = require('../lib/textos');
  const cfg = cfgBase();

  // 1) Candidato do Telegram já veio com R$ 961 e BLACK100OFF; página Amazon retorna R$ 1.061,09 + badge menor de R$ 25 -> não sobe para 1.036,09
  const cands = [{
    radar_key: 'tg_aoc_1', loja: 'amazon', produto_id: 'amz_B0FGDK8DJM',
    url: 'https://www.amazon.com.br/dp/B0FGDK8DJM', titulo: 'Monitor Gamer AOC AGON 27 QHD',
    preco: 961, preco_de: 1299, cupom: 'BLACK100OFF', pix: true, resolved: true,
  }];
  const htmlAoc = '<html><body><span id="productTitle">Monitor Gamer AOC AGON QUAD 27"</span><span class="priceToPay"><span class="a-offscreen">R$ 1.061,09</span></span><label id="greenBadge1">Salve o cupom R$ 25</label><span>12x de R$ 89,50 sem juros</span></body></html>';
  const finAoc = radar.finalizarRadar(
    { opcoes: { modo: 'agendado', ts: AGORA }, candidatos: cands, reqsPag: [{ idx: 0, url: cands[0].url }], reqsMercado: [] },
    [], [], [], cfg, [{ statusCode: 200, body: htmlAoc }], [],
  );
  assert.equal(finAoc.ofertasNovas.length, 1);
  assert.equal(finAoc.ofertasNovas[0].preco, 961);
  const manAoc = JSON.parse(finAoc.ofertasNovas[0].links_manuais);
  assert.equal(manAoc.preco_sem_cupom, 1061.09);

  // 2) Amazon "R$ 100 de desconto" + Subscribe & Save ("Comprar com recorrência" / Programe e Poupe)
  const htmlSns = '<html><body><span id="productTitle">Creatina 300g</span><span class="priceToPay"><span class="a-offscreen">R$ 100,00</span></span><div id="snsAccordionRowMiddle"><span>Comprar com recorrência</span><span id="snsPrice">R$ 85,00</span><span>Economize 15%</span><span>Economize R$ 15,00</span></div></body></html>';
  const lidoSns = extrator.lerPaginaProduto({ statusCode: 200, body: htmlSns }, 'https://www.amazon.com.br/dp/B0CREA0001');
  assert.equal(lidoSns.recorrencia, true);
  assert.equal(lidoSns.recorrencia_preco, 85);
  assert.equal(lidoSns.recorrencia_pct, 15);

  const tgSns = textos.textoTelegram({
    oferta_id: 'o_sns_1', loja: 'amazon', categoria: 'saude',
    titulo: 'Creatina 300g', preco: 100,
    links_manuais: { preco_de: 130, recorrencia: true, recorrencia_preco: 85, recorrencia_pct: 15 },
  }, 'https://amzn.to/crea', cfg);
  assert.match(tgSns, /🔄 <b>Com recorrência: R\$ 85,00<\/b> \(-15%\) <i>\(cancele grátis a qualquer momento\)<\/i>/);
  assert.doesNotMatch(tgSns, /Como Associado da Amazon/);
});
