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
const { lerProduto } = require('./leitura');
const { textoDetalhes } = require('./destaques');
const { tipoProduto, FECHOS_PRECO, FRASES_PRECO, ABERTURAS_GARIMPO } = require('./tipos-produto');
const { frasesCombinadasTipo } = require('./tipos-produto-extra');
const { aplicarBancoExtra, frasesPerfumeConhecido } = require('./banco-extra');

const MAX_COPY = 120;
const MIN_COPY = 15;

/* ---------- 1. roteador de tom ---------- */

/** Grupos de K-pop → nome de exibição + fandom (referência natural para quem é fã). */
const GRUPOS_KPOP = [
  ['bts_jhope', 'j-hope', 'ARMY', /\bj-?hope\b/i],
  ['bts_jungkook', 'Jungkook', 'ARMY', /\bjung\s*kook\b/i],
  ['bts_jimin', 'Jimin', 'ARMY', /\bjimin\b/i],
  ['bts_agustd', 'Agust D', 'ARMY', /\b(?:agust\s*d|suga)\b(?=.{0,60}\b(?:album|álbum|ver\.?|weverse|d-day|bts)\b)/i],
  ['bts_v', 'V', 'ARMY', /\b(?:kim\s*)?taehyung\b/i],
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
  // Solistas (antes dos grupos que não citam no título) e grupos de outras gerações.
  ['bp_jennie', 'Jennie', 'BLINK', /\bjennie\b(?=.{0,60}\b(?:album|álbum|ruby|ver\.?|vers[aã]o|lp|cd)\b)/i],
  ['bp_lisa', 'Lisa', 'BLINK', /\blisa\b(?=.{0,60}\b(?:album|álbum|alter\s+ego|ver\.?|vers[aã]o|lp|cd)\b)|\blalisa\b/i],
  ['bp_rose', 'Rosé', 'BLINK', /\bros[eé]\b(?=.{0,40}\b(?:rosie|album|álbum|blackpink|apt\.?)\b)|\brosie\b(?=.{0,40}\b(?:album|álbum|ver\.?|lp|cd)\b)/i],
  ['bp_jisoo', 'Jisoo', 'BLINK', /\bjisoo\b/i],
  ['iu', 'IU', 'UAENA', /\bIU\b(?=.{0,60}\b(?:album|álbum|ver\.?|vers[aã]o|lp|cd|photobook)\b)/],
  ['treasure', 'TREASURE', 'Teume', /\btreasure\b(?=.{0,60}\b(?:album|álbum|k-?pop|ver\.?|vers[aã]o|photobook|lightstick)\b)/i],
  ['kep1er', 'Kep1er', 'Kep1ian', /\bkep1er\b/i],
  ['stayc', 'STAYC', 'SWITH', /\bstayc\b/i],
  ['mamamoo', 'MAMAMOO', 'MooMoo', /\b(?:mamamoo|moobong)\b/i],
  ['snsd', "Girls' Generation", 'SONE', /\b(?:girls'?\s*generation|snsd)\b/i],
  ['super_junior', 'Super Junior', 'E.L.F.', /\bsuper\s*junior\b/i],
  ['2ne1', '2NE1', 'Blackjack', /\b2ne1\b/i],
  ['winner', 'WINNER', 'Inner Circle', /\bWINNER\b(?=.{0,60}\b(?:album|álbum|ver\.?|vers[aã]o|k-?pop)\b)/],
  ['ikon', 'iKON', 'iKONIC', /\bikon\b(?=.{0,60}\b(?:album|álbum|ver\.?|vers[aã]o|k-?pop)\b)/i],
  ['kiss_of_life', 'KISS OF LIFE', 'KISSY', /\bkiss\s*of\s*life\b/i],
  ['plave', 'PLAVE', 'PLLI', /\bplave\b/i],
  ['the_boyz', 'THE BOYZ', 'THE B', /\bthe\s*boyz\b/i],
  ['cravity', 'CRAVITY', 'LUVITY', /\bcravity\b/i],
  ['oneus', 'ONEUS', 'To Moon', /\boneus\b/i],
  ['oh_my_girl', 'OH MY GIRL', 'Miracle', /\boh\s*my\s*girl\b(?=.{0,60}\b(?:album|álbum|ver\.?|vers[aã]o|k-?pop)\b)/i],
  ['wjsn', 'WJSN', 'UJUNG', /\b(?:wjsn|cosmic\s*girls)\b/i],
  ['astro', 'ASTRO', 'AROHA', /\bASTRO\b(?=.{0,60}\b(?:album|álbum|ver\.?|vers[aã]o|k-?pop)\b)/],
  ['xg', 'XG', 'ALPHAZ', /\bXG\b(?=.{0,60}\b(?:album|álbum|ver\.?|vers[aã]o|k-?pop|cd)\b)/],
  ['triples', 'tripleS', 'WAV', /\btriples\b(?=.{0,60}\b(?:album|álbum|ver\.?|vers[aã]o|k-?pop)\b)/i],
  ['apink', 'Apink', 'Pink Panda', /\bapink\b/i],
  ['btob', 'BTOB', 'Melody', /\bbtob\b/i],
  ['infinite', 'INFINITE', 'Inspirit', /\bINFINITE\b(?=.{0,60}\b(?:album|álbum|ver\.?|vers[aã]o|k-?pop)\b)/],
];

const RE_KPOP_FORMATO = /\b(?:[áa]lbum|album|cd|photobook|digipack|weverse|repackage|mini\s*album|ep|vers[aã]o|ver\.|kit|light\s*stick|photocard|season'?s?\s*greetings|dicon|vinil|lp)\b/i;
const RE_KPOP_EXPLICITO = /\b(?:k-?pop|light\s*stick|photocards?|army\s*bomb|carat\s*bong|candybong|moabong|neobong|lightiny|toploader|bt21|skzoo|tinytan|tiny\s*tan|aniteez|weverse\s*album)\b/i;

/** Medicamento: nenhuma frase de venda (regra de propaganda de saúde). */
const RE_MEDICAMENTO = /\b(?:medicamento|rem[eé]dio|comprimidos?|c[aá]psulas?\s+(?:de\s+)?\d+\s*mg|\d+\s*mg\b|xarope|pomada|gotas\s+orais|dipirona|paracetamol|ibuprofeno|dorflex|neosaldina|omeprazol|losartana|antial[eé]rgico|anti-?inflamat[oó]rio|analg[eé]sico|gen[eé]rico|vitamina\s*d\s*\d|colírio|teste\s+de\s+gravidez)\b/i;
const RE_SUPLEMENTO = /\b(?:whey|creatina|pr[eé][- ]?treino|hipercal[oó]rico|bcaa|glutamina|col[aá]geno|[oô]mega\s*3|multivitam[ií]nico|polivitam[ií]nico|suplementos?(?:\s+alimentar(?:es)?)?|vitamina\s*(?:a|b\d*|c|d\d*|e|k\d*)?\b|centrum|lavitan|a-z\b|magn[eé]sio|zinco|melatonina|coenzima\s*q10|biotina|pr[oó]polis|c[uú]rcuma|spirulina|ferro\s+quelato|c[aá]lcio|eletr[oó]litos|isot[oô]nico|l-?carnitina|beta[- ]?alanina|barra\s+de\s+prote[ií]na|prote[ií]na\s+(?:vegana|isolada|concentrada)|probi[oó]ticos?|cafe[ií]na|triptofano|[aá]cido\s+f[oó]lico|maca\s+peruana|ashwagandha|resveratrol|taurina|arginina|sel[eê]nio|cromo|lute[ií]na|psyllium|zma)\b/i;
const RE_PERFUME_ARABE = /\b(?:lattafa|asad|fakhar|khamrah|yara|afnan|9pm|club de nuit|armaf|al haramain|amber oud|rasasi|hawas|al wataniah|sabah al ward|maison alhambra|orientica|bharara|french avenue|paris corner|zimaya|swiss arabian|perfume [áa]rabe)\b/i;
const RE_PERFUME_NICHO = /\b(?:parfums de marly|layton|delina|creed|aventus|nishane|xerjoff|mancera|montale|initio|amouage|tom ford|kurkdjian|baccarat rouge|le labo|byredo|perfume de nicho)\b/i;
const RE_PERFUME = /\b(?:perfume|eau de parfum|eau de toilette|parfum|edp|edt|col[ôo]nia|body splash|deo parfum)\b/i;

/** Regras ordenadas: a primeira que casar define nicho/subnicho. */
const REGRAS_NICHO = [
  // Incontinência adulta vem antes de bebê: "fralda"/"roupa íntima" de adulto não é enxoval.
  {
    nicho: 'cuidado', sub: 'geral',
    re: /\b(?:ever\s*care|tena|plenitud|bigfral|geri[aá]tric[oa]s?|fraldas?\s+(?:para\s+)?adultos?|roupa\s+[íi]ntima\s+(?:descart[aá]vel|absorvente|geri[aá]trica)|incontin[eê]ncia|absorventes?\s+(?:geri[aá]tricos?|masculinos?\s+(?:para\s+)?incontin)|len[cç]os?\s+umedecidos?\s+(?:para\s+)?adultos?|protetor\s+de\s+colch[aã]o\s+descart[aá]vel)\b/i,
  },
  // Antipulgas e vermífugo de pet: sem frase de venda, como medicamento.
  { nicho: 'saude', sub: 'pet', re: /\b(?:bravecto|nexgard|simparic|credeli|antipulgas?|verm[ií]fugo|drontal|frontline|seresto)\b/i },
  { nicho: 'perfumes', sub: 'arabe', re: RE_PERFUME_ARABE },
  { nicho: 'perfumes', sub: 'nicho', re: RE_PERFUME_NICHO },
  { nicho: 'perfumes', sub: 'geral', re: RE_PERFUME },
  // Higiene pessoal (vinha caindo em "saúde", sem frase).
  { nicho: 'higiene', sub: 'escova_eletrica', re: /\b(?:escova\s+(?:de\s+dentes?\s+|dental\s+)?el[eé]trica|oral-?b\s+(?:pro|vitality|io)\b)/i },
  { nicho: 'higiene', sub: 'bucal', re: /\b(?:pasta\s+de\s+dentes?|creme\s+dental|gel\s+dental|escovas?\s+(?:de\s+dentes?|dental|dentais)|fio\s+dental|fita\s+dental|enxaguante\s+bucal|antiss[eé]ptico\s+bucal|colgate|sensodyne|closeup|close\s+up|listerine)\b/i },
  { nicho: 'higiene', sub: 'barbear', re: /\b(?:aparelho\s+de\s+barbear|l[aâ]minas?\s+de\s+barbear|gillette|mach\s*3|prestobarba|espuma\s+de\s+barbear|gel\s+de\s+barbear)\b/i },
  { nicho: 'higiene', sub: 'corpo', re: /\b(?:desodorante|antitranspirante|sabonete(?:\s+(?:em\s+barra|l[ií]quido|corporal|[ií]ntimo))?|cotonete|hastes\s+flex[ií]veis)\b/i, nao: /\b(?:facial|rosto|infantil|beb[eê]|pet|c[aã]es|gatos)\b/i },
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
  { nicho: 'tech', sub: 'celular', re: /\b(?:iphone|smartphone|celular|galaxy\s*(?:s|a|z|m)\d+|redmi|poco\s*[a-z]?\d|motorola\s*edge|moto\s*g\d*|ipad|tablet|smartwatch|apple\s*watch|galaxy\s*watch|kindle)\b/i, nao: /\b(?:automotiv[oa]|veicular|suporte\s+(?:para\s+)?celular|carregador\s+(?:automotivo|veicular))\b/i },
  { nicho: 'mercado', sub: 'cafe', re: /(?:^|[^\p{L}])(?:c[aá]psulas?\s+(?:de\s+caf[eé]|nespresso|dolce\s+gusto|tr[eê]s\s+cora[cç][oõ]es)|caf[eé]\s+(?:em\s+gr[aã]o|mo[ií]do|torrado|especial|gourmet|sol[uú]vel)|ch[aá]\s+(?:verde|mate|camomila|le[aã]o)|twinings|orfeu|baggio)(?![\p{L}])/iu, nao: /\bcafeteira\b/i },
  { nicho: 'casa', sub: 'airfryer', re: /\b(?:air\s*fryer|fritadeira\s+(?:el[eé]trica|sem\s+[oó]leo|air))\b/i },
  { nicho: 'casa', sub: 'cozinha', re: /\b(?:fritadeira|cafeteira|nespresso|dolce\s*gusto|liquidificador|batedeira|panela|micro[- ]?ondas|forno|sanduicheira|mixer|chaleira|processador\s+de\s+alimentos|jogo\s+de\s+facas|frigideira|pipoqueira)\b/i },
  // Aparelho de faxina é durável: frase de "fazer estoque/encher a despensa" não serve.
  { nicho: 'casa', sub: 'faxina', re: /\b(?:aspirador|rob[ôo]\s+aspirador|mop|vassoura\s+el[eé]trica|enceradeira|lavadora\s+de\s+piso)\b/i, nao: /\b(?:automotiv[oa]|veicular|carro|moto)\b/i },
  { nicho: 'casa', sub: 'limpeza', re: /\b(?:sab[aã]o|lava[- ]?roupas|amaciante|desinfetante|detergente|alvejante|[aá]gua\s+sanit[aá]ria|papel\s+higi[eê]nico|papel\s+toalha|esponja|limpador|multiuso)\b/i, nao: /\b(?:automotiv[oa]|veicular|carro|moto)\b/i },
  { nicho: 'casa', sub: 'clima', re: /\b(?:ventilador|ar[- ]?condicionado|climatizador|circulador\s+de\s+ar)\b/i },
  { nicho: 'casa', sub: 'cama', re: /\b(?:colch[aã]o|travesseiro|edredom|jogo\s+de\s+cama|len[cç]ol|cobertor|toalha\s+de\s+banho|umidificador|purificador)\b/i },
  { nicho: 'casa', sub: 'eletro', re: /\b(?:geladeira|refrigerador|lava\s*e\s*seca|lavadora|m[aá]quina\s+de\s+lavar|freezer|frigobar|fog[aã]o|cooktop|lava[- ]lou[cç]as)\b/i },
  { nicho: 'ferramentas', sub: 'geral', re: /\b(?:furadeira|parafusadeira|serra|esmerilhadeira|maleta\s+de\s+ferramentas|jogo\s+de\s+chaves|lavadora\s+de\s+alta\s+press[aã]o|trena|n[ií]vel\s+a\s+laser)\b/i },
  { nicho: 'suplementos', sub: 'geral', re: RE_SUPLEMENTO, nao: /\b(?:s[eé]rum|creme|facial|protetor\s+solar|hidratante|sabonete|t[ôo]nico|lo[cç][aã]o|shampoo|condicionador|m[aá]scara\s+capilar)\b/i },
  { nicho: 'beleza', sub: 'protetor', re: /\b(?:protetor\s+solar|filtro\s+solar|fps\s*\d{2})\b/i },
  { nicho: 'beleza', sub: 'skincare', re: /\b(?:s[eé]rum|hidratante|sabonete\s+facial|vitamina\s*c|retinol|niacinamida|[aá]cido\s+hialur[oô]nico|t[ôo]nico\s+facial|cerave|la\s*roche|bioderma|principia|creamy|sallve)\b/i },
  { nicho: 'beleza', sub: 'aparelho', re: /\b(?:chapinha|prancha\s+(?:alisadora|de\s+cabelo)|secador(?:\s+de\s+cabelo)?|babyliss|escova\s+(?:secadora|alisadora|rotativa)|modelador(?:a)?\s+de\s+cachos|difusor\s+de\s+cabelo)\b/i },
  { nicho: 'pet', sub: 'higiene', re: /\b(?:shampoo\s+(?:pet|cachorro|gato)|condicionador\s+pet|escova\s+pet|rasqueadeira|banho\s+e\s+tosa|eliminador\s+de\s+odores\s+pet|pasta\s+dental\s+pet)\b/i },
  { nicho: 'beleza', sub: 'cabelo', re: /\b(?:shampoo|condicionador|m[aá]scara\s+capilar|leave-?in|[oó]leo\s+capilar|creme\s+de\s+pentear|finalizador|tonalizante|tintura)\b/i },
  { nicho: 'beleza', sub: 'make', re: /\b(?:base\s+(?:l[ií]quida|matte)|corretivo|batom|r[ií]mel|m[aá]scara\s+de\s+c[ií]lios|paleta\s+de\s+sombras|blush|p[oó]\s+compacto|delineador|gloss)\b/i },
  { nicho: 'moda', sub: 'corrida', re: /\b(?:t[eê]nis\s+(?:de\s+|para\s+)?corrida|running|pegasus|novablast|gel[- ]?nimbus|gel[- ]?kayano|ultraboost|adizero|fresh\s*foam)\b/i },
  { nicho: 'moda', sub: 'tenis', re: /\b(?:t[eê]nis|chuteira)\b/i },
  { nicho: 'moda', sub: 'calcado', re: /\b(?:sapato|bota|sand[aá]lia|chinelo|papete|sapatilha|mocassim)\b/i },
  { nicho: 'moda', sub: 'roupa', re: /\b(?:camiseta|camisa|cal[cç]a|bermuda|shorts?|vestido|jaqueta|moletom|blusa|saia|cueca|meias?|suti[aã]|biqu[ií]ni|mai[ôo]|mochila|bolsa|rel[oó]gio|[oó]culos)\b/i },
  { nicho: 'bebe', sub: 'lencos', re: /\b(?:len[cç]os?\s+umedecidos?|toalhinhas?\s+umedecidas?|len[cç]inhos?)\b/i },
  { nicho: 'bebe', sub: 'fralda', re: /\bfraldas?\b/i },
  { nicho: 'bebe', sub: 'geral', re: /\b(?:mamadeira|chupeta|carrinho\s+de\s+beb[eê]|cadeirinha|beb[eê]\s+conforto|ber[cç]o|bab[aá]\s+eletr[oô]nica|banheira\s+de\s+beb[eê])\b/i },
  { nicho: 'pet', sub: 'consumo', re: /\b(?:ra[cç][aã]o|petisco|bifinho|sach[eê]\s+(?:para\s+)?(?:c[aã]es|gatos|pet)|areia\s+(?:higi[eê]nica|sanit[aá]ria|de\s+gato)|tapete\s+higi[eê]nico|pedigree|whiskas|golden|premier\s+pet|special\s+dog|gran\s+plus|royal\s+canin|pipicat|viva\s+verde)\b/i },
  { nicho: 'pet', sub: 'acessorio', re: /\b(?:arranhador|coleira|peitoral\s+(?:para\s+)?(?:c[aã]es|gatos|pet)|guia\s+(?:para\s+)?(?:c[aã]es|pet)|caminha|cama\s+(?:para\s+)?(?:c[aã]es|gatos|pet)|comedouro|bebedouro\s+pet|fonte\s+(?:para\s+|de\s+[aá]gua\s+)?gatos|caixa\s+de\s+transporte|transportadora|brinquedo\s+(?:para\s+)?(?:c[aã]es|gatos|pet)|casinha\s+(?:para\s+)?(?:c[aã]es|gatos))\b/i },
  { nicho: 'auto', sub: 'moto', re: /\b(?:capacete\s+(?:de\s+)?moto|capacete\s+(?:aberto|fechado|articulado)|luva\s+(?:de\s+)?moto|jaqueta\s+moto|ba[uú]\s+moto|bauleto|alforge|capa\s+de\s+chuva\s+moto|motociclista|motoqueiro)\b/i },
  { nicho: 'auto', sub: 'limpeza_auto', re: /\b(?:cera\s+(?:automotiva|carna[uú]ba)|vonixx|vintex|polidor\s+automotivo|politriz|shampoo\s+automotivo|kit\s+lavagem\s+(?:carro|auto|moto)|pretinho\s+pneu|silicone\s+automotivo|aspirador\s+automotivo)\b/i },
  { nicho: 'auto', sub: 'carro', re: /\b(?:automotiv[oa]s?|veicular(?:es)?|dashcam|c[aâ]mera\s+veicular|calibrador\s+de\s+pneu|compressor\s+(?:de\s+ar\s+)?port[aá]til|suporte\s+(?:celular\s+)?(?:carro|veicular)|carregador\s+(?:automotivo|veicular)|tapete\s+automotivo|capa\s+(?:de\s+banco|de\s+volante|protetora\s+(?:carro|moto))|sensor\s+de\s+estacionamento|som\s+automotivo|pneu\s+aro)\b/i },
  { nicho: 'livros', sub: 'manga', re: /(?:^|[^\p{L}])(?:mang[á]s?|mangas?\s+(?:vol\.?|volume|ed\.?|edi[cç][aã]o|box|panini|jbc|newpop|cole[cç][aã]o)|hqs?|quadrinhos|graphic\s+novel|panini|jbc|newpop|pipoca\s+e\s+nanquim)(?![\p{L}])/iu, nao: /\b(?:sem\s+manga|manga\s+(?:longa|curta|bufante|3\/4|raglan|curt[ao]|m[eé]dia)|sabor\s+manga|blusa|camisa|camiseta|vestido|regata|cropped|jaqueta|moletom|polo|macac[aã]o|suco|n[eé]ctar|whey|creatina|energ[eé]tico)\b/i },
  { nicho: 'livros', sub: 'box', re: /(?:^|[^\p{L}])(?:box\s+(?:de\s+)?livros|cole[cç][aã]o\s+(?:de\s+)?livros|trilogia|duologia)(?![\p{L}])/iu },
  { nicho: 'livros', sub: 'negocios', re: /(?:^|[^\p{L}])(?:desenvolvimento\s+pessoal|neg[oó]cios|empreendedorismo|finan[cç]as\s+pessoais|produtividade|lideran[cç]a|biografia|autobiografia)(?![\p{L}])/iu },
  { nicho: 'livros', sub: 'infantil', re: /(?:^|[^\p{L}])(?:livro\s+infantil|livro\s+juvenil|infantojuvenil|livro\s+did[aá]tico|paradid[aá]tico)(?![\p{L}])/iu },
  { nicho: 'livros', sub: 'ficcao', re: /(?:^|[^\p{L}])(?:livros?|capa\s+dura|brochura|romance|fic[cç][aã]o|fantasia|suspense|thriller|literatura|audiolivro|e-?book|b[ií]blia)(?![\p{L}])/iu, nao: /(?:^|[^\p{L}])(?:caderno|planner|agenda|fich[aá]rio)(?![\p{L}])/iu },
  { nicho: 'papelaria', sub: 'arte', re: /(?:^|[^\p{L}])(?:aquarela|tinta\s+(?:guache|acr[ií]lica|[oó]leo)|l[aá]pis\s+de\s+cor|lettering|brush\s+pen|caligrafia|scrapbook|artesanato|croch[eê]|tric[oô]|m[aá]quina\s+de\s+corte|silhouette|cricut|posca)(?![\p{L}])/iu },
  { nicho: 'papelaria', sub: 'escritorio', re: /(?:^|[^\p{L}])(?:etiquetadora|rotulador|organizador\s+de\s+mesa|quadro\s+branco|pasta\s+(?:cat[aá]logo|sanfonada)|organizador\s+de\s+documentos|cartucho\s+de\s+tinta|refil\s+tinta|papel\s+(?:sulfite|a4|fotogr[aá]fico))(?![\p{L}])/iu },
  { nicho: 'papelaria', sub: 'estudo', re: /(?:^|[^\p{L}])(?:caderno|planner|agenda|caneta|lapiseira|marca[- ]?texto|estojo|fich[aá]rio|stabilo|faber[- ]?castell|tilibra|post[- ]?it|material\s+escolar|papelaria)(?![\p{L}])/iu },
  { nicho: 'mercado', sub: 'bebidas', re: /(?:^|[^\p{L}])(?:cerveja|vinho|espumante|prosecco|whisky|whiskey|vodka|gin|energ[eé]tico|monster\s+energy|red\s+bull|refrigerante|suco\s+integral|[aá]gua\s+(?:mineral|de\s+coco|t[oô]nica))(?![\p{L}])/iu },
  { nicho: 'mercado', sub: 'doces', re: /(?:^|[^\p{L}])(?:chocolate|lindt|ferrero\s+rocher|milka|lacta|kitkat|biscoito|bolacha|alfajor|nutella|doce\s+de\s+leite|panetone|chocotone|pringles)(?![\p{L}])/iu },
  { nicho: 'mercado', sub: 'despensa', re: /(?:^|[^\p{L}])(?:azeite|arroz|feij[aã]o|macarr[aã]o|molho\s+de\s+tomate|ketchup|maionese|tempero|conserva|geleia|granola|aveia|marmita\s+congelada|liv\s+up|supermercado)(?![\p{L}])/iu },
  { nicho: 'casa', sub: 'garrafa', re: /\b(?:garrafa\s+t[eé]rmica|copo\s+t[eé]rmico|stanley|squeeze|coqueteleira|shaker|marmita|bolsa\s+t[eé]rmica)\b/i },
  { nicho: 'tech', sub: 'carregador', re: /\b(?:power\s*bank|carregador\s+(?:turbo|port[aá]til|sem\s+fio)|cabo\s+usb|hub\s+usb|adaptador\s+usb)\b/i },
];

/** Categoria do canal → nicho quando o título não deu pista. */
const NICHO_POR_CATEGORIA = {
  kpop: ['kpop', 'geral'], casa: ['casa', 'geral'], tech: ['tech', 'geral'], moda: ['moda', 'geral'],
  beleza: ['beleza', 'geral'], perfumes: ['perfumes', 'geral'], bebe: ['bebe', 'geral'], saude: ['saude', 'geral'],
  auto: ['auto', 'geral'], pet: ['pet', 'geral'], livros: ['livros', 'geral'], papelaria: ['papelaria', 'geral'],
  mercado: ['mercado', 'geral'],
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
    vocabulario: ['nome do fandom', 'coleção', 'estante', 'lista de desejos', 'comeback', 'show'],
    evitar: ['gíria forçada ("bias wrecker", "stan")', 'prometer photocard, pôster ou versão', 'chamar de oficial'],
  },
  games: {
    rotulo: 'Games', publico: 'quem joga no console ou no PC',
    tom: 'gamer falando com gamer: direto, com conhecimento de causa',
    dores: ['controle com o analógico puxando sozinho', 'pilha de jogos que só cresce', 'jogar em dupla com controle ruim', 'console da geração passada'],
    vocabulario: ['jogatina', 'jogos pra zerar', 'analógico puxando', 'zerar', 'partida', 'geração'],
    evitar: ['meme datado', 'prometer FPS ou desempenho em jogo específico'],
  },
  hardware: {
    rotulo: 'Hardware & PC', publico: 'quem monta, faz upgrade ou trabalha no PC',
    tom: 'quem entende de PC falando com quem também entende: direto, sem dar aula',
    dores: ['monitor de 60Hz', 'PC demorando pra ligar e abrir jogo', 'upgrade adiado', 'jogar tudo no gráfico baixo'],
    vocabulario: ['computador', 'upgrade', 'aposentar', 'ligar rápido', 'gráfico'],
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
    rotulo: 'Perfumes', publico: 'quem acompanha perfumaria, monta coleção e espera a hora certa de comprar',
    tom: 'perfumista de grupo: empolgado, sem pompa e sem prometer o que depende de pele e gosto',
    // Gosto é pessoal (oud, couro e especiarias dividem opiniões) e performance varia por perfume e pele:
    // a frase fala da oportunidade, da coleção e, só com o perfume reconhecido, da proposta/ocasião.
    subjetivo: true,
    dores: ['esperar baixar pra colocar na coleção', 'repetir sempre o mesmo perfume', 'querer variar de pegada', 'lista de desejos parada'],
    vocabulario: ['coleção', 'lista de desejos', 'prateleira', 'pegada', 'proposta', 'ocasião', 'dia a dia', 'noite', 'queridinho'],
    evitar: [
      'prometer fixação, projeção, rastro ou duração',
      'recomendar blind buy ou compra às cegas',
      'inventar notas',
      'chamar de contratipo ou comparar com outra marca',
      'comparar preço com outros perfumes',
    ],
  },
  beleza: {
    rotulo: 'Beleza & Skincare', publico: 'quem tem rotina de pele, cabelo ou maquiagem',
    tom: 'amiga que indica o que usa: leve e próxima',
    dores: ['produto acabando no meio da rotina', 'pular o protetor', 'depender de salão'],
    vocabulario: ['rotina', 'skincare', 'reposição', 'bolsinha de maquiagem', 'estoque'],
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
    rotulo: 'Mundo Pet', publico: 'tutores de cães e gatos',
    tom: 'tutor falando com tutor: carinhoso e prático',
    dores: ['ração acabando de surpresa', 'correr pro mercado por causa do pote vazio', 'deixar o pet confortável'],
    vocabulario: ['pet', 'tutor', 'pote', 'estoque', 'cantinho'],
    evitar: ['prometer saúde do animal'],
  },
  auto: {
    rotulo: 'Auto & Moto', publico: 'quem cuida do carro ou da moto no dia a dia e na estrada',
    tom: 'quem curte cuidar do carro/moto falando com outro motorista ou motociclista: prático e direto',
    dores: ['carro sujo sem tempo de levar no lava-rápido', 'pneu murcho na hora errada', 'celular sem suporte no trânsito', 'rodar na chuva de moto'],
    vocabulario: ['garagem', 'estrada', 'trânsito', 'lava-rápido', 'brilho', 'porta-malas', 'piloto'],
    evitar: ['prometer segurança no trânsito ou compatibilidade universal'],
  },
  livros: {
    rotulo: 'Livros & Leitura', publico: 'leitores de ficção, fantasia, mangá, HQ e não-ficção',
    tom: 'leitor falando com leitor no grupo: empolgado com a estante e a lista de leitura',
    dores: ['lista de leitura parada na lista de desejos', 'box caro esperando baixar', 'falta de volume na coleção de mangá'],
    vocabulario: ['estante', 'leitura', 'lista de desejos', 'coleção', 'página', 'maratona'],
    evitar: ['dar spoiler', 'prometer edição limitada ou brinde não informado'],
  },
  papelaria: {
    rotulo: 'Papelaria & Criatividade', publico: 'estudantes, concurseiros, quem trabalha em home office e quem ama arte/artesanato',
    tom: 'apaixonado por papelaria e mesa organizada: leve, criativo e prático',
    dores: ['mesa bagunçada no home office', 'estojo incompleto na volta às aulas', 'falta de material pra projeto criativo'],
    vocabulario: ['mesa', 'estudo', 'planner', 'estojo', 'home office', 'projeto'],
    evitar: ['prometer aprovação em prova ou rendimento'],
  },
  mercado: {
    rotulo: 'Mercado & Sabores', publico: 'quem faz compras do mês e gosta de economizar na despensa, café e bebidas',
    tom: 'amigo que avisa quando o mercado baixa: prático, acolhedor e bom de garimpo',
    dores: ['conta do supermercado subindo', 'ficar sem café no meio da semana', 'churrasco ou jantar de última hora'],
    vocabulario: ['despensa', 'compras do mês', 'cafezinho', 'fim de semana', 'geladeira', 'estoque'],
    evitar: ['incentivar consumo excessivo de álcool', 'prometer validade ou sabor'],
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
  cuidado: {
    // Incontinência adulta: quem compra costuma ser quem cuida de um idoso ou o próprio usuário. Tom
    // respeitoso e discreto, sem piada, sem expor ninguém e sem IA.
    rotulo: 'Cuidado adulto', publico: 'quem cuida de alguém em casa ou usa no dia a dia',
    tom: 'respeitoso, discreto e prático', sensivel: true,
    dores: ['estoque que acaba no meio da semana', 'rotina de cuidado corrida'],
    vocabulario: ['cuidado', 'rotina', 'estoque', 'tamanhos'],
    evitar: ['piada', 'expor quem usa', 'prometer conforto, proteção ou segurança', 'falar de bebê ou enxoval'],
  },
  saude: {
    rotulo: 'Saúde & Bem-estar', publico: 'quem cuida da saúde e bem-estar no dia a dia',
    tom: 'prático e direto, sem promessa médica nem linguagem clínica', sensivel: true,
    dores: ['deixar pra comprar quando precisa', 'manter os cuidados do dia a dia em dia'],
    vocabulario: ['rotina', 'cuidado', 'reposição', 'bem-estar'],
    evitar: ['qualquer promessa de saúde, cura ou resultado clínico'],
  },
  combo: {
    rotulo: 'Combo & Kit', publico: 'quem quer levar mais de um item junto economizando no conjunto',
    tom: 'direto e prático, falando do combo como um todo sem focar só em um dos itens',
    dores: ['comprar separado sai bem mais caro', 'resolver dois itens de uma vez'],
    vocabulario: ['combo', 'conjunto', 'pacote', 'dois em um'],
    evitar: ['falar só de um dos produtos do combo', 'inventar brinde'],
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
  if (/\b(?:nvme|ssd)\b/i.test(t)) out.push({ k: 'nvme' });
  if ((m = t.match(/\bddr([45])\b/i))) out.push({ k: 'ddr', v: m[1] });
  if ((m = t.match(/\brtx\s*(\d{4})\b/i))) out.push({ k: 'rtx', v: m[1] });
  if (/\boled\b/i.test(t)) out.push({ k: 'oled' });
  else if (/\b4k\b/i.test(t)) out.push({ k: '4k' });
  if (/\b(?:anc|cancelamento\s+(?:ativo\s+)?de\s+ru[ií]do|noise\s+cancel)/i.test(t)) out.push({ k: 'anc' });
  if ((m = t.match(/\bwi-?fi\s*(6e?|7)\b/i))) out.push({ k: 'wifi', v: m[1].toUpperCase() });
  return out;
}

// Frases a partir da especificação do título: falam do upgrade/dor, nunca explicam o que a spec faz.
// unicas: frases completas por contexto (queda = comparação verificada ou cupom, pode citar "nesse valor").
// aberturas: primeira frase neutra, combinada com um fecho do contexto (ver COMBO).
const FRASES_SPEC = {
  hz: {
    unicas: {
      neutro: [(v) => `${v}Hz é a deixa pra aposentar o monitor de 60Hz de vez.`],
      queda: [(v) => `${v}Hz por esse valor é a deixa pra aposentar o monitor de 60Hz de vez.`],
    },
    aberturas: [(v) => `Quem sai do 60Hz pro ${v}Hz não volta mais.`, (v) => `${v}Hz pra parar de jogar no 60Hz.`, () => 'Hora de aposentar o monitor de 60Hz.'],
  },
  nvme: {
    unicas: {
      neutro: [
        () => 'Quem ainda liga o PC num HD vai sentir a diferença na primeira vez que ligar.',
        () => 'Mais espaço pros jogos e arquivos sem precisar apagar nada.',
      ],
      queda: [
        () => 'Nesse valor é pra tirar o HD lento da sua vida de vez.',
        () => 'Mais espaço pros jogos e arquivos sem apertar o orçamento.',
      ],
    },
    aberturas: [
      () => 'PC ainda demorando pra ligar com HD? Hora de aposentar.',
      () => 'Adeus, HD lento.',
      () => 'PC demorando pra ligar cansa qualquer um.',
      () => 'Mais espaço pros jogos e arquivos.',
    ],
  },
  ddr: {
    unicas: {
      neutro: [(v) => `Montando em plataforma nova? DDR${v} é a peça que fecha o setup.`],
      queda: [(v) => `DDR${v} nesse valor ajuda a fechar o setup novo sem estourar o orçamento.`],
    },
    aberturas: [() => 'PC novo pede memória à altura.', (v) => `Pra quem já tá na plataforma DDR${v}.`],
  },
  rtx: {
    unicas: {
      neutro: [(v) => `RTX ${v} pra jogar os lançamentos sem deixar tudo no gráfico baixo.`],
      queda: [(v) => `RTX ${v} nesse valor é a deixa pra parar de jogar tudo no baixo.`],
    },
    aberturas: [(v) => `Chega de jogar tudo no baixo: RTX ${v} na área.`, () => 'Placa nova é o upgrade que mais aparece na tela.'],
  },
  oled: {
    unicas: {
      neutro: [() => 'Depois de ver preto de OLED, tela comum perde a graça.'],
      queda: [() => 'OLED nesse valor é pra quem tava esperando a hora de dar o pulo.'],
    },
    aberturas: [() => 'OLED é daqueles upgrades sem volta.', () => 'Preto de verdade muda filme e jogo.'],
  },
  '4k': {
    unicas: {
      neutro: [() => 'Depois que acostuma com 4K, voltar pra tela antiga dói.'],
      queda: [() => '4K nesse valor é a deixa pra aposentar a tela antiga.'],
    },
    aberturas: [() => 'Futebol e série em 4K é outro jogo.', () => 'Tela antiga já deu o que tinha que dar.'],
  },
  anc: {
    unicas: {
      neutro: [() => 'Ônibus lotado e escritório barulhento viram outro mundo com um desses.'],
      queda: [() => 'Cancelamento de ruído nesse valor é presente pra sua paciência.'],
    },
    aberturas: [() => 'Pra ouvir só o que você quer, até no ônibus lotado.', () => 'Vizinho barulhento nunca mais.'],
  },
  wifi: {
    unicas: {
      neutro: [(v) => `Wi-Fi ${v} pra acabar com a internet caindo quando a casa toda conecta junto.`],
      queda: [(v) => `Wi-Fi ${v} nesse valor resolve a briga pela internet em casa.`],
    },
    aberturas: [() => 'Chega de briga pela internet em casa.', () => 'Internet caindo no meio da reunião online cansa.'],
  },
};

/** Apelido oficial do lightstick por grupo (só os consagrados no fandom). */
const NOMES_LIGHTSTICK = {
  bts: 'ARMY Bomb', seventeen: 'Carat Bong', twice: 'Candybong', stray_kids: 'Nachimbong',
  ateez: 'Lightiny', txt: 'Moabong', nct: 'Neobong', exo: 'Eribong', got7: 'Ahgabong', mamamoo: 'Moobong',
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
  if (/\b(?:light\s*stick|army\s*bomb|carat\s*bong|candybong|moabong|neobong|lightiny|official\s*light)\b/i.test(t)) return 'lightstick';
  if (/\b(?:photocards?|fich[aá]rio|binder|toploader|bt21|skzoo|aniteez|tinytan|tiny\s*tan|pel[uú]cia|chaveiro|funko|season'?s?\s*greetings|dicon)\b/i.test(t)) return 'colecionavel';
  return 'album';
}

/**
 * Identifica nicho, subnicho e referências do produto.
 * @returns {{nicho:string, sub:string, perfil:object, grupo:{id,nome,fandom}|null, specs:Array}}
 */
/** Detecta combo/kit/pacote com 2+ produtos distintos (ex.: "Monitor ... + Tablet ...", "Combo Monitor e Tablet", "Notebook c/ Mochila"). */
// "Niacinamida 10% + Zinco", "Vitamina C + Zinco", "Ômega 3 + D3": fórmula de UM produto, não combo.
const RE_ING_FIM = /(?:\d+\s*%|niacinamida|zinco|vitamina(?:\s*[a-z]\d*)?|hialur[oô]nico|col[aá]geno|magn[eé]sio|c[aá]lcio|ferro|biotina|retinol|ceramidas?|pantenol|d3|k2|b12|[oô]mega\s*3|cafe[ií]na|sel[eê]nio|queratina|argila|aloe(?:\s+vera)?|karit[eé])\s*$/iu;
const RE_ING_INICIO = /^(?:niacinamida|zinco|vitamina|[aá]cido|hialur[oô]nico|col[aá]geno|magn[eé]sio|c[aá]lcio|ferro|biotina|retinol|ceramidas?|pantenol|d3|k2|b12|[oô]mega|cafe[ií]na|sel[eê]nio|queratina|argila|aloe|karit[eé])(?![\p{L}])/iu;

function plusEhIngrediente(s) {
  const partes = s.split(/\s*\+\s*/);
  if (partes.length < 2) return false;
  for (let i = 0; i < partes.length - 1; i += 1) {
    if (!(RE_ING_FIM.test(partes[i].trim()) || RE_ING_INICIO.test(partes[i + 1].trim()))) return false;
  }
  return true;
}

function ehComboOferta(titulo) {
  const s = String(titulo || '').trim();
  // 1) Separador "+" (com ou sem espaço, ignorando sufixos como S10+, FE+, 5G+, 18+ e fórmulas "10% + Zinco")
  if (/(?:\s\+\s|[a-zA-ZÀ-ÿ0-9"”]\+[A-Za-zÀ-ÿ]{3})/.test(s) && !plusEhIngrediente(s)) {
    const partes = s.split(/\s*\+\s*/).map((p) => p.trim()).filter((p) => p.length >= 4 && /[a-zA-ZÀ-ÿ]{3}/.test(p));
    if (partes.length >= 2) return true;
  }
  // 2) "Combo ..." / "Pacote ..." / "Bundle ..." ligando 2 itens distintos via "e" / "com" / "c/"
  if (/\b(?:combo|pacote|bundle)\b/i.test(s) && !/\b(?:combo|pacote)\s+(?:com\s+|c\/\s*)?\d+\s+(?:un|unid|pe[cç]as|camisetas|cuecas|meias|fraldas|calcinhas|panos|toalhas|potes|copos|pratos|unidades)\b/i.test(s)) {
    const semPref = s.replace(/^\s*(?:combo|pacote|bundle)\s+(?:de\s+)?/i, '');
    const partes = semPref.split(/\s+(?:e|com|c\/)\s+/i).map((p) => p.trim()).filter((p) => p.length >= 4 && /[a-zA-ZÀ-ÿ]{3}/.test(p));
    if (partes.length >= 2) return true;
  }
  // 3) "Produto A c/ Produto B" (dois itens distintos)
  if (/\s+c\/\s+[a-zA-ZÀ-ÿ]{4}/i.test(s) && !/\bc\/\s*\d+\s*(?:un|unid|ml|mg|g|kg|l|cm|mm|m|pe[cç]as|c[aá]psulas|comprimidos|folhas|tiras|rolos)\b/i.test(s)) {
    const partes = s.split(/\s+c\/\s+/i).map((p) => p.trim()).filter((p) => p.length >= 4 && /[a-zA-ZÀ-ÿ]{3}/.test(p));
    if (partes.length >= 2) return true;
  }
  return false;
}

function detectarNicho(oferta) {
  const o = oferta || {};
  const titulo = String(o.titulo || '');
  const cat = String(o.categoria || '');
  const pronto = (nicho, sub, extra) => Object.assign({ nicho, sub, perfil: PERFIS[nicho] || PERFIS.geral, grupo: null, specs: [] }, extra || {});

  const grupo = grupoKpopDe(titulo);
  if (cat === 'kpop' || RE_KPOP_EXPLICITO.test(titulo) || (grupo && RE_KPOP_FORMATO.test(titulo))) {
    return pronto('kpop', subKpop(titulo), { grupo });
  }
  if (RE_MEDICAMENTO.test(titulo) && !RE_SUPLEMENTO.test(titulo)) return pronto('saude', 'medicamento', { semCopy: true });
  if (ehComboOferta(titulo)) return pronto('combo', 'geral');
  for (const r of REGRAS_NICHO) {
    if (r.re.test(titulo) && !(r.nao && r.nao.test(titulo))) {
      const specs = ['hardware', 'tech', 'games'].includes(r.nicho) ? especificacoes(titulo) : [];
      const extra = r.nicho === 'saude' && r.sub === 'pet' ? { specs, semCopy: true } : { specs };
      return pronto(r.nicho, r.sub, extra);
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
        'Álbum de K-pop nesse valor é pra tirar da lista de desejos sem pensar duas vezes.',
      ],
      cupom: [
        'Com o cupom, o álbum do {grupo} cabe no mês sem drama.',
        '{fandom}, o cupom ajuda a fechar a coleção do {grupo} gastando menos.',
        'Com o cupom, dá pra tirar esse álbum da lista de desejos sem culpa.',
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
        'Pra finalmente encarar aquela pilha de jogos que só cresce.',
        'Fim de semana de jogatina começa aqui.',
      ],
      queda: [
        'Console nesse valor é a deixa pra finalmente pular de geração.',
        'Quem tava esperando baixar pra trocar de console, chegou a sua vez.',
      ],
    },
    controle: {
      neutro: [
        'Controle reserva é o que salva quando o seu começa a puxar sozinho.',
        'Pra jogatina em dupla sem ninguém ficar com o controle ruim.',
        'Analógico puxando sozinho? Tá na hora de aposentar o velho.',
      ],
      queda: [
        'Nesse preço compensa demais deixar de reserva antes que o seu comece a puxar sozinho.',
        'Nesse valor dá pra ter um reserva e não ficar na mão quando o seu começar a puxar sozinho.',
      ],
      cupom: ['Com o cupom, dá pra deixar um de reserva antes que o seu comece a puxar sozinho.'],
    },
    jogo: {
      neutro: ['Mais um pra pilha de jogos, mas esse vale passar na frente.', 'Pra fechar o fim de semana com jogatina boa.'],
      queda: ['Esse nesse valor vale passar na frente da pilha de jogos.', 'Jogo bom nesse valor é pra garantir e jogar com calma.'],
    },
    periferico: {
      neutro: ['Upgrade no PC que você sente já na primeira partida.', 'Pra parar de perder partida por culpa do periférico.'],
      queda: ['Periférico bom nesse valor é upgrade sem peso na consciência.'],
    },
    acessorio: {
      neutro: ['Detalhe que salva o controle de muito perrengue.', 'Daqueles acessórios que você se pergunta por que não comprou antes.'],
    },
    geral: { neutro: ['Achado pra quem leva a jogatina a sério.'] },
  },
  hardware: {
    pc: {
      neutro: ['Upgrade que dá sobrevida pro PC sem precisar trocar tudo.', 'Pra quem tá montando o PC aos poucos, peça certeira.'],
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
    geral: { neutro: ['Upgrade pra quem leva o computador a sério.'] },
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
    faxina: {
      neutro: [
        'Pra faxina de fim de semana acabar antes do almoço.',
        'Pelo de pet e farelo no chão deixam de ser problema diário.',
        'Casa limpa sem passar o sábado inteiro arrastando vassoura.',
      ],
      queda: ['Nesse valor fica fácil aposentar a vassoura de todo dia.'],
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
        'Quem tava com esse árabe parado na lista de desejos, agora tem desculpa.',
      ],
      cupom: ['Com o cupom, dá pra colocar mais um árabe na coleção gastando menos.'],
    },
    nicho: {
      neutro: ['Pra quem já passou da fase dos perfumes de shopping.', 'Pra quem acompanha perfumaria de nicho e gosta de fugir do óbvio.'],
      queda: ['Perfume de nicho nesse valor é pra tirar da lista de desejos.', 'Quem tava de olho nesse nicho esperando baixar, chegou a vez.'],
      cupom: ['Com o cupom, aquele perfume de nicho da lista de desejos fica bem mais perto.'],
    },
    geral: {
      neutro: ['Pra quem vive repetindo o mesmo perfume e quer variar.', 'Bom pra ter na penteadeira ou separar pra presente.'],
      queda: ['Nesse valor dá pra tirar da lista de desejos sem culpa.'],
      cupom: ['Com o cupom, dá pra tirar da lista de desejos sem culpa.'],
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
      queda: ['Nesse valor dá pra testar e ver se entra na rotina.'],
    },
    aparelho: {
      neutro: ['Pra arrumar o cabelo em casa sem depender de salão.', 'Pra quem arruma o cabelo todo dia antes de sair.'],
      queda: ['Nesse valor dá pra aposentar o aparelho antigo.'],
    },
    make: {
      neutro: ['Pra bolsinha de quem não sai sem maquiagem.'],
      queda: ['Maquiagem boa nesse valor é pra garantir a reposição.'],
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
    lencos: {
      neutro: ['Lenço umedecido acaba antes do que a gente imagina.', 'Pra bolsa do bebê nunca ficar sem lencinho.'],
      queda: ['Lenço umedecido nesse valor é pra fazer estoque.'],
      cupom: ['Com o cupom, dá pra garantir o estoque de lencinho.'],
    },
    geral: { neutro: ['Pra facilitar a rotina de quem tá com pequeno em casa.', 'Pra deixar o enxoval mais completo sem correria.'] },
  },
  cuidado: {
    geral: {
      neutro: ['Pra quem cuida de alguém em casa e precisa manter o estoque em dia.', 'Item de cuidado diário que não pode faltar em casa.'],
      queda: ['Nesse valor dá pra reforçar o estoque do cuidado diário.'],
      cupom: ['Com o cupom, o estoque do cuidado diário fica mais em conta.'],
    },
  },
  pet: {
    consumo: {
      neutro: ['Pet não aceita atraso no pote, então bom ter estoque.', 'Pra manter o pote cheio sem correr pro mercado.'],
      queda: ['Nesse valor dá pra garantir o estoque do pet com folga.'],
    },
    acessorio: {
      neutro: ['Mimo pro pet que manda na casa.', 'Pra deixar o cantinho do pet mais gostoso.'],
      queda: ['Mimo pro pet nesse valor fica fácil de justificar.'],
    },
    geral: { neutro: ['Pra quem vê o pet como parte da família.'] },
  },
  suplementos: {
    geral: {
      neutro: [
        'Pra não deixar o pote zerar no meio da rotina.',
        'Reposição do mês resolvida sem precisar sair procurando.',
        'Pra manter a rotina de suplementação em dia sem susto.',
      ],
      queda: [
        'Nesse valor dá pra fazer estoque e esquecer por uns meses.',
        'Baixou bem pra garantir a reposição da rotina com folga.',
      ],
      cupom: ['Com o cupom, a reposição da rotina fica bem mais em conta.'],
    },
  },
  saude: {
    geral: {
      neutro: [
        'Pra manter a rotina de cuidados em dia sem correr de última hora.',
        'Item prático pra ter sempre à mão na rotina de bem-estar.',
      ],
      queda: [
        'Nesse valor vale demais garantir a reposição dos cuidados diários.',
        'Baixou bem pra deixar o kit de cuidados em casa sempre em dia.',
      ],
      cupom: ['Com o cupom, dá pra reforçar os cuidados do dia a dia pagando menos.'],
    },
  },
  combo: {
    geral: {
      neutro: [
        'Combo daqueles que já resolve dois itens de uma vez só.',
        'Pra quem prefere levar o conjunto completo sem ficar garimpando separado.',
      ],
      queda: [
        'Combo completo nesse valor sai bem mais leve do que levar separado.',
        'Baixou bem pra quem tava esperando a deixa de levar o pacote inteiro.',
      ],
      cupom: ['Com o cupom, levar o combo inteiro faz ainda mais sentido.'],
    },
  },
  ferramentas: {
    geral: {
      neutro: ['Pra parar de pedir emprestado pro vizinho.', 'Pra resolver os reparos de casa sem esperar ninguém.'],
      queda: ['Ferramenta boa nesse valor é investimento pra casa toda.'],
    },
  },
  auto: {
    moto: {
      neutro: ['Pra quem roda de moto todo dia e não abre mão de equipamento bom.', 'Quem pilota sabe o quanto um bom acessório muda o trajeto.'],
      queda: ['Acessório de moto nesse valor compensa demais pra quem tá na rua todo dia.', 'Pra quem tava adiando trocar o equipamento da moto, baixou bem.'],
      cupom: ['Com o cupom fica bem mais leve equipar a moto pro dia a dia.'],
    },
    limpeza_auto: {
      neutro: ['Pra deixar o carro brilhando em casa sem depender de lava-rápido.', 'Quem curte estética automotiva conhece bem esse aqui.'],
      queda: ['Nesse valor sai bem mais em conta do que um fim de semana no lava-rápido.', 'Baixou bem pra quem gosta de cuidar do carro na garagem.'],
      cupom: ['Com o cupom vale reforçar o kit de lavagem na garagem.'],
    },
    carro: {
      neutro: ['Acessório daqueles que salvam no trânsito e na estrada.', 'Pra deixar o carro mais prático no dia a dia e nas viagens.'],
      queda: ['Nesse valor compensa demais deixar no carro pra qualquer perrengue.', 'Baixou e resolve uma dor real de quem dirige todo dia.'],
      cupom: ['Com o cupom fica fácil dar aquele upgrade no carro.'],
    },
    geral: {
      neutro: ['Pra quem cuida do carro ou da moto sem complicação.'],
      queda: ['Baixou bem pra quem tava precisando equipar a garagem.'],
    },
  },
  livros: {
    manga: {
      neutro: ['Pra quem coleciona mangá e HQ e não deixa a estante incompleta.', 'Mais um volume pra avançar a coleção sem pular nenhum.'],
      queda: ['Nesse valor a estante de mangás agradece demais.', 'Baixou e é a deixa pra fechar mais um volume da coleção.'],
      cupom: ['Com o cupom dá pra puxar mais de um volume sem pesar.'],
    },
    box: {
      neutro: ['Box completo na estante tem outro charme pra quem ama ler.', 'Pra quem prefere começar a saga já com todos os volumes na mão.'],
      queda: ['Box de livros nesse valor é a deixa pra tirar da lista de desejos.', 'Baixou bem pra quem tava namorando essa coleção faz tempo.'],
      cupom: ['Com o cupom o box inteiro sai bem mais em conta.'],
    },
    negocios: {
      neutro: ['Leitura direta pra quem gosta de aprender e aplicar no dia a dia.', 'Daqueles livros que rendem anotações da primeira à última página.'],
      queda: ['Nesse valor vale demais colocar na fila de leitura do mês.', 'Baixou e compensa ter na estante pra consultar sempre.'],
      cupom: ['Com o cupom fica ótimo pra renovar a lista de leitura.'],
    },
    infantil: {
      neutro: ['Leitura gostosa pra criar o hábito com os pequenos longe das telas.', 'Ótima pedida pra hora da história antes de dormir.'],
      queda: ['Nesse valor dá pra montar uma estante inteira pros pequenos.', 'Baixou bem pra renovar os livrinhos da criançada.'],
      cupom: ['Com o cupom compensa garantir mais histórias pros pequenos.'],
    },
    ficcao: {
      neutro: ['Pra quem tá procurando a próxima leitura que prende até tarde.', 'Aquele título que a galera da leitura sempre recomenda.'],
      queda: ['Nesse valor sai fácil da lista de desejos direto pra cabeceira.', 'Baixou bem pra quem tava esperando a deixa pra começar essa leitura.'],
      cupom: ['Com o cupom a pilha de livros não lidos agradece.'],
    },
    geral: {
      neutro: ['Boa pedida pra quem não larga o hábito da leitura.'],
      queda: ['Baixou e merece um espaço na sua estante.'],
    },
  },
  papelaria: {
    arte: {
      neutro: ['Pra quem ama colocar a criatividade no papel sem ficar improvisando.', 'Material caprichado faz toda diferença no projeto criativo.'],
      queda: ['Nesse valor compensa demais turbinar o kit de arte e artesanato.', 'Baixou bem pra quem tava esperando renovar os materiais criativos.'],
      cupom: ['Com o cupom o próximo projeto sai bem mais em conta.'],
    },
    escritorio: {
      neutro: ['Mesa organizada muda completamente o ritmo do home office.', 'Pra quem trabalha ou estuda em casa e cansou da bagunça na escrivaninha.'],
      queda: ['Nesse valor vale demais ajeitar o cantinho do home office.', 'Baixou e facilita muito a rotina de escritório e estudos.'],
      cupom: ['Com o cupom fica leve organizar a mesa inteira.'],
    },
    estudo: {
      neutro: ['Quem ama papelaria sabe a paz de um estojo e caderno bem escolhidos.', 'Pra deixar a rotina de estudos mais leve e organizada.'],
      queda: ['Nesse valor dá pra montar o kit de estudos sem pesar no mês.', 'Baixou bem pra quem tava adiando renovar o material escolar.'],
      cupom: ['Com o cupom vale aproveitar pra repor a papelaria.'],
    },
    geral: {
      neutro: ['Achado caprichado pra quem ama papelaria e organização.'],
      queda: ['Baixou e merece lugar na sua mesa.'],
    },
  },
  mercado: {
    cafe: {
      neutro: ['Pra quem o dia só começa de verdade depois do primeiro cafezinho.', 'Quem toma café todo dia sabe o valor de manter a despensa abastecida.'],
      queda: ['Nesse valor compensa demais garantir o café da semana toda.', 'Baixou bem pra não passar aperto sem café em casa.'],
      cupom: ['Com o cupom o cafezinho de todo dia sai bem mais em conta.'],
    },
    bebidas: {
      neutro: ['Boa pedida pra deixar a geladeira preparada pro fim de semana.', 'Pra quem gosta de receber amigos em casa sem pagar caro de última hora.'],
      queda: ['Nesse valor vale abastecer a geladeira antes do fim de semana.', 'Baixou bem pra quem gosta de deixar reservado em casa.'],
      cupom: ['Com o cupom fica ótimo pra montar o estoque de bebidas.'],
    },
    doces: {
      neutro: ['Aquele mimo gostoso pra ter na despensa quando bate a vontade.', 'Difícil resistir a um desses no meio da tarde.'],
      queda: ['Nesse valor vale garantir pra dividir com a família ou guardar de mimo.', 'Baixou e fica difícil passar batido no mercado.'],
      cupom: ['Com o cupom o mimo da semana sai bem mais leve.'],
    },
    despensa: {
      neutro: ['Item de despensa que sempre faz diferença na conta das compras do mês.', 'Pra economizar nas compras do mês sem precisar encarar fila de mercado.'],
      queda: ['Nesse valor ajuda demais a aliviar a conta do supermercado.', 'Baixou bem pra fazer estoque na despensa com calma.'],
      cupom: ['Com o cupom a compra do mês fica bem mais em conta.'],
    },
    geral: {
      neutro: ['Economia prática direto pras compras do mês.'],
      queda: ['Baixou e ajuda a aliviar o orçamento do mercado.'],
    },
  },
  geral: {
    geral: {
      neutro: [
        'Achado que vale a olhada com calma.',
        'Garimpo real que chamou atenção por aqui hoje.',
        'Daqueles itens que a gente nem lembrava que precisava até ver.',
        'Vale abrir o link e conferir os detalhes na loja.',
      ],
      queda: [
        'Nesse valor vale dar uma olhada com atenção.',
        'Baixou bem e entrou direto na seleção do garimpo.',
        'Quem tava de olho num desses, esse valor tá bem interessante.',
        'Queda real que merece um clique pra conferir.',
      ],
      cupom: [
        'Com o cupom ativo o preço final fica bem mais interessante.',
        'Achado com cupom pronto pra aplicar na loja.',
      ],
    },
  },
};

// Fechos de estoque/reposição: só em sub-nichos de consumíveis (ninguém "faz estoque" de chapinha,
// carrinho de bebê ou arranhador). Somam com os fechos genéricos do nicho.
const FECHOS_REPOSICAO = {
  queda: ['Nesse valor é pra fazer estoque.', 'Baixou e vale repor.', 'Nesse preço compensa garantir a reposição.', 'Nesse valor dá pra garantir dois.'],
  cupom: ['Com o cupom a reposição sai mais em conta.', 'Usa o cupom e faz a reposição.'],
};
const FECHOS_ESTOQUE_BEBE = {
  queda: ['Nesse valor é pra fazer estoque.', 'Nesse valor vale reforçar o estoque.'],
  cupom: ['Com o cupom dá pra reforçar o estoque.', 'Usa o cupom e reforça o estoque.', 'Usa o cupom e garante o mês.'],
};

// Combinações "abertura + fecho": a abertura cria laço com quem é do nicho (fala a língua da turma, a dor,
// o fandom) e não fala de preço; o fecho dá o empurrão conforme o contexto da oferta. Cada sub-nicho ×
// contexto rende dezenas de frases, e a escolha evita repetir abertura, fecho e frase dos posts recentes
// (escolherCopy). Placeholders: {grupo}, {fandom} e {bastao} (apelido do lightstick); sem valor, a peça cai.
// fechos do sub-nicho somam com os do nicho.
const COMBO = {
  kpop: {
    fechos: {
      neutro: ['Vale abrir pra conferir.', 'Fica a dica pro fandom.', 'Dá uma olhada com carinho.', 'Manda pra amiga que também é do fandom.', 'Já salva pra não esquecer.', 'Compartilha com o grupinho do fandom.'],
      queda: ['Nesse valor dá pra completar a coleção sem chorar no boleto.', 'Baixou, e é a deixa pra garantir.', 'Quem tava esperando baixar, chegou a vez.', 'Nesse preço a lista de desejos agradece.', 'Baixou o suficiente pra sair da lista de desejos.', 'Nesse valor a coleção cresce sem culpa.'],
      cupom: ['Com o cupom fica bem mais em conta.', 'O cupom ajuda a fechar a coleção gastando menos.', 'Com o cupom, cabe no mês sem drama.', 'Usa o cupom e a coleção agradece.', 'Cupom ativo, coleção feliz.'],
    },
    subs: {
      album: {
        aberturas: [
          '{fandom}, olha o que apareceu por aqui.',
          'Alô, {fandom}!',
          'Quem é {fandom} sabe a dor de ver a coleção incompleta.',
          'Esse do {grupo} é daqueles que a estante sente falta.',
          'A coleção do {grupo} agradece.',
          'Pra {fandom} que ainda não tem esse na estante.',
          'Aquele álbum do {grupo} que vive na lista de desejos.',
          'Comeback ou não, álbum do {grupo} sempre tem espaço na estante.',
          'Abrir álbum do {grupo} é terapia, a gente sabe.',
          'Coleção de K-pop nunca tá completa, né?',
          'Pra estante de quem respira K-pop.',
          'Abrir álbum novo é outro nível de felicidade.',
        ],
      },
      lightstick: {
        aberturas: [
          'Show do {grupo} sem lightstick não é a mesma coisa.',
          '{fandom}, olha o {bastao} aqui.',
          'Pra não ser o único {fandom} sem luz no show.',
          'Mar de luz no show do {grupo} e você de mão vazia? Não dá.',
          'O {bastao} é daqueles itens que todo {fandom} sonha em ter.',
          'Lightstick do {grupo} na estante já vale a decoração.',
          'Pra acender junto com o fandom no próximo show do {grupo}.',
          '{fandom}, bora deixar o lightstick pronto pro show?',
          'Lightstick é o ingresso emocional de todo show de K-pop.',
          'Quem já foi em show de K-pop sabe: sem lightstick não rola.',
        ],
        fechos: {
          neutro: ['Já deixa separado pro próximo show.', 'Bora acender no próximo show.'],
          queda: ['Nesse valor já fica separado pro próximo show.', 'Baixou bem pra quem tava juntando pro show.'],
        },
      },
      colecionavel: {
        aberturas: [
          'Photocard largado na gaveta? Isso aqui resolve.',
          'Mimo pra coleção de quem é {fandom} de carteirinha.',
          'Coleção organizada é coleção feliz.',
          'Pra quem coleciona {grupo} até nos detalhes.',
          'Detalhe que deixa a coleção com cara de coleção.',
          'Binder arrumadinho é outro prazer.',
          'Pra quem já perdeu a conta dos photocards.',
          '{fandom}, a coleção merece esse carinho.',
        ],
      },
      geral: {
        aberturas: ['Achado pra quem vive de K-pop.', 'Pra quem coleciona K-pop até nos detalhes.', 'Quem é do K-pop vai entender esse achado.', 'Pra estante de quem respira K-pop.'],
      },
    },
  },
  games: {
    fechos: {
      neutro: ['Vale abrir pra conferir.', 'Fica a dica pro pessoal da jogatina.', 'Manda pro parceiro do online.', 'Já salva aí.', 'Bora de jogatina.', 'Dá uma olhada com calma.'],
      queda: ['Nesse valor compensa demais.', 'Baixou, e aí fica difícil não pegar.', 'Nesse preço vale tirar da lista de desejos.', 'Quem tava esperando baixar, chegou a vez.', 'Esse valor tá bonito de ver.', 'Nesse valor sobra pro próximo jogo.'],
      cupom: ['Com o cupom fica bem mais em conta.', 'O cupom deixa ainda melhor.', 'Usa o cupom e bora jogar.', 'Cupom ativo deixa tudo melhor.', 'Com o cupom, sobra pro próximo jogo.'],
    },
    subs: {
      console: {
        aberturas: [
          'Pra quem ainda tá na geração passada e vive adiando a troca.',
          'A pilha de jogos não vai se zerar sozinha.',
          'Fim de semana de jogatina começa aqui.',
          'Pra quem cansou de ver todo mundo jogando os lançamentos.',
          'Console novo na sala muda o fim de semana.',
          'A geração atual tá esperando você.',
        ],
      },
      controle: {
        aberturas: [
          'Controle reserva é o que salva quando o seu começa a puxar sozinho.',
          'Analógico puxando sozinho? Tá na hora de aposentar.',
          'Pra jogatina em dupla sem ninguém ficar com o controle ruim.',
          'Quem joga todo dia sabe: controle bom não pode faltar.',
          'Analógico puxando sozinho no meio da partida não dá.',
          'Pra ter sempre um carregado enquanto o outro descansa.',
        ],
      },
      jogo: {
        aberturas: [
          'Mais um pra pilha de jogos, mas esse vale passar na frente.',
          'Pra fechar o fim de semana com jogatina boa.',
          'Daqueles pra zerar com calma.',
          'Pra quem tava esperando pra jogar esse.',
          'Pra quem tem o fim de semana livre e vontade de jogar.',
          'Jogatina nova pra chamar a galera.',
        ],
      },
      periferico: {
        aberturas: [
          'Upgrade no PC que você sente na primeira partida.',
          'Pra parar de perder partida por culpa do periférico.',
          'Computador bom é aquele que acompanha seu ritmo.',
          'Quem passa horas jogando sabe o valor de um periférico decente.',
          'Pra mesa de quem joga a sério.',
          'Pra quem joga e trabalha no mesmo computador.',
        ],
      },
      acessorio: {
        aberturas: [
          'Detalhe que salva o controle de muito perrengue.',
          'Daqueles acessórios que você se pergunta por que não comprou antes.',
          'Pra deixar a mesa do computador organizada sem gambiarra.',
          'Pra cuidar de quem cuida da sua jogatina.',
          'Mesa do computador organizada é outro clima.',
        ],
      },
      geral: { aberturas: ['Achado pra quem leva a jogatina a sério.', 'Pra quem é da jogatina.', 'Pra quem vive de jogatina no fim de semana.'] },
    },
  },
  hardware: {
    fechos: {
      neutro: ['Vale abrir pra conferir a configuração.', 'Fica a dica pra quem curte PC.', 'Já salva pra quando for montar.', 'Dá uma olhada com calma.', 'Manda pro amigo que monta PC.', 'Bom de deixar no radar.'],
      queda: ['Nesse valor é hora de tirar o upgrade do papel.', 'Baixou o suficiente pra fazer sentido.', 'Nesse preço compensa demais.', 'Esse valor tá bonito de ver.', 'Nesse valor fica fácil justificar.', 'Baixou e merece atenção.'],
      cupom: ['Com o cupom o upgrade sai mais em conta.', 'O cupom ajuda a fechar a montagem do PC.', 'Com o cupom, sobra pra próxima peça.', 'Usa o cupom e fecha o upgrade.', 'Cupom ativo deixa o upgrade mais leve.'],
    },
    subs: {
      pc: {
        aberturas: [
          'Upgrade que dá sobrevida pro PC sem trocar tudo.',
          'Pra quem tá montando o PC aos poucos.',
          'Aquele upgrade que tava no papel há meses.',
          'PC que demora pra abrir as coisas cansa.',
          'Peça certeira pra quem cuida do PC.',
          'PC bom é aquele que vai melhorando aos poucos.',
          'Upgrade sem precisar de PC novo.',
        ],
      },
      monitor: {
        aberturas: [
          'Pra quem passa o dia na frente da tela.',
          'Upgrade de tela é daqueles que você sente no primeiro dia.',
          'Mesa nova começa pela tela.',
          'Pra trabalhar e jogar com mais espaço na tela.',
          'Tela boa muda o trabalho e o jogo.',
          'Segundo monitor muda a rotina de quem trabalha no PC.',
        ],
      },
      notebook: {
        aberturas: [
          'Pra quem tá com o notebook velho pedindo arrego.',
          'Notebook pra trampo e facul sem ficar preso na mesa.',
          'Pra levar o trabalho pra onde você for.',
          'Notebook travando no meio da aula cansa.',
          'Pra trabalhar do sofá, do café ou da facul.',
          'Notebook novo é rotina mais leve.',
        ],
      },
      geral: { aberturas: ['Upgrade pra quem leva o computador a sério.', 'Pra quem gosta de PC bem montado.'] },
    },
  },
  tech: {
    fechos: {
      neutro: ['Vale abrir pra conferir.', 'Fica a dica.', 'Já salva aí.', 'Manda pra quem tá precisando trocar.', 'Dá uma olhada com calma.', 'Bom de deixar no radar.'],
      queda: ['Nesse valor compensa demais.', 'Baixou e ficou interessante.', 'Nesse preço é a deixa pra trocar.', 'Esse valor tá bonito de ver.', 'Nesse valor fica fácil decidir.', 'Baixou e merece atenção.'],
      cupom: ['Com o cupom fica ainda melhor.', 'O cupom deixa bem mais em conta.', 'Com o cupom a troca fica mais leve.', 'Usa o cupom e resolve.', 'Cupom ativo deixa tudo melhor.'],
    },
    subs: {
      audio: {
        aberturas: [
          'Pra quem vive de fone no ônibus, na academia e no trampo.',
          'Fone novo é daqueles upgrades que você usa o dia inteiro.',
          'Playlist boa merece fone à altura.',
          'Pra deixar o ônibus e a fila passarem mais rápido.',
          'Fone bom é companhia pro dia inteiro.',
          'Fone velho chiando? Hora de trocar.',
        ],
      },
      tv: {
        aberturas: [
          'Futebol e série numa tela dessas é outra experiência.',
          'Pra transformar a sala em cinema.',
          'Maratona de fim de semana pede tela grande.',
          'Domingo de futebol nunca mais vai ser igual.',
          'Pra quem ainda assiste série numa tela pequena.',
          'Sala nova começa pela TV.',
        ],
      },
      celular: {
        aberturas: [
          'Pra quem tá com o celular arrastando.',
          'Bateria morrendo antes do almoço cansa.',
          'Pra quem já cansou de apagar foto pra liberar espaço.',
          'Celular novo é qualidade de vida, sem exagero.',
          'Celular travando no meio do trampo não dá.',
          'Troca de celular sem drama.',
        ],
      },
      carregador: {
        aberturas: [
          'Ficar sem bateria na rua no meio do dia ninguém merece.',
          'Pra carregar o celular sem ficar preso na tomada.',
          'Quem sai cedo e só volta à noite precisa de um desses na mochila.',
          'Cabo e carregador bom salvam a rotina inteira.',
          'Pra nunca mais sair caçando tomada no café ou no aeroporto.',
        ],
      },
      geral: { aberturas: ['Eletrônico pra facilitar o dia a dia.', 'Pra quem gosta de tecnologia que resolve.', 'Gadget útil é gadget usado todo dia.'] },
    },
  },
  casa: {
    fechos: {
      neutro: ['Vale abrir pra conferir.', 'Fica a dica pra casa.', 'Já salva na lista de compras.', 'Manda pra quem tá montando casa.', 'Dá uma olhada com calma.', 'Bom de deixar anotado.'],
      queda: ['Nesse valor compensa demais.', 'Baixou e ficou bem interessante.', 'Esse valor tá bonito de ver.', 'Nesse valor fica fácil decidir.', 'Baixou e merece atenção.'],
      cupom: ['Com o cupom fica ainda mais em conta.', 'O cupom ajuda a fechar a conta.', 'Usa o cupom e resolve.', 'Cupom ativo deixa a conta mais leve.', 'Com o cupom, sobra pro mercado.'],
    },
    subs: {
      airfryer: {
        aberturas: [
          'A maior aliada de quem chega morto do trampo.',
          'Janta pronta sem fritura no fogão.',
          'Quem tem uma não larga mais.',
          'Pra quem não quer nem olhar pra pia depois do trampo.',
          'Batata crocante sem banho de óleo.',
          'Jantar de semana resolvido.',
        ],
      },
      cozinha: {
        aberturas: [
          'Pra cozinha render mais na correria da semana.',
          'Daqueles que você usa todo dia.',
          'Cozinha equipada é metade do caminho.',
          'Pra quem gosta de cozinhar sem complicação.',
          'Pra quem cozinha todo dia e quer facilitar.',
          'Pra marmita da semana sair mais rápido.',
        ],
      },
      limpeza: {
        aberturas: [
          'Pra fazer estoque e esquecer o mercado por um tempo.',
          'Daqueles que acaba rápido em casa.',
          'Faxina de fim de semana agradece.',
          'Despensa abastecida é paz de espírito.',
          'Casa limpa sem gastar o fim de semana inteiro.',
          'Daqueles que nunca podem faltar.',
        ],
        fechos: { queda: ['Nesse preço vale aproveitar pra repor.', 'Nesse valor vale encher a despensa.'], cupom: ['Com o cupom a reposição sai mais em conta.'] },
      },
      faxina: {
        aberturas: [
          'Faxina de fim de semana agradece.',
          'Pra faxina acabar antes do almoço.',
          'Quem tem pet sabe o que é pelo no chão todo dia.',
          'Casa limpa sem passar o sábado arrastando vassoura.',
          'Farelo no chão da cozinha resolvido em dois minutos.',
          'Pra limpeza do dia a dia virar coisa rápida.',
        ],
      },
      clima: {
        aberturas: [
          'Pra sobreviver ao calorão sem derreter no sofá.',
          'Noite de calor sem ficar virando na cama.',
          'O verão tá aí e o calor não perdoa.',
          'Quem dorme no abafado sabe o drama.',
          'Calor de rachar pede reforço.',
          'Pra noite de verão ficar suportável.',
        ],
      },
      cama: {
        aberturas: [
          'Pra deixar a cama daquele jeito que dá preguiça de levantar.',
          'Upgrade de quarto que você sente toda noite.',
          'Cama arrumada é outro humor.',
          'Noite bem dormida muda o dia.',
          'Pra quarto ficar com cara de hotel.',
          'Cama boa é investimento no descanso.',
        ],
      },
      eletro: {
        aberturas: [
          'Pra quem tá montando a casa e quer resolver de uma vez.',
          'Eletro grande é compra pensada.',
          'Pra quem tá renovando a casa aos poucos.',
          'Eletro velho dando sinal? Hora de trocar.',
          'Pra casa nova ou pra renovar a antiga.',
          'Daqueles que facilitam a rotina da casa inteira.',
        ],
      },
      garrafa: {
        aberturas: [
          'Água gelada o dia inteiro na mesa ou no treino muda o hábito.',
          'Pra levar pro trampo, pra academia ou pra estrada sem esquentar.',
          'Quem leva marmita e garrafa de casa sabe o quanto economiza no mês.',
          'Companheira fiel de mesa, treino e viagem.',
          'Pra beber mais água no dia a dia sem depender de copo descartável.',
        ],
      },
      geral: { aberturas: ['Daqueles itens que facilitam a rotina.', 'Pra casa funcionar melhor sem complicação.', 'Casa prática é casa feliz.', 'Pra quem gosta de casa organizada.', 'Item que resolve sem complicação.'] },
    },
  },
  perfumes: {
    fechos: {
      neutro: ['Vale conferir as notas antes de decidir.', 'Fica a dica pra coleção.', 'Já salva na lista de desejos.', 'Manda pra quem também é do perfume.', 'Dá uma olhada com calma.', 'Bom de deixar na lista de desejos.'],
      queda: ['Tava esperando baixar? Chegou a vez.', 'Nesse valor sai fácil da lista de desejos.', 'Baixou e ficou interessante pra coleção.', 'Nesse valor a coleção cresce sem culpa.', 'Esse valor tá bonito de ver.', 'Baixou e merece atenção.'],
      cupom: ['Com o cupom sai mais em conta pra coleção.', 'O cupom ajuda a tirar da lista de desejos.', 'Com o cupom, a lista de desejos anda.', 'Usa o cupom e abre espaço na prateleira.', 'Cupom ativo, lista de desejos mais curta.'],
    },
    subs: {
      arabe: {
        aberturas: [
          'Mais um da leva de perfumaria árabe que chama atenção na coleção.',
          'Pra quem acompanha perfumaria árabe de perto.',
          'Pra quem gosta de ter opção diferente na prateleira.',
          'Quem coleciona árabe vai querer ver esse.',
          'Pra prateleira de quem curte perfumaria árabe.',
        ],
      },
      nicho: {
        aberturas: [
          'Pra quem já passou da fase dos perfumes de shopping.',
          'Pra quem gosta de fugir do óbvio na perfumaria.',
          'Nicho é pra quem curte garimpar.',
          'Pra quem já tem a coleção de base e quer ir além.',
          'Pra prateleira de quem leva perfume a sério.',
          'Perfumaria de nicho é pra quem curte descobrir.',
        ],
      },
      geral: {
        aberturas: [
          'Pra quem vive repetindo o mesmo perfume e quer variar.',
          'Bom pra ter na penteadeira ou separar pra presente.',
          'Coleção de perfume sempre tem espaço pra mais um.',
          'Pra renovar o perfume do dia a dia.',
          'Pra quem gosta de ter um perfume pra cada ocasião.',
          'Pra quem curte variar de perfume.',
        ],
      },
    },
  },
  beleza: {
    // Fechos do nicho servem pra qualquer item; os de estoque/reposição ficam só nos consumíveis (FECHOS_REPOSICAO).
    fechos: {
      neutro: ['Fica a dica pra rotina.', 'Vale conferir.', 'Já salva na lista.', 'Dá uma olhada com calma.', 'Manda pra amiga que também ama uma rotina.', 'Bom de deixar na lista.'],
      queda: ['Esse valor tá bonito de ver.', 'Baixou e merece atenção.', 'Nesse valor compensa demais.', 'Baixou e ficou interessante.'],
      cupom: ['Com o cupom fica ainda melhor.', 'Cupom ativo deixa tudo mais leve.', 'Com o cupom, sobra pra outro item da rotina.'],
    },
    subs: {
      aparelho: {
        aberturas: [
          'Pra arrumar o cabelo em casa sem depender de salão.',
          'Pra quem arruma o cabelo todo dia antes de sair.',
          'Escova de salão em casa, no seu tempo.',
          'Aparelho velho dando trabalho? Hora de trocar.',
          'Pra deixar o cabelo pronto em menos tempo.',
        ],
      },
      protetor: {
        fechos: FECHOS_REPOSICAO,
        aberturas: [
          'Protetor é o passo que não dá pra pular.',
          'Pra não ter desculpa de sair sem protetor.',
          'Protetor bom é aquele que você usa todo dia.',
          'Protetor acabando é sinal de reposição.',
          'Sol não tira folga, nem o protetor.',
          'Pra deixar um na bolsa e outro em casa.',
        ],
      },
      skincare: {
        fechos: FECHOS_REPOSICAO,
        aberturas: [
          'Pra quem não abre mão do skincare nem nos dias corridos.',
          'Daqueles que entram na rotina e não saem mais.',
          'Rotina de skincare pede reposição.',
          'Rotina de skincare boa é rotina que não falha.',
          'Pra quem ama uma rotina de cuidados.',
          'Skincare sem pausa pede reposição em dia.',
        ],
      },
      cabelo: {
        fechos: FECHOS_REPOSICAO,
        aberturas: [
          'Pra caprichar no cabelo em casa.',
          'Reforço bom pra rotina do cabelo.',
          'Cabelo bem cuidado começa no banho.',
          'Dia de cuidar do cabelo é sagrado.',
          'Pra rotina de cabelo ficar completa.',
          'Cabelo agradece um carinho extra.',
        ],
      },
      make: {
        fechos: FECHOS_REPOSICAO,
        aberturas: [
          'Pra bolsinha de quem não sai sem maquiagem.',
          'Maquiagem favorita acabando? Hora de repor.',
          'Maquiagem do dia a dia sempre acaba na hora errada.',
          'Pra quem ama montar a nécessaire.',
          'Maquiagem boa é aquela que você usa até o fim.',
        ],
      },
      geral: { aberturas: ['Pra rotina de cuidados ficar completa.', 'Pra quem gosta de se cuidar sem complicação.', 'Autocuidado começa pelos detalhes.'] },
    },
  },
  moda: {
    fechos: {
      neutro: ['Vale conferir as cores e os tamanhos.', 'Fica a dica.', 'Já salva aí.', 'Manda pra quem tá precisando renovar.', 'Dá uma olhada com calma.', 'Bom de deixar no radar.'],
      queda: ['Nesse valor compensa demais.', 'Baixou e ficou bem interessante.', 'Nesse preço dá até pra levar outra cor.', 'Esse valor tá bonito de ver.', 'Baixou e merece atenção.', 'Nesse valor fica fácil decidir.'],
      cupom: ['Com o cupom fica ainda melhor.', 'Usa o cupom e renova.', 'Cupom ativo, look novo.', 'Com o cupom, sobra pra outra peça.'],
    },
    subs: {
      corrida: {
        aberturas: [
          'Pra quem corre e sente que o tênis velho não aguenta mais.',
          'Treino pra prova pede par novo.',
          'Quem corre sabe quando o tênis pede aposentadoria.',
          'Quilometragem alta pede tênis novo.',
          'Pra encarar o longão de fim de semana.',
        ],
      },
      tenis: {
        aberturas: [
          'Pra aposentar aquele tênis que já tá pedindo arrego.',
          'Tênis coringa pra usar com tudo.',
          'Par novo muda o look da semana.',
          'Pra quem não resiste a um par novo.',
          'Quem curte tênis sabe quando é a hora de trocar.',
        ],
      },
      calcado: { aberturas: ['Pra renovar o calçado sem drama.', 'Calçado novo pra semana.', 'Pra renovar o que vai nos pés.', 'Par novo pra sair de casa com outro astral.'] },
      roupa: {
        aberturas: [
          'Daquelas peças que você acaba usando a semana inteira.',
          'Peça coringa pra montar look sem pensar muito.',
          'Guarda-roupa renovado sem complicação.',
          'Pra renovar o guarda-roupa aos poucos.',
          'Look do dia resolvido.',
        ],
      },
      geral: { aberturas: ['Pra renovar o guarda-roupa sem complicação.', 'Pra quem gosta de se vestir bem sem complicação.'] },
    },
  },
  bebe: {
    // Fechos do nicho servem pra qualquer item (carrinho, almofada, mamadeira); os de estoque ficam em fralda e lenço.
    fechos: {
      neutro: ['Fica a dica pra rotina.', 'Vale conferir.', 'Dá uma olhada com calma.', 'Manda pra quem tá montando o enxoval.', 'Bom de deixar anotado.'],
      queda: ['Baixou e ajuda a respirar no orçamento.', 'Esse valor tá bonito de ver.', 'Baixou e merece atenção.', 'Nesse valor compensa demais.'],
      cupom: ['Cupom ativo, orçamento mais leve.', 'Com o cupom, o mês respira.', 'Com o cupom fica ainda melhor.'],
    },
    subs: {
      lencos: {
        fechos: FECHOS_ESTOQUE_BEBE,
        aberturas: [
          'Lenço umedecido acaba antes do que a gente imagina.',
          'Bolsa do bebê sem lencinho não dá.',
          'Pra trocas, passeios e as sujeirinhas do dia.',
          'Quem tem pequeno em casa usa lencinho o dia inteiro.',
          'Lencinho é daqueles que nunca pode faltar na bolsa.',
        ],
      },
      fralda: {
        fechos: FECHOS_ESTOQUE_BEBE,
        aberturas: [
          'Fralda acaba numa velocidade absurda.',
          'Quem tem pequeno em casa sabe: fralda nunca é demais.',
          'Estoque de fralda é paz pra rotina.',
          'Troca de fralda não tem pausa.',
          'Pra não ser pego de surpresa com o pacote vazio.',
          'Quem é mãe ou pai sabe o ritmo das fraldas.',
        ],
      },
      geral: {
        aberturas: [
          'Pra facilitar a rotina de quem tá com pequeno em casa.',
          'Pra deixar o enxoval mais completo.',
          'Rotina com bebê pede praticidade.',
          'Pra facilitar a vida de quem cuida do pequeno.',
          'Enxoval completo é menos correria.',
          'Daqueles itens que fazem diferença no dia a dia com bebê.',
        ],
      },
    },
  },
  cuidado: {
    // Respeitoso e discreto: sem piada, sem expor quem usa, sem falar de bebê.
    fechos: {
      neutro: ['Vale conferir os tamanhos.', 'Fica a dica pra quem cuida.', 'Dá uma olhada com calma.', 'Bom de deixar anotado.'],
      queda: ['Nesse valor vale reforçar o estoque.', 'Baixou e merece atenção.', 'Nesse valor ajuda no orçamento do mês.', 'Esse valor tá bonito de ver.'],
      cupom: ['Com o cupom o estoque sai mais em conta.', 'Com o cupom, o orçamento do mês respira.', 'Usa o cupom e garante o mês.'],
    },
    subs: {
      geral: {
        aberturas: [
          'Pra quem cuida de alguém em casa.',
          'Cuidado diário pede estoque em dia.',
          'Pra rotina de cuidado seguir tranquila.',
          'Item de cuidado diário que não pode faltar.',
          'Pra não ser pego de surpresa com o pacote vazio.',
        ],
      },
    },
  },
  pet: {
    // Fechos do nicho servem pra qualquer item; os de estoque ficam em consumo (ração, areia, petisco).
    fechos: {
      neutro: ['Fica a dica pros tutores.', 'Vale conferir.', 'Dá uma olhada com calma.', 'Manda pros tutores do grupo.', 'Bom de deixar anotado.'],
      queda: ['Esse valor tá bonito de ver.', 'Baixou e merece atenção.', 'Nesse valor compensa demais.', 'Baixou e ficou interessante.'],
      cupom: ['Cupom ativo, pet feliz.', 'Com o cupom fica ainda melhor.', 'Com o cupom, sobra pro petisco.'],
    },
    subs: {
      consumo: {
        fechos: {
          queda: ['Nesse valor dá pra garantir o estoque com folga.', 'Baixou e vale reforçar o estoque.', 'Nesse valor vale encher o estoque.'],
          cupom: ['Com o cupom o estoque sai mais em conta.', 'Usa o cupom e garante o pote cheio.'],
        },
        aberturas: [
          'Pet não aceita atraso no pote.',
          'Pra manter o pote cheio sem correr pro mercado.',
          'Quem é tutor sabe: o pote não pode zerar.',
          'Tutor prevenido não fica sem estoque.',
          'Pote cheio, pet feliz.',
        ],
      },
      acessorio: {
        aberturas: [
          'Pro conforto de quem manda na casa de verdade.',
          'Mimo pro pet que manda na casa.',
          'Pra deixar o cantinho do pet mais gostoso.',
          'Seu pet merece o melhor, e você sabe disso.',
          'Pet feliz, casa em paz.',
        ],
      },
      higiene: {
        fechos: FECHOS_REPOSICAO,
        aberturas: [
          'Banho em casa com o pet cheiroso é outra alegria.',
          'Quem dá banho no pet em casa sabe o quanto isso ajuda.',
          'Pra manter o pelo macio e a casa cheirosa sem gastar todo mês no pet shop.',
          'Cuidado com o pet em casa sem estresse.',
          'Pra deixar a rotina de banho e tosa mais prática.',
        ],
      },
      geral: {
        aberturas: [
          'Seu pet merece o melhor, e você sabe disso.',
          'Pra deixar o pet bem cuidado sem correria.',
          'Pra quem vê o pet como parte da família.',
          'Tutor prevenido sempre fica de olho nesses achados.',
          'Mimo e cuidado pra quem espera você na porta todo dia.',
        ],
      },
    },
  },
  auto: {
    fechos: {
      neutro: ['Fica a dica pra turma da garagem.', 'Vale conferir os detalhes.', 'Dá uma olhada com calma.', 'Bom de deixar anotado.', 'Manda pro amigo que ama cuidar do carro.'],
      queda: ['Nesse valor compensa demais.', 'Baixou e ficou interessante.', 'Esse valor tá bonito de ver.', 'Nesse preço vale garantir pra garagem.', 'Baixou e merece atenção.'],
      cupom: ['Com o cupom fica ainda melhor.', 'Usa o cupom e equipa a garagem.', 'Cupom ativo deixa o upgrade mais leve.'],
    },
    subs: {
      moto: {
        aberturas: [
          'Quem roda de moto todo dia sabe o valor de um bom equipamento.',
          'Pra encarar o trânsito e a estrada com mais conforto na moto.',
          'Piloto prevenido não deixa o equipamento pra depois.',
          'Pra quem vive sobre duas rodas.',
          'Equipamento bom faz diferença em todo trajeto de moto.',
          'Pra deixar os rolês e o dia a dia de moto bem mais tranquilos.',
        ],
      },
      limpeza_auto: {
        fechos: FECHOS_REPOSICAO,
        aberturas: [
          'Sábado de manhã lavando o carro em casa tem seu charme.',
          'Pra deixar a pintura brilhando sem depender de lava-rápido.',
          'Quem curte estética automotiva não passa batido por esse.',
          'Carro limpo na garagem dá outro ânimo pra semana.',
          'Pra manter o carro com cara de novo por mais tempo.',
          'Kit de garagem que se paga em poucas lavagens.',
        ],
      },
      carro: {
        aberturas: [
          'Acessório daqueles que salvam na estrada e no trânsito.',
          'Pra deixar o carro organizado e pronto pra qualquer viagem.',
          'Quem dirige todo dia sabe como isso facilita a rotina.',
          'Pra não passar perrengue no meio do caminho.',
          'Upgrade simples que muda o conforto dentro do carro.',
          'Porta-malas e painel organizados sem esforço.',
        ],
      },
      geral: {
        aberturas: [
          'Achado prático pra quem cuida do carro ou da moto.',
          'Pra deixar a garagem bem equipada.',
          'Quem curte carro e moto vai gostar desse garimpo.',
          'Utilidade real pra quem pega trânsito todo dia.',
        ],
      },
    },
  },
  livros: {
    fechos: {
      neutro: ['Fica a dica pra lista de leitura.', 'Vale conferir a edição.', 'Dá uma olhada com calma.', 'Manda pra quem ama ler.', 'Bom de deixar salvo na lista de desejos.'],
      queda: ['Nesse valor sai fácil da lista de desejos.', 'Baixou e a estante agradece.', 'Esse valor tá bonito de ver.', 'Nesse preço vale puxar pra fila de leitura.', 'Baixou e merece espaço na estante.'],
      cupom: ['Com o cupom dá pra aumentar a estante gastando menos.', 'Usa o cupom e garante a próxima leitura.', 'Cupom ativo, leitor feliz.'],
    },
    subs: {
      manga: {
        aberturas: [
          'Coleção de mangá parada esperando o próximo volume?',
          'Pra quem coleciona HQs e mangás e cuida da estante.',
          'Mais um volume pra avançar a leitura sem buraco na coleção.',
          'Quem lê mangá sabe a alegria de ver a lombada alinhada na estante.',
          'Pra maratonar no fim de semana.',
          'A estante nerd agradece esse reforço.',
        ],
      },
      box: {
        aberturas: [
          'Box completo na estante é outro nível.',
          'Pra começar a saga já com todos os volumes à mão.',
          'Quem tava esperando o box baixar, olha isso aqui.',
          'Presentão pra qualquer leitor — inclusive pra você mesmo.',
          'Coleção fechadinha pra maratonar sem esperar entrega do próximo volume.',
        ],
      },
      negocios: {
        aberturas: [
          'Leitura prática pra aplicar no trabalho e nos projetos.',
          'Daqueles livros que a gente marca página inteira.',
          'Pra quem gosta de investir tempo em boas ideias.',
          'Ótima companhia pro café da manhã ou pro fim do dia.',
          'Clássico de cabeceira pra quem tá construindo projetos novos.',
        ],
      },
      infantil: {
        aberturas: [
          'Hora da leitura longe das telas com os pequenos.',
          'Ótima pedida pra história antes de dormir.',
          'Presente inteligente que as crianças aproveitam de verdade.',
          'Pra montar uma estante gostosa pros pequenos em casa.',
          'Incentivar a leitura desde cedo não tem erro.',
        ],
      },
      ficcao: {
        aberturas: [
          'Procurando a próxima leitura que prende até tarde?',
          'Aquele livro que todo leitor coloca na lista uma hora ou outra.',
          'Mais um pra pilha de leituras que a gente ama acumular.',
          'Pra desligar do celular e mergulhar numa boa história.',
          'Leitura de fim de semana garantida.',
          'Quem ama ficção vai reconhecer esse título de longe.',
        ],
      },
      geral: {
        aberturas: [
          'Boa pedida pra quem não vive sem um livro na bolsa.',
          'A estante sempre arruma espaço pra mais um.',
          'Achado pra quem tá atualizando a lista de leitura.',
          'Pra quem ama garimpar livros sem estourar o orçamento.',
        ],
      },
    },
  },
  papelaria: {
    fechos: {
      neutro: ['Fica a dica pra turma da papelaria.', 'Vale conferir.', 'Dá uma olhada com calma.', 'Manda pra quem ama papelaria.', 'Bom de deixar salvo.'],
      queda: ['Nesse valor compensa demais.', 'Baixou e a mesa agradece.', 'Esse valor tá bonito de ver.', 'Nesse preço vale montar o kit.', 'Baixou e merece atenção.'],
      cupom: ['Com o cupom fica bem mais leve montar o kit.', 'Usa o cupom e renova a mesa.', 'Cupom ativo, estojo feliz.'],
    },
    subs: {
      arte: {
        aberturas: [
          'Pra soltar a criatividade sem ficar improvisando material.',
          'Quem curte desenho, lettering ou artesanato vai adorar esse.',
          'Material caprichado muda o prazer de criar em casa.',
          'Pra tirar aquele projeto criativo do papel.',
          'Pra quem relaxa desenhando, pintando ou criando.',
          'Kit criativo daqueles que dão vontade de começar na hora.',
        ],
      },
      escritorio: {
        aberturas: [
          'Mesa arrumada muda o ritmo do home office inteiro.',
          'Pra acabar com a bagunça de papéis e fios na escrivaninha.',
          'Quem trabalha ou estuda em casa sabe o valor da organização.',
          'Pra deixar o cantinho de trabalho mais funcional.',
          'Organização prática que economiza tempo todo dia.',
          'Home office arrumadinho dá outro ânimo pra semana.',
        ],
      },
      estudo: {
        aberturas: [
          'Quem ama papelaria sabe a paz de um material novinho.',
          'Pra dar um gás na rotina de estudos e anotações.',
          'Estojo completo é metade da motivação pra estudar.',
          'Pra quem organiza a semana inteira no papel.',
          'Volta às aulas ou rotina de concurso pede material que aguenta o ritmo.',
          'Anotações organizadas facilitam demais na hora de revisar.',
        ],
      },
      geral: {
        aberturas: [
          'Achado pra quem não resiste a uma boa papelaria.',
          'Pra deixar estudos e projetos muito mais organizados.',
          'Detalhe prático pro dia a dia na mesa.',
          'Quem gosta de papelaria entende esse achado.',
        ],
      },
    },
  },
  mercado: {
    fechos: {
      neutro: ['Fica a dica pras compras do mês.', 'Vale conferir.', 'Dá uma olhada com calma.', 'Bom de deixar anotado.', 'Manda no grupo da família.'],
      queda: ['Nesse valor alivia bem a conta do mercado.', 'Baixou e vale abastecer a despensa.', 'Esse valor tá bonito de ver.', 'Nesse preço compensa fazer estoque.', 'Baixou e merece entrar no carrinho.'],
      cupom: ['Com o cupom a compra do mês sai mais leve.', 'Usa o cupom e abastece a despensa.', 'Cupom ativo no mercado é sempre bem-vindo.'],
    },
    subs: {
      cafe: {
        fechos: FECHOS_REPOSICAO,
        aberturas: [
          'Pra quem o dia só começa depois do primeiro café.',
          'Ficar sem café em casa no meio da semana ninguém merece.',
          'Cafezinho caprichado em casa sai bem melhor que na padaria.',
          'Quem ama café sabe a paz de ver a despensa cheia.',
          'Pra começar a manhã no capricho sem sair de casa.',
          'Pausa pro café no meio do trampo fica bem melhor com esse.',
        ],
      },
      bebidas: {
        aberturas: [
          'Pra deixar a geladeira pronta pro fim de semana.',
          'Bom pra receber os amigos sem pagar caro de última hora.',
          'Pra quem gosta de deixar reservado em casa com calma.',
          'Churrasco ou jantar em casa já fica bem encaminhado.',
          'Economia boa pra não comprar correndo na conveniência.',
        ],
      },
      doces: {
        aberturas: [
          'Aquele mimo gostoso pra ter guardado na despensa.',
          'Pra salvar a vontade de doce no meio da tarde.',
          'Ótimo pra dividir com a família ou dar de lembrancinha.',
          'Difícil abrir um desse e não acabar no mesmo dia.',
          'Sobremesa prática pra deixar o fim de semana mais gostoso.',
        ],
      },
      despensa: {
        fechos: FECHOS_REPOSICAO,
        aberturas: [
          'Economia real nas compras do mês sem enfrentar fila.',
          'Item básico da despensa que faz diferença no orçamento.',
          'Receber a compra do mercado em casa poupa tempo e dinheiro.',
          'Despensa abastecida sem precisar carregar sacola pesada.',
          'Pra aproveitar quando o item do dia a dia baixa de verdade.',
          'Quem faz compras do mês sabe o quanto isso ajuda no total.',
        ],
      },
      geral: {
        aberturas: [
          'Achado bom pra economizar no supermercado.',
          'Pra deixar a despensa em dia sem sair de casa.',
          'Economia prática que aparece no fim do mês.',
          'Boa pedida pra completar o carrinho do mercado.',
        ],
      },
    },
  },
  suplementos: {
    fechos: {
      neutro: ['Fica a dica pro pessoal do treino.', 'Vale conferir.', 'Dá uma olhada com calma.', 'Bom de deixar anotado.', 'Manda pro parceiro de treino.'],
      queda: ['Nesse valor dá pra fazer estoque.', 'Baixou e vale repor.', 'Esse valor tá bonito de ver.', 'Nesse valor vale reforçar o estoque.', 'Baixou e merece atenção.'],
      cupom: ['Com o cupom a reposição sai mais em conta.', 'Usa o cupom e garante o mês.', 'Cupom ativo, reposição mais leve.'],
    },
    subs: {
      geral: {
        aberturas: [
          'Pra não deixar o pote zerar no meio do ciclo.',
          'Reposição do mês resolvida pra quem treina.',
          'Quem treina sabe: pote vazio bagunça a rotina.',
          'Pote no fim é sinal de reposição.',
          'Pra rotina de treino seguir sem pausa.',
          'Quem treina todo dia não pode ficar sem.',
        ],
      },
    },
  },
  ferramentas: {
    fechos: {
      neutro: ['Fica a dica.', 'Vale conferir.', 'Dá uma olhada com calma.', 'Bom de deixar anotado.', 'Manda pro amigo do faça-você-mesmo.'],
      queda: ['Nesse valor compensa ter em casa.', 'Baixou e ficou interessante.', 'Esse valor tá bonito de ver.', 'Baixou e merece atenção.', 'Nesse valor vale ter na caixa.'],
      cupom: ['Com o cupom fica ainda melhor.', 'Usa o cupom e completa a caixa.', 'Cupom ativo, reparo mais em conta.'],
    },
    subs: {
      geral: {
        aberturas: [
          'Pra parar de pedir emprestado pro vizinho.',
          'Pra resolver os reparos de casa sem esperar ninguém.',
          'Caixa de ferramentas completa resolve a vida.',
          'Furo na parede sem chamar ninguém.',
          'Pra quem curte resolver as coisas de casa.',
          'Ferramenta boa é aquela que tá à mão quando precisa.',
        ],
      },
    },
  },
  geral: {
    fechos: {
      neutro: [
        'Vale conferir.',
        'Dá uma olhada com calma.',
        'Fica a dica.',
        'Vale abrir o link pra ver os detalhes.',
        'Bom de deixar anotado.',
        'Manda pra quem pode curtir.',
      ],
      queda: [
        'Nesse valor vale dar uma olhada.',
        'Esse valor tá bonito de ver.',
        'Baixou e merece atenção.',
        'Nesse preço compensa conferir.',
        'Queda boa pra quem tava esperando.',
        'Nesse valor fica bem mais interessante.',
      ],
      cupom: [
        'Com o cupom fica ainda melhor.',
        'Usa o cupom e aproveita.',
        'Com o cupom o valor final fica bem mais leve.',
        'Cupom ativo deixa o achado ainda melhor.',
      ],
    },
    subs: {
      geral: {
        aberturas: [
          'Achado que vale a olhada com calma.',
          'Garimpei esse aqui pra vocês.',
          'Achado do garimpo de hoje.',
          'Esse chamou atenção no radar agora.',
          'Olha o que apareceu na seleção de hoje.',
          'Pra quem tava esperando uma boa oportunidade.',
          'Mais um achado conferido entrando no grupo.',
          'Daqueles itens que valem um clique pra conferir.',
          'Garimpo selecionado direto da loja.',
          'Se tava na sua lista, dá uma conferida.',
        ],
      },
    },
  },
};

// Higiene pessoal (creme dental, escova, fio dental, enxaguante, desodorante, sabonete, barbear). Antes caía
// em "saúde" (nicho sensível, sem frase) e o post saía com frase genérica de garimpo. É item de reposição do
// banheiro: fala de reserva, de tubo acabando e da troca, nunca de resultado (clarear, proteger, durar 48h).
PERFIS.higiene = {
  rotulo: 'Higiene pessoal', publico: 'quem abastece o banheiro de casa',
  tom: 'prático e bem-humorado, de quem lembra da reposição antes de acabar',
  dores: ['tubo de pasta no osso', 'desodorante acabando no meio da semana', 'ir na farmácia só por um item'],
  vocabulario: ['banheiro', 'reserva', 'reposição', 'armário', 'tubo'],
  evitar: ['prometer clareamento, proteção, frescor por horas ou resultado', 'termo de dentista ou médico'],
};
BANCO.higiene = {
  bucal: {
    neutro: [
      'Pasta de dente sempre acaba no pior dia: bom ter uma de reserva no armário.',
      'Item de banheiro que ninguém lembra de comprar até o tubo ficar no osso.',
    ],
    queda: [
      'Nesse valor dá pra deixar umas de reserva no armário do banheiro.',
      'Tubo acabando? Nesse preço vale levar mais de um.',
    ],
    cupom: ['Com o cupom, dá pra garantir a reserva do banheiro.'],
  },
  escova_eletrica: {
    neutro: ['Escova elétrica faz o trabalho pesado, você só guia.'],
    queda: ['Escova elétrica nesse valor é a deixa pra largar a manual.'],
  },
  corpo: {
    neutro: ['Desses que somem do banheiro mais rápido do que deveriam.', 'Reposição do banheiro pra não ser pego de surpresa no banho.'],
    queda: ['Nesse valor vale abastecer o banheiro de uma vez.'],
  },
  barbear: {
    neutro: ['Pra quem faz a barba toda semana e vive comprando lâmina.'],
    queda: ['Nesse valor dá pra garantir lâmina por um bom tempo.'],
  },
  geral: {
    neutro: ['Reposição do banheiro sem precisar passar na farmácia.'],
    queda: ['Nesse valor vale abastecer o banheiro.'],
  },
};
COMBO.higiene = {
  fechos: {
    neutro: ['Bom de deixar na lista do mês.', 'Fica a dica pra próxima compra.', 'Dá uma olhada com calma.'],
    queda: FECHOS_REPOSICAO.queda.concat(['Nesse valor vale levar uns de reserva.']),
    cupom: FECHOS_REPOSICAO.cupom,
  },
  subs: {
    bucal: {
      aberturas: [
        'Tubo no osso é sinal de reposição.',
        'Daqueles itens que só lembra quando acaba.',
        'Reposição do banheiro sem ir na farmácia.',
        'Pra não ficar espremendo o tubo até o fim.',
        'Banheiro abastecido é um problema a menos.',
      ],
    },
    escova_eletrica: { aberturas: ['Escova elétrica faz o trabalho pesado.', 'Pra quem quer largar a escova manual de vez.'] },
    corpo: { aberturas: ['Daqueles que somem do banheiro rapidinho.', 'Reposição do banho sem susto.', 'Banheiro abastecido é um problema a menos.'] },
    barbear: { aberturas: ['Lâmina gasta só atrapalha a barba.', 'Pra quem faz a barba toda semana.'] },
    geral: { aberturas: ['Reposição do banheiro sem passar na farmácia.', 'Banheiro abastecido é um problema a menos.'] },
  },
};

// Banco ampliado (K-pop, perfumaria, livros, saúde, cuidado, suplementos, combos): lib/banco-extra.js.
aplicarBancoExtra(BANCO, COMBO);

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

// Queda verificada a partir daqui conta como "forte": o fecho pode falar do tamanho do desconto (sem número).
const PCT_QUEDA_FORTE = 35;

/** Intensidade da oportunidade: 'forte' (queda verificada >= 35%), 'normal' ou '' (neutro/cupom). */
function intensidadeOferta(oferta) {
  const o = oferta || {};
  if (contextoOferta(o) !== 'queda') return '';
  const econ = resumoEconomia(o, true);
  const pct = econ ? econ.pct : 0;
  return pct >= PCT_QUEDA_FORTE ? 'forte' : 'normal';
}

// Fechos para desconto grande e verificado: falam do tamanho da diferença sem citar número nem raridade.
const FECHOS_FORTE = [
  'Desconto gordo pra quem tava de olho.',
  'A diferença pro preço de antes é grande.',
  'Queda grande, dá pra sentir no bolso.',
  'Desconto dos grandes, vale a olhada.',
];

function preencher(frase, det) {
  const g = det.grupo;
  const bastao = g ? NOMES_LIGHTSTICK[g.id] || (/^bts_/.test(g.id) ? NOMES_LIGHTSTICK.bts : '') : '';
  if (/\{(?:grupo|fandom)\}/.test(frase) && !g) return '';
  if (/\{bastao\}/.test(frase) && !bastao) return '';
  return frase.replace(/\{grupo\}/g, g ? g.nome : '').replace(/\{fandom\}/g, g ? g.fandom : '').replace(/\{bastao\}/g, bastao);
}

/** Texto normalizado para comparar frases (sem acento, caixa e pontuação). */
function chaveTexto(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Duas primeiras palavras: evita vários posts seguidos começando igual ("Pra quem…"). */
function inicioTexto(s) {
  return chaveTexto(s).split(' ').slice(0, 2).join(' ');
}

/**
 * Classifica o estilo, tipo de abertura, argumento comercial e CTA de uma peça de copy
 * para registro na memória anti-repetição e diversificação real entre publicações consecutivas.
 */
function classificarMetadadosCopy(texto, estrutura, aberturaModelo, fechoModelo, ctx, det, oferta) {
  const t = String(texto || '');
  const ab = String(aberturaModelo || t);
  const fc = String(fechoModelo || t);
  const d = det || { nicho: 'geral', sub: 'geral' };
  const cat = String((oferta && oferta.categoria) || d.nicho || 'geral');
  const destino = String((oferta && oferta.destino_copy) || 'multicanal');

  let tipoAbertura = 'curadoria_garimpo';
  if (/^leitura:/i.test(ab)) tipoAbertura = 'leitura_produto';
  else if (/^tipo:/i.test(ab)) tipoAbertura = 'tipo_produto';
  else if (/^spec:/i.test(ab)) tipoAbertura = 'especificacao_tecnica';
  else if (/\{(?:grupo|fandom|bastao)\}|\bfandom\b|\bcole[cç][aã]o\b|\bestante\b/i.test(ab)) tipoAbertura = 'colecao_fandom';
  else if (/\bpra\s+quem\b|\bquem\s+(?:tem|corre|treina|joga|dirige|pilota|ama|curte|cuida|vive|trabalha|estuda)\b/i.test(ab)) tipoAbertura = 'identificacao_publico';
  else if (/\bacaba\s+r[aá]pido\b|\bpote\b|\bestoque\b|\breposi[cç][aã]o\b|\brotina\b|\bdespensa\b/i.test(ab)) tipoAbertura = 'reposicao_rotina';
  else if (/\bupgrade\b|\bsetup\b|\btrocar\b|\baposentar\b|\bnovo\b|\bgerac[aã]o\b/i.test(ab)) tipoAbertura = 'upgrade_desejo';
  else if (/\bcansa\b|\bperrengue\b|\bdrift\b|\btravando\b|\barrastando\b|\bcalor[aã]o\b|\bbagun[cç]a\b/i.test(ab)) tipoAbertura = 'dor_cotidiana';

  let estilo = 'consultivo';
  if (tipoAbertura === 'especificacao_tecnica' || d.nicho === 'hardware') estilo = 'tecnico';
  else if (tipoAbertura === 'colecao_fandom' || d.nicho === 'kpop') estilo = 'especializado';
  else if (d.nicho === 'perfumes' && (d.sub === 'nicho' || d.sub === 'arabe')) estilo = 'premium';
  else if (ctx === 'cupom' || /\bcupom\b/i.test(t)) estilo = 'oportunidade';
  else if (tipoAbertura === 'reposicao_rotina' || /\bor[cç]amento\b|\bestoque\b|\bmercado\b/i.test(t)) estilo = 'economico';
  else if (tipoAbertura === 'dor_cotidiana') estilo = 'informal';
  else if (tipoAbertura === 'upgrade_desejo') estilo = 'entusiasmado';
  else if (/\bmanda\s+pr[oa]\b|\bgalera\b|\bparceiro\b|\bgrupinho\b/i.test(t)) estilo = 'descontraido';
  else if (estrutura === 'frase_unica' && t.length <= 68) estilo = 'direto';
  else if (/\bnotas\b|\bedi[cç][aã]o\b|\bconfigura[cç][aã]o\b|\btamanhos\b/i.test(t)) estilo = 'informativo';

  let argumento = 'custo_beneficio_nicho';
  if (ctx === 'cupom' || /\bcupom\b/i.test(t)) argumento = 'cupom_ativo';
  else if (ctx === 'queda' || /\bbaixou\b|\bnesse\s+(?:valor|pre[cç]o)\b/i.test(t)) argumento = 'queda_verificada';
  else if (tipoAbertura === 'especificacao_tecnica') argumento = 'especificacao_destaque';
  else if (tipoAbertura === 'leitura_produto') argumento = 'atributo_produto';
  else if (tipoAbertura === 'reposicao_rotina') argumento = 'estoque_inteligente';
  else if (tipoAbertura === 'dor_cotidiana' || tipoAbertura === 'upgrade_desejo') argumento = 'praticidade_rotina';

  let cta = 'conferir_detalhes';
  if (/\bcupom\b/i.test(fc)) cta = 'aplicar_cupom';
  else if (/\bestoque\b|\brepor\b|\breposi[cç][aã]o\b|\bdespensa\b/i.test(fc)) cta = 'reforcar_estoque';
  else if (/\blista\s+de\s+desejos\b|\bsalva\b|\banotado\b|\bradar\b/i.test(fc)) cta = 'salvar_wishlist';
  else if (/\bmanda\s+pr[oa]\b|\bcompartilha\b/i.test(fc)) cta = 'compartilhar_turma';
  else if (ctx === 'queda' || /\bbaixou\b|\bnesse\s+(?:valor|pre[cç]o)\b/i.test(fc)) cta = 'aproveitar_queda';

  return {
    estrutura,
    estilo,
    tipo_abertura: tipoAbertura,
    argumento,
    cta,
    categoria: cat,
    destino,
  };
}

/**
 * Todas as frases possíveis e válidas para o produto no contexto atual: frases únicas do banco
 * (+ frases de especificação) e combinações abertura + fecho. Cada uma traz as chaves usadas para
 * medir repetição: f: frase inteira, a: abertura, z: fecho, i: início, e: estilo, g: tipo_abertura.
 * @returns {Array<{texto:string, chaves:string[], estrutura:string, estilo:string, tipo_abertura:string, argumento:string, cta:string, categoria:string, destino:string}>}
 */
function candidatasCopy(oferta, det) {
  const d = det || detectarNicho(oferta);
  if (d.semCopy || d.perfil.semCopy) return [];
  const o = oferta || {};
  const ctx = contextoOferta(o);
  const out = [];
  const vistos = new Set();
  // Chaves de repetição usam o MODELO da peça (antes de preencher grupo/fandom): "Alô, ARMY!" e
  // "Alô, STAY!" contam como a mesma abertura. pessoal = cita grupo, fandom, lightstick ou a spec do título.
  const forte = intensidadeOferta(o) === 'forte';
  const add = (texto, extras, inicioModelo, pessoal, estrutura, fechoModelo, bonus) => {
    const v = validarCopy(texto, o);
    if (!v.ok) return;
    const k = chaveTexto(v.texto);
    if (vistos.has(k)) return;
    vistos.add(k);
    const est = estrutura || 'frase_unica';
    const meta = classificarMetadadosCopy(v.texto, est, inicioModelo, fechoModelo, ctx, d, o);
    // s: estrutura (frase única x abertura+fecho) e y: começo do fecho ("Baixou e…") também entram na
    // memória: sem isso, 3 posts seguidos saíam "… Baixou e ficou interessante / merece atenção / …".
    // Leitura do produto cita um fato daquele item: o texto já muda de produto pra produto, então não
    // entra na memória de estrutura/estilo (só na de modelo, abertura e fecho).
    const leitura = est === 'leitura_produto' || est === 'tipo_produto';
    const chaves = ['f:' + k, 'i:' + inicioTexto(inicioModelo)]
      .concat(leitura ? [] : ['s:' + est])
      .concat((est === 'combo_abertura_fecho' || leitura) && fechoModelo && fechoModelo !== inicioModelo ? ['y:' + inicioTexto(fechoModelo)] : [])
      .concat(extras || [])
      .concat(leitura ? [] : ['e:' + meta.estilo, 'g:' + meta.tipo_abertura, 'r:' + meta.argumento, 'c:' + meta.cta])
      // w: palavras fortes da frase ("borrada", "mapa"): o mesmo tema não volta em posts seguidos com outra frase.
      .concat([...palavrasFortes(v.texto)].slice(0, 12).map((w) => 'w:' + w));
    out.push(Object.assign({ texto: v.texto, chaves, pessoal: !!pessoal, bonus: bonus || 0 }, meta));
  };
  const RE_PESSOAL = /\{(?:grupo|fandom|bastao)\}/;
  const usaSpec = d.specs && d.specs.length && (d.nicho === 'hardware' || d.nicho === 'tech');

  // De onde vem a frase (em ordem de preferência):
  //   1. fatos do produto (título + página da loja, lib/leitura.js);
  //   2. TIPO de produto (lib/tipos-produto.js: várias aberturas por tipo + fecho de preço do contexto);
  //   3. especificação técnica do título (Hz, NVMe, OLED…);
  //   4. banco do nicho, só nos nichos curados à mão (K-pop, perfumaria, livros e os sensíveis);
  //   5. fora disso, frase de PREÇO (FRASES_PRECO), nunca frase genérica de nicho.
  const curado = NICHOS_BANCO_CURADO.has(d.nicho);
  const tipo = NICHOS_SEM_TIPO.has(d.nicho) ? null : tipoProduto(o.titulo);
  const ctxPreco = ctx === 'cupom' ? 'cupom' : ctx === 'queda' ? (forte ? 'forte' : 'queda') : '';
  const fechosPreco = FECHOS_PRECO[ctxPreco || 'neutro']
    .map((f) => ({ txt: f, modelo: 'preco:' + f, forte: ctxPreco === 'forte' }));
  const combinar = (a, f, extras, est, bonus) => {
    // "…no próximo show. Nesse valor já fica separado pro próximo show." soa repetido: descarta.
    const pa = palavrasFortes(a.txt);
    if ([...palavrasFortes(f.txt)].some((w) => pa.has(w))) return;
    add(`${a.txt} ${f.txt}`, extras.concat(['z:' + chaveTexto(f.modelo)]), a.modelo, a.pessoal, est, f.modelo, bonus + (f.forte ? BONUS_FORTE : 0));
  };

  if (usaSpec) {
    for (const s of d.specs) {
      FRASES_SPEC[s.k].unicas[ctx === 'neutro' ? 'neutro' : 'queda'].forEach((fn, i) => {
        const id = `spec:${s.k}:u${i}`;
        add(fn(s.v), ['t:' + id], id, true, 'spec_tecnica', id);
      });
    }
  }
  const specAberturas = [];
  if (usaSpec) {
    for (const s of d.specs) FRASES_SPEC[s.k].aberturas.forEach((fn, i) => specAberturas.push({ txt: fn(s.v), modelo: `spec:${s.k}:a${i}`, pessoal: true }));
  }

  // Banco do nicho (só nos curados): frases únicas do contexto + abertura do nicho com fecho do nicho.
  const aberturas = [];
  let fechos = fechosPreco;
  if (curado) {
    const doNicho = BANCO[d.nicho] || BANCO.geral;
    const bloco = doNicho[d.sub] || doNicho.geral || BANCO.geral.geral;
    const daVez = ctx === 'cupom' ? (bloco.cupom || bloco.queda) : ctx === 'queda' ? bloco.queda : null;
    for (const f of (daVez || []).concat(bloco.neutro)) {
      const t = preencher(f, d);
      if (t) add(t, ['t:' + chaveTexto(f)], f, RE_PESSOAL.test(f), 'frase_unica', f);
    }
    const cn = COMBO[d.nicho] || COMBO.geral;
    const sub = cn.subs[d.sub] || cn.subs.geral || COMBO.geral.subs.geral;
    for (const a of sub.aberturas) aberturas.push({ txt: preencher(a, d), modelo: a, pessoal: RE_PESSOAL.test(a) });
    const doCtx = (lst) => (lst ? lst[ctx] || (ctx === 'cupom' ? lst.queda : null) || [] : []);
    fechos = doCtx(sub.fechos).concat(doCtx(cn.fechos)).map((f) => ({ txt: preencher(f, d), modelo: f })).filter((f) => f.txt);
    // Desconto grande e verificado: fechos que falam do tamanho da diferença ganham preferência.
    if (forte) FECHOS_FORTE.forEach((f) => fechos.push({ txt: f, modelo: f, forte: true }));
  }
  for (const a of specAberturas.concat(aberturas).filter((x) => x.txt)) {
    for (const f of fechos) combinar(a, f, ['a:' + chaveTexto(a.modelo)], 'combo_abertura_fecho', 0);
  }

  // Perfume conhecido pelo nome: proposta/ocasião pela qual ele é famoso (lib/banco-extra.js).
  if (d.nicho === 'perfumes') {
    for (const fp of frasesPerfumeConhecido(o.titulo, ctx)) add(fp.texto, ['t:' + fp.modelo], fp.modelo, true, 'leitura_produto', fp.modelo, BONUS_LEITURA);
  }

  // Tipo de produto: cada abertura sozinha e com cada fecho de preço do contexto.
  const tipoAb = tipo ? tipo.frases.map((txt, i) => ({ txt, modelo: `tipo:${tipo.id}:${i}`, pessoal: true })) : [];
  // Combinações dor/uso + conclusão (lib/tipos-produto-extra.js): 100+ frases por tipo, específicas do produto.
  if (tipo) {
    for (const fc of frasesCombinadasTipo(tipo.id, ctxPreco ? FECHOS_PRECO[ctxPreco] : [])) {
      add(fc.texto, ['t:' + fc.modelo, 'z:' + fc.conclusao].concat(fc.preco ? ['y:' + fc.preco] : []), fc.modelo, true, 'tipo_produto', fc.conclusao, BONUS_TIPO - (fc.preco ? 0.15 : 0));
    }
  }
  for (const a of tipoAb) {
    add(a.txt, ['t:' + a.modelo], a.modelo, true, 'tipo_produto', a.modelo, BONUS_TIPO);
    for (const f of fechosPreco) combinar(a, f, ['t:' + a.modelo], 'tipo_produto', BONUS_TIPO - 0.2);
  }

  // Leitura do produto (lib/leitura.js): frases que citam um fato do título ("4L dá conta da janta…",
  // "Com 256GB dá pra parar de apagar foto…") soam como quem abriu o anúncio, não como frase de nicho.
  // Têm preferência sobre o banco; a memória (t:) faz o mesmo modelo não sair em dois produtos seguidos.
  // Título + destaques/ficha técnica da página da loja (links_manuais.destaques / .ficha).
  const mPag = lerManuaisObj(o);
  const fatos = lerProduto(o.titulo, d, { destaques: mPag.destaques, ficha: mPag.ficha });
  const notas = [];
  fatos.forEach((fato) => fato.frases.forEach((frase, i) => {
    const id = `leitura:${fato.k}:${i}`;
    if (fato.nota) { notas.push({ txt: frase, modelo: id }); return; }
    add(frase, ['t:' + id], id, true, 'leitura_produto', id, BONUS_LEITURA);
    for (const f of fechos) combinar({ txt: frase, modelo: id, pessoal: true }, f, ['t:' + id], 'leitura_produto', BONUS_LEITURA - 0.4);
  }));
  // Notas honestas ("essa versão é 127V") entram como 2ª frase depois de um fato, de uma abertura do tipo
  // ou (nichos curados) de uma abertura do nicho.
  for (const n of notas) {
    const antes = fatos.filter((f) => !f.nota).flatMap((f) => f.frases.map((txt, i) => ({ txt, modelo: `leitura:${f.k}:${i}`, fato: true })))
      .concat(tipoAb, aberturas.filter((x) => x.txt));
    for (const a of antes) {
      add(`${a.txt} ${n.txt}`, ['t:' + n.modelo, 'a:' + chaveTexto(a.modelo)], a.modelo, true, 'leitura_produto', n.modelo, BONUS_LEITURA + (a.fato ? 1.0 : 0.6));
    }
  }

  // Fora da base (sem fato, sem tipo, sem spec, nicho não curado): fala da oferta, não do produto.
  if (!out.length && !curado) {
    const k = ctxPreco || 'neutro';
    const abPreco = FRASES_PRECO[k].map((f, i) => ({ txt: f, modelo: `preco:${k}:${i}`, pessoal: false }));
    abPreco.forEach((a) => add(a.txt, ['t:' + a.modelo], a.modelo, false, 'preco', a.modelo));
    // Sem queda, a frase de preço já é o convite; com queda/cupom, ganha um fecho neutro pra variar.
    if (k === 'neutro') {
      const neutros = FECHOS_PRECO.neutro.map((f) => ({ txt: f, modelo: 'preco:' + f }));
      ABERTURAS_GARIMPO.forEach((g, i) => { for (const f of neutros) combinar({ txt: g, modelo: `garimpo:${i}`, pessoal: false }, f, ['t:garimpo:' + i], 'preco', 0); });
    }
    if (k !== 'neutro') {
      // garimpo + preço: "Esse apareceu no garimpo agora. Tá abaixo do preço de antes."
      ABERTURAS_GARIMPO.forEach((g, i) => { for (const f of fechosPreco) combinar({ txt: g, modelo: `garimpo:${i}`, pessoal: false }, f, ['t:garimpo:' + i], 'preco', 0); });
      const neutros = FECHOS_PRECO.neutro.map((f) => ({ txt: f, modelo: 'preco:' + f }));
      for (const a of abPreco) for (const f of neutros) combinar(a, f, ['t:' + a.modelo], 'preco', 0);
    }
  }
  return out;
}

const PALAVRAS_FRACAS = new Set(['pra', 'pro', 'quem', 'esse', 'essa', 'isso', 'aqui', 'nesse', 'neste', 'mais', 'muito', 'mesmo', 'sem', 'com', 'que', 'tem', 'todo', 'toda', 'sabe', 'fica', 'olha', 'bora', 'daqueles', 'daquelas', 'aquele', 'aquela']);

/** Palavras com conteúdo (4+ letras, sem as de ligação) para evitar repetição dentro da mesma frase. */
function palavrasFortes(txt) {
  return new Set(chaveTexto(txt).split(' ').filter((w) => w.length >= 4 && !PALAVRAS_FRACAS.has(w)));
}

// Peso de cada repetição recente: frase inteira e frase única (mesmo modelo) pesam muito; abertura e
// início pesam médio; fecho, estilo, tipo de abertura, argumento e CTA pesam leve para diversificar estrutura.
// y (começo do fecho) pesa quase como abertura; s (estrutura) evita sequência de posts com o mesmo formato.
const PESO_CHAVE = { f: 100, t: 40, a: 12, y: 8, i: 6, z: 3, s: 2.5, g: 2, e: 1.5, w: 1.2, r: 1, c: 1 };
// Preferência por frases que falam com a turma (grupo/fandom/lightstick) ou com a spec do título.
const BONUS_PESSOAL = 0.6;
// Preferência pelos fechos de desconto grande quando a queda verificada é forte.
const BONUS_FORTE = 0.5;
// Preferência pelas frases que leem um fato concreto do produto (lib/leitura.js).
const BONUS_LEITURA = 1.5;
// Frases da base por tipo de produto (lib/tipos-produto.js).
const BONUS_TIPO = 0.6;
// Nichos em que o banco foi escrito à mão pra turma (fandom, perfumaria, leitura) ou por conformidade
// (sensíveis): esses continuam usando o banco do nicho. Os demais usam tipo de produto ou preço.
const NICHOS_BANCO_CURADO = new Set(['kpop', 'perfumes', 'livros', 'cuidado', 'saude', 'suplementos', 'combo']);
// Nesses o tipo de produto não entra (a identidade da frase vem do fandom, da perfumaria ou do conjunto).
const NICHOS_SEM_TIPO = new Set(['kpop', 'perfumes', 'livros', 'combo']);

/**
 * Escolhe a frase menos repetida em relação ao uso recente (Map chave → vezes), preferindo as que citam a
 * turma quando há empate de repetição. Empate: ordem determinística por produto (o mesmo produto, com o
 * mesmo histórico, sempre recebe a mesma frase).
 */
function escolherCopy(oferta, uso, det) {
  const cands = candidatasCopy(oferta, det);
  if (!cands.length) return null;
  const o = oferta || {};
  const semente = String(o.produto_id || o.oferta_id || o.titulo || 'x');
  const u = uso || new Map();
  let melhor = null;
  let melhorNota = Infinity;
  for (const c of cands) {
    let nota = indiceDeterministico(semente + '|' + c.texto, 100000) / 100000 - (c.pessoal ? BONUS_PESSOAL : 0) - (c.bonus || 0);
    for (const k of c.chaves) nota += (u.get(k) || 0) * (PESO_CHAVE[k[0]] || 1);
    if (nota < melhorNota) { melhorNota = nota; melhor = c; }
  }
  return melhor;
}

/**
 * Frase do banco para o nicho do produto, sem histórico (determinística por produto). '' quando o nicho
 * não leva copy. Com histórico, use atribuirCopyTom (radar e roteador fazem isso antes de publicar).
 */
function fraseNicho(oferta, det) {
  const e = escolherCopy(oferta, null, det);
  return e ? e.texto : '';
}

function registrarUso(uso, chaves) {
  for (const k of chaves || []) uso.set(k, (uso.get(k) || 0) + 1);
}

/** Uso recente de aberturas/fechos/frases a partir das linhas da bfx_ofertas (mais novas primeiro). */
function usoRecenteDe(rows, max) {
  const uso = new Map();
  const ord = (rows || []).filter((r) => r && r.links_manuais)
    .slice().sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0))
    .slice(0, max || 120);
  for (const r of ord) {
    const m = lerManuaisObj(r);
    if (m.copy_tom && Array.isArray(m.copy_tom.chaves)) registrarUso(uso, m.copy_tom.chaves);
    if (m.copy_ia && m.copy_ia.texto) {
      registrarUso(uso, ['f:' + chaveTexto(m.copy_ia.texto), 'i:' + inicioTexto(m.copy_ia.texto)]
        .concat(m.copy_ia.angulo ? ['n:' + m.copy_ia.angulo] : []));
    }
  }
  return uso;
}

function comManuais(oferta, m) {
  return Object.assign({}, oferta, { links_manuais: typeof oferta.links_manuais === 'string' ? JSON.stringify(m) : m });
}

/**
 * Fixa a frase do banco na oferta (links_manuais.copy_tom), escolhida contra o uso recente, e soma a
 * escolha ao uso (para o próximo item do mesmo lote não repetir). Mantém a frase se já existir.
 */
function atribuirCopyTom(oferta, uso) {
  if (!oferta || typeof oferta !== 'object') return oferta;
  const u = uso || new Map();
  const m = lerManuaisObj(oferta);
  if (m.eh_cupom_loja) return oferta;
  if (m.copy_tom && m.copy_tom.texto) {
    registrarUso(u, m.copy_tom.chaves);
    return oferta;
  }
  const e = escolherCopy(oferta, u);
  if (!e) return oferta;
  registrarUso(u, e.chaves);
  const dataUso = oferta.data
    || (Number.isFinite(Number(oferta.ts)) && Number(oferta.ts) > 0 ? new Date(Number(oferta.ts)).toISOString() : new Date().toISOString());
  return comManuais(oferta, Object.assign({}, m, {
    copy_tom: {
      id_variacao: (e.chaves && e.chaves[0]) || '',
      texto: e.texto,
      chaves: e.chaves,
      estrutura: e.estrutura || 'frase_unica',
      estilo: e.estilo || 'consultivo',
      tipo_abertura: e.tipo_abertura || 'curadoria_garimpo',
      argumento: e.argumento || 'custo_beneficio_nicho',
      cta: e.cta || 'conferir_detalhes',
      categoria: e.categoria || String(oferta.categoria || 'geral'),
      destino: e.destino || 'multicanal',
      data_utilizacao: dataUso,
    },
  }));
}

/** Roteador (01): fixa a frase na entrada { oferta, ... } considerando as ofertas recentes. */
function atribuirCopyEntrada(entrada, recentes) {
  if (!entrada || !entrada.oferta) return entrada;
  return Object.assign({}, entrada, { oferta: atribuirCopyTom(entrada.oferta, usoRecenteDe(recentes)) });
}

/**
 * Radar (04): fixa frases diferentes para todas as ofertas do lote (planos automáticos primeiro, depois as
 * linhas novas da bfx_ofertas, que recebem a mesma frase do plano correspondente).
 */
function atribuirCopyRadar(fin, recentes) {
  if (!fin || typeof fin !== 'object') return fin;
  const uso = usoRecenteDe(recentes);
  const porId = {};
  const planos = (fin.autoPlanos || []).map((p) => {
    if (!p || !p.oferta) return p;
    const of = atribuirCopyTom(p.oferta, uso);
    if (of.oferta_id) porId[of.oferta_id] = lerManuaisObj(of).copy_tom;
    return Object.assign({}, p, { oferta: of });
  });
  const novas = (fin.ofertasNovas || []).map((l) => {
    if (!l || typeof l !== 'object') return l;
    const ct = porId[l.oferta_id];
    const m = lerManuaisObj(l);
    if (ct && !m.copy_tom) return comManuais(l, Object.assign({}, m, { copy_tom: ct }));
    return atribuirCopyTom(l, uso);
  });
  return Object.assign({}, fin, { autoPlanos: planos, ofertasNovas: novas });
}

/** Frases que já saíram recentemente no mesmo nicho (para a IA não repetir). Mais novas primeiro. */
function frasesRecentes(rows, oferta, max) {
  const nicho = detectarNicho(oferta).nicho;
  const out = [];
  const ord = (rows || []).filter((r) => r && r.links_manuais).slice().sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
  for (const r of ord) {
    if (out.length >= (max || 8)) break;
    if (detectarNicho(r).nicho !== nicho) continue;
    const m = lerManuaisObj(r);
    const t = (m.copy_ia && m.copy_ia.texto) || (m.copy_tom && m.copy_tom.texto) || '';
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
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
// branque/clare: promessa de clareamento (creme dental, skincare) não é verificável.
const RADICAIS_PROIBIDOS_COPY = ['raridade', 'emagre', 'rejuvenesc', 'anti-?idade', 'milagr', 'cl[ií]nicamente', 'comprovad', 'm[eé]dic', 'branque', 'clarea', 'dentist'];
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
  // Número só se estiver no título ou nos destaques/ficha técnica lidos da página da loja.
  const mVal = lerManuaisObj(oferta);
  const tit = `${String((oferta && oferta.titulo) || '')} ${textoDetalhes(mVal.destaques, mVal.ficha)}`;
  const nums = s.replace(RE_NUMERO_REFERENCIA, '').match(/\d+/g) || [];
  if (nums.some((n) => !tit.includes(n))) return { ok: false, motivo: 'número que não está no título' };
  const letras = s.replace(/[^\p{L}]/gu, '');
  const maiusc = s.replace(/[^\p{Lu}]/gu, '');
  if (letras.length >= 10 && maiusc.length / letras.length > 0.4) return { ok: false, motivo: 'caixa alta' };
  if ((s.match(/!/g) || []).length > 1) return { ok: false, motivo: 'exclamação demais' };
  if (RE_PROIBIDO_COPY.test(s)) return { ok: false, motivo: 'termo proibido (urgência, promessa ou afirmação não verificada)' };
  if (contextoOferta(oferta) === 'neutro' && RE_ELOGIO_PRECO.test(s)) return { ok: false, motivo: 'elogia o preço sem comparação verificada' };
  if (RE_BLIND_SEM_MEDO.test(s)) return { ok: false, motivo: 'garante acerto em item de gosto pessoal' };
  if (RE_JARGAO.test(s)) return { ok: false, motivo: 'jargão ou estrangeirismo que o público geral não conhece' };
  if (oferta && detectarNicho(oferta).nicho === 'perfumes' && RE_PERFORMANCE_PERFUME.test(s)) {
    return { ok: false, motivo: 'promete performance ou incentiva compra às cegas (perfumaria)' };
  }
  if (!/[.!?…]$/.test(s)) s += '.';
  return { ok: true, texto: s };
}

// Jargão de nicho e estrangeirismo que afasta o público geral (vale pra banco, IA e copy já salva nas
// ofertas: linhaCopy revalida e cai numa frase nova). Termos de fandom do K-pop (lightstick, photocard,
// comeback) ficam de fora: o canal de K-pop fala com fã.
// "upgrade", "skincare", "make" e "nécessaire" o público conhece e ficam liberados.
const RE_JARGAO = /(?:^|[^\p{L}])(?:wishlist|backlog|setup|drift|gameplay|loading|lag|call|calls|boot|bootando|unboxing|vibe|blind\s*buy|hype|must[- ]?have|game\s*changer|crush|feedback|budget|deal|sale)(?![\p{L}])/iu;

// Vícios de texto de IA/vitrine que denunciam frase gerada e não soam como gente do grupo (só na IA:
// o banco é curado à mão).
const RE_CLICHE_IA = /(?:^|[^\p{L}])(?:eleve|descubra|transforme|experi[eê]ncia\s+(?:incr[ií]vel|[uú]nica|completa)|perfeit[oa]\s+para|ideal\s+para|n[aã]o\s+[eé]\s+[aà]\s+toa|seu\s+novo\s+melhor\s+amigo|aliad[oa]\s+perfeit[oa]|garanta\s+(?:o|a|j[aá])|vem\s+conferir|confira|n[ií]vel\s+(?:superior|acima)|sem\s+abrir\s+m[aã]o|melhor\s+dos\s+dois\s+mundos|(?:conforto|qualidade|estilo|praticidade)\s+e\s+(?:conforto|qualidade|estilo|praticidade)|n[aã]o\s+pode\s+faltar|indispens[aá]vel|revolucion\p{L}*|incr[ií]vel|sensacional|espetacular|surpreendente|simplesmente|que\s+tal|prepare-se|chegou\s+a\s+hora|n[aã]o\s+deixe\s+de)(?![\p{L}])/iu;

/** true quando a frase tem clichê de texto gerado ("descubra", "perfeito para", "conforto e estilo"…). */
function temClicheIA(texto) {
  return RE_CLICHE_IA.test(String(texto || ''));
}

/** Semelhança 0..1 entre duas frases (Jaccard das palavras com conteúdo). */
function semelhancaCopy(a, b) {
  const pa = palavrasFortes(a);
  const pb = palavrasFortes(b);
  if (!pa.size || !pb.size) return 0;
  let inter = 0;
  for (const w of pa) if (pb.has(w)) inter += 1;
  return inter / (pa.size + pb.size - inter);
}

/** true quando a frase repete o começo ou boa parte das palavras de alguma frase recente. */
function parecidaComRecentes(texto, recentes, limite) {
  const ini = inicioTexto(texto);
  const lim = limite || 0.45;
  return (recentes || []).some((r) => r && (inicioTexto(r) === ini || semelhancaCopy(texto, r) >= lim));
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
  if (det.semCopy || det.perfil.semCopy) return '';
  // Ordem: frase da IA aprovada → frase do banco fixada na oferta (escolhida contra repetição) → banco.
  // Cada uma é validada de novo no contexto atual (preço mudou? a frase de "nesse valor" cai).
  let txt = '';
  for (const salva of [m.copy_ia, m.copy_tom]) {
    if (txt || !salva || typeof salva !== 'object' || !salva.texto) continue;
    const v = validarCopy(salva.texto, oferta);
    if (v.ok) txt = v.texto;
  }
  if (!txt) txt = fraseNicho(oferta, det);
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
  COMBO_COPY: COMBO,
  GRUPOS_KPOP,
  NOMES_LIGHTSTICK,
  detectarNicho,
  contextoOferta,
  intensidadeOferta,
  temClicheIA,
  semelhancaCopy,
  parecidaComRecentes,
  preencherFrase: preencher,
  lerManuaisCopy: lerManuaisObj,
  classificarMetadadosCopy,
  candidatasCopy,
  escolherCopy,
  fraseNicho,
  usoRecenteDe,
  atribuirCopyTom,
  atribuirCopyEntrada,
  atribuirCopyRadar,
  frasesRecentes,
  validarCopy,
  linhaCopy,
  resumoCopy,
};
