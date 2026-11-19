'use strict';
// Arte 1080x1080 das ofertas (P1-11, P1-16, P1-17). Funções PURAS: só montam o SVG.
// Quem rasteriza (sharp), baixa a foto e valida a resolução é o serviço `render/`.
// Regras: preço e desconto são os maiores elementos; fonte >= 32 px; no máximo
// 3 informações por oferta (produto, preço, desconto); sem logo/nome de loja.
// Nada é inventado: sem `desconto_pct` válido não há selo de desconto.

const LADO_ARTE = 1080;
const FONTE_MIN_ARTE = 32;
const FONTE_ARTE = "Montserrat, 'DejaVu Sans', sans-serif";

/** Paleta por template. Contrastes (texto x fundo) conferidos nos testes (>= 4,5:1). */
const TEMPLATES_IMAGEM = {
  eletronicos: { nome: 'Eletrônicos', fundo: '#0B3D91', fundo2: '#06245A', texto: '#FFFFFF', precoFundo: '#FFFFFF', precoTexto: '#0B3D91', selo: '#FFD23F', seloTexto: '#1A1A1A', icone: 'eletronicos' },
  casa: { nome: 'Casa', fundo: '#1D5C4D', fundo2: '#0F3A30', texto: '#FFFFFF', precoFundo: '#FFFFFF', precoTexto: '#1D5C4D', selo: '#FFB703', seloTexto: '#1A1A1A', icone: 'casa' },
  moda: { nome: 'Moda', fundo: '#5E1A47', fundo2: '#3A0E2B', texto: '#FFFFFF', precoFundo: '#FFFFFF', precoTexto: '#5E1A47', selo: '#FF8FB1', seloTexto: '#1A1A1A', icone: 'moda' },
  games: { nome: 'Games', fundo: '#2A0D5E', fundo2: '#14052F', texto: '#FFFFFF', precoFundo: '#FFFFFF', precoTexto: '#2A0D5E', selo: '#3DF58A', seloTexto: '#1A1A1A', icone: 'games' },
  beleza: { nome: 'Beleza', fundo: '#8E2457', fundo2: '#5A1235', texto: '#FFFFFF', precoFundo: '#FFFFFF', precoTexto: '#8E2457', selo: '#FFD6E5', seloTexto: '#4A0D2A', icone: 'beleza' },
  neutro: { nome: 'Neutro', fundo: '#2F3B45', fundo2: '#1B232A', texto: '#FFFFFF', precoFundo: '#FFFFFF', precoTexto: '#2F3B45', selo: '#FFC107', seloTexto: '#1A1A1A', icone: 'neutro' },
};

/* ---------- categoria interna -> template (Q-14, Q-17) ---------- */

const PALAVRAS_TEMPLATE = {
  // Sensíveis: saúde, bebê/infantil e financeiro. Sempre template neutro + revisão.
  sensivel: [
    'suplemento', 'creatina', 'whey', 'vitamina', 'multivitaminico', 'colageno', 'omega 3', 'remedio', 'medicamento',
    'farmacia', 'termometro', 'fralda', 'fraldas', 'bebe', 'infantil', 'formula infantil', 'mamadeira', 'chupeta',
    'cartao de credito', 'emprestimo', 'consignado', 'seguro', 'investimento', 'conta digital', 'financiamento',
  ],
  games: [
    'ps5', 'ps4', 'playstation', 'xbox', 'nintendo', 'switch oled', 'switch lite', 'gamer', 'game', 'games', 'jogo',
    'jogos', 'joystick', 'dualsense', 'dualshock', 'gamepad', 'console', 'steam deck', 'controle sem fio', 'controle xbox',
    'controle ps5', 'volante logitech',
  ],
  eletronicos: [
    'smartphone', 'celular', 'iphone', 'galaxy', 'xiaomi', 'notebook', 'laptop', 'tablet', 'ipad', 'smart tv', 'tv',
    'televisao', 'monitor', 'fone', 'headset', 'earbuds', 'airpods', 'caixa de som', 'soundbar', 'smartwatch',
    'relogio inteligente', 'ssd', 'nvme', 'hd externo', 'pendrive', 'placa de video', 'processador', 'memoria ram',
    'roteador', 'carregador', 'power bank', 'camera', 'kindle', 'echo dot', 'alexa', 'teclado', 'mouse', 'impressora',
  ],
  casa: [
    'air fryer', 'airfryer', 'fritadeira', 'aspirador', 'robo aspirador', 'cafeteira', 'geladeira', 'refrigerador',
    'fogao', 'cooktop', 'micro-ondas', 'microondas', 'liquidificador', 'batedeira', 'ventilador', 'ar condicionado',
    'lava loucas', 'lava e seca', 'maquina de lavar', 'panela', 'panelas', 'colchao', 'travesseiro', 'jogo de cama',
    'toalha', 'sofa', 'cadeira', 'mesa', 'luminaria', 'ferro de passar', 'purificador',
  ],
  moda: [
    'tenis', 'camiseta', 'camisa', 'vestido', 'calca', 'jaqueta', 'moletom', 'bermuda', 'shorts', 'saia', 'blusa',
    'sandalia', 'chinelo', 'bota', 'bolsa', 'mochila', 'legging', 'conjunto', 'cueca', 'meia', 'oculos de sol',
  ],
  beleza: [
    'perfume', 'eau de parfum', 'eau de toilette', 'body splash', 'serum', 'protetor solar', 'hidratante', 'maquiagem',
    'batom', 'base liquida', 'rimel', 'mascara capilar', 'shampoo', 'condicionador', 'skincare', 'creme', 'secador de cabelo',
    'chapinha', 'prancha alisadora', 'esmalte', 'desodorante',
  ],
};

/** Minúsculas, sem acento, só [a-z0-9] e espaço. */
function normalizarTextoImagem(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function temPalavra(textoNorm, lista) {
  const t = ' ' + textoNorm + ' ';
  return lista.some((p) => t.includes(' ' + p + ' '));
}

/**
 * Categoria interna (config.CATEGORIAS) + título -> template da arte.
 * Retorna { template, sensivel, motivo }. `sensivel=true` => quem chama manda para revisão.
 *  - tech -> games (palavra-chave) ou eletronicos
 *  - perfumes/beleza -> beleza; casa -> casa; moda -> moda
 *  - saude/bebe (ou palavra sensível em qualquer categoria) -> neutro + sensivel
 *  - top/sem categoria -> por palavra-chave; sem match -> neutro (não sensível)
 */
function templateDaCategoria(categoria, titulo) {
  const cat = normalizarTextoImagem(categoria);
  const t = normalizarTextoImagem(titulo);
  if (cat === 'saude' || cat === 'bebe') return { template: 'neutro', sensivel: true, motivo: 'categoria_sensivel' };
  if (temPalavra(t, PALAVRAS_TEMPLATE.sensivel)) return { template: 'neutro', sensivel: true, motivo: 'palavra_sensivel' };
  if (TEMPLATES_IMAGEM[cat] && cat !== 'neutro') return { template: cat, sensivel: false, motivo: 'template_direto' };
  if (cat === 'tech') {
    const ehGame = temPalavra(t, PALAVRAS_TEMPLATE.games);
    return { template: ehGame ? 'games' : 'eletronicos', sensivel: false, motivo: ehGame ? 'tech_games' : 'tech_eletronicos' };
  }
  if (cat === 'perfumes') return { template: 'beleza', sensivel: false, motivo: 'perfumes' };
  if (cat === 'kpop') return { template: 'moda', sensivel: false, motivo: 'kpop' };
  for (const k of ['games', 'eletronicos', 'casa', 'moda', 'beleza']) {
    if (temPalavra(t, PALAVRAS_TEMPLATE[k])) return { template: k, sensivel: false, motivo: 'palavra_' + k };
  }
  return { template: 'neutro', sensivel: false, motivo: 'sem_categoria' };
}

/** Valor da config `imagem.usar_foto_produto` -> boolean (padrão: sim, Q-07). */
function usarFotoProduto(valor) {
  if (valor === false || valor === 0) return false;
  if (valor === true || valor === 1 || valor == null) return true;
  const v = normalizarTextoImagem(valor);
  if (['nao', 'n', 'false', '0', 'off', 'no'].includes(v)) return false;
  return true;
}

/* ---------- texto ---------- */

/** Escape XML de texto e atributos. Remove caracteres de controle inválidos em XML 1.0. */
function escXmlImagem(s) {
  return String(s == null ? '' : s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Título limpo: sem emoji/símbolos fora da fonte, espaços colapsados. */
function limparTituloArte(s) {
  return String(s == null ? '' : s)
    .replace(/[\uD800-\uDFFF]/g, '') // fora do BMP (emoji)
    .replace(/[^ -ɏ‐-‧€]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Larguras aproximadas (em em) da Montserrat Bold, para caber o texto sem medir fonte.
function larguraCharEm(c) {
  if (c === ' ') return 0.28;
  if ('iIl|!.,:;\'`'.includes(c)) return 0.3;
  if ('fjrt()[]-'.includes(c)) return 0.42;
  if ('mwMW'.includes(c)) return 0.95;
  if (/[0-9]/.test(c)) return 0.66;
  if (/[A-ZÀ-Þ]/.test(c)) return 0.76;
  if (c === '%') return 0.9;
  if (c === '$') return 0.66;
  return 0.64;
}

/** Largura estimada (px) de `texto` em `px` de fonte (com folga de 4%). */
function larguraTextoArte(texto, px) {
  let em = 0;
  for (const c of String(texto)) em += larguraCharEm(c);
  return em * px * 1.04;
}

/** Maior fonte em [min, max] que cabe em `largura`. Nunca abaixo de FONTE_MIN_ARTE. */
function fonteQueCabe(texto, largura, max, min) {
  const piso = Math.max(FONTE_MIN_ARTE, min || FONTE_MIN_ARTE);
  let px = Math.max(piso, max);
  while (px > piso && larguraTextoArte(texto, px) > largura) px -= 2;
  return px;
}

/** Corta com reticências até caber em `largura` com fonte `px`. */
function cortarTexto(texto, largura, px) {
  let s = String(texto);
  if (larguraTextoArte(s, px) <= largura) return s;
  while (s.length > 1 && larguraTextoArte(s + '…', px) > largura) s = s.slice(0, -1).trimEnd();
  return s + '…';
}

/**
 * Quebra o título em até `maxLinhas` linhas que caibam em `largura`.
 * Tenta da fonte `max` até `min`; se nem assim couber, corta a última linha com "…".
 * Retorna { linhas, px }.
 */
function quebrarTituloArte(titulo, largura, maxLinhas, max, min) {
  const palavras = limparTituloArte(titulo).split(' ').filter(Boolean);
  const piso = Math.max(FONTE_MIN_ARTE, min || FONTE_MIN_ARTE);
  const tentar = (px) => {
    const linhas = [];
    let atual = '';
    for (const p of palavras) {
      const cand = atual ? atual + ' ' + p : p;
      if (larguraTextoArte(cand, px) <= largura || !atual) atual = cand;
      else { linhas.push(atual); atual = p; }
    }
    if (atual) linhas.push(atual);
    return linhas;
  };
  for (let px = Math.max(piso, max); px >= piso; px -= 2) {
    const linhas = tentar(px);
    if (linhas.length <= maxLinhas && linhas.every((l) => larguraTextoArte(l, px) <= largura)) return { linhas, px };
  }
  const linhas = tentar(piso);
  const vis = linhas.slice(0, maxLinhas);
  if (linhas.length > maxLinhas) vis[maxLinhas - 1] = linhas.slice(maxLinhas - 1).join(' ');
  return { linhas: vis.map((l) => cortarTexto(l, largura, piso)), px: piso };
}

/* ---------- números ---------- */

function precoArteValido(v) {
  const n = typeof v === 'number' ? v : Number(String(v == null ? '' : v).replace(/r\$/i, '').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n < 1e7 ? Math.round(n * 100) / 100 : null;
}

function formatarPrecoArte(n) {
  const [int, dec] = n.toFixed(2).split('.');
  return 'R$ ' + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
}

/** Desconto exibível: inteiro de 1 a 95, ou null (sem selo). Nunca calculado aqui. */
function descontoArte(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 1 && r <= 95 ? r : null;
}

/** Só aceita foto já embutida pelo render (data URI de imagem em base64). Nada de URL externa no SVG. */
function fotoArteValida(f) {
  return typeof f === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(f) ? f : null;
}

/* ---------- validação ---------- */

class ErroArte extends Error {
  constructor(codigo, detalhe) {
    super(detalhe || codigo);
    this.name = 'ErroArte';
    this.codigo = codigo;
  }
}

function itemArte(o, i) {
  if (!o || typeof o !== 'object') throw new ErroArte('item_invalido', 'item ' + i + ' não é objeto');
  const titulo = limparTituloArte(o.titulo);
  if (!titulo) throw new ErroArte('titulo_ausente', 'item ' + i + ' sem título');
  const preco = precoArteValido(o.preco);
  if (preco == null) throw new ErroArte('preco_invalido', 'item ' + i + ' com preço inválido');
  return { titulo, preco, desconto: descontoArte(o.desconto_pct), foto: fotoArteValida(o.foto) };
}

/** Escolhe o template: explícito (se existir) ou derivado da categoria/título. */
function resolverTemplate(template, categoria, titulo) {
  const t = normalizarTextoImagem(template);
  const derivado = templateDaCategoria(categoria, titulo);
  if (derivado.sensivel) return derivado; // sensível sempre neutro, mesmo com template explícito
  if (t && TEMPLATES_IMAGEM[t]) return { template: t, sensivel: false, motivo: 'explicito' };
  if (t) throw new ErroArte('template_invalido', 'template desconhecido: ' + String(template).slice(0, 40));
  return derivado;
}

/* ---------- desenho ---------- */

const ICONES = {
  eletronicos: (c) => `<rect x="28" y="6" width="44" height="88" rx="8" fill="${c}"/><rect x="33" y="15" width="34" height="62" rx="2" fill="#FFFFFF"/><circle cx="50" cy="85" r="3.5" fill="#FFFFFF"/>`,
  casa: (c) => `<path d="M50 8 L94 46 L82 46 L82 92 L60 92 L60 64 L40 64 L40 92 L18 92 L18 46 L6 46 Z" fill="${c}"/>`,
  moda: (c) => `<path d="M35 10 L18 17 L4 38 L19 49 L26 41 L26 92 L74 92 L74 41 L81 49 L96 38 L82 17 L65 10 Q50 26 35 10 Z" fill="${c}"/>`,
  games: (c) => `<rect x="6" y="28" width="88" height="46" rx="23" fill="${c}"/><rect x="20" y="47" width="22" height="8" rx="2" fill="#FFFFFF"/><rect x="27" y="40" width="8" height="22" rx="2" fill="#FFFFFF"/><circle cx="70" cy="44" r="5" fill="#FFFFFF"/><circle cx="80" cy="56" r="5" fill="#FFFFFF"/>`,
  beleza: (c) => `<path d="M50 6 C50 6 18 46 18 64 A32 32 0 0 0 82 64 C82 46 50 6 50 6 Z" fill="${c}"/><path d="M34 62 A16 16 0 0 0 46 80" stroke="#FFFFFF" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  neutro: (c) => `<path d="M10 10 L52 10 L92 50 L52 90 L10 48 Z" fill="${c}"/><circle cx="29" cy="29" r="7" fill="#FFFFFF"/>`,
};

function n0(v) { return Math.round(v * 10) / 10; }

function icone(nome, cor, cx, cy, tamanho) {
  const s = tamanho / 100;
  return `<g transform="translate(${n0(cx - tamanho / 2)} ${n0(cy - tamanho / 2)}) scale(${n0(s * 100) / 100})">${(ICONES[nome] || ICONES.neutro)(cor)}</g>`;
}

function textoSvg(txt, x, y, px, cor, extra) {
  return `<text x="${n0(x)}" y="${n0(y)}" font-family="${FONTE_ARTE}" font-weight="800" font-size="${px}" fill="${cor}" text-anchor="middle"${extra || ''}>${escXmlImagem(txt)}</text>`;
}

function seloDesconto(pal, desconto, cx, cy, r) {
  const txt = '-' + desconto + '%';
  const px = fonteQueCabe(txt, r * 1.6, Math.round(r * 0.78), FONTE_MIN_ARTE);
  return `<circle cx="${n0(cx)}" cy="${n0(cy)}" r="${n0(r)}" fill="${pal.selo}" stroke="#FFFFFF" stroke-width="${Math.max(4, Math.round(r / 14))}"/>` +
    textoSvg(txt, cx, cy + px * 0.36, px, pal.seloTexto);
}

/** Área da imagem: foto (contida, sem cortar) ou ícone da categoria sobre um círculo suave. */
function areaImagem(pal, foto, x, y, w, h) {
  if (foto) return `<image x="${n0(x)}" y="${n0(y)}" width="${n0(w)}" height="${n0(h)}" preserveAspectRatio="xMidYMid meet" href="${foto}"/>`;
  const lado = Math.min(w, h);
  return `<circle cx="${n0(x + w / 2)}" cy="${n0(y + h / 2)}" r="${n0(lado * 0.42)}" fill="${pal.selo}" fill-opacity="0.35"/>` +
    icone(pal.icone, pal.fundo, x + w / 2, y + h / 2, lado * 0.56);
}

function abrirSvg(pal) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LADO_ARTE}" height="${LADO_ARTE}" viewBox="0 0 ${LADO_ARTE} ${LADO_ARTE}">` +
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal.fundo}"/><stop offset="1" stop-color="${pal.fundo2}"/></linearGradient></defs>` +
    `<rect width="${LADO_ARTE}" height="${LADO_ARTE}" fill="url(#bg)"/>`;
}

/**
 * Arte de UMA oferta.
 * entrada: { template?, oferta: { titulo, preco, desconto_pct?, categoria?, foto? (data URI) }, usar_foto? }
 * Com usar_foto e sem `foto` embutida: erro `foto_ausente` (quem chama manda p/ revisão).
 * Retorna { svg, largura, altura, template, sensivel, layout, informacoes }.
 */
function svgOferta(entrada) {
  const e = entrada || {};
  const o = e.oferta;
  const it = itemArte(o, 0);
  const tpl = resolverTemplate(e.template, o.categoria, it.titulo);
  const pal = TEMPLATES_IMAGEM[tpl.template];
  const comFoto = usarFotoProduto(e.usar_foto);
  if (comFoto && !it.foto) throw new ErroArte('foto_ausente', 'usar_foto=sim, mas não há foto válida embutida');

  const partes = [abrirSvg(pal)];
  // Cartão central da imagem: 780x640 (foto útil 732x592).
  const card = { x: 150, y: 48, w: 780, h: 640 };
  partes.push(`<rect x="${card.x}" y="${card.y}" width="${card.w}" height="${card.h}" rx="36" fill="#FFFFFF"/>`);
  partes.push(areaImagem(pal, comFoto ? it.foto : null, card.x + 24, card.y + 24, card.w - 48, card.h - 48));
  if (it.desconto != null) partes.push(seloDesconto(pal, it.desconto, 880, 130, 118));

  // Produto: até 2 linhas, 44 -> 34 px.
  const tit = quebrarTituloArte(it.titulo, 900, 2, 44, 34);
  const lh = Math.round(tit.px * 1.2);
  const baseTit = tit.linhas.length === 1 ? 784 : 758;
  tit.linhas.forEach((l, i) => partes.push(textoSvg(l, 540, baseTit + i * lh, tit.px, pal.texto)));

  // Preço: faixa branca, maior texto da arte.
  const precoTxt = formatarPrecoArte(it.preco);
  const pxPreco = fonteQueCabe(precoTxt, 800, 150, 60);
  partes.push(`<rect x="110" y="850" width="860" height="186" rx="40" fill="${pal.precoFundo}"/>`);
  partes.push(textoSvg(precoTxt, 540, 943 + pxPreco * 0.36, pxPreco, pal.precoTexto));
  partes.push('</svg>');

  return {
    svg: partes.join(''),
    largura: LADO_ARTE,
    altura: LADO_ARTE,
    template: tpl.template,
    sensivel: tpl.sensivel,
    motivo_template: tpl.motivo,
    layout: 'unico',
    com_foto: comFoto,
    informacoes: it.desconto != null ? ['produto', 'preco', 'desconto'] : ['produto', 'preco'],
    fontes: { titulo: tit.px, preco: pxPreco, desconto: it.desconto != null ? fonteQueCabe('-' + it.desconto + '%', 118 * 1.6, Math.round(118 * 0.78)) : null },
  };
}

/** Layout da grade para n fotos: 1 -> 1x1, 2 -> 2x1, 3-4 -> 2x2, 5-6 -> 3x2. */
function layoutGradeArte(n) {
  const q = Number(n);
  if (!Number.isInteger(q) || q < 1 || q > 6) throw new ErroArte('itens_invalidos', 'a grade aceita de 1 a 6 itens');
  if (q === 1) return { cols: 1, rows: 1, nome: '1' };
  if (q === 2) return { cols: 2, rows: 1, nome: '2x1' };
  if (q <= 4) return { cols: 2, rows: 2, nome: '2x2' };
  return { cols: 3, rows: 2, nome: '3x2' };
}

/** Retângulos das células da grade (margem 36, espaço 24). */
function celulasGradeArte(n) {
  const g = layoutGradeArte(n);
  const m = 36;
  const gap = 24;
  const w = (LADO_ARTE - 2 * m - (g.cols - 1) * gap) / g.cols;
  const h = (LADO_ARTE - 2 * m - (g.rows - 1) * gap) / g.rows;
  const cel = [];
  for (let i = 0; i < n; i++) {
    const c = i % g.cols;
    const r = Math.floor(i / g.cols);
    cel.push({ x: m + c * (w + gap), y: m + r * (h + gap), w, h });
  }
  return { layout: g, celulas: cel };
}

function fontePrecoCelula(it, cel) {
  const p = Math.max(16, Math.round(cel.w * 0.05));
  return fonteQueCabe(formatarPrecoArte(it.preco), cel.w - 2 * p, Math.min(110, Math.round(cel.w * 0.2)), 40);
}

function celulaLista(pal, it, cel, comFoto, pxPreco) {
  const p = Math.max(16, Math.round(cel.w * 0.05));
  const larguraUtil = cel.w - 2 * p;
  const precoTxt = formatarPrecoArte(it.preco);
  const pxTit = Math.max(FONTE_MIN_ARTE, Math.min(40, Math.round(cel.w * 0.08)));
  const titulo = cortarTexto(it.titulo, larguraUtil, pxTit);
  const zonaTexto = Math.round(pxTit * 1.35 + pxPreco * 1.25 + p);
  const out = [`<rect x="${n0(cel.x)}" y="${n0(cel.y)}" width="${n0(cel.w)}" height="${n0(cel.h)}" rx="28" fill="#FFFFFF"/>`];
  const img = { x: cel.x + p, y: cel.y + p, w: cel.w - 2 * p, h: cel.h - 2 * p - zonaTexto };
  out.push(areaImagem(pal, comFoto ? it.foto : null, img.x, img.y, img.w, img.h));
  const yTit = img.y + img.h + pxTit * 1.1;
  out.push(textoSvg(titulo, cel.x + cel.w / 2, yTit, pxTit, '#333333'));
  out.push(textoSvg(precoTxt, cel.x + cel.w / 2, cel.y + cel.h - p - pxPreco * 0.22, pxPreco, pal.precoTexto));
  if (it.desconto != null) {
    const r = Math.max(46, Math.min(110, Math.round(cel.w * 0.16)));
    out.push(seloDesconto(pal, it.desconto, cel.x + cel.w - r * 0.75, cel.y + r * 0.75, r));
  }
  return { svg: out.join(''), fontes: { titulo: pxTit, preco: pxPreco } };
}

/**
 * Arte de LISTA (vitrine/digest): 1 a 6 itens, cada um com foto (ou ícone), produto e preço por quadro.
 * entrada: { template?, categoria?, itens: [{ titulo, preco, desconto_pct?, foto? }], usar_foto? }
 */
function svgLista(entrada) {
  const e = entrada || {};
  const brutos = Array.isArray(e.itens) ? e.itens : null;
  if (!brutos) throw new ErroArte('itens_invalidos', 'itens deve ser uma lista');
  const { layout, celulas } = celulasGradeArte(brutos.length);
  const itens = brutos.map(itemArte);
  const comFoto = usarFotoProduto(e.usar_foto);
  if (comFoto) {
    const sem = itens.findIndex((i) => !i.foto);
    if (sem >= 0) throw new ErroArte('foto_ausente', 'item ' + sem + ' sem foto válida embutida');
  }
  // Template da lista: explícito, ou da categoria; sensível em QUALQUER item => neutro + sensível.
  let tpl = resolverTemplate(e.template, e.categoria, itens.map((i) => i.titulo).join(' | '));
  for (const i of itens) {
    const t = templateDaCategoria(e.categoria, i.titulo);
    if (t.sensivel) { tpl = t; break; }
  }
  const pal = TEMPLATES_IMAGEM[tpl.template];
  const partes = [abrirSvg(pal)];
  const fontes = [];
  // Mesma fonte de preço em todos os quadros (alinhamento): a menor que cabe em todos.
  const pxPreco = Math.min(...itens.map((it, i) => fontePrecoCelula(it, celulas[i])));
  itens.forEach((it, i) => {
    const c = celulaLista(pal, it, celulas[i], comFoto, pxPreco);
    fontes.push(c.fontes);
    partes.push(c.svg);
  });
  partes.push('</svg>');
  return {
    svg: partes.join(''),
    largura: LADO_ARTE,
    altura: LADO_ARTE,
    template: tpl.template,
    sensivel: tpl.sensivel,
    motivo_template: tpl.motivo,
    layout: 'grade-' + layout.nome,
    com_foto: comFoto,
    celulas,
    fontes,
  };
}

/** Entrada do POST /render: { template?, oferta } ou { template?, itens }. */
function montarArte(req) {
  const r = req || {};
  if (r.oferta && r.itens) throw new ErroArte('entrada_invalida', 'envie oferta OU itens, não os dois');
  if (r.oferta) return svgOferta(r);
  if (r.itens) return svgLista(r);
  throw new ErroArte('entrada_invalida', 'faltou oferta ou itens');
}

/** Tamanho (px) da área de foto de cada slot, para o render redimensionar antes de embutir. */
function slotsFotoArte(req) {
  const r = req || {};
  if (r.oferta) return [{ w: 732, h: 592 }];
  if (Array.isArray(r.itens)) {
    const { celulas } = celulasGradeArte(r.itens.length);
    return celulas.map((c) => {
      const p = Math.max(16, Math.round(c.w * 0.05));
      return { w: Math.round(c.w - 2 * p), h: Math.round(c.h * 0.7) };
    });
  }
  return [];
}

/** Razão de contraste WCAG entre duas cores #RRGGBB. */
function contrasteCores(a, b) {
  const lum = (hex) => {
    const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

module.exports = {
  LADO_ARTE,
  FONTE_MIN_ARTE,
  TEMPLATES_IMAGEM,
  PALAVRAS_TEMPLATE,
  ErroArte,
  templateDaCategoria,
  usarFotoProduto,
  escXmlImagem,
  limparTituloArte,
  larguraTextoArte,
  quebrarTituloArte,
  descontoArte,
  fotoArteValida,
  layoutGradeArte,
  celulasGradeArte,
  svgOferta,
  svgLista,
  montarArte,
  slotsFotoArte,
  contrasteCores,
};
