'use strict';
// Testes de lib/legenda.js (P3-01, P3-02, P3-03, P3-04, P3-07).
// FIXTURES DE TESTE: produtos, preços, cupons e links abaixo são fictícios, só para exercitar o formato.
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../lib/legenda');

const LINKS = {
  amazon: 'https://amzn.to/3Exemplo',
  ml: 'https://mercadolivre.com/sec/1Exemplo',
  shopee: 'https://s.shopee.com.br/Exemplo1',
  kabum: 'https://www.kabum.com.br/produto/123',
  cea: 'https://www.cea.com.br/p/123',
  outra: 'https://loja.exemplo.com/p/1',
};

const NOMES = [
  'Mouse',
  'Fone Bluetooth com Cancelamento de Ruído',
  'Smart TV 55" 4K UHD LED com Wi-Fi, Bluetooth, HDR10, Comando de Voz e 3 HDMI — Modelo 2026 Edição Especial Black',
  'Kit 3 Panelas 🍳 Antiaderentes & Tampa de Vidro <Promo> com Cabo Soft Touch e Indução 🔥🔥🔥',
  '😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀 Caneca Térmica 👨‍👩‍👧‍👦 Inox 500 ml 🇧🇷 Com Tampa Ⓜ️ Muito Muito Muito Longa',
  '𝐓𝐞𝐧𝐢𝐬 𝐄𝐬𝐩𝐨𝐫𝐭𝐢𝐯𝐨 𝐂𝐨𝐫𝐫𝐢𝐝𝐚 𝐌𝐚𝐬𝐜𝐮𝐥𝐢𝐧𝐨 𝐋𝐞𝐯𝐞 𝐑𝐞𝐬𝐩𝐢𝐫á𝐯𝐞𝐥 𝐏𝐫𝐞𝐭𝐨 𝐁𝐫𝐚𝐧𝐜𝐨',
];
const CUPONS = [undefined, '', 'OFF10', 'CUPOMSUPERLONGO2026XYZABCDEFG', 'A&B<1>'];
const FRETES = [{ frete_cents: 0 }, { frete_cents: 1990 }, { frete_cents: 1290, frete_conhecido: true }, { frete_gratis: true }];

function semSubstitutoSolto(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (!(d >= 0xdc00 && d <= 0xdfff)) return false;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}

test('legendaCurta: toda combinação de loja × nome × cupom × frete cabe em 200 (UTF-16) e ≤2 emojis', () => {
  let n = 0;
  for (const loja of Object.keys(LINKS)) {
    for (const titulo of NOMES) {
      for (const cupom of CUPONS) {
        for (const f of FRETES) {
          for (const cfg of [{}, { amazon: { mostrar_preco: false } }]) {
            const r = G.legendaCurta({ titulo, loja, preco_cents: 123456, cupom, ...f }, LINKS[loja], cfg);
            assert.equal(r.ok, true, `${loja} ${titulo} ${cupom}: ${r.motivo}`);
            assert.ok(r.texto.length <= 200, `${r.texto.length} > 200: ${r.texto}`);
            assert.equal(r.comprimento, r.texto.length);
            assert.equal(G.textoVisivel(r.html), r.texto, 'texto visível do HTML = texto contado');
            assert.ok(G.contarEmojis(r.texto) <= 2);
            assert.ok(G.contarEmojis(r.html) <= 2);
            assert.ok(semSubstitutoSolto(r.texto) && semSubstitutoSolto(r.html), 'par substituto partido');
            assert.ok(r.texto.startsWith('🔥 '));
            assert.match(r.texto, /#publi · link de afiliado/);
            assert.equal(/Associado Amazon/.test(r.texto), loja === 'amazon');
            assert.equal(G.contemTermoProibido(r.texto), false);
            n++;
          }
        }
      }
    }
  }
  assert.ok(n > 1000);
});

test('legendaCurta: formato das linhas, preço com frete e HTML escapado', () => {
  const r = G.legendaCurta({ titulo: 'Panela <Inox> & Tampa', loja: 'cea', preco_cents: 5000, frete_cents: 1290, cupom: 'A&B' }, 'https://www.cea.com.br/p/1?x=1&y=2', {});
  assert.equal(r.ok, true);
  const linhas = r.texto.split('\n');
  assert.equal(linhas[0], '🔥 Panela <Inox> & Tampa — R$ 62,90 c/ frete');
  assert.equal(linhas[1], 'C&A · cupom A&B');
  assert.equal(linhas[2], 'cea.com.br/p/1?x=1&y=2');
  assert.equal(linhas[3], '#publi · link de afiliado');
  assert.equal(linhas.length, 4);
  assert.match(r.html, /<b>Panela &lt;Inox&gt; &amp; Tampa<\/b>/);
  assert.match(r.html, /C&amp;A · cupom <code>A&amp;B<\/code>/);
  assert.match(r.html, /<a href="https:\/\/www\.cea\.com\.br\/p\/1\?x=1&amp;y=2">cea\.com\.br\/p\/1\?x=1&amp;y=2<\/a>/);
  assert.equal(r.cortado, false);
});

test('legendaCurta: frete grátis, preco_cents + frete e preco_final_cents (já com frete, P2-08)', () => {
  assert.match(G.legendaCurta({ titulo: 'Mouse sem fio', loja: 'ml', preco_cents: 9990, frete_cents: 0 }, LINKS.ml).texto, /R\$ 99,90 c\/ frete grátis/);
  assert.match(G.legendaCurta({ titulo: 'Mouse sem fio', loja: 'ml', preco_cents: 9990, frete_cents: 1000 }, LINKS.ml).texto, /R\$ 109,90 c\/ frete$/m);
  // preco_final_cents já inclui o frete: não soma de novo.
  assert.match(G.legendaCurta({ titulo: 'Mouse sem fio', loja: 'ml', preco_cents: 9990, preco_final_cents: 8990, frete_cents: 1000 }, LINKS.ml).texto, /R\$ 89,90 c\/ frete$/m);
  // preco_final_cents menor que o próprio frete é incoerente → revisão.
  assert.equal(G.legendaCurta({ titulo: 'Mouse sem fio', loja: 'ml', preco_final_cents: 500, frete_cents: 1000 }, LINKS.ml).erro, 'preco_invalido');
});

test('legendaCurta: campos sem unidade (preco, frete, preco_final, preco_com_frete) são ignorados → revisão', () => {
  const t = { titulo: 'Mouse sem fio X', loja: 'ml' };
  assert.equal(G.legendaCurta({ ...t, preco: 100, frete: 0 }, LINKS.ml).erro, 'frete_desconhecido');
  assert.equal(G.legendaCurta({ ...t, preco: 9990, frete_cents: 0 }, LINKS.ml).erro, 'preco_invalido');
  assert.equal(G.legendaCurta({ ...t, preco_final: 9990, preco_com_frete: 9990, frete_cents: 0 }, LINKS.ml).erro, 'preco_invalido');
  // Preço em reais (não inteiro) ou string no campo de centavos também não passa.
  assert.equal(G.legendaCurta({ ...t, preco_cents: 99.9, frete_cents: 0 }, LINKS.ml).erro, 'preco_invalido');
  assert.equal(G.legendaCurta({ ...t, preco_cents: '9990', frete_cents: 0 }, LINKS.ml).erro, 'preco_invalido');
  assert.equal(G.legendaCurta({ ...t, preco_final_cents: '9990', preco_cents: 9990, frete_cents: 0 }, LINKS.ml).erro, 'preco_invalido');
});

test('integração com lib/desconto.js: mesma oferta em centavos, preço exibido = precoFinal', () => {
  const D = require('../lib/desconto');
  const of = { titulo: 'Mouse sem fio X', loja: 'ml', preco: 9990, frete: 1290, tem_imagem: true }; // fixture
  const pf = D.precoFinal(of);
  assert.equal(pf.centavos, 11280);
  // Passar a oferta crua do portão não publica (unidade ambígua): nunca sai "R$ 11.280,00".
  const crua = G.legendaCurta(of, LINKS.ml);
  assert.equal(crua.ok, false);
  assert.equal(crua.destino, 'revisao');
  // Caminho correto: preco_final_cents do portão + frete_cents + frete_conhecido.
  const r = G.legendaCurta({ titulo: of.titulo, loja: of.loja, preco_final_cents: pf.centavos, frete_cents: of.frete, frete_conhecido: pf.freteConhecido }, LINKS.ml);
  assert.equal(r.ok, true, r.motivo);
  assert.equal(r.texto.split('\n')[0], '🔥 Mouse sem fio X — R$ 112,80 c/ frete');
  // Frete desconhecido no portão continua desconhecido na legenda.
  const sem = D.precoFinal({ preco: 9990, frete: null });
  assert.equal(G.legendaCurta({ titulo: of.titulo, loja: 'ml', preco_final_cents: sem.centavos, frete_cents: null, frete_conhecido: sem.freteConhecido }, LINKS.ml).erro, 'frete_desconhecido');
});

test('legendaCurta: Amazon tem as duas linhas de disclosure; mostrar_preco=nao omite o preço', () => {
  const r = G.legendaCurta({ titulo: 'Echo Exemplo', loja: 'amazon', preco_cents: 30000, frete_cents: 0 }, LINKS.amazon, { amazon: { mostrar_preco: false } });
  assert.equal(r.ok, true);
  assert.equal(r.texto.split('\n')[0], '🔥 Echo Exemplo');
  assert.ok(r.texto.endsWith('#publi · link de afiliado\nAssociado Amazon: ganhamos com compras qualificadas'));
  assert.doesNotMatch(r.texto, /R\$/);
});

test('legendaCurta: frete desconhecido não publica (vai para revisão)', () => {
  const casos = [{}, { frete_cents: null }, { frete_cents: '' }, { frete_cents: -1 }, { frete_cents: 'abc' }, { frete_cents: ' ' }, { frete_cents: '\n' },
    { frete_cents: false }, { frete_cents: true }, { frete_cents: [] }, { frete_cents: {} }, { frete_cents: '0x10' }, { frete_cents: 12.5 }, { frete_cents: NaN }, { frete_cents: Infinity },
    { frete_cents: 0, frete_conhecido: false }, { frete_cents: 500, frete_conhecido: false }, { frete_gratis: 'sim' }, { frete_gratis: 1 }, { frete_gratis: true, frete_conhecido: false },
    { frete_cents: ' ', frete_gratis: true }, // frete_cents inválido não é salvo por frete_gratis
    // Campo `frete` sem unidade é ignorado, qualquer que seja o valor.
    { frete: 0 }, { frete: ' ' }, { frete: false }, { frete: [] }, { frete: true }, { frete: '0x10' }];
  for (const f of casos) {
    const r = G.legendaCurta({ titulo: 'Mouse sem fio X', loja: 'ml', preco_cents: 1000, ...f }, LINKS.ml);
    assert.equal(r.ok, false, JSON.stringify(f));
    assert.equal(r.erro, 'frete_desconhecido');
    assert.equal(r.destino, 'revisao');
    assert.equal(r.html, undefined);
  }
  // Amazon sem preço também exige frete conhecido (regra única: Q-18).
  assert.equal(G.legendaCurta({ titulo: 'Echo', loja: 'amazon', preco_cents: 1000 }, LINKS.amazon, { amazon: { mostrar_preco: false } }).erro, 'frete_desconhecido');
});

test('legendaCurta: outros erros seguros', () => {
  const base = { titulo: 'Mouse', loja: 'ml', preco_cents: 1000, frete_cents: 0 };
  assert.equal(G.legendaCurta(base, '').erro, 'link_ausente');
  assert.equal(G.legendaCurta(base, 'javascript:alert(1)').erro, 'link_ausente');
  assert.equal(G.legendaCurta(base, 'https://a.b/c d').erro, 'link_ausente');
  for (const l of ['https://www.', 'https://www./', 'https://', 'https://localhost/x', 'https://user@evil.com/x', 'https://.com', 42, null]) {
    assert.equal(G.legendaCurta(base, l).erro, 'link_ausente', String(l));
  }
  assert.equal(G.legendaCurta({ ...base, preco_cents: 0 }, LINKS.ml).erro, 'preco_invalido');
  assert.equal(G.legendaCurta({ ...base, preco_cents: undefined }, LINKS.ml).erro, 'preco_invalido');
  assert.equal(G.legendaCurta({ ...base, titulo: '🔥🔥' }, LINKS.ml).erro, 'sem_titulo');
  // Título só de pontuação, ou que vira pontuação depois do corte, não identifica o produto.
  assert.equal(G.legendaCurta({ ...base, titulo: ','.repeat(70) }, LINKS.ml).erro, 'sem_titulo');
  assert.equal(G.legendaCurta({ ...base, titulo: '('.repeat(70) }, LINKS.ml).erro, 'sem_titulo');
  assert.equal(G.legendaCurta({ ...base, titulo: 'ab' }, LINKS.ml).erro, 'sem_titulo');
  assert.equal(G.legendaCurta({ ...base, titulo: { toString: () => 'Mouse sem fio' } }, LINKS.ml).erro, 'sem_titulo');
  assert.equal(G.legendaCurta(base, 'https://exemplo.com/' + 'x'.repeat(150)).erro, 'sem_espaco');
  const p = G.legendaCurta({ ...base, titulo: 'Fone ÚLTIMAS unidades' }, LINKS.ml);
  assert.equal(p.erro, 'termo_proibido');
  assert.match(p.motivo, /ÚLTIMAS UNIDADES/);
  assert.equal(G.legendaCurta(null, LINKS.ml).ok, false);
});

test('legendaCurta: legenda_max menor é respeitado, maior que 200 não', () => {
  const o = { titulo: NOMES[2], loja: 'ml', preco_cents: 1000, frete_cents: 0 };
  assert.ok(G.legendaCurta(o, LINKS.ml, { legenda_max: 150 }).texto.length <= 150);
  assert.ok(G.legendaCurta(o, LINKS.ml, { legenda_max: 1024 }).texto.length <= 200);
});

test('cortarNome: reticências, corte em palavra e sem partir par substituto', () => {
  assert.equal(G.cortarNome('abc', 10), 'abc');
  const c = G.cortarNome('Fone Bluetooth Cancelamento', 20);
  assert.ok(c.length <= 20 && c.endsWith('…'));
  assert.equal(c, 'Fone Bluetooth…');
  for (let max = 2; max < 40; max++) {
    const s = G.cortarNome('𝐓𝐞𝐧𝐢𝐬𝐄𝐬𝐩𝐨𝐫𝐭𝐢𝐯𝐨𝐂𝐨𝐫𝐫𝐢𝐝𝐚', max);
    assert.ok(s.length <= max, `${max}: ${s.length}`);
    assert.ok(semSubstitutoSolto(s), `max ${max}`);
  }
});

test('contarEmojis via Extended_Pictographic', () => {
  assert.equal(G.contarEmojis(''), 0);
  assert.equal(G.contarEmojis('sem emoji'), 0);
  assert.equal(G.contarEmojis('🔥 oi'), 1);
  assert.equal(G.contarEmojis('🔥🎧'), 2);
  assert.equal(G.contarEmojis('👨‍👩‍👧'), 3); // família com ZWJ conta cada pictograma
  assert.equal(G.contarEmojis(null), 0);
  assert.equal(G.contarEmojis(G.semEmojis('a 🔥 b 👍🏽 c 🇧🇷 d 1️⃣ ©')), 0);
});

test('TERMOS_PROIBIDOS: lista completa e normalização de acento/caixa/pontuação', () => {
  const esperados = ['CORRE QUE ACABA', 'SÓ HOJE', 'ÚLTIMAS UNIDADES', 'PREÇO HISTÓRICO', 'ABAIXO DO HISTÓRICO', 'RECORDE DE PREÇO', 'MÍNIMA HISTÓRICA', 'RARIDADE NO HISTÓRICO', 'VALENDO HOJE', 'HIT DO DIA', 'BOMBANDO AGORA', 'EM ALTA NO BRASIL', 'FARMÁCIA OFICIAL'];
  for (const t of esperados) assert.ok(G.TERMOS_PROIBIDOS.includes(t), t);
  assert.ok(Object.isFrozen(G.TERMOS_PROIBIDOS));
  for (const t of G.TERMOS_PROIBIDOS) {
    assert.ok(G.contemTermoProibido(t, {}), t);
    assert.ok(G.contemTermoProibido(`xx ${t.toLowerCase()} yy`), t);
    const semAcento = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
    assert.ok(G.contemTermoProibido(`🔥 ${semAcento}!!`), semAcento);
  }
  assert.ok(G.contemTermoProibido('Corre, que acaba!'));
  assert.ok(G.contemTermoProibido('só   hoje'));
  assert.ok(G.contemTermoProibido('Menor preço histórico'));
  assert.ok(G.contemTermoProibido('🚨BOMBANDO-AGORA🚨'));
  assert.deepEqual(G.termosProibidosEm('hit do dia e valendo hoje'), ['VALENDO HOJE', 'HIT DO DIA']);
  // Letras de compatibilidade (negrito matemático, fullwidth, circuladas) também são detectadas (NFKD).
  assert.ok(G.contemTermoProibido('𝐒𝐎́ 𝐇𝐎𝐉𝐄 Fone XYZ'));
  assert.ok(G.contemTermoProibido('Kit ＳÓ ＨＯＪＥ x'));
  assert.ok(G.contemTermoProibido('Fone XYZ 𝗖𝗢𝗥𝗥𝗘 𝗤𝗨𝗘 𝗔𝗖𝗔𝗕𝗔'));
  assert.ok(G.contemTermoProibido('ⒽⒾⓉ ⒹⓄ ⒹⒾⒶ'));
  assert.equal(G.legendaCurta({ titulo: 'Kit ＳÓ ＨＯＪＥ x', loja: 'shopee', preco_cents: 1000, frete_cents: 0 }, LINKS.shopee).erro, 'termo_proibido');
});

test('TERMOS_PROIBIDOS: sem falso positivo dentro de palavras e textos neutros', () => {
  assert.equal(G.contemTermoProibido('Isso hoje está ok'), false); // "ISSO HOJE" ≠ "SO HOJE"
  assert.equal(G.contemTermoProibido('Fone com 12% abaixo da mediana de 30 dias'), false);
  assert.equal(G.contemTermoProibido('Farmácia com vendedor oficial'), false);
  assert.equal(G.contemTermoProibido(''), false);
  assert.equal(G.contemTermoProibido(null), false);
});

test('TERMOS_PROIBIDOS: condicionais só liberam com verificação explícita', () => {
  assert.ok(G.contemTermoProibido('Menor preço histórico'));
  assert.equal(G.contemTermoProibido('Menor preço histórico', { historicoVerificado: true }), false);
  assert.ok(G.contemTermoProibido('Menor preço histórico', { historicoVerificado: 'sim' }), 'só true libera');
  assert.ok(G.contemTermoProibido('FARMÁCIA OFICIAL'));
  assert.equal(G.contemTermoProibido('Farmácia oficial', { vendedorVerificado: true }), false);
  // A verificação de um não libera o outro nem os incondicionais.
  assert.ok(G.contemTermoProibido('Farmácia oficial', { historicoVerificado: true }));
  assert.ok(G.contemTermoProibido('Abaixo do histórico', { historicoVerificado: true, vendedorVerificado: true }));
});

test('legenda.js é puro: sem require de pacote externo nem I/O', () => {
  const src = require('node:fs').readFileSync(require.resolve('../lib/legenda'), 'utf8');
  const reqs = [...src.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
  assert.deepEqual(reqs.sort(), ['./lojas', './util']);
  assert.doesNotMatch(src, /\b(fetch|process\.env|XMLHttpRequest)\b/);
});
