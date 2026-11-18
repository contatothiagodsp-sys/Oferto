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
    { chave: 'grupo_id', valor: '-1003927635700' },
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
  assert.deepEqual(rArabes.categorias, ['beleza']);
  assert.ok(rArabes.lojas.includes('ml'));
  assert.ok(rArabes.termos_lista.includes('lattafa') && rArabes.termos_lista.includes('sabah al ward'));

  const rNicho = L.interpretarComandoRadar('/radar nicho', cfg);
  assert.deepEqual(rNicho.categorias, ['beleza']);
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

  // No modo agendado: sabonete 10% sem estar em alta fica fora, mas Lattafa Asad 10% no ML e PS5 bombando entram!
  const planAg = Object.assign({}, plan, { opcoes: Object.assign({}, plan.opcoes, { modo: 'agendado', limite: 5 }) });
  const sel = L.selecionarCandidatosRadar(planAg, respWeb, [], [], [], cfg, [{ alerta_id: 'al1', termo: 'asad', ativo: true }]);
  const idsSel = sel.candidatos.map((c) => c.radar_key);
  assert.ok(idsSel.includes('pb_501'), 'PS5 explodindo entra');
  assert.ok(idsSel.includes('pb_502'), 'Perfume Árabe no ML entra mesmo com 10%');
  assert.ok(idsSel.includes('pb_503'), 'Perfume de Nicho entra');
  assert.ok(!idsSel.includes('pb_504'), 'Item comum 10% sem alta fica de fora');

  const ps5 = sel.candidatos.find((c) => c.radar_key === 'pb_501');
  const asad = sel.candidatos.find((c) => c.radar_key === 'pb_502');
  assert.equal(ps5.em_alta, 'explodindo');
  assert.equal(ps5.pix, true);
  assert.equal(asad.desejo_tipo, 'perfume_arabe');
  assert.equal(asad.em_alta, 'em_alta'); // impulsionado por alerta de membro
  assert.equal(asad.categoria, 'beleza');

  // Finalizar Radar preserva tags em_alta, desejo_tipo, pix e Auto-Top em item explodindo >= 20%
  ps5.resolved = true; ps5.produto_id = 'amz_B0PS5SLIM1'; ps5.url = 'https://www.amazon.com.br/dp/B0PS5SLIM1';
  asad.resolved = true; asad.produto_id = 'ml_MLB11223344'; asad.url = 'https://www.mercadolivre.com.br/p/MLB11223344';
  const fin = L.finalizarRadar(Object.assign({}, sel, { reqs3: [], reqsPag: [] }), [], [], [], cfg, []);
  const ofPs5 = fin.ofertasNovas.find((o) => o.produto_id === 'amz_B0PS5SLIM1');
  const ofAsad = fin.ofertasNovas.find((o) => o.produto_id === 'ml_MLB11223344');
  assert.equal(ofPs5.top, true);
  const txtPs5 = L.textoTelegram(ofPs5, 'https://amzn.to/ps5', cfg);
  assert.match(txtPs5, /💠 no PIX/);
  assert.match(txtPs5, /Em alta hoje:/);
  assert.match(txtPs5, /BOMBANDO AGORA|EM ALTA NO BRASIL/);
  const txtAsad = L.textoTelegram(ofAsad, 'https://mercadolivre.com/sec/asad', cfg);
  assert.match(txtAsad, /PERFUMARIA ÁRABE|PERFUME ÁRABE|PRODUTO EM ALTA/);
});

test('Auto-Onboarding Zero-Toque de Canais: detecta nicho, cria convite/bio, fixa boas-vindas e grava bfx_config', () => {
  const cfg = cfgComunidade();

  assert.equal(L.detectarCategoriaCanal('Ofertô Tech & Games', ''), 'tech');
  assert.equal(L.detectarCategoriaCanal('Ofertô Perfumes, Beleza & Saúde', ''), 'beleza');
  assert.equal(L.detectarCategoriaCanal('Ofertô Casa & Eletro', ''), 'casa');
  assert.equal(L.detectarCategoriaCanal('Ofertô Bebê & Família', ''), 'bebe');
  assert.equal(L.detectarCategoriaCanal('Ofertô VIP · Top Ofertas & Bugs', ''), 'top');
  assert.equal(L.detectarCategoriaCanal('Canal Secreto Teste', ''), null);

  // Canal privado de Perfumes adicionado como admin -> gera rota 'canal_novo'
  const upd = {
    my_chat_member: {
      chat: { id: -100555666777, title: 'Ofertô Perfumes, Beleza & Saúde', type: 'channel' },
      new_chat_member: { status: 'administrator', can_invite_users: true, can_change_info: true, can_post_messages: true, can_pin_messages: true },
    },
  };
  const cls = L.classificarUpdate(upd, HS, cfg, AGORA, { bot: 'grupo' });
  assert.equal(cls.rota, 'canal_novo');
  assert.equal(cls.categoria, 'beleza');
  assert.deepEqual(cls.chamadas.map((c) => c.metodo), ['createChatInviteLink', 'setChatDescription', 'sendMessage']);
  assert.match(cls.chamadas[2].payload.text, /Perfumes Árabes originais no Mercado Livre/);
  assert.match(cls.chamadas[2].payload.text, /\/alerta lattafa asad/);

  const resp = [
    { ok: true, result: { invite_link: 'https://t.me/+PRIVPERF' } },
    { ok: true, result: true },
    { ok: true, result: { message_id: 42 } },
  ];
  const fin = L.finalizarAutoOnboardingCanal(cls, resp, cfg);
  assert.ok(fin.upserts.some((u) => u.chave === 'canal.beleza' && u.valor === '-100555666777'));
  assert.ok(fin.upserts.some((u) => u.chave === 'canal_link.beleza' && u.valor === 'https://t.me/+PRIVPERF'));
  assert.ok(fin.upserts.some((u) => u.chave === 'categoria_nome.beleza' && u.valor === 'Perfumes, Beleza & Saúde'));
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

  // Botões virais só com post.botoes_extras = sim
  const kbExtras = L.botaoCompra(ofertas[0], 'https://mercadolivre.com/sec/kh1', cfg).inline_keyboard;
  assert.equal(kbExtras[1][0].text, '🔔 Criar alerta');
  assert.equal(kbExtras[1][1].text, '📲 Mandar no Zap');
  const kbSemExtras = L.botaoCompra(ofertas[0], 'https://mercadolivre.com/sec/kh1', cfgComunidade()).inline_keyboard;
  assert.equal(kbSemExtras.length, 1);

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
