'use strict';
// Configuração: padrões no código + valores da Data Table `config` (chave/valor),
// que você edita no painel do n8n. O workflow 00-setup cria as linhas que faltam.

const PLATAFORMAS = ['tg', 'wac', 'wag', 'x'];

const CATEGORIAS = {
  top: { nome: 'Top do Dia', emoji: '🔥' },
  casa: { nome: 'Casa & Eletro', emoji: '🏠' },
  beleza: { nome: 'Beleza & Presentes', emoji: '🎁' },
  bebe: { nome: 'Bebê & Família', emoji: '👶' },
  tech: { nome: 'Tech – BF Honesta', emoji: '💻' },
};

const BUSCAS_PADRAO = {
  casa: 'air fryer; ventilador; aspirador robô; cafeteira; liquidificador',
  beleza: 'kit perfume; secador de cabelo; prancha alisadora; kit maquiagem; hidratante corporal',
  bebe: 'fralda; lenço umedecido; brinquedo educativo; mamadeira',
  tech: 'fone bluetooth; smartwatch; carregador turbo; ssd; mouse sem fio',
};

/** Esquema da tabela `config`: chave, tipo, padrão e descrição (vira a linha-modelo). */
function esquema() {
  const s = [
    { chave: 'marca', tipo: 'texto', padrao: 'Ofertô', desc: 'Nome da marca (aparece nos textos e no relatório)' },
    { chave: 'admins', tipo: 'lista_num', padrao: '', desc: 'IDs do Telegram de quem aprova (separados por vírgula). Descubra mandando /id ao bot de aprovação' },
    { chave: 'bot_token', tipo: 'segredo', padrao: '', desc: 'Token do BOT DE APROVAÇÃO (@BotFather). Conversa privada com os admins' },
    { chave: 'bot_token_grupo', tipo: 'segredo', padrao: '', desc: 'Token do BOT PUBLICADOR (admin do supergrupo). Vazio = usa o bot de aprovação' },
    { chave: 'grupo_id', tipo: 'texto', padrao: '', desc: 'ID do supergrupo (-100…). O bot publicador avisa os admins ao ser adicionado' },
    { chave: 'grupo_link', tipo: 'texto', padrao: '', desc: 'Link público do grupo (opcional, usado em respostas)' },
    { chave: 'n8n_webhook_url', tipo: 'texto', padrao: '', desc: 'Production URL do nó Webhook do workflow 01 (copie do n8n)' },
    { chave: 'webhook_secret', tipo: 'segredo', padrao: '', desc: 'Gerado pelo setup. Não precisa mexer' },
    { chave: 'bot_grupo_username', tipo: 'texto', padrao: '', desc: 'Gerado pelo setup: @ do bot publicador (usado nos links de divulgação do /links). Não precisa mexer' },
    { chave: 'hash_sal', tipo: 'segredo', padrao: '', desc: 'Gerado pelo setup: sal do hash de quem entra/sai do grupo. Não mude (os hashes antigos deixam de bater)' },
    { chave: 'grupo.textos', tipo: 'texto', padrao: 'pendente', desc: 'pendente = o setup arruma o grupo uma vez (descrição, 💬 Conversa, textos fixados, tópicos fechados) · atualizar = reescreve os textos já fixados, sem mandar mensagem nova · limpar = apaga TODAS as mensagens do grupo (inclusive de membros) e arruma de novo; leva ~4 min · ok = não mexe' },
    { chave: 'grupo.mensagens', tipo: 'texto', padrao: '', desc: 'Gerado pelo setup: IDs das mensagens fixadas (usado pelo modo atualizar). Não precisa mexer' },
    { chave: 'grupo.limpar_avisos', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: o bot publicador apaga os avisos automáticos do grupo (entrou, saiu, fixou, fechou tópico, mudou nome/foto). Precisa da permissão Apagar mensagens. Com o bot admin, cada mensagem do grupo vira 1 execução do n8n' },
    { chave: 'grupo.antispam', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: com grupo.limpar_avisos ligado, o bot publicador apaga mensagens de membros com link de outro grupo, WhatsApp ou encurtador (links de loja viram sugestão para os admins)' },
    { chave: 'rastrear_entradas', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: grava entradas e saídas por link de convite (1 execução do n8n por evento)' },
    { chave: 'campanha_prefixo', tipo: 'texto', padrao: 'bf26', desc: 'Prefixo dos sub-IDs' },
    { chave: 'fuso', tipo: 'texto', padrao: 'America/Sao_Paulo', desc: 'Fuso horário dos textos' },
    { chave: 'auto.link_direto', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: no privado, basta colar ou encaminhar o link do produto que o bot extrai título, preço, imagem e categoria sem exigir /oferta' },
    { chave: 'auto.publicar_direto', tipo: 'texto', padrao: 'nao', desc: 'sim/nao: publica direto no grupo do Telegram e já entrega o texto do WhatsApp sem precisar clicar em Aprovar (ative rápido com /modo rapido)' },
    { chave: 'auto.categoria_padrao', tipo: 'texto', padrao: 'casa', desc: 'Categoria usada quando o bot não identifica pelas palavras do produto (casa, beleza, bebe, tech)' },
    { chave: 'copy.chamativa', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: gera ganchos persuasivos, comparação De/Por e economia em R$ nos textos de Telegram e WhatsApp para atrair cliques' },
    { chave: 'publicar.plataformas', tipo: 'texto', padrao: 'wag,wac,x', desc: 'Quais textos prontos enviar ao aprovar: wag (Grupo WhatsApp), wac (Canal WhatsApp), x (X/Twitter). Use só wag para focar em Telegram + Grupo WhatsApp' },
    { chave: 'selo.tolerancia_pct', tipo: 'numero', padrao: '0', desc: 'Tolerância do selo em % acima do menor preço de 90 dias (recomendado: 0)' },
    { chave: 'selo.exigir_ref90', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: exigir referência de 90 dias no /oferta e na coleta Shopee (links colados direto já liberam aprovação sem ref90 quando não estão acima do histórico)' },
    { chave: 'shopee.app_id', tipo: 'texto', padrao: '', desc: 'App ID da Shopee Affiliate Open API' },
    { chave: 'shopee.secret', tipo: 'segredo', padrao: '', desc: 'Secret da Shopee Affiliate Open API' },
    { chave: 'shopee.endpoint', tipo: 'texto', padrao: 'https://open-api.affiliate.shopee.com.br/graphql', desc: 'Endpoint GraphQL (VERIFICAR no painel)' },
    { chave: 'shopee.min_desconto_pct', tipo: 'numero', padrao: '20', desc: 'Desconto mínimo anunciado pela loja para virar candidata' },
    { chave: 'shopee.min_comissao_pct', tipo: 'numero', padrao: '3', desc: 'Comissão mínima (%)' },
    { chave: 'shopee.min_vendas', tipo: 'numero', padrao: '50', desc: 'Vendas mínimas do produto' },
    { chave: 'shopee.max_cards', tipo: 'numero', padrao: '8', desc: 'Máximo de cards de aprovação por coleta' },
    { chave: 'shopee.enviar_sem_ref', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: enviar candidatas sem referência de 90 dias (para você informar o ref90)' },
    { chave: 'telegram_api', tipo: 'texto', padrao: 'https://api.telegram.org', desc: 'Endereço da Bot API (não altere; usado em testes)' },
    { chave: 'link_curto_api', tipo: 'texto', padrao: '', desc: 'Deixe vazio (usado só em testes para abrir links curtos a.co/amzn.to)' },
    { chave: 'pagina_api', tipo: 'texto', padrao: '', desc: 'Deixe vazio (usado só em testes para ler o HTML da página do produto)' },
    { chave: 'amazon.tag_padrao', tipo: 'texto', padrao: '', desc: 'Tag única da Amazon usada quando não há tag específica por categoria/plataforma (ex.: suatag-20)' },
    { chave: 'tunel.dominio', tipo: 'texto', padrao: '', desc: 'Servidor local: domínio próprio aceito pelo workflow 90 · Túnel além de trycloudflare.com e ngrok (ex.: bot.seudominio.com.br). Vazio = só esses' },
    { chave: 'saude.ultimo_alerta', tipo: 'texto', padrao: '', desc: 'Servidor local: gerado pelo workflow 91 · Saúde (anti-spam dos alertas). Não precisa mexer' },
    { chave: 'amazon.mostrar_preco', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: os posts da Amazon mostram o preço e o %. Com nao, dizem só "no menor preço dos últimos 90 dias" e "Veja o preço atual na Amazon" (use se os termos exigirem preço vindo da API oficial)' },
    { chave: 'keepa.chave', tipo: 'segredo', padrao: '', desc: 'Chave da API da Keepa (plano pago). Com ela, o /oferta da Amazon aceita só o link: título, preço e ref90 vêm da Keepa. Vazio = desligado' },
    { chave: 'keepa.api', tipo: 'texto', padrao: 'https://api.keepa.com', desc: 'Endereço da API da Keepa (não altere; usado em testes)' },
    { chave: 'keepa.buybox', tipo: 'texto', padrao: 'nao', desc: 'sim/nao: usar o preço da Buy Box (com frete) em vez do preço da Amazon/novo. Pode custar tokens extras (VERIFICAR)' },
  ];
  for (const c of Object.keys(CATEGORIAS)) {
    s.push({ chave: `topico.${c}`, tipo: 'numero', padrao: '', desc: `message_thread_id do tópico ${CATEGORIAS[c].nome} (preenchido pelo setup)` });
    s.push({ chave: `canal.${c}`, tipo: 'texto', padrao: '', desc: `Opcional: canal só de ${CATEGORIAS[c].nome} (@usuario do canal ou ID -100…). O bot publicador, admin do canal, posta lá também. Vazio = sem canal` });
    s.push({ chave: `canal_link.${c}`, tipo: 'texto', padrao: '', desc: `Opcional: link de entrada do canal ${CATEGORIAS[c].nome} (para canal privado; com @usuario o link é automático)` });
  }
  for (const c of Object.keys(BUSCAS_PADRAO)) {
    s.push({ chave: `shopee.busca.${c}`, tipo: 'lista_txt', padrao: BUSCAS_PADRAO[c], desc: `Palavras-chave da coleta Shopee para ${CATEGORIAS[c].nome} (separe com ;)` });
  }
  for (const c of Object.keys(CATEGORIAS).filter((k) => k !== 'top')) {
    for (const p of PLATAFORMAS) {
      s.push({ chave: `amazon.tag.${c}_${p}`, tipo: 'texto', padrao: '', desc: `Tag da Amazon para ${CATEGORIAS[c].nome} no ${p}` });
    }
  }
  return s;
}

function padrao() {
  return {
    marca: 'Ofertô',
    admins: [],
    fuso: 'America/Sao_Paulo',
    campanha_prefixo: 'bf26',
    rastrear_entradas: true,
    limpar_avisos: true,
    antispam: true,
    hash_sal: '',
    categorias: JSON.parse(JSON.stringify(CATEGORIAS)),
    telegram: {
      bot_token: '', bot_token_grupo: '', grupo_id: '', grupo_link: '', n8n_webhook_url: '', webhook_secret: '', bot_grupo_username: '',
      api: 'https://api.telegram.org', topicos: {}, canais: {}, canais_link: {}, grupo_textos: 'pendente', grupo_mensagens: {},
    },
    selo: { tolerancia_pct: 0, dias: 90, exigir_ref90: true },
    auto: { link_direto: true, publicar_direto: false, categoria_padrao: 'casa' },
    copy: { chamativa: true },
    publicar: { plataformas: ['wag', 'wac', 'x'] },
    shopee: {
      app_id: '', secret: '', endpoint: 'https://open-api.affiliate.shopee.com.br/graphql',
      min_desconto_pct: 20, min_comissao_pct: 3, min_vendas: 50, max_cards: 8, enviar_sem_ref: true,
      buscas: {},
    },
    amazon: { tag_padrao: '', tags: {}, mostrar_preco: true },
    tunel: { dominio: '' },
    saude: { estado: {} },
    keepa: { chave: '', api: 'https://api.keepa.com', buybox: false },
  };
}

const simNao = (v) => /^(s|sim|y|yes|true|1)$/i.test(String(v).trim());
const num = (v) => {
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

/** Monta o cfg a partir das linhas da tabela `config` ({ chave, valor }). */
function montarConfig(linhas) {
  const cfg = padrao();
  const valores = {};
  for (const e of esquema()) if (e.padrao !== '') valores[e.chave] = e.padrao;
  for (const r of linhas || []) {
    if (!r || !r.chave) continue;
    const chave = String(r.chave).trim();
    const valor = r.valor == null ? '' : String(r.valor).trim();
    // Linha existente e vazia: vale o padrão, exceto nas buscas da Shopee (vazio = não coletar).
    if (valor !== '' || /^shopee\.busca\./.test(chave)) valores[chave] = valor;
  }

  for (const [k, v] of Object.entries(valores)) {
    let m;
    if (k === 'admins') cfg.admins = v.split(/[\s,;]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0);
    else if (['marca', 'fuso', 'campanha_prefixo'].includes(k)) cfg[k] = v;
    else if (k === 'rastrear_entradas') cfg.rastrear_entradas = simNao(v);
    else if (k === 'grupo.limpar_avisos') cfg.limpar_avisos = simNao(v);
    else if (k === 'grupo.antispam') cfg.antispam = simNao(v);
    else if (k === 'hash_sal') cfg.hash_sal = v;
    else if (k === 'bot_grupo_username') cfg.telegram.bot_grupo_username = v.replace(/^@/, '');
    else if (['bot_token', 'bot_token_grupo', 'grupo_id', 'grupo_link', 'n8n_webhook_url', 'webhook_secret'].includes(k)) cfg.telegram[k] = v;
    else if (k === 'grupo.textos') cfg.telegram.grupo_textos = v.toLowerCase();
    else if (k === 'grupo.mensagens') { try { const o = JSON.parse(v); if (o && typeof o === 'object') cfg.telegram.grupo_mensagens = o; } catch (e) { /* valor inválido: ignora */ } }
    else if (k === 'telegram_api') cfg.telegram.api = v.replace(/\/+$/, '');
    else if (k === 'link_curto_api') cfg.link_curto_api = v.replace(/\/+$/, '');
    else if (k === 'pagina_api') cfg.pagina_api = v.replace(/\/+$/, '');
    else if (k === 'auto.link_direto') cfg.auto.link_direto = simNao(v);
    else if (k === 'auto.publicar_direto') cfg.auto.publicar_direto = simNao(v);
    else if (k === 'auto.categoria_padrao') { if (cfg.categorias[v.toLowerCase()] && v.toLowerCase() !== 'top') cfg.auto.categoria_padrao = v.toLowerCase(); }
    else if (k === 'copy.chamativa') cfg.copy.chamativa = simNao(v);
    else if (k === 'publicar.plataformas') {
      const ps = v.toLowerCase().split(/[\s,;]+/).filter((p) => ['wag', 'wac', 'x'].includes(p));
      if (ps.length) cfg.publicar.plataformas = [...new Set(ps)];
    }
    else if ((m = k.match(/^topico\.(\w+)$/))) { if (num(v)) cfg.telegram.topicos[m[1]] = num(v); }
    else if ((m = k.match(/^canal\.(\w+)$/))) { if (/^(@\w{4,}|-100\d+)$/.test(v)) cfg.telegram.canais[m[1]] = v; }
    else if ((m = k.match(/^canal_link\.(\w+)$/))) { if (/^https:\/\/t\.me\//.test(v)) cfg.telegram.canais_link[m[1]] = v; }
    else if (k === 'selo.tolerancia_pct') cfg.selo.tolerancia_pct = num(v) || 0;
    else if (k === 'selo.exigir_ref90') cfg.selo.exigir_ref90 = simNao(v);
    else if ((m = k.match(/^shopee\.busca\.(\w+)$/))) cfg.shopee.buscas[m[1]] = v.split(';').map((s) => s.trim()).filter(Boolean);
    else if (k === 'shopee.enviar_sem_ref') cfg.shopee.enviar_sem_ref = simNao(v);
    else if ((m = k.match(/^shopee\.(min_desconto_pct|min_comissao_pct|min_vendas|max_cards)$/))) { if (num(v) != null) cfg.shopee[m[1]] = num(v); }
    else if ((m = k.match(/^shopee\.(app_id|secret|endpoint)$/))) cfg.shopee[m[1]] = v;
    else if (k === 'amazon.tag_padrao') cfg.amazon.tag_padrao = v;
    else if (k === 'tunel.dominio') cfg.tunel.dominio = v;
    else if (k === 'saude.ultimo_alerta') { try { const o = JSON.parse(v); if (o && typeof o === 'object' && !Array.isArray(o)) cfg.saude.estado = o; } catch (e) { /* valor inválido: ignora */ } }
    else if (k === 'amazon.mostrar_preco') cfg.amazon.mostrar_preco = simNao(v);
    else if ((m = k.match(/^amazon\.tag\.(\w+)$/))) cfg.amazon.tags[m[1]] = v;
    else if (k === 'keepa.chave') cfg.keepa.chave = v;
    else if (k === 'keepa.api') cfg.keepa.api = v.replace(/\/+$/, '');
    else if (k === 'keepa.buybox') cfg.keepa.buybox = simNao(v);
  }
  if (!cfg.telegram.bot_token_grupo) cfg.telegram.bot_token_grupo = cfg.telegram.bot_token;
  cfg.telegram.dois_bots = cfg.telegram.bot_token_grupo !== cfg.telegram.bot_token;
  return cfg;
}

/** Linhas do esquema que ainda não existem na tabela (para o setup inserir). */
function linhasFaltantes(linhas) {
  const existentes = new Set((linhas || []).map((r) => r && r.chave));
  return esquema()
    .filter((e) => !existentes.has(e.chave))
    .map((e) => ({ chave: e.chave, valor: e.padrao, descricao: e.desc }));
}

const CHAVES_PROTEGIDAS_CHAT = new Set([
  'bot_token', 'bot_token_grupo', 'webhook_secret', 'n8n_webhook_url', 'admins', 'hash_sal',
  'telegram_api', 'link_curto_api', 'pagina_api', 'keepa.api', 'shopee.secret', 'keepa.chave',
]);

/**
 * Interpreta /modo [rapido|aprovar|padrao] e /config [<chave> <valor>] enviados pelo admin no privado.
 * Retorna { upserts: [{ chave, valor }], mensagem }.
 */
function interpretarComandoConfig(texto, cfg) {
  const limpo = String(texto || '').trim();
  const partes = limpo.split(/\s+/);
  const cmd = (partes[0] || '').replace(/^\/|@\w+$/g, '').toLowerCase();

  if (cmd === 'modo') {
    const sub = (partes[1] || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (sub === 'rapido' || sub === 'auto' || sub === 'automatico') {
      return {
        upserts: [
          { chave: 'auto.link_direto', valor: 'sim' },
          { chave: 'auto.publicar_direto', valor: 'sim' },
          { chave: 'selo.exigir_ref90', valor: 'nao' },
          { chave: 'publicar.plataformas', valor: 'wag' },
          { chave: 'copy.chamativa', valor: 'sim' },
        ],
        mensagem: [
          '⚡ Modo Rápido ativado!',
          '• Basta colar ou encaminhar qualquer link de produto aqui no privado.',
          '• O bot extrai os dados, publica direto no Telegram (se grupo_id estiver configurado) e já te entrega o texto pronto do Grupo do WhatsApp com botão de 1 toque.',
          '',
          'Para voltar a revisar o card antes de publicar, mande: /modo aprovar',
        ].join('\n'),
      };
    }
    if (sub === 'aprovar' || sub === 'card') {
      return {
        upserts: [
          { chave: 'auto.link_direto', valor: 'sim' },
          { chave: 'auto.publicar_direto', valor: 'nao' },
        ],
        mensagem: [
          '✅ Modo 1-Clique (com card de aprovação) ativado!',
          '• Basta colar o link aqui: o bot monta o card completo e você publica com 1 toque em Aprovar.',
        ].join('\n'),
      };
    }
    if (sub === 'padrao') {
      return {
        upserts: [
          { chave: 'auto.link_direto', valor: 'sim' },
          { chave: 'auto.publicar_direto', valor: 'nao' },
          { chave: 'selo.exigir_ref90', valor: 'sim' },
          { chave: 'publicar.plataformas', valor: 'wag,wac,x' },
          { chave: 'copy.chamativa', valor: 'sim' },
        ],
        mensagem: '🔄 Modo padrão restaurado (card de aprovação + todas as plataformas).',
      };
    }
    const estadoAtual = cfg && cfg.auto && cfg.auto.publicar_direto ? '⚡ Rápido (0 cliques: colou, publicou)' : '✅ 1-Clique (revisa o card antes de publicar)';
    return {
      upserts: [],
      mensagem: [
        `⚙️ Modo atual: ${estadoAtual}`,
        '',
        'Escolha como quer trabalhar:',
        '• /modo rapido — colou o link, publica direto no Telegram e entrega só o texto do Grupo WhatsApp (zero cliques)',
        '• /modo aprovar — colou o link, recebe o card e publica com 1 clique',
        '• /modo padrao — card de aprovação + textos para WhatsApp (grupo e canal) e X',
      ].join('\n'),
    };
  }

  // /config
  const chave = (partes[1] || '').trim();
  const valor = partes.slice(2).join(' ').trim();
  if (!chave) {
    const a = (cfg && cfg.auto) || {};
    const plats = ((cfg && cfg.publicar && cfg.publicar.plataformas) || ['wag', 'wac', 'x']).join(', ');
    return {
      upserts: [],
      mensagem: [
        `⚙️ Configuração rápida (${(cfg && cfg.marca) || 'Ofertô'})`,
        '',
        `• Colar só o link (auto.link_direto): ${a.link_direto !== false ? 'sim ✅' : 'nao'}`,
        `• Publicar sem clicar (auto.publicar_direto): ${a.publicar_direto ? 'sim ⚡' : 'nao (1 clique no card)'}`,
        `• Copy persuasiva (copy.chamativa): ${cfg && cfg.copy && cfg.copy.chamativa === false ? 'nao' : 'sim ✅'}`,
        `• Textos entregues (publicar.plataformas): ${plats}`,
        `• Exigir ref90 no /oferta e Shopee (selo.exigir_ref90): ${cfg && cfg.selo && cfg.selo.exigir_ref90 === false ? 'nao' : 'sim'}`,
        `• Tag padrão Amazon (amazon.tag_padrao): ${(cfg && cfg.amazon && cfg.amazon.tag_padrao) || '(não definida)'}`,
        `• Shopee API: ${cfg && cfg.shopee && cfg.shopee.app_id && cfg.shopee.secret ? 'configurada ✅' : '(opcional: aceita link s.shopee.com.br direto)'}`,
        `• Grupo Telegram (grupo_id): ${(cfg && cfg.telegram && cfg.telegram.grupo_id) || '(opcional: sem ele, use 📋 Só textos)'}`,
        '',
        'Atalhos úteis:',
        '/modo rapido',
        '/config amazon.tag_padrao suatag-20',
        '/config publicar.plataformas wag',
        '/config marca NomeDoGrupo',
      ].join('\n'),
    };
  }

  const def = esquema().find((e) => e.chave === chave);
  if (!def) {
    return { upserts: [], mensagem: `❗ Chave "${chave}" não existe. Mande /config sozinho para ver os atalhos.` };
  }
  if (CHAVES_PROTEGIDAS_CHAT.has(chave) || def.tipo === 'segredo') {
    return { upserts: [], mensagem: `🔒 Por segurança, a chave "${chave}" só pode ser editada no painel do n8n (Data Table bfx_config).` };
  }
  if (!valor) {
    return { upserts: [], mensagem: `Uso: /config ${chave} <novo_valor>\nDescrição: ${def.desc}` };
  }
  return {
    upserts: [{ chave, valor }],
    mensagem: `✅ Configuração salva: ${chave} = ${valor}`,
  };
}

module.exports = { PLATAFORMAS, CATEGORIAS, esquema, padrao, montarConfig, linhasFaltantes, interpretarComandoConfig };
