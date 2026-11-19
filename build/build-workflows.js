#!/usr/bin/env node
'use strict';
// Gera os workflows do n8n com a biblioteca lib/ embutida nos Code nodes.
// Uso:
//   node build/build-workflows.js                      → só n8n/workflows/*.json (não toca a produção)
//   node build/build-workflows.js --out <dir>          → os 6 workflows em <dir> (em vez de n8n/workflows/)
//   node build/build-workflows.js --local-out <dir>    → também os 8 workflows do servidor local (com id) em <dir>
//   node build/build-workflows.js --release            → grava os 8 em servidor-local/workflows/ (npm run release)
//   node build/build-workflows.js --doc-config         → também reescreve docs/CONFIG.md
// Só --release escreve em servidor-local/: é o que o preparar.sh importa (com PUBLICAR_WORKFLOWS=sim).
const fs = require('fs');
const path = require('path');
const { TABELAS } = require('../lib/tabelas');

const RAIZ = path.join(__dirname, '..');
const SAIDA = path.join(RAIZ, 'n8n', 'workflows');
const SAIDA_LOCAL = path.join(RAIZ, 'servidor-local', 'workflows');
const SERVIDOR_LOCAL = path.join(RAIZ, 'servidor-local');
// IDs fixos no servidor local: a CLI importa e publica por ID, e o workflow do túnel chama o setup por ID.
const IDS_LOCAL = {
  '00-setup.json': 'wfSetup000000001', '01-telegram-router.json': 'wfRouter00000001', '02-coleta-shopee.json': 'wfShopee00000001',
  '03-relatorio-diario.json': 'wfRelat000000001', '04-radar-ofertas.json': 'wfRadar000000001', '05-guardiao-ofertas.json': 'wfGuard000000001',
  '90-tunel.json': 'wfTunel000000001', '91-saude.json': 'wfSaude000000001',
};

/* ---------- bundle da lib (tree-shaking por nó + minificação) ---------- */

// Módulos da Fase 2 ficam fora do bundle de runtime até ativação explícita.
const MODULOS_FASE2 = new Set(['desconto', 'imagem', 'legenda', 'setup-canal']);
const RE_KW_REGEX = /^(?:return|case|throw|in|of|typeof|void|delete|else|do|new|yield|await)$/;

/**
 * Minificador seguro sem dependências externas: remove comentários // e /* * /,
 * espaços supérfluos de borda e linhas vazias preservando strings, templates e regexes.
 */
function minificarJs(src) {
  const s = String(src || '').replace(/\r\n?/g, '\n');
  const n = s.length;
  let out = '';
  let i = 0;
  let state = 'NORMAL';
  let inClass = false;
  const tplStack = [];
  let braceDepth = 0;
  let lastTok = '';

  const isIdentStart = (ch) => (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch === '$';
  const isIdentPart = (ch) => isIdentStart(ch) || (ch >= '0' && ch <= '9');
  let pendingSpace = false;
  let pendingNl = false;

  const lastOutChar = () => (out.length ? out[out.length - 1] : '');
  const flushSep = (nextCh) => {
    const prev = lastOutChar();
    if (!prev) { pendingSpace = false; pendingNl = false; return; }
    if (pendingNl) {
      pendingNl = false;
      pendingSpace = false;
      if (prev === ';' || prev === '{' || prev === ',') {
        if ((isIdentPart(prev) && isIdentPart(nextCh)) || (prev === '/' && (nextCh === '/' || nextCh === '*'))) out += ' ';
        return;
      }
      out += '\n';
      return;
    }
    if (pendingSpace) {
      pendingSpace = false;
      const precisa = (isIdentPart(prev) && isIdentPart(nextCh))
        || (prev === '+' && nextCh === '+')
        || (prev === '-' && nextCh === '-')
        || (prev === '/' && (nextCh === '/' || nextCh === '*'))
        || (prev === '!' && nextCh === '=')
        || (prev === '=' && nextCh === '=');
      if (precisa) out += ' ';
    }
  };

  while (i < n) {
    const ch = s[i];
    const nx = i + 1 < n ? s[i + 1] : '';

    if (state === 'NORMAL') {
      if (ch === '/' && nx === '/') {
        i += 2;
        while (i < n && s[i] !== '\n') i++;
        continue;
      }
      if (ch === '/' && nx === '*') {
        i += 2;
        let hasNl = false;
        while (i < n && !(s[i] === '*' && s[i + 1] === '/')) {
          if (s[i] === '\n') hasNl = true;
          i++;
        }
        i += 2;
        if (hasNl) pendingNl = true; else pendingSpace = true;
        continue;
      }
      if (ch === ' ' || ch === '\t') {
        pendingSpace = true;
        i++;
        continue;
      }
      if (ch === '\n') {
        pendingNl = true;
        i++;
        continue;
      }
      if (ch === "'" || ch === '"') {
        flushSep(ch);
        state = ch;
        out += ch;
        i++;
        continue;
      }
      if (ch === '`') {
        flushSep(ch);
        state = 'TEMPLATE';
        out += ch;
        i++;
        continue;
      }
      if (ch === '/' && (lastTok === '' || /^[\(\[\{,;:=\!&\|\?~\^\+\-\*%<>]$/.test(lastTok) || RE_KW_REGEX.test(lastTok))) {
        flushSep(ch);
        state = 'REGEX';
        inClass = false;
        out += ch;
        i++;
        continue;
      }
      if (ch === '{') {
        flushSep(ch);
        if (tplStack.length) braceDepth++;
        lastTok = '{';
        out += ch;
        i++;
        continue;
      }
      if (ch === '}') {
        if (tplStack.length && braceDepth === tplStack[tplStack.length - 1]) {
          pendingSpace = false;
          pendingNl = false;
          tplStack.pop();
          state = 'TEMPLATE';
          out += ch;
          i++;
          continue;
        }
        flushSep(ch);
        if (tplStack.length) braceDepth--;
        lastTok = '}';
        out += ch;
        i++;
        continue;
      }
      if (isIdentStart(ch)) {
        let j = i + 1;
        while (j < n && isIdentPart(s[j])) j++;
        const word = s.slice(i, j);
        flushSep(ch);
        lastTok = word;
        out += word;
        i = j;
        continue;
      }
      if (ch >= '0' && ch <= '9') {
        let j = i + 1;
        while (j < n && (isIdentPart(s[j]) || s[j] === '.')) j++;
        flushSep(ch);
        lastTok = 'NUM';
        out += s.slice(i, j);
        i = j;
        continue;
      }
      flushSep(ch);
      lastTok = ch;
      out += ch;
      i++;
      continue;
    }

    if (state === "'" || state === '"') {
      out += ch;
      if (ch === '\\' && i + 1 < n) { out += s[i + 1]; i += 2; continue; }
      if (ch === state) { state = 'NORMAL'; lastTok = 'STR'; }
      i++;
      continue;
    }

    if (state === 'TEMPLATE') {
      if (ch === '\\' && i + 1 < n) { out += ch + s[i + 1]; i += 2; continue; }
      if (ch === '$' && nx === '{') {
        tplStack.push(braceDepth);
        out += '${';
        state = 'NORMAL';
        lastTok = '{';
        i += 2;
        continue;
      }
      if (ch === '`') {
        out += ch;
        state = 'NORMAL';
        lastTok = 'STR';
        i++;
        continue;
      }
      out += ch;
      i++;
      continue;
    }

    if (state === 'REGEX') {
      out += ch;
      if (ch === '\\' && i + 1 < n) { out += s[i + 1]; i += 2; continue; }
      if (ch === '[') inClass = true;
      else if (ch === ']') inClass = false;
      else if (ch === '/' && !inClass) { state = 'NORMAL'; lastTok = 'VAL'; }
      i++;
      continue;
    }
  }

  return out.trim();
}

function carregarIndiceLib() {
  const dir = path.join(RAIZ, 'lib');
  const idxSrc = fs.readFileSync(path.join(dir, 'index.js'), 'utf8');
  // Respeita a ordem de exportação de lib/index.js para resolução determinística de símbolos.
  const ordemIndex = [...idxSrc.matchAll(/require\(\s*['"]\.\/([a-z0-9_-]+)(?:\.js)?['"]\s*\)/gi)]
    .map((m) => m[1])
    .filter((n) => !MODULOS_FASE2.has(n));
  const todosArqs = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.js') && f !== 'index.js')
    .map((f) => f.replace(/\.js$/, ''))
    .filter((n) => !MODULOS_FASE2.has(n))
    .sort();
  const ordem = ordemIndex.concat(todosArqs.filter((n) => !ordemIndex.includes(n)));

  const mods = {};
  const exportMap = {};
  for (const nome of ordem) {
    const raw = fs.readFileSync(path.join(dir, nome + '.js'), 'utf8').replace(/^'use strict';\r?\n/, '');
    const deps = [...new Set([...raw.matchAll(/require\(\s*['"]\.\/([a-z0-9_-]+)(?:\.js)?['"]\s*\)/gi)].map((m) => m[1]))]
      .filter((d) => !MODULOS_FASE2.has(d));
    const min = minificarJs(raw);
    // Valida sintaxe da versão minificada no build.
    new Function('module', 'exports', 'require', min);
    mods[nome] = { deps, min };
    const exp = require(path.join(dir, nome + '.js'));
    if (exp && typeof exp === 'object') {
      for (const k of Object.keys(exp)) exportMap[k] = nome;
    }
  }
  return { ordem, mods, exportMap };
}

const LIB_INDEX = carregarIndiceLib();

function resolverDepsTransitivas(raizes) {
  const vistos = new Set();
  const fila = [...raizes];
  while (fila.length) {
    const m = fila.shift();
    if (vistos.has(m)) continue;
    if (!LIB_INDEX.mods[m]) throw new Error('módulo ausente no bundle: ' + m);
    vistos.add(m);
    for (const d of LIB_INDEX.mods[m].deps) {
      if (!vistos.has(d)) fila.push(d);
    }
  }
  return LIB_INDEX.ordem.filter((m) => vistos.has(m));
}

function bundle(raizes) {
  const roots = Array.isArray(raizes) && raizes.length ? raizes : LIB_INDEX.ordem;
  const incluidos = resolverDepsTransitivas(roots);
  const defs = incluidos.map((nome) => `${JSON.stringify(nome)}:function(module,exports,require){\n${LIB_INDEX.mods[nome].min}\n},`);
  const exportRoots = roots.filter((r, idx) => roots.indexOf(r) === idx);
  return [
    'const LIB=(()=>{const d={',
    ...defs,
    '};const c={};function r(n){n=n.replace(/^\\.\\//,"").replace(/\\.js$/,"");if(c[n])return c[n].exports;if(!d[n])throw new Error("módulo ausente: "+n);const m={exports:{}};c[n]=m;d[n](m,m.exports,r);return m.exports;}',
    `return Object.assign({},...${JSON.stringify(exportRoots)}.map(r));})();`,
    '',
  ].join('\n');
}

function bundlePara(corpo) {
  const s = String(corpo || '');
  // Se LIB for usado dinamicamente (ex.: LIB[k] ou passado sem .prop), cai no bundle completo de runtime.
  const semProp = s.replace(/\bLIB\.[A-Za-z0-9_$]+/g, '');
  if (/\bLIB\b/.test(semProp)) return bundle(LIB_INDEX.ordem);
  const syms = [...new Set([...s.matchAll(/\bLIB\.([A-Za-z0-9_$]+)/g)].map((m) => m[1]))];
  if (!syms.length) return '';
  const roots = [];
  for (const sym of syms) {
    const mod = LIB_INDEX.exportMap[sym];
    if (!mod) throw new Error('símbolo LIB.' + sym + ' não encontrado nos módulos de runtime');
    if (!roots.includes(mod)) roots.push(mod);
  }
  return bundle(roots);
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
    if (node.__portao) return this.addComPortao(node, x, y);
    if (this.nodes.some((n) => n.name === node.name)) throw new Error('nome duplicado: ' + node.name);
    node.id = uuid(this.nome + '/' + node.name);
    node.position = [x, y];
    this.nodes.push(node);
    return node.name;
  }
  /**
   * Nó de envio (Telegram/WhatsApp) atrás do portão de dry-run (P1-06). Vira 4 nós:
   *   "<nome> · portão" (Switch: 0 = envio real, 1 = simulado) → "<nome> · envio real" (HTTP) ou
   *   "<nome> · simulado" (Code, sem rede) → "<nome>" (Code que só repassa a resposta).
   * Quem liga para "<nome>" entra no portão; quem lê $('<nome>') ou sai de "<nome>" recebe a resposta
   * (real ou simulada) na mesma ordem dos itens. Propriedades extras (retryOnFail etc.) ficam no HTTP.
   */
  addComPortao(desc, x, y) {
    const { __portao: tipo, name } = desc;
    const http = Object.assign({}, desc, { name: name + ' · envio real' });
    delete http.__portao;
    this.add(switchExpr(name + ' · portão', `${PORTAO_REAL} ? 0 : 1`, 2), x - 180, y);
    Object.assign(this.nodes[this.nodes.length - 1], {
      notes: `Portão de dry-run (publicacao.dry_run). Saída 0: envio real (só com publicacao.dry_run=nao). Saída 1: simulado, sem rede.`,
    });
    this.add(http, x, y - 90);
    this.add(simuladorNode(name + ' · simulado', tipo, name), x, y + 90);
    this.add(code(name, REPASSE_JS, { cfg: false, nota: 'Resposta do envio (real ou simulada), na ordem dos itens.' }), x + 180, y);
    this.link(name + ' · portão', name + ' · envio real', 0);
    this.link(name + ' · portão', name + ' · simulado', 1);
    this.link(name + ' · envio real', name);
    this.link(name + ' · simulado', name);
    (this.entradas = this.entradas || {})[name] = name + ' · portão';
    return name;
  }
  link(de, para, saida) {
    if (this.entradas && this.entradas[para] && de !== this.entradas[para] && !de.startsWith(para + ' · ')) para = this.entradas[para];
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
  const src = (o.lib ? bundlePara(corpo) : '') + (o.cfg !== false ? `const cfg = ${CFG};\n` : '') + corpo.trim() + '\n';
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
  return tolerante(t, { name, type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, parameters: p, alwaysOutputData: true, executeOnce: true });
}

// Tabelas opcionais (recursos extras): se ainda não existirem (Setup não rodado depois de atualizar),
// o nó segue em frente em vez de parar o workflow inteiro. Foi o que parou o radar em 18/11.
const TABELAS_OPCIONAIS = new Set(['bfx_alertas']);
function tolerante(t, node) {
  if (TABELAS_OPCIONAIS.has(t)) node.onError = 'continueRegularOutput';
  return node;
}

const AUTOMAP = { mappingMode: 'autoMapInputData', value: {}, matchingColumns: [], schema: [], attemptToConvertTypes: false, convertFieldsToString: false };

function dtInsert(name, t) {
  return tolerante(t, { name, type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, parameters: { resource: 'row', operation: 'insert', dataTableId: tabela(t), columns: AUTOMAP, options: {} } });
}

function dtUpdate(name, t, chave, op, extras) {
  // extras: condições a mais ([coluna, condição, valor]); a linha só muda se todas baterem.
  const conditions = [{ keyName: chave, condition: 'eq', keyValue: `={{ $json.${chave} }}` }]
    .concat((extras || []).map(([keyName, condition, keyValue]) => ({ keyName, condition, keyValue })));
  return tolerante(t, {
    name, type: 'n8n-nodes-base.dataTable', typeVersion: 1.1,
    parameters: {
      resource: 'row', operation: op || 'update', dataTableId: tabela(t), matchType: 'allConditions',
      filters: { conditions },
      columns: AUTOMAP, options: {},
    },
  });
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

/* ---------- portão de dry-run (P1-06) ---------- */

// Envio real SÓ quando publicacao.dry_run está explicitamente desligado (false, ou texto nao/no/false/0/off).
// Chave ausente, cfg sem "publicacao", "sim" ou qualquer outro valor = dry-run (nenhuma chamada de rede).
// Erro na expressão (ex.: nó Config ausente) para o workflow: também não envia.
const PORTAO_REAL = `(${CFG}.publicacao && (${CFG}.publicacao.dry_run === false || /^(n|nao|não|no|false|0|off|desligado)$/i.test(String(${CFG}.publicacao.dry_run).trim())))`;

// Repassa a resposta do ramo que executou (real ou simulado), mantendo o par com o item de entrada.
const REPASSE_JS = 'return $input.all().map((it, i) => ({ json: it.json, pairedItem: { item: i } }));';

/**
 * Resposta simulada do dry-run (roda no Code node, sem rede; não use require nem closures externas).
 * Telegram: métodos que mandam mensagem → { ok:true, result:{ message_id <0, chat, date, ... } };
 * métodos que só confirmam (set*, pin*, delete*, answer*, close* ...) → { ok:true, result:true };
 * leituras e criações (getMe, getChat, createForumTopic, createChatInviteLink ...) → ok:false com
 * description "DRY-RUN", para que nada inventado (username, tópico, link de convite) seja gravado na bfx_config.
 * O message_id sintético é NEGATIVO: o Telegram nunca usa id negativo, então um post simulado jamais
 * coincide com um post real (nem é editado/apagado por engano quando o dry-run for desligado).
 * WhatsApp: { ok:true, result:{ message_id <0 } }.
 */
function simularResposta(tipo, item, i, agoraMs, no) {
  const j = item || {};
  const p = j.payload || {};
  const metodo = tipo === 'whatsapp' ? 'whatsapp' : String(j.metodo || '');
  const id = -((agoraMs % 1000000000) * 1000 + (i % 1000)) - 1;
  const registro = {
    simulado: true, no, tipo, metodo, bot: j.bot || '',
    chat_id: tipo === 'whatsapp' ? '' : (p.chat_id == null ? '' : String(p.chat_id)),
    message_thread_id: p.message_thread_id || 0,
    em: new Date(agoraMs).toISOString(),
  };
  if (tipo === 'whatsapp') return { ok: true, dry_run: registro, result: { message_id: id, simulado: true } };
  const MENSAGEM = /^(send(Message|Photo|Video|Animation|Document|Audio|Voice|Sticker|Poll|Location|Venue|Contact|Dice)|copyMessage|forwardMessage|editMessage(Text|Caption|Media|ReplyMarkup|LiveLocation)|stopMessageLiveLocation)$/;
  const CONFIRMA = /^(set\w+|delete\w+|pin\w+|unpin\w+|answer\w+|close\w*ForumTopic|reopen\w*ForumTopic|edit(General)?ForumTopic|hideGeneralForumTopic|unhideGeneralForumTopic|ban\w+|unban\w+|restrict\w+|promote\w+|approve\w+|decline\w+|leaveChat|sendChatAction|copyMessages|forwardMessages|deleteMessages|revokeChatInviteLink)$/;
  if (MENSAGEM.test(metodo)) {
    const msg = { message_id: id, date: Math.floor(agoraMs / 1000), chat: { id: p.chat_id == null ? 0 : p.chat_id }, simulado: true };
    if (p.message_thread_id) msg.message_thread_id = p.message_thread_id;
    if (typeof p.text === 'string') msg.text = p.text;
    if (typeof p.caption === 'string') msg.caption = p.caption;
    if (p.reply_markup) msg.reply_markup = p.reply_markup;
    return { ok: true, dry_run: registro, result: msg };
  }
  if (metodo === 'sendMediaGroup') {
    const n = Array.isArray(p.media) ? p.media.length : 1;
    const ms = [];
    for (let k = 0; k < n; k++) ms.push({ message_id: id - k * 1000000000000, date: Math.floor(agoraMs / 1000), chat: { id: p.chat_id == null ? 0 : p.chat_id }, simulado: true });
    return { ok: true, dry_run: registro, result: ms };
  }
  if (CONFIRMA.test(metodo)) return { ok: true, dry_run: registro, result: true };
  return { ok: false, dry_run: registro, error_code: 0, description: 'DRY-RUN: ' + (metodo || 'chamada') + ' não foi feita (publicacao.dry_run=sim)' };
}

function simuladorNode(name, tipo, no) {
  return code(name, `
${simularResposta.toString()}
const agora = Date.now();
const out = $input.all().map((it, i) => ({ json: simularResposta(${JSON.stringify(tipo)}, it.json, i, agora, ${JSON.stringify(no)}), pairedItem: { item: i } }));
// Log do envio simulado (aparece no log do n8n e fica no histórico da execução). Sem tokens nem textos.
for (const o of out) console.log('[oferto dry-run] ' + JSON.stringify(o.json.dry_run));
return out;`, { cfg: false, nota: 'DRY-RUN: não chama a rede. Devolve resposta simulada compatível (ok, result.message_id negativo) e registra o envio no log.' });
}

/** Marca um nó HTTP como envio que precisa passar pelo portão de dry-run. */
function comPortao(tipo, node) {
  return Object.assign(node, { __portao: tipo });
}

function httpTelegram(name, intervalo) {
  return comPortao('telegram', {
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
        timeout: 45000,
      },
    },
  });
}

/**
 * Bot API com arquivo binário (P1-14): sendPhoto/sendDocument/setChatPhoto em multipart/form-data.
 * Cada item: { bot, metodo, payload, arquivo: { campo: 'photo', binario: 'data' } } + o binário em
 * item.binary[arquivo.binario] (ex.: o JPEG do render). Os demais campos do payload vão na query string
 * (a Bot API aceita parâmetros na URL também em multipart); objetos (reply_markup etc.) vão como JSON.
 * Também passa pelo portão de dry-run: com dry-run, o binário nem sai do n8n.
 * Formato dos parâmetros multipart do nó HTTP Request 4.2: NÃO VERIFICADO contra o n8n em execução (validar no e2e).
 */
function httpTelegramArquivo(name, intervalo) {
  return comPortao('telegram', {
    name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, onError: 'continueRegularOutput',
    notes: 'Bot API com arquivo (multipart). Cada item: { bot, metodo, payload, arquivo: { campo, binario } } e o binário no item.',
    parameters: {
      method: 'POST',
      url: `={{ ${CFG}.telegram.api }}/bot{{ $json.bot === 'grupo' ? ${CFG}.telegram.bot_token_grupo : ${CFG}.telegram.bot_token }}/{{ $json.metodo }}`,
      sendQuery: true,
      specifyQuery: 'json',
      jsonQuery: "={{ JSON.stringify(Object.fromEntries(Object.entries($json.payload || {}).filter(([k, v]) => v != null && k !== (($json.arquivo || {}).campo || 'photo')).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]))) }}",
      sendBody: true,
      contentType: 'multipart-form-data',
      bodyParameters: {
        parameters: [{
          parameterType: 'formBinaryData',
          name: "={{ ($json.arquivo || {}).campo || 'photo' }}",
          inputDataFieldName: "={{ ($json.arquivo || {}).binario || 'data' }}",
        }],
      },
      options: {
        batching: { batch: { batchSize: 1, batchInterval: intervalo || 700 } },
        response: { response: { neverError: true } },
        timeout: 60000,
      },
    },
  });
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

function httpWhatsAppAuto(name) {
  return comPortao('whatsapp', {
    name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, onError: 'continueRegularOutput',
    notes: 'Opcional Zero-Toque: dispara HTTP POST para WhatsApp API (Evolution, WAHA ou Webhook) quando whatsapp.webhook_url estiver configurado.',
    parameters: {
      method: 'POST',
      url: '={{ $json.url }}',
      sendHeaders: true,
      specifyHeaders: 'json',
      jsonHeaders: '={{ JSON.stringify($json.headers || {}) }}',
      sendBody: true,
      contentType: 'raw',
      rawContentType: 'application/json',
      body: '={{ JSON.stringify($json.body || {}) }}',
      options: {
        batching: { batch: { batchSize: 1, batchInterval: 250 } },
        response: { response: { neverError: true } },
        timeout: 15000,
      },
    },
  });
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
  const wf = new WF('00 · Setup (rodar manualmente)', { saveDataSuccessExecution: 'none' });
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
  wf.add(code('Preparar mercado oferta', `
return [{ json: LIB.prepararMercadoOferta($input.first().json, cfg) }];`, { lib: true }), 2960, -100);
  wf.add(switchExpr('Consultar mercado oferta?', '$json.reqs_mercado && $json.reqs_mercado.length > 0 ? 0 : 1', 2), 3080, -100);
  wf.add(itens('Itens mercado oferta', `$('Preparar mercado oferta').first().json.reqs_mercado`), 3200, -180);
  wf.add(httpRadarGet('Checar mercado oferta', true), 3320, -180);
  wf.add(code('Juntar mercado oferta', `
const e = $('Preparar mercado oferta').first().json;
const resp = e.reqs_mercado && $('Checar mercado oferta').isExecuted ? $('Checar mercado oferta').all().map((i) => i.json) : [];
return [{ json: LIB.juntarMercadoOferta(e, resp, cfg) }];`, { lib: true }), 3440, -100);

  wf.chain('Juntar página', 'Oferta completa?');
  wf.link('Oferta completa?', 'Preparar mercado oferta', 0);
  wf.chain('Preparar mercado oferta', 'Consultar mercado oferta?');
  wf.link('Consultar mercado oferta?', 'Itens mercado oferta', 0);
  wf.chain('Itens mercado oferta', 'Checar mercado oferta', 'Juntar mercado oferta');
  wf.link('Consultar mercado oferta?', 'Juntar mercado oferta', 1);
  wf.link('Juntar mercado oferta', 'Histórico do produto');
  wf.link('Oferta completa?', 'Erro da oferta', 1);
  wf.chain('Erro da oferta', 'Telegram (erro da oferta)');
  wf.chain('Preparar oferta', 'Marcar substituída', 'Atualizar substituída');
  wf.add(dtGet('Histórico do produto', 'bfx_precos', [['produto_id', 'eq', '={{ $json.oferta.produto_id }}']]), 1100, 100);
  wf.add(dtGet('Ofertas do produto 24h', 'bfx_ofertas', [['produto_id', 'eq', "={{ $('Juntar mercado oferta').first().json.oferta.produto_id }}"]]), 1210, 100);
  wf.add(code('Avaliar oferta', `
const cls = $('Juntar mercado oferta').isExecuted ? $('Juntar mercado oferta').first().json : $('Juntar página').first().json;
const rows = $('Histórico do produto').all().map((i) => i.json).filter((r) => r.produto_id);
const ofsProd = $('Ofertas do produto 24h').isExecuted ? $('Ofertas do produto 24h').all().map((i) => i.json).filter((r) => r.oferta_id) : [];
return [{ json: LIB.avaliarNovaOferta(cls, rows, cfg, ofsProd) }];`, { lib: true }), 1320, 100);
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
  wf.chain('Histórico do produto', 'Ofertas do produto 24h', 'Avaliar oferta');
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
  wf.add(dtGet('Posts 26h', 'bfx_posts', [['ts', 'gte', '={{ Date.now() - 26 * 3600000 }}']]), 2250, 480);
  wf.add(code('Itens de link', `
const d = $('Plano de links').first().json;
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
const postsAnt = $('Posts 26h').isExecuted ? $('Posts 26h').all().map((i) => i.json).filter((r) => r.oferta_id) : [];
const ctx = Object.assign({}, p.ctx, { postsAnteriores: postsAnt });
return [{ json: LIB.prepararPublicacao(p.oferta, itensLink, cfg, ctx) }];`, { lib: true }), 2420, 640);
  wf.link('Rota', 'Buscar oferta', 1);
  wf.chain('Buscar oferta', 'Decidir');
  wf.chain('Decidir', 'Respostas do clique', 'Telegram (clique)');
  wf.chain('Decidir', 'Atualização', 'Atualizar oferta', 'Plano do clique', 'Plano de links', 'Posts 26h', 'Itens de link', 'Precisa da Shopee?');
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

  // Disparar alertas pessoais (bfx_alertas) para membros interessados no produto publicado
  wf.add(code('Disparar alertas oferta?', `
const dPub = $input.first().json;
const p = $('Plano de links').first().json;
if (!dPub.ok || (p && p.ctx && p.ctx.so_textos) || !p || !p.oferta) return [];
return [{ json: { oferta: p.oferta, linksRows: dPub.linksRows || [], ts: (p.ctx && p.ctx.ts) || Date.now() } }];`, { cfg: false }), 2640, 880);
  wf.add(dtGet('Alertas ativos pub', 'bfx_alertas', [['ativo', 'eq', true]]), 2860, 880);
  wf.add(code('Calcular DMs alerta', `
const base = $('Disparar alertas oferta?').first().json;
const rows = $input.all().map((i) => i.json).filter((r) => r.alerta_id);
return [{ json: LIB.dispararAlertasOferta([base.oferta], base.linksRows, rows, cfg, base.ts) }];`, { lib: true }), 3080, 880);
  wf.add(itens('DMs alertas pub', '$json.chamadas'), 3300, 840);
  wf.add(httpTelegram('Telegram (DMs alertas)'), 3520, 840);
  wf.add(itens('Marcar alertas pub', "$('Calcular DMs alerta').first().json.updatesAlertas"), 3300, 960);
  wf.add(dtUpdate('Atualizar avisos alertas', 'bfx_alertas', 'alerta_id'), 3520, 960);
  wf.add(itens('WhatsApp auto pub', "$('Publicar').first().json.chamadasWhatsApp"), 2640, 1020);
  wf.add(httpWhatsAppAuto('Webhook WhatsApp auto'), 2860, 1020);
  wf.chain('Publicar', 'Disparar alertas oferta?', 'Alertas ativos pub', 'Calcular DMs alerta');
  wf.chain('Calcular DMs alerta', 'DMs alertas pub', 'Telegram (DMs alertas)');
  wf.chain('Calcular DMs alerta', 'Marcar alertas pub', 'Atualizar avisos alertas');
  wf.chain('Publicar', 'WhatsApp auto pub', 'Webhook WhatsApp auto');

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
  // Foto recusada (ou 429) na cópia do Top / ao mover: reenvia como texto com prévia.
  wf.add(code('Checar envio (publicada)', `
const chamadas = $('Chamadas (publicada)').all().map((i) => i.json);
return [{ json: LIB.limiteTelegram(chamadas, $input.all().map((i) => i.json)) }];`, { lib: true, cfg: false }), 2260, 1540);
  wf.add({
    name: 'Reenviar (publicada)?', type: 'n8n-nodes-base.if', typeVersion: 2.2,
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ id: 'limp', leftValue: '={{ $json.indices.length }}', rightValue: 0, operator: { type: 'number', operation: 'gt' } }],
        combinator: 'and',
      },
      options: {},
    },
  }, 2300, 1540);
  wf.add({ name: 'Esperar Telegram (publicada)', type: 'n8n-nodes-base.wait', typeVersion: 1.1, webhookId: uuid('wait-publicada'), parameters: { resume: 'timeInterval', amount: '={{ $json.espera }}', unit: 'seconds' } }, 2320, 1660);
  wf.add(itens('Reenviar chamadas (publicada)', '$json.reenviar'), 2340, 1660);
  wf.add(httpTelegram('Telegram (reenvio publicada)'), 2380, 1660);
  wf.add(code('Resultado (publicada)', `
const chamadas = $('Chamadas (publicada)').all().map((i) => i.json);
let resp = $('Telegram (publicada)').all().map((i) => i.json);
const lim = $('Checar envio (publicada)').first().json;
if (lim.indices.length && $('Telegram (reenvio publicada)').isExecuted) resp = LIB.juntarReenvio(resp, lim, $('Telegram (reenvio publicada)').all().map((i) => i.json));
return [{ json: LIB.resultadoChamadas(chamadas, resp, cfg, Date.now()) }];`, { lib: true }), 2420, 1540);
  wf.add(itens('Post do Top', '$json.posts'), 2640, 1480);
  wf.add(dtInsert('Gravar post do Top', 'bfx_posts'), 2860, 1480);
  wf.add(itens('Alertas (publicada)', "$('Resultado (publicada)').first().json.alertas"), 2640, 1620);
  wf.add(httpTelegram('Telegram (alertas da publicada)'), 2860, 1620);
  wf.link('Rota', 'Oferta publicada', 5);
  wf.chain('Oferta publicada', 'Posts da oferta e de hoje', 'Links da oferta', 'Decidir (publicada)');
  wf.chain('Decidir (publicada)', 'Atualização (publicada)', 'Atualizar oferta publicada');
  wf.chain('Decidir (publicada)', 'Chamadas (publicada)', 'Telegram (publicada)', 'Checar envio (publicada)', 'Reenviar (publicada)?');
  wf.link('Reenviar (publicada)?', 'Esperar Telegram (publicada)', 0);
  wf.chain('Esperar Telegram (publicada)', 'Reenviar chamadas (publicada)', 'Telegram (reenvio publicada)', 'Resultado (publicada)');
  wf.link('Reenviar (publicada)?', 'Resultado (publicada)', 1);
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

  // 10 · rotas de comunidade (auto-onboarding de canal, /alerta de membro, /buscar /cupons /tophoje /resumao /demanda)
  wf.add(switchExpr('Rota comunidade', "({ canal_novo: 0, alerta: 1, vitrine: 2 })[$json.rota] ?? 3", 4), 1100, 2900);
  wf.link('Rota', 'Rota comunidade', 10);

  // 10.0 · canal_novo: configura bio, link privado, grava bfx_config e fixa boas-vindas no canal recém-criado
  wf.add(itens('Chamadas canal novo', `${CLS}.chamadas`), 1340, 2760);
  wf.add(httpTelegram('Telegram (canal novo)'), 1560, 2760);
  wf.add(code('Finalizar canal novo', `
return [{ json: LIB.finalizarAutoOnboardingCanal(${CLS}, $input.all().map((i) => i.json), cfg) }];`, { lib: true }), 1780, 2760);
  wf.add(itens('Upserts canal novo', '$json.upserts'), 2000, 2700);
  wf.add(dtUpdate('Salvar canal novo', 'bfx_config', 'chave', 'upsert'), 2220, 2700);
  wf.add(itens('Pos-setup canal novo', "$('Finalizar canal novo').first().json.chamadas"), 2000, 2820);
  wf.add(httpTelegram('Telegram (pos-canal)'), 2220, 2820);
  wf.link('Rota comunidade', 'Chamadas canal novo', 0);
  wf.chain('Chamadas canal novo', 'Telegram (canal novo)', 'Finalizar canal novo');
  wf.chain('Finalizar canal novo', 'Upserts canal novo', 'Salvar canal novo');
  wf.chain('Finalizar canal novo', 'Pos-setup canal novo', 'Telegram (pos-canal)');

  // 10.1 · alerta: /alerta, /meusalertas, /remover no privado do bot publicador
  wf.add(dtGet('Alertas do membro', 'bfx_alertas', [['chat_id', 'eq', `={{ ${CLS}.chat_id }}`]]), 1340, 2960);
  wf.add(code('Processar alerta', `
const rows = $input.all().map((i) => i.json).filter((r) => r.alerta_id);
return [{ json: LIB.processarAlertaMembro(${CLS}, rows, cfg) }];`, { lib: true }), 1560, 2960);
  wf.add(itens('Inserir alertas', '$json.inserir'), 1780, 2900);
  wf.add(dtInsert('Gravar alerta', 'bfx_alertas'), 2000, 2900);
  wf.add(itens('Atualizar alertas', "$('Processar alerta').first().json.atualizar"), 1780, 3000);
  wf.add(dtUpdate('Salvar alerta', 'bfx_alertas', 'alerta_id'), 2000, 3000);
  wf.add(itens('Resposta alerta', "$('Processar alerta').first().json.chamadas"), 1780, 3100);
  wf.add(httpTelegram('Telegram (alerta membro)'), 2000, 3100);
  wf.link('Rota comunidade', 'Alertas do membro', 1);
  wf.chain('Alertas do membro', 'Processar alerta');
  wf.chain('Processar alerta', 'Inserir alertas', 'Gravar alerta');
  wf.chain('Processar alerta', 'Atualizar alertas', 'Salvar alerta');
  wf.chain('Processar alerta', 'Resposta alerta', 'Telegram (alerta membro)');

  // 10.2 · vitrine: /buscar, /cupons, /tophoje (membros) + /resumao, /demanda (admin)
  wf.add(dtGet('Vitrine ofertas 7d', 'bfx_ofertas', [['ts', 'gte', '={{ Date.now() - 7 * 86400000 }}']]), 1340, 3240);
  wf.add(dtGet('Vitrine links 7d', 'bfx_links', [['ts', 'gte', '={{ Date.now() - 7 * 86400000 }}']]), 1560, 3240);
  wf.add(dtGet('Vitrine alertas', 'bfx_alertas', [['ativo', 'eq', true]]), 1780, 3240);
  wf.add(code('Montar vitrine', `
let estado = {};
try { estado = $getWorkflowStaticData('global'); } catch (e) { /* sem estado */ }
const pega = (n, col) => $(n).all().map((i) => i.json).filter((r) => r[col]);
return [{ json: LIB.responderVitrineMembro(${CLS}, pega('Vitrine ofertas 7d', 'oferta_id'), pega('Vitrine links 7d', 'oferta_id'), pega('Vitrine alertas', 'alerta_id'), cfg, estado) }];`, { lib: true }), 2000, 3240);
  wf.add(itens('Mensagens vitrine', '$json.chamadas'), 2220, 3240);
  wf.add(httpTelegram('Telegram (vitrine)'), 2440, 3240);
  wf.link('Rota comunidade', 'Vitrine ofertas 7d', 2);
  wf.chain('Vitrine ofertas 7d', 'Vitrine links 7d', 'Vitrine alertas', 'Montar vitrine', 'Mensagens vitrine', 'Telegram (vitrine)');
  return wf;
}

/* ---------- subfluxo reutilizável do radar multi-fonte ---------- */

function httpRadarGet(name, follow, batch) {
  const b = batch || { batchSize: 2, batchInterval: 250 };
  const opts = {
    batching: { batch: b },
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

  const lockPlan = cfgFluxo.lock
    ? "const sd = typeof $getWorkflowStaticData === 'function' ? $getWorkflowStaticData('global') : null;\nif (sd && sd.radar_rodando_ate && Date.now() < sd.radar_rodando_ate) return [];\n"
    : '';
  const lockSet = cfgFluxo.lock ? "if (sd) sd.radar_rodando_ate = Date.now() + 240000;\n" : '';
  const extraOpts = cfgFluxo.lock
    ? `Object.assign({}, ${cfgFluxo.opcoesCode}, { pb_redir_bloqueado_ate: (sd && sd.pb_redir_bloqueado_ate) || 0 })`
    : cfgFluxo.opcoesCode;
  wf.add(code(N('Planejar'), `${lockPlan}const p = LIB.planejarFontesRadar(cfg, ${extraOpts});
if (!p.ativo) return [];
${lockSet}return [{ json: p }];`, { lib: true }), x, y);

  wf.add(switchExpr(N('Tem web?'), `$('${N('Planejar')}').first().json.fontesWeb.length > 0 ? 0 : 1`, 2), x + 220, y);
  wf.add(itens(N('Fontes web'), `$('${N('Planejar')}').first().json.fontesWeb`), x + 440, y - 120);
  wf.add(httpRadarGet(N('Buscar fontes web'), true, { batchSize: 2, batchInterval: 350 }), x + 660, y - 120);
  wf.add(code(N('Enxugar fontes web'), `
const fontes = ($('${N('Planejar')}').first().json.fontesWeb) || [];
const resps = $input.all().map((i) => i.json || {});
return resps.map((r, idx) => {
  const f = fontes[idx] || {};
  const raw = typeof r.body === 'string' ? r.body : (typeof r.data === 'string' ? r.data : '');
  let body = raw;
  if (f.tipo === 'umusic_vtex') {
    body = typeof r.body === 'string' ? r.body.slice(0, 400000) : (r.body != null ? r.body : r.data);
  } else if (f.tipo === 'telegram_canal') {
    const pos = raw.search(/<div[^>]+class="[^"]*tgme_widget_message_wrap/i);
    const trecho = pos >= 0 ? raw.slice(pos) : raw;
    body = trecho
      .replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi, '')
      .replace(/<style\\b[^>]*>[\\s\\S]*?<\\/style>/gi, '')
      .replace(/<svg\\b[^>]*>[\\s\\S]*?<\\/svg>/gi, '')
      .replace(/<!--[\\s\\S]*?-->/g, '')
      .slice(0, 350000);
  } else if (f.tipo === 'gatry_home' || f.tipo === 'nuvemshop_kpop') {
    body = raw
      .replace(/<head\\b[^>]*>[\\s\\S]*?<\\/head>/gi, '')
      .replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi, '')
      .replace(/<style\\b[^>]*>[\\s\\S]*?<\\/style>/gi, '')
      .replace(/<svg\\b[^>]*>[\\s\\S]*?<\\/svg>/gi, '')
      .replace(/<!--[\\s\\S]*?-->/g, '')
      .replace(/[ \\t]{2,}/g, ' ')
      .slice(0, 350000);
  } else {
    const m = raw.match(/<script[^>]*id\\s*=\\s*["']__NEXT_DATA__["'][^>]*>[\\s\\S]*?<\\/script>/i);
    body = m ? m[0].slice(0, 500000) : raw.slice(0, 4000);
  }
  return { json: { statusCode: r.statusCode || 200, body } };
});`, { cfg: false, nota: 'Filtra e trunca HTML pesado antes de Selecionar radar para evitar OOM e timeout no JS runner.' }), x + 770, y - 120);

  wf.add(switchExpr(N('Tem Shopee?'), `$('${N('Planejar')}').first().json.fontesShopee.length > 0 ? 0 : 1`, 2), x + 880, y);
  wf.add(itens(N('Fontes Shopee'), `$('${N('Planejar')}').first().json.fontesShopee`), x + 1100, y - 120);
  wf.add(httpShopee(N('Shopee: radar')), x + 1320, y - 120);

  wf.add(dtGet(N('Ofertas recentes'), 'bfx_ofertas', [['ts', 'gte', '={{ Date.now() - 4 * 86400000 }}']]), x + 1540, y);
  wf.add(dtGet(N('Histórico radar'), 'bfx_precos', [['ts', 'gte', '={{ Date.now() - 91 * 86400000 }}']]), x + 1760, y);
  wf.add(dtGet(N('Alertas radar'), 'bfx_alertas', [['ativo', 'eq', true]]), x + 1870, y);
  wf.add(code(N('Selecionar radar'), `
const base = $('${N('Planejar')}').first().json;
const respWeb = base.fontesWeb.length && $('${N('Enxugar fontes web')}').isExecuted ? $('${N('Enxugar fontes web')}').all().map((i) => i.json) : [];
const respSh = base.fontesShopee.length && $('${N('Shopee: radar')}').isExecuted ? $('${N('Shopee: radar')}').all().map((i) => i.json) : [];
const ofertas = $('${N('Ofertas recentes')}').all().map((i) => i.json).filter((r) => r.oferta_id);
const precos = $('${N('Histórico radar')}').all().map((i) => i.json).filter((r) => r.produto_id);
const alertas = $input.all().map((i) => i.json).filter((r) => r.alerta_id);
const sd = typeof $getWorkflowStaticData === 'function' ? $getWorkflowStaticData('global') : {};
return [{ json: LIB.selecionarCandidatosRadar(base, respWeb, respSh, ofertas, precos, cfg, alertas, sd.radar_descartes || {}, { pb_redir_bloqueado_ate: sd.pb_redir_bloqueado_ate || 0 }) }];`, { lib: true }), x + 1980, y);

  wf.add(switchExpr(N('Tem redir 1?'), '$json.reqs1.length > 0 ? 0 : 1', 2), x + 2200, y);
  wf.add(itens(N('Itens redir 1'), `$('${N('Selecionar radar')}').first().json.reqs1`), x + 2420, y - 120);
  wf.add(httpRadarGet(N('Abrir redir 1'), false), x + 2640, y - 120);
  wf.add(code(N('Aplicar redir 1'), `
const est = $('${N('Selecionar radar')}').first().json;
const resp1 = est.reqs1.length && $('${N('Abrir redir 1')}').isExecuted ? $('${N('Abrir redir 1')}').all().map((i) => i.json) : [];
const res = LIB.aplicarRedirRadar1(est, resp1, cfg);
if (typeof $getWorkflowStaticData === 'function') {
  const sd = $getWorkflowStaticData('global');
  if (res.promobit_429) sd.pb_redir_bloqueado_ate = Date.now() + 8 * 60 * 1000;
  else if (res.promobit_ok) sd.pb_redir_bloqueado_ate = 0;
}
return [{ json: res }];`, { lib: true }), x + 2860, y);

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
  wf.add(switchExpr(N('Tem mercado radar?'), `($('${N('Preparar páginas radar')}').first().json.reqsMercado || []).length > 0 ? 0 : 1`, 2), x + 5390, y);
  wf.add(itens(N('Itens mercado radar'), `$('${N('Preparar páginas radar')}').first().json.reqsMercado`), x + 5440, y - 120);
  wf.add(httpRadarGet(N('Checar mercado radar'), true, { batchSize: 1, batchInterval: 450 }), x + 5480, y - 120);
  const lockFinClear = cfgFluxo.lock ? '  if (!fin.autoPlanos || !fin.autoPlanos.length) sd.radar_rodando_ate = 0;\n' : '';
  wf.add(code(N('Finalizar radar'), `
const est = $('${N('Preparar páginas radar')}').first().json;
const respPag = est.reqsPag.length && $('${N('Ler páginas radar')}').isExecuted ? $('${N('Ler páginas radar')}').all().map((i) => i.json) : [];
const respMerc = (est.reqsMercado || []).length && $('${N('Checar mercado radar')}').isExecuted ? $('${N('Checar mercado radar')}').all().map((i) => i.json) : [];
const ofertas = $('${N('Ofertas recentes')}').all().map((i) => i.json).filter((r) => r.oferta_id);
const precos = $('${N('Histórico radar')}').all().map((i) => i.json).filter((r) => r.produto_id);
const fin = LIB.finalizarRadar(est, [], ofertas, precos, cfg, respPag, respMerc);
if (typeof $getWorkflowStaticData === 'function') {
  const sd = $getWorkflowStaticData('global');
  sd.radar_descartes = LIB.atualizarDescartesRadar(sd.radar_descartes, fin.resumo.descartadas, (est.opcoes || {}).ts);
${lockFinClear}}
return [{ json: fin }];`, { lib: true }), x + 5500, y);

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
  wf.add(dtGet(N('Posts recentes radar'), 'bfx_posts', [['ts', 'gte', '={{ Date.now() - 26 * 3600000 }}']]), x + 6270, y + 180);
  wf.add(switchExpr(N('Tem Shopee auto?'), `$('${N('Finalizar radar')}').first().json.reqsShopeeLinks.length > 0 ? 0 : 1`, 2), x + 6380, y + 180);
  wf.add(itens(N('Itens Shopee auto'), `$('${N('Finalizar radar')}').first().json.reqsShopeeLinks`), x + 6600, y + 60);
  wf.add(httpShopee(N('Shopee: links radar')), x + 6820, y + 60);
  const lockPubClear = cfgFluxo.lock
    ? "const lote = LIB.publicarLoteRadar(fin, respSh, respCards, cfg, postsAnt);\nif (!lote.chamadasPub || !lote.chamadasPub.length) { if (typeof $getWorkflowStaticData === 'function') $getWorkflowStaticData('global').radar_rodando_ate = 0; }\nreturn [{ json: lote }];"
    : 'return [{ json: LIB.publicarLoteRadar(fin, respSh, respCards, cfg, postsAnt) }];';
  wf.add(code(N('Publicar lote radar'), `
const fin = $('${N('Finalizar radar')}').first().json;
const respSh = fin.reqsShopeeLinks.length && $('${N('Shopee: links radar')}').isExecuted ? $('${N('Shopee: links radar')}').all().map((i) => i.json) : [];
const respCards = fin.chamadas.length && $('${N('Telegram (cards radar)')}').isExecuted ? $('${N('Telegram (cards radar)')}').all().map((i) => i.json) : [];
const postsAnt = $('${N('Posts recentes radar')}').isExecuted ? $('${N('Posts recentes radar')}').all().map((i) => i.json).filter((r) => r.oferta_id) : [];
${lockPubClear}`, { lib: true }), x + 7040, y + 180);

  wf.add(itens(N('Updates lote'), '$json.updates'), x + 7260, y + 40);
  wf.add(dtUpdate(N('Atualizar lote radar'), 'bfx_ofertas', 'oferta_id'), x + 7480, y + 40);
  wf.add(itens(N('Links lote'), `$('${N('Publicar lote radar')}').first().json.linksRows`), x + 7260, y + 180);
  wf.add(dtInsert(N('Gravar links radar'), 'bfx_links'), x + 7480, y + 180);
  wf.add(itens(N('Mensagens lote'), `$('${N('Publicar lote radar')}').first().json.chamadasPub`), x + 7260, y + 320);
  // 700 ms entre mensagens: fica abaixo do limite do Telegram por chat (evita 429 em lote grande).
  wf.add(httpTelegram(N('Telegram (pub radar)'), 700), x + 7480, y + 320);
  // 429 (limite) ou foto recusada: espera e reenvia só o que falhou (foto recusada vai como texto com prévia).
  wf.add(code(N('Checar envio radar'), `
const chamadas = $('${N('Mensagens lote')}').all().map((i) => i.json);
const lim = LIB.limiteTelegram(chamadas, $input.all().map((i) => i.json), { tentarBinario: true });
lim.reenviar = (lim.reenviar || []).map((r, k) => Object.assign({}, r, { _reenvio_pos: k }));
return [{ json: lim }];`, { lib: true, cfg: false }), x + 7590, y + 320);
  wf.add({
    name: N('Reenviar radar?'), type: 'n8n-nodes-base.if', typeVersion: 2.2,
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ id: 'limr', leftValue: '={{ $json.indices.length }}', rightValue: 0, operator: { type: 'number', operation: 'gt' } }],
        combinator: 'and',
      },
      options: {},
    },
  }, x + 7640, y + 320);
  wf.add({ name: N('Esperar Telegram radar'), type: 'n8n-nodes-base.wait', typeVersion: 1.1, webhookId: uuid('wait-radar-' + P), parameters: { resume: 'timeInterval', amount: '={{ $json.espera }}', unit: 'seconds' } }, x + 7660, y + 260);
  wf.add({
    name: N('Tem foto binária?'), type: 'n8n-nodes-base.if', typeVersion: 2.2,
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ id: 'binr', leftValue: '={{ ($json.reenviar || []).some(function(x){ return !!x._tentar_binario; }) }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
      options: {},
    },
  }, x + 7670, y + 210);
  wf.add(itens(N('Itens foto binária'), `$('${N('Checar envio radar')}').first().json.reenviar.filter(function(x){ return !!x._tentar_binario; })`), x + 7674, y + 140);
  wf.add({
    name: N('Baixar foto radar'),
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: '={{ $json.download_url }}',
      sendHeaders: true,
      specifyHeaders: 'json',
      jsonHeaders: JSON.stringify({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/jpeg,image/png,*/*;q=0.8',
      }),
      options: {
        batching: { batch: { batchSize: 1, batchInterval: 300 } },
        response: { response: { neverError: true, responseFormat: 'file', outputPropertyName: 'data' } },
        timeout: 15000,
      },
    },
  }, x + 7678, y + 120);
  wf.add(code(N('Resumir foto radar'), `
const fontes = $('${N('Itens foto binária')}').all().map((i) => i.json);
const resp = $input.all();
const fallbacks = [];
let okCount = 0;
fontes.forEach((src, i) => {
  const it = resp[i] || {};
  const b = it.binary && it.binary.data;
  const mime = String((b && b.mimeType) || '');
  if (b && b.data && /^image\\//i.test(mime) && src.payload && src.bot) {
    okCount++;
  } else {
    const fb = src.fallback || src;
    fallbacks.push(Object.assign({}, fb, { _reenvio_pos: src._reenvio_pos, _enviar_arquivo: false }));
  }
});
return [{ json: { tem_foto: okCount > 0, ok_count: okCount, fallbacks } }];`, { cfg: false }), x + 7680, y + 120);
  wf.add({
    name: N('Tem foto baixada?'), type: 'n8n-nodes-base.if', typeVersion: 2.2,
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ id: 'baixr', leftValue: '={{ $json.tem_foto }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
      options: {},
    },
  }, x + 7682, y + 120);
  wf.add(code(N('Preparar foto radar'), `
const fontes = $('${N('Itens foto binária')}').all().map((i) => i.json);
const resp = $('${N('Baixar foto radar')}').all();
const out = [];
fontes.forEach((src, i) => {
  const it = resp[i] || {};
  const b = it.binary && it.binary.data;
  const mime = String((b && b.mimeType) || '');
  if (b && b.data && /^image\\//i.test(mime) && src.payload && src.bot) {
    out.push({
      json: {
        bot: src.bot,
        metodo: 'sendPhoto',
        payload: src.payload,
        ref: src.ref,
        _reenvio_pos: src._reenvio_pos,
        _enviar_arquivo: true,
        arquivo: { campo: 'photo', binario: 'data' },
      },
      binary: { data: b },
      pairedItem: { item: 0 },
    });
  }
});
return out;`, { cfg: false }), x + 7684, y + 60);
  wf.add(httpTelegramArquivo(N('Telegram (reenvio foto)'), 700), x + 7686, y + 60);
  wf.add(code(N('Montar reenvio texto'), `
const lim = $('${N('Checar envio radar')}').first().json;
const norm = (lim.reenviar || []).filter((x) => !x._tentar_binario);
const fbs = $('${N('Resumir foto radar')}').isExecuted ? ($('${N('Resumir foto radar')}').first().json.fallbacks || []) : [];
const binFb = [];
if ($('${N('Preparar foto radar')}').isExecuted && $('${N('Telegram (reenvio foto)')}').isExecuted) {
  const prepBins = $('${N('Preparar foto radar')}').all().map((i) => i.json);
  const resBins = $('${N('Telegram (reenvio foto)')}').all().map((i) => i.json);
  const origBins = $('${N('Itens foto binária')}').isExecuted ? $('${N('Itens foto binária')}').all().map((i) => i.json) : [];
  prepBins.forEach((pb, k) => {
    const r = resBins[k] || {};
    const d = String(r.description || (r.error && r.error.message) || '');
    const st = Number(r.error_code || (r.error && (r.error.httpCode || r.error.status)) || 0);
    const ambiguo = /timeout\\b.*\\bexceeded|ETIMEDOUT|ESOCKETTIMEDOUT|ECONNRESET|ECONNABORTED|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(d) || st >= 500;
    if ((r.ok === false || r.error) && !ambiguo) {
      const orig = origBins.find((o) => o._reenvio_pos === pb._reenvio_pos);
      if (orig && orig.fallback) binFb.push(Object.assign({}, orig.fallback, { _reenvio_pos: pb._reenvio_pos, _enviar_arquivo: false }));
    }
  });
}
return [{ json: { textos: norm.concat(fbs, binFb) } }];`, { cfg: false }), x + 7688, y + 220);
  wf.add({
    name: N('Tem reenvio texto?'), type: 'n8n-nodes-base.if', typeVersion: 2.2,
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ id: 'txtr', leftValue: '={{ $json.textos.length }}', rightValue: 0, operator: { type: 'number', operation: 'gt' } }],
        combinator: 'and',
      },
      options: {},
    },
  }, x + 7690, y + 220);
  wf.add(itens(N('Reenviar lote radar'), '$json.textos'), x + 7692, y + 260);
  wf.add(httpTelegram(N('Telegram (reenvio radar)'), 700), x + 7694, y + 260);
  const lockResClear = cfgFluxo.lock ? "\nif (typeof $getWorkflowStaticData === 'function') $getWorkflowStaticData('global').radar_rodando_ate = 0;" : '';
  wf.add(code(N('Resultado lote radar'), `
const chamadas = $('${N('Mensagens lote')}').all().map((i) => i.json);
let resp = $('${N('Telegram (pub radar)')}').all().map((i) => i.json);
const lim = $('${N('Checar envio radar')}').first().json;
if (lim.indices.length) {
  const rr = new Array(lim.indices.length);
  if ($('${N('Preparar foto radar')}').isExecuted && $('${N('Telegram (reenvio foto)')}').isExecuted) {
    const bins = $('${N('Preparar foto radar')}').all().map((i) => i.json);
    const resBin = $('${N('Telegram (reenvio foto)')}').all().map((i) => i.json);
    bins.forEach((it, k) => { if (resBin[k]) rr[it._reenvio_pos] = resBin[k]; });
  }
  if ($('${N('Montar reenvio texto')}').isExecuted && $('${N('Telegram (reenvio radar)')}').isExecuted) {
    const textos = $('${N('Montar reenvio texto')}').first().json.textos || [];
    const resTxt = $('${N('Telegram (reenvio radar)')}').all().map((i) => i.json);
    textos.forEach((it, k) => { if (resTxt[k]) rr[it._reenvio_pos] = resTxt[k]; });
  }
  resp = LIB.juntarReenvio(resp, lim, rr);
}${lockResClear}
return [{ json: LIB.resultadoChamadas(chamadas, resp, cfg, Date.now()) }];`, { lib: true }), x + 7700, y + 320);
  wf.add(itens(N('Status falha radar'), '$json.update'), x + 7920, y + 160);
  wf.add(dtUpdate(N('Gravar falha radar'), 'bfx_ofertas', 'oferta_id'), x + 8140, y + 160);
  wf.add(itens(N('Posts lote'), '$json.posts'), x + 7920, y + 240);
  wf.add(dtInsert(N('Gravar posts radar'), 'bfx_posts'), x + 8140, y + 240);
  wf.add(itens(N('Alertas lote'), `$('${N('Resultado lote radar')}').first().json.alertas`), x + 7920, y + 400);
  wf.add(httpTelegram(N('Telegram (alertas radar)')), x + 8140, y + 400);

  // Notificar membros interessados (bfx_alertas) nas ofertas auto-publicadas pelo radar
  wf.add(code(N('Disparar alertas radar?'), `
const l = $input.first().json;
if (!l.ofertasPublicadas || !l.ofertasPublicadas.length) return [];
return [{ json: { ofertas: l.ofertasPublicadas, linksRows: l.linksRows || [], ts: ($('${N('Finalizar radar')}').first().json.opcoes || {}).ts || Date.now() } }];`, { cfg: false }), x + 7260, y + 500);
  wf.add(dtGet(N('Alertas ativos radar'), 'bfx_alertas', [['ativo', 'eq', true]]), x + 7480, y + 500);
  wf.add(code(N('Calcular DMs radar'), `
const base = $('${N('Disparar alertas radar?')}').first().json;
const rows = $input.all().map((i) => i.json).filter((r) => r.alerta_id);
return [{ json: LIB.dispararAlertasOferta(base.ofertas, base.linksRows, rows, cfg, base.ts) }];`, { lib: true }), x + 7700, y + 500);
  wf.add(itens(N('DMs alertas radar'), '$json.chamadas'), x + 7920, y + 460);
  wf.add(httpTelegram(N('Telegram (DMs radar)')), x + 8140, y + 460);
  wf.add(itens(N('Marcar alertas radar'), `$('${N('Calcular DMs radar')}').first().json.updatesAlertas`), x + 7920, y + 560);
  wf.add(dtUpdate(N('Atualizar avisos radar'), 'bfx_alertas', 'alerta_id'), x + 8140, y + 560);
  wf.add(itens(N('WhatsApp auto radar'), `$('${N('Publicar lote radar')}').first().json.chamadasWhatsApp`), x + 7260, y + 640);
  wf.add(httpWhatsAppAuto(N('Webhook WhatsApp radar')), x + 7480, y + 640);

  wf.link(cfgFluxo.entradaNode, N('Planejar'), cfgFluxo.entradaSaida || 0);
  wf.chain(N('Planejar'), N('Tem web?'));
  wf.link(N('Tem web?'), N('Fontes web'), 0);
  wf.chain(N('Fontes web'), N('Buscar fontes web'), N('Enxugar fontes web'), N('Tem Shopee?'));
  wf.link(N('Tem web?'), N('Tem Shopee?'), 1);

  wf.link(N('Tem Shopee?'), N('Fontes Shopee'), 0);
  wf.chain(N('Fontes Shopee'), N('Shopee: radar'), N('Ofertas recentes'));
  wf.link(N('Tem Shopee?'), N('Ofertas recentes'), 1);

  wf.chain(N('Ofertas recentes'), N('Histórico radar'), N('Alertas radar'), N('Selecionar radar'), N('Tem redir 1?'));
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
  wf.chain(N('Itens páginas radar'), N('Ler páginas radar'), N('Tem mercado radar?'));
  wf.link(N('Tem páginas radar?'), N('Tem mercado radar?'), 1);
  wf.link(N('Tem mercado radar?'), N('Itens mercado radar'), 0);
  wf.chain(N('Itens mercado radar'), N('Checar mercado radar'), N('Finalizar radar'));
  wf.link(N('Tem mercado radar?'), N('Finalizar radar'), 1);

  wf.chain(N('Finalizar radar'), N('Preços radar'), N('Gravar preços radar'));
  wf.chain(N('Finalizar radar'), N('Ofertas radar'), N('Gravar ofertas radar'));
  wf.chain(N('Finalizar radar'), N('Cards radar'), N('Telegram (cards radar)'));
  wf.chain(N('Finalizar radar'), N('Auto radar?'), N('Posts recentes radar'), N('Tem Shopee auto?'));

  wf.link(N('Tem Shopee auto?'), N('Itens Shopee auto'), 0);
  wf.chain(N('Itens Shopee auto'), N('Shopee: links radar'), N('Publicar lote radar'));
  wf.link(N('Tem Shopee auto?'), N('Publicar lote radar'), 1);

  wf.chain(N('Publicar lote radar'), N('Updates lote'), N('Atualizar lote radar'));
  wf.chain(N('Publicar lote radar'), N('Links lote'), N('Gravar links radar'));
  wf.chain(N('Publicar lote radar'), N('Mensagens lote'), N('Telegram (pub radar)'), N('Checar envio radar'), N('Reenviar radar?'));
  wf.link(N('Reenviar radar?'), N('Esperar Telegram radar'), 0);
  wf.chain(N('Esperar Telegram radar'), N('Tem foto binária?'));
  wf.link(N('Tem foto binária?'), N('Itens foto binária'), 0);
  wf.chain(N('Itens foto binária'), N('Baixar foto radar'), N('Resumir foto radar'), N('Tem foto baixada?'));
  wf.link(N('Tem foto baixada?'), N('Preparar foto radar'), 0);
  wf.chain(N('Preparar foto radar'), N('Telegram (reenvio foto)'), N('Montar reenvio texto'));
  wf.link(N('Tem foto baixada?'), N('Montar reenvio texto'), 1);
  wf.link(N('Tem foto binária?'), N('Montar reenvio texto'), 1);
  wf.chain(N('Montar reenvio texto'), N('Tem reenvio texto?'));
  wf.link(N('Tem reenvio texto?'), N('Reenviar lote radar'), 0);
  wf.chain(N('Reenviar lote radar'), N('Telegram (reenvio radar)'), N('Resultado lote radar'));
  wf.link(N('Tem reenvio texto?'), N('Resultado lote radar'), 1);
  wf.link(N('Reenviar radar?'), N('Resultado lote radar'), 1);
  wf.chain(N('Resultado lote radar'), N('Status falha radar'), N('Gravar falha radar'));
  wf.chain(N('Resultado lote radar'), N('Posts lote'), N('Gravar posts radar'));
  wf.chain(N('Resultado lote radar'), N('Alertas lote'), N('Telegram (alertas radar)'));
  wf.chain(N('Publicar lote radar'), N('Disparar alertas radar?'), N('Alertas ativos radar'), N('Calcular DMs radar'));
  wf.chain(N('Calcular DMs radar'), N('DMs alertas radar'), N('Telegram (DMs radar)'));
  wf.chain(N('Calcular DMs radar'), N('Marcar alertas radar'), N('Atualizar avisos radar'));
  wf.chain(N('Publicar lote radar'), N('WhatsApp auto radar'), N('Webhook WhatsApp radar'));
}

/* ---------- 04 · radar multi-fonte ---------- */

function wfRadar() {
  // Roda a cada 2 min: sucesso não fica no histórico para evitar acúmulo de HTML (~8 MB/exec) no SQLite.
  const wf = new WF('04 · Radar Multi-Fonte (a cada 2 min)', { saveDataSuccessExecution: 'none' });
  wf.add({
    name: 'A cada 2 minutos (radar)',
    type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1.2,
    parameters: { rule: { interval: [{ field: 'cronExpression', expression: '*/2 * * * *' }] } },
  }, 0, 300);
  // Cria a bfx_alertas se faltar (atualização sem rodar o Setup de novo). Não faz nada se já existe.
  const garantir = dtCreate('Garantir tabela de alertas', 'bfx_alertas');
  garantir.onError = 'continueRegularOutput';
  wf.add(garantir, 110, 480);
  configNodes(wf, 220, 300);
  wf.link('A cada 2 minutos (radar)', 'Garantir tabela de alertas');
  wf.link('Garantir tabela de alertas', 'Ler config');
  adicionarSubfluxoRadar(wf, {
    prefixo: '',
    x0: 660,
    y0: 300,
    entradaNode: 'Config',
    entradaSaida: 0,
    opcoesCode: "{ modo: 'agendado', ts: Date.now() }",
    lock: true,
  });
  return wf;
}

/* ---------- 02 · coleta Shopee ---------- */

function wfShopee() {
  const wf = new WF('02 · Coleta Shopee (a cada 2 h)', { saveDataSuccessExecution: 'none' });
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
  wf.add(dtGet('Alertas ativos', 'bfx_alertas', [['ativo', 'eq', true]]), 1430, 300);
  wf.add(code('Montar relatório', `
const pega = (n) => $(n).all().map((i) => i.json);
return LIB.relatorioDiario({ posts: pega('Posts'), links: pega('Links'), ofertas: pega('Ofertas'), entradas: pega('Entradas'), alertas: pega('Alertas ativos') }, cfg, Date.now())
  .chamadas.map((c) => ({ json: c }));`, { lib: true }), 1540, 300);
  wf.add(httpTelegram('Telegram (relatório)'), 1760, 300);
  wf.chain('Config', 'Posts', 'Links', 'Ofertas', 'Entradas', 'Alertas ativos', 'Montar relatório', 'Telegram (relatório)');
  return wf;
}

/* ---------- 05 · guardião de ofertas e vitrine 21h ---------- */

function wfGuardiao() {
  const wf = new WF('05 · Guardião 30min, Quedas Extras e Esquenta/Top 5', { saveDataSuccessExecution: 'none' });
  wf.add({
    name: 'A cada 30 minutos (guardião)',
    type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1.2,
    parameters: { rule: { interval: [{ field: 'cronExpression', expression: '15,45 8-23 * * *' }] } },
  }, 0, 300);
  configNodes(wf, 220, 300);
  wf.link('A cada 30 minutos (guardião)', 'Ler config');
  const janela = '={{ Date.now() - 36 * 3600000 }}';
  wf.add(dtGet('Ofertas 36h', 'bfx_ofertas', [['ts', 'gte', janela]]), 660, 300);
  wf.add(dtGet('Posts 36h', 'bfx_posts', [['ts', 'gte', janela]]), 880, 300);
  wf.add(dtGet('Links 36h', 'bfx_links', [['ts', 'gte', janela]]), 1100, 300);
  wf.add(code('Planejar guardião', `
const ofs = $('Ofertas 36h').all().map((i) => i.json).filter((r) => r.oferta_id);
return [{ json: LIB.planejarGuardiao(ofs, cfg, Date.now()) }];`, { lib: true }), 1320, 300);
  wf.add(switchExpr('Tem checagens?', '$json.reqs.length > 0 ? 0 : 1', 2), 1540, 300);
  wf.add(itens('Itens guardião', '$json.reqs'), 1760, 180);
  wf.add(httpRadarGet('Checar páginas ativas', true), 1980, 180);
  wf.add(code('Executar guardião', `
const plano = $('Planejar guardião').first().json;
const resp = plano.reqs.length && $('Checar páginas ativas').isExecuted ? $('Checar páginas ativas').all().map((i) => i.json) : [];
const pega = (n) => $(n).all().map((i) => i.json).filter((r) => r.oferta_id);
return [{ json: LIB.executarGuardiao(plano, resp, pega('Ofertas 36h'), pega('Posts 36h'), pega('Links 36h'), cfg, Date.now()) }];`, { lib: true }), 2200, 300);
  wf.add(itens('Ofertas encerradas', '$json.updatesOfertas'), 2420, 180);
  wf.add(dtUpdate('Marcar encerradas', 'bfx_ofertas', 'oferta_id'), 2640, 180);
  wf.add(itens('Config vitrine', "$('Executar guardião').first().json.upsertsConfig"), 2420, 300);
  wf.add(dtUpdate('Salvar dia vitrine', 'bfx_config', 'chave', 'upsert'), 2640, 300);
  wf.add(itens('Chamadas guardião', "$('Executar guardião').first().json.chamadas"), 2420, 420);
  wf.add(httpTelegram('Telegram (guardião)'), 2640, 420);

  wf.chain('Config', 'Ofertas 36h', 'Posts 36h', 'Links 36h', 'Planejar guardião', 'Tem checagens?');
  wf.link('Tem checagens?', 'Itens guardião', 0);
  wf.chain('Itens guardião', 'Checar páginas ativas', 'Executar guardião');
  wf.link('Tem checagens?', 'Executar guardião', 1);
  wf.chain('Executar guardião', 'Ofertas encerradas', 'Marcar encerradas');
  wf.chain('Executar guardião', 'Config vitrine', 'Salvar dia vitrine');
  wf.chain('Executar guardião', 'Chamadas guardião', 'Telegram (guardião)');
  return wf;
}

/* ---------- 90 · túnel (só no servidor local) ---------- */

function wfTunel() {
  const wf = new WF('90 · Túnel: atualizar o webhook (servidor local)', { saveDataSuccessExecution: 'none' });
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

/** Gera os workflows em memória. cloud: os 6 de n8n/workflows/ (sem id); local: os 8 do servidor local (com id fixo). */
function gerar() {
  const wfs = {
    '00-setup.json': wfSetup(),
    '01-telegram-router.json': wfRouter(),
    '02-coleta-shopee.json': wfShopee(),
    '03-relatorio-diario.json': wfRelatorio(),
    '04-radar-ofertas.json': wfRadar(),
    '05-guardiao-ofertas.json': wfGuardiao(),
  };
  const cloud = {};
  const local = {};
  for (const [arq, wf] of Object.entries(Object.assign({}, wfs, { '90-tunel.json': wfTunel(), '91-saude.json': wfSaude() }))) {
    const j = wf.json();
    if (wfs[arq]) cloud[arq] = j;
    local[arq] = Object.assign({ id: IDS_LOCAL[arq] }, j);
  }
  return { cloud, local };
}

/** Lê os argumentos da linha de comando. Lança erro em argumento desconhecido. */
function lerArgs(argv) {
  const a = { out: SAIDA, localOut: '', release: false, docConfig: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--out' || x === '--local-out') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) throw new Error(`${x} precisa de um diretório`);
      if (x === '--out') a.out = path.resolve(v); else a.localOut = path.resolve(v);
    } else if (x === '--release') a.release = true;
    else if (x === '--doc-config') a.docConfig = true;
    else throw new Error('argumento desconhecido: ' + x);
  }
  if (a.release) a.localOut = SAIDA_LOCAL;
  return a;
}

/** true se dir é servidor-local/ ou está dentro dele (o que o preparar.sh importa para a produção). */
function dentroDoServidorLocal(dir) {
  const rel = path.relative(SERVIDOR_LOCAL, path.resolve(dir));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function escrever(dir, arquivos) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [arq, j] of Object.entries(arquivos)) fs.writeFileSync(path.join(dir, arq), JSON.stringify(j, null, 2) + '\n');
}

function main(argv) {
  const a = lerArgs(argv || process.argv.slice(2));
  // P1-03: só o --release escreve em servidor-local/ (é o que vai para a produção no próximo "up").
  if (dentroDoServidorLocal(a.out)) throw new Error('--out não pode apontar para servidor-local/ (use npm run release)');
  if (a.localOut && !a.release && dentroDoServidorLocal(a.localOut)) throw new Error('--local-out não pode apontar para servidor-local/ (use npm run release)');
  const { cloud, local } = gerar();
  if (!a.release) {
    escrever(a.out, cloud);
    for (const [arq, j] of Object.entries(cloud)) console.log(`${arq}: ${j.nodes.length} nós → ${path.relative(RAIZ, a.out) || '.'}`);
  }
  if (a.localOut) {
    escrever(a.localOut, local);
    for (const [arq, j] of Object.entries(local)) console.log(`${arq}: ${j.nodes.length} nós → ${a.localOut}${cloud[arq] ? '' : ' (só servidor local)'}`);
    if (a.release) console.log('RELEASE: servidor-local/workflows/ atualizado. O preparar.sh só importa e publica com PUBLICAR_WORKFLOWS=sim.');
  }
  if (a.docConfig) escreverDocConfig();
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

if (require.main === module) {
  try { main(); } catch (e) { console.error('build: ' + e.message); process.exit(1); }
}
module.exports = { bundle, bundlePara, minificarJs, LIB_SRC, gerar, lerArgs, dentroDoServidorLocal, simularResposta, PORTAO_REAL, httpTelegramArquivo };
