'use strict';
// oferto-render: sidecar interno (rede do compose, sem porta publicada).
//   POST /render {template?, oferta|itens, usar_foto?} -> image/jpeg 1080x1080 (em memória)
//   GET  /health -> {ok:true}
// O SVG vem de lib/imagem.js (função pura); aqui só baixamos fotos (allowlist), validamos
// a resolução mínima (Q-32: 600 px no lado menor) e rasterizamos com sharp. Nada vai para o disco.

const path = require('path');
// Só a fonte embutida (Linux/fontconfig). Precisa ser definido antes de carregar o sharp.
if (!process.env.FONTCONFIG_FILE) process.env.FONTCONFIG_FILE = path.join(__dirname, 'fonts', 'fonts.conf');

const http = require('http');
const sharp = require('sharp');
const { baixarFoto, ErroRender, hostsPermitidos } = require('./baixar');

function carregarLibImagem() {
  const tentativas = [path.join(__dirname, 'lib', 'imagem.js'), path.join(__dirname, '..', 'lib', 'imagem.js')];
  for (const p of tentativas) {
    try {
      return require(p);
    } catch (e) {
      if (e.code !== 'MODULE_NOT_FOUND') throw e;
    }
  }
  throw new Error('lib/imagem.js não encontrado (copie para render/lib/ ou rode a partir do repositório)');
}

const imagem = carregarLibImagem();
sharp.cache(false);

const LIMITE_PIXELS_FOTO = 50 * 1000 * 1000;

function configDoAmbiente(env) {
  const e = env || process.env;
  const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return {
    porta: num(e.PORT, 8080),
    host: e.HOST || '0.0.0.0',
    minLado: num(e.RENDER_MIN_LADO, 600),
    timeoutMs: num(e.RENDER_TIMEOUT_MS, 8000),
    maxBytesFoto: num(e.RENDER_MAX_BYTES, 8 * 1024 * 1024),
    maxCorpo: num(e.RENDER_MAX_CORPO, 64 * 1024),
    maxSimultaneos: num(e.RENDER_MAX_SIMULTANEOS, 4),
    qualidade: Math.min(95, num(e.RENDER_QUALIDADE_JPEG, 88)),
    hosts: hostsPermitidos(e.RENDER_HOSTS_EXTRA),
  };
}

/** Confere a resolução e reduz a foto ao tamanho do slot. Retorna data URI JPEG. */
async function prepararFoto(buf, slot, minLado) {
  let meta;
  try {
    meta = await sharp(buf, { limitInputPixels: LIMITE_PIXELS_FOTO }).metadata();
  } catch (_) {
    throw new ErroRender('foto_invalida', 'não foi possível ler a foto');
  }
  const ori = meta.autoOrient || meta;
  const w = ori.width;
  const h = ori.height;
  if (!w || !h) throw new ErroRender('foto_invalida', 'foto sem dimensões');
  if (Math.min(w, h) < minLado) throw new ErroRender('foto_pequena', `foto ${w}x${h}: mínimo ${minLado} px no lado menor`);
  let out;
  try {
    out = await sharp(buf, { limitInputPixels: LIMITE_PIXELS_FOTO })
      .rotate()
      .resize({ width: slot.w, height: slot.h, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#FFFFFF' })
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch (_) {
    throw new ErroRender('foto_invalida', 'falha ao processar a foto');
  }
  return 'data:image/jpeg;base64,' + out.toString('base64');
}

function semFoto(o) {
  if (!o || typeof o !== 'object') return o;
  const c = Object.assign({}, o);
  delete c.foto; // a foto embutida só é produzida aqui; nunca vem de fora
  return c;
}

/**
 * Monta a arte e rasteriza. deps: { baixar(url) -> Promise<Buffer> }.
 * Retorna { jpeg, arte }. Lança ErroRender (422/400) ou imagem.ErroArte.
 */
async function renderizar(corpo, cfg, deps) {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw new ErroRender('entrada_invalida', 'corpo deve ser um objeto JSON', 400);
  const usarFoto = imagem.usarFotoProduto(corpo.usar_foto);
  const entrada = { template: corpo.template, categoria: corpo.categoria, usar_foto: usarFoto };
  if (corpo.oferta && corpo.itens) throw new ErroRender('entrada_invalida', 'envie oferta OU itens, não os dois', 400);
  if (corpo.oferta) entrada.oferta = semFoto(corpo.oferta);
  else if (Array.isArray(corpo.itens)) entrada.itens = corpo.itens.map(semFoto);
  else throw new ErroRender('entrada_invalida', 'faltou oferta ou itens', 400);

  if (usarFoto) {
    const alvos = entrada.oferta ? [entrada.oferta] : entrada.itens;
    const slots = imagem.slotsFotoArte(entrada); // valida 1..6 itens
    alvos.forEach((a, i) => {
      if (!a || typeof a !== 'object' || !a.imagem) throw new ErroRender('foto_ausente', 'item ' + i + ' sem URL de imagem (usar_foto=sim)');
    });
    const fotos = await Promise.all(alvos.map(async (a, i) => prepararFoto(await deps.baixar(a.imagem), slots[i], cfg.minLado)));
    alvos.forEach((a, i) => { a.foto = fotos[i]; });
  }

  const arte = imagem.montarArte(entrada);
  const { data, info } = await sharp(Buffer.from(arte.svg, 'utf8'))
    .flatten({ background: '#FFFFFF' })
    .jpeg({ quality: cfg.qualidade, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  if (info.width !== imagem.LADO_ARTE || info.height !== imagem.LADO_ARTE) {
    throw new ErroRender('render_falhou', `dimensão inesperada ${info.width}x${info.height}`, 500);
  }
  return { jpeg: data, arte };
}

function responderJson(res, status, obj) {
  const corpo = Buffer.from(JSON.stringify(obj));
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': corpo.length, 'cache-control': 'no-store' });
  res.end(corpo);
}

function lerCorpo(req, limite) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let total = 0;
    let estourou = false;
    req.on('data', (c) => {
      if (estourou) return;
      total += c.length;
      if (total > limite) {
        estourou = true;
        reject(new ErroRender('corpo_grande_demais', 'corpo acima de ' + limite + ' bytes', 413));
        return;
      }
      partes.push(c);
    });
    req.on('end', () => { if (!estourou) resolve(Buffer.concat(partes)); });
    req.on('error', reject);
  });
}

/** Cria o servidor HTTP. opts: { cfg?, baixar?(url) -> Promise<Buffer>, log? }. */
function criarServidor(opts) {
  const o = opts || {};
  const cfg = Object.assign(configDoAmbiente(), o.cfg || {});
  const log = o.log || ((m) => console.log(new Date().toISOString() + ' ' + m));
  const baixar = o.baixar || (async (url) => (await baixarFoto(url, { hosts: cfg.hosts, timeoutMs: cfg.timeoutMs, maxBytes: cfg.maxBytesFoto })).buffer);
  let ativos = 0;

  const servidor = http.createServer(async (req, res) => {
    const rota = (req.url || '').split('?')[0];
    if (rota === '/health') {
      if (req.method !== 'GET' && req.method !== 'HEAD') return responderJson(res, 405, { ok: false, erro: 'metodo_nao_permitido' });
      return responderJson(res, 200, { ok: true, servico: 'oferto-render', sharp: sharp.versions.sharp, ativos });
    }
    if (rota !== '/render') return responderJson(res, 404, { ok: false, erro: 'rota_inexistente' });
    if (req.method !== 'POST') return responderJson(res, 405, { ok: false, erro: 'metodo_nao_permitido' });
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) {
      req.resume();
      return responderJson(res, 415, { ok: false, erro: 'content_type_invalido', detalhe: 'use application/json', revisao: true });
    }
    if (ativos >= cfg.maxSimultaneos) {
      req.resume();
      return responderJson(res, 503, { ok: false, erro: 'ocupado', detalhe: 'renders simultâneos demais', revisao: false });
    }
    ativos++;
    const t0 = Date.now();
    try {
      const bruto = await lerCorpo(req, cfg.maxCorpo);
      let corpo;
      try {
        corpo = JSON.parse(bruto.toString('utf8'));
      } catch (_) {
        throw new ErroRender('json_invalido', 'JSON inválido', 400);
      }
      const { jpeg, arte } = await renderizar(corpo, cfg, { baixar });
      res.writeHead(200, {
        'content-type': 'image/jpeg',
        'content-length': jpeg.length,
        'cache-control': 'no-store',
        'x-oferto-template': arte.template,
        'x-oferto-layout': arte.layout,
        'x-oferto-sensivel': arte.sensivel ? '1' : '0',
        'x-oferto-com-foto': arte.com_foto ? '1' : '0',
      });
      res.end(jpeg);
      log(`render ok ${arte.template} ${arte.layout} ${jpeg.length}B ${Date.now() - t0}ms`);
    } catch (e) {
      const codigo = (e && e.codigo) || 'erro_interno';
      let status = e instanceof ErroRender ? e.status : e && e.name === 'ErroArte' ? 400 : 500;
      if (codigo === 'foto_ausente') status = 422;
      log(`render erro ${status} ${codigo}: ${e && e.message}`);
      if (status === 413) res.setHeader('connection', 'close');
      responderJson(res, status, { ok: false, erro: codigo, detalhe: status === 500 ? 'erro interno' : String(e.message || codigo), revisao: true });
    } finally {
      ativos--;
    }
  });
  servidor.requestTimeout = 30000;
  servidor.headersTimeout = 10000;
  return servidor;
}

if (require.main === module) {
  const cfg = configDoAmbiente();
  const s = criarServidor({ cfg });
  s.listen(cfg.porta, cfg.host, () => console.log(`oferto-render ouvindo em ${cfg.host}:${cfg.porta} (sharp ${sharp.versions.sharp})`));
  const parar = () => s.close(() => process.exit(0));
  process.on('SIGTERM', parar);
  process.on('SIGINT', parar);
}

module.exports = { criarServidor, renderizar, prepararFoto, configDoAmbiente };
