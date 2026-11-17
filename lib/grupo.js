'use strict';
// Arrumação do supergrupo pelo setup: descrição, General → 💬 Conversa,
// mensagens fixadas (segurança, "Comece aqui" e uma por tópico) e tópicos de oferta fechados.
// grupo.textos: pendente = arruma (uma vez só) · atualizar = reescreve os textos já fixados, sem mandar nada novo
// · limpar = apaga TODAS as mensagens do grupo (menos a criação dos tópicos) e arruma de novo · ok = não mexe.
const { chamada, paraAdmins } = require('./telegram');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const TEXTO_TOPICO = {
  top: ['O melhor do dia, de todas as categorias, num lugar só.', '📅 Até 5 ofertas por dia. Se for seguir um tópico só, siga este.'],
  casa: ['Air fryer, aspirador, cafeteira e o que deixa a casa mais fácil. No calor, ventilador e ar-condicionado.', '📅 De 4 a 8 ofertas por dia; na semana da Black Friday, mais.'],
  beleza: ['Perfume, maquiagem, cabelo e kits de presente, sem "de R$ 299 por R$ 149" inventado.', '📅 De 4 a 8 ofertas por dia; na semana da Black Friday, mais.'],
  bebe: ['Fralda, lenço, higiene e brinquedos. Sempre que dá, com o preço por unidade para comparar.', '📅 De 4 a 8 ofertas por dia; na semana da Black Friday, mais.'],
  tech: ['Fone, smartwatch, SSD e carregador com histórico conferido. Chega de "50% off" de mentira.', '📅 De 4 a 8 ofertas por dia, até 31/12.'],
};

const AFILIADO = (m) =>
  `<i>O ${esc(m)} participa de programas de afiliados (Amazon, Shopee, Mercado Livre e outros) e pode ganhar comissão pelas compras feitas pelos links, sem custo extra para você. Como Associado da Amazon, ganhamos com compras qualificadas.</i>`;

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
  const descricao = `${m}: promoções que valem a pena, sem desconto de mentira. Só postamos preço igual ou abaixo do menor dos últimos 90 dias, com data e hora. Top do Dia, Casa, Beleza, Bebê e Tech. Silencie o que não quiser. Contém links de afiliado.`;

  const listaTopicos = Object.entries(cfg.categorias).map(([k, c]) => {
    const url = linkTopico(tg.grupo_id, th[k]);
    const nome = url ? `<a href="${esc(url)}">${esc(c.nome)}</a>` : `<b>${esc(c.nome)}</b>`;
    return `${c.emoji} ${nome}${k === 'top' ? ': o melhor do dia, até 5' : ''}`;
  });
  const convite = tg.grupo_link
    ? `📣 Conhece alguém que ama uma promoção? Mande o link: ${esc(tg.grupo_link)}`
    : '📣 Conhece alguém que ama uma promoção? Chame para o grupo.';
  const comece = [
    `👋 <b>Comece aqui</b>`,
    `Bem-vindo ao <b>${esc(m)}</b>! Aqui só entra oferta que a gente conferiu: preço igual ou abaixo do menor dos últimos 90 dias. Promoção de mentira fica de fora.`,
    '',
    '<b>Escolha o que você quer ver</b>',
    ...listaTopicos,
    '🔕 Silencie o que não quiser: toque no tópico → Silenciar.',
    '',
    '<b>Regras do 💬 Conversa</b>',
    '1. Respeito sempre. Sem política e sem assunto fora de compras.',
    '2. Sem divulgar outros grupos, vender ou chamar no privado.',
    '3. Viu preço errado num post? Responda ao post.',
    '4. Quem descumprir sai sem aviso.',
    '',
    '💡 Achou uma oferta boa? Mande sua sugestão aqui no Conversa, com o link da loja. Se passar no nosso critério, publicamos.',
    convite,
    '',
    '<i>Os posts contêm links de afiliado.</i>',
  ].join('\n');
  const seguranca = [
    '🔒 <b>Segurança e privacidade</b>',
    `O ${esc(m)} <b>nunca</b> pede Pix, pagamento, dados pessoais ou código, e <b>nunca</b> chama ninguém no privado.`,
    'Todo link leva ao site oficial da loja, e você paga direto lá.',
    'Recebeu mensagem no privado em nosso nome? É golpe: bloqueie e denuncie.',
    '',
    '✅ <b>Como conferimos o preço</b>',
    'Só publicamos se o preço estiver igual ou abaixo do menor dos últimos 90 dias, pelo nosso histórico ou por um comparador de preços. Se o histórico do produto for mais curto, o post avisa: "menor preço desde DD/MM". Todo post traz a data e a hora do preço, que pode mudar.',
    '',
    '👤 <b>Seus dados</b>',
    'Para saber quais campanhas trazem gente, guardamos de quem entra ou sai só um código embaralhado, o nome do link de convite e a data. Nada de nome, @ ou telefone. Quer que apaguemos o seu? Mande mensagem a um admin (você chama; a gente nunca chama primeiro).',
    '',
    AFILIADO(m),
  ].join('\n');
  const topicosTx = {};
  for (const [k, c] of Object.entries(cfg.categorias)) {
    const [oQue, freq] = TEXTO_TOPICO[k] || ['', ''];
    topicosTx[k] = [
      `${c.emoji} <b>${esc(c.nome)}</b>`,
      oQue,
      freq,
      '✅ Toda oferta vem comparada com o menor preço dos últimos 90 dias, com data e hora.',
      '',
      '🔔 Quer ser avisado? Deixe as notificações deste tópico ligadas.',
      'Só o bot posta aqui. Para conversar, use o 💬 Conversa.',
      '<i>Contém links de afiliado.</i>',
    ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
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
    for (const [chave, id] of Object.entries(ids)) {
      if (texto(chave)) cs.push(g('editMessageText', Object.assign({ message_id: id, text: texto(chave) }, html), { passo: NOME_PASSO(cfg, chave), chave }));
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
    g('editGeneralForumTopic', { name: '💬 Conversa' }, { passo: 'General → 💬 Conversa' }),
    // A última fixada aparece no topo do 💬 Conversa: segurança primeiro, "Comece aqui" por último.
    g('sendMessage', Object.assign({ text: tx.seguranca }, html), { passo: 'segurança', fixar: true, chave: 'seguranca' }),
    g('sendMessage', Object.assign({ text: tx.comece }, html), { passo: 'Comece aqui', fixar: true, chave: 'comece' }),
  );
  for (const k of chaves) {
    cs.push(g('sendMessage', Object.assign({ message_thread_id: topicos[k], text: tx.topicos[k] }, html), { passo: NOME_PASSO(cfg, k), fixar: true, chave: k }));
  }
  for (const k of chaves) {
    cs.push(g('closeForumTopic', { message_thread_id: topicos[k] }, { passo: `fechar ${cfg.categorias[k].nome}` }));
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
        ? '🧹 Grupo limpo e arrumado de novo: descrição, segurança e "👋 Comece aqui" (no topo) fixadas no 💬 Conversa, e cada tópico com o seu texto fixado e fechado para membros.'
      : '🧩 Grupo arrumado: descrição, segurança e "👋 Comece aqui" (no topo) fixadas no 💬 Conversa, e cada tópico com o seu texto fixado e fechado para membros.';
  const config = [{ chave: 'grupo.textos', valor: 'ok' }];
  if (Object.keys(mensagens).length) config.push({ chave: 'grupo.mensagens', valor: JSON.stringify(mensagens) });
  return { texto, config, chamadas: paraAdmins(cfg, texto.slice(0, 4000)) };
}

module.exports = { textosGrupo, linkTopico, arrumarGrupoChamadas, fixarChamadas, resumoGrupo, topicosAtuais, faixasLimpeza };
