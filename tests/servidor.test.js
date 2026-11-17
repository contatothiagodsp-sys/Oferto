'use strict';
// Confiabilidade do servidor local: saúde do webhook, túnel, segredo e publicação que falha.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lib');

const AGORA = new Date('2026-11-27T12:00:00Z').getTime();
const MIN = 60000;
const URL_WH = 'https://abc.trycloudflare.com/webhook/telegram-ofertas';

function cfgTeste(extra) {
  return L.montarConfig([
    { chave: 'admins', valor: '111, 222' },
    { chave: 'bot_token', valor: 'TOKEN_ADMIN' },
    { chave: 'bot_token_grupo', valor: 'TOKEN_GRUPO' },
    { chave: 'grupo_id', valor: '-1001234567890' },
    { chave: 'webhook_secret', valor: 'segredo' },
    { chave: 'n8n_webhook_url', valor: URL_WH },
    { chave: 'topico.casa', valor: '10' },
    { chave: 'amazon.tag.casa_tg', valor: 'm-tg-20' }, { chave: 'amazon.tag.casa_wac', valor: 'm-wac-20' },
    { chave: 'amazon.tag.casa_wag', valor: 'm-wag-20' }, { chave: 'amazon.tag.casa_x', valor: 'm-x-20' },
  ].concat(extra || []));
}

const info = (extra) => ({ ok: true, result: Object.assign({ url: URL_WH, has_custom_certificate: false, pending_update_count: 0 }, extra) });

test('saúde: consulta os dois bots; sem token não consulta nada', () => {
  assert.deepEqual(L.saudeChamadas(cfgTeste()).map((c) => `${c.bot}.${c.metodo}`), ['admin.getWebhookInfo', 'grupo.getWebhookInfo']);
  assert.equal(L.saudeChamadas(L.montarConfig([{ chave: 'bot_token', valor: 'SO_UM' }])).length, 1); // um bot só
  assert.deepEqual(L.saudeChamadas(L.montarConfig([])), []);
  const r = L.avaliarSaude([], [], L.montarConfig([]), AGORA);
  assert.deepEqual([r.resposta.ok, r.chamadas.length, r.linhas.length], [true, 0, 0]);
});

test('saúde: detecta erro recente, fila, URL diferente e token inválido', () => {
  const cfg = cfgTeste();
  const ch = L.saudeChamadas(cfg);
  const tipos = (resp) => L.problemasSaude(ch, resp, cfg, AGORA).map((p) => p.tipo);
  assert.deepEqual(tipos([info(), info()]), []);
  // erro há 5 min conta; há 30 min já não conta
  assert.deepEqual(tipos([info({ last_error_date: (AGORA - 5 * MIN) / 1000, last_error_message: 'Connection timed out' }), info()]), ['erro_admin']);
  assert.deepEqual(tipos([info({ last_error_date: (AGORA - 30 * MIN) / 1000 }), info()]), []);
  assert.deepEqual(tipos([info({ pending_update_count: 21 }), info({ pending_update_count: 20 })]), ['fila_admin']);
  assert.deepEqual(tipos([info(), info({ url: 'https://outro.trycloudflare.com/webhook/telegram-ofertas' })]), ['url_grupo']);
  assert.deepEqual(tipos([info(), info({ url: '' })]), ['url_grupo']);
  assert.deepEqual(tipos([{ ok: false, error_code: 401, description: 'Unauthorized' }, info()]), ['token_admin']);
  assert.deepEqual(tipos([info(), { error: { message: 'ECONNRESET' } }]), ['api_grupo']);
  const texto = L.problemasSaude(ch, [info({ last_error_date: (AGORA - 3 * MIN) / 1000, last_error_message: 'Wrong response from the webhook: 502 Bad Gateway' }), info()], cfg, AGORA)[0].texto;
  assert.match(texto, /há 3 min/);
  assert.match(texto, /502 Bad Gateway/);
});

test('saúde: 1 alerta por tipo a cada 60 min e aviso quando resolve', () => {
  const ch = L.saudeChamadas(cfgTeste());
  const ruim = [info({ last_error_date: (AGORA - MIN) / 1000, last_error_message: 'timeout' }), info()];
  // 1ª vez: alerta os 2 admins e grava o estado
  const r1 = L.avaliarSaude(ch, ruim, cfgTeste(), AGORA);
  assert.equal(r1.chamadas.length, 2);
  assert.match(r1.chamadas[0].payload.text, /problema no bot/);
  assert.equal(r1.linhas[0].chave, 'saude.ultimo_alerta');
  assert.deepEqual(r1.resposta, { ok: true, problemas: ['erro_admin'], avisos: 1 });
  const estado1 = r1.linhas[0].valor;

  // 5 min depois, mesmo problema: silêncio e estado igual (não grava)
  const cfg2 = cfgTeste([{ chave: 'saude.ultimo_alerta', valor: estado1 }]);
  const r2 = L.avaliarSaude(ch, [info({ last_error_date: (AGORA + 4 * MIN) / 1000 }), info()], cfg2, AGORA + 5 * MIN);
  assert.deepEqual([r2.chamadas.length, r2.linhas.length], [0, 0]);

  // 61 min depois do 1º alerta, ainda com problema: alerta de novo, guardando o "desde"
  const r3 = L.avaliarSaude(ch, [info({ last_error_date: (AGORA + 60 * MIN) / 1000 }), info()], cfg2, AGORA + 61 * MIN);
  assert.equal(r3.chamadas.length, 2);
  const e3 = JSON.parse(r3.linhas[0].valor);
  assert.deepEqual([e3.erro_admin.desde, e3.erro_admin.alerta], [AGORA, AGORA + 61 * MIN]);

  // outro problema aparece no meio: alerta só o novo
  const r4 = L.avaliarSaude(ch, [ruim[0], info({ pending_update_count: 50 })], cfg2, AGORA + 5 * MIN);
  assert.equal(r4.chamadas.length, 2);
  assert.doesNotMatch(r4.chamadas[0].payload.text, /timeout/);
  assert.match(r4.chamadas[0].payload.text, /50 atualizações/);

  // resolvido: avisa e limpa o estado
  const r5 = L.avaliarSaude(ch, [info(), info()], cfg2, AGORA + 20 * MIN);
  assert.equal(r5.chamadas.length, 2);
  assert.match(r5.chamadas[0].payload.text, /resolvido/);
  assert.match(r5.chamadas[0].payload.text, /timeout/);
  assert.deepEqual(r5.linhas, [{ chave: 'saude.ultimo_alerta', valor: '{}' }]);

  // tudo ok e estado vazio: nada
  const r6 = L.avaliarSaude(ch, [info(), info()], cfgTeste([{ chave: 'saude.ultimo_alerta', valor: '{}' }]), AGORA);
  assert.deepEqual([r6.chamadas.length, r6.linhas.length, r6.resposta.ok], [0, 0, true]);

  // token do bot de aprovação inválido: o alerta não chega pelo Telegram → resposta ok:false (o vigia avisa o healthchecks.io)
  const r7 = L.avaliarSaude(ch, [{ ok: false, error_code: 401, description: 'Unauthorized' }, info()], cfgTeste(), AGORA);
  assert.equal(r7.resposta.ok, false);

  // estado corrompido não quebra
  assert.deepEqual(L.lerEstadoSaude('{x'), {});
  assert.deepEqual(L.lerEstadoSaude('[1]'), {});
  assert.equal(cfgTeste([{ chave: 'saude.ultimo_alerta', valor: 'lixo' }]).saude.estado.constructor, Object);
});

test('túnel: só trycloudflare, ngrok ou o domínio de tunel.dominio', () => {
  const ok = (u, d) => L.validarUrlTunel(u, d).ok;
  assert.deepEqual(L.validarUrlTunel('https://Abc-Def.trycloudflare.com/', ''), { ok: true, base: 'https://abc-def.trycloudflare.com', erro: '' });
  assert.ok(ok('https://meu-bot.ngrok-free.app'));
  assert.ok(ok('https://meu-bot.ngrok.app'));
  assert.ok(ok('https://meu-bot.ngrok-free.dev'));
  assert.ok(!ok('http://abc.trycloudflare.com'));
  assert.ok(!ok('https://abc.trycloudflare.com.evil.com'));
  assert.ok(!ok('https://evil.com/abc.trycloudflare.com'));
  assert.ok(!ok('https://a.b.trycloudflare.com'));
  assert.ok(!ok('https://bot.oferto.com.br'));
  assert.ok(ok('https://bot.oferto.com.br', 'bot.oferto.com.br'));
  assert.ok(ok('https://bot.oferto.com.br', 'https://oferto.com.br/'));
  assert.ok(ok('https://bot.oferto.com.br', '*.oferto.com.br'));
  assert.ok(!ok('https://bot.oferto.com.br.evil.com', 'oferto.com.br'));
  assert.ok(!ok('https://xoferto.com.br', 'oferto.com.br'));
  assert.ok(!ok('', 'oferto.com.br'));
  assert.equal(L.montarConfig([{ chave: 'tunel.dominio', valor: 'bot.oferto.com.br' }]).tunel.dominio, 'bot.oferto.com.br');
});

test('segurança: sem webhook_secret o update é recusado', () => {
  const cfg = cfgTeste([{ chave: 'webhook_secret', valor: '' }]);
  const u = { message: { text: '/id', chat: { id: 1, type: 'private' }, from: { id: 1 } } };
  assert.equal(L.classificarUpdate(u, {}, cfg, AGORA).rota, 'ignorar');
  assert.equal(L.classificarUpdate(u, { 'x-telegram-bot-api-secret-token': '' }, cfg, AGORA).rota, 'ignorar');
  assert.equal(L.classificarUpdate(u, { 'x-telegram-bot-api-secret-token': 'segredo' }, cfgTeste(), AGORA).rota, 'responder');
});

test('setWebhook não descarta as atualizações guardadas pelo Telegram', () => {
  const sw = L.setupChamadas(cfgTeste()).chamadas.filter((c) => c.metodo === 'setWebhook');
  assert.equal(sw.length, 2);
  assert.ok(sw.every((c) => c.payload.drop_pending_updates === false));
});

test('publicação: post que não saiu nem no reenvio marca falha e avisa', () => {
  const cfg = cfgTeste();
  const H = { 'x-telegram-bot-api-secret-token': 'segredo' };
  const cls = L.classificarUpdate({ message: { text: '/oferta casa\nhttps://www.amazon.com.br/dp/B0ABCDEF12\nT\npreço 10\nref90 12 f', chat: { id: 111, type: 'private' }, from: { id: 111 } } }, H, cfg, AGORA);
  const av = L.avaliarNovaOferta(cls, [], cfg);
  const dec = L.decidirCallback({ acao: 'a', oferta_id: av.oferta.oferta_id, callback_id: 'q', chat_id: 111, message_id: 9, user_id: 111, ts: AGORA }, [av.oferta], cfg);
  assert.equal(dec.update.status, 'publicando');
  const pub = L.prepararPublicacao(dec.oferta, dec.linkItens, cfg, { ts: AGORA, chat_id: 111, message_id: 9 });
  const barrado = { ok: false, error_code: 429, description: 'Too Many Requests: retry after 2', parameters: { retry_after: 2 } };
  const resp = pub.chamadas.map((c) => (c.bot === 'grupo' ? barrado : { ok: true, result: { message_id: 1 } }));
  // 1º 429 → reenvio também barrado
  const lim = L.limiteTelegram(pub.chamadas, resp);
  assert.equal(lim.indices.length, 1);
  const res = L.resultadoChamadas(pub.chamadas, L.juntarReenvio(resp, lim, [barrado]), cfg, AGORA);
  assert.deepEqual(res.update, { oferta_id: av.oferta.oferta_id, status: 'falha' });
  assert.deepEqual(L.colunasInvalidas('bfx_ofertas', res.update), []);
  assert.equal(res.posts.length, 0);
  assert.ok(res.alertas.some((c) => c.metodo === 'editMessageReplyMarkup' && c.payload.message_id === 9));
  assert.equal(res.alertas.filter((c) => /NÃO saiu no grupo/.test(c.payload.text || '')).length, 2);
  // reenvio deu certo: sem falha
  const ok = L.resultadoChamadas(pub.chamadas, L.juntarReenvio(resp, lim, [{ ok: true, result: { message_id: 5 } }]), cfg, AGORA);
  assert.equal(ok.update, null);
  assert.equal(ok.posts.length, 1);
});
