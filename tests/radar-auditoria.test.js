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
  const pub = radar.nodes.find((n) => n.name === 'Telegram (pub radar) · envio real') || radar.nodes.find((n) => n.name === 'Telegram (pub radar)');
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

test('imagem: telesco.pe é bloqueada na raiz e substituída pela foto real da Amazon/ML; postGrupo bloqueia telesco.pe também no sendPhoto', () => {
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
  const chPhoto = pub.chamadas.find((c) => c.bot === 'grupo' && c.metodo === 'sendPhoto');
  assert.equal(chPhoto, undefined, 'nunca deve enviar sendPhoto com telesco.pe');
  const chMsg = pub.chamadas.find((c) => c.bot === 'grupo' && c.metodo === 'sendMessage');
  assert.ok(chMsg, 'deve enviar sendMessage limpo com preview do link da loja');
  assert.equal(chMsg.payload.link_preview_options.url, 'https://www.amazon.com.br/dp/B000000001');
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

test('campanha sazonal: reconhece Black Friday, 11.11, 12.12, 01.01, Fim de Ano sem falsos positivos e exibe no post', () => {
  const extrator = require('../lib/extrator');
  const radar = require('../lib/radar');
  const textos = require('../lib/textos');
  const cfg = cfgBase();

  assert.equal(extrator.detectarTagCampanha('Oferta Black Friday no Echo Dot'), 'BLACK FRIDAY');
  assert.equal(extrator.detectarTagCampanha('Smart TV #BlackFriday por R$ 1.899'), 'BLACK FRIDAY');
  assert.equal(extrator.detectarTagCampanha('Mega Promoção 11.11 Shopee'), '11.11');
  assert.equal(extrator.detectarTagCampanha('Liquidação 12.12 no Mercado Livre'), '12.12');
  assert.equal(extrator.detectarTagCampanha('Saldão 01.01 Ano Novo'), '01.01');
  assert.equal(extrator.detectarTagCampanha('Promoção de Fim de Ano na Amazon'), 'FIM DE ANO');
  assert.equal(extrator.detectarTagCampanha('Saldão de Natal Samsung'), 'NATAL');
  // Sem falsos positivos em preços nem nome de produto
  assert.equal(extrator.detectarTagCampanha('Produto por R$ 11.11'), '');
  assert.equal(extrator.detectarTagCampanha('Árvore De Natal 1,80 Metros 540 Galhos'), '');

  // Amazon com selo dealBadge "Oferta Black Friday"
  const htmlAmzBf = '<html><body><nav>Black Friday no menu global</nav><span id="productTitle">Echo Dot 5</span><span id="dealBadgeText">Oferta Black Friday</span><span class="priceToPay"><span class="a-offscreen">R$ 249,00</span></span></body></html>';
  const lidoBf = extrator.lerPaginaProduto({ statusCode: 200, body: htmlAmzBf }, 'https://www.amazon.com.br/dp/B09B8VGCR8');
  assert.equal(lidoBf.campanha, 'BLACK FRIDAY');

  // ML com pílula 11.11
  const htmlMl11 = '<html><body><h1 class="ui-pdp-title">Fone Bluetooth TWS</h1><span class="ui-pdp-promotions-pill-label">OFERTA 11.11</span></body></html>';
  const lido11 = extrator.lerPaginaProduto({ statusCode: 200, body: htmlMl11 }, 'https://www.mercadolivre.com.br/fone-tws/p/MLB555');
  assert.equal(lido11.campanha, '11.11');

  // Preservação via radar e exibição no Telegram
  const tgBf = textos.textoTelegram({
    oferta_id: 'o_bf_1', loja: 'amazon', categoria: 'tech',
    titulo: 'Echo Dot 5', preco: 249,
    links_manuais: { preco_de: 429, campanha: lidoBf.campanha },
  }, 'https://amzn.to/echo', cfg);
  const linhasBf = tgBf.split('\n');
  assert.match(linhasBf[0], /🖤 <b>BLACK FRIDAY<\/b>/);
  assert.doesNotMatch(linhasBf[0], /#BlackFriday|#publi/);
  assert.equal(linhasBf[linhasBf.length - 1], '#BlackFriday #publi');

  const tg11 = textos.textoTelegram({
    oferta_id: 'o_11_1', loja: 'ml', categoria: 'tech',
    titulo: 'Fone TWS', preco: 99,
    links_manuais: { preco_de: 199, campanha: '11.11' },
  }, 'https://mercadolivre.com/sec/tws', cfg);
  const linhas11 = tg11.split('\n');
  assert.match(linhas11[0], /🔥 <b>11\.11<\/b>/);
  assert.doesNotMatch(linhas11[0], /#Oferta1111|#publi/);
  assert.equal(linhas11[linhas11.length - 1], '#Oferta1111 #publi');

  // Texto de canal do Telegram com #BlackFriday chega até finalizarRadar com campanha gravada
  const extTg = extrator.extrairDoTexto('🔥 Black Friday\nFone JBL\nDe R$ 300 por R$ 150 #BlackFriday');
  assert.equal(extTg.campanha, 'BLACK FRIDAY');
  const finBf = radar.finalizarRadar(
    {
      opcoes: { modo: 'agendado', ts: AGORA },
      candidatos: [{
        radar_key: 'tg_bf_1', loja: 'ml', produto_id: 'ml_MLB777',
        url: 'https://www.mercadolivre.com.br/jbl/p/MLB777', titulo: 'Fone JBL Tune',
        preco: 150, preco_de: 300, desconto_pct: 50, campanha: 'BLACK FRIDAY', resolved: true,
      }],
      reqsPag: [], reqsMercado: [],
    },
    [], [], [], cfg, [], [],
  );
  assert.equal(JSON.parse(finBf.ofertasNovas[0].links_manuais).campanha, 'BLACK FRIDAY');
});

test('destravamento radar: descarta nao-produto (sem deadlock), prioriza link do produto sobre resgate de cupons, pula chamada xet e suporta Magalu + frete + Zap por categoria', () => {
  const radar = require('../lib/radar');
  const extrator = require('../lib/extrator');
  const cfg = cfgBase([
    { chave: 'radar.canais_curados', valor: 'nao' },
    { chave: 'radar.canais_telegram', valor: '@CanaltechOfertas;@xetdaspromocoes' },
    { chave: 'whatsapp.webhook_url', valor: 'https://evo.local/message/sendText/oferto' },
    { chave: 'whatsapp.grupo_destino', valor: '120363000@g.us' },
    { chave: 'whatsapp.grupo.tech', valor: '120363999@g.us' },
    { chave: 'whatsapp.enviar_imagem', valor: 'sim' },
  ]);

  // 1) CanaltechOfertas com link de "Resgate todos os cupons" ANTES do link do produto + Xet com linha 1 de chamada 📢
  const htmlCt = '<div class="tgme_widget_message_wrap"><div data-post="CanaltechOfertas/13864"><div class="tgme_widget_message_text">' +
    'Quer jogar com mais conforto?<br>Cadeira Gamer TGT Heron Preta<br>R&#036; 324 no PIX<br>' +
    'Resgate todos os cupons Shopee! <a href="https://s.shopee.com.br/cupomHub1">s.shopee.com.br/cupomHub1</a><br>' +
    'Compre pelo link: <a href="https://s.shopee.com.br/produtoReal2">s.shopee.com.br/produtoReal2</a>' +
    '</div></div></div>' +
    '<div class="tgme_widget_message_wrap"><div data-post="xetdaspromocoes/93782"><div class="tgme_widget_message_text">' +
    '📢 BORA ORGANIZAR SUA DESPENSA<br>Kit com 15 Potes Herméticos Com Tampa<br>De R&#036; 149 por R&#036; 77<br>' +
    '<a href="https://meli.la/pote15">https://meli.la/pote15</a>' +
    '</div></div></div>';

  const ctItens = radar.lerCanalTelegramPublico(htmlCt, 'CanaltechOfertas');
  assert.equal(ctItens.length, 2);
  assert.equal(ctItens[0].redir_url, 'https://s.shopee.com.br/produtoReal2');
  assert.deepEqual(ctItens[0].redir_url_alts, ['https://s.shopee.com.br/cupomHub1']);
  assert.equal(ctItens[1].titulo, 'Kit com 15 Potes Herméticos Com Tampa');

  // 2) Fallback quando link primário cai em /m/cupom-de-desconto e deadlock prevention no finalizarRadar
  const est = {
    opcoes: { modo: 'agendado', ts: AGORA },
    candidatos: [
      { radar_key: 'tg_ct_dead', loja: '', titulo: 'Cadeira Gamer TGT Heron', preco: 324, preco_de: 599, desconto_pct: 45, redir_url: 'https://s.shopee.com.br/onlyHub', redir_url_alts: [] },
      { radar_key: 'tg_ct_alt', loja: '', titulo: 'Kit Ventoinha Gamer ARGB', preco: 59, preco_de: 99, desconto_pct: 40, redir_url: 'https://s.shopee.com.br/firstHub', redir_url_alts: ['https://s.shopee.com.br/secondProd'] },
      { radar_key: 'pb_429', fonte_radar: 'promobit', loja: 'amazon', titulo: 'SSD 1TB NVMe', preco: 399, preco_de: 599, desconto_pct: 33, redir_url: 'https://www.promobit.com.br/Redirect/to/429/' },
    ],
    reqs1: [
      { idx: 0, url: 'https://s.shopee.com.br/onlyHub' },
      { idx: 1, url: 'https://s.shopee.com.br/firstHub' },
      { idx: 2, url: 'https://www.promobit.com.br/Redirect/to/429/' },
    ],
  };
  const r1 = radar.aplicarRedirRadar1(est, [
    { statusCode: 301, headers: { location: 'https://shopee.com.br/m/cupom-de-desconto?utm_source=x' } },
    { statusCode: 301, headers: { location: 'https://shopee.com.br/m/cupom-de-desconto?utm_source=y' } },
    { statusCode: 429, body: '<title>Acesso Bloqueado</title>' },
  ], cfg);
  assert.equal(r1.promobit_429, true);
  assert.equal(r1.reqs2.length, 1);
  assert.equal(r1.reqs2[0].url, 'https://s.shopee.com.br/secondProd');
  const finDead = radar.finalizarRadar(Object.assign({}, r1, { reqs3: [], reqsPag: [], reqsMercado: [] }), [], [], [], cfg, [], []);
  // Deadlink não-429 vai para descartadas (não trava próximas rodadas); promobit 429 não suja radar_descartes por 6h
  assert.ok(finDead.resumo.descartadas.some((d) => d.radar_key === 'tg_ct_dead' && d.motivo === 'nao_produto'));
  assert.ok(!finDead.resumo.descartadas.some((d) => d.radar_key === 'pb_429'));

  // 3) Magalu + frete grátis + Zap por categoria + imagem
  const idMgl = L.identificar('https://www.magazineluiza.com.br/air-fryer-mondial/p/123456/');
  assert.equal(idMgl.loja, 'magalu');
  assert.ok(idMgl.produto_id.startsWith('mgl_'));
  const pagFrete = extrator.lerPaginaProduto({ statusCode: 200, body: '<html><body><h1 id="productTitle">Mouse Gamer Logitech</h1><span>Entrega GRÁTIS quinta-feira</span></body></html>' }, 'https://www.amazon.com.br/dp/B099999999');
  assert.equal(pagFrete.frete_gratis, true);
  assert.equal(pagFrete.frete, 0);

  const waCalls = L.montarChamadasWhatsAppAuto(
    { oferta_id: 'ow1', categoria: 'tech', titulo: 'Mouse Gamer', imagem: 'https://m.media-amazon.com/images/I/mouse.jpg' },
    'Texto Zap',
    '',
    cfg,
  );
  assert.equal(waCalls.length, 1);
  assert.match(waCalls[0].url, /\/message\/sendMedia\//);
  assert.equal(waCalls[0].body.number, '120363999@g.us');

  // 4) Perfume com chamada "VOLTOU O QUASAR..." usa Linha 2 real + fallback foto de mercado + Tamanhos + Reenvio binário
  const htmlXetQuasar = '<div class="tgme_widget_message_wrap"><div data-post="xetdaspromocoes/93795"><div class="tgme_widget_message_text">' +
    'VOLTOU O QUASAR 63 CONTO, aproveita antes que esgote<br><br>Perfume Boticário Quasar Blue 100ml<br><br>' +
    'De R&#036; 164 por R&#036; 63 no Pix<br>Tamanhos: P, M, G<br><a href="https://meli.la/2U7fPvg">link</a>' +
    '</div></div></div>';
  const quasarItens = radar.lerCanalTelegramPublico(htmlXetQuasar, 'xetdaspromocoes');
  assert.equal(quasarItens[0].titulo, 'Perfume Boticário Quasar Blue 100ml');
  assert.equal(quasarItens[0].tamanhos, 'P, M, G');

  const pagAmzTam = extrator.lerPaginaProduto({
    statusCode: 200,
    body: '<html><head><script>"size_name":["39","40","41","42"]</script></head><body><h1 id="productTitle">Tênis Esportivo</h1></body></html>',
  }, 'https://www.amazon.com.br/dp/B0MODA1234');
  assert.equal(pagAmzTam.tamanhos, '39, 40, 41, 42');
  const tgModa = L.textoTelegram({
    oferta_id: 'om1', loja: 'amazon', categoria: 'moda', titulo: 'Tênis Esportivo', preco: 199,
    links_manuais: { preco_de: 399, tamanhos: pagAmzTam.tamanhos },
  }, 'https://www.amazon.com.br/dp/B0MODA1234', cfg);
  assert.match(tgModa, /📏 <b>Tamanhos:<\/b> 39, 40, 41, 42/);

  const candSemImg = [{
    radar_key: 'q1', loja: 'ml', produto_id: 'ml_MLBQUASAR1', url: 'https://produto.mercadolivre.com.br/MLB-123',
    titulo: 'Perfume Boticário Quasar Deep Blue 100ml', preco: 74, preco_de: 164, desconto_pct: 55, resolved: true,
    imagem: 'https://cdn1.telesco.pe/file/broken',
  }];
  const finMercImg = radar.finalizarRadar(
    { opcoes: { modo: 'agendado', ts: AGORA }, candidatos: candSemImg, reqsPag: [], reqsMercado: [{ idx: 0, fonte: 'zoom' }] },
    [],
    [],
    [],
    cfg,
    [],
    [{ statusCode: 200, body: `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { hits: [{ name: 'Perfume Quasar Deep Blue 100ml O Boticario', price: 151.05, image: 'https://image.zst.com.br/quasar.jpg' }] } } })}</script>` }],
  );
  assert.equal(finMercImg.ofertasNovas[0].imagem, 'https://image.zst.com.br/quasar.jpg');

  const chFoto = {
    bot: 'grupo', metodo: 'sendPhoto',
    payload: { chat_id: -100, photo: 'https://image.zst.com.br/quasar.jpg', caption: 'oi' },
    fallback: { bot: 'grupo', metodo: 'sendMessage', payload: { chat_id: -100, text: 'oi' } },
  };
  const limBin = L.limiteTelegram([chFoto], [{ ok: false, error_code: 400, description: 'Bad Request: failed to get HTTP URL content' }], { tentarBinario: true });
  assert.equal(limBin.indices.length, 1);
  assert.equal(limBin.reenviar[0]._tentar_binario, true);
  assert.equal(limBin.reenviar[0].download_url, 'https://image.zst.com.br/quasar.jpg');

  // Reenvio binário NUNCA deve baixar telesco.pe ou imagem proibida: cai direto no fallback texto
  const chFotoProibida = {
    bot: 'grupo', metodo: 'sendPhoto',
    payload: { chat_id: -100, photo: 'https://cdn1.telesco.pe/file/watermark_xet.jpg', caption: 'oi' },
    fallback: { bot: 'grupo', metodo: 'sendMessage', payload: { chat_id: -100, text: 'oi' } },
  };
  const limProibido = L.limiteTelegram([chFotoProibida], [{ ok: false, error_code: 400, description: 'Bad Request: failed to get HTTP URL content' }], { tentarBinario: true });
  assert.equal(limProibido.indices.length, 1);
  assert.equal(limProibido.reenviar[0]._tentar_binario, undefined);
  assert.equal(limProibido.reenviar[0].metodo, 'sendMessage');
});

test('blindagem definitiva anti-@/watermark, vitrine /social/ ML com foto .jpg oficial, limpeza de ganchos multi-parágrafo e ofertou.ai', () => {
  const radar = require('../lib/radar');
  const extrator = require('../lib/extrator');
  const lojas = require('../lib/lojas');
  const cfg = cfgBase();

  // 1) ehImagemProibida e normalizarImagemOferta bloqueiam telesco.pe, t.me, pelando, gatry, redes sociais e watermarks
  const proibidas = [
    'https://cdn1.telesco.pe/file/wda3e2.jpg',
    'https://cdn4.telesco.pe/file/xyz.jpg',
    'https://t.me/i/userpic/320/xetdaspromocoes.jpg',
    'https://www.pelando.com.br/img/123.jpg',
    'https://gatry.com/uploads/img.jpg',
    'https://nerdofertas.com/banner.jpg',
    'https://ofertou.ai/logo.png',
    'https://m.media-amazon.com/images/G/32/social_share/amazon_logo.png',
    'https://wsrv.nl/?url=cdn1.telesco.pe%2Ffile%2Fabc.jpg',
  ];
  for (const u of proibidas) {
    assert.equal(lojas.ehImagemProibida(u), true, `Deve bloquear: ${u}`);
    assert.equal(lojas.normalizarImagemOferta(u), '', `Deve limpar: ${u}`);
  }

  // 2) normalizarImagemOferta converte .webp do Mercado Livre (mlstatic.com) para .jpg e limpa sufixo _AC_UL320_ da Amazon
  assert.equal(
    lojas.normalizarImagemOferta('https://http2.mlstatic.com/D_NQ_NP_2X_608256-MLA99864310153_112025-F-{sanitized_title}.webp'),
    'https://http2.mlstatic.com/D_NQ_NP_2X_608256-MLA99864310153_112025-F-.jpg',
  );
  assert.equal(
    lojas.normalizarImagemOferta('https://m.media-amazon.com/images/I/51H7bcV-cEL._AC_UL320_.jpg'),
    'https://m.media-amazon.com/images/I/51H7bcV-cEL.jpg',
  );
  assert.equal(lojas.ehImagemLojaOficial('https://http2.mlstatic.com/D_NQ_NP_2X_608256-MLA99864310153_112025-F.jpg'), true);

  // 3) Caso real do print do usuário: GTA VI com @xetdaspromocoes no cdn1.telesco.pe + chamada multi-parágrafo
  const htmlXetGta = [
    '<div class="tgme_widget_message_wrap" data-post="xetdaspromocoes/93888">',
    '<div class="tgme_widget_message_photo_wrap" style="background-image:url(\'https://cdn1.telesco.pe/file/gta6_watermark_xet.jpg\')"></div>',
    '<div class="tgme_widget_message_text">',
    'BAIXOU GTA VI NA PRÉ-VENDA PARCELADO, somente pagamento com cartão mercado pago<br/><br/>',
    'Grand Theft Auto VI PlayStation 5<br/><br/>',
    'De R$ 499,00 por R$ 359,00 em 10x sem juros<br/>',
    'Use o cupom: <code>MP100GAMES</code><br/>',
    '<a href="https://meli.la/1gta6ps5">https://meli.la/1gta6ps5</a>',
    '</div></div>',
  ].join('');
  const itensGta = radar.lerCanalTelegramPublico(htmlXetGta, 'xetdaspromocoes');
  assert.equal(itensGta.length, 1);
  assert.equal(itensGta[0].imagem, '', 'Nunca deve capturar imagem do tgme_widget_message_photo_wrap');
  assert.equal(itensGta[0].titulo, 'Grand Theft Auto VI PlayStation 5');
  assert.equal(itensGta[0].cupom, 'MP100GAMES');
  assert.equal(itensGta[0].preco, 359);

  // 4) Vitrine /social/ do Mercado Livre extrai título oficial e foto oficial .jpg da http2.mlstatic.com
  const htmlSocialMl = [
    '<div class="poly-card">',
    '<div class="poly-card__portada"><img class="poly-component__picture" src="https://http2.mlstatic.com/D_Q_NP_2X_615987-MLA107960508252_032026-AB.webp" /></div>',
    '<a class="poly-component__title" href="https://www.mercadolivre.com.br/grand-theft-auto-vi-edico-padro-fisico-playstation-5/p/MLB64747191">Grand Theft Auto VI Edição Padrão Físico PlayStation 5</a>',
    '<s class="andes-money-amount--previous"><span class="andes-money-amount__fraction">499</span></s>',
    '</div>',
  ].join('');
  const dadosSocial = radar.extrairDadosHtmlSocial(htmlSocialMl, itensGta[0].titulo);
  assert.ok(dadosSocial);
  assert.equal(dadosSocial.url, 'https://www.mercadolivre.com.br/grand-theft-auto-vi-edico-padro-fisico-playstation-5/p/MLB64747191');
  assert.equal(dadosSocial.imagem, 'https://http2.mlstatic.com/D_Q_NP_2X_615987-MLA107960508252_032026-AB.jpg');
  assert.equal(dadosSocial.titulo, 'Grand Theft Auto VI Edição Padrão Físico PlayStation 5');

  // 5) Vitrine /lists expirada com produto nada a ver é rejeitada por incompatibilidade de título
  const htmlListExpirada = [
    '<div class="poly-card">',
    '<a class="poly-component__title" href="https://www.mercadolivre.com.br/conjunto-panelas-antiaderente-10-pecas-teflon/p/MLB38252521">Conjunto Panelas Antiaderente 10 Peças Teflon</a>',
    '</div>',
  ].join('');
  const socialMismatch = radar.extrairDadosHtmlSocial(htmlListExpirada, 'Fritadeira Elétrica Air Fryer Oven 12L');
  assert.equal(socialMismatch, null);

  // 6) Chamadas como "KIT PRO SOLTEIRO SAIR DE CASA" / "corre q o cupom tá esgotando" / "MENOR PREÇO HISTÓRICO? 🔥" são filtradas
  assert.equal(extrator.pareceChamadaOuGancho('BAIXOU GTA VI NA PRÉ-VENDA PARCELADO, somente pagamento com cartão mercado pago'), true);
  assert.equal(extrator.pareceChamadaOuGancho('KIT PRO SOLTEIRO SAIR DE CASA'), true);
  assert.equal(extrator.pareceChamadaOuGancho('corre q o cupom tá esgotando'), true);
  assert.equal(extrator.pareceChamadaOuGancho('MENOR PREÇO HISTÓRICO? 🔥'), true);
  assert.equal(extrator.pareceChamadaOuGancho('Grand Theft Auto VI PlayStation 5'), false);

  // 7) ofertou.ai é reconhecido como link curto e /up/MLBU reconstrói slug limpo sem prefixo da vitrine
  assert.equal(L.ehCurto('https://ofertou.ai/v8F1k'), true);
  assert.equal(
    extrator.tituloDaUrl('https://www.mercadolivre.com.br/botdoafiliado/up/MLBU123456-conjunto-panelas-antiaderente-10-pecas-teflon'),
    'Conjunto Panelas Antiaderente 10 Peças Teflon',
  );

  // 8) prepararPaginasRadar executa extrairDadosHtmlSocial na vitrine /social/ sem ser atropelado por lerLocation,
  //    ignorando links de menu c_category_id=MLB1196 e extraindo foto .jpg, título, parcelamento recalculado e campanha
  const htmlSocialCompleto = [
    '<a href="https://www.mercadolivre.com.br/c/livros-revistas-e-comics#c_id=/home/categories&c_category_id=MLB1196">Menu</a>',
    '<div class="poly-card"><div class="poly-card__portada">',
    '<img class="poly-component__picture" src="https://http2.mlstatic.com/D_Q_NP_2X_709765-MLA105292090682_012026-V.webp" />',
    '</div><div class="poly-card__content">',
    '<span class="poly-component__highlight">BLACK FRIDAY</span>',
    '<a class="poly-component__title" href="https://www.mercadolivre.com.br/cadeira-de-escritorio-ergonomica-giratoria-b100-boston/p/MLB55184610#c_id=/home/card-featured/element">Cadeira De Escritório Ergonômica Giratória B100 Boston Cinza</a>',
    '<s class="andes-money-amount--previous"><span class="andes-money-amount__fraction">746</span><span class="andes-money-amount__cents">12</span></s>',
    '<div class="poly-price__current"><span class="andes-money-amount__fraction">439</span><span class="andes-money-amount__cents">90</span></div>',
    '<span class="poly-price__installments">8x <span class="andes-money-amount__currency-symbol">R$</span><span class="andes-money-amount__fraction">54</span>,<span class="andes-money-amount__cents">99</span> sem juros</span>',
    '</div></div>',
  ].join('');
  const prepSoc = radar.prepararPaginasRadar(
    {
      candidatos: [{ titulo: 'Cadeira de Escritório Ergonômica Giratória B100 Boston', preco: 359, cupom: 'OFFHOJEML', loja: 'ml' }],
      reqs3: [{ idx: 0, url: 'https://www.mercadolivre.com.br/social/xetdaspromocoes' }],
    },
    [{ body: htmlSocialCompleto, statusCode: 200 }],
    {},
  );
  assert.equal(prepSoc.reqsPag.length, 0, 'Não deve agendar leitura redundante da PDP bloqueada do ML quando a vitrine /social/ já enriqueceu');
  assert.equal(prepSoc.candidatos[0].imagem, 'https://http2.mlstatic.com/D_Q_NP_2X_709765-MLA105292090682_012026-V.jpg');
  assert.equal(prepSoc.candidatos[0].preco_sem_cupom, 439.9);
  assert.equal(prepSoc.candidatos[0].preco_de, 746.12);
  assert.equal(prepSoc.candidatos[0].parcelamento, 'Em até 8x de R$ 44,88 sem juros');
  assert.equal(prepSoc.candidatos[0].campanha, 'BLACK FRIDAY');

  // 9) Vitrine /social/ com card-featured de produto diferente do candidato seleciona o card que casa os tokens ou descarta
  const htmlSocialMulti = [
    '<div class="poly-card"><div class="poly-card__portada">',
    '<img class="poly-component__picture" src="https://http2.mlstatic.com/D_Q_NP_2X_111111-MLA111_012026-V.webp" />',
    '</div><a class="poly-component__title" href="https://www.mercadolivre.com.br/smart-tv-50-polegadas-4k/p/MLB11111111#c_id=/home/card-featured/element">Smart TV 50 Polegadas 4K</a></div>',
    '<div class="poly-card"><div class="poly-card__portada">',
    '<img class="poly-component__picture" src="https://http2.mlstatic.com/D_Q_NP_2X_615987-MLA107960508252_032026-AB.webp" />',
    '</div><a class="poly-component__title" href="https://www.mercadolivre.com.br/grand-theft-auto-vi-edico-padro-fisico-playstation-5/p/MLB64747191">Grand Theft Auto VI Edição Padrão Físico PlayStation 5</a></div>',
  ].join('');
  const multiMatch = radar.extrairDadosHtmlSocial(htmlSocialMulti, 'Grand Theft Auto VI PlayStation 5');
  assert.ok(multiMatch);
  assert.equal(multiMatch.url, 'https://www.mercadolivre.com.br/grand-theft-auto-vi-edico-padro-fisico-playstation-5/p/MLB64747191');
  assert.equal(radar.extrairDadosHtmlSocial(htmlListExpirada, 'Airfryer'), null, 'Candidato de 1 token não deve aceitar card incompatível');

  // 10) Entidades HTML tipográficas (&rdquo;, &ldquo;, &ndash;) e classificação de toalhas absorventes / relógios
  const htmlEntidades = [
    '<div class="tgme_widget_message_wrap" data-post="ofertasdecomputador/29590">',
    '<div class="tgme_widget_message_text">',
    'Tablet VAIO TL10 8GB 128GB Octa-Core, Tela 10.4&rdquo; 2K &ndash; Preto<br/>',
    'Por R$ 1.249,00<br/>',
    '<a href="https://www.amazon.com.br/dp/B0BZQKVC7J">https://www.amazon.com.br/dp/B0BZQKVC7J</a>',
    '</div></div>',
  ].join('');
  const itensEnt = radar.lerCanalTelegramPublico(htmlEntidades, 'ofertasdecomputador');
  assert.equal(itensEnt.length, 1);
  assert.ok(!itensEnt[0].titulo.includes('&rdquo;'), 'Não deve manter &rdquo; literal no título');
  assert.ok(itensEnt[0].titulo.includes('10.4" 2K – Preto'));
  assert.equal(
    extrator.classificarCategoria('Jogo Toalhas Banho Grossas Macias Algodão 4pc Absorventes', {}, 'MLB-4125132275-jogo-toalhas-banho-grossas-macias-algodo-4pc-absorventes').categoria,
    'casa',
  );
  assert.equal(
    extrator.classificarCategoria('Relógio Technos Masculino Racer Básico Prata 2115twv1k', {}, '').categoria,
    'moda',
  );
});

test('seção dedicada K-Pop: categoria, lojas legítimas com entrega no BR, parsers UMusic/Nuvemshop e comandos', () => {
  const lojas = require('../lib/lojas');
  const extrator = require('../lib/extrator');
  const config = require('../lib/config');
  const comunidade = require('../lib/comunidade');
  const radar = require('../lib/radar');
  const cfg = config.padrao();

  // 1) Categoria kpop registrada e auto-classificada
  assert.ok(cfg.categorias.kpop);
  assert.equal(cfg.categorias.kpop.emoji, '💿');
  assert.ok(config.esquema().some((e) => e.chave === 'shopee.busca.kpop' && /album kpop oficial/i.test(e.padrao)));
  assert.equal(extrator.classificarCategoria('Álbum Stray Kids ATE Official Hanteo Photocard', cfg, '').categoria, 'kpop');
  assert.equal(extrator.classificarCategoria('Lightstick Oficial BTS Army Bomb Ver.4', cfg, '').categoria, 'kpop');
  assert.equal(comunidade.detectarCategoriaCanal('Ofertô K-Pop · Álbuns & Lightsticks', 'oferto_kpop'), 'kpop');

  // 2) Identificação de lojas legítimas com entrega no Brasil + allowlist oficial de imagem
  assert.equal(lojas.identificar('https://www.umusicstore.com/cd-stray-kids-ate-123/p').loja, 'umusic');
  assert.equal(lojas.identificar('https://www.klinestore.com.br/produtos/bts-proof/').loja, 'klinestore');
  assert.equal(lojas.identificar('https://www.hopescolor.com/produtos/twice-with-you-th/').loja, 'hopescolor');
  assert.equal(lojas.identificar('https://www.asiaticstore.com.br/produtos/enhypen-romance/').loja, 'asiaticstore');
  assert.equal(lojas.identificar('https://kpopmerch.com/products/aespa-armageddon').loja, 'kpopmerch');
  assert.equal(lojas.identificar('https://www.ktown4u.com/iteminfo?goods_no=12345').loja, 'ktown4u');
  assert.equal(lojas.identificar('https://shop.weverse.io/en/shop/GL_USD/artists/2/sales/123').loja, 'weverse');
  assert.equal(lojas.ehImagemLojaOficial('https://acdn-us.mitiendanube.com/stores/987/955/products/img_1843.jpg'), true);
  assert.equal(lojas.ehImagemLojaOficial('https://universalmusic.vteximg.com.br/arquivos/ids/203561/cd.jpg'), true);

  // 3) Parser UMusic Store VTEX + Nuvemshop (K-Line / Hopescolor / Asiatic)
  const vtexItems = radar.lerUmusicVtex([
    {
      productId: '7371',
      productName: 'Vinil KPop Demon Hunters - Free (LP 7") - Importado',
      link: 'https://www.umusicstore.com/vinil-kpop-7371/p',
      items: [{
        images: [{ imageUrl: 'https://universalmusic.vteximg.com.br/arquivos/ids/196012/vinil.jpg' }],
        sellers: [{ commertialOffer: { Price: 139.93, ListPrice: 199.9, AvailableQuantity: 10 } }],
      }],
    },
    {
      productId: '9999',
      productName: 'Item Esgotado',
      link: 'https://www.umusicstore.com/esgotado/p',
      items: [{
        images: [{ imageUrl: 'https://universalmusic.vteximg.com.br/arquivos/ids/1/esg.jpg' }],
        sellers: [{ commertialOffer: { Price: 99.9, ListPrice: 149.9, AvailableQuantity: 0 } }],
      }],
    },
  ]);
  assert.equal(vtexItems.length, 1);
  assert.equal(vtexItems[0].loja, 'umusic');
  assert.equal(vtexItems[0].produto_id, 'umu_7371');
  assert.equal(vtexItems[0].desconto_pct, 30);
  assert.equal(vtexItems[0].categoria_hint, 'kpop');

  const htmlNuvem = `
    <div class="js-item-product" data-product-id="119" data-variants="[{&quot;product_id&quot;:119,&quot;price_number&quot;:199,&quot;compare_at_price_number&quot;:279,&quot;stock&quot;:5,&quot;available&quot;:true,&quot;image_url&quot;:&quot;//acdn-us.mitiendanube.com/stores/987/955/products/bts.jpg&quot;}]">
      <a href="https://www.klinestore.com.br/produtos/bts-proof-oficial/" title="BTS Proof Álbum Oficial">BTS Proof Álbum Oficial</a>
    </div>
  `;
  const nuvemItems = radar.lerNuvemshopKpop(htmlNuvem, 'klinestore', 'https://www.klinestore.com.br/produtos/');
  assert.equal(nuvemItems.length, 1);
  assert.equal(nuvemItems[0].loja, 'klinestore');
  assert.equal(nuvemItems[0].preco, 199);
  assert.equal(nuvemItems[0].preco_de, 279);
  assert.equal(nuvemItems[0].desconto_pct, 29);
  assert.equal(nuvemItems[0].imagem, 'https://acdn-us.mitiendanube.com/stores/987/955/products/bts.jpg');

  // 4) Comando /radar kpop e planejamento de fontes K-Pop
  const cmdKpop = config.interpretarComandoRadar('/radar kpop', cfg);
  assert.equal(cmdKpop.acao, 'buscar');
  assert.deepEqual(cmdKpop.categorias, ['kpop']);
  assert.ok(cmdKpop.lojas.includes('shopee') && cmdKpop.lojas.includes('amazon') && cmdKpop.lojas.includes('umusic'));

  const planKpop = radar.planejarFontesRadar(cfg, { modo: 'comando', categorias: ['kpop'], ts: AGORA });
  assert.ok(planKpop.fontesWeb.some((f) => f.tipo === 'umusic_vtex'));
  assert.ok(planKpop.fontesWeb.some((f) => f.tipo === 'nuvemshop_kpop' && f.loja_hint === 'klinestore'));
  assert.ok(planKpop.fontesWeb.some((f) => f.tipo === 'amazon_busca' && f.categoria_hint === 'kpop'));
  assert.ok(planKpop.fontesWeb.some((f) => f.loja_hint === 'hopescolor') && planKpop.fontesWeb.some((f) => f.loja_hint === 'kpopandyoushop'));

  const planKpopExtra = radar.planejarFontesRadar(cfg, { modo: 'comando', categorias: ['kpop'], lojas: ['klinestore', 'hopescolor'], ts: AGORA });
  assert.ok(planKpopExtra.fontesWeb.some((f) => f.tipo === 'nuvemshop_kpop' && f.loja_hint === 'hopescolor'));

  // 5) Regressão: título iniciado com "Pronta Entrega ..." não pode ser apagado deixando <a href="..."></a> sem link visível
  const { enxugarTituloOferta } = require('../lib/copy');
  const textos = require('../lib/textos');
  const titLimpo = enxugarTituloOferta('Pronta Entrega Mini Photocard Membership Bts', 105);
  assert.ok(titLimpo.length >= 10, 'não deve zerar título após Pronta Entrega');
  assert.match(titLimpo, /Mini Photocard Membership Bts/i);
  const msgKpop = textos.textoTelegram({
    oferta_id: 'ok1', produto_id: 'kln_1', loja: 'klinestore', categoria: 'kpop',
    titulo: 'Pronta Entrega Mini Photocard Membership Bts', preco: 49.9, selo: 'sem_ref',
    links_manuais: '{"modo_link":true,"preco_de":79.9}',
  }, 'https://www.klinestore.com.br/produtos/bts-mini-photocard/', cfg);
  assert.match(msgKpop, /<a href="https:\/\/www\.klinestore\.com\.br\/produtos\/bts-mini-photocard\/">[^<]+<\/a>/);
});

test('regressões produção 19/11: relógio Tommy Hilfiger em moda, Johnson s Baby sem R$ 0,96, 2x Camiseta Insider, 25G523B e Shopee K-Pop confiável', () => {
  const extrator = require('../lib/extrator');
  const radar = require('../lib/radar');
  const mercado = require('../lib/mercado');
  const cfg = cfgBase([
    { chave: 'radar.min_desconto_pct', valor: '15' },
    { chave: 'radar.preco_min', valor: '15' },
    { chave: 'shopee.app_id', valor: 'app1' },
    { chave: 'shopee.secret', valor: 'sec1' },
  ]);

  // 1) Relógio Tommy Hilfiger / Cueca CK / Batom Dior / Smartwatch Amazfit / Johnson's Baby vs Perfumes reais
  assert.equal(extrator.classificarCategoria('Relógio Tommy Hilfiger David Masculino Em Borracha Preta 171 Preto', cfg, '').categoria, 'moda');
  assert.equal(extrator.classificarCategoria('Kit 3 Cuecas Boxer Calvin Klein Algodão', cfg, '').categoria, 'moda');
  assert.equal(extrator.classificarCategoria('Batom Dior Rouge Matte 999', cfg, '').categoria, 'beleza');
  assert.equal(extrator.classificarCategoria('Relógio Smartwatch Amazfit GTR 4', cfg, '').categoria, 'tech');
  assert.equal(extrator.classificarCategoria("Sabonete Líquido Johnson's Baby Hora do Sono, Lavanda, 400ml", cfg, '').categoria, 'bebe');
  assert.equal(extrator.classificarCategoria('Perfume Tommy Hilfiger Impact Masculino Eau de Toilette 100ml', cfg, '').categoria, 'perfumes');
  assert.equal(extrator.classificarCategoria('Boss Bottled Tonic 100 Ml Eau De Toilette De Hugo Boss', cfg, '').categoria, 'perfumes');

  // 2) Camiseta Tech Light Insider: "adicione 2 unidades" + "2x" preservado após enriquecimento da página e não reprovado pelo comparador de 1 unidade
  const htmlXetInsider = '<div class="tgme_widget_message_wrap"><div data-post="xetdaspromocoes/94055"><div class="tgme_widget_message_text">' +
    '48 CONTO CADA INSIDER<br/>adicione 2 unidades e aplique o cupom<br/><br/>' +
    '2x Camiseta Tech Light Insider (3 cores)<br/><br/>' +
    'De R$ 259 por R$ 96 no Pix<br/>Use o Cupom: <code>VOCE10</code> + Selecione Pix<br/>' +
    '<a href="https://www.mercadolivre.com.br/camiseta-tech-light-insider/p/MLB4232914111">link</a>' +
    '</div></div></div>';
  const candsIns = radar.lerCanalTelegramPublico(htmlXetInsider, 'xetdaspromocoes');
  assert.equal(candsIns.length, 1);
  assert.equal(candsIns[0]._qtd_unidades, 2);
  assert.match(candsIns[0].titulo, /^2x /);
  assert.match(candsIns[0].campanha, /Adicione 2 unidades \(R\$ 48,00 cada\)/);

  const finIns = radar.finalizarRadar(
    {
      opcoes: { modo: 'agendado', ts: AGORA },
      candidatos: [Object.assign({}, candsIns[0], { resolved: true, produto_id: 'ml_MLB4232914111', url: 'https://www.mercadolivre.com.br/camiseta-tech-light-insider/p/MLB4232914111', categoria: 'moda' })],
      reqsPag: [{ idx: 0, url: 'https://www.mercadolivre.com.br/camiseta-tech-light-insider/p/MLB4232914111' }],
      reqsMercado: [{ idx: 0, fonte: 'zoom' }],
    },
    [], [], [], cfg,
    [{ statusCode: 200, body: '<html><body><h1 class="ui-pdp-title">Camiseta Tech Light Insider Masculino</h1><meta property="price" content="69.00"/></body></html>' }],
    [{ statusCode: 200, body: `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { hits: [{ name: 'Camiseta Tech Light Insider Masculino', price: 69, merchantName: 'Insider', image: 'https://i.zst.com.br/insider.jpg' }] } } })}</script>` }],
  );
  assert.equal(finIns.ofertasNovas.length, 1);
  assert.equal(finIns.ofertasNovas[0].titulo, '2x Camiseta Tech Light Insider Masculino');
  assert.equal(finIns.ofertasNovas[0].preco, 96);
  assert.equal(mercado.casarProdutosMercado({ titulo: '2x Camiseta Tech Light Insider Masculino', preco: 96 }, [{ titulo: 'Camiseta Tech Light Insider Masculino', preco: 69 }]).length, 0);

  // 3) Johnson's Baby com cupom Amazon R$ 25 sobre R$ 25,96 (que daria R$ 0,96) é ignorado e abaixo de preco_min (15) é bloqueado
  const htmlAmzJB = '<html><body><span id="productTitle">Creme para Pentear Johnson&apos;s Baby Cachos dos Sonhos, 200ml</span><span class="priceToPay"><span class="a-offscreen">R$ 25,96</span></span><label id="greenBadge1">Salve o cupom R$ 25 em compras de R$ 100</label><span id="promoMessageCXCW1">: RELAMPAGO20</span></body></html>';
  const lidoJB = extrator.lerPaginaProduto({ statusCode: 200, body: htmlAmzJB }, 'https://www.amazon.com.br/dp/B07MT9LCV1');
  assert.equal(lidoJB.cupom_valor, null);

  const finSubMin = radar.finalizarRadar(
    {
      opcoes: { modo: 'agendado', ts: AGORA },
      candidatos: [{
        radar_key: 'pb_jb', loja: 'amazon', produto_id: 'amz_B07MT9LCV1',
        url: 'https://www.amazon.com.br/dp/B07MT9LCV1', titulo: "Johnson's Baby Creme Cachos 200ml",
        preco: 19, preco_de: 49.99, desconto_pct: 62, categoria: 'bebe', resolved: true,
      }],
      reqsPag: [{ idx: 0, url: 'https://www.amazon.com.br/dp/B07MT9LCV1' }],
      reqsMercado: [],
    },
    [], [], [], cfg,
    [{ statusCode: 200, body: '<html><body><span id="productTitle">Creme</span><span class="priceToPay"><span class="a-offscreen">R$ 16,00</span></span><label id="greenBadge1">Salve o cupom R$ 10</label></body></html>' }],
    [],
  );
  assert.equal(finSubMin.ofertasNovas.length, 0);
  assert.ok(finSubMin.resumo.descartadas.some((d) => d.motivo === 'abaixo_preco_minimo' || d.motivo === 'sem_prova_de_desconto'));

  // 2b) Preço irreal vindo de cupom R$ 50 OFF em produto de R$ 644,29 é descartado
  const estBike = {
    opcoes: { modo: 'agendado', ts: AGORA },
    candidatos: [{
      radar_key: 'tg_nerdofertas_153793', loja: 'amazon', produto_id: 'amz_B0GNN42NBM',
      titulo: 'Bicicleta Ergométrica Spinning Profissional Wizo',
      preco: 50, cupom: 'BLACKTAQUETA', categoria: 'saude', resolved: true,
      url: 'https://www.amazon.com.br/dp/B0GNN42NBM',
    }],
    reqsPag: [{ idx: 0, url: 'https://www.amazon.com.br/dp/B0GNN42NBM' }],
    reqsMercado: [],
  };
  const finBike = radar.finalizarRadar(
    estBike, [], [], [], cfg,
    [{ body: '<html><title>Bicicleta Ergométrica Spinning Wizo : Amazon.com.br</title><span id="apex_desktop_newAccordionRow"></span><span class="a-price aok-align-center"><span class="a-offscreen">R$ 644,29</span></span></html>' }],
    [],
  );
  assert.equal(finBike.ofertasNovas.length, 0);
  assert.ok(finBike.resumo.descartadas.some((d) => d.motivo === 'expirada_na_loja'));

  // 4) Modelo/código: 25G523B não vira cupom e não repete monitor no mesmo preço com outro nome de cupom
  const extMon = extrator.extrairDoTexto('Monitor LG UltraGear 25"\nModelo/código: 25G523B\n💵 R$ 551 no PIX com cupom: 20BLACKPRIME');
  assert.equal(extMon.cupom, '20BLACKPRIME');
  const repMon = extrator.avaliarRepeticao24h(
    { produto_id: 'amz_B0HB7FQ67Y', preco: 551, links_manuais: { cupom: 'OUTRO' } },
    [{ oferta_id: 'o1', produto_id: 'amz_B0HB7FQ67Y', preco: 551, status: 'aprovada', ts: AGORA - 120000, links_manuais: JSON.stringify({ cupom: '20BLACKPRIME' }) }],
    AGORA,
    { modo_radar: true, janela_radar_72h: true },
  );
  assert.equal(repMon.bloquear, true);

  // 5) Shopee K-Pop no radar filtra lojas não confiáveis e prioriza oficiais/indicadas
  const planK = radar.planejarFontesRadar(cfg, { modo: 'comando', categorias: ['kpop'], lojas: ['shopee'], ts: AGORA });
  const respShK = planK.fontesShopee.map((_, idx) => (idx === 0 ? {
    data: {
      productOfferV2: {
        nodes: [
          { itemId: '1', shopId: '10', shopName: 'Aleatoria', shopType: [], productName: 'Photocard Stray Kids Barato', priceMin: '30', priceDiscountRate: '40', commissionRate: '0.10', sales: 2, ratingStar: '4.1' },
          { itemId: '2', shopId: '20', shopName: 'Oficial Kpop', shopType: [1], productName: 'Álbum Stray Kids ATE Oficial', priceMin: '149', priceDiscountRate: '30', commissionRate: '0.08', sales: 120, ratingStar: '4.9' },
        ],
      },
    },
  } : { data: { productOfferV2: { nodes: [] } } }));
  const selK = radar.selecionarCandidatosRadar(planK, [], respShK, [], [], cfg, []);
  assert.equal(selK.candidatos.length, 1);
  assert.equal(selK.candidatos[0].produto_id, 'shp_20_2');

  // 6) Workflow 04-radar-ofertas otimizado: saveDataSuccessExecution=none e trava anti-sobreposição
  const wfRadar = lerWf('04-radar-ofertas.json');
  assert.equal(wfRadar.settings.saveDataSuccessExecution, 'none');
  const nodePlan = wfRadar.nodes.find((n) => n.name === 'Planejar');
  assert.match(nodePlan.parameters.jsCode, /radar_rodando_ate/);
  const connsResultado = Object.values(wfRadar.connections).filter((c) => c.main && c.main.some((arr) => arr.some((x) => x.node === 'Resultado lote radar')));
  assert.equal(connsResultado.length, 3, 'Apenas Reenviar radar? (falso), Tem reenvio texto? (falso) e Telegram (reenvio radar) conectam em Resultado lote radar');
});

test('auditoria final: amazon_busca K-Pop integrada, Nuvemshop real com js-nubesdk-slot, entidades invisíveis, relógio com ctx perfumes e anti-duplicação', () => {
  const extrator = require('../lib/extrator');
  const radar = require('../lib/radar');
  const fluxos = require('../lib/fluxos');
  const mercado = require('../lib/mercado');
  const cfg = cfgBase([
    { chave: 'radar.min_desconto_pct', valor: '15' },
    { chave: 'radar.preco_min', valor: '15' },
  ]);

  // 1) Relógio Tommy Hilfiger NÃO cai em perfumes mesmo com "perfumes" no contexto, e Perfume Polo Blue continua em perfumes
  assert.equal(
    extrator.classificarCategoria('Relógio Tommy Hilfiger David Masculino', cfg, 'perfumes-e-beleza promobit').categoria,
    'moda',
  );
  assert.equal(
    extrator.classificarCategoria('Ralph Lauren Polo Blue Eau de Toilette 125ml', cfg, '').categoria,
    'perfumes',
  );
  assert.equal(
    extrator.classificarCategoria('Ralph Lauren Polo Blue', cfg, '').categoria,
    'perfumes',
  );

  // 2) Entidades invisíveis (&NegativeMediumSpace;, U+2060) limpas em título e busca
  const pagPlafon = extrator.lerPaginaProduto(
    { statusCode: 200, body: '<html><head><title>Plafon Tramontina Smart&NegativeMediumSpace; LED : Amazon.com.br</title></head><body><h1 id="productTitle">Plafon Tramontina Smart&NegativeMediumSpace; LED Quadrado</h1><span class="priceToPay"><span class="a-offscreen">R$ 53,73</span></span></body></html>' },
    'https://www.amazon.com.br/dp/B0B7V43K65',
  );
  assert.equal(pagPlafon.titulo, 'Plafon Tramontina Smart LED Quadrado');
  assert.equal(
    extrator.classificarCategoria('Ap\u2060ple iPh\u2060one 17e 512GB', cfg, '').categoria,
    'tech',
  );

  // 3) amazon_busca K-Pop despachada em selecionarCandidatosRadar + artista "por Stray Kids" extraído após </h2>
  const htmlAmzKpop = [
    '<div role="listitem" data-asin="B0DMWT47YF" class="s-result-item">',
    '<h2 aria-label="HOP[SKZHOP VER.]"><span>HOP[SKZHOP VER.]</span></h2>',
    '<div class="a-row"><span>por Stray Kids</span></div>',
    '<span class="a-price" data-a-size="xl"><span class="a-offscreen">R$&nbsp;155,90</span></span>',
    '<span class="a-price a-text-price" data-a-strike="true"><span class="a-offscreen">R$&nbsp;211,77</span></span>',
    '<img class="s-image" src="https://m.media-amazon.com/images/I/61kpopalbum.jpg" />',
    '</div>',
  ].join('');
  const planKpop = radar.planejarFontesRadar(cfg, { modo: 'comando', categorias: ['kpop'], lojas: ['amazon'], ts: AGORA });
  const respWebAmz = planKpop.fontesWeb.map((f) => (f.tipo === 'amazon_busca' ? { statusCode: 200, body: htmlAmzKpop } : { statusCode: 200, body: '' }));
  const selAmz = radar.selecionarCandidatosRadar(planKpop, respWebAmz, [], [], [], cfg, []);
  assert.ok(selAmz.candidatos.some((c) => c.produto_id === 'amz_B0DMWT47YF' && /Stray Kids/i.test(c.titulo) && c.categoria === 'kpop'));

  // 4) Nuvemshop real com data-variants > 4KB + js-nubesdk-slot + fallback kpopandyoushop sem data-variants
  const paddingVariants = Array.from({ length: 25 }, (_, i) => ({
    product_id: 380334243, price_number: 232, compare_at_price_number: 275, stock: 5, available: true,
    image_url: `https://acdn-us.mitiendanube.com/stores/001/products/svt_${i}.jpg`, option0: `Ver${i}`,
  }));
  const htmlNuvemReal = [
    `<div class="js-item-product" data-component="product-list-item" data-component-value="380334243" data-variants="${JSON.stringify(paddingVariants).replace(/"/g, '&quot;')}">`,
    '<div class="js-nubesdk-slot">' + 'x'.repeat(5000) + '</div>',
    '<a href="https://www.hopescolor.com/produtos/seventeen-5th-album-happy-burstday/" title="Seventeen 5th Album &#039;Happy Burstday&#039;">Seventeen 5th Album</a>',
    '</div>',
  ].join('');
  const itensNuvemReal = radar.lerNuvemshopKpop(htmlNuvemReal, 'hopescolor', 'https://www.hopescolor.com/produtos/');
  assert.equal(itensNuvemReal.length, 1);
  assert.equal(itensNuvemReal[0].preco, 232);
  assert.equal(itensNuvemReal[0].preco_de, 275);
  assert.match(itensNuvemReal[0].titulo, /Seventeen 5th Album 'Happy Burstday'/);

  const htmlKpopAndYou = [
    '<div class="js-item-product" data-product-id="323459818" data-component="product-list-item" data-component-value="323459818">',
    '<div class="js-nubesdk-slot">' + 'x'.repeat(6500) + '</div>',
    '<img data-srcset="//acdn-us.mitiendanube.com/stores/004/products/pob-480-0.webp 480w" />',
    '<a href="https://www.kpopandyoushop.com.br/produtos/photocard-pob-happy-jin/" title="PHOTOCARD POB HAPPY JIN">PHOTOCARD POB HAPPY JIN</a>',
    '<span class="js-compare-price-display">R$ 90,00</span><span class="js-price-display">R$ 70,00</span>',
    '</div>',
  ].join('');
  const itensKyu = radar.lerNuvemshopKpop(htmlKpopAndYou, 'kpopandyoushop', 'https://www.kpopandyoushop.com.br/produtos/');
  assert.equal(itensKyu.length, 1);
  assert.equal(itensKyu[0].preco, 70);
  assert.equal(itensKyu[0].preco_de, 90);
  assert.equal(itensKyu[0].imagem, 'https://acdn-us.mitiendanube.com/stores/004/products/pob-480-0.webp');

  // 5) Não duplica post no tópico `top` quando categoria === 'top' e oferta.top === true, nem repete mesmo produto na mesma loja com ID diferente
  const cfgPub = cfgBase([{ chave: 'grupo_id', valor: '-100123' }, { chave: 'topico.top', valor: '3' }, { chave: 'publicar.plataformas', valor: 'wag' }]);
  const pubTop = fluxos.prepararPublicacao(
    { oferta_id: 'o_top_1', produto_id: 'ml_MLB1', loja: 'ml', categoria: 'top', titulo: 'Lote Cupons ML', preco: 0, url: 'https://mercadolivre.com.br', top: true, selo: 'ok' },
    [
      { plataforma: 'tg', url: 'https://mercadolivre.com.br', sub_id: 's1' },
      { plataforma: 'wag', url: 'https://mercadolivre.com.br', sub_id: 's2' },
    ],
    cfgPub,
    { ts: AGORA, chat_id: 1, message_id: 1 },
  );
  assert.equal(pubTop.ok, true);
  assert.equal(pubTop.chamadas.filter((c) => c.bot === 'grupo').length, 1);

  const repMesmaLoja = extrator.avaliarRepeticao24h(
    { produto_id: 'ml_MLBU99999999', loja: 'ml', titulo: 'Tênis Nike Sb Chron 2 Canvas Masculino', preco: 185 },
    [{ oferta_id: 'o_ant', produto_id: 'ml_MLB2143127365', loja: 'ml', titulo: 'Tênis Nike Sb Chron 2 Canvas Masculino', preco: 185, status: 'aprovada', ts: AGORA - 3600000 }],
    AGORA,
    { modo_radar: true },
  );
  assert.equal(repMesmaLoja.bloquear, true);

  // 6) extrairQtdCombo reconhece 2x em qualquer posição e bloqueia comparação 2x vs 1x
  assert.equal(mercado.casarProdutosMercado({ titulo: 'Camiseta Tech Light Insider Masculino 2x', preco: 96 }, [{ titulo: 'Camiseta Tech Light Insider Masculino', preco: 69 }]).length, 0);
});

test('revisão independente: classificação avançada, cupom ML mínimo, multi-unidade no guardião, K-Pop Amazon/Nuvemshop, afiliado K-Pop e economia CPU/RAM', () => {
  const extrator = require('../lib/extrator');
  const radar = require('../lib/radar');
  const comunidade = require('../lib/comunidade');
  const links = require('../lib/links');
  const cfg = cfgBase([
    { chave: 'radar.min_desconto_pct', valor: '15' },
    { chave: 'radar.preco_min', valor: '15' },
    { chave: 'afiliado.hopescolor', valor: 'utm_source=oferto' },
  ]);

  // 1) Classificação de não-perfumes e smartwatches/relógios de mesa
  assert.equal(extrator.classificarCategoria('Polo Masculina Ralph Lauren Piquet', cfg).categoria, 'moda');
  assert.equal(extrator.classificarCategoria('Capinha iPhone 15 Light Blue Silicone', cfg).categoria, 'tech');
  assert.notEqual(extrator.classificarCategoria('Chá Verde Green Tea 60 Cápsulas', cfg).categoria, 'perfumes');
  assert.equal(extrator.classificarCategoria('Relógio Digital Smartwatch D20 Bluetooth', cfg).categoria, 'tech');
  assert.equal(extrator.classificarCategoria('Relógio Despertador Digital de Mesa LED', cfg).categoria, 'casa');

  // 2) Código do produto / modelo no título não vira cupom falso
  assert.equal(extrator.extrairDoTexto('Monitor LG UltraGear 25G523B\nCódigo: 25G523B\nR$ 551').cupom, '');
  assert.equal(extrator.extrairDoTexto('Monitor LG UltraGear\nCódigo do produto: 25G523B\nR$ 551').cupom, '');

  // 3) Trava de cupom com valor mínimo no Mercado Livre e Amazon
  const htmlMlMin = '<html><body><h1 class="ui-pdp-title">Creme Johnson Baby 200ml</h1><meta property="price" content="25.96"/><span class="ui-pdp-promotions-pill-label">Aplicar cupom de R$ 25 OFF em compras acima de R$ 150</span></body></html>';
  const lidoMlMin = extrator.lerPaginaProduto({ statusCode: 200, body: htmlMlMin }, 'https://www.mercadolivre.com.br/p/MLB123456');
  assert.equal(lidoMlMin.cupom_valor, null);
  assert.equal(lidoMlMin.cupom_auto, '');

  const htmlAmzMin = '<html><body><span id="productTitle">Creme Johnson Baby 200ml</span><span class="priceToPay"><span class="a-offscreen">R$ 25,96</span></span><label id="greenBadge1">Economize R$ 25. Mínimo de compra: R$ 100,00</label></body></html>';
  const lidoAmzMin = extrator.lerPaginaProduto({ statusCode: 200, body: htmlAmzMin }, 'https://www.amazon.com.br/dp/B07MT9LCV1');
  assert.equal(lidoAmzMin.cupom_valor, null);

  // 4) Multi-unidade: emoji antes de 2x, "leve 2 camisetas por R$", deduplicação 24h e Guardião não encerrando 2x R$ 96 quando 1x custa R$ 129
  const htmlEmoji2x = '<div class="tgme_widget_message_wrap"><div data-post="canal/42"><div class="tgme_widget_message_text">👕 2x Camiseta Tech Light Insider Masculino<br/>De R$ 258 por R$ 96<br/><a href="https://www.mercadolivre.com.br/camiseta-tech-light-insider/p/MLB4232914111">link</a></div></div></div>';
  const candsEmoji2x = radar.lerCanalTelegramPublico(htmlEmoji2x, 'canal');
  assert.equal(candsEmoji2x.length, 1);
  assert.equal(candsEmoji2x[0]._qtd_unidades, 2);

  const htmlLeve2 = '<div class="tgme_widget_message_wrap"><div data-post="canal/43"><div class="tgme_widget_message_text">Camiseta Tech Light Insider Masculino<br/>Leve 2 camisetas por R$ 96<br/><a href="https://www.mercadolivre.com.br/camiseta-tech-light-insider/p/MLB4232914111">link</a></div></div></div>';
  const candsLeve2 = radar.lerCanalTelegramPublico(htmlLeve2, 'canal');
  assert.equal(candsLeve2.length, 1);
  assert.equal(candsLeve2[0]._qtd_unidades, 2);

  const rep2x = extrator.avaliarRepeticao24h(
    { produto_id: 'ml_MLBU99999', loja: 'ml', titulo: '2x Camiseta Tech Light Insider Masculino', preco: 96 },
    [{ oferta_id: 'o1', produto_id: 'ml_MLB4232914111', loja: 'ml', titulo: 'Camiseta Tech Light Insider Masculino', preco: 96, status: 'aprovada', ts: AGORA - 600000 }],
    AGORA,
    { modo_radar: true },
  );
  assert.equal(rep2x.bloquear, true);

  const htmlPagUnit = '<html><body><h1 class="ui-pdp-title">Camiseta Tech Light Insider Masculino</h1><meta property="price" content="129.00"/></body></html>';
  const exp2x = extrator.avaliarExpiracaoPagina(
    { oferta_id: 'o_2x', loja: 'ml', url: 'https://www.mercadolivre.com.br/p/MLB4232914111', titulo: '2x Camiseta Tech Light Insider Masculino', preco: 96, links_manuais: JSON.stringify({ _qtd_unidades: 2 }) },
    { statusCode: 200, body: htmlPagUnit },
  );
  assert.equal(exp2x.expirada, false, 'Guardião não pode encerrar oferta 2x R$ 96 só porque 1 unidade na página custa R$ 129');
  const queda2x = comunidade.avaliarQuedaExtraPagina(
    { oferta_id: 'o_2x', loja: 'ml', url: 'https://www.mercadolivre.com.br/p/MLB4232914111', titulo: '2x Camiseta Tech Light Insider Masculino', preco: 96, links_manuais: JSON.stringify({ _qtd_unidades: 2 }) },
    { statusCode: 200, body: htmlPagUnit },
  );
  assert.equal(queda2x.caiu, false);

  // 5) Amazon K-Pop: filtra Compra Internacional e aceita item bem avaliado em busca p_85=19171728011 sem a-icon-prime explícito
  const htmlAmzKpopMix = [
    '<div role="listitem" data-asin="B0C8JXHKTN" class="s-result-item">',
    '<span>Escolha da Amazon</span>',
    '<h2 aria-label="Escolha da Amazon"><span>Stray Kids – Bastão de luz oficial Ver.2</span></h2>',
    '<span>4,7 de 5 estrelas</span><span>(1,9 mil)</span>',
    '<span class="a-price"><span class="a-offscreen">R$&nbsp;527,87</span></span>',
    '<span class="a-price a-text-price" data-a-strike="true"><span class="a-offscreen">R$&nbsp;779,36</span></span>',
    '</div>',
    '<div role="listitem" data-asin="B0INTL1234" class="s-result-item">',
    '<h2 aria-label="Lightstick"><span>BTS Army Bomb Official Lightstick</span></h2>',
    '<span>4,8 de 5 estrelas</span><span>(500)</span><span>Compra Internacional</span>',
    '<span class="a-price"><span class="a-offscreen">R$&nbsp;300,00</span></span>',
    '<span class="a-price a-text-price" data-a-strike="true"><span class="a-offscreen">R$&nbsp;450,00</span></span>',
    '</div>',
  ].join('');
  const itensAmzLight = radar.lerAmazonBuscaHtml(
    htmlAmzKpopMix,
    'https://www.amazon.com.br/s?k=lightstick+kpop&rh=p_85%3A19171728011',
    { categoria_hint: 'kpop', loja_oficial: false },
  );
  assert.equal(itensAmzLight.length, 1);
  assert.equal(itensAmzLight[0].produto_id, 'amz_B0C8JXHKTN');
  assert.equal(itensAmzLight[0].loja_confiavel, true);

  // 6) Economia CPU/RAM + Nuvemshop rotação + preservação de título ALL CAPS + afiliado K-Pop + Guardião pós-movimentação
  const planPbBloq = radar.planejarFontesRadar(cfg, { modo: 'agendado', ts: AGORA, pb_redir_bloqueado_ate: AGORA + 300000 });
  assert.equal(planPbBloq.fontesWeb.some((f) => f.tipo === 'promobit_loja' || f.tipo === 'promobit_alta' || f.tipo === 'promobit_cat'), false);

  const planTurn1 = radar.planejarFontesRadar(cfg, { modo: 'agendado', ts: AGORA + 120000 });
  assert.equal(planTurn1.fontesWeb.some((f) => f.tipo === 'nuvemshop_kpop'), true);

  const prepKpop = radar.prepararPaginasRadar({
    opcoes: { modo: 'agendado', ts: AGORA },
    candidatos: [{
      radar_key: 'kpopandyoushop_339422678',
      loja: 'kpopandyoushop',
      produto_id: 'kyu_c34da939c489',
      titulo: '[PRONTA ENTREGA] BTS ARIRANG',
      preco: 249,
      preco_de: 319,
      desconto_pct: 22,
      imagem: 'https://acdn-us.mitiendanube.com/stores/004/615/122/products/arirang.webp',
      url: 'https://www.kpopandyoushop.com.br/produtos/pronta-entrega-bts-arirang-1e8vx/',
      resolved: true,
      categoria: 'kpop',
      fonte_radar: 'nuvemshop_kpop',
    }],
    reqs3: [],
  }, [], cfg);
  assert.equal(prepKpop.candidatos[0].titulo, '[PRONTA ENTREGA] BTS ARIRANG');
  assert.equal(prepKpop.reqsPag.length, 0, 'não precisa baixar página de produto Nuvemshop já completo');
  assert.equal(prepKpop.reqsMercado.length, 0, 'não consulta Zoom/Amazon para loja K-Pop especializada');

  const plannedHopes = links.planejarLinks({
    oferta_id: 'o_hpc1', loja: 'hopescolor', categoria: 'kpop',
    url: 'https://www.hopescolor.com/produtos/lightstick/',
  }, cfg, AGORA);
  assert.match(plannedHopes[0].url, /\?utm_source=oferto$/);

  // 7) Títulos que compartilham prefixo longo (>36 chars) mas são produtos distintos não são bloqueados pela deduplicação
  const repPrefixo = extrator.avaliarRepeticao24h(
    { produto_id: 'umu_6553', loja: 'umusic', titulo: 'Vinil Various Artists - KPop Demon Hunters - Soda Pop (7") - Importado', preco: 139.93 },
    [{ oferta_id: 'o_sd', produto_id: 'umu_6175', loja: 'umusic', titulo: 'Vinil Various Artists - KPop Demon Hunters (Soundtrack from the Netflix Film) - Importado', preco: 246.42, status: 'aprovada', ts: AGORA - 600000 }],
    AGORA,
    { modo_radar: true },
  );
  assert.equal(repPrefixo.bloquear, false);
});

test('integração das 3 lojas K-Pop da Shopee (Record Planet, Kpopmerch, Every Kpop/ALIKO): API, web/canais, priorização e coleta', () => {
  const shopee = require('../lib/shopee');
  const config = require('../lib/config');
  const extrator = require('../lib/extrator');
  const radar = require('../lib/radar');
  const fluxos = require('../lib/fluxos');
  const textos = require('../lib/textos');

  const cfg = cfgBase([
    { chave: 'shopee.app_id', valor: '183999' },
    { chave: 'shopee.secret', valor: 'segredo-shopee' },
    { chave: 'radar.min_desconto_pct', valor: '15' },
    { chave: 'radar.preco_min', valor: '15' },
    { chave: 'topico.kpop', valor: '276' },
  ]);

  // 1) Identificação por shopId, URL (slug de loja ou -i.shopId.itemId) e shopName
  assert.equal(shopee.LOJAS_KPOP_SHOPEE.length, 7);
  assert.equal(shopee.identificarLojaKpopShopee({ shopId: '716812351' }).username, 'recordplanet.br');
  assert.equal(shopee.identificarLojaKpopShopee({ shopId: 431836255 }).username, 'kpopmerch.br');
  assert.equal(shopee.identificarLojaKpopShopee({ shopId: '437474956' }).username, 'everykpop.br');
  assert.equal(shopee.identificarLojaKpopShopee({ url: 'https://shopee.com.br/recordplanet.br/17037332453' }).shop_id, '716812351');
  assert.equal(shopee.identificarLojaKpopShopee({ url: 'https://shopee.com.br/Album-i.431836255.29816102406' }).shop_id, '431836255');
  assert.equal(shopee.identificarLojaKpopShopee({ url: 'https://shopee.com.br/aliko.br/15071267777' }).shop_id, '437474956');
  assert.equal(shopee.identificarLojaKpopShopee({ shopName: 'Record Planet' }).shop_id, '716812351');
  assert.equal(shopee.identificarLojaKpopShopee({ shopName: 'Kpopmerch Official Store' }).shop_id, '431836255');
  assert.equal(shopee.identificarLojaKpopShopee({ shopName: 'ALIKO' }).shop_id, '437474956');
  assert.equal(shopee.identificarLojaKpopShopee({ shopId: '999999', shopName: 'Loja Genérica' }), null);
  assert.equal(shopee.identificarLojaKpopShopee({ url: 'https://shopee.com.br/recordplanet.br.fake/123456' }), null);
  assert.equal(shopee.identificarLojaKpopShopee({ url: 'https://shopee.com.br/universal-link?redir=https%3A%2F%2Fshopee.com.br%2Fkpopmerch.br%2F99887766' }).shop_id, '431836255');

  const lojas = require('../lib/lojas');
  assert.equal(lojas.identificar('https://shopee.com.br/recordplanet.br/17037332453').produto_id, 'shp_716812351_17037332453');
  assert.equal(lojas.identificar('https://shopee.com.br/everykpop.br/15071267777').produto_id, 'shp_437474956_15071267777');
  assert.equal(lojas.identificar('https://shopee.com.br/aliko.br/15071267777').produto_id, 'shp_437474956_15071267777');

  // 2) reqOfertas com shopId usa $shopId:Int64 e omite keyword vazia; sem shopId mantém Q_OFERTAS original
  const reqShop = shopee.reqOfertas(cfg.shopee, '', { shopId: '716812351', sortType: 2, limit: 20 }, 1700000000);
  const bodyShop = JSON.parse(reqShop.body);
  assert.match(bodyShop.query, /\$shopId:Int64/);
  assert.equal(bodyShop.variables.shopId, 716812351);
  assert.equal('keyword' in bodyShop.variables, false);

  const reqKw = shopee.reqOfertas(cfg.shopee, 'lightstick', { sortType: 2, limit: 20 }, 1700000000);
  const bodyKw = JSON.parse(reqKw.body);
  assert.doesNotMatch(bodyKw.query, /\$shopId/);
  assert.equal(bodyKw.variables.keyword, 'lightstick');

  // 3) lerOfertas reconhece loja curada mesmo sem shopType=1/2/4 e com poucas vendas (pré-venda) + filtro de anúncios de serviço
  const lidoSh = shopee.lerOfertas({
    data: {
      productOfferV2: {
        nodes: [
          {
            itemId: '101', shopId: '716812351', shopName: 'Record Planet', shopType: [],
            productName: 'ATEEZ - GOLDEN HOUR : Part.2 (Digipack Ver.)', priceMin: '139.90',
            priceDiscountRate: '22', commissionRate: '0.08', sales: 6, ratingStar: '4.9',
            imageUrl: 'https://cf.shopee.com.br/file/rp1.jpg',
          },
          {
            itemId: '102', shopId: '431836255', shopName: 'Kpopmerch', shopType: [],
            productName: 'KPOP MERCH Serviço Ao Cliente Somente Para C/S', priceMin: '50.00',
            priceDiscountRate: '20', commissionRate: '0.05', sales: 100, ratingStar: '5.0',
          },
        ],
      },
    },
  });
  assert.equal(lidoSh.produtos.length, 2);
  assert.equal(lidoSh.produtos[0].loja_kpop_curada, true);
  assert.equal(lidoSh.produtos[0].loja_confiavel, true);
  assert.equal(lidoSh.produtos[0].loja_indicada, true);
  assert.equal(shopee.ehAnuncioServicoShopee(lidoSh.produtos[0].titulo), false);
  assert.equal(shopee.ehAnuncioServicoShopee(lidoSh.produtos[1].titulo), true);

  // 4) Planejamento no radar: multi-categoria rotaciona 1 shopId por ciclo; /radar kpop e /radar <loja> consultam shopIds diretamente
  const planCiclo0 = radar.planejarFontesRadar(cfg, { modo: 'agendado', ts: 0 });
  const planCiclo1 = radar.planejarFontesRadar(cfg, { modo: 'agendado', ts: 120000 });
  const planCiclo2 = radar.planejarFontesRadar(cfg, { modo: 'agendado', ts: 240000 });
  assert.equal(planCiclo0.fontesShopee.filter((f) => f.loja_kpop_curada)[0].shop_id, '716812351');
  assert.equal(planCiclo1.fontesShopee.filter((f) => f.loja_kpop_curada)[0].shop_id, '431836255');
  assert.equal(planCiclo2.fontesShopee.filter((f) => f.loja_kpop_curada)[0].shop_id, '437474956');

  const cmdKpop = config.interpretarComandoRadar('/radar kpop', cfg);
  const planCmdKpop = radar.planejarFontesRadar(cfg, Object.assign({ modo: 'comando', ts: AGORA }, cmdKpop));
  const shopIdsCmd = planCmdKpop.fontesShopee.filter((f) => f.loja_kpop_curada).map((f) => f.shop_id);
  assert.deepEqual(shopIdsCmd, ['716812351', '431836255', '437474956']);

  for (const [cmdTxt, espSid] of [
    ['/radar recordplanet', '716812351'],
    ['/radar kpopmerch', '431836255'],
    ['/radar kpopmerch.br', '431836255'],
    ['/radar everykpop', '437474956'],
    ['/radar aliko', '437474956'],
  ]) {
    const cmdLoja = config.interpretarComandoRadar(cmdTxt, cfg);
    assert.deepEqual(cmdLoja.shop_ids, [espSid]);
    const planLoja = radar.planejarFontesRadar(cfg, Object.assign({ modo: 'comando', ts: AGORA }, cmdLoja));
    assert.equal(planLoja.fontesShopee.length, 1);
    assert.equal(planLoja.fontesShopee[0].shop_id, espSid);
    assert.equal(planLoja.fontesWeb.some((f) => f.tipo === 'promobit_cupons'), false);
  }

  // /radar recordplanet não vaza oferta genérica do Promobit/Shopee nem falha silenciosamente sem API
  const cmdRp = config.interpretarComandoRadar('/radar recordplanet', cfg);
  const planRp = radar.planejarFontesRadar(cfg, Object.assign({ modo: 'comando', ts: AGORA }, cmdRp));
  const pbFake = {
    props: {
      pageProps: {
        serverOffers: [{
          offerId: 777111, storeDomain: 'shopee.com.br', offerTitle: 'Camiseta Genérica Shopee',
          offerPrice: 49.9, offerOldPrice: 99.9, offerPriceType: 'NORMAL', offerLikes: 10,
        }],
      },
    },
  };
  const webFakeRp = planRp.fontesWeb.map((f) => (f.tipo === 'promobit_loja'
    ? { body: `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(pbFake)}</script>` }
    : ''));
  const selRpVaza = radar.selecionarCandidatosRadar(planRp, webFakeRp, [{}], [], [], cfg, []);
  assert.equal(selRpVaza.candidatos.length, 0);

  const cfgSemSh = cfgBase([
    { chave: 'radar.min_desconto_pct', valor: '15' },
    { chave: 'radar.preco_min', valor: '15' },
    { chave: 'topico.kpop', valor: '276' },
  ]);
  const finSemSh = radar.finalizarRadar(
    { opcoes: Object.assign({ modo: 'comando', chat_id: 999, ts: AGORA }, cmdRp), candidatos: [], reqs3: [], reqsPag: [], reqsMercado: [] },
    [], [], [], cfgSemSh, [], [],
  );
  assert.match(finSemSh.chamadas[0].payload.text, /shopee\.app_id/);

  // 5) /radar kpop seleciona produto de loja curada mesmo sem termo em termos_lista, descarta serviço e loja não confiável, e pula Zoom/Amazon
  const respCmdKpop = planCmdKpop.fontesShopee.map((f) => {
    if (f.shop_id === '716812351') {
      return {
        data: {
          productOfferV2: {
            nodes: [
              {
                itemId: '501', shopId: '716812351', shopName: 'Record Planet', shopType: [],
                productName: 'ATEEZ - GOLDEN HOUR : Part.2 (Digipack Ver.)', priceMin: '139.90',
                priceDiscountRate: '25', commissionRate: '0.08', sales: 8, ratingStar: '4.9',
                imageUrl: 'https://cf.shopee.com.br/file/ateez.jpg',
                productLink: 'https://shopee.com.br/product/716812351/501',
              },
              {
                itemId: '502', shopId: '716812351', shopName: 'Record Planet', shopType: [],
                productName: 'Taxa de Envio Extra Record Planet', priceMin: '30.00',
                priceDiscountRate: '20', commissionRate: '0.05', sales: 50, ratingStar: '5.0',
              },
            ],
          },
        },
      };
    }
    return {
      data: {
        productOfferV2: {
          nodes: [
            {
              itemId: '999', shopId: '999888', shopName: 'Loja Desconhecida', shopType: [],
              productName: 'Album Kpop Barato', priceMin: '45.00',
              priceDiscountRate: '30', commissionRate: '0.05', sales: 3, ratingStar: '4.0',
            },
          ],
        },
      },
    };
  });
  const selCmdKpop = radar.selecionarCandidatosRadar(planCmdKpop, [], respCmdKpop, [], [], cfg, []);
  assert.equal(selCmdKpop.candidatos.length, 1);
  assert.equal(selCmdKpop.candidatos[0].produto_id, 'shp_716812351_501');
  assert.equal(selCmdKpop.candidatos[0].categoria, 'kpop');
  assert.equal(selCmdKpop.candidatos[0].loja_kpop_curada, true);
  assert.equal(selCmdKpop.candidatos[0].shop_name, 'Record Planet');

  const prepCmdKpop = radar.prepararPaginasRadar(selCmdKpop, [], cfg);
  assert.equal(prepCmdKpop.reqsMercado.length, 0, 'não consulta Zoom/Amazon para loja Shopee K-Pop curada');
  const finCmdKpop = radar.finalizarRadar(prepCmdKpop, [], [], [], cfg, [], []);
  assert.equal(finCmdKpop.ofertasNovas.length, 1);
  const manK = JSON.parse(finCmdKpop.ofertasNovas[0].links_manuais);
  assert.equal(manK.loja_kpop_curada, true);
  assert.equal(manK.shop_name, 'Record Planet');
  assert.equal(manK.shop_id, '716812351');
  const cardTxt = textos.cardAprovacao(finCmdKpop.ofertasNovas[0], cfg, []);
  assert.match(cardTxt.text, /Record Planet \(K-Pop verificada\)/);

  // 6) Fluxo web / canal Telegram + redirect s.shopee.com.br para everykpop.br / aliko.br + link colado direto
  const estRedir = {
    opcoes: { modo: 'agendado', ts: AGORA },
    candidatos: [{
      radar_key: 'tg_kp_1', loja: '', titulo: 'Álbum Oficial Edição Limitada', preco: 169.9, preco_de: 229.9,
      desconto_pct: 26, redir_url: 'https://s.shopee.com.br/3B96w99xHp', imagem: 'https://cf.shopee.com.br/file/aliko.jpg',
    }],
    reqs1: [{ idx: 0, url: 'https://s.shopee.com.br/3B96w99xHp' }],
  };
  const r1Sh = radar.aplicarRedirRadar1(estRedir, [{
    statusCode: 301,
    headers: { location: 'https://shopee.com.br/everykpop.br/15071267777?utm_source=x' },
  }], cfg);
  assert.equal(r1Sh.candidatos[0].resolved, true);
  assert.equal(r1Sh.candidatos[0].loja, 'shopee');
  assert.equal(r1Sh.candidatos[0].loja_kpop_curada, true);
  assert.equal(r1Sh.candidatos[0].shop_id, '437474956');
  assert.equal(r1Sh.candidatos[0].categoria, 'kpop');

  const parsedLink = extrator.parseMensagemLink(
    { text: 'https://s.shopee.com.br/3qOnjPJOcl\nCamiseta Oficial Oversized Edição Limitada\nDe R$ 199 por R$ 149' },
    cfg,
    {
      curto: 'https://s.shopee.com.br/3qOnjPJOcl',
      resp_curto: { statusCode: 301, headers: { location: 'https://shopee.com.br/Product-i.716812351.43410742701' } },
    },
  );
  assert.equal(parsedLink.ok, true);
  assert.equal(parsedLink.oferta.loja, 'shopee');
  assert.equal(parsedLink.oferta.categoria, 'kpop', 'merch de loja K-Pop curada não deve cair em moda');
  assert.equal(parsedLink.oferta.links_manuais.loja_kpop_curada, true);
  assert.equal(parsedLink.oferta.links_manuais.shop_id, '716812351');
  assert.equal(parsedLink.oferta.links_manuais.shop_name, 'Record Planet');
  const mercLink = extrator.prepararMercadoOferta({ rota: 'oferta', oferta: parsedLink.oferta }, cfg);
  assert.equal(mercLink.reqs_mercado, undefined, 'não consulta Zoom/Amazon para link direto de loja K-Pop curada');

  // Resposta rápida de preço preserva categoria kpop e metadados da loja curada quando Shopee bloqueia HTML
  const promptPreco = extrator.pedirPrecoRapido({
    chat_id: 999,
    oferta: Object.assign({}, parsedLink.oferta, { preco: null, titulo: 'Camiseta Oficial Edição Especial' }),
  }, cfg);
  const respPreco = extrator.parseRespostaPreco({
    text: '149,90',
    reply_to_message: { text: promptPreco.payload.text.replace(/<[^>]+>/g, '') },
  }, cfg);
  assert.equal(respPreco.ok, true);
  assert.equal(respPreco.oferta.categoria, 'kpop');
  assert.equal(respPreco.oferta.links_manuais.loja_kpop_curada, true);
  assert.equal(respPreco.oferta.links_manuais.shop_id, '716812351');

  // Merch com palavra de moda em loja K-Pop curada no radar continua em kpop mesmo após prepararPaginasRadar
  const selMerch = radar.selecionarCandidatosRadar(planCmdKpop, [], planCmdKpop.fontesShopee.map((f) => (f.shop_id === '437474956' ? {
    data: {
      productOfferV2: {
        nodes: [{
          itemId: '701', shopId: '437474956', shopName: 'ALIKO', shopType: [],
          productName: 'Camiseta Moletom Mochila Oficial Kpopmerch', priceMin: '189.90',
          priceDiscountRate: '20', commissionRate: '0.08', sales: 5, ratingStar: '4.9',
          productLink: 'https://shopee.com.br/Camiseta-Moletom-i.437474956.701',
        }],
      },
    },
  } : { data: { productOfferV2: { nodes: [] } } })), [], [], cfg, []);
  assert.equal(selMerch.candidatos.length, 1);
  assert.equal(selMerch.candidatos[0].categoria, 'kpop');
  const prepMerch = radar.prepararPaginasRadar(selMerch, [], cfg);
  assert.equal(prepMerch.candidatos[0].categoria, 'kpop');

  // 7) Coleta agendada Shopee (02-coleta-shopee / fluxos.js): inclui 3 shopIds, prioriza curada mesmo em pré-venda
  const buscasColeta = fluxos.montarBuscasShopee(cfg, AGORA).filter((b) => b.categoria === 'kpop');
  assert.ok(buscasColeta.some((b) => b.shop_id === '716812351' && b.loja_kpop_curada));
  assert.ok(buscasColeta.some((b) => b.shop_id === '431836255' && b.loja_kpop_curada));
  assert.ok(buscasColeta.some((b) => b.shop_id === '437474956' && b.loja_kpop_curada));

  const respColeta = buscasColeta.map((b) => (b.shop_id === '431836255' ? {
    data: {
      productOfferV2: {
        nodes: [
          {
            itemId: '888', shopId: '431836255', shopName: 'Kpopmerch', shopType: [],
            productName: 'aespa Armageddon Official Album (POB)', priceMin: '159.90',
            priceDiscountRate: '25', commissionRate: '0.08', sales: 12, ratingStar: '4.9',
            imageUrl: 'https://cf.shopee.com.br/file/kpm.jpg',
          },
          {
            itemId: '889', shopId: '431836255', shopName: 'Kpopmerch', shopType: [],
            productName: 'KPOP MERCH Serviço Ao Cliente Somente Para C/S', priceMin: '50.00',
            priceDiscountRate: '25', commissionRate: '0.08', sales: 200, ratingStar: '5.0',
          },
        ],
      },
    },
  } : { data: { productOfferV2: { nodes: [] } } }));
  const avColeta = fluxos.avaliarCandidatos(buscasColeta, respColeta, [], [], cfg, AGORA);
  assert.equal(avColeta.ofertasNovas.length, 1);
  assert.equal(avColeta.ofertasNovas[0].produto_id, 'shp_431836255_888');
  assert.equal(JSON.parse(avColeta.ofertasNovas[0].links_manuais).loja_kpop_curada, true);
  assert.equal(JSON.parse(avColeta.ofertasNovas[0].links_manuais).shop_name, 'Kpopmerch');
});

test('rodada 2: br.shp.ee (kpopfever.br, pigeekv.br), Withmuu, Soundwave, Amazon K-Pop ampliada e priorização de afiliados', () => {
  const shopee = require('../lib/shopee');
  const lojas = require('../lib/lojas');
  const links = require('../lib/links');
  const curtos = require('../lib/curtos');
  const extrator = require('../lib/extrator');
  const config = require('../lib/config');
  const radar = require('../lib/radar');
  const textos = require('../lib/textos');

  const cfgSemAf = cfgBase([
    { chave: 'radar.min_desconto_pct', valor: '15' },
    { chave: 'radar.preco_min', valor: '15' },
    { chave: 'topico.kpop', valor: '276' },
  ]);
  const cfgComAf = cfgBase([
    { chave: 'shopee.app_id', valor: '183999' },
    { chave: 'shopee.secret', valor: 'segredo-shopee' },
    { chave: 'amazon.tag_padrao', valor: 'oferto-20' },
    { chave: 'rakuten.id', valor: 'rak123' },
    { chave: 'radar.min_desconto_pct', valor: '15' },
    { chave: 'radar.preco_min', valor: '15' },
    { chave: 'topico.kpop', valor: '276' },
  ]);

  // 1) Suporte a br.shp.ee (expansão automática sem preservar uls_trackid alheio como _afiliado)
  assert.equal(curtos.ehCurto('https://br.shp.ee/3B96vg13'), true);
  assert.equal(curtos.ehCurto('https://br.shp.ee/jFq9zuyG'), true);
  assert.equal(extrator.ehAfiliadoCurto('https://br.shp.ee/3B96vg13'), false);
  assert.equal(lojas.identificar('https://br.shp.ee/3B96vg13').erro ? true : false, true);
  assert.equal(extrator.extrairLinksProduto('Confira https://br.shp.ee/3B96vg13')[0], 'https://br.shp.ee/3B96vg13');

  const parsedFever = extrator.parseMensagemLink(
    { text: 'https://br.shp.ee/3B96vg13\nÁlbum Oficial Edição Limitada\nDe R$ 220 por R$ 159' },
    cfgComAf,
    {
      curto: 'https://br.shp.ee/3B96vg13',
      resp_curto: { statusCode: 301, headers: { location: 'https://shopee.com.br/kpopfever.br/987654321?uls_trackid=575r16uv01c6' } },
    },
  );
  assert.equal(parsedFever.ok, true);
  assert.equal(parsedFever.oferta.loja, 'shopee');
  assert.equal(parsedFever.oferta.produto_id, 'shp_kpopfever.br_987654321');
  assert.equal(parsedFever.oferta.url, 'https://shopee.com.br/kpopfever.br/987654321');
  assert.equal(parsedFever.oferta.categoria, 'kpop');
  assert.equal(parsedFever.oferta.links_manuais.loja_kpop_curada, true);
  assert.equal(parsedFever.oferta.links_manuais.shop_username, 'kpopfever.br');
  assert.equal(parsedFever.oferta.links_manuais.shop_name, 'KPOP FEVER');
  assert.equal(parsedFever.oferta.links_manuais._afiliado, undefined);

  // 2) Canonicalização e identificação de kpopfever.br, pigeekv.br, withmuu.br, soundwavekpop.br
  assert.equal(lojas.identificar('https://shopee.com.br/kpopfever/111222333').url_limpa, 'https://shopee.com.br/kpopfever.br/111222333');
  assert.equal(lojas.identificar('https://shopee.com.br/pigeek/444555666').produto_id, 'shp_pigeekv.br_444555666');
  assert.equal(lojas.identificar('https://shopee.com.br/pigee/444555666').url_limpa, 'https://shopee.com.br/pigeekv.br/444555666');
  assert.equal(lojas.identificar('https://shopee.com.br/withmuu/777888999').url_limpa, 'https://shopee.com.br/withmuu.br/777888999');
  assert.equal(lojas.identificar('https://shopee.com.br/soundwavekpop.br/123123123').produto_id, 'shp_soundwavekpop.br_123123123');
  assert.equal(shopee.identificarLojaKpopShopee({ shopName: 'PiGEE.BR' }).username, 'pigeekv.br');
  assert.equal(shopee.identificarLojaKpopShopee({ shopName: 'KPOP FEVER' }).username, 'kpopfever.br');
  assert.equal(shopee.identificarLojaKpopShopee({ shopName: 'Withmuu Official Store' }).username, 'withmuu.br');
  assert.equal(shopee.identificarLojaKpopShopee({ shopName: 'SOUNDWAVE' }).username, 'soundwavekpop.br');
  assert.equal(shopee.identificarLojaKpopShopee({ shopName: 'Soundwave Áudio Bluetooth' }), null);
  assert.equal(shopee.identificarLojaKpopShopee({ url: 'https://shopee.com.br/kpopfever.br.fake/123456' }), null);

  // lerOfertas marca oficial=true para Withmuu e Soundwave, curada=true para PiGEE.BR e KPOP FEVER
  const lidoNew = shopee.lerOfertas({
    data: {
      productOfferV2: {
        nodes: [
          { itemId: '1', shopId: '9001', shopName: 'Withmuu', shopType: [], productName: 'TWICE Album POB', priceMin: '149.9', priceDiscountRate: '20', commissionRate: '0.08', sales: 3, ratingStar: '5.0' },
          { itemId: '2', shopId: '9002', shopName: 'PiGEE.BR', shopType: [], productName: 'ATEEZ Digipack', priceMin: '119.9', priceDiscountRate: '25', commissionRate: '0.08', sales: 5, ratingStar: '5.0' },
          { itemId: '3', shopId: '9003', shopName: 'Vendedor Aleatório', shopType: [], productName: 'Cabo USB Genérico', priceMin: '29.9', priceDiscountRate: '30', commissionRate: '0.08', sales: 2, ratingStar: '4.1' },
        ],
      },
    },
  });
  assert.equal(lidoNew.produtos[0].loja_oficial, true);
  assert.equal(lidoNew.produtos[0].loja_kpop_curada, true);
  assert.equal(lidoNew.produtos[1].loja_kpop_curada, true);
  assert.equal(lidoNew.produtos[1].loja_confiavel, true);
  assert.equal(lidoNew.produtos[2].loja_confiavel, false);

  // 3) Comandos /radar kpopfever, /radar pigeek, /radar withmuu, /radar soundwave
  for (const [cmdTxt, espUser] of [
    ['/radar kpopfever', 'kpopfever.br'],
    ['/radar pigeek', 'pigeekv.br'],
    ['/radar pigee', 'pigeekv.br'],
    ['/radar withmuu', 'withmuu.br'],
    ['/radar soundwave', 'soundwavekpop.br'],
  ]) {
    const cmd = config.interpretarComandoRadar(cmdTxt, cfgComAf);
    assert.deepEqual(cmd.shop_usernames, [espUser]);
    const plan = radar.planejarFontesRadar(cfgComAf, Object.assign({ modo: 'comando', ts: AGORA }, cmd));
    assert.ok(plan.fontesShopee.length >= 1);
    assert.equal(plan.fontesWeb.some((f) => f.tipo === 'promobit_cupons'), false);
  }

  const cmdPg = config.interpretarComandoRadar('/radar pigeek', cfgComAf);
  const planPg = radar.planejarFontesRadar(cfgComAf, Object.assign({ modo: 'comando', ts: AGORA }, cmdPg));
  const respShPg = planPg.fontesShopee.map((_, idx) => (idx === 0 ? {
    data: {
      productOfferV2: {
        nodes: [
          { itemId: '701', shopId: '888777', shopName: 'PiGEE.BR', shopType: [], productName: 'STRAY KIDS - HOP (Official Album)', priceMin: '139.90', priceDiscountRate: '22', commissionRate: '0.08', sales: 10, ratingStar: '5.0' },
          { itemId: '702', shopId: '111222', shopName: 'Outra Loja', shopType: [1], productName: 'Album Genérico', priceMin: '99.90', priceDiscountRate: '30', commissionRate: '0.08', sales: 50, ratingStar: '4.9' },
        ],
      },
    },
  } : { data: { productOfferV2: { nodes: [] } } }));
  const selPg = radar.selecionarCandidatosRadar(planPg, [], respShPg, [], [], cfgComAf, []);
  assert.equal(selPg.candidatos.length, 1);
  assert.equal(selPg.candidatos[0].shop_username, 'pigeekv.br');
  assert.equal(selPg.candidatos[0].categoria, 'kpop');

  // Sem API Shopee: devolve instrução clara para configurar shopee.app_id/secret
  const finSemApiPg = radar.finalizarRadar(
    { opcoes: Object.assign({ modo: 'comando', chat_id: 999, ts: AGORA }, cmdPg), candidatos: [], reqs3: [], reqsPag: [], reqsMercado: [] },
    [], [], [], cfgSemAf, [], [],
  );
  assert.match(finSemApiPg.chamadas[0].payload.text, /shopee\.app_id/);

  // 4) Verificação e priorização de afiliados + exibição no card e /afiliados
  assert.equal(links.temAfiliadoAtivo('belezanaweb', cfgComAf, {}), true);
  assert.equal(links.ofereceLinkAfiliado('amazon'), true);
  assert.equal(links.ofereceLinkAfiliado('shopee'), true);
  assert.equal(links.ofereceLinkAfiliado('umusic'), true);
  assert.equal(links.ofereceLinkAfiliado('hopescolor'), false);
  assert.equal(links.ofereceLinkAfiliado('klinestore'), false);
  assert.equal(links.dicaAfiliado('hopescolor', cfgSemAf, {}), null);
  assert.equal(links.statusAfiliadoFonte('amazon', cfgComAf, {}).modo, 'afiliado_ativo');
  assert.equal(links.statusAfiliadoFonte('amazon', cfgSemAf, {}).modo, 'afiliado_disponivel');
  assert.equal(links.statusAfiliadoFonte('hopescolor', cfgSemAf, {}).modo, 'link_direto');

  // Priorização na seleção do radar: afiliado ativo > afiliado disponível > link direto confiável (sem bloquear link direto)
  const mkPb = (offers) => ({ statusCode: 200, body: `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { serverOffers: { offers } } } })}</script>` });
  const planPrio = {
    ativo: true,
    opcoes: { modo: 'comando', limite: 2, limite_explicito: true, categorias: ['kpop'], lojas: ['amazon', 'ml', 'hopescolor'], ts: AGORA },
    fontesWeb: [
      { tipo: 'promobit_loja', loja_hint: 'amazon' },
      { tipo: 'promobit_loja', loja_hint: 'ml' },
      { tipo: 'nuvemshop_kpop', loja_hint: 'hopescolor', url_real: 'https://www.hopescolor.com/produtos/' },
    ],
    fontesShopee: [],
  };
  const htmlHopesPrio = '<div class="js-item-product" data-component="product-list-item" data-component-value="101"><a href="https://www.hopescolor.com/produtos/album-bts-1/" title="Álbum BTS Proof Oficial">Álbum BTS Proof Oficial</a><span class="js-compare-price-display">R$ 200,00</span><span class="js-price-display">R$ 150,00</span></div>';
  const selPrio = radar.selecionarCandidatosRadar(
    planPrio,
    [
      mkPb([{ offerId: 1, offerTitle: 'Álbum BTS Proof Oficial Amazon', offerPrice: 150, offerOldPrice: 200, storeDomain: 'amazon.com.br', offerLikes: 5, categoryName: 'kpop' }]),
      mkPb([{ offerId: 2, offerTitle: 'Álbum Stray Kids Oficial ML', offerPrice: 150, offerOldPrice: 200, storeDomain: 'mercadolivre.com.br', offerLikes: 5, categoryName: 'kpop' }]),
      { statusCode: 200, body: htmlHopesPrio },
    ],
    [], [], [], cfgComAf, [],
  );
  assert.equal(selPrio.candidatos.length, 2);
  assert.equal(selPrio.candidatos[0].loja, 'amazon', 'Amazon com afiliado ativo fica em 1º');
  assert.equal(selPrio.candidatos[1].loja, 'ml', 'ML (aceita afiliado) ganha de loja só link direto com mesmo desconto');

  // Card exibe corretamente afiliado ativo vs aceita afiliado vs link direto
  const cardAfAtivo = textos.cardAprovacao({ oferta_id: 'o1', loja: 'amazon', categoria: 'kpop', titulo: 'Album', preco: 100, selo: 'ok', url: 'https://www.amazon.com.br/dp/B012345678' }, cfgComAf, []);
  const cardAfDisp = textos.cardAprovacao({ oferta_id: 'o2', loja: 'ml', categoria: 'kpop', titulo: 'Album', preco: 100, selo: 'ok', url: 'https://www.mercadolivre.com.br/p/MLB123' }, cfgComAf, []);
  const cardDireto = textos.cardAprovacao({ oferta_id: 'o3', loja: 'hopescolor', categoria: 'kpop', titulo: 'Album', preco: 100, selo: 'ok', url: 'https://www.hopescolor.com/produtos/album/' }, cfgComAf, []);
  assert.match(cardAfAtivo.text, /afiliado ativo \(Amazon Associados\)/);
  assert.match(cardAfDisp.text, /aceita afiliado \(Mercado Livre Afiliados\) · link direto/);
  assert.match(cardDireto.text, /link direto \(sem programa de afiliado\)/);

  const txtAfiliados = config.textoAfiliados(cfgComAf);
  assert.match(txtAfiliados, /KPOP FEVER/);
  assert.match(txtAfiliados, /PiGEE\.BR/);
  assert.match(txtAfiliados, /Withmuu/);
  assert.match(txtAfiliados, /Soundwave/);

  // 5) Shopee API non-kpop loja não confiável (nota < 4.7 / vendas < 15 / shopType=[]) também é filtrada no radar
  const planShGeral = {
    ativo: true,
    opcoes: { modo: 'comando', limite: 4, limite_explicito: true, categorias: ['tech'], lojas: ['shopee'], ts: AGORA },
    fontesWeb: [],
    fontesShopee: [{ categoria: 'tech', keyword: 'fone bluetooth' }],
  };
  const selShGeral = radar.selecionarCandidatosRadar(planShGeral, [], [{
    data: {
      productOfferV2: {
        nodes: [
          { itemId: '1', shopId: '10', shopName: 'Loja Ruim', shopType: [], productName: 'Fone TWS Ruim', priceMin: '50', priceDiscountRate: '40', commissionRate: '0.10', sales: 1, ratingStar: '3.9' },
          { itemId: '2', shopId: '20', shopName: 'JBL Oficial', shopType: [1], productName: 'Fone JBL Oficial TWS', priceMin: '199', priceDiscountRate: '30', commissionRate: '0.08', sales: 200, ratingStar: '4.9' },
        ],
      },
    },
  }], [], [], cfgComAf, []);
  assert.equal(selShGeral.candidatos.length, 1);
  assert.equal(selShGeral.candidatos[0].produto_id, 'shp_20_2');
});

test('boost de frequência: catálogos VTEX + Amazon oficial, anti-fome 6h, radar.top_max_dia e PALAVRAS_CAT bebe/saude', () => {
  const radar = require('../lib/radar');
  const config = require('../lib/config');
  const extrator = require('../lib/extrator');
  const fluxos = require('../lib/fluxos');
  const cfg = config.montarConfig([
    { chave: 'radar.top_max_dia', valor: '25' },
    { chave: 'admins', valor: '111' },
    { chave: 'grupo_id', valor: '-100123' },
    { chave: 'topico.bebe', valor: '6' },
    { chave: 'topico.saude', valor: '102' },
    { chave: 'topico.tech', valor: '7' },
    { chave: 'topico.top', valor: '3' },
  ]);

  // 1) lerCatalogoVtex: Pacheco (bebe/saude) e Época (perfumes), ignora esgotado/duplicado/JSON inválido
  assert.deepEqual(radar.lerCatalogoVtex('nao-json', { loja: 'pacheco' }), []);
  assert.deepEqual(radar.lerCatalogoVtex([], { loja: 'pacheco' }), []);
  const vtexPacheco = radar.lerCatalogoVtex([
    {
      productId: '501',
      productName: 'Fralda Pampers Confort Sec G 60 Unidades',
      link: 'https://www.drogariaspacheco.com.br/fralda-pampers-confort-sec-g-60/p',
      categories: ['/Bebe/Fraldas/'],
      items: [{
        images: [{ imageUrl: 'https://drogariaspacheco.vteximg.com.br/arquivos/ids/100/pampers.jpg' }],
        sellers: [{ commertialOffer: { Price: 69.9, ListPrice: 119.9, AvailableQuantity: 15 } }],
      }],
    },
    {
      productId: '501',
      productName: 'Fralda Pampers Confort Sec G 60 Unidades',
      link: 'https://www.drogariaspacheco.com.br/fralda-pampers-confort-sec-g-60/p',
      items: [{
        images: [{ imageUrl: 'https://drogariaspacheco.vteximg.com.br/arquivos/ids/100/pampers.jpg' }],
        sellers: [{ commertialOffer: { Price: 69.9, ListPrice: 119.9, AvailableQuantity: 15 } }],
      }],
    },
    {
      productId: '502',
      productName: 'Fralda Esgotada',
      link: 'https://www.drogariaspacheco.com.br/fralda-esgotada/p',
      items: [{
        images: [],
        sellers: [{ commertialOffer: { Price: 50, ListPrice: 100, AvailableQuantity: 0 } }],
      }],
    },
  ], { loja: 'pacheco', categoria_hint: 'bebe' });
  assert.equal(vtexPacheco.length, 1);
  assert.equal(vtexPacheco[0].loja, 'pacheco');
  assert.equal(vtexPacheco[0].categoria_hint, 'bebe');
  assert.equal(vtexPacheco[0].desconto_pct, 42);
  assert.equal(vtexPacheco[0].loja_oficial, true);
  assert.equal(vtexPacheco[0].resolved, true);
  assert.equal(vtexPacheco[0].fonte_radar, 'vtex_catalogo');

  // 2) planejarFontesRadar inclui vtex_catalogo e amazon_busca mesmo com Promobit em cooldown 429, e separa buscas Amazon
  const planBloq = radar.planejarFontesRadar(cfg, {
    modo: 'agendado',
    ts: AGORA,
    pb_redir_bloqueado_ate: AGORA + 600000,
  });
  const tipos = planBloq.fontesWeb.map((f) => f.tipo);
  assert.ok(tipos.includes('vtex_catalogo'), 'Deve incluir vtex_catalogo mesmo com Promobit bloqueado');
  assert.ok(tipos.filter((t) => t === 'amazon_busca').length >= 2, 'Deve incluir amazon_busca de kpop e de nicho');
  for (let i = 1; i < tipos.length; i++) {
    assert.ok(!(tipos[i] === 'amazon_busca' && tipos[i - 1] === 'amazon_busca'), 'Buscas Amazon não devem ficar adjacentes');
  }
  assert.ok(!tipos.some((t) => t === 'promobit_loja' || t === 'promobit_cat'), 'Não deve chamar Promobit loja/cat durante cooldown');

  // 3) Boost de fome (6h): categoria parada (bebe/saude com 0 posts em 6h) vence empate/desvantagem moderada contra tech já saturada
  const ofertas6h = Array.from({ length: 6 }, (_, i) => ({
    oferta_id: 'ot' + i,
    produto_id: 'amz_TECH00000' + i,
    loja: 'amazon',
    categoria: 'tech',
    titulo: 'Mouse Gamer ' + i,
    preco: 150,
    status: 'aprovada',
    ts: AGORA - (i + 1) * 20 * 60000,
  }));
  const planFome = {
    ativo: true,
    opcoes: { modo: 'comando', limite: 2, limite_explicito: true, categorias: ['tech', 'bebe', 'saude'], lojas: ['pacheco', 'amazon'], ts: AGORA },
    fontesWeb: [
      { tipo: 'vtex_catalogo', loja_hint: 'pacheco', categoria_hint: 'bebe' },
      { tipo: 'vtex_catalogo', loja_hint: 'pacheco', categoria_hint: 'saude' },
      { tipo: 'promobit_loja', loja_hint: 'amazon' },
    ],
    fontesShopee: [],
  };
  const respBebe = {
    body: JSON.stringify([{
      productId: 'b1',
      productName: 'Fralda Pampers Pants M 72 Unidades',
      link: 'https://www.drogariaspacheco.com.br/fralda-pampers-pants-m-72/p',
      items: [{ images: [{ imageUrl: 'https://drogariaspacheco.vteximg.com.br/arquivos/ids/1/f.jpg' }], sellers: [{ commertialOffer: { Price: 79.9, ListPrice: 110, AvailableQuantity: 10 } }] }],
    }]),
  };
  const respSaude = {
    body: JSON.stringify([{
      productId: 's1',
      productName: 'Creatina Monohidratada 300g Integralmedica',
      link: 'https://www.drogariaspacheco.com.br/creatina-300g-integralmedica/p',
      items: [{ images: [{ imageUrl: 'https://drogariaspacheco.vteximg.com.br/arquivos/ids/2/c.jpg' }], sellers: [{ commertialOffer: { Price: 59.9, ListPrice: 89.9, AvailableQuantity: 10 } }] }],
    }]),
  };
  const respTech = {
    body: '<script id="__NEXT_DATA__">' + JSON.stringify({
      props: {
        pageProps: {
          serverOffers: {
            offers: [{
              offerId: 9001,
              offerTitle: 'Teclado Mecânico Gamer RGB Switch Blue',
              offerPrice: 199,
              offerOldPrice: 280,
              offerLikes: 12,
              offerClicks: 150,
              storeDomain: 'amazon.com.br',
            }],
          },
        },
      },
    }) + '</script>',
  };
  const selFome = radar.selecionarCandidatosRadar(planFome, [respBebe, respSaude, respTech], [], ofertas6h, [], cfg, []);
  const catsSel = selFome.candidatos.map((c) => c.categoria);
  assert.ok(catsSel.includes('bebe') || catsSel.includes('saude'), 'Categoria com 0 posts em 6h deve furar a fila contra tech saturada');

  // 4) radar.top_max_dia=25 + qualidade do Top: vtex_catalogo sem prova de mercado NÃO vai pro Top (vai só pro tópico);
  //    com ref_mercado comprovada (ou fonte comunitária), vai pro Top mesmo após 5 posts no dia, respeitando teto de 2/ciclo.
  assert.equal(fluxos.limiteTopDia(config.padrao()), 40);
  assert.equal(fluxos.limiteTopDia(cfg), 25);
  const top5Hoje = Array.from({ length: 5 }, (_, i) => ({
    oferta_id: 'top' + i,
    produto_id: 'amz_TOP000000' + i,
    top: true,
    ts: AGORA - (i + 1) * 600000,
  }));
  const finTop = radar.finalizarRadar(
    {
      opcoes: { modo: 'agendado', ts: AGORA, categorias: ['bebe', 'saude'], lojas: ['pacheco', 'amazon'], limite_alvo: 4 },
      candidatos: [
        {
          radar_key: 'pacheco_501',
          produto_id: 'dpa_501',
          loja: 'pacheco',
          categoria: 'bebe',
          categoria_confianca: 1,
          categoria_indefinida: false,
          titulo: 'Fralda Pampers Confort Sec G 60 Unidades',
          preco: 69.9,
          preco_de: 119.9,
          desconto_pct: 42,
          imagem: 'https://drogariaspacheco.vteximg.com.br/arquivos/ids/100/pampers.jpg',
          url: 'https://www.drogariaspacheco.com.br/fralda-pampers-confort-sec-g-60/p',
          resolved: true,
          fonte_radar: 'vtex_catalogo',
        },
        {
          radar_key: 'pacheco_502',
          produto_id: 'dpa_502',
          loja: 'pacheco',
          categoria: 'bebe',
          categoria_confianca: 1,
          categoria_indefinida: false,
          titulo: 'Fralda Huggies Supreme Care M 80 Unidades',
          preco: 69.9,
          preco_de: 119.9,
          ref_mercado: 110,
          desconto_pct: 42,
          imagem: 'https://drogariaspacheco.vteximg.com.br/arquivos/ids/101/huggies.jpg',
          url: 'https://www.drogariaspacheco.com.br/fralda-huggies-supreme-m-80/p',
          resolved: true,
          fonte_radar: 'vtex_catalogo',
        },
        {
          radar_key: 'pb_503',
          produto_id: 'amz_B0TOP00003',
          loja: 'amazon',
          categoria: 'saude',
          categoria_confianca: 1,
          categoria_indefinida: false,
          titulo: 'Creatina Soldiers 500g',
          preco: 59.9,
          preco_de: 109.9,
          desconto_pct: 45,
          imagem: 'https://m.media-amazon.com/images/I/51a.jpg',
          url: 'https://www.amazon.com.br/dp/B0TOP00003',
          resolved: true,
          fonte_radar: 'promobit',
        },
        {
          radar_key: 'pb_504',
          produto_id: 'amz_B0TOP00004',
          loja: 'amazon',
          categoria: 'saude',
          categoria_confianca: 1,
          categoria_indefinida: false,
          titulo: 'Whey Growth 1kg Chocolate',
          preco: 99.9,
          preco_de: 169.9,
          desconto_pct: 41,
          imagem: 'https://m.media-amazon.com/images/I/51b.jpg',
          url: 'https://www.amazon.com.br/dp/B0TOP00004',
          resolved: true,
          fonte_radar: 'promobit',
        },
      ],
      reqs3: [],
      reqsPag: [],
      reqsMercado: [],
    },
    [],
    top5Hoje,
    [],
    cfg,
    [],
    [],
  );
  assert.equal(finTop.ofertasNovas.length, 4);
  assert.equal(finTop.ofertasNovas[0].top, false, 'vtex_catalogo sem ref_mercado não deve inundar o Top');
  assert.equal(finTop.ofertasNovas[1].top, true, 'vtex_catalogo com ref_mercado e radar.top_max_dia=25 vai ao Top mesmo após 5/dia');
  assert.equal(finTop.ofertasNovas[2].top, true, '2ª oferta forte do ciclo vai ao Top');
  assert.equal(finTop.ofertasNovas[3].top, false, 'Teto de 2 posts no Top por ciclo agendado evita queimar cota em rajada');

  // 5) Proteções VTEX 1P: rejeita seller 3P de marketplace, medicamento tarjado/genérico, ListPrice absurdo (>85%) e variantes de cor no mesmo ciclo
  const vtexFiltro = radar.lerCatalogoVtex([
    {
      productId: '601',
      productName: 'Perfume Lattafa Mohra 100ml',
      link: 'https://www.epocacosmeticos.com.br/perfume-lattafa-mohra/p',
      items: [{
        images: [{ imageUrl: 'https://epocacosmeticos.vteximg.com.br/1.jpg' }],
        sellers: [{ sellerId: 'epc176', sellerName: 'Grifes e Estilo', commertialOffer: { Price: 209.69, ListPrice: 774.89, AvailableQuantity: 5 } }],
      }],
    },
    {
      productId: '602',
      productName: 'Prednisona 20mg 10 Comprimidos Genérico',
      link: 'https://www.drogariaspacheco.com.br/prednisona-20mg/p',
      items: [{
        images: [{ imageUrl: 'https://drogariaspacheco.vteximg.com.br/2.jpg' }],
        sellers: [{ sellerId: '1', sellerName: 'Drogarias Pacheco', commertialOffer: { Price: 12.99, ListPrice: 22.18, AvailableQuantity: 10 } }],
      }],
    },
    {
      productId: '603',
      productName: 'Suplemento D-Valle 10000 UI',
      link: 'https://www.drogariaspacheco.com.br/d-valle/p',
      items: [{
        images: [{ imageUrl: 'https://drogariaspacheco.vteximg.com.br/3.jpg' }],
        sellers: [{ sellerId: '1', sellerName: 'Drogarias Pacheco', commertialOffer: { Price: 69.9, ListPrice: 8298, AvailableQuantity: 10 } }],
      }],
    },
  ], { loja: 'pacheco', categoria_hint: 'saude' });
  assert.equal(vtexFiltro.length, 1, 'Deve rejeitar seller 3P e medicamento genérico');
  assert.equal(vtexFiltro[0].desconto_pct, 0, 'ListPrice absurdo (>85% OFF) deve zerar desconto_pct');
  assert.equal(vtexFiltro[0].destaque, false, 'vtex_catalogo não deve inflar destaque artificial');
  assert.ok(planBloq.fontesWeb.filter((f) => f.tipo === 'vtex_catalogo').every((f) => /fq=sellerId:1/.test(f.url_real)), 'Todos os feeds vtex_catalogo devem filtrar fq=sellerId:1');

  const selVar = radar.selecionarCandidatosRadar(
    {
      ativo: true,
      opcoes: { modo: 'comando', limite: 4, limite_explicito: true, categorias: ['bebe'], lojas: ['pacheco'], ts: AGORA },
      fontesWeb: [{ tipo: 'vtex_catalogo', loja_hint: 'pacheco', categoria_hint: 'bebe' }],
      fontesShopee: [],
    },
    [{
      body: JSON.stringify([
        {
          productId: '701',
          productName: 'Fralda Huggies Little Swimmers Praia e Piscina M',
          link: 'https://www.drogariaspacheco.com.br/fralda-huggies-m/p',
          items: [{ images: [{ imageUrl: 'https://drogariaspacheco.vteximg.com.br/m.jpg' }], sellers: [{ sellerId: '1', commertialOffer: { Price: 37.47, ListPrice: 57.99, AvailableQuantity: 5 } }] }],
        },
        {
          productId: '702',
          productName: 'Fralda Huggies Little Swimmers Praia e Piscina G/XG',
          link: 'https://www.drogariaspacheco.com.br/fralda-huggies-gxg/p',
          items: [{ images: [{ imageUrl: 'https://drogariaspacheco.vteximg.com.br/g.jpg' }], sellers: [{ sellerId: '1', commertialOffer: { Price: 37.86, ListPrice: 57.99, AvailableQuantity: 5 } }] }],
        },
      ]),
    }],
    [], [], [], cfg, [],
  );
  assert.equal(selVar.candidatos.length, 1, 'Variantes de tamanho/cor do mesmo produto não devem duplicar no mesmo ciclo');

  // 6) PALAVRAS_CAT enriquecido para bebe e saude
  assert.equal(extrator.classificarCategoria('Toalhas Umedecidas Huggies Natural Care 48un', cfg, '').categoria, 'bebe');
  assert.equal(extrator.classificarCategoria('Fórmula Infantil Nestogeno 1 800g', cfg, '').categoria, 'bebe');
  assert.equal(extrator.classificarCategoria('Vitamina D3 2000UI Lavitan 30 Cápsulas', cfg, '').categoria, 'saude');
  assert.equal(extrator.classificarCategoria('Whey Concentrado 900g Black Skull', cfg, '').categoria, 'saude');
});

test('regressão Amazon 19/11: sem falso 3x sem juros (accordion oculto / NuPay) e sem falsa recorrência (dropdown Programe e Poupe)', () => {
  const extrator = require('../lib/extrator');
  const radar = require('../lib/radar');
  const textos = require('../lib/textos');
  const cfg = cfgBase();

  // 1) Caso real B0CW24291V (Kit 12 Cuecas Boxer Reebok):
  //    - navbar global tem <option value="search-alias=specialty-aps-sns">Programe e Poupe</option>
  //    - buybox ativo tem "12x de R$ 8,94 com juros (total parcelado R$ 107,36)"
  //    - popover oculto tem NuPay "Parcele em até 12x sem juros com NuPay Crédito"
  //    - accordion oculto (display:none) tem "3x de R$ 31,51 sem juros (total parcelado R$ 94,49)"
  const htmlReebok = [
    '<html><body>',
    '<select id="searchDropdownBox"><option value="search-alias=specialty-aps-sns">Programe e Poupe</option></select>',
    '<script>var x = {"SNS":"Programe e Poupe"};</script>',
    '<span id="productTitle">Kit 12 Cuecas Boxer Reebok Masculinas Microfibra Adulto Box Sem Costura</span>',
    '<span class="apex-pricetopay-value"><span class="a-offscreen">R$ 92,87</span></span>',
    '<span class="basisPrice"><span class="a-offscreen">R$ 184,00</span></span>',
    '<span>no Pix e NuPay</span>',
    '<div id="installmentCalculatorCentral_feature_div" class="celwidget">',
    '  <div class="offersConsistencyEnabled">',
    '    <div id="reinvent_price_desktop_newAccordionRow" style="">',
    '      <span class="a-size-base"> ou em até</span>',
    '      <span class="a-size-base a-color-attainable a-text-bold"> 12x de R$ 8,94 com juros<br/></span>',
    '      <span class="highlight-total-line-desktop">(total parcelado R$ 107,36)<br/></span>',
    '      <span id="InstallmentCalculatorTrigger"><a href="#">Ver opções de pagamento</a></span>',
    '      <div class="a-popover-preload" id="a-popover-preload-0">',
    '        <div data-a-name="NubankCredit" class="a-box a-hidden"><p>Parcele em até 12x sem juros com NuPay Crédito.</p></div>',
    '      </div>',
    '    </div>',
    '    <div id="reinvent_price_desktop_installmentsAccordionRow" style="display:none;">',
    '      <span class="a-size-base"> Em até</span>',
    '      <span class="a-size-base a-color-attainable a-text-bold"> 3x de R$ 31,51 sem juros<br/></span>',
    '      <span class="highlight-total-line-desktop">(total parcelado R$ 94,49)<br/></span>',
    '    </div>',
    '  </div>',
    '</div>',
    '<label id="greenBadge1">Salve o cupom R$ 25</label><span id="promoMessageCXCW1"> : BLACKTAQUETA. Exclusivo Prime</span>',
    '</body></html>',
  ].join('');
  const lidoReebok = extrator.lerPaginaProduto({ statusCode: 200, body: htmlReebok }, 'https://www.amazon.com.br/dp/B0CW24291V');
  assert.equal(lidoReebok.preco, 92.87);
  assert.equal(lidoReebok.pix, true);
  assert.equal(lidoReebok.parcelamento, '', 'Não deve puxar 3x sem juros de accordion display:none nem 12x do NuPay');
  assert.equal(lidoReebok.preco_parcelado, null, 'Não deve gravar total parcelado com juros quando não há sem juros');
  assert.equal(lidoReebok.recorrencia, false, 'Dropdown global Programe e Poupe não pode ativar recorrência');
  assert.equal(lidoReebok.recorrencia_preco, null);
  assert.equal(lidoReebok.recorrencia_pct, null);

  // Fluxo completo: finalizarRadar + textoTelegram não deve exibir 3x sem juros nem Compra com recorrência
  const candReebok = {
    radar_key: 'tg_xetdaspromocoes_94182',
    produto_id: 'amz_B0CW24291V',
    url: 'https://www.amazon.com.br/dp/B0CW24291V',
    loja: 'amazon',
    categoria: 'moda',
    titulo: 'Kit 12 Cuecas Boxer Reebok Masculinas Microfibra',
    preco: 74,
    preco_de: 184,
    cupom: 'BLACKTAQUETA',
    pix: true,
    resolved: true,
  };
  const finReebok = radar.finalizarRadar(
    { opcoes: { modo: 'agendado', ts: AGORA }, candidatos: [candReebok], reqsPag: [{ idx: 0, url: candReebok.url }], reqsMercado: [] },
    [], [], [], cfg, [{ statusCode: 200, body: htmlReebok }], [],
  );
  assert.equal(finReebok.ofertasNovas.length, 1);
  const manReebok = JSON.parse(finReebok.ofertasNovas[0].links_manuais);
  assert.equal(manReebok.parcelamento || '', '');
  assert.equal(manReebok.preco_parcelado || null, null);
  assert.equal(!!manReebok.recorrencia, false);
  const tgReebok = textos.textoTelegram(finReebok.ofertasNovas[0], 'https://www.amazon.com.br/dp/B0CW24291V?tag=oferto-20', cfg);
  assert.doesNotMatch(tgReebok, /sem juros|3x de|recorr[êe]ncia/i);

  // 2) Caso real B0HD2T6BZZ (Omo 4kg): 12x com juros + NuPay oculto + dropdown Programe e Poupe
  const htmlOmo = [
    '<html><body>',
    '<select id="searchDropdownBox"><option value="search-alias=specialty-aps-sns">Programe e Poupe</option></select>',
    '<span id="productTitle">Lava-Roupas em Pó Omo 4kg</span>',
    '<span class="apex-pricetopay-value"><span class="a-offscreen">R$ 42,53</span></span>',
    '<div id="installmentCalculatorCentral_feature_div">',
    '  <span>ou em até</span><span>12x de R$ 4,05 com juros</span><span>(total parcelado R$ 48,63)</span>',
    '  <span id="InstallmentCalculatorTrigger">Ver opções</span>',
    '  <div class="a-popover-preload"><div data-a-name="NubankCredit">Parcele em até 12x sem juros com NuPay Crédito.</div></div>',
    '</div></body></html>',
  ].join('');
  const lidoOmo = extrator.lerPaginaProduto({ statusCode: 200, body: htmlOmo }, 'https://www.amazon.com.br/dp/B0HD2T6BZZ');
  assert.equal(lidoOmo.parcelamento, '');
  assert.equal(lidoOmo.preco_parcelado, null);
  assert.equal(lidoOmo.recorrencia, false);

  // 3) Caso real B0H4N4L11K (Ar-condicionado Samsung): 12x sem juros legítimo no buybox visível, sem SnS
  const htmlAr = [
    '<html><body>',
    '<select id="searchDropdownBox"><option value="search-alias=specialty-aps-sns">Programe e Poupe</option></select>',
    '<span id="productTitle">Ar-condicionado Split Samsung 12000 BTUs</span>',
    '<span class="apex-pricetopay-value"><span class="a-offscreen">R$ 2.124,15</span></span>',
    '<div id="installmentCalculatorCentral_feature_div">',
    '  <span>ou em até</span><span>12x de R$ 208,25 sem juros</span><span>(total parcelado R$ 2.499,00)</span>',
    '  <span id="InstallmentCalculatorTrigger">Ver opções</span>',
    '</div></body></html>',
  ].join('');
  const lidoAr = extrator.lerPaginaProduto({ statusCode: 200, body: htmlAr }, 'https://www.amazon.com.br/dp/B0H4N4L11K');
  assert.equal(lidoAr.parcelamento, 'Em até 12x de R$ 208,25 sem juros');
  assert.equal(lidoAr.preco_parcelado, 2499);
  assert.equal(lidoAr.recorrencia, false);

  // 4) Caso real B07C1S6YR4 (Protetor Sundown): SnS visível real funciona; placeholder ppd_sns oculto é ignorado
  const htmlSundown = [
    '<html><body>',
    '<div id="ppd_snsAccordionRowMiddle" style="display:none;"><span id="snsPrice">R$ 10,00</span></div>',
    '<span id="productTitle">Protetor Solar Sundown FPS 50 350ml</span>',
    '<span class="apex-pricetopay-value"><span class="a-offscreen">R$ 70,68</span></span>',
    '<div id="snsAccordionRowMiddle" data-buying-option-index="1"><span>Programe e Poupe</span><span>R$ 67,15</span><span>Poupe 5% agora</span></div>',
    '</body></html>',
  ].join('');
  const lidoSundown = extrator.lerPaginaProduto({ statusCode: 200, body: htmlSundown }, 'https://www.amazon.com.br/dp/B07C1S6YR4');
  assert.equal(lidoSundown.recorrencia, true);
  assert.equal(lidoSundown.recorrencia_preco, 67.15);
  assert.equal(lidoSundown.recorrencia_pct, 5);

  // 5) Container snsAccordionRow oculto (display:none) com snsPrice interno NÃO ativa recorrência
  const htmlSnsOculto = '<html><body><span id="productTitle">Camiseta Básica</span><span class="priceToPay"><span class="a-offscreen">R$ 80,00</span></span><div id="snsAccordionRowMiddle" style="display:none;"><span id="snsPrice">R$ 60,00</span><span>Programe e Poupe 25%</span></div></body></html>';
  const lidoSnsOculto = extrator.lerPaginaProduto({ statusCode: 200, body: htmlSnsOculto }, 'https://www.amazon.com.br/dp/B0CAMI0001');
  assert.equal(lidoSnsOculto.recorrencia, false);

  // 6) recalcularParcelamentoComCupom ignora preco_parcelado incoerente com qtd * parcela
  const manRecalc = { parcelamento: 'Em até 3x de R$ 31,51 sem juros' };
  extrator.recalcularParcelamentoComCupom({ parcelamento: 'Em até 3x de R$ 31,51 sem juros', preco_parcelado: 107.36, preco: 92.87 }, manRecalc, null, 25);
  assert.equal(manRecalc.preco_parcelado, 69.53);
  assert.equal(manRecalc.parcelamento, 'Em até 3x de R$ 23,18 sem juros');

  // 7) Fallback universal rejeita parcelamento de produto relacionado com total incompatível com o preço
  const htmlLojaRel = '<html><head><title>Caneca R$ 49,90</title></head><body><h1>Caneca Térmica</h1><meta property="product:price:amount" content="49.90"><div class="relacionados">Geladeira 12x de R$ 250,00 sem juros</div></body></html>';
  const lidoLojaRel = extrator.lerPaginaProduto({ statusCode: 200, body: htmlLojaRel }, 'https://www.magazineluiza.com.br/caneca/p/123456/');
  assert.equal(lidoLojaRel.parcelamento, '', 'Parcelamento incompatível de carrossel não deve vazar para o produto');

  // 8) Promobit: tag genérica "Parcelado" sem "sem juros" não fabrica "Parcelamento sem juros disponível"
  const pbHtml = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: {
      pageProps: {
        serverOffers: [{
          offerId: 901, offerTitle: 'Camisa Polo Lacoste', offerPrice: 199.9, offerOldPrice: 349.9,
          offerLikes: 20, offerClicks: 100, storeDomain: 'amazon.com.br', offerPhoto: '/901.jpg',
          offerTags: [{ name: 'Parcelado' }],
        }],
      },
    },
  })}</script>`;
  const pbItems = radar.lerPromobitHtml(pbHtml, 'amazon', 'moda');
  assert.equal(pbItems.length, 1);
  assert.equal(pbItems[0].parcelamento, '');
});

test('Regressões 2ª rodada: installmentsAccordionRow ativo, divs aninhadas ocultas, NuPay prefixado, texto negado, radar/Guardião autoritativos e Mais por Menos 5+ itens', () => {
  const extrator = require('../lib/extrator');
  const radar = require('../lib/radar');
  const { executarGuardiao } = require('../lib/comunidade');

  // 1) Amazon: newAccordionRow oculto e installmentsAccordionRow visível não pode se auto-truncar
  const htmlInstAtivo = [
    '<html><body><span id="productTitle">Fone Bluetooth Teste</span>',
    '<span class="priceToPay"><span class="a-offscreen">R$ 300,00</span></span>',
    '<div id="installmentCalculatorCentral_feature_div">',
    '<div id="reinvent_price_desktop_newAccordionRow" style="display:none;">Em até 12x de R$ 29,90 com juros</div>',
    '<div id="reinvent_price_desktop_installmentsAccordionRow"><span>Em até 6x de R$ 50,00 sem juros</span></div>',
    '<a id="InstallmentCalculatorTrigger">Ver parcelas</a></div></body></html>',
  ].join('');
  const rInstAtivo = extrator.lerPaginaProduto({ statusCode: 200, body: htmlInstAtivo }, 'https://www.amazon.com.br/dp/B0TESTBUG01');
  assert.equal(rInstAtivo.preco, 300);
  assert.equal(rInstAtivo.parcelamento, 'Em até 6x de R$ 50,00 sem juros');

  // 2) Amazon fallback sem installmentCalculatorCentral_feature_div: div oculto com div aninhada não vaza parcelamento
  const htmlNestedParc = [
    '<html><body><span id="productTitle">Cueca Boxer Teste</span>',
    '<span class="priceToPay"><span class="a-offscreen">R$ 92,87</span></span>',
    '<div style="display:none;"><div class="inner">oculto</div><div>Em até 3x de R$ 31,51 sem juros</div></div>',
    '</body></html>',
  ].join('');
  const rNestedParc = extrator.lerPaginaProduto({ statusCode: 200, body: htmlNestedParc }, 'https://www.amazon.com.br/dp/B0TESTBUG02');
  assert.equal(rNestedParc.preco, 92.87);
  assert.equal(rNestedParc.parcelamento, '');

  // 3) Amazon SnS oculto com div aninhada interna não vaza recorrência
  const htmlNestedSns = [
    '<html><body><span id="productTitle">Cueca Boxer Teste</span>',
    '<span class="priceToPay"><span class="a-offscreen">R$ 92,87</span></span>',
    '<div id="snsAccordionRowMiddle" style="display:none;"><div class="header"></div><div class="snsPrice">Programe e Poupe economize 5% R$ 88,23</div></div>',
    '</body></html>',
  ].join('');
  const rNestedSns = extrator.lerPaginaProduto({ statusCode: 200, body: htmlNestedSns }, 'https://www.amazon.com.br/dp/B0TESTBUG03');
  assert.equal(rNestedSns.preco, 92.87);
  assert.equal(rNestedSns.recorrencia, false);
  assert.equal(rNestedSns.recorrencia_preco, null);

  // 4) NuPay / Cartão Amazon ANTES do parcelamento no fallback e no texto livre, além de frases negadas
  const htmlNupayAntes = '<html><body><span id="productTitle">Produto Teste</span><span class="priceToPay"><span class="a-offscreen">R$ 92,87</span></span><div>Pague com NuPay em até 3x de R$ 30,96 sem juros</div></body></html>';
  assert.equal(extrator.lerPaginaProduto({ statusCode: 200, body: htmlNupayAntes }, 'https://www.amazon.com.br/dp/B0TESTBUG06').parcelamento, '');
  assert.equal(extrator.extrairDoTexto('Kit Cuecas R$ 92,87 em até 3x de R$ 30,96 sem juros no Cartão Amazon').parcelamento, '');
  const txtNeg = extrator.extrairDoTexto('Kit Cuecas R$ 92,87 não tem compra recorrente nem 3x sem juros');
  assert.equal(txtNeg.parcelamento, '');
  assert.equal(txtNeg.recorrencia, false);

  // 5) Amazon "Mais por Menos: 5% off em 5+ itens" não pode virar cupom de unidade única
  const htmlMaisPorMenos = [
    '<html><body><span id="productTitle">Lavitan Ômega 3 120 Cápsulas</span>',
    '<span class="priceToPay"><span class="a-offscreen">R$ 44,95</span></span>',
    '<label id="greenBadge1">Mais por Menos: 5% off em 5+ itens Comprar itens elegíveis</label>',
    '</body></html>',
  ].join('');
  const rMais = extrator.lerPaginaProduto({ statusCode: 200, body: htmlMaisPorMenos }, 'https://www.amazon.com.br/dp/B07P8V9PWH');
  assert.equal(rMais.preco, 44.95);
  assert.equal(rMais.cupom_auto, '');
  assert.equal(rMais.cupom_pct, null);

  // 6) Radar finalizarRadar: PDP Amazon ao vivo limpa parcelamento/recorrência falsos vindos de canal terceiro
  const prepFalso = {
    opcoes: { modo: 'agendado', ts: '2026-11-19T18:00:00.000Z' },
    candidatos: [{
      loja: 'amazon', categoria: 'moda', produto_id: 'amz_B0CW24291V',
      url: 'https://www.amazon.com.br/dp/B0CW24291V', titulo: 'Kit 12 Cuecas Boxer Reebok',
      preco: 92.87, preco_de: 184, parcelamento: 'Em até 3x de R$ 30,96 sem juros', preco_parcelado: 92.87,
      recorrencia: true, recorrencia_preco: 88.23, recorrencia_pct: 5,
      fonte_radar: 'telegram_xetdaspromocoes', radar_key: 'tg_xet_falso_1',
      imagem: 'https://m.media-amazon.com/images/I/61reebok.jpg',
      resolved: true,
    }],
    reqsPag: [{ idx: 0, url: 'https://www.amazon.com.br/dp/B0CW24291V' }],
    reqsMercado: [],
  };
  const htmlAmzLimpo = '<html><body><span id="productTitle">Kit 12 Cuecas Boxer Reebok</span><span class="priceToPay"><span class="a-offscreen">R$ 92,87</span></span><div id="installmentCalculatorCentral_feature_div"><div id="reinvent_price_desktop_newAccordionRow">Em até 12x de R$ 8,94 com juros</div></div></body></html>';
  const finLimpo = radar.finalizarRadar(
    prepFalso, [], [], [],
    { telegram: { bot_token: '1:TEST', grupo_id: '-1001' }, afiliados: { amazon_tag: 'ofert-20' }, publicacao: { dry_run: 'nao' }, radar: { max_por_rodada: 5, ativo: 'sim' } },
    [{ statusCode: 200, body: htmlAmzLimpo }],
    [],
  );
  assert.equal(finLimpo.ofertasNovas.length, 1);
  const manFinLimpo = JSON.parse(finLimpo.ofertasNovas[0].links_manuais);
  assert.equal(manFinLimpo.parcelamento || '', '');
  assert.equal(manFinLimpo.preco_parcelado || null, null);
  assert.equal(!!manFinLimpo.recorrencia, false);
  assert.equal(manFinLimpo.recorrencia_preco || null, null);
  assert.equal(manFinLimpo.recorrencia_pct || null, null);

  // 7) Guardião: ao detectar queda de preço em oferta antiga contaminada, limpa parcelamento/recorrência ausentes na PDP atual
  const cfgG = { telegram: { bot_token: '1:TEST', grupo_id: '-1001' }, afiliados: { amazon_tag: 'ofert-20' }, publicacao: { dry_run: 'nao' } };
  const ofertaAntiga = {
    oferta_id: 'of_reebok_old', loja: 'amazon', categoria: 'moda', status: 'aprovada',
    titulo: 'Kit 12 Cuecas Boxer Reebok', preco: 92.87, url: 'https://www.amazon.com.br/dp/B0CW24291V',
    links_manuais: JSON.stringify({
      parcelamento: 'Em até 3x de R$ 27,45 sem juros',
      preco_parcelado: 82.36,
      recorrencia: true,
      recorrencia_preco: 88.23,
      recorrencia_pct: 5,
    }),
  };
  const htmlAmzCaiu = '<html><body><span id="productTitle">Kit 12 Cuecas Boxer Reebok</span><span class="priceToPay"><span class="a-offscreen">R$ 79,90</span></span><div id="installmentCalculatorCentral_feature_div"><div id="reinvent_price_desktop_newAccordionRow">Em até 12x de R$ 7,90 com juros</div></div></body></html>';
  const resG = executarGuardiao(
    { checar: [ofertaAntiga], ts: Date.parse('2026-11-19T18:00:00.000Z'), hojeIso: '2026-11-19', hora: 15, minuto: 0 },
    [{ statusCode: 200, body: htmlAmzCaiu }],
    [ofertaAntiga],
    [{ oferta_id: 'of_reebok_old', plataforma: 'tg', categoria: 'moda', message_id: '555' }],
    [{ oferta_id: 'of_reebok_old', url_curta: 'https://www.amazon.com.br/dp/B0CW24291V?tag=ofert-20' }],
    cfgG,
  );
  assert.equal(resG.updatesOfertas.length, 1);
  const manLimpo = JSON.parse(resG.updatesOfertas[0].links_manuais);
  assert.equal(manLimpo.parcelamento, undefined);
  assert.equal(manLimpo.preco_parcelado, undefined);
  assert.equal(manLimpo.recorrencia, undefined);
  assert.equal(manLimpo.recorrencia_preco, undefined);
  assert.equal(manLimpo.recorrencia_pct, undefined);
});
