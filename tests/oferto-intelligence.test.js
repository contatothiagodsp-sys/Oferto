'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../lib');

const AGORA = new Date('2026-11-20T15:00:00Z').getTime();
const DIA = 24 * 60 * 60 * 1000;

const cfgPadrao = (extra) => L.montarConfig([
  { chave: 'admins', valor: '111' },
  { chave: 'grupo_id', valor: '-100123456' },
  { chave: 'bot_token', valor: '123:ABC' },
  { chave: 'bot_token_grupo', valor: '456:DEF' },
  { chave: 'amazon.tag_padrao', valor: 'oferto-20' },
  { chave: 'topico.top', valor: '2' },
  { chave: 'topico.casa', valor: '10' },
  { chave: 'topico.tech', valor: '11' },
  { chave: 'topico.beleza', valor: '12' },
  { chave: 'topico.perfumes', valor: '13' },
  { chave: 'topico.saude', valor: '14' },
  { chave: 'topico.bebe', valor: '15' },
  { chave: 'topico.moda', valor: '16' },
  { chave: 'topico.kpop', valor: '17' },
  { chave: 'topico.pet', valor: '18' },
  { chave: 'topico.auto', valor: '19' },
  { chave: 'topico.livros', valor: '20' },
  { chave: 'topico.papelaria', valor: '21' },
  { chave: 'topico.mercado', valor: '22' },
].concat(extra || []));

/* ============================================================================
 * 13.1. TESTES DE INTELIGÊNCIA, FUNIL E GARGALOS DE PUBLICAÇÃO
 * ============================================================================ */

test('13.1.1 Auditor de Mercado: loja própria no Zoom nunca auto-bloqueia a oferta no Bloqueio 2', () => {
  // Caso real diagnosticado em produção: Época Cosméticos, Pacheco, Venancio e FARM Rio apareciam
  // no Zoom com 1 único hit da própria loja (outraLoja = []), fazendo mediana === preco e reprovando 90% do radar.
  const candEpoca = {
    loja: 'epocacosmeticos',
    produto_id: 'epc_perfume1',
    titulo: 'Perfume Lancôme La Vie Est Belle Eau de Parfum 100ml',
    preco: 489.90,
    preco_de: 649.00,
  };
  const hitsPropriaLoja = [
    { titulo: 'Perfume Lancôme La Vie Est Belle Eau de Parfum 100ml', preco: 489.90, loja_id: 'epocacosmeticos', loja_nome: 'Época Cosméticos', imagem: 'https://img.epoca.com.br/1.jpg' },
  ];
  const avPropria = L.avaliarPrecoMercado(candEpoca, hitsPropriaLoja, { modo_radar: true });
  assert.equal(avPropria.aprovar, true, 'hit da própria loja não pode bloquear a oferta');
  assert.equal(avPropria.motivo, 'sem_referencia_mercado');
  assert.equal(avPropria.concorrente, null);
  assert.equal(avPropria.mediana, null);
  assert.equal(avPropria.imagem_mercado, 'https://img.epoca.com.br/1.jpg', 'preserva imagem útil mesmo sem concorrente');

  // Quando há 1 hit da própria loja (R$ 69,90) e 1 hit de concorrente (R$ 74,90), a mediana deve usar APENAS concorrentes
  const candPacheco = {
    loja: 'pacheco',
    produto_id: 'dpa_fralda1',
    titulo: 'Fralda Pampers Confort Sec G 72 Unidades',
    preco: 69.90,
    preco_de: 89.90,
  };
  const hitsMistos = [
    { titulo: 'Fralda Pampers Confort Sec G 72 Unidades', preco: 69.90, loja_id: 'pacheco', loja_nome: 'Drogarias Pacheco' },
    { titulo: 'Fralda Pampers Confort Sec G 72 Unidades', preco: 74.90, loja_id: 'amazon', loja_nome: 'Amazon' },
  ];
  const avMisto = L.avaliarPrecoMercado(candPacheco, hitsMistos, { modo_radar: true });
  assert.equal(avMisto.aprovar, true, 'mediana calculada apenas sobre concorrentes aprova desconto real > 5% em ticket < R$ 80');
  assert.equal(avMisto.mediana, 74.90);
  assert.equal(avMisto.concorrente.loja_id, 'amazon');

  // Quando concorrente é mais barato, continua bloqueando rigorosamente
  const avMaisCaro = L.avaliarPrecoMercado(
    Object.assign({}, candPacheco, { preco: 79.90 }),
    hitsMistos,
    { modo_radar: true }
  );
  assert.equal(avMaisCaro.aprovar, false);
  assert.equal(avMaisCaro.motivo, 'mais_barato_mercado');
});

test('13.1.2 Detector de queda no histórico recente (bfx_precos < 90 dias) aprova queda real verificada', () => {
  const cfg = cfgPadrao([{ chave: 'radar.publicar_direto', valor: 'sim' }]);
  const cand = {
    resolved: true,
    loja: 'amazon',
    produto_id: 'amz_B0HISTREC1',
    radar_key: 'amz_B0HISTREC1',
    url: 'https://www.amazon.com.br/dp/B0HISTREC1',
    titulo: 'SSD Kingston NV2 1TB NVMe M.2',
    preco: 349.90, // sem preco_de na página, mas caiu de R$ 429,90 coletado há 3 dias no bfx_precos!
    categoria: 'tech',
    imagem: 'https://m.media-amazon.com/images/I/ssd1tb.jpg',
  };
  const precosRows = [
    { produto_id: 'amz_B0HISTREC1', loja: 'amazon', preco: 429.90, fonte: 'coleta', ts: AGORA - 3 * DIA },
    { produto_id: 'amz_B0HISTREC1', loja: 'amazon', preco: 419.90, fonte: 'coleta', ts: AGORA - 1 * DIA },
  ];

  const queda = L.avaliarQuedaHistoricoRecente(cand, precosRows, AGORA);
  assert.equal(queda.queda_verificada, true);
  assert.equal(queda.preco_anterior, 424.90);
  assert.ok(queda.desconto_pct >= 17);

  const fin = L.finalizarRadar(
    { opcoes: { modo: 'agendado', ts: AGORA }, candidatos: [cand], reqs3: [], reqsPag: [], reqsMercado: [] },
    [], [], precosRows, cfg, [], []
  );
  assert.equal(fin.ofertasNovas.length, 1, 'oferta com queda real no bfx_precos recente não deve ser descartada como sem_prova_de_desconto');
  const man = JSON.parse(fin.ofertasNovas[0].links_manuais);
  assert.equal(man.queda_historico_recente, true);
  assert.ok(man.score_inteligencia >= 65);
  assert.ok(fin.resumo.funil && fin.resumo.funil.aprovado === 1);
});

test('13.1.3 Motor de Decisão Multicritério (9 dimensões): histórico, cupom, preço inflado, demanda, duplicata e dados incompletos', () => {
  const cfg = cfgPadrao();
  const alertasRows = [
    { id: '1', user_hash: 'u1', termo: 'dualsense', preco_max: 400, ativo: 'sim', ts: AGORA - DIA },
    { id: '2', user_hash: 'u2', termo: 'dualsense', preco_max: 380, ativo: 'sim', ts: AGORA - DIA },
  ];

  // 1) Oferta forte com menor preço de 90 dias + cupom + pedido por membros + especificações
  const ofForte = {
    loja: 'amazon',
    produto_id: 'amz_B0DUALSENS',
    categoria: 'tech',
    titulo: 'Controle Sem Fio Sony DualSense PS5 Branco',
    preco: 329.90,
    preco_de: 449.90,
    preco_sem_cupom: 359.90,
    cupom: 'GAMER30',
    pix: true,
    parcelamento: 'Em até 6x de R$ 54,98 sem juros',
    pagina_confirmada: true,
    imagem: 'https://m.media-amazon.com/images/I/dualsense.jpg',
    selo: 'abaixo',
    min90: 369.90,
    desconto_pct: 26,
    pontos: 15,
  };
  const ctxForte = L.construirContextoOferta(ofForte, {
    cfg,
    agora: AGORA,
    alertasRows,
    avMercado: { aprovar: true, mediana: 399.90, concorrente: { preco: 389.90, loja_nome: 'KaBuM!' } },
  });
  const decForte = L.avaliarOportunidadeInteligente(ctxForte, cfg);
  assert.equal(decForte.aprovar, true);
  assert.ok(decForte.pontuacao >= 80, `esperava pontuação >= 80, veio ${decForte.pontuacao}`);
  assert.ok(['imperdivel', 'muito_forte'].includes(decForte.classificacao));
  assert.equal(decForte.recomendacao_topo, true);
  assert.equal(ctxForte.produto_info.marca, 'Sony');
  assert.equal(ctxForte.demanda_info.pedido_membro, true);
  assert.equal(ctxForte.demanda_info.total_alertas_match, 2);
  assert.ok(Object.keys(decForte.dimensoes).length === 9);

  // 2) Oferta com falso desconto ("metade do dobro": 85% nominal sem confirmação de histórico ou mercado)
  const ofMetadeDobro = {
    loja: 'outra',
    produto_id: 'url_123',
    categoria: 'casa',
    titulo: 'Panela Genérica Antiaderente',
    preco: 100,
    preco_de: 800,
    desconto_pct: 87,
    pagina_confirmada: false,
    selo: 'sem_ref',
  };
  const decSuspeita = L.avaliarOportunidadeInteligente(ofMetadeDobro, cfg);
  assert.equal(decSuspeita.aprovar, false, 'desconto nominal > 80% sem confirmação nunca deve ser aprovado');
  assert.ok(decSuspeita.motivos_reprovacao.some((m) => /suspeito/i.test(m)));

  // 3) Oferta acima do menor preço de 90 dias
  const ofAcima90 = Object.assign({}, ofForte, { selo: 'acima', preco: 410, min90: 340 });
  const decAcima = L.avaliarOportunidadeInteligente(ofAcima90, cfg);
  assert.equal(decAcima.aprovar, false);
  assert.ok(decAcima.motivos_reprovacao.some((m) => /90 dias/i.test(m)));

  // 4) Oferta mais cara que concorrente no mercado
  const decMercadoReprov = L.avaliarOportunidadeInteligente(ofForte, cfg, {
    avMercado: { aprovar: false, motivo: 'mais_barato_mercado', concorrente: { preco: 299, loja_nome: 'Magalu' } },
  });
  assert.equal(decMercadoReprov.aprovar, false);
  assert.ok(decMercadoReprov.motivos_reprovacao.some((m) => /concorrência/i.test(m)));

  // 5) Oferta duplicada bloqueada pelo anti-repetição 24h
  const decDuplicada = L.avaliarOportunidadeInteligente(ofForte, cfg, {
    repeticao: { bloquear: true, motivo: 'ja_publicada_24h' },
  });
  assert.equal(decDuplicada.aprovar, false);
  assert.equal(decDuplicada.dimensoes.novidade, 0);

  // 6) Oferta com dados incompletos (sem preço)
  const decSemPreco = L.avaliarOportunidadeInteligente({ titulo: 'Produto sem preço', preco: 0, loja: 'amazon' }, cfg);
  assert.equal(decSemPreco.aprovar, false);
  assert.equal(decSemPreco.dimensoes.confiabilidade_dados, 0);
});

test('13.1.4 Compreensão de Produto e Custo Unitário em todas as categorias', () => {
  const fralda = L.entenderProdutoOferta({
    categoria: 'bebe',
    titulo: 'Fralda Pampers Premium Care M 196 Fraldas',
    preco: 176.40,
    selo: 'abaixo',
  });
  assert.equal(fralda.marca, 'Pampers');
  assert.equal(fralda.natureza, 'consumivel_estoque');
  assert.equal(fralda.qtd_unidades, 196);
  assert.equal(fralda.custo_unitario, 0.90);
  assert.match(fralda.resumo_unidade, /R\$\s*0,90\/fralda/);

  const perfume = L.entenderProdutoOferta({
    categoria: 'perfumes',
    titulo: 'Perfume Árabe Lattafa Khamrah Eau de Parfum 100ml',
    preco: 219.90,
    cupom: 'ARABE20',
  });
  assert.equal(perfume.marca, 'Lattafa');
  assert.equal(perfume.natureza, 'colecionavel_desejo');
  assert.ok(perfume.especificacoes.includes('Eau de Parfum (EDP)'));
  assert.ok(perfume.especificacoes.includes('100ml'));
  assert.equal(perfume.tipo_melhoria, 'cupom_acumulado');

  const monitor = L.entenderProdutoOferta({
    categoria: 'tech',
    titulo: 'Monitor Gamer LG UltraGear 27" IPS 144Hz Full HD',
    preco: 899.90,
  });
  assert.equal(monitor.marca, 'LG');
  assert.equal(monitor.natureza, 'duravel_upgrade');
  assert.ok(monitor.especificacoes.includes('144Hz'));
  assert.ok(monitor.especificacoes.includes('IPS'));
});

/* ============================================================================
 * 13.2. TESTES DE MARKETING, COPYWRITING CONTEXTUAL E APRESENTAÇÃO MULTICANAL
 * ============================================================================ */

test('13.2.1 Variação real de copy, metadados anti-repetição e conformidade em todos os nichos', () => {
  const cfg = cfgPadrao();
  const uso = new Map();
  const categoriasTeste = [
    { categoria: 'tech', titulo: 'Fone Bluetooth JBL Tune 520BT Preto', preco: 179.90, preco_de: 249.90 },
    { categoria: 'tech', titulo: 'Placa de Vídeo RTX 4060 8GB GDDR6', preco: 1799.90, preco_de: 2299.90 },
    { categoria: 'tech', titulo: 'Controle Sony DualSense PS5', preco: 349.90, preco_de: 449.90 },
    { categoria: 'perfumes', titulo: 'Perfume Lattafa Asad Eau de Parfum 100ml', preco: 169.90, preco_de: 249.90 },
    { categoria: 'beleza', titulo: 'Protetor Solar La Roche-Posay Anthelios Airlicium FPS 70 40g', preco: 69.90, preco_de: 99.90 },
    { categoria: 'saude', titulo: 'Creatina Monohidratada Max Titanium 300g', preco: 54.90, preco_de: 89.90 },
    { categoria: 'casa', titulo: 'Fritadeira Air Fryer Mondial Family 4L Inox', preco: 269.90, preco_de: 399.90 },
    { categoria: 'bebe', titulo: 'Fralda Huggies Supreme Care G 80 Unidades', preco: 79.90, preco_de: 109.90 },
    { categoria: 'moda', titulo: 'Tênis Olympikus Corre 3 Masculino Corrida', preco: 349.90, preco_de: 499.90 },
    { categoria: 'kpop', titulo: 'Álbum Stray Kids 5-STAR Standard Ver.', preco: 139.90, preco_de: 189.90 },
    { categoria: 'pet', titulo: 'Ração Golden Fórmula Cães Adultos 15kg', preco: 149.90, preco_de: 189.90 },
    { categoria: 'auto', titulo: 'Cera Automotiva Vonixx Blend Carnaúba Sílica 500ml', preco: 52.90, preco_de: 74.90 },
    { categoria: 'livros', titulo: 'Box Livros Duna Frank Herbert Capa Dura', preco: 159.90, preco_de: 249.90 },
    { categoria: 'papelaria', titulo: 'Caderno Inteligente Grande A4 80 Folhas', preco: 99.90, preco_de: 139.90 },
    { categoria: 'mercado', titulo: 'Café Torrado e Moído Orfeu Clássico 250g', preco: 22.90, preco_de: 32.90 },
  ];

  const frasesGeradas = new Set();
  for (let i = 0; i < categoriasTeste.length; i++) {
    const item = Object.assign({
      oferta_id: `of_mkt_${i}`,
      produto_id: `prod_mkt_${i}`,
      loja: 'amazon',
      url: `https://www.amazon.com.br/dp/B0000000${String(i).padStart(2, '0')}`,
      selo: 'abaixo',
      min90: categoriasTeste[i].preco_de,
      desconto_pct: 25,
      data: new Date(AGORA).toISOString(),
    }, categoriasTeste[i]);

    const comCopy = L.atribuirCopyTom(item, uso);
    const man = typeof comCopy.links_manuais === 'string' ? JSON.parse(comCopy.links_manuais) : comCopy.links_manuais;
    assert.ok(man.copy_tom && man.copy_tom.texto, `categoria ${item.categoria} deve gerar copy_tom`);
    assert.ok(man.copy_tom.estrutura, 'deve registrar estrutura na memória');
    assert.ok(man.copy_tom.estilo, 'deve registrar estilo na memória');
    assert.ok(man.copy_tom.tipo_abertura, 'deve registrar tipo_abertura na memória');
    assert.ok(man.copy_tom.argumento, 'deve registrar argumento na memória');
    assert.ok(man.copy_tom.cta, 'deve registrar cta na memória');
    assert.equal(man.copy_tom.categoria, item.categoria);
    assert.equal(L.validarCopy(man.copy_tom.texto, item).ok, true);
    frasesGeradas.add(man.copy_tom.texto);

    // Verifica formatação para cada plataforma (Telegram HTML, WhatsApp Grupo, WhatsApp Canal, X)
    const linkAf = `${item.url}?tag=oferto-20`;
    const txtTg = L.textoTelegram(comCopy, linkAf, cfg);
    const txtWag = L.textoWhatsAppGrupo(comCopy, linkAf, cfg);
    const txtWac = L.textoWhatsAppCanal(comCopy, linkAf, cfg);
    const txtX = L.textoX(comCopy, linkAf, cfg);

    assert.match(txtTg, /(?:^|\n)#publi\b/);
    assert.ok(txtTg.includes(linkAf) || txtWag.includes(linkAf));
    assert.ok(txtX.length <= 280, `texto X excedeu 280 chars (${txtX.length})`);
    assert.ok(L.urlEnviarWhatsApp(txtWag).length <= 2000, 'URL 1-toque do WhatsApp deve caber em 2000 bytes');
  }
  assert.equal(frasesGeradas.size, categoriasTeste.length, 'nenhuma frase deve se repetir entre os 15 produtos do lote');
});

test('13.2.2 Anti-repetição de copy em sequência do mesmo sub-nicho e escape seguro de caracteres HTML', () => {
  const cfg = cfgPadrao();
  const uso = new Map();
  const textosMesmoNicho = [];
  for (let i = 0; i < 6; i++) {
    const of = L.atribuirCopyTom({
      oferta_id: `of_air_${i}`,
      produto_id: `prod_air_${i}`,
      loja: 'amazon',
      categoria: 'casa',
      titulo: `Air Fryer Fritadeira Sem Óleo 4L Modelo ${i} <Especial & "Pro">`,
      preco: 249.90,
      preco_de: 349.90,
      desconto_pct: 28,
    }, uso);
    const copy = L.linhaCopy(of, cfg, true);
    assert.ok(!copy.includes('<Especial'), 'HTML deve estar escapado quando html=true');
    textosMesmoNicho.push(copy);
  }
  assert.equal(new Set(textosMesmoNicho).size, 6, '6 produtos seguidos do mesmo sub-nicho recebem 6 copies distintas');
});

/* ============================================================================
 * 13.3. TESTES DE CONFIABILIDADE DO TELEGRAM, FILA, IDEMPOTÊNCIA E ISOLAMENTO
 * ============================================================================ */

test('13.3.1 Classificador de erros da Bot API: timeout, 429, 400, 401, 403, 500, 502, 503, ECONNRESET, ETIMEDOUT, ECONNREFUSED, DNS e resposta inválida', () => {
  const chPhoto = { bot: 'grupo', metodo: 'sendPhoto', payload: { chat_id: '-1001', photo: 'https://img/a.jpg' }, fallback: { bot: 'grupo', metodo: 'sendMessage', payload: { chat_id: '-1001', text: 'oi' } } };
  const chMsg = { bot: 'grupo', metodo: 'sendMessage', payload: { chat_id: '-1001', text: 'oi' } };

  // Sucesso
  const cOk = L.classificarErroTelegram({ ok: true, result: { message_id: 42 } }, chMsg);
  assert.equal(cOk.ok, true);
  assert.equal(cOk.estado, 'publicado');
  assert.equal(cOk.message_id, 42);

  // Timeout de 45000ms e erros de rede ambíguos (proteção de idempotência!)
  for (const errMsg of [
    'timeout of 45000ms exceeded',
    'connect ETIMEDOUT 149.154.166.110:443',
    'read ECONNRESET',
    'connect ECONNREFUSED 149.154.166.110:443',
    'getaddrinfo ENOTFOUND api.telegram.org',
    'getaddrinfo EAI_AGAIN api.telegram.org',
    'socket hang up',
  ]) {
    const cRede = L.classificarErroTelegram({ error: { message: errMsg } }, chMsg);
    assert.equal(cRede.tipo, 'timeout_ou_rede_ambigua', `falhou para: ${errMsg}`);
    assert.equal(cRede.estado, 'entrega_incerta');
    assert.equal(cRede.proteger_idempotencia, true);
    assert.equal(cRede.tentar_novamente, false, 'nunca deve reenviar às cegas em timeout para não duplicar no grupo');
  }

  // HTTP 429 Too Many Requests
  const c429 = L.classificarErroTelegram({ ok: false, error_code: 429, description: 'Too Many Requests: retry after 12', parameters: { retry_after: 12 } }, chMsg);
  assert.equal(c429.tipo, 'rate_limit_429');
  assert.equal(c429.estado, 'falha_recuperavel');
  assert.equal(c429.retry_after, 12);
  assert.equal(c429.tentar_novamente, true);

  // HTTP 500, 502, 503
  for (const code of [500, 502, 503]) {
    const c5xx = L.classificarErroTelegram({ ok: false, error_code: code, description: 'Bad Gateway' }, chMsg);
    assert.equal(c5xx.tipo, 'servidor_5xx');
    assert.equal(c5xx.estado, 'falha_recuperavel');
    assert.equal(c5xx.proteger_idempotencia, true);
  }

  // HTTP 401 e 403
  for (const [code, desc] of [[401, 'Unauthorized'], [403, 'Forbidden: bot was kicked from the supergroup chat']]) {
    const cAuth = L.classificarErroTelegram({ ok: false, error_code: code, description: desc }, chMsg);
    assert.equal(cAuth.tipo, 'credencial_ou_permissao');
    assert.equal(cAuth.estado, 'falha_definitiva');
    assert.equal(cAuth.tentar_novamente, false);
  }

  // HTTP 400 imagem rejeitada no sendPhoto
  const cImg = L.classificarErroTelegram({ ok: false, error_code: 400, description: 'Bad Request: failed to get HTTP URL content' }, chPhoto);
  assert.equal(cImg.tipo, 'imagem_rejeitada');
  assert.equal(cImg.usar_fallback_foto, true);
  assert.equal(cImg.falha_curl_imagem, true);

  // HTTP 400 parâmetro inválido em sendMessage
  const c400 = L.classificarErroTelegram({ ok: false, error_code: 400, description: "Bad Request: can't parse entities" }, chMsg);
  assert.equal(c400.tipo, 'parametro_invalido_400');
  assert.equal(c400.estado, 'rejeitado');
  assert.equal(c400.tentar_novamente, false);

  // Resposta vazia/inválida
  const cInv = L.classificarErroTelegram({}, chMsg);
  assert.equal(cInv.tipo, 'resposta_invalida');
  assert.equal(cInv.estado, 'falha_recuperavel');
});

test('13.3.2 Validação de imagem binária (rejeita arquivo truncado de 23 bytes e .webp) e sanitização de link_preview_options no fallback', () => {
  // Caso real omwnpi2pc2e7: PNG corrompido de 23 bytes do Promobit
  const bin23Bytes = { mimeType: 'image/png', data: Buffer.alloc(23).toString('base64') };
  const valCurto = L.validarBinarioFotoTelegram(bin23Bytes);
  assert.equal(valCurto.valido, false);
  assert.match(valCurto.motivo, /arquivo_truncado/);

  // Caso real omwntae4d1yk: imagem .webp da Nuvemshop
  const binWebp = { mimeType: 'image/webp', data: Buffer.alloc(1024).toString('base64') };
  const valWebp = L.validarBinarioFotoTelegram(binWebp);
  assert.equal(valWebp.valido, false);
  assert.match(valWebp.motivo, /mime_nao_suportado/);

  // JPEG válido (>= 280 chars base64)
  const binJpgValido = { mimeType: 'image/jpeg', data: Buffer.alloc(512).toString('base64') };
  assert.equal(L.validarBinarioFotoTelegram(binJpgValido).valido, true);

  // Quando sendPhoto com URL .webp ou erro de curl falha, o fallback sendMessage desativa o preview da imagem quebrada
  const chWebp = {
    bot: 'grupo',
    metodo: 'sendPhoto',
    payload: { chat_id: '-1001', photo: 'https://acdn-us.mitiendanube.com/stores/1/products/foto.webp', caption: 'Oferta' },
    fallback: {
      bot: 'grupo',
      metodo: 'sendMessage',
      payload: {
        chat_id: '-1001',
        text: 'Oferta',
        link_preview_options: { url: 'https://acdn-us.mitiendanube.com/stores/1/products/foto.webp', prefer_large_media: true, show_above_text: true },
      },
    },
  };
  const lim = L.limiteTelegram([chWebp], [{ ok: false, error_code: 400, description: 'Bad Request: failed to get HTTP URL content' }], { tentarBinario: true });
  assert.equal(lim.reenviar.length, 1);
  assert.equal(lim.reenviar[0].metodo, 'sendMessage', 'URL .webp pula download binário inútil e vai direto para sendMessage');
  assert.deepEqual(lim.reenviar[0].payload.link_preview_options, { is_disabled: true }, 'remove a URL quebrada do link_preview_options para não causar timeout de 45s no sendMessage');
});

test('13.3.3 Isolamento Multicanal: falha em canal secundário não invalida sucesso no principal; falha total atualiza todas as ofertas do lote', () => {
  const cfg = cfgPadrao();
  // Oferta 1 enviada para tópico da categoria (sucesso) e canal secundário (falhou 403)
  // Oferta 2 enviada para tópico (falhou 400)
  // Oferta 3 enviada para tópico (falhou 400)
  const chamadas = [
    { bot: 'grupo', metodo: 'sendPhoto', payload: { chat_id: '-100123456' }, ref: { registrar: true, oferta_id: 'of_ok_parcial', plataforma: 'tg', categoria: 'casa', thread: 10 } },
    { bot: 'grupo', metodo: 'sendPhoto', payload: { chat_id: '@canal_casa' }, ref: { registrar: true, oferta_id: 'of_ok_parcial', plataforma: 'tgc', categoria: 'casa', chat: '@canal_casa' } },
    { bot: 'grupo', metodo: 'sendPhoto', payload: { chat_id: '-100123456' }, ref: { registrar: true, oferta_id: 'of_falha_1', plataforma: 'tg', categoria: 'tech', thread: 11 } },
    { bot: 'grupo', metodo: 'sendPhoto', payload: { chat_id: '-100123456' }, ref: { registrar: true, oferta_id: 'of_falha_2', plataforma: 'tg', categoria: 'moda', thread: 16 } },
  ];
  const respostas = [
    { ok: true, result: { message_id: 101 } },
    { ok: false, error_code: 403, description: 'Forbidden: bot is not a member of the channel chat' },
    { ok: false, error_code: 400, description: 'Bad Request: message thread not found' },
    { ok: false, error_code: 400, description: 'Bad Request: chat not found' },
  ];

  const res = L.resultadoChamadas(chamadas, respostas, cfg, AGORA);
  assert.equal(res.posts.length, 1);
  assert.equal(res.posts[0].oferta_id, 'of_ok_parcial');
  assert.ok(!res.updates.some((u) => u.oferta_id === 'of_ok_parcial'), 'oferta publicada em pelo menos 1 destino NÃO deve virar status=falha');
  assert.deepEqual(res.updates.map((u) => u.oferta_id), ['of_falha_1', 'of_falha_2'], 'todas as ofertas do lote que falharam em 100% dos destinos são listadas em updates');
  assert.equal(res.update.oferta_id, 'of_falha_1');
  assert.equal(res.entregas.length, 4);
});

test('13.3.4 Fila de prioridade, intercalação de destinos e expiração de itens antigos', () => {
  const chamadas = [
    { metodo: 'sendMessage', payload: { chat_id: '1', message_thread_id: 10 }, ref: { oferta_id: 'o_reg', prioridade: 'regular', ts: AGORA - 1000 } },
    { metodo: 'sendMessage', payload: { chat_id: '1', message_thread_id: 10 }, ref: { oferta_id: 'o_rel1', prioridade: 'relampago', ts: AGORA - 1000 } },
    { metodo: 'sendMessage', payload: { chat_id: '1', message_thread_id: 10 }, ref: { oferta_id: 'o_rel2', prioridade: 'relampago', ts: AGORA - 1000 } },
    { metodo: 'sendMessage', payload: { chat_id: '2', message_thread_id: 20 }, ref: { oferta_id: 'o_rel3', prioridade: 'relampago', ts: AGORA - 1000 } },
    { metodo: 'sendMessage', payload: { chat_id: '1', message_thread_id: 11 }, ref: { oferta_id: 'o_cup', prioridade: 'cupom_curto', ts: AGORA - 1000 } },
    { metodo: 'sendMessage', payload: { chat_id: '1', message_thread_id: 10 }, ref: { oferta_id: 'o_expirada', prioridade: 'relampago', ts: AGORA - 20 * 3600000 } },
  ];
  const fila = L.ordenarFilaPublicacao(chamadas, { agora: AGORA, expirar_apos_ms: 18 * 3600000 });
  const ids = fila.map((c) => c.ref.oferta_id);
  assert.ok(!ids.includes('o_expirada'), 'item com mais de 18h é expirado da fila');
  // Os 3 relâmpagos vêm primeiro, intercalando chat 1:10 -> 2:20 -> 1:10, seguidos por cupom_curto e regular
  assert.deepEqual(ids, ['o_rel1', 'o_rel3', 'o_rel2', 'o_cup', 'o_reg']);
});

test('13.3.5 Configuração HTTP/Stream dos workflows e IPv4 sem Happy Eyeballs no docker-compose', () => {
  const compose = fs.readFileSync(path.join(__dirname, '..', 'servidor-local', 'docker-compose.yml'), 'utf8');
  assert.match(compose, /--no-network-family-autoselection/, 'docker-compose deve desativar autoSelectFamily para evitar aborto de 500ms para IPv6 inacessível');

  for (const arq of ['01-telegram-router.json', '04-radar-ofertas.json', '05-guardiao-ofertas.json']) {
    const wf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'n8n', 'workflows', arq), 'utf8'));
    const nosTg = wf.nodes.filter((n) => n.type === 'n8n-nodes-base.httpRequest' && /telegram\.api/.test(String(n.parameters && n.parameters.url)));
    assert.ok(nosTg.length > 0, `${arq} deve ter nós HTTP do Telegram`);
    for (const n of nosTg) {
      const respOpt = n.parameters.options && n.parameters.options.response && n.parameters.options.response.response;
      assert.equal(respOpt && respOpt.responseFormat, 'json', `${arq} -> ${n.name} deve definir responseFormat: 'json' para não acumular streams abertos no HttpRequestV3`);
    }
  }
});

/* ============================================================================
 * 13.4. TESTES DE INTEGRIDADE, APRENDIZADO CONTÍNUO E AUTOCURA
 * ============================================================================ */

test('13.4.1 Aprendizado contínuo e diagnóstico de autocura operacional', () => {
  const cfg = cfgPadrao();
  const ofertas = [
    { oferta_id: 'o1', categoria: 'perfumes', loja: 'amazon', status: 'aprovada', preco: 180, desconto_pct: 30, ts: AGORA - 3600000 },
    { oferta_id: 'o2', categoria: 'perfumes', loja: 'amazon', status: 'aprovada', preco: 210, desconto_pct: 25, ts: AGORA - 7200000 },
    { oferta_id: 'o3', categoria: 'perfumes', loja: 'amazon', status: 'aprovada', preco: 150, desconto_pct: 35, ts: AGORA - 10800000 },
    { oferta_id: 'o_orfa', categoria: 'tech', loja: 'kabum', status: 'aprovada', preco: 500, desconto_pct: 20, ts: AGORA - 3600000 },
  ];
  const posts = [
    { oferta_id: 'o1', plataforma: 'tg', categoria: 'perfumes', message_id: 11, ts: AGORA - 3600000 },
    { oferta_id: 'o2', plataforma: 'tg', categoria: 'perfumes', message_id: 12, ts: AGORA - 7200000 },
    { oferta_id: 'o3', plataforma: 'tg', categoria: 'perfumes', message_id: 13, ts: AGORA - 10800000 },
    // o_orfa não tem post em bfx_posts (simulando timeout de sendMessage na Bot API)
  ];
  const alertas = [
    { id: 'a1', termo: 'switch oled', ativo: 'sim', ts: AGORA - DIA },
    { id: 'a2', termo: 'switch oled', ativo: 'sim', ts: AGORA - DIA },
  ];
  const entradas = [
    { tipo: 'entrou', convite_nome: 'perfumes_meta1', ts: AGORA - 3600000 },
  ];

  const apr = L.analisarAprendizadoHistorico({ ofertas, posts, alertas, entradas }, cfg, AGORA);
  assert.equal(apr.amostra_suficiente, true);
  assert.equal(apr.categorias_ranking[0].categoria, 'perfumes');
  assert.equal(apr.lojas_ranking[0].loja, 'amazon');
  assert.equal(apr.demanda_reprimida[0].termo, 'switch oled');
  assert.equal(apr.demanda_reprimida[0].pedidos, 2);

  // Diagnóstico de autocura
  const descartesFake = Array.from({ length: 120 }, (_, idx) => ({
    ts: AGORA - 60000,
    preco: 100,
    motivo: idx < 110 ? 'reprovado_mercado' : 'sem_prova_de_desconto',
  }));
  const diag = L.diagnosticarAutocura({
    ofertas,
    posts,
    memoria: {
      radar_descartes: descartesFake,
      pb_redir_bloqueado_ate: AGORA + 300000,
    },
  }, cfg, AGORA);

  assert.equal(diag.saudavel, false);
  const codigos = diag.problemas.map((p) => p.codigo);
  assert.ok(codigos.includes('ofertas_sem_entrega_confirmada'), 'deve detectar oferta aprovada sem message_id em bfx_posts');
  assert.ok(codigos.includes('descarte_mercado_excessivo'), 'deve detectar saturação de descartes de mercado');
  assert.ok(codigos.includes('promobit_redir_429'), 'deve reportar cooldown ativo do Promobit');
  assert.ok(diag.acoes_autocura.length >= 2);
});

test('13.4.2 Integração real: avaliarSelo (selo=ok), statusAfiliadoFonte, preco_confirmado_loja, booleano ativo=false em bfx_alertas e sinônimos', () => {
  const cfg = cfgPadrao();
  // 1) avaliarSelo real retorna selo: 'ok' e historico: { registros } (não 'abaixo'/'pontos')
  const histRows = Array.from({ length: 12 }, (_, idx) => ({
    produto_id: 'amz_B0SELOOK01',
    loja: 'amazon',
    preco: 450,
    fonte: 'coleta',
    ts: AGORA - (95 - idx * 5) * DIA,
    data: new Date(AGORA - (95 - idx * 5) * DIA).toISOString(),
  }));
  const selReal = L.avaliarSelo(histRows, 405, { agora: AGORA, dias: 90 });
  assert.equal(selReal.selo, 'ok');

  // 2) Alertas com booleano ativo: false (schema real de bfx_alertas) devem ser ignorados, e sinônimos (ps5 -> PlayStation 5) devem casar
  const alertasRows = [
    { alerta_id: 'al_inativo', termo: 'playstation', preco_max: 5000, ativo: false, ts: AGORA - DIA },
    { alerta_id: 'al_ativo_sin', termo: 'ps5', preco_max: 4000, ativo: true, ts: AGORA - DIA },
  ];

  const candReal = {
    loja: 'amazon',
    produto_id: 'amz_B0SELOOK01',
    categoria: 'tech',
    titulo: 'Console Sony PlayStation 5 Edição Digital',
    preco: 405, // 10% abaixo do min90 (450), sem preco_de
    preco_confirmado_loja: true, // campo real gravado por enriquecerCandidatosComPaginas
    av_mercado: { aprovar: true, mediana: 460, concorrente: { preco: 455, loja_nome: 'KaBuM!' } },
    imagem: 'https://m.media-amazon.com/images/I/ps5.jpg',
  };

  const ctx = L.construirContextoOferta(candReal, { cfg, agora: AGORA, seloInfo: selReal, alertasRows });
  assert.equal(ctx.loja_info.monetizada, true, 'statusAfiliadoFonte retorna objeto { ativo: true } para Amazon com tag_padrao');
  assert.equal(ctx.qualidade_dados.pagina_confirmada, true, 'deve reconhecer preco_confirmado_loja do radar');
  assert.equal(ctx.qualidade_dados.sinais.preco.origem, 'pdp_confirmada');
  assert.equal(ctx.qualidade_dados.sinais.mercado.checado, true, 'deve reconhecer c.av_mercado do radar');
  assert.equal(ctx.economia_info.fonte_referencia, 'historico_90d');
  assert.equal(ctx.qualidade_dados.sinais.historico.pontos, 11);
  assert.equal(ctx.produto_info.tipo_melhoria, 'menor_historico_90d');
  assert.equal(ctx.demanda_info.total_alertas_match, 1, 'deve ignorar ativo: false e casar ps5 com PlayStation 5 via sinônimos');

  const dec = L.avaliarOportunidadeInteligente(ctx, cfg);
  assert.equal(dec.aprovar, true, 'oferta com selo=ok de 90d e 10% de queda real deve ser aprovada');
  assert.ok(dec.pontuacao >= 80);
});

test('13.4.3 Autocura em objeto radar_descartes, Guardião (publicando preso >30m), Relatório Diário, Fila no publicarLoteRadar e proteção .webp em sendMessage', () => {
  const vm = require('node:vm');
  const cfg = cfgPadrao();

  // 1) Autocura sobre mapa/objeto real sd.radar_descartes (não apenas Array)
  const mapaDescartes = {};
  for (let i = 0; i < 60; i++) {
    mapaDescartes['prod_' + i] = {
      ts: AGORA - (i < 50 ? 45 * 60000 : 10 * 60000),
      preco: 100,
      motivo: i < 52 ? 'reprovado_mercado' : 'sem_prova_de_desconto',
    };
  }
  const diagObj = L.diagnosticarAutocura({ ofertas: [], posts: [], memoria: { radar_descartes: mapaDescartes } }, cfg, AGORA);
  assert.ok(diagObj.problemas.some((p) => p.codigo === 'descarte_mercado_excessivo'), 'deve detectar saturação quando radar_descartes é objeto');

  const cura = L.aplicarAutocuraDescartesRadar(mapaDescartes, AGORA);
  assert.equal(cura.curado, true);
  assert.ok(cura.removidos >= 45, 'deve expurgar reprovado_mercado com mais de 30 min quando saturado');
  assert.ok(Object.keys(cura.memoria).length < 20);

  // 2) Guardião: recupera ofertas presas em status='publicando' há >= 30 min sem post confirmado em bfx_posts
  const ofPresa = {
    oferta_id: 'o_presa_pub',
    produto_id: 'amz_B0PRESA001',
    loja: 'amazon',
    categoria: 'tech',
    titulo: 'SSD Kingston NV2 1TB',
    preco: 289.90,
    status: 'publicando',
    url: 'https://www.amazon.com.br/dp/B0PRESA001',
    ts: AGORA - 45 * 60000,
    links_manuais: '{}',
  };
  const gRes = L.executarGuardiao({ checar: [], reqs: [], ts: AGORA }, [], [ofPresa], [], [], cfg, AGORA);
  assert.deepEqual(gRes.updatesOfertas, [{ oferta_id: 'o_presa_pub', status: 'falha' }]);
  assert.ok(gRes.autocura && gRes.autocura.problemas.some((p) => p.codigo === 'ofertas_sem_entrega_confirmada'));

  // 3) Relatório diário integra analisarAprendizadoHistorico (com tipo='entrada' real e ativo=false ignorado) e diagnosticarAutocura
  const rel = L.relatorioDiario({
    ofertas: [
      { oferta_id: 'o1', categoria: 'tech', loja: 'amazon', status: 'aprovada', preco: 289.9, desconto_pct: 25, ts: AGORA - 3600000, selo: 'ok' },
      { oferta_id: 'o2', categoria: 'tech', loja: 'amazon', status: 'aprovada', preco: 199.9, desconto_pct: 20, ts: AGORA - 7200000, selo: 'ok' },
      { oferta_id: 'o3', categoria: 'tech', loja: 'amazon', status: 'aprovada', preco: 399.9, desconto_pct: 30, ts: AGORA - 10800000, selo: 'ok' },
    ],
    posts: [
      { oferta_id: 'o1', plataforma: 'tg', categoria: 'tech', message_id: 1, ts: AGORA - 3600000 },
      { oferta_id: 'o2', plataforma: 'tg', categoria: 'tech', message_id: 2, ts: AGORA - 7200000 },
    ],
    entradas: [
      { tipo: 'entrada', convite_nome: 'tech_camp1', user_hash: 'u1', ts: AGORA - 3600000 },
    ],
    alertas: [
      { alerta_id: 'a_on', termo: 'robo aspirador', ativo: true, ts: AGORA - DIA },
      { alerta_id: 'a_off', termo: 'produto inativo', ativo: false, ts: AGORA - DIA },
    ],
    links: [],
  }, cfg, AGORA);
  const txtRel = rel.chamadas[0].payload.text;
  assert.match(txtRel, /Demanda reprimida \(sem oferta 7d\): robo aspirador \(1\)/);
  assert.doesNotMatch(txtRel, /produto inativo/, 'alerta com ativo: false não pode entrar no relatório');
  assert.match(txtRel, /Aprendizado 7d \(top categorias\): tech/);
  assert.match(txtRel, /Autocura: ofertas_sem_entrega_confirmada/);

  // 4) publicarLoteRadar ordena chamadas usando ordenarFilaPublicacao (relampago/queda_expressiva antes de regular)
  const finLote = {
    opcoes: { modo: 'agendado', ts: AGORA },
    reqsShopeeLinks: [],
    autoPlanos: [
      {
        oferta: {
          oferta_id: 'of_reg_1',
          produto_id: 'amz_B000000001',
          loja: 'amazon',
          categoria: 'casa',
          titulo: ' Cafeteira Simples ',
          preco: 99.9,
          url: 'https://www.amazon.com.br/dp/B000000001',
          selo: 'ok',
          links_manuais: JSON.stringify({ prioridade_fila: 'regular' }),
          ts: AGORA,
        },
        linkItens: L.planejarLinks({ oferta_id: 'of_reg_1', loja: 'amazon', categoria: 'casa', url: 'https://www.amazon.com.br/dp/B000000001' }, cfg, AGORA),
        so_textos: false,
        chat_id: 111,
        ts: AGORA,
        cardIdx: -1,
      },
      {
        oferta: {
          oferta_id: 'of_rel_2',
          produto_id: 'amz_B000000002',
          loja: 'amazon',
          categoria: 'tech',
          titulo: 'SSD Kingston NV2 1TB',
          preco: 289.9,
          url: 'https://www.amazon.com.br/dp/B000000002',
          selo: 'ok',
          relampago: true,
          links_manuais: JSON.stringify({ prioridade_fila: 'relampago' }),
          ts: AGORA,
        },
        linkItens: L.planejarLinks({ oferta_id: 'of_rel_2', loja: 'amazon', categoria: 'tech', url: 'https://www.amazon.com.br/dp/B000000002' }, cfg, AGORA),
        so_textos: false,
        chat_id: 111,
        ts: AGORA,
        cardIdx: -1,
      },
    ],
  };
  const pubLote = L.publicarLoteRadar(finLote, [], [], cfg, []);
  const chamadasGrupo = pubLote.chamadasPub.filter((c) => c.bot === 'grupo');
  assert.equal(chamadasGrupo[0].ref.oferta_id, 'of_rel_2', 'oferta relâmpago deve ser priorizada na fila de publicação do lote');
  assert.equal(chamadasGrupo[1].ref.oferta_id, 'of_reg_1');

  // 5) Proteção contra URL .webp em sendMessage (chamadaCard e dispararAlertasOferta) e nó Status falha radar com múltiplos updates
  const ofWebp = {
    oferta_id: 'o_webp_1',
    produto_id: 'hpc_123',
    loja: 'hopescolor',
    categoria: 'kpop',
    titulo: 'Album Stray Kids ATE',
    preco: 159.9,
    url: 'https://www.hopescolor.com/produtos/album-stray-kids-ate/',
    imagem: 'https://acdn-us.mitiendanube.com/stores/004/051/358/products/ate.webp',
    selo: 'sem_ref',
    links_manuais: JSON.stringify({ modo_link: true }),
    ts: AGORA,
  };
  const chCardWebp = L.chamadaCard(ofWebp, cfg, 111);
  assert.equal(chCardWebp.payload.link_preview_options.url, ofWebp.url, 'chamadaCard nunca deve colocar binário .webp em link_preview_options.url');

  const dmsWebp = L.dispararAlertasOferta(
    [ofWebp],
    [],
    [{ alerta_id: 'al_skz', chat_id: 999, termo: 'stray kids', preco_max: 300, ativo: true, ts: AGORA - DIA }],
    cfg,
    AGORA
  );
  assert.equal(dmsWebp.chamadas.length, 1);
  assert.equal(dmsWebp.chamadas[0].payload.link_preview_options.url, undefined, 'DM de alerta nunca deve colocar binário .webp em link_preview_options.url');

  // 6) Nó "Status falha radar" no 04-radar-ofertas propaga todos os itens de updates[] e "SSD Kingston NV2 1TB" (6.5) gera copy de armazenamento/HD
  const wfRadar = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'n8n', 'workflows', '04-radar-ofertas.json'), 'utf8'));
  const noFalhaRadar = wfRadar.nodes.find((n) => n.name === 'Status falha radar');
  const fnFalha = vm.runInNewContext(`(function($input){ ${noFalhaRadar.parameters.jsCode} })`, {});
  const outFalhas = fnFalha({
    first: () => ({ json: { update: { oferta_id: 'of_1', status: 'falha' }, updates: [{ oferta_id: 'of_1', status: 'falha' }, { oferta_id: 'of_2', status: 'falha' }] } }),
  });
  assert.equal(outFalhas.length, 2, 'Status falha radar deve emitir todos os updates de ofertas que falharam no lote');

  const candsSsd = L.candidatasCopy({
    oferta_id: 'o_ssd',
    produto_id: 'amz_B0SSD1TB',
    loja: 'amazon',
    categoria: 'tech',
    titulo: 'SSD Kingston NV2 1TB',
    preco: 289.90,
    preco_de: 499.90,
  });
  assert.ok(candsSsd.some((c) => /espaço pros jogos e arquivos|HD lento/i.test(c.texto)), 'SSD Kingston NV2 1TB deve ativar copy específica de armazenamento/SSD mesmo sem a palavra NVMe');
});
