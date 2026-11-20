'use strict';
// Base de frases por TIPO de produto (todos os canais).
//
// Cada tipo tem várias aberturas escritas pra aquele produto (fala da situação real de quem compra: o
// tubo no osso, o controle com drift, o pote vazio do pet). lib/tom.js combina cada abertura com um
// fecho de preço do contexto (queda verificada, desconto forte, cupom) e a memória anti-repetição gira
// entre elas, então cada tipo rende dezenas de frases antes de repetir.
//
// Produto que não bate em nenhum tipo (nem tem fato lido do título/página) recebe frase de PREÇO
// (FRASES_PRECO), não frase genérica de nicho.
//
// Regras das frases (validarCopy barra o resto): sem número, sem preço, sem urgência/escassez, sem
// promessa de resultado (saúde, clareamento, durabilidade), sem "original/oficial/garantia/frete/brinde".
//
// Ordem importa: o primeiro tipo que bate vence (específico antes do genérico). Puro e sem I/O.

/** Regex de palavra inteira que funciona com acento ("óculos", "ração"). */
function R(alts, nao) {
  return { re: new RegExp(`(?:^|[^\\p{L}])(?:${alts})(?![\\p{L}])`, 'iu'), nao: nao ? new RegExp(`(?:^|[^\\p{L}])(?:${nao})(?![\\p{L}])`, 'iu') : null };
}

const T = (id, alts, frases, nao) => Object.assign({ id, frases }, R(alts, nao));

const TIPOS = [
  /* ---------------- higiene ---------------- */
  T('escova_eletrica', 'escova\\s+(?:de\\s+dentes?\\s+|dental\\s+)?el[eé]trica|oral-?b\\s+(?:pro|vitality|io)', [
    'Escova elétrica faz o trabalho pesado, você só guia.',
    'Pra largar a escova manual de vez.',
    'Upgrade de banheiro que você usa duas vezes por dia.',
    'Quem testa uma dessas não volta pra manual.',
  ]),
  T('creme_dental', 'pastas?\\s+de\\s+dentes?|cremes?\\s+dent(?:al|ais)|gel\\s+dental', [
    'Pasta de dente sempre acaba no pior dia: bom ter uma de reserva.',
    'Item de banheiro que ninguém lembra até o tubo ficar no osso.',
    'Reposição do banheiro sem passar na farmácia.',
    'Pra não ficar espremendo o tubo até o fim.',
    'Banheiro abastecido é um problema a menos na semana.',
    'Da lista de compras que todo mundo esquece até faltar.',
  ]),
  T('escova_dente', 'escovas?\\s+(?:de\\s+dentes?|dent(?:al|ais))', [
    'Escova gasta é sinal de troca.',
    'Pra trocar a escova da casa toda de uma vez.',
    'Reserva no armário pra quando a cerda abrir.',
    'Item de banheiro que vale ter sobrando.',
  ]),
  T('bucal_outros', 'fio\\s+dental|fita\\s+dental|enxaguantes?\\s+bucais?|antiss[eé]ptico\\s+bucal|listerine', [
    'Daqueles que acabam e a gente só percebe no dia que precisa.',
    'Reposição do banheiro pra rotina não ficar pela metade.',
    'Bom ter de reserva no armário.',
    'Item pequeno da lista do mês que sempre falta.',
  ]),
  T('desodorante', 'desodorantes?|antitranspirantes?', [
    'Desodorante acabando no meio da semana é o pior.',
    'Reserva no armário pra não ser pego de surpresa.',
    'Daqueles que somem do banheiro mais rápido do que deveriam.',
    'Pra deixar um na mochila e outro em casa.',
    'Item da lista do mês pra riscar de uma vez.',
  ]),
  T('barbear_lamina', 'aparelhos?\\s+de\\s+barbear|l[aâ]minas?\\s+de\\s+barbear|gillette|prestobarba|mach\\s*3|espuma\\s+de\\s+barbear|gel\\s+de\\s+barbear', [
    'Lâmina gasta só atrapalha a barba.',
    'Pra quem faz a barba toda semana e vive comprando lâmina.',
    'Reserva de lâmina pra não improvisar na hora.',
    'Barba feita sem puxar começa por lâmina nova.',
  ]),
  T('sabonete', 'sabonetes?', [
    'Reposição do banho sem susto.',
    'Pacote pra casa inteira passar o mês.',
    'Daqueles que acabam rápido quando a família toda usa.',
    'Banheiro abastecido é um problema a menos.',
  ], 'facial|rosto'),

  /* ---------------- saúde, suplementos e cuidado (sem promessa de saúde ou resultado) ---------------- */
  T('termometro', 'term[oô]metro', [
    'Termômetro é daqueles que some da gaveta bem quando precisa.',
    'Item de casa que toda família deveria ter à mão.',
    'Bom ter um em casa e outro na bolsa das crianças.',
    'Pra caixinha de cuidados de casa ficar completa.',
  ], 'cozinha|culin[aá]ri|churrasco|ambiente|aqu[aá]rio|piscina'),
  T('medidor_pressao', 'medidor\\s+de\\s+press[aã]o|monitor\\s+de\\s+press[aã]o|esfigmoman[oô]metro', [
    'Pra quem acompanha a pressão em casa sem depender de farmácia.',
    'Item de casa pra quem cuida da família de perto.',
    'Bom ter em casa pra acompanhar a rotina de quem precisa.',
    'Pra casa com idoso ou quem faz acompanhamento.',
  ]),
  T('oximetro', 'ox[ií]metro', [
    'Item de casa que vale ter na caixinha de cuidados.',
    'Pra quem gosta de acompanhar os sinais em casa.',
    'Pequeno, cabe na gaveta e na bolsa.',
    'Pra casa com idoso ou criança.',
  ]),
  T('curativos', 'curativos?|band-?aid|esparadrapo|gaze|kit\\s+(?:de\\s+)?primeiros\\s+socorros', [
    'Joelho ralado de criança pede caixinha abastecida.',
    'Daqueles itens que é bom ter antes de precisar.',
    'Pra mochila, carro e gaveta da cozinha.',
    'Caixinha de primeiros cuidados completa é sossego.',
  ]),
  T('nebulizador', 'nebulizador|inalador', [
    'Item de casa que vale ter guardado.',
    'Pra casa com criança, bom ter à mão.',
    'Pra não depender de emprestar de ninguém.',
    'Cabe no armário e fica pronto quando precisar.',
  ]),
  T('bolsa_termica', 'bolsa\\s+(?:t[eé]rmica\\s+)?(?:de\\s+)?(?:gel|[aá]gua\\s+quente)|compressa', [
    'Item de casa pra noite fria no sofá.',
    'Bom ter na gaveta pra quando precisar.',
    'Pra deixar no congelador ou esquentar quando quiser.',
  ], 'marmita|lanche|cerveja|garrafa'),
  T('organizador_remedio', 'porta[- ]comprimidos?|organizador\\s+de\\s+(?:rem[eé]dios?|comprimidos?)|caixa\\s+de\\s+rem[eé]dios?', [
    'Pra organizar os horários da semana sem confusão.',
    'Pra quem cuida da rotina de alguém da família.',
    'Gaveta organizada é menos esquecimento na semana.',
  ]),
  T('whey', 'whey|prote[ií]na\\s+(?:isolada|concentrada|vegana)', [
    'Pote no fim é sinal de reposição.',
    'Pra rotina de treino seguir sem pausa.',
    'Reposição do mês sem sair procurando.',
    'Pra quem já sabe o que toma e só quer repor.',
  ]),
  T('creatina', 'creatina', [
    'Pra rotina de treino não ficar pela metade.',
    'Pote de reserva no armário é uma preocupação a menos.',
    'Reposição de quem já tem a creatina na rotina.',
    'Pra deixar o próximo pote separado.',
  ]),
  T('vitaminas', 'vitamina|multivitam[ií]nico|polivitam[ií]nico|[oô]mega\\s*3|col[aá]geno|magn[eé]sio', [
    'Pra quem já tem isso na rotina e tá no fim do frasco.',
    'Reposição do mês sem passar na farmácia.',
    'Frasco de reserva pra rotina não parar.',
    'Pra quem gosta de deixar a reposição organizada.',
  ], 's[eé]rum|facial|creme|sabonete|shampoo'),
  T('cuidado_adulto', 'fraldas?\\s+(?:geri[aá]tric|para\\s+adulto|adulto)|roupa\\s+[íi]ntima\\s+(?:descart|absorvente)|bigfral|tena|plenitud|ever\\s*care', [
    'Reposição do cuidado em casa sem correria.',
    'Estoque em dia é uma preocupação a menos.',
    'Pra quem cuida de alguém em casa.',
    'Item da lista do mês pra riscar de uma vez.',
  ]),

  /* ---------------- tech ---------------- */
  T('fone_tws', 'tws|earbuds?|airpods|buds\\s*\\d*|fones?\\s+(?:de\\s+ouvido\\s+)?(?:bluetooth\\s+)?(?:in-?ear|intra-?auricular)', [
    'Fone de bolso: tira do estojo e já tá tocando.',
    'Daqueles que somem no ouvido, bom pra academia e pro ônibus.',
    'Sem fio enroscando na mochila nem fone puxando da orelha.',
    'Pra quem vive perdendo o fone com fio no meio da bagunça.',
    'Treino, ônibus e chamada de vídeo no mesmo fone, sem trocar de aparelho.',
    'Estojo no bolso e fone sempre pronto pra usar.',
    'Pra quem treina e não aguenta fio batendo no peito.',
    'Ligação no ônibus e música no treino sem trocar de fone.',
    'Bom ter um reserva pra quando o principal some na bolsa.',
  ]),
  T('headset_gamer', 'headset(?:\\s+gamer)?|fones?\\s+gamer', [
    'Ouvir o passo do inimigo antes dele te ver muda a partida.',
    'Pra conversar com a galera no jogo sem eco nem microfone chiando.',
    'Jogatina de madrugada sem acordar a casa.',
    'Microfone bom é o fim do "não tô te ouvindo".',
    'Pra quem joga, um headset decente faz parte do kit.',
  ]),
  T('headphone', 'headphones?|fones?\\s+(?:de\\s+ouvido)?(?:\\s+\\p{L}+){0,3}\\s+(?:over-?ear|on-?ear)|fones?\\s+de\\s+ouvido|fones?\\s+bluetooth|fones?\\s+jbl', [
    'Headphone é outra experiência pra quem escuta música de verdade.',
    'Pra maratona de playlist sem incomodar ninguém em casa.',
    'Bom pra quem trabalha em casa e precisa se concentrar.',
    'Pra viagem de ônibus passar no ritmo da playlist.',
    'Quem troca o fone que veio com o celular por um desses não volta atrás.',
    'Fone decente é daqueles upgrades que você usa o dia inteiro.',
    'Pra quem passa horas em reunião online e já tá com a orelha reclamando do fone ruim.',
    'Podcast no caminho do trampo fica outra coisa.',
  ]),
  T('caixa_som', 'caixas?\\s+de\\s+som|caixinhas?\\s+de\\s+som|speaker|soundbar|jbl\\s+(?:go|flip|charge|boombox|clip|partybox)', [
    'Pra levar o som pro churrasco, pra praia e pro banho.',
    'Caixinha boa muda o clima de qualquer encontro em casa.',
    'Som de verdade sem depender do alto-falante do celular.',
    'Daquelas que vão do quarto pro quintal sem fio nenhum.',
    'Pra faxina de sábado render no ritmo da playlist.',
    'Quem faz churrasco sabe que a caixinha é item de primeira necessidade.',
  ]),
  T('smartwatch', 'smartwatch|rel[oó]gio\\s+inteligente|smart\\s*band|mi\\s*band|apple\\s+watch|galaxy\\s+watch|amazfit', [
    'Notificação no pulso e celular esquecido na mochila sem drama.',
    'Pra quem quer acompanhar passo, treino e sono sem complicar.',
    'Bom companheiro pra corrida sem levar o celular na mão.',
    'Relógio que avisa a mensagem importante na hora da reunião.',
    'Pra quem começou a treinar e quer ver a evolução no pulso.',
    'Despertador que vibra no pulso e não acorda a casa toda.',
  ]),
  T('tablet', 'tablet|ipad|galaxy\\s+tab', [
    'Tela grande pra série na cama sem ficar segurando o celular.',
    'Bom pra estudo, leitura e pra criançada ver desenho.',
    'Pra quem quer algo maior que o celular sem carregar notebook.',
    'Leitura de PDF e anotação sem forçar a vista no celular.',
    'Viagem longa passa rapidinho com um desses na mochila.',
    'Segunda tela que resolve receita na cozinha e série no sofá.',
  ], 'capa|case|pel[ií]cula|suporte'),
  T('celular', 'smartphones?|celular|iphone|galaxy\\s*[asmz]\\s*\\d+|redmi|poco\\s*[a-z]?\\d+|moto\\s*g\\s*\\d+|motorola\\s+edge|xiaomi\\s+\\d+', [
    'Celular novo é o alívio de não ver mais a tela travando no meio da conversa.',
    'Pra quem tá no aparelho velho que esquenta só de abrir o mapa.',
    'Câmera boa faz falta na primeira foto de família que sai borrada.',
    'Trocar de celular é daquelas compras que você sente todo santo dia.',
    'Pra aposentar o aparelho com a bateria pedindo arrego antes do almoço.',
    'Quem passa o dia no celular sabe o quanto um aparelho fluido muda a rotina.',
    'Pra parar de apagar foto toda vez que o celular avisa que tá cheio.',
    'Celular reserva pro trampo ou pra passar o antigo pra frente.',
    'Pra quem quer celular que dure a rotina inteira sem pedir tomada.',
    'Upgrade de celular é o que você mais sente no uso do dia a dia.',
  ], 'capa|case|capinha|pel[ií]cula|suporte|carregador|cabo|automotivo|veicular'),
  T('notebook', 'notebook|laptop|macbook|chromebook|ultrabook', [
    'Notebook novo é o fim da espera pra abrir uma planilha.',
    'Pra quem trabalha ou estuda e não aguenta mais a máquina travando.',
    'Leve pra levar na mochila e dar conta do trampo em qualquer lugar.',
    'Pra faculdade, home office e aquela série depois do expediente.',
    'Quem trabalha o dia todo no computador sente a diferença na primeira hora.',
    'Trocar o notebook antigo é ganhar tempo todo santo dia.',
  ], 'mochila|capa|case|suporte|base|cooler|carregador|fonte'),
  T('monitor', 'monitor', [
    'Segunda tela no home office é produtividade que você sente no primeiro dia.',
    'Pra parar de espremer planilha e reunião na tela do notebook.',
    'Mesa do computador nova começa por uma tela à altura.',
    'Bom pra jogo e pro trampo sem ficar trocando de janela.',
    'Tela maior na mesa e pescoço agradecendo no fim do dia.',
    'Pra quem joga e quer ver tudo fluindo na tela.',
  ], 'suporte|bra[cç]o|bab[aá]'),
  T('streaming_box', 'fire\\s*tv(?:\\s+stick)?|chromecast|roku|tv\\s*box|mi\\s*stick|google\\s+tv\\s+streamer', [
    'Transforma a TV antiga em smart sem trocar a TV.',
    'Pra levar os apps de streaming pra TV do quarto.',
    'Controle simples e os apps todos na mesma tela.',
    'Solução rápida pra TV que não tem os apps que você usa.',
    'Bom pra levar na viagem e plugar na TV do hotel.',
    'Pra quem não quer trocar de TV só por causa do sistema.',
  ]),
  T('smart_tv', 'smart\\s*tv|televis[aã]o|tv\\s+(?:led|qled|oled|4k|uhd|smart|\\d{2})', [
    'Futebol de domingo e série de sexta ganham outra cara.',
    'Pra aposentar aquela TV que já tá com cor estranha.',
    'Sala nova começa pela TV.',
    'Streaming direto na TV, sem gambiarra de cabo.',
    'Pra maratona de série virar programa de cinema em casa.',
    'Quem assiste jogo com a família sabe o valor de uma tela boa.',
    'Pra TV do quarto que já ficou pra trás.',
    'Cinema de sábado sem sair do sofá.',
    'Pra quem joga videogame e quer tela à altura do console.',
  ], 'suporte|antena|controle\\s+remoto|cabo'),
  T('power_bank', 'power\\s*bank|carregador\\s+port[aá]til|bateria\\s+externa', [
    'Bateria acabando na rua deixa de ser problema.',
    'Pra quem passa o dia fora e não acha tomada em lugar nenhum.',
    'Item de mochila pra show, viagem e dia corrido.',
    'Celular morrendo no meio do caminho nunca mais.',
    'Daqueles que você só percebe que precisava no dia que esquece.',
    'Pra viagem longa sem ficar caçando tomada na rodoviária.',
  ]),
  T('carregador', 'carregador|fonte\\s+usb|cabo\\s+(?:usb|lightning|tipo[- ]?c)|hub\\s+usb', [
    'Carregador reserva pra deixar no trampo e parar de levar o de casa.',
    'Cabo e carregador bom salvam a rotina inteira.',
    'Pra parar de usar aquele cabo que só carrega dobrado.',
    'Bom ter um na mochila e outro do lado da cama.',
    'Pra substituir o carregador que esquenta mais do que devia.',
  ], 'automotivo|veicular'),
  T('mouse', 'mouse', [
    'Mouse bom é a diferença entre trabalhar e brigar com o cursor.',
    'Pra parar de usar o touchpad do notebook o dia inteiro.',
    'Clique certinho no jogo e no trampo.',
    'Pra quem joga e sente cada milésimo de atraso.',
    'Troca simples que melhora a mesa do computador inteira.',
  ], 'mousepad'),
  T('teclado', 'teclado', [
    'Digitar num teclado bom é outra sensação no fim do dia.',
    'Pra quem escreve muito e já sente as teclas gastas.',
    'Pra quem joga, teclado bom faz diferença.',
    'Bom pra montar a mesa do home office do jeito certo.',
    'Pra parar de digitar no teclado apertado do notebook.',
  ]),
  T('webcam', 'webcam', [
    'Pra reunião online do trampo parar de mostrar você borrado.',
    'Câmera do notebook não ajuda ninguém na reunião.',
    'Bom pra aula online, entrevista e chamada com a família.',
    'Pra quem faz live ou grava conteúdo em casa.',
  ]),
  T('roteador', 'roteador|repetidor|mesh|access\\s+point', [
    'Internet caindo no quarto do fundo nunca mais.',
    'Pra acabar com a briga pela internet quando todo mundo conecta junto.',
    'Sinal chegando onde o roteador da operadora não alcança.',
    'Reunião online sem travar no meio da apresentação.',
    'Casa grande pede Wi-Fi que chegue em todos os cômodos.',
    'Pra jogo online sem aquela travada na hora errada.',
  ]),
  T('ssd', 'ssd|nvme|m\\.2', [
    'Computador que demora pra ligar ganha vida nova.',
    'Upgrade que mais aparece no dia a dia do PC.',
    'Jogo carregando rápido e menos tempo olhando a tela de carregamento.',
    'Pra tirar o HD lento do caminho de vez.',
    'O upgrade que todo PC antigo merece primeiro.',
  ]),
  T('armazenamento', 'pen\\s*drive|pendrive|cart[aã]o\\s+(?:de\\s+)?mem[oó]ria|micro\\s*sd|hd\\s+externo', [
    'Backup das fotos antes que o celular resolva dar pane.',
    'Espaço extra pra parar de apagar arquivo.',
    'Bom pra câmera, celular e videogame que vivem lotados.',
    'Pra levar os arquivos do trampo no bolso.',
    'Daqueles que você sempre precisa e nunca tem na gaveta.',
  ]),
  T('impressora', 'impressora|multifuncional', [
    'Pra parar de correr na papelaria toda vez que precisa imprimir.',
    'Boleto, trabalho da escola e documento resolvidos em casa.',
    'Home office completo tem impressora no canto da mesa.',
    'Bom pra quem estuda e imprime material toda semana.',
  ], 'cartucho|toner|tinta|refil'),
  T('kindle', 'kindle|e-?reader', [
    'Biblioteca inteira na mochila sem pesar nada.',
    'Leitura na cama sem luz acesa incomodando ninguém.',
    'Pra quem lê muito e não tem mais espaço na estante.',
    'Tela que não cansa a vista nem depois de horas de leitura.',
    'Leitura no ônibus sem segurar livro pesado.',
  ], 'capa|case'),
  T('camera', 'c[aâ]meras?\\s+(?:digital|fotogr[aá]fica|de\\s+a[cç][aã]o|instant[aâ]nea)|gopro|instax|action\\s*cam', [
    'Pra registrar viagem e rolê do jeito que o celular não dá conta.',
    'Foto que vira lembrança de verdade, não só mais um arquivo.',
    'Bom pra trilha, praia e aventura sem arriscar o celular.',
    'Pra viagem ficar registrada além das fotos do celular.',
  ]),
  T('controle', 'dualsense|dualshock|joystick|gamepad|controles?\\s+(?:sem\\s+fio|ps5|ps4|xbox|pro|para|pra|gamer)', [
    'Controle reserva pra quando o seu começar a puxar sozinho.',
    'Jogar em dupla pede segundo controle decente.',
    'Pra aposentar o controle com analógico puxando sozinho.',
    'Bom ter um extra carregado pra não parar a partida.',
    'Pra jogatina com a visita não virar briga por controle.',
  ], 'capa|case|suporte|base|dock|carregador|grip|skin'),
  T('jogo', 'jogo\\s+(?:para|pra|ps5|ps4|xbox|switch|nintendo)|m[ií]dia\\s+f[ií]sica|edi[cç][aã]o\\s+(?:standard|deluxe|gold)', [
    'Pra tirar da lista de desejos e finalmente jogar.',
    'Mais um pra zerar no fim de semana.',
    'Quem tava esperando pra jogar esse vai querer olhar.',
    'Bom pra quem curte jogar com calma e explorar tudo.',
    'Lançamento que dá vontade de cancelar o rolê do sábado.',
  ]),
  T('console', 'ps5|playstation\\s*5|xbox\\s+series|nintendo\\s+switch|steam\\s+deck|console', [
    'Console novo é a chance de jogar o que você tava adiando.',
    'Pra jogar os lançamentos em vez de só ver os outros jogando.',
    'Console novo é o presente que a casa inteira aproveita.',
    'Jogatina de fim de semana subindo de nível.',
    'Pra jogar com a galera em casa ou online.',
  ], 'capa|case|suporte|base|dock|cabo|carregador|skin|adesivo|bolsa|jogo|gift'),
  T('cadeira', 'cadeiras?\\s+(?:gamer|de\\s+escrit[oó]rio|ergon[oô]micas?|presidente|office)', [
    'Pra quem passa o dia sentado e já sente no fim do expediente.',
    'Pra quem faz home office numa cadeira de cozinha.',
    'Mesa de trabalho completa começa por onde você senta.',
    'Maratona de jogo com uma cadeira à altura.',
  ]),

  /* ---------------- casa / eletro ---------------- */
  T('robo_aspirador', 'rob[ôo]\\s+aspirador|aspirador\\s+rob[ôo]', [
    'Chão limpo enquanto você tá no trampo.',
    'Pra quem odeia varrer e tem pet soltando pelo.',
    'Programa, sai de casa e volta com o chão em ordem.',
    'Faxina diária no automático.',
    'Um a menos na lista de tarefas da casa.',
  ]),
  T('aspirador', 'aspirador', [
    'Faxina de fim de semana acaba antes do almoço.',
    'Pelo de pet e farelo no chão param de ser problema diário.',
    'Casa limpa sem passar o sábado arrastando vassoura.',
    'Pra limpeza rápida do dia a dia sem montar operação.',
    'Quem tem tapete em casa sabe a diferença de um desses.',
  ], 'automotivo|veicular'),
  T('air_fryer', 'air\\s*fryer|fritadeira', [
    'Batata crocante sem banho de óleo e sem cheiro de fritura na casa.',
    'Janta de semana resolvida em minutos, quase sem louça.',
    'Quem tem uma não volta pro óleo quente.',
    'Pra esquentar a pizza de ontem sem ficar borrachuda.',
    'Frango, legume e batata sem sujar o fogão.',
    'Daquelas que ficam na bancada porque usa todo dia.',
    'Pra quem quer comer melhor sem passar horas no fogão.',
    'Marmita da semana pronta sem esquentar a cozinha.',
    'Lanche da tarde das crianças resolvido rapidinho.',
    'Quem cozinha pra uma pessoa só usa mais que o fogão.',
  ]),
  T('cafeteira', 'cafeteira|m[aá]quina\\s+de\\s+caf[eé]|nespresso\\s+(?:essenza|vertuo|inissia|pixie|citiz)|dolce\\s+gusto\\s+(?:mini|genio|piccolo|infinissima)', [
    'Café fresquinho antes do trampo sem esperar a água ferver.',
    'Pra quem não começa o dia sem um cafezinho.',
    'Cafezinho de cafeteria sem sair de casa.',
    'Café da tarde de domingo virando ritual.',
    'Pra receber visita com café de verdade.',
  ]),
  T('liquidificador', 'liquidificador|blender|mixer|processador\\s+de\\s+alimentos|mini\\s+processador', [
    'Vitamina de manhã e suco natural sem complicação.',
    'Pra bater massa de bolo sem cansar o braço.',
    'Sopa, molho e vitamina no mesmo aparelho.',
    'Pra quem tá tentando comer melhor e faz suco em casa.',
    'Cozinha equipada começa por um desses.',
  ]),
  T('batedeira', 'batedeira', [
    'Bolo de domingo sem cansar o braço.',
    'Pra quem faz doce pra vender ou só pra família.',
    'Massa no ponto sem ficar batendo na mão.',
    'Confeitaria em casa fica bem mais fácil.',
  ]),
  T('micro_ondas', 'micro-?ondas|microondas', [
    'Marmita esquentada em minutos no meio da correria.',
    'Pra aposentar o micro-ondas que esquenta só a borda.',
    'Pipoca de sessão de filme pronta rapidinho.',
    'Item que a cozinha usa mais vezes por dia do que parece.',
  ]),
  T('forno_eletrico', 'forno\\s+el[eé]trico|forninho', [
    'Pra assar sem esquentar a cozinha inteira.',
    'Pão de queijo e lasanha sem ligar o forno grande.',
    'Bom pra apartamento pequeno e cozinha sem forno.',
    'Quem mora sozinho usa mais do que o forno grande.',
  ]),
  T('panela_eletrica', 'panela\\s+(?:el[eé]trica|de\\s+arroz|de\\s+press[aã]o)|multicooker', [
    'Feijão pronto sem ficar vigiando o fogão.',
    'Liga, programa e vai fazer outra coisa.',
    'Arroz soltinho sem queimar o fundo da panela.',
    'Pra marmita da semana sair de uma vez só.',
  ]),
  T('panelas', '(?:jogo|conjunto)\\s+de\\s+panelas|frigideiras?|panelas?\\s+antiaderentes?|ca[cç]arolas?', [
    'Panela nova é o fim do ovo grudando no fundo.',
    'Pra aposentar aquela panela com o fundo já descascando.',
    'Cozinha renovada começa pelo fogão.',
    'Bom pra quem tá montando casa ou trocando o jogo velho.',
    'Omelete deslizando na frigideira é outro humor de manhã.',
  ]),
  T('utensilios', 'jogo\\s+de\\s+facas|facas?\\s+(?:do\\s+)?chef|t[aá]buas?\\s+de\\s+(?:corte|carne)|potes?\\s+herm[eé]ticos?|escorredor|kit\\s+utens[ií]lios|jogo\\s+de\\s+(?:copos|pratos|talheres|ta[cç]as)', [
    'Cozinha organizada é metade do caminho pro jantar sair.',
    'Marmita da semana arrumada e geladeira sem bagunça.',
    'Daqueles itens que fazem falta todo dia na cozinha.',
    'Bom pra quem tá montando a primeira casa.',
  ]),
  T('ventilador', 'ventilador|circulador\\s+de\\s+ar', [
    'Noite de calor sem ficar virando na cama.',
    'Pra encarar o verão sem derreter no sofá.',
    'Quem dorme no abafado sabe o drama.',
    'Brisa no home office sem precisar ligar o ar.',
    'Daqueles que salvam a noite de verão.',
  ]),
  T('ar_condicionado', 'ar[- ]condicionado|split|climatizador', [
    'Pra dormir no verão sem acordar suado.',
    'Quarto fresquinho muda o humor no calorão.',
    'Home office no verão fica suportável.',
    'Quem mora em lugar quente sabe que é investimento.',
  ]),
  T('geladeira', 'geladeira|refrigerador|freezer|frigobar', [
    'Pra aposentar a geladeira que vive fazendo barulho.',
    'Mais espaço pra compra do mês sem jogar comida fora.',
    'Casa nova ou cozinha renovada começa por uma dessas.',
    'Bom pra quem faz compra grande e congela marmita.',
  ]),
  T('lava_roupas', 'lava\\s*e\\s*seca|lavadora\\s+de\\s+roupas|m[aá]quina\\s+de\\s+lavar|tanquinho', [
    'Roupa lavada sem passar o domingo no tanque.',
    'Pra família que lava roupa todo dia.',
    'Liga, programa e vai cuidar da vida.',
    'Pra aposentar a máquina que já anda pela lavanderia.',
  ]),
  T('ferro', 'ferro\\s+de\\s+passar|vaporizador\\s+de\\s+roupas|passadeira\\s+a\\s+vapor|steamer', [
    'Camisa amassada no dia da reunião nunca mais.',
    'Roupa passada em minutos antes de sair.',
    'Vapor resolve até a roupa pendurada no cabide.',
    'Bom pra levar na mala e não sair amassado da viagem.',
  ]),
  T('purificador', 'purificador\\s+de\\s+[aá]gua|filtro\\s+de\\s+[aá]gua|bebedouro', [
    'Água gelada na torneira e fim do galão pesado.',
    'Pra parar de comprar garrafa toda semana.',
    'Cozinha com água filtrada sempre à mão.',
    'Um galão a menos pra carregar escada acima.',
  ], 'pet|c[aã]es|gatos'),
  T('garrafa_termica', 'garrafa\\s+t[eé]rmica|copo\\s+t[eé]rmico|stanley|squeeze|caneca\\s+t[eé]rmica|garrafa\\s+de\\s+[aá]gua', [
    'Água gelada o dia inteiro na mesa ou no treino.',
    'Café quente até o fim da tarde no trampo.',
    'Pra parar de comprar garrafinha na rua.',
    'Companheira de academia, trabalho e estrada.',
    'Bom pra beber mais água sem depender de copo descartável.',
  ]),
  T('colchao', 'colch[aã]o|cama\\s+box|box\\s+(?:casal|solteiro|queen|king)', [
    'Noite bem dormida muda o dia inteiro.',
    'Pra aposentar o colchão com a marca do seu corpo.',
    'Acordar descansado é outro começo de dia.',
    'Quarto novo começa pela cama.',
  ], 'protetor|capa'),
  T('travesseiro', 'travesseiros?', [
    'Pescoço acordando torto é sinal de travesseiro vencido.',
    'Travesseiro é o upgrade de quarto que você sente toda noite.',
    'Bom trocar antes que ele vire uma panqueca.',
    'Sono bom começa pelo lugar onde você deita a cabeça.',
  ]),
  T('cama_banho', 'jogo\\s+de\\s+cama|len[cç][oó]is|len[cç]ol|edredom|cobertor|manta|toalhas?\\s+de\\s+(?:banho|rosto)|jogo\\s+de\\s+toalhas|roup[aã]o', [
    'Cama arrumada com jogo novo é outro humor.',
    'Pra renovar o enxoval que já tá desbotado.',
    'Toalha macia depois do banho faz diferença no dia.',
    'Quarto com cara de hotel sem reforma.',
    'Frio chegando pede reforço na cama.',
  ]),
  T('casa_inteligente', 'l[aâ]mpadas?\\s+(?:inteligentes?|smart|wi-?fi)|tomadas?\\s+(?:inteligentes?|smart)|echo\\s+(?:dot|show|pop)|alexa|google\\s+nest|assistente\\s+virtual', [
    'Apagar a luz da cama por voz é luxo que vicia.',
    'Casa inteligente começa por um desses.',
    'Pra programar luz e aparelho sem levantar do sofá.',
    'Bom pra rotina da manhã com música e previsão do tempo.',
  ]),
  T('organizacao', 'organizador|caixas?\\s+organizadoras?|cabideiro|sapateira|prateleira|nicho\\s+decorativo|arara\\s+de\\s+roupas|gaveteiro', [
    'Casa organizada é menos tempo procurando as coisas.',
    'Pra acabar com a bagunça do armário de vez.',
    'Cada coisa no seu lugar e menos estresse de manhã.',
    'Bom pra apartamento pequeno aproveitar cada canto.',
  ]),
  T('umidificador', 'umidificador|difusor\\s+de\\s+aromas?|aromatizador\\s+el[eé]trico', [
    'Tempo seco pede reforço no quarto.',
    'Pra noite de inverno seco ficar mais suportável.',
    'Quarto com cheirinho bom no fim do dia.',
    'Bom pra deixar ligado no home office no tempo seco.',
  ]),
  T('limpeza_consumo', 'sab[aã]o\\s+(?:l[ií]quido|em\\s+p[oó])|lava[- ]?roupas|amaciante|detergente|desinfetante|[aá]gua\\s+sanit[aá]ria|multiuso|limpador|papel\\s+higi[eê]nico|papel\\s+toalha|esponjas?|sacos?\\s+de\\s+lixo', [
    'Daqueles que acabam rápido em casa, bom ter de reserva.',
    'Item da lista do mês pra riscar sem ir ao mercado.',
    'Faxina de fim de semana abastecida.',
    'Pra despensa da limpeza não ficar no vazio.',
    'Um a menos pra lembrar na ida ao mercado.',
  ], 'automotivo|carro|moto'),
  T('lavadora_pressao', 'lavadora\\s+de\\s+alta\\s+press[aã]o|lavadora\\s+wap|k[aä]rcher|karcher', [
    'Quintal, calçada e carro lavados numa tarde.',
    'Pra tirar aquele limo que nenhuma vassoura resolve.',
    'Lava-rápido em casa no fim de semana.',
    'Sujeira encardida sai no jato, sem esfregar.',
  ]),
  T('ferramenta_eletrica', 'furadeira|parafusadeira|serra\\s+(?:t[ií]co|circular|m[aá]rmore)|serra\\s+tico|esmerilhadeira|lixadeira|tupia|martelete', [
    'Pra parar de pedir emprestada pro vizinho.',
    'Prateleira, quadro e cortina resolvidos sem chamar ninguém.',
    'Caixa de ferramentas completa começa por uma dessas.',
    'Pequena reforma de fim de semana sem drama.',
    'Quem mudou de casa sabe quantos furos tem pela frente.',
  ]),
  T('ferramentas_manuais', 'jogo\\s+de\\s+(?:chaves|ferramentas|soquetes|brocas)|maleta\\s+de\\s+ferramentas|kit\\s+(?:de\\s+)?ferramentas|trena|n[ií]vel\\s+a\\s+laser|alicate|chaves?\\s+de\\s+fenda', [
    'Aquele parafuso solto finalmente vai ser apertado.',
    'Pra ter a ferramenta certa na hora do perrengue.',
    'Bom ter em casa antes de precisar.',
    'Presente certeiro pra quem gosta de mexer em tudo.',
  ]),

  /* ---------------- beleza ---------------- */
  T('protetor_solar', 'protetor\\s+solar|filtro\\s+solar|fotoprotetor', [
    'Protetor acabando é o passo que mais faz falta na rotina.',
    'Pra não ter desculpa de pular o protetor de manhã.',
    'Sol no caminho pro trampo também conta.',
    'Bom ter um na bolsa e outro no banheiro.',
    'Pra praia, piscina e dia a dia na rua.',
    'Pra deixar no carro e não ter desculpa no dia de sol.',
    'Reposição do protetor antes do verão pegar firme.',
  ]),
  T('barbeador', 'barbeador\\s+el[eé]trico|aparadores?\\s+de\\s+(?:barba|pelos)|m[aá]quina\\s+de\\s+(?:cortar\\s+cabelo|barbear|acabamento)|trimmer', [
    'Barba feita em casa sem marcar barbeiro.',
    'Pra manter o pezinho em dia entre um corte e outro.',
    'Barba, nariz e orelha num aparelho só.',
    'Quem faz a barba toda semana sente a diferença.',
  ]),
  T('aparelho_cabelo', 'secador(?:\\s+de\\s+cabelo)?|chapinha|prancha\\s+(?:alisadora|de\\s+cabelo)|escova\\s+(?:secadora|rotativa|alisadora)|modelador(?:a)?|babyliss', [
    'Salão em casa no dia a dia.',
    'Pra arrumar o cabelo antes do trampo sem perder a hora.',
    'Pra aposentar o secador que demora uma eternidade.',
    'Cabelo arrumado pra sair sem depender de agenda de salão.',
  ]),
  T('serum_facial', 's[eé]rum|retinol|niacinamida|[aá]cido\\s+hialur[oô]nico|vitamina\\s+c\\s+(?:facial|s[eé]rum)|t[oô]nico\\s+facial|sabonete\\s+facial|gel\\s+de\\s+limpeza', [
    'Pra quem já tem rotina de skincare e tá vendo o frasco no fim.',
    'Passo da rotina que dá vontade de não pular.',
    'Reposição do frasco que você mais usa no skincare.',
    'Bom pra quem tá montando a rotina de pele aos poucos.',
    'Daqueles que viram queridinho da bolsinha de maquiagem.',
  ]),
  T('hidratante', 'hidratante|lo[cç][aã]o\\s+(?:hidratante|corporal)|cremes?\\s+(?:corporal|para\\s+(?:as\\s+)?m[aã]os|facial|para\\s+os\\s+p[eé]s)|body\\s+lotion|manteiga\\s+corporal', [
    'Pele repuxando depois do banho pede reforço.',
    'Reposição do pote que acaba sem você perceber.',
    'Pra deixar um na bolsa e outro no banheiro.',
    'Rotina de autocuidado começa pelo básico.',
  ]),
  T('cabelo', 'shampoo|condicionador|m[aá]scara\\s+(?:capilar|de\\s+hidrata[cç][aã]o)|leave-?in|[oó]leo\\s+capilar|creme\\s+de\\s+pentear|finalizador|kit\\s+(?:capilar|cabelo)', [
    'Cabelo bom começa no banho.',
    'Reposição da prateleira do banheiro sem ir à farmácia.',
    'Pra quem tem rotina de cabelo e tá no fim do frasco.',
    'Daqueles que acabam rápido quando a casa toda usa.',
    'Pra montar a rotina capilar sem complicação.',
    'Cabelo no jeito começa por não deixar o frasco zerar.',
    'Pra quem lava o cabelo todo dia e vê o frasco sumir.',
  ], 'pet|c[aã]es|gatos|automotivo'),
  T('maquiagem', 'base\\s+(?:l[ií]quida|matte|fluida)|corretivo|batom|r[ií]mel|m[aá]scara\\s+de\\s+c[ií]lios|paleta\\s+de\\s+sombras?|blush|p[oó]\\s+(?:compacto|solto|facial)|delineador|gloss|primer|pinc[eé]is?\\s+de\\s+maquiagem|esponja\\s+de\\s+maquiagem|iluminador', [
    'Reposição do que mais acaba na bolsinha de maquiagem.',
    'Pra quem gosta de maquiagem e tá com o produto no fim.',
    'Daqueles que viram básico da maquiagem do dia a dia.',
    'Maquiagem pronta antes do trampo sem complicar.',
    'Bom pra montar a bolsinha de maquiagem aos poucos.',
  ]),
  T('unhas', 'esmaltes?|kit\\s+manicure|cabine\\s+(?:led|uv)|alicate\\s+de\\s+cut[ií]cula', [
    'Unha feita em casa sem marcar manicure.',
    'Pra renovar as cores da caixinha de esmalte.',
    'Bom pra quem gosta de fazer a unha toda semana.',
  ]),

  /* ---------------- moda ---------------- */
  T('tenis_corrida', 't[eê]nis\\s+(?:de\\s+|para\\s+)?corrida|running|pegasus|novablast|gel[- ]?nimbus|gel[- ]?kayano|ultraboost|adizero|fresh\\s*foam|revolution|downshifter', [
    'Pra quem corre e tá com o tênis velho no fim da vida.',
    'Treino de rua pede tênis à altura.',
    'Bom pra quem tá começando a correr e quer acertar no par.',
    'Pra aposentar o par que já tá com a sola lisa.',
    'Corrida de fim de semana com par novo é outra disposição.',
    'Quem treina sabe que tênis é o equipamento principal.',
  ]),
  T('tenis', 't[eê]nis|sapat[eê]nis', [
    'Par coringa que vai com jeans, bermuda e moletom.',
    'Pra aposentar aquele tênis que já tá pedindo arrego.',
    'Tênis do dia a dia que combina com quase tudo.',
    'Bom pra quem roda a cidade a pé o dia inteiro.',
    'Daqueles que você usa a semana inteira.',
    'Look básico fica outro com um tênis desses.',
    'Pra quem precisa de um par que aguente o dia todo andando.',
    'Tênis novo pra começar a semana com o pé direito.',
    'Par que vai do trampo pro rolê sem trocar.',
  ], 'mesa|raquete|bola'),
  T('chinelo_sandalia', 'chinelo|sand[aá]lia|papete|rasteirinha|slide|crocs|babuche', [
    'Par de casa, praia e rolê rápido.',
    'Pra aposentar o chinelo com a tira já frouxa.',
    'Verão pede um desses na porta de casa.',
    'Bom pra levar na mala de viagem.',
    'Daqueles que você usa mais do que qualquer sapato.',
  ]),
  T('sapato_bota', 'sapatos?|botas?|coturno|mocassim|scarpin|sapatilha|oxford|loafer', [
    'Par certo pra reunião, casamento e saída de sábado.',
    'Pra completar o look de trabalho sem complicar.',
    'Bota é o par que salva o inverno.',
    'Daqueles pares que entram no armário pra ficar.',
  ]),
  T('roupa_intima', 'cuecas?|calcinhas?|meias?|suti[aã]s?|top\\s+fitness|pijamas?|samba-?can[cç][aã]o|boxer', [
    'Gaveta renovada numa compra só.',
    'Pra aposentar as peças que já perderam o elástico.',
    'Básico que todo mundo precisa e ninguém lembra de comprar.',
    'Kit pra semana inteira sem lavar no meio.',
  ]),
  T('agasalho', 'moletom|jaqueta|casaco|blusa\\s+de\\s+frio|corta[- ]vento|su[eé]ter|cardig[aã]|puffer|parka', [
    'Frio chegando e o moletom velho já não dá conta.',
    'Pra sair de manhã cedo sem tremer no ponto de ônibus.',
    'Peça que salva o inverno inteiro.',
    'Bom pra levar na mochila quando o tempo vira.',
  ], 'moto'),
  T('camiseta', 'camisetas?|camisas?\\s+(?:polo|b[aá]sicas?)|camisa|regatas?|t-?shirt|cropped|blusas?|polo', [
    'Peça coringa pra montar look sem pensar muito.',
    'Básica que combina com tudo que já tá no armário.',
    'Pra renovar as camisetas que já perderam a cor.',
    'Daquelas que você acaba usando a semana inteira.',
    'Look básico bem feito nunca sai de moda.',
    'Pra renovar o básico sem gastar tempo procurando.',
    'Camiseta boa é a peça que mais gira no armário.',
  ]),
  T('calca_bermuda', 'cal[cç]as?|jeans|bermudas?|shorts?|leggings?|saias?|vestidos?|macac[aã]o', [
    'Peça básica que entra em vários looks da semana.',
    'Pra renovar o básico do guarda-roupa.',
    'Peça coringa pro trabalho e pro fim de semana.',
    'Pra aposentar aquela que já tá desbotada.',
  ]),
  T('mochila_bolsa', 'mochilas?|bolsas?|necessaire|n[eé]cessaire|malas?\\s+de\\s+(?:viagem|bordo)|carteira|pochete|mala', [
    'Pra levar notebook, marmita e o resto da vida no mesmo lugar.',
    'Pra aposentar aquela que já tá com o zíper falhando.',
    'Bom pra trampo, faculdade e viagem curta.',
    'Organização começa por onde você carrega as coisas.',
  ], 't[eé]rmica'),
  T('relogio', 'rel[oó]gio', [
    'Acessório que completa o look sem esforço.',
    'Pra quem gosta de olhar a hora no pulso e não no celular.',
    'Presente certeiro pra aniversário e data especial.',
  ], 'inteligente|smart'),
  T('oculos', '[oó]culos', [
    'Sol forte pede um desses no carro e na bolsa.',
    'Acessório que muda o look inteiro.',
    'Bom pra praia, estrada e dia de sol no centro.',
  ], 'natação|nata[cç][aã]o|realidade\\s+virtual|vr'),

  /* ---------------- bebê e criança ---------------- */
  T('lenco_umedecido', 'len[cç]os?\\s+umedecidos?|toalhinhas?\\s+umedecidas?|len[cç]inhos?', [
    'Lencinho a gente usa pra tudo, até sem bebê em casa.',
    'Um na bolsa, um no carro e um no trocador.',
    'Daqueles que somem do armário rapidinho.',
    'Estoque de lencinho é sossego na hora do aperto.',
  ], 'adultos?|geri[aá]tric'),
  T('fralda', 'fraldas?', [
    'Fralda é daquelas que acabam mais rápido do que a gente conta.',
    'Estoque de fralda é paz pra semana inteira.',
    'Pra não sair correndo pra farmácia de madrugada.',
    'Quem tem bebê em casa sabe: sempre falta um pacote.',
    'Reforço no estoque antes do próximo tamanho chegar.',
    'Pacote reserva no carro pra emergência no passeio.',
    'Fralda é o item que mais some do trocador.',
    'Reposição do mês pra não depender da farmácia de plantão.',
  ], 'adultos?|geri[aá]tric|incontin|ever\\s*care|tena|plenitud|bigfral'),
  T('enxoval', 'mamadeira|chupeta|copo\\s+de\\s+transi[cç][aã]o|esterilizador|bomba\\s+tira[- ]leite|trocador|kit\\s+(?:higiene\\s+)?beb[eê]|body\\s+(?:de\\s+)?beb[eê]', [
    'Item de enxoval que vale ter reserva.',
    'Pra rotina do pequeno ficar mais prática.',
    'Bom pra quem tá montando o enxoval aos poucos.',
    'Daqueles que fazem falta na madrugada.',
  ]),
  T('bebe_grande', 'carrinho\\s+de\\s+beb[eê]|cadeirinha|beb[eê]\\s+conforto|assento\\s+de\\s+eleva[cç][aã]o|travel\\s+system|ber[cç]o|bab[aá]\\s+eletr[oô]nica|andador', [
    'Item grande do enxoval que vale pesquisar com calma.',
    'Passeio com o pequeno fica muito mais fácil.',
    'Compra pensada pra quem tá esperando bebê.',
    'Daquelas compras que acompanham a criança por um bom tempo.',
  ]),
  T('brinquedo', 'brinquedos?|lego|bonecas?|hot\\s+wheels|quebra-?cabe[cç]as?|jogos?\\s+de\\s+tabuleiro|massinha|blocos\\s+de\\s+montar|playmobil|barbie|carrinho\\s+de\\s+controle|nerf|pel[uú]cias?', [
    'Presente que segura a criançada longe da tela por um tempo.',
    'Pra aniversário, Dia das Crianças ou só porque sim.',
    'Brincadeira em família no domingo.',
    'Daqueles que viram o favorito da caixa de brinquedos.',
    'Bom pra deixar separado pro próximo presente.',
  ], 'c[aã]es|gatos|pet|k-?pop'),

  /* ---------------- pet ---------------- */
  T('areia_tapete', 'areia\\s+(?:higi[eê]nica|sanit[aá]ria|de\\s+gato|s[ií]lica)|tapetes?\\s+higi[eê]nicos?|granulado\\s+higi[eê]nico|pipicat|viva\\s+verde', [
    'Item que acaba toda semana e não pode faltar.',
    'Estoque de areia é um problema a menos com o bichano.',
    'Pra parar de carregar pacote pesado do pet shop.',
    'Reposição do cantinho do pet em dia.',
  ]),
  T('racao_gato', 'ra[cç][aã]o(?:\\s+\\p{L}+){0,6}\\s+gat(?:o|os|as)|whiskas|sach[eê]s?\\s+(?:para\\s+)?gatos?|gatos?\\s+castrados?|felinos?', [
    'Gato é exigente, e quando acerta a ração não dá pra deixar faltar.',
    'Pote cheio pro bichano sem correr no pet shop.',
    'Reposição do mês do felino resolvida.',
    'Estoque em dia e gato sem drama na cozinha.',
    'Pra quem já sabe o que o seu gato aceita.',
  ]),
  T('racao_cao', 'ra[cç][aã]o|pedigree|dog\\s+chow|golden\\s+f[oó]rmula|premier|special\\s+dog|gran\\s+plus|royal\\s+canin', [
    'Pote cheio sem correr pro pet shop no meio da semana.',
    'Saco grande é menos viagem pra carregar ração.',
    'Pra quem já sabe a marca que o seu come e quer repor.',
    'Reposição do mês do peludo resolvida.',
    'Ração acabando de surpresa nunca mais.',
    'Pra encher o pote sem pensar nisso pelas próximas semanas.',
    'Quem tem cachorro grande sabe a velocidade que o saco esvazia.',
    'Estoque do peludo em dia e uma preocupação a menos.',
  ]),
  T('petisco', 'petiscos?|bifinhos?|snacks?\\s+(?:para\\s+)?(?:c[aã]es|gatos)|ossos?\\s+(?:para\\s+)?c[aã]es|churu', [
    'Agrado pro pet que vira festa na hora.',
    'Pra adestramento e pra mimo de fim de tarde.',
    'Quem tem pet sabe: é só abrir o pacote que ele aparece.',
    'Bom ter de reserva pra recompensa.',
  ]),
  T('higiene_pet', '(?:shampoo|condicionador|perfume|col[oô]nia|escova|rasqueadeira|cortador\\s+de\\s+unhas?|len[cç]os?|pasta\\s+(?:dental|de\\s+dente)|eliminador\\s+de\\s+odores?)\\s+(?:\\p{L}+\\s+){0,3}(?:pet|para\\s+(?:c[aã]es|gatos|cachorros?)|c[aã]es|gatos)', [
    'Banho em casa e pet cheiroso sem marcar pet shop.',
    'Pra rotina de cuidado do peludo ficar em dia.',
    'Reposição do kit de banho do pet.',
    'Quem dá banho em casa sabe o quanto isso faz falta.',
    'Pet escovado e menos pelo espalhado pela casa.',
  ]),
  T('acessorio_pet', 'caminha|camas?\\s+(?:para\\s+)?(?:c[aã]es|gatos|pet)|arranhador|coleira|peitoral|guia\\s+(?:para\\s+)?(?:c[aã]es|pet)|comedouro|bebedouro\\s+(?:pet|para)|fonte\\s+(?:para\\s+)?gatos|caixa\\s+de\\s+transporte|transportadora|casinha|brinquedos?\\s+(?:para\\s+)?(?:c[aã]es|gatos|pet)', [
    'Cantinho do pet mais aconchegante.',
    'Pra aposentar a caminha que já tá toda roída.',
    'Passeio mais tranquilo com o peludo.',
    'Daqueles mimos que o pet usa todo dia.',
  ]),

  /* ---------------- mercado ---------------- */
  T('cafe', 'caf[eé]\\s+(?:em\\s+gr[aã]os?|mo[ií]do|torrado|especial|gourmet|sol[uú]vel|tradicional|extraforte)|c[aá]psulas?\\s+(?:de\\s+caf[eé]|nespresso|dolce\\s+gusto|tr[eê]s\\s+cora[cç][oõ]es)|melitta|pil[aã]o|orfeu|baggio', [
    'Café acabando no meio da semana é crise doméstica.',
    'Estoque de cafezinho pra manhã nenhuma começar devagar.',
    'Pra quem não vive sem o cafezinho da tarde.',
    'Reposição do café antes que vire emergência.',
    'Bom pra quem toma café o dia todo.',
  ], 'cafeteira|m[aá]quina'),
  T('bebida_alcool', 'cervejas?|vinhos?|espumantes?|prosecco|whisky|whiskey|vodka|gin|licor|cacha[cç]a|rum', [
    'Pra churrasco de fim de semana já ficar resolvido.',
    'Bom pra deixar separado pra visita ou data especial.',
    'Jantar de sexta fica outro com uma dessas na mesa.',
    'Pra presentear quem curte uma boa bebida.',
  ], 'ta[cç]as?|copos?|abridor|adega'),
  T('bebida', 'refrigerantes?|energ[eé]ticos?|monster|red\\s+bull|sucos?\\s+(?:integral|de\\s+uva)|[aá]gua\\s+(?:mineral|de\\s+coco|t[oô]nica)|isot[oô]nicos?|ch[aá]\\s+gelado', [
    'Geladeira abastecida pro fim de semana.',
    'Pra quem não começa o trampo sem uma dessas.',
    'Bom pra deixar estocado e gelando.',
    'Fardo em casa é menos ida ao mercado.',
  ]),
  T('doces', 'chocolates?|bombons?|biscoitos?|bolachas?|wafer|alfajor|nutella|panetone|chocotone|pringles|salgadinhos?|balas?|chicletes?|ferrero', [
    'Pra sessão de filme ficar completa.',
    'Daqueles que somem do armário em dois dias.',
    'Bom pra presentear ou só pra se dar um agrado.',
    'Pra lancheira das crianças e pro lanche da tarde.',
  ]),
  T('despensa', 'azeite|arroz|feij[aã]o|macarr[aã]o|molho\\s+de\\s+tomate|leite\\s+(?:integral|desnatado|em\\s+p[oó])|a[cç][uú]car|farinha|[oó]leo\\s+de\\s+(?:soja|girassol|canola)|atum|sardinha|granola|aveia|temperos?|maionese|ketchup', [
    'Despensa abastecida é menos ida ao mercado na semana.',
    'Item da compra do mês pra riscar da lista.',
    'Pra compra do mês sair mais rápida.',
    'Bom pra estocar o que a casa mais usa.',
    'Daqueles que nunca podem faltar na cozinha.',
  ]),

  /* ---------------- auto e moto ---------------- */
  T('moto', 'capacete|jaqueta\\s+(?:de\\s+)?moto|luvas?\\s+(?:de\\s+)?moto|ba[uú]\\s+(?:de\\s+)?moto|bauleto|capa\\s+de\\s+chuva\\s+moto|intercomunicador|motociclista', [
    'Equipamento de piloto é a primeira coisa a cuidar.',
    'Pra rodar na chuva sem chegar encharcado.',
    'Bom pra quem roda todo dia no trânsito.',
    'Pra aposentar o equipamento que já tá gasto.',
  ]),
  T('pneu', 'pneus?', [
    'Pneu gasto é daquelas trocas que não dá pra adiar.',
    'Pra trocar o jogo antes da viagem de fim de ano.',
    'Bom pra comparar antes de passar na borracharia.',
    'Troca de pneu planejada é menos susto na estrada.',
  ], 'pretinho|calibrador|compressor|bicicleta|bike'),
  T('cuidado_carro', 'cera\\s+(?:automotiva|de\\s+carna[uú]ba)|shampoo\\s+automotivo|vonixx|vintex|pretinho|silicone\\s+automotivo|limpa[- ]vidros|kit\\s+lavagem|aspirador\\s+automotivo|aromatizantes?\\s+(?:automotivo|para\\s+carro|de\\s+carro)', [
    'Carro brilhando sem depender do lava-rápido.',
    'Domingo de garagem com o carro tinindo.',
    'Pra quem cuida do carro como se fosse da família.',
    'Bom pra manter o carro apresentável no dia a dia.',
  ]),
  T('acessorio_carro', 'suportes?\\s+(?:de\\s+)?(?:celular\\s+)?(?:carro|veicular)|carregador\\s+(?:automotivo|veicular)|c[aâ]meras?\\s+(?:veicular|de\\s+r[eé]|automotiva)|dashcam|calibrador|compressor\\s+(?:de\\s+ar\\s+)?port[aá]til|central\\s+multim[ií]dia|tapetes?\\s+automotivos?|capas?\\s+de\\s+banco', [
    'Carro mais prático no trânsito do dia a dia.',
    'Pra não dirigir com o celular solto no banco.',
    'Bom pra quem roda muito e passa horas no carro.',
    'Pequeno upgrade que muda a rotina no volante.',
  ]),

  /* ---------------- papelaria e esporte ---------------- */
  T('caderno_planner', 'cadernos?|planners?|agendas?|fich[aá]rio|blocos?\\s+de\\s+notas', [
    'Ano novo de estudo pede caderno novo.',
    'Planner bonito dá vontade de organizar a semana.',
    'Bom pra quem anota tudo e não confia na memória.',
    'Mesa organizada começa pela agenda.',
  ]),
  T('material_escolar', 'canetas?|l[aá]pis|marca[- ]?textos?|estojo|borrachas?|apontador|material\\s+escolar|kit\\s+escolar|lapiseira|post[- ]?it', [
    'Estojo completo pra volta às aulas.',
    'Pra quem estuda e sublinha o livro inteiro.',
    'Material renovado dá outra vontade de estudar.',
    'Daqueles que somem de casa misteriosamente.',
  ]),
  T('escritorio', 'etiquetadora|rotulador|organizador\\s+de\\s+mesa|quadro\\s+(?:branco|de\\s+corti[cç]a|magn[eé]tico)|suporte\\s+(?:para\\s+)?notebook|apoio\\s+de\\s+p[eé]s|cartuchos?\\s+de\\s+tinta|toner|refil\\s+de\\s+tinta|papel\\s+(?:sulfite|a4|fotogr[aá]fico)|grampeador|fragmentadora', [
    'Mesa de home office organizada rende mais no dia.',
    'Pra parar de procurar pasta e cabo toda manhã.',
    'Gaveta e prateleira etiquetadas é outro nível de organização.',
    'Bom pra escritório de casa ficar com cara de escritório.',
    'Daqueles itens que você usa toda semana sem perceber.',
  ]),
  T('arte', 'aquarela|tintas?\\s+(?:guache|acr[ií]lica|a\\s+[oó]leo)|l[aá]pis\\s+de\\s+cor|brush\\s*pen|posca|lettering|telas?\\s+para\\s+pintura|sketchbook', [
    'Pra projeto criativo de fim de semana.',
    'Quem desenha sabe o valor de um material bom.',
    'Bom pra começar a pintar sem complicar.',
    'Presente certeiro pra quem é da arte.',
  ]),
  T('fitness', 'halter|halteres|anilhas?|kettlebell|el[aá]sticos?\\s+(?:extensor|de\\s+resist[eê]ncia)|tapete\\s+de\\s+yoga|colchonete|corda\\s+de\\s+pular|caneleiras?|faixa\\s+el[aá]stica|banco\\s+de\\s+supino|bicicleta\\s+ergom[eé]trica|esteira', [
    'Treino em casa sem desculpa de academia lotada.',
    'Pra quem começou a treinar e quer montar o cantinho.',
    'Academia em casa começa por um desses.',
    'Bom pra manter o treino nos dias corridos.',
  ]),
  T('bike', 'bicicleta|bike|patinete', [
    'Rolê de fim de semana sobre duas rodas.',
    'Pra trocar o ônibus por pedal nos dias de sol.',
    'Bom pra quem quer se mexer sem academia.',
    'Passeio com a família no parque fica outro.',
  ]),
];

// Fechos de preço por contexto (vão depois de uma abertura de tipo ou de um fato do produto).
// Concretos sobre a oferta, sem número; neutro não elogia preço (validarCopy barra).
const FECHOS_PRECO = {
  // Sem queda verificada: não elogia o preço, só convida a conferir (o preço do post foi checado na loja).
  neutro: [
    'Preço conferido na loja agora.',
    'Valor checado na hora do post.',
    'Vale abrir pra ver os detalhes.',
    'Abre pra conferir as opções.',
    'Preço atual conferido no anúncio.',
    'Dá uma olhada com calma no anúncio.',
  ],
  queda: [
    'Tá abaixo do preço de antes.',
    'Baixou em relação ao que custava.',
    'Ficou mais em conta que antes.',
    'Preço caiu em relação à referência.',
    'Saiu do preço de sempre.',
    'Bom momento pra pegar.',
  ],
  forte: [
    'Desconto gordo pra quem tava de olho.',
    'A diferença pro preço de antes é grande.',
    'Queda grande, dá pra sentir no bolso.',
    'Desconto dos grandes, vale a olhada.',
    'Caiu bem em relação ao preço cheio.',
  ],
  cupom: [
    'Com o cupom fica mais leve.',
    'O cupom derruba mais um pouco o preço.',
    'Aplica o cupom e o valor final cai.',
    'Cupom ativo deixa a conta menor.',
    'O cupom faz a diferença no fim.',
  ],
};

// Produto fora da base (sem tipo e sem fato lido): a frase fala da oferta, não do produto.
const FRASES_PRECO = {
  forte: [
    'Desconto gordo em relação ao preço de antes, vale a olhada.',
    'Queda grande no preço, daquelas que dá pra sentir no bolso.',
    'A diferença pro preço cheio tá grande nesse.',
    'Baixou bem em relação ao que vinha custando na loja.',
    'Preço bem abaixo do de antes, conferido na loja.',
    'Desconto dos grandes pra quem tava esperando baixar.',
    'Caiu bastante em relação à referência da loja.',
    'Daqueles descontos que fazem valer o clique.',
    'Diferença grande pro preço de antes.',
    'Preço bem menor que o de referência.',
    'Queda das boas no preço desse.',
    'Desconto que dá gosto de ver.',
  ],
  queda: [
    'Baixou em relação ao preço de antes, vale a conferida.',
    'Tá abaixo do que vinha custando na loja.',
    'Preço mais baixo que o de antes, conferido na loja.',
    'Saiu do preço de sempre, bom momento pra olhar.',
    'Ficou mais em conta que o preço de referência.',
    'Preço caiu em relação à referência, vale a olhada.',
    'Pra quem tava esperando baixar, baixou.',
    'Momento bom pra quem tava de olho nesse.',
    'Baixou e vale a conferida antes de decidir.',
    'Tá saindo abaixo do preço de antes na loja.',
    'Preço menor que o de antes, conferido agora.',
    'Caiu um pouco em relação à referência da loja.',
    'Pra quem esperava baixar, o preço ajudou.',
    'Ficou mais em conta que antes na loja.',
  ],
  cupom: [
    'Com o cupom o valor final fica mais leve.',
    'O cupom faz a diferença no preço final desse.',
    'Aplica o cupom e o preço cai mais um pouco.',
    'Cupom ativo deixa a conta menor no fim.',
    'Vale usar o cupom: o valor final muda bastante.',
    'Com o cupom fica bem mais interessante.',
    'O cupom ajuda a baixar o preço final.',
    'Cupom aplicado e o preço muda de figura.',
    'Com o cupom o valor final cai de verdade.',
    'Vale aplicar o cupom antes de fechar.',
    'Cupom ativo: confere o valor final no carrinho.',
    'O cupom deixa esse bem mais em conta.',
  ],
  neutro: [
    'Preço conferido na loja na hora do post.',
    'Valor checado agora há pouco direto na loja.',
    'Preço atual conferido na página da loja.',
    'Achado conferido na loja, vale abrir pra ver os detalhes.',
    'Conferido na loja agora: abre pra ver as opções.',
    'Preço de agora, checado direto no anúncio.',
    'Encontrei na loja agora, abre pra ver se é o que você procura.',
    'Conferido no anúncio: vale ver as fotos e as opções.',
    'Achado do garimpo com preço checado na loja.',
    'Separei esse pra quem tava procurando.',
    'Abre o anúncio pra ver os detalhes antes de decidir.',
    'Conferido agora na loja, sem surpresa no preço do post.',
    'Preço checado no anúncio antes de postar.',
    'Vale abrir e ver as fotos com calma.',
    'Separado do garimpo de hoje, preço conferido.',
    'Achado do dia, conferido direto na loja.',
    'Abre pra ver tamanhos, cores e detalhes.',
    'Preço do anúncio conferido agora há pouco.',
    'Conferi o preço na loja antes de mandar.',
    'Achado do garimpo pra quem tava procurando esse.',
    'Vale a olhada: preço checado no anúncio.',
    'Conferido na loja: abre e vê se combina com você.',
    'Garimpo de hoje, com preço checado.',
    'Preço checado: vale ver se é o que você precisa.',
    'Abre o anúncio e confere as opções disponíveis.',
    'Mais um do garimpo, conferido na loja.',
  ],
};

// Produto fora da base e sem desconto: abertura de garimpo + fecho neutro (FECHOS_PRECO.neutro).
const ABERTURAS_GARIMPO = [
  'Separei esse no garimpo de hoje.', 'Achado do dia pra quem tava procurando.', 'Esse apareceu no garimpo agora.', 'Mais um do garimpo de hoje.',
  'Achei esse rodando as lojas hoje.', 'Garimpo do dia trouxe esse.', 'Esse chamou atenção no garimpo.', 'Pra quem tava procurando um desses.',
  'Esse entrou na seleção de hoje.', 'Achado novo na seleção.', 'Separado pra quem curte esse tipo de produto.', 'Esse veio do garimpo de agora.',
  'Seleção de hoje tem esse.', 'Achei e separei pra vocês.', 'Esse aqui passou no garimpo.',
];

/** Tipo do produto pelo título (o primeiro da base que bate), ou null. */
function tipoProduto(titulo) {
  const t = String(titulo || '');
  if (!t) return null;
  for (const tp of TIPOS) {
    if (tp.re.test(t) && !(tp.nao && tp.nao.test(t))) return tp;
  }
  return null;
}

module.exports = { TIPOS_PRODUTO: TIPOS, FECHOS_PRECO, FRASES_PRECO, ABERTURAS_GARIMPO, tipoProduto };
