'use strict';
// Recursos de comunidade e autonomia do Ofertô (custo R$ 0):
// · Auto-onboarding zero-toque de canais por nicho (detecta tema pelo nome, liga canal, cria bio e fixa boas-vindas)
// · Alertas pessoais de preço dos membros (/alerta ps5, /alerta lattafa asad, /alerta fralda) em bfx_alertas
// · Assistente interativo para membros (/buscar, /cupons, /tophoje) e inteligência de demanda (/demanda)
// · Vitrine noturna "Top 5 Ainda Ativas" (/resumao) e Guardião automático de ofertas esgotadas.
const { formatBRL, truncar, escapeHtml, novoId, slug, diaISO, partesData } = require('./util');
const { nomeLoja, naLoja } = require('./lojas');
const { bateTermoInteligente, normalizarBusca, classificarCategoria, reqPaginaProduto, avaliarExpiracaoPagina } = require('./extrator');
const { tecladoEnviarWhatsApp } = require('./copy');
const textos = require('./textos');
const { CANAIS_SUGERIDOS, CATEGORIAS } = require('./config');

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const LOJAS_VERIFICAVEIS = new Set([
  'amazon', 'ml', 'kabum', 'terabyte', 'pichau',
  'belezanaweb', 'epocacosmeticos', 'drogaraia', 'drogasil',
  'boticario', 'natura', 'sephora', 'panvel', 'araujo', 'pacheco',
]);

function chBot(bot, metodo, payload, ref) {
  return { bot, metodo, payload, ref: ref || null };
}

function mostraPreco(o, cfg) {
  return !(o && o.loja === 'amazon' && cfg && cfg.amazon && cfg.amazon.mostrar_preco === false);
}

/* ---------- 1. Auto-Onboarding Zero-Toque de Canais ---------- */

/** Identifica a categoria do canal pelo título ou @username quando o bot vira admin. */
function detectarCategoriaCanal(titulo, username) {
  const norm = normalizarBusca([titulo, String(username || '').replace(/_/g, ' ')].filter(Boolean).join(' '));
  if (norm.trim().length < 2) return null;
  if (/\b(?:tech|tecnologia|game|games|gamer|ps5|xbox|hardware|pc|celulares|eletronicos|informatica)\b/.test(norm)) return 'tech';
  if (/\b(?:perfume|perfumes|perfumaria|beleza|saude|farmacia|drogaria|skincare|cosmeticos|maquiagem)\b/.test(norm)) return 'beleza';
  if (/\b(?:casa|eletro|cozinha|lar|mercado|ferramentas|eletroportateis|eletrodomesticos)\b/.test(norm)) return 'casa';
  if (/\b(?:bebe|bebes|infantil|fralda|fraldas|familia|maternidade|crianca|criancas|brinquedos)\b/.test(norm)) return 'bebe';
  if (/\b(?:vip|top|bug|bugs|destaques|relampago|principais)\b/.test(norm)) return 'top';
  return null;
}

/** Mensagem HTML de boas-vindas e regras de segurança para fixar automaticamente no canal recém-criado. */
function textoBoasVindasCanal(cat, cfg) {
  const marca = escapeHtml((cfg && cfg.marca) || 'Ofertô');
  const sug = CANAIS_SUGERIDOS[cat] || {};
  const infoCat = (cfg && cfg.categorias && cfg.categorias[cat]) || CATEGORIAS[cat] || { emoji: '🔥', nome: cat };
  const botU = cfg && cfg.telegram && cfg.telegram.bot_grupo_username ? '@' + cfg.telegram.bot_grupo_username : '';

  const destaques = {
    tech: '🎮 PC Gamer (KaBuM!, Terabyte, Pichau), PS5, GTA 6, Xbox, Celulares, Fones e Hardware com cupom e histórico conferidos.',
    beleza: '✨ Perfumes Árabes originais no Mercado Livre (Lattafa, Asad, Fakhar, Khamrah, Sabah Al Ward), Perfumes de Nicho, Importados Mais Procurados, Boticário, Natura e Farmácias Confiáveis.',
    casa: '🏠 Air Fryer, Eletroportáteis, Cozinha, Casa Inteligente e compras de mercado com preço real e cupom testado.',
    bebe: '👶 Fraldas (com cálculo automático por tira!), Lenços, Fórmulas, Farmácia Infantil e Brinquedos.',
    top: '🔥 Só a nata do dia: maiores quedas reais de preço, bugs rápidos e produtos que estão bombando agora.',
  };

  const exemploAlerta = cat === 'beleza'
    ? '<code>/alerta lattafa asad</code> ou <code>/alerta sauvage</code>'
    : cat === 'tech'
      ? '<code>/alerta ps5</code> ou <code>/alerta gta 6</code>'
      : cat === 'bebe'
        ? '<code>/alerta fralda pampers</code>'
        : '<code>/alerta air fryer</code>';

  const linhas = [
    `${infoCat.emoji} <b>Bem-vindo ao canal ${escapeHtml(sug.nome || `${marca} ${infoCat.nome}`)}!</b>`,
    '',
    destaques[cat] || (sug.desc ? escapeHtml(sug.desc) : ''),
    '',
    '✅ <b>O que você encontra aqui:</b>',
    '• Promoções filtradas automaticamente em lojas oficiais, sem "desconto" inventado;',
    '• Cupons prontos com toque para copiar + parcelamento sem juros + aviso de preço no PIX;',
    '• Guardião automático que risca o post quando a oferta esgota ou sobe de preço.',
  ];
  if (botU) {
    linhas.push(
      '',
      `🔔 <b>Quer receber aviso na hora que um item entrar em promoção?</b>`,
      `Chame o ${escapeHtml(botU)} e mande ${exemploAlerta} (ou use <code>/cupons</code> e <code>/buscar</code>)!`,
    );
  }
  linhas.push(
    '',
    `🔒 <i>Segurança: o ${marca} nunca chama no privado e nunca pede Pix. Você compra e paga direto no site/app oficial da loja. #publi · Contém links de afiliado.</i>`,
  );
  return linhas.join('\n');
}

/**
 * Quando o bot publicador é adicionado como admin em um canal novo, identifica a categoria pelo nome
 * e monta o pacote automático de convite privado (se precisar), descrição e mensagem de boas-vindas.
 */
function planejarAutoOnboardingCanal(myChatMember, cfg, ts) {
  if (!myChatMember || (cfg && cfg.canais_auto === false)) return null;
  const chat = myChatMember.chat || {};
  const novo = myChatMember.new_chat_member || {};
  if (chat.type !== 'channel' || novo.status !== 'administrator') return null;

  const cat = detectarCategoriaCanal(chat.title, chat.username);
  if (!cat) return null;

  const ref = chat.username ? '@' + chat.username : String(chat.id);
  const t = (cfg && cfg.telegram) || {};
  const sug = CANAIS_SUGERIDOS[cat] || {};
  const chamadas = [];

  if (!chat.username && novo.can_invite_users !== false) {
    chamadas.push(chBot('grupo', 'createChatInviteLink', { chat_id: chat.id, name: `canal_${cat}` }, { tipo: 'convite_canal' }));
  }
  if (novo.can_change_info !== false && sug.desc) {
    const descCompleta = `${sug.desc} Só desconto real e cupons conferidos. #publi`.slice(0, 255);
    chamadas.push(chBot('grupo', 'setChatDescription', { chat_id: chat.id, description: descCompleta }, { tipo: 'desc_canal' }));
  }
  if (novo.can_post_messages !== false) {
    const botU = t.bot_grupo_username;
    const botoes = [];
    if (botU) {
      botoes.push([
        { text: '🔔 Criar alerta de preço', url: `https://t.me/${botU}?start=alerta` },
        { text: '🎟️ Cupons de hoje', url: `https://t.me/${botU}?start=cupons` },
      ]);
      botoes.push([{ text: `🌐 Ver outros canais ${cfg.marca || 'Ofertô'}`, url: `https://t.me/${botU}?start=canais` }]);
    }
    chamadas.push(chBot('grupo', 'sendMessage', {
      chat_id: chat.id,
      text: textoBoasVindasCanal(cat, cfg),
      parse_mode: 'HTML',
      disable_notification: true,
      link_preview_options: { is_disabled: true },
      ...(botoes.length ? { reply_markup: { inline_keyboard: botoes } } : {}),
    }, { tipo: 'boas_vindas' }));
  }
  if (!chamadas.length) {
    chamadas.push(chBot('grupo', 'getChat', { chat_id: chat.id }, { tipo: 'info_canal' }));
  }

  return {
    rota: 'canal_novo',
    categoria: cat,
    ref_canal: ref,
    chat_id_canal: chat.id,
    titulo_canal: chat.title || ref,
    pode_fixar: novo.can_pin_messages !== false,
    ts: ts || Date.now(),
    chamadas,
  };
}

/** Processa as respostas do setup automático do canal: gera upserts de config, fixa boas-vindas e avisa admins. */
function finalizarAutoOnboardingCanal(cls, respostas, cfg) {
  const cat = cls.categoria;
  const sug = CANAIS_SUGERIDOS[cat] || {};
  const infoCat = (cfg && cfg.categorias && cfg.categorias[cat]) || CATEGORIAS[cat] || { emoji: '📢', nome: cat };
  const upserts = [{ chave: `canal.${cat}`, valor: String(cls.ref_canal) }];
  if (sug.categoria_nome) upserts.push({ chave: `categoria_nome.${cat}`, valor: sug.categoria_nome });
  if (sug.desc) upserts.push({ chave: `canal_desc.${cat}`, valor: sug.desc });

  let linkConvite = String(cls.ref_canal).startsWith('@') ? `https://t.me/${String(cls.ref_canal).slice(1)}` : '';
  let welcomeId = 0;
  let descOk = false;

  (cls.chamadas || []).forEach((ch, i) => {
    const r = (respostas || [])[i] || {};
    if (!r.ok || !r.result) return;
    const tipo = ch.ref && ch.ref.tipo;
    if (tipo === 'convite_canal' && r.result.invite_link) linkConvite = r.result.invite_link;
    if (tipo === 'desc_canal') descOk = true;
    if (tipo === 'boas_vindas' && r.result.message_id) welcomeId = Number(r.result.message_id);
  });

  if (linkConvite) upserts.push({ chave: `canal_link.${cat}`, valor: linkConvite });

  const chamadasPos = [];
  if (welcomeId && cls.pode_fixar) {
    chamadasPos.push(chBot('grupo', 'pinChatMessage', {
      chat_id: cls.chat_id_canal,
      message_id: welcomeId,
      disable_notification: true,
    }));
  }

  const resumo = [
    `✅ Canal conectado e configurado automaticamente!`,
    `• Categoria: ${infoCat.emoji} ${sug.categoria_nome || infoCat.nome} (${cat})`,
    `• Canal: ${cls.titulo_canal} (${cls.ref_canal})`,
    linkConvite ? `• Link de entrada: ${linkConvite}` : '• Link de entrada: envie /canais ' + cat + ' ' + cls.ref_canal + ' https://t.me/+convite se for privado',
    `• Descrição da bio: ${descOk ? 'atualizada ✅' : 'já pode editar no app'}`,
    `• Mensagem de boas-vindas: ${welcomeId ? (cls.pode_fixar ? 'publicada e fixada ✅' : 'publicada ✅') : 'pendente de permissão Publicar'}`,
    '',
    `🖼️ Próximo passo opcional: mande a imagem com legenda /logo ${cat} aqui no bot publicador para divulgar com logo (/divulgar ${cat}).`,
  ].join('\n');

  for (const adm of (cfg && cfg.admins) || []) {
    chamadasPos.push(chBot('admin', 'sendMessage', {
      chat_id: adm,
      text: resumo,
      link_preview_options: { is_disabled: true },
    }));
  }

  return { upserts, chamadas: chamadasPos };
}

/* ---------- 2. Alertas Pessoais dos Membros (bfx_alertas) ---------- */

function codificarPayloadCriarAlerta(termo) {
  const s = String(termo || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return s ? `criaralerta_${s}` : 'alerta';
}

/** Interpreta /alerta, /meusalertas, /remover e payloads do /start no privado do bot publicador. */
function parseComandoAlerta(texto) {
  const t = String(texto || '').trim();
  const cmdM = t.match(/^\/(\w+)(?:@\w+)?\s*([\s\S]*)$/i);
  if (!cmdM) return null;
  const cmd = cmdM[1].toLowerCase();
  const arg = (cmdM[2] || '').trim();

  if (cmd === 'start') {
    const tok = arg.split(/\s+/)[0] || '';
    const low = tok.toLowerCase();
    if (low === 'alerta') return { acao_alerta: 'ajuda' };
    if (low === 'alertas' || low === 'meusalertas') return { acao_alerta: 'listar' };
    if (low.startsWith('delalerta_')) return { acao_alerta: 'remover', alvo: tok.slice('delalerta_'.length) };
    if (low.startsWith('criaralerta_')) {
      const term = tok.slice('criaralerta_'.length).replace(/[-_]+/g, ' ').trim();
      return term.length >= 2 ? { acao_alerta: 'criar', termo: term, preco_max: 0 } : { acao_alerta: 'ajuda' };
    }
    return null;
  }

  if (cmd === 'alertas' || cmd === 'meusalertas') return { acao_alerta: 'listar' };
  if (['remover', 'removeralerta', 'desalerta', 'parar'].includes(cmd)) {
    return { acao_alerta: 'remover', alvo: arg || 'todos' };
  }
  if (cmd !== 'alerta') return null;
  if (!arg) return { acao_alerta: 'ajuda' };

  let termo = arg;
  let preco_max = 0;

  // Padrão explícito de teto: "ate 180", "max R$ 350,00", "por R$ 150"
  const mExp = termo.match(/(?:^|\s)(?:at[eé]|max(?:imo)?|abaixo\s+de|menor\s+que|por)\s*(?:R\$\s*)?(\d{1,5}(?:[.,]\d{1,2})?)\b/i)
    || termo.match(/(?:^|\s)R\$\s*(\d{1,5}(?:[.,]\d{1,2})?)\b/i);
  if (mExp) {
    preco_max = Number(mExp[1].replace(/\./g, '').replace(',', '.')) || 0;
    termo = termo.replace(mExp[0], ' ').replace(/\s+/g, ' ').trim();
  } else {
    // Centavos explícitos no final: "fralda pampers 89,90"
    const mCents = termo.match(/\s(\d{1,5},\d{2})$/);
    if (mCents) {
      preco_max = Number(mCents[1].replace(',', '.')) || 0;
      termo = termo.slice(0, mCents.index).trim();
    } else {
      // Número inteiro no final >= 50 que NÃO faz parte de nome de modelo ("rtx 4060", "iphone 16", "ryzen 7", "9pm", "gta 6", "ps 5")
      const mFim = termo.match(/^(.+?)\s+(\d{2,5})$/);
      if (mFim) {
        const prefixo = mFim[1].trim();
        const numFim = Number(mFim[2]);
        const pareceModelo = /\b(?:rtx|gtx|rx|ryzen|core|i\d|ddr|ps|playstation|xbox|iphone|ipad|galaxy|redmi|poco|moto|note|fator|fps|hz|ml|gb|tb|series|s|no|v|g|a|m)$/i.test(prefixo);
        if (numFim >= 50 && !pareceModelo) {
          preco_max = numFim;
          termo = prefixo;
        }
      }
    }
  }

  termo = termo.replace(/^[\s,;-]+|[\s,;-]+$/g, '').slice(0, 80);
  if (termo.length < 2) return { acao_alerta: 'ajuda' };
  return { acao_alerta: 'criar', termo, preco_max };
}

/** Processa o pedido de alerta do membro contra `bfx_alertas`. */
function processarAlertaMembro(cls, alertasRows, cfg) {
  const resp = (texto, extra) => chBot('grupo', 'sendMessage', Object.assign({
    chat_id: cls.chat_id,
    text: texto,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  }, extra || {}));

  const existentes = (alertasRows || []).filter((r) => r && r.alerta_id && Number(r.chat_id) === Number(cls.chat_id));
  const ativos = existentes.filter((r) => r.ativo !== false);
  const acao = cls.acao_alerta;

  if (acao === 'ajuda') {
    return {
      inserir: [],
      atualizar: [],
      chamadas: [resp([
        '🔔 <b>Alertas Pessoais de Preço</b>',
        '',
        'Me diga o que você quer comprar e eu te aviso aqui no privado assim que sair promoção:',
        '• <code>/alerta ps5</code>',
        '• <code>/alerta lattafa asad</code>',
        '• <code>/alerta sauvage até 500</code>',
        '• <code>/alerta fralda pampers 80</code> (avisa até R$ 80)',
        '',
        'Outros comandos:',
        '• <code>/meusalertas</code> — ver sua lista ativa',
        '• <code>/remover ps5</code> ou <code>/remover todos</code>',
        '• <code>/buscar ps5</code> · <code>/cupons</code> · <code>/tophoje</code>',
      ].join('\n'))],
    };
  }

  if (acao === 'listar') {
    if (!ativos.length) {
      return {
        inserir: [],
        atualizar: [],
        chamadas: [resp('🔕 Você ainda não tem alertas ativos.\n\nPara criar o primeiro, mande por exemplo:\n<code>/alerta lattafa asad</code>\n<code>/alerta ps5 até 3300</code>')],
      };
    }
    const linhas = ativos.map((a, i) => {
      const teto = Number(a.preco_max) > 0 ? ` (até ${formatBRL(a.preco_max)})` : '';
      return `${i + 1}. 🔔 <b>${escapeHtml(a.termo)}</b>${escapeHtml(teto)}`;
    });
    return {
      inserir: [],
      atualizar: [],
      chamadas: [resp([
        `🔔 <b>Seus alertas ativos (${ativos.length}):</b>`,
        '',
        ...linhas,
        '',
        'Para remover: mande <code>/remover número_ou_nome</code> ou <code>/remover todos</code>.',
      ].join('\n'))],
    };
  }

  if (acao === 'remover') {
    if (!ativos.length) {
      return { inserir: [], atualizar: [], chamadas: [resp('Você não tem alertas ativos para remover.')] };
    }
    const alvo = String(cls.alvo || '').trim();
    const normAlvo = normalizarBusca(alvo).trim();
    const atualizar = [];
    if (!alvo || ['todos', 'tudo', 'all'].includes(normAlvo)) {
      for (const a of ativos) atualizar.push({ alerta_id: a.alerta_id, ativo: false });
      return {
        inserir: [],
        atualizar,
        chamadas: [resp(`🔕 Todos os ${atualizar.length} alerta(s) foram removidos.`)],
      };
    }
    const idxNum = /^\d+$/.test(alvo) ? Number(alvo) - 1 : -1;
    const achados = ativos.filter((a, i) => a.alerta_id === alvo || i === idxNum || bateTermoInteligente(a.termo, alvo));
    if (!achados.length) {
      return { inserir: [], atualizar: [], chamadas: [resp(`Não achei nenhum alerta ativo para "${escapeHtml(alvo)}". Mande <code>/meusalertas</code> para conferir.`)] };
    }
    for (const a of achados) atualizar.push({ alerta_id: a.alerta_id, ativo: false });
    return {
      inserir: [],
      atualizar,
      chamadas: [resp(`🔕 Alerta removido: <b>${escapeHtml(achados.map((a) => a.termo).join(', '))}</b>`)],
    };
  }

  // acao === 'criar'
  if (cfg && cfg.alertas && cfg.alertas.ativo === false) {
    return { inserir: [], atualizar: [], chamadas: [resp('🔕 Os alertas pessoais estão temporariamente pausados.')] };
  }
  const maxAlertas = Math.max(1, Number(cfg && cfg.alertas && cfg.alertas.max_por_membro) || 10);
  const normNovo = normalizarBusca(cls.termo).trim();
  const dup = ativos.find((a) => normalizarBusca(a.termo).trim() === normNovo);
  if (dup) {
    if (Number(cls.preco_max || 0) !== Number(dup.preco_max || 0)) {
      const novoTeto = Number(cls.preco_max) || 0;
      return {
        inserir: [],
        atualizar: [{ alerta_id: dup.alerta_id, preco_max: novoTeto }],
        chamadas: [resp(`🔔 Alerta de <b>${escapeHtml(dup.termo)}</b> atualizado${novoTeto > 0 ? ` para até ${formatBRL(novoTeto)}` : ' (sem teto de preço)'}!`)],
      };
    }
    return {
      inserir: [],
      atualizar: [],
      chamadas: [resp(`🔔 Você já acompanha <b>${escapeHtml(dup.termo)}</b>! Assim que surgir promoção eu te aviso aqui.`)],
    };
  }
  if (ativos.length >= maxAlertas) {
    return {
      inserir: [],
      atualizar: [],
      chamadas: [resp(`⚠️ Você atingiu o limite de ${maxAlertas} alertas ativos.\nMande <code>/meusalertas</code> e remova algum com <code>/remover nome</code>.`)],
    };
  }

  const ts = cls.ts || Date.now();
  const cat = classificarCategoria(cls.termo, cfg).categoria || 'geral';
  const linha = {
    alerta_id: novoId('al', ts + ativos.length),
    chat_id: Number(cls.chat_id),
    user_hash: String(cls.user_hash || ''),
    termo: cls.termo,
    preco_max: Number(cls.preco_max) || 0,
    categoria: cat,
    ativo: true,
    ultimo_aviso_ts: 0,
    ultimo_produto_id: '',
    ts,
    data: new Date(ts).toISOString(),
  };
  const tetoTxt = linha.preco_max > 0 ? ` (até ${formatBRL(linha.preco_max)})` : '';
  return {
    inserir: [linha],
    atualizar: [],
    chamadas: [resp([
      `🔔 <b>Alerta criado com sucesso!</b>`,
      `Produto: <b>${escapeHtml(linha.termo)}</b>${escapeHtml(tetoTxt)}`,
      '',
      'Assim que o radar ou nossa equipe publicar uma oferta compatível, te mando aqui na hora com cupom e link direto.',
      `💡 Dica: mande <code>/buscar ${escapeHtml(linha.termo)}</code> para ver se já saiu algo nos últimos dias!`,
    ].join('\n'))],
  };
}

/** Encontra membros com alertas compatíveis nas ofertas recém-publicadas e envia DM pelo bot publicador. */
function dispararAlertasOferta(ofertasPublicadas, linksRows, alertasRows, cfg, ts) {
  if ((cfg && cfg.alertas && cfg.alertas.ativo === false) || !(ofertasPublicadas || []).length || !(alertasRows || []).length) {
    return { chamadas: [], updatesAlertas: [] };
  }
  const agora = ts || Date.now();
  const linkMap = {};
  for (const l of linksRows || []) {
    if (!l || !l.oferta_id || !l.url) continue;
    if (!linkMap[l.oferta_id] || l.plataforma === 'tg') linkMap[l.oferta_id] = l.url;
  }

  const botU = cfg && cfg.telegram && cfg.telegram.bot_grupo_username;
  const chamadas = [];
  const updatesAlertas = [];
  const notificados = new Set();

  for (const o of ofertasPublicadas) {
    if (!o || !o.titulo) continue;
    const link = linkMap[o.oferta_id] || o.url;
    if (!link) continue;
    const comPreco = mostraPreco(o, cfg);
    const cupom = textos.cupomDe(o);
    const cupomAuto = textos.cupomAutoDe(o);

    for (const a of alertasRows) {
      if (!a || a.ativo === false || !a.chat_id || !a.termo) continue;
      if (!bateTermoInteligente(o.titulo, a.termo)) continue;
      if (Number(a.preco_max) > 0 && comPreco && Number(o.preco) > Number(a.preco_max)) continue;
      const ultTs = Number(a.ultimo_aviso_ts || 0);
      if (a.ultimo_produto_id === o.produto_id && agora - ultTs < DIA) continue;
      if (agora - ultTs < 30 * 60000) continue;

      const dedupKey = `${a.chat_id}:${o.produto_id || o.oferta_id}`;
      if (notificados.has(dedupKey)) continue;
      notificados.add(dedupKey);

      const linhas = [
        `🔔 <b>Alerta disparado:</b> "${escapeHtml(a.termo)}" · #publi`,
        '',
        `<b>${escapeHtml(truncar(o.titulo, 160))}</b>`,
        comPreco
          ? `💰 <b>${formatBRL(o.preco)}</b> ${naLoja(o.loja)}`
          : `✅ No menor preço conferido ${naLoja(o.loja)}`,
      ];
      if (cupom) linhas.push(`🎟️ Cupom: <code>${escapeHtml(cupom)}</code>`);
      else if (cupomAuto && comPreco) linhas.push(`🎟️ ${escapeHtml(cupomAuto)}`);
      linhas.push('', `👉 <b><a href="${escapeHtml(link)}">Ver na ${escapeHtml(nomeLoja(o.loja))}</a></b>`, '<i>Contém link de afiliado.</i>');

      const botoes = [[{ text: `🛒 Ver na ${nomeLoja(o.loja)}`, url: link }]];
      if (botU && a.alerta_id) {
        botoes.push([{ text: '🔕 Silenciar este alerta', url: `https://t.me/${botU}?start=delalerta_${a.alerta_id}` }]);
      }

      chamadas.push(chBot('grupo', 'sendMessage', {
        chat_id: Number(a.chat_id),
        text: linhas.join('\n'),
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: botoes },
        link_preview_options: o.imagem ? { url: o.imagem, prefer_large_media: true, show_above_text: true } : { is_disabled: false },
      }));
      if (a.alerta_id) {
        updatesAlertas.push({ alerta_id: a.alerta_id, ultimo_aviso_ts: agora, ultimo_produto_id: String(o.produto_id || o.oferta_id) });
      }
    }
  }

  return { chamadas, updatesAlertas };
}

/* ---------- 3. Vitrine Interativa (/buscar, /cupons, /tophoje, /resumao, /demanda) ---------- */

function mapaLinksTg(linksRows) {
  const m = {};
  for (const l of linksRows || []) {
    if (!l || !l.oferta_id || !l.url) continue;
    if (!m[l.oferta_id] || l.plataforma === 'tg') m[l.oferta_id] = l.url;
  }
  return m;
}

function ordenarMelhoresOfertas(lista) {
  return lista.slice().sort((a, b) => {
    const score = (o) => (o.top ? 100 : 0) + (textos.cupomDe(o) ? 18 : 0) + (Number(o.desconto_pct) || 0) + ((Number(o.ts) || 0) / 1e13);
    return score(b) - score(a);
  });
}

function linhaResumoOferta(o, link, cfg, idx) {
  const comPreco = mostraPreco(o, cfg);
  const cup = textos.cupomDe(o);
  const c = (cfg && cfg.categorias && cfg.categorias[o.categoria]) || { emoji: '🏷️' };
  const valorTxt = comPreco ? ` — <b>${formatBRL(o.preco)}</b> ${naLoja(o.loja)}` : ` — confira ${naLoja(o.loja)}`;
  const cupTxt = cup ? ` · 🎟️ <code>${escapeHtml(cup)}</code>` : '';
  return `${idx + 1}. ${c.emoji} <a href="${escapeHtml(link)}">${escapeHtml(truncar(o.titulo, 95))}</a>${valorTxt}${cupTxt}`;
}

/** Vitrine pública "🏆 TOP OFERTAS DE HOJE (Ainda Ativas!)" para grupo/canal Top e WhatsApp do admin. */
function montarVitrineTopDia(ofertasRows, linksRows, cfg, ts, chatIdAdmin) {
  const agora = ts || Date.now();
  const corte = agora - DIA;
  const ativas = (ofertasRows || []).filter((o) => o && o.status === 'aprovada' && Number(o.ts) >= corte);
  if (!ativas.length) {
    return {
      chamadas: chatIdAdmin ? [chBot('admin', 'sendMessage', { chat_id: chatIdAdmin, text: '🏆 Ainda não há ofertas aprovadas nas últimas 24h para montar o resumão.' })] : [],
      count: 0,
    };
  }

  const escolhidas = ordenarMelhoresOfertas(ativas).slice(0, 5);
  const links = mapaLinksTg(linksRows);
  const marca = (cfg && cfg.marca) || 'Ofertô';
  const itensHtml = escolhidas.map((o, i) => linhaResumoOferta(o, links[o.oferta_id] || o.url, cfg, i));
  const textoHtml = [
    `🏆 <b>TOP ${escolhidas.length} OFERTAS DE HOJE (Ainda Ativas!)</b> · #publi`,
    '',
    ...itensHtml,
    '',
    '🕒 <i>Preços conferidos hoje e sujeitos a alteração a qualquer momento.</i>',
    '<i>Contém links de afiliado.</i>',
  ].join('\n');

  const t = (cfg && cfg.telegram) || {};
  const chamadas = [];
  if (t.grupo_id && t.topicos && t.topicos.top) {
    chamadas.push(chBot('grupo', 'sendMessage', {
      chat_id: t.grupo_id,
      message_thread_id: t.topicos.top,
      text: textoHtml,
      parse_mode: 'HTML',
      disable_notification: true,
      link_preview_options: { is_disabled: true },
    }));
  }
  if (t.canais && t.canais.top) {
    chamadas.push(chBot('grupo', 'sendMessage', {
      chat_id: t.canais.top,
      text: textoHtml,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    }));
  }

  if (chatIdAdmin) {
    const itensZap = escolhidas.map((o, i) => {
      const link = links[o.oferta_id] || o.url;
      const comPreco = mostraPreco(o, cfg);
      const cup = textos.cupomDe(o);
      const val = comPreco ? `por *${formatBRL(o.preco)}* ${naLoja(o.loja)}` : `confira ${naLoja(o.loja)}`;
      return `${i + 1}) *${truncar(o.titulo, 70)}*\n   ${val}${cup ? ` (cupom *${cup}*)` : ''}\n   👉 ${link}`;
    });
    const textoZap = [
      `🏆 *TOP ${escolhidas.length} OFERTAS DE HOJE NO ${marca.toUpperCase()}* · #publi`,
      '',
      ...itensZap,
      '',
      '_Contém links de afiliado. Preços sujeitos a alteração._',
    ].join('\n');
    const rm = tecladoEnviarWhatsApp(textoZap, '📲 Enviar Resumão no WhatsApp');
    chamadas.push(chBot('admin', 'sendMessage', {
      chat_id: chatIdAdmin,
      text: `🏆 Resumão do dia pronto (${escolhidas.length} ofertas ativas).\n\n${textoZap}`,
      link_preview_options: { is_disabled: true },
      ...(rm ? { reply_markup: rm } : {}),
    }));
  }

  return { chamadas, count: escolhidas.length };
}

/** Responde comandos interativos de vitrine (/buscar, /cupons, /tophoje) e de demanda do admin (/demanda). */
function responderVitrineMembro(cls, ofertasRows, linksRows, alertasRows, cfg) {
  const agora = cls.ts || Date.now();
  const modo = cls.modo;
  if (modo === 'resumao_admin') {
    return { chamadas: montarVitrineTopDia(ofertasRows, linksRows, cfg, agora, cls.chat_id).chamadas };
  }

  if (modo === 'demanda') {
    const ativos = (alertasRows || []).filter((a) => a && a.ativo !== false && a.termo);
    if (!ativos.length) {
      return { chamadas: [chBot('admin', 'sendMessage', { chat_id: cls.chat_id, text: '📊 Nenhum membro cadastrou alertas pessoais (/alerta) ainda.' })] };
    }
    const grupos = {};
    for (const a of ativos) {
      const k = normalizarBusca(a.termo).trim();
      if (!grupos[k]) grupos[k] = { rotulo: a.termo, qtd: 0, tetos: [] };
      grupos[k].qtd++;
      if (Number(a.preco_max) > 0) grupos[k].tetos.push(Number(a.preco_max));
    }
    const topDemandas = Object.values(grupos).sort((a, b) => b.qtd - a.qtd).slice(0, 15);
    const linhas = topDemandas.map((d, i) => {
      const teto = d.tetos.length ? ` · teto médio ${formatBRL(d.tetos.reduce((s, x) => s + x, 0) / d.tetos.length)}` : '';
      return `${i + 1}. <b>${escapeHtml(d.rotulo)}</b> — ${d.qtd} membro(s)${escapeHtml(teto)} → <code>/radar ${escapeHtml(d.rotulo)}</code>`;
    });
    return {
      chamadas: [chBot('admin', 'sendMessage', {
        chat_id: cls.chat_id,
        text: [`📊 <b>O que seus membros mais querem comprar (${ativos.length} alertas ativos):</b>`, '', ...linhas].join('\n'),
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      })],
    };
  }

  const bot = cls.bot || 'grupo';
  const enviar = (texto, botoes) => [chBot(bot, 'sendMessage', {
    chat_id: cls.chat_id,
    text: texto,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...(botoes && botoes.length ? { reply_markup: { inline_keyboard: botoes } } : {}),
  })];

  const ativas7d = (ofertasRows || []).filter((o) => o && o.status === 'aprovada' && Number(o.ts) >= agora - 7 * DIA);
  const links = mapaLinksTg(linksRows);

  if (modo === 'cupons') {
    const comCupom = ordenarMelhoresOfertas(ativas7d.filter((o) => Number(o.ts) >= agora - 3 * DIA && (textos.cupomDe(o) || textos.cupomAutoDe(o)))).slice(0, 8);
    if (!comCupom.length) {
      return { chamadas: enviar('🎟️ Nenhum cupom ativo nas últimas 72h por enquanto.\n🔔 Crie um alerta (<code>/alerta produto</code>) para receber assim que aparecer!') };
    }
    const linhas = comCupom.map((o, i) => linhaResumoOferta(o, links[o.oferta_id] || o.url, cfg, i));
    return {
      chamadas: enviar(['🎟️ <b>Ofertas com cupom ativo agora</b> · #publi', '', ...linhas, '', '<i>Contém links de afiliado. Toque no código para copiar.</i>'].join('\n')),
    };
  }

  if (modo === 'tophoje') {
    const hoje = ordenarMelhoresOfertas(ativas7d.filter((o) => Number(o.ts) >= agora - DIA)).slice(0, 5);
    if (!hoje.length) {
      return { chamadas: enviar('🏆 Ainda não fechamos as Top ofertas de hoje.\nEnquanto isso, experimente <code>/cupons</code> ou <code>/buscar produto</code>!') };
    }
    const linhas = hoje.map((o, i) => linhaResumoOferta(o, links[o.oferta_id] || o.url, cfg, i));
    return {
      chamadas: enviar([`🏆 <b>Top ${hoje.length} Ofertas de Hoje</b> · #publi`, '', ...linhas, '', '<i>Contém links de afiliado. Preços sujeitos a alteração.</i>'].join('\n')),
    };
  }

  // modo === 'buscar'
  const termo = String(cls.termo || '').trim();
  if (termo.length < 2) {
    return { chamadas: enviar('🔎 Digite o que você procura: ex. <code>/buscar ps5</code>, <code>/buscar lattafa</code> ou <code>/buscar fralda</code>.') };
  }
  const achadas = ordenarMelhoresOfertas(ativas7d.filter((o) => bateTermoInteligente(`${o.titulo} ${nomeLoja(o.loja)}`, termo))).slice(0, 5);
  const botU = cfg && cfg.telegram && cfg.telegram.bot_grupo_username;
  const botoes = botU ? [[{ text: `🔔 Avisar quando "${truncar(termo, 22)}" baixar`, url: `https://t.me/${botU}?start=${codificarPayloadCriarAlerta(termo)}` }]] : [];
  if (!achadas.length) {
    return {
      chamadas: enviar(`🔎 Não achei promoções recentes de "<b>${escapeHtml(termo)}</b>" nos últimos 7 dias.\n\nToque no botão abaixo para receber aviso na hora em que cair de preço:`, botoes),
    };
  }
  const linhas = achadas.map((o, i) => linhaResumoOferta(o, links[o.oferta_id] || o.url, cfg, i));
  return {
    chamadas: enviar([
      `🔎 <b>Ofertas encontradas para "${escapeHtml(termo)}"</b> · #publi`,
      '',
      ...linhas,
      '',
      '<i>Contém links de afiliado.</i>',
    ].join('\n'), botoes),
  };
}

/* ---------- 4. Guardião Automático de Ofertas Expiradas (a cada 2h) ---------- */

/** Seleciona até 6 ofertas publicadas nas últimas 24h (>45 min atrás) para checar se continuam ativas. */
function planejarGuardiao(ofertasRows, cfg, ts) {
  const agora = ts || Date.now();
  const fuso = (cfg && cfg.fuso) || 'America/Sao_Paulo';
  const hojeIso = diaISO(agora, fuso);
  const hora = Number(partesData(agora, fuso).hour);
  if (cfg && cfg.guardiao && cfg.guardiao.ativo === false) {
    return { checar: [], reqs: [], hojeIso, hora, ts: agora };
  }
  const candidatas = (ofertasRows || [])
    .filter((o) => o && o.status === 'aprovada' && o.url && LOJAS_VERIFICAVEIS.has(o.loja)
      && Number(o.ts) >= agora - DIA && agora - Number(o.ts) >= 45 * 60000)
    .sort((a, b) => Number(b.ts) - Number(a.ts))
    .slice(0, 6);

  const reqs = candidatas.map((o) => {
    const r = reqPaginaProduto(o.url, cfg);
    return { oferta_id: o.oferta_id, url: r.url, headers: r.headers };
  });
  return { checar: candidatas, reqs, hojeIso, hora, ts: agora };
}

/** Encerra posts expirados no Telegram e publica a vitrine Top 5 das 21h quando aplicável. */
function executarGuardiao(plano, respPaginas, ofertasRows, postsRows, linksRows, cfg, ts) {
  const agora = ts || (plano && plano.ts) || Date.now();
  const t = (cfg && cfg.telegram) || {};
  const updatesOfertas = [];
  const chamadas = [];
  const encerradasIds = new Set();
  const motivos = [];

  (plano && plano.checar || []).forEach((oferta, i) => {
    const aval = avaliarExpiracaoPagina(oferta, (respPaginas || [])[i]);
    if (!aval.expirada) return;
    encerradasIds.add(oferta.oferta_id);
    updatesOfertas.push({ oferta_id: oferta.oferta_id, status: 'encerrada' });
    motivos.push(`• ${truncar(oferta.titulo, 50)} (${aval.motivo})`);

    const textoEnc = textos.textoEncerrado(oferta, cfg, agora);
    const alvos = (postsRows || []).filter((p) => p && p.oferta_id === oferta.oferta_id && p.message_id
      && (p.plataforma === 'tg' || (p.plataforma === 'tgc' && t.canais && t.canais[p.categoria])));
    for (const p of alvos) {
      const chatId = p.plataforma === 'tgc' ? t.canais[p.categoria] : t.grupo_id;
      if (!chatId) continue;
      chamadas.push(chBot('grupo', 'editMessageText', {
        chat_id: chatId,
        message_id: Number(p.message_id),
        text: textoEnc,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: { inline_keyboard: [] },
      }));
    }
  });

  if (updatesOfertas.length) {
    const aviso = `🛡️ Guardião encerrou automaticamente ${updatesOfertas.length} oferta(s):\n${motivos.join('\n')}`;
    for (const adm of (cfg && cfg.admins) || []) {
      chamadas.push(chBot('admin', 'sendMessage', { chat_id: adm, text: aviso, link_preview_options: { is_disabled: true } }));
    }
  }

  const upsertsConfig = [];
  const fuso = (cfg && cfg.fuso) || 'America/Sao_Paulo';
  const hojeIso = (plano && plano.hojeIso) || diaISO(agora, fuso);
  const hora = plano && plano.hora != null ? plano.hora : Number(partesData(agora, fuso).hour);
  if (cfg && cfg.vitrine && cfg.vitrine.auto_noite !== false && hora === 21 && cfg.vitrine.ultimo_dia !== hojeIso) {
    const ativasRestantes = (ofertasRows || []).filter((o) => o && !encerradasIds.has(o.oferta_id));
    const vit = montarVitrineTopDia(ativasRestantes, linksRows, cfg, agora, (cfg.admins || [])[0]);
    if (vit.count > 0) {
      chamadas.push(...vit.chamadas);
      upsertsConfig.push({ chave: 'vitrine.ultimo_dia', valor: hojeIso });
    }
  }

  return { updatesOfertas, chamadas, upsertsConfig };
}

module.exports = {
  detectarCategoriaCanal,
  textoBoasVindasCanal,
  planejarAutoOnboardingCanal,
  finalizarAutoOnboardingCanal,
  codificarPayloadCriarAlerta,
  parseComandoAlerta,
  processarAlertaMembro,
  dispararAlertasOferta,
  montarVitrineTopDia,
  responderVitrineMembro,
  planejarGuardiao,
  executarGuardiao,
};
