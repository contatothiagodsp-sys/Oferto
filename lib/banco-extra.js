'use strict';
// Expansão do banco dos nichos curados (K-pop, perfumaria, livros) e dos sensíveis (saúde, cuidado adulto,
// suplementos, combos). lib/tom.js soma estas listas às do BANCO/COMBO na carga (aplicarBancoExtra).
// Aberturas × fechos multiplicam a variedade; as regras de conformidade de cada nicho continuam valendo
// (validarCopy barra promessa de saúde/resultado, performance de perfume, urgência e jargão).
// Placeholders: {grupo}, {fandom}, {bastao} (K-pop). Puro e sem I/O.

const BANCO_EXTRA = {
  kpop: {
    album: {
      neutro: [
        '{fandom}, esse merece lugar de destaque na estante.',
        'Cada versão do {grupo} conta uma história diferente na coleção.',
        'Pra quem guarda cada era do {grupo} com carinho.',
        'Se você é {fandom}, já sabe que esse não pode faltar.',
        'Pra quem coleciona {grupo} desde o começo.',
        'Esse do {grupo} fica lindo do lado dos outros na estante.',
        'Presente certeiro pra amiga que é {fandom}.',
        'Pra fã do {grupo} que ama abrir álbum com calma.',
        '{fandom} de verdade sabe o que é ter esse em mãos.',
        'Pra quem acompanha o {grupo} desde o debut.',
        'Álbum físico do {grupo} é lembrança que fica.',
        'Pra estante de {fandom} ficar ainda mais bonita.',
        'Abrir álbum do {grupo} com a música tocando é outro momento.',
        'Daqueles do {grupo} que todo {fandom} quer na coleção.',
      ],
      queda: [
        '{fandom}, baixou o do {grupo}: hora de completar a coleção.',
        'Esse do {grupo} nesse valor é difícil de deixar passar.',
        'Álbum do {grupo} com preço desses? A estante agradece.',
        'Pra {fandom} que tava esperando baixar pra garantir.',
        'Baixou o álbum do {grupo}, {fandom}.',
        'Quem tava de olho nesse do {grupo}, o preço ajudou.',
        'Coleção do {grupo} cresce sem culpa nesse valor.',
      ],
      cupom: [
        '{fandom}, com o cupom esse do {grupo} sai mais leve.',
        'O cupom ajuda a trazer o {grupo} pra estante.',
        'Com o cupom, dá pra completar a coleção do {grupo}.',
        'Usa o cupom e garante esse do {grupo}, {fandom}.',
      ],
    },
    lightstick: {
      neutro: [
        '{fandom}, lightstick do {grupo} é daqueles que a gente guarda com carinho.',
        'Pra levantar o lightstick junto com o fandom no próximo show.',
        'Show do {grupo} pede lightstick carregado.',
        'Lightstick do {grupo} é lembrança de show que fica na estante.',
        'Pra quem sonha em ver o {grupo} ao vivo e quer chegar preparado.',
        'Mar de luz no show do {grupo} começa no seu lightstick.',
        'Pra quem vai no show e quer fazer parte do mar de luz.',
      ],
      queda: [
        '{fandom}, o lightstick do {grupo} baixou.',
        'Nesse valor o lightstick do {grupo} fica bem mais perto.',
        'Baixou o lightstick: já separa pro próximo show do {grupo}.',
      ],
    },
    colecionavel: {
      neutro: [
        'Pra guardar cada card do {grupo} com o cuidado que merece.',
        'Coleção do {grupo} organizada fica outra coisa.',
        '{fandom}, isso aqui é pra coleção ficar impecável.',
        'Mimo de fã pra fã do {grupo}.',
        'Item de coleção que todo {fandom} entende.',
      ],
    },
    geral: {
      neutro: [
        'Achado pra quem vive de K-pop.',
        'Presente certeiro pra quem é do K-pop.',
        'Coleção de K-pop ganhando mais um item.',
        'Pra quem acompanha os grupos de perto.',
        'Pra estante de quem vive o K-pop.',
      ],
    },
  },
  perfumes: {
    arabe: {
      neutro: [
        'Perfumaria árabe é daquelas que conquista quem gosta de pegada marcante.',
        'Pra coleção de quem curte perfumaria árabe.',
        'Pra quem tá começando a explorar a perfumaria árabe.',
        'Mais um árabe que costuma chamar atenção na prateleira.',
      ],
      queda: ['Árabe nesse valor é a deixa pra aumentar a coleção.', 'Quem tava esperando esse árabe baixar, chegou a hora.'],
    },
    nicho: {
      neutro: ['Pra quem gosta de perfume que foge do comum.', 'Perfumaria de nicho é pra quem coleciona com calma.', 'Pra prateleira de quem leva perfume a sério.'],
      queda: ['Nicho nesse valor é a deixa pra coleção.', 'Pra quem esperava a hora certa de trazer esse pra coleção.'],
    },
    geral: {
      neutro: ['Pra quem gosta de variar de perfume conforme a ocasião.', 'Presente certeiro pra quem ama perfume.', 'Pra renovar a prateleira de perfumes.'],
      queda: ['Perfume nesse valor é presente fácil de acertar o preço.', 'Baixou, e é a deixa pra renovar a prateleira.'],
    },
  },
  saude: {
    geral: {
      neutro: [
        'Daqueles itens que é bom ter em casa antes de precisar.',
        'Pra caixinha de cuidados de casa ficar completa.',
        'Item prático pra rotina de cuidados do dia a dia.',
        'Bom ter à mão em casa ou na bolsa.',
        'Pra quem gosta de deixar a casa preparada.',
        'Pra rotina de cuidados não ficar pela metade.',
      ],
      queda: ['Nesse valor vale deixar um em casa.', 'Baixou: bom momento pra completar a caixinha de cuidados.'],
      cupom: ['Com o cupom, a reposição fica mais leve.'],
    },
  },
  suplementos: {
    geral: {
      neutro: ['Pra rotina de treino não ficar pela metade.', 'Reposição do pote antes de acabar.', 'Pra quem já tem a rotina definida e só quer repor.'],
      queda: ['Nesse valor dá pra garantir a reposição com folga.', 'Baixou bem pra quem toma todo dia.'],
    },
  },
  cuidado: {
    geral: {
      neutro: ['Pra rotina de cuidado em casa ficar mais tranquila.', 'Bom ter de reserva pra não faltar na semana.', 'Reposição discreta pra quem cuida de alguém em casa.'],
      queda: ['Nesse valor vale reforçar o estoque.', 'Baixou: bom momento pra repor com folga.'],
    },
  },
  combo: {
    geral: {
      neutro: ['Dois itens resolvidos numa compra só.', 'Pra quem ia comprar os dois de qualquer jeito.', 'Kit pronto, sem ficar procurando item por item.'],
      queda: ['O combo nesse valor sai melhor que levar separado.', 'Baixou o conjunto: resolve tudo de uma vez.'],
    },
  },
};

// Aberturas e fechos extras (somados aos do COMBO). Nichos sem COMBO ganham um.
const COMBO_EXTRA = {
  kpop: {
    fechos: {
      neutro: ["Fica a dica pros fãs.","Manda pra amiga do fandom.","Vale abrir pra ver as versões.","Confere as versões disponíveis.","Bom de deixar separado.","Salva pra não esquecer.","Coleção agradece.","Já separa um cantinho na estante.", "Fã de verdade reconhece.", "Vale abrir pra ver os detalhes.", "Já marca a amiga do fandom.", "Estante agradece.", "Confere as fotos no anúncio.", "Fica a dica pra coleção."],
      queda: ["Tá abaixo do preço de antes.","Baixou em relação ao que custava.","Bom momento pra garantir.","A coleção cresce gastando menos.","Preço caiu, coleção comemora.","Saiu do preço de sempre.", "Ficou mais em conta que antes.", "Preço menor que o de referência.", "A estante cresce gastando menos.", "Caiu em relação à referência."],
      cupom: ["Com o cupom fica mais leve.","O cupom ajuda a coleção.","Aplica o cupom e garante.","Cupom ativo deixa a conta menor.","Com o cupom cabe no mês.", "O cupom deixa mais em conta.", "Vale aplicar o cupom antes.", "Cupom ajuda a fechar a coleção.", "Com o cupom o valor final cai."],
    },
    subs: {
      album: [
        '{fandom}, chegou a vez desse.',
        'Pra coleção do {grupo} não ficar com buraco.',
        'Pra quem guarda todas as eras do {grupo}.',
        'Esse do {grupo} é presente certo pra {fandom}.',
        'Alô, {fandom} que coleciona!',
        'O {grupo} na sua estante, do jeito que tem que ser.',
        'Fã do {grupo} sabe o que esse significa.',
        'Mais um do {grupo} pra coleção.',
        'Pra quem acompanha o {grupo} de perto.',
        '{fandom}, a estante tá chamando.',
        'Pra {fandom} que ama abrir álbum.',
        'Esse do {grupo} completa a fileira na estante.',
        'Do debut até hoje, coleção do {grupo} pede esse.',
        '{fandom}, esse é pra quem guarda cada lançamento.',
        'Pra quem acompanha cada comeback do {grupo}.',
        'O {grupo} merece espaço de honra na estante.',
        'Álbum do {grupo} é presente que fã nunca esquece.',
        '{fandom}, pra coleção ficar do jeitinho que você quer.',
        'Esse do {grupo} é daqueles que a gente abre com cuidado.',
        'Pra quem já tem o resto da discografia do {grupo}.',
        'Fã do {grupo} reconhece esse de longe.',
        '{fandom}, mais um pra contar na coleção.',
        'Pra estante de quem acompanha o {grupo} de verdade.',
        'Abrir esse do {grupo} é momento de fã.',
        'Pra quem tá montando a coleção do {grupo} aos poucos.',
        '{fandom}, a coleção do {grupo} agradece.',
        'Esse do {grupo} fecha a coleção bonito.',
      ],
      lightstick: [
        '{fandom}, o {bastao} chegou por aqui.',
        'Pra levantar o {bastao} no próximo show.',
        'Show do {grupo} pede {bastao} carregado.',
        'Pra quem quer fazer parte do mar de luz do {grupo}.',
        'Pra chegar no show do {grupo} preparado.',
        '{fandom}, show sem lightstick não é a mesma coisa.',
        'Pra brilhar junto com o fandom no próximo show do {grupo}.',
        'Lightstick do {grupo} é item de fã que dura anos.',
        'Pra quem guarda o lightstick do {grupo} como relíquia.',
        '{fandom}, o próximo show pede luz na mão.',
        'Pra decorar a estante até o próximo show.',
        'Presente certo pra quem é {fandom}.',
        'Mar de luz do {grupo} precisa do seu também.',
      ],
      colecionavel: [
        'Pra coleção do {grupo} ficar impecável.',
        '{fandom}, isso aqui é pra quem cuida da coleção.',
        'Card do {grupo} merece lugar de respeito.',
        'Coleção organizada é coleção que dá orgulho.',
        'Pra guardar os cards do {grupo} sem amassar.',
        '{fandom}, coleção cuidada é coleção feliz.',
        'Pra quem troca card do {grupo} com a galera.',
        'Mimo de coleção pra fã do {grupo}.',
        'Pra coleção do {grupo} ficar à vista com carinho.',
        'Detalhe de coleção que todo {fandom} entende.',
      ],
    },
  },
  perfumes: {
    fechos: {
      neutro: ["Vale conhecer a proposta antes.","Bom de deixar na lista de desejos.","Confere as notas no anúncio.","Fica a dica pra prateleira.","Manda pra quem também curte perfume.", "Abre pra ver a família olfativa.", "Vale a olhada com calma.", "Já salva pra não esquecer.", "Confere o tamanho do frasco.", "Fica a dica pra quem coleciona."],
      queda: ["Tá abaixo do preço de antes.","Baixou em relação ao que custava.","Bom momento pra trazer pra coleção.","Saiu do preço de sempre.","A prateleira agradece.", "Ficou mais em conta que antes.", "Caiu em relação à referência.", "Preço menor que o de antes.", "A coleção agradece."],
      cupom: ["Com o cupom fica mais leve.","O cupom ajuda a trazer pra coleção.","Aplica o cupom e o valor cai.", "O cupom deixa mais em conta.", "Vale aplicar o cupom antes.", "Com o cupom o valor final cai."],
    },
    subs: {
      arabe: ['Perfumaria árabe é presente certeiro pra quem coleciona.',
 'Pra quem gosta de perfume que chama atenção.',
 'Árabe é a porta de entrada de muita coleção.',
 'Pra prateleira de quem vive testando perfume.',
 'Pra quem gosta de pegada marcante e diferente.',
 'Árabe que costuma aparecer nas listas de favoritos.', 'Pra quem curte perfumaria árabe.', 'Árabe na prateleira é sempre bem-vindo.', 'Pra coleção de árabes ganhar mais um.', 'Pra quem gosta de pegada marcante.'],
      nicho: ['Perfume de nicho é escolha de quem conhece.',
 'Pra quem quer um perfume que ninguém do lado usa.',
 'Pra prateleira de colecionador.',
 'Nicho é presente pra quem já tem de tudo.',
 'Pra quem gosta de perfume com personalidade.', 'Pra quem gosta de perfume que foge do óbvio.', 'Pra prateleira de quem coleciona com calma.', 'Nicho é pra quem quer algo diferente.'],
      geral: ['Perfume é presente que sempre agrada quem gosta.',
 'Pra trocar o perfume de sempre por um novo.',
 'Pra ter uma opção pro dia e outra pra noite.',
 'Pra prateleira ganhar mais um.',
 'Pra quem gosta de variar de perfume.',
 'Perfume certo é o toque final do look.', 'Pra quem ama perfume.', 'Pra renovar a prateleira.', 'Pra variar de perfume conforme a ocasião.', 'Presente fácil de acertar.'],
    },
  },
  livros: {
    fechos: {
      neutro: ["Fica a dica pra fila de leitura.","Bom de deixar na lista de desejos.","Confere a edição no anúncio.","Manda pra quem também ama ler.","Já separa um lugar na estante.", "Vale a olhada com calma.", "Já salva pra não esquecer.", "Confere o volume no anúncio.", "Fica a dica pra estante.", "Bom de deixar anotado."],
      queda: ["Tá abaixo do preço de antes.","Baixou em relação ao que custava.","Bom momento pra garantir.","A estante agradece.","Saiu do preço de sempre.", "Ficou mais em conta que antes.", "Caiu em relação à referência.", "Preço menor que o de antes.", "A coleção cresce gastando menos."],
      cupom: ["Com o cupom fica mais leve.","O cupom ajuda a estante crescer.","Aplica o cupom e garante.", "O cupom deixa mais em conta.", "Vale aplicar o cupom antes.", "Com o cupom o valor final cai."],
    },
    subs: {
      manga: ['Volume novo é o melhor motivo pra parar tudo e ler.',
 'Pra coleção de mangá não ficar com buraco na estante.',
 'Pra quem lê mangá no ônibus e em casa.',
 'Mais um pra maratona de leitura.', 'Coleção de mangá não pode ficar com volume faltando.', 'Pra quem tá acompanhando a série volume a volume.', 'Estante de mangá ganhando mais um.', 'Pra maratona de leitura no fim de semana.'],
      box: ['Box é a coleção inteira de uma vez na estante.', 'Pra quem quer ler a saga sem esperar.', 'Presente certeiro pra quem ama ler.', 'Estante bonita começa por um box desses.'],
      negocios: ['Pra quem quer aprender no tempo livre.', 'Leitura boa pro caminho do trampo.', 'Pra lista de leitura do ano.', 'Presente certeiro pra quem gosta de crescer na carreira.'],
      infantil: ['Hora da história antes de dormir ganha mais um.', 'Pra criançada pegar gosto pela leitura.', 'Presente que vira lembrança de infância.', 'Leitura em família no fim de semana.'],
      ficcao: ['Pra quem tava procurando a próxima leitura.',
 'Livro bom é o melhor programa de fim de semana.',
 'Daqueles que viram assunto com os amigos.',
 'Pra mesinha de cabeceira.', 'Pra quem precisa da próxima leitura.', 'Daqueles que você não consegue largar.', 'Pra fila de leitura andar.', 'Pra fim de semana com livro na mão.'],
      geral: ['Pra fila de leitura andar.', 'Estante ganhando mais um.', 'Presente certeiro pra quem ama ler.'],
    },
  },
  cuidado: {
    subs: {
      geral: [
        'Reposição do cuidado em casa sem correria.',
        'Pra rotina de cuidado não ficar sem estoque.',
        'Bom ter de reserva no armário.',
        'Pra quem cuida de alguém em casa.',
        'Item da lista do mês pra riscar de uma vez.',
        'Pra não precisar sair correndo na farmácia.',
        'Reposição discreta e sem complicação.',
        'Estoque em dia é uma preocupação a menos.',
      ],
    },
    fechos: {
      neutro: ['Vale deixar anotado.', 'Fica a dica.', 'Dá uma olhada com calma.'],
      queda: ['Nesse valor vale repor com folga.', 'Baixou e vale reforçar o estoque.', 'Bom momento pra repor.'],
      cupom: ['Com o cupom a reposição fica mais leve.', 'O cupom ajuda no estoque do mês.'],
    },
  },
  saude: {
    subs: {
      geral: [
        'Daqueles itens que é bom ter em casa antes de precisar.',
        'Pra caixinha de cuidados de casa ficar completa.',
        'Bom ter à mão em casa ou na bolsa.',
        'Pra quem gosta de deixar a casa preparada.',
        'Item prático pra rotina de cuidados.',
        'Pra deixar no armário do banheiro.',
        'Daqueles que você só lembra quando precisa.',
        'Pra rotina de cuidados ficar completa.',
        'Pra kit de viagem e bolsa.',
        'Item de casa que vale ter de reserva.',
        'Pra deixar na gaveta da cozinha.',
        'Item que toda casa deveria ter.',
        'Pra levar na mala de viagem.',
        'Bom ter um no carro e outro em casa.',
        'Pra casa com criança ou idoso.',
        'Pra caixinha de primeiros cuidados.',
        'Daqueles que você agradece por ter em casa.',
        'Pra organizar os cuidados da família.',
        'Item de casa que não pode faltar no armário.',
        'Pra quem cuida da família de perto.',
      ],
    },
    fechos: {
      neutro: ['Vale deixar anotado.', 'Fica a dica.', 'Dá uma olhada com calma.', 'Preço conferido na loja agora.'],
      queda: ['Nesse valor vale deixar um em casa.', 'Baixou e vale a reposição.', 'Bom momento pra completar o kit.', 'Tá abaixo do preço de antes.'],
      cupom: ['Com o cupom fica mais leve.', 'O cupom ajuda na reposição.', 'Aplica o cupom e o valor cai.'],
    },
  },
  suplementos: {
    subs: {
      geral: [
        'Pote no fim é sinal de reposição.',
        'Pra rotina de treino seguir sem pausa.',
        'Reposição do mês sem sair procurando.',
        'Pra quem já sabe o que toma e só quer repor.',
        'Pra deixar o próximo pote separado.',
        'Daqueles que acabam e a gente só percebe na última colher.',
      ],
    },
    fechos: {
      neutro: ['Vale deixar anotado.', 'Dá uma olhada com calma.'],
      queda: ['Nesse valor dá pra repor com folga.', 'Baixou e vale a reposição.', 'Bom momento pra garantir o próximo.'],
      cupom: ['Com o cupom a reposição sai mais leve.', 'O cupom ajuda no pote do mês.'],
    },
  },
  combo: {
    subs: {
      geral: [
        'Dois itens resolvidos numa compra só.',
        'Pra quem ia comprar os dois de qualquer jeito.',
        'Kit pronto, sem procurar item por item.',
        'Conjunto que resolve tudo de uma vez.',
        'Combo pensado pra usar junto.',
        'Leva tudo numa tacada só.',
        'Pra presente completo sem montar nada.',
        'Um pedido só e tá resolvido.',
        'Pra quem quer resolver tudo de uma vez.',
        'Conjunto que já vem completo.',
        'Kit que poupa tempo de procurar.',
        'Tudo junto no mesmo pacote.',
        'Presente completo sem montar nada.',
        'Combinação pensada pra funcionar junto.',
        'Pra começar com tudo que precisa.',
        'Os itens que andam juntos, num pacote só.',
        'Kit completo pra quem não quer comprar picado.',
        'Dois em um que poupa tempo.',
        'Conjunto pronto pra usar no mesmo dia.',
        'Pra presentear com tudo junto.',
        'Combo que já resolve o que você ia montar.',
        'Leva o conjunto e esquece de procurar.',
        'Kit pensado pra não faltar nada.',
        'Pra montar tudo de uma vez.',
      ],
    },
    fechos: {
      neutro: ['Vale abrir pra ver o que vem no kit.', 'Dá uma olhada no que vem junto.', 'Confere os itens do conjunto.', 'Preço conferido na loja agora.', 'Abre pra ver os detalhes do kit.', 'Fica a dica.', 'Vale a olhada com calma.'],
      queda: ['Nesse valor o conjunto sai melhor que separado.', 'Baixou o combo inteiro.', 'Tá abaixo do preço de antes.', 'Saiu do preço de sempre.', 'Bom momento pra levar o kit.', 'Ficou mais em conta que antes.'],
      cupom: ['Com o cupom o kit fica mais leve.', 'O cupom derruba o valor do conjunto.', "Aplica o cupom e o conjunto fica mais leve.", "Cupom ativo deixa o kit mais em conta.", "Vale aplicar o cupom antes.", "Com o cupom o valor final cai."],
    },
  },
};

// Perfumes conhecidos: proposta/ocasião pela qual são famosos (sem performance, sem prometer acerto).
const PERFUMES_CONHECIDOS = [
  [/\bkhamrah\b/i, 'Khamrah', 'adocicada e especiada', 'noite e dias frios'],
  [/\basad\b/i, 'Asad', 'amadeirada e especiada', 'noite'],
  [/\byara\b/i, 'Yara', 'adocicada e cremosa', 'dia a dia'],
  [/\b9\s*pm\b/i, '9PM', 'adocicada e marcante', 'balada e noite'],
  [/\bclub\s+de\s+nuit\b/i, 'Club de Nuit', 'amadeirada e cítrica', 'ocasião especial'],
  [/\bsauvage\b/i, 'Sauvage', 'fresca e apimentada', 'dia a dia'],
  [/\bbleu\s+de\s+chanel\b/i, 'Bleu de Chanel', 'amadeirada e fresca', 'trabalho e dia a dia'],
  [/\b212\s+vip\b/i, '212 VIP', 'adocicada', 'balada'],
  [/\b1\s*million\b/i, '1 Million', 'adocicada e especiada', 'noite'],
  [/\binvictus\b/i, 'Invictus', 'fresca e adocicada', 'dia a dia'],
  [/\bphantom\b(?=.{0,30}\b(?:paco|rabanne|edt|parfum|perfume)\b)|\bpaco\s+rabanne\s+phantom\b/i, 'Phantom', 'fresca com lavanda', 'dia a dia'],
  [/\bmalbec\b/i, 'Malbec', 'amadeirada clássica', 'ocasião especial'],
  [/\bkaiak\b/i, 'Kaiak', 'fresca', 'dia a dia'],
  [/\begeo\b/i, 'Egeo', 'adocicada e jovem', 'dia a dia'],
  [/\bla\s+vie\s+est\s+belle\b/i, 'La Vie est Belle', 'adocicada', 'ocasião especial'],
  [/\bgood\s+girl\b/i, 'Good Girl', 'adocicada e intensa', 'noite'],
  [/\blight\s+blue\b/i, 'Light Blue', 'cítrica e fresca', 'verão'],
  [/\bacqua\s+di\s+gi[oò]\b/i, 'Acqua di Giò', 'fresca e aquática', 'verão e dia a dia'],
  [/\bck\s+one\b/i, 'CK One', 'cítrica e leve', 'dia a dia'],
  [/\ble\s+male\b/i, 'Le Male', 'adocicada com lavanda', 'noite'],
  [/\bcloud\b(?=.{0,30}\b(?:ariana|edp|eau|perfume)\b)|\bariana\s+grande\s+cloud\b/i, 'Cloud', 'adocicada e cremosa', 'dia a dia'],
  [/\bcoco\s+mademoiselle\b/i, 'Coco Mademoiselle', 'floral e elegante', 'ocasião especial'],
  [/\bborn\s+in\s+roma\b/i, 'Born in Roma', 'adocicada', 'noite'],
];

const FRASES_PERFUME_CONHECIDO = {
  neutro: [
    'O {p} é conhecido pela pegada {pegada}, bom pra {ocasiao}.',
    'Quem curte perfume de pegada {pegada} costuma ter o {p} na lista.',
    'Pegada {pegada}: o {p} é queridinho pra {ocasiao}.',
    'Pra quem gosta de perfume pra {ocasiao}, o {p} tem pegada {pegada}.',
  ],
  queda: [
    'O {p} nesse valor é a deixa pra quem curte pegada {pegada}.',
    'Queridinho pra {ocasiao}, o {p} baixou.',
    'Pegada {pegada} e preço abaixo do de antes: o {p} tá esperando na lista.',
  ],
  cupom: ['Com o cupom, o {p} fica mais perto de quem curte pegada {pegada}.'],
};

/** Perfume conhecido do título → frases com a proposta/ocasião (ctx: neutro|queda|cupom). */
function frasesPerfumeConhecido(titulo, ctx) {
  const t = String(titulo || '');
  const hit = PERFUMES_CONHECIDOS.find(([re]) => re.test(t));
  if (!hit) return [];
  const [, p, pegada, ocasiao] = hit;
  const lista = (ctx !== 'neutro' ? (FRASES_PERFUME_CONHECIDO[ctx] || FRASES_PERFUME_CONHECIDO.queda) : []).concat(FRASES_PERFUME_CONHECIDO.neutro);
  return lista.map((f, i) => ({ texto: f.replace(/\{p\}/g, p).replace(/\{pegada\}/g, pegada).replace(/\{ocasiao\}/g, ocasiao), modelo: `perfume:${i}:${f.slice(0, 12)}` }));
}

/** Soma o banco extra ao BANCO/COMBO do tom.js (muta os objetos recebidos). */
function aplicarBancoExtra(BANCO, COMBO) {
  for (const [nicho, subs] of Object.entries(BANCO_EXTRA)) {
    BANCO[nicho] = BANCO[nicho] || {};
    for (const [sub, ctxs] of Object.entries(subs)) {
      BANCO[nicho][sub] = BANCO[nicho][sub] || {};
      for (const [ctx, lista] of Object.entries(ctxs)) {
        BANCO[nicho][sub][ctx] = (BANCO[nicho][sub][ctx] || []).concat(lista);
      }
    }
  }
  for (const [nicho, extra] of Object.entries(COMBO_EXTRA)) {
    COMBO[nicho] = COMBO[nicho] || { fechos: {}, subs: {} };
    const c = COMBO[nicho];
    c.subs = c.subs || {};
    for (const [sub, aberturas] of Object.entries(extra.subs || {})) {
      c.subs[sub] = c.subs[sub] || { aberturas: [] };
      c.subs[sub].aberturas = (c.subs[sub].aberturas || []).concat(aberturas);
    }
    if (extra.fechos) {
      c.fechos = c.fechos || {};
      for (const [ctx, lista] of Object.entries(extra.fechos)) c.fechos[ctx] = (c.fechos[ctx] || []).concat(lista);
    }
  }
}

module.exports = { BANCO_EXTRA, COMBO_EXTRA, PERFUMES_CONHECIDOS, frasesPerfumeConhecido, aplicarBancoExtra };
