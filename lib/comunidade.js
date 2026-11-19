'use strict';
// Recursos de comunidade e autonomia do Ofertô (custo R$ 0):
// · Auto-onboarding zero-toque de canais por nicho (detecta tema pelo nome, liga canal, cria bio e fixa boas-vindas)
// · Alertas pessoais de preço dos membros (/alerta ps5, /alerta lattafa asad, /alerta fralda) em bfx_alertas
// · Assistente interativo para membros (/buscar, /cupons, /tophoje) e inteligência de demanda (/demanda)
// · Vitrine noturna "Top 5 Ainda Ativas" (/resumao) e Guardião automático de ofertas esgotadas.
const { round2, formatBRL, truncar, escapeHtml, novoId, slug, diaISO, partesData } = require('./util');
const { nomeLoja, naLoja, urlCentralCupons, normalizarImagemOferta } = require('./lojas');
const { normalizarBusca, classificarCategoria, reqPaginaProduto, lerPaginaProduto, recalcularParcelamentoComCupom, avaliarExpiracaoPagina, qtdUnidadesOferta } = require('./extrator');
const { parseManuais } = require('./links');
const { tecladoEnviarWhatsApp } = require('./copy');
const textos = require('./textos');
const { CANAIS_SUGERIDOS, CATEGORIAS } = require('./config');
const { agenteAtivo, bateTermoComSinonimos } = require('./agentes');
const { edicoesPost } = require('./edicao');

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
  if (/\b(?:moda|roupa|roupas|tenis|calcado|calcados|vestuario|fashion|shein|looks|streetwear)\b/.test(norm)) return 'moda';
  if (/\b(?:perfume|perfumes|perfumaria|fragrancia|fragrancias|arabe|arabes|lattafa|nicho)\b/.test(norm)) return 'perfumes';
  if (/\b(?:saude|farmacia|farmacias|drogaria|drogarias|suplemento|suplementos|vitaminas|creatina|whey|fitness)\b/.test(norm)) return 'saude';
  if (/\b(?:beleza|skincare|cosmeticos|maquiagem|cabelo|cabelos|dermocosmeticos|autocuidado)\b/.test(norm)) return 'beleza';
  if (/\b(?:casa|eletro|cozinha|lar|mercado|ferramentas|eletroportateis|eletrodomesticos)\b/.test(norm)) return 'casa';
  if (/\b(?:bebe|bebes|infantil|fralda|fraldas|familia|maternidade|crianca|criancas|brinquedos)\b/.test(norm)) return 'bebe';
  if (/\b(?:kpop|k pop|album|albuns|lightstick|photocard|bts|blackpink|stray kids)\b/.test(norm)) return 'kpop';
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
    tech: '🎮 PC Gamer (KaBuM!, Terabyte, Pichau), PS5, Xbox, Smartphones e Hardware conferidos.',
    moda: '👗 Achados Shein, Shopee e ML, tênis Nike/Adidas, cupons relâmpago e lojas oficiais (Centauro, Renner, C&A).',
    beleza: '💄 Skincare (Principia, CeraVe, La Roche), Maquiagem e Cabelos sem desconto maquiado.',
    perfumes: '✨ Perfumes Árabes originais no Mercado Livre (Lattafa, Asad, Khamrah, Yara), Nicho, Importados, Boticário e Natura.',
    saude: '💊 Creatina, Whey (Growth, Dux, Max), Vitaminas, Oral-B e Farmácias Confiáveis.',
    casa: '🏠 Air Fryer, Robô Aspirador, Cafeteiras e Casa Inteligente com histórico real.',
    bebe: '👶 Fraldas (cálculo por tira!), Lenços, Fórmulas Infantis e Brinquedos.',
    kpop: '💿 Álbuns lacrados (Hanteo/Circle), Lightsticks, Photocards e Merch oficial com entrega no Brasil.',
    top: '🔥 Só a nata do dia: maiores quedas de preço, bugs e lotes de cupons.',
  };

  const exemploAlerta = cat === 'perfumes'
    ? '<code>/alerta lattafa asad</code>'
    : cat === 'kpop'
      ? '<code>/alerta stray kids</code> ou <code>/alerta lightstick</code>'
      : cat === 'moda'
      ? '<code>/alerta tenis nike</code> ou <code>/alerta vestido shein</code>'
      : cat === 'beleza'
        ? '<code>/alerta isdin</code> ou <code>/alerta principia</code>'
        : cat === 'saude'
          ? '<code>/alerta creatina growth</code>'
          : cat === 'tech'
            ? '<code>/alerta ps5</code>'
            : cat === 'bebe'
              ? '<code>/alerta fralda pampers</code>'
              : '<code>/alerta air fryer</code>';

  const linhas = [
    `${infoCat.emoji} <b>${escapeHtml(sug.nome || `${marca} ${infoCat.nome}`)}</b>`,
    destaques[cat] || (sug.desc ? escapeHtml(sug.desc) : ''),
    '',
    '✅ Só preço real (90d) + cupons copiáveis + guardião que risca quando acaba.',
    '🎟️ Quando sair alerta de cupom, resgate na hora na conta (mesmo p/ usar no dia seguinte)!',
    '💬 <b>Comentar</b> está aberto em todo post · 🚨 Viu spam? Responda <code>/admin</code>.',
  ];
  if (botU) {
    linhas.push(`🔔 Alerta no privado: ${exemploAlerta} no ${escapeHtml(botU)} (também tem <code>/cupons</code>).`);
  }
  linhas.push('🔒 <i>Nunca chamamos no privado nem pedimos Pix. #publi · Contém links de afiliado.</i>');
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

  const totalCats = Object.keys((cfg && cfg.categorias) || CATEGORIAS).length;
  const ligados = new Set(Object.keys((cfg && cfg.telegram && cfg.telegram.canais) || {}).concat([cat]));
  const resumo = [
    `✅ Canal conectado e configurado automaticamente (${ligados.size}/${totalCats} canais)!`,
    `• Categoria: ${infoCat.emoji} ${sug.categoria_nome || infoCat.nome} (${cat})`,
    `• Canal: ${cls.titulo_canal} (${cls.ref_canal})`,
    linkConvite ? `• Link de entrada: ${linkConvite}` : '• Link de entrada: envie /canais ' + cat + ' ' + cls.ref_canal + ' https://t.me/+convite se for privado',
    `• Descrição da bio: ${descOk ? 'atualizada ✅' : 'já pode editar no app'}`,
    `• Mensagem de boas-vindas: ${welcomeId ? (cls.pode_fixar ? 'publicada e fixada ✅' : 'publicada ✅') : 'pendente de permissão Publicar'}`,
    '',
    `💬 Para liberar comentários embaixo de cada post deste canal (sem tópico Conversa): Configurações do Canal → Discussão → vincule um grupo e coloque o bot publicador como admin dele (o antispam e /admin já funcionam lá!).`,
    `🚀 Quando terminar de conectar todos os canais, mande /canais migrar para desligar o grupo antigo e apagar os tópicos antigos sozinho.`,
    `🖼️ Opcional: mande uma imagem com legenda /logo ${cat} aqui no bot publicador para divulgar com logo (/divulgar ${cat}).`,
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
  const clsCat = classificarCategoria(cls.termo, cfg);
  const cat = clsCat.confianca > 0 ? clsCat.categoria : 'geral';
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
      if (!bateTermoComSinonimos(o.titulo, a.termo)) continue;
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

      const imgAlerta = normalizarImagemOferta(o.imagem);
      chamadas.push(chBot('grupo', 'sendMessage', {
        chat_id: Number(a.chat_id),
        text: linhas.join('\n'),
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: botoes },
        link_preview_options: imgAlerta ? { url: imgAlerta, prefer_large_media: true, show_above_text: true } : { is_disabled: false },
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
  const ordenadas = lista.slice().sort((a, b) => {
    const score = (o) => (o.top ? 100 : 0) + (textos.cupomDe(o) ? 18 : 0) + (Number(o.desconto_pct) || 0) + ((Number(o.ts) || 0) / 1e13);
    return score(b) - score(a);
  });
  const unicas = [];
  const vistos = new Set();
  for (const o of ordenadas) {
    if (!o) continue;
    const chave = o.produto_id ? String(o.produto_id) : String(o.oferta_id || '');
    if (chave && vistos.has(chave)) continue;
    if (chave) vistos.add(chave);
    unicas.push(o);
  }
  return unicas;
}

function ehCupomLojaCom(o) {
  if (!o || !o.links_manuais) return false;
  if (typeof o.links_manuais === 'object') return !!o.links_manuais.eh_cupom_loja;
  try { return !!JSON.parse(o.links_manuais).eh_cupom_loja; } catch (e) { return false; }
}

function linhaResumoOferta(o, link, cfg, idx) {
  const comPreco = mostraPreco(o, cfg);
  const cup = textos.cupomDe(o);
  const c = (cfg && cfg.categorias && cfg.categorias[o.categoria]) || { emoji: '🏷️' };
  const valorTxt = ehCupomLojaCom(o) || !(Number(o.preco) > 0)
    ? ` — cupons ${naLoja(o.loja)}`
    : comPreco
      ? ` — <b>${formatBRL(o.preco)}</b> ${naLoja(o.loja)}`
      : ` — confira ${naLoja(o.loja)}`;
  const cupTxt = cup ? ` · 🎟️ <code>${escapeHtml(cup)}</code>` : '';
  return `${idx + 1}. ${c.emoji} <a href="${escapeHtml(link)}">${escapeHtml(truncar(o.titulo, 95))}</a>${valorTxt}${cupTxt}`;
}

/** Vitrine pública "🏆 TOP OFERTAS DE HOJE (Ainda Ativas!)" para grupo/canal Top e WhatsApp do admin. */
function montarVitrineTopDia(ofertasRows, linksRows, cfg, ts, chatIdAdmin) {
  const agora = ts || Date.now();
  const corte = agora - DIA;
  const ativas = (ofertasRows || []).filter((o) => o && o.status === 'aprovada' && Number(o.ts) >= corte && !ehCupomLojaCom(o));
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

/** Responde comandos interativos de vitrine (/buscar, /cupons, /tophoje), Concierge no chat/DM e de demanda do admin (/demanda). */
function responderVitrineMembro(cls, ofertasRows, linksRows, alertasRows, cfg, estadoOpc) {
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
  const enviar = (texto, botoes) => {
    const payload = {
      chat_id: cls.chat_id,
      text: texto,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    };
    if (Number(cls.thread_id) > 0) payload.message_thread_id = Number(cls.thread_id);
    if (Number(cls.reply_to_message_id) > 0) {
      payload.reply_parameters = { message_id: Number(cls.reply_to_message_id), allow_sending_without_reply: true };
    }
    if (modo === 'concierge' && Number(cls.chat_id) < 0) payload.disable_notification = true;
    if (botoes && botoes.length) payload.reply_markup = { inline_keyboard: botoes };
    return [chBot(bot, 'sendMessage', payload)];
  };

  const ativas7d = (ofertasRows || []).filter((o) => o && o.status === 'aprovada' && Number(o.ts) >= agora - 7 * DIA);
  const links = mapaLinksTg(linksRows);

  if (modo === 'concierge') {
    if (!agenteAtivo(cfg, 'concierge')) return { chamadas: [] };
    if (!cls.eh_cupom && String(cls.termo || '').trim().length < 2) return { chamadas: [] };
    if (estadoOpc && typeof estadoOpc === 'object' && cls.user_hash) {
      const kConc = 'conc_' + cls.user_hash;
      if (estadoOpc[kConc] && agora - estadoOpc[kConc] < 5 * 60000) return { chamadas: [] };
      if (Object.keys(estadoOpc).length > 100) {
        for (const [k, v] of Object.entries(estadoOpc)) {
          if (k.startsWith('conc_') && Number(agora - v) > 10 * 60000) delete estadoOpc[k];
        }
      }
      estadoOpc[kConc] = agora;
    }
    const botU = cfg && cfg.telegram && cfg.telegram.bot_grupo_username;
    if (cls.eh_cupom) {
      const filtroLoja = String(cls.termo || '').trim();
      const comCupom = ordenarMelhoresOfertas(ativas7d.filter((o) => {
        if (Number(o.ts) < agora - 3 * DIA) return false;
        const temCup = textos.cupomDe(o) || textos.cupomAutoDe(o) || ehCupomLojaCom(o);
        if (!temCup) return false;
        return !filtroLoja || o.loja === filtroLoja || bateTermoComSinonimos(o.titulo, filtroLoja);
      })).slice(0, 4);
      const lojasBts = filtroLoja ? [filtroLoja] : ['ml', 'shopee', 'amazon'];
      const btsHub = lojasBts
        .map((lj) => ({ lj, url: urlCentralCupons(lj, cfg) }))
        .filter((x) => !!x.url)
        .map((x) => [{ text: `🎟️ Aba de Cupons ${naLoja(x.lj)}`, url: x.url }]);
      if (!comCupom.length) {
        return {
          chamadas: enviar(
            `🎟️ Sem código avulso recente${filtroLoja ? ` ${naLoja(filtroLoja)}` : ''} agora.\nConfira e resgate direto nas abas oficiais:`,
            btsHub,
          ),
        };
      }
      const linhas = comCupom.map((o, i) => linhaResumoOferta(o, links[o.oferta_id] || o.url, cfg, i));
      return {
        chamadas: enviar(['🤖 <b>Cupons ativos agora</b> · #publi', '', ...linhas, '', '<i>Resgate na aba de cupons para não perder! Contém afiliado.</i>'].join('\n'), btsHub),
      };
    }

    const termo = String(cls.termo || '').trim();
    if (termo.length < 2) return { chamadas: [] };
    const candidatos = ordenarMelhoresOfertas(ativas7d.filter((o) => !ehCupomLojaCom(o) && bateTermoComSinonimos(`${o.titulo} ${nomeLoja(o.loja)}`, termo)));
    const teto = Number(cls.preco_max) || 0;
    const dentroTeto = teto > 0 ? candidatos.filter((o) => Number(o.preco) > 0 && Number(o.preco) <= teto).slice(0, 3) : candidatos.slice(0, 3);
    const botoes = botU ? [[{ text: `🔔 Avisar quando "${truncar(termo, 22)}" cair`, url: `https://t.me/${botU}?start=${codificarPayloadCriarAlerta(termo)}` }]] : [];
    if (!dentroTeto.length) {
      if (teto > 0 && candidatos.length) {
        const maisPerto = candidatos.slice().sort((a, b) => Number(a.preco) - Number(b.preco)).slice(0, 2);
        const linhasPerto = maisPerto.map((o, i) => linhaResumoOferta(o, links[o.oferta_id] || o.url, cfg, i));
        return {
          chamadas: enviar([
            `🔎 Ainda não saiu "<b>${escapeHtml(termo)}</b>" até ${formatBRL(teto)}, mas esses são os menores ativos · #publi`,
            '',
            ...linhasPerto,
            '',
            '🔔 Ative o alerta no botão para ser avisado no privado se bater seu teto:',
          ].join('\n'), botoes),
        };
      }
      return {
        chamadas: enviar(`🔎 Ainda não saiu promoção recente de "<b>${escapeHtml(termo)}</b>"${teto > 0 ? ` até ${formatBRL(teto)}` : ''}.\n\nToque abaixo que te aviso no privado assim que cair:`, botoes),
      };
    }
    const linhas = dentroTeto.map((o, i) => linhaResumoOferta(o, links[o.oferta_id] || o.url, cfg, i));
    return {
      chamadas: enviar([
        `🤖 <b>Achei para "${escapeHtml(termo)}"${teto > 0 ? ` (até ${formatBRL(teto)})` : ''}</b> · #publi`,
        '',
        ...linhas,
        '',
        '<i>Contém links de afiliado. Toque abaixo se quiser alerta futuro:</i>',
      ].join('\n'), botoes),
    };
  }

  if (modo === 'cupons') {
    const comCupom = ordenarMelhoresOfertas(ativas7d.filter((o) => Number(o.ts) >= agora - 3 * DIA && (textos.cupomDe(o) || textos.cupomAutoDe(o) || ehCupomLojaCom(o)))).slice(0, 8);
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
  const achadas = ordenarMelhoresOfertas(ativas7d.filter((o) => bateTermoComSinonimos(`${o.titulo} ${nomeLoja(o.loja)}`, termo))).slice(0, 5);
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

/* ---------- 4. Guardião Automático de Ofertas Expiradas, Queda Extra e Esquenta (a cada 30 min) ---------- */

/** Verifica se uma oferta ainda ativa caiu >= 6% e >= R$ 5 adicionais desde a publicação. */
function avaliarQuedaExtraPagina(oferta, respPagina) {
  if (!oferta || !respPagina) return { caiu: false };
  const precoAtual = Number(oferta.preco);
  if (!(precoAtual > 0)) return { caiu: false };
  if (avaliarExpiracaoPagina(oferta, respPagina).expirada) return { caiu: false };
  const lido = lerPaginaProduto(respPagina, oferta.url);
  if (!lido.ok || !(lido.preco > 0)) return { caiu: false };

  const qtdOferta = qtdUnidadesOferta(oferta.titulo, oferta.links_manuais);
  const qtdPagina = qtdUnidadesOferta(lido.titulo, null);
  const precoBase = (qtdOferta >= 2 && qtdPagina === 1) ? round2(lido.preco * qtdOferta) : lido.preco;

  let novoPreco = precoBase;
  if (!(qtdOferta >= 2 && qtdPagina === 1)) {
    const pisoCupom = precoBase >= 10 ? Math.max(5, round2(precoBase * 0.35)) : 0.01;
    if (lido.cupom_pct > 0) {
      const calc = round2(precoBase * (1 - lido.cupom_pct / 100));
      if (calc >= pisoCupom) novoPreco = calc;
    } else if (lido.cupom_valor > 0) {
      const calc = round2(precoBase - lido.cupom_valor);
      if (calc >= pisoCupom) novoPreco = calc;
    }
  }
  if (!(novoPreco > 0 && novoPreco <= precoAtual * 0.94 && (precoAtual - novoPreco) >= 5)) {
    return { caiu: false };
  }
  return { caiu: true, preco_anterior: precoAtual, preco_novo: novoPreco, lido };
}

/** Seleciona até 10 ofertas publicadas nas últimas 24h (>20 min atrás) para checar se esgotaram ou caíram mais. */
function planejarGuardiao(ofertasRows, cfg, ts) {
  const agora = ts || Date.now();
  const fuso = (cfg && cfg.fuso) || 'America/Sao_Paulo';
  const hojeIso = diaISO(agora, fuso);
  const pd = partesData(agora, fuso);
  const hora = Number(pd.hour);
  const minuto = Number(pd.minute);
  if ((cfg && cfg.guardiao && cfg.guardiao.ativo === false) || !agenteAtivo(cfg, 'guardiao')) {
    return { checar: [], reqs: [], hojeIso, hora, minuto, ts: agora };
  }
  const candidatas = (ofertasRows || [])
    .filter((o) => o && o.status === 'aprovada' && o.url && LOJAS_VERIFICAVEIS.has(o.loja)
      && !ehCupomLojaCom(o) && Number(o.ts) >= agora - DIA && agora - Number(o.ts) >= 20 * 60000)
    .sort((a, b) => Number(b.ts) - Number(a.ts))
    .slice(0, 10);

  const reqs = candidatas.map((o) => {
    const r = reqPaginaProduto(o.url, cfg);
    return { oferta_id: o.oferta_id, url: r.url, headers: r.headers };
  });
  return { checar: candidatas, reqs, hojeIso, hora, minuto, ts: agora };
}

/** Encerra posts expirados, atualiza quedas extras (>=6%), limpa pendentes >18h e dispara Esquenta 18h45 + Vitrine 21h. */
function executarGuardiao(plano, respPaginas, ofertasRows, postsRows, linksRows, cfg, ts) {
  const agora = ts || (plano && plano.ts) || Date.now();
  const t = (cfg && cfg.telegram) || {};
  const updatesOfertas = [];
  const chamadas = [];
  const encerradasIds = new Set();
  const atualizadasIds = new Set();
  const motivos = [];
  const motivosQueda = [];
  const linkMap = mapaLinksTg(linksRows);

  (plano && plano.checar || []).forEach((oferta, i) => {
    const respPag = (respPaginas || [])[i];
    const aval = avaliarExpiracaoPagina(oferta, respPag);
    const alvos = (postsRows || []).filter((p) => p && p.oferta_id === oferta.oferta_id && p.message_id
      && ((p.plataforma === 'tg' && (!p.categoria || p.categoria === 'top' || p.categoria === oferta.categoria))
        || (p.plataforma === 'tgc' && t.canais && t.canais[p.categoria] && (!p.categoria || p.categoria === 'top' || p.categoria === oferta.categoria))));

    if (aval.expirada) {
      encerradasIds.add(oferta.oferta_id);
      updatesOfertas.push({ oferta_id: oferta.oferta_id, status: 'encerrada' });
      motivos.push(`• ${truncar(oferta.titulo, 50)} (${aval.motivo})`);

      const textoEnc = textos.textoEncerrado(oferta, cfg, agora);
      for (const p of alvos) {
        const chatId = p.plataforma === 'tgc' ? t.canais[p.categoria] : t.grupo_id;
        if (!chatId) continue;
        chamadas.push(...edicoesPost('grupo', { chat_id: chatId, message_id: Number(p.message_id) }, textoEnc,
          { reply_markup: { inline_keyboard: [] } }));
      }
      return;
    }

    const queda = avaliarQuedaExtraPagina(oferta, respPag);
    if (!queda.caiu) return;

    const manAtual = parseManuais(oferta.links_manuais);
    const manNovo = Object.assign({}, manAtual, {
      repost_de: manAtual.repost_de || oferta.oferta_id,
      preco_anterior: queda.preco_anterior,
      motivo_repost: 'baixou',
    });
    if (!queda.lido.cupom && !queda.lido.cupom_pct && !queda.lido.cupom_valor) {
      delete manNovo.cupom;
      delete manNovo.cupom_auto;
      delete manNovo.preco_sem_cupom;
    }
    if (queda.lido.cupom) manNovo.cupom = queda.lido.cupom;
    if ((queda.lido.cupom_pct || queda.lido.cupom_valor) && queda.lido.preco > queda.preco_novo) {
      manNovo.preco_sem_cupom = queda.lido.preco;
      if (!manNovo.cupom && queda.lido.cupom_auto) manNovo.cupom_auto = queda.lido.cupom_auto;
    }
    const lidoOk = !!(queda.lido && queda.lido.ok && queda.lido.preco > 0);
    const fakeCand = {
      parcelamento: lidoOk ? (queda.lido.parcelamento || '') : (queda.lido.parcelamento || manNovo.parcelamento || ''),
      preco_parcelado: lidoOk ? (queda.lido.preco_parcelado || null) : (queda.lido.preco_parcelado || manNovo.preco_parcelado || null),
    };
    if (queda.lido.cupom_pct || queda.lido.cupom_valor) {
      recalcularParcelamentoComCupom(queda.lido, fakeCand, queda.lido.cupom_pct, queda.lido.cupom_valor);
    }
    if (fakeCand.parcelamento) manNovo.parcelamento = fakeCand.parcelamento;
    else if (lidoOk) delete manNovo.parcelamento;
    if (fakeCand.preco_parcelado) manNovo.preco_parcelado = fakeCand.preco_parcelado;
    else if (lidoOk) delete manNovo.preco_parcelado;
    if (lidoOk) {
      if (queda.lido.recorrencia) {
        manNovo.recorrencia = true;
        if (queda.lido.recorrencia_preco != null) manNovo.recorrencia_preco = queda.lido.recorrencia_preco;
        else delete manNovo.recorrencia_preco;
        if (queda.lido.recorrencia_pct != null) manNovo.recorrencia_pct = queda.lido.recorrencia_pct;
        else delete manNovo.recorrencia_pct;
      } else {
        delete manNovo.recorrencia;
        delete manNovo.recorrencia_preco;
        delete manNovo.recorrencia_pct;
      }
    }

    const min90Ref = Number(oferta.min90);
    const novoDescPct = (min90Ref > 0 && queda.preco_novo < min90Ref)
      ? round2(((min90Ref - queda.preco_novo) / min90Ref) * 100)
      : (manNovo.preco_de && Number(manNovo.preco_de) > queda.preco_novo
        ? round2(((Number(manNovo.preco_de) - queda.preco_novo) / Number(manNovo.preco_de)) * 100)
        : oferta.desconto_pct);

    const ofertaAtualizada = Object.assign({}, oferta, {
      preco: queda.preco_novo,
      desconto_pct: novoDescPct,
      preco_em: agora,
      links_manuais: JSON.stringify(manNovo),
    });
    atualizadasIds.add(oferta.oferta_id);
    const updObj = {
      oferta_id: oferta.oferta_id,
      status: oferta.status || 'aprovada',
      preco: queda.preco_novo,
      links_manuais: ofertaAtualizada.links_manuais,
    };
    if (novoDescPct != null && Number.isFinite(Number(novoDescPct))) updObj.desconto_pct = Number(novoDescPct);
    updatesOfertas.push(updObj);

    const linkTg = linkMap[oferta.oferta_id] || oferta.url;
    const quedaPct = queda.preco_anterior > 0 ? round2(((queda.preco_anterior - queda.preco_novo) / queda.preco_anterior) * 100) : 0;
    const descontoMuitoAlto = quedaPct >= 15 || (novoDescPct != null && Number(novoDescPct) >= 35);
    const threadFallback = (t.topicos && t.topicos[oferta.categoria]) ? Number(t.topicos[oferta.categoria]) : 0;
    let editados = 0;
    for (const p of alvos) {
      const chatId = p.plataforma === 'tgc' ? t.canais[p.categoria] : t.grupo_id;
      if (!chatId || !linkTg) continue;
      editados++;
      const imgGuardiao = normalizarImagemOferta(ofertaAtualizada.imagem);
      chamadas.push(...edicoesPost('grupo', { chat_id: chatId, message_id: Number(p.message_id) },
        textos.textoTelegram(ofertaAtualizada, linkTg, cfg), {
          link_preview_options: { url: imgGuardiao || linkTg, prefer_large_media: true, show_above_text: !!imgGuardiao },
          reply_markup: textos.botaoCompra(ofertaAtualizada, linkTg, cfg),
        }));
      if (descontoMuitoAlto) {
        const cupTxt = manNovo.cupom
          ? `\n🎟️ Cupom: <code>${escapeHtml(manNovo.cupom)}</code>`
          : (manNovo.cupom_auto ? `\n🎟️ ${escapeHtml(manNovo.cupom_auto)}` : '');
        const msgLinhas = [
          `📉 <b>BAIXOU MUITO${quedaPct >= 6 ? ` (-${Math.round(quedaPct)}% EXTRA)` : ''}!</b>`,
          `<b><a href="${escapeHtml(linkTg)}">${escapeHtml(truncar(ofertaAtualizada.titulo, 90))}</a></b>`,
          `💸 De <s>${formatBRL(queda.preco_anterior)}</s> → 💰 <b>${formatBRL(queda.preco_novo)}</b>${cupTxt}`,
          `👉 <b><a href="${escapeHtml(linkTg)}">Abrir oferta agora</a></b>`,
        ];
        const payResp = {
          chat_id: chatId,
          text: msgLinhas.join('\n'),
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
          reply_parameters: { message_id: Number(p.message_id), allow_sending_without_reply: true },
        };
        const threadAlvo = p.plataforma === 'tg'
          ? ((t.topicos && t.topicos[p.categoria || oferta.categoria]) ? Number(t.topicos[p.categoria || oferta.categoria]) : threadFallback)
          : 0;
        if (threadAlvo) payResp.message_thread_id = threadAlvo;
        chamadas.push({ bot: 'grupo', metodo: 'sendMessage', payload: payResp });
      }
    }
    if (editados > 0) {
      motivosQueda.push(`• ${truncar(oferta.titulo, 45)} (${formatBRL(queda.preco_anterior)} → ${formatBRL(queda.preco_novo)})`);
    }
  });

  // Limpeza automática de ofertas pendentes com mais de 18h sem interação
  for (const o of ofertasRows || []) {
    if (!o || !o.oferta_id || o.status !== 'pendente' || !o.ts) continue;
    if (encerradasIds.has(o.oferta_id) || atualizadasIds.has(o.oferta_id)) continue;
    if (agora - Number(o.ts) >= 18 * HORA) {
      updatesOfertas.push({ oferta_id: o.oferta_id, status: 'expirada' });
    }
  }

  if (motivos.length) {
    const aviso = `🛡️ Guardião encerrou automaticamente ${motivos.length} oferta(s):\n${motivos.join('\n')}`;
    for (const adm of (cfg && cfg.admins) || []) {
      chamadas.push(chBot('admin', 'sendMessage', { chat_id: adm, text: aviso, link_preview_options: { is_disabled: true } }));
    }
  }
  if (motivosQueda.length) {
    const avisoQ = `📉 Guardião atualizou ao vivo ${motivosQueda.length} post(s) que caíram >=6%:\n${motivosQueda.join('\n')}`;
    for (const adm of (cfg && cfg.admins) || []) {
      chamadas.push(chBot('admin', 'sendMessage', { chat_id: adm, text: avisoQ, link_preview_options: { is_disabled: true } }));
    }
  }

  const upsertsConfig = [];
  const fuso = (cfg && cfg.fuso) || 'America/Sao_Paulo';
  const hojeIso = (plano && plano.hojeIso) || diaISO(agora, fuso);
  const pd = partesData(agora, fuso);
  const hora = plano && plano.hora != null ? plano.hora : Number(pd.hour);
  const minuto = plano && plano.minuto != null ? plano.minuto : Number(pd.minute);

  // Esquenta automático das 18h45 (lotes das 19h no ML, Shopee, Amazon, Shein)
  if (agenteAtivo(cfg, 'marketing') && cfg && cfg.cupons && cfg.cupons.esquenta_19h !== false
      && hora === 18 && minuto >= 35 && cfg.cupons.ultimo_esquenta !== hojeIso) {
    const hubs = [
      { lj: 'ml', txt: '🛒 Cupons Mercado Livre (aba oficial)', url: urlCentralCupons('ml', cfg) },
      { lj: 'shopee', txt: '🟠 Cupons Shopee (diários / 19h)', url: urlCentralCupons('shopee', cfg) },
      { lj: 'amazon', txt: '📦 Central de Cupons Amazon', url: urlCentralCupons('amazon', cfg) },
      { lj: 'shein', txt: '👗 Cupons Shein', url: urlCentralCupons('shein', cfg) },
    ].filter((h) => !!h.url);
    const chamadasEsquenta = [];
    if (hubs.length) {
      const txtEsquenta = [
        '⏰ <b>ESQUENTA DE CUPONS DAS 19H!</b> · #publi',
        '',
        'Em minutos costumam liberar os lotes das 19h (e vários cupons tipo <code>FULL</code> só funcionam para quem resgatou antes!).',
        '👇 <b>Abra e já deixe salvo na conta:</b>',
        '',
        '<i>Contém links de afiliado.</i>',
      ].join('\n');
      const kbEsquenta = { inline_keyboard: hubs.map((h) => [{ text: h.txt, url: h.url }]) };
      if (t.grupo_id && t.topicos && t.topicos.top) {
        chamadasEsquenta.push(chBot('grupo', 'sendMessage', {
          chat_id: t.grupo_id,
          message_thread_id: t.topicos.top,
          text: txtEsquenta,
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
          reply_markup: kbEsquenta,
        }));
      }
      if (t.canais && t.canais.top) {
        chamadasEsquenta.push(chBot('grupo', 'sendMessage', {
          chat_id: t.canais.top,
          text: txtEsquenta,
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
          reply_markup: kbEsquenta,
        }));
      }
      if (chamadasEsquenta.length) {
        chamadas.push(...chamadasEsquenta);
        upsertsConfig.push({ chave: 'cupons.ultimo_esquenta', valor: hojeIso });
      }
    }
  }

  if (cfg && cfg.vitrine && cfg.vitrine.auto_noite !== false && hora === 21 && cfg.vitrine.ultimo_dia !== hojeIso) {
    const ofertasComAtualizacoes = (ofertasRows || []).map((o) => {
      if (!o || !atualizadasIds.has(o.oferta_id)) return o;
      const upd = updatesOfertas.find((u) => u.oferta_id === o.oferta_id);
      return upd ? Object.assign({}, o, upd) : o;
    });
    const ativasRestantes = ofertasComAtualizacoes.filter((o) => o && !encerradasIds.has(o.oferta_id));
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
  avaliarQuedaExtraPagina,
  planejarGuardiao,
  executarGuardiao,
};
