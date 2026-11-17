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
    { chave: 'grupo.textos', tipo: 'texto', padrao: 'pendente', desc: 'pendente = o setup arruma o grupo uma vez (descrição, 💬 Conversa, textos fixados, tópicos fechados) · atualizar = reescreve os textos já fixados, sem mandar mensagem nova · limpar = apaga TODAS as mensagens do grupo (inclusive de membros) e arruma de novo; leva ~4 min · ok = não mexe' },
    { chave: 'grupo.mensagens', tipo: 'texto', padrao: '', desc: 'Gerado pelo setup: IDs das mensagens fixadas (usado pelo modo atualizar). Não precisa mexer' },
    { chave: 'grupo.limpar_avisos', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: o bot publicador apaga os avisos automáticos do grupo (entrou, saiu, fixou, fechou tópico, mudou nome/foto). Precisa da permissão Apagar mensagens. Com o bot admin, cada mensagem do grupo vira 1 execução do n8n' },
    { chave: 'rastrear_entradas', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: grava entradas e saídas por link de convite (1 execução do n8n por evento)' },
    { chave: 'campanha_prefixo', tipo: 'texto', padrao: 'bf26', desc: 'Prefixo dos sub-IDs' },
    { chave: 'fuso', tipo: 'texto', padrao: 'America/Sao_Paulo', desc: 'Fuso horário dos textos' },
    { chave: 'selo.tolerancia_pct', tipo: 'numero', padrao: '0', desc: 'Tolerância do selo em % acima do menor preço de 90 dias (recomendado: 0)' },
    { chave: 'shopee.app_id', tipo: 'texto', padrao: '', desc: 'App ID da Shopee Affiliate Open API' },
    { chave: 'shopee.secret', tipo: 'segredo', padrao: '', desc: 'Secret da Shopee Affiliate Open API' },
    { chave: 'shopee.endpoint', tipo: 'texto', padrao: 'https://open-api.affiliate.shopee.com.br/graphql', desc: 'Endpoint GraphQL (VERIFICAR no painel)' },
    { chave: 'shopee.min_desconto_pct', tipo: 'numero', padrao: '20', desc: 'Desconto mínimo anunciado pela loja para virar candidata' },
    { chave: 'shopee.min_comissao_pct', tipo: 'numero', padrao: '3', desc: 'Comissão mínima (%)' },
    { chave: 'shopee.min_vendas', tipo: 'numero', padrao: '50', desc: 'Vendas mínimas do produto' },
    { chave: 'shopee.max_cards', tipo: 'numero', padrao: '8', desc: 'Máximo de cards de aprovação por coleta' },
    { chave: 'shopee.enviar_sem_ref', tipo: 'texto', padrao: 'sim', desc: 'sim/nao: enviar candidatas sem referência de 90 dias (para você informar o ref90)' },
    { chave: 'telegram_api', tipo: 'texto', padrao: 'https://api.telegram.org', desc: 'Endereço da Bot API (não altere; usado em testes)' },
    { chave: 'amazon.tag_padrao', tipo: 'texto', padrao: '', desc: 'Tag usada quando não há tag específica (perde a atribuição por plataforma)' },
  ];
  for (const c of Object.keys(CATEGORIAS)) {
    s.push({ chave: `topico.${c}`, tipo: 'numero', padrao: '', desc: `message_thread_id do tópico ${CATEGORIAS[c].nome} (preenchido pelo setup)` });
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
    categorias: JSON.parse(JSON.stringify(CATEGORIAS)),
    telegram: {
      bot_token: '', bot_token_grupo: '', grupo_id: '', grupo_link: '', n8n_webhook_url: '', webhook_secret: '',
      api: 'https://api.telegram.org', topicos: {}, grupo_textos: 'pendente', grupo_mensagens: {},
    },
    selo: { tolerancia_pct: 0, dias: 90 },
    shopee: {
      app_id: '', secret: '', endpoint: 'https://open-api.affiliate.shopee.com.br/graphql',
      min_desconto_pct: 20, min_comissao_pct: 3, min_vendas: 50, max_cards: 8, enviar_sem_ref: true,
      buscas: {},
    },
    amazon: { tag_padrao: '', tags: {} },
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
    else if (['bot_token', 'bot_token_grupo', 'grupo_id', 'grupo_link', 'n8n_webhook_url', 'webhook_secret'].includes(k)) cfg.telegram[k] = v;
    else if (k === 'grupo.textos') cfg.telegram.grupo_textos = v.toLowerCase();
    else if (k === 'grupo.mensagens') { try { const o = JSON.parse(v); if (o && typeof o === 'object') cfg.telegram.grupo_mensagens = o; } catch (e) { /* valor inválido: ignora */ } }
    else if (k === 'telegram_api') cfg.telegram.api = v.replace(/\/+$/, '');
    else if ((m = k.match(/^topico\.(\w+)$/))) { if (num(v)) cfg.telegram.topicos[m[1]] = num(v); }
    else if (k === 'selo.tolerancia_pct') cfg.selo.tolerancia_pct = num(v) || 0;
    else if ((m = k.match(/^shopee\.busca\.(\w+)$/))) cfg.shopee.buscas[m[1]] = v.split(';').map((s) => s.trim()).filter(Boolean);
    else if (k === 'shopee.enviar_sem_ref') cfg.shopee.enviar_sem_ref = simNao(v);
    else if ((m = k.match(/^shopee\.(min_desconto_pct|min_comissao_pct|min_vendas|max_cards)$/))) { if (num(v) != null) cfg.shopee[m[1]] = num(v); }
    else if ((m = k.match(/^shopee\.(app_id|secret|endpoint)$/))) cfg.shopee[m[1]] = v;
    else if (k === 'amazon.tag_padrao') cfg.amazon.tag_padrao = v;
    else if ((m = k.match(/^amazon\.tag\.(\w+)$/))) cfg.amazon.tags[m[1]] = v;
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

module.exports = { PLATAFORMAS, CATEGORIAS, esquema, padrao, montarConfig, linhasFaltantes };
