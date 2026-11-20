'use strict';
// Arrumação do supergrupo pelo setup: descrição, General → 💬 Conversa,
// mensagens fixadas (segurança, "Comece aqui" e uma por tópico) e tópicos de oferta fechados.
// grupo.textos: pendente = arruma (uma vez só) · atualizar = reescreve os textos já fixados, sem mandar nada novo
// · limpar = apaga TODAS as mensagens do grupo (menos a criação dos tópicos) e arruma de novo · ok = não mexe.
const { chamada, paraAdmins, linkCanal } = require('./telegram');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const TEXTO_TOPICO = {
  top: [
    '🔥 Ofertas relâmpago, bugs de preço, cupons ativos, liquidações e quedas expressivas conferidas na hora — aqui cai a nata de todas as lojas.',
    '✅ Só entra preço real (sem "metade do dobro") e compra direta no site/app oficial.',
    '🔔 Dica de ouro: se for deixar só um grupo com notificação ligada, escolha este — bug de preço acaba em minutos.',
  ],
  saude: [
    '💊 Sua curadoria diária de whey, creatina, vitaminas, multivitamínicos, suplementos esportivos, primeiros socorros, cuidados musculares, termômetros, inaladores e higiene pessoal.',
    '✅ Só farmácia oficial e marca original — com cálculo automático por dose/unidade quando aplicável para você saber se compensa de verdade.',
    '🔔 Ative as notificações para garantir reposição pagando menos antes de zerar o pote.',
  ],
  auto: [
    '🚗 Tudo para cuidar da sua máquina na garagem ou na estrada: estética automotiva, ceras, polidores, aspiradores, calibradores, suportes, câmeras veiculares, som, ferramentas, capacetes e acessórios para moto.',
    '✅ Monitoramento contínuo em lojas confiáveis, com histórico real de preço e parcelamento sem juros informado quando disponível.',
    '🔔 Deixe o sininho ligado para pegar kits de lavagem, acessórios e equipamentos de pilotagem no menor valor.',
  ],
  beleza: [
    '💄 O cantinho da sua rotina de skincare e maquiagem: protetor solar, séruns, dermocosméticos, hidratantes, bases, batons, máscaras capilares, secadores, chapinhas e cuidados com o corpo.',
    '✅ Curadoria em lojas 100% oficiais (Época, Beleza na Web, Sephora, Boticário, Natura, Creamy, Ikesaki, Amazon e ML) — produto original sempre.',
    '🔔 Ative as notificações: cupom acumulativo de beleza costuma esgotar rápido.',
  ],
  perfumes: [
    '✨ Fragrâncias para marcar presença pagando justo: perfumes nacionais, importados, masculinos, femininos, árabes, Eau de Parfum, colônias, águas perfumadas e body splash.',
    '✅ Só loja confiável e perfume lacrado de procedência garantida — sem réplica, sem preço inflado.',
    '🔔 Deixe o alerta ligado: quando um importado clássico ou árabe desejado despenca, voa do estoque.',
  ],
  tech: [
    '💻 Monitores, smartphones, tablets, Kindle, smartwatches, fones, TVs, notebooks, PC gamer, SSDs, periféricos, roteadores, power banks e acessórios de setup.',
    '✅ Queda real verificada em KaBuM!, Terabyte, Pichau, Samsung, Acer, Motorola, Amazon e ML — trazendo Pix e parcelamento sem juros reais quando a loja informa.',
    '🔔 Ative as notificações para não perder upgrade de setup e combos de alto desconto.',
  ],
  bebe: [
    '👶 Economia de verdade na rotina com os pequenos: fraldas, lenços umedecidos, pomadas, higiene infantil, mamadeiras, carrinhos, cadeirinhas, berços, brinquedos educativos e material infantil.',
    '✅ Cálculo automático por tira/unidade nas fraldas e estoque conferido em lojas oficiais para você estocar com segurança.',
    '🔔 Deixe o sininho ativo: promoção forte de fralda e lenço umedecido esgota muito rápido.',
  ],
  casa: [
    '🏠 Para deixar o lar mais prático e bonito: geladeiras, máquinas de lavar, air fryer, robôs aspiradores, cafeteiras, ar-condicionado, panelas, garrafas térmicas, móveis, cama/mesa/banho, limpeza e ferramentas.',
    '✅ Preço real conferido direto nas lojas oficiais (Brastemp, Consul, Electrolux, Polishop, Amazon, ML e Magalu), com Pix e parcelas sem juros reais.',
    '🔔 Ative as notificações e garanta o eletro da sua lista no menor preço.',
  ],
  moda: [
    '👗 Roupas femininas, masculinas, plus size e fitness, tênis casuais e de corrida, calçados, bolsas, mochilas, malas, relógios, óculos, joias e artigos esportivos.',
    '✅ Achados selecionados em Nike, Adidas, Olympikus, Mizuno, Centauro, Netshoes, FARM Rio, Renner, C&A, Hering, Shein, Shopee e ML.',
    '🔔 Numeração popular acaba primeiro — deixe as notificações ligadas para pegar seu tamanho antes de esgotar.',
  ],
  kpop: [
    '💿 Álbuns oficiais lacrados (contando nos charts Hanteo/Circle), lightsticks, photocards, photobooks, merch de turnê, pelúcias e colecionáveis de diversos grupos e solistas.',
    '✅ Variedade real de grupos e curadoria rigorosa só de lojas verificadas (Hopes Color, KpopAlbums, UMusic, Kline Store, Kpop&You, Amazon e Shopee) — zero fanmade ou livro aleatório.',
    '🔔 Ative o sininho para garantir a versão do seu bias e edições limitadas antes de esgotarem.',
  ],
  pet: [
    '🐾 Tudo para manter o pote cheio e o pet feliz: rações para cães e gatos, petiscos, sachês, suplementos, areia, tapetes higiênicos, brinquedos, camas, arranhadores, fontes de água e banho & tosa.',
    '✅ Monitoramento constante em Petz, Cobasi, Petlove, Amazon e ML, destacando economia real em pacotes grandes e combos.',
    '🔔 Deixe o alerta ligado para economizar todo mês na ração e na areia do seu pet.',
  ],
  livros: [
    '📚 Ficção, romance, fantasia, suspense, desenvolvimento pessoal, negócios, biografias, HQs, mangás, boxes de coleções, livros infantis, didáticos, e-books e audiolivros.',
    '✅ Acompanhamento diário de quedas reais em boxes, capa dura e lançamentos — sem enganação de preço.',
    '🔔 Ative as notificações para finalmente tirar os livros da sua lista de desejos pagando bem menos.',
  ],
  papelaria: [
    '✏️ Cadernos, planners, agendas, canetas, marca-textos, lápis de cor, lettering, pintura, scrapbook, artesanato, crochê/tricô, máquinas de corte, tintas, etiquetadoras e organização de home office.',
    '✅ Curadoria em Kalunga, Amazon, ML e lojas oficiais com cupons e kits que realmente valem a pena.',
    '🔔 Deixe o sininho ligado para montar seu cantinho de estudos, trabalho ou arte economizando.',
  ],
  mercado: [
    '🛒 Achadinhos para as compras do mês: cafés especiais e cápsulas, azeites, chás, massas, grãos, bebidas, cervejas, vinhos, energéticos, congelados, combos e itens gourmet.',
    '✅ Descontos reais e cupons de supermercado direto nos sites/apps oficiais para aliviar o carrinho sem abrir mão da qualidade.',
    '🔔 Ative as notificações para aproveitar combos relâmpago de despensa e bebidas.',
  ],
};

const AFILIADO = (m) =>
  `<i>O ${esc(m)} participa de programas de afiliados (Amazon, Shopee, Mercado Livre e outros) e pode ganhar comissão pelas compras feitas pelos links, sem custo extra para você. Como Associado da Amazon, ganhamos com compras qualificadas.</i>`;

/** Nome completo do tópico no Telegram (ex.: "✨ Ofertô • Perfumaria"), sem truncar o nome da categoria. */
function nomeTopico(cfg, chave) {
  const c = (cfg && cfg.categorias && cfg.categorias[chave]) || {};
  const marca = (cfg && cfg.marca) || 'Ofertô';
  const base = String(c.nome || chave);
  const completo = base.startsWith(`${marca} •`) ? base : `${marca} • ${base}`;
  return `${c.emoji ? `${c.emoji} ` : ''}${completo}`.slice(0, 128);
}

/** Link para um tópico do supergrupo: https://t.me/c/<id sem -100>/<thread>. */
function linkTopico(grupoId, threadId) {
  const interno = String(grupoId || '').replace(/^-100/, '');
  return interno && /^\d+$/.test(interno) && threadId ? `https://t.me/c/${interno}/${threadId}` : '';
}

/**
 * Textos do grupo. topicos (opcional): { chave: thread_id } para os links do "Comece aqui"
 * (padrão: os gravados na config).
 */
function textosGrupo(cfg, topicos) {
  const m = cfg.marca;
  const tg = cfg.telegram || {};
  const th = topicos || tg.topicos || {};
  const descricao = `${m}: ofertas reais (90d), cupons e alertas. Tech, Casa, Moda, Beleza, Perfumaria, Saúde, Bebês, Auto, Pet, Livros, Papelaria, K-Pop e Mercado. Contém links de afiliado.`;

  const listaTopicos = Object.entries(cfg.categorias).map(([k, c]) => {
    const url = linkTopico(tg.grupo_id, th[k]);
    const nome = url ? `<a href="${esc(url)}">${esc(c.nome)}</a>` : `<b>${esc(c.nome)}</b>`;
    return `${c.emoji} ${nome}`;
  });
  const canais = Object.entries(cfg.categorias).map(([k, c]) => [c, linkCanal(cfg, k)]).filter(([, l]) => l)
    .map(([c, l]) => `<a href="${esc(l)}">${c.emoji} ${esc(c.nome)}</a>`);
  const convite = tg.grupo_link
    ? `📣 Indique o grupo: ${esc(tg.grupo_link)}`
    : '📣 Conhece alguém que ama economizar? Chame para o grupo.';
  const comece = [
    `👋 <b>Comece aqui</b>`,
    `Bem-vindo ao <b>${esc(m)}</b>! Só entra preço real (sem metade do dobro), com cupons prontos e cálculo por unidade/tira.`,
    '',
    '<b>Tópicos</b>',
    ...listaTopicos,
    '🔕 Silencie os tópicos que não quiser.',
    ...(canais.length ? ['📢 Canais individuais: ' + canais.join(' · ')] : []),
    '',
    '<b>💬 Comentários &amp; Regras</b>',
    '• Comente e tire dúvidas respondendo direto em qualquer oferta.',
    '• 🎟️ Saiu alerta de cupom (ML/Shopee)? Resgate na hora na aba da loja — vários só ficam ativos depois pra quem salvou antes na conta.',
    '• Achou promoção oficial? Mande sua sugestão com link respondendo num post · Use <code>/alerta produto</code> no bot.',
    '• Sem spam, links de outros grupos ou DM não solicitada. 🚨 Viu abuso? Responda com <code>/admin</code> para denunciar.',
    '',
    convite,
    '<i>Contém links de afiliado.</i>',
  ].join('\n');
  const seguranca = [
    '🔒 <b>Segurança &amp; Preço Real</b>',
    `• O ${esc(m)} <b>nunca</b> chama no privado nem pede Pix — toda compra acontece direto no site/app oficial da loja.`,
    '• Só postamos no menor preço dos últimos 90 dias (ou "desde DD/MM" em históricos curtos), com data e hora.',
    '• 👤 <b>Dados:</b> guardamos apenas código embaralhado, nome do link de convite e data de entrada/saída (sem nome, @ ou telefone). Quer apagar o seu? Chame um admin.',
    '',
    AFILIADO(m),
  ].join('\n');
  const topicosTx = {};
  for (const [k, c] of Object.entries(cfg.categorias)) {
    const linhas = (TEXTO_TOPICO[k] || []).filter(Boolean).map(esc);
    topicosTx[k] = [
      `${c.emoji} <b>${esc(c.nome)}</b>`,
      ...linhas,
      '💬 Comente nas ofertas · 🚨 Denuncie spam respondendo <code>/admin</code> · <i>Contém links de afiliado.</i>',
    ].filter(Boolean).join('\n');
  }
  // regras: nome antigo da mensagem "Comece aqui" (grupos arrumados antes guardam essa chave).
  return { descricao: descricao.slice(0, 255), comece, regras: comece, seguranca, topicos: topicosTx };
}

/** Une os tópicos já gravados na config com os criados nesta execução do setup. */
function topicosAtuais(cfg, criados) {
  const t = Object.assign({}, cfg.telegram.topicos);
  for (const c of criados || []) {
    const m = String(c.chave).match(/^topico\.(\w+)$/);
    if (m && Number(c.valor)) t[m[1]] = Number(c.valor);
  }
  return t;
}

const NOME_PASSO = (cfg, chave) =>
  chave === 'comece' || chave === 'regras' ? 'Comece aqui' : chave === 'seguranca' ? 'segurança' : `texto de ${cfg.categorias[chave] ? cfg.categorias[chave].nome : chave}`;

/**
 * 1ª rodada de chamadas.
 * pendente: só roda com grupo_id, todos os tópicos criados e o grupo sem mensagem fixada (trava contra duplicar).
 * atualizar: edita as mensagens gravadas em grupo.mensagens; não manda nada novo.
 * As mensagens com ref.fixar são fixadas na 2ª rodada (precisam do message_id).
 */
/** Faixas de message_id para o modo limpar (deleteMessages aceita até 100 por chamada; os inexistentes são pulados). */
function faixasLimpeza(cfg, topicos, fixadaId) {
  const protegidos = new Set(Object.values(topicos).map(Number));
  const conhecidos = [fixadaId || 0, ...protegidos, ...Object.values(cfg.telegram.grupo_mensagens || {}).map(Number)];
  const ate = Math.max(1500, ...conhecidos) + 500;
  const faixas = [];
  for (let ini = 1; ini <= ate; ini += 100) {
    const ids = [];
    for (let id = ini; id < ini + 100 && id <= ate; id++) if (!protegidos.has(id)) ids.push(id);
    if (ids.length) faixas.push(ids);
  }
  return faixas;
}

function arrumarGrupoChamadas(cfg, criados, grupoTemFixada, fixadaId) {
  const tg = cfg.telegram;
  if (!tg.grupo_id) return [];
  const topicos = topicosAtuais(cfg, criados);
  const tx = textosGrupo(cfg, topicos);
  const chat_id = tg.grupo_id;
  const g = (metodo, payload, ref) => chamada('grupo', metodo, Object.assign({ chat_id }, payload), ref);
  const html = { parse_mode: 'HTML', link_preview_options: { is_disabled: true } };
  // 'regras' é a chave antiga do "Comece aqui": quem já tem ela gravada continua sendo atualizado.
  const texto = (chave) => (chave === 'comece' || chave === 'regras' ? tx.comece : chave === 'seguranca' ? tx.seguranca : tx.topicos[chave]);

  if (tg.grupo_textos === 'atualizar') {
    const ids = tg.grupo_mensagens || {};
    const cs = [g('setChatDescription', { description: tx.descricao }, { passo: 'descrição do grupo' })];
    for (const [k, c] of Object.entries(cfg.categorias)) {
      if (Number(topicos[k]) > 1) {
        cs.push(g('editForumTopic', { message_thread_id: topicos[k], name: nomeTopico(cfg, k) }, { passo: `renomear ${c.nome}` }));
      }
    }
    for (const [chave, id] of Object.entries(ids)) {
      if (texto(chave)) cs.push(g('editMessageText', Object.assign({ message_id: id, text: texto(chave) }, html), { passo: NOME_PASSO(cfg, chave), chave }));
    }
    for (const k of Object.keys(cfg.categorias)) {
      if (topicos[k] && !ids[k] && tx.topicos[k]) {
        cs.push(g('sendMessage', Object.assign({ message_thread_id: topicos[k], text: tx.topicos[k] }, html), { passo: NOME_PASSO(cfg, k), fixar: true, chave: k }));
      }
    }
    return cs;
  }

  const limpar = tg.grupo_textos === 'limpar';
  if (!limpar && (tg.grupo_textos !== 'pendente' || grupoTemFixada)) return [];
  const chaves = Object.keys(cfg.categorias);
  if (!chaves.every((k) => topicos[k])) return [];
  const cs = [];
  if (limpar) {
    // Apagar a mensagem de criação de um tópico apaga o tópico inteiro: esses IDs ficam de fora.
    faixasLimpeza(cfg, topicos, fixadaId).forEach((ids, i) => cs.push(g('deleteMessages', { message_ids: ids }, { passo: `limpeza ${i + 1}`, limpeza: true })));
    for (const k of chaves) cs.push(g('reopenForumTopic', { message_thread_id: topicos[k] }, { passo: `reabrir ${cfg.categorias[k].nome}`, limpeza: true }));
  }
  cs.push(
    g('setChatDescription', { description: tx.descricao }, { passo: 'descrição do grupo' }),
    g('editGeneralForumTopic', { name: '📌 Regras & Segurança' }, { passo: 'General → 📌 Regras & Segurança' }),
    // A última fixada aparece no topo: segurança primeiro, "Comece aqui" por último.
    g('sendMessage', Object.assign({ text: tx.seguranca }, html), { passo: 'segurança', fixar: true, chave: 'seguranca' }),
    g('sendMessage', Object.assign({ text: tx.comece }, html), { passo: 'Comece aqui', fixar: true, chave: 'comece' }),
    g('closeGeneralForumTopic', {}, { passo: 'fechar tópico geral' }),
    g('hideGeneralForumTopic', {}, { passo: 'ocultar tópico geral' }),
  );
  for (const k of chaves) {
    cs.push(g('sendMessage', Object.assign({ message_thread_id: topicos[k], text: tx.topicos[k] }, html), { passo: NOME_PASSO(cfg, k), fixar: true, chave: k }));
  }
  if (tg.fechar_topicos_oferta) {
    for (const k of chaves) {
      cs.push(g('closeForumTopic', { message_thread_id: topicos[k] }, { passo: `fechar ${cfg.categorias[k].nome}`, limpeza: true }));
    }
  }
  return cs;
}

/** 2ª rodada: fixa as mensagens enviadas. Sem nada a fixar, devolve um getMe para o fluxo seguir até o resumo. */
function fixarChamadas(chamadas, respostas, cfg) {
  const out = [];
  chamadas.forEach((c, i) => {
    const r = respostas[i] || {};
    if (c.ref && c.ref.fixar && r.ok && r.result && r.result.message_id) {
      out.push(chamada('grupo', 'pinChatMessage', { chat_id: cfg.telegram.grupo_id, message_id: r.result.message_id, disable_notification: true }, { passo: 'fixar ' + c.ref.passo }));
    }
  });
  return out.length ? out : [chamada('grupo', 'getMe', {}, { passo: 'nada para fixar' })];
}

const ERROS = [
  [/not enough rights|CHAT_ADMIN_REQUIRED|need administrator rights|have no rights/i, 'falta permissão de admin para o bot publicador'],
  [/TOPIC_NOT_MODIFIED|not modified/i, null], // já estava assim: não é erro
  [/Too Many Requests|retry after/i, 'o Telegram pediu para ir mais devagar'],
  [/message to edit not found|MESSAGE_ID_INVALID/i, 'a mensagem foi apagada'],
  [/socket|ECONN|ETIMEDOUT|network/i, 'falha de conexão'],
];

function resumoGrupo(chamadas, respostas, cfg) {
  const falhas = [];
  const limpar = cfg.telegram.grupo_textos === 'limpar';
  const mensagens = limpar ? {} : Object.assign({}, cfg.telegram.grupo_mensagens || {});
  chamadas.forEach((c, i) => {
    const r = respostas[i] || {};
    if (c.metodo === 'getMe') return;
    if (c.ref && c.ref.limpeza && !r.ok) {
      // Faixa sem nada para apagar ou tópico já aberto: normal. Só falta de permissão vira aviso.
      const d = r.description || (r.error && r.error.message) || '';
      if (/not enough rights|CHAT_ADMIN_REQUIRED|need administrator rights|have no rights/i.test(d)) falhas.push(`❌ ${c.ref.passo}: falta a permissão Apagar mensagens para o bot publicador`);
      return;
    }
    if (r.ok) {
      if (c.metodo === 'sendMessage' && c.ref.chave && r.result && r.result.message_id) mensagens[c.ref.chave] = r.result.message_id;
      return;
    }
    const d = r.description || (r.error && r.error.message) || 'sem resposta';
    const e = ERROS.find(([re]) => re.test(d));
    if (e && e[1] === null) return;
    falhas.push(`❌ ${c.ref.passo}: ${e ? e[1] : d}`);
  });
  const atualizar = cfg.telegram.grupo_textos === 'atualizar';
  const texto = falhas.length
    ? [
        `🧩 Grupo: ${falhas.length} ${falhas.length === 1 ? 'item ficou' : 'itens ficaram'} pendente${falhas.length === 1 ? '' : 's'}`,
        ...falhas,
        '',
        'Faça à mão no app (fechar: segure o tópico → Fechar · fixar: segure a mensagem → Fixar). O setup não repete, para não duplicar mensagens.',
      ].join('\n')
    : atualizar
      ? '🧩 Textos do grupo atualizados.'
      : limpar
        ? '🧹 Grupo limpo e arrumado de novo: tópico Geral ocultado/fechado, segurança e "👋 Comece aqui" fixados, e todos os tópicos abertos para comentários nas ofertas.'
      : '🧩 Grupo arrumado: tópico Geral ocultado/fechado, segurança e "👋 Comece aqui" fixados, e todos os tópicos liberados para comentários nas ofertas.';
  const config = [{ chave: 'grupo.textos', valor: 'ok' }];
  if (Object.keys(mensagens).length) config.push({ chave: 'grupo.mensagens', valor: JSON.stringify(mensagens) });
  return { texto, config, chamadas: paraAdmins(cfg, texto.slice(0, 4000)) };
}

module.exports = { textosGrupo, linkTopico, nomeTopico, arrumarGrupoChamadas, fixarChamadas, resumoGrupo, topicosAtuais, faixasLimpeza };
