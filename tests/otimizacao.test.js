'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const L = require('../lib');
const B = require('../build/build-workflows');

test('Magalu: normaliza /p/<id>, /botdoafiliado/.../p/<id> e /divulgador/oferta/<id> para URL canônica limpa', () => {
  const casos = [
    ['https://www.magazineluiza.com.br/air-fryer-mondial/p/123456/', 'mgl_123456', 'https://www.magazineluiza.com.br/p/123456/'],
    ['https://www.magazinevoce.com.br/botdoafiliado/smart-tv-50/p/234567800/et/tv4k/?utm_source=terceiro', 'mgl_234567800', 'https://www.magazineluiza.com.br/p/234567800/'],
    ['https://www.magazineluiza.com.br/divulgador/oferta/AB12CD34/', 'mgl_ab12cd34', 'https://www.magazineluiza.com.br/p/ab12cd34/'],
    ['https://www.magazinevoce.com.br/divulgador/oferta/987654321?partner=abc', 'mgl_987654321', 'https://www.magazineluiza.com.br/p/987654321/'],
  ];
  for (const [url, pid, limpa] of casos) {
    const r = L.identificar(url);
    assert.equal(r.loja, 'magalu', url);
    assert.equal(r.produto_id, pid, url);
    assert.equal(r.url_limpa, limpa, url);
    assert.ok(!/botdoafiliado|divulgador|magazinevoce/i.test(r.url_limpa), url);
  }
});

test('Build otimizado: tree-shaking por nó, Fase 2 desconectada e saveDataSuccessExecution=none em 00 e 90', () => {
  const { local } = B.gerar();
  assert.equal(local['00-setup.json'].settings.saveDataSuccessExecution, 'none');
  assert.equal(local['90-tunel.json'].settings.saveDataSuccessExecution, 'none');

  // Nenhum Code node de runtime deve embutir módulos da Fase 2.
  const fase2 = ['"desconto":function', '"imagem":function', '"legenda":function', '"setup-canal":function'];
  for (const [arq, wf] of Object.entries(local)) {
    for (const n of wf.nodes) {
      if (n.type !== 'n8n-nodes-base.code') continue;
      for (const m of fase2) {
        assert.ok(!n.parameters.jsCode.includes(m), `${arq} / ${n.name} embutiu módulo da Fase 2 (${m})`);
      }
    }
  }

  // Tree-shaking efetivo: nó de túnel não deve carregar radar/extrator/fluxos.
  const noTunel = local['90-tunel.json'].nodes.find((n) => n.name === 'Linha da URL');
  assert.ok(noTunel);
  assert.ok(!noTunel.parameters.jsCode.includes('"radar":function'));
  assert.ok(!noTunel.parameters.jsCode.includes('"extrator":function'));
  assert.ok(!noTunel.parameters.jsCode.includes('"fluxos":function'));

  // Minificador preserva URLs com //, regexes e template literals.
  const amostra = `
    // comentário de linha
    const u = "https://www.magazineluiza.com.br/p/123456/";
    /* bloco */
    const rx = /\\/p\\/([a-z0-9]+)/i;
    const t = \`ok \${u.match(rx)[1]}\`;
    return t;
  `;
  const min = B.minificarJs(amostra);
  assert.ok(!min.includes('comentário de linha'));
  assert.ok(!min.includes('bloco'));
  assert.equal(new Function(min)(), 'ok 123456');
});

test('Enxugar fontes web: reduz HTML pesado preservando __NEXT_DATA__ (Promobit) e mensagens (t.me/s)', () => {
  const { local } = B.gerar();
  const wf = local['04-radar-ofertas.json'];
  const no = wf.nodes.find((n) => n.name === 'Enxugar fontes web');
  assert.ok(no, 'nó Enxugar fontes web deve existir em 04-radar-ofertas');

  const fontesWeb = [
    { tipo: 'promobit_loja', url: 'https://www.promobit.com.br/promocoes/loja/amazon/' },
    { tipo: 'telegram_canal', canal: 'xetdaspromocoes', url: 'https://t.me/s/xetdaspromocoes' },
    { tipo: 'gatry_home', url: 'https://gatry.com/' },
  ];
  const htmlPb = '<html><head>' + 'x'.repeat(50000) + '</head><body><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{}}}</script>' + 'y'.repeat(50000) + '</body></html>';
  const htmlTg = '<html><head><style>.a{color:red}</style></head><body><div class="tgme_widget_message_wrap"><div class="tgme_widget_message_text">Air Fryer R$ 299,90</div><script>alert(1)</script></div></body></html>';
  const htmlGt = '<html><head><title>Gatry</title></head><body><style>body{}</style><article>Produto R$ 99,90</article></body></html>';

  const ctx = {
    $: (nome) => {
      if (nome === 'Planejar') return { first: () => ({ json: { fontesWeb } }) };
      throw new Error('nó inesperado: ' + nome);
    },
    $input: {
      all: () => [
        { json: { statusCode: 200, body: htmlPb, headers: { 'set-cookie': 'gigante' } } },
        { json: { statusCode: 200, body: htmlTg } },
        { json: { statusCode: 200, body: htmlGt } },
      ],
    },
  };
  const fn = vm.runInNewContext(`(function($, $input){ ${no.parameters.jsCode} })`, {});
  const res = fn(ctx.$, ctx.$input);

  assert.equal(res.length, 3);
  assert.ok(res[0].json.body.includes('__NEXT_DATA__'));
  assert.ok(res[0].json.body.length < 500, 'Promobit deve manter apenas __NEXT_DATA__');
  assert.ok(!('headers' in res[0].json), 'headers pesados removidos');

  assert.ok(res[1].json.body.includes('Air Fryer R$ 299,90'));
  assert.ok(!res[1].json.body.includes('<style>'));
  assert.ok(!res[1].json.body.includes('<script>'));

  assert.ok(res[2].json.body.includes('Produto R$ 99,90'));
  assert.ok(!res[2].json.body.includes('<head>'));
  assert.ok(!res[2].json.body.includes('<style>'));
});

test('Relatório diário: telemetria por fonte e lembrete de compliance Amazon Associates', () => {
  const ts = Date.parse('2026-11-19T22:05:00-03:00');
  const cfgBase = L.montarConfig([
    { chave: 'bot_token', valor: '123:ABC' },
    { chave: 'admins', valor: '111' },
    { chave: 'amazon.tag_padrao', valor: '' },
    { chave: 'amazon.mostrar_preco', valor: 'sim' },
  ]);
  const ofertas = [
    { oferta_id: 'o1', ts, status: 'aprovada', selo: 'ok', loja: 'amazon', origem: 'radar', links_manuais: JSON.stringify({ fonte_radar: 'telegram_canal:xetdaspromocoes' }) },
    { oferta_id: 'o2', ts, status: 'aprovada', selo: 'ok', loja: 'ml', origem: 'radar', links_manuais: JSON.stringify({ fonte_radar: 'telegram_canal:xetdaspromocoes' }) },
    { oferta_id: 'o3', ts, status: 'falha', selo: 'ok', loja: 'shopee', origem: 'radar', links_manuais: JSON.stringify({ fonte_radar: 'promobit' }) },
  ];
  const rSemTag = L.relatorioDiario({ posts: [], links: [], ofertas, entradas: [], alertas: [] }, cfgBase, ts);
  const txtSemTag = rSemTag.chamadas[0].payload.text;
  assert.match(txtSemTag, /Telemetria por fonte hoje:/);
  assert.match(txtSemTag, /telegram_canal:xetdaspromocoes: 2 \(2 aprov · 100%\)/);
  assert.match(txtSemTag, /promobit: 1 \(0 aprov · 0% · 1 falha\)/);
  assert.doesNotMatch(txtSemTag, /Compliance Amazon Associates/);

  const cfgComTag = L.montarConfig([
    { chave: 'bot_token', valor: '123:ABC' },
    { chave: 'admins', valor: '111' },
    { chave: 'amazon.tag_padrao', valor: 'meu-20' },
    { chave: 'amazon.mostrar_preco', valor: 'sim' },
  ]);
  const txtComTag = L.relatorioDiario({ posts: [], links: [], ofertas, entradas: [], alertas: [] }, cfgComTag, ts).chamadas[0].payload.text;
  assert.match(txtComTag, /Compliance Amazon Associates/);

  const cfgCompliant = L.montarConfig([
    { chave: 'bot_token', valor: '123:ABC' },
    { chave: 'admins', valor: '111' },
    { chave: 'amazon.tag_padrao', valor: 'meu-20' },
    { chave: 'amazon.mostrar_preco', valor: 'nao' },
  ]);
  const txtCompliant = L.relatorioDiario({ posts: [], links: [], ofertas, entradas: [], alertas: [] }, cfgCompliant, ts).chamadas[0].payload.text;
  assert.doesNotMatch(txtCompliant, /Compliance Amazon Associates/);
});
