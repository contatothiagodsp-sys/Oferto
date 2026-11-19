'use strict';
// Testes do serviço render (usam sharp). Nada de rede externa: o download é injetado.
// Amostras JPEG de cada template vão para RENDER_AMOSTRAS (padrão: diretório temporário do SO).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { criarServidor } = require('../server');
const { baixarFoto, hostPermitido, validarUrlFoto, hostsPermitidos } = require('../baixar');

const AMOSTRAS = process.env.RENDER_AMOSTRAS || fs.mkdtempSync(path.join(os.tmpdir(), 'oferto-render-'));
const FOTOS = {}; // url -> Buffer (fixtures de teste)
let servidor;
let base;

async function fotoFixture(w, h, cor) {
  return sharp({ create: { width: w, height: h, channels: 3, background: cor } })
    .composite([{ input: Buffer.from(`<svg width="${w}" height="${h}"><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 3}" fill="#222"/></svg>`) }])
    .jpeg().toBuffer();
}

before(async () => {
  FOTOS['https://http2.mlstatic.com/D_ok.jpg'] = await fotoFixture(900, 900, '#e63946');
  FOTOS['https://m.media-amazon.com/images/I/largo.jpg'] = await fotoFixture(1500, 700, '#2a9d8f');
  FOTOS['https://down-br.img.susercontent.com/file/alto.jpg'] = await fotoFixture(650, 1200, '#f4a261');
  FOTOS['https://http2.mlstatic.com/D_500.jpg'] = await fotoFixture(500, 500, '#999999');
  FOTOS['https://http2.mlstatic.com/D_quebrada.jpg'] = Buffer.from('isto não é imagem');
  servidor = criarServidor({
    log: () => {},
    cfg: { maxCorpo: 4096 },
    baixar: async (url) => {
      validarUrlFoto(url, hostsPermitidos()); // mesma allowlist do download real
      if (!FOTOS[url]) throw Object.assign(new Error('404'), { codigo: 'foto_indisponivel', status: 422, name: 'ErroRender' });
      return FOTOS[url];
    },
  });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + servidor.address().port;
});

after(() => new Promise((r) => servidor.close(r)));

async function post(corpo, extra) {
  return fetch(base + '/render', { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo), ...(extra || {}) });
}

async function jpegOk(res, nome) {
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(res.headers.get('content-type'), 'image/jpeg');
  const buf = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(buf).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.equal(meta.width, 1080);
  assert.equal(meta.height, 1080);
  fs.writeFileSync(path.join(AMOSTRAS, nome + '.jpg'), buf); // amostra (só no teste)
  return { buf, res };
}

const OFERTAS = {
  eletronicos: { titulo: 'Fone Bluetooth JBL Tune 520BT Original', preco: 199.9, desconto_pct: 33, categoria: 'tech' },
  games: { titulo: 'Controle DualSense PS5 Branco', preco: 349.9, desconto_pct: 22, categoria: 'tech' },
  casa: { titulo: 'Air Fryer Mondial 4L Family Inox', preco: 279.9, desconto_pct: 40, categoria: 'casa' },
  moda: { titulo: 'Tênis Nike Revolution 7 Masculino', preco: 249.99, desconto_pct: 30, categoria: 'moda' },
  beleza: { titulo: 'Perfume Lattafa Asad Eau de Parfum 100ml', preco: 189, desconto_pct: 18, categoria: 'perfumes' },
  neutro: { titulo: 'Creatina Monohidratada 300g', preco: 89.9, categoria: 'saude' },
};

test('GET /health', async () => {
  const r = await fetch(base + '/health');
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.sharp, '0.34.5');
});

for (const [tpl, oferta] of Object.entries(OFERTAS)) {
  test(`template ${tpl} sem foto (ícone) -> JPEG 1080x1080`, async () => {
    const { res } = await jpegOk(await post({ oferta, usar_foto: 'nao' }), `oferta-${tpl}-icone`);
    assert.equal(res.headers.get('x-oferto-template'), tpl);
    assert.equal(res.headers.get('x-oferto-sensivel'), tpl === 'neutro' ? '1' : '0');
    assert.equal(res.headers.get('x-oferto-com-foto'), '0');
  });
  test(`template ${tpl} com foto -> JPEG 1080x1080`, async () => {
    const { res } = await jpegOk(await post({ oferta: { ...oferta, imagem: 'https://http2.mlstatic.com/D_ok.jpg' } }), `oferta-${tpl}-foto`);
    assert.equal(res.headers.get('x-oferto-com-foto'), '1');
  });
}

test('foto larga e foto alta (orientações diferentes)', async () => {
  await jpegOk(await post({ oferta: { ...OFERTAS.eletronicos, imagem: 'https://m.media-amazon.com/images/I/largo.jpg' } }), 'oferta-foto-larga');
  await jpegOk(await post({ oferta: { ...OFERTAS.moda, imagem: 'https://down-br.img.susercontent.com/file/alto.jpg' } }), 'oferta-foto-alta');
});

for (const n of [1, 2, 3, 4, 5, 6]) {
  test(`grade com ${n} item(ns)`, async () => {
    const urls = ['https://http2.mlstatic.com/D_ok.jpg', 'https://m.media-amazon.com/images/I/largo.jpg', 'https://down-br.img.susercontent.com/file/alto.jpg'];
    const itens = Array.from({ length: n }, (_, i) => ({ titulo: 'Produto de teste número ' + (i + 1), preco: 99.9 + i * 100, desconto_pct: i % 2 ? 15 + i : null, imagem: urls[i % 3] }));
    const { res } = await jpegOk(await post({ template: 'casa', itens }), `lista-${n}-foto`);
    assert.match(res.headers.get('x-oferto-layout'), /^grade-/);
    await jpegOk(await post({ template: 'games', itens, usar_foto: false }), `lista-${n}-icone`);
  });
}

test('foto abaixo de 600 px no lado menor -> 422 foto_pequena (revisão)', async () => {
  const r = await post({ oferta: { ...OFERTAS.casa, imagem: 'https://http2.mlstatic.com/D_500.jpg' } });
  assert.equal(r.status, 422);
  const j = await r.json();
  assert.equal(j.erro, 'foto_pequena');
  assert.equal(j.revisao, true);
});

test('host fora da allowlist -> 422 host_nao_permitido', async () => {
  for (const url of ['https://evil.example.com/a.jpg', 'https://169.254.169.254/latest', 'https://mlstatic.com.evil.io/a.jpg']) {
    const r = await post({ oferta: { ...OFERTAS.casa, imagem: url } });
    assert.equal(r.status, 422);
    assert.equal((await r.json()).erro, 'host_nao_permitido');
  }
});

test('http (sem TLS) é recusado', async () => {
  const r = await post({ oferta: { ...OFERTAS.casa, imagem: 'http://http2.mlstatic.com/D_ok.jpg' } });
  assert.equal(r.status, 422);
  assert.equal((await r.json()).erro, 'url_invalida');
});

test('foto corrompida -> 422 foto_invalida; sem imagem com usar_foto -> 422 foto_ausente', async () => {
  let r = await post({ oferta: { ...OFERTAS.casa, imagem: 'https://http2.mlstatic.com/D_quebrada.jpg' } });
  assert.equal(r.status, 422);
  assert.equal((await r.json()).erro, 'foto_invalida');
  r = await post({ oferta: { ...OFERTAS.casa } });
  assert.equal(r.status, 422);
  assert.equal((await r.json()).erro, 'foto_ausente');
});

test('foto embutida vinda de fora é ignorada (só o render embute)', async () => {
  const r = await post({ oferta: { ...OFERTAS.casa, foto: 'data:image/jpeg;base64,AAAA' } });
  assert.equal(r.status, 422);
  assert.equal((await r.json()).erro, 'foto_ausente');
});

test('entradas inválidas -> 400/413/415/404/405', async () => {
  assert.equal((await post('{nao json')).status, 400);
  assert.equal((await post({ oferta: { titulo: 'x', preco: 0 }, usar_foto: 'nao' })).status, 400);
  assert.equal((await post({ oferta: { titulo: '', preco: 10 }, usar_foto: 'nao' })).status, 400);
  assert.equal((await post({ template: 'xpto', oferta: OFERTAS.casa, usar_foto: 'nao' })).status, 400);
  assert.equal((await post({ itens: [], usar_foto: 'nao' })).status, 400);
  assert.equal((await post({ itens: Array(7).fill(OFERTAS.casa), usar_foto: 'nao' })).status, 400);
  assert.equal((await post({})).status, 400);
  assert.equal((await post({ oferta: { ...OFERTAS.casa, titulo: 'x'.repeat(5000) }, usar_foto: 'nao' })).status, 413);
  assert.equal((await fetch(base + '/render', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' })).status, 415);
  assert.equal((await fetch(base + '/render')).status, 405);
  assert.equal((await fetch(base + '/outra')).status, 404);
});

test('texto com XML malicioso é escapado e renderiza', async () => {
  await jpegOk(await post({ oferta: { titulo: '<script>&"\'</svg><image href="file:///etc/passwd"/>', preco: 10, categoria: 'moda' }, usar_foto: 'nao' }), 'oferta-xml-escapado');
});

/* ---------- download (fetch injetado, sem rede) ---------- */

function respostaFalsa(status, headers, corpo) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k) => headers[k.toLowerCase()] || null },
    body: corpo == null ? null : new Blob([corpo]).stream(),
    arrayBuffer: async () => (corpo == null ? new ArrayBuffer(0) : new Uint8Array(corpo).buffer),
  };
}

test('allowlist: domínios e subdomínios corretos', () => {
  assert.ok(hostPermitido('http2.mlstatic.com'));
  assert.ok(hostPermitido('m.media-amazon.com'));
  assert.ok(hostPermitido('down-br.img.susercontent.com'));
  assert.ok(hostPermitido('a-static.mlcdn.com.br'));
  assert.ok(!hostPermitido('mlstatic.com.evil.io'));
  assert.ok(!hostPermitido('evilmlstatic.com'));
  assert.ok(!hostPermitido('127.0.0.1'));
  assert.ok(!hostPermitido('localhost'));
  assert.ok(hostPermitido('img.exemplo.com', hostsPermitidos('exemplo.com')));
});

test('baixarFoto: ok, redirect revalidado, limite de bytes, tipo e timeout', async () => {
  const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).png().toBuffer();
  let r = await baixarFoto('https://http2.mlstatic.com/a.png', { fetchImpl: async () => respostaFalsa(200, { 'content-type': 'image/png' }, png) });
  assert.equal(r.buffer.length, png.length);

  await assert.rejects(
    baixarFoto('https://http2.mlstatic.com/a.png', { fetchImpl: async () => respostaFalsa(302, { location: 'https://169.254.169.254/x' }) }),
    (e) => e.codigo === 'host_nao_permitido',
  );
  let chamadas = 0;
  r = await baixarFoto('https://http2.mlstatic.com/a.png', {
    fetchImpl: async () => (chamadas++ === 0 ? respostaFalsa(301, { location: '/b.png' }) : respostaFalsa(200, { 'content-type': 'image/png' }, png)),
  });
  assert.equal(r.url, 'https://http2.mlstatic.com/b.png');

  await assert.rejects(
    baixarFoto('https://http2.mlstatic.com/a.png', { maxBytes: 5, fetchImpl: async () => respostaFalsa(200, { 'content-type': 'image/png' }, png) }),
    (e) => e.codigo === 'foto_grande_demais',
  );
  await assert.rejects(
    baixarFoto('https://http2.mlstatic.com/a.png', { maxBytes: 5, fetchImpl: async () => respostaFalsa(200, { 'content-type': 'image/png', 'content-length': '999' }, png) }),
    (e) => e.codigo === 'foto_grande_demais',
  );
  await assert.rejects(
    baixarFoto('https://http2.mlstatic.com/a.svg', { fetchImpl: async () => respostaFalsa(200, { 'content-type': 'image/svg+xml' }, png) }),
    (e) => e.codigo === 'foto_tipo_invalido',
  );
  await assert.rejects(
    baixarFoto('https://http2.mlstatic.com/a.png', { fetchImpl: async () => respostaFalsa(404, {}, null) }),
    (e) => e.codigo === 'foto_indisponivel',
  );
  await assert.rejects(
    baixarFoto('https://http2.mlstatic.com/a.png', {
      timeoutMs: 30,
      fetchImpl: (u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(Object.assign(new Error('abort'), { name: 'AbortError' })))),
    }),
    (e) => e.codigo === 'foto_timeout',
  );
});

test('amostras geradas', () => {
  const arquivos = fs.readdirSync(AMOSTRAS).filter((f) => f.endsWith('.jpg'));
  assert.ok(arquivos.length >= 25, 'amostras: ' + arquivos.length);
  console.log('# amostras em ' + AMOSTRAS);
});
