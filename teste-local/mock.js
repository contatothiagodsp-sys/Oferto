// Servidor falso da Bot API do Telegram e da Shopee Affiliate API (para teste local).
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const LOG = process.argv[2] || require('path').join(__dirname, 'tmp', 'mock-log.jsonl');
const SHOPEE_APP = '123456', SHOPEE_SECRET = 'segredo-shopee';
let msgId = 100, thread = 500, fixada = null;

function resultado(metodo, p) {
  switch (metodo) {
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
    if (m) {
      const p = body ? JSON.parse(body) : {};
      fs.appendFileSync(LOG, JSON.stringify({ api: 'telegram', token: m[1], metodo: m[2], payload: p }) + '\n');
      if (m[2] === 'sendPhoto' && String(p.photo).includes('quebrada')) saida = { ok: false, error_code: 400, description: 'Bad Request: wrong file identifier/HTTP URL specified' };
      else saida = { ok: true, result: resultado(m[2], p) };
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
