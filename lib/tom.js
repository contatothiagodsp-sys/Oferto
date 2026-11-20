'use strict';
// Camada de tom de voz dos envios (copy por nicho/público).
//
// A frase soa como alguém do grupo mandando o achado: fala da dor, do upgrade ou do porquê de valer a
// pena, nunca explica o produto. Arquitetura (tudo puro e sem I/O; o HTTP fica num nó do n8n):
//   1. Roteador de tom: detectarNicho(oferta) lê título + categoria e devolve nicho, subnicho,
//      grupo/fandom de K-pop e especificações do título. PERFIS[nicho] traz público, jeito de falar,
//      dores reais, vocabulário de quem é do nicho e o que evitar.
//   2. Geração por IA (opcional, copy.ia = sim): lib/tom-ia.js monta o pedido à Claude API e lê a
//      resposta; validarCopy() aprova ou reprova. Aprovada, vai para links_manuais.copy_ia.
//   3. Fallback limpo: fraseNicho() escolhe uma frase do banco do nicho/subnicho para o contexto da
//      oferta (neutro, queda verificada ou cupom), fixa por produto.
// validarCopy() barra urgência/escassez que não dá pra provar, elogio de preço sem comparação
// verificada, número fora do título, preço/%, link, emoji, promessa de saúde e caixa alta.
// linhaCopy() é o único ponto que os textos (lib/textos.js) consultam.
const { escapeHtml } = require('./util');
const { indiceDeterministico, resumoEconomia } = require('./copy');

const MAX_COPY = 120;
const MIN_COPY = 15;

/* ---------- 1. roteador de tom ---------- */

/** Grupos de K-pop → nome de exibição + fandom (referência natural para quem é fã). */
const GRUPOS_KPOP = [
  ['bts', 'BTS', 'ARMY', /\b(?:bts|bangtan|jungkook|jimin|taehyung|agust\s*d|j-?hope|tinytan|tiny\s*tan|bt21|army\s*bomb)\b/i],
  ['stray_kids', 'Stray Kids', 'STAY', /\b(?:stray\s*kids|skzoo|skz)\b/i],
  ['blackpink', 'BLACKPINK', 'BLINK', /\b(?:blackpink|black\s*pink)\b/i],
  ['twice', 'TWICE', 'ONCE', /\b(?:twice|candybong)\b/i],
  ['seventeen', 'SEVENTEEN', 'CARAT', /\b(?:seventeen|carat\s*bong)\b/i],
  ['enhypen', 'ENHYPEN', 'ENGENE', /\benhypen\b/i],
  ['newjeans', 'NewJeans', 'Bunnies', /\b(?:newjeans|new\s*jeans)\b/i],
  ['le_sserafim', 'LE SSERAFIM', 'FEARNOT', /\b(?:le\s*sserafim|lesserafim)\b/i],
  ['aespa', 'aespa', 'MY', /\baespa\b/i],
  ['ateez', 'ATEEZ', 'ATINY', /\b(?:ateez|aniteez|lightiny)\b/i],
  ['txt', 'TXT', 'MOA', /\b(?:tomorrow\s*x\s*together|txt|moabong)\b/i],
  ['itzy', 'ITZY', 'MIDZY', /\bitzy\b/i],
  ['ive', 'IVE', 'DIVE', /\bive\b(?=.{0,40}\b(?:album|álbum|ver\.?|vers[aã]o|photobook|digipack|mini|kit|lightstick)\b)|\b(?:álbum|album)\s+(?:do\s+|da\s+)?ive\b/i],
  ['nct', 'NCT', 'NCTzen', /\b(?:nct(?:\s*(?:127|dream|wish|u))?|wayv|neobong)\b/i],
  ['exo', 'EXO', 'EXO-L', /\bexo\b(?!\s*(?:sk|terra))/i],
  ['shinee', 'SHINee', 'Shawol', /\bshinee\b/i],
  ['red_velvet', 'Red Velvet', 'ReVeluv', /\bred\s*velvet\b(?=.{0,60}\b(?:album|álbum|k-?pop|ver\.?|photobook)\b)/i],
  ['got7', 'GOT7', 'Ahgase', /\bgot7\b/i],
  ['monsta_x', 'MONSTA X', 'Monbebe', /\bmonsta\s*x\b/i],
  ['babymonster', 'BABYMONSTER', 'MONSTIEZ', /\b(?:babymonster|baby\s*monster|babymons7er)\b/i],
  ['illit', 'ILLIT', 'GLLIT', /\billit\b/i],
  ['katseye', 'KATSEYE', 'EYEKONS', /\bkatseye\b/i],
  ['riize', 'RIIZE', 'BRIIZE', /\briize\b/i],
  ['zerobaseone', 'ZEROBASEONE', 'ZEROSE', /\b(?:zerobaseone|zb1)\b/i],
  ['boynextdoor', 'BOYNEXTDOOR', 'ONEDOOR', /\b(?:boynextdoor|boy\s*next\s*door)\b/i],
  ['nmixx', 'NMIXX', 'NSWER', /\bnmixx\b/i],
  ['gidle', 'i-dle', 'Neverland', /\b(?:\(g\)i-?dle|g\)?i-dle|gidle|i-dle)\b/i],
  ['bigbang', 'BIGBANG', 'VIP', /\b(?:bigbang|g-?dragon)\b/i],
  ['dreamcatcher', 'Dreamcatcher', 'InSomnia', /\bdreamcatcher\b(?=.{0,60}\b(?:album|álbum|k-?pop|ver\.?)\b)/i],
  ['p1harmony', 'P1Harmony', 'P1ece', /\bp1harmony\b/i],
];

const RE_KPOP_FORMATO = /\b(?:[áa]lbum|album|cd|photobook|digipack|weverse|repackage|mini\s*album|ep|vers[aã]o|ver\.|kit|lightstick|photocard|season'?s?\s*greetings|dicon|vinil|lp)\b/i;
const RE_KPOP_EXPLICITO = /\b(?:k-?pop|lightstick|photocards?|army\s*bomb|carat\s*bong|candybong|moabong|neobong|lightiny|toploader|bt21|skzoo|tinytan|tiny\s*tan|aniteez|weverse\s*album)\b/i;

/** Medicamento: nenhuma frase de venda (regra de propaganda de saúde). */
const RE_MEDICAMENTO = /\b(?:medicamento|rem[eé]dio|comprimidos?|c[aá]psulas?\s+(?:de\s+)?\d+\s*mg|\d+\s*mg\b|xarope|pomada|gotas\s+orais|dipirona|paracetamol|ibuprofeno|dorflex|neosaldina|omeprazol|losartana|antial[eé]rgico|anti-?inflamat[oó]rio|analg[eé]sico|gen[eé]rico|vitamina\s*d\s*\d|colírio|teste\s+de\s+gravidez)\b/i;
const RE_SUPLEMENTO = /\b(?:whey|creatina|pr[eé][- ]?treino|hipercal[oó]rico|bcaa|glutamina|col[aá]geno|[oô]mega\s*3|multivitam[ií]nico|barra\s+de\s+prote[ií]na|prote[ií]na\s+(?:vegana|isolada|concentrada))\b/i;
const RE_PERFUME_ARABE = /\b(?:lattafa|asad|fakhar|khamrah|yara|afnan|9pm|club de nuit|armaf|al haramain|amber oud|rasasi|hawas|al wataniah|sabah al ward|maison alhambra|orientica|bharara|french avenue|paris corner|zimaya|swiss arabian|perfume [áa]rabe)\b/i;
const RE_PERFUME_NICHO = /\b(?:parfums de marly|layton|delina|creed|aventus|nishane|xerjoff|mancera|montale|initio|amouage|tom ford|kurkdjian|baccarat rouge|le labo|byredo|perfume de nicho)\b/i;
const RE_PERFUME = /\b(?:perfume|eau de parfum|eau de toilette|parfum|edp|edt|col[ôo]nia|body splash|deo parfum)\b/i;

/** Regras ordenadas: a primeira que casar define nicho/subnicho. */
const REGRAS_NICHO = [
  { nicho: 'perfumes', sub: 'arabe', re: RE_PERFUME_ARABE },
  { nicho: 'perfumes', sub: 'nicho', re: RE_PERFUME_NICHO },
  { nicho: 'perfumes', sub: 'geral', re: RE_PERFUME },
  {
    nicho: 'games', sub: 'acessorio',
    re: /\b(?:capa|case|suporte|pel[ií]cula|skin|grip|dock|carregador|base\s+(?:de\s+)?carregamento)\b.{0,40}\b(?:controle|ps5|ps4|xbox|switch|console|dualsense)\b|\b(?:controle|ps5|ps4|xbox|switch|console|dualsense)\b.{0,40}\b(?:capa|case|suporte|pel[ií]cula|skin|grip|dock|carregador)\b/i,
  },
  { nicho: 'games', sub: 'controle', re: /\b(?:dualsense|dualshock|controle\s*(?:sem\s*fio|gamer|xbox|ps5|ps4|pro|para|pra)|joystick|gamepad)\b/i },
  {
    nicho: 'games', sub: 'console', re: /\b(?:ps5|playstation\s*5|xbox\s*series|nintendo\s*switch(?:\s*2)?|steam\s*deck|console)\b/i,
    nao: /\b(?:capa|case|suporte|pel[ií]cula|base|dock|cabo|carregador|headset|fone|skin|adesivo|bolsa|jogo|m[ií]dia|gift\s*card|cart[aã]o)\b/i,
  },
  { nicho: 'games', sub: 'jogo', re: /\b(?:jogo\s+(?:para|pra|ps5|ps4|xbox|switch)|m[ií]dia\s+f[ií]sica|edi[cç][aã]o\s+(?:standard|deluxe|gold)|gift\s*card\s*(?:playstation|xbox|nintendo|steam))\b/i },
  { nicho: 'games', sub: 'periferico', re: /\b(?:mouse\s*gamer|teclado\s*(?:mec[aâ]nico|gamer)|headset(?:\s*gamer)?|cadeira\s*gamer|mousepad|volante|pedais)\b/i },
  { nicho: 'hardware', sub: 'pc', re: /\b(?:ssd|nvme|m\.2|hd\s*externo|rtx\s*\d{4}|gtx\s*\d{3,4}|rx\s*\d{4}|ryzen|core\s*i[3579]|placa\s*de\s*v[ií]deo|placa[- ]m[aã]e|mem[oó]ria\s*(?:ram|ddr\d)|ddr[45]|processador|fonte\s*\d{3,4}\s*w|water\s*cooler|gabinete|roteador|mesh|wi-?fi\s*[67])\b/i },
  { nicho: 'hardware', sub: 'monitor', re: /\bmonitor\b/i },
  { nicho: 'hardware', sub: 'notebook', re: /\b(?:notebook|laptop|macbook|chromebook)\b/i },
  { nicho: 'tech', sub: 'audio', re: /\b(?:fone|headphone|earbuds?|airpods|tws|caixa\s+de\s+som|soundbar|jbl)\b/i },
  { nicho: 'tech', sub: 'tv', re: /\b(?:smart\s*tv|televis[aã]o|tv\s*(?:\d{2}|4k|8k|oled|qled|led)|fire\s*tv|chromecast|roku)\b/i },
  { nicho: 'tech', sub: 'celular', re: /\b(?:iphone|smartphone|celular|galaxy\s*(?:s|a|z|m)\d+|redmi|poco\s*[a-z]?\d|motorola\s*edge|moto\s*g\d*|ipad|tablet|smartwatch|apple\s*watch|galaxy\s*watch|kindle)\b/i },
  { nicho: 'casa', sub: 'airfryer', re: /\b(?:air\s*fryer|fritadeira\s+(?:el[eé]trica|sem\s+[oó]leo|air))\b/i },
  { nicho: 'casa', sub: 'cozinha', re: /\b(?:fritadeira|cafeteira|nespresso|dolce\s*gusto|liquidificador|batedeira|panela|micro[- ]?ondas|forno|sanduicheira|mixer|chaleira|processador\s+de\s+alimentos|jogo\s+de\s+facas|frigideira|pipoqueira)\b/i },
  { nicho: 'casa', sub: 'limpeza', re: /\b(?:sab[aã]o|lava[- ]?roupas|amaciante|desinfetante|detergente|alvejante|[aá]gua\s+sanit[aá]ria|papel\s+higi[eê]nico|papel\s+toalha|esponja|limpador|multiuso|aspirador|rob[ôo]\s+aspirador|mop)\b/i },
  { nicho: 'casa', sub: 'clima', re: /\b(?:ventilador|ar[- ]?condicionado|climatizador|circulador\s+de\s+ar)\b/i },
  { nicho: 'casa', sub: 'cama', re: /\b(?:colch[aã]o|travesseiro|edredom|jogo\s+de\s+cama|len[cç]ol|cobertor|toalha\s+de\s+banho|umidificador|purificador)\b/i },
  { nicho: 'casa', sub: 'eletro', re: /\b(?:geladeira|refrigerador|lava\s*e\s*seca|lavadora|m[aá]quina\s+de\s+lavar|freezer|frigobar|fog[aã]o|cooktop|lava[- ]lou[cç]as)\b/i },
  { nicho: 'ferramentas', sub: 'geral', re: /\b(?:furadeira|parafusadeira|serra|esmerilhadeira|maleta\s+de\s+ferramentas|jogo\s+de\s+chaves|lavadora\s+de\s+alta\s+press[aã]o|trena|n[ií]vel\s+a\s+laser)\b/i },
  { nicho: 'suplementos', sub: 'geral', re: RE_SUPLEMENTO },
  { nicho: 'beleza', sub: 'protetor', re: /\b(?:protetor\s+solar|filtro\s+solar|fps\s*\d{2})\b/i },
  { nicho: 'beleza', sub: 'skincare', re: /\b(?:s[eé]rum|hidratante|sabonete\s+facial|vitamina\s*c|retinol|niacinamida|[aá]cido\s+hialur[oô]nico|t[ôo]nico\s+facial|cerave|la\s*roche|bioderma|principia|creamy|sallve)\b/i },
  { nicho: 'beleza', sub: 'cabelo', re: /\b(?:shampoo|condicionador|m[aá]scara\s+capilar|leave-?in|[oó]leo\s+capilar|chapinha|prancha|secador|babyliss|escova\s+secadora)\b/i },
  { nicho: 'beleza', sub: 'make', re: /\b(?:base\s+(?:l[ií]quida|matte)|corretivo|batom|r[ií]mel|m[aá]scara\s+de\s+c[ií]lios|paleta\s+de\s+sombras|blush|p[oó]\s+compacto|delineador|gloss)\b/i },
  { nicho: 'moda', sub: 'corrida', re: /\b(?:t[eê]nis\s+(?:de\s+|para\s+)?corrida|running|pegasus|novablast|gel[- ]?nimbus|gel[- ]?kayano|ultraboost|adizero|fresh\s*foam)\b/i },
  { nicho: 'moda', sub: 'tenis', re: /\b(?:t[eê]nis|chuteira)\b/i },
  { nicho: 'moda', sub: 'calcado', re: /\b(?:sapato|bota|sand[aá]lia|chinelo|papete|sapatilha|mocassim)\b/i },
  { nicho: 'moda', sub: 'roupa', re: /\b(?:camiseta|camisa|cal[cç]a|bermuda|shorts?|vestido|jaqueta|moletom|blusa|saia|cueca|meias?|suti[aã]|biqu[ií]ni|mai[ôo]|mochila|bolsa|rel[oó]gio|[oó]culos)\b/i },
  { nicho: 'bebe', sub: 'fralda', re: /\b(?:fraldas?|len[cç]os?\s+umedecidos?)\b/i },
  { nicho: 'bebe', sub: 'geral', re: /\b(?:mamadeira|chupeta|carrinho\s+de\s+beb[eê]|cadeirinha|beb[eê]\s+conforto|ber[cç]o|bab[aá]\s+eletr[oô]nica|banheira\s+de\s+beb[eê])\b/i },
  { nicho: 'pet', sub: 'geral', re: /\b(?:ra[cç][aã]o|petisco|areia\s+(?:higi[eê]nica|sanit[aá]ria)|arranhador|coleira|caminha\s+pet|pedigree|whiskas|golden|premier\s+pet|bravecto|nexgard|simparic)\b/i },
];

/** Categoria do canal → nicho quando o título não deu pista. */
const NICHO_POR_CATEGORIA = {
  kpop: ['kpop', 'geral'], casa: ['casa', 'geral'], tech: ['tech', 'geral'], moda: ['moda', 'geral'],
  beleza: ['beleza', 'geral'], perfumes: ['perfumes', 'geral'], bebe: ['bebe', 'geral'], saude: ['saude', 'geral'],
};

/**
 * Perfil de tom por nicho: público, jeito de falar, dores/motivos reais de compra e vocabulário de quem
 * é do nicho. Orienta a IA e o banco de frases. sensivel = sem IA; semCopy = nenhuma linha extra.
 */
const PERFIS = {
  kpop: {
    rotulo: 'K-pop', publico: 'fãs de K-pop que colecionam álbum, photocard e lightstick',
    tom: 'fã falando com fã no grupo: animado na medida, sem textão',
    dores: ['álbum costuma pesar no bolso', 'aquele que falta na coleção', 'ir ao show sem lightstick', 'photocard largado na gaveta'],
    vocabulario: ['nome do fandom', 'coleção', 'estante', 'wishlist', 'comeback', 'show'],
    evitar: ['gíria forçada ("bias wrecker", "stan")', 'prometer photocard, pôster ou versão', 'chamar de oficial'],
  },
  games: {
    rotulo: 'Games', publico: 'quem joga no console ou no PC',
    tom: 'gamer falando com gamer: direto, com conhecimento de causa',
    dores: ['controle dando drift', 'backlog que só cresce', 'jogar em dupla com controle ruim', 'console da geração passada'],
    vocabulario: ['jogatina', 'setup', 'backlog', 'drift', 'zerar', 'partida', 'geração'],
    evitar: ['meme datado', 'prometer FPS ou desempenho em jogo específico'],
  },
  hardware: {
    rotulo: 'Hardware & PC', publico: 'quem monta, faz upgrade ou trabalha no PC',
    tom: 'quem entende de PC falando com quem também entende: direto, sem dar aula',
    dores: ['monitor de 60Hz', 'PC demorando pra ligar e abrir jogo', 'upgrade adiado', 'jogar tudo no gráfico baixo'],
    vocabulario: ['setup', 'upgrade', 'aposentar', 'gargalo', 'boot', 'gráfico'],
    evitar: ['explicar o que a especificação faz', 'inventar especificação', 'benchmark ou número de FPS'],
  },
  tech: {
    rotulo: 'Tecnologia', publico: 'quem quer um eletrônico bom pro dia a dia',
    tom: 'amigo que manja de tecnologia: prático, sem jargão',
    dores: ['bateria que não dura o dia', 'celular arrastando', 'barulho no ônibus', 'TV pequena pra futebol e série'],
    vocabulario: ['trampo', 'ônibus', 'maratona', 'bateria', 'aposentar'],
    evitar: ['explicar especificação', 'comparar com outra marca'],
  },
  casa: {
    rotulo: 'Casa', publico: 'quem cuida da casa e vive na correria',
    tom: 'gente de casa falando com gente de casa: prático e bem-humorado',
    dores: ['chegar cansado e ter que cozinhar', 'pilha de louça', 'calor à noite', 'ir ao mercado toda hora'],
    vocabulario: ['trampo', 'pia', 'louça', 'despensa', 'faxina', 'calorão', 'rotina'],
    evitar: ['clichê de comercial de TV', 'prometer economia de energia ou durabilidade'],
  },
  perfumes: {
    rotulo: 'Perfumes', publico: 'quem acompanha perfumaria, monta coleção e vive de wishlist',
    tom: 'perfumista de grupo: empolgado, sem pompa e sem prometer o que depende de pele e gosto',
    // Gosto é pessoal (oud, couro e especiarias dividem opiniões) e performance varia por perfume e pele:
    // a frase fala da oportunidade, da coleção e, só com o perfume reconhecido, da proposta/ocasião.
    subjetivo: true,
    dores: ['esperar baixar pra colocar na coleção', 'repetir sempre o mesmo perfume', 'querer variar de pegada', 'wishlist parada'],
    vocabulario: ['coleção', 'wishlist', 'prateleira', 'pegada', 'proposta', 'ocasião', 'dia a dia', 'noite', 'queridinho'],
    evitar: [
      'prometer fixação, projeção, rastro ou duração',
      'recomendar blind buy ou compra às cegas',
      'inventar notas',
      'chamar de contratipo ou comparar com outra marca',
      'comparar preço com outros perfumes',
    ],
  },
  beleza: {
    rotulo: 'Beleza & Skincare', publico: 'quem tem rotina de pele, cabelo ou make',
    tom: 'amiga que indica o que usa: leve e próxima',
    dores: ['produto acabando no meio da rotina', 'pular o protetor', 'depender de salão'],
    vocabulario: ['rotina', 'skincare', 'reposição', 'nécessaire', 'estoque'],
    evitar: ['prometer resultado (clareia, trata, rejuvenesce)', 'termo médico'],
  },
  moda: {
    rotulo: 'Moda & Tênis', publico: 'quem gosta de se vestir bem sem complicação',
    tom: 'leve e de bom gosto, sem forçar tendência',
    dores: ['tênis surrado', 'look repetido', 'nada pra vestir na semana'],
    vocabulario: ['look', 'par', 'coringa', 'surrado', 'aposentar'],
    evitar: ['"tendência" sem base', 'prometer conforto, tamanho ou durabilidade'],
  },
  bebe: {
    rotulo: 'Bebê', publico: 'mães, pais e quem cuida de bebê',
    tom: 'mãe ou pai falando com mãe ou pai: acolhedor e prático',
    dores: ['fralda que acaba rápido demais', 'rotina corrida', 'enxoval incompleto'],
    vocabulario: ['estoque', 'enxoval', 'rotina', 'pequeno'],
    evitar: ['culpa ou medo', 'prometer segurança ou saúde'],
  },
  pet: {
    rotulo: 'Pet', publico: 'tutores de cães e gatos',
    tom: 'tutor falando com tutor: carinhoso e prático',
    dores: ['ração acabando de surpresa', 'correr pro mercado por causa do pote vazio'],
    vocabulario: ['pet', 'tutor', 'pote', 'estoque'],
    evitar: ['prometer saúde do animal'],
  },
  suplementos: {
    rotulo: 'Suplementos', publico: 'quem treina e mantém rotina de suplementação',
    tom: 'de quem treina: direto, sem promessa', sensivel: true,
    dores: ['pote zerando no meio do ciclo'],
    vocabulario: ['pote', 'treino', 'reposição', 'estoque'],
    evitar: ['promessa de ganho de massa, emagrecimento ou saúde'],
  },
  ferramentas: {
    rotulo: 'Ferramentas', publico: 'quem resolve os reparos de casa',
    tom: 'prático e bem-humorado',
    dores: ['pedir emprestado pro vizinho', 'chamar alguém pra um furo na parede'],
    vocabulario: ['furo', 'reparo', 'caixa de ferramentas', 'quebra-galho'],
    evitar: ['prometer potência não informada'],
  },
  saude: {
    rotulo: 'Saúde & Farmácia', publico: 'quem compra itens de farmácia', tom: 'neutro', sensivel: true, semCopy: true,
    dores: [], vocabulario: [], evitar: ['qualquer promessa de saúde'],
  },
  geral: {
    rotulo: 'Geral', publico: 'quem acompanha ofertas no grupo', tom: 'natural e direto',
    dores: [], vocabulario: ['achado'], evitar: ['urgência falsa'],
  },
};

/** Especificações do título que viram frase técnica (só o que está escrito; nada inventado). */
function especificacoes(titulo) {
  const t = String(titulo || '');
  const out = [];
  let m;
  if ((m = t.match(/\b(1[2-9]\d|2[0-9]\d|3[0-6]\d)\s*hz\b/i))) out.push({ k: 'hz', v: m[1] });
  if (/\bnvme\b/i.test(t)) out.push({ k: 'nvme' });
  if ((m = t.match(/\bddr([45])\b/i))) out.push({ k: 'ddr', v: m[1] });
  if ((m = t.match(/\brtx\s*(\d{4})\b/i))) out.push({ k: 'rtx', v: m[1] });
  if (/\boled\b/i.test(t)) out.push({ k: 'oled' });
  else if (/\b4k\b/i.test(t)) out.push({ k: '4k' });
  if (/\b(?:anc|cancelamento\s+(?:ativo\s+)?de\s+ru[ií]do|noise\s+cancel)/i.test(t)) out.push({ k: 'anc' });
  if ((m = t.match(/\bwi-?fi\s*(6e?|7)\b/i))) out.push({ k: 'wifi', v: m[1].toUpperCase() });
  return out;
}

// Frase a partir da especificação do título: fala do upgrade/dor, nunca explica o que a spec faz.
// queda = há comparação verificada ou cupom (pode citar "nesse valor").
const FRASES_SPEC = {
  hz: {
    neutro: (v) => `${v}Hz é a deixa pra aposentar o monitor de 60Hz de vez.`,
    queda: (v) => `${v}Hz por esse valor é a deixa pra aposentar o monitor de 60Hz de vez.`,
  },
  nvme: {
    neutro: () => 'Quem ainda liga o PC num HD vai sentir a diferença no primeiro boot.',
    queda: () => 'NVMe nesse valor é pra tirar o HD lento da sua vida de vez.',
  },
  ddr: {
    neutro: (v) => `Montando em plataforma nova? DDR${v} é a peça que fecha o setup.`,
    queda: (v) => `DDR${v} nesse valor ajuda a fechar o setup novo sem estourar o orçamento.`,
  },
  rtx: {
    neutro: (v) => `RTX ${v} pra jogar os lançamentos sem deixar tudo no gráfico baixo.`,
    queda: (v) => `RTX ${v} nesse valor é a deixa pra parar de jogar tudo no baixo.`,
  },
  oled: {
    neutro: () => 'Depois de ver preto de OLED, tela comum perde a graça.',
    queda: () => 'OLED nesse valor é pra quem tava esperando a hora de dar o pulo.',
  },
  '4k': {
    neutro: () => 'Depois que acostuma com 4K, voltar pra tela antiga dói.',
    queda: () => '4K nesse valor é a deixa pra aposentar a tela antiga.',
  },
  anc: {
    neutro: () => 'Ônibus lotado e escritório barulhento viram outro mundo com um desses.',
    queda: () => 'Cancelamento de ruído nesse valor é presente pra sua paciência.',
  },
  wifi: {
    neutro: (v) => `Wi-Fi ${v} pra acabar com a internet caindo quando a casa toda conecta junto.`,
    queda: (v) => `Wi-Fi ${v} nesse valor resolve a briga pela internet em casa.`,
  },
};

function grupoKpopDe(titulo) {
  const s = String(titulo || '');
  for (const [id, nome, fandom, re] of GRUPOS_KPOP) {
    if (re.test(s)) return { id, nome, fandom };
  }
  return null;
}

function subKpop(titulo) {
  const t = String(titulo || '');
  if (/\b(?:lightstick|army\s*bomb|carat\s*bong|candybong|moabong|neobong|lightiny|official\s*light)\b/i.test(t)) return 'lightstick';
  if (/\b(?:photocards?|fich[aá]rio|binder|toploader|bt21|skzoo|aniteez|tinytan|tiny\s*tan|pel[uú]cia|chaveiro|funko|season'?s?\s*greetings|dicon)\b/i.test(t)) return 'colecionavel';
  return 'album';
}

/**
 * Identifica nicho, subnicho e referências do produto.
 * @returns {{nicho:string, sub:string, perfil:object, grupo:{id,nome,fandom}|null, specs:Array}}
 */
function detectarNicho(oferta) {
  const o = oferta || {};
  const titulo = String(o.titulo || '');
  const cat = String(o.categoria || '');
  const pronto = (nicho, sub, extra) => Object.assign({ nicho, sub, perfil: PERFIS[nicho] || PERFIS.geral, grupo: null, specs: [] }, extra || {});

  const grupo = grupoKpopDe(titulo);
  if (cat === 'kpop' || RE_KPOP_EXPLICITO.test(titulo) || (grupo && RE_KPOP_FORMATO.test(titulo))) {
    return pronto('kpop', subKpop(titulo), { grupo });
  }
  if (RE_MEDICAMENTO.test(titulo) && !RE_SUPLEMENTO.test(titulo)) return pronto('saude', 'medicamento');
  for (const r of REGRAS_NICHO) {
    if (r.re.test(titulo) && !(r.nao && r.nao.test(titulo))) {
      const specs = ['hardware', 'tech', 'games'].includes(r.nicho) ? especificacoes(titulo) : [];
      return pronto(r.nicho, r.sub, { specs });
    }
  }
  const porCat = NICHO_POR_CATEGORIA[cat];
  if (porCat) {
    const specs = porCat[0] === 'tech' ? especificacoes(titulo) : [];
    return pronto(porCat[0], porCat[1], { specs });
  }
  return pronto('geral', 'geral');
}

/* ---------- 3. banco de frases (fallback determinístico) ---------- */

// Banco de frases: como alguém do grupo mandaria o achado. Fala da dor, do upgrade ou do porquê de
// valer a pena; não explica o produto. Placeholders: {grupo} e {fandom} (só K-pop; frase com
// placeholder sem valor é descartada).
// Contextos: neutro (sem comparação verificada: não elogia preço), queda (abaixo do anúncio/referência:
// pode dizer "nesse valor"), cupom (pode dizer "com o cupom"). Sem emoji, sem número, sem urgência.
const BANCO = {
  kpop: {
    album: {
      neutro: [
        'Se esse do {grupo} ainda não tá na sua estante, tá esperando o quê?',
        '{fandom}, esse é daqueles que a coleção fica pedindo.',
        'Pra quem tá completando a coleção do {grupo} e sempre deixa esse pra depois.',
        'Aquele que todo {fandom} jura que compra mês que vem.',
        'Pra coleção de K-pop que não para de crescer na estante.',
      ],
      queda: [
        'Álbum do {grupo} nesse valor? Se faltava na coleção, é a deixa pra garantir.',
        '{fandom}, esse do {grupo} baixou: dá pra completar a coleção sem chorar no boleto.',
        'Quem tava enrolando pra pegar esse do {grupo}, agora tem desculpa.',
        'Álbum de K-pop nesse valor é pra tirar da wishlist sem pensar duas vezes.',
      ],
      cupom: [
        'Com o cupom, o álbum do {grupo} cabe no mês sem drama.',
        '{fandom}, o cupom ajuda a fechar a coleção do {grupo} gastando menos.',
        'Com o cupom, dá pra tirar esse álbum da wishlist sem culpa.',
      ],
    },
    lightstick: {
      neutro: [
        'Show do {grupo} sem lightstick não é a mesma coisa.',
        'Pra não ser o único {fandom} sem luz no próximo show.',
        'Lightstick é daqueles que fica lindo na estante até o próximo show.',
      ],
      queda: [
        'Lightstick do {grupo} nesse valor é pra deixar separado pro próximo show.',
        'Lightstick nesse valor? Já deixa guardado pro próximo show.',
      ],
    },
    colecionavel: {
      neutro: [
        'Pra parar de guardar photocard na gaveta e organizar a coleção direito.',
        'Mimo pra coleção de quem é {fandom} de carteirinha.',
        'Daqueles detalhes que deixam a coleção com cara de coleção.',
      ],
    },
    geral: {
      neutro: ['Achado pra quem vive de K-pop e coleciona tudo.', 'Pra coleção de quem é K-pop de carteirinha.'],
    },
  },
  games: {
    console: {
      neutro: [
        'Pra quem ainda tá na geração passada e vive adiando a troca.',
        'Pra finalmente encarar aquele backlog que só cresce.',
        'Fim de semana de jogatina começa aqui.',
      ],
      queda: [
        'Console nesse valor é a deixa pra finalmente pular de geração.',
        'Quem tava esperando baixar pra trocar de console, chegou a sua vez.',
      ],
    },
    controle: {
      neutro: [
        'Controle reserva é o que salva quando o seu começa a dar drift.',
        'Pra jogatina em dupla sem ninguém ficar com o controle ruim.',
        'Analógico puxando sozinho? Tá na hora de aposentar o velho.',
      ],
      queda: [
        'Nesse preço compensa demais deixar de reserva antes que o seu dê drift.',
        'Nesse valor dá pra ter um reserva e não ficar na mão quando o seu der drift.',
      ],
      cupom: ['Com o cupom, dá pra deixar um de reserva antes que o seu dê drift.'],
    },
    jogo: {
      neutro: ['Mais um pro backlog, mas esse vale furar a fila.', 'Pra fechar o fim de semana com jogatina boa.'],
      queda: ['Esse nesse valor vale furar a fila do backlog.', 'Jogo bom nesse valor é pra garantir e jogar com calma.'],
    },
    periferico: {
      neutro: ['Upgrade de setup que você sente já na primeira partida.', 'Pra parar de perder partida por culpa do periférico.'],
      queda: ['Periférico bom nesse valor é upgrade sem peso na consciência.'],
    },
    acessorio: {
      neutro: ['Detalhe que salva o controle de muito perrengue.', 'Daqueles acessórios que você se pergunta por que não comprou antes.'],
    },
    geral: { neutro: ['Achado pra quem leva a jogatina a sério.'] },
  },
  hardware: {
    pc: {
      neutro: ['Upgrade que dá sobrevida pro PC sem precisar trocar tudo.', 'Pra quem tá montando o setup aos poucos, peça certeira.'],
      queda: ['Peça boa nesse valor é a hora de tirar o upgrade do papel.', 'Nesse valor dá pra fazer aquele upgrade que tava adiado.'],
    },
    monitor: {
      neutro: ['Pra quem passa o dia na frente da tela e já cansou do monitor velho.', 'Upgrade de tela é daqueles que você sente no primeiro dia.'],
      queda: ['Monitor bom nesse valor é a deixa pra aposentar o antigo.'],
    },
    notebook: {
      neutro: ['Pra quem tá com o notebook velho pedindo arrego.', 'Notebook pra trampo e facul sem ficar preso na mesa.'],
      queda: ['Notebook nesse valor ajuda muito quem tava adiando a troca.'],
    },
    geral: { neutro: ['Upgrade pra quem leva o setup a sério.'] },
  },
  tech: {
    audio: {
      neutro: ['Pra quem vive de fone no ônibus, na academia e no trampo.', 'Fone novo é daqueles upgrades que você usa o dia inteiro.'],
      queda: ['Fone bom nesse valor é presente pra você mesmo sem culpa.'],
    },
    tv: {
      neutro: ['Futebol e série numa tela dessas é outra experiência.', 'Pra transformar a sala em cinema nas maratonas de fim de semana.'],
      queda: ['TV nesse valor é a deixa pra aposentar a antiga da sala.'],
    },
    celular: {
      neutro: ['Pra quem tá com o celular arrastando e a bateria morrendo antes do almoço.', 'Pra quem já cansou de apagar foto pra liberar espaço.'],
      queda: ['Celular nesse valor resolve a troca sem apertar o orçamento.'],
    },
    geral: { neutro: ['Eletrônico pra facilitar o dia a dia sem dor de cabeça.'] },
  },
  casa: {
    airfryer: {
      neutro: [
        'A maior aliada de quem chega morto do trampo e não quer nem olhar pra pia.',
        'Janta pronta sem fritura no fogão e com quase nada de louça.',
      ],
      queda: ['Air fryer nesse valor é o empurrão que faltava pra largar a fritura no óleo.'],
    },
    cozinha: {
      neutro: ['Pra cozinha render mais na correria da semana.', 'Daqueles que você usa todo dia e não entende como vivia sem.'],
      queda: ['Nesse valor é a deixa pra renovar a cozinha sem drama.'],
    },
    limpeza: {
      neutro: ['Pra fazer estoque e esquecer o mercado por um tempo.', 'Daqueles que acaba rápido em casa, então vale ter de reserva.'],
      queda: ['Nesse preço vale encher a despensa e esquecer o mercado por um tempo.'],
      cupom: ['Com o cupom, dá pra fazer estoque e esquecer o mercado por um tempo.'],
    },
    clima: {
      neutro: ['Pra sobreviver ao calorão sem derreter no sofá.', 'Noite de calor sem ficar virando na cama.'],
      queda: ['Nesse valor dá pra encarar o calorão sem sofrer.'],
    },
    cama: {
      neutro: ['Pra deixar a cama daquele jeito que dá preguiça de levantar.', 'Upgrade de quarto que você sente toda noite.'],
      queda: ['Nesse valor é a deixa pra renovar a cama.'],
    },
    eletro: {
      neutro: ['Pra quem tá montando a casa e quer resolver de uma vez.', 'Eletro grande é compra pensada, e esse vale entrar na comparação.'],
      queda: ['Eletro grande nesse valor é pra quem tava esperando a hora de trocar.'],
    },
    geral: {
      neutro: ['Daqueles itens que facilitam a rotina e você nem lembra que tem.', 'Pra casa funcionar melhor sem complicação.'],
      queda: ['Item de casa nesse valor vale a olhada.'],
    },
  },
  // Perfumaria: o banco não sabe qual é o perfume, então não fala de performance (fixação, projeção,
  // rastro) nem incentiva compra às cegas; fala da oportunidade e de quem já acompanha o nicho.
  perfumes: {
    arabe: {
      neutro: [
        'Mais um da leva de perfumaria árabe que costuma chamar atenção na coleção.',
        'Pra quem acompanha perfumaria árabe e gosta de ter opção diferente na prateleira.',
      ],
      queda: [
        'Pra quem curte perfumaria árabe e tava esperando baixar pra colocar na coleção.',
        'Quem tava com esse árabe parado na wishlist, agora tem desculpa.',
      ],
      cupom: ['Com o cupom, dá pra colocar mais um árabe na coleção gastando menos.'],
    },
    nicho: {
      neutro: ['Pra quem já passou da fase dos perfumes de shopping.', 'Pra quem acompanha perfumaria de nicho e gosta de fugir do óbvio.'],
      queda: ['Perfume de nicho nesse valor é pra tirar da wishlist.', 'Quem tava de olho nesse nicho esperando baixar, chegou a vez.'],
      cupom: ['Com o cupom, aquele nicho da wishlist fica bem mais perto.'],
    },
    geral: {
      neutro: ['Pra quem vive repetindo o mesmo perfume e quer variar.', 'Bom pra ter na penteadeira ou separar pra presente.'],
      queda: ['Nesse valor dá pra tirar da wishlist sem culpa.'],
      cupom: ['Com o cupom, dá pra tirar da wishlist sem culpa.'],
    },
  },
  beleza: {
    protetor: {
      neutro: ['Protetor é o passo que não dá pra pular, então bom ter de reserva.', 'Pra não ter desculpa de sair sem protetor.'],
      queda: ['Protetor nesse valor é pra fazer estoque pro ano todo.'],
    },
    skincare: {
      neutro: ['Pra quem não abre mão do skincare nem nos dias corridos.', 'Daqueles que entram na rotina e não saem mais.'],
      queda: ['Skincare nesse valor é pra garantir a reposição.'],
    },
    cabelo: {
      neutro: ['Pra caprichar no cabelo em casa, sem depender de salão.', 'Reforço bom pra rotina do cabelo.'],
      queda: ['Nesse valor dá pra testar sem medo de errar.'],
    },
    make: {
      neutro: ['Pra nécessaire de quem não sai sem make.'],
      queda: ['Make boa nesse valor é pra garantir a reposição.'],
    },
    geral: { neutro: ['Pra rotina de cuidados ficar completa.'] },
  },
  moda: {
    corrida: {
      neutro: ['Pra quem corre e já sentiu que o tênis velho não aguenta mais.', 'Pra quem tá treinando pra prova e precisa de um par novo.'],
      queda: ['Tênis de corrida nesse valor é a deixa pra aposentar o surrado.'],
    },
    tenis: {
      neutro: ['Pra aposentar aquele tênis que já tá pedindo arrego.', 'Tênis coringa pra usar com tudo na semana.'],
      queda: ['Tênis bom nesse valor é a deixa pra trocar o surrado.'],
    },
    calcado: { neutro: ['Pra renovar o calçado sem drama.'] },
    roupa: {
      neutro: ['Daquelas peças que você acaba usando a semana inteira.', 'Peça coringa pra montar look sem pensar muito.'],
      queda: ['Nesse valor dá até pra levar mais de uma cor.'],
    },
    geral: { neutro: ['Pra renovar o guarda-roupa sem complicação.'] },
  },
  bebe: {
    fralda: {
      neutro: ['Fralda acaba numa velocidade absurda, então estoque nunca é demais.'],
      queda: ['Fralda nesse valor é pra fazer estoque e respirar um pouco.'],
      cupom: ['Com o cupom, dá pra fazer aquele estoque de fralda.'],
    },
    geral: { neutro: ['Pra facilitar a rotina de quem tá com pequeno em casa.', 'Pra deixar o enxoval mais completo sem correria.'] },
  },
  pet: {
    geral: {
      neutro: ['Pet não aceita atraso no pote, então bom ter estoque.', 'Pra manter o pote cheio sem correr pro mercado.'],
      queda: ['Nesse valor dá pra garantir o estoque do pet com folga.'],
    },
  },
  suplementos: {
    geral: {
      neutro: ['Pra não deixar o pote zerar no meio do ciclo de treino.', 'Reposição do mês resolvida pra quem treina.'],
      queda: ['Nesse valor dá pra fazer estoque e esquecer por uns meses.'],
    },
  },
  ferramentas: {
    geral: {
      neutro: ['Pra parar de pedir emprestado pro vizinho.', 'Pra resolver os reparos de casa sem esperar ninguém.'],
      queda: ['Ferramenta boa nesse valor é investimento pra casa toda.'],
    },
  },
  geral: { geral: { neutro: ['Achado que vale a olhada com calma.'], queda: ['Nesse valor vale dar uma olhada.'] } },
};

function lerManuaisObj(oferta) {
  if (!oferta || !oferta.links_manuais) return {};
  if (typeof oferta.links_manuais === 'object') return oferta.links_manuais;
  try { return JSON.parse(oferta.links_manuais) || {}; } catch (e) { return {}; }
}

/** Contexto da oferta sem números: queda (comparação verificada), cupom ou neutro. */
function contextoOferta(oferta) {
  const o = oferta || {};
  const m = lerManuaisObj(o);
  if (o.cupom || m.cupom || m.cupom_auto) return 'cupom';
  const econ = resumoEconomia(o, true);
  const pct = Math.max(Math.floor(Number(o.desconto_pct) || 0), econ ? econ.pct : 0);
  if (econ && pct >= 15) return 'queda';
  return 'neutro';
}

function preencher(frase, det) {
  const g = det.grupo;
  if (/\{(?:grupo|fandom)\}/.test(frase) && !g) return '';
  return frase.replace(/\{grupo\}/g, g ? g.nome : '').replace(/\{fandom\}/g, g ? g.fandom : '');
}

/**
 * Frase do banco para o nicho do produto (determinística por produto). '' quando o nicho não leva copy.
 */
function fraseNicho(oferta, det) {
  const d = det || detectarNicho(oferta);
  if (d.perfil.semCopy) return '';
  const o = oferta || {};
  const semente = String(o.produto_id || o.oferta_id || o.titulo || 'x');
  const ctx = contextoOferta(o);
  if (d.specs && d.specs.length && (d.nicho === 'hardware' || d.nicho === 'tech')) {
    const s = d.specs[0];
    return FRASES_SPEC[s.k][ctx === 'neutro' ? 'neutro' : 'queda'](s.v);
  }
  const doNicho = BANCO[d.nicho] || BANCO.geral;
  const bloco = doNicho[d.sub] || doNicho.geral || BANCO.geral.geral;
  // Cupom sem frase própria usa as de queda (as duas podem dizer "nesse valor").
  const daVez = ctx === 'cupom' ? (bloco.cupom || bloco.queda) : ctx === 'queda' ? bloco.queda : null;
  const preenchidas = (lista) => (lista || []).map((f) => preencher(f, d)).filter(Boolean);
  const lista = preenchidas(daVez).length ? preenchidas(daVez) : preenchidas(bloco.neutro);
  if (!lista.length) return '';
  return lista[indiceDeterministico(semente + '|' + ctx, lista.length)];
}

/* ---------- validação (vale para IA e banco) ---------- */

// Palavras inteiras (não casam dentro de outra palavra) e radicais (qualquer final). Cobrem urgência ou
// escassez que não dá pra provar (não sabemos o estoque: docs/kit-operacao/04-conformidade.md),
// afirmações que exigem verificação (histórico, frete, originalidade, comparação de preço) e promessas
// de saúde/resultado.
const TERMOS_PROIBIDOS_COPY = [
  'corre(?:m)? (?:que|l[aá])', 'corram', 'v[aá] correndo', 's[oó] hoje', '[uú]ltimas? unidades?', 'acaba(?:ndo)? (?:j[aá]|logo|hoje)',
  'some r[aá]pido', 'esgota', 'esgotando', 'voando', 'a hora [eé] agora', 'n[aã]o vai durar', 'enquanto durar', 'pode acabar',
  'qualquer momento', 'antes que acabe', 'por tempo limitado', 'imperd[ií]vel', 'aproveite j[aá]', 'garanta j[aá]', 'compre j[aá]',
  'n[aã]o perca', 'rel[aâ]mpago', 'urgente', 'estoque limitado',
  'menor pre[cç]o', 'pre[cç]o hist[oó]rico', 'hist[oó]ric[oa]', 'recorde', 'm[ií]nima', 'nunca vi', 'pre[cç]o raro', 'bombando', 'hit do dia',
  'mais barat[oa] que', 'por menos que', 'menos que muit[oa]', 'contratipo',
  'gr[aá]tis', 'brinde', 'frete', 'garantia', 'original', 'oficial', 'lacrado',
  'cura', 'trata', 'tratamento', 'clareia', 'imunidade', 'massa muscular', 'queima gordura', 'rem[eé]dio',
];
const RADICAIS_PROIBIDOS_COPY = ['raridade', 'emagre', 'rejuvenesc', 'anti-?idade', 'milagr', 'cl[ií]nicamente', 'comprovad', 'm[eé]dic'];
const RE_PROIBIDO_COPY = new RegExp(
  `(?:^|[^\\p{L}])(?:(?:${TERMOS_PROIBIDOS_COPY.join('|')})(?![\\p{L}])|(?:${RADICAIS_PROIBIDOS_COPY.join('|')}))`,
  'iu',
);
// Elogio de preço/cupom só quando há comparação verificada (queda) ou cupom ativo.
const RE_ELOGIO_PRECO = /(?:^|[^\p{L}])(?:(?:n|d)?esse|neste|por esse|por este)\s+(?:valor|pre[cç]o)|(?:^|[^\p{L}])(?:barat[oa]s?|mais em conta|por menos|baixou|caiu|cupom)(?![\p{L}])/iu;
// Referência comum que pode aparecer mesmo sem estar no título ("aposentar o monitor de 60Hz").
const RE_NUMERO_REFERENCIA = /\b60\s*hz\b/gi;
// Perfumaria: performance depende do perfume e da pele, e gosto é pessoal. Nada de prometer fixação,
// projeção, rastro ou duração, nem empurrar compra às cegas. "Sem medo/sem erro" com blind vale pra qualquer nicho.
const RE_PERFORMANCE_PERFUME = /(?:^|[^\p{L}])(?:fixa(?:[çc][aã]o|r|ndo)?|proje(?:[çc][aã]o|ta|tar|tando)|rastro|performance|longevidade|perdura|dura(?:\s+o\s+dia|\s+muito|\s+horas|\s+bastante)|blind|[àa]s\s+cegas|no\s+escuro|sem\s+cheirar)(?![\p{L}])/iu;
const RE_BLIND_SEM_MEDO = /\bblind(?:\s*buy)?\b.{0,30}\bsem\s+(?:medo|erro|culpa|risco)\b|\bcompra\s+certa\b/iu;

/**
 * Valida uma frase de copy (da IA ou do banco) para o contexto atual da oferta.
 * @returns {{ok:true, texto:string} | {ok:false, motivo:string}}
 */
function validarCopy(texto, oferta) {
  let s = String(texto == null ? '' : texto)
    .replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}‍️]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, '')
    .trim();
  if (!s) return { ok: false, motivo: 'vazia' };
  if (s.length < MIN_COPY) return { ok: false, motivo: 'curta demais' };
  if (s.length > MAX_COPY) return { ok: false, motivo: 'longa demais' };
  if (/https?:|www\.|\.com\b|[#@<>{}\[\]*_~`|]/i.test(s)) return { ok: false, motivo: 'link, hashtag ou marcação' };
  if (/r\$|%|\breais\b|\bpor cento\b|\bparcela/i.test(s)) return { ok: false, motivo: 'preço ou porcentagem' };
  const tit = String((oferta && oferta.titulo) || '');
  const nums = s.replace(RE_NUMERO_REFERENCIA, '').match(/\d+/g) || [];
  if (nums.some((n) => !tit.includes(n))) return { ok: false, motivo: 'número que não está no título' };
  const letras = s.replace(/[^\p{L}]/gu, '');
  const maiusc = s.replace(/[^\p{Lu}]/gu, '');
  if (letras.length >= 10 && maiusc.length / letras.length > 0.4) return { ok: false, motivo: 'caixa alta' };
  if ((s.match(/!/g) || []).length > 1) return { ok: false, motivo: 'exclamação demais' };
  if (RE_PROIBIDO_COPY.test(s)) return { ok: false, motivo: 'termo proibido (urgência, promessa ou afirmação não verificada)' };
  if (contextoOferta(oferta) === 'neutro' && RE_ELOGIO_PRECO.test(s)) return { ok: false, motivo: 'elogia o preço sem comparação verificada' };
  if (RE_BLIND_SEM_MEDO.test(s)) return { ok: false, motivo: 'garante acerto em item de gosto pessoal' };
  if (oferta && detectarNicho(oferta).nicho === 'perfumes' && RE_PERFORMANCE_PERFUME.test(s)) {
    return { ok: false, motivo: 'promete performance ou incentiva compra às cegas (perfumaria)' };
  }
  if (!/[.!?…]$/.test(s)) s += '.';
  return { ok: true, texto: s };
}

/* ---------- linha usada pelos textos ---------- */

/**
 * Linha de copy do post: IA aprovada (links_manuais.copy_ia) ou frase do nicho. '' quando desligada,
 * cupom de loja ou nicho sem copy. html = true escapa para parse_mode HTML.
 */
function linhaCopy(oferta, cfg, html) {
  const c = (cfg && cfg.copy) || {};
  if (c.tom === false) return '';
  const m = lerManuaisObj(oferta);
  if (m.eh_cupom_loja) return '';
  const det = detectarNicho(oferta);
  if (det.perfil.semCopy) return '';
  let txt = '';
  const ia = m.copy_ia && typeof m.copy_ia === 'object' ? m.copy_ia.texto : '';
  if (ia) {
    const v = validarCopy(ia, oferta);
    if (v.ok) txt = v.texto;
  }
  if (!txt) {
    const v = validarCopy(fraseNicho(oferta, det), oferta);
    txt = v.ok ? v.texto : '';
  }
  return html ? escapeHtml(txt) : txt;
}

/** Origem da linha de copy para o card de aprovação: { texto, origem: 'ia'|'regra'|'', falha }. */
function resumoCopy(oferta, cfg) {
  const m = lerManuaisObj(oferta);
  const texto = linhaCopy(oferta, cfg, false);
  const det = detectarNicho(oferta);
  const ia = m.copy_ia && typeof m.copy_ia === 'object' && m.copy_ia.texto && validarCopy(m.copy_ia.texto, oferta).ok;
  return {
    texto,
    origem: !texto ? '' : ia ? 'ia' : 'regra',
    nicho: det.perfil.rotulo + (det.grupo ? ` · ${det.grupo.nome}` : ''),
    falha: m.copy_ia_falha || '',
  };
}

module.exports = {
  PERFIS,
  BANCO_COPY: BANCO,
  GRUPOS_KPOP,
  detectarNicho,
  contextoOferta,
  preencherFrase: preencher,
  lerManuaisCopy: lerManuaisObj,
  fraseNicho,
  validarCopy,
  linhaCopy,
  resumoCopy,
};
