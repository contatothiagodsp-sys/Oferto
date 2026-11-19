'use strict';
// Testes de lib/desconto.js (W4-desconto). Fixtures de TESTE: preços e históricos abaixo são inventados.
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../lib/desconto');

const DIA = 86400000;
const AGORA = new Date('2026-11-20T15:00:00Z').getTime();

/** Série diária de teste: uma amostra por dia, de `deDias` atrás até `ateDias` atrás (inclusive). */
function serie(preco, deDias, ateDias, extra) {
  const out = [];
  for (let d = deDias; d >= ateDias; d--) out.push(Object.assign({ preco, ts: AGORA - d * DIA }, extra || {}));
  return out;
}

/** Histórico de teste consistente: 25 dias a R$ 100,00. */
const HIST_OK = serie(10000, 25, 1);

function ofertaBoa(extra) {
  return Object.assign({ loja: 'amazon', categoria: 'casa', titulo: 'Air fryer 4L', preco: 8500, frete: 0, tem_imagem: true, tem_afiliado: true }, extra || {});
}

const CFG = { agora: AGORA };

/* ---------- mediana30d ---------- */

test('mediana30d: ímpar, par (arredonda para baixo), vazio e janela de 30 dias', () => {
  assert.equal(D.mediana30d([{ preco: 300, ts: AGORA - 2 * DIA }, { preco: 100, ts: AGORA - 3 * DIA }, { preco: 200, ts: AGORA - 4 * DIA }], AGORA), 200);
  assert.equal(D.mediana30d([{ preco: 101, ts: AGORA - 2 * DIA }, { preco: 100, ts: AGORA - 3 * DIA }], AGORA), 100);
  assert.equal(D.mediana30d([], AGORA), null);
  assert.equal(D.mediana30d(null, AGORA), null);
  // Fora da janela (31 dias) e recente demais (< 12 h) não contam.
  const a = [{ preco: 999999, ts: AGORA - 31 * DIA }, { preco: 1, ts: AGORA - 2 * 3600000 }, { preco: 5000, ts: AGORA - 5 * DIA }];
  assert.equal(D.mediana30d(a, AGORA), 5000);
});

test('mediana30d: usa só preço de vitrine (com_cupom fica de fora) e ignora valores não inteiros', () => {
  const a = [
    { preco: 10000, ts: AGORA - 5 * DIA },
    { preco: 5000, ts: AGORA - 4 * DIA, com_cupom: true },
    { preco: 99.9, ts: AGORA - 3 * DIA },
    { preco: -10, ts: AGORA - 3 * DIA },
    { preco: 10000, data: new Date(AGORA - 2 * DIA).toISOString() },
  ];
  assert.equal(D.mediana30d(a, AGORA), 10000);
});

test('amostrasDeBfxPrecos: reais viram centavos e ref90 não é amostra', () => {
  const a = D.amostrasDeBfxPrecos([
    { preco: 99.9, fonte: 'coleta', data: '2026-11-10T00:00:00Z' },
    { preco: 50, fonte: 'ref90', data: '2026-11-10T00:00:00Z' },
    { preco: 'x', fonte: 'coleta', data: '2026-11-10T00:00:00Z' },
  ]);
  assert.equal(a.length, 1);
  assert.equal(a[0].preco, 9990);
});

/* ---------- precoFinal ---------- */

test('precoFinal: preço + frete − cupom; frete null = desconhecido; cashback fora por padrão', () => {
  assert.deepEqual(D.precoFinal({ preco: 10000, frete: 1500, cupom: 2000 }), { centavos: 9500, freteConhecido: true, cupomCentavos: 2000, cashbackCentavos: 0 });
  const semFrete = D.precoFinal({ preco: 10000, frete: null });
  assert.equal(semFrete.centavos, 10000);
  assert.equal(semFrete.freteConhecido, false);
  assert.equal(D.precoFinal({ preco: 10000 }).freteConhecido, false);
  assert.equal(D.precoFinal({ preco: 10000, frete: 0 }).freteConhecido, true);
  assert.equal(D.precoFinal({ preco: 10000, frete: 0, cashback: 3000 }).centavos, 10000);
  assert.equal(D.precoFinal({ preco: 10000, frete: 0, cashback: 3000 }, { considerar_cashback: true }).centavos, 7000);
});

test('precoFinal: cupom percentual arredonda o desconto para baixo; cupom ≥ preço é inválido', () => {
  assert.equal(D.precoFinal({ preco: 9999, frete: 0, cupom: { pct: 10 } }).centavos, 9000); // 999,9 → 999
  assert.equal(D.precoFinal({ preco: 10000, frete: 0, cupom: { centavos: 500 } }).centavos, 9500);
  const r = D.precoFinal({ preco: 10000, frete: 0, cupom: 10000 });
  assert.equal(r.centavos, null);
  assert.equal(r.invalido, 'cupom_maior_que_preco');
  assert.equal(D.precoFinal({ preco: 99.9, frete: 0 }).invalido, 'preco_invalido');
  assert.equal(D.precoFinal({ preco: 0 }).centavos, null);
});

/* ---------- integridade (Q-15) ---------- */

test('integridade: consistente = ≥10 amostras em ≥20 dias', () => {
  assert.equal(D.integridade(serie(10000, 20, 1), CFG), 'consistente'); // 20 amostras, 20 dias
  assert.equal(D.integridade(serie(10000, 19, 1), CFG), 'provisoria'); // 19 dias
});

test('integridade: provisória = ≥5 amostras em ≥10 dias; abaixo é insuficiente', () => {
  const a = [1, 3, 5, 7, 10].map((d) => ({ preco: 10000, ts: AGORA - d * DIA }));
  assert.equal(D.integridade(a, CFG), 'provisoria'); // 5 amostras, extensão de 10 dias
  // 10 amostras espalhadas em 20 dias = consistente (Q-15: "≥10 amostras cobrindo ≥20 dos 30 dias").
  assert.equal(D.integridade([1, 3, 5, 7, 9, 11, 13, 15, 17, 20].map((d) => ({ preco: 10000, ts: AGORA - d * DIA })), CFG), 'consistente');
  // 5 amostras em 9 dias = insuficiente.
  assert.equal(D.integridade([1, 3, 5, 7, 9].map((d) => ({ preco: 10000, ts: AGORA - d * DIA })), CFG), 'insuficiente');
  assert.equal(D.integridade(a.slice(0, 4), CFG), 'insuficiente'); // 4 amostras
  const poucosDias = [1, 2, 3, 4, 5, 6].map((d) => ({ preco: 10000, ts: AGORA - d * DIA }));
  assert.equal(D.integridade(poucosDias, CFG), 'insuficiente'); // 6 dias
  assert.equal(D.integridade([], CFG), 'insuficiente');
  // 10 amostras no mesmo dia: 1 dia coberto só.
  assert.equal(D.integridade(Array.from({ length: 10 }, (_, i) => ({ preco: 10000, ts: AGORA - 3 * DIA - i * 1000 })), CFG), 'insuficiente');
});

test('integridade: suspeita quando houve alta > 25% nos 7 dias antes da queda', () => {
  const a = serie(10000, 25, 8).concat(serie(13000, 6, 1)); // +30%
  assert.equal(D.integridade(a, CFG), 'suspeita');
  assert.equal(D.integridade(a, Object.assign({ preco: 10000 }, CFG)), 'suspeita');
  // Sem queda (preço atual ≥ pico), não é "metade do dobro".
  assert.equal(D.integridade(a, Object.assign({ preco: 13000 }, CFG)), 'consistente');
  // Alta de exatamente 25% não é suspeita (regra é > 25%).
  assert.equal(D.integridade(serie(10000, 25, 8).concat(serie(12500, 6, 1)), CFG), 'consistente');
  // Alta antiga que já voltou ao normal antes dos 7 dias não é suspeita.
  assert.equal(D.integridade(serie(10000, 25, 15).concat(serie(20000, 14, 8), serie(10000, 7, 1)), CFG), 'consistente');
  // Conservador: preço ainda inflado nos 7 dias (vs. mediana anterior) também é suspeita, mesmo que a alta seja antiga.
  assert.equal(D.integridade(serie(10000, 25, 15).concat(serie(20000, 14, 1)), CFG), 'suspeita');
});

test('integridade: mista quando fontes divergem mais de 15%', () => {
  const a = serie(10000, 25, 1, { fonte: 'propria' }).concat(serie(13000, 25, 15, { fonte: 'outra' }));
  assert.equal(D.integridade(a, CFG), 'mista');
  const b = serie(10000, 25, 1, { fonte: 'propria' }).concat(serie(10500, 25, 15, { fonte: 'outra' }));
  assert.equal(D.integridade(b, CFG), 'consistente');
});

test('integridadeDetalhe devolve contagens', () => {
  const d = D.integridadeDetalhe(HIST_OK, CFG);
  assert.equal(d.amostras, 25);
  assert.equal(d.dias_cobertos, 25);
  assert.equal(d.dias_com_amostra, 25);
  assert.equal(d.mediana, 10000);
  assert.equal(d.minimo, 10000);
});

/* ---------- posicao ---------- */

test('posicao: menor, próximo do menor (≤ 3%), típico, acima e sem referência', () => {
  const a = [9000, 10000, 10000, 11000, 12000].map((p, i) => ({ preco: p, ts: AGORA - (i + 1) * DIA }));
  assert.equal(D.posicao(8000, a, CFG), 'menor');
  assert.equal(D.posicao(9000, a, CFG), 'menor');
  assert.equal(D.posicao(9270, a, CFG), 'proximo_menor'); // 9000 × 1,03
  assert.equal(D.posicao(9271, a, CFG), 'tipico');
  assert.equal(D.posicao(10000, a, CFG), 'tipico');
  assert.equal(D.posicao(10001, a, CFG), 'acima');
  assert.equal(D.posicao(10000, [], CFG), null);
});

/* ---------- whitelist e sensíveis ---------- */

test('WHITELIST_AUTO: só ml, amazon, magalu e shopee (com aliases)', () => {
  assert.deepEqual([...D.WHITELIST_AUTO].sort(), ['amazon', 'magalu', 'ml', 'shopee']);
  assert.ok(Object.isFrozen(D.WHITELIST_AUTO));
  for (const l of ['ml', 'Amazon', 'magalu', 'shopee', 'mercadolivre', 'Magazine Luiza']) assert.ok(D.lojaNaWhitelist(l), l);
  for (const l of ['kabum', 'shein', 'drogasil', 'tiktok', 'outra', '', null]) assert.equal(D.lojaNaWhitelist(l), false, String(l));
  assert.ok(D.lojaNaWhitelist('kabum', { whitelist_auto: ['kabum'] }));
});

test('sensiveis: saúde, infantil e financeiro por categoria e palavra-chave', () => {
  assert.deepEqual(D.sensiveis({ categoria: 'saude' }), ['saude']);
  assert.deepEqual(D.sensiveis({ categoria: 'bebe' }), ['infantil']);
  assert.deepEqual(D.sensiveis({ categoria: 'casa', titulo: 'Creatina Monohidratada 300g' }), ['saude']);
  assert.deepEqual(D.sensiveis({ categoria: 'casa', titulo: 'Fralda Pampers XG' }), ['infantil']);
  assert.deepEqual(D.sensiveis({ titulo: 'Fórmula Infantil Nan 800g' }), ['infantil']);
  assert.deepEqual(D.sensiveis({ titulo: 'Cartão de Crédito sem anuidade' }), ['financeiro']);
  assert.deepEqual(D.sensiveis({ titulo: 'Empréstimo pessoal' }), ['financeiro']);
  assert.deepEqual(D.sensiveis({ titulo: 'Seguro celular' }), ['financeiro']);
  assert.deepEqual(D.sensiveis({ titulo: 'Abra sua Conta Digital' }), ['financeiro']);
  assert.deepEqual(D.sensiveis({ categoria: 'tech', titulo: 'Cartão de Memória 128GB' }), []);
  assert.deepEqual(D.sensiveis({ categoria: 'casa', titulo: 'Air fryer 4L' }), []);
});

/* ---------- avaliarAutoPublicacao (P2-15 + P2-19) ---------- */

test('auto: só quando passam os 3 bloqueios duros e nenhuma regra de revisão', () => {
  const r = D.avaliarAutoPublicacao(ofertaBoa(), HIST_OK, CFG);
  assert.equal(r.destino, 'auto');
  assert.deepEqual(r.motivos, []);
  assert.equal(r.desconto_real, 15);
  assert.equal(r.integridade, 'consistente');
  assert.equal(r.posicao, 'menor');
  assert.equal(r.preco_final, 8500);
  assert.equal(r.mediana_30d, 10000);
});

test('auto com integridade provisória também passa (AND aceita consistente ou provisória)', () => {
  const a = [1, 3, 5, 7, 10].map((d) => ({ preco: 10000, ts: AGORA - d * DIA }));
  const r = D.avaliarAutoPublicacao(ofertaBoa(), a, CFG);
  assert.equal(r.integridade, 'provisoria');
  assert.equal(r.destino, 'auto');
});

test('bloqueio 1: desconto real < 12% vai para revisão (11,99% não passa, 12% passa)', () => {
  assert.deepEqual(D.avaliarAutoPublicacao(ofertaBoa({ preco: 8801 }), HIST_OK, CFG).motivos, ['bloqueio_desconto']);
  assert.equal(D.avaliarAutoPublicacao(ofertaBoa({ preco: 8800 }), HIST_OK, CFG).destino, 'auto');
});

test('bloqueio 1 conta o frete: preço bom + frete caro não é desconto real', () => {
  const r = D.avaliarAutoPublicacao(ofertaBoa({ preco: 8500, frete: 1000 }), HIST_OK, CFG);
  assert.equal(r.preco_final, 9500);
  assert.ok(r.motivos.includes('bloqueio_desconto'));
});

test('bloqueio 2: integridade insuficiente, suspeita ou mista vai para revisão', () => {
  const pouco = [1, 2, 3].map((d) => ({ preco: 10000, ts: AGORA - d * DIA }));
  assert.ok(D.avaliarAutoPublicacao(ofertaBoa(), pouco, CFG).motivos.includes('integridade_insuficiente'));
  const mista = serie(10000, 25, 1, { fonte: 'propria' }).concat(serie(13000, 25, 15, { fonte: 'outra' }));
  assert.ok(D.avaliarAutoPublicacao(ofertaBoa(), mista, CFG).motivos.includes('integridade_mista'));
});

test('bloqueio 3: preço acima do menor patamar × 1,03 vai para revisão mesmo com desconto ≥ 12%', () => {
  // Mediana 10000, mas houve um dia a 7000: 8500 é 15% abaixo da mediana e 21% acima do mínimo.
  const a = HIST_OK.concat([{ preco: 7000, ts: AGORA - 12 * DIA + 3600000 }]);
  const r = D.avaliarAutoPublicacao(ofertaBoa(), a, CFG);
  assert.equal(r.desconto_real, 15);
  assert.equal(r.posicao, 'tipico');
  assert.deepEqual(r.motivos, ['bloqueio_posicao']);
});

test('sem histórico = sem_ref, nunca auto', () => {
  const r = D.avaliarAutoPublicacao(ofertaBoa(), [], CFG);
  assert.equal(r.destino, 'revisao');
  assert.deepEqual(r.motivos, ['sem_ref']);
  assert.equal(r.integridade, 'insuficiente');
  assert.equal(r.desconto_real, null);
  assert.equal(r.posicao, null);
});

test('"metade do dobro": preço inflado na semana e depois "50% OFF" vai para revisão', () => {
  // Fixture: R$ 100 por 3 semanas, sobe para R$ 200 nos últimos 6 dias, volta a R$ 100 com "De R$ 200 por R$ 100".
  const a = serie(10000, 25, 7).concat(serie(20000, 6, 1));
  const r = D.avaliarAutoPublicacao(ofertaBoa({ preco: 10000, preco_de: 20000 }), a, CFG);
  assert.equal(r.destino, 'revisao');
  assert.equal(r.integridade, 'suspeita');
  assert.ok(r.motivos.includes('integridade_suspeita'));
  assert.ok(r.motivos.includes('bloqueio_desconto')); // mediana 10000 → desconto real 0%
  assert.equal(r.desconto_real, 0);
});

test('"metade do dobro" com inflação longa: a mediana sobe, mas o bloqueio de posição segura', () => {
  // Fixture: R$ 100 por 10 dias, R$ 200 por 15 dias (fora da janela de 7 d), "promoção" a R$ 150.
  const a = serie(10000, 25, 16).concat(serie(20000, 15, 1));
  const r = D.avaliarAutoPublicacao(ofertaBoa({ preco: 15000, preco_de: 20000 }), a, CFG);
  assert.equal(r.mediana_30d, 20000);
  assert.equal(r.desconto_real, 25);
  assert.equal(r.posicao, 'tipico');
  assert.equal(r.destino, 'revisao');
  assert.ok(r.motivos.includes('bloqueio_posicao'));
});

test('o "De" da loja nunca vira prova: preco_de alto sem histórico continua revisão', () => {
  const r = D.avaliarAutoPublicacao(ofertaBoa({ preco: 5000, preco_de: 50000 }), [], CFG);
  assert.equal(r.destino, 'revisao');
  assert.ok(r.motivos.includes('sem_ref'));
});

test('regras de revisão: whitelist, sensíveis, frete, terceiros, cupom de loja, imagem e afiliado', () => {
  const caso = (extra) => D.avaliarAutoPublicacao(ofertaBoa(extra), HIST_OK, CFG);
  assert.deepEqual(caso({ loja: 'kabum' }).motivos, ['fora_whitelist']);
  assert.deepEqual(caso({ loja: undefined }).motivos, ['fora_whitelist']);
  assert.deepEqual(caso({ categoria: 'saude' }).motivos, ['sensivel_saude']);
  assert.deepEqual(caso({ categoria: 'bebe' }).motivos, ['sensivel_infantil']);
  assert.deepEqual(caso({ titulo: 'Seguro viagem' }).motivos, ['sensivel_financeiro']);
  assert.deepEqual(caso({ frete: null }).motivos, ['frete_desconhecido']);
  assert.deepEqual(caso({ frete: undefined }).motivos, ['frete_desconhecido']);
  assert.deepEqual(caso({ fonte_terceiros: true }).motivos, ['fonte_terceiros']);
  assert.deepEqual(caso({ origem: 'canal @xetdaspromocoes' }).motivos, ['fonte_terceiros']);
  assert.deepEqual(caso({ origem: 'promobit' }).motivos, ['fonte_terceiros']);
  assert.deepEqual(caso({ cupom_loja: true }).motivos, ['cupom_loja']);
  assert.deepEqual(caso({ eh_cupom_loja: true }).motivos, ['cupom_loja']);
  assert.deepEqual(caso({ tem_imagem: false }).motivos, ['sem_imagem']);
  assert.deepEqual(caso({ tem_imagem: undefined }).motivos, ['sem_imagem']); // padrão seguro
  assert.deepEqual(caso({ loja: 'magalu', tem_afiliado: false }).motivos, ['sem_afiliado']);
  assert.deepEqual(caso({ preco: 10000, cupom: 10000 }).motivos.slice(0, 1), ['preco_invalido']);
});

test('vários motivos se acumulam sem duplicar', () => {
  const r = D.avaliarAutoPublicacao({ loja: 'drogasil', categoria: 'saude', titulo: 'Whey protein', preco: 9900, frete: null }, [], CFG);
  assert.deepEqual(r.motivos, ['fora_whitelist', 'sensivel_saude', 'sem_ref', 'frete_desconhecido', 'sem_imagem', 'sem_afiliado']);
  assert.equal(r.destino, 'revisao');
});

test('cupom de produto entra no preço final e pode levar ao auto', () => {
  const r = D.avaliarAutoPublicacao(ofertaBoa({ preco: 9500, cupom: { pct: 10 } }), HIST_OK, CFG);
  assert.equal(r.preco_final, 8550);
  assert.equal(r.destino, 'auto');
});

test('oferta nula ou vazia nunca é auto', () => {
  assert.equal(D.avaliarAutoPublicacao(null, null, CFG).destino, 'revisao');
  assert.equal(D.avaliarAutoPublicacao({}, HIST_OK).destino, 'revisao');
});

test('textoMotivos: texto curto para o card de revisão', () => {
  assert.equal(D.textoMotivos(['fora_whitelist', 'frete_desconhecido']), 'loja fora da whitelist de auto-publicação · frete desconhecido');
  assert.equal(D.textoMotivos(['desconhecido_x']), 'desconhecido_x');
  for (const m of ['preco_invalido', 'fora_whitelist', 'sensivel_saude', 'sensivel_infantil', 'sensivel_financeiro', 'sem_ref',
    'integridade_insuficiente', 'integridade_suspeita', 'integridade_mista', 'bloqueio_desconto', 'bloqueio_posicao',
    'frete_desconhecido', 'fonte_terceiros', 'cupom_loja', 'sem_imagem', 'sem_afiliado']) {
    assert.ok(D.MOTIVOS_TEXTO[m], m);
  }
});

/* ---------- revalidar (P2-17) ---------- */

test('revalidar: até +3% passa; acima cancela com rejeitada_por_revalidacao', () => {
  const orig = { preco: 10000, frete: 0 };
  const ok = D.revalidar(orig, { preco: 10300, frete: 0 }, CFG);
  assert.equal(ok.ok, true);
  assert.equal(ok.variacao_pct, 3);
  const r = D.revalidar(orig, { preco: 10301, frete: 0 }, CFG);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'rejeitada_por_revalidacao');
  assert.equal(r.detalhe, 'preco_subiu');
  assert.equal(r.preco_antigo, 10000);
  assert.equal(r.preco_novo, 10301);
  assert.equal(r.ts, new Date(AGORA).toISOString());
  assert.equal(D.revalidar(orig, { preco: 9000, frete: 0 }, CFG).ok, true); // caiu: ok
});

test('revalidar: frete novo conta como alta de preço final', () => {
  const r = D.revalidar({ preco: 10000, frete: 0 }, { preco: 10000, frete: 500 }, CFG);
  assert.equal(r.ok, false);
  assert.equal(r.detalhe, 'preco_subiu');
});

test('revalidar: cupom sumiu cancela mesmo com preço igual', () => {
  const r = D.revalidar({ preco: 10000, frete: 0, cupom: 1000 }, { preco: 10000, frete: 0 }, CFG);
  assert.equal(r.ok, false);
  assert.equal(r.detalhe, 'cupom_sumiu');
  assert.equal(r.preco_antigo, 9000);
  assert.equal(r.preco_novo, 10000);
});

test('revalidar: cupom menor que sobe o final > 3% cancela; indisponível e inválido cancelam', () => {
  assert.equal(D.revalidar({ preco: 10000, frete: 0, cupom: 1000 }, { preco: 10000, frete: 0, cupom: 500 }, CFG).detalhe, 'preco_subiu');
  assert.equal(D.revalidar({ preco: 10000, frete: 0 }, null, CFG).detalhe, 'indisponivel');
  assert.equal(D.revalidar({ preco: 10000, frete: 0 }, { indisponivel: true }, CFG).detalhe, 'indisponivel');
  assert.equal(D.revalidar({ preco: 10000, frete: 0 }, { preco: 0 }, CFG).detalhe, 'preco_invalido');
  assert.equal(D.revalidar({ preco: 10000, frete: 0 }, { preco: 10000, frete: null }, CFG).detalhe, 'frete_desconhecido');
});

test('revalidar: original sem frete conhecido compara sem frete', () => {
  assert.equal(D.revalidar({ preco: 10000 }, { preco: 10200, frete: 2000 }, CFG).ok, true);
  assert.equal(D.revalidar({ preco: 10000 }, { preco: 10400 }, CFG).ok, false);
});

/* ---------- cotaCanal (P2-06) ---------- */

test('cotaCanal: máximo 5 por dia por canal, contando todos os publicadores', () => {
  const posts = [
    { canal: '-100A', origem: 'radar' }, { canal: '-100A', origem: 'auto_top' }, { chat_id: '-100A', origem: 'esquenta' },
    { destino: '-100A' }, { canal: '-100B' },
  ];
  assert.deepEqual(D.cotaCanal(posts, '-100A', {}), { ok: true, usados: 4, restantes: 1, max: 5 });
  const cheio = posts.concat([{ canal: '-100A' }]);
  assert.deepEqual(D.cotaCanal(cheio, '-100A', {}), { ok: false, usados: 5, restantes: 0, max: 5 });
  assert.equal(D.cotaCanal(cheio, '-100B', {}).usados, 1);
});

test('cotaCanal: ignora falhas, filtra por dia de São Paulo e aceita ritmo.max_dia', () => {
  const ontem = AGORA - DIA;
  const posts = [
    { canal: 'c', ts: AGORA - 3600000 }, { canal: 'c', ts: ontem }, { canal: 'c', ok: false }, { canal: 'c', status: 'erro' },
    { canal: 'c', ts: new Date('2026-11-20T02:30:00Z').toISOString() }, // 23:30 do dia 19 em SP
  ];
  assert.equal(D.cotaCanal(posts, 'c', { agora: AGORA }).usados, 1);
  assert.deepEqual(D.cotaCanal(posts, 'c', { agora: AGORA, ritmo: { max_dia: 1 } }), { ok: false, usados: 1, restantes: 0, max: 1 });
  assert.equal(D.cotaCanal([], 'c', { max_dia: 'abc' }).max, 5);
  assert.equal(D.cotaCanal([], '', {}).ok, false);
  assert.equal(D.cotaCanal(null, 'c').ok, true);
});

test('lib/desconto.js segue as regras do bundle: sem require externo nem I/O', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'lib', 'desconto.js'), 'utf8');
  assert.ok(!/require\(/.test(src.replace(/^'use strict';/, '')), 'sem require');
  assert.ok(!/\bfetch\(|process\.|fs\./.test(src), 'sem I/O');
});
