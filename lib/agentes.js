'use strict';
// Núcleo dos 5 Agentes Autônomos do Ofertô (custo R$ 0):
// 1. Caçador Multi-Fonte (Promobit + Canais Telegram Curados + Gatry + Desempacotador 3 saltos)
// 2. Auditor de Preço & Prova Social (Zoom + Amazon + recalibragem de âncora + comparativo no post)
// 3. Marketing, Anti-Fadiga & Sazonalidade (diversidade 90min, boost de afiliado, Esquenta 18h45)
// 4. Concierge 24/7 & Retenção (pedidos em linguagem natural no chat/DM + sinônimos em buscas e alertas)
// 5. Guardião 30min & Operação Zero-Toque (expiradas, queda extra >=6%, limpeza >18h, piloto compacto, WhatsApp API)

const { truncar } = require('./util');
const { nomeLoja } = require('./lojas');
const { bateTermoInteligente, normalizarBusca } = require('./extrator');
const { temAfiliadoAtivo } = require('./links');

const CATALOGO_AGENTES = [
  {
    id: 'cacador',
    numero: 1,
    emoji: '🕵️',
    nome: 'Caçador Multi-Fonte',
    chave: 'agentes.cacador',
    resumo: 'Varre Promobit, @canaltechofertas, @xetdaspromocoes e Gatry a cada 2 min, desempacotando links curtos e limpando tags alheias.',
  },
  {
    id: 'auditor',
    numero: 2,
    emoji: '⚖️',
    nome: 'Auditor de Preço & Prova Social',
    chave: 'agentes.auditor',
    resumo: 'Audita o valor no Zoom + Amazon antes de publicar, trava metade do dobro e mostra referência concorrente no post.',
  },
  {
    id: 'marketing',
    numero: 3,
    emoji: '📣',
    nome: 'Marketing, Anti-Fadiga & Sazonalidade',
    chave: 'agentes.marketing',
    resumo: 'Alterna categorias/lojas contra fadiga (90 min), prioriza lojas com afiliado ativo e dispara Esquenta 18h45 / Top 5 21h15.',
  },
  {
    id: 'concierge',
    numero: 4,
    emoji: '🤝',
    nome: 'Concierge 24/7 & Retenção',
    chave: 'agentes.concierge',
    resumo: 'Responde pedidos naturais no chat aberto e DM ("tem air fryer até 300?"), expande sinônimos e cria alertas 1-toque.',
  },
  {
    id: 'guardiao',
    numero: 5,
    emoji: '🛡️',
    nome: 'Guardião 30min & Zero-Toque',
    chave: 'agentes.guardiao',
    resumo: 'Monitora ofertas a cada 30 min, encerra esgotadas, atualiza quedas extras (>=6%), limpa pendentes >18h e espelha WhatsApp API.',
  },
];

function agenteAtivo(cfg, id) {
  const ag = (cfg && cfg.agentes) || {};
  if (ag[id] === false) return false;
  if (id === 'cacador' && cfg && cfg.radar && cfg.radar.ativo === false) return false;
  if (id === 'auditor' && cfg && cfg.mercado && cfg.mercado.checar === false) return false;
  if (id === 'guardiao' && cfg && cfg.guardiao && cfg.guardiao.ativo === false) return false;
  return true;
}

const GRUPOS_SINONIMOS_CHAT = [
  ['ps5', 'playstation 5'],
  ['dualsense', 'controle ps5', 'controle sem fio ps5'],
  ['airfryer', 'air fryer', 'fritadeira eletrica', 'fritadeira sem oleo'],
  ['iphone', 'apple iphone'],
  ['s24', 'galaxy s24', 'samsung s24'],
  ['s25', 'galaxy s25', 'samsung s25'],
  ['robo aspirador', 'aspirador robo'],
  ['whey', 'whey protein'],
  ['fone bluetooth', 'fone sem fio', 'earbuds', 'headphone bluetooth'],
  ['smart tv', 'tv 4k', 'televisor'],
  ['geladeira', 'refrigerador'],
  ['notebook', 'laptop'],
  ['creatina', 'creatine'],
  ['perfume arabe', 'lattafa', 'afnan', 'armaf'],
  ['protetor solar', 'filtro solar'],
  ['fralda pampers', 'pampers'],
];

/** Expande um termo de busca ou alerta pessoal com sinônimos comuns do e-commerce brasileiro. */
function expandirSinonimosBusca(termo) {
  const orig = String(termo || '').trim();
  const norm = normalizarBusca(orig).trim();
  if (!norm) return [];
  const normPadded = ' ' + norm + ' ';
  const saida = [orig];
  const vistos = new Set([norm]);

  for (const grupo of GRUPOS_SINONIMOS_CHAT) {
    const match = grupo.find((g) => norm === g || normPadded.includes(' ' + g + ' '));
    if (!match) continue;
    for (const alt of grupo) {
      const variante = norm === match ? alt : normPadded.split(' ' + match + ' ').join(' ' + alt + ' ').trim();
      if (variante && !vistos.has(variante)) {
        vistos.add(variante);
        saida.push(variante);
      }
    }
  }
  return saida;
}

/** Testa correspondência inteligente usando o termo original e seus sinônimos expandidos. */
function bateTermoComSinonimos(textoAlvo, termo) {
  for (const variante of expandirSinonimosBusca(termo)) {
    if (bateTermoInteligente(textoAlvo, variante)) return true;
  }
  return false;
}

const LOJAS_CONCIERGE = [
  { rx: /\b(?:mercado\s*livre|meli|ml)\b/i, loja: 'ml' },
  { rx: /\b(?:amazon|amz)\b/i, loja: 'amazon' },
  { rx: /\bshopee\b/i, loja: 'shopee' },
  { rx: /\bshein\b/i, loja: 'shein' },
  { rx: /\bkabum\b/i, loja: 'kabum' },
  { rx: /\bpichau\b/i, loja: 'pichau' },
  { rx: /\bterabyte\b/i, loja: 'terabyte' },
  { rx: /\b(?:o\s+)?boticario\b/i, loja: 'boticario' },
  { rx: /\bnatura\b/i, loja: 'natura' },
  { rx: /\bsephora\b/i, loja: 'sephora' },
  { rx: /\bepoca\b/i, loja: 'epocacosmeticos' },
  { rx: /\bbeleza\s+na\s+web\b/i, loja: 'belezanaweb' },
];

const RE_SAUDACAO_COMUM = /\b(?:oi\s+pessoal|bom\s+dia|boa\s+tarde|boa\s+noite|tudo\s+bem|j[aá]\s+comprei|obrigad[oa]|valeu\s+pessoal|n[aã]o\s+quero|chegou\s+aqui)\b/i;
const RE_PEDIDO_CUPOM = /\b(?:tem\s+(?:algum\s+)?cupom|algum\s+cupom|saiu\s+cupom|cupom\s+(?:ativo|novo|hoje|dispon[ií]vel|do|da|de|pro|pra|mercado\s*livre|ml|shopee|amazon|shein|kabum|pichau|terabyte|boticario|natura|sephora|epoca|beleza\s+na\s+web)|quais?\s+(?:os\s+)?cupons|algu[eé]m\s+(?:tem|sabe)\s+(?:um\s+)?cupom)\b/i;
const RE_PEDIDO_PRODUTO = /(?:\b(?:procuro|procurando|busco|buscando|quero\s+(?:comprar|achar|pegar|um|uma)|preciso\s+(?:comprar|de\s+um|de\s+uma)|indicam?\s+(?:um|uma|algum[a]?)|indica[cç][aã]o\s+de)\b|\btem\s+(?:algum[a]?\s+)?(?:promo[cç][aã]o|oferta)\s+(?:de|da|do)\b|\balgu[eé]m\s+(?:viu|tem|sabe\s+de)\s+(?:promo[cç][aã]o|oferta|algum|alguma|bom|boa)\b|\b(?:promo[cç][aã]o|oferta)\s+(?:boa\s+)?de\s+\S+|\btem\s+[a-z0-9À-ÿ]{3,}.*(?:\?|at[eé]\s*(?:r\$\s*)?\d+|barat[ao]))/i;
const TERMOS_VAGOS = /^(?:algo|coisa|coisas|produto|produtos|oferta|ofertas|promocao|promocoes|promoção|promoções|link|links|aqui|isso|esse|essa|nada|hoje|gente|pessoal|galera|grupo)$/i;

/**
 * Detecta perguntas naturais de intenção de compra/cupom feitas por membros no chat aberto ou DM.
 * Mantém conversas comuns ("oi pessoal", "esse", "top") fora da fila com segurança.
 */
function detectarPedidoOfertaChat(texto) {
  const bruto = String(texto || '').trim();
  if (!bruto || bruto.length < 8 || bruto.length > 180) return null;
  if (bruto.startsWith('/') || /https?:\/\//i.test(bruto)) return null;
  if (RE_SAUDACAO_COMUM.test(bruto)) return null;

  if (RE_PEDIDO_CUPOM.test(bruto)) {
    const achada = LOJAS_CONCIERGE.find((item) => item.rx.test(bruto));
    return { modo: 'concierge', eh_cupom: true, termo: achada ? achada.loja : '', preco_max: 0 };
  }

  if (!RE_PEDIDO_PRODUTO.test(bruto)) return null;

  let precoMax = 0;
  let limpo = bruto;
  const mTeto = limpo.match(/\b(?:at[eé]|abaixo\s+de|no\s+m[aá]x(?:imo)?|por\s+at[eé]|menos\s+de)\s*(?:R\$\s*)?(\d{1,5}(?:[.,]\d{1,2})?)\b/i)
    || limpo.match(/\bR\$\s*(\d{1,5}(?:[.,]\d{1,2})?)\b/i);
  if (mTeto) {
    precoMax = Number(String(mTeto[1]).replace(/\./g, '').replace(',', '.')) || 0;
    limpo = limpo.replace(mTeto[0], ' ');
  }

  limpo = limpo
    .replace(/\b(?:algu[eé]m\s+(?:viu|tem|sabe\s+de)|estou\s+procurando|t[oô]\s+procurando|procuro|procurando|busco|buscando|quero\s+(?:comprar|achar|pegar)|preciso\s+(?:comprar|de)|indica[cç][aã]o\s+de|indicam?)\b/gi, ' ')
    .replace(/\b(?:tem\s+)?(?:algum[a]?\s+)?(?:promo[cç][aã]o|oferta)\s+(?:boa\s+)?(?:de|da|do)?\b/gi, ' ')
    .replace(/^\s*tem\b/i, ' ')
    .replace(/\b(?:por\s+favor|pfv|por\s+gentileza|galera|pessoal|grupo|hj|hoje|barat[ao]s?|b[oô]a|bom|em\s+promo[cç][aã]o|na\s+promo[cç][aã]o|com\s+desconto)\b/gi, ' ')
    .replace(/\b(?:um|uma|uns|umas|algum|alguma|algo|de|do|da|pro|pra)\b/gi, ' ')
    .replace(/[?!.,;:"'()[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (limpo.length < 2 || TERMOS_VAGOS.test(limpo)) return null;
  const temToken = limpo.split(' ').some((w) => w.replace(/[^a-z0-9À-ÿ]/gi, '').length >= 2);
  if (!temToken) return null;

  return { modo: 'concierge', eh_cupom: false, termo: truncar(limpo, 80), preco_max: precoMax };
}

/** Penaliza categorias e lojas repetidas nos últimos 90 min para evitar fadiga de nicho/loja no grupo. */
function calcularPenalidadeFadigaRecente(candidato, ofertasRecentes, tsAgora) {
  if (!candidato || !Array.isArray(ofertasRecentes) || !ofertasRecentes.length) return 0;
  const corte = (tsAgora || Date.now()) - 90 * 60000;
  let contCat = 0;
  let contLoja = 0;
  for (const r of ofertasRecentes) {
    if (!r || !r.ts || Number(r.ts) < corte) continue;
    if (r.status !== 'aprovada' && r.status !== 'publicando') continue;
    if (candidato.categoria && r.categoria === candidato.categoria) contCat++;
    if (candidato.loja && r.loja === candidato.loja) contLoja++;
  }
  return Math.min(28, contCat * 7) + Math.min(20, contLoja * 5);
}

/** Concede bônus (+14) a lojas que já possuem programa/código de afiliado ativo gerando comissão. */
function avaliarBoostMarketing(candidato, cfg) {
  const ativo = !!(candidato && candidato.loja && temAfiliadoAtivo(candidato.loja, cfg, candidato.links_manuais));
  return { bonus: ativo ? 14 : 0, afiliado_ativo: ativo };
}

/** Painel de status e controle rápido dos 5 Agentes para o comando `/agentes`. */
function painelAgentes(cfg, metricasOpc) {
  const rad = (cfg && cfg.radar) || {};
  const wa = (cfg && cfg.whatsapp) || {};
  const adm = (cfg && cfg.admin) || {};
  const canaisCurados = rad.canais_curados !== false;
  const m = metricasOpc || {};

  const linhas = [
    `🤖 <b>Ecossistema de 5 Agentes (${(cfg && cfg.marca) || 'Ofertô'})</b> · custo R$ 0`,
    '',
  ];
  for (const ag of CATALOGO_AGENTES) {
    const ativo = agenteAtivo(cfg, ag.id);
    const est = ativo ? '🟢 ATIVO' : '⏸️ PAUSADO';
    linhas.push(`${ag.numero}. ${ag.emoji} <b>${ag.nome}</b> — ${est}`);
    linhas.push(`   <i>${ag.resumo}</i>`);
  }
  linhas.push(
    '',
    '⚙️ <b>Automações extras ligadas:</b>',
    `• Fontes curadas (Canaltech/Xet/Gatry): ${canaisCurados ? 'sim ✅' : 'nao'}`,
    `• Esquenta de Cupons 18h45: ${(cfg && cfg.cupons && cfg.cupons.esquenta_19h !== false) ? 'sim ✅' : 'nao'}`,
    `• Notificação Piloto no Privado: ${adm.notificacao_piloto === 'compacta' ? 'compacta (anti-spam) ✅' : 'completa'}`,
    `• WhatsApp API Zero-Toque: ${wa.webhook_url ? 'configurada ✅' : 'botão manual 1-toque (configure whatsapp.webhook_url se quiser envio automático)'}`,
  );
  if (m.ofertas_24h != null || m.alertas_ativos != null) {
    linhas.push(`• Pulso: ${m.ofertas_24h ?? 0} oferta(s)/24h · ${m.alertas_ativos ?? 0} alerta(s) ativos`);
  }
  linhas.push(
    '',
    'Controles rápidos:',
    '• <code>/agentes pausar 4</code> (ou nome: cacador, auditor, marketing, concierge, guardiao)',
    '• <code>/agentes ligar 4</code> · <code>/agentes ligar todos</code>',
  );
  return linhas.join('\n');
}

function resolverAlvoAgente(tok) {
  const s = String(tok || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!s) return null;
  if (/^[1-5]$/.test(s)) return CATALOGO_AGENTES[Number(s) - 1];
  return CATALOGO_AGENTES.find((a) => a.id === s || a.id.startsWith(s)) || null;
}

/** Interpreta /agentes, /agentes ligar <n|nome|todos>, /agentes pausar <n|nome|todos>. */
function interpretarComandoAgentes(texto, cfg) {
  const limpo = String(texto || '').trim();
  const partes = limpo.split(/\s+/);
  const sub = String(partes[1] || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const alvoTok = partes[2] || '';

  if (!sub || sub === 'status' || sub === 'painel' || sub === 'ajuda') {
    return { upserts: [], mensagem: painelAgentes(cfg) };
  }

  const ligar = ['ligar', 'ativar', 'on', 'sim'].includes(sub);
  const pausar = ['pausar', 'desligar', 'parar', 'off', 'nao'].includes(sub);
  if (ligar || pausar) {
    const val = ligar ? 'sim' : 'nao';
    if (!alvoTok || /^(todos|tudo|all)$/.test(alvoTok.toLowerCase())) {
      return {
        upserts: CATALOGO_AGENTES.map((a) => ({ chave: a.chave, valor: val })),
        mensagem: ligar
          ? '🟢 Todos os 5 Agentes Autônomos foram ativados!'
          : '⏸️ Todos os 5 Agentes foram pausados.',
      };
    }
    const ag = resolverAlvoAgente(alvoTok);
    if (!ag) {
      return {
        upserts: [],
        mensagem: '❗ Agente não reconhecido. Use 1..5 ou o nome: cacador, auditor, marketing, concierge, guardiao.',
      };
    }
    return {
      upserts: [{ chave: ag.chave, valor: val }],
      mensagem: `${ligar ? '🟢' : '⏸️'} ${ag.emoji} <b>Agente ${ag.numero} · ${ag.nome}</b> ${ligar ? 'ativado' : 'pausado'}.`,
    };
  }

  return { upserts: [], mensagem: painelAgentes(cfg) };
}

/**
 * Gera chamadas HTTP opcionais (Zero-Toque) para WhatsApp via Evolution API, WAHA ou Webhook Genérico
 * somente quando `whatsapp.webhook_url` estiver preenchido pelo usuário.
 */
function montarChamadasWhatsAppAuto(oferta, textoGrupo, textoCanal, cfg) {
  const wa = (cfg && cfg.whatsapp) || {};
  const url = String(wa.webhook_url || '').trim();
  if (!url || !oferta) return [];

  const apiKey = String(wa.api_key || '').trim();
  const grupo = String(wa.grupo_destino || '').trim();
  const canal = String(wa.canal_destino || '').trim();

  if (/\/message\/sendText/i.test(url)) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, apiKey ? { apikey: apiKey } : {});
    const reqs = [];
    if (grupo && textoGrupo) reqs.push({ url, headers, body: { number: grupo, text: textoGrupo, linkPreview: true }, destino: 'grupo' });
    if (canal && textoCanal) reqs.push({ url, headers, body: { number: canal, text: textoCanal, linkPreview: true }, destino: 'canal' });
    return reqs;
  }

  if (/\/api\/sendText/i.test(url)) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, apiKey ? { 'X-Api-Key': apiKey } : {});
    const reqs = [];
    if (grupo && textoGrupo) reqs.push({ url, headers, body: { chatId: grupo, text: textoGrupo, session: 'default' }, destino: 'grupo' });
    if (canal && textoCanal) reqs.push({ url, headers, body: { chatId: canal, text: textoCanal, session: 'default' }, destino: 'canal' });
    return reqs;
  }

  const headers = Object.assign(
    { 'Content-Type': 'application/json' },
    apiKey ? { Authorization: `Bearer ${apiKey}`, 'X-Api-Key': apiKey } : {},
  );
  return [{
    url,
    headers,
    destino: 'webhook',
    body: {
      evento: 'oferta_publicada',
      marca: (cfg && cfg.marca) || 'Ofertô',
      oferta_id: oferta.oferta_id || '',
      loja: oferta.loja || '',
      loja_nome: nomeLoja(oferta.loja),
      categoria: oferta.categoria || '',
      titulo: oferta.titulo || '',
      preco: oferta.preco || 0,
      imagem: oferta.imagem || '',
      destino_grupo: grupo,
      destino_canal: canal,
      texto_grupo: textoGrupo || '',
      texto_canal: textoCanal || '',
    },
  }];
}

module.exports = {
  CATALOGO_AGENTES,
  agenteAtivo,
  expandirSinonimosBusca,
  bateTermoComSinonimos,
  detectarPedidoOfertaChat,
  calcularPenalidadeFadigaRecente,
  avaliarBoostMarketing,
  painelAgentes,
  interpretarComandoAgentes,
  montarChamadasWhatsAppAuto,
};
