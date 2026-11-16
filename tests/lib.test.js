'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const L = require('../lib');

const AGORA = new Date('2026-11-24T15:30:00Z').getTime(); // 12:30 em São Paulo
const DIA = 86400000;

function cfgTeste(extra) {
  const linhas = [
    { chave: 'admins', valor: '111, 222' },
    { chave: 'bot_token', valor: 'TOKEN_ADMIN' },
    { chave: 'bot_token_grupo', valor: 'TOKEN_GRUPO' },
    { chave: 'grupo_id', valor: '-1001234567890' },
    { chave: 'webhook_secret', valor: 'segredo' },
    { chave: 'n8n_webhook_url', valor: 'https://x.app.n8n.cloud/webhook/telegram-ofertas' },
    { chave: 'topico.casa', valor: '10' },
    { chave: 'topico.top', valor: '2' },
    { chave: 'shopee.app_id', valor: '123456' },
    { chave: 'shopee.secret', valor: 'abc' },
  ];
  for (const p of ['tg', 'wac', 'wag', 'x']) linhas.push({ chave: `amazon.tag.casa_${p}`, valor: `marca-casa${p}-20` });
  return L.montarConfig(linhas.concat(extra || []));
}

test('sha256 confere com o crypto do Node (ASCII, UTF-8 e blocos longos)', () => {
  for (const s of ['', 'abc', 'preço ação 💰', 'x'.repeat(1000)]) {
    assert.equal(L.sha256Hex(s), crypto.createHash('sha256').update(s, 'utf8').digest('hex'));
  }
});

test('parsePreco e formatBRL', () => {
  assert.equal(L.parsePreco('R$ 1.299,90'), 1299.9);
  assert.equal(L.parsePreco('349,90'), 349.9);
  assert.equal(L.parsePreco('349.90'), 349.9);
  assert.equal(L.parsePreco('1.299'), 1299);
  assert.equal(L.parsePreco('abc'), null);
  assert.equal(L.parsePreco('0'), null);
  assert.equal(L.formatBRL(1299.9), 'R$ 1.299,90');
  assert.equal(L.formatBRL(0.89), 'R$ 0,89');
});

test('identificar loja e produto', () => {
  assert.deepEqual(L.identificar('https://www.amazon.com.br/Air-Fryer/dp/B0ABCDEF12?ref=x').produto_id, 'amz_B0ABCDEF12');
  assert.equal(L.identificar('https://shopee.com.br/Kit-i.111.222?sp=1').produto_id, 'shp_111_222');
  assert.equal(L.identificar('https://produto.mercadolivre.com.br/MLB-1234567-ventilador').produto_id, 'ml_MLB1234567');
  assert.ok(L.identificar('https://amzn.to/abc').erro);
  assert.ok(L.identificar('não é url').erro);
});

test('config: padrões, listas e bot único', () => {
  const cfg = cfgTeste();
  assert.deepEqual(cfg.admins, [111, 222]);
  assert.equal(cfg.telegram.topicos.casa, 10);
  assert.equal(cfg.telegram.dois_bots, true);
  assert.ok(cfg.shopee.buscas.casa.includes('air fryer'));
  const unico = L.montarConfig([{ chave: 'bot_token', valor: 'T' }]);
  assert.equal(unico.telegram.bot_token_grupo, 'T');
  assert.equal(unico.telegram.dois_bots, false);
  const semBusca = L.montarConfig([{ chave: 'shopee.busca.tech', valor: '' }, { chave: 'marca', valor: '' }]);
  assert.deepEqual(semBusca.shopee.buscas.tech, []);
  assert.equal(semBusca.marca, 'Desconto Real');
  const falt = L.linhasFaltantes([{ chave: 'marca', valor: 'X' }]);
  assert.ok(!falt.some((r) => r.chave === 'marca'));
  assert.ok(falt.some((r) => r.chave === 'amazon.tag.tech_x'));
});

test('parseOferta: formato completo', () => {
  const cfg = cfgTeste();
  const r = L.parseOferta([
    '/oferta casa top',
    'https://www.amazon.com.br/dp/B0ABCDEF12',
    'Air Fryer Mondial 4L',
    'preço 349,90',
    'ref90 399,90 https://comparador.example/hist',
    'img https://img.example/a.jpg',
  ].join('\n'), cfg);
  assert.equal(r.ok, true, JSON.stringify(r.erros));
  assert.equal(r.oferta.categoria, 'casa');
  assert.equal(r.oferta.top, true);
  assert.equal(r.oferta.preco, 349.9);
  assert.equal(r.oferta.ref90, 399.9);
  assert.equal(r.oferta.ref90_fonte, 'https://comparador.example/hist');
  assert.equal(r.oferta.loja, 'amazon');
});

test('parseOferta: erros claros', () => {
  const cfg = cfgTeste();
  const r = L.parseOferta('/oferta moda\nhttps://amzn.to/x', cfg);
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('Categoria')));
  assert.ok(r.erros.some((e) => e.includes('título')));
  assert.ok(r.erros.some((e) => e.includes('preço')));
  assert.ok(r.erros.some((e) => e.includes('Link curto')));
});

test('selo: sem referência, acima e ok', () => {
  // sem histórico e sem ref90 → sem_ref
  assert.equal(L.avaliarSelo([], 100, { agora: AGORA }).selo, 'sem_ref');
  // histórico parcial (10 dias) sem ref90 → sem_ref
  const parcial = [{ preco: 120, fonte: 'coleta', data: AGORA - 10 * DIA }];
  assert.equal(L.avaliarSelo(parcial, 100, { agora: AGORA }).selo, 'sem_ref');
  // ref90 manual acima do preço → ok, com desconto
  const ok = L.avaliarSelo([], 349.9, { agora: AGORA, ref90: 399.9 });
  assert.equal(ok.selo, 'ok');
  assert.equal(ok.min90, 399.9);
  assert.ok(ok.desconto_pct > 12 && ok.desconto_pct < 13);
  // preço acima do menor de 90 dias → acima
  assert.equal(L.avaliarSelo([], 450, { agora: AGORA, ref90: 399.9 }).selo, 'acima');
  // histórico parcial mais baixo que o ref90 também conta (conservador)
  const cons = L.avaliarSelo([{ preco: 330, fonte: 'coleta', data: AGORA - 5 * DIA }], 349.9, { agora: AGORA, ref90: 399.9 });
  assert.equal(cons.selo, 'acima');
  assert.equal(cons.min90, 330);
  // histórico próprio completo (≥ 90 dias) dispensa ref90
  const completo = [
    { preco: 500, fonte: 'coleta', data: AGORA - 95 * DIA },
    { preco: 420, fonte: 'coleta', data: AGORA - 30 * DIA },
  ];
  const c = L.avaliarSelo(completo, 400, { agora: AGORA });
  assert.equal(c.selo, 'ok');
  assert.equal(c.min90, 420);
  // registro de hoje não serve de referência para ele mesmo
  assert.equal(L.avaliarSelo([{ preco: 100, fonte: 'coleta', data: AGORA - 3600000 }], 100, { agora: AGORA }).selo, 'sem_ref');
});

test('sub-IDs: 4 plataformas, 4 sub-IDs distintos, só [a-z0-9_]', () => {
  const cfg = cfgTeste();
  const oferta = { oferta_id: 'oabc123', categoria: 'beleza', loja: 'shopee', url: 'https://shopee.com.br/product/1/2' };
  const itens = L.planejarLinks(oferta, cfg, AGORA);
  assert.equal(itens.length, 4);
  const subs = itens.map((i) => i.sub_id);
  assert.equal(new Set(subs).size, 4);
  for (const s of subs) assert.match(s, /^[a-z0-9_]+$/);
  assert.equal(subs[0], 'bf26_beleza_tg_auto');
  assert.equal(subs[1], 'bf26_beleza_wac_p1124');
  assert.equal(subs[2], 'bf26_beleza_wag_relampago');
  // Shopee: subIds separados + oferta_id, assinatura correta
  const sh = itens[1];
  assert.equal(sh.metodo, 'shopee');
  const body = JSON.parse(sh.http.body);
  assert.deepEqual(body.variables.subIds, ['bf26', 'beleza', 'wac', 'p1124', 'oabc123']);
  const m = sh.http.headers.Authorization.match(/Credential=(\d+), Timestamp=(\d+), Signature=([0-9a-f]{64})/);
  assert.ok(m);
  const esperado = crypto.createHash('sha256').update('123456' + m[2] + sh.http.body + 'abc').digest('hex');
  assert.equal(m[3], esperado);
});

test('links Amazon por tag e ML manual', () => {
  const cfg = cfgTeste();
  const amz = L.planejarLinks({ oferta_id: 'o1', categoria: 'casa', loja: 'amazon', url: 'https://www.amazon.com.br/dp/B0ABCDEF12' }, cfg, AGORA);
  assert.deepEqual(amz.map((i) => i.url), ['tg', 'wac', 'wag', 'x'].map((p) => `https://www.amazon.com.br/dp/B0ABCDEF12?tag=marca-casa${p}-20`));
  const semTag = L.pendenciasLinks({ categoria: 'beleza', loja: 'amazon', links_manuais: '{}' }, cfg);
  assert.ok(semTag[0].startsWith('BLOQUEIO'));
  const ml = L.planejarLinks({ oferta_id: 'o2', categoria: 'casa', loja: 'ml', url: 'https://x', links_manuais: { tg: 'https://ml/tg', wac: 'https://ml/wac' } }, cfg, AGORA);
  assert.equal(ml[0].url, 'https://ml/tg');
  assert.equal(ml[2].url, 'https://ml/tg'); // wag cai no primeiro manual
  assert.match(ml[2].aviso, /atribuição somada/);
});

test('textos: todos com aviso de afiliado; X ≤ 280', () => {
  const cfg = cfgTeste();
  const oferta = {
    titulo: 'Air Fryer <Mondial> 4L ' + 'muito longa '.repeat(40), preco: 349.9, min90: 399.9, desconto_pct: 12.5,
    loja: 'amazon', categoria: 'casa', data: new Date(AGORA).toISOString(),
  };
  const tg = L.textoTelegram(oferta, 'https://l/tg?a=1&b=2', cfg);
  assert.match(tg, /Contém link de afiliado/);
  assert.match(tg, /&lt;Mondial&gt;/);
  assert.match(tg, /a=1&amp;b=2/);
  assert.match(tg, /12% abaixo do menor preço dos últimos 90 dias \(R\$ 399,90\)/);
  assert.match(tg, /24\/11 às 12:30/);
  assert.ok(tg.length < 1024);
  assert.match(L.textoWhatsAppCanal(oferta, 'https://l/wac', cfg), /_Contém link de afiliado\._/);
  assert.match(L.textoWhatsAppGrupo(oferta, 'https://l/wag', cfg), /RELÂMPAGO[\s\S]*afiliado/);
  const x = L.textoX(oferta, cfg);
  assert.ok(x.length <= 280, `X com ${x.length}`);
  assert.match(x, /#publi/);
  assert.match(L.textoXResposta('https://l/x'), /afiliado/);
});

test('classificarUpdate: segredo, /oferta, callback, entrada por convite', () => {
  const cfg = cfgTeste();
  const H = { 'x-telegram-bot-api-secret-token': 'segredo' };
  assert.equal(L.classificarUpdate({}, {}, cfg).rota, 'ignorar');

  const msg = (texto, from) => ({ message: { text: texto, chat: { id: from, type: 'private' }, from: { id: from } } });
  const of = L.classificarUpdate(msg('/oferta casa\nhttps://www.amazon.com.br/dp/B0ABCDEF12\nAir Fryer\npreço 349,90', 111), H, cfg, AGORA);
  assert.equal(of.rota, 'oferta');
  assert.equal(of.oferta.produto_id, 'amz_B0ABCDEF12');

  const intruso = L.classificarUpdate(msg('/oferta casa', 999), H, cfg, AGORA);
  assert.equal(intruso.rota, 'responder');
  assert.ok(!intruso.chamadas[0].payload.text.includes('Formato'));

  const id = L.classificarUpdate(msg('/id', 999), H, cfg, AGORA);
  assert.match(id.chamadas[0].payload.text, /Seu ID: 999/);

  const cb = L.classificarUpdate({ callback_query: { id: 'q1', data: 'a|oxyz', from: { id: 222 }, message: { message_id: 5, chat: { id: 222 } } } }, H, cfg, AGORA);
  assert.deepEqual([cb.rota, cb.acao, cb.oferta_id, cb.message_id], ['callback', 'a', 'oxyz', 5]);

  const cbIntruso = L.classificarUpdate({ callback_query: { id: 'q2', data: 'a|oxyz', from: { id: 3 } } }, H, cfg, AGORA);
  assert.equal(cbIntruso.chamadas[0].metodo, 'answerCallbackQuery');

  const entrada = L.classificarUpdate({
    chat_member: {
      chat: { id: -1001234567890 }, from: { id: 77 },
      old_chat_member: { status: 'left', user: { id: 77 } },
      new_chat_member: { status: 'member', user: { id: 77 } },
      invite_link: { name: 'meta_casa_v1' },
    },
  }, H, cfg, AGORA);
  assert.equal(entrada.rota, 'membro');
  assert.equal(entrada.linha.tipo, 'entrada');
  assert.equal(entrada.linha.convite_nome, 'meta_casa_v1');
  assert.equal(entrada.linha.user_hash.length, 16);
  assert.ok(!JSON.stringify(entrada.linha).includes('77'));

  const conv = L.classificarUpdate(msg('/convite beleza meta_beleza_v1', 111), H, cfg, AGORA);
  assert.equal(conv.rota, 'convite');
  assert.equal(conv.chamadas[0].bot, 'grupo');
  assert.equal(conv.chamadas[0].payload.name, 'meta_beleza_v1');
});

test('fluxo completo: /oferta → card → aprovar relâmpago + top → publicação', () => {
  const cfg = cfgTeste();
  const H = { 'x-telegram-bot-api-secret-token': 'segredo' };
  const texto = [
    '/oferta casa', 'https://www.amazon.com.br/dp/B0ABCDEF12', 'Air Fryer Mondial 4L', 'preço 349,90',
    'ref90 399,90 https://fonte', 'img https://img/a.jpg',
  ].join('\n');
  const cls = L.classificarUpdate({ message: { text: texto, chat: { id: 111, type: 'private' }, from: { id: 111 } } }, H, cfg, AGORA);
  const av = L.avaliarNovaOferta(cls, [], cfg);
  assert.equal(av.oferta.selo, 'ok');
  assert.equal(av.precosNovos.length, 2);
  assert.deepEqual(av.precosNovos.map((p) => p.fonte), ['coleta', 'ref90']);
  const card = av.chamadas[0];
  assert.equal(card.metodo, 'sendMessage');
  const botoes = card.payload.reply_markup.inline_keyboard.flat().map((b) => b.callback_data);
  assert.ok(botoes.includes(`r|${av.oferta.oferta_id}`));

  // linha como volta da Data Table (com campos de sistema)
  const row = Object.assign({ id: 1, createdAt: 'x' }, av.oferta);
  const cb = { acao: 'r', oferta_id: row.oferta_id, callback_id: 'q', chat_id: 111, message_id: 9, user_id: 111, ts: AGORA + 60000 };
  const dec = L.decidirCallback(cb, [row], cfg);
  assert.equal(dec.proximo, 'publicar');
  assert.equal(dec.update.status, 'publicando');
  assert.equal(dec.linkItens.every((i) => i.metodo === 'pronto'), true);

  const pub = L.prepararPublicacao(dec.oferta, dec.linkItens, cfg, { ts: cb.ts, chat_id: 111, message_id: 9 });
  assert.equal(pub.ok, true);
  const grupo = pub.chamadas.filter((c) => c.bot === 'grupo');
  assert.equal(grupo.length, 1); // sem top
  assert.equal(grupo[0].metodo, 'sendMessage');
  assert.equal(grupo[0].payload.message_thread_id, 10);
  assert.match(grupo[0].payload.text, /tag=marca-casatg-20/);
  assert.equal(grupo[0].payload.link_preview_options.url, 'https://img/a.jpg');
  const textosAdmin = pub.chamadas.filter((c) => c.metodo === 'sendMessage').map((c) => c.payload.text).join('\n---\n');
  assert.match(textosAdmin, /tag=marca-casawac-20/);
  assert.match(textosAdmin, /tag=marca-casawag-20/);
  assert.match(textosAdmin, /tag=marca-casax-20/);
  assert.equal(pub.linksRows.length, 4);
  assert.equal(new Set(pub.linksRows.map((r) => r.url)).size, 4);

  // repetir o clique: já não está pendente
  const dup = L.decidirCallback(cb, [Object.assign({}, row, { status: 'publicando' })], cfg);
  assert.equal(dup.proximo, 'fim');

  // resultado: registra o post e alerta falhas
  const resp = pub.chamadas.map((c) => (c.bot === 'grupo' ? { ok: true, result: { message_id: 42 } } : { ok: true, result: {} }));
  resp[resp.length - 1] = { ok: false, description: 'Bad Request: message is not modified' };
  const res = L.resultadoChamadas(pub.chamadas, resp, cfg, cb.ts);
  assert.equal(res.posts.length, 1);
  assert.equal(res.posts[0].link, 'https://t.me/c/1234567890/10/42');
  assert.equal(res.alertas.length, 0);
});

test('callback: sem selo não publica; editar devolve o comando', () => {
  const cfg = cfgTeste();
  const row = { oferta_id: 'o1', status: 'pendente', selo: 'sem_ref', categoria: 'casa', loja: 'shopee', url: 'https://shopee.com.br/product/1/2', titulo: 'T', preco: 10 };
  const cb = { acao: 'a', oferta_id: 'o1', callback_id: 'q', chat_id: 1, message_id: 2, user_id: 111, ts: AGORA };
  assert.equal(L.decidirCallback(cb, [row], cfg).proximo, 'fim');
  const ed = L.decidirCallback(Object.assign({}, cb, { acao: 'e' }), [row], cfg);
  assert.equal(ed.update.status, 'editada');
  assert.match(ed.chamadas[2].payload.text, /\/oferta casa/);
  assert.match(ed.chamadas[2].payload.text, /ref90 VALOR/);
});

test('Shopee: leitura de respostas e seleção de candidatas', () => {
  const cfg = cfgTeste([{ chave: 'shopee.busca.casa', valor: 'air fryer' }]);
  const buscas = L.montarBuscasShopee(cfg, AGORA).filter((b) => b.categoria === 'casa');
  assert.equal(buscas.length, 1);
  const node = (id, preco, desc, com, vendas) => ({
    itemId: id, shopId: 9, productName: 'Produto ' + id, priceMin: String(preco), priceMax: String(preco * 2),
    priceDiscountRate: desc, commissionRate: String(com), sales: vendas, imageUrl: 'https://img/' + id, productLink: `https://shopee.com.br/product/9/${id}`,
  });
  const resposta = { data: { productOfferV2: { nodes: [node(1, 100, 40, 0.1, 500), node(2, 50, 5, 0.1, 500), node(3, 80, 30, 0.1, 500)] } } };
  const precos = [
    { produto_id: 'shp_9_3', preco: 90, fonte: 'coleta', ts: AGORA - 95 * DIA, data: new Date(AGORA - 95 * DIA).toISOString() },
    { produto_id: 'shp_9_3', preco: 70, fonte: 'coleta', ts: AGORA - 30 * DIA, data: new Date(AGORA - 30 * DIA).toISOString() },
  ];
  const r = L.avaliarCandidatos(buscas, [resposta], precos, [], cfg, AGORA);
  assert.equal(r.resumo.produtos, 3);
  // item 2: desconto baixo (fora); item 3: acima do menor de 90 dias (fora); item 1: sem_ref → card
  assert.equal(r.ofertasNovas.length, 1);
  assert.equal(r.ofertasNovas[0].produto_id, 'shp_9_1');
  assert.equal(r.ofertasNovas[0].selo, 'sem_ref');
  assert.equal(r.ofertasNovas[0].comissao_pct, 10);
  assert.equal(r.chamadas.length, 2); // um card por admin
  assert.equal(r.precosNovos.length, 3);
});

test('relatório diário e setup', () => {
  const cfg = cfgTeste();
  const rel = L.relatorioDiario({
    posts: [{ ts: AGORA, categoria: 'casa' }],
    ofertas: [{ oferta_id: 'o1', status: 'pendente', ts: AGORA, selo: 'ok' }],
    entradas: [
      { tipo: 'entrada', convite_nome: 'meta_casa_v1', user_hash: 'a', ts: AGORA - DIA },
      { tipo: 'entrada', convite_nome: 'meta_casa_v1', user_hash: 'b', ts: AGORA },
      { tipo: 'saida', convite_nome: '', user_hash: 'a', ts: AGORA },
    ],
    links: [],
  }, cfg, AGORA);
  assert.equal(rel.chamadas.length, 2);
  assert.match(rel.chamadas[0].payload.text, /meta_casa_v1: \+1 hoje · 2 total · 1 saíram · retenção 50%/);

  const s = L.setupChamadas(cfg);
  const metodos = s.chamadas.map((c) => `${c.bot}.${c.metodo}`);
  assert.ok(metodos.includes('grupo.setWebhook'));
  const wh = s.chamadas.find((c) => c.bot === 'grupo' && c.metodo === 'setWebhook');
  assert.deepEqual(wh.payload.allowed_updates, ['my_chat_member', 'chat_member']);
  const topicos = s.chamadas.filter((c) => c.metodo === 'createForumTopic').map((c) => c.ref.topico);
  assert.deepEqual(topicos, ['beleza', 'bebe', 'tech']); // casa e top já existem
  const resp = s.chamadas.map((c) => (c.metodo === 'createForumTopic' ? { ok: true, result: { message_thread_id: 50 } } : { ok: true, result: { username: 'bot', title: 'G', is_forum: true } }));
  const res = L.resumoSetup(s.chamadas, resp, s.avisos, cfg);
  assert.equal(res.topicos.length, 3);
  assert.equal(res.topicos[0].chave, 'topico.beleza');
});

test('linhas geradas batem com o esquema das Data Tables', () => {
  const cfg = cfgTeste();
  const H = { 'x-telegram-bot-api-secret-token': 'segredo' };
  const cls = L.classificarUpdate({ message: { text: '/oferta casa\nhttps://www.amazon.com.br/dp/B0ABCDEF12\nT\npreço 10\nref90 12 f', chat: { id: 111, type: 'private' }, from: { id: 111 } } }, H, cfg, AGORA);
  const av = L.avaliarNovaOferta(cls, [], cfg);
  assert.deepEqual(L.colunasInvalidas('bfx_ofertas', av.oferta), []);
  assert.deepEqual(Object.keys(av.oferta).sort(), Object.keys(L.TABELAS.bfx_ofertas).sort());
  for (const p of av.precosNovos) assert.deepEqual(L.colunasInvalidas('bfx_precos', p), []);
  const dec = L.decidirCallback({ acao: 'a', oferta_id: av.oferta.oferta_id, callback_id: 'q', chat_id: 1, message_id: 2, user_id: 111, ts: AGORA }, [av.oferta], cfg);
  assert.deepEqual(L.colunasInvalidas('bfx_ofertas', dec.update), []);
  const pub = L.prepararPublicacao(dec.oferta, dec.linkItens, cfg, { ts: AGORA, chat_id: 1, message_id: 2 });
  for (const r of pub.linksRows) assert.deepEqual(L.colunasInvalidas('bfx_links', r), []);
  const res = L.resultadoChamadas(pub.chamadas, pub.chamadas.map(() => ({ ok: true, result: { message_id: 1 } })), cfg, AGORA);
  for (const r of res.posts) assert.deepEqual(L.colunasInvalidas('bfx_posts', r), []);
  const ent = L.classificarUpdate({ chat_member: { chat: { id: -1001234567890 }, old_chat_member: { status: 'left' }, new_chat_member: { status: 'member', user: { id: 5 } } } }, H, cfg, AGORA);
  assert.deepEqual(L.colunasInvalidas('bfx_entradas', ent.linha), []);
  const conv = L.registrarConvite({ nome: 'n', categoria: 'casa', chat_id: 1, ts: AGORA }, { ok: true, result: { invite_link: 'https://t.me/+x' } }, cfg);
  assert.deepEqual(L.colunasInvalidas('bfx_convites', conv.linha), []);
  for (const r of L.linhasFaltantes([])) assert.deepEqual(L.colunasInvalidas('bfx_config', r), []);
});

test('lib não depende de globais ausentes no sandbox do n8n (URL, Buffer, crypto)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = path.join(__dirname, '..', 'lib');
  for (const f of fs.readdirSync(dir)) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.doesNotMatch(src, /new URL\(|URLSearchParams|Buffer\.|require\('crypto'\)|TextEncoder/, f);
  }
  assert.deepEqual(L.parseUrl('https://www.Amazon.com.br/a/dp/B0X?ref=1#h'), {
    origin: 'https://www.amazon.com.br', hostname: 'www.amazon.com.br', pathname: '/a/dp/B0X', search: '?ref=1', hash: '#h',
  });
  assert.equal(L.parseUrl('ftp://x'), null);
});

test('preposição da loja nos textos', () => {
  const cfg = cfgTeste();
  const base = { titulo: 'Fralda', preco: 71.2, min90: 89.9, desconto_pct: 20.8, categoria: 'bebe', data: new Date(AGORA).toISOString() };
  assert.match(L.textoWhatsAppCanal(Object.assign({ loja: 'ml' }, base), 'https://l', cfg), /no Mercado Livre/);
  assert.match(L.textoX(Object.assign({ loja: 'shopee' }, base), cfg), /na Shopee/);
  assert.match(L.textoTelegram(Object.assign({ loja: 'outra' }, base), 'https://l', cfg), /na loja/);
});
