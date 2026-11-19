'use strict';
// Download da foto do produto com proteção contra SSRF: só HTTPS, só hosts de imagem
// das lojas da whitelist, redirecionamentos revalidados, timeout e limite de bytes.
// Tudo em memória (Buffer). Nada é gravado em disco.

/** Domínios de imagem permitidos (casa o próprio domínio e subdomínios). */
const HOSTS_FOTO_PADRAO = [
  'mlstatic.com', // Mercado Livre (http2.mlstatic.com)
  'media-amazon.com', // Amazon (m.media-amazon.com)
  'images-amazon.com', // Amazon (images-na.ssl-images-amazon.com e afins)
  'ssl-images-amazon.com',
  'susercontent.com', // Shopee (down-br.img.susercontent.com)
  'shopee.com.br', // Shopee (cf.shopee.com.br)
  'mlcdn.com.br', // Magalu (a-static.mlcdn.com.br)
  'magazineluiza.com.br', // Magalu
  'kabum.com.br', // KaBuM! (images.kabum.com.br)
  'terabyteshop.com.br', // Terabyte (img.terabyteshop.com.br)
  'pichau.com.br', // Pichau (media.pichau.com.br)
  'ltwebstatic.com', // Shein (img.ltwebstatic.com)
  'nike.com.br', // Nike (imgnike-a.akamaihd.net / images.nike.com)
  'nike.com',
  'akamaihd.net',
  'adidas.com', // Adidas (assets.adidas.com)
  'centauro.com.br', // Centauro (imgcentauro-a.akamaihd.net)
  'netshoes.com.br', // Netshoes (static.netshoes.com.br)
  'fastshop.com.br', // Fast Shop
  'casasbahia.com.br', // Casas Bahia
  'casasbahia-imagens.com.br',
  'extra-imagens.com.br',
  'pontofrio-imagens.com.br',
  'vteximg.com.br', // Lojas VTEX (Boticário, Natura, Droga Raia, Beleza na Web, UMusic Store, etc.)
  'vtexassets.com',
  'mitiendanube.com', // Nuvemshop (K-Line Store, Hopescolor, Asiatic Store, etc.)
  'cdn.shopify.com', // Shopify (Kpopmerch)
  'phinf.pstatic.net', // Weverse Shop CDN
  'ktown4u.com',
  'res.cloudinary.com',
  'zst.com.br', // Catálogo oficial Zoom/Buscapé (i.zst.com.br)
];

class ErroRender extends Error {
  constructor(codigo, detalhe, status) {
    super(detalhe || codigo);
    this.name = 'ErroRender';
    this.codigo = codigo;
    this.status = status || 422;
  }
}

/** Lista final de hosts: padrão + RENDER_HOSTS_EXTRA (separados por vírgula). */
function hostsPermitidos(extra) {
  const add = String(extra || '').split(',').map((s) => s.trim().toLowerCase().replace(/^\.+|\.+$/g, '')).filter(Boolean);
  return Array.from(new Set(HOSTS_FOTO_PADRAO.concat(add)));
}

function ehIpLiteral(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':') || host.startsWith('[');
}

function hostPermitido(host, lista) {
  const h = String(host || '').toLowerCase().replace(/\.$/, '');
  if (!h || ehIpLiteral(h)) return false;
  return (lista || HOSTS_FOTO_PADRAO).some((d) => h === d || h.endsWith('.' + d));
}

/** Valida a URL da foto. Retorna URL ou lança ErroRender. */
function validarUrlFoto(url, lista) {
  let u;
  try {
    u = new URL(String(url));
  } catch (_) {
    throw new ErroRender('url_invalida', 'URL da foto inválida');
  }
  if (u.protocol !== 'https:') throw new ErroRender('url_invalida', 'a foto precisa ser HTTPS');
  if (u.username || u.password) throw new ErroRender('url_invalida', 'URL com credenciais não é aceita');
  if (u.port && u.port !== '443') throw new ErroRender('url_invalida', 'porta não permitida');
  if (!hostPermitido(u.hostname, lista)) throw new ErroRender('host_nao_permitido', 'host de imagem fora da allowlist: ' + u.hostname);
  return u;
}

/**
 * Baixa a foto. opts: { hosts, timeoutMs=8000, maxBytes=8MiB, maxRedirects=3, fetchImpl=fetch }.
 * Retorna { buffer, contentType, url } ou lança ErroRender (status 422 => quem chama manda p/ revisão).
 */
async function baixarFoto(url, opts) {
  const o = opts || {};
  const lista = o.hosts || HOSTS_FOTO_PADRAO;
  const timeoutMs = o.timeoutMs || 8000;
  const maxBytes = o.maxBytes || 8 * 1024 * 1024;
  const maxRedirects = o.maxRedirects == null ? 3 : o.maxRedirects;
  const fetchImpl = o.fetchImpl || globalThis.fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let u = validarUrlFoto(url, lista);
    for (let saltos = 0; ; saltos++) {
      const res = await fetchImpl(u.toString(), {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: { accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8', 'user-agent': 'OfertoRender/1.0' },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc || saltos >= maxRedirects) throw new ErroRender('foto_indisponivel', 'redirecionamentos demais ou sem destino');
        u = validarUrlFoto(new URL(loc, u).toString(), lista);
        continue;
      }
      if (!res.ok) throw new ErroRender('foto_indisponivel', 'HTTP ' + res.status + ' ao baixar a foto');
      const tipo = String(res.headers.get('content-type') || '').toLowerCase();
      if (!tipo.startsWith('image/') || tipo.startsWith('image/svg')) throw new ErroRender('foto_tipo_invalido', 'conteúdo não é imagem raster: ' + (tipo || 'sem content-type'));
      const declarado = Number(res.headers.get('content-length'));
      if (Number.isFinite(declarado) && declarado > maxBytes) throw new ErroRender('foto_grande_demais', 'foto acima de ' + maxBytes + ' bytes');
      const partes = [];
      let total = 0;
      if (res.body && typeof res.body.getReader === 'function') {
        const leitor = res.body.getReader();
        for (;;) {
          const { done, value } = await leitor.read();
          if (done) break;
          total += value.byteLength;
          if (total > maxBytes) {
            try { await leitor.cancel(); } catch (_) { /* ignora */ }
            throw new ErroRender('foto_grande_demais', 'foto acima de ' + maxBytes + ' bytes');
          }
          partes.push(Buffer.from(value));
        }
      } else {
        const b = Buffer.from(await res.arrayBuffer());
        if (b.length > maxBytes) throw new ErroRender('foto_grande_demais', 'foto acima de ' + maxBytes + ' bytes');
        partes.push(b);
      }
      const buffer = Buffer.concat(partes);
      if (!buffer.length) throw new ErroRender('foto_indisponivel', 'foto vazia');
      return { buffer, contentType: tipo, url: u.toString() };
    }
  } catch (e) {
    if (e instanceof ErroRender) throw e;
    if (ctrl.signal.aborted || (e && e.name === 'AbortError')) throw new ErroRender('foto_timeout', 'tempo esgotado ao baixar a foto (' + timeoutMs + ' ms)');
    throw new ErroRender('foto_indisponivel', 'falha ao baixar a foto: ' + (e && e.message ? e.message : String(e)));
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { HOSTS_FOTO_PADRAO, ErroRender, hostsPermitidos, hostPermitido, validarUrlFoto, baixarFoto };
