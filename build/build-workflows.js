#!/usr/bin/env node
'use strict';
// Gera n8n/workflows/*.json com a biblioteca lib/ embutida nos Code nodes.
// Uso: node build/build-workflows.js
const fs = require('fs');
const path = require('path');
const { TABELAS } = require('../lib/tabelas');

const RAIZ = path.join(__dirname, '..');
const SAIDA = path.join(RAIZ, 'n8n', 'workflows');
const SAIDA_LOCAL = path.join(RAIZ, 'servidor-local', 'workflows');
// IDs fixos no servidor local: a CLI importa e publica por ID, e o workflow do túnel chama o setup por ID.
const IDS_LOCAL = {
  '00-setup.json': 'wfSetup000000001', '01-telegram-router.json': 'wfRouter00000001', '02-coleta-shopee.json': 'wfShopee00000001',
  '03-relatorio-diario.json': 'wfRelat000000001', '04-radar-ofertas.json': 'wfRadar000000001',
  '90-tunel.json': 'wfTunel000000001', '91-saude.json': 'wfSaude000000001',
};

/* ---------- bundle da lib ---------- */

function bundle() {
  const dir = path.join(RAIZ, 'lib');
  const mods = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
  const defs = mods.map((f) => {
    const nome = f.replace(/\.js$/, '');
    const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/^'use strict';\n/, '');
    return `  ${JSON.stringify(nome)}: function (module, exports, require) {\n${src}\n  },`;
  });
  return [
    '// ===== Biblioteca gerada de lib/ (não edite aqui; edite lib/ e rode o build) =====',
    'const LIB = (() => {',
    '  const defs = {',
    ...defs,
    '  };',
    '  const cache = {};',
    '  function req(n) {',
    "    n = n.replace(/^\\.\\//, '').replace(/\\.js$/, '');",
    '    if (cache[n]) return cache[n].exports;',
    "    if (!defs[n]) throw new Error('módulo ausente: ' + n);",
    '    const module = { exports: {} };',
    '    cache[n] = module;',
    '    defs[n](module, module.exports, req);',
    '    return module.exports;',
    '  }',
    "  return req('index');",
    '})();',
    '// ===== Fim da biblioteca =====',
    '',
  ].join('\n');
}

const LIB_SRC = bundle();

/* ---------- construtor de workflow ---------- */

function uuid(seed) {
  // UUID determinístico (para o build ser reproduzível).
  const { sha256Hex } = require('../lib/sha256');
  const h = sha256Hex(seed);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

class WF {
  constructor(nome, settings) {
    this.nome = nome;
    this.nodes = [];
    this.connections = {};
    this.settings = Object.assign({ executionOrder: 'v1', timezone: 'America/Sao_Paulo', saveDataSuccessExecution: 'all' }, settings || {});
  }
  add(node, x, y) {
    if (this.nodes.some((n) => n.name === node.name)) throw new Error('nome duplicado: ' + node.name);
    node.id = uuid(this.nome + '/' + node.name);
    node.position = [x, y];
    this.nodes.push(node);
    return node.name;
  }
  link(de, para, saida) {
    const s = saida || 0;
    const c = (this.connections[de] = this.connections[de] || { main: [] });
    while (c.main.length <= s) c.main.push([]);
    c.main[s].push({ node: para, type: 'main', index: 0 });
  }
  chain(...nomes) {
    for (let i = 0; i < nomes.length - 1; i++) this.link(nomes[i], nomes[i + 1]);
  }
  json() {
    for (const [de, c] of Object.entries(this.connections)) {
      if (!this.nodes.some((n) => n.name === de)) throw new Error('conexão de nó inexistente: ' + de);
      for (const saida of c.main) for (const l of saida) {
        if (!this.nodes.some((n) => n.name === l.node)) throw new Error('conexão para nó inexistente: ' + l.node);
      }
    }
    return {
      name: this.nome,
      nodes: this.nodes,
      connections: this.connections,
      active: false,
      settings: this.settings,
      pinData: {},
      meta: { templateCredsSetupCompleted: true },
      tags: [],
    };
  }
}

/* ---------- fábricas de nós ---------- */

const CFG = "$('Config').first().json.cfg";

function code(name, corpo, opts) {
  const o = opts || {};
  const src = (o.lib ? LIB_SRC : '') + (o.cfg !== false ? `const cfg = ${CFG};\n` : '') + corpo.trim() + '\n';
  return { name, type: 'n8n-nodes-base.code', typeVersion: 2, parameters: { jsCode: src }, notes: o.nota || '' };
}

/** Code node que só transforma um campo em itens (sem a lib). */
function itens(name, expr, nota) {
  // No modo "todos os itens" do Code node, $json não existe: usa o primeiro item de entrada.
  expr = expr.replace(/^\$json\b/, '$input.first().json');
  return code(name, `const v = ${expr};\nreturn (Array.isArray(v) ? v : v ? [v] : []).map((j) => ({ json: j }));`, { cfg: false, nota });
}

const tabela = (t) => {
  if (!TABELAS[t]) throw new Error('tabela desconhecida: ' + t);
  return { __rl: true, mode: 'name', value: t };
};

function dtGet(name, t, condicoes, opts) {
  const o = Object.assign({ returnAll: true, match: 'allConditions' }, opts || {});
  const p = { resource: 'row', operation: 'get', dataTableId: tabela(t), matchType: o.match };
  if (condicoes && condicoes.length) p.filters = { conditions: condicoes.map(([keyName, condition, keyValue]) => ({ keyName, condition, keyValue })) };
  if (o.returnAll) p.returnAll = true;
  else p.limit = o.limit || 1;
  return { name, type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, parameters: p, alwaysOutputData: true, executeOnce: true };
}

const AUTOMAP = { mappingMode: 'autoMapInputData', value: {}, matchingColumns: [], schema: [], attemptToConvertTypes: false, convertFieldsToString: false };

function dtInsert(name, t) {
  return { name, type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, parameters: { resource: 'row', operation: 'insert', dataTableId: tabela(t), columns: AUTOMAP, options: {} } };
}

function dtUpdate(name, t, chave, op, extras) {
  // extras: condições a mais ([coluna, condição, valor]); a linha só muda se todas baterem.
  const conditions = [{ keyName: chave, condition: 'eq', keyValue: `={{ $json.${chave} }}` }]
    .concat((extras || []).map(([keyName, condition, keyValue]) => ({ keyName, condition, keyValue })));
  return {
    name, type: 'n8n-nodes-base.dataTable', typeVersion: 1.1,
    parameters: {
      resource: 'row', operation: op || 'update', dataTableId: tabela(t), matchType: 'allConditions',
      filters: { conditions },
      columns: AUTOMAP, options: {},
    },
  };
}

function dtCreate(name, t) {
  return {
    name, type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, executeOnce: true,
    parameters: {
      resource: 'table', operation: 'create', tableName: t,
      columns: { column: Object.entries(TABELAS[t]).map(([n, type]) => ({ name: n, type })) },
      options: { createIfNotExists: true },
    },
  };
}

function httpTelegram(name, intervalo) {
  return {
    name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, onError: 'continueRegularOutput',
    notes: 'Chama a Bot API do Telegram. Cada item: { bot, metodo, payload }.',
    parameters: {
      method: 'POST',
      url: `={{ ${CFG}.telegram.api }}/bot{{ $json.bot === 'grupo' ? ${CFG}.telegram.bot_token_grupo : ${CFG}.telegram.bot_token }}/{{ $json.metodo }}`,
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify($json.payload) }}',
      options: {
        batching: { batch: { batchSize: 1, batchInterval: intervalo || 60 } },
        response: { response: { neverError: true } },
        timeout: 20000,
      },
    },
  };
}

function httpShopee(name) {
  return {
    name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, onError: 'continueRegularOutput',
    notes: 'Shopee Affiliate Open API. O corpo é enviado exatamente como foi assinado.',
    parameters: {
      method: 'POST',
      url: '={{ $json.http.url }}',
      sendHeaders: true,
      specifyHeaders: 'json',
      jsonHeaders: '={{ JSON.stringify({ Authorization: $json.http.headers.Authorization }) }}',
      sendBody: true,
      contentType: 'raw',
      rawContentType: 'application/json',
      body: '={{ $json.http.body }}',
      options: {
        batching: { batch: { batchSize: 1, batchInterval: 1000 } },
        response: { response: { neverError: true, responseFormat: 'json' } },
        timeout: 20000,
      },
    },
  };
}

function switchExpr(name, expr, saidas) {
  return {
    name, type: 'n8n-nodes-base.switch', typeVersion: 3.2,
    parameters: { mode: 'expression', numberOutputs: saidas, output: `={{ ${expr} }}`, options: {} },
  };
}

function configNodes(wf, x, y) {
  wf.add(dtGet('Ler config', 'bfx_config', []), x, y);
  wf.add(code('Config', 'return [{ json: { cfg: LIB.montarConfig($input.all().map((i) => i.json).filter((r) => r.chave)) } }];', { lib: true, cfg: false }), x + 220, y);
  wf.link('Ler config', 'Config');
}

/* ---------- 00 · setup ---------- */

function wfSetup() {
  const wf = new WF('00 · Setup (rodar manualmente)');
  wf.add({ name: 'Rodar setup', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, parameters: {} }, 0, 300);
  wf.add({
    name: 'Chamado por outro workflow', type: 'n8n-nodes-base.executeWorkflowTrigger', typeVersion: 1.1,
    parameters: { inputSource: 'passthrough' },
    notes: 'Servidor local: o workflow 90 · Túnel chama o setup quando o endereço público muda.',
  }, 0, 480);
  const nomes = Object.keys(TABELAS);
  let prev = 'Rodar setup';
  nomes.forEach((t, i) => {
    const n = wf.add(dtCreate(`Criar ${t}`, t), 220 + i * 200, 300);
    wf.link(prev, n);
    if (i === 0) wf.link('Chamado por outro workflow', n);
    prev = n;
  });
  const x0 = 220 + nomes.length * 200;
  wf.add(dtGet('Ler config', 'bfx_config', []), x0, 300);
  wf.link(prev, 'Ler config');
  wf.add(code('Config', `
const linhas = $input.all().map((i) => i.json).filter((r) => r.chave);
const upserts = LIB.linhasFaltantes(linhas);
// Segredos gerados uma vez: webhook_secret (Telegram) e hash_sal (hash de quem entra/sai do grupo).
for (const chave of ['webhook_secret', 'hash_sal']) {
  const atual = linhas.find((r) => r.chave === chave);
  if (atual && String(atual.valor || '').trim()) continue;
  const s = upserts.find((r) => r.chave === chave);
  const valor = LIB.segredoAleatorio(Date.now());
  if (s) s.valor = valor; else upserts.push({ chave, valor });
}
const cfg = LIB.montarConfig(linhas.concat(upserts));
const { avisos } = LIB.setupChamadas(cfg);
return [{ json: { cfg, upserts, avisos, linhas_novas: upserts.length } }];`, { lib: true, cfg: false, nota: 'Monta a configuração, gera o webhook_secret e o hash_sal e lista o que falta.' }), x0 + 220, 300);
  wf.link('Ler config', 'Config');

  wf.add(itens('Linhas novas de config', '$json.upserts'), x0 + 440, 160);
  wf.add(dtUpdate('Gravar config', 'bfx_config', 'chave', 'upsert'), x0 + 660, 160);
  wf.chain('Config', 'Linhas novas de config', 'Gravar config');

  wf.add(code('Chamadas de setup', 'return LIB.setupChamadas(cfg).chamadas.map((c) => ({ json: c }));', { lib: true }), x0 + 440, 440);
  wf.add(httpTelegram('Telegram (setup)'), x0 + 660, 440);
  wf.add(code('Resumo', `
const chamadas = $('Chamadas de setup').all().map((i) => i.json);
const resp = $input.all().map((i) => i.json);
return [{ json: LIB.resumoSetup(chamadas, resp, $('Config').first().json.avisos, cfg) }];`, { lib: true }), x0 + 880, 440);
  wf.add(itens('Tópicos criados', '$json.topicos'), x0 + 1100, 360);
  wf.add(dtUpdate('Gravar tópicos', 'bfx_config', 'chave', 'upsert'), x0 + 1320, 360);
  wf.add(itens('Mensagem de resumo', '$json.chamadas'), x0 + 1100, 540);
  wf.add(httpTelegram('Telegram (resumo)'), x0 + 1320, 540);
  wf.chain('Config', 'Chamadas de setup', 'Telegram (setup)', 'Resumo');
  wf.chain('Resumo', 'Tópicos criados', 'Gravar tópicos');
  wf.chain('Resumo', 'Mensagem de resumo', 'Telegram (resumo)');
  // @ do bot publicador (getMe) para os links de divulgação do /links.
  wf.add(itens('Config do bot', '$json.config'), x0 + 1100, 200);
  wf.add(dtUpdate('Gravar @ do bot', 'bfx_config', 'chave', 'upsert'), x0 + 1320, 200);
  wf.chain('Resumo', 'Config do bot', 'Gravar @ do bot');

  // Arrumação do grupo (só com grupo.textos = pendente e todos os tópicos criados).
  wf.add(code('Chamadas do grupo', `
const r = $('Resumo').first().json;
return LIB.arrumarGrupoChamadas(cfg, r.topicos, r.grupo_tem_fixada, r.grupo_fixada_id).map((c) => ({ json: c }));`, { lib: true, nota: 'Descrição, General → 💬 Conversa, textos fixados e tópicos de oferta fechados.' }), x0 + 1100, 760);
  // O Telegram limita as ações do bot no grupo (mensagens, fixar e fechar tópico contam): 6 s entre chamadas.
  // Queda de conexão: tenta de novo até 3 vezes.
  wf.add(Object.assign(httpTelegram('Telegram (grupo)', 6000), { retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 }), x0 + 1320, 760);
  wf.add(code('Fixar mensagens', `
const chamadas = $('Chamadas do grupo').all().map((i) => i.json);
const resp = $input.all().map((i) => i.json);
return LIB.fixarChamadas(chamadas, resp, cfg).map((c) => ({ json: c }));`, { lib: true }), x0 + 1540, 760);
  wf.add(Object.assign(httpTelegram('Telegram (fixar)', 6000), { retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 }), x0 + 1760, 760);
  wf.add(code('Resumo do grupo', `
const chamadas = $('Chamadas do grupo').all().map((i) => i.json).concat($('Fixar mensagens').all().map((i) => i.json));
const resp = $('Telegram (grupo)').all().map((i) => i.json).concat($input.all().map((i) => i.json));
return [{ json: LIB.resumoGrupo(chamadas, resp, cfg) }];`, { lib: true }), x0 + 1980, 760);
  wf.add(itens('Config do grupo', '$json.config'), x0 + 2200, 680);
  wf.add(dtUpdate('Gravar grupo.textos', 'bfx_config', 'chave', 'upsert'), x0 + 2420, 680);
  wf.add(itens('Mensagem do grupo', '$json.chamadas'), x0 + 2200, 840);
  wf.add(httpTelegram('Telegram (resumo do grupo)'), x0 + 2420, 840);
  wf.chain('Resumo', 'Chamadas do grupo', 'Telegram (grupo)', 'Fixar mensagens', 'Telegram (fixar)', 'Resumo do grupo');
  wf.chain('Resumo do grupo', 'Config do grupo', 'Gravar grupo.textos');
  wf.chain('Resumo do grupo', 'Mensagem do grupo', 'Telegram (resumo do grupo)');
  return wf;
}

/* ---------- 01 · roteador do Telegram ---------- */

function wfRouter() {
  // Execuções com sucesso não são guardadas: elas levam a cfg com os tokens. As com erro continuam no histórico.
  const wf = new WF('01 · Telegram: aprovação e publicação', { saveDataSuccessExecution: 'none' });
  wf.add({
    name: 'Webhook Telegram', type: 'n8n-nodes-base.webhook', typeVersion: 2, webhookId: uuid('webhook-telegram-ofertas'),
    parameters: { httpMethod: 'POST', path: 'telegram-ofertas', responseMode: 'onReceived', options: {} },
  }, 0, 600);
  configNodes(wf, 220, 600);
  wf.link('Webhook Telegram', 'Ler config');
  // Link curto no /oferta (a.co, amzn.to, s.shopee…): abre sem seguir o redirecionamento e usa o Location.
  wf.add(code('Link curto?', `
const w = $('Webhook Telegram').first().json;
return [{ json: LIB.linkCurtoDoUpdate(w.body, cfg) || {} }];`, { lib: true }), 660, 380);
  wf.add(switchExpr('Abrir link curto?', '$json.url ? 0 : 1', 2), 880, 380);
  wf.add({
    name: 'Abrir link curto', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, onError: 'continueRegularOutput',
    notes: 'Abre o link curto da loja sem seguir o redirecionamento: o endereço completo vem no cabeçalho Location.',
    parameters: {
      method: 'GET',
      url: '={{ $json.url }}',
      sendHeaders: true,
      specifyHeaders: 'json',
      jsonHeaders: '={{ JSON.stringify({ "User-Agent": "Mozilla/5.0 (compatible; OfertoBot/1.0)" }) }}',
      options: {
        redirect: { redirect: { followRedirects: false } },
        response: { response: { fullResponse: true, neverError: true, responseFormat: 'text', outputPropertyName: 'body' } },
        timeout: 10000,
      },
    },
  }, 1100, 300);
  wf.chain('Config', 'Link curto?', 'Abrir link curto?');
  wf.link('Abrir link curto?', 'Abrir link curto', 0);
  wf.add(code('Classificar', `
const w = $('Webhook Telegram').first().json;
const lc = $('Link curto?').first().json;
const respCurto = lc.curto && $('Abrir link curto').isExecuted ? $('Abrir link curto').first().json : null;
const exp = lc.curto && respCurto ? LIB.expandirUpdate(w.body, lc.curto, respCurto) : { body: w.body, expandido: '' };
const meta = lc.curto ? { curto: lc.curto, expandido: exp.expandido, resp_curto: respCurto } : null;
return [{ json: LIB.classificarUpdate(exp.body, w.headers, cfg, Date.now(), w.query, meta) }];`, { lib: true }), 660, 600);
  wf.link('Abrir link curto', 'Classificar');
  wf.link('Abrir link curto?', 'Classificar', 1);
  // Chamadas imediatas de qualquer rota (ex.: apagar do grupo o /oferta que um admin mandou lá).
  wf.add(itens('Chamadas imediatas', '$json.imediatas'), 880, 780);
  wf.add(httpTelegram('Telegram (imediatas)'), 1100, 780);
  wf.chain('Classificar', 'Chamadas imediatas', 'Telegram (imediatas)');
  wf.add(switchExpr('Rota', "({ oferta: 0, callback: 1, membro: 2, convite: 3, responder: 4, pospub: 5, start: 6, sugestao: 7, config: 8, radar: 9 })[$json.rota] ?? 10", 11), 880, 600);
  wf.link('Classificar', 'Rota');

  // 0 · oferta (/oferta, /link ou link colado direto no privado)
  // Antes do selo: resposta ao card, checagem de duplicata 24h, Keepa (opcional) e leitura gratuita da página HTML.
  wf.add(dtGet('Oferta respondida', 'bfx_ofertas', [
    ['oferta_id', 'eq', "={{ ($json.resposta && $json.resposta.oferta_id) || '-' }}"],
    ['produto_id', 'eq', "={{ ($json.oferta && $json.oferta.produto_id) || '-' }}"],
  ], { match: 'anyCondition' }), 1100, -300);
  wf.add(code('Preparar oferta', `
const cls = $('Classificar').first().json;
const rows = $input.all().map((i) => i.json).filter((r) => r.oferta_id);
return [{ json: LIB.prepararOferta(cls, rows, cfg) }];`, { lib: true, nota: 'Monta consulta à Keepa, leitura gratuita de página ou remonta oferta respondida.' }), 1320, -300);
  wf.add(switchExpr('Consultar Keepa?', '$json.keepa_http ? 0 : 1', 2), 1540, -300);
  wf.add({
    name: 'Keepa', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, onError: 'continueRegularOutput',
    notes: 'Keepa API: menor preço em 90 dias, preço atual, título e imagem (1 token por consulta). Erro não para o fluxo.',
    parameters: {
      method: 'GET',
      url: '={{ $json.keepa_http.url }}',
      options: { response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } }, timeout: 15000 },
    },
  }, 1760, -400);
  wf.add(code('Juntar Keepa', `
const e = $('Preparar oferta').first().json;
const resp = e.keepa_http && $('Keepa').isExecuted ? $('Keepa').first().json : null;
return [{ json: LIB.juntarKeepa(e, resp, cfg) }];`, { lib: true, nota: 'O que o admin digitou tem prioridade; a Keepa preenche o que falta.' }), 1980, -300);
  wf.add(switchExpr('Consultar página?', '$json.pagina_http ? 0 : 1', 2), 2200, -300);
  wf.add({
    name: 'Ler página do produto', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, onError: 'continueRegularOutput',
    notes: 'Lê gratuitamente metadados públicos da página (JSON-LD, OpenGraph, preço e imagem). Erro não para o fluxo.',
    parameters: {
      method: 'GET',
      url: '={{ $json.pagina_http.url }}',
      sendHeaders: true,
      specifyHeaders: 'json',
      jsonHeaders: '={{ JSON.stringify($json.pagina_http.headers) }}',
      options: {
        response: { response: { fullResponse: true, neverError: true, responseFormat: 'text', outputPropertyName: 'body' } },
        timeout: 12000,
      },
    },
  }, 2420, -400);
  wf.add(code('Juntar página', `
const e = $('Juntar Keepa').first().json;
const resp = e.pagina_http && $('Ler página do produto').isExecuted ? $('Ler página do produto').first().json : null;
return [{ json: LIB.juntarPagina(e, resp, cfg) }];`, { lib: true, nota: 'Completa título, preço, preço antigo e imagem lidos gratuitamente da página.' }), 2640, -300);
  wf.add(switchExpr('Oferta completa?', "$json.rota === 'oferta' ? 0 : 1", 2), 2860, -300);
  wf.add(itens('Erro da oferta', '$json.chamadas'), 3080, -200);
  wf.add(httpTelegram('Telegram (erro da oferta)'), 3300, -200);
  wf.add(itens('Marcar substituída', '$json.update'), 1540, -500);
  wf.add(dtUpdate('Atualizar substituída', 'bfx_ofertas', 'oferta_id'), 1760, -500);
  wf.link('Rota', 'Oferta respondida', 0);
  wf.chain('Oferta respondida', 'Preparar oferta', 'Consultar Keepa?');
  wf.link('Consultar Keepa?', 'Keepa', 0);
  wf.link('Keepa', 'Juntar Keepa');
  wf.link('Consultar Keepa?', 'Juntar Keepa', 1);
  wf.chain('Juntar Keepa', 'Consultar página?');
  wf.link('Consultar página?', 'Ler página do produto', 0);
  wf.link('Ler página do produto', 'Juntar página');
  wf.link('Consultar página?', 'Juntar página', 1);
  wf.chain('Juntar página', 'Oferta completa?');
  wf.link('Oferta completa?', 'Histórico do produto', 0);
  wf.link('Oferta completa?', 'Erro da oferta', 1);
  wf.chain('Erro da oferta', 'Telegram (erro da oferta)');
  wf.chain('Preparar oferta', 'Marcar substituída', 'Atualizar substituída');
  wf.add(dtGet('Histórico do produto', 'bfx_precos', [['produto_id', 'eq', '={{ $json.oferta.produto_id }}']]), 1100, 100);
  wf.add(code('Avaliar oferta', `
const cls = $('Juntar página').first().json;
const rows = $input.all().map((i) => i.json).filter((r) => r.produto_id);
return [{ json: LIB.avaliarNovaOferta(cls, rows, cfg) }];`, { lib: true }), 1320, 100);
  wf.add(itens('Linhas de preço', '$json.precosNovos'), 1540, 0);
  wf.add(dtInsert('Gravar preços', 'bfx_precos'), 1760, 0);
  wf.add(itens('Linha da oferta', '$json.oferta'), 1540, 180);
  wf.add(dtInsert('Gravar oferta', 'bfx_ofertas'), 1760, 180);
  wf.add(itens('Card de aprovação', "$('Avaliar oferta').first().json.chamadas"), 1980, 180);
  wf.add(httpTelegram('Telegram (card)'), 2200, 180);
  wf.add(code('Auto-publicar?', `
const av = $('Avaliar oferta').first().json;
if (!av.auto_publicar) return [];
const cardResp = $input.first() && $input.first().json;
const cardMsgId = (cardResp && cardResp.result && cardResp.result.message_id) || null;
return [{ json: {
  oferta: av.auto_publicar.oferta,
  linkItens: av.auto_publicar.linkItens,
  ctx: { ts: av.auto_publicar.ts, chat_id: av.auto_publicar.chat_id, message_id: cardMsgId, so_textos: !!av.auto_publicar.so_textos },
} }];`, { cfg: false, nota: 'Com auto.publicar_direto = sim (/modo rapido), publica sem exigir clique.' }), 2420, 180);
  wf.chain('Histórico do produto', 'Avaliar oferta');
  wf.chain('Avaliar oferta', 'Linhas de preço', 'Gravar preços');
  wf.chain('Avaliar oferta', 'Linha da oferta', 'Gravar oferta', 'Card de aprovação', 'Telegram (card)', 'Auto-publicar?');

  // 1 · clique nos botões (e convergência da publicação automática)
  wf.add(dtGet('Buscar oferta', 'bfx_ofertas', [['oferta_id', 'eq', '={{ $json.oferta_id }}']], { returnAll: false, limit: 1 }), 1100, 520);
  wf.add(code('Decidir', `
const cb = $('Classificar').first().json;
return [{ json: LIB.decidirCallback(cb, $input.all().map((i) => i.json), cfg) }];`, { lib: true }), 1320, 520);
  // Ordem (v1, de cima para baixo): responde o clique, muda o status e só então publica.
  wf.add(itens('Respostas do clique', "$('Decidir').first().json.chamadas"), 1540, 360);
  wf.add(httpTelegram('Telegram (clique)'), 1760, 360);
  wf.add(itens('Atualização', '$json.update'), 1540, 480);
  // Só muda a linha que ainda está "pendente": num clique duplo simultâneo, o segundo não acha linha e não publica.
  wf.add(dtUpdate('Atualizar oferta', 'bfx_ofertas', 'oferta_id', 'update', [['status', 'eq', 'pendente']]), 1760, 480);
  wf.add(code('Plano do clique', `
const cls = $('Classificar').first().json;
const d = $('Decidir').first().json;
if (d.proximo !== 'publicar' || !$input.all().some((i) => i.json.oferta_id === d.oferta.oferta_id)) return [];
return [{ json: {
  oferta: d.oferta,
  linkItens: d.linkItens,
  ctx: { ts: cls.ts, chat_id: cls.chat_id, message_id: cls.message_id, so_textos: !!d.so_textos },
} }];`, { cfg: false }), 1980, 480);
  wf.add(code('Plano de links', 'return [{ json: $input.first().json }];', { cfg: false }), 2160, 480);
  wf.add(code('Itens de link', `
const d = $input.first().json;
const sh = d.linkItens.filter((i) => i.metodo === 'shopee');
return (sh.length ? sh : d.linkItens).map((j) => ({ json: j }));`, { cfg: false }), 2340, 480);
  wf.add(switchExpr('Precisa da Shopee?', "$json.metodo === 'shopee' ? 0 : 1", 2), 1760, 600);
  wf.add(httpShopee('Shopee: link curto'), 1980, 540);
  wf.add(code('Ler links Shopee', `
const todos = $('Plano de links').first().json.linkItens;
const resp = $input.all().map((i) => i.json);
let k = 0;
return todos.map((it) => ({ json: it.metodo === 'shopee' ? LIB.lerRespostasShopee([it], [resp[k++]])[0] : it }));`, { lib: true, cfg: false }), 2200, 540);
  wf.add(code('Publicar', `
const p = $('Plano de links').first().json;
const itensLink = $input.all().map((i) => i.json);
return [{ json: LIB.prepararPublicacao(p.oferta, itensLink, cfg, p.ctx) }];`, { lib: true }), 2420, 640);
  wf.link('Rota', 'Buscar oferta', 1);
  wf.chain('Buscar oferta', 'Decidir');
  wf.chain('Decidir', 'Respostas do clique', 'Telegram (clique)');
  wf.chain('Decidir', 'Atualização', 'Atualizar oferta', 'Plano do clique', 'Plano de links', 'Itens de link', 'Precisa da Shopee?');
  wf.link('Auto-publicar?', 'Plano de links');
  wf.link('Precisa da Shopee?', 'Shopee: link curto', 0);
  wf.chain('Shopee: link curto', 'Ler links Shopee', 'Publicar');
  wf.link('Precisa da Shopee?', 'Publicar', 1);

  wf.add(itens('Status final', '$json.update'), 2640, 480);
  wf.add(dtUpdate('Atualizar status', 'bfx_ofertas', 'oferta_id'), 2860, 480);
  wf.add(itens('Linhas de link', '$json.linksRows'), 2640, 600);
  wf.add(dtInsert('Gravar links', 'bfx_links'), 2860, 600);
  wf.add(itens('Mensagens', "$('Publicar').first().json.chamadas"), 2640, 740);
  wf.add(httpTelegram('Telegram (publicação)'), 2860, 740);
  // Limite do Telegram (429): espera o tempo pedido e reenvia uma vez só o que foi barrado.
  wf.add(code('Checar limite', `
const chamadas = $('Mensagens').all().map((i) => i.json);
return [{ json: LIB.limiteTelegram(chamadas, $input.all().map((i) => i.json)) }];`, { lib: true, cfg: false }), 3080, 740);
  wf.add({
    name: 'Barrado pelo limite?', type: 'n8n-nodes-base.if', typeVersion: 2.2,
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ id: 'lim', leftValue: '={{ $json.indices.length }}', rightValue: 0, operator: { type: 'number', operation: 'gt' } }],
        combinator: 'and',
      },
      options: {},
    },
  }, 3300, 740);
  wf.add({ name: 'Esperar o Telegram', type: 'n8n-nodes-base.wait', typeVersion: 1.1, webhookId: uuid('wait-limite-telegram'), parameters: { resume: 'timeInterval', amount: '={{ $json.espera }}', unit: 'seconds' } }, 3520, 640);
  wf.add(itens('Reenviar', '$json.reenviar'), 3740, 640);
  wf.add(httpTelegram('Telegram (reenvio)'), 3960, 640);
  wf.add(code('Resultado', `
const chamadas = $('Mensagens').all().map((i) => i.json);
let resp = $('Telegram (publicação)').all().map((i) => i.json);
const lim = $('Checar limite').first().json;
if (lim.indices.length && $('Telegram (reenvio)').isExecuted) resp = LIB.juntarReenvio(resp, lim, $('Telegram (reenvio)').all().map((i) => i.json));
return [{ json: LIB.resultadoChamadas(chamadas, resp, cfg, Date.now()) }];`, { lib: true }), 4180, 740);
  // Post do grupo que não saiu nem no reenvio: status "falha" (o admin recebe o alerta).
  wf.add(itens('Status de falha', '$json.update'), 4400, 560);
  wf.add(dtUpdate('Gravar falha', 'bfx_ofertas', 'oferta_id'), 4620, 560);
  wf.add(itens('Linhas de post', '$json.posts'), 4400, 680);
  wf.add(dtInsert('Gravar posts', 'bfx_posts'), 4620, 680);
  wf.add(itens('Alertas', "$('Resultado').first().json.alertas"), 4400, 820);
  wf.add(httpTelegram('Telegram (alertas)'), 4620, 820);
  wf.chain('Publicar', 'Status final', 'Atualizar status');
  wf.chain('Publicar', 'Linhas de link', 'Gravar links');
  wf.chain('Publicar', 'Mensagens', 'Telegram (publicação)', 'Checar limite', 'Barrado pelo limite?');
  wf.link('Barrado pelo limite?', 'Esperar o Telegram', 0);
  wf.chain('Esperar o Telegram', 'Reenviar', 'Telegram (reenvio)', 'Resultado');
  wf.link('Barrado pelo limite?', 'Resultado', 1);
  wf.chain('Resultado', 'Status de falha', 'Gravar falha');
  wf.chain('Resultado', 'Linhas de post', 'Gravar posts');
  wf.chain('Resultado', 'Alertas', 'Telegram (alertas)');

  // 2 · entrada/saída no grupo
  wf.add(itens('Linha de entrada', '$json.linha'), 1100, 960);
  wf.add(dtInsert('Gravar entrada', 'bfx_entradas'), 1320, 960);
  wf.link('Rota', 'Linha de entrada', 2);
  wf.chain('Linha de entrada', 'Gravar entrada');

  // 3 · /convite
  wf.add(itens('Pedido de convite', '$json.chamadas'), 1100, 1100);
  wf.add(httpTelegram('Telegram (convite)'), 1320, 1100);
  wf.add(code('Registrar convite', `
return [{ json: LIB.registrarConvite($('Classificar').first().json, $input.first().json, cfg) }];`, { lib: true }), 1540, 1100);
  wf.add(itens('Linha do convite', '$json.linha'), 1760, 1040);
  wf.add(dtInsert('Gravar convite', 'bfx_convites'), 1980, 1040);
  wf.add(itens('Resposta do convite', "$('Registrar convite').first().json.chamadas"), 1760, 1180);
  wf.add(httpTelegram('Telegram (link do convite)'), 1980, 1180);
  wf.link('Rota', 'Pedido de convite', 3);
  wf.chain('Pedido de convite', 'Telegram (convite)', 'Registrar convite');
  wf.chain('Registrar convite', 'Linha do convite', 'Gravar convite');
  wf.chain('Registrar convite', 'Resposta do convite', 'Telegram (link do convite)');

  // 4 · respostas simples
  wf.add(itens('Respostas', '$json.chamadas'), 1100, 1300);
  wf.add(httpTelegram('Telegram (respostas)'), 1320, 1300);
  wf.link('Rota', 'Respostas', 4);
  wf.chain('Respostas', 'Telegram (respostas)');

  // 5 · card já publicado: ⭐ Mandar ao Top (p) e ⛔ Encerrar (z)
  const CLS = "$('Classificar').first().json";
  wf.add(dtGet('Oferta publicada', 'bfx_ofertas', [['oferta_id', 'eq', '={{ $json.oferta_id }}']], { returnAll: false, limit: 1 }), 1100, 1460);
  wf.add(dtGet('Posts da oferta e de hoje', 'bfx_posts', [
    ['oferta_id', 'eq', `={{ ${CLS}.oferta_id }}`],
    ['ts', 'gte', `={{ ${CLS}.desde }}`],
  ], { match: 'anyCondition' }), 1320, 1460);
  wf.add(dtGet('Links da oferta', 'bfx_links', [['oferta_id', 'eq', `={{ ${CLS}.oferta_id }}`]]), 1540, 1460);
  wf.add(code('Decidir (publicada)', `
const pega = (n) => $(n).all().map((i) => i.json);
return [{ json: LIB.decidirPosPublicacao(${CLS}, pega('Oferta publicada'), pega('Posts da oferta e de hoje'), pega('Links da oferta'), cfg) }];`, { lib: true }), 1760, 1460);
  wf.add(itens('Atualização (publicada)', '$json.update'), 1980, 1380);
  wf.add(dtUpdate('Atualizar oferta publicada', 'bfx_ofertas', 'oferta_id'), 2200, 1380);
  wf.add(itens('Chamadas (publicada)', "$('Decidir (publicada)').first().json.chamadas"), 1980, 1540);
  wf.add(httpTelegram('Telegram (publicada)'), 2200, 1540);
  wf.add(code('Resultado (publicada)', `
const chamadas = $('Chamadas (publicada)').all().map((i) => i.json);
return [{ json: LIB.resultadoChamadas(chamadas, $input.all().map((i) => i.json), cfg, Date.now()) }];`, { lib: true }), 2420, 1540);
  wf.add(itens('Post do Top', '$json.posts'), 2640, 1480);
  wf.add(dtInsert('Gravar post do Top', 'bfx_posts'), 2860, 1480);
  wf.add(itens('Alertas (publicada)', "$('Resultado (publicada)').first().json.alertas"), 2640, 1620);
  wf.add(httpTelegram('Telegram (alertas da publicada)'), 2860, 1620);
  wf.link('Rota', 'Oferta publicada', 5);
  wf.chain('Oferta publicada', 'Posts da oferta e de hoje', 'Links da oferta', 'Decidir (publicada)');
  wf.chain('Decidir (publicada)', 'Atualização (publicada)', 'Atualizar oferta publicada');
  wf.chain('Decidir (publicada)', 'Chamadas (publicada)', 'Telegram (publicada)', 'Resultado (publicada)');
  wf.chain('Resultado (publicada)', 'Post do Top', 'Gravar post do Top');
  wf.chain('Resultado (publicada)', 'Alertas (publicada)', 'Telegram (alertas da publicada)');

  // 6 · /start no bot publicador: grava o start, reaproveita ou cria o convite nomeado e responde
  wf.add(itens('Linha do start', '$json.linha'), 1100, 1760);
  wf.add(dtInsert('Gravar start', 'bfx_entradas'), 1320, 1760);
  wf.add(dtGet('Convite do start', 'bfx_convites', [['nome', 'eq', `={{ ${CLS}.convite || '-' }}`]], { returnAll: false, limit: 1 }), 1100, 1900);
  wf.add(code('Boas-vindas', `
return LIB.boasVindasStart(${CLS}, $input.all().map((i) => i.json), cfg).map((c) => ({ json: c }));`, { lib: true }), 1320, 1900);
  wf.add(httpTelegram('Telegram (boas-vindas)'), 1540, 1900);
  wf.add(code('Convite criado', `
const chamadas = $('Boas-vindas').all().map((i) => i.json);
return [{ json: LIB.startComConvite(${CLS}, chamadas, $input.all().map((i) => i.json), cfg) }];`, { lib: true }), 1760, 1900);
  wf.add(itens('Linha do convite do start', '$json.linha'), 1980, 1840);
  wf.add(dtInsert('Gravar convite do start', 'bfx_convites'), 2200, 1840);
  wf.add(itens('Resposta do start', "$('Convite criado').first().json.chamadas"), 1980, 1980);
  wf.add(httpTelegram('Telegram (start)'), 2200, 1980);
  wf.link('Rota', 'Linha do start', 6);
  wf.chain('Linha do start', 'Gravar start');
  wf.link('Rota', 'Convite do start', 6);
  wf.chain('Convite do start', 'Boas-vindas', 'Telegram (boas-vindas)', 'Convite criado');
  wf.chain('Convite criado', 'Linha do convite do start', 'Gravar convite do start');
  wf.chain('Convite criado', 'Resposta do start', 'Telegram (start)');

  // 7 · sugestão de membro no 💬 Conversa: 1 "Valeu!" por membro a cada 10 min; aviso aos admins sempre
  wf.add(code('Antiflood', `
let estado = {};
try { estado = $getWorkflowStaticData('global'); } catch (e) { /* sem estado: responde sempre */ }
const cls = ${CLS};
return LIB.filtrarSugestao(cls, estado, cls.ts).map((c) => ({ json: c }));`, { lib: true, cfg: false }), 1100, 2120);
  wf.add(httpTelegram('Telegram (sugestão)'), 1320, 2120);
  wf.link('Rota', 'Antiflood', 7);
  wf.chain('Antiflood', 'Telegram (sugestão)');

  // 8 · /modo e /config: salva ajustes rápidos na bfx_config e responde no privado
  wf.add(itens('Upserts de config', '$json.upserts'), 1100, 2280);
  wf.add(Object.assign(dtUpdate('Salvar config rápida', 'bfx_config', 'chave', 'upsert'), { alwaysOutputData: true }), 1320, 2280);
  wf.add(itens('Resposta de config', `${CLS}.chamadas`), 1540, 2280);
  wf.add(httpTelegram('Telegram (config)'), 1760, 2280);
  wf.link('Rota', 'Upserts de config', 8);
  wf.chain('Upserts de config', 'Salvar config rápida', 'Resposta de config', 'Telegram (config)');

  // 9 · /radar [loja|categoria|termo]: busca promoções sob demanda em ML, Amazon, Shopee, Shein e TikTok Shop
  adicionarSubfluxoRadar(wf, {
    prefixo: 'Radar: ',
    x0: 1100,
    y0: 2520,
    entradaNode: 'Rota',
    entradaSaida: 9,
    opcoesCode: "Object.assign({ modo: 'comando', chat_id: $('Classificar').first().json.chat_id, user_id: $('Classificar').first().json.user_id, ts: $('Classificar').first().json.ts }, $('Classificar').first().json.opcoes || {})",
  });
  return wf;
}

/* ---------- subfluxo reutilizável do radar multi-fonte ---------- */

function httpRadarGet(name, follow) {
  const opts = {
    batching: { batch: { batchSize: 1, batchInterval: 150 } },
    response: { response: { fullResponse: true, neverError: true, responseFormat: 'text', outputPropertyName: 'body' } },
    timeout: 15000,
  };
  if (!follow) opts.redirect = { redirect: { followRedirects: false } };
  return {
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: '={{ $json.url }}',
      sendHeaders: true,
      specifyHeaders: 'json',
      jsonHeaders: '={{ JSON.stringify($json.headers) }}',
      options: opts,
    },
  };
}

function adicionarSubfluxoRadar(wf, cfgFluxo) {
  const P = cfgFluxo.prefixo || '';
  const N = (s) => P + s;
  const x = cfgFluxo.x0;
  const y = cfgFluxo.y0;

  wf.add(code(N('Planejar'), `
const p = LIB.planejarFontesRadar(cfg, ${cfgFluxo.opcoesCode});
if (!p.ativo) return [];
return [{ json: p }];`, { lib: true }), x, y);

  wf.add(switchExpr(N('Tem web?'), `$('${N('Planejar')}').first().json.fontesWeb.length > 0 ? 0 : 1`, 2), x + 220, y);
  wf.add(itens(N('Fontes web'), `$('${N('Planejar')}').first().json.fontesWeb`), x + 440, y - 120);
  wf.add(httpRadarGet(N('Buscar fontes web'), true), x + 660, y - 120);

  wf.add(switchExpr(N('Tem Shopee?'), `$('${N('Planejar')}').first().json.fontesShopee.length > 0 ? 0 : 1`, 2), x + 880, y);
  wf.add(itens(N('Fontes Shopee'), `$('${N('Planejar')}').first().json.fontesShopee`), x + 1100, y - 120);
  wf.add(httpShopee(N('Shopee: radar')), x + 1320, y - 120);

  wf.add(dtGet(N('Ofertas recentes'), 'bfx_ofertas', [['ts', 'gte', '={{ Date.now() - 4 * 86400000 }}']]), x + 1540, y);
  wf.add(dtGet(N('Histórico radar'), 'bfx_precos', [['ts', 'gte', '={{ Date.now() - 91 * 86400000 }}']]), x + 1760, y);
  wf.add(code(N('Selecionar radar'), `
const base = $('${N('Planejar')}').first().json;
const respWeb = base.fontesWeb.length && $('${N('Buscar fontes web')}').isExecuted ? $('${N('Buscar fontes web')}').all().map((i) => i.json) : [];
const respSh = base.fontesShopee.length && $('${N('Shopee: radar')}').isExecuted ? $('${N('Shopee: radar')}').all().map((i) => i.json) : [];
const ofertas = $('${N('Ofertas recentes')}').all().map((i) => i.json).filter((r) => r.oferta_id);
const precos = $input.all().map((i) => i.json).filter((r) => r.produto_id);
return [{ json: LIB.selecionarCandidatosRadar(base, respWeb, respSh, ofertas, precos, cfg) }];`, { lib: true }), x + 1980, y);

  wf.add(switchExpr(N('Tem redir 1?'), '$json.reqs1.length > 0 ? 0 : 1', 2), x + 2200, y);
  wf.add(itens(N('Itens redir 1'), `$('${N('Selecionar radar')}').first().json.reqs1`), x + 2420, y - 120);
  wf.add(httpRadarGet(N('Abrir redir 1'), false), x + 2640, y - 120);
  wf.add(code(N('Aplicar redir 1'), `
const est = $('${N('Selecionar radar')}').first().json;
const resp1 = est.reqs1.length && $('${N('Abrir redir 1')}').isExecuted ? $('${N('Abrir redir 1')}').all().map((i) => i.json) : [];
return [{ json: LIB.aplicarRedirRadar1(est, resp1, cfg) }];`, { lib: true }), x + 2860, y);

  wf.add(switchExpr(N('Tem redir 2?'), '$json.reqs2.length > 0 ? 0 : 1', 2), x + 3080, y);
  wf.add(itens(N('Itens redir 2'), `$('${N('Aplicar redir 1')}').first().json.reqs2`), x + 3300, y - 120);
  wf.add(httpRadarGet(N('Abrir redir 2'), false), x + 3520, y - 120);
  wf.add(code(N('Aplicar redir 2'), `
const est = $('${N('Aplicar redir 1')}').first().json;
const resp2 = est.reqs2.length && $('${N('Abrir redir 2')}').isExecuted ? $('${N('Abrir redir 2')}').all().map((i) => i.json) : [];
return [{ json: LIB.aplicarRedirRadar2(est, resp2, cfg) }];`, { lib: true }), x + 3740, y);

  wf.add(switchExpr(N('Tem vitrine 3?'), '$json.reqs3.length > 0 ? 0 : 1', 2), x + 3960, y);
  wf.add(itens(N('Itens vitrine 3'), `$('${N('Aplicar redir 2')}').first().json.reqs3`), x + 4180, y - 120);
  wf.add(httpRadarGet(N('Abrir vitrine 3'), true), x + 4400, y - 120);
  wf.add(code(N('Preparar páginas radar'), `
const est = $('${N('Aplicar redir 2')}').first().json;
const resp3 = est.reqs3.length && $('${N('Abrir vitrine 3')}').isExecuted ? $('${N('Abrir vitrine 3')}').all().map((i) => i.json) : [];
return [{ json: LIB.prepararPaginasRadar(est, resp3, cfg) }];`, { lib: true }), x + 4620, y);
  wf.add(switchExpr(N('Tem páginas radar?'), '$json.reqsPag.length > 0 ? 0 : 1', 2), x + 4840, y);
  wf.add(itens(N('Itens páginas radar'), `$('${N('Preparar páginas radar')}').first().json.reqsPag`), x + 5060, y - 120);
  wf.add(httpRadarGet(N('Ler páginas radar'), true), x + 5280, y - 120);
  wf.add(code(N('Finalizar radar'), `
const est = $('${N('Preparar páginas radar')}').first().json;
const respPag = est.reqsPag.length && $('${N('Ler páginas radar')}').isExecuted ? $('${N('Ler páginas radar')}').all().map((i) => i.json) : [];
const ofertas = $('${N('Ofertas recentes')}').all().map((i) => i.json).filter((r) => r.oferta_id);
const precos = $('${N('Histórico radar')}').all().map((i) => i.json).filter((r) => r.produto_id);
return [{ json: LIB.finalizarRadar(est, [], ofertas, precos, cfg, respPag) }];`, { lib: true }), x + 5500, y);

  wf.add(itens(N('Preços radar'), '$json.precosNovos'), x + 5720, y - 180);
  wf.add(dtInsert(N('Gravar preços radar'), 'bfx_precos'), x + 5940, y - 180);
  wf.add(itens(N('Ofertas radar'), `$('${N('Finalizar radar')}').first().json.ofertasNovas`), x + 5720, y);
  wf.add(dtInsert(N('Gravar ofertas radar'), 'bfx_ofertas'), x + 5940, y);
  wf.add(itens(N('Cards radar'), `$('${N('Finalizar radar')}').first().json.chamadas`), x + 5720, y + 180);
  wf.add(httpTelegram(N('Telegram (cards radar)')), x + 5940, y + 180);

  // Publicação automática em lote quando /modo piloto (radar.publicar_direto) está ativo
  wf.add(code(N('Auto radar?'), `
const f = $('${N('Finalizar radar')}').first().json;
return f.autoPlanos && f.autoPlanos.length ? [{ json: f }] : [];`, { cfg: false }), x + 6160, y + 180);
  wf.add(switchExpr(N('Tem Shopee auto?'), '$json.reqsShopeeLinks.length > 0 ? 0 : 1', 2), x + 6380, y + 180);
  wf.add(itens(N('Itens Shopee auto'), `$('${N('Finalizar radar')}').first().json.reqsShopeeLinks`), x + 6600, y + 60);
  wf.add(httpShopee(N('Shopee: links radar')), x + 6820, y + 60);
  wf.add(code(N('Publicar lote radar'), `
const fin = $('${N('Finalizar radar')}').first().json;
const respSh = fin.reqsShopeeLinks.length && $('${N('Shopee: links radar')}').isExecuted ? $('${N('Shopee: links radar')}').all().map((i) => i.json) : [];
const respCards = $('${N('Telegram (cards radar)')}').all().map((i) => i.json);
return [{ json: LIB.publicarLoteRadar(fin, respSh, respCards, cfg) }];`, { lib: true }), x + 7040, y + 180);

  wf.add(itens(N('Updates lote'), '$json.updates'), x + 7260, y + 40);
  wf.add(dtUpdate(N('Atualizar lote radar'), 'bfx_ofertas', 'oferta_id'), x + 7480, y + 40);
  wf.add(itens(N('Links lote'), `$('${N('Publicar lote radar')}').first().json.linksRows`), x + 7260, y + 180);
  wf.add(dtInsert(N('Gravar links radar'), 'bfx_links'), x + 7480, y + 180);
  wf.add(itens(N('Mensagens lote'), `$('${N('Publicar lote radar')}').first().json.chamadasPub`), x + 7260, y + 320);
  wf.add(httpTelegram(N('Telegram (pub radar)')), x + 7480, y + 320);
  wf.add(code(N('Resultado lote radar'), `
const chamadas = $('${N('Mensagens lote')}').all().map((i) => i.json);
return [{ json: LIB.resultadoChamadas(chamadas, $input.all().map((i) => i.json), cfg, Date.now()) }];`, { lib: true }), x + 7700, y + 320);
  wf.add(itens(N('Posts lote'), '$json.posts'), x + 7920, y + 240);
  wf.add(dtInsert(N('Gravar posts radar'), 'bfx_posts'), x + 8140, y + 240);
  wf.add(itens(N('Alertas lote'), `$('${N('Resultado lote radar')}').first().json.alertas`), x + 7920, y + 400);
  wf.add(httpTelegram(N('Telegram (alertas radar)')), x + 8140, y + 400);

  wf.link(cfgFluxo.entradaNode, N('Planejar'), cfgFluxo.entradaSaida || 0);
  wf.chain(N('Planejar'), N('Tem web?'));
  wf.link(N('Tem web?'), N('Fontes web'), 0);
  wf.chain(N('Fontes web'), N('Buscar fontes web'), N('Tem Shopee?'));
  wf.link(N('Tem web?'), N('Tem Shopee?'), 1);

  wf.link(N('Tem Shopee?'), N('Fontes Shopee'), 0);
  wf.chain(N('Fontes Shopee'), N('Shopee: radar'), N('Ofertas recentes'));
  wf.link(N('Tem Shopee?'), N('Ofertas recentes'), 1);

  wf.chain(N('Ofertas recentes'), N('Histórico radar'), N('Selecionar radar'), N('Tem redir 1?'));
  wf.link(N('Tem redir 1?'), N('Itens redir 1'), 0);
  wf.chain(N('Itens redir 1'), N('Abrir redir 1'), N('Aplicar redir 1'));
  wf.link(N('Tem redir 1?'), N('Aplicar redir 1'), 1);

  wf.chain(N('Aplicar redir 1'), N('Tem redir 2?'));
  wf.link(N('Tem redir 2?'), N('Itens redir 2'), 0);
  wf.chain(N('Itens redir 2'), N('Abrir redir 2'), N('Aplicar redir 2'));
  wf.link(N('Tem redir 2?'), N('Aplicar redir 2'), 1);

  wf.chain(N('Aplicar redir 2'), N('Tem vitrine 3?'));
  wf.link(N('Tem vitrine 3?'), N('Itens vitrine 3'), 0);
  wf.chain(N('Itens vitrine 3'), N('Abrir vitrine 3'), N('Preparar páginas radar'));
  wf.link(N('Tem vitrine 3?'), N('Preparar páginas radar'), 1);

  wf.chain(N('Preparar páginas radar'), N('Tem páginas radar?'));
  wf.link(N('Tem páginas radar?'), N('Itens páginas radar'), 0);
  wf.chain(N('Itens páginas radar'), N('Ler páginas radar'), N('Finalizar radar'));
  wf.link(N('Tem páginas radar?'), N('Finalizar radar'), 1);

  wf.chain(N('Finalizar radar'), N('Preços radar'), N('Gravar preços radar'));
  wf.chain(N('Finalizar radar'), N('Ofertas radar'), N('Gravar ofertas radar'));
  wf.chain(N('Finalizar radar'), N('Cards radar'), N('Telegram (cards radar)'), N('Auto radar?'), N('Tem Shopee auto?'));

  wf.link(N('Tem Shopee auto?'), N('Itens Shopee auto'), 0);
  wf.chain(N('Itens Shopee auto'), N('Shopee: links radar'), N('Publicar lote radar'));
  wf.link(N('Tem Shopee auto?'), N('Publicar lote radar'), 1);

  wf.chain(N('Publicar lote radar'), N('Updates lote'), N('Atualizar lote radar'));
  wf.chain(N('Publicar lote radar'), N('Links lote'), N('Gravar links radar'));
  wf.chain(N('Publicar lote radar'), N('Mensagens lote'), N('Telegram (pub radar)'), N('Resultado lote radar'));
  wf.chain(N('Resultado lote radar'), N('Posts lote'), N('Gravar posts radar'));
  wf.chain(N('Resultado lote radar'), N('Alertas lote'), N('Telegram (alertas radar)'));
}

/* ---------- 04 · radar multi-fonte ---------- */

function wfRadar() {
  const wf = new WF('04 · Radar Multi-Fonte (a cada 10 min)');
  wf.add({
    name: 'A cada 10 minutos (radar)',
    type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1.2,
    parameters: { rule: { interval: [{ field: 'cronExpression', expression: '*/10 * * * *' }] } },
  }, 0, 300);
  configNodes(wf, 220, 300);
  wf.link('A cada 10 minutos (radar)', 'Ler config');
  adicionarSubfluxoRadar(wf, {
    prefixo: '',
    x0: 660,
    y0: 300,
    entradaNode: 'Config',
    entradaSaida: 0,
    opcoesCode: "{ modo: 'agendado', ts: Date.now() }",
  });
  return wf;
}

/* ---------- 02 · coleta Shopee ---------- */

function wfShopee() {
  const wf = new WF('02 · Coleta Shopee (a cada 2 h)');
  wf.add({
    name: 'A cada 2 horas', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2,
    parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 8-22/2 * * *' }] } },
  }, 0, 300);
  configNodes(wf, 220, 300);
  wf.link('A cada 2 horas', 'Ler config');
  wf.add(code('Montar buscas', `
if (!cfg.shopee.app_id || !cfg.shopee.secret || !cfg.admins.length) return [];
return LIB.montarBuscasShopee(cfg, Date.now()).map((b) => ({ json: b }));`, { lib: true }), 660, 300);
  wf.add(httpShopee('Shopee: ofertas'), 880, 300);
  wf.add(dtGet('Histórico 90 dias', 'bfx_precos', [
    ['loja', 'eq', 'shopee'],
    ['ts', 'gte', '={{ Date.now() - 91 * 86400000 }}'],
  ]), 1100, 300);
  wf.add(dtGet('Ofertas recentes', 'bfx_ofertas', [['ts', 'gte', '={{ Date.now() - 3 * 86400000 }}']]), 1320, 300);
  wf.add(code('Avaliar candidatas', `
const buscas = $('Montar buscas').all().map((i) => i.json);
const resp = $('Shopee: ofertas').all().map((i) => i.json);
const precos = $('Histórico 90 dias').all().map((i) => i.json).filter((r) => r.produto_id);
const ofertas = $input.all().map((i) => i.json).filter((r) => r.oferta_id);
return [{ json: LIB.avaliarCandidatos(buscas, resp, precos, ofertas, cfg, Date.now()) }];`, { lib: true }), 1540, 300);
  wf.add(itens('Linhas de preço', '$json.precosNovos'), 1760, 160);
  wf.add(dtInsert('Gravar preços', 'bfx_precos'), 1980, 160);
  wf.add(itens('Linhas de oferta', '$json.ofertasNovas'), 1760, 400);
  wf.add(dtInsert('Gravar ofertas', 'bfx_ofertas'), 1980, 400);
  wf.add(code('Cards', "return $('Avaliar candidatas').first().json.chamadas.map((c) => ({ json: c }));", { cfg: false }), 2200, 400);
  wf.add(httpTelegram('Telegram (cards)'), 2420, 400);
  wf.chain('Config', 'Montar buscas', 'Shopee: ofertas', 'Histórico 90 dias', 'Ofertas recentes', 'Avaliar candidatas');
  wf.chain('Avaliar candidatas', 'Linhas de preço', 'Gravar preços');
  wf.chain('Avaliar candidatas', 'Linhas de oferta', 'Gravar ofertas', 'Cards', 'Telegram (cards)');
  return wf;
}

/* ---------- 03 · relatório diário ---------- */

function wfRelatorio() {
  const wf = new WF('03 · Relatório diário (22h)');
  wf.add({
    name: 'Todo dia 22h', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2,
    parameters: { rule: { interval: [{ field: 'cronExpression', expression: '5 22 * * *' }] } },
  }, 0, 300);
  configNodes(wf, 220, 300);
  wf.link('Todo dia 22h', 'Ler config');
  const ontem = '={{ Date.now() - 86400000 }}';
  wf.add(dtGet('Posts', 'bfx_posts', [['ts', 'gte', ontem]]), 660, 300);
  wf.add(dtGet('Links', 'bfx_links', [['ts', 'gte', ontem]]), 880, 300);
  wf.add(dtGet('Ofertas', 'bfx_ofertas', [['ts', 'gte', ontem], ['status', 'eq', 'pendente']], { match: 'anyCondition' }), 1100, 300);
  wf.add(dtGet('Entradas', 'bfx_entradas', []), 1320, 300);
  wf.add(code('Montar relatório', `
const pega = (n) => $(n).all().map((i) => i.json);
return LIB.relatorioDiario({ posts: pega('Posts'), links: pega('Links'), ofertas: pega('Ofertas'), entradas: pega('Entradas') }, cfg, Date.now())
  .chamadas.map((c) => ({ json: c }));`, { lib: true }), 1540, 300);
  wf.add(httpTelegram('Telegram (relatório)'), 1760, 300);
  wf.chain('Config', 'Posts', 'Links', 'Ofertas', 'Entradas', 'Montar relatório', 'Telegram (relatório)');
  return wf;
}

/* ---------- 90 · túnel (só no servidor local) ---------- */

function wfTunel() {
  const wf = new WF('90 · Túnel: atualizar o webhook (servidor local)');
  wf.add({
    name: 'Novo endereço do túnel', type: 'n8n-nodes-base.webhook', typeVersion: 2, webhookId: uuid('webhook-oferto-tunel'),
    parameters: { httpMethod: 'POST', path: 'oferto-tunel', responseMode: 'onReceived', options: {} },
    notes: 'Chamado pelo contêiner "vigia". Este caminho não passa pelo filtro do túnel: só responde dentro do Docker e em localhost.',
  }, 0, 300);
  wf.add(dtCreate('Criar bfx_config', 'bfx_config'), 220, 300);
  // Só a linha do domínio próprio (não carrega os tokens nesta execução).
  wf.add(dtGet('Ler domínio', 'bfx_config', [['chave', 'eq', 'tunel.dominio']]), 440, 300);
  wf.add(code('Linha da URL', `
const cfg = LIB.montarConfig($input.all().map((i) => i.json).filter((r) => r.chave));
const r = LIB.validarUrlTunel(($('Novo endereço do túnel').first().json.body || {}).url, cfg.tunel.dominio);
if (!r.ok) throw new Error(r.erro);
return [{ json: { chave: 'n8n_webhook_url', valor: r.base + '/webhook/telegram-ofertas' } }];`, { lib: true, cfg: false, nota: 'Aceita só trycloudflare.com, ngrok ou o domínio de tunel.dominio, e monta a Production URL do webhook do 01.' }), 660, 300);
  wf.add(Object.assign(dtUpdate('Gravar URL', 'bfx_config', 'chave', 'upsert'), { executeOnce: true }), 880, 300);
  wf.add({
    name: 'Rodar setup', type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.2,
    parameters: {
      source: 'database', mode: 'once',
      workflowId: { __rl: true, mode: 'id', value: IDS_LOCAL['00-setup.json'] },
      options: { waitForSubWorkflow: true },
    },
    notes: 'O setup registra o webhook no Telegram com a nova URL e manda o resumo aos admins.',
  }, 1100, 300);
  wf.chain('Novo endereço do túnel', 'Criar bfx_config', 'Ler domínio', 'Linha da URL', 'Gravar URL', 'Rodar setup');
  return wf;
}

/* ---------- 91 · saúde (só no servidor local) ---------- */

function wfSaude() {
  // Roda a cada 5 min (chamado pelo vigia). Sucesso não fica no histórico: a execução leva a cfg com os tokens.
  const wf = new WF('91 · Saúde: conferir o webhook (servidor local)', { saveDataSuccessExecution: 'none' });
  wf.add({
    name: 'Conferir saúde', type: 'n8n-nodes-base.webhook', typeVersion: 2, webhookId: uuid('webhook-oferto-saude'),
    parameters: { httpMethod: 'POST', path: 'oferto-saude', responseMode: 'responseNode', options: {} },
    notes: 'Chamado pelo contêiner "vigia" a cada 5 min. Não passa pelo filtro do túnel: só responde dentro do Docker e em localhost.',
  }, 0, 300);
  configNodes(wf, 220, 300);
  wf.link('Conferir saúde', 'Ler config');
  wf.add(code('Consultas', `
const c = LIB.saudeChamadas(cfg);
// Sem bot_token não há o que consultar: segue direto para a avaliação.
return (c.length ? c : [{ pular: true }]).map((j) => ({ json: j }));`, { lib: true }), 660, 300);
  wf.add(switchExpr('Tem bot?', '$json.metodo ? 0 : 1', 2), 880, 300);
  wf.add(httpTelegram('Telegram (getWebhookInfo)'), 1100, 220);
  wf.add(code('Avaliar saúde', `
const chamadas = $('Consultas').all().map((i) => i.json).filter((c) => c.metodo);
const resp = chamadas.length ? $input.all().map((i) => i.json) : [];
return [{ json: LIB.avaliarSaude(chamadas, resp, cfg, Date.now()) }];`, { lib: true, nota: 'Alerta: erro de entrega nos últimos 10 min, fila > 20, URL diferente de n8n_webhook_url ou token inválido. 1 alerta por tipo a cada 60 min; avisa quando resolve.' }), 1320, 300);
  wf.add(itens('Estado do alerta', '$json.linhas'), 1540, 160);
  wf.add(dtUpdate('Gravar estado', 'bfx_config', 'chave', 'upsert'), 1760, 160);
  wf.add(itens('Alertas de saúde', "$('Avaliar saúde').first().json.chamadas"), 1540, 300);
  wf.add(httpTelegram('Telegram (alertas)'), 1760, 300);
  wf.add({
    name: 'Responder ao vigia', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1,
    parameters: { respondWith: 'json', responseBody: "={{ JSON.stringify($('Avaliar saúde').first().json.resposta) }}", options: {} },
  }, 1540, 460);
  wf.chain('Config', 'Consultas', 'Tem bot?');
  wf.link('Tem bot?', 'Telegram (getWebhookInfo)', 0);
  wf.link('Tem bot?', 'Avaliar saúde', 1);
  wf.chain('Telegram (getWebhookInfo)', 'Avaliar saúde');
  wf.chain('Avaliar saúde', 'Estado do alerta', 'Gravar estado');
  wf.chain('Avaliar saúde', 'Alertas de saúde', 'Telegram (alertas)');
  wf.chain('Avaliar saúde', 'Responder ao vigia');
  return wf;
}

/* ---------- main ---------- */

function main() {
  fs.mkdirSync(SAIDA, { recursive: true });
  const wfs = {
    '00-setup.json': wfSetup(),
    '01-telegram-router.json': wfRouter(),
    '02-coleta-shopee.json': wfShopee(),
    '03-relatorio-diario.json': wfRelatorio(),
    '04-radar-ofertas.json': wfRadar(),
  };
  fs.mkdirSync(SAIDA_LOCAL, { recursive: true });
  for (const [arq, wf] of Object.entries(Object.assign({}, wfs, { '90-tunel.json': wfTunel(), '91-saude.json': wfSaude() }))) {
    const j = wf.json();
    if (wfs[arq]) fs.writeFileSync(path.join(SAIDA, arq), JSON.stringify(j, null, 2) + '\n');
    fs.writeFileSync(path.join(SAIDA_LOCAL, arq), JSON.stringify(Object.assign({ id: IDS_LOCAL[arq] }, j), null, 2) + '\n');
    console.log(`${arq}: ${j.nodes.length} nós${wfs[arq] ? '' : ' (só servidor local)'}`);
  }
  escreverDocConfig();
}

/** docs/CONFIG.md: todas as chaves da tabela bfx_config. */
function escreverDocConfig() {
  const { esquema } = require('../lib/config');
  const linhas = [
    '# Chaves da tabela `bfx_config`',
    '',
    'Gerado por `node build/build-workflows.js`. Edite os valores no n8n: **Overview → Data tables → bfx_config**.',
    'Linha vazia = usa o padrão (exceto `shopee.busca.*`: vazio = não coletar aquela categoria).',
    '',
    '| Chave | Padrão | Para que serve |',
    '|---|---|---|',
    ...esquema().map((e) => `| \`${e.chave}\` | ${e.padrao ? '`' + e.padrao.replace(/\|/g, '\\|') + '`' : ''} | ${e.desc.replace(/\|/g, '\\|')} |`),
    '',
  ];
  fs.mkdirSync(path.join(RAIZ, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(RAIZ, 'docs', 'CONFIG.md'), linhas.join('\n'));
}

if (require.main === module) main();
module.exports = { bundle, LIB_SRC };
