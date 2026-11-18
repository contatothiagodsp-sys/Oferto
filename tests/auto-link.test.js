'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const L = require('../lib');

const AGORA = new Date('2026-11-24T15:30:00Z').getTime();
const HS = { 'x-telegram-bot-api-secret-token': 'segredo' };

function cfgAuto(extra) {
  return L.montarConfig([
    { chave: 'admins', valor: '111' },
    { chave: 'bot_token', valor: 'TOK_ADM' },
    { chave: 'bot_token_grupo', valor: 'TOK_GRP' },
    { chave: 'grupo_id', valor: '-1001234567890' },
    { chave: 'webhook_secret', valor: 'segredo' },
    { chave: 'n8n_webhook_url', valor: 'https://exemplo.trycloudflare.com/webhook/telegram-ofertas' },
    { chave: 'topico.casa', valor: '10' },
    { chave: 'topico.tech', valor: '11' },
    { chave: 'topico.beleza', valor: '12' },
    { chave: 'topico.bebe', valor: '13' },
    { chave: 'topico.top', valor: '2' },
    { chave: 'amazon.tag_padrao', valor: 'minhatag-20' },
  ].concat(extra || []));
}

const msgPriv = (text, extraMsg) => ({
  message: Object.assign({ message_id: 10, text, chat: { id: 111, type: 'private' }, from: { id: 111 } }, extraMsg || {}),
});

test('curtos + lojas: expande links curtos de afiliado no privado e aceita opaanlp/universal-link da Shopee', () => {
  const cfg = cfgAuto();
  for (const u of [
    'https://amzn.to/3XyZ123',
    'https://a.co/d/084jujzC',
    'https://s.shopee.com.br/4AbCdEf',
    'https://shp.ee/xyz987',
    'https://mercadolivre.com/sec/1AbCdEf',
    'https://meli.la/2GhIjKl',
    'https://divulgador.magalu.com/ab12cd',
    'https://bit.ly/oferta1',
  ]) {
    assert.equal(L.ehCurto(u), true, u);
    const lc = L.linkCurtoDoUpdate(msgPriv(`Olha essa (${u})!`), cfg);
    assert.deepEqual(lc, { curto: u, url: u });
  }

  // Legenda de foto encaminhada também detecta link curto
  const foto = { message: { message_id: 11, caption: 'Promo https://s.shopee.com.br/abc123', chat: { id: 111, type: 'private' }, from: { id: 111 } } };
  assert.deepEqual(L.linkCurtoDoUpdate(foto, cfg), { curto: 'https://s.shopee.com.br/abc123', url: 'https://s.shopee.com.br/abc123' });

  // Não-admin no privado e comandos administrativos não disparam expansão
  assert.equal(L.linkCurtoDoUpdate({ message: { text: 'https://amzn.to/x', chat: { id: 999, type: 'private' }, from: { id: 999 } } }, cfg), null);
  assert.equal(L.linkCurtoDoUpdate(msgPriv('/config amazon.tag_padrao x-20'), cfg), null);

  // ML /sec/ sem header Location, mas com link canônico no HTML 200 OK
  const htmlSec = '<html><body><a href="https://www.mercadolivre.com.br/fritadeira-mondial-4l/p/MLB12345678?matt_tool=1">Ir</a></body></html>';
  const expMl = L.expandirUpdate(msgPriv('https://mercadolivre.com/sec/1AbCdEf'), 'https://mercadolivre.com/sec/1AbCdEf', { statusCode: 200, headers: {}, body: htmlSec });
  assert.match(expMl.expandido, /mercadolivre\.com\.br\/fritadeira-mondial-4l\/p\/MLB12345678/);

  // Formatos reais de redirecionamento do app da Shopee
  assert.equal(L.identificar('https://shopee.com.br/opaanlp/98765/432109?uls_trackid=x').produto_id, 'shp_98765_432109');
  const redirUrl = 'https://shopee.com.br/universal-link?redir=' + encodeURIComponent('https://shopee.com.br/product/111/222?smtt=1');
  assert.equal(L.identificar(redirUrl).produto_id, 'shp_111_222');
});

test('extrator: texto compartilhado de apps, parcelas/economia ignoradas e falsos positivos evitados', () => {
  // Compartilhamento clássico do app da Shopee
  const sh = L.extrairDoTexto('Dê uma olhada em Fone Bluetooth JBL Tune 520BT Sem Fio por R$ 199,90 na Shopee! Compre agora! https://s.shopee.com.br/abc');
  assert.equal(sh.titulo, 'Fone Bluetooth JBL Tune 520BT Sem Fio');
  assert.equal(sh.preco, 199.9);

  // Oferta encaminhada com De/Por, parcelas, economia secundária e cupom
  const enc = L.extrairDoTexto([
    '🔥 Fritadeira Elétrica Air Fryer Mondial 4L',
    'De R$ 449,90 por R$ 269,90 em até 10x de R$ 26,99 sem juros (economia de R$ 180,00)',
    'Use o cupom: CASA20',
    'https://mercadolivre.com/sec/1XyZ',
  ].join('\n'));
  assert.equal(enc.titulo, 'Fritadeira Elétrica Air Fryer Mondial 4L');
  assert.equal(enc.preco_de, 449.9);
  assert.equal(enc.preco, 269.9);
  assert.equal(enc.cupom, 'CASA20');

  // "por 12 meses" não pode virar R$ 12!
  const garantia = L.extrairDoTexto('Kit Organizador com garantia por 12 meses R$ 59,90 https://amzn.to/abc');
  assert.equal(garantia.preco, 59.9);

  // De/Por com milhar inteiro sem centavos ("De R$ 1.999 por R$ 1.499")
  const milhar = L.extrairDoTexto('Smart TV 43" De R$ 1.999 por R$ 1.499 https://amzn.to/tv');
  assert.equal(milhar.preco_de, 1999);
  assert.equal(milhar.preco, 1499);

  // Links apenas de redes sociais / comparadores são ignorados
  assert.deepEqual(L.extrairLinksProduto('Siga https://instagram.com/loja e veja https://buscape.com.br/x ou https://t.me/grupo'), []);
  assert.equal(L.extrairDoTexto('').preco, null);

  // Reconstrução de título pelo slug da URL + classificação automática de categoria
  assert.equal(
    L.tituloDaUrl('https://produto.mercadolivre.com.br/MLB-3849201-robo-aspirador-de-po-eletrico-bivolt-1500w-_JM'),
    'Robô Aspirador de Po Elétrico Bivolt 1500W',
  );
  assert.equal(L.classificarCategoria('Fralda Pampers Confort Sec G 70 Unidades').categoria, 'bebe');
  assert.equal(L.classificarCategoria('Sérum Principia Niacinamida 10% Skincare').categoria, 'beleza');
  assert.equal(L.classificarCategoria('Placa de Video RTX 4060 SSD NVMe 1TB').categoria, 'tech');
  assert.equal(L.classificarCategoria('Jogo de Panelas Antiaderente Cafeteira').categoria, 'casa');
});

test('lerPaginaProduto: JSON-LD + ListPrice VTEX, __NEXT_DATA__, Amazon DOM, ML DOM e bloqueio', () => {
  // 1) JSON-LD com ListPrice (VTEX)
  const htmlVtex = `<html><head><script type="application/ld+json">${JSON.stringify({
    '@type': 'Product',
    name: 'Cafeteira Expresso Nespresso Essenza Mini | Casas Bahia',
    image: ['https://imgs.example/nespresso.jpg'],
    offers: {
      price: 399.9,
      priceSpecification: [{ priceType: 'https://schema.org/ListPrice', price: 599.9 }],
    },
  })}</script></head></html>`;
  const vtex = L.lerPaginaProduto({ statusCode: 200, body: htmlVtex }, 'https://www.casasbahia.com.br/cafeteira/p/123');
  assert.equal(vtex.ok, true);
  assert.equal(vtex.titulo, 'Cafeteira Expresso Nespresso Essenza Mini');
  assert.equal(vtex.preco, 399.9);
  assert.equal(vtex.preco_de, 599.9);
  assert.equal(vtex.imagem, 'https://imgs.example/nespresso.jpg');

  // 2) __NEXT_DATA__ (KaBuM! / Magalu)
  const htmlKabum = `<html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { product: { name: 'SSD Kingston NV2 1TB NVMe', priceWithDiscount: 349.99, oldPrice: 449.99, photos: ['https://img.kabum/ssd.jpg'] } } },
  })}</script></head></html>`;
  const kb = L.lerPaginaProduto(htmlKabum, 'https://www.kabum.com.br/produto/1/ssd');
  assert.equal(kb.titulo, 'SSD Kingston NV2 1TB NVMe');
  assert.equal(kb.preco, 349.99);
  assert.equal(kb.preco_de, 449.99);
  assert.equal(kb.imagem, 'https://img.kabum/ssd.jpg');

  // 3) Amazon Brasil DOM
  const htmlAmz = `<html><body>
    <span id="productTitle">  Echo Dot 5ª geração com Alexa  </span>
    <div id="corePriceDisplay_desktop_feature_div">
      <span class="priceToPay"><span class="a-offscreen">R$ 299,00</span></span>
      <span class="basisPrice"><span class="a-offscreen">R$ 429,00</span></span>
    </div>
    <script>var img = {"hiRes":"https://m.media-amazon.com/images/I/71echo.jpg"};</script>
  </body></html>`;
  const amz = L.lerPaginaProduto(htmlAmz, 'https://www.amazon.com.br/dp/B09B8VGCR8');
  assert.equal(amz.titulo, 'Echo Dot 5ª geração com Alexa');
  assert.equal(amz.preco, 299);
  assert.equal(amz.preco_de, 429);
  assert.equal(amz.imagem, 'https://m.media-amazon.com/images/I/71echo.jpg');

  // 4) Mercado Livre DOM
  const htmlMl = `<html><head><meta itemprop="price" content="189.90" /><meta property="og:image" content="https://http2.mlstatic.com/D_1.jpg" /></head>
  <body>
    <h1 class="ui-pdp-title">Parafusadeira Furadeira Sem Fio 12V</h1>
    <s class="andes-money-amount--previous"><span class="andes-money-amount__fraction">279</span><span class="andes-money-amount__cents">90</span></s>
  </body></html>`;
  const ml = L.lerPaginaProduto(htmlMl, 'https://produto.mercadolivre.com.br/MLB-111222-parafusadeira-_JM');
  assert.equal(ml.titulo, 'Parafusadeira Furadeira Sem Fio 12V');
  assert.equal(ml.preco, 189.9);
  assert.equal(ml.preco_de, 279.9);
  assert.equal(ml.imagem, 'https://http2.mlstatic.com/D_1.jpg');

  // 5) Bloqueio / erro HTTP / float de 3 casas decimais ("199.900" em schema.org não vira 199 mil!)
  assert.equal(L.lerPaginaProduto({ statusCode: 403, body: 'Forbidden' }, 'https://x').ok, false);
  assert.equal(L.lerPaginaProduto('<html><title>Robot Check</title><body>validateCaptcha</body></html>', 'https://www.amazon.com.br/dp/B012345678').motivo, 'bloqueio_loja');
  const htmlFloat3 = '<html><head><title>Mouse Sem Fio</title><meta itemprop="price" content="199.900" /></head></html>';
  assert.equal(L.lerPaginaProduto(htmlFloat3, 'https://loja.example/p').preco, 199.9);
  assert.equal(
    L.lerLocation({ statusCode: 200, headers: {}, body: '<meta http-equiv="refresh" content="0;url=https://www.kabum.com.br/produto/123/mouse-gamer">' }),
    'https://www.kabum.com.br/produto/123/mouse-gamer',
  );
  assert.equal(L.lerLocation({ statusCode: 302, headers: { location: '//www.amazon.com.br/dp/B0ABCDEF12' } }), 'https://www.amazon.com.br/dp/B0ABCDEF12');
});

test('fluxo sem custo completo: colar apenas link curto de afiliado → extrai página → card pronto → aprovar com botão WhatsApp', () => {
  const cfg = cfgAuto();
  // Admin cola apenas o link mercadolivre.com/sec/... no privado!
  const bruto = msgPriv('https://mercadolivre.com/sec/1AbCdEf');
  const lc = L.linkCurtoDoUpdate(bruto, cfg);
  assert.equal(lc.curto, 'https://mercadolivre.com/sec/1AbCdEf');

  const exp = L.expandirUpdate(bruto, lc.curto, {
    statusCode: 302,
    headers: { location: 'https://www.mercadolivre.com.br/fone-bluetooth-jbl-tune-520bt/p/MLB19876543' },
  });
  const cls = L.classificarUpdate(exp.body, HS, cfg, AGORA, {}, { curto: lc.curto, expandido: exp.expandido });
  assert.equal(cls.rota, 'oferta');
  assert.equal(cls.auto_link, true);
  assert.equal(cls.oferta.loja, 'ml');
  assert.equal(cls.oferta.links_manuais._afiliado, 'https://mercadolivre.com/sec/1AbCdEf');

  const prep = L.prepararOferta(cls, [], cfg);
  assert.ok(prep.pagina_http);

  const html = `<html><head><script type="application/ld+json">${JSON.stringify({
    '@type': 'Product',
    name: 'Fone de Ouvido Sem Fio JBL Tune 520BT Bluetooth',
    image: 'https://img.example/jbl.jpg',
    offers: { price: '199.90', highPrice: '299.90' },
  })}</script></head></html>`;
  const posPag = L.juntarPagina(L.juntarKeepa(prep, null, cfg), { statusCode: 200, body: html }, cfg);
  assert.equal(posPag.rota, 'oferta');
  assert.equal(posPag.oferta.categoria, 'tech'); // reclassificou para Tech!
  assert.equal(posPag.oferta.preco, 199.9);
  assert.equal(posPag.oferta.links_manuais.preco_de, 299.9);

  const av = L.avaliarNovaOferta(posPag, [], cfg);
  assert.deepEqual(L.colunasInvalidas('bfx_ofertas', av.oferta), []);
  // Mesmo sem ref90, como veio por link automático e tem _afiliado, o botão ✅ Aprovar está liberado!
  const tecladoCard = av.chamadas[0].payload.reply_markup.inline_keyboard.flat();
  assert.ok(tecladoCard.some((b) => b.callback_data === `a|${av.oferta.oferta_id}`));
  assert.ok(tecladoCard.some((b) => b.callback_data === `g|${av.oferta.oferta_id}`));
  assert.ok(tecladoCard.some((b) => b.callback_data === `c|casa|${av.oferta.oferta_id}`));

  // Troca de categoria em 1 toque (c|casa|id)
  const decCat = L.decidirCallback({ acao: 'c', nova_categoria: 'casa', oferta_id: av.oferta.oferta_id, callback_id: 'q', chat_id: 111, message_id: 20, user_id: 111, ts: AGORA }, [av.oferta], cfg);
  assert.equal(decCat.proximo, 'fim');
  assert.deepEqual(decCat.update, { oferta_id: av.oferta.oferta_id, categoria: 'casa' });
  assert.deepEqual(L.colunasInvalidas('bfx_ofertas', decCat.update), []);
  assert.equal(decCat.chamadas[1].metodo, 'editMessageText');
  assert.match(decCat.chamadas[1].payload.text, /Casa &amp; Eletro/);

  // Clique em ✅ Aprovar (a|id): usa o link mercadolivre.com/sec/1AbCdEf e gera texto do Grupo WhatsApp com botão 1-toque!
  const dec = L.decidirCallback({ acao: 'a', oferta_id: av.oferta.oferta_id, callback_id: 'q2', chat_id: 111, message_id: 20, user_id: 111, ts: AGORA }, [av.oferta], cfg);
  assert.equal(dec.proximo, 'publicar');
  const pub = L.prepararPublicacao(dec.oferta, dec.linkItens, cfg, { ts: AGORA, chat_id: 111, message_id: 20 });
  assert.equal(pub.ok, true);
  const postTg = pub.chamadas.find((c) => c.bot === 'grupo');
  assert.match(postTg.payload.text, /mercadolivre\.com\/sec\/1AbCdEf/);
  assert.match(postTg.payload.text, /De <s>R\$ 299,90<\/s> por:/);
  assert.match(postTg.payload.text, /economia de R\$ 100,00 · -33% na loja/);
  assert.doesNotMatch(postTg.payload.text, /90 dias/); // não mente sobre 90 dias quando não há ref90!

  const msgZapGrupo = pub.chamadas.find((c) => c.bot === 'admin' && c.payload.text && c.payload.text.startsWith('⚡ *ALERTA DE PREÇO*'));
  assert.ok(msgZapGrupo, 'enviou texto do Grupo WhatsApp no Aprovar normal');
  assert.match(msgZapGrupo.payload.text, /De ~R\$ 299,90~ por:/);
  assert.match(msgZapGrupo.payload.text, /mercadolivre\.com\/sec\/1AbCdEf/);
  const btnZap = msgZapGrupo.payload.reply_markup.inline_keyboard[0][0];
  assert.match(btnZap.url, /^https:\/\/api\.whatsapp\.com\/send\?text=/);
  assert.ok(btnZap.url.length <= 2000);
});

test('loja bloqueou preço no link cru → pede só o preço → resposta rápida conclui a oferta', () => {
  const cfg = cfgAuto();
  const expBody = msgPriv('https://produto.mercadolivre.com.br/MLB-999888-aspirador-robo-inteligente-bivolt-_JM');
  const cls = L.classificarUpdate(expBody, HS, cfg, AGORA, {}, { curto: 'https://mercadolivre.com/sec/bloqueado1' });
  const prep = L.prepararOferta(cls, [], cfg);
  const bloqueado = L.juntarPagina(prep, { statusCode: 403, body: 'Access Denied' }, cfg);
  assert.equal(bloqueado.rota, 'responder');
  const promptTxt = bloqueado.chamadas[0].payload.text;
  assert.match(promptTxt, /Falta só o preço/);
  assert.match(promptTxt, /Aspirador Robô Inteligente Bivolt/);
  assert.match(promptTxt, /mercadolivre\.com\/sec\/bloqueado1/);

  const promptPlano = promptTxt.replace(/<[^>]+>/g, '');
  // Resposta inválida explica claramente
  const respRuim = L.classificarUpdate({
    message: { message_id: 30, text: 'não sei', chat: { id: 111, type: 'private' }, from: { id: 111 }, reply_to_message: { message_id: 29, text: promptPlano } },
  }, HS, cfg, AGORA);
  assert.equal(respRuim.rota, 'responder');
  assert.match(respRuim.chamadas[0].payload.text, /Responda só com o valor/);

  // Resposta só com o preço + cupom conclui a oferta preservando o link /sec/!
  const respOk = L.classificarUpdate({
    message: { message_id: 31, text: 'de 499,90 por 319,90 cupom CASA30', chat: { id: 111, type: 'private' }, from: { id: 111 }, reply_to_message: { message_id: 29, text: promptPlano } },
  }, HS, cfg, AGORA);
  assert.equal(respOk.rota, 'oferta');
  assert.equal(respOk.oferta.titulo, 'Aspirador Robô Inteligente Bivolt');
  assert.equal(respOk.oferta.preco, 319.9);
  assert.equal(respOk.oferta.links_manuais.preco_de, 499.9);
  assert.equal(respOk.oferta.links_manuais.cupom, 'CASA30');
  assert.equal(respOk.oferta.links_manuais._afiliado, 'https://mercadolivre.com/sec/bloqueado1');
  assert.equal(respOk.oferta.categoria, 'casa');
});

test('afiliados sem burocracia: Shopee sem API com s.shopee, Amazon com ?tag= ou amzn.to, Magalu divulgador e aprovação liberada sem afiliado', () => {
  const cfgSemApi = L.montarConfig([
    { chave: 'admins', valor: '111' },
    { chave: 'bot_token', valor: 'T' },
    { chave: 'webhook_secret', valor: 'segredo' },
  ]);

  // Shopee sem API mas com s.shopee.com.br → sem bloqueio
  const ofShopee = { oferta_id: 'o1', categoria: 'casa', loja: 'shopee', url: 'https://shopee.com.br/product/1/2', links_manuais: { _afiliado: 'https://s.shopee.com.br/meuLink' } };
  assert.equal(L.pendenciasLinks(ofShopee, cfgSemApi).some((p) => p.startsWith('BLOQUEIO')), false);
  assert.equal(L.planejarLinks(ofShopee, cfgSemApi, AGORA)[0].url, 'https://s.shopee.com.br/meuLink');

  // Shopee com API mas API falha na hora → cai no fallback s.shopee.com.br
  const cfgComApi = cfgAuto([{ chave: 'shopee.app_id', valor: '123' }, { chave: 'shopee.secret', valor: 'seg' }]);
  const planosSh = L.planejarLinks(ofShopee, cfgComApi, AGORA);
  const lidos = L.lerRespostasShopee(planosSh, planosSh.map(() => ({ error: 'timeout' })));
  assert.ok(lidos.every((i) => i.url === 'https://s.shopee.com.br/meuLink'));

  // Amazon sem tags na config, mas com ?tag= na URL colada → usa a tag da URL!
  const clsAmzTag = L.classificarUpdate(msgPriv('Air Fryer 299,90 https://www.amazon.com.br/dp/B0ABCDEF12?tag=tagurl-20'), HS, cfgSemApi, AGORA);
  assert.equal(clsAmzTag.oferta.links_manuais._tag_url, 'tagurl-20');
  assert.equal(L.pendenciasLinks(clsAmzTag.oferta, cfgSemApi).some((p) => p.startsWith('BLOQUEIO')), false);
  assert.equal(L.planejarLinks(clsAmzTag.oferta, cfgSemApi, AGORA)[0].url, 'https://www.amazon.com.br/dp/B0ABCDEF12?tag=tagurl-20');

  // Magalu divulgador → preserva link e não avisa "sem comissão"
  const ofMagalu = { oferta_id: 'o2', categoria: 'casa', loja: 'outra', url: 'https://www.magazineluiza.com.br/p/123', links_manuais: { _afiliado: 'https://divulgador.magalu.com/xyz' } };
  assert.deepEqual(L.pendenciasLinks(ofMagalu, cfgSemApi), []);
  assert.equal(L.planejarLinks(ofMagalu, cfgSemApi, AGORA)[0].url, 'https://divulgador.magalu.com/xyz');

  // Links crus SEM afiliado (Amazon sem tag, Shopee sem API/s.shopee, ML sem /sec/) → libera ✅ Aprovar com aviso "sem comissão" e link direto
  for (const ofCru of [
    { oferta_id: 'o3', categoria: 'tech', loja: 'amazon', titulo: 'Controle Xbox', preco: 350, selo: 'sem_ref', url: 'https://www.amazon.com.br/dp/B099988877', links_manuais: { modo_link: true } },
    { oferta_id: 'o4', categoria: 'casa', loja: 'shopee', titulo: 'Cafeteira', preco: 149.9, selo: 'sem_ref', url: 'https://shopee.com.br/product/1/2', links_manuais: { modo_link: true } },
    { oferta_id: 'o5', categoria: 'casa', loja: 'ml', titulo: 'Aspirador', preco: 499, selo: 'sem_ref', url: 'https://produto.mercadolivre.com.br/MLB-123-x', links_manuais: { modo_link: true } },
  ]) {
    const pend = L.pendenciasLinks(ofCru, cfgSemApi);
    assert.equal(pend.some((p) => p.startsWith('BLOQUEIO')), false);
    assert.ok(pend.some((p) => /sem comissão/i.test(p)));
    assert.deepEqual(L.planejarLinks(ofCru, cfgSemApi, AGORA).map((i) => i.url), [ofCru.url, ofCru.url, ofCru.url, ofCru.url]);
    const card = L.cardAprovacao(ofCru, cfgSemApi, pend);
    assert.ok(card.reply_markup.inline_keyboard.flat().some((b) => b.callback_data === `a|${ofCru.oferta_id}` && b.text === '✅ Aprovar'));
  }
});

test('/modo rapido, /config, proteção de segredos, 📋 Só textos sem grupo_id e guarda de duplicata 24h', () => {
  const cfg = cfgAuto();

  // /modo rapido
  const mRap = L.classificarUpdate(msgPriv('/modo rapido'), HS, cfg, AGORA);
  assert.equal(mRap.rota, 'config');
  for (const r of mRap.upserts) assert.deepEqual(L.colunasInvalidas('bfx_config', r), []);

  // /config chave protegida é bloqueada
  for (const k of ['bot_token', 'shopee.secret', 'keepa.chave', 'admins', 'webhook_secret']) {
    const bloq = L.classificarUpdate(msgPriv(`/config ${k} hack`), HS, cfg, AGORA);
    assert.equal(bloq.rota, 'responder');
    assert.match(bloq.chamadas[0].payload.text, /Por segurança/);
  }

  // /config chave válida
  const okCfg = L.classificarUpdate(msgPriv('/config amazon.tag_padrao novatag-20'), HS, cfg, AGORA);
  assert.equal(okCfg.rota, 'config');
  assert.deepEqual(okCfg.upserts, [{ chave: 'amazon.tag_padrao', valor: 'novatag-20' }]);

  // Modo rápido COM grupo_id: auto_publicar = true (0 cliques!) e envia só wag
  const cfgRapido = cfgAuto(mRap.upserts);
  assert.equal(cfgRapido.auto.publicar_direto, true);
  assert.deepEqual(cfgRapido.publicar.plataformas, ['wag']);

  const cls = L.classificarUpdate(msgPriv('Fone JBL Bluetooth por R$ 179,90 https://www.amazon.com.br/dp/B0ABCDEF12'), HS, cfgRapido, AGORA);
  const prep = L.prepararOferta(cls, [], cfgRapido);
  const av = L.avaliarNovaOferta(prep, [], cfgRapido);
  assert.ok(av.auto_publicar);
  assert.equal(av.auto_publicar.so_textos, false);
  assert.equal(av.oferta.status, 'publicando');
  assert.equal(av.oferta.decidida_por, 111);
  assert.equal(av.oferta.decidida_ts, AGORA);
  assert.doesNotMatch(av.chamadas[0].payload.text, /Cobertura: 0 dias/);
  assert.match(av.chamadas[0].payload.reply_markup.inline_keyboard[0][0].text, /Publicando automaticamente/);

  const pub = L.prepararPublicacao(av.auto_publicar.oferta, av.auto_publicar.linkItens, cfgRapido, {
    ts: AGORA, chat_id: 111, message_id: 50, so_textos: false,
  });
  assert.equal(pub.ok, true);
  assert.equal(pub.chamadas.filter((c) => c.bot === 'grupo').length, 1);
  // Só enviou resumo + Grupo WhatsApp + editMessageReplyMarkup (zero X ou Canal!)
  const msgsAdmin = pub.chamadas.filter((c) => c.bot === 'admin' && c.metodo === 'sendMessage');
  assert.equal(msgsAdmin.length, 2);
  assert.match(msgsAdmin[1].payload.text, /^⚡ \*ALERTA DE PREÇO\*/);

  // Duplicata em menos de 24h trava o auto_publicar automático para não repetir post no grupo!
  const prepDup = L.prepararOferta(cls, [{ oferta_id: 'oAnt', produto_id: 'amz_B0ABCDEF12', status: 'aprovada', preco: 179.9, ts: AGORA - 3600000 }], cfgRapido);
  assert.equal(prepDup.ja_publicada_24h, true);
  const avDup = L.avaliarNovaOferta(prepDup, [], cfgRapido);
  assert.equal(avDup.auto_publicar, null);
  assert.match(avDup.chamadas[0].payload.text, /já publicado nas últimas 24h/);

  // Modo rápido SEM grupo_id: entrega automaticamente os textos prontos (Telegram + Grupo WhatsApp) em 0 cliques!
  const cfgSemGrupo = L.montarConfig([
    { chave: 'admins', valor: '111' },
    { chave: 'bot_token', valor: 'T' },
    { chave: 'webhook_secret', valor: 'segredo' },
    { chave: 'amazon.tag_padrao', valor: 'minhatag-20' },
  ].concat(mRap.upserts));
  const avSemG = L.avaliarNovaOferta(L.prepararOferta(cls, [], cfgSemGrupo), [], cfgSemGrupo);
  assert.ok(avSemG.auto_publicar);
  assert.equal(avSemG.auto_publicar.so_textos, true);
  const pubTxt = L.prepararPublicacao(avSemG.auto_publicar.oferta, avSemG.auto_publicar.linkItens, cfgSemGrupo, {
    ts: AGORA, chat_id: 111, message_id: 60, so_textos: true,
  });
  assert.equal(pubTxt.ok, true);
  assert.equal(pubTxt.update, null);
  assert.equal(pubTxt.chamadas.length, 3); // cabeçalho + post Telegram pronto + post Grupo WhatsApp com botão
});

test('workflows gerados: JSON válido, conexões íntegras e Code nodes compilam no sandbox sem globais do Node', () => {
  const pastas = [
    path.join(__dirname, '..', 'n8n', 'workflows'),
    path.join(__dirname, '..', 'servidor-local', 'workflows'),
  ];
  for (const dir of pastas) {
    const arqs = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    assert.ok(arqs.length >= 4, dir);
    for (const arq of arqs) {
      const wf = JSON.parse(fs.readFileSync(path.join(dir, arq), 'utf8'));
      const nomes = new Set(wf.nodes.map((n) => n.name));
      for (const [de, c] of Object.entries(wf.connections)) {
        assert.ok(nomes.has(de), `${arq}: conexão de nó inexistente ${de}`);
        for (const saida of c.main) {
          for (const dest of saida) assert.ok(nomes.has(dest.node), `${arq}: destino inexistente ${dest.node}`);
        }
      }
      for (const n of wf.nodes) {
        if (n.type === 'n8n-nodes-base.code') {
          // Compila a função JS dentro de um contexto sem URL, Buffer ou require externo
          assert.doesNotThrow(() => new vm.Script(`(function($input, $) {\n${n.parameters.jsCode}\n})`), `${arq} -> ${n.name}`);
        }
      }
    }
  }

  // Executa de ponta a ponta os Code nodes reais do 01-telegram-router.json num sandbox VM sem URL/Buffer/crypto!
  const router = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'n8n', 'workflows', '01-telegram-router.json'), 'utf8'));
  const resultados = {};
  const rodarNo = (nomeNo, entradaItens) => {
    const no = router.nodes.find((n) => n.name === nomeNo);
    assert.ok(no, 'Nó ausente: ' + nomeNo);
    const ctx = vm.createContext({
      Date, Math, JSON, Intl, Object, Array, String, Number, Boolean, RegExp, Set, Map, Error,
      parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
      $input: {
        all: () => entradaItens,
        first: () => entradaItens[0] || { json: {} },
      },
      $: (refNome) => ({
        isExecuted: refNome in resultados,
        all: () => resultados[refNome] || [],
        first: () => (resultados[refNome] && resultados[refNome][0]) || { json: {} },
      }),
    });
    const fn = vm.runInContext(`(function() {\n${no.parameters.jsCode}\n})`, ctx);
    const out = fn();
    resultados[nomeNo] = out;
    return out;
  };

  resultados['Webhook Telegram'] = [{
    json: {
      headers: HS,
      query: {},
      body: msgPriv('https://s.shopee.com.br/4AbCdEf'),
    },
  }];
  rodarNo('Config', [
    { json: { chave: 'admins', valor: '111' } },
    { json: { chave: 'bot_token', valor: 'TOK_ADM' } },
    { json: { chave: 'grupo_id', valor: '-1001234567890' } },
    { json: { chave: 'webhook_secret', valor: 'segredo' } },
    { json: { chave: 'auto.publicar_direto', valor: 'sim' } },
    { json: { chave: 'publicar.plataformas', valor: 'wag' } },
  ]);
  const lcOut = rodarNo('Link curto?', resultados['Config']);
  assert.equal(lcOut[0].json.curto, 'https://s.shopee.com.br/4AbCdEf');
  resultados['Abrir link curto'] = [{ json: { statusCode: 302, headers: { location: 'https://shopee.com.br/opaanlp/987/654321' }, body: '' } }];

  const clsOut = rodarNo('Classificar', resultados['Abrir link curto']);
  assert.equal(clsOut[0].json.rota, 'oferta');
  const prepOut = rodarNo('Preparar oferta', []);
  assert.ok(prepOut[0].json.pagina_http);
  const keepaOut = rodarNo('Juntar Keepa', prepOut);
  resultados['Ler página do produto'] = [{
    json: {
      statusCode: 200,
      // Formato real do HttpRequest v4.2 do n8n quando responseFormat='text' e fullResponse=true (.data sem .body)
      data: '<html><head><title>Cafeteira Elétrica Inox | Shopee Brasil</title><meta property="product:price:amount" content="149.90" /></head></html>',
    },
  }];
  const pagOut = rodarNo('Juntar página', keepaOut);
  assert.equal(pagOut[0].json.oferta.preco, 149.9);
  assert.equal(pagOut[0].json.oferta.categoria, 'casa');

  const avOut = rodarNo('Avaliar oferta', []);
  assert.ok(avOut[0].json.auto_publicar);
  const autoOut = rodarNo('Auto-publicar?', [{ json: { ok: true, result: { message_id: 77 } } }]);
  assert.equal(autoOut.length, 1);
  const planoOut = rodarNo('Plano de links', autoOut);
  const itensLinkOut = rodarNo('Itens de link', planoOut);
  const pubOut = rodarNo('Publicar', itensLinkOut);
  assert.equal(pubOut[0].json.ok, true);
  assert.ok(pubOut[0].json.chamadas.some((c) => c.bot === 'grupo' && c.payload.text.includes('s.shopee.com.br/4AbCdEf')));
  assert.ok(pubOut[0].json.chamadas.some((c) => c.bot === 'admin' && c.payload.text && c.payload.text.includes('ALERTA DE PREÇO')));
});

test('regressões: formato .data do n8n, múltiplos JSON-LD, ProductGroup, AggregateOffer, apóstrofos e canonical invertido', () => {
  // 1) Múltiplos blocos JSON-LD (1º é vitrine sem preço, 2º tem o preço real) + AggregateOffer com offers: []
  const htmlMultiLd = `<html><head>
    <script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Item Relacionado Sem Preco' })}</script>
    <script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: 'Smart TV 50" 4K Samsung QLED',
      image: 'https://img.example/tv50.jpg',
      offers: { '@type': 'AggregateOffer', lowPrice: 2199.9, highPrice: 2899.9, offers: [] },
    })}</script>
  </head></html>`;
  const rMulti = L.lerPaginaProduto({ statusCode: 200, data: htmlMultiLd }, 'https://www.magazineluiza.com.br/tv/p/123');
  assert.equal(rMulti.ok, true);
  assert.equal(rMulti.titulo, 'Smart TV 50" 4K Samsung QLED');
  assert.equal(rMulti.preco, 2199.9);
  assert.equal(rMulti.preco_de, 2899.9);

  // 2) Schema.org ProductGroup com hasVariant (VTEX / Shopify)
  const htmlGroup = `<html><head><script type="application/ld+json">${JSON.stringify({
    '@type': 'ProductGroup',
    name: "Kit L'Oréal Paris Elseve Óleo Extraordinário",
    image: 'https://img.example/elseve.jpg',
    hasVariant: [{ '@type': 'Product', offers: { price: '49.90', highPrice: '79.90' } }],
  })}</script></head></html>`;
  const rGroup = L.lerPaginaProduto({ statusCode: 200, data: htmlGroup }, 'https://www.boticario.com.br/kit/p');
  assert.equal(rGroup.titulo, "Kit L'Oréal Paris Elseve Óleo Extraordinário");
  assert.equal(rGroup.preco, 49.9);
  assert.equal(rGroup.preco_de, 79.9);

  // 3) Apóstrofo dentro de meta content="..." e <link href="..." rel="canonical"> invertido
  const htmlMeta = `<html><head>
    <link href="https://www.amazon.com.br/Monitor-Gamer/dp/B099988877" rel="canonical" />
    <meta property="og:title" content="Kit L'Oréal Paris 24' Especial" />
    <meta property="product:price:amount" content="89.90" />
  </head></html>`;
  const rMeta = L.lerPaginaProduto({ statusCode: 200, data: htmlMeta }, 'https://bit.ly/oferta1');
  assert.equal(rMeta.titulo, "Kit L'Oréal Paris 24' Especial");
  assert.equal(rMeta.preco, 89.9);
  assert.equal(rMeta.url_canonica, 'https://www.amazon.com.br/Monitor-Gamer/dp/B099988877');
  assert.equal(L.lerLocation({ statusCode: 200, headers: {}, data: htmlMeta }), 'https://www.amazon.com.br/Monitor-Gamer/dp/B099988877');
});

test('regressões: ML /gz/account-verification?go=, vitrine /social/, Shopee /loja/id, salto duplo e ruído de preço/título', () => {
  const cfg = cfgAuto();

  // 1) ML /gz/account-verification?go=... desembrulha URL real e nunca vira título "Account Verification"
  const goUrl = 'https://www.mercadolivre.com.br/gz/account-verification?go=' + encodeURIComponent('https://www.mercadolivre.com.br/fritadeira-eletrica-4l/p/MLB12345678');
  assert.equal(L.lerLocation({ statusCode: 302, headers: { location: goUrl } }), 'https://www.mercadolivre.com.br/fritadeira-eletrica-4l/p/MLB12345678');
  assert.equal(L.identificar(goUrl).produto_id, 'ml_MLB12345678');
  assert.equal(L.tituloDaUrl('https://www.mercadolivre.com.br/gz/account-verification'), '');
  assert.equal(L.tituloDaUrl('https://www.mercadolivre.com.br/social/thiago-ofertas?matt_tool=1'), '');

  // 2) Vitrine /social/ do Mercado Livre (poly-component__title + poly-price__current sem meta price)
  const htmlSocial = `<html><head><title>Lista de produtos | Mercado Livre</title></head><body>
    <h2 class="poly-component__title"><a href="https://www.mercadolivre.com.br/parafusadeira-12v/p/MLB87654321">Parafusadeira Sem Fio 12V Bivolt</a></h2>
    <div class="poly-price__current"><span class="andes-money-amount__fraction">159</span><span class="andes-money-amount__cents">90</span></div>
    <s class="andes-money-amount--previous"><span class="andes-money-amount__fraction">229</span><span class="andes-money-amount__cents">90</span></s>
  </body></html>`;
  const rSocial = L.lerPaginaProduto({ statusCode: 200, data: htmlSocial }, 'https://www.mercadolivre.com.br/social/thiago-ofertas');
  assert.equal(rSocial.titulo, 'Parafusadeira Sem Fio 12V Bivolt');
  assert.equal(rSocial.preco, 159.9);
  assert.equal(rSocial.preco_de, 229.9);
  assert.match(rSocial.url_canonica, /MLB87654321/);

  // 3) Shopee formato /vendedor/itemid + link curto não expandido no 1º salto (ou duplo salto bit.ly -> amzn.to)
  assert.equal(L.identificar('https://shopee.com.br/jbloficial/23891234567').produto_id, 'shp_jbloficial_23891234567');
  const clsCurto = L.classificarUpdate(
    msgPriv('Dê uma olhada em Fone JBL por R$ 199,90 na Shopee! https://s.shopee.com.br/falhou302'),
    HS, cfg, AGORA, {}, { curto: 'https://s.shopee.com.br/falhou302', expandido: '' },
  );
  assert.equal(clsCurto.rota, 'oferta');
  assert.equal(clsCurto.oferta.loja, 'shopee');
  assert.equal(clsCurto.oferta.preco, 199.9);
  assert.equal(clsCurto.oferta.links_manuais._afiliado, 'https://s.shopee.com.br/falhou302');

  // Duplo encurtamento: bit.ly -> amzn.to -> página Amazon resolve loja='amazon' e ASIN em juntarPagina
  const clsDuplo = L.classificarUpdate(
    msgPriv('https://bit.ly/ofertaDupla'),
    HS, cfg, AGORA, {},
    { curto: 'https://bit.ly/ofertaDupla', expandido: '', resp_curto: { statusCode: 301, headers: { location: 'https://amzn.to/3AbCdEf' } } },
  );
  assert.equal(clsDuplo.rota, 'oferta');
  const prepDuplo = L.prepararOferta(clsDuplo, [], cfg);
  const posDuplo = L.juntarPagina(prepDuplo, {
    statusCode: 200,
    data: '<html><head><link rel="canonical" href="https://www.amazon.com.br/Echo-Pop/dp/B09WNK39JN" /></head><body><span id="productTitle">Echo Pop com Alexa</span><span class="priceToPay"><span class="a-offscreen">R$ 219,00</span></span></body></html>',
  }, cfg);
  assert.equal(posDuplo.oferta.loja, 'amazon');
  assert.equal(posDuplo.oferta.produto_id, 'amz_B09WNK39JN');
  assert.equal(posDuplo.oferta.preco, 219);

  // 4) Preço unitário, R$ X OFF pós-valor, post reencaminhado com ~riscado~, falso cupom e URL de imagem ignorada
  const fralda = L.extrairDoTexto('🔥 Fralda Pampers Supersec G 80 tiras\n💰 R$ 79,90 (sai R$ 0,99 a tira!)\nAtive o cupom abaixo do preço\nhttps://amzn.to/fralda');
  assert.equal(fralda.preco, 79.9);
  assert.equal(fralda.preco_de, null);
  assert.equal(fralda.cupom, '');

  const offPos = L.extrairDoTexto('Fone Bluetooth JBL\nR$ 199,90 com R$ 30 OFF no checkout\nhttps://amzn.to/jbl');
  assert.equal(offPos.preco, 199.9);
  assert.equal(offPos.preco_de, null);

  const reenc = L.extrairDoTexto([
    '⚡ *ALERTA DE PREÇO* · 💻 Tech · #publi',
    '*🔥 PREÇO DESPENCOU! Olha essa oportunidade:*',
    '*Fone de Ouvido Sem Fio JBL Tune 520BT*',
    '💸 De ~R$ 299,90~ por:',
    '💰 *R$ 189,90* no Mercado Livre',
    'https://mercadolivre.com/sec/1AbCdEf',
  ].join('\n'));
  assert.equal(reenc.titulo, 'Fone de Ouvido Sem Fio JBL Tune 520BT');
  assert.equal(reenc.preco_de, 299.9);
  assert.equal(reenc.preco, 189.9);

  assert.deepEqual(L.extrairLinksProduto('img https://m.media-amazon.com/images/I/71echo.jpg https://i.imgur.com/foto.png https://www.kabum.com.br/produto/1/ssd'), ['https://www.kabum.com.br/produto/1/ssd']);

  // 5) comandoEdicao preserva link curto de afiliado (Shopee/Magalu/Amazon) usando /link quando não há ref90
  const cmdEd = L.comandoEdicao({
    categoria: 'casa', loja: 'shopee', url: 'https://shopee.com.br/product/1/2', titulo: 'Cafeteira Inox',
    preco: 149.9, imagem: '', links_manuais: { modo_link: true, preco_de: 199.9, cupom: 'CASA10', _afiliado: 'https://s.shopee.com.br/meuLink' },
  });
  assert.match(cmdEd, /^\/link casa\nhttps:\/\/s\.shopee\.com\.br\/meuLink\nCafeteira Inox\nde 199,9 por 149,9\ncupom CASA10$/);
});
