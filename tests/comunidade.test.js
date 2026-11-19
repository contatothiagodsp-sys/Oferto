'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const L = require('../lib');

const AGORA = new Date('2026-11-18T15:00:00Z').getTime(); // 12:00 BRT
const HORA = 60 * 60 * 1000;
const HS = { 'x-telegram-bot-api-secret-token': 'segredo' };

function cfgComunidade(extra) {
  return L.montarConfig([
    { chave: 'admins', valor: '111' },
    { chave: 'bot_token', valor: 'TOK_ADM' },
    { chave: 'bot_token_grupo', valor: 'TOK_PUB' },
    { chave: 'bot_grupo_username', valor: 'Ofertobr_ofertas_bot' },
    { chave: 'webhook_secret', valor: 'segredo' },
    { chave: 'grupo_id', valor: '-1001234567890' },
    { chave: 'topico.top', valor: '3' },
    { chave: 'topico.beleza', valor: '4' },
    { chave: 'topico.casa', valor: '5' },
    { chave: 'topico.bebe', valor: '6' },
    { chave: 'topico.tech', valor: '7' },
    { chave: 'amazon.tag_padrao', valor: 'oferto-20' },
  ].concat(extra || []));
}

const msgGrupoPriv = (text, fromId) => ({
  message: { message_id: 20, text, chat: { id: fromId || 777, type: 'private' }, from: { id: fromId || 777 } },
});

function rodarCodeNode(wf, nomeNo, ctxNodes, entrada, tsNow) {
  const no = wf.nodes.find((n) => n.name === nomeNo);
  assert.ok(no, `Nó ausente: ${nomeNo}`);
  const ent = entrada || [];
  const DateCtx = tsNow != null
    ? new Proxy(Date, { get(t, p) { return p === 'now' ? () => tsNow : Reflect.get(t, p); } })
    : Date;
  const ctx = vm.createContext({
    Date: DateCtx, Math, JSON, Intl, Object, Array, String, Number, Boolean, RegExp, Set, Map, Error,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    $input: { all: () => ent, first: () => ent[0] || { json: {} } },
    $: (nome) => ({
      isExecuted: nome in ctxNodes,
      all: () => (ctxNodes[nome] || []).map((j) => ({ json: j })),
      first: () => ({ json: (ctxNodes[nome] && ctxNodes[nome][0]) || {} }),
    }),
  });
  return vm.runInContext(`(function(){\n${no.parameters.jsCode}\n})()`, ctx);
}

test('Motor Em Alta + Perfumes Árabes no ML & Perfumes de Nicho (/radar alta, /radar arabes, /radar nicho)', () => {
  const cfg = cfgComunidade();

  // Atalhos novos no Radar sem quebrar /radar perfume
  const rAlta = L.interpretarComandoRadar('/radar alta', cfg);
  assert.equal(rAlta.apenas_em_alta, true);
  assert.equal(rAlta.incluir_fontes_cat, true);

  const rArabes = L.interpretarComandoRadar('/radar arabes', cfg);
  assert.deepEqual(rArabes.categorias, ['perfumes']);
  assert.ok(rArabes.lojas.includes('ml'));
  assert.ok(rArabes.termos_lista.includes('lattafa') && rArabes.termos_lista.includes('sabah al ward'));

  const rNicho = L.interpretarComandoRadar('/radar nicho', cfg);
  assert.deepEqual(rNicho.categorias, ['perfumes']);
  assert.ok(rNicho.termos_lista.includes('parfums de marly') && rNicho.termos_lista.includes('creed'));

  assert.equal(L.interpretarComandoRadar('/radar perfume', cfg).termo, 'perfume');

  // Planejar inclui vitrine Em Alta da Promobit + /promocoes/perfume/s/
  const plan = L.planejarFontesRadar(cfg, { modo: 'comando', ts: AGORA });
  assert.ok(plan.fontesWeb.some((f) => f.tipo === 'promobit_alta' && f.url_real === 'https://www.promobit.com.br/'));
  assert.ok(plan.fontesWeb.some((f) => f.url_real === 'https://www.promobit.com.br/promocoes/perfume/s/'));

  // Telemetria ao vivo (cliques/likes) + Perfume Árabe no ML + Pedido de membro em bfx_alertas
  const mkPb = (offers, featured) => ({
    statusCode: 200,
    data: `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: { pageProps: { serverOffers: { offers }, serverFeaturedOffers: featured || [] } },
    })}</script>`,
  });
  const respWeb = plan.fontesWeb.map((f) => {
    if (f.tipo === 'promobit_alta') {
      return mkPb([{
        offerId: 501, offerTitle: 'Console PlayStation 5 Slim 1TB + DualSense', offerPrice: 3199.9, offerOldPrice: 3999.9,
        offerLikes: 45, offerClicks: 920, offerEngagementScore: 880, offerComments: 22,
        storeDomain: 'amazon.com.br', offerInstructionsRaw: 'Em até 10x sem juros no PIX',
      }], [{ offerId: 501 }]);
    }
    if (f.url_real === 'https://www.promobit.com.br/promocoes/perfume/s/') {
      return mkPb([
        {
          offerId: 502, offerTitle: 'Perfume Árabe Masculino Lattafa Asad Bourbon 100ml Original',
          offerPrice: 179.9, offerOldPrice: 199.9, // 10% OFF: passa no agendado por ser Árabe no ML!
          offerLikes: 4, offerClicks: 45, storeDomain: 'mercadolivre.com.br', categoryName: 'Perfumes',
        },
        {
          offerId: 503, offerTitle: 'Perfume De Nicho Parfums De Marly Layton 125ml',
          offerPrice: 1690, offerOldPrice: 2190,
          offerLikes: 6, offerClicks: 60, storeDomain: 'sephora.com.br', categoryName: 'Perfumes',
        },
        {
          offerId: 504, offerTitle: 'Sabonete Líquido Comum 200ml', offerPrice: 24.9, offerOldPrice: 27.9,
          offerLikes: 1, storeDomain: 'amazon.com.br',
        },
      ]);
    }
    return { statusCode: 200, data: '<html></html>' };
  });

  // No modo agendado: sabonete 10% sem estar em alta fica fora, e maxPbRedirCiclo=2 limita rajada Promobit a 2/ciclo;
  // Lattafa Asad 10% no ML e PS5 bombando entram (e o Perfume de Nicho entra quando há vaga ou no modo comando)!
  const planAg = Object.assign({}, plan, { opcoes: Object.assign({}, plan.opcoes, { modo: 'agendado', limite: 5 }) });
  const sel = L.selecionarCandidatosRadar(planAg, respWeb, [], [], [], cfg, [{ alerta_id: 'al1', termo: 'asad', ativo: true }]);
  const idsSel = sel.candidatos.map((c) => c.radar_key);
  assert.ok(idsSel.includes('pb_501'), 'PS5 explodindo entra');
  assert.ok(idsSel.includes('pb_502'), 'Perfume Árabe no ML entra mesmo com 10%');
  assert.equal(sel.candidatos.filter((c) => c.fonte_radar === 'promobit' && c.redir_url).length, 2, 'maxPbRedirCiclo=2 no agendado');
  const selCmd = L.selecionarCandidatosRadar(Object.assign({}, plan, { opcoes: Object.assign({}, plan.opcoes, { modo: 'comando', limite: 5 }) }), respWeb, [], [], [], cfg, [{ alerta_id: 'al1', termo: 'asad', ativo: true }]);
  assert.ok(selCmd.candidatos.some((c) => c.radar_key === 'pb_503'), 'Perfume de Nicho entra sem teto agendado');
  assert.ok(!idsSel.includes('pb_504'), 'Item comum 10% sem alta fica de fora');

  const ps5 = sel.candidatos.find((c) => c.radar_key === 'pb_501');
  const asad = sel.candidatos.find((c) => c.radar_key === 'pb_502');
  assert.equal(ps5.em_alta, 'explodindo');
  assert.equal(ps5.pix, true);
  assert.equal(asad.desejo_tipo, 'perfume_arabe');
  assert.equal(asad.em_alta, 'em_alta'); // impulsionado por alerta de membro
  assert.equal(asad.categoria, 'perfumes');

  // Finalizar Radar preserva tags em_alta, desejo_tipo, pix e Auto-Top em item explodindo >= 20%
  ps5.resolved = true; ps5.produto_id = 'amz_B0PS5SLIM1'; ps5.url = 'https://www.amazon.com.br/dp/B0PS5SLIM1';
  asad.resolved = true; asad.produto_id = 'ml_MLB11223344'; asad.url = 'https://www.mercadolivre.com.br/p/MLB11223344';
  const fin = L.finalizarRadar(Object.assign({}, sel, { reqs3: [], reqsPag: [] }), [], [], [], cfg, []);
  const ofPs5 = fin.ofertasNovas.find((o) => o.produto_id === 'amz_B0PS5SLIM1');
  const ofAsad = fin.ofertasNovas.find((o) => o.produto_id === 'ml_MLB11223344');
  assert.equal(ofPs5.top, true);
  const txtPs5 = L.textoTelegram(ofPs5, 'https://amzn.to/ps5', cfg);
  assert.match(txtPs5, /💠 PIX/);
  assert.match(txtPs5, /🎮 GAMER|🕹️ CONSOLE &amp; GAMER/);
  const txtAsad = L.textoTelegram(ofAsad, 'https://mercadolivre.com/sec/asad', cfg);
  assert.match(txtAsad, /PERFUMARIA ÁRABE|PERFUME ÁRABE|FRAGRÂNCIA ÁRABE|PRODUTO EM ALTA/);
});

test('Auto-Onboarding Zero-Toque de Canais: detecta nicho, cria convite/bio, fixa boas-vindas e grava bfx_config', () => {
  const cfg = cfgComunidade();

  assert.equal(L.detectarCategoriaCanal('Ofertô Tech & Games', ''), 'tech');
  assert.equal(L.detectarCategoriaCanal('Ofertô Beleza & Skincare', ''), 'beleza');
  assert.equal(L.detectarCategoriaCanal('Ofertô Perfumes · Árabes, Importados & Nicho', ''), 'perfumes');
  assert.equal(L.detectarCategoriaCanal('Ofertô Saúde, Suplementos & Farmácia', ''), 'saude');
  assert.equal(L.detectarCategoriaCanal('Ofertô Casa & Eletro', ''), 'casa');
  assert.equal(L.detectarCategoriaCanal('Ofertô Bebê & Família', ''), 'bebe');
  assert.equal(L.detectarCategoriaCanal('Ofertô VIP · Top Ofertas & Bugs', ''), 'top');
  assert.equal(L.detectarCategoriaCanal('Canal Secreto Teste', ''), null);

  // Canal privado de Perfumes adicionado como admin -> gera rota 'canal_novo'
  const upd = {
    my_chat_member: {
      chat: { id: -100555666777, title: 'Ofertô Perfumes · Árabes & Nicho', type: 'channel' },
      new_chat_member: { status: 'administrator', can_invite_users: true, can_change_info: true, can_post_messages: true, can_pin_messages: true },
    },
  };
  const cls = L.classificarUpdate(upd, HS, cfg, AGORA, { bot: 'grupo' });
  assert.equal(cls.rota, 'canal_novo');
  assert.equal(cls.categoria, 'perfumes');
  assert.deepEqual(cls.chamadas.map((c) => c.metodo), ['createChatInviteLink', 'setChatDescription', 'sendMessage']);
  assert.match(cls.chamadas[2].payload.text, /Perfumes Árabes originais no Mercado Livre/);
  assert.match(cls.chamadas[2].payload.text, /\/alerta lattafa asad/);

  const resp = [
    { ok: true, result: { invite_link: 'https://t.me/+PRIVPERF' } },
    { ok: true, result: true },
    { ok: true, result: { message_id: 42 } },
  ];
  const fin = L.finalizarAutoOnboardingCanal(cls, resp, cfg);
  assert.ok(fin.upserts.some((u) => u.chave === 'canal.perfumes' && u.valor === '-100555666777'));
  assert.ok(fin.upserts.some((u) => u.chave === 'canal_link.perfumes' && u.valor === 'https://t.me/+PRIVPERF'));
  assert.ok(fin.upserts.some((u) => u.chave === 'categoria_nome.perfumes' && u.valor === 'Perfumes & Fragrâncias'));
  for (const r of fin.upserts) assert.deepEqual(L.colunasInvalidas('bfx_config', r), []);
  assert.ok(fin.chamadas.some((c) => c.metodo === 'pinChatMessage' && c.payload.message_id === 42));
  assert.ok(fin.chamadas.some((c) => c.bot === 'admin' && /conectado e configurado automaticamente/.test(c.payload.text)));

  // Canal com nome genérico cai no fallback amigável de admin
  const gen = L.classificarUpdate({
    my_chat_member: {
      chat: { id: -100111, title: 'Canal Sem Nome Definido', type: 'channel' },
      new_chat_member: { status: 'administrator' },
    },
  }, HS, cfg, AGORA, { bot: 'grupo' });
  assert.equal(gen.rota, 'responder');
  assert.match(gen.chamadas[0].payload.text, /\/canais perfumes/);
});

test('Alertas Pessoais (bfx_alertas): parsing sem falsos tetos em modelos, CRUD, disparo com afiliado e cooldown', () => {
  const cfg = cfgComunidade();

  // Modelos numéricos não viram preço_max!
  const aPs5 = L.classificarUpdate(msgGrupoPriv('/alerta ps 5'), HS, cfg, AGORA, { bot: 'grupo' });
  assert.deepEqual([aPs5.rota, aPs5.acao_alerta, aPs5.termo, aPs5.preco_max], ['alerta', 'criar', 'ps 5', 0]);

  const aGta = L.classificarUpdate(msgGrupoPriv('/alerta gta 6'), HS, cfg, AGORA, { bot: 'grupo' });
  assert.deepEqual([aGta.termo, aGta.preco_max], ['gta 6', 0]);

  const aGpu = L.classificarUpdate(msgGrupoPriv('/alerta rtx 4060'), HS, cfg, AGORA, { bot: 'grupo' });
  assert.deepEqual([aGpu.termo, aGpu.preco_max], ['rtx 4060', 0]);

  const aComTeto = L.classificarUpdate(msgGrupoPriv('/alerta sauvage até 520'), HS, cfg, AGORA, { bot: 'grupo' });
  assert.deepEqual([aComTeto.termo, aComTeto.preco_max], ['sauvage', 520]);

  const aCents = L.classificarUpdate(msgGrupoPriv('/alerta fralda pampers 79,90'), HS, cfg, AGORA, { bot: 'grupo' });
  assert.deepEqual([aCents.termo, aCents.preco_max], ['fralda pampers', 79.9]);

  // Inserção respeita exatamente TABELAS.bfx_alertas
  const proc = L.processarAlertaMembro(aPs5, [], cfg);
  assert.equal(proc.inserir.length, 1);
  assert.deepEqual(L.colunasInvalidas('bfx_alertas', proc.inserir[0]), []);
  assert.equal(proc.inserir[0].categoria, 'tech');

  // Duplicado não insere outro, mas atualiza preco_max se mudar
  const dupMesmo = L.processarAlertaMembro(aPs5, proc.inserir, cfg);
  assert.equal(dupMesmo.inserir.length, 0);
  const comTetoNovo = Object.assign({}, aPs5, { preco_max: 3100 });
  const upTeto = L.processarAlertaMembro(comTetoNovo, proc.inserir, cfg);
  assert.deepEqual(upTeto.atualizar, [{ alerta_id: proc.inserir[0].alerta_id, preco_max: 3100 }]);

  // Listar e remover via /remover e ?start=delalerta_...
  const list = L.processarAlertaMembro(L.classificarUpdate(msgGrupoPriv('/meusalertas'), HS, cfg, AGORA, { bot: 'grupo' }), proc.inserir, cfg);
  assert.match(list.chamadas[0].payload.text, /ps 5/);

  const remStart = L.classificarUpdate(msgGrupoPriv('/start delalerta_' + proc.inserir[0].alerta_id), HS, cfg, AGORA, { bot: 'grupo' });
  assert.deepEqual([remStart.rota, remStart.acao_alerta, remStart.alvo], ['alerta', 'remover', proc.inserir[0].alerta_id]);
  const resRem = L.processarAlertaMembro(remStart, proc.inserir, cfg);
  assert.deepEqual(resRem.atualizar, [{ alerta_id: proc.inserir[0].alerta_id, ativo: false }]);

  // Sinônimo ps5 <-> PlayStation 5 dispara alerta com link de afiliado tg
  const alertasDb = [
    Object.assign({}, proc.inserir[0], { termo: 'ps5', preco_max: 3300 }),
    { alerta_id: 'al_caro', chat_id: 888, user_hash: 'h2', termo: 'ps5', preco_max: 2500, ativo: true, ultimo_aviso_ts: 0, ultimo_produto_id: '' },
  ];
  const ofertaPub = {
    oferta_id: 'o_ps5', produto_id: 'ml_MLB999', loja: 'ml', categoria: 'tech',
    titulo: 'Console Sony PlayStation 5 Slim 1TB', preco: 3199.9,
    url: 'https://www.mercadolivre.com.br/p/MLB999',
    links_manuais: JSON.stringify({ cupom: 'SONY200' }),
  };
  const disp = L.dispararAlertasOferta([ofertaPub], [{ oferta_id: 'o_ps5', plataforma: 'tg', url: 'https://mercadolivre.com/sec/meuPs5' }], alertasDb, cfg, AGORA);
  assert.equal(disp.chamadas.length, 1); // 777 recebe; 888 tinha teto 2500
  assert.equal(disp.chamadas[0].payload.chat_id, 777);
  assert.match(disp.chamadas[0].payload.text, /https:\/\/mercadolivre\.com\/sec\/meuPs5/);
  assert.match(disp.chamadas[0].payload.text, /<code>SONY200<\/code>/);
  assert.match(disp.chamadas[0].payload.reply_markup.inline_keyboard[1][0].url, /delalerta_/);

  // amazon.mostrar_preco = nao oculta R$ na DM
  const amzAlerta = [{ alerta_id: 'al_af', chat_id: 777, termo: 'air fryer', preco_max: 0, ativo: true, ultimo_aviso_ts: 0, ultimo_produto_id: '' }];
  const amzOferta = { oferta_id: 'o_amz', produto_id: 'amz_B01', loja: 'amazon', categoria: 'casa', titulo: 'Air Fryer Mondial 4L', preco: 299.9, url: 'https://www.amazon.com.br/dp/B01' };
  const dispAmz = L.dispararAlertasOferta([amzOferta], [], amzAlerta, cfgComunidade([{ chave: 'amazon.mostrar_preco', valor: 'nao' }]), AGORA);
  assert.doesNotMatch(dispAmz.chamadas[0].payload.text, /R\$|%/);
});

test('Vitrine (/buscar, /cupons, /tophoje, /demanda, /resumao), Preço Unitário e Botões Extras', () => {
  const cfg = cfgComunidade([{ chave: 'post.botoes_extras', valor: 'sim' }]);
  const ofertas = [
    {
      oferta_id: 'o1', produto_id: 'ml_1', loja: 'ml', categoria: 'beleza', status: 'aprovada',
      titulo: 'Perfume Árabe Lattafa Khamrah 100ml', preco: 219.9, desconto_pct: 28, top: true, ts: AGORA - 3600000,
      links_manuais: JSON.stringify({ cupom: 'ARABE20' }),
    },
    {
      oferta_id: 'o2', produto_id: 'amz_2', loja: 'amazon', categoria: 'bebe', status: 'aprovada',
      titulo: 'Fralda Pampers Confort Sec G 80 Tiras', preco: 71.2, desconto_pct: 22, top: false, ts: AGORA - 2 * HORA,
      links_manuais: '{}',
    },
  ];
  const links = [{ oferta_id: 'o1', plataforma: 'tg', url: 'https://mercadolivre.com/sec/kh1' }];

  // Preço unitário inteligente (calcula em fralda/creatina/sabão 3L, ignora Air Fryer/Lava e Seca/Perfume)
  assert.equal(L.calcularPrecoUnitario('Fralda Pampers Confort Sec G 80 Tiras', 71.2), 'Sai a R$ 0,89 por tira');
  assert.equal(L.calcularPrecoUnitario('Kit 2x 50 Tiras Fralda Huggies', 89.0), 'Sai a R$ 0,89 por tira');
  assert.equal(L.calcularPrecoUnitario('Creatina Pura 60 Doses 300g', 59.4), 'Sai a R$ 0,99 por dose');
  assert.equal(L.calcularPrecoUnitario('Sabão Líquido Omo Lavagem Perfeita 3L', 35.97), 'Sai a R$ 11,99 por litro');
  assert.equal(L.calcularPrecoUnitario('Air Fryer Fritadeira Elétrica 4L', 299.9), '');
  assert.equal(L.calcularPrecoUnitario('Lava e Seca Samsung 11kg Inox', 2999), '');
  assert.equal(L.calcularPrecoUnitario('Perfume Lattafa Khamrah 100ml', 219.9), '');

  const txtFralda = L.textoTelegram(ofertas[1], 'https://amzn.to/fralda', cfg);
  assert.match(txtFralda, /🧮 <i>Sai a R\$ 0,89 por tira<\/i>/);

  // Botões poluídos (Ver na loja / Resgatar Cupons / Criar alerta / Mandar no Zap) removidos por padrão; nome clicável e cupom no texto
  const txtKhamrah = L.textoTelegram(ofertas[0], 'https://mercadolivre.com/sec/kh1', cfg);
  assert.match(txtKhamrah, /href="https:\/\/mercadolivre\.com\/sec\/kh1"/);
  assert.match(txtKhamrah, /<code>ARABE20<\/code>/);
  assert.equal(L.botaoCompra(ofertas[0], 'https://mercadolivre.com/sec/kh1', cfg), undefined);
  assert.equal(L.botaoCompra(ofertas[0], 'https://mercadolivre.com/sec/kh1', cfgComunidade()), undefined);

  // /buscar, /cupons, /tophoje pelo membro
  const cBusca = L.classificarUpdate(msgGrupoPriv('/buscar khamrah'), HS, cfg, AGORA, { bot: 'grupo' });
  assert.equal(cBusca.rota, 'vitrine');
  const resBusca = L.responderVitrineMembro(cBusca, ofertas, links, [], cfg);
  assert.match(resBusca.chamadas[0].payload.text, /Khamrah[\s\S]*<code>ARABE20<\/code>/);
  assert.match(resBusca.chamadas[0].payload.reply_markup.inline_keyboard[0][0].url, /criaralerta_khamrah/);

  const cCupom = L.classificarUpdate(msgGrupoPriv('/cupons'), HS, cfg, AGORA, { bot: 'grupo' });
  const resCupom = L.responderVitrineMembro(cCupom, ofertas, links, [], cfg);
  assert.match(resCupom.chamadas[0].payload.text, /<code>ARABE20<\/code>/);

  // /demanda e /resumao pelo admin
  const cDem = L.classificarUpdate(msgGrupoPriv('/demanda', 111), HS, cfg, AGORA);
  const resDem = L.responderVitrineMembro(cDem, ofertas, links, [{ alerta_id: 'a1', termo: 'lattafa asad', preco_max: 200, ativo: true }], cfg);
  assert.match(resDem.chamadas[0].payload.text, /lattafa asad[\s\S]*\/radar lattafa asad/);

  const cRes = L.classificarUpdate(msgGrupoPriv('/resumao', 111), HS, cfg, AGORA);
  const resRes = L.responderVitrineMembro(cRes, ofertas, links, [], cfg);
  assert.ok(resRes.chamadas.some((c) => c.bot === 'grupo' && /TOP 2 OFERTAS DE HOJE/.test(c.payload.text)));
  assert.ok(resRes.chamadas.some((c) => c.bot === 'admin' && c.payload.reply_markup));
});

test('Guardião Automático (esgotamento/subida) + VM execution de 05-guardiao-ofertas e Rota comunidade', () => {
  const cfg = cfgComunidade();

  // avaliarExpiracaoPagina: esgotado JSON-LD, preço +30%, preserva oferta com cupom, ignora 403/captcha
  const ofBase = { oferta_id: 'o_g1', produto_id: 'amz_B1', loja: 'amazon', categoria: 'tech', titulo: 'SSD 1TB', preco: 350, url: 'https://www.amazon.com.br/dp/B012345678', ts: AGORA - 2 * HORA };
  assert.equal(L.avaliarExpiracaoPagina(ofBase, { statusCode: 403, body: 'Access Denied' }).expirada, false);
  assert.equal(L.avaliarExpiracaoPagina(ofBase, { statusCode: 404, body: '' }).expirada, true);
  assert.equal(L.avaliarExpiracaoPagina(ofBase, { statusCode: 200, data: '<html><script type="application/ld+json">{"@type":"Product","offers":{"availability":"https://schema.org/OutOfStock"}}</script>'.padEnd(600, ' ') }).expirada, true);
  assert.equal(L.avaliarExpiracaoPagina(ofBase, { statusCode: 200, data: '<html><script type="application/ld+json">{"@type":"Product","name":"SSD 1TB","offers":{"price":499.90}}</script>'.padEnd(600, ' ') }).expirada, true);
  const ofCupom = Object.assign({}, ofBase, { preco: 300, links_manuais: JSON.stringify({ preco_sem_cupom: 450, cupom: 'OFF150' }) });
  assert.equal(L.avaliarExpiracaoPagina(ofCupom, { statusCode: 200, data: '<html><script type="application/ld+json">{"@type":"Product","name":"SSD 1TB","offers":{"price":450.00}}</script>'.padEnd(600, ' ') }).expirada, false);

  // VM sandbox do workflow gerado 05-guardiao-ofertas.json às 21h15 (fecha esgotada + dispara Top 5 noturno)
  const noite21h = new Date('2026-11-19T00:15:00Z').getTime(); // 21:15 BRT de 18/11
  const wfGuard = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'n8n', 'workflows', '05-guardiao-ofertas.json'), 'utf8'));
  const ofertasDb = [
    { oferta_id: 'o_esg', produto_id: 'amz_B0ESGOTADO', loja: 'amazon', categoria: 'tech', titulo: 'Mouse Gamer Sem Fio', preco: 199.9, status: 'aprovada', url: 'https://www.amazon.com.br/dp/B0ESGOTADO', ts: noite21h - 2 * HORA, links_manuais: '{}' },
    { oferta_id: 'o_viva', produto_id: 'ml_MLB777', loja: 'ml', categoria: 'beleza', titulo: 'Perfume Asad 100ml', preco: 179.9, status: 'aprovada', url: 'https://www.mercadolivre.com.br/p/MLB777', ts: noite21h - 3 * HORA, links_manuais: '{}' },
  ];
  const postsDb = [{ oferta_id: 'o_esg', plataforma: 'tg', categoria: 'tech', message_id: 901 }];
  const plan = rodarCodeNode(wfGuard, 'Planejar guardião', { Config: [{ cfg }], 'Ofertas 36h': ofertasDb }, [], noite21h)[0].json;
  assert.equal(plan.hora, 21);
  assert.equal(plan.reqs.length, 2);

  const resExec = JSON.parse(JSON.stringify(rodarCodeNode(
    wfGuard,
    'Executar guardião',
    {
      Config: [{ cfg }],
      'Planejar guardião': [plan],
      'Checar páginas ativas': [
        { statusCode: 404, data: '' },
        { statusCode: 200, data: '<html><script type="application/ld+json">{"@type":"Product","name":"Perfume Asad","offers":{"price":179.90}}</script>'.padEnd(600, ' ') },
      ],
      'Ofertas 36h': ofertasDb,
      'Posts 36h': postsDb,
      'Links 36h': [],
    },
    [],
    noite21h,
  )[0].json));
  assert.deepEqual(resExec.updatesOfertas, [{ oferta_id: 'o_esg', status: 'encerrada' }]);
  assert.ok(resExec.chamadas.some((c) => c.metodo === 'editMessageText' && c.payload.message_id === 901));
  assert.ok(resExec.chamadas.some((c) => c.metodo === 'sendMessage' && c.payload.message_thread_id === 3 && /TOP 1 OFERTAS DE HOJE/.test(c.payload.text)));
  assert.deepEqual(resExec.upsertsConfig, [{ chave: 'vitrine.ultimo_dia', valor: '2026-11-18' }]);

  // VM sandbox de 'Rota comunidade' no 01-telegram-router.json
  const wfRouter = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'n8n', 'workflows', '01-telegram-router.json'), 'utf8'));
  const rotaCom = wfRouter.nodes.find((n) => n.name === 'Rota comunidade');
  assert.ok(rotaCom, 'node Rota comunidade presente no router');
  const clsAlt = L.classificarUpdate(msgGrupoPriv('/alerta ps5'), HS, cfg, AGORA, { bot: 'grupo' });
  const procAlt = rodarCodeNode(wfRouter, 'Processar alerta', { Config: [{ cfg }], Classificar: [clsAlt] }, [])[0].json;
  assert.equal(procAlt.inserir.length, 1);
  assert.equal(procAlt.inserir[0].termo, 'ps5');
});

test('Anti-repetição 24h + resposta ao post anterior quando cai o preço ou entra cupom (VM + mostrar_preco=nao)', () => {
  const cfg = L.montarConfig([
    { chave: 'admins', valor: '111' },
    { chave: 'bot_token', valor: 'TOKEN_ADM' },
    { chave: 'bot_token_grupo', valor: 'TOKEN_PUB' },
    { chave: 'grupo_id', valor: '-1001234567890' },
    { chave: 'webhook_secret', valor: 'segredo' },
    { chave: 'n8n_webhook_url', valor: 'https://x.trycloudflare.com/webhook/telegram-ofertas' },
    { chave: 'topico.top', valor: '3' },
    { chave: 'topico.casa', valor: '5' },
    { chave: 'topico.beleza', valor: '4' },
    { chave: 'topico.perfumes', valor: '8' },
    { chave: 'topico.saude', valor: '9' },
    { chave: 'topico.bebe', valor: '6' },
    { chave: 'topico.tech', valor: '7' },
    { chave: 'canal.perfumes', valor: '@oferto_perfumes' },
    { chave: 'auto.publicar_direto', valor: 'sim' },
    { chave: 'selo.exigir_ref90', valor: 'nao' },
  ]);

  const ofertaAnterior = {
    oferta_id: 'o_prev_24h',
    produto_id: 'ml_MLB88776655',
    loja: 'ml',
    categoria: 'perfumes',
    titulo: 'Perfume Lattafa Asad 100ml Original',
    url: 'https://www.mercadolivre.com.br/p/MLB88776655',
    preco: 199.9,
    status: 'aprovada',
    links_manuais: JSON.stringify({ _afiliado: 'https://mercadolivre.com/sec/asad1' }),
    ts: AGORA - 4 * HORA,
  };
  const postsAnteriores = [
    { oferta_id: 'o_prev_24h', plataforma: 'tg', categoria: 'perfumes', message_id: 412, ts: AGORA - 4 * HORA },
    { oferta_id: 'o_prev_24h', plataforma: 'tgc', categoria: 'perfumes', message_id: 815, ts: AGORA - 4 * HORA },
  ];

  // 1) Mesmo preço (ou mais caro) em <24h -> bloqueado no Radar e trava auto_publicar no link direto
  const repMesmo = L.avaliarRepeticao24h({ produto_id: 'ml_MLB88776655', preco: 199.9 }, [ofertaAnterior], AGORA);
  assert.equal(repMesmo.bloquear, true);

  const clsMesmo = L.classificarUpdate({
    message: { message_id: 21, text: 'https://www.mercadolivre.com.br/p/MLB88776655 por 199,90', chat: { id: 111, type: 'private' }, from: { id: 111 } },
  }, HS, cfg, AGORA);
  const prepMesmo = L.prepararOferta(clsMesmo, [ofertaAnterior], cfg);
  assert.equal(prepMesmo.ja_publicada_24h, true);
  const avMesmo = L.avaliarNovaOferta(prepMesmo, [], cfg, [ofertaAnterior]);
  assert.equal(avMesmo.auto_publicar, null);

  // 2) Queda real de preço em <24h (199,90 -> 159,90) -> libera auto_publicar e responde ao post anterior no grupo E no canal!
  const clsCaiu = L.classificarUpdate({
    message: { message_id: 22, text: 'https://www.mercadolivre.com.br/p/MLB88776655 por 159,90', chat: { id: 111, type: 'private' }, from: { id: 111 } },
  }, HS, cfg, AGORA);
  const avCaiu = L.avaliarNovaOferta(L.prepararOferta(clsCaiu, [], cfg), [], cfg, [ofertaAnterior]);
  assert.ok(avCaiu.auto_publicar, 'queda real em <24h libera auto_publicar');
  const pubCaiu = L.prepararPublicacao(
    avCaiu.auto_publicar.oferta,
    avCaiu.auto_publicar.linkItens,
    cfg,
    { ts: AGORA, chat_id: 111, postsAnteriores },
  );
  const postGrupoPerf = pubCaiu.chamadas.find((c) => c.bot === 'grupo' && c.ref && c.ref.plataforma === 'tg' && c.ref.categoria === 'perfumes');
  const postCanalPerf = pubCaiu.chamadas.find((c) => c.bot === 'grupo' && c.ref && c.ref.plataforma === 'tgc' && c.ref.categoria === 'perfumes');
  assert.equal(postGrupoPerf.payload.reply_parameters.message_id, 412);
  assert.equal(postGrupoPerf.payload.reply_parameters.allow_sending_without_reply, true);
  assert.equal(postCanalPerf.payload.reply_parameters.message_id, 815);
  assert.match(postGrupoPerf.payload.text, /O PREÇO BAIXOU AINDA MAIS!/);
  assert.match(postGrupoPerf.payload.text, /estava R\$ 199,90 no post anterior/);

  // Não cruza message_id de um tópico/categoria diferente (post marcado Top pela 1ª vez não responde ao post de perfumes!)
  const ofertaTopCaiu = Object.assign({}, avCaiu.auto_publicar.oferta, { top: true });
  const pubTop = L.prepararPublicacao(ofertaTopCaiu, avCaiu.auto_publicar.linkItens, cfg, { ts: AGORA, chat_id: 111, postsAnteriores });
  const postTop = pubTop.chamadas.find((c) => c.ref && c.ref.plataforma === 'tg' && c.ref.categoria === 'top');
  assert.equal(postTop.payload.reply_parameters, undefined);

  // 3) Cupom novo entrou em <24h -> libera mesmo mantendo o preço base + resposta no Radar (finalizarRadar + publicarLoteRadar)
  const planCup = {
    ativo: true,
    opcoes: { modo: 'comando', ts: AGORA, lojas: ['ml'], categorias: ['perfumes'], limite: 3, limite_explicito: true },
    fontesWeb: [{ tipo: 'promobit_loja', url_real: 'https://www.promobit.com.br/promocoes/loja/mercado-livre/' }],
    fontesShopee: [],
  };
  const htmlCup = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { serverOffers: { offers: [{
      offerId: 901, offerTitle: 'Perfume Lattafa Asad 100ml Original',
      offerPrice: 199.9, offerOldPrice: 279.9, offerCoupon: 'MELI20',
      storeDomain: 'mercadolivre.com.br', offerLikes: 9,
    }] } } },
  })}</script>`;
  const selCup = L.selecionarCandidatosRadar(planCup, [{ statusCode: 200, data: htmlCup }], [], [ofertaAnterior], [], cfg, []);
  assert.equal(selCup.candidatos.length, 1);
  assert.equal(selCup.candidatos[0].eh_atualizacao, true);
  assert.equal(selCup.candidatos[0].motivo_repost, 'cupom');
  selCup.candidatos[0].resolved = true;
  selCup.candidatos[0].produto_id = 'ml_MLB88776655';
  selCup.candidatos[0].url = 'https://www.mercadolivre.com.br/p/MLB88776655';
  const finCup = L.finalizarRadar(Object.assign({}, selCup, { reqs3: [], reqsPag: [] }), [], [ofertaAnterior], [], cfg, []);
  const loteCup = L.publicarLoteRadar(finCup, [], [{ ok: true, result: { message_id: 99 } }], cfg, postsAnteriores);
  const pubRad = loteCup.chamadasPub.find((c) => c.bot === 'grupo' && c.ref && c.ref.plataforma === 'tg');
  assert.equal(pubRad.payload.reply_parameters.message_id, 412);
  assert.match(pubRad.payload.text, /ENTROU CUPOM NOVO NESSA OFERTA/);

  // 4) amazon.mostrar_preco = nao na resposta de queda -> zero R$ e zero % no post!
  const cfgAmzSemPreco = L.montarConfig([
    { chave: 'admins', valor: '111' },
    { chave: 'grupo_id', valor: '-1001234567890' },
    { chave: 'topico.tech', valor: '7' },
    { chave: 'amazon.mostrar_preco', valor: 'nao' },
  ]);
  const txtAmz = L.textoTelegram({
    oferta_id: 'o_amz_new', produto_id: 'amz_B012345678', loja: 'amazon', categoria: 'tech',
    titulo: 'SSD NVMe 1TB', preco: 320, min90: 320, desconto_pct: 15, data: new Date(AGORA).toISOString(),
    links_manuais: JSON.stringify({ repost_de: 'o_amz_old', preco_anterior: 399.9, motivo_repost: 'baixou_cupom' }),
  }, 'https://amzn.to/ssd', cfgAmzSemPreco);
  assert.doesNotMatch(txtAmz, /R\$|%/);
  assert.match(txtAmz, /ATUALIZAÇÃO: ENTROU CUPOM NOVO/);

  // 5) Nodes do 01-telegram-router.json (Ofertas do produto 24h -> Avaliar oferta -> Publicar) no VM sandbox
  const wfRouter = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'n8n', 'workflows', '01-telegram-router.json'), 'utf8'));
  const clsVm = L.classificarUpdate({
    message: { message_id: 23, text: 'https://www.mercadolivre.com.br/p/MLB88776655 149,90', chat: { id: 111, type: 'private' }, from: { id: 111 } },
  }, HS, cfg, AGORA);
  const prepVm = L.prepararOferta(clsVm, [], cfg);
  const avVm = rodarCodeNode(wfRouter, 'Avaliar oferta', {
    Config: [{ cfg }],
    'Juntar página': [prepVm],
    'Histórico do produto': [],
    'Ofertas do produto 24h': [ofertaAnterior],
  }, [])[0].json;
  assert.ok(avVm.auto_publicar, 'VM node Avaliar oferta detecta queda e cria auto_publicar');
  const pubVm = rodarCodeNode(wfRouter, 'Publicar', {
    Config: [{ cfg }],
    'Plano de links': [{ oferta: avVm.auto_publicar.oferta, linkItens: avVm.auto_publicar.linkItens, ctx: { ts: AGORA, chat_id: 111 } }],
    'Posts 26h': postsAnteriores,
  }, avVm.auto_publicar.linkItens.map((j) => ({ json: j })))[0].json;
  const chGrupoVm = pubVm.chamadas.find((c) => c.bot === 'grupo' && c.ref && c.ref.plataforma === 'tg');
  assert.equal(chGrupoVm.payload.reply_parameters.message_id, 412);
});

test('Separação Beleza/Perfumes/Saúde, comando /admin de denúncia no chat e cadência dinâmica 2 min', () => {
  const cfg = L.montarConfig([
    { chave: 'admins', valor: '111' },
    { chave: 'bot_token', valor: 'TOKEN_ADM' },
    { chave: 'bot_token_grupo', valor: 'TOKEN_PUB' },
    { chave: 'grupo_id', valor: '-1001234567890' },
    { chave: 'webhook_secret', valor: 'segredo' },
    { chave: 'n8n_webhook_url', valor: 'https://x.trycloudflare.com/webhook/telegram-ofertas' },
    { chave: 'topico.top', valor: '3' },
    { chave: 'topico.casa', valor: '5' },
    { chave: 'topico.beleza', valor: '4' },
    { chave: 'topico.perfumes', valor: '8' },
    { chave: 'topico.saude', valor: '9' },
    { chave: 'topico.bebe', valor: '6' },
    { chave: 'topico.tech', valor: '7' },
  ]);

  // 1) Separação clara entre beleza, perfumes e saude
  assert.equal(L.classificarCategoria('Sérum Principia Niacinamida 10% + Protetor Solar ISDIN FPS 60', cfg).categoria, 'beleza');
  assert.equal(L.classificarCategoria('Perfume Árabe Lattafa Asad Eau De Parfum 100ml', cfg).categoria, 'perfumes');
  assert.equal(L.classificarCategoria('Creatina Monohidratada Creapure Growth 250g + Whey', cfg).categoria, 'saude');
  assert.equal(L.interpretarComandoRadar('/radar suplementos', cfg).categorias[0], 'saude');
  assert.equal(L.interpretarComandoRadar('/radar skincare', cfg).categorias[0], 'beleza');

  // 2) Comando /admin em comentário de publicação (ou grupo de discussão de canal) -> notifica admins com ações
  const updDenuncia = {
    message: {
      message_id: 902,
      chat: { id: -100777888999, title: 'Comentários Ofertô Tech', type: 'supergroup', is_forum: true },
      message_thread_id: 7,
      is_topic_message: true,
      from: { id: 555, first_name: 'Maria', username: 'maria_membro' },
      text: '/admin tentando aplicar golpe de pix',
      reply_to_message: {
        message_id: 901,
        from: { id: 666, first_name: 'Golpista', username: 'fake_pix' },
        text: 'Me chama no privado e faz pix de 50',
      },
    },
  };
  const resDen = L.classificarUpdate(updDenuncia, HS, cfg, AGORA, { bot: 'grupo' });
  assert.equal(resDen.rota, 'responder');
  assert.equal(resDen.motivo, 'denuncia_admin');
  const delCmd = resDen.chamadas.find((c) => c.bot === 'grupo' && c.metodo === 'deleteMessage');
  assert.equal(delCmd.payload.message_id, 902);
  const avisoChat = resDen.chamadas.find((c) => c.bot === 'grupo' && c.metodo === 'sendMessage');
  assert.equal(avisoChat.payload.message_thread_id, 7);
  assert.equal(avisoChat.payload.reply_parameters.message_id, 901);
  const alertaAdm = resDen.chamadas.find((c) => c.bot === 'admin' && c.metodo === 'sendMessage');
  assert.match(alertaAdm.payload.text, /DENÚNCIA NO CHAT/);
  assert.match(alertaAdm.payload.text, /Me chama no privado e faz pix/);
  assert.equal(alertaAdm.payload.reply_markup.inline_keyboard[1][1].callback_data, 'mod_ban|-100777888999|666|901');

  // Clique no botão mod_ban executa deleteMessage + banChatMember
  const resBan = L.classificarUpdate({
    callback_query: { id: 'cb_ban', from: { id: 111 }, data: 'mod_ban|-100777888999|666|901', message: { message_id: 10, chat: { id: 111, type: 'private' } } },
  }, HS, cfg, AGORA);
  assert.ok(resBan.chamadas.some((c) => c.bot === 'grupo' && c.metodo === 'deleteMessage' && c.payload.message_id === 901));
  assert.ok(resBan.chamadas.some((c) => c.bot === 'grupo' && c.metodo === 'banChatMember' && c.payload.user_id === 666));

  // 3) Cadência dinâmica do Radar + trava contra âncora inflada falsa ("metade do dobro")
  const pico12h = new Date('2026-11-24T15:30:00Z').getTime(); // 12:30 BRT (pico)
  const madrug03h = new Date('2026-11-24T06:30:00Z').getTime(); // 03:30 BRT (madrugada)
  const fakeElegiveis = Array.from({ length: 6 }, (_, i) => ({ titulo: `Oferta ${i}`, cupom: 'TOP10', desconto_pct: 30 }));
  assert.equal(L.calcularLimiteDinamicoRadar(cfg, { modo: 'agendado', ts: pico12h }, fakeElegiveis), 8);
  assert.equal(L.calcularLimiteDinamicoRadar(cfg, { modo: 'agendado', ts: madrug03h }, fakeElegiveis), 2);

  const htmlInflado = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { serverOffers: { offers: [{
      offerId: 777, offerTitle: 'Cabo USB Fake 95% OFF',
      offerPrice: 29.9, offerOldPrice: 999.9, offerLikes: 0, offerClicks: 2, storeDomain: 'shopee.com.br',
    }] } } },
  })}</script>`;
  const lidoInflado = L.lerPromobitHtml(htmlInflado, {});
  assert.equal(lidoInflado[0].preco_de, null);
  assert.equal(lidoInflado[0].desconto_pct, 0);
});

test('Moda separada + 10 lojas de moda, cupons de loja (19h/tech/resgate prévio FULL1811), copy enxuta e /canais migrar', () => {
  const cfg = L.montarConfig([
    { chave: 'admins', valor: '111' },
    { chave: 'bot_token', valor: 'TOK_ADM' },
    { chave: 'bot_token_grupo', valor: 'TOK_GRP' },
    { chave: 'grupo_id', valor: '-100777888999' },
    { chave: 'webhook_secret', valor: 'segredo' },
    { chave: 'bot_grupo_username', valor: 'oferto_pub_bot' },
    { chave: 'ml.etiqueta', valor: 'meu_meli:12345' },
    { chave: 'cupons.link_ml', valor: 'https://mercadolivre.com/sec/cupons_vip' },
    { chave: 'topico.top', valor: '3' },
    { chave: 'topico.tech', valor: '7' },
    { chave: 'topico.moda', valor: '9' },
    { chave: 'topico.beleza', valor: '4' },
    { chave: 'canal.top', valor: '@oferto_top' },
    { chave: 'canal.tech', valor: '@oferto_tech' },
    { chave: 'canal.moda', valor: '@oferto_moda' },
    { chave: 'canal.beleza', valor: '@oferto_beleza' },
  ]);

  // 1) Categoria moda + 10 lojas confiáveis de vestuário/tênis
  assert.equal(L.classificarCategoria('Tênis Nike Revolution 7 Masculino Corrida', cfg).categoria, 'moda');
  assert.equal(L.classificarCategoria('Vestido Midi Canelado Oversized Feminino Shein', cfg).categoria, 'moda');
  assert.equal(L.identificar('https://www.centauro.com.br/tenis-nike-revolution-7-999.html').loja, 'centauro');
  assert.equal(L.identificar('https://www.lojasrenner.com.br/p/jaqueta-puffer/-/A-123456.br.htm').loja, 'renner');
  assert.equal(L.detectarCategoriaCanal('Ofertô Moda, Roupas & Tênis', 'oferto_moda'), 'moda');

  // 2) Enxugador de títulos SEO + CAIXA ALTA + copy curta 5-7 linhas sem urgência falsa
  const limpo = L.enxugarTituloOferta('CAMISETA OVERSIZED ADIDAS ALGODAO MASCULINA - Frete Grátis | Envio Imediato', 120);
  assert.doesNotMatch(limpo, /Frete Gr[aá]tis|Envio Imediato/i);
  assert.match(limpo, /Camiseta Oversized Adidas/);

  const ofCurta = {
    oferta_id: 'o_moda_1',
    produto_id: 'cen_123',
    loja: 'centauro',
    categoria: 'moda',
    titulo: 'TÊNIS ADIDAS ULTRABOOST LIGHT CORRIDA - Envio Imediato',
    preco: 499.9,
    min90: 699.9,
    desconto_pct: 28.5,
    links_manuais: JSON.stringify({ preco_de: 799.9 }),
    data: new Date(AGORA).toISOString(),
  };
  const tgCurto = L.textoTelegram(ofCurta, 'https://www.centauro.com.br/tenis.html', cfg);
  assert.ok(tgCurto.split('\n').length <= 8, `Esperava post enxuto, veio ${tgCurto.split('\n').length} linhas:\n${tgCurto}`);
  assert.doesNotMatch(tgCurto, /RELÂMPAGO|acabar|corra|últimas/i);

  // 3) Cupom ML lote geral das 19h: usa link /sec de cupons, logo oficial, pede resgate antecipado,
  // posta só no Top dentro do supergrupo e em Top + canais compatíveis separados
  const cmdLote19 = L.parseComandoCupomLoja('/cupom ml Lote das 19h no Mercado Livre em todo o site', cfg);
  assert.equal(cmdLote19.ok, true);
  assert.equal(cmdLote19.oferta.loja, 'ml');
  assert.equal(cmdLote19.oferta.links_manuais.escopo_cupom, 'geral');
  assert.equal(cmdLote19.oferta.links_manuais.horario_lote, '19h');
  assert.ok(cmdLote19.oferta.imagem.includes('mercadolivre.com.br'));

  const avLote = L.avaliarNovaOferta({ oferta: cmdLote19.oferta, auto_link: true, ts: AGORA, chat_id: 111, user_id: 111 }, [], cfg, []);
  const itensLote = L.planejarLinks(avLote.oferta, cfg, AGORA);
  assert.equal(itensLote[0].url, 'https://mercadolivre.com/sec/cupons_vip');
  const pubLote = L.prepararPublicacao(avLote.oferta, itensLote, cfg, { ts: AGORA, chat_id: 111 });
  assert.equal(pubLote.ok, true);
  const postsGrupoLote = pubLote.chamadas.filter((c) => c.bot === 'grupo' && c.ref && c.ref.plataforma === 'tg');
  const postsCanaisLote = pubLote.chamadas.filter((c) => c.bot === 'grupo' && c.ref && c.ref.plataforma === 'tgc');
  assert.equal(postsGrupoLote.length, 1, 'No supergrupo publica apenas 1 vez (Top) para não spamar 7 tópicos');
  assert.equal(postsGrupoLote[0].payload.message_thread_id, 3);
  assert.match(postsGrupoLote[0].payload.text || postsGrupoLote[0].payload.caption, /Resgate agora na aba de cupons/);
  assert.equal(postsGrupoLote[0].payload.reply_markup, undefined);
  assert.ok(postsCanaisLote.length >= 4, 'Nos canais separados posta nos canais compatíveis + Top');

  // 4) Cupom restrito só a Tech (/cupom ml MELI15 só em tech) NÃO vai para Moda nem Beleza nem Top
  const cmdTech = L.parseComandoCupomLoja('/cupom ml MELI15 15% OFF só em tech e eletrônicos', cfg);
  assert.equal(cmdTech.ok, true);
  assert.equal(cmdTech.oferta.links_manuais.escopo_cupom, 'restrito');
  assert.deepEqual(cmdTech.oferta.links_manuais.categorias_cupom, ['tech']);
  const avTech = L.avaliarNovaOferta({ oferta: cmdTech.oferta, auto_link: true, ts: AGORA, chat_id: 111, user_id: 111 }, [], cfg, []);
  const pubTech = L.prepararPublicacao(avTech.oferta, L.planejarLinks(avTech.oferta, cfg, AGORA), cfg, { ts: AGORA, chat_id: 111 });
  const destinosTech = pubTech.chamadas.filter((c) => c.bot === 'grupo' && /^send(?:Message|Photo)$/.test(c.metodo)).map((c) => c.ref.categoria);
  assert.deepEqual(destinosTech, ['tech', 'tech']);

  // 5) Cupom que só funciona para quem resgatou antes (ex.: FULL1811) + extração promobit_cupons
  const oPrevio = {
    oferta_id: 'o_full_1',
    produto_id: 'ml_MLB11223344',
    loja: 'ml',
    categoria: 'casa',
    preco: 179.9,
    titulo: 'Cafeteira Espresso',
    links_manuais: JSON.stringify({ cupom: 'FULL1811', exige_resgate_previo: true }),
    data: new Date(AGORA).toISOString(),
  };
  const tgPrev = L.textoTelegram(oPrevio, 'https://www.mercadolivre.com.br/p/MLB11223344', cfg);
  assert.match(tgPrev, /FULL1811[\s\S]*Funcionando pra quem resgatou!/);
  assert.match(tgPrev, /https:\/\/mercadolivre\.com\/sec\/cupons_vip[\s\S]*resgate os próximos na aba de cupons/);
  assert.equal(L.botaoCompra(oPrevio, 'https://www.mercadolivre.com.br/p/MLB11223344', cfg), undefined);

  const baseRad = L.planejarFontesRadar(cfg, { modo: 'comando', ts: AGORA });
  assert.ok(baseRad.fontesWeb.some((f) => f.tipo === 'promobit_cupons'));
  const htmlCupons = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { serverOffers: { offers: [{
      offerId: 888,
      offerPriceType: 'COUPON',
      offerTitle: 'Cupom Mercado Livre FULL1811 R$ 30 OFF às 19h em todo o site (só pra quem resgatou ontem)',
      offerCoupon: 'FULL1811',
      offerInstructionsRaw: 'Liberação às 19h em todo o site para quem resgatou no dia anterior.',
      storeDomain: 'mercadolivre.com.br',
      offerLikes: 22,
      offerIsHighlight: true,
    }] } } },
  })}</script>`;
  const selCup = L.selecionarCandidatosRadar(baseRad, baseRad.fontesWeb.map((f) => (
    f.tipo === 'promobit_cupons' ? { statusCode: 200, data: htmlCupons } : { statusCode: 200, data: '<html></html>' }
  )), [], [], [], cfg, []);
  const candCup = selCup.candidatos.find((c) => c.eh_cupom_loja);
  assert.ok(candCup);
  assert.equal(candCup.cupom, 'FULL1811');
  assert.equal(candCup.horario_lote, '19h');
  assert.equal(candCup.exige_resgate_previo, true);

  // 6) /canais migrar e /canais apagar_topico <id>
  const cmdDel = L.interpretarComandoCanais('/canais apagar_topico 4', cfg);
  assert.equal(cmdDel.chamadasExtras[0].metodo, 'deleteForumTopic');
  assert.equal(cmdDel.chamadasExtras[0].payload.message_thread_id, 4);
  const cmdMig = L.classificarUpdate({
    message: { message_id: 77, text: '/canais migrar', chat: { id: 111, type: 'private' }, from: { id: 111 } },
  }, HS, cfg, AGORA);
  assert.equal(cmdMig.rota, 'config');
  assert.ok(cmdMig.upserts.some((u) => u.chave === 'grupo_id' && u.valor === 'nenhum'));
  assert.equal(cmdMig.chamadas.filter((c) => c.metodo === 'deleteForumTopic').length, 4);
});

test('Comparador de mercado (Zoom + Amazon), PS5 B0FPGF9J2J Pix/Parcelado/300TAO, imagens wsrv e /topicos fechar', () => {
  const cfg = L.montarConfig([
    { chave: 'admins', valor: '111' },
    { chave: 'bot_token', valor: 'TOKEN_ADM' },
    { chave: 'bot_token_grupo', valor: 'TOKEN_PUB' },
    { chave: 'grupo_id', valor: '-1001234567890' },
    { chave: 'webhook_secret', valor: 'segredo' },
    { chave: 'topico.beleza', valor: '4' },
    { chave: 'topico.tech', valor: '7' },
    { chave: 'amazon.tag_padrao', valor: 'ofert-20' },
    { chave: 'radar.publicar_direto', valor: 'sim' },
  ]);

  // 1) Kit Wella R$ 274,90 (Beleza na Web, De: 654,80) vs Amazon R$ 240,21 (ignora avulso R$ 117 e trio R$ 299,70)
  const htmlAmzWella = [
    '<div data-asin="B07SS75LR2"><h2><span>KIT WELLA INVIGO NUTRI-ENRICH SH 1L + COND 1L</span></h2><span class="a-price"><span class="a-offscreen">R$ 240,21</span></span></div>',
    '<div data-asin="B08C471SFT"><h2><span>Kit Wella Professional Invigo Nutri-Enrich Salon Duo (2 ptodutos)</span></h2><span class="a-price"><span class="a-offscreen">R$ 244,62</span></span></div>',
    '<div data-asin="B0DTLKF7JQ"><h2><span>Kit Wella Professionals Invigo Nutri-Enrich Salon Máscara P (3 produtos)</span></h2><span class="a-price"><span class="a-offscreen">R$ 299,70</span></span></div>',
    '<div data-asin="B0BG312BMR"><h2><span>Shampoo Invigo Nutri Enrich Wella Professionals 1000 ml</span></h2><span class="a-price"><span class="a-offscreen">R$ 117,00</span></span></div>',
  ].join('');
  const hitsAmzWella = L.lerHitsAmazonBusca({ statusCode: 200, data: htmlAmzWella });
  const candWella = {
    titulo: 'Kit Wella Professionals Invigo Nutri-Enrich Salon Duo (2 Produtos)',
    loja: 'belezanaweb',
    preco: 274.9,
    preco_de: 654.8,
  };
  const casadosWella = L.casarProdutosMercado(candWella, hitsAmzWella);
  assert.equal(casadosWella.length, 2, 'Casa apenas kits duo equivalentes (ignora 3 produtos e avulso 1L)');
  const avWella = L.avaliarPrecoMercado(candWella, casadosWella, { modo_radar: true });
  assert.equal(avWella.aprovar, false);
  assert.equal(avWella.motivo, 'mais_barato_mercado');
  assert.equal(avWella.concorrente.preco, 240.21);

  // 2) Calibração anti-"metade do dobro": Wella Oil Reflections 1L por R$ 149,90 (fake De: 401,90) vs Amazon R$ 183,05 e R$ 199,00
  const candOil = {
    titulo: 'Wella Professionals Oil Reflections - Shampoo 1l',
    loja: 'belezanaweb',
    preco: 149.9,
    preco_de: 401.9,
  };
  const hitsOil = L.lerHitsAmazonBusca({
    statusCode: 200,
    data: [
      '<div data-asin="B0DXL6QC1T"><h2><span>Wella Professionals Shampoo 1L Oil Reflections Luminous Reveal</span></h2><span class="a-price"><span class="a-offscreen">R$ 183,05</span></span></div>',
      '<div data-asin="B0BG31RX2C"><h2><span>Wella Professionals Oil Reflections Shampoo, Tamanho: 1000 ml</span></h2><span class="a-price"><span class="a-offscreen">R$ 199,00</span></span></div>',
      '<div data-asin="B0H2J9GLNH"><h2><span>Wella Professionals Oil Reflections Shampoo 1L+Mascara 150ml</span></h2><span class="a-price"><span class="a-offscreen">R$ 284,90</span></span></div>',
    ].join(''),
  });
  const casadosOil = L.casarProdutosMercado(candOil, hitsOil);
  assert.equal(casadosOil.length, 2);
  const avOil = L.avaliarPrecoMercado(candOil, casadosOil, { modo_radar: true });
  assert.equal(avOil.aprovar, true);
  assert.equal(avOil.preco_de_ajustado, 191.03);

  // 3) finalizarRadar bloqueia Kit Wella R$ 274,90 na prática usando reqsMercado + respMercado
  const prepRad = L.prepararPaginasRadar({
    opcoes: { modo: 'agendado', ts: AGORA },
    candidatos: [{
      radar_key: 'pb_wella',
      loja: 'belezanaweb',
      categoria: 'beleza',
      produto_id: 'bnw_wella1',
      url: 'https://www.belezanaweb.com.br/kit-wella-duo',
      titulo: candWella.titulo,
      preco: 274.9,
      preco_de: 654.8,
      desconto_pct: 58,
      resolved: true,
    }],
    reqs3: [],
  }, [], cfg);
  assert.equal(prepRad.reqsPag.length, 1);
  assert.equal(prepRad.reqsMercado.length, 2);
  const finBloq = L.finalizarRadar(
    prepRad,
    [],
    [],
    [],
    cfg,
    [{ statusCode: 200, data: '<html><head><meta property="og:image" content="https://res.bnw.com/wella.jpg"/></head></html>' }],
    [{ statusCode: 200, data: '<html></html>' }, { statusCode: 200, data: htmlAmzWella }],
  );
  assert.equal(finBloq.ofertasNovas.length, 0);

  // 4) PS5 B0FPGF9J2J: apex-pricetopay-value (Pix R$ 4.369,91) + total parcelado 4.599 + pula 100OFF e pega 300TAO -> R$ 4.069,91 / 12x 358,25
  const htmlPs5 = [
    '<html><head><script type="application/ld+json">{"@type":"Product","name":"PlayStation 5 Slim Digital 825GB","offers":{"price":4599}}</script></head><body>',
    '<span id="productTitle">PlayStation®5 Slim Digital 825GB – Pacote ASTRO BOT e Gran Turismo 7</span>',
    '<span class="a-price aok-align-center apex-pricetopay-value"><span class="a-offscreen">R$4.369,91</span></span>',
    '<span>4% off à vista no Pix e NuPay</span>',
    '<span>ou em até 12x de R$ 383,25 sem juros (total parcelado R$ 4.599,00)</span>',
    '<label id="greenBadge1">Salve o cupom R$100</label><span id="promoMessageCXCW1"> : 100OFF. Válido na sua primeira compra na Amazon, pelo App</span>',
    '<label id="greenBadge2"><span class="a-text-bold">Exclusivo Prime:</span> Salve o cupom R$300</label><span id="promoMessageCXCW2"> : 300TAO</span>',
    '</body></html>',
  ].join('');
  const lidoPs5 = L.lerPaginaProduto({ statusCode: 200, data: htmlPs5 }, 'https://www.amazon.com.br/dp/B0FPGF9J2J');
  assert.equal(lidoPs5.preco, 4369.91);
  assert.equal(lidoPs5.pix, true);
  assert.equal(lidoPs5.preco_parcelado, 4599);
  assert.equal(lidoPs5.cupom, '300TAO');
  assert.equal(lidoPs5.cupom_valor, 300);
  assert.equal(lidoPs5.cupom_prime, true);
  assert.equal(lidoPs5.exige_resgate_pagina, true);

  const prepPs5 = L.prepararOferta({
    rota: 'oferta',
    auto_link: true,
    chat_id: 111,
    user_id: 111,
    ts: AGORA,
    oferta: {
      loja: 'amazon',
      produto_id: 'amz_B0FPGF9J2J',
      url: 'https://www.amazon.com.br/dp/B0FPGF9J2J',
      categoria: 'tech',
      titulo: '',
      preco: null,
      imagem: 'https://i.promobit.com.br/913730194317948457781346409915.jpg',
      links_manuais: { modo_link: true, em_alta: 'explodindo' },
    },
  }, [], cfg);
  const joinedPs5 = L.juntarPagina(prepPs5, { statusCode: 200, data: htmlPs5 }, cfg);
  assert.equal(joinedPs5.oferta.preco, 4069.91);
  assert.equal(joinedPs5.oferta.links_manuais.preco_parcelado, 4299);
  assert.equal(joinedPs5.oferta.links_manuais.parcelamento, 'Em até 12x de R$ 358,25 sem juros');
  const txtPs5 = L.textoTelegram(joinedPs5.oferta, 'https://www.amazon.com.br/dp/B0FPGF9J2J?tag=ofert-20', cfg);
  assert.ok(txtPs5.split('\n').length <= 6, `Esperava post enxuto (<=6 linhas), veio ${txtPs5.split('\n').length}:\n${txtPs5}`);
  assert.match(txtPs5, /R\$ 4\.069,91[\s\S]*💠 PIX[\s\S]*12x de R\$ 358,25 sem juros/);
  assert.match(txtPs5, /Pegue o cupom no anúncio:.*<code>300TAO<\/code>/);

  // 5) Imagem Promobit -> CDN direto /500/ (wsrv antigo é desembrulhado) e /topicos fechar
  assert.equal(
    L.normalizarImagemOferta('https://i.promobit.com.br/749753967117696962743509403185.png'),
    'https://i.promobit.com.br/500/749753967117696962743509403185.png',
  );
  assert.equal(
    L.normalizarImagemOferta('https://wsrv.nl/?url=i.promobit.com.br%2F500%2Fstatic%2Fp%2F93.webp&w=600&output=jpg'),
    'https://i.promobit.com.br/500/static/p/93.webp',
  );
  const cmdTopicos = L.classificarUpdate({
    message: { message_id: 90, text: '/topicos fechar', chat: { id: 111, type: 'private' }, from: { id: 111 } },
  }, HS, cfg, AGORA);
  assert.equal(cmdTopicos.rota, 'config');
  assert.ok(cmdTopicos.upserts.some((u) => u.chave === 'grupo.fechar_topicos_oferta' && u.valor === 'sim'));
  assert.equal(cmdTopicos.chamadas.filter((c) => c.bot === 'grupo' && c.metodo === 'closeForumTopic').length, 2);
});

test('Agente 4 (Concierge 24/7 no Chat/DM), Sinônimos em Alertas & Buscas e Comando /agentes', () => {
  const cfg = L.montarConfig([
    { chave: 'admins', valor: '111' },
    { chave: 'bot_token', valor: 'TOK_ADM' },
    { chave: 'bot_token_grupo', valor: 'TOK_PUB' },
    { chave: 'bot_grupo_username', valor: 'oferto_pub_bot' },
    { chave: 'webhook_secret', valor: 'segredo' },
    { chave: 'grupo_id', valor: '-1001234567890' },
    { chave: 'topico.tech', valor: '7' },
    { chave: 'topico.casa', valor: '5' },
    { chave: 'topico_chat_aberto', valor: '174' },
    { chave: 'amazon.tag_padrao', valor: 'oferto-20' },
  ]);

  // 1) Conversa comum continua ignorada; pedido natural de produto/teto ou cupom aciona Concierge no chat aberto
  assert.equal(L.detectarPedidoOfertaChat('oi pessoal'), null);
  assert.equal(L.detectarPedidoOfertaChat('esse'), null);
  assert.equal(L.detectarPedidoOfertaChat('bom dia grupo!'), null);
  const pedAir = L.detectarPedidoOfertaChat('alguém viu airfryer até 300?');
  assert.ok(pedAir);
  assert.equal(pedAir.eh_cupom, false);
  assert.equal(pedAir.preco_max, 300);
  assert.match(pedAir.termo, /airfryer/i);
  const pedCup = L.detectarPedidoOfertaChat('tem cupom do mercado livre hoje?');
  assert.deepEqual(pedCup, { modo: 'concierge', eh_cupom: true, termo: 'ml', preco_max: 0 });

  // No tópico fechado de ofertas (#7 Tech) membro comum não dispara concierge; no chat aberto (#174) dispara!
  const grpMsg = (threadId, text) => ({
    message: {
      message_id: 500,
      text,
      is_topic_message: true,
      message_thread_id: threadId,
      chat: { id: -1001234567890, type: 'supergroup' },
      from: { id: 888 },
    },
  });
  assert.equal(L.classificarUpdate(grpMsg(7, 'procuro notebook ate 2500'), HS, cfg, AGORA, { bot: 'grupo' }).rota, 'ignorar');
  const clsConc = L.classificarUpdate(grpMsg(174, 'procuro airfryer ate 300'), HS, cfg, AGORA, { bot: 'grupo' });
  assert.equal(clsConc.rota, 'vitrine');
  assert.equal(clsConc.modo, 'concierge');
  assert.equal(clsConc.thread_id, 174);
  assert.equal(clsConc.reply_to_message_id, 500);

  // Privado do bot publicador aceita pergunta natural
  const clsDm = L.classificarUpdate({
    message: { message_id: 501, text: 'tem cupom amazon?', chat: { id: 888, type: 'private' }, from: { id: 888 } },
  }, HS, cfg, AGORA, { bot: 'grupo' });
  assert.equal(clsDm.rota, 'vitrine');
  assert.equal(clsDm.modo, 'concierge');
  assert.equal(clsDm.eh_cupom, true);

  // 2) Sinônimos ("airfryer" casa "Fritadeira Sem Óleo", "ps5" casa "PlayStation 5") no Concierge e nos Alertas Pessoais
  assert.ok(L.expandirSinonimosBusca('airfryer').includes('fritadeira sem oleo'));
  const ofertas = [
    {
      oferta_id: 'o_air_1', produto_id: 'amz_AIR1', loja: 'amazon', categoria: 'casa', status: 'aprovada',
      titulo: 'Fritadeira Sem Óleo Air Fryer Mondial 4L', preco: 269.9, url: 'https://www.amazon.com.br/dp/B0AIRFRY01', ts: AGORA - 3600000,
    },
    {
      oferta_id: 'o_ps5_1', produto_id: 'amz_PS51', loja: 'amazon', categoria: 'tech', status: 'aprovada',
      titulo: 'Console Sony PlayStation 5 Slim Digital', preco: 3499, url: 'https://www.amazon.com.br/dp/B0PS5SLIM1', ts: AGORA - 3600000,
    },
  ];
  const links = [
    { oferta_id: 'o_air_1', plataforma: 'tg', url: 'https://www.amazon.com.br/dp/B0AIRFRY01?tag=oferto-20' },
    { oferta_id: 'o_ps5_1', plataforma: 'tg', url: 'https://www.amazon.com.br/dp/B0PS5SLIM1?tag=oferto-20' },
  ];
  const estadoFlood = {};
  const respConc = L.responderVitrineMembro(clsConc, ofertas, links, [], cfg, estadoFlood);
  assert.equal(respConc.chamadas.length, 1);
  assert.equal(respConc.chamadas[0].payload.message_thread_id, 174);
  assert.equal(respConc.chamadas[0].payload.disable_notification, true);
  assert.match(respConc.chamadas[0].payload.text, /Fritadeira Sem Óleo Air Fryer Mondial/);
  // Anti-flood 5 min bloqueia 2ª resposta imediata para o mesmo usuário
  assert.equal(L.responderVitrineMembro(clsConc, ofertas, links, [], cfg, estadoFlood).chamadas.length, 0);

  const dms = L.dispararAlertasOferta(
    [ofertas[1]],
    links,
    [{ alerta_id: 'al_1', chat_id: 999, termo: 'ps5', preco_max: 3600, ativo: true }],
    cfg,
    AGORA,
  );
  assert.equal(dms.chamadas.length, 1);
  assert.match(dms.chamadas[0].payload.text, /PlayStation 5 Slim/);

  // 3) Comando /agentes status + /agentes pausar 4 (HTML)
  const clsAg = L.classificarUpdate({
    message: { message_id: 91, text: '/agentes', chat: { id: 111, type: 'private' }, from: { id: 111 } },
  }, HS, cfg, AGORA);
  assert.equal(clsAg.rota, 'responder');
  assert.equal(clsAg.chamadas[0].payload.parse_mode, 'HTML');
  assert.match(clsAg.chamadas[0].payload.text, /Caçador Multi-Fonte[\s\S]*Concierge 24\/7/);

  const clsPausa = L.classificarUpdate({
    message: { message_id: 92, text: '/agentes pausar 4', chat: { id: 111, type: 'private' }, from: { id: 111 } },
  }, HS, cfg, AGORA);
  assert.equal(clsPausa.rota, 'config');
  assert.deepEqual(clsPausa.upserts, [{ chave: 'agentes.concierge', valor: 'nao' }]);
});

test('Agentes 1, 2, 3 e 5: link.amazon->amzlinks, R&#036;, Gatry, Prova Social, Anti-Fadiga, Guardião 30min + Queda Extra + Esquenta 18h45 + Piloto Compacto + WhatsApp API', () => {
  const cfg = L.montarConfig([
    { chave: 'admins', valor: '111' },
    { chave: 'bot_token', valor: 'TOK_ADM' },
    { chave: 'bot_token_grupo', valor: 'TOK_PUB' },
    { chave: 'webhook_secret', valor: 'segredo' },
    { chave: 'grupo_id', valor: '-1001234567890' },
    { chave: 'topico.top', valor: '3' },
    { chave: 'topico.tech', valor: '7' },
    { chave: 'topico.casa', valor: '5' },
    { chave: 'canal.top', valor: '@oferto_top' },
    { chave: 'amazon.tag_padrao', valor: 'meuaff-20' },
    { chave: 'publicar.plataformas', valor: 'wag' },
    { chave: 'radar.publicar_direto', valor: 'sim' },
    { chave: 'admin.notificacao_piloto', valor: 'compacta' },
  ]);

  // 1) Agente 1 · Caçador: link.amazon / amzlinks.in, decodificação R&#036; no t.me/s/ e Gatry HTML
  assert.equal(L.ehCurto('https://link.amazon/B0eiQubl3'), true);
  assert.equal(L.ehCurto('https://amzlinks.in/B0eiQubl3'), true);
  const htmlCanalXet = [
    '<div class="tgme_widget_message_wrap" data-post="xetdaspromocoes/991">',
    '<div class="tgme_widget_message_photo_wrap" style="background-image:url(\'https://cdn4.telesco.pe/file/downy.jpg\')"></div>',
    '<div class="tgme_widget_message_text">Vai deixar a roupa sem cheiro?<br/>Downy Amaciante Concentrado Místico 3L<br/>De R&#036; 73,00 por R&#036; 39,00<br/><a href="https://link.amazon/B0eiQubl3">link</a></div>',
    '</div>',
  ].join('');
  const extCanal = L.lerCanalTelegramPublico(htmlCanalXet, 'xetdaspromocoes');
  assert.equal(extCanal.length, 1);
  assert.equal(extCanal[0].preco, 39);
  assert.equal(extCanal[0].preco_de, 73);
  assert.equal(extCanal[0].redir_url, 'https://link.amazon/B0eiQubl3');
  assert.equal(extCanal[0].imagem, '');
  assert.doesNotMatch(extCanal[0].titulo, /Vai deixar/i);

  const htmlGatry = '<article><a href="/promocoes/abc">Cafeteira Nespresso Vertuo Pop</a> — R$ 449,00 <a href="https://www.amazon.com.br/dp/B0NESPRESS?tag=terceiro-20">Ir</a></article>';
  const extGatry = L.lerGatryHtml(htmlGatry);
  assert.equal(extGatry.length, 1);
  assert.equal(extGatry[0].produto_id, 'amz_B0NESPRESS');
  assert.equal(extGatry[0].preco, 449);

  // Planejar radar agendado inclui canais curados ativos (sem gatry_home morto e sem @promobit duplicado)
  const planAg = L.planejarFontesRadar(cfg, { modo: 'agendado', ts: AGORA });
  assert.ok(planAg.fontesWeb.some((f) => f.canal === 'canaltechofertas'));
  assert.ok(planAg.fontesWeb.some((f) => f.canal === 'xetdaspromocoes'));
  assert.ok(planAg.fontesWeb.some((f) => f.canal === 'nerdofertas'));
  assert.ok(!planAg.fontesWeb.some((f) => f.canal === 'promobit'));
  assert.ok(!planAg.fontesWeb.some((f) => f.tipo === 'gatry_home'));

  // Desempacotar 2 saltos (link.amazon -> amzlinks.in -> amazon.com.br removendo tag concorrente)
  const r1 = L.aplicarRedirRadar1({ opcoes: {}, candidatos: [Object.assign({}, extCanal[0], { resolved: false })], reqs1: [{ idx: 0 }] }, [{ statusCode: 302, headers: { location: 'https://amzlinks.in/B0eiQubl3' } }], cfg);
  assert.equal(r1.reqs2.length, 1);
  const r2 = L.aplicarRedirRadar2(r1, [{ statusCode: 302, headers: { location: 'https://www.amazon.com.br/dp/B0DOWNY3L0?tag=xet01-20' } }], cfg);
  assert.equal(r2.candidatos[0].url, 'https://www.amazon.com.br/dp/B0DOWNY3L0');
  assert.equal(r2.candidatos[0].produto_id, 'amz_B0DOWNY3L0');

  // 2) Agente 2 · Auditor: prova social concorrente exibida inline no post HTML
  const ofProva = {
    oferta_id: 'o_ps_1', produto_id: 'ml_MLB11', loja: 'ml', categoria: 'casa', titulo: 'Aspirador Robô Kabum Smart',
    preco: 799, min90: 950, desconto_pct: 15.9, data: new Date(AGORA).toISOString(),
    links_manuais: JSON.stringify({ preco_de: 1099, ref_mercado: 1099.9, ref_mercado_loja: 'Amazon' }),
  };
  const tgProva = L.textoTelegram(ofProva, 'https://mercadolivre.com/p/MLB11', cfg);
  assert.match(tgProva, /📊 <i>\(R\$ 1\.099,90 · Amazon\)<\/i>/);
  assert.ok(tgProva.split('\n').length <= 6);

  // 3) Agente 3 · Marketing: Boost afiliado (+14) + penalidade anti-fadiga 90 min
  assert.equal(L.avaliarBoostMarketing({ loja: 'amazon' }, cfg).bonus, 14);
  assert.equal(L.avaliarBoostMarketing({ loja: 'pichau' }, cfg).bonus, 0);
  const pen = L.calcularPenalidadeFadigaRecente(
    { loja: 'amazon', categoria: 'tech' },
    [
      { loja: 'amazon', categoria: 'tech', status: 'aprovada', ts: AGORA - 10 * 60000 },
      { loja: 'amazon', categoria: 'tech', status: 'aprovada', ts: AGORA - 20 * 60000 },
    ],
    AGORA,
  );
  assert.equal(pen, 24);

  // 4) Piloto Compacto (pula card preliminar e entrega 1 msg única com Zap + Top + Encerrar)
  const finComp = L.finalizarRadar(
    { opcoes: { modo: 'agendado', ts: AGORA }, candidatos: [Object.assign({}, r2.candidatos[0], { categoria: 'casa', selo: 'ok', resolved: true })], reqs3: [], reqsPag: [], reqsMercado: [] },
    [], [], [], cfg, [], [],
  );
  assert.equal(finComp.ofertasNovas.length, 1);
  assert.equal(finComp.chamadas.length, 0, 'Piloto compacto omite card preliminar ruidoso');
  assert.equal(finComp.autoPlanos[0].cardIdx, -1);

  const loteComp = L.publicarLoteRadar(finComp, [], [], cfg, []);
  const msgsAdminComp = loteComp.chamadasPub.filter((c) => c.bot === 'admin');
  assert.equal(msgsAdminComp.length, 1, 'Piloto compacto manda 1 única msg por oferta ao admin');
  const botoesFlat = msgsAdminComp[0].payload.reply_markup.inline_keyboard.flat();
  const cbDatas = botoesFlat.map((b) => b.callback_data || b.url);
  assert.ok(cbDatas.some((x) => String(x).includes('api.whatsapp.com')));
  assert.ok(botoesFlat.some((b) => /No Top/.test(b.text) || /^p\|/.test(String(b.callback_data || ''))));
  assert.ok(cbDatas.some((x) => /^z\|/.test(String(x))));

  // 5) WhatsApp API Zero-Toque (Evolution API, WAHA e Webhook Genérico)
  const cfgEvo = L.montarConfig([
    { chave: 'whatsapp.webhook_url', valor: 'https://evo.local/message/sendText/oferto' },
    { chave: 'whatsapp.api_key', valor: 'evo_key_123' },
    { chave: 'whatsapp.grupo_destino', valor: '120363000@g.us' },
  ]);
  const chEvo = L.montarChamadasWhatsAppAuto(ofProva, 'Texto Zap', '', cfgEvo);
  assert.equal(chEvo.length, 1);
  assert.equal(chEvo[0].headers.apikey, 'evo_key_123');
  assert.equal(chEvo[0].body.number, '120363000@g.us');

  const cfgWaha = L.montarConfig([
    { chave: 'whatsapp.webhook_url', valor: 'https://waha.local/api/sendText' },
    { chave: 'whatsapp.api_key', valor: 'waha_k' },
    { chave: 'whatsapp.grupo_destino', valor: '120363000@g.us' },
  ]);
  assert.equal(L.montarChamadasWhatsAppAuto(ofProva, 'Oi', '', cfgWaha)[0].headers['X-Api-Key'], 'waha_k');

  // 6) Agente 5 · Guardião 30min + Queda Extra >=6% + Limpeza Pendentes >18h + Esquenta 18h45
  const wfGuard = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'n8n', 'workflows', '05-guardiao-ofertas.json'), 'utf8'));
  const trigG = wfGuard.nodes.find((n) => n.type === 'n8n-nodes-base.scheduleTrigger');
  assert.equal(trigG.parameters.rule.interval[0].expression, '15,45 8-23 * * *');

  const ts1845 = new Date('2026-11-18T21:45:00Z').getTime(); // 18:45 BRT
  const ofAtiva = {
    oferta_id: 'o_drop_1', produto_id: 'amz_B0DROP11', loja: 'amazon', categoria: 'tech',
    titulo: 'SSD NVMe 1TB Kingston', preco: 400, status: 'aprovada',
    url: 'https://www.amazon.com.br/dp/B0DROP11', ts: ts1845 - 30 * 60000, links_manuais: '{}',
  };
  const ofPendVelha = {
    oferta_id: 'o_pend_old', produto_id: 'ml_OLD', loja: 'ml', categoria: 'casa',
    titulo: 'Pendente Antiga', preco: 99, status: 'pendente', url: 'https://www.mercadolivre.com.br/p/MLB1',
    ts: ts1845 - 20 * HORA,
  };
  const planG = rodarCodeNode(wfGuard, 'Planejar guardião', { Config: [{ cfg }], 'Ofertas 36h': [ofAtiva, ofPendVelha] }, [], ts1845)[0].json;
  assert.equal(planG.hora, 18);
  assert.equal(planG.minuto, 45);
  assert.equal(planG.reqs.length, 1);

  const execG = JSON.parse(JSON.stringify(rodarCodeNode(
    wfGuard,
    'Executar guardião',
    {
      Config: [{ cfg }],
      'Planejar guardião': [planG],
      'Checar páginas ativas': [{
        statusCode: 200,
        data: '<html><script type="application/ld+json">{"@type":"Product","name":"SSD NVMe 1TB Kingston","offers":{"price":349.90}}</script>'.padEnd(600, ' '),
      }],
      'Ofertas 36h': [ofAtiva, ofPendVelha],
      'Posts 36h': [{ oferta_id: 'o_drop_1', plataforma: 'tg', categoria: 'tech', message_id: 777 }],
      'Links 36h': [{ oferta_id: 'o_drop_1', plataforma: 'tg', url: 'https://www.amazon.com.br/dp/B0DROP11?tag=meuaff-20' }],
    },
    [],
    ts1845,
  )[0].json));

  const pedDot = L.detectarPedidoOfertaChat('alguém sabe se tem promoção de fralda até 199.90?');
  assert.ok(pedDot);
  assert.equal(pedDot.preco_max, 199.9);
  assert.equal(pedDot.termo, 'fralda');

  const updQueda = execG.updatesOfertas.find((u) => u.oferta_id === 'o_drop_1');
  assert.equal(updQueda.preco, 349.9);
  for (const upd of execG.updatesOfertas) {
    assert.deepEqual(L.colunasInvalidas('bfx_ofertas', upd), []);
  }
  assert.ok(execG.updatesOfertas.some((u) => u.oferta_id === 'o_pend_old' && u.status === 'expirada'));
  assert.ok(execG.chamadas.some((c) => c.metodo === 'editMessageText' && c.payload.message_id === 777 && /BAIXOU AINDA MAIS/.test(c.payload.text)));
  // Queda muito alta (>=15%) ou desconto >=35%: também responde à mensagem anterior com link + cupom!
  const execGForte = L.executarGuardiao(
    { ts: ts1845 + 60000, checar: [ofAtiva] },
    [{ statusCode: 200, data: '<html><script type="application/ld+json">{"@type":"Product","name":"SSD NVMe 1TB Kingston","offers":{"price":250.00}}</script><body><label id="greenBadge1">Salve o cupom R$ 20</label><span id="promoMessageCXCW1">: MEGA30</span></body></html>'.padEnd(650, ' ') }],
    [ofAtiva],
    [{ oferta_id: 'o_drop_1', plataforma: 'tg', categoria: 'tech', message_id: 777 }],
    [{ oferta_id: 'o_drop_1', plataforma: 'tg', url: 'https://www.amazon.com.br/dp/B0DROP11?tag=meuaff-20' }],
    cfg,
    ts1845 + 60000,
  );
  assert.ok(execGForte.chamadas.some((c) => c.metodo === 'sendMessage' && c.payload.reply_parameters && c.payload.reply_parameters.message_id === 777 && /BAIXOU MUITO/.test(c.payload.text) && /MEGA30/.test(c.payload.text) && /B0DROP11\?tag=meuaff-20/.test(c.payload.text)));
  assert.ok(execG.chamadas.some((c) => c.metodo === 'sendMessage' && c.payload.message_thread_id === 3 && /ESQUENTA DE CUPONS DAS 19H/.test(c.payload.text)));
  assert.deepEqual(execG.upsertsConfig, [{ chave: 'cupons.ultimo_esquenta', valor: '2026-11-18' }]);

  // 7) VM sandbox: pilotoCompacto liga Auto radar? direto em Finalizar radar + Publicar lote radar sem Telegram (cards radar) + sem $json nos novos Code nodes
  const wfRad = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'n8n', 'workflows', '04-radar-ofertas.json'), 'utf8'));
  const connsFin = wfRad.connections['Finalizar radar'].main[0].map((c) => c.node);
  assert.ok(connsFin.includes('Auto radar?'), 'Auto radar? conectado direto em Finalizar radar');
  const loteVm = rodarCodeNode(
    wfRad,
    'Publicar lote radar',
    { Config: [{ cfg }], 'Finalizar radar': [finComp] },
    [],
    AGORA,
  )[0].json;
  assert.equal(loteVm.ofertasPublicadas.length, 1);
  const wfRout = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'n8n', 'workflows', '01-telegram-router.json'), 'utf8'));
  const prepMktOut = rodarCodeNode(wfRout, 'Preparar mercado oferta', { Config: [{ cfg }] }, [{ json: { rota: 'oferta', oferta: { titulo: 'Teste', preco: 50, eh_cupom_loja: true } } }], AGORA);
  assert.equal(Array.isArray(prepMktOut), true);
});
