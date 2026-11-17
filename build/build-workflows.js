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
  '03-relatorio-diario.json': 'wfRelat000000001', '90-tunel.json': 'wfTunel000000001',
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

function dtUpdate(name, t, chave, op) {
  return {
    name, type: 'n8n-nodes-base.dataTable', typeVersion: 1.1,
    parameters: {
      resource: 'row', operation: op || 'update', dataTableId: tabela(t), matchType: 'allConditions',
      filters: { conditions: [{ keyName: chave, condition: 'eq', keyValue: `={{ $json.${chave} }}` }] },
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
const atual = linhas.find((r) => r.chave === 'webhook_secret');
if (!atual || !String(atual.valor || '').trim()) {
  const s = upserts.find((r) => r.chave === 'webhook_secret');
  const valor = LIB.segredoAleatorio(Date.now());
  if (s) s.valor = valor; else upserts.push({ chave: 'webhook_secret', valor });
}
const cfg = LIB.montarConfig(linhas.concat(upserts));
const { avisos } = LIB.setupChamadas(cfg);
return [{ json: { cfg, upserts, avisos, linhas_novas: upserts.length } }];`, { lib: true, cfg: false, nota: 'Monta a configuração, gera o webhook_secret e lista o que falta.' }), x0 + 220, 300);
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

  // Arrumação do grupo (só com grupo.textos = pendente e todos os tópicos criados).
  wf.add(code('Chamadas do grupo', `
const criados = $('Resumo').first().json.topicos;
return LIB.arrumarGrupoChamadas(cfg, criados).map((c) => ({ json: c }));`, { lib: true, nota: 'Descrição, General → 💬 Conversa, textos fixados e tópicos de oferta fechados.' }), x0 + 1100, 760);
  // O Telegram limita ~20 mensagens por minuto num grupo: 3,5 s entre chamadas evita o erro 429.
  wf.add(httpTelegram('Telegram (grupo)', 3500), x0 + 1320, 760);
  wf.add(code('Fixar mensagens', `
const chamadas = $('Chamadas do grupo').all().map((i) => i.json);
const resp = $input.all().map((i) => i.json);
return LIB.fixarChamadas(chamadas, resp, cfg).map((c) => ({ json: c }));`, { lib: true }), x0 + 1540, 760);
  wf.add(httpTelegram('Telegram (fixar)', 3500), x0 + 1760, 760);
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
  const wf = new WF('01 · Telegram: aprovação e publicação');
  wf.add({
    name: 'Webhook Telegram', type: 'n8n-nodes-base.webhook', typeVersion: 2, webhookId: uuid('webhook-telegram-ofertas'),
    parameters: { httpMethod: 'POST', path: 'telegram-ofertas', responseMode: 'onReceived', options: {} },
  }, 0, 600);
  configNodes(wf, 220, 600);
  wf.link('Webhook Telegram', 'Ler config');
  wf.add(code('Classificar', `
const w = $('Webhook Telegram').first().json;
return [{ json: LIB.classificarUpdate(w.body, w.headers, cfg, Date.now()) }];`, { lib: true }), 660, 600);
  wf.link('Config', 'Classificar');
  wf.add(switchExpr('Rota', "({ oferta: 0, callback: 1, membro: 2, convite: 3, responder: 4 })[$json.rota] ?? 5", 6), 880, 600);
  wf.link('Classificar', 'Rota');

  // 0 · /oferta
  wf.add(dtGet('Histórico do produto', 'bfx_precos', [['produto_id', 'eq', '={{ $json.oferta.produto_id }}']]), 1100, 100);
  wf.add(code('Avaliar oferta', `
const cls = $('Classificar').first().json;
const rows = $input.all().map((i) => i.json).filter((r) => r.produto_id);
return [{ json: LIB.avaliarNovaOferta(cls, rows, cfg) }];`, { lib: true }), 1320, 100);
  wf.add(itens('Linhas de preço', '$json.precosNovos'), 1540, 0);
  wf.add(dtInsert('Gravar preços', 'bfx_precos'), 1760, 0);
  wf.add(itens('Linha da oferta', '$json.oferta'), 1540, 180);
  wf.add(dtInsert('Gravar oferta', 'bfx_ofertas'), 1760, 180);
  wf.add(itens('Card de aprovação', "$('Avaliar oferta').first().json.chamadas"), 1980, 180);
  wf.add(httpTelegram('Telegram (card)'), 2200, 180);
  wf.link('Rota', 'Histórico do produto', 0);
  wf.chain('Histórico do produto', 'Avaliar oferta');
  wf.chain('Avaliar oferta', 'Linhas de preço', 'Gravar preços');
  wf.chain('Avaliar oferta', 'Linha da oferta', 'Gravar oferta', 'Card de aprovação', 'Telegram (card)');

  // 1 · clique nos botões
  wf.add(dtGet('Buscar oferta', 'bfx_ofertas', [['oferta_id', 'eq', '={{ $json.oferta_id }}']], { returnAll: false, limit: 1 }), 1100, 520);
  wf.add(code('Decidir', `
const cb = $('Classificar').first().json;
return [{ json: LIB.decidirCallback(cb, $input.all().map((i) => i.json), cfg) }];`, { lib: true }), 1320, 520);
  wf.add(itens('Atualização', '$json.update'), 1540, 360);
  wf.add(dtUpdate('Atualizar oferta', 'bfx_ofertas', 'oferta_id'), 1760, 360);
  wf.add(itens('Respostas do clique', "$('Decidir').first().json.chamadas"), 1540, 460);
  wf.add(httpTelegram('Telegram (clique)'), 1760, 460);
  wf.add(code('Itens de link', `
const d = $('Decidir').first().json;
if (d.proximo !== 'publicar') return [];
const sh = d.linkItens.filter((i) => i.metodo === 'shopee');
return (sh.length ? sh : d.linkItens).map((j) => ({ json: j }));`, { cfg: false }), 1540, 600);
  wf.add(switchExpr('Precisa da Shopee?', "$json.metodo === 'shopee' ? 0 : 1", 2), 1760, 600);
  wf.add(httpShopee('Shopee: link curto'), 1980, 540);
  wf.add(code('Ler links Shopee', `
const todos = $('Decidir').first().json.linkItens;
const resp = $input.all().map((i) => i.json);
let k = 0;
return todos.map((it) => ({ json: it.metodo === 'shopee' ? LIB.lerRespostasShopee([it], [resp[k++]])[0] : it }));`, { lib: true, cfg: false }), 2200, 540);
  wf.add(code('Publicar', `
const cls = $('Classificar').first().json;
const d = $('Decidir').first().json;
const itensLink = $input.all().map((i) => i.json);
return [{ json: LIB.prepararPublicacao(d.oferta, itensLink, cfg, { ts: cls.ts, chat_id: cls.chat_id, message_id: cls.message_id }) }];`, { lib: true }), 2420, 640);
  wf.link('Rota', 'Buscar oferta', 1);
  wf.chain('Buscar oferta', 'Decidir');
  wf.chain('Decidir', 'Atualização', 'Atualizar oferta');
  wf.chain('Decidir', 'Respostas do clique', 'Telegram (clique)');
  wf.chain('Decidir', 'Itens de link', 'Precisa da Shopee?');
  wf.link('Precisa da Shopee?', 'Shopee: link curto', 0);
  wf.chain('Shopee: link curto', 'Ler links Shopee', 'Publicar');
  wf.link('Precisa da Shopee?', 'Publicar', 1);

  wf.add(itens('Status final', '$json.update'), 2640, 480);
  wf.add(dtUpdate('Atualizar status', 'bfx_ofertas', 'oferta_id'), 2860, 480);
  wf.add(itens('Linhas de link', '$json.linksRows'), 2640, 600);
  wf.add(dtInsert('Gravar links', 'bfx_links'), 2860, 600);
  wf.add(itens('Mensagens', "$('Publicar').first().json.chamadas"), 2640, 740);
  wf.add(httpTelegram('Telegram (publicação)'), 2860, 740);
  wf.add(code('Resultado', `
const chamadas = $('Mensagens').all().map((i) => i.json);
return [{ json: LIB.resultadoChamadas(chamadas, $input.all().map((i) => i.json), cfg, Date.now()) }];`, { lib: true }), 3080, 740);
  wf.add(itens('Linhas de post', '$json.posts'), 3300, 680);
  wf.add(dtInsert('Gravar posts', 'bfx_posts'), 3520, 680);
  wf.add(itens('Alertas', "$('Resultado').first().json.alertas"), 3300, 820);
  wf.add(httpTelegram('Telegram (alertas)'), 3520, 820);
  wf.chain('Publicar', 'Status final', 'Atualizar status');
  wf.chain('Publicar', 'Linhas de link', 'Gravar links');
  wf.chain('Publicar', 'Mensagens', 'Telegram (publicação)', 'Resultado');
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
  wf.add(code('Linha da URL', `
const base = String(($('Novo endereço do túnel').first().json.body || {}).url || '').trim().replace(/\\/+$/, '');
if (!/^https:\\/\\/[a-z0-9.-]+$/i.test(base)) throw new Error('URL do túnel inválida: ' + base);
return [{ json: { chave: 'n8n_webhook_url', valor: base + '/webhook/telegram-ofertas' } }];`, { cfg: false, nota: 'Monta a Production URL do webhook do 01 a partir do endereço público do túnel.' }), 440, 300);
  wf.add(Object.assign(dtUpdate('Gravar URL', 'bfx_config', 'chave', 'upsert'), { executeOnce: true }), 660, 300);
  wf.add({
    name: 'Rodar setup', type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.2,
    parameters: {
      source: 'database', mode: 'once',
      workflowId: { __rl: true, mode: 'id', value: IDS_LOCAL['00-setup.json'] },
      options: { waitForSubWorkflow: true },
    },
    notes: 'O setup registra o webhook no Telegram com a nova URL e manda o resumo aos admins.',
  }, 880, 300);
  wf.chain('Novo endereço do túnel', 'Criar bfx_config', 'Linha da URL', 'Gravar URL', 'Rodar setup');
  return wf;
}

/* ---------- main ---------- */

function main() {
  fs.mkdirSync(SAIDA, { recursive: true });
  const wfs = { '00-setup.json': wfSetup(), '01-telegram-router.json': wfRouter(), '02-coleta-shopee.json': wfShopee(), '03-relatorio-diario.json': wfRelatorio() };
  fs.mkdirSync(SAIDA_LOCAL, { recursive: true });
  for (const [arq, wf] of Object.entries(Object.assign({}, wfs, { '90-tunel.json': wfTunel() }))) {
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
