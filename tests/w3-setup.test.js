'use strict';
// P1-09: /setup <@canal> [título]. Respostas da Bot API simuladas (fixtures de teste).
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../lib/setup-canal');
const { montarConfig } = require('../lib/config');

function cfgBase(extra) {
  return montarConfig([
    { chave: 'admins', valor: '111' },
    { chave: 'bot_token', valor: 'TESTE' },
    { chave: 'bot_token_grupo', valor: 'TESTE2' },
    ...(extra || []),
  ]);
}
const msg = (texto, fromId) => ({ message_id: 1, from: { id: fromId == null ? 111 : fromId }, chat: { id: fromId == null ? 111 : fromId, type: 'private' }, text: texto });
const GETME = { ok: true, result: { id: 999, is_bot: true, username: 'oferto_pub_bot' } };
const CANAL = { ok: true, result: { id: -1001234567890, type: 'channel', title: 'Canal velho', username: 'ofertocasa' } };
const ADMIN_CANAL = { ok: true, result: { status: 'administrator', user: { id: 999 }, can_change_info: true, can_post_messages: true, can_edit_messages: true, can_invite_users: true } };

function ate3(cfg, texto, membro, chat, opts) {
  const r1 = S.iniciarSetupCanal(msg(texto), cfg, 'admin');
  assert.equal(r1.rota, 'setup_canal');
  const r2 = S.etapaDireitosSetupCanal(r1.estado, GETME);
  assert.deepEqual(r2.chamadas.map((c) => c.metodo), ['getChat', 'getChatMember']);
  assert.equal(r2.chamadas[1].payload.user_id, 999);
  return S.planoSetupCanal(r2.estado, [chat || CANAL, membro || ADMIN_CANAL], cfg, opts);
}

test('lerComandoSetupCanal: alvo e título', () => {
  assert.deepEqual(S.lerComandoSetupCanal('/setup @ofertocasa Ofertô Casa & Eletro'), { canal: '@ofertocasa', titulo: 'Ofertô Casa & Eletro' });
  assert.deepEqual(S.lerComandoSetupCanal('/setup@meubot -1001234567890'), { canal: -1001234567890, titulo: '' });
  assert.equal(S.lerComandoSetupCanal('/setup'), null);
  assert.equal(S.lerComandoSetupCanal('/setup   '), null);
  assert.equal(S.lerComandoSetupCanal('/setupx @ofertocasa'), null);
  // argumento presente mas alvo inválido: não cai no setup geral
  assert.deepEqual(S.lerComandoSetupCanal('/setup texto'), { canal: null, titulo: '', invalido: true });
  assert.deepEqual(S.lerComandoSetupCanal('/setup https://t.me/abc'), { canal: null, titulo: '', invalido: true });
  assert.deepEqual(S.lerComandoSetupCanal('/setup @abcd'), { canal: null, titulo: '', invalido: true }); // Telegram exige 5+
  assert.deepEqual(S.lerComandoSetupCanal('/setup @abcde'), { canal: '@abcde', titulo: '' });
});

test('alvo inválido: responde Uso, sem chamar o bot publicador', () => {
  const r = S.iniciarSetupCanal(msg('/setup https://t.me/abc'), cfgBase(), 'admin');
  assert.equal(r.rota, 'responder');
  assert.match(r.chamadas[0].payload.text, /^Uso: \/setup @canal/);
  assert.ok(!r.chamadas.some((c) => c.bot === 'grupo'));
});

test('descrição: canal_desc longo nunca corta o aviso #publi / afiliado', () => {
  for (const n of [1, 12, 13, 14, 16, 40]) {
    const cfg = cfgBase([{ chave: 'canal.casa', valor: '@ofertocasa' }, { chave: 'canal_desc.casa', valor: 'Casa e cozinha '.repeat(n) }]);
    const r = ate3(cfg, '/setup @ofertocasa');
    const d = r.chamadas.find((c) => c.metodo === 'setChatDescription').payload.description;
    assert.ok(d.length <= 255, `n=${n}: ${d.length}`);
    assert.match(d, /#publi/);
    assert.match(d, /Contém links de afiliado\.$/);
  }
});

test('getChatMember com erro transitório: só o erro, sem mandar adicionar admin', () => {
  const cfg = cfgBase();
  const r1 = S.iniciarSetupCanal(msg('/setup @ofertocasa'), cfg, 'admin');
  const r2 = S.etapaDireitosSetupCanal(r1.estado, GETME);
  const r = S.planoSetupCanal(r2.estado, [CANAL, { ok: false, error_code: 429, description: 'Too Many Requests: retry after 5' }], cfg);
  assert.equal(r.parar, true);
  const t = r.chamadas[0].payload.text;
  assert.match(t, /devagar/);
  assert.doesNotMatch(t, /Como resolver|Adicionar administrador/);
  assert.ok(!r.chamadas.some((c) => /^set|pin/.test(c.metodo)));
  // bot fora do canal: aí sim, instrução de adicionar
  const fora = S.planoSetupCanal(r2.estado, [CANAL, { ok: false, description: 'Bad Request: bot is not a member of the channel chat' }], cfg);
  assert.match(fora.chamadas[0].payload.text, /não está no canal/);
  assert.match(fora.chamadas[0].payload.text, /Adicionar administrador/);
});

test('convite opcional só em canal sem @ público (não em supergrupo)', () => {
  const sg = S.avaliarDireitosCanal({ id: -1, type: 'supergroup' }, { status: 'administrator', can_change_info: true, can_pin_messages: true });
  assert.deepEqual(sg.opcionais, []);
  const canalPriv = S.avaliarDireitosCanal({ id: -2, type: 'channel' }, Object.assign({}, ADMIN_CANAL.result, { can_invite_users: false }));
  assert.deepEqual(canalPriv.opcionais, ['can_invite_users']);
});

test('só admins do bot disparam o setup', () => {
  const cfg = cfgBase();
  const r = S.iniciarSetupCanal(msg('/setup @ofertocasa', 222), cfg, 'admin');
  assert.equal(r.rota, 'responder');
  assert.equal(r.chamadas.length, 1);
  assert.match(r.chamadas[0].payload.text, /Só admins/);
  assert.ok(!r.chamadas.some((c) => c.bot === 'grupo'));
  const ok = S.iniciarSetupCanal(msg('/setup @ofertocasa'), cfg, 'admin');
  assert.equal(ok.rota, 'setup_canal');
  assert.deepEqual(ok.chamadas.map((c) => c.metodo), ['getMe']);
});

test('getMe com falha para sem chamar mais nada', () => {
  const r1 = S.iniciarSetupCanal(msg('/setup @ofertocasa'), cfgBase(), 'admin');
  const r2 = S.etapaDireitosSetupCanal(r1.estado, { ok: false, error_code: 401, description: 'Unauthorized' });
  assert.equal(r2.parar, true);
  assert.equal(r2.chamadas.length, 0);
  assert.match(r2.erro, /token/);
});

test('canal: pin exige can_edit_messages (não can_pin_messages)', () => {
  const av = S.avaliarDireitosCanal(CANAL.result, Object.assign({}, ADMIN_CANAL.result, { can_edit_messages: false, can_pin_messages: true }));
  assert.equal(av.ok, false);
  assert.deepEqual(av.faltando, ['can_edit_messages']);
  const sg = S.avaliarDireitosCanal({ id: -100555, type: 'supergroup', title: 'G' }, { status: 'administrator', can_change_info: true, can_pin_messages: false, can_edit_messages: true });
  assert.deepEqual(sg.faltando, ['can_pin_messages']);
});

test('direitos faltando: instrução passo a passo e PARA sem configurar', () => {
  const cfg = cfgBase();
  const membro = { ok: true, result: { status: 'administrator', can_change_info: false, can_post_messages: false, can_edit_messages: true } };
  const r = ate3(cfg, '/setup @ofertocasa Novo título', membro);
  assert.equal(r.parar, true);
  assert.equal(r.chamadas.length, 1);
  assert.equal(r.chamadas[0].metodo, 'sendMessage');
  assert.equal(r.chamadas[0].bot, 'admin');
  const t = r.chamadas[0].payload.text;
  assert.match(t, /nada foi alterado/);
  assert.match(t, /can_change_info/);
  assert.match(t, /can_post_messages/);
  assert.match(t, /Administradores/);
  assert.match(t, /@oferto_pub_bot/);
  assert.ok(!r.chamadas.some((c) => /^set|pin/.test(c.metodo)));
});

test('bot não é admin ou chat não encontrado: para com motivo', () => {
  const cfg = cfgBase();
  const naoAdm = ate3(cfg, '/setup @ofertocasa', { ok: true, result: { status: 'member' } });
  assert.equal(naoAdm.parar, true);
  assert.match(naoAdm.chamadas[0].payload.text, /não é administrador/);
  const r1 = S.iniciarSetupCanal(msg('/setup @naoexiste'), cfg, 'admin');
  const r2 = S.etapaDireitosSetupCanal(r1.estado, GETME);
  const r3 = S.planoSetupCanal(r2.estado, [{ ok: false, error_code: 400, description: 'Bad Request: chat not found' }, { ok: false, description: 'Bad Request: chat not found' }], cfg);
  assert.equal(r3.parar, true);
  assert.match(r3.chamadas[0].payload.text, /canal não encontrado/);
});

test('chat privado: nunca configura', () => {
  const r = ate3(cfgBase(), '/setup @fulano Título', { ok: true, result: { status: 'member' } }, { ok: true, result: { id: 5, type: 'private', username: 'fulano' } });
  assert.equal(r.parar, true);
  assert.match(r.chamadas[0].payload.text, /chat privado/);
});

test('tudo ok com título informado: título, descrição ≤255, foto multipart e regras para fixar', () => {
  const cfg = cfgBase([{ chave: 'grupo_link', valor: 'https://t.me/ofertoavisos' }]);
  const r = ate3(cfg, '/setup @ofertocasa Ofertô Casa & Eletro', null, null, { foto: { binario: 'data' } });
  assert.equal(r.parar, false);
  assert.deepEqual(r.chamadas.map((c) => c.metodo), ['setChatTitle', 'setChatDescription', 'setChatPhoto', 'sendMessage']);
  assert.ok(r.chamadas.every((c) => c.bot === 'grupo' && c.payload.chat_id === -1001234567890));
  assert.equal(r.chamadas[0].payload.title, 'Ofertô Casa & Eletro');
  assert.ok(r.chamadas[1].payload.description.length <= 255);
  assert.match(r.chamadas[1].payload.description, /#publi · Contém links de afiliado\.$/);
  assert.deepEqual(r.chamadas[2].multipart, { campo: 'photo', binario: 'data', mime: 'image/jpeg', nome: 'canal.jpg', origem: 'render' });
  const fix = r.chamadas[3];
  assert.equal(fix.ref.fixar, true);
  assert.match(fix.payload.text, /https:\/\/t\.me\/ofertoavisos/);
  assert.match(fix.payload.text, /programas de afiliados/);
  assert.match(fix.payload.text, /Como Associado da Amazon, ganhamos com compras qualificadas\./);
});

test('sem título e sem categoria: não troca o título; sem render: sem foto', () => {
  const r = ate3(cfgBase(), '/setup @ofertocasa');
  assert.deepEqual(r.chamadas.map((c) => c.metodo), ['setChatDescription', 'sendMessage']);
  assert.doesNotMatch(r.chamadas[1].payload.text, /Avisos e conversa/); // sem grupo_link, sem link inventado
});

test('categoria configurada para o canal: título da categoria', () => {
  const cfg = cfgBase([{ chave: 'canal.casa', valor: '@ofertocasa' }]);
  const r = ate3(cfg, '/setup @OfertoCasa');
  assert.equal(r.chamadas[0].metodo, 'setChatTitle');
  assert.ok(r.chamadas[0].payload.title.length > 0 && r.chamadas[0].payload.title.length <= 128);
  assert.equal(r.estado.categoria, 'casa');
});

test('cortarTextoSeguro: ≤ limite, sem partir emoji', () => {
  const longo = 'Ofertas reais '.repeat(30) + '🔥🔥🔥';
  const c = S.cortarTextoSeguro(longo, 255);
  assert.ok(c.length <= 255);
  assert.ok(c.endsWith('…'));
  const emoji = 'a'.repeat(253) + '🔥🔥';
  const e = S.cortarTextoSeguro(emoji, 255);
  assert.ok(e.length <= 255);
  assert.doesNotThrow(() => encodeURIComponent(e)); // par substituto quebrado lança URIError
  assert.equal(S.cortarTextoSeguro('curto', 255), 'curto');
});

test('rodada 4 e resumo: fixa a mensagem enviada e traduz erros', () => {
  const r = ate3(cfgBase(), '/setup @ofertocasa Título');
  const resp = r.chamadas.map((c) => (c.metodo === 'sendMessage' ? { ok: true, result: { message_id: 77 } } : c.metodo === 'setChatTitle' ? { ok: false, description: 'Bad Request: chat title is not modified' } : { ok: false, description: 'Bad Request: not enough rights to change chat description' }));
  const pin = S.fixarSetupCanal(r.estado, r.chamadas, resp);
  assert.equal(pin.length, 1);
  assert.equal(pin[0].metodo, 'pinChatMessage');
  assert.deepEqual(pin[0].payload, { chat_id: -1001234567890, message_id: 77, disable_notification: true });
  const fim = S.resumoSetupCanal(r.estado, r.chamadas.concat(pin), resp.concat([{ ok: true, result: true }]));
  assert.equal(fim.ok, false);
  const t = fim.chamadas[0].payload.text;
  assert.match(t, /título: já estava assim/);
  assert.match(t, /descrição: falta permissão/);
  assert.match(t, /fixar regras: ok/);
  assert.match(t, /foto: pulada/);
});

test('erroSetupCanal traduz os erros comuns', () => {
  assert.match(S.erroSetupCanal('Bad Request: chat not found'), /canal não encontrado/);
  assert.match(S.erroSetupCanal('Unauthorized'), /token/);
  assert.match(S.erroSetupCanal('Too Many Requests: retry after 5'), /devagar/);
  assert.equal(S.erroSetupCanal('Bad Request: chat description is not modified'), null);
});

test('lib/setup-canal.js segue a convenção da lib: sem pacotes externos nem I/O', () => {
  const src = require('node:fs').readFileSync(require.resolve('../lib/setup-canal'), 'utf8');
  for (const m of src.matchAll(/require\('([^']+)'\)/g)) assert.match(m[1], /^\.\//);
  assert.doesNotMatch(src, /\bfetch\(|https?\.request|child_process|fs\./);
});
