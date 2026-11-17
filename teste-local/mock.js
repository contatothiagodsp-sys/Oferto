// Servidor falso da Bot API do Telegram, da Shopee Affiliate API e da Keepa (para teste local).
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const LOG = process.argv[2] || require('path').join(__dirname, 'tmp', 'mock-log.jsonl');
const SHOPEE_APP = '123456', SHOPEE_SECRET = 'segredo-shopee';
let msgId = 100, thread = 500, fixada = null, barrar = 0;
// getWebhookInfo: URL registrada por token e erro de entrega simulável (/mock/erro-webhook/on|off).
const webhooks = {};
let erroWebhook = false;
// Resposta da Keepa (GET /product) confirmada no SDK oficial keepacom/api_backend.
const KEEPA = {"tokensLeft":1180,"refillIn":2400,"tokensConsumed":1,"products":[{"asin":"B0TESTE123","domainId":12,"title":"Air Fryer 4L","images":[{"l":"71abcXYZ.jpg","m":"41abcXYZ.jpg"}],"lastUpdate":8351280,"stats":{"current":[29990,28990,-1,-1,49990,-1,-1,-1,-1,-1,-1,7,0,0,0,-1,46,1200,28990],"minInInterval":[[8285220,27990],[8285220,27490],null,null,[8285220,49990],null,null,null,null,null,null,null,null,null,null,null,null,null,[8285220,27990]]}}]};

function resultado(metodo, p, token) {
  switch (metodo) {
    case 'setWebhook': webhooks[token] = p.url; return true;
    case 'getWebhookInfo': return Object.assign({ url: webhooks[token] || '', has_custom_certificate: false, pending_update_count: 0 },
      erroWebhook ? { last_error_date: Math.floor(Date.now() / 1000) - 60, last_error_message: 'Wrong response from the webhook: 502 Bad Gateway' } : {});
    case 'getMe': return { id: 1, is_bot: true, username: 'teste_bot' };
    case 'getChat': return Object.assign({ id: p.chat_id, title: 'Grupo Teste', type: 'supergroup', is_forum: true }, fixada ? { pinned_message: { message_id: fixada } } : {});
    case 'pinChatMessage': fixada = p.message_id; return true;
    case 'createForumTopic': return { message_thread_id: ++thread, name: p.name };
    case 'createChatInviteLink': return { invite_link: 'https://t.me/+CONVITE' + (p.name || ''), name: p.name };
    case 'sendMessage': case 'sendPhoto': return { message_id: ++msgId, chat: { id: p.chat_id }, message_thread_id: p.message_thread_id };
    default: return true;
  }
}

http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    let saida;
    const m = req.url.match(/^\/bot([^/]+)\/(\w+)/);
    if (req.url.startsWith('/mock/barrar')) { barrar = Number(req.url.split('/')[3] || 1); res.end('ok'); return; }
    if (req.url.startsWith('/mock/erro-webhook/')) { erroWebhook = req.url.endsWith('/on'); res.end('ok'); return; }
    if (req.url.startsWith('/product?')) {
      // Keepa: GET /product?key=K&domain=12&asin=X&stats=90&history=0. ASIN B0SEMTOKEN = sem tokens (429).
      const q = new URL(req.url, 'http://mock').searchParams;
      const asin = q.get('asin');
      fs.appendFileSync(LOG, JSON.stringify({ api: 'keepa', key: q.get('key'), asin, domain: q.get('domain'), stats: q.get('stats'), buybox: q.get('buybox') }) + '\n');
      let status = 200;
      if (q.get('key') !== 'teste') { status = 400; saida = { error: { type: 'invalidKey', message: 'Invalid key' } }; }
      else if (asin === 'B0SEMTOKEN') { status = 429; saida = { tokensLeft: -3, refillIn: 120000, refillRate: 20, tokensConsumed: 0 }; }
      else {
        saida = JSON.parse(JSON.stringify(KEEPA));
        saida.products[0].asin = asin;
      }
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(saida));
      return;
    }
    if (m) {
      const p = body ? JSON.parse(body) : {};
      fs.appendFileSync(LOG, JSON.stringify({ api: 'telegram', token: m[1], metodo: m[2], payload: p }) + '\n');
      if (barrar > 0 && m[1] === 'TOKGRUPO' && ['sendMessage', 'sendPhoto'].includes(m[2])) { barrar--; saida = { ok: false, error_code: 429, description: 'Too Many Requests: retry after 2', parameters: { retry_after: 2 } }; }
      else if (m[2] === 'sendPhoto' && String(p.photo).includes('quebrada')) saida = { ok: false, error_code: 400, description: 'Bad Request: wrong file identifier/HTTP URL specified' };
      else saida = { ok: true, result: resultado(m[2], p, m[1]) };
    } else if (req.url === '/graphql') {
      const auth = req.headers.authorization || '';
      const mm = auth.match(/Credential=(\w+), Timestamp=(\d+), Signature=(\w+)/);
      const esperado = mm && crypto.createHash('sha256').update(mm[1] + mm[2] + body + SHOPEE_SECRET).digest('hex');
      const valido = mm && mm[1] === SHOPEE_APP && mm[3] === esperado;
      const q = JSON.parse(body);
      fs.appendFileSync(LOG, JSON.stringify({ api: 'shopee', valido, variables: q.variables }) + '\n');
      if (!valido) saida = { errors: [{ message: 'Invalid Signature' }] };
      else if (q.query.includes('generateShortLink')) saida = { data: { generateShortLink: { shortLink: 'https://s.shopee.com.br/' + q.variables.subIds.join('-') } } };
      else saida = { data: { productOfferV2: { nodes: [
        { itemId: 1, shopId: 9, productName: q.variables.keyword + ' A', priceMin: '99.90', priceMax: '199.90', priceDiscountRate: 50, commissionRate: '0.08', sales: 900, ratingStar: '4.8', imageUrl: 'https://img/1.jpg', productLink: 'https://shopee.com.br/product/9/1' },
        { itemId: 2, shopId: 9, productName: q.variables.keyword + ' B', priceMin: '49.90', priceMax: '52.90', priceDiscountRate: 5, commissionRate: '0.08', sales: 900, ratingStar: '4.8', imageUrl: 'https://img/2.jpg', productLink: 'https://shopee.com.br/product/9/2' },
      ], pageInfo: { page: 1, limit: 20, hasNextPage: false } } } };
    } else {
      saida = { ok: false, description: 'rota desconhecida' };
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(saida));
  });
}).listen(8787, () => console.log('mock em :8787'));
