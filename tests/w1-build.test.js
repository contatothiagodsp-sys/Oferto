'use strict';
// W1-build: P1-03 (saída do build), P1-06 (portão de dry-run) e P1-14 (Telegram multipart).
// Gera os workflows em memória e num diretório temporário. Não chama a rede.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const BUILD = path.join(__dirname, '..', 'build', 'build-workflows.js');
const b = require(BUILD);
const { cloud, local } = b.gerar();
const TODOS = Object.entries(local);

const ehHttp = (n) => n.type === 'n8n-nodes-base.httpRequest';
const urlDe = (n) => String((n.parameters && n.parameters.url) || '');
const entradasDe = (wf, nome) => {
  const r = [];
  for (const [de, c] of Object.entries(wf.connections)) {
    (c.main || []).forEach((saida, idx) => (saida || []).forEach((l) => { if (l.node === nome) r.push({ de, saida: idx }); }));
  }
  return r;
};
// Um nó HTTP é de envio (efeito público) se fala com a Bot API do Telegram ou com o WhatsApp.
const ehEnvio = (n) => {
  const u = urlDe(n);
  return /telegram\.api|bot_token|api\.telegram\.org/i.test(u) || /whatsapp|evolution|waha/i.test(n.name + ' ' + (n.notes || '') + ' ' + u);
};

test('P1-06: todo nó HTTP de Telegram/WhatsApp está atrás do portão de dry-run', () => {
  let envios = 0;
  for (const [arq, wf] of TODOS) {
    for (const n of wf.nodes.filter(ehHttp)) {
      if (!ehEnvio(n)) continue;
      envios++;
      assert.ok(n.name.endsWith(' · envio real'), `${arq}: "${n.name}" fala com Telegram/WhatsApp fora do portão`);
      const base = n.name.slice(0, -' · envio real'.length);
      const ent = entradasDe(wf, n.name);
      assert.deepStrictEqual(ent, [{ de: base + ' · portão', saida: 0 }], `${arq}: "${n.name}" só pode ser alcançado pela saída 0 do portão`);
      const portao = wf.nodes.find((x) => x.name === base + ' · portão');
      assert.strictEqual(portao.type, 'n8n-nodes-base.switch');
      assert.strictEqual(portao.parameters.output, `={{ ${b.PORTAO_REAL} ? 0 : 1 }}`, `${arq}: portão de "${base}" com expressão diferente`);
      const sim = wf.nodes.find((x) => x.name === base + ' · simulado');
      assert.ok(sim && sim.type === 'n8n-nodes-base.code', `${arq}: falta o simulado de "${base}"`);
      assert.deepStrictEqual(entradasDe(wf, sim.name), [{ de: base + ' · portão', saida: 1 }]);
      // Quem liga para "<base>" passa pelo portão; "<base>" só recebe do envio real e do simulado.
      assert.deepStrictEqual(entradasDe(wf, base).map((e) => e.de).sort(), [n.name, sim.name].sort(), `${arq}: "${base}" recebe de fora do portão`);
      for (const e of entradasDe(wf, portao.name)) assert.ok(!e.de.startsWith(base + ' · '), 'laço no portão');
    }
  }
  // 38 httpTelegram no router/setup/etc. + 2 WhatsApp (contagem do backlog, mais o que vier depois).
  assert.ok(envios >= 40, 'esperava pelo menos 40 nós de envio, achei ' + envios);
});

test('P1-06: nós HTTP fora do portão são só leituras GET ou a API da Shopee', () => {
  for (const [arq, wf] of TODOS) {
    for (const n of wf.nodes.filter(ehHttp)) {
      if (n.name.endsWith(' · envio real')) continue;
      const u = urlDe(n);
      assert.ok(!/telegram|whatsapp|bot_token/i.test(u), `${arq}: "${n.name}" tem URL de Telegram/WhatsApp fora do portão`);
      const m = n.parameters.method || 'GET';
      // POST fora do portão só para APIs que não publicam nada: Shopee (links) e Claude API (frase de tom do post).
      assert.ok(m === 'GET' || (m === 'POST' && u === '={{ $json.http.url }}' && /shopee|copy ia/i.test(n.name)), `${arq}: "${n.name}" faz ${m} fora do portão`);
    }
  }
});

test('P1-06: nenhum Code node faz rede por conta própria', () => {
  for (const [arq, wf] of TODOS) {
    for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) {
      const js = n.parameters.jsCode;
      assert.ok(!/this\.helpers\.(httpRequest|request)|\bfetch\s*\(|require\(\s*['"](https?|net|child_process)['"]\s*\)/.test(js), `${arq}: "${n.name}" chama a rede`);
    }
  }
});

test('P1-06: a expressão do portão só libera com dry_run explicitamente desligado', () => {
  const real = (cfg) => {
    const expr = b.PORTAO_REAL.split("$('Config').first().json.cfg").join('cfg');
    return Boolean(new Function('cfg', 'return ' + expr)(cfg));
  };
  assert.strictEqual(real({}), false, 'sem a chave → dry-run');
  assert.strictEqual(real({ publicacao: {} }), false);
  assert.strictEqual(real({ publicacao: { dry_run: true } }), false);
  assert.strictEqual(real({ publicacao: { dry_run: 'sim' } }), false);
  assert.strictEqual(real({ publicacao: { dry_run: 'talvez' } }), false, 'valor estranho → dry-run');
  assert.strictEqual(real({ publicacao: { dry_run: '' } }), false);
  assert.strictEqual(real({ publicacao: { dry_run: false } }), true);
  assert.strictEqual(real({ publicacao: { dry_run: 'nao' } }), true);
  assert.strictEqual(real({ publicacao: { dry_run: 'NÃO' } }), true);
});

test('P1-06: o simulado roda isolado e devolve respostas compatíveis', () => {
  const wf = local['01-telegram-router.json'];
  const sim = wf.nodes.find((n) => n.name === 'Telegram (publicação) · simulado');
  assert.ok(sim);
  const logs = [];
  const entrada = [
    { json: { bot: 'grupo', metodo: 'sendPhoto', payload: { chat_id: '@canal', photo: 'x', caption: 'c', message_thread_id: 7 } } },
    { json: { bot: 'grupo', metodo: 'pinChatMessage', payload: { chat_id: '@canal', message_id: 1 } } },
    { json: { bot: 'admin', metodo: 'getMe', payload: {} } },
    { json: { bot: 'grupo', metodo: 'createForumTopic', payload: { chat_id: -100, name: 'x' } } },
  ];
  const fn = new Function('$input', 'console', sim.parameters.jsCode);
  const out = fn({ all: () => entrada }, { log: (s) => logs.push(s) });
  assert.strictEqual(out.length, 4);
  out.forEach((o, i) => assert.deepStrictEqual(o.pairedItem, { item: i }));
  const [foto, pin, me, topico] = out.map((o) => o.json);
  assert.strictEqual(foto.ok, true);
  assert.ok(foto.result.message_id < 0, 'message_id sintético é negativo');
  assert.strictEqual(foto.result.chat.id, '@canal');
  assert.strictEqual(foto.result.message_thread_id, 7);
  assert.strictEqual(foto.dry_run.simulado, true);
  assert.deepStrictEqual([pin.ok, pin.result], [true, true]);
  // Leituras/criações não inventam dados que seriam gravados na bfx_config.
  assert.strictEqual(me.ok, false);
  assert.match(me.description, /DRY-RUN/);
  assert.strictEqual(topico.ok, false);
  assert.strictEqual(logs.length, 4);
  assert.ok(logs.every((l) => l.startsWith('[oferto dry-run] ')));
  assert.ok(!logs.join('').includes('caption'), 'log sem textos do post');
});

test('P1-06: simulado do WhatsApp', () => {
  const r = b.simularResposta('whatsapp', { url: 'https://wa.example/x', body: {} }, 0, 1700000000000, 'Webhook WhatsApp auto');
  assert.strictEqual(r.ok, true);
  assert.ok(r.result.message_id < 0);
  assert.strictEqual(r.dry_run.tipo, 'whatsapp');
  assert.ok(!JSON.stringify(r).includes('wa.example'), 'não registra a URL (pode ter token)');
});

test('P1-06: o nó que mantém o nome original repassa a resposta', () => {
  const wf = local['00-setup.json'];
  const n = wf.nodes.find((x) => x.name === 'Telegram (setup)');
  assert.strictEqual(n.type, 'n8n-nodes-base.code');
  const out = new Function('$input', n.parameters.jsCode)({ all: () => [{ json: { ok: true } }, { json: { ok: false } }] });
  assert.deepStrictEqual(out, [{ json: { ok: true }, pairedItem: { item: 0 } }, { json: { ok: false }, pairedItem: { item: 1 } }]);
  // Propriedades extras (retry) ficam no HTTP real.
  const g = wf.nodes.find((x) => x.name === 'Telegram (grupo) · envio real');
  assert.strictEqual(g.retryOnFail, true);
  assert.ok(!('__portao' in g));
});

test('P1-14: httpTelegramArquivo é multipart com binário e também passa pelo portão', () => {
  const d = b.httpTelegramArquivo('Telegram (foto)');
  assert.strictEqual(d.__portao, 'telegram');
  assert.strictEqual(d.parameters.contentType, 'multipart-form-data');
  const p = d.parameters.bodyParameters.parameters[0];
  assert.strictEqual(p.parameterType, 'formBinaryData');
  // A query leva o resto do payload; objetos viram JSON e o campo do arquivo fica de fora.
  const expr = d.parameters.jsonQuery.replace(/^=\{\{\s*/, '').replace(/\s*\}\}$/, '');
  const q = JSON.parse(new Function('$json', 'return ' + expr)({
    payload: { chat_id: -100, caption: 'oi', reply_markup: { inline_keyboard: [] }, photo: 'ignorar', vazio: null },
    arquivo: { campo: 'photo', binario: 'data' },
  }));
  assert.deepStrictEqual(q, { chat_id: '-100', caption: 'oi', reply_markup: '{"inline_keyboard":[]}' });
});

test('P1-03: argumentos do build e trava de servidor-local/', () => {
  const raiz = path.join(__dirname, '..');
  assert.strictEqual(b.lerArgs([]).out, path.join(raiz, 'n8n', 'workflows'));
  assert.strictEqual(b.lerArgs([]).localOut, '');
  assert.strictEqual(b.lerArgs([]).docConfig, false);
  assert.strictEqual(b.lerArgs(['--release']).localOut, path.join(raiz, 'servidor-local', 'workflows'));
  assert.throws(() => b.lerArgs(['--xyz']));
  assert.throws(() => b.lerArgs(['--out']));
  assert.strictEqual(b.dentroDoServidorLocal(path.join(raiz, 'servidor-local', 'workflows')), true);
  assert.strictEqual(b.dentroDoServidorLocal(path.join(raiz, 'servidor-local')), true);
  assert.strictEqual(b.dentroDoServidorLocal(path.join(raiz, 'n8n', 'workflows')), false);
  assert.strictEqual(b.dentroDoServidorLocal(path.join(raiz, 'servidor-local-x')), false);
});

test('P1-03: o build num diretório temporário não toca servidor-local/ nem docs/CONFIG.md', () => {
  const raiz = path.join(__dirname, '..');
  const marca = (f) => { try { return fs.statSync(f).mtimeMs; } catch (e) { return 0; } };
  const antes = { cfg: marca(path.join(raiz, 'docs', 'CONFIG.md')), sl: marca(path.join(raiz, 'servidor-local', 'workflows', '00-setup.json')) };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oferto-w1-'));
  try {
    execFileSync(process.execPath, [BUILD, '--out', path.join(tmp, 'cloud'), '--local-out', path.join(tmp, 'local')], { stdio: 'pipe' });
    assert.deepStrictEqual(fs.readdirSync(path.join(tmp, 'cloud')).sort(), Object.keys(cloud).sort());
    assert.deepStrictEqual(fs.readdirSync(path.join(tmp, 'local')).sort(), Object.keys(local).sort());
    const j = JSON.parse(fs.readFileSync(path.join(tmp, 'local', '00-setup.json'), 'utf8'));
    assert.strictEqual(j.id, 'wfSetup000000001');
    assert.ok(!('id' in JSON.parse(fs.readFileSync(path.join(tmp, 'cloud', '00-setup.json'), 'utf8'))));
    // Recusa escrever em servidor-local/ sem --release.
    assert.throws(() => execFileSync(process.execPath, [BUILD, '--out', path.join(tmp, 'c2'), '--local-out', path.join(raiz, 'servidor-local', 'workflows')], { stdio: 'pipe' }));
    assert.throws(() => execFileSync(process.execPath, [BUILD, '--out', path.join(raiz, 'servidor-local', 'x')], { stdio: 'pipe' }));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  assert.strictEqual(marca(path.join(raiz, 'docs', 'CONFIG.md')), antes.cfg);
  assert.strictEqual(marca(path.join(raiz, 'servidor-local', 'workflows', '00-setup.json')), antes.sl);
});

test('P1-03: package.json separa build e release', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.ok(!/servidor-local|--release/.test(pkg.scripts.build));
  assert.match(pkg.scripts.release, /--release/);
});

test('P1-03: preparar.sh só importa com PUBLICAR_WORKFLOWS=sim', () => {
  const sh = fs.readFileSync(path.join(__dirname, '..', 'servidor-local', 'preparar.sh'), 'utf8');
  const guarda = sh.indexOf('PUBLICAR_WORKFLOWS');
  assert.ok(guarda > 0 && guarda < sh.indexOf('import:workflow'), 'a checagem vem antes de importar');
});

test('P1-04: e2e usa porta própria e recusa a 5678', () => {
  const dir = path.join(__dirname, '..', 'teste-local');
  const rodar = fs.readFileSync(path.join(dir, 'rodar.sh'), 'utf8');
  assert.match(rodar, /N8N_TESTE_PORTA:-5690/);
  assert.match(rodar, /5678/); // checagem explícita
  const semComentarios = (s) => s.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  assert.ok(!/pkill/.test(semComentarios(rodar)), 'pkill pode matar o n8n de produção');
  assert.ok(!/pkill/.test(semComentarios(fs.readFileSync(path.join(dir, 'parar.sh'), 'utf8'))));
  assert.ok(!/build-workflows\.js(?![^\n]*--out)/.test(rodar), 'o e2e só faz build com --out');
  for (const f of ['tg.sh', 'cenarios.py', 'prep.js', 'parar.sh']) {
    assert.ok(!/127\.0\.0\.1:5678|localhost:5678/.test(fs.readFileSync(path.join(dir, f), 'utf8')), f + ' ainda fixa a porta 5678');
  }
});
