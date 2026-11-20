'use strict';
// Leitura do produto: o que alguém que abriu o anúncio comentaria no grupo.
//
// Lê fatos concretos do TÍTULO (capacidade, armazenamento, tamanho de tela, voltagem, quantidade no
// pacote, ativo do skincare, formato do aparelho…) e devolve frases que citam esse fato e dizem por que
// ele importa pra quem compra. É o que tira a copy do genérico ("Pra quem gosta de cozinhar…") e põe no
// específico ("4L dá conta da janta de casa inteira de uma vez").
//
// Regras (as mesmas de lib/tom.js validarCopy): nada inventado, só número que está no título, sem promessa
// de resultado/desempenho medido, sem urgência. "Notas" são observações honestas de quem leu o anúncio
// ("essa versão é 127V") e entram como segunda frase.
//
// Puro e sem I/O.
const { textoDetalhes } = require('./destaques');

function num(s) {
  return Number(String(s || '').replace(',', '.'));
}

/**
 * Fatos lidos do título para o nicho/subnicho detectado.
 * @param {string} titulo
 * @param {{nicho:string, sub:string}} det
 * @returns {Array<{k:string, rotulo:string, frases:string[], nota?:boolean}>}
 *   frases: frases completas que citam o fato; nota = observação que vai como 2ª frase.
 */
function lerProduto(titulo, det, pagina) {
  const t = String(titulo || '');
  const d = det || { nicho: 'geral', sub: 'geral' };
  const pg = pagina || {};
  const ficha = pg.ficha && typeof pg.ficha === 'object' ? pg.ficha : {};
  const det2 = textoDetalhes(pg.destaques, ficha);
  const out = [];
  const add = (k, rotulo, frases, nota) => {
    if (!frases || !frases.length || out.some((f) => f.k === k)) return;
    out.push({ k, rotulo, frases, nota: !!nota });
  };
  const daFicha = (re) => {
    const k = Object.keys(ficha).find((x) => re.test(x));
    return k ? String(ficha[k]) : '';
  };
  let m;

  /* ---------- voltagem (vale pra qualquer eletro; título ou ficha "Voltagem/Tensão") ---------- */
  const ehEletro = /\b(?:\d{3,4}\s*w|el[eé]tric[oa]|air\s*fryer|fritadeira|liquidificador|cafeteira|aspirador|ventilador|micro[- ]?ondas|batedeira|secador|chapinha|prancha|sanduicheira|chaleira|forno|panela\s+el[eé]trica|furadeira|parafusadeira|lavadora|mixer|processador)\b/i.test(t);
  const voltFicha = daFicha(/volt|tens[aã]o/i);
  const ehBivolt = /\bbivolt\b/i.test(t) || /bivolt|127\s*v?\s*(?:\/|e|-)\s*220|110\s*(?:\/|-)\s*220|autom[aá]tic/i.test(voltFicha);
  if (ehBivolt) {
    add('bivolt', 'bivolt (funciona em 127V e 220V)', ['Bivolt, então serve em qualquer tomada, de casa ou da viagem.', 'Detalhe bom: é bivolt, nada de conferir tomada.']);
  } else if (ehEletro && ((m = t.match(/\b(110|127|220)\s*v\b/i)) || (m = voltFicha.match(/^\s*(110|127|220)\s*(?:v|volts?)?\s*$/i)))) {
    add('voltagem', `versão ${m[1]}V (não é bivolt)`, [`Só confere a tomada: essa versão é ${m[1]}V.`, `Atenção que essa é a versão ${m[1]}V.`], true);
  }

  /* ---------- tech ---------- */
  if (d.nicho === 'tech' && d.sub === 'celular' && (m = t.match(/\b(64|128|256|512|1024)\s*gb\b/i))) {
    const gb = num(m[1]);
    if (gb >= 256) {
      add('armazenamento', `${gb}GB de armazenamento`, [
        `Com ${gb}GB dá pra parar de apagar foto toda vez que vai instalar app.`,
        `${gb}GB de espaço: foto, vídeo e app sem fazer faxina no celular todo mês.`,
      ]);
    } else if (gb === 128) {
      add('armazenamento', '128GB de armazenamento', ['128GB dá conta de foto e app do dia a dia sem aperto.']);
    } else {
      add('armazenamento', `${gb}GB de armazenamento (pouco pra quem guarda muita foto)`, [`Só repara que é ${gb}GB: pra quem guarda muita foto, pode apertar.`], true);
    }
  }
  if (d.nicho === 'tech' && d.sub === 'tv' && (m = t.match(/\b(\d{2})\s*(?:"|''|”|pol(?:egadas)?\b)/i))) {
    const pol = num(m[1]);
    if (pol >= 55) add('tela', `tela de ${pol} polegadas`, [`${pol} polegadas já muda a cara da sala no futebol de domingo.`, `Tela de ${pol} polegadas é aquela que faz a sala virar cinema.`]);
    else if (pol >= 40) add('tela', `tela de ${pol} polegadas`, [`${pol} polegadas é o tamanho que cabe na maioria das salas sem engolir o rack.`]);
    else add('tela', `tela de ${pol} polegadas (tamanho de quarto)`, [`${pol} polegadas é tamanho de quarto ou cozinha, não de sala.`], true);
  }
  if (d.nicho === 'tech' && d.sub === 'audio') {
    const anc = /\b(?:anc|cancelamento\s+(?:ativo\s+)?de\s+ru[ií]do)\b/i.test(t);
    if (/\b(?:tws|earbuds?|in-?ear|intra-?auricular)\b/i.test(t)) {
      add('formato_fone', 'fone intra-auricular sem fio', ['Daqueles que somem no ouvido e cabem no bolso da calça.', 'Fone de bolso: tira do estojo e já tá conectado.']);
    } else if (/\bon-?ear\b/i.test(t)) {
      add('formato_fone', 'fone on-ear (apoia na orelha)', ['Modelo on-ear, que apoia na orelha e pesa menos que os grandões.']);
    } else if (/\bover-?ear|headphone\b/i.test(t) && !anc) {
      add('formato_fone', 'headphone over-ear', ['Headphone de cobrir a orelha, daqueles pra sessão longa de música.']);
    }
    if (!anc && /\bbluetooth|sem\s+fio\b/i.test(t) && !/\b(?:tws|earbuds?)\b/i.test(t)) {
      add('sem_fio', 'sem fio (Bluetooth)', ['Sem fio, então acabou o cabo enroscando na mochila.']);
    }
    if (/\bcaixa\s+de\s+som\b/i.test(t) && /\b(?:prova\s+d.?[aá]gua|ipx?\d)\b/i.test(t)) {
      add('agua', 'resistente a água', ['Aguenta respingo, então pode ir pra beira da piscina e pro chuveiro.']);
    }
  }
  if ((d.nicho === 'tech' || d.nicho === 'hardware') && (m = t.match(/\b(\d{4,5})\s*mah\b/i)) && /power\s*bank|carregador\s+port[aá]til|bateria\s+externa/i.test(t)) {
    const mah = num(m[1]);
    if (mah >= 10000) add('bateria', `${mah}mAh de bateria`, [`${mah}mAh pra segurar o celular o dia todo longe da tomada.`, `Com ${mah}mAh na mochila, bateria acabando deixa de ser problema.`]);
  }
  if (d.nicho === 'hardware' && (m = t.match(/\b(1|2|4)\s*tb\b/i)) && /\b(?:ssd|nvme|hd)\b/i.test(t)) {
    add('capacidade_disco', `${m[1]}TB`, [`Com ${m[1]}TB dá pra deixar a biblioteca de jogos instalada sem rodízio.`]);
  }
  if (d.nicho === 'hardware' && d.sub === 'monitor' && (m = t.match(/\b(2[7-9]|3[0-9]|4[0-9])\s*(?:"|''|”|pol)/i))) {
    add('tela_monitor', `monitor de ${m[1]} polegadas`, [`${m[1]} polegadas dá espaço pra planilha e jogo sem ficar caçando janela.`]);
  }

  /* ---------- casa ---------- */
  if (d.nicho === 'casa' && d.sub === 'airfryer' && (m = t.match(/\b(\d+(?:[.,]\d)?)\s*(?:l|litros?)\b/i))) {
    const l = num(m[1]);
    const v = m[1];
    if (l >= 5) add('capacidade', `cesto de ${v}L (tamanho família)`, [`${v}L dá conta da porção da família inteira numa leva só.`, `Cesto de ${v}L: batata pra todo mundo sem fazer em duas rodadas.`]);
    else if (l >= 4) add('capacidade', `cesto de ${v}L`, [`${v}L é tamanho bom pra casa de até quatro pessoas.`, `Cesto de ${v}L, que dá pra janta de casa sem fazer em duas levas.`]);
    else add('capacidade', `cesto de ${v}L (compacta)`, [`${v}L é o tamanho certo pra quem mora sozinho ou em dupla.`, `Compacta de ${v}L, cabe em qualquer bancada.`]);
  }
  if (d.nicho === 'casa' && d.sub === 'faxina') {
    if (/\b2\s*em\s*1\b/i.test(t) && /vertical/i.test(t)) add('formato_aspirador', 'vertical 2 em 1 (vira aspirador de mão)', ['O 2 em 1 vira de mão pra sofá, cantinho e banco do carro.', 'Vertical que destaca e vira de mão: chão e sofá com o mesmo aparelho.']);
    if (/\bsem\s+fio\b|\bbateria\b/i.test(t)) add('sem_fio', 'sem fio, a bateria', ['Sem fio, então dá pra passar rapidinho sem caçar tomada.']);
    if (/\brob[ôo]\b/i.test(t)) add('robo', 'robô aspirador', ['Robô limpando enquanto você tá no trampo muda a rotina da casa.']);
  }
  if (d.nicho === 'casa' && /\b(?:garrafa|copo)\s+t[eé]rmic/i.test(t) && (m = t.match(/\b(\d{3,4})\s*ml\b/i))) {
    const ml = num(m[1]);
    if (ml >= 900) add('volume', `${ml}ml`, [`${ml}ml dá pra passar a tarde sem ir encher no bebedouro.`]);
  }
  if (d.nicho === 'casa' && d.sub === 'clima' && /\bsilencios[oa]\b/i.test(t)) {
    add('silencioso', 'modelo silencioso', ['Versão silenciosa, boa pra deixar ligada no quarto a noite toda.']);
  }

  /* ---------- beleza ---------- */
  if (d.nicho === 'beleza') {
    if ((m = t.match(/\bfps\s*(\d{2})\b/i)) && num(m[1]) >= 50) {
      add('fps', `FPS ${m[1]}`, [`FPS ${m[1]} pra quem pega sol até no caminho pro trampo.`, `Protetor FPS ${m[1]} pra não ter desculpa de pular o passo de manhã.`]);
    }
    if (/\bcom\s+cor\b|\btonalizante\b|\bcolor\b/i.test(t) && d.sub === 'protetor') {
      add('cor', 'versão com cor', ['Versão com cor, que no dia corrido já quebra o galho da base.']);
    }
    if (/\btoque\s+seco\b|\boil[- ]?free\b|\bmatte\b/i.test(`${t} ${det2}`)) {
      add('textura', 'textura de toque seco', ['Textura de toque seco, pra quem odeia sensação de pele melada.']);
    }
    const ATIVOS = [
      ['niacinamida', 'niacinamida', 'Pra quem já tem niacinamida na rotina e tá vendo o frasco acabar.'],
      ['vitamina\\s*c', 'vitamina C', 'Pra quem não larga a vitamina C no passo a passo da manhã.'],
      ['retinol', 'retinol', 'Pra quem já tem retinol no ritual da noite.'],
      ['[aá]cido\\s+hialur[oô]nico|hialur[oô]nico', 'ácido hialurônico', 'Pra quem não larga o hialurônico na rotina de hidratação.'],
      ['ceramidas?', 'ceramidas', 'Pra rotina de quem gosta de hidratante com ceramida.'],
    ];
    for (const [re, nome, frase] of ATIVOS) {
      if (new RegExp(`(?:^|[^\\p{L}])(?:${re})(?![\\p{L}])`, 'iu').test(t)) { add('ativo', `ativo: ${nome}`, [frase]); break; }
    }
  }

  /* ---------- perfumes ---------- */
  if (d.nicho === 'perfumes' && (m = t.match(/\b(100|150|200)\s*ml\b/i))) {
    add('frasco', `frasco de ${m[1]}ml`, [`Frasco de ${m[1]}ml, desses que ficam um bom tempo na prateleira.`]);
  }

  /* ---------- moda ---------- */
  if (d.nicho === 'moda') {
    if ((m = t.match(/\b(?:kit|pack|pacote|c\/)\s*(?:com\s+)?(\d{1,2})\b/i)) && num(m[1]) >= 3) {
      add('kit', `kit com ${m[1]} peças`, [`Kit com ${m[1]} peças resolve a semana sem repetir.`, `${m[1]} peças de uma vez: gaveta renovada numa compra só.`]);
    }
    if (/\bb[aá]sica\b/i.test(t) && /\balgod[aã]o\b/i.test(t)) {
      add('basica', 'básica de algodão', ['Básica de algodão, a peça que combina com tudo que já tá no armário.']);
    }
  }

  /* ---------- consumíveis com quantidade no pacote ---------- */
  const QTD = [
    [/\b(\d{2,3})\s*fraldas?\b/i, 100, (v) => [`${v} fraldas no pacote: estoque pra várias semanas de troca.`, `Pacotão de ${v} fraldas, daqueles que adiam a próxima ida ao mercado.`], 'fraldas'],
    [/\b(\d{2,3})\s*c[aá]psulas\b/i, 30, (v) => [`${v} cápsulas é cafezinho garantido por um bom tempo.`], 'cápsulas'],
    [/\b(\d{2})\s*rolos\b/i, 12, (v) => [`${v} rolos e o papel some da lista de compras por um tempo.`], 'rolos'],
    [/\b(\d{2,3})\s*(?:len[cç]os|unidades)\b/i, 100, (v) => [`${v} unidades no pacote, que rende bem mais que o avulso.`], 'unidades'],
  ];
  if (!['suplementos', 'saude', 'cuidado'].includes(d.nicho)) {
    for (const [re, min, fn, nome] of QTD) {
      if ((m = t.match(re)) && num(m[1]) >= min) { add('quantidade', `${m[1]} ${nome} no pacote`, fn(m[1])); break; }
    }
  }
  if (d.nicho === 'pet' && (m = t.match(/\b(\d{1,2}(?:[.,]\d)?)\s*kg\b/i)) && num(m[1]) >= 10) {
    add('saco', `saco de ${m[1]}kg`, [`Saco de ${m[1]}kg, daqueles que seguram o pote cheio por semanas.`]);
  }

  /* ---------- games e livros ---------- */
  if (d.nicho === 'games' && /\bm[ií]dia\s+f[ií]sica\b/i.test(t)) {
    add('midia_fisica', 'mídia física', ['Mídia física: zerou, dá pra emprestar ou passar pra frente.']);
  }
  if (d.nicho === 'livros' && /\bcapa\s+dura\b/i.test(t)) {
    add('capa_dura', 'edição capa dura', ['Edição capa dura, daquelas que fazem bonito na estante.']);
  }
  if (d.nicho === 'livros' && (m = t.match(/\bbox\b.{0,30}?\b(\d{1,2})\s*(?:livros|volumes)\b/i))) {
    add('box', `box com ${m[1]} livros`, [`Box com ${m[1]} livros: a saga inteira de uma vez na estante.`]);
  }

  /* ---------- fatos que só a página da loja traz (destaques + ficha técnica) ---------- */
  if (det2) lerPagina(det2, d, add, daFicha);

  return out;
}

/**
 * Fatos dos destaques/ficha da página. Só entram os que o título não trouxe (add ignora chave repetida).
 * Os números citados vêm do texto da página; validarCopy aceita número que está no título OU nos detalhes.
 */
function lerPagina(txt, d, add, daFicha) {
  let m;
  const tech = d.nicho === 'tech' || d.nicho === 'hardware' || d.nicho === 'games';
  if (tech && (m = txt.match(/(?:bateria|autonomia|reprodu[cç][aã]o|uso)\D{0,40}?(\d{1,3})\s*h(?:oras)?\b/i) || (tech && (m = txt.match(/\b(?:at[eé]\s+)?(\d{1,3})\s*h(?:oras)?\s+de\s+(?:bateria|autonomia|reprodu)/i))))) {
    const h = Number(m[1]);
    if (h >= 24 && h <= 200) add('bateria_horas', `bateria de até ${h} horas`, [`Até ${h} horas de bateria: dá pra esquecer o carregador por uns dias.`, `São ${h} horas de bateria, carrega e esquece.`]);
    else if (h >= 8 && h < 24) add('bateria_horas', `bateria de até ${h} horas`, [`Até ${h} horas de bateria, segura o dia inteiro de uso.`]);
  }
  if (tech && /cancelamento\s+(?:ativo\s+)?de\s+ru[ií]do|\banc\b/i.test(txt)) {
    add('anc_pagina', 'cancelamento de ruído', ['Tem cancelamento de ruído, então ônibus lotado vira outro mundo.']);
  }
  if (d.nicho === 'tech' && (m = txt.match(/\bipx?\s?([4-8])\b/i))) {
    add('agua', `resistência à água (IP${m[0].toUpperCase().includes('IPX') ? 'X' : ''}${m[1]})`, ['Aguenta suor e respingo, então pode ir pro treino sem dó.']);
  }
  if (tech && /carregamento\s+(?:r[aá]pido|turbo)|turbo\s*power|super\s*charge/i.test(txt)) {
    add('carga_rapida', 'carregamento rápido', ['Com carregamento rápido, a tomada vira parada curta.']);
  }
  if (d.nicho === 'casa') {
    if (/desligamento\s+autom[aá]tico|timer|temporizador/i.test(txt) && /airfryer|cozinha/.test(d.sub)) {
      add('timer', 'timer com desligamento automático', ['Tem timer com desligamento automático: liga, programa e vai tomar banho.']);
    }
    if (/lava[- ]?lou[cç]as/i.test(txt) && /airfryer|cozinha/.test(d.sub)) {
      add('lava_loucas', 'peças vão na lava-louças', ['As peças vão na lava-louças, então limpar não vira desculpa pra não usar.']);
    }
    if (/antiaderente/i.test(txt) && /airfryer|cozinha/.test(d.sub)) {
      add('antiaderente', 'revestimento antiaderente', ['Antiaderente, sai com uma passada de esponja.']);
    }
    if (/silencios[oa]|baixo\s+ru[ií]do/i.test(txt) && /clima|faxina/.test(d.sub)) {
      add('silencioso', 'funcionamento silencioso', ['Funciona baixinho, dá pra usar sem acordar a casa.']);
    }
    if (d.sub === 'airfryer' && (m = (daFicha(/capacidade/i) || '').match(/(\d+(?:[.,]\d)?)\s*(?:l|litros?)\b/i))) {
      const l = Number(m[1].replace(',', '.'));
      const v = m[1];
      if (l >= 5) add('capacidade', `cesto de ${v}L (tamanho família)`, [`${v}L de cesto dá conta da porção da família inteira numa leva só.`]);
      else if (l >= 3.5) add('capacidade', `cesto de ${v}L`, [`Cesto de ${v}L, que dá pra janta de casa sem fazer em duas levas.`]);
      else add('capacidade', `cesto de ${v}L (compacta)`, [`${v}L é o tamanho certo pra quem mora sozinho ou em dupla.`]);
    }
  }
  if (d.nicho === 'beleza') {
    // "pele oleosa" no destaque ou "Tipo de pele: Oleosa" na ficha.
    if ((m = txt.match(/peles?\s*:?\s*(oleosa|mista|seca|sens[ií]vel|acneica)s?/i))) {
      const tipo = m[1].toLowerCase();
      add('tipo_pele', `indicado para pele ${tipo}`, [`Indicado pra pele ${tipo}, então já dá pra saber se é pra você.`]);
    }
    if (/\bvegan[oa]\b/i.test(txt) && /cruelty[- ]?free|n[aã]o\s+testad/i.test(txt)) {
      add('vegano', 'vegano e cruelty-free', ['Vegano e cruelty-free, pra quem olha isso antes de comprar.']);
    }
  }
  if (d.nicho === 'pet') {
    if ((m = txt.match(/\b(pequeno|m[eé]dio|grande)s?\s+porte\b/i))) {
      add('porte', `pra cães de ${m[1].toLowerCase()} porte`, [`Feita pra cães de ${m[1].toLowerCase()} porte, confere se é o caso do seu.`]);
    }
    if (/\bfilhotes?\b/i.test(txt) && !/adultos?/i.test(txt)) add('fase', 'pra filhotes', ['Fórmula pra filhote, já pensada pra essa fase.']);
  }
  if (d.nicho === 'perfumes' && (m = (daFicha(/fam[ií]lia|olfativ/i) || '').match(/^([\p{L} -]{4,30})$/u))) {
    const fam = m[1].trim().toLowerCase();
    add('familia', `família olfativa ${fam}`, [`Família ${fam}, pra quem curte essa pegada.`]);
  }
}

/** Fatos em texto curto para a ficha da IA ("cesto de 4L", "versão 127V (não é bivolt)"). */
function fatosProduto(titulo, det, pagina) {
  return lerProduto(titulo, det, pagina).map((f) => f.rotulo);
}

module.exports = { lerProduto, fatosProduto };
