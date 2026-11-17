'use strict';
// Arrumação do supergrupo pelo setup: descrição, General → 💬 Conversa,
// mensagens fixadas (regras, segurança e uma por tópico) e tópicos de oferta fechados.
const { chamada, paraAdmins } = require('./telegram');

const TEXTO_TOPICO = {
  top: 'As 5 melhores ofertas reais de hoje, todas com ✓ Desconto real. Para ver tudo de uma categoria, abra o tópico dela.',
  casa: 'Casa, cozinha e eletro com histórico de 90 dias. No verão: ventilador e ar-condicionado.',
  beleza: 'Beleza, perfume e kits de presente. Aqui "de R$ 299 por R$ 149" só entra se o R$ 149 for real.',
  bebe: 'Fralda, lenço, higiene e brinquedos. Sempre que dá, mostramos o preço por unidade.',
  tech: '"50% off de quê?" Eletrônicos só com histórico conferido. Tópico temporário: vai até 31/12.',
};

const SELO = [
  '✓ DESCONTO REAL: o que é',
  'O preço está igual ou abaixo do menor preço dos últimos 90 dias.',
  'A referência vem do nosso histórico de preços ou de um comparador de preços citado como fonte. Se houver as duas, vale a mais baixa.',
  'Oferta sem selo não é publicada.',
  'Todo post traz a data e a hora do preço. Preço e estoque podem mudar a qualquer momento.',
].join('\n');

function textosGrupo(cfg) {
  const m = cfg.marca;
  const descricao = `${m}: promoções que valem a pena. Só oferta com ✓ Desconto real: preço igual ou abaixo do menor dos últimos 90 dias. Silencie os tópicos que não quiser. Contém links de afiliado.`;
  const regras = [
    '💬 CONVERSA: REGRAS',
    '1. Respeito. Sem ofensa, política ou assunto fora de compras.',
    '2. Proibido: links de outros grupos, divulgação, venda própria e convite para o privado.',
    '3. Viu uma oferta boa? Mande aqui com o link da loja (sem link de afiliado). Se passar no selo, publicamos.',
    '4. Achou preço errado num post? Responda à mensagem do post que conferimos.',
    '5. Quem descumprir é removido sem aviso.',
    '',
    'Dica: silencie os tópicos que não te interessam (toque no tópico → 🔕).',
  ].join('\n');
  const seguranca = [
    '🔒 SEGURANÇA',
    `A ${m} NUNCA:`,
    '• pede pagamento, Pix ou dados pessoais;',
    '• chama você no privado oferecendo promoção;',
    '• pede código de verificação.',
    'Todas as ofertas levam ao site oficial da loja (Amazon, Shopee, Mercado Livre…), e você paga direto lá.',
    `Recebeu mensagem no privado em nome da ${m}? É golpe: bloqueie e denuncie.`,
    '',
    SELO,
    '',
    `A ${m} participa de programas de afiliados (Amazon, Shopee, Mercado Livre e outros) e pode receber comissão pelas compras feitas pelos links, sem custo extra para você. Como Associado da Amazon, recebemos por compras qualificadas. Não coletamos dados de quem entra no grupo.`,
  ].join('\n');
  const topicos = {};
  for (const [k, c] of Object.entries(cfg.categorias)) {
    topicos[k] = `${c.emoji} ${c.nome.toUpperCase()}\n${TEXTO_TOPICO[k] || ''}\n\nSó o bot e os admins postam aqui. Para conversar, use o 💬 Conversa.\nContém links de afiliado.`;
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

/**
 * 1ª rodada de chamadas. Só roda com grupo_id, todos os tópicos criados e grupo.textos = pendente.
 * As mensagens com ref.fixar são fixadas na 2ª rodada (precisam do message_id).
 */
function arrumarGrupoChamadas(cfg, criados) {
  const tg = cfg.telegram;
  if (!tg.grupo_id || tg.grupo_textos !== 'pendente') return [];
  const topicos = topicosAtuais(cfg, criados);
  const chaves = Object.keys(cfg.categorias);
  if (!chaves.every((k) => topicos[k])) return [];
  const tx = textosGrupo(cfg);
  const chat_id = tg.grupo_id;
  const g = (metodo, payload, ref) => chamada('grupo', metodo, Object.assign({ chat_id }, payload), ref);
  const cs = [
    g('setChatDescription', { description: tx.descricao }, { passo: 'descrição do grupo' }),
    g('editGeneralForumTopic', { name: '💬 Conversa' }, { passo: 'General → 💬 Conversa' }),
    g('sendMessage', { text: tx.regras }, { passo: 'regras no Conversa', fixar: true }),
    g('sendMessage', { text: tx.seguranca }, { passo: 'segurança no Conversa', fixar: true }),
  ];
  for (const k of chaves) {
    cs.push(g('sendMessage', { message_thread_id: topicos[k], text: tx.topicos[k] }, { passo: `texto em ${cfg.categorias[k].nome}`, fixar: true }));
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

const ERROS_PERMISSAO = [
  [/not enough rights|CHAT_ADMIN_REQUIRED|need administrator rights/i, 'falta permissão de admin para o bot publicador'],
  [/TOPIC_NOT_MODIFIED|not modified/i, 'já estava assim'],
  [/Too Many Requests|retry after/i, 'limite de mensagens do Telegram; termine à mão no app ou espere 2 minutos e rode de novo'],
];

function resumoGrupo(chamadas, respostas, cfg) {
  let falhas = 0;
  const linhas = chamadas.map((c, i) => {
    const r = respostas[i] || {};
    if (c.metodo === 'getMe') return null;
    if (r.ok) return `✅ ${c.ref.passo}`;
    const d = r.description || (r.error && r.error.message) || 'sem resposta';
    const dica = (ERROS_PERMISSAO.find(([re]) => re.test(d)) || [])[1];
    if (dica !== 'já estava assim') falhas++;
    return `${dica === 'já estava assim' ? '➖' : '❌'} ${c.ref.passo}: ${dica || d}`;
  }).filter(Boolean);
  const texto = [
    '🧩 Arrumação do grupo',
    ...linhas,
    '',
    falhas
      ? `${falhas} passo(s) falharam. Faça esses passos à mão no app (fechar tópico: segure o tópico → Fechar; fixar: segure a mensagem → Fixar). O setup não repete a arrumação, para não duplicar mensagens.`
      : 'Pronto. Para refazer do zero, apague as mensagens fixadas, mude grupo.textos para pendente e rode o setup.',
  ].join('\n');
  return {
    texto,
    // Sempre ok: repetir a arrumação duplicaria as mensagens que já saíram.
    config: [{ chave: 'grupo.textos', valor: 'ok' }],
    chamadas: paraAdmins(cfg, texto.slice(0, 4000)),
  };
}

module.exports = { textosGrupo, arrumarGrupoChamadas, fixarChamadas, resumoGrupo, topicosAtuais };
