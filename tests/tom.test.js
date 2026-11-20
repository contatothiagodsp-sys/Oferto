'use strict';
// Camada de tom de voz (lib/tom.js): roteador de nicho, banco de frases, validação, pedido/leitura da
// Claude API, integração nos textos e nos workflows. Não chama a rede (respostas da API são simuladas).
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const L = require('../lib');
const T = Object.assign({}, require('../lib/tom'), require('../lib/tom-ia'));

function cfgTom(extra) {
  return L.montarConfig([
    { chave: 'admins', valor: '111' },
    { chave: 'bot_token', valor: 'TOKEN_ADMIN' },
    { chave: 'grupo_id', valor: '-1001234567890' },
    { chave: 'topico.casa', valor: '10' },
  ].concat(extra || []));
}
const cfgIA = (extra) => cfgTom([{ chave: 'copy.ia', valor: 'sim' }, { chave: 'copy.ia_chave', valor: 'sk-ant-teste' }].concat(extra || []));

const of = (titulo, extra) => Object.assign({
  oferta_id: 'OF1', produto_id: 'p_' + titulo, titulo, loja: 'amazon', categoria: 'casa', preco: 199.9, ts: 1763560000000,
}, extra || {});

function respClaude(copy, extra) {
  return {
    statusCode: 200,
    body: Object.assign({
      model: 'claude-opus-5-5', stop_reason: 'end_turn',
      content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify({ copy }) }],
    }, extra || {}),
  };
}

test('roteador de tom: nicho, subnicho, fandom e especificações', () => {
  const casos = [
    ['Album BTS Proof Standard Edition', 'kpop', 'album', 'ARMY'],
    ['Lightstick Stray Kids Ver.2', 'kpop', 'lightstick', 'STAY'],
    ['Fichário Photocard A5 Rosa', 'kpop', 'colecionavel', null],
    ['Controle Sem Fio PS5 DualSense Branco', 'games', 'controle'],
    ['Console PlayStation 5 Slim Digital', 'games', 'console'],
    ['Capa de Silicone para Controle PS5', 'games', 'acessorio'],
    ['SSD Kingston NV2 1TB NVMe M.2', 'hardware', 'pc'],
    ['Monitor Gamer LG UltraGear 27" 165Hz IPS', 'hardware', 'monitor'],
    ['Fritadeira Air Fryer Mondial 4L', 'casa', 'airfryer'],
    ['Cafeteira Expresso Oster', 'casa', 'cozinha'],
    ['Ventilador de Mesa Mondial 40cm', 'casa', 'clima'],
    ['Protetor Solar Facial La Roche-Posay FPS 60', 'beleza', 'protetor'],
    ['Tênis de Corrida Asics Novablast 4', 'moda', 'corrida'],
    ['Perfume Lattafa Khamrah EDP 100ml', 'perfumes', 'arabe'],
    ['Sérum Vitamina C Principia 30ml', 'beleza', 'skincare'],
    ['Tênis Nike Revolution 7 Masculino', 'moda', 'tenis'],
    ['Creatina Monohidratada Growth 250g', 'suplementos', 'geral'],
    ['Dipirona 500mg 10 comprimidos', 'saude', 'medicamento'],
  ];
  for (const [titulo, nicho, sub, fandom] of casos) {
    const d = T.detectarNicho(of(titulo));
    assert.equal(d.nicho, nicho, titulo);
    assert.equal(d.sub, sub, titulo);
    if (fandom) assert.equal(d.grupo && d.grupo.fandom, fandom, titulo);
  }
  // Categoria do canal decide quando o título não dá pista.
  assert.equal(T.detectarNicho(of('Kit Especial Edição Limitada', { categoria: 'kpop' })).nicho, 'kpop');
  // Nome de grupo sem formato de K-pop não vira K-pop (ex.: "suga" em aspirador já foi removido; TXT solto).
  assert.notEqual(T.detectarNicho(of('Leitor de Arquivo TXT Portátil')).nicho, 'kpop');
  assert.deepEqual(T.detectarNicho(of('Monitor 27" 165Hz')).specs[0], { k: 'hz', v: '165' });
});

// Oferta mínima em cada contexto: neutro (sem comparação), queda (De: 50% acima) e cupom ativo.
const OFERTA_CTX = { neutro: { titulo: '', preco: 100 }, queda: { titulo: '', preco: 100, preco_de: 150 }, cupom: { titulo: '', preco: 100, cupom: 'X' } };

test('banco de frases: toda frase passa na validação do próprio contexto, sem elogiar preço no neutro', () => {
  const grupo = { id: 'bts', nome: 'BTS', fandom: 'ARMY' };
  let total = 0;
  for (const [nicho, subs] of Object.entries(T.BANCO_COPY)) {
    for (const [sub, ctxs] of Object.entries(subs)) {
      assert.ok(Array.isArray(ctxs.neutro) && ctxs.neutro.length, `${nicho}/${sub} sem frases neutras`);
      for (const [ctx, lista] of Object.entries(ctxs)) {
        for (const f of lista) {
          const txt = f.replace(/\{grupo\}/g, grupo.nome).replace(/\{fandom\}/g, grupo.fandom);
          const v = T.validarCopy(txt, Object.assign({ categoria: nicho }, OFERTA_CTX[ctx]));
          assert.ok(v.ok, `${nicho}/${sub}/${ctx}: "${txt}" reprovada (${v.motivo})`);
          assert.doesNotMatch(txt, /\b(?:deixa|faz|torna)\s+o\s+\w+\s+(?:mais|bem mais)\b/i, `${nicho}/${sub}: "${txt}" explica o produto`);
          assert.ok(txt.length <= 110, `${nicho}/${sub}: "${txt}" passa de 110 caracteres`);
          total++;
        }
      }
    }
  }
  assert.ok(total >= 70, `banco pequeno demais (${total})`);
});

test('combinações: toda abertura e todo fecho passam sozinhos; cada sub-nicho rende dezenas de frases por contexto', () => {
  const grupo = { id: 'bts', nome: 'BTS', fandom: 'ARMY' };
  const encher = (f) => f.replace(/\{grupo\}/g, grupo.nome).replace(/\{fandom\}/g, grupo.fandom).replace(/\{bastao\}/g, 'ARMY Bomb');
  for (const [nicho, cn] of Object.entries(T.COMBO_COPY)) {
    for (const [ctx, lista] of Object.entries(cn.fechos)) {
      for (const f of lista) {
        const v = T.validarCopy(`Achado bom aqui. ${encher(f)}`, Object.assign({ categoria: nicho }, OFERTA_CTX[ctx]));
        assert.ok(v.ok, `${nicho}/fecho/${ctx}: "${f}" (${v.motivo})`);
      }
    }
    for (const [sub, s] of Object.entries(cn.subs)) {
      for (const a of s.aberturas) {
        // Abertura sempre sai com um fecho; valida com um fecho neutro curto (cobre as aberturas curtas, como "Alô, ARMY!").
        const v = T.validarCopy(`${encher(a)} Vale conferir.`, Object.assign({ categoria: nicho }, OFERTA_CTX.neutro));
        assert.ok(v.ok, `${nicho}/${sub}: abertura "${a}" reprovada (${v.motivo})`);
      }
    }
  }
  // Quantidade de frases possíveis (válidas, já com o tamanho máximo) por produto e contexto.
  const produtos = [
    ['Album BTS Proof Standard Edition', 'kpop'], ['Official Light Stick Ver.2 - TXT', 'kpop'], ['Controle Sem Fio PS5 DualSense', 'tech'],
    ['Monitor Gamer LG 27" 180Hz', 'tech'], ['Fritadeira Air Fryer Mondial 4L', 'casa'], ['Perfume Lattafa Khamrah EDP 100ml', 'perfumes'],
    ['Tênis de Corrida Asics Novablast 4', 'moda'], ['Fralda Pampers Confort Sec XG 76 Unidades', 'bebe'],
  ];
  for (const [titulo, categoria] of produtos) {
    for (const [ctx, extra] of Object.entries({ neutro: {}, queda: { preco: 100, preco_de: 160 }, cupom: { cupom: 'X' } })) {
      const n = T.candidatasCopy(of(titulo, Object.assign({ categoria }, extra))).length;
      assert.ok(n >= 20, `${titulo} (${ctx}): só ${n} frases possíveis`);
    }
  }
  assert.ok(T.candidatasCopy(of('Album BTS Proof Standard Edition', { categoria: 'kpop', preco: 100, preco_de: 160 })).length >= 50);
});

test('variedade: lote do radar e posts recentes não repetem frase, abertura nem fecho', () => {
  // Caso real (21:48): dois lightsticks no mesmo lote saíram com a mesma frase.
  const txt = of('Official Light Stick Ver.2 - TXT', { oferta_id: 'L1', produto_id: 'p1', categoria: 'kpop', preco: 562, preco_de: 666 });
  const bnd = of('Official Light Stick Set - Boynextdoor', { oferta_id: 'L2', produto_id: 'p2', categoria: 'kpop', preco: 747, preco_de: 886 });
  assert.equal(T.detectarNicho(bnd).sub, 'lightstick');
  const fin = T.atribuirCopyRadar({ autoPlanos: [{ oferta: txt }, { oferta: bnd }], ofertasNovas: [Object.assign({}, txt, { links_manuais: '{}' })] }, []);
  const [c1, c2] = fin.autoPlanos.map((p) => p.oferta.links_manuais.copy_tom);
  assert.notEqual(c1.texto, c2.texto);
  const pref = (c, p) => c.chaves.filter((k) => k.startsWith(p));
  assert.ok(!pref(c1, 'a:').some((k) => pref(c2, 'a:').includes(k)), 'aberturas diferentes no mesmo lote');
  assert.ok(!pref(c1, 'z:').some((k) => pref(c2, 'z:').includes(k)), 'fechos diferentes no mesmo lote');
  // A linha da bfx_ofertas recebe a mesma frase do plano (aprovação e reedição usam a mesma).
  assert.equal(JSON.parse(fin.ofertasNovas[0].links_manuais).copy_tom.texto, c1.texto);
  // O post usa a frase fixada.
  assert.equal(T.linhaCopy(fin.autoPlanos[0].oferta, cfgTom()), c1.texto);

  // Lote grande do mesmo nicho: nenhuma frase repetida e aberturas bem espalhadas.
  const grupos = ['BTS', 'Stray Kids', 'TWICE', 'SEVENTEEN', 'ENHYPEN', 'ATEEZ', 'TXT', 'NCT', 'ITZY', 'aespa'];
  const lote = [];
  for (let i = 0; i < 30; i++) {
    const g = grupos[i % grupos.length];
    const tipo = i % 3 === 0 ? `Official Light Stick - ${g}` : `${g} - Album Mini ${i} Ver. A`;
    lote.push({ oferta: of(tipo, { oferta_id: 'K' + i, produto_id: 'k' + i, categoria: 'kpop', preco: 100, preco_de: i % 2 ? 160 : 100 }) });
  }
  const fl = T.atribuirCopyRadar({ autoPlanos: lote, ofertasNovas: [] }, []);
  const textos = fl.autoPlanos.map((p) => p.oferta.links_manuais.copy_tom.texto);
  assert.equal(new Set(textos).size, textos.length, 'nenhuma frase repetida no lote de 30');
  const contagem = {};
  for (const p of fl.autoPlanos) for (const k of p.oferta.links_manuais.copy_tom.chaves.filter((x) => x.startsWith('a:'))) contagem[k] = (contagem[k] || 0) + 1;
  assert.ok(Math.max(...Object.values(contagem)) <= 3, 'nenhuma abertura usada mais de 3 vezes em 30 posts');

  // Memória entre lotes: o que saiu nas ofertas recentes não volta no próximo post parecido.
  const recente = Object.assign({}, txt, { oferta_id: 'R0', ts: 1, links_manuais: JSON.stringify({ copy_tom: c1 }) });
  const seguinte = T.atribuirCopyEntrada({ oferta: Object.assign({}, txt, { oferta_id: 'L9' }) }, [recente]);
  assert.notEqual(seguinte.oferta.links_manuais.copy_tom.texto, c1.texto);
  // Mesmo produto e mesmo histórico: mesma escolha (determinístico).
  assert.equal(T.atribuirCopyEntrada({ oferta: Object.assign({}, txt) }, [recente]).oferta.links_manuais.copy_tom.texto, seguinte.oferta.links_manuais.copy_tom.texto);
  // Frase fixada que deixou de valer (preço voltou ao normal) cai para uma frase válida do contexto atual.
  const voltou = Object.assign({}, fin.autoPlanos[0].oferta, { preco_de: undefined });
  const lv = T.linhaCopy(voltou, cfgTom());
  assert.ok(lv && T.validarCopy(lv, voltou).ok);
});

test('fallback: frase determinística por produto, varia entre produtos e respeita o contexto', () => {
  const a1 = T.linhaCopy(of('Album BTS Proof Standard Edition', { produto_id: 'A' }), cfgTom());
  const a2 = T.linhaCopy(of('Album BTS Proof Standard Edition', { produto_id: 'A' }), cfgTom());
  assert.equal(a1, a2);
  assert.match(a1, /BTS|ARMY|K-pop|coleç/i);
  const variadas = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((id) => T.linhaCopy(of('Album BTS Proof', { produto_id: id }), cfgTom())));
  assert.ok(variadas.size >= 3, 'produtos diferentes devem variar a frase');
  // Queda verificada abre as frases de oportunidade; sem comparação, nenhuma candidata fala de preço.
  const comPreco = (o) => T.candidatasCopy(o).filter((c) => /valor|preço|baixou|baixar|enrolando/i.test(c.texto)).length;
  assert.ok(comPreco(of('Album BTS Proof', { categoria: 'kpop', preco: 100, preco_de: 160 })) >= 10);
  assert.equal(T.candidatasCopy(of('Album BTS Proof', { categoria: 'kpop' })).filter((c) => /valor|preço|baixou|cupom/i.test(c.texto)).length, 0);
  // Especificação do título entra como upgrade (60Hz, HD lento), nunca como explicação técnica.
  const monitor = T.candidatasCopy(of('Monitor Gamer LG 27" 180Hz', { preco: 899, preco_de: 1199 })).map((c) => c.texto);
  assert.ok(monitor.includes('180Hz por esse valor é a deixa pra aposentar o monitor de 60Hz de vez.'));
  assert.ok(monitor.every((t) => !/deixa o movimento|mais fluido/i.test(t)));
  assert.ok(T.candidatasCopy(of('SSD Kingston NV2 1TB NVMe M.2')).some((c) => /HD/.test(c.texto)));
  // Cupom: há frases que citam o cupom.
  assert.ok(T.candidatasCopy(of('Controle Sem Fio PS5 DualSense', { cupom: 'GAME10' })).some((c) => /cupom/i.test(c.texto) && /drift|controle|partida|jogatina/i.test(c.texto)));
  // Medicamento: nenhuma linha extra.
  assert.equal(T.linhaCopy(of('Dipirona 500mg 10 comprimidos', { categoria: 'saude' }), cfgTom()), '');
  // copy.tom = nao desliga a camada.
  assert.equal(T.linhaCopy(of('Fritadeira Air Fryer Mondial 4L'), cfgTom([{ chave: 'copy.tom', valor: 'nao' }])), '');
});

test('validarCopy barra urgência, preço, número inventado, link, caixa alta e promessa de saúde', () => {
  const tit = { titulo: 'Monitor Gamer 27" 165Hz' };
  const reprovadas = [
    'Corre que acaba hoje, pessoal.',
    'Só hoje nesse preço maravilhoso.',
    'Agora por R$ 199 na loja oficial.',
    'Está 30% mais barato que ontem.',
    'Os 240Hz deixam tudo bem mais fluido.',
    'Confira em https://loja.com agora.',
    'Pra quem é #ARMY de verdade mesmo.',
    'O MELHOR MONITOR QUE VOCÊ VAI VER.',
    'Ajuda a emagrecer sem esforço nenhum.',
    'Menor preço que já vimos por aqui.',
    'Vem com brinde exclusivo na caixa.',
    'Álbum do BTS nesse valor some rápido, pessoal.',
    'Se faltava na coleção, a hora é agora.',
    'Aquele árabe saindo por menos que muito nacional.',
    'Esse esgota em minutos, fica a dica.',
    'Preço raro pra esse modelo aqui.',
  ];
  for (const r of reprovadas) assert.equal(T.validarCopy(r, tit).ok, false, r);
  // Elogio de preço só com comparação verificada ou cupom.
  const elogio = 'Nesse preço compensa demais deixar de reserva antes que o seu dê drift.';
  assert.match(T.validarCopy(elogio, { titulo: 'Controle', preco: 100 }).motivo, /sem comparação/);
  assert.equal(T.validarCopy(elogio, { titulo: 'Controle', preco: 100, preco_de: 150 }).ok, true);
  assert.equal(T.validarCopy(elogio, { titulo: 'Controle', preco: 100, cupom: 'X' }).ok, true);
  // "60Hz" é referência permitida mesmo fora do título; corrida não é "corre que acaba".
  assert.equal(T.validarCopy('Hora de aposentar o monitor de 60Hz de vez.', tit).ok, true);
  assert.equal(T.validarCopy('Pra quem corre e já sentiu que o tênis velho não aguenta mais.', tit).ok, true);
  assert.deepEqual(T.validarCopy('  "Os 165Hz deixam o jogo bem mais fluido"  ', tit), { ok: true, texto: 'Os 165Hz deixam o jogo bem mais fluido.' });
  assert.deepEqual(T.validarCopy('Pra jogatina render mais 🎮', tit), { ok: true, texto: 'Pra jogatina render mais.' });
  assert.equal(T.validarCopy('Curadoria pra quem gosta de perfume.', tit).ok, true, 'termo proibido não casa dentro de outra palavra');
});

test('pedidoCopyIA: só com IA ligada e chave; nada sensível; chave fora do item; structured output + effort low', () => {
  const o = of('Album BTS Proof Standard Edition', { categoria: 'kpop' });
  assert.equal(T.pedidoCopyIA(o, cfgTom()), null, 'IA desligada por padrão');
  assert.equal(T.pedidoCopyIA(o, cfgTom([{ chave: 'copy.ia', valor: 'sim' }])), null, 'sem chave');
  assert.equal(T.pedidoCopyIA(of('Creatina Growth 250g'), cfgIA()), null, 'suplemento não vai para a IA');
  assert.equal(T.pedidoCopyIA(of('Dipirona 500mg'), cfgIA()), null, 'medicamento não vai para a IA');
  assert.equal(T.pedidoCopyIA(of('Cupons Shopee', { links_manuais: { eh_cupom_loja: true } }), cfgIA()), null);
  assert.equal(T.pedidoCopyIA(of('Album BTS', { links_manuais: { copy_ia: { texto: 'Já tem.' } } }), cfgIA()), null, 'não gera duas vezes');

  const p = T.pedidoCopyIA(o, cfgIA());
  assert.equal(p.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(p.body.model, 'claude-opus-5-5');
  assert.equal(p.body.output_config.effort, 'low');
  assert.equal(p.body.output_config.format.type, 'json_schema');
  assert.deepEqual(p.body.output_config.format.schema.required, ['copy']);
  assert.equal(p.body.fallbacks, 'default');
  assert.equal(p.headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
  assert.equal(p.headers['anthropic-version'], '2026-10-21');
  assert.ok(!JSON.stringify(p).includes('sk-ant-teste'), 'a chave nunca vai no item do n8n');
  assert.ok(!('temperature' in p.body) && !('thinking' in p.body));
  assert.equal(p.body.system, T.SYSTEM_COPY);
  const ficha = p.body.messages[0].content;
  assert.match(ficha, /Grupo: BTS \(fandom: ARMY\)/);
  assert.match(ficha, /Público: fãs de K-pop/);
  assert.doesNotMatch(ficha, /199/, 'a ficha não leva preço (a IA não tem como citar valor)');

  const haiku = T.pedidoCopyIA(o, cfgIA([{ chave: 'copy.ia_modelo', valor: 'claude-haiku-5-5' }]));
  assert.equal(haiku.body.model, 'claude-haiku-5-5');
  assert.ok(!('fallbacks' in haiku.body) && !haiku.headers['anthropic-beta'], 'Haiku não tem fallback no servidor');
  assert.equal(T.pedidoCopyIA(o, cfgIA([{ chave: 'copy.ia_timeout_ms', valor: '999999' }])).timeout, 60000);
});

test('lerCopyIA: aceita só frase válida; recusa, erro, timeout e frase fora da regra caem no fallback', () => {
  const o = of('Album BTS Proof Standard Edition', { categoria: 'kpop' });
  assert.deepEqual(T.lerCopyIA(respClaude('ARMY, esse é daqueles que a estante pede'), o),
    { ok: true, texto: 'ARMY, esse é daqueles que a estante pede.', modelo: 'claude-opus-5-5' });
  assert.match(T.lerCopyIA(respClaude('x', { stop_reason: 'refusal', content: [] }), o).motivo, /recusa/);
  assert.match(T.lerCopyIA(respClaude('x', { stop_reason: 'max_tokens' }), o).motivo, /cortada/);
  assert.match(T.lerCopyIA({ statusCode: 529, body: { type: 'error', error: { type: 'overloaded_error' } } }, o).motivo, /overloaded/);
  assert.match(T.lerCopyIA({ error: { message: 'timeout of 15000ms exceeded' } }, o).motivo, /timeout/);
  assert.match(T.lerCopyIA(null, o).motivo, /sem resposta/);
  assert.match(T.lerCopyIA(respClaude('Corre que é só hoje, ARMY!'), o).motivo, /reprovada/);
  assert.match(T.lerCopyIA(respClaude('Por R$ 89 tá valendo demais.'), o).motivo, /reprovada/);
  // Fallback do servidor (bloco "fallback" antes do texto) continua legível.
  const comFallback = respClaude('Pra coleção de quem é ARMY');
  comFallback.body.content.unshift({ type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-opus-5' } });
  assert.equal(T.lerCopyIA(comFallback, o).ok, true);
});

test('integração nos textos: frase da IA entra no Telegram, no WhatsApp e no card; falha mostra o motivo', () => {
  const cfg = cfgIA();
  const base = { oferta: of('Fritadeira Air Fryer Mondial 4L', { links_manuais: { modo_link: true } }) };
  const comIA = T.aplicarCopyIA(base, respClaude('Facilita o jantar da semana sem encher a pia de louça'), cfg, 1);
  assert.equal(comIA.oferta.links_manuais.copy_ia.texto, 'Facilita o jantar da semana sem encher a pia de louça.');

  const tg = L.textoTelegram(comIA.oferta, 'https://amzn.to/x', cfg).split('\n');
  const iTit = tg.findIndex((l) => /Air Fryer/.test(l));
  assert.equal(tg[iTit + 1], 'Facilita o jantar da semana sem encher a pia de louça.', 'frase logo abaixo do título');
  const wa = L.textoWhatsAppGrupo(comIA.oferta, 'https://amzn.to/x', cfg).split('\n');
  assert.equal(wa[wa.findIndex((l) => /Air Fryer/.test(l)) + 1], 'Facilita o jantar da semana sem encher a pia de louça.');
  assert.match(L.cardAprovacao(comIA.oferta, cfg).text, /Tom \(Casa · IA\): <i>Facilita o jantar/);

  const falhou = T.aplicarCopyIA(base, { error: { message: 'ETIMEDOUT' } }, cfg, 1);
  assert.equal(falhou.oferta.links_manuais.copy_ia, undefined);
  assert.equal(falhou.oferta.links_manuais.copy_ia_falha, 'timeout');
  const tgFalha = L.textoTelegram(falhou.oferta, 'https://amzn.to/x', cfg);
  const linhaFalha = tgFalha.split('\n')[tgFalha.split('\n').findIndex((l) => /Air Fryer/.test(l)) + 1];
  assert.ok(T.candidatasCopy(falhou.oferta).some((c) => c.texto === linhaFalha), 'fallback do banco de frases no lugar da IA');
  assert.match(L.cardAprovacao(falhou.oferta, cfg).text, /banco de frases · IA: timeout/);

  // IA desligada: a entrada passa intacta (sem marcar falha).
  assert.deepEqual(T.aplicarCopyIA(base, null, cfgTom(), 1), base);
  // links_manuais em string (linha da bfx_ofertas) continua string.
  const linha = T.aplicarCopyIA({ oferta: of('Album BTS Proof', { categoria: 'kpop', links_manuais: '{"modo_link":true}' }) }, respClaude('Pra estante de quem é ARMY'), cfg, 1);
  assert.equal(typeof linha.oferta.links_manuais, 'string');
  assert.equal(JSON.parse(linha.oferta.links_manuais).copy_ia.texto, 'Pra estante de quem é ARMY.');
});

test('radar: pedidos limitados por ciclo, respostas aplicadas por plano e gravadas no update da oferta', () => {
  const cfg = cfgIA([{ chave: 'copy.ia_max_por_ciclo', valor: '2' }]);
  const fin = {
    autoPlanos: [
      { oferta: of('Album BTS Proof', { oferta_id: 'R1', categoria: 'kpop' }) },
      { oferta: of('Creatina Growth 250g', { oferta_id: 'R2' }) },
      { oferta: of('SSD Kingston NV2 1TB NVMe', { oferta_id: 'R3' }) },
      { oferta: of('Fritadeira Air Fryer Mondial 4L', { oferta_id: 'R4' }) },
    ],
    reqsShopeeLinks: [],
  };
  const ped = T.pedidosCopyIARadar(fin, cfg);
  assert.deepEqual(ped.map((p) => p.planoIdx), [0, 2], 'pula suplemento e para no limite');
  const fin2 = T.aplicarCopyIARadar(fin, ped, [respClaude('Pra coleção de quem é ARMY'), { error: { message: 'boom' } }], 1);
  assert.equal(fin2.autoPlanos[0].oferta.links_manuais.copy_ia.texto, 'Pra coleção de quem é ARMY.');
  assert.equal(fin2.autoPlanos[2].oferta.links_manuais.copy_ia_falha, 'erro de rede');
  assert.equal(fin2.autoPlanos[3], fin.autoPlanos[3]);
  const ups = T.updatesComCopy([{ oferta_id: 'R1', status: 'aprovada' }, { oferta_id: 'R4', status: 'aprovada' }], fin2);
  assert.equal(JSON.parse(ups[0].links_manuais).copy_ia.texto, 'Pra coleção de quem é ARMY.');
  assert.equal(ups[1].links_manuais, undefined);
});

test('config: chaves novas, padrões seguros e chave da IA protegida no chat', () => {
  const cfg = cfgTom();
  assert.equal(cfg.copy.tom, true);
  assert.equal(cfg.copy.ia, false);
  assert.equal(cfg.copy.ia_modelo, 'claude-opus-5-5');
  const nomes = L.esquema().map((e) => e.chave);
  for (const k of ['copy.tom', 'copy.ia', 'copy.ia_chave', 'copy.ia_modelo', 'copy.ia_timeout_ms', 'copy.ia_max_por_ciclo']) assert.ok(nomes.includes(k), k);
  assert.match(L.interpretarComandoConfig('/config copy.ia_chave sk-ant-x', cfg).mensagem || '', /painel do n8n/);
  assert.equal(cfgTom([{ chave: 'copy.ia_modelo', valor: 'x; rm -rf' }]).copy.ia_modelo, 'claude-opus-5-5', 'modelo inválido ignorado');
});

test('workflows: copy por IA no roteador (antes de gravar a oferta) e no radar (antes de publicar)', () => {
  const b = require(path.join(__dirname, '..', 'build', 'build-workflows.js'));
  const { local } = b.gerar();
  const router = local['01-telegram-router.json'];
  const radar = local['04-radar-ofertas.json'];
  const no = (wf, nome) => wf.nodes.find((n) => n.name === nome);
  const saidas = (wf, nome) => ((wf.connections[nome] || {}).main || []).flat().map((c) => c.node);

  const http = no(router, 'Copy IA (Claude)');
  assert.ok(http && http.onError === 'continueRegularOutput', 'falha da IA não para o fluxo');
  assert.match(http.parameters.jsonHeaders, /'x-api-key': \$\('Config'\)\.first\(\)\.json\.cfg\.copy\.ia_chave/);
  assert.deepEqual(saidas(router, 'Juntar mercado oferta'), ['Frases recentes']);
  assert.deepEqual(saidas(router, 'Frases recentes'), ['Pedir copy IA']);
  assert.match(no(router, 'Juntar copy IA').parameters.jsCode, /atribuirCopyEntrada/);
  assert.match(no(radar, 'Finalizar radar').parameters.jsCode, /atribuirCopyRadar\(LIB\.finalizarRadar\(/);
  assert.deepEqual(saidas(router, 'Juntar copy IA'), ['Histórico do produto']);
  assert.match(no(router, 'Avaliar oferta').parameters.jsCode, /\$\('Juntar copy IA'\)/);
  assert.ok(no(radar, 'Copy IA radar'));
  assert.deepEqual(saidas(radar, 'Auto radar?'), ['Pedir copy radar']);
  assert.deepEqual(saidas(radar, 'Juntar copy radar'), ['Posts recentes radar']);

  // Executa o Code node real "Juntar copy IA" num sandbox com uma resposta simulada da API.
  const cfg = cfgIA();
  const entrada = { rota: 'oferta', oferta: of('Lightstick Stray Kids Ver.2', { categoria: 'kpop', links_manuais: { modo_link: true } }) };
  const ctxNodes = {
    Config: [{ cfg }],
    'Juntar mercado oferta': [entrada],
    'Copy IA (Claude)': [respClaude('Pro próximo show de Stray Kids, ou pra estante, STAY')],
  };
  const ctx = vm.createContext({
    Date, Math, JSON, Intl, Object, Array, String, Number, Boolean, RegExp, Set, Map, Error, parseInt, parseFloat, isNaN, isFinite,
    encodeURIComponent, decodeURIComponent,
    $input: { all: () => [], first: () => ({ json: {} }) },
    $: (nome) => ({ isExecuted: nome in ctxNodes, all: () => (ctxNodes[nome] || []).map((j) => ({ json: j })), first: () => ({ json: (ctxNodes[nome] || [])[0] || {} }) }),
  });
  const out = vm.runInContext(`(function(){\n${no(router, 'Juntar copy IA').parameters.jsCode}\n})()`, ctx);
  assert.equal(out[0].json.oferta.links_manuais.copy_ia.texto, 'Pro próximo show de Stray Kids, ou pra estante, STAY.');
  assert.equal(out[0].json.rota, 'oferta');
});

test('perfumaria: sem promessa de performance nem blind buy no banco, no validador, no prompt e na resposta da IA', () => {
  const RE_PERF = /rastro|fixa|proje|blind|às cegas|sem cheirar|sem erro|sem medo/i;
  // Banco: nenhuma frase de perfume fala de performance ou garante acerto.
  for (const [sub, ctxs] of Object.entries(T.BANCO_COPY.perfumes)) {
    for (const f of Object.values(ctxs).flat()) assert.doesNotMatch(f, RE_PERF, `perfumes/${sub}: "${f}"`);
  }
  // Frases de referência pedidas para o banco árabe.
  const arabe = (extra) => T.candidatasCopy(of('Perfume Lattafa Khamrah Eau de Parfum 100ml', Object.assign({ categoria: 'perfumes' }, extra))).map((c) => c.texto);
  assert.ok(arabe({}).includes('Mais um da leva de perfumaria árabe que costuma chamar atenção na coleção.'));
  assert.ok(arabe({ preco: 100, preco_de: 160 }).includes('Pra quem curte perfumaria árabe e tava esperando baixar pra colocar na coleção.'));
  // Nenhuma das combinações possíveis de perfume promete performance ou compra às cegas.
  for (const ctx of [{}, { preco: 100, preco_de: 160 }, { cupom: 'X' }]) for (const t of arabe(ctx)) assert.doesNotMatch(t, RE_PERF, t);

  // Validador: performance e compra às cegas reprovadas em perfume; "blind buy sem medo" em qualquer nicho.
  const perfume = of('Perfume Lattafa Khamrah EDP 100ml', { categoria: 'perfumes', preco: 100, preco_de: 160 });
  for (const r of [
    'Árabe de rastro marcante nesse valor é blind buy sem medo.',
    'Fixação absurda, dura o dia inteiro na pele.',
    'Projeção de respeito pra quem gosta de ser notado.',
    'Pode ir sem cheirar, esse agrada todo mundo.',
    'Nesse valor dá pra comprar às cegas tranquilo.',
  ]) assert.equal(T.validarCopy(r, perfume).ok, false, r);
  assert.match(T.validarCopy('Blind buy sem medo nesse valor, galera.', of('Fone JBL Tune 520BT', { preco: 100, preco_de: 160 })).motivo, /gosto pessoal/);
  // Proposta/ocasião conhecida (sem performance) passa.
  assert.equal(T.validarCopy('Queridinho de quem curte perfume adocicado pra noite, e nesse valor sai fácil da wishlist.', perfume).ok, true);
  assert.equal(T.validarCopy('Mais fresco pro dia a dia, bom pra quem quer variar do perfume de sempre.', perfume).ok, true);

  // Prompt: regra de gosto pessoal e régua sem performance/blind; ficha de perfume leva o aviso.
  assert.match(T.SYSTEM_COPY, /alta certeza/);
  assert.match(T.SYSTEM_COPY, /Nunca prometa fixação, projeção, rastro ou duração/);
  const regua = T.SYSTEM_COPY.slice(T.SYSTEM_COPY.indexOf('Régua de naturalidade'));
  assert.doesNotMatch(regua, /rastro|fixa|proje|blind/i);
  const p = T.pedidoCopyIA(perfume, cfgIA());
  assert.match(p.body.messages[0].content, /Gosto pessoal: só cite proposta ou ocasião se reconhecer este perfume com alta certeza/);
  assert.doesNotMatch(p.body.messages[0].content.split('\nEvite:')[0], /blind|rastro|proje|fixa/i, 'vocabulário sugerido não puxa performance');
  assert.doesNotMatch(T.pedidoCopyIA(of('Fritadeira Air Fryer Mondial 4L'), cfgIA()).body.messages[0].content, /Gosto pessoal/);

  // Resposta da IA prometendo performance cai no fallback.
  assert.match(T.lerCopyIA(respClaude('Projeção absurda saindo por esse valor, blind buy sem medo'), perfume).motivo, /reprovada/);
});

test('IA: prompt pede variedade e laço com a turma; a ficha leva as frases que já saíram (recentes + lote)', () => {
  assert.match(T.SYSTEM_COPY, /Cada post precisa soar diferente/);
  assert.match(T.SYSTEM_COPY, /Crie laço com quem lê/);
  const cfg = cfgIA();
  const a = of('Album BTS Proof Standard Edition', { oferta_id: 'A1', produto_id: 'a1', categoria: 'kpop', preco: 100, preco_de: 160 });
  const b = of('Stray Kids - Album Mini Ver. A', { oferta_id: 'A2', produto_id: 'a2', categoria: 'kpop', preco: 100, preco_de: 160 });
  const recente = of('TWICE - Album Ver. B', { oferta_id: 'R1', categoria: 'kpop', ts: 5, links_manuais: JSON.stringify({ copy_ia: { texto: 'ONCE, olha isso aqui que apareceu.' } }) });
  const perfume = of('Perfume Lattafa Yara EDP', { oferta_id: 'R2', categoria: 'perfumes', ts: 6, links_manuais: JSON.stringify({ copy_tom: { texto: 'Pra quem acompanha perfumaria árabe de perto. Vale conferir as notas antes de decidir.', chaves: [] } }) });
  const fin = T.atribuirCopyRadar({ autoPlanos: [{ oferta: a }, { oferta: b }], ofertasNovas: [] }, [recente, perfume]);
  const ped = T.pedidosCopyIARadar(fin, cfg, [recente, perfume]);
  const ficha = ped[0].http.body.messages[0].content;
  assert.match(ficha, /Frases que já saíram nos últimos posts desse nicho/);
  assert.ok(ficha.includes('ONCE, olha isso aqui que apareceu.'), 'frase recente do mesmo nicho');
  assert.ok(ficha.includes(fin.autoPlanos[1].oferta.links_manuais.copy_tom.texto), 'frase da outra oferta do lote');
  assert.ok(!ficha.includes('perfumaria árabe de perto'), 'frase de outro nicho não entra');
  // Roteador: frasesRecentes filtra pelo nicho e devolve as mais novas primeiro.
  assert.deepEqual(T.frasesRecentes([recente, perfume], a, 5), ['ONCE, olha isso aqui que apareceu.']);
});
