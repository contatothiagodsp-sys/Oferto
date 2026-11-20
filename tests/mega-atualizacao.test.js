'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lib');
const RF = require('../lib/radar-fontes');

const AGORA = Date.UTC(2026, 10, 20, 15, 0, 0);

function cfgBase(extras) {
  return L.montarConfig([
    { chave: 'admins', valor: '111' },
    { chave: 'bot_token', valor: 'TOKEN_ADM' },
    { chave: 'bot_token_grupo', valor: 'TOKEN_PUB' },
    { chave: 'grupo_id', valor: '-1001234567890' },
    { chave: 'webhook_secret', valor: 'segredo' },
    { chave: 'n8n_webhook_url', valor: 'https://x.trycloudflare.com/webhook/telegram-ofertas' },
    { chave: 'bot_grupo_username', valor: 'oferto_pub_bot' },
    { chave: 'publicacao.dry_run', valor: 'nao' },
    { chave: 'radar.publicar_direto', valor: 'sim' },
    ...(extras || []),
  ]);
}

test('Mega atualização: 14 categorias/tópicos/canais exatos, detecção de canal, nomes no Telegram e boas-vindas', () => {
  const chavesEsperadas = [
    'top', 'saude', 'auto', 'beleza', 'perfumes', 'tech', 'bebe', 'casa',
    'moda', 'kpop', 'pet', 'livros', 'papelaria', 'mercado',
  ];
  assert.deepEqual(Object.keys(L.CATEGORIAS), chavesEsperadas);
  assert.deepEqual(Object.keys(L.CANAIS_SUGERIDOS), chavesEsperadas);

  const cfg = cfgBase();
  for (const k of chavesEsperadas) {
    const sug = L.CANAIS_SUGERIDOS[k];
    assert.ok(sug.nome.startsWith('Ofertô • '), `Nome sugerido de ${k} deve começar com Ofertô •`);
    assert.equal(L.detectarCategoriaCanal(sug.nome, ''), k, `detectarCategoriaCanal falhou para ${sug.nome}`);
    const bv = L.textoBoasVindasCanal(k, cfg);
    assert.match(bv, /#publi/);
    assert.match(bv, /\/alerta/);
    assert.ok(bv.length <= 4096);
  }

  // createForumTopic e editForumTopic usam o nome completo "Ofertô • ..." sem truncar
  const setup = L.setupChamadas(cfg);
  const criacoes = setup.chamadas.filter((c) => c.metodo === 'createForumTopic');
  assert.equal(criacoes.length, 14);
  for (const ch of criacoes) {
    const k = ch.ref.topico;
    const sug = L.CANAIS_SUGERIDOS[k];
    assert.equal(ch.payload.name, `${L.CATEGORIAS[k].emoji} ${sug.nome}`);
  }
  const cfgAtualizar = cfgBase([
    { chave: 'grupo.textos', valor: 'atualizar' },
    ...chavesEsperadas.map((k, i) => ({ chave: `topico.${k}`, valor: String(100 + i) })),
  ]);
  const renomeios = L.arrumarGrupoChamadas(cfgAtualizar, [], true).filter((c) => c.metodo === 'editForumTopic');
  assert.equal(renomeios.length, 14);
  assert.ok(renomeios.some((c) => c.payload.name === '✨ Ofertô • Perfumaria'));
  assert.ok(renomeios.some((c) => c.payload.name === '💄 Ofertô • Beleza & Autocuidado'));
  assert.ok(renomeios.some((c) => c.payload.name === '💊 Ofertô • Saúde & Bem-estar'));

  // "perfumes" resolve para perfumes (tópico próprio Ofertô • Perfumaria)
  assert.equal(L.resolverCategoriaCfg('perfumes', cfg), 'perfumes');
  assert.equal(L.resolverCategoriaCfg('perfumaria', cfg), 'perfumes');
  assert.equal(L.resolverCategoriaCfg('auto', cfg), 'auto');
  assert.equal(L.resolverCategoriaCfg('pet', cfg), 'pet');
  assert.equal(L.resolverCategoriaCfg('livros', cfg), 'livros');
  assert.equal(L.resolverCategoriaCfg('papelaria', cfg), 'papelaria');
  assert.equal(L.resolverCategoriaCfg('mercado', cfg), 'mercado');

  // Config com radar.categorias preservando perfumes separado de beleza
  const cfgCats = cfgBase([{ chave: 'radar.categorias', valor: 'moda,perfumes,pet,auto' }]);
  assert.deepEqual(cfgCats.radar.categorias, ['moda', 'perfumes', 'pet', 'auto']);

  // Comandos /radar para os novos nichos
  assert.deepEqual(L.interpretarComandoRadar('/radar auto', cfg).categorias, ['auto']);
  assert.deepEqual(L.interpretarComandoRadar('/radar pet', cfg).categorias, ['pet']);
  assert.deepEqual(L.interpretarComandoRadar('/radar livros', cfg).categorias, ['livros']);
  assert.deepEqual(L.interpretarComandoRadar('/radar papelaria', cfg).categorias, ['papelaria']);
  assert.deepEqual(L.interpretarComandoRadar('/radar mercado', cfg).categorias, ['mercado']);
});

test('Mega atualização: classificação precisa nos 12 nichos de produtos + desambiguação de borda', () => {
  const cfg = cfgBase();
  const casos = [
    // Saúde & Bem-estar
    ['Creatina Monohidratada 300g Max Titanium', 'saude'],
    ['Emplastro Salonpas Grande 20 Unidades', 'saude'],
    ['Inalador Nebulizador Omron Compacto', 'saude'],
    ['Escova Elétrica Oral-B Vitality 100', 'saude'],
    // Auto & Moto
    ['Cera Automotiva Carnaúba Vonixx Blend 500ml', 'auto'],
    ['Calibrador de Pneu Portátil Compressor Digital Carro e Moto', 'auto'],
    ['Capacete Moto Fechado LS2 FF358 Preto', 'auto'],
    ['Tapete Automotivo Borracha Universal 4 Peças', 'auto'],
    ['Aspirador Automotivo Portátil 12V para Carro', 'auto'],
    // Beleza & Autocuidado (sem perfumes) vs Perfumaria (separado)
    ['Perfume Árabe Lattafa Khamrah Eau de Parfum 100ml', 'perfumes'],
    ['Protetor Solar Facial La Roche-Posay Anthelios FPS 60', 'beleza'],
    ['Body Splash Victoria s Secret Bare Vanilla 250ml', 'perfumes'],
    // Tech & Games
    ['SSD NVMe Kingston 1TB PCIe 4.0', 'tech'],
    ['Console PlayStation 5 Slim 1TB + DualSense', 'tech'],
    ['Kindle 11ª Geração 16GB Tela 6"', 'tech'],
    // Bebês & Família
    ['Fralda Pampers Confort Sec G 112 Unidades', 'bebe'],
    ['Carrinho de Bebê Burigotto Passeio Dobrável', 'bebe'],
    // Casa & Eletro
    ['Air Fryer Mondial 5L Preta 1900W', 'casa'],
    ['Cafeteira Expresso Nespresso Essenza Mini Preta', 'casa'],
    ['Garrafa Térmica Stanley Classic 950ml', 'casa'],
    // Moda & Estilo
    ['Tênis Nike Pegasus 41 Masculino Corrida', 'moda'],
    ['Camisa Polo Ralph Lauren Masculina Algodão', 'moda'],
    // K-Pop & Colecionáveis
    ['Álbum Stray Kids ATE Mini Album Oficial Lacrado', 'kpop'],
    ['Lightstick BTS ARMY Bomb Map of the Soul', 'kpop'],
    // Mundo Pet
    ['Ração Golden Fórmula Cães Adultos Frango e Arroz 15kg', 'pet'],
    ['Tapete Higiênico Super Secão 30 Unidades para Cães', 'pet'],
    ['Areia Sanitária para Gatos Pipicat Classic 12kg', 'pet'],
    ['Shampoo Pet Neutro para Cães e Gatos 500ml', 'pet'],
    // Livros & Leitura
    ['Box Livros Trilogia O Senhor dos Anéis Capa Dura', 'livros'],
    ['Mangá Jujutsu Kaisen Vol. 1 Panini', 'livros'],
    ['Livro Hábitos Atômicos James Clear Capa Comum', 'livros'],
    // Papelaria & Criatividade
    ['Caderno Inteligente Grande 80 Folhas', 'papelaria'],
    ['Kit Caneta Stabilo Point 88 20 Cores', 'papelaria'],
    ['Rotulador Eletrônico Etiquetadora Brother P-Touch', 'papelaria'],
    ['Lápis de Cor Faber-Castell EcoLápis 48 Cores', 'papelaria'],
    // Mercado & Sabores
    ['Azeite Extra Virgem Andorinha Vidro 500ml', 'mercado'],
    ['Kit 50 Cápsulas de Café Nespresso Intenso', 'mercado'],
    ['Pack 12 Latas Cerveja Heineken 350ml', 'mercado'],
    ['Energético Monster Energy Zero Ultra Pack 6 Latas', 'mercado'],
    ['Café em Grão Orfeu Clássico 1kg', 'mercado'],
  ];
  for (const [titulo, esperado] of casos) {
    const res = L.classificarCategoria(titulo, cfg);
    assert.equal(res.categoria, esperado, `Esperava ${esperado} para "${titulo}", veio ${res.categoria}`);
    assert.ok(res.confianca > 0, `Confiança deve ser > 0 para "${titulo}"`);
  }
});

test('Mega atualização: arrumarGrupoChamadas em modo atualizar renomeia tópicos e fixa novos tópicos', () => {
  const topicosExistentes = {
    top: 10, saude: 11, beleza: 12, tech: 13, bebe: 14, casa: 15, moda: 16, kpop: 17,
  };
  const topicosNovos = [
    { chave: 'topico.auto', valor: '18' },
    { chave: 'topico.pet', valor: '19' },
    { chave: 'topico.livros', valor: '20' },
    { chave: 'topico.papelaria', valor: '21' },
    { chave: 'topico.mercado', valor: '22' },
  ];
  const mensagensAntigas = {
    comece: 100, seguranca: 101,
    top: 200, saude: 201, beleza: 202, tech: 203, bebe: 204, casa: 205, moda: 206, kpop: 207,
  };
  const cfg = cfgBase([
    ...Object.entries(topicosExistentes).map(([k, v]) => ({ chave: `topico.${k}`, valor: String(v) })),
    { chave: 'grupo.textos', valor: 'atualizar' },
    { chave: 'grupo.mensagens', valor: JSON.stringify(mensagensAntigas) },
  ]);

  const chamadas = L.arrumarGrupoChamadas(cfg, topicosNovos);
  const renames = chamadas.filter((c) => c.metodo === 'editForumTopic');
  assert.equal(renames.length, 13, 'Deve renomear/alinhar os 13 tópicos existentes/criados nesta lista');
  assert.ok(renames.some((c) => c.payload.message_thread_id === 10 && c.payload.name === '🔥 Ofertô • Ofertas & Achadinhos Gerais'));
  assert.ok(renames.some((c) => c.payload.message_thread_id === 12 && c.payload.name === '💄 Ofertô • Beleza & Autocuidado'));
  assert.ok(renames.some((c) => c.payload.message_thread_id === 18 && c.payload.name === '🚗 Ofertô • Auto & Moto'));

  const edits = chamadas.filter((c) => c.metodo === 'editMessageText');
  assert.equal(edits.length, 10, 'Edita comece, seguranca e os 8 tópicos que já tinham mensagem');

  const novosPins = chamadas.filter((c) => c.metodo === 'sendMessage' && c.ref && c.ref.fixar);
  assert.deepEqual(novosPins.map((c) => c.ref.chave), ['auto', 'pet', 'livros', 'papelaria', 'mercado']);
  for (const ch of novosPins) {
    assert.match(ch.payload.text, /afiliado/i);
  }
});

test('Mega atualização: base extensa de copy custo zero cobre novos nichos, passa validarCopy e não repete', () => {
  const amostras = [
    { titulo: 'Cera Automotiva Vonixx Blend 500ml', categoria: 'auto', nicho: 'auto', sub: 'limpeza_auto' },
    { titulo: 'Capacete Moto LS2 FF358 Preto', categoria: 'auto', nicho: 'auto', sub: 'moto' },
    { titulo: 'Calibrador de Pneu Portátil Digital', categoria: 'auto', nicho: 'auto', sub: 'carro' },
    { titulo: 'Box Livros Senhor dos Anéis Capa Dura', categoria: 'livros', nicho: 'livros', sub: 'box' },
    { titulo: 'Mangá One Piece Vol 100 Panini', categoria: 'livros', nicho: 'livros', sub: 'manga' },
    { titulo: 'Livro Hábitos Atômicos Negócios', categoria: 'livros', nicho: 'livros', sub: 'negocios' },
    { titulo: 'Caderno Inteligente Grande 80 Folhas', categoria: 'papelaria', nicho: 'papelaria', sub: 'estudo' },
    { titulo: 'Kit Aquarela e Brush Pen Lettering', categoria: 'papelaria', nicho: 'papelaria', sub: 'arte' },
    { titulo: 'Etiquetadora Rotulador Brother P-Touch', categoria: 'papelaria', nicho: 'papelaria', sub: 'escritorio' },
    { titulo: 'Cápsulas de Café Nespresso Kit 50', categoria: 'mercado', nicho: 'mercado', sub: 'cafe' },
    { titulo: 'Pack Cerveja Heineken 12 Latas', categoria: 'mercado', nicho: 'mercado', sub: 'bebidas' },
    { titulo: 'Azeite Extra Virgem Gallo 500ml', categoria: 'mercado', nicho: 'mercado', sub: 'despensa' },
    { titulo: 'Shampoo Pet Neutro para Cães 500ml', categoria: 'pet', nicho: 'pet', sub: 'higiene' },
    { titulo: 'Garrafa Térmica Stanley 950ml', categoria: 'casa', nicho: 'casa', sub: 'garrafa' },
    { titulo: 'Power Bank Anker 10000mAh USB-C', categoria: 'tech', nicho: 'tech', sub: 'carregador' },
  ];

  for (const a of amostras) {
    const det = L.detectarNicho(a);
    assert.equal(det.nicho, a.nicho, `Nicho esperado ${a.nicho} para "${a.titulo}", veio ${det.nicho}`);
    assert.equal(det.sub, a.sub, `Subnicho esperado ${a.sub} para "${a.titulo}", veio ${det.sub}`);

    for (const ctxOferta of [
      { preco: 100 },
      { preco: 70, min90: 100, desconto_pct: 30 },
      { preco: 70, min90: 100, desconto_pct: 30, cupom: 'PROMO10' },
    ]) {
      const of = Object.assign({ produto_id: 'p_test', loja: 'amazon' }, a, ctxOferta);
      const cands = L.candidatasCopy(of);
      assert.ok(cands.length >= 15, `Esperava >= 15 candidatas válidas para ${a.nicho}/${a.sub}, veio ${cands.length}`);
      for (const c of cands) {
        const v = L.validarCopy(c.texto, of);
        assert.equal(v.ok, true, `Frase inválida em ${a.nicho}/${a.sub}: "${c.texto}" (${v.motivo})`);
      }
    }
  }

  // Stress anti-repetição: 15 posts seguidos no mesmo nicho devem gerar 15 frases únicas
  const uso = new Map();
  const geradas = new Set();
  for (let i = 0; i < 15; i++) {
    const of = {
      oferta_id: `o_liv_${i}`, produto_id: `amz_LIV${i}`, loja: 'amazon', categoria: 'livros',
      titulo: `Livro Ficção Fantasia Volume ${i + 1}`, preco: 39.9, min90: 69.9, desconto_pct: 42,
    };
    const atribuida = L.atribuirCopyTom(of, uso);
    const txt = L.linhaCopy(atribuida, cfgBase(), false);
    assert.ok(txt.length >= 15);
    assert.ok(!geradas.has(txt), `Frase repetida na iteração ${i}: ${txt}`);
    geradas.add(txt);
  }
  assert.equal(geradas.size, 15);
});

test('Mega atualização: LLM custo zero (Ollama local sem chave + Groq/Gemini OpenAI-compat) e fallback', () => {
  const oferta = {
    oferta_id: 'o_ia_free_1', produto_id: 'amz_B0AUTO01', loja: 'amazon', categoria: 'auto',
    titulo: 'Calibrador de Pneu Portátil Digital Carro e Moto', preco: 129.9, min90: 199.9, desconto_pct: 35,
  };

  // 1) Ollama local: funciona SEM chave (custo R$ 0)
  const cfgOllama = cfgBase([
    { chave: 'copy.ia', valor: 'sim' },
    { chave: 'copy.ia_provedor', valor: 'ollama' },
    { chave: 'copy.ia_modelo', valor: 'qwen2.5:7b' },
    { chave: 'copy.ia_api', valor: 'http://host.docker.internal:11434/v1/chat/completions' },
  ]);
  const pedOllama = L.pedidoCopyIA(oferta, cfgOllama, []);
  assert.ok(pedOllama, 'Ollama local deve montar pedido mesmo sem copy.ia_chave');
  assert.equal(pedOllama.auth_header, '');
  assert.equal(pedOllama.body.model, 'qwen2.5:7b');
  assert.equal(pedOllama.body.messages[0].role, 'system');

  // 2) Groq/Gemini/OpenRouter: usa Authorization: Bearer e parseia choices[0].message.content (inclusive com ```json)
  const cfgGroq = cfgBase([
    { chave: 'copy.ia', valor: 'sim' },
    { chave: 'copy.ia_chave', valor: 'gsk_teste_gratis' },
    { chave: 'copy.ia_modelo', valor: 'llama-3.3-70b-versatile' },
    { chave: 'copy.ia_api', valor: 'https://api.groq.com/openai/v1/chat/completions' },
  ]);
  const pedGroq = L.pedidoCopyIA(oferta, cfgGroq, []);
  assert.ok(pedGroq);
  assert.equal(pedGroq.auth_header, 'Authorization');
  assert.equal(pedGroq.auth_prefix, 'Bearer ');

  const respGroq = {
    statusCode: 200,
    body: {
      model: 'llama-3.3-70b-versatile',
      choices: [{
        finish_reason: 'stop',
        message: { content: '```json\n{"copy": "Pra nunca mais ficar na mão com pneu murcho na estrada."}\n```' },
      }],
    },
  };
  const lida = L.lerCopyIA(respGroq, oferta);
  assert.equal(lida.ok, true);
  assert.equal(lida.texto, 'Pra nunca mais ficar na mão com pneu murcho na estrada.');
  assert.equal(lida.modelo, 'llama-3.3-70b-versatile');

  // 3) Frase reprovada por urgência falsa continua barrada mesmo vindo de LLM gratuita
  const respRuim = {
    statusCode: 200,
    body: { choices: [{ message: { content: '{"copy": "Corre que vai acabar só hoje!"}' } }] },
  };
  const lidaRuim = L.lerCopyIA(respRuim, oferta);
  assert.equal(lidaRuim.ok, false);
  assert.match(lidaRuim.motivo, /reprovada/);
});

test('Mega atualização: Radar planeja fontes reais (Amazon 1P + Promobit) para os novos nichos', () => {
  const cfg = cfgBase();
  for (const cat of ['auto', 'pet', 'livros', 'papelaria', 'mercado']) {
    assert.ok(RF.FONTES_CAT_PB[cat] && RF.FONTES_CAT_PB[cat].length >= 1, `FONTES_CAT_PB deve cobrir ${cat}`);
    assert.ok(RF.BUSCAS_AMAZON_NICHO.some((q) => q.cat === cat), `BUSCAS_AMAZON_NICHO deve cobrir ${cat}`);
    const plan = L.planejarFontesRadar(cfg, { modo: 'comando', categorias: [cat], ts: AGORA });
    assert.ok(plan.fontesWeb.some((f) => f.categoria_hint === cat), `planejarFontesRadar deve incluir fontes para ${cat}`);
  }
  // Slugs Promobit reais (HTTP 200 verificados)
  assert.ok(RF.FONTES_CAT_PB.auto[0].includes('pecas-e-acessorios-para-automoveis'));
  assert.ok(RF.FONTES_CAT_PB.pet[0].includes('/petshop/'));
  assert.ok(RF.FONTES_CAT_PB.livros[0].includes('livros-ebooks-e-ereaders'));
  assert.ok(RF.FONTES_CAT_PB.papelaria[0].includes('papelaria-e-material-de-escritorio'));
  assert.ok(RF.FONTES_CAT_PB.mercado[0].includes('supermercado-e-delivery'));
});

test('Regressões auditoria: /canais nomes, /buscas novos nichos, escopo de cupons, classificação de borda, tom auto/papelaria e defaults de LLM', () => {
  const cfg = cfgBase();

  // 1) /canais nomes deve listar todos os 14 canais (incluindo Perfumaria)
  const rNomes = L.interpretarComandoConfig('/canais nomes', cfg);
  assert.equal(rNomes.upserts.length, 14);
  assert.match(rNomes.mensagem, /Perfumaria/);
  assert.match(rNomes.mensagem, /Auto & Moto/);
  assert.match(rNomes.mensagem, /Mundo Pet/);
  assert.match(rNomes.mensagem, /Mercado & Sabores/);

  // 2) /buscas <novo_nicho> salva em shopee.busca.<cat> (e não em radar.palavras)
  for (const cat of ['auto', 'pet', 'livros', 'papelaria', 'mercado']) {
    const rBusca = L.interpretarComandoConfig(`/buscas ${cat} termo1; termo2`, cfg);
    assert.equal(rBusca.upserts[0].chave, `shopee.busca.${cat}`);
  }

  // 3) Classificação de borda (suplemento pet, cercadinho pet, planner capa dura)
  assert.equal(L.classificarCategoria('Suplemento Vitamínico Organnact Dog Tabs para Cães', cfg).categoria, 'pet');
  assert.equal(L.classificarCategoria('Cercadinho Portão de Proteção para Cachorro Pet', cfg).categoria, 'pet');
  assert.equal(L.classificarCategoria('Planner Semanal 2026 Cicero Capa Dura Espiral', cfg).categoria, 'papelaria');

  // 4) Escopo de cupons para os novos nichos e lojas especializadas
  assert.equal(L.detectarEscopoCupom('Cupom 20% OFF na Petz', '', 'petz').principal, 'pet');
  assert.equal(L.detectarEscopoCupom('Cupom 15% OFF PneuStore', '', 'pneustore').principal, 'auto');
  assert.equal(L.detectarEscopoCupom('Cupom supermercado 20% OFF no ML', '', 'ml').principal, 'mercado');
  assert.equal(L.detectarEscopoCupom('Cupom só em livros na Amazon', '', 'amazon').principal, 'livros');

  // 5) Tom de voz: Aspirador Automotivo -> auto.limpeza_auto; Suporte Celular Veicular -> auto.carro; Planner Capa Dura -> papelaria.estudo
  assert.equal(L.detectarNicho({ titulo: 'Aspirador Automotivo 12V Portátil Carro', categoria: 'auto' }).nicho, 'auto');
  assert.equal(L.detectarNicho({ titulo: 'Suporte para Celular Veicular Magnético Carro', categoria: 'auto' }).nicho, 'auto');
  assert.equal(L.detectarNicho({ titulo: 'Planner Semanal 2026 Cicero Capa Dura', categoria: 'papelaria' }).nicho, 'papelaria');

  // 6) LLM custo zero: configurar só copy.ia_provedor=groq (ou ollama) sem sobrescrever ia_api/ia_modelo usa defaults do provedor
  const ofAuto = { oferta_id: 'o_1', produto_id: 'amz_1', loja: 'amazon', categoria: 'auto', titulo: 'Calibrador de Pneu Digital', preco: 99, min90: 149 };
  const cfgGroqMin = cfgBase([
    { chave: 'copy.ia', valor: 'sim' },
    { chave: 'copy.ia_provedor', valor: 'groq' },
    { chave: 'copy.ia_chave', valor: 'gsk_minimo' },
  ]);
  const pedGroqMin = L.pedidoCopyIA(ofAuto, cfgGroqMin, []);
  assert.ok(pedGroqMin);
  assert.equal(pedGroqMin.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(pedGroqMin.body.model, 'llama-3.3-70b-versatile');

  // 7) lerCopyIA remove tags <think>...</think> de modelos gratuitos com raciocínio
  const respThink = {
    statusCode: 200,
    body: {
      model: 'deepseek-r1',
      choices: [{ message: { content: '<think>pensando na frase...</think>\n{"copy": "Pra nunca mais ficar na mão com pneu murcho na estrada."}' } }],
    },
  };
  const lidaThink = L.lerCopyIA(respThink, ofAuto);
  assert.equal(lidaThink.ok, true);
  assert.equal(lidaThink.texto, 'Pra nunca mais ficar na mão com pneu murcho na estrada.');

  // 8) parseOferta aceita apelidos dos novos nichos (moto -> auto, racao -> pet, supermercado -> mercado)
  const poMoto = L.parseOferta('/oferta moto\nhttps://www.amazon.com.br/dp/B0TEST1234\nCapacete Moto\npreço 299,90', cfg);
  assert.equal(poMoto.ok, true);
  assert.equal(poMoto.oferta.categoria, 'auto');
});

test('Pré-lançamento: VTEX Pix+parcelamento sem juros, copy de combos, vitaminas/saúde sempre com copy e tags no final', () => {
  const cfg = cfgBase();

  // 1) VTEX Installments: extrai Pix mais barato + parcelamento sem juros (ignora com juros e cartão próprio)
  const vtexMock = [{
    productId: '99881',
    productName: 'Monitor Samsung ViewFinity S7 32" 4K + Tablet Samsung Galaxy Tab S10 FE+ 128GB',
    linkText: 'combo-monitor-tablet-samsung',
    categories: ['/Informática/Monitores/'],
    items: [{
      images: [{ imageUrl: 'https://samsungbrshop.vtexassets.com/arquivos/ids/123456/combo.jpg' }],
      sellers: [{
        sellerId: '1',
        commertialOffer: {
          AvailableQuantity: 5,
          Price: 5095.84,
          ListPrice: 7798.0,
          Installments: [
            { PaymentSystemName: 'Pix', NumberOfInstallments: 1, Value: 4841.05, TotalValuePlusInterestRate: 4841.05, InterestRate: 0 },
            { PaymentSystemName: 'Visa', NumberOfInstallments: 12, Value: 424.65, TotalValuePlusInterestRate: 5095.84, InterestRate: 0 },
            { PaymentSystemName: 'Visa', NumberOfInstallments: 18, Value: 330.0, TotalValuePlusInterestRate: 5940.0, InterestRate: 1.99 },
            { PaymentSystemName: 'Cartão Samsung Itaú', NumberOfInstallments: 24, Value: 212.33, TotalValuePlusInterestRate: 5095.84, InterestRate: 0 },
          ],
        },
      }],
    }],
  }];
  const itensVtex = L.lerCatalogoVtex(vtexMock, { loja: 'samsung', categoria_hint: 'tech', origin: 'https://shop.samsung.com/br' });
  assert.equal(itensVtex.length, 1);
  assert.equal(itensVtex[0].preco, 4841.05);
  assert.equal(itensVtex[0].pix, true);
  assert.equal(itensVtex[0].preco_parcelado, 5095.84);
  assert.equal(itensVtex[0].parcelamento, 'Em até 12x de R$ 424,65 sem juros');

  // 2) Copy de Combo entende o conjunto como um todo (não fala só de monitor/tela)
  const detCombo = L.detectarNicho({ titulo: itensVtex[0].titulo, categoria: 'tech' });
  assert.equal(detCombo.nicho, 'combo');
  const copyCombo = L.linhaCopy({
    titulo: itensVtex[0].titulo, categoria: 'tech', preco: 4841.05, preco_de: 7798, loja: 'samsung',
  }, cfg, true);
  assert.ok(copyCombo.length > 10, 'Combo deve receber copy');
  assert.doesNotMatch(copyCombo, /\b(?:tela|monitor)\b/i, 'Copy de combo não deve falar só de monitor');

  // 3) Vitaminas, suplementos e itens de saúde/bem-estar sempre recebem copy; medicamento continua sem copy
  for (const tit of [
    'Vitamina C 1000mg 60 Comprimidos Efervescentes',
    'Suplemento Alimentar Magnésio Dimalato 500mg 120 Cápsulas',
    'Multivitamínico Lavitan A-Z 60 Comprimidos',
    'Inalador Nebulizador Omron Compacto',
  ]) {
    const c = L.linhaCopy({ titulo: tit, categoria: 'saude', preco: 49.9, preco_de: 79.9, loja: 'drogaraia' }, cfg, true);
    assert.ok(c.length > 10, `Esperava copy para "${tit}", veio vazio`);
  }
  assert.equal(L.linhaCopy({ titulo: 'Dipirona 500mg 10 comprimidos', categoria: 'saude', preco: 9.9, loja: 'drogaraia' }, cfg, true), '');

  // 4) Post formatado do combo com Pix + parcelado + campanha: tags SOMENTE no final
  const postTg = L.textoTelegram({
    oferta_id: 'o_combo_1', loja: 'samsung', categoria: 'tech',
    titulo: itensVtex[0].titulo, preco: 4841.05,
    links_manuais: {
      preco_de: 7798, pix: true,
      parcelamento: 'Em até 12x de R$ 424,65 sem juros',
      preco_parcelado: 5095.84,
      campanha: 'BLACK FRIDAY',
    },
  }, 'https://shop.samsung.com/br/combo', cfg);
  const ls = postTg.split('\n');
  assert.doesNotMatch(ls[0], /#BlackFriday|#publi/);
  assert.equal(ls[ls.length - 1], '#BlackFriday #publi');
  assert.match(postTg, /💠 PIX/);
  assert.match(postTg, /12x de R\$ 424,65 sem juros/);
  assert.match(postTg, /total R\$ 5\.095,84/);
});


test('Regressão pré-lançamento: homônimos (Blusa Sem Manga FARM Rio ≠ Mangá), trava de loja especialista, combos sem "+", suplementos mg e cupons', () => {
  const cfg = cfgBase();

  // 1) Blusa Sem Manga Estampada Festa Na Selva (FARM Rio) -> moda, NUNCA livros nem badge MANGÁ & HQ
  const clsBlusa = L.classificarCategoria('Blusa Sem Manga Estampada Festa Na Selva', cfg, '', 'farmrio');
  assert.equal(clsBlusa.categoria, 'moda');
  const clsBlusaSemLoja = L.classificarCategoria('Blusa Sem Manga Estampada Festa Na Selva', cfg);
  assert.equal(clsBlusaSemLoja.categoria, 'moda');
  const postBlusa = L.textoTelegram({
    oferta_id: 'o_farm_1', loja: 'farmrio', categoria: clsBlusa.categoria,
    titulo: 'Blusa Sem Manga Estampada Festa Na Selva', preco: 189.9,
    links_manuais: { preco_de: 298 },
  }, 'https://www.farmrio.com.br/blusa-sem-manga', cfg);
  assert.doesNotMatch(postBlusa, /MANGÁ & HQ|Livros & Leitura/i);
  assert.match(postBlusa, /Moda &amp; Estilo/);

  // Mangá de verdade continua em livros com badge MANGÁ & HQ
  const clsManga = L.classificarCategoria('Mangá One Piece Vol. 105 Panini', cfg);
  assert.equal(clsManga.categoria, 'livros');
  const postManga = L.textoTelegram({
    oferta_id: 'o_manga_1', loja: 'amazon', categoria: 'livros',
    titulo: 'Mangá One Piece Vol. 105 Panini', preco: 29.9,
    links_manuais: { preco_de: 39.9 },
  }, 'https://www.amazon.com.br/dp/B0MANGA105', cfg);
  assert.match(postManga, /MANGÁ &amp; HQ/);

  // 2) Outros homônimos perigosos entre os 14 nichos
  assert.equal(L.classificarCategoria('Whey Protein Concentrado 900g Sabor Chocolate', cfg).categoria, 'saude');
  assert.equal(L.classificarCategoria('Creatina Monohidratada 300g Sabor Manga', cfg).categoria, 'saude');
  assert.equal(L.classificarCategoria('Óleo de Motor 5W30 Sintético Mobil 1L', cfg).categoria, 'auto');
  assert.equal(L.classificarCategoria('Óleo Capilar Reparador Elseve 100ml', cfg).categoria, 'beleza');
  assert.equal(L.classificarCategoria('Azeite Extra Virgem Gallo 500ml', cfg).categoria, 'mercado');
  assert.equal(L.classificarCategoria('Fonte Bebedouro para Gatos 2L', cfg).categoria, 'pet');
  assert.equal(L.classificarCategoria('Fonte 650W 80 Plus Bronze PC Gamer', cfg).categoria, 'tech');
  assert.equal(L.classificarCategoria('Vela de Ignição NGK Iridium', cfg).categoria, 'auto');
  assert.equal(L.classificarCategoria('Capa de Banco Automotivo Couro Ecológico', cfg).categoria, 'auto');
  assert.equal(L.classificarCategoria('Caderno Inteligente Grande Capa Dura', cfg).categoria, 'papelaria');

  // 3) Trava de loja especialista: nunca sai de LOJAS_CATEGORIAS_COMPAT
  assert.equal(L.classificarCategoria('Vestido Longo Estampa Tropical', cfg, '', 'farmrio').categoria, 'moda');
  assert.equal(L.classificarCategoria('Petisco Natural Sabor Frango', cfg, '', 'petz').categoria, 'pet');
  assert.equal(L.classificarCategoria('Suporte Articulado de Mesa', cfg, '', 'kabum').categoria, 'tech');

  // 4) Combos sem "+" (combo/kit/c/) e NÃO disparar para multi-pack do mesmo item
  assert.equal(L.detectarNicho({ titulo: 'Combo Monitor Samsung 32" 4K e Tablet Galaxy Tab S10', categoria: 'tech' }).nicho, 'combo');
  assert.equal(L.detectarNicho({ titulo: 'Kit Teclado Mecânico + Mouse Gamer RGB', categoria: 'tech' }).nicho, 'combo');
  assert.equal(L.detectarNicho({ titulo: 'Notebook Dell Inspiron 15 c/ Mochila Executiva', categoria: 'tech' }).nicho, 'combo');
  assert.notEqual(L.detectarNicho({ titulo: 'Kit 3 Camisetas Básicas Algodão', categoria: 'moda' }).nicho, 'combo');

  // 5) Suplementos/vitaminas com mg ou Comprimidos recebem copy (não ficam sem copy)
  for (const tit of [
    'Centrum Homem 60 Comprimidos',
    'Lavitan A-Z 60 Cápsulas 500mg',
    'Probiótico 250mg 60 Cápsulas',
    'Cafeína 200mg 60 Cápsulas',
  ]) {
    const c = L.linhaCopy({ titulo: tit, categoria: 'saude', preco: 45, preco_de: 69, loja: 'drogaraia' }, cfg, true);
    assert.ok(c.length > 10, `Esperava copy para "${tit}", veio vazio`);
  }

  // 6) avaliarOfertaReal aceita cupons reais variados sem depender de prefixo restrito
  const avCupom = L.avaliarOfertaReal({
    preco: 120, preco_de: 130, cupom: 'BELEZA15', loja: 'boticario',
  }, { selo: 'sem_ref' }, cfg);
  assert.equal(avCupom.ok, true);
  assert.equal(avCupom.motivo, 'cupom');
});
