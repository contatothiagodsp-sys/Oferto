'use strict';
// Arrumação do supergrupo pelo setup: descrição, General → 💬 Conversa,
// mensagens fixadas (segurança, "Comece aqui" e uma por tópico) e tópicos de oferta fechados.
// grupo.textos: pendente = arruma (uma vez só) · atualizar = reescreve os textos já fixados, sem mandar nada novo
// · limpar = apaga TODAS as mensagens do grupo (menos a criação dos tópicos) e arruma de novo · ok = não mexe.
const { chamada, paraAdmins, linkCanal } = require('./telegram');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const TEXTO_TOPICO = {
  top: ['🔥 Só os maiores tombos de preço, bugs e cupons fortes. Até 5 ofertas por dia.', '🔔 Se for deixar só um tópico com som ligado, escolha este.'],
  moda: ['👗 Achados de Shein, Shopee e ML, tênis Nike/Adidas, cupons relâmpago e lojas oficiais (Centauro, Renner, C&A).', '📅 Tendências do momento sem desconto maquiado.'],
  casa: ['🏠 Air Fryer, Robô Aspirador, Cafeteiras e Casa Inteligente sem preço inflado.', '📅 Seleção diária dos melhores achados pro lar.'],
  beleza: ['💄 Skincare (Principia, CeraVe, La Roche), Maquiagem e Cabelos com preço conferido.', '📅 Promoções reais com cupom ativo.'],
  perfumes: ['✨ Perfumes Árabes no ML (Lattafa, Asad, Khamrah, Yara), Nicho, Importados, Boticário e Natura.', '📅 Monitoramento direto de lojas oficiais.'],
  saude: ['💊 Creatina, Whey (Growth, Dux, Max), Vitaminas, Oral-B e Farmácias Confiáveis (cálculo por dose).', '📅 Só farmácia oficial e suplemento original.'],
  bebe: ['👶 Fraldas (cálculo automático por tira!), Lenços, Fórmulas Infantis e Brinquedos.', '📅 Ideal pra estocar pagando menos por unidade.'],
  tech: ['💻 PC Gamer (KaBuM!, Terabyte, Pichau), PS5, Xbox, Smartphones e Hardware.', '📅 Só queda real de preço e cupom testado.'],
  kpop: ['💿 Álbuns lacrados (Hanteo/Circle), Lightsticks, Photocards e Merch oficial na Shopee (Record Planet, Kpopmerch, Every Kpop/ALIKO), Amazon, UMusic e K-Line.', '📅 Curadoria de lojas verificadas com envio seguro.'],
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
  const descricao = `${m}: ofertas reais com histórico de 90 dias, cupons e alertas. Tech, Moda, Beleza, Perfumes, Saúde, Casa e Bebê. Contém links de afiliado.`;

  const listaTopicos = Object.entries(cfg.categorias).map(([k, c]) => {
    const url = linkTopico(tg.grupo_id, th[k]);
    const nome = url ? `<a href="${esc(url)}">${esc(c.nome)}</a>` : `<b>${esc(c.nome)}</b>`;
    return `${c.emoji} ${nome}${k === 'top' ? ' (até 5/dia)' : ''}`;
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
    const [oQue, freq] = TEXTO_TOPICO[k] || ['', ''];
    topicosTx[k] = [
      `${c.emoji} <b>${esc(c.nome)}</b>`,
      oQue ? esc(oQue) : '',
      freq ? esc(freq) : '',
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

module.exports = { textosGrupo, linkTopico, arrumarGrupoChamadas, fixarChamadas, resumoGrupo, topicosAtuais, faixasLimpeza };
