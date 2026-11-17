'use strict';
// Arrumação do supergrupo pelo setup: descrição, General → 💬 Conversa,
// mensagens fixadas (regras, segurança e uma por tópico) e tópicos de oferta fechados.
// grupo.textos: pendente = arruma (uma vez só) · atualizar = reescreve os textos já fixados, sem mandar nada novo · ok = não mexe.
const { chamada, paraAdmins } = require('./telegram');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const TEXTO_TOPICO = {
  top: 'As 5 melhores ofertas reais do dia, escolhidas a dedo.',
  casa: 'Casa, cozinha e eletro. No verão: ventilador e ar-condicionado.',
  beleza: 'Beleza, perfume e kits de presente.',
  bebe: 'Fralda, lenço, higiene e brinquedos. Sempre que dá, com o preço por unidade.',
  tech: 'Eletrônicos com histórico conferido. Tópico temporário: vai até 31/12.',
};

const AFILIADO = (m) =>
  `<i>O ${esc(m)} participa de programas de afiliados (Amazon, Shopee, Mercado Livre e outros) e pode receber comissão pelas compras feitas pelos links, sem custo extra para você. Como Associado da Amazon, recebemos por compras qualificadas.</i>`;

function textosGrupo(cfg) {
  const m = cfg.marca;
  const descricao = `${m}: promoções que valem a pena. Só desconto real: preço igual ou abaixo do menor dos últimos 90 dias. Silencie os tópicos que não quiser. Contém links de afiliado.`;
  const regras = [
    `💬 <b>Bem-vindo ao ${esc(m)}!</b>`,
    'Aqui só entra desconto real: preço igual ou abaixo do menor dos últimos 90 dias.',
    '',
    '<b>Regras da conversa</b>',
    '1. Respeito. Nada de política ou assunto fora de compras.',
    '2. Proibido divulgar outros grupos, vender ou chamar alguém no privado.',
    '3. Achou uma oferta boa? Mande aqui o link da loja. Se passar no selo, publicamos.',
    '4. Viu preço errado num post? Responda ao post.',
    'Quem descumprir é removido sem aviso.',
    '',
    '🔕 Não quer tudo? Toque num tópico → Silenciar.',
    '<i>Os posts contêm links de afiliado.</i>',
  ].join('\n');
  const seguranca = [
    '🔒 <b>Segurança</b>',
    `O ${esc(m)} <b>nunca</b> pede Pix, pagamento, dados pessoais ou código, e <b>nunca</b> chama ninguém no privado.`,
    'Todo link leva ao site oficial da loja, e você paga direto lá.',
    'Recebeu mensagem no privado em nosso nome? É golpe: bloqueie e denuncie.',
    '',
    '✓ <b>Desconto real</b>',
    'O preço está igual ou abaixo do menor preço dos últimos 90 dias, pelo nosso histórico ou por um comparador citado como fonte. Oferta sem selo não é publicada. Todo post traz a data e a hora do preço, que pode mudar a qualquer momento.',
    '',
    AFILIADO(m) + ' <i>Não coletamos dados de quem entra no grupo.</i>',
  ].join('\n');
  const topicos = {};
  for (const [k, c] of Object.entries(cfg.categorias)) {
    topicos[k] = [
      `${c.emoji} <b>${esc(c.nome)}</b>`,
      TEXTO_TOPICO[k] || '',
      'Toda oferta vem comparada com o menor preço em 90 dias.',
      '',
      'Só o bot posta aqui. Para conversar, use o 💬 Conversa.',
      '<i>Contém links de afiliado.</i>',
    ].join('\n');
  }
  return { descricao: descricao.slice(0, 255), regras, seguranca, topicos };
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

const NOME_PASSO = (cfg, chave) => (chave === 'regras' ? 'regras' : chave === 'seguranca' ? 'segurança' : `texto de ${cfg.categorias[chave].nome}`);

/**
 * 1ª rodada de chamadas.
 * pendente: só roda com grupo_id, todos os tópicos criados e o grupo sem mensagem fixada (trava contra duplicar).
 * atualizar: edita as mensagens gravadas em grupo.mensagens; não manda nada novo.
 * As mensagens com ref.fixar são fixadas na 2ª rodada (precisam do message_id).
 */
function arrumarGrupoChamadas(cfg, criados, grupoTemFixada) {
  const tg = cfg.telegram;
  if (!tg.grupo_id) return [];
  const tx = textosGrupo(cfg);
  const chat_id = tg.grupo_id;
  const g = (metodo, payload, ref) => chamada('grupo', metodo, Object.assign({ chat_id }, payload), ref);
  const html = { parse_mode: 'HTML', link_preview_options: { is_disabled: true } };
  const texto = (chave) => (chave === 'regras' ? tx.regras : chave === 'seguranca' ? tx.seguranca : tx.topicos[chave]);

  if (tg.grupo_textos === 'atualizar') {
    const ids = tg.grupo_mensagens || {};
    const cs = [g('setChatDescription', { description: tx.descricao }, { passo: 'descrição do grupo' })];
    for (const [chave, id] of Object.entries(ids)) {
      if (texto(chave)) cs.push(g('editMessageText', Object.assign({ message_id: id, text: texto(chave) }, html), { passo: NOME_PASSO(cfg, chave), chave }));
    }
    return cs;
  }

  if (tg.grupo_textos !== 'pendente' || grupoTemFixada) return [];
  const topicos = topicosAtuais(cfg, criados);
  const chaves = Object.keys(cfg.categorias);
  if (!chaves.every((k) => topicos[k])) return [];
  const cs = [
    g('setChatDescription', { description: tx.descricao }, { passo: 'descrição do grupo' }),
    g('editGeneralForumTopic', { name: '💬 Conversa' }, { passo: 'General → 💬 Conversa' }),
    g('sendMessage', Object.assign({ text: tx.regras }, html), { passo: 'regras', fixar: true, chave: 'regras' }),
    g('sendMessage', Object.assign({ text: tx.seguranca }, html), { passo: 'segurança', fixar: true, chave: 'seguranca' }),
  ];
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
  const mensagens = Object.assign({}, cfg.telegram.grupo_mensagens || {});
  chamadas.forEach((c, i) => {
    const r = respostas[i] || {};
    if (c.metodo === 'getMe') return;
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
      : '🧩 Grupo arrumado: descrição, regras e segurança fixadas no 💬 Conversa, e cada tópico com o seu texto fixado e fechado para membros.';
  const config = [{ chave: 'grupo.textos', valor: 'ok' }];
  if (Object.keys(mensagens).length) config.push({ chave: 'grupo.mensagens', valor: JSON.stringify(mensagens) });
  return { texto, config, chamadas: paraAdmins(cfg, texto.slice(0, 4000)) };
}

module.exports = { textosGrupo, arrumarGrupoChamadas, fixarChamadas, resumoGrupo, topicosAtuais };
