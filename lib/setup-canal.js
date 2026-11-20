'use strict';
// /setup <@canal> [título]: configura um canal (ou supergrupo) sob demanda, em rodadas.
// Função pura: só monta as requisições (método + payload) que o fluxo n8n executa e lê as respostas.
// Nada de I/O aqui. Quem executa as chamadas (e aplica o dry-run de publicação) é o fluxo.
//
// Rodadas:
//   1. iniciarSetupCanal      → getMe (descobre o id do bot publicador)
//   2. etapaDireitosSetupCanal → getChat(canal) + getChatMember(canal, bot_id)
//   3. planoSetupCanal         → avalia os direitos. Faltou algum obrigatório: devolve instruções ao admin e PARA.
//                                Tudo certo: setChatTitle? + setChatDescription + setChatPhoto? + sendMessage (fixar)
//   4. fixarSetupCanal         → pinChatMessage da mensagem de regras
//   5. resumoSetupCanal        → resposta final ao admin, com erros traduzidos
//
// Direitos (Bot API, https://core.telegram.org/bots/api):
// - setChatTitle / setChatDescription / setChatPhoto: o bot precisa ser admin com "the appropriate administrator
//   rights", ou seja, can_change_info. Título e foto não podem ser trocados em chat privado.
// - pinChatMessage: "must have the 'can_pin_messages' administrator right in a supergroup or 'can_edit_messages'
//   administrator right in a channel". Em canal NÃO existe can_pin_messages (é só de grupos/supergrupos).
// - can_post_messages e can_edit_messages são "channels only"; can_pin_messages é "groups and supergroups only".
const { chamada } = require('./telegram');
const { escapeHtml } = require('./util');
const { AVISO_AMAZON } = require('./textos');
const { CANAIS_SUGERIDOS } = require('./config');

const LIMITE_TITULO = 128; // setChatTitle: 1-128 caracteres
const LIMITE_DESCRICAO = 255; // setChatDescription: 0-255 caracteres

// Sufixo de disclosure da descrição do canal: nunca é cortado (ver descricaoCanal).
const SUFIXO_DESCRICAO = ' Só desconto real. #publi · Contém links de afiliado.';

const FRASE_AFILIADO =(marca) =>
  `O ${marca} participa de programas de afiliados (Amazon, Shopee, Mercado Livre e outros) e pode ganhar comissão pelas compras feitas pelos links, sem custo extra para você. ${AVISO_AMAZON}`;

/** Corta sem quebrar emoji/par substituto, de preferência no último espaço, com "…" no fim. Conta em UTF-16 (conservador). */
function cortarTextoSeguro(texto, max) {
  const s = String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  let corte = max - 1; // espaço para o "…"
  // não parte um par substituto (emoji fora do BMP)
  const c = s.charCodeAt(corte - 1);
  if (c >= 0xd800 && c <= 0xdbff) corte -= 1;
  let base = s.slice(0, corte);
  const esp = base.lastIndexOf(' ');
  if (esp >= corte - 40 && esp > 0) base = base.slice(0, esp);
  base = base.replace(/[\s,;:.\-–·|]+$/, '');
  return base + '…';
}

/** Mesma checagem de admin usada nos comandos (telegram.js): o id do remetente está em cfg.admins. */
function ehAdminSetupCanal(cfg, fromId) {
  return fromId != null && (cfg && cfg.admins || []).includes(Number(fromId));
}

/**
 * Lê "/setup @canal [título]" (ou "/setup -100123 [título]").
 * - "/setup" sem argumento (ou texto que não é /setup): null. Só esse caso vai para o setup geral.
 * - "/setup <argumento>" com alvo inválido (ex.: "/setup https://t.me/x", "@abcd" curto demais):
 *   { canal: null, titulo: '', invalido: true }. iniciarSetupCanal responde "Uso: /setup @canal",
 *   para um alvo mal digitado não disparar o setup geral por engano.
 * @username do Telegram: 5 a 32 caracteres, começando com letra.
 */
function lerComandoSetupCanal(texto) {
  const t = String(texto || '').trim();
  const cab = t.match(/^\/setup(?:@\w+)?(?:\s+([\s\S]*))?$/i);
  if (!cab || !(cab[1] || '').trim()) return null;
  const m = t.match(/^\/setup(?:@\w+)?\s+(@[A-Za-z][A-Za-z0-9_]{4,31}|-100\d{5,})(?:\s+([\s\S]+))?$/i);
  if (!m) return { canal: null, titulo: '', invalido: true };
  const canal = m[1].startsWith('@') ? m[1] : Number(m[1]);
  const titulo = (m[2] || '').replace(/\s+/g, ' ').trim();
  return { canal, titulo };
}

/** Categoria configurada para o canal (cfg.telegram.canais = { cat: '@canal' | id }). */
function categoriaDoCanal(cfg, canal, chat) {
  const canais = (cfg && cfg.telegram && cfg.telegram.canais) || {};
  const alvos = [String(canal).toLowerCase()];
  if (chat) {
    if (chat.id != null) alvos.push(String(chat.id));
    if (chat.username) alvos.push('@' + String(chat.username).toLowerCase());
  }
  for (const [cat, ref] of Object.entries(canais)) {
    if (alvos.includes(String(ref).toLowerCase())) return cat;
  }
  return null;
}

/**
 * Rodada 1. msg: mensagem do Telegram com o comando. origem: bot que recebeu ('admin' ou 'grupo').
 * Devolve { rota, estado, chamadas }. rota 'responder' = recusa (não é admin ou comando inválido).
 */
function iniciarSetupCanal(msg, cfg, origem) {
  const bot = origem || 'admin';
  const from = (msg && msg.from) || {};
  const chatResp = (msg && msg.chat && msg.chat.id) || from.id;
  const responder = (texto) => ({
    rota: 'responder',
    estado: null,
    chamadas: chatResp ? [chamada(bot, 'sendMessage', { chat_id: chatResp, text: texto, link_preview_options: { is_disabled: true } }, { passo: 'resposta' })] : [],
  });
  if (!ehAdminSetupCanal(cfg, from.id)) return responder('⛔ Só admins do bot podem usar /setup.');
  const cmd = lerComandoSetupCanal(msg && msg.text);
  if (!cmd || cmd.invalido) return responder('Uso: /setup @canal [título opcional]\nEx.: /setup @meucanal Ofertô Casa & Eletro');
  const estado = { canal: cmd.canal, titulo: cmd.titulo, responder: { bot, chat_id: chatResp }, admin_id: from.id };
  return { rota: 'setup_canal', estado, chamadas: [chamada('grupo', 'getMe', {}, { passo: 'getMe', etapa: 1 })] };
}

/** Rodada 2: com o id do bot (resposta do getMe), lê o chat e o membro bot no chat. */
function etapaDireitosSetupCanal(estado, respGetMe) {
  const r = respGetMe || {};
  const botId = r.ok && r.result && r.result.id;
  if (!botId) return { estado, parar: true, erro: erroSetupCanal(r.description || 'getMe falhou'), chamadas: [] };
  const novo = Object.assign({}, estado, { bot_id: botId, bot_username: r.result.username || '' });
  return {
    estado: novo,
    parar: false,
    chamadas: [
      chamada('grupo', 'getChat', { chat_id: estado.canal }, { passo: 'getChat', etapa: 2 }),
      chamada('grupo', 'getChatMember', { chat_id: estado.canal, user_id: botId }, { passo: 'getChatMember', etapa: 2 }),
    ],
  };
}

/* ---------- Direitos ---------- */

const DIREITOS = {
  can_change_info: {
    canal: 'Alterar informações do canal',
    grupo: 'Alterar informações do grupo',
    para: 'trocar título, descrição e foto',
  },
  can_post_messages: { canal: 'Publicar mensagens', para: 'publicar as ofertas e a mensagem de regras' },
  can_edit_messages: { canal: 'Editar mensagens de outros', para: 'fixar a mensagem de regras (em canal, fixar exige este direito) e editar posts encerrados' },
  can_pin_messages: { grupo: 'Fixar mensagens', para: 'fixar a mensagem de regras' },
  can_invite_users: { canal: 'Convidar usuários via link', grupo: 'Convidar usuários via link', para: 'criar link de convite (só para canal sem @ público)' },
};

function passoAPasso(direito, tipo, botU) {
  const ehCanal = tipo === 'channel';
  const d = DIREITOS[direito];
  const rotulo = (ehCanal ? d.canal : d.grupo) || d.canal || d.grupo;
  const quem = botU ? '@' + botU : 'o bot publicador';
  const lugar = ehCanal ? 'canal' : 'grupo';
  return [
    `• ${rotulo} (${direito}): necessário para ${d.para}.`,
    `  1. Abra o ${lugar} no app do Telegram e toque no nome dele no topo.`,
    `  2. Toque em Editar (ícone de lápis) > Administradores.`,
    `  3. Toque em ${quem}.`,
    `  4. Ative "${rotulo}" e toque em Salvar (✓).`,
  ].join('\n');
}

/**
 * Avalia o resultado de getChat + getChatMember.
 * Devolve { ok, tipo, faltando:[direito], opcionais:[direito], motivo, instrucoes } — motivo preenchido quando
 * o problema não é um direito (chat privado, bot fora do chat, bot não é admin).
 */
function avaliarDireitosCanal(chat, membro, opts) {
  const o = opts || {};
  const botU = o.bot_username || '';
  const tipo = chat && chat.type;
  const res = { ok: false, tipo: tipo || null, faltando: [], opcionais: [], motivo: '', instrucoes: '' };
  if (!chat || !tipo) {
    res.motivo = 'canal não encontrado: confira o @ e se o bot publicador foi adicionado ao canal';
    return res;
  }
  if (tipo === 'private') {
    res.motivo = 'isso é um chat privado: /setup só vale para canal ou supergrupo';
    return res;
  }
  const status = membro && membro.status;
  if (status !== 'administrator' && status !== 'creator') {
    res.motivo = `o bot publicador${botU ? ' @' + botU : ''} não é administrador deste chat`;
    res.instrucoes = [
      `1. Abra o ${tipo === 'channel' ? 'canal' : 'grupo'} e toque no nome dele no topo.`,
      '2. Toque em Editar (lápis) > Administradores > Adicionar administrador.',
      `3. Procure ${botU ? '@' + botU : 'o bot publicador'} e adicione.`,
      '4. Deixe ligadas as permissões listadas em docs/channel-setup.md e salve. Depois rode o /setup de novo.',
    ].join('\n');
    return res;
  }
  const tem = (k) => status === 'creator' || membro[k] === true;
  const obrig = tipo === 'channel'
    ? ['can_change_info', 'can_post_messages', 'can_edit_messages']
    : ['can_change_info', 'can_pin_messages'];
  res.faltando = obrig.filter((k) => !tem(k));
  // Convite só importa em canal sem @ público (o aviso não se aplica a supergrupo).
  if (tipo === 'channel' && !chat.username && !tem('can_invite_users')) res.opcionais.push('can_invite_users');
  res.ok = res.faltando.length === 0;
  if (!res.ok) {
    res.instrucoes = res.faltando.map((k) => passoAPasso(k, tipo, botU)).join('\n');
  }
  return res;
}

/* ---------- Textos ---------- */

function descricaoCanal(cfg, cat) {
  const marca = (cfg && cfg.marca) || 'Ofertô';
  const descCfg = cat && cfg && cfg.telegram && cfg.telegram.canais_desc && cfg.telegram.canais_desc[cat];
  const base = descCfg || (cat && CANAIS_SUGERIDOS[cat] && CANAIS_SUGERIDOS[cat].desc) || `${marca}: ofertas com preço conferido no histórico e cupons testados.`;
  // O aviso de publicidade/afiliado (Q-06 / P3-03) fica reservado: só a parte editável (base) é cortada.
  return cortarTextoSeguro(base, LIMITE_DESCRICAO - SUFIXO_DESCRICAO.length) + SUFIXO_DESCRICAO;
}

function tituloCanal(cfg, cat, tituloInformado) {
  if (tituloInformado) return cortarTextoSeguro(tituloInformado, LIMITE_TITULO);
  if (!cat) return '';
  const sug = CANAIS_SUGERIDOS[cat];
  const nomeCat = cfg && cfg.categorias && cfg.categorias[cat] && cfg.categorias[cat].nome;
  const t = (sug && sug.nome) || (nomeCat ? `${(cfg && cfg.marca) || 'Ofertô'} ${nomeCat}` : '');
  return t ? cortarTextoSeguro(t, LIMITE_TITULO) : '';
}

/** Mensagem de regras para fixar: regras, link do grupo de avisos (se configurado) e frase completa de afiliado. */
function textoFixadoCanal(cfg, cat) {
  const marca = escapeHtml((cfg && cfg.marca) || 'Ofertô');
  const t = (cfg && cfg.telegram) || {};
  const nomeCat = cat && ((cfg.categorias && cfg.categorias[cat] && cfg.categorias[cat].nome) || (CANAIS_SUGERIDOS[cat] && CANAIS_SUGERIDOS[cat].categoria_nome));
  const linhas = [
    `📌 <b>Regras do canal${nomeCat ? ' · ' + escapeHtml(nomeCat) : ''}</b>`,
    '',
    '• Só publicamos preço real conferido no histórico: sem "metade do dobro" nem desconto maquiado.',
    '• Preço, cupom e estoque mudam rápido. Confira o valor final na loja antes de pagar.',
    '• 🎟️ Saiu alerta de cupom? Resgate na hora na aba da loja — vários só ficam ativos pra quem salvou antes.',
    '• 🔔 Quer aviso no privado quando um produto baixar? Mande <code>/alerta nome do produto</code> no bot.',
    `• 🔒 O ${marca} <b>nunca</b> chama no privado nem pede Pix. A compra é sempre no site ou app oficial da loja.`,
  ];
  if (t.grupo_link) {
    linhas.push('', `📣 Avisos e conversa: ${escapeHtml(t.grupo_link)}`);
  }
  linhas.push('', `<i>${escapeHtml(FRASE_AFILIADO((cfg && cfg.marca) || 'Ofertô'))}</i>`);
  return linhas.join('\n');
}

/* ---------- Rodada 3 ---------- */

/**
 * respostas: [getChat, getChatMember] da rodada 2.
 * opts.foto: { binario: 'data', mime: 'image/jpeg', nome: 'canal.jpg' } quando o render gerou a imagem
 * (o fluxo manda setChatPhoto como multipart). Sem foto, a troca de foto é pulada.
 * Devolve { estado, parar, avaliacao, chamadas }. parar=true: só a mensagem ao admin (nada é configurado).
 */
function planoSetupCanal(estado, respostas, cfg, opts) {
  const o = opts || {};
  const [rChat, rMembro] = respostas || [];
  const resp = (texto, extra) => chamada(estado.responder.bot, 'sendMessage', Object.assign({
    chat_id: estado.responder.chat_id, text: texto, link_preview_options: { is_disabled: true },
  }, extra || {}), { passo: 'resposta' });

  if (!rChat || !rChat.ok) {
    const e = erroSetupCanal((rChat && rChat.description) || 'sem resposta');
    return { estado, parar: true, avaliacao: null, chamadas: [resp(`❌ /setup ${estado.canal}: ${e}`)] };
  }
  const chat = rChat.result;
  let av;
  if (!rMembro || !rMembro.ok) {
    // getChatMember falhou. A instrução "adicionar como admin" só vale quando o erro é de pertencimento/permissão;
    // erro transitório (rate limit, rede, token) não diz nada sobre os direitos do bot.
    const desc = (rMembro && rMembro.description) || 'sem resposta';
    if (RE_ERRO_DIREITO.test(desc)) {
      av = avaliarDireitosCanal(chat, { status: 'left' }, { bot_username: estado.bot_username });
      if (av.motivo) av.motivo = erroSetupCanal(desc) || av.motivo;
    } else {
      av = { ok: false, tipo: chat && chat.type || null, faltando: [], opcionais: [], motivo: erroSetupCanal(desc) || desc, instrucoes: '' };
    }
  } else {
    av = avaliarDireitosCanal(chat, rMembro.result, { bot_username: estado.bot_username });
  }

  if (!av.ok) {
    const cab = `⚠️ /setup ${estado.canal}: nada foi alterado.`;
    const corpo = av.motivo
      ? `Motivo: ${av.motivo}.${av.instrucoes ? '\n\nComo resolver:\n' + av.instrucoes : ''}`
      : `Faltam permissões para o bot publicador:\n\n${av.instrucoes}\n\nDepois rode /setup ${estado.canal}${estado.titulo ? ' ' + estado.titulo : ''} de novo.`;
    return { estado, parar: true, avaliacao: av, chamadas: [resp(`${cab}\n${corpo}`)] };
  }

  const cat = categoriaDoCanal(cfg, estado.canal, chat);
  const chat_id = chat.id;
  const g = (metodo, payload, ref, extra) => Object.assign(chamada('grupo', metodo, Object.assign({ chat_id }, payload), ref), extra || {});
  const chamadas = [];
  const titulo = tituloCanal(cfg, cat, estado.titulo);
  if (titulo && chat.type !== 'private' && titulo !== chat.title) {
    chamadas.push(g('setChatTitle', { title: titulo }, { passo: 'título' }));
  }
  chamadas.push(g('setChatDescription', { description: descricaoCanal(cfg, cat) }, { passo: 'descrição' }));
  if (o.foto && o.foto.binario && chat.type !== 'private') {
    chamadas.push(g('setChatPhoto', {}, { passo: 'foto' }, {
      multipart: { campo: 'photo', binario: o.foto.binario, mime: o.foto.mime || 'image/jpeg', nome: o.foto.nome || 'canal.jpg', origem: 'render' },
    }));
  }
  chamadas.push(g('sendMessage', {
    text: textoFixadoCanal(cfg, cat),
    parse_mode: 'HTML',
    disable_notification: true,
    link_preview_options: { is_disabled: true },
  }, { passo: 'regras', fixar: true }));

  const novo = Object.assign({}, estado, { chat_id, tipo: chat.type, categoria: cat, titulo_atual: chat.title || '', opcionais: av.opcionais, foto: !!(o.foto && o.foto.binario) });
  return { estado: novo, parar: false, avaliacao: av, chamadas };
}

/** Rodada 4: fixa a mensagem de regras enviada na rodada 3. */
function fixarSetupCanal(estado, chamadas, respostas) {
  const out = [];
  (chamadas || []).forEach((c, i) => {
    const r = (respostas || [])[i] || {};
    if (c.ref && c.ref.fixar && r.ok && r.result && r.result.message_id) {
      out.push(chamada('grupo', 'pinChatMessage', { chat_id: estado.chat_id, message_id: r.result.message_id, disable_notification: true }, { passo: 'fixar regras' }));
    }
  });
  return out;
}

/* ---------- Erros e resumo ---------- */

// Erros de getChatMember que de fato indicam bot fora do chat ou sem direito de admin.
const RE_ERRO_DIREITO = /member list is inaccessible|USER_NOT_PARTICIPANT|bot is not a member|bot was kicked|not enough rights|CHAT_ADMIN_REQUIRED|need administrator rights|have no rights/i;

const ERROS_SETUP = [
  [/chat not found/i, 'canal não encontrado: confira o @ e se o bot publicador foi adicionado ao canal'],
  [/Unauthorized|^Not Found$/, 'token do bot publicador inválido: confira bot_token_grupo na bfx_config'],
  [/member list is inaccessible|USER_NOT_PARTICIPANT|bot is not a member|bot was kicked/i, 'o bot publicador não está no canal'],
  [/not enough rights|CHAT_ADMIN_REQUIRED|need administrator rights|have no rights/i, 'falta permissão de admin para o bot publicador'],
  [/CHAT_ABOUT_TOO_LONG/i, 'descrição longa demais (limite de 255 caracteres)'],
  [/TITLE_NOT_MODIFIED|CHAT_ABOUT_NOT_MODIFIED|not modified/i, null], // já estava assim: não é erro
  [/PHOTO_INVALID|IMAGE_PROCESS_FAILED|PHOTO_CROP_SIZE_SMALL|wrong file|can't upload/i, 'o Telegram recusou a imagem do canal'],
  [/Too Many Requests|retry after/i, 'o Telegram pediu para ir mais devagar; rode de novo em 1 minuto'],
  [/socket|ECONN|ETIMEDOUT|network/i, 'falha de conexão'],
];

/** Erro da Bot API em português. null = não é erro de verdade (já estava assim). */
function erroSetupCanal(descricao) {
  const d = String(descricao || '');
  for (const [re, msg] of ERROS_SETUP) if (re.test(d)) return msg;
  return d || 'erro desconhecido';
}

/** Rodada 5: monta a resposta final ao admin. Recebe todas as chamadas/respostas das rodadas 3 e 4. */
function resumoSetupCanal(estado, chamadas, respostas) {
  const linhas = [`✅ /setup ${estado.canal}${estado.titulo_atual ? ' (' + estado.titulo_atual + ')' : ''}`];
  const falhas = [];
  (chamadas || []).forEach((c, i) => {
    if (!c || c.metodo === 'sendMessage' && c.ref && c.ref.passo === 'resposta') return;
    const r = (respostas || [])[i] || {};
    const passo = (c.ref && c.ref.passo) || c.metodo;
    if (r.ok) { linhas.push(`• ${passo}: ok`); return; }
    const e = erroSetupCanal(r.description);
    if (e === null) linhas.push(`• ${passo}: já estava assim`);
    else falhas.push(`• ${passo}: ${e}`);
  });
  if (!estado.foto) linhas.push('• foto: pulada (sem imagem do render)');
  if (estado.categoria) linhas.push(`• categoria: ${estado.categoria}`);
  else if (!estado.titulo) linhas.push('• título: mantido (sem título no comando e sem categoria configurada)');
  if ((estado.opcionais || []).includes('can_invite_users')) {
    linhas.push('ℹ️ Canal sem @ público e sem "Convidar usuários via link": o bot não consegue criar link de convite.');
  }
  if (falhas.length) {
    linhas[0] = `⚠️ /setup ${estado.canal}: terminou com falhas`;
    linhas.push('', 'Falhas:', ...falhas);
  }
  return {
    ok: falhas.length === 0,
    chamadas: [chamada(estado.responder.bot, 'sendMessage', { chat_id: estado.responder.chat_id, text: linhas.join('\n'), link_preview_options: { is_disabled: true } }, { passo: 'resposta' })],
  };
}

module.exports = {
  LIMITE_DESCRICAO_CANAL: LIMITE_DESCRICAO,
  cortarTextoSeguro, ehAdminSetupCanal, lerComandoSetupCanal, iniciarSetupCanal, etapaDireitosSetupCanal,
  avaliarDireitosCanal, planoSetupCanal, fixarSetupCanal, resumoSetupCanal, erroSetupCanal, textoFixadoCanal,
};
