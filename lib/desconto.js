'use strict';
// Anti-falso-desconto (Fase 2: P2-03, P2-06, P2-07, P2-08, P2-15, P2-16, P2-17, P2-19).
// Funções puras, sem I/O. TODOS os valores monetários são CENTAVOS INTEIROS.
// Regra geral: na dúvida, não auto-publica (destino 'revisao' com o motivo).
// Parâmetros adotados: docs/decisions/fase2-respostas.md (Q-15 a Q-23). Regras: docs/anti-fake-rules.md.

const DIA = 24 * 60 * 60 * 1000;

/** Padrões (Q-15, Q-18, Q-19, Q-23). Cada um pode ser trocado por `cfg` com a mesma chave. */
const PADRAO_DESCONTO = Object.freeze({
  janela_dias: 30,
  excluir_recentes_h: 12, // amostras das últimas 12 h não entram na referência (o preço não se compara com ele mesmo)
  min_amostras_consistente: 10,
  min_dias_consistente: 20,
  min_amostras_provisoria: 5,
  min_dias_provisoria: 10,
  alta_suspeita_pct: 25, // alta > 25% nos 7 dias antes da queda = "metade do dobro"
  janela_suspeita_dias: 7,
  salto_fontes_pct: 15, // medianas de fontes diferentes divergindo mais que isto = 'mista' (suposição W4)
  tolerancia_menor_pct: 3, // "próximo do menor patamar": preço ≤ mínimo 30d × 1,03
  desconto_min_pct: 12, // bloqueio duro 1
  revalidacao_alta_pct: 3, // P2-17
  considerar_cashback: false, // Q-19: cashback é condicional, fica fora do preço final
  max_dia: 5, // Q-23: posts por canal Telegram de categoria por dia
});

/** P2-07 / Q-16: únicas lojas que podem auto-publicar. Fora dela, revisão humana. */
const WHITELIST_AUTO = Object.freeze(['ml', 'amazon', 'magalu', 'shopee']);

const ALIAS_LOJA = { mercadolivre: 'ml', mercado_livre: 'ml', 'mercado livre': 'ml', meli: 'ml', magazineluiza: 'magalu', 'magazine luiza': 'magalu', amazon_br: 'amazon' };

/** P2-03 / Q-17: categorias sensíveis e palavras-chave (sem acento, minúsculas). */
const CATEGORIAS_SENSIVEIS_DESCONTO = Object.freeze({ saude: 'saude', farmacia: 'saude', bebe: 'infantil', infantil: 'infantil', financeiro: 'financeiro' });
const PALAVRAS_SENSIVEIS = Object.freeze({
  saude: [
    'saude', 'remedio', 'medicamento', 'farmacia', 'suplemento', 'vitamina', 'multivitaminico', 'creatina', 'whey', 'colageno',
    'omega 3', 'termometro', 'oximetro', 'medidor de pressao', 'glicosimetro', 'glicose', 'teste de gravidez',
    'preservativo', 'anticoncepcional', 'dipirona', 'paracetamol', 'ibuprofeno', 'nebulizador', 'inalador', 'curativo',
  ],
  infantil: [
    'bebe', 'infantil', 'fralda', 'formula infantil', 'mamadeira', 'chupeta', 'lenco umedecido', 'papinha', 'berco',
    'carrinho de bebe', 'cadeirinha', 'bebe conforto', 'leite em po', 'recem nascido', 'crianca', 'criancas',
  ],
  financeiro: [
    'cartao de credito', 'cartao pre pago', 'cartao consignado', 'emprestimo', 'consignado', 'credito pessoal',
    'cartao', 'financiamento', 'consorcio', 'seguro', 'investimento', 'investimentos', 'conta digital', 'conta corrente',
    'cdb', 'tesouro direto', 'previdencia', 'renda fixa', 'cashback no cartao',
  ],
});
/** "Cartão" que NÃO é financeiro (removido do texto antes de procurar 'cartao' sozinho). */
// O texto já vem normalizado por semAcento (minúsculas, só [a-z0-9] e espaços simples): limites por espaço.
const CARTAO_NAO_FINANCEIRO = /(?:^| )cart(?:ao|oes)(?: de)? (?:memoria|micro ?sd|sd|sdhc|sdxc|cf|nfc|visita|visitas|ponto|tag|resposta|rfid|proximidade)(?= |$)/g;

/** Uma palavra (sem acento) aceitando o plural: s/es; -l → -is; -ao → -oes/-aes/-aos; -m → -ns. */
function radicalPlural(w) {
  if (w.length <= 2) return w; // 'de', 'em', 'po'
  if (/ao$/.test(w)) return w.slice(0, -2) + '(?:ao|oes|aes|aos)';
  if (/l$/.test(w)) return w.slice(0, -1) + '(?:l|s|is|les)'; // infantil → infantis
  if (/m$/.test(w)) return w.slice(0, -1) + '(?:m|ns)';
  return w + '(?:s|es)?';
}
/** Regex por grupo: cada termo, palavra a palavra, com o plural opcional. Casa por palavra inteira no texto normalizado. */
const REGEX_SENSIVEIS = Object.freeze(Object.fromEntries(Object.keys(PALAVRAS_SENSIVEIS).map((g) => [
  g,
  new RegExp('(?:^| )(?:' + PALAVRAS_SENSIVEIS[g].map((t) => t.split(' ').map(radicalPlural).join(' ')).join('|') + ')(?= |$)'),
])));

/** Origens que são garimpo de terceiros (Q-20): nunca auto-publicam. */
const ORIGENS_TERCEIROS = /canal|telegram|terceir|promobit|gatry|pelando|garimp|comunidade|forum/i;

/** P2-19: texto curto de cada motivo para o card de revisão. */
const MOTIVOS_TEXTO = Object.freeze({
  preco_invalido: 'preço inválido ou cupom maior que o preço',
  fora_whitelist: 'loja fora da whitelist de auto-publicação',
  sensivel_saude: 'categoria sensível: saúde',
  sensivel_infantil: 'categoria sensível: bebê/infantil',
  sensivel_financeiro: 'categoria sensível: financeiro',
  sem_ref: 'sem histórico próprio de 30 dias',
  integridade_insuficiente: 'histórico de 30 dias insuficiente',
  integridade_suspeita: 'alta recente antes da queda ("metade do dobro")',
  integridade_mista: 'fontes de preço divergentes',
  bloqueio_desconto: 'desconto real abaixo do mínimo sobre a mediana de 30 dias',
  bloqueio_posicao: 'preço acima do menor patamar de 30 dias',
  frete_desconhecido: 'frete desconhecido',
  fonte_terceiros: 'oferta garimpada de terceiros',
  cupom_loja: 'cupom de loja (sem produto)',
  sem_imagem: 'sem imagem',
  sem_afiliado: 'sem link de afiliado configurado',
});

/* ---------- utilidades internas ---------- */

/** Chaves que precisam ser > 0 (zero desligaria a janela/contagem). As demais numéricas aceitam ≥ 0. */
const POSITIVAS = new Set(['janela_dias', 'janela_suspeita_dias', 'min_amostras_consistente', 'min_dias_consistente', 'min_amostras_provisoria', 'min_dias_provisoria']);

/** Número de config: aceita número ou texto ("12", "12,5", "12%"). Inválido = null (o chamador mantém o padrão). */
function numeroCfg(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/%$/, '').trim().replace(',', '.');
  if (!/^[-+]?[0-9]+(?:[.][0-9]+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Mescla cfg sobre PADRAO_DESCONTO. A tabela `config` guarda TEXTO: toda chave numérica é convertida
 * (sem isso, '100' + '3' vira '1003'). Valor inválido, negativo ou fora da faixa mantém o PADRÃO (fail-safe:
 * os padrões são os valores conservadores da Q-15/Q-18/Q-19/Q-23).
 */
function opcoes(cfg) {
  const o = Object.assign({}, PADRAO_DESCONTO);
  if (cfg && typeof cfg === 'object') {
    for (const k of Object.keys(PADRAO_DESCONTO)) {
      const v = cfg[k];
      if (v === undefined || v === null || v === '') continue;
      if (typeof PADRAO_DESCONTO[k] === 'boolean') {
        o[k] = v === true || String(v).trim().toLowerCase() === 'true';
        continue;
      }
      const n = numeroCfg(v);
      if (n == null || n < 0 || (POSITIVAS.has(k) && n <= 0)) continue;
      o[k] = n;
    }
  }
  return o;
}

function centavos(v) {
  return Number.isInteger(v) && v > 0 ? v : null;
}

function tsDe(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v;
  return new Date(v).getTime();
}

function agoraDe(agora) {
  const t = tsDe(agora);
  return Number.isFinite(t) ? t : Date.now();
}

function semAcento(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function medianaDe(valores) {
  if (!valores.length) return null;
  const v = valores.slice().sort((a, b) => a - b);
  const m = v.length >> 1;
  // Par: média dos dois do meio arredondada para BAIXO (referência menor = desconto menor = conservador).
  return v.length % 2 ? v[m] : Math.floor((v[m - 1] + v[m]) / 2);
}

/** pct com 2 casas a partir de inteiros (só para exibir; as comparações usam inteiros). */
function pct(num, den) {
  return Math.round((num * 10000) / den) / 100;
}

/**
 * Amostras válidas da janela: [{ preco, ts, fonte }].
 * Amostra de entrada: { preco (centavos inteiros, preço de VITRINE), ts|data (ms ou ISO), fonte?, com_cupom? }.
 * com_cupom === true fica de fora (P2-10: a mediana usa só o preço de vitrine).
 */
function janela(amostras, agora, cfg) {
  const o = opcoes(cfg);
  const fim = agoraDe(agora) - o.excluir_recentes_h * 60 * 60 * 1000;
  const inicio = agoraDe(agora) - o.janela_dias * DIA;
  return (Array.isArray(amostras) ? amostras : [])
    .filter((a) => a && a.com_cupom !== true)
    .map((a) => ({ preco: centavos(a.preco), ts: tsDe(a.ts != null ? a.ts : a.data), fonte: String(a.fonte || 'propria') }))
    .filter((a) => a.preco != null && Number.isFinite(a.ts) && a.ts >= inicio && a.ts < fim)
    .sort((a, b) => a.ts - b.ts);
}

/**
 * Converte linhas legadas de bfx_precos (preco em REAIS, data, fonte 'coleta'|'ref90') em amostras em centavos.
 * Só 'coleta' vira amostra: ref90 manual não é observação de preço.
 */
function amostrasDeBfxPrecos(linhas) {
  return (Array.isArray(linhas) ? linhas : [])
    .filter((r) => r && (r.fonte || 'coleta') === 'coleta')
    .map((r) => {
      const reais = Number(r.preco);
      return {
        preco: Number.isFinite(reais) && reais > 0 ? Math.round(reais * 100) : null,
        ts: r.ts != null ? r.ts : r.data,
        fonte: r.fonte_amostra || 'propria',
        com_cupom: r.com_cupom === true || r.com_cupom === 'sim',
      };
    })
    .filter((a) => a.preco != null);
}

/* ---------- API ---------- */

/** P2-16: mediana do preço de vitrine nos últimos 30 dias (centavos) ou null sem amostras. */
function mediana30d(amostras, agora, cfg) {
  return medianaDe(janela(amostras, agora, cfg).map((a) => a.preco));
}

/** Menor preço de vitrine nos últimos 30 dias (centavos) ou null. */
function minimo30d(amostras, agora, cfg) {
  const j = janela(amostras, agora, cfg);
  return j.length ? Math.min(...j.map((a) => a.preco)) : null;
}

/**
 * P2-08: preço final = preço + frete − cupom (− cashback só se cfg.considerar_cashback).
 * preco, frete, cashback: centavos inteiros. frete null/undefined = DESCONHECIDO (não vira zero).
 * cupom: centavos inteiros, ou { pct } (percentual sobre o preço, arredondado para baixo), ou null.
 * Retorna { centavos, freteConhecido, cupomCentavos, cashbackCentavos, invalido? }.
 * centavos = null quando o preço é inválido ou o cupom zera o preço.
 */
function precoFinal(entrada, cfg) {
  const o = opcoes(cfg);
  const e = entrada || {};
  const preco = centavos(e.preco);
  const freteConhecido = Number.isInteger(e.frete) && e.frete >= 0;
  const frete = freteConhecido ? e.frete : 0;
  let cupom = 0;
  if (e.cupom != null && e.cupom !== '' && e.cupom !== false) {
    if (typeof e.cupom === 'object') {
      const p = Number(e.cupom.pct);
      if (Number.isFinite(p) && p > 0 && preco != null) cupom = Math.floor((preco * p) / 100);
      else if (Number.isInteger(e.cupom.centavos) && e.cupom.centavos > 0) cupom = e.cupom.centavos;
    } else if (Number.isInteger(e.cupom) && e.cupom > 0) {
      cupom = e.cupom;
    }
  }
  const cashback = o.considerar_cashback === true && Number.isInteger(e.cashback) && e.cashback > 0 ? e.cashback : 0;
  if (preco == null) return { centavos: null, freteConhecido, cupomCentavos: cupom, cashbackCentavos: cashback, invalido: 'preco_invalido' };
  const base = preco - cupom - cashback;
  if (base <= 0) return { centavos: null, freteConhecido, cupomCentavos: cupom, cashbackCentavos: cashback, invalido: 'cupom_maior_que_preco' };
  return { centavos: base + frete, freteConhecido, cupomCentavos: cupom, cashbackCentavos: cashback };
}

/**
 * Detalhe da integridade (Q-15): { integridade, amostras, dias_cobertos, mediana, minimo, pico_7d }.
 * opts: { agora, preco (centavos, opcional: só há "queda" se o preço atual for menor que o pico), ...cfg }.
 */
function integridadeDetalhe(amostras, opts) {
  const op = opts || {};
  const o = opcoes(op);
  const agora = agoraDe(op.agora);
  const j = janela(amostras, agora, op);
  // "Cobrindo N dias" = extensão do histórico (do dia mais antigo ao mais novo, inclusive).
  // As amostras contam uma por dia (dias_com_amostra): 10 coletas no mesmo dia não valem 10.
  const idx = j.map((a) => Math.floor((agora - a.ts) / DIA));
  const dias = j.length ? Math.max(...idx) - Math.min(...idx) + 1 : 0;
  const diasComAmostra = new Set(idx).size;
  const base = { amostras: j.length, dias_com_amostra: diasComAmostra, dias_cobertos: dias, mediana: medianaDe(j.map((a) => a.preco)), minimo: j.length ? Math.min(...j.map((a) => a.preco)) : null, pico_7d: null };
  if (!j.length) return Object.assign(base, { integridade: 'insuficiente' });

  // Suspeita ("metade do dobro"): alguma amostra dos 7 dias antes da queda ficou > 25% acima
  // da mediana das amostras anteriores a ela (dentro da janela de 30 dias).
  const inicio7 = agora - o.janela_suspeita_dias * DIA;
  let pico = null;
  j.forEach((a, i) => {
    if (a.ts < inicio7 || i === 0) return;
    const antes = medianaDe(j.slice(0, i).map((x) => x.preco));
    if (antes != null && a.preco * 100 > antes * (100 + o.alta_suspeita_pct) && (pico == null || a.preco > pico)) pico = a.preco;
  });
  base.pico_7d = pico;
  const precoAtual = centavos(op.preco);
  if (pico != null && (precoAtual == null || precoAtual < pico)) return Object.assign(base, { integridade: 'suspeita' });

  if (diasComAmostra < o.min_amostras_provisoria || dias < o.min_dias_provisoria) return Object.assign(base, { integridade: 'insuficiente' });

  // Mista: duas ou mais fontes (com ≥2 amostras cada) cujas medianas divergem mais que salto_fontes_pct.
  const porFonte = {};
  for (const a of j) (porFonte[a.fonte] = porFonte[a.fonte] || []).push(a.preco);
  const meds = Object.values(porFonte).filter((v) => v.length >= 2).map(medianaDe);
  if (meds.length >= 2) {
    const lo = Math.min(...meds);
    const hi = Math.max(...meds);
    if (hi * 100 > lo * (100 + o.salto_fontes_pct)) return Object.assign(base, { integridade: 'mista' });
  }

  if (diasComAmostra >= o.min_amostras_consistente && dias >= o.min_dias_consistente) return Object.assign(base, { integridade: 'consistente' });
  return Object.assign(base, { integridade: 'provisoria' });
}

/** 'consistente' | 'provisoria' | 'insuficiente' | 'suspeita' | 'mista'. */
function integridade(amostras, opts) {
  return integridadeDetalhe(amostras, opts).integridade;
}

/**
 * Posição do preço (centavos) no histórico de 30 dias:
 * 'menor' (≤ mínimo), 'proximo_menor' (≤ mínimo × 1,03), 'tipico' (≤ mediana), 'acima'.
 * null quando não há amostras (sem referência).
 */
function posicao(preco, amostras, opts) {
  const op = opts || {};
  const o = opcoes(op);
  const p = centavos(preco);
  const j = janela(amostras, op.agora, op);
  if (p == null || !j.length) return null;
  const min = Math.min(...j.map((a) => a.preco));
  const med = medianaDe(j.map((a) => a.preco));
  if (p <= min) return 'menor';
  if (p * 100 <= min * (100 + o.tolerancia_menor_pct)) return 'proximo_menor';
  if (p <= med) return 'tipico';
  return 'acima';
}

function normalizarLoja(loja) {
  const s = String(loja == null ? '' : loja).trim().toLowerCase();
  return ALIAS_LOJA[s] || s;
}

/** P2-07: a loja pode auto-publicar? cfg.whitelist_auto (lista) substitui a padrão. */
function lojaNaWhitelist(loja, cfg) {
  const lista = cfg && Array.isArray(cfg.whitelist_auto) ? cfg.whitelist_auto.map(normalizarLoja) : WHITELIST_AUTO;
  const l = normalizarLoja(loja);
  return !!l && lista.includes(l);
}

/** P2-03 / Q-17: grupos sensíveis da oferta (['saude'|'infantil'|'financeiro']), por categoria ou palavra-chave. */
function sensiveis(oferta) {
  const o = oferta || {};
  const out = new Set();
  const cat = semAcento(o.categoria).replace(/ /g, '_');
  if (CATEGORIAS_SENSIVEIS_DESCONTO[cat]) out.add(CATEGORIAS_SENSIVEIS_DESCONTO[cat]);
  const texto = semAcento([o.titulo, o.nome, o.categoria, o.subcategoria].filter(Boolean).join(' '));
  for (const grupo of Object.keys(REGEX_SENSIVEIS)) {
    // Financeiro: "cartão de memória", "cartão SD" etc. saem antes (senão 'cartao' sozinho daria falso positivo).
    const t = grupo === 'financeiro' ? texto.replace(CARTAO_NAO_FINANCEIRO, ' ') : texto;
    if (REGEX_SENSIVEIS[grupo].test(t)) out.add(grupo);
  }
  return ['saude', 'infantil', 'financeiro'].filter((g) => out.has(g));
}

function ehFonteTerceiros(o) {
  if (o.fonte_terceiros === true) return true;
  return ORIGENS_TERCEIROS.test(String(o.origem || ''));
}

/**
 * P2-15 + P2-19: decide se a oferta pode sair sozinha.
 * oferta: { loja, categoria, titulo, preco, frete (null = desconhecido), cupom, cashback (centavos),
 *           cupom_loja (bool), fonte_terceiros (bool) | origem (texto), tem_imagem (bool, OBRIGATÓRIO true),
 *           tem_afiliado (false = sem afiliado) }.
 *   O "De" da loja (preco_de) é IGNORADO de propósito: o desconto real é sempre sobre a mediana de 30 dias.
 * amostras: histórico próprio de vitrine (ver `janela`).
 * cfg: chaves de PADRAO_DESCONTO + { agora, whitelist_auto }.
 * Retorna { destino: 'auto'|'revisao', motivos: [...], desconto_real, integridade, posicao, preco_final,
 *           frete_conhecido, mediana_30d, minimo_30d, amostras, dias_cobertos }.
 * auto só quando NÃO há nenhum motivo (AND dos 3 bloqueios duros + todas as regras de revisão).
 */
function avaliarAutoPublicacao(oferta, amostras, cfg) {
  const c = cfg || {};
  const o = opcoes(c);
  const of = oferta || {};
  const motivos = [];
  const add = (m) => { if (!motivos.includes(m)) motivos.push(m); };

  const pf = precoFinal(of, c);
  if (pf.centavos == null) add('preco_invalido');

  if (!lojaNaWhitelist(of.loja, c)) add('fora_whitelist');
  for (const g of sensiveis(of)) add('sensivel_' + g);

  const det = integridadeDetalhe(amostras, Object.assign({}, c, { preco: pf.centavos }));
  const mediana = det.mediana;
  let desconto_real = null;
  let pos = null;
  if (!det.amostras) {
    add('sem_ref');
  } else {
    if (det.integridade !== 'consistente' && det.integridade !== 'provisoria') add('integridade_' + det.integridade);
    if (pf.centavos != null) {
      desconto_real = pct(mediana - pf.centavos, mediana);
      // Bloqueio 1 (inteiros): (mediana − final) / mediana ≥ desconto_min_pct.
      if ((mediana - pf.centavos) * 100 < mediana * o.desconto_min_pct) add('bloqueio_desconto');
      pos = posicao(pf.centavos, amostras, c);
      // Bloqueio 3: no menor patamar ou até tolerancia_menor_pct acima dele.
      if (pos !== 'menor' && pos !== 'proximo_menor') add('bloqueio_posicao');
    }
  }

  if (!pf.freteConhecido) add('frete_desconhecido');
  if (ehFonteTerceiros(of)) add('fonte_terceiros');
  if (of.cupom_loja === true || of.eh_cupom_loja === true) add('cupom_loja');
  if (of.tem_imagem !== true) add('sem_imagem');
  if (of.tem_afiliado !== true) add('sem_afiliado'); // Q-16: fail-closed, como tem_imagem

  return {
    destino: motivos.length ? 'revisao' : 'auto',
    motivos,
    desconto_real,
    integridade: det.integridade,
    posicao: pos,
    preco_final: pf.centavos,
    frete_conhecido: pf.freteConhecido,
    mediana_30d: mediana,
    minimo_30d: det.minimo,
    amostras: det.amostras,
    dias_cobertos: det.dias_cobertos,
  };
}

/** P2-19: motivos em texto para o card de revisão ("loja fora da whitelist · frete desconhecido"). */
function textoMotivos(motivos) {
  return (motivos || []).map((m) => MOTIVOS_TEXTO[m] || m).join(' · ');
}

/**
 * P2-17: revalidação imediatamente antes do envio.
 * original/atual: { preco, frete, cupom, cashback } em centavos (como em precoFinal); atual null ou
 * { indisponivel: true } = página fora/esgotada.
 * Cancela (ok:false, motivo 'rejeitada_por_revalidacao') se: indisponível, preço inválido, preço final subiu
 * > 3%, cupom sumiu, ou o frete deixou de ser conhecido.
 * Retorna { ok, motivo, detalhe, preco_antigo, preco_novo, variacao_pct, ts }.
 */
function revalidar(original, atual, cfg) {
  const c = cfg || {};
  const o = opcoes(c);
  const ts = new Date(agoraDe(c.agora)).toISOString();
  const antes = precoFinal(original || {}, c);
  const fora = (detalhe, depois) => ({
    ok: false,
    motivo: 'rejeitada_por_revalidacao',
    detalhe,
    preco_antigo: antes.centavos,
    preco_novo: depois ? depois.centavos : null,
    variacao_pct: depois && antes.centavos && depois.centavos ? pct(depois.centavos - antes.centavos, antes.centavos) : null,
    ts,
  });
  if (!atual || atual.indisponivel === true || atual.disponivel === false || atual.esgotado === true || atual.ok === false) return fora('indisponivel', null);
  const depois = precoFinal(atual, c);
  if (antes.centavos == null || depois.centavos == null) return fora('preco_invalido', depois);
  const tinhaCupom = antes.cupomCentavos > 0;
  if (tinhaCupom && !(depois.cupomCentavos > 0)) return fora('cupom_sumiu', depois);
  if (antes.freteConhecido && !depois.freteConhecido) return fora('frete_desconhecido', depois);
  // Compara no mesmo critério de frete: se o original não tinha frete conhecido, compara sem frete.
  const novoComparavel = antes.freteConhecido ? depois.centavos : depois.centavos - (depois.freteConhecido ? atual.frete : 0);
  if ((novoComparavel - antes.centavos) * 100 > antes.centavos * o.revalidacao_alta_pct) return fora('preco_subiu', depois);
  return {
    ok: true,
    motivo: null,
    detalhe: null,
    preco_antigo: antes.centavos,
    preco_novo: depois.centavos,
    variacao_pct: pct(novoComparavel - antes.centavos, antes.centavos),
    ts,
  };
}

/** Dia (AAAA-MM-DD) em America/Sao_Paulo. */
function diaSP(ms) {
  const d = new Date(ms - 3 * 60 * 60 * 1000); // Brasil sem horário de verão desde 2019
  return d.toISOString().slice(0, 10);
}

/**
 * P2-06 / Q-23: cota diária por canal Telegram de categoria, cobrindo TODOS os publicadores automáticos.
 * postsHoje: linhas de bfx_posts ({ canal | chat_id | destino, ts?, ok?, status? }). Se `ts` vier e
 * cfg.agora também, só contam as do mesmo dia (São Paulo). Linhas sem ts contam (conservador).
 * Linhas com ok === false ou status 'erro'/'falhou' não contam (não saíram).
 * cfg: { max_dia (5) } ou { ritmo: { max_dia } }, mais { agora }.
 * Retorna { ok, usados, restantes, max }. Canal vazio = ok:false.
 */
function cotaCanal(postsHoje, canal, cfg) {
  const c = cfg || {};
  let max = c.max_dia != null ? Number(c.max_dia) : c.ritmo && c.ritmo.max_dia != null ? Number(c.ritmo.max_dia) : PADRAO_DESCONTO.max_dia;
  if (!Number.isFinite(max) || max < 0) max = PADRAO_DESCONTO.max_dia;
  max = Math.floor(max);
  const alvo = String(canal == null ? '' : canal).trim();
  if (!alvo) return { ok: false, usados: 0, restantes: 0, max };
  const hoje = c.agora != null ? diaSP(agoraDe(c.agora)) : null;
  const usados = (Array.isArray(postsHoje) ? postsHoje : []).filter((r) => {
    if (!r) return false;
    const id = String(r.canal != null ? r.canal : r.chat_id != null ? r.chat_id : r.destino != null ? r.destino : '').trim();
    if (id !== alvo) return false;
    if (r.ok === false || /^(erro|falhou|falha)$/i.test(String(r.status || ''))) return false;
    if (hoje && r.ts != null && r.ts !== '') {
      const t = tsDe(r.ts);
      if (Number.isFinite(t) && diaSP(t) !== hoje) return false;
    }
    return true;
  }).length;
  const restantes = Math.max(0, max - usados);
  return { ok: restantes > 0, usados, restantes, max };
}

module.exports = {
  PADRAO_DESCONTO,
  WHITELIST_AUTO,
  CATEGORIAS_SENSIVEIS_DESCONTO,
  PALAVRAS_SENSIVEIS,
  MOTIVOS_TEXTO,
  amostrasDeBfxPrecos,
  mediana30d,
  minimo30d,
  precoFinal,
  integridade,
  integridadeDetalhe,
  posicao,
  lojaNaWhitelist,
  sensiveis,
  avaliarAutoPublicacao,
  textoMotivos,
  revalidar,
  cotaCanal,
};
