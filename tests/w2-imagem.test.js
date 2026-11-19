'use strict';
// lib/imagem.js: funções puras (sem sharp, sem rede). Dados são fixtures de teste.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const m = require('../lib/imagem');

const FOTO = 'data:image/jpeg;base64,/9j/AAAA'; // fixture: data URI sintaticamente válido

function fontes(svg) {
  return [...svg.matchAll(/font-size="(\d+(?:\.\d+)?)"/g)].map((x) => Number(x[1]));
}
function textos(svg) {
  return [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((x) => x[1]);
}

test('mapeamento categoria interna -> template (Q-14/Q-17)', () => {
  const t = (c, tit) => m.templateDaCategoria(c, tit);
  assert.equal(t('tech', 'Console PlayStation 5 Slim').template, 'games');
  assert.equal(t('tech', 'Headset Gamer HyperX').template, 'games');
  assert.equal(t('tech', 'Controle Xbox Series sem fio').template, 'games');
  assert.equal(t('tech', 'Smartphone Samsung Galaxy A55').template, 'eletronicos');
  assert.equal(t('tech', 'SSD NVMe 1TB').template, 'eletronicos');
  assert.equal(t('perfumes', 'Lattafa Asad 100ml').template, 'beleza');
  assert.equal(t('beleza', 'Sérum Principia').template, 'beleza');
  assert.equal(t('casa', 'Air Fryer 4L').template, 'casa');
  assert.equal(t('moda', 'Tênis Nike').template, 'moda');
  for (const c of ['saude', 'bebe', 'Saúde', 'Bebê']) {
    const r = t(c, 'Qualquer coisa');
    assert.equal(r.template, 'neutro');
    assert.equal(r.sensivel, true);
  }
  // Palavra sensível em categoria comum também vai para neutro + revisão.
  assert.deepEqual(t('tech', 'Seguro para celular'), { template: 'neutro', sensivel: true, motivo: 'palavra_sensivel' });
  assert.equal(t('top', 'Fralda Pampers G').sensivel, true);
  assert.equal(t('top', 'Cartão de crédito sem anuidade').sensivel, true);
  // top / sem categoria: por palavra-chave, senão neutro não sensível.
  assert.equal(t('top', 'Air Fryer Mondial').template, 'casa');
  assert.equal(t('top', 'Nintendo Switch OLED').template, 'games');
  assert.equal(t('top', 'Perfume Sauvage').template, 'beleza');
  assert.deepEqual(t('', 'Coisa genérica'), { template: 'neutro', sensivel: false, motivo: 'sem_categoria' });
  assert.equal(t(null, null).template, 'neutro');
});

test('usarFotoProduto: padrão sim; nao/false desligam', () => {
  for (const v of [undefined, null, 'sim', true, 'SIM', 1, 'qualquer']) assert.equal(m.usarFotoProduto(v), true, String(v));
  for (const v of ['nao', 'não', 'NAO', false, 0, '0', 'false', 'off']) assert.equal(m.usarFotoProduto(v), false, String(v));
});

test('escape XML e limpeza do título', () => {
  assert.equal(m.escXmlImagem(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;');
  assert.equal(m.escXmlImagem('a\u0000b\u0007c'), 'abc');
  assert.equal(m.limparTituloArte('  Fone 🔥🔥 JBL\n\tTune  '), 'Fone JBL Tune');
  const r = m.svgOferta({ usar_foto: 'nao', oferta: { titulo: '<script>alert(1)</script> & "x"', preco: 10 } });
  assert.ok(!r.svg.includes('<script>'));
  assert.ok(r.svg.includes('&lt;script&gt;'));
  assert.ok(r.svg.includes('&amp;'));
});

test('foto: só data URI de imagem é embutida; URL externa nunca entra no SVG', () => {
  assert.equal(m.fotoArteValida(FOTO), FOTO);
  assert.equal(m.fotoArteValida('https://http2.mlstatic.com/x.jpg'), null);
  assert.equal(m.fotoArteValida('file:///etc/passwd'), null);
  assert.equal(m.fotoArteValida('data:image/svg+xml;base64,AAAA'), null);
  assert.throws(() => m.svgOferta({ oferta: { titulo: 'X', preco: 10, foto: 'https://evil/x.jpg' } }), (e) => e.codigo === 'foto_ausente');
  const r = m.svgOferta({ oferta: { titulo: 'X', preco: 10, foto: FOTO } });
  assert.ok(r.svg.includes(`href="${FOTO}"`));
  assert.ok(!/href="(?!data:)/.test(r.svg));
});

for (const tpl of Object.keys(m.TEMPLATES_IMAGEM)) {
  test(`template ${tpl}: 1080x1080, fonte >= 32, preço e desconto maiores, <= 3 informações`, () => {
    for (const usar of ['sim', 'nao']) {
      const r = m.svgOferta({
        template: tpl === 'neutro' ? undefined : tpl,
        usar_foto: usar,
        oferta: { titulo: 'Produto de teste com um nome bem comprido para quebrar em duas linhas no mínimo', preco: 1299.9, desconto_pct: 37, categoria: tpl === 'neutro' ? 'saude' : '', foto: FOTO },
      });
      assert.equal(r.template, tpl);
      assert.equal(r.largura, 1080);
      assert.equal(r.altura, 1080);
      assert.match(r.svg, /^<svg [^>]*width="1080" height="1080" viewBox="0 0 1080 1080"/);
      const fs = fontes(r.svg);
      assert.ok(fs.length > 0 && fs.every((f) => f >= m.FONTE_MIN_ARTE), 'fontes: ' + fs);
      assert.ok(r.fontes.preco > r.fontes.titulo, 'preço maior que título');
      assert.ok(r.fontes.desconto > r.fontes.titulo, 'desconto maior que título');
      assert.ok(r.fontes.preco >= r.fontes.desconto, 'preço é o maior');
      assert.ok(r.informacoes.length <= 3);
      const tx = textos(r.svg);
      assert.ok(tx.includes('R$ 1.299,90'));
      assert.ok(tx.includes('-37%'));
      // título em até 2 linhas + preço + selo = no máximo 4 elementos de texto (3 informações)
      assert.ok(tx.length <= 4, 'textos: ' + tx.length);
      assert.equal(r.com_foto, usar === 'sim');
      assert.equal(r.svg.includes('<image'), usar === 'sim');
    }
  });
}

test('sem desconto válido: sem selo (nada inventado)', () => {
  for (const d of [undefined, null, '', 0, 0.2, 96, 150, 'abc', -10]) {
    const r = m.svgOferta({ usar_foto: 'nao', oferta: { titulo: 'X', preco: 10, desconto_pct: d } });
    assert.ok(!textos(r.svg).some((t) => t.endsWith('%')), 'desconto ' + d);
    assert.deepEqual(r.informacoes, ['produto', 'preco']);
  }
  assert.equal(m.descontoArte('35'), 35);
  assert.equal(m.descontoArte(34.6), 35);
});

test('preço: aceita número e texto BR; rejeita inválido', () => {
  const p = (v) => textos(m.svgOferta({ usar_foto: 'nao', oferta: { titulo: 'X', preco: v } }).svg).find((t) => t.startsWith('R$'));
  assert.equal(p(1299.9), 'R$ 1.299,90');
  assert.equal(p('R$ 1.299,90'), 'R$ 1.299,90');
  assert.equal(p('349,90'), 'R$ 349,90');
  assert.equal(p('349.90'), 'R$ 349,90');
  assert.equal(p(12345.67), 'R$ 12.345,67');
  for (const v of [0, -1, null, '', 'abc', NaN]) {
    assert.throws(() => m.svgOferta({ usar_foto: 'nao', oferta: { titulo: 'X', preco: v } }), (e) => e.codigo === 'preco_invalido');
  }
  assert.throws(() => m.svgOferta({ usar_foto: 'nao', oferta: { titulo: '  ', preco: 1 } }), (e) => e.codigo === 'titulo_ausente');
});

test('título longo: até 2 linhas, cabe na largura, nunca abaixo de 32 px', () => {
  const longo = 'Palavra '.repeat(60);
  const q = m.quebrarTituloArte(longo, 900, 2, 44, 34);
  assert.equal(q.linhas.length, 2);
  assert.ok(q.px >= 34);
  assert.ok(q.linhas.every((l) => m.larguraTextoArte(l, q.px) <= 900));
  assert.ok(q.linhas[1].endsWith('…'));
  const curto = m.quebrarTituloArte('Fone JBL', 900, 2, 44, 34);
  assert.deepEqual(curto, { linhas: ['Fone JBL'], px: 44 });
  const gigante = m.quebrarTituloArte('A'.repeat(200), 300, 1, 40, 32);
  assert.ok(m.larguraTextoArte(gigante.linhas[0], gigante.px) <= 300);
});

test('template explícito inválido -> erro; sensível ignora template explícito', () => {
  assert.throws(() => m.svgOferta({ template: 'xpto', usar_foto: 'nao', oferta: { titulo: 'X', preco: 1 } }), (e) => e.codigo === 'template_invalido');
  const r = m.svgOferta({ template: 'casa', usar_foto: 'nao', oferta: { titulo: 'Whey Protein 900g', preco: 99, categoria: 'casa' } });
  assert.equal(r.template, 'neutro');
  assert.equal(r.sensivel, true);
  assert.equal(m.svgOferta({ template: 'Games', usar_foto: 'nao', oferta: { titulo: 'X', preco: 1 } }).template, 'games');
});

test('grade: layouts 1, 2x1, 2x2, 3x2 e limites', () => {
  assert.equal(m.layoutGradeArte(1).nome, '1');
  assert.equal(m.layoutGradeArte(2).nome, '2x1');
  assert.equal(m.layoutGradeArte(3).nome, '2x2');
  assert.equal(m.layoutGradeArte(4).nome, '2x2');
  assert.equal(m.layoutGradeArte(5).nome, '3x2');
  assert.equal(m.layoutGradeArte(6).nome, '3x2');
  for (const n of [0, 7, 1.5, 'x']) assert.throws(() => m.layoutGradeArte(n), (e) => e.codigo === 'itens_invalidos');
  for (let n = 1; n <= 6; n++) {
    const { celulas } = m.celulasGradeArte(n);
    assert.equal(celulas.length, n);
    for (const c of celulas) {
      assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= 1080 + 1e-9 && c.y + c.h <= 1080 + 1e-9);
    }
    // sem sobreposição
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = celulas[i];
      const b = celulas[j];
      assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
    }
  }
});

test('lista: preço por quadro, fonte >= 32, preço maior que título, mesma fonte em todos', () => {
  for (let n = 1; n <= 6; n++) {
    const itens = Array.from({ length: n }, (_, i) => ({ titulo: 'Item de teste ' + i, preco: 10 + i * 1000, desconto_pct: i % 2 ? 20 : null, foto: FOTO }));
    for (const usar of ['sim', 'nao']) {
      const r = m.svgLista({ template: 'moda', itens, usar_foto: usar });
      assert.equal(r.largura, 1080);
      assert.equal(r.layout, 'grade-' + m.layoutGradeArte(n).nome);
      assert.ok(fontes(r.svg).every((f) => f >= 32));
      assert.equal(new Set(r.fontes.map((f) => f.preco)).size, 1);
      r.fontes.forEach((f) => assert.ok(f.preco > f.titulo));
      assert.equal(textos(r.svg).filter((t) => t.startsWith('R$')).length, n);
      assert.equal((r.svg.match(/<image /g) || []).length, usar === 'sim' ? n : 0);
    }
  }
  assert.throws(() => m.svgLista({ itens: [{ titulo: 'a', preco: 1 }] }), (e) => e.codigo === 'foto_ausente');
  assert.throws(() => m.svgLista({ itens: 'x' }), (e) => e.codigo === 'itens_invalidos');
});

test('lista com item sensível vira neutro + sensível', () => {
  const r = m.svgLista({ template: 'casa', usar_foto: 'nao', itens: [{ titulo: 'Air Fryer', preco: 300 }, { titulo: 'Fralda Huggies', preco: 80 }] });
  assert.equal(r.template, 'neutro');
  assert.equal(r.sensivel, true);
});

test('montarArte despacha e valida; slotsFotoArte', () => {
  assert.equal(m.montarArte({ usar_foto: 'nao', oferta: { titulo: 'X', preco: 1 } }).layout, 'unico');
  assert.equal(m.montarArte({ usar_foto: 'nao', itens: [{ titulo: 'X', preco: 1 }, { titulo: 'Y', preco: 2 }] }).layout, 'grade-2x1');
  assert.throws(() => m.montarArte({}), (e) => e.codigo === 'entrada_invalida');
  assert.throws(() => m.montarArte({ oferta: {}, itens: [] }), (e) => e.codigo === 'entrada_invalida');
  assert.deepEqual(m.slotsFotoArte({ oferta: {} }), [{ w: 732, h: 592 }]);
  assert.equal(m.slotsFotoArte({ itens: [{}, {}, {}] }).length, 3);
  // P1-12: área da foto do post único fica em ~700-800 px
  const [s] = m.slotsFotoArte({ oferta: {} });
  assert.ok(s.w >= 700 && s.w <= 800);
});

test('paleta: contraste WCAG >= 4,5 para todo texto', () => {
  for (const [nome, p] of Object.entries(m.TEMPLATES_IMAGEM)) {
    assert.ok(m.contrasteCores(p.texto, p.fundo) >= 4.5, nome + ' título/fundo');
    assert.ok(m.contrasteCores(p.texto, p.fundo2) >= 4.5, nome + ' título/fundo2');
    assert.ok(m.contrasteCores(p.precoTexto, p.precoFundo) >= 4.5, nome + ' preço');
    assert.ok(m.contrasteCores(p.seloTexto, p.selo) >= 4.5, nome + ' selo');
    assert.ok(m.contrasteCores('#333333', '#FFFFFF') >= 4.5);
  }
});

test('lib/imagem.js continua embutível no n8n: sem require de pacote e sem I/O', () => {
  const src = require('fs').readFileSync(require.resolve('../lib/imagem'), 'utf8');
  assert.ok(!/require\(/.test(src), 'não deve ter require');
  assert.ok(!/\b(process\.|fetch\(|setTimeout\()/.test(src));
  assert.ok(src.startsWith("'use strict';\n"));
});
