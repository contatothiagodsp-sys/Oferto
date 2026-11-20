'use strict';
// Expansão combinatória da base por tipo de produto (lib/tipos-produto.js).
//
// Para cada tipo: o nome do item com gênero, "dores" (situação-problema real de quem compra, frase completa)
// e "usos" (momento de uso, sem pontuação no fim). lib/tom.js combina:
//   dor + CONCLUSOES_DOR  → "Bateria pedindo arrego antes do almoço? Um celular novo resolve isso."
//   uso + CONCLUSOES_USO  → "Pra maratona de série no domingo, uma TV boa faz toda a diferença."
// Cada tipo rende 100+ frases além das aberturas, e a memória anti-repetição gira entre elas.
//
// Regras: sem número, preço, urgência, promessa de resultado ou jargão (validarCopy barra o resto).
// Puro e sem I/O.

// item: [gênero 'm'|'f', nome com o artigo cortado]. dores: frases completas. usos: "Pra …" sem ponto.
const EXTRA = {
  /* ---------------- higiene ---------------- */
  escova_eletrica: { item: ['f', 'escova elétrica'],
    dores: ['Escovação corrida de manhã antes do trampo?', 'Escova manual com as cerdas abertas em semanas?', 'Criança que enrola pra escovar os dentes?', 'Sensação de que a escovação nunca fica completa?'],
    usos: ['Pra rotina da manhã render mais', 'Pra quem quer caprichar na escovação sem esforço', 'Pra deixar no banheiro da casa toda', 'Pra levar na mala de viagem'] },
  creme_dental: { item: ['m', 'creme dental'],
    dores: ['Tubo no osso e ninguém lembrou de comprar?', 'Aquela espremida no fim do tubo de novo?', 'Banheiro de visita sem pasta na pia?', 'Família toda dividindo o último tubo?', 'Mala pronta e cadê a pasta de dente?'],
    usos: ['Pra deixar reserva no armário do banheiro', 'Pra kit de viagem e nécessaire', 'Pra casa com muita gente escovando', 'Pra não depender da farmácia no domingo'] },
  escova_dente: { item: ['f', 'escova nova'],
    dores: ['Cerda aberta igual vassoura?', 'Faz quanto tempo que ninguém troca a escova?', 'Visita chegou e não tem escova reserva?', 'Escova da criança já toda mastigada?'],
    usos: ['Pra trocar a escova da casa toda de uma vez', 'Pra kit de viagem', 'Pra deixar reserva no armário', 'Pra visita que dorme em casa'] },
  bucal_outros: { item: ['m', 'item de reposição'],
    dores: ['Fio dental acabou bem na hora?', 'Rotina do banheiro pela metade porque faltou um item?', 'Só lembrou que acabou quando abriu a gaveta?', 'Enxaguante no fim e a lista do mercado esqueceu?'],
    usos: ['Pra rotina do banheiro ficar completa', 'Pra deixar reserva no armário', 'Pra bolsa e mochila', 'Pra kit de viagem'] },
  desodorante: { item: ['m', 'desodorante'],
    dores: ['Desodorante acabando na quarta-feira?', 'Saiu de casa e lembrou que esqueceu de passar?', 'Frasco vazio na mochila da academia?', 'Casa toda dividindo o mesmo frasco?'],
    usos: ['Pra deixar um na mochila e outro em casa', 'Pra bolsa da academia', 'Pra viagem de fim de semana', 'Pra reserva no armário do banheiro'] },
  barbear_lamina: { item: ['f', 'lâmina nova'],
    dores: ['Lâmina puxando a barba de manhã?', 'Barba feita com pressa e o aparelho já gasto?', 'Última lâmina do pacote e nenhuma reserva?', 'Aparelho velho que mais arranha do que corta?'],
    usos: ['Pra barba de toda semana', 'Pra deixar reserva no banheiro', 'Pra kit de viagem', 'Pra quem faz a barba antes do trampo'] },
  sabonete: { item: ['m', 'sabonete'],
    dores: ['Último sabonete do armário?', 'Banheiro de visita sem sabonete na pia?', 'Família grande acabando com o estoque na semana?', 'Só percebeu que acabou no meio do banho?'],
    usos: ['Pra abastecer o banheiro de uma vez', 'Pra casa com muita gente', 'Pra banheiro de visita', 'Pra deixar reserva no armário'] },

  /* ---------------- saúde, suplementos e cuidado ---------------- */
  termometro: { item: ['m', 'termômetro digital'], dores: ['Termômetro sumido da gaveta bem na hora?', 'Termômetro velho de vidro que ninguém consegue ler?', 'Caixinha de cuidados sem termômetro?', 'Criança quentinha e cadê o termômetro?'],
    usos: ['Pra caixinha de cuidados de casa', 'Pra bolsa das crianças', 'Pra viagem em família', 'Pra deixar na gaveta da cozinha'] },
  medidor_pressao: { item: ['m', 'medidor de pressão'], dores: ['Indo na farmácia só pra medir a pressão?', 'Família pedindo pra acompanhar a pressão em casa?', 'Aparelho velho dando leitura difícil de entender?', 'Anotando tudo de cabeça e esquecendo?'],
    usos: ['Pra casa com idoso', 'Pra quem acompanha a pressão em casa', 'Pra presentear os pais', 'Pra deixar na caixinha de cuidados'] },
  oximetro: { item: ['m', 'oxímetro'], dores: ['Caixinha de cuidados sem oxímetro?', 'Precisando emprestar de alguém toda vez?', 'Aparelho velho sem bateria na gaveta?'],
    usos: ['Pra caixinha de cuidados de casa', 'Pra casa com idoso', 'Pra deixar na bolsa', 'Pra viagem'] },
  curativos: { item: ['m', 'kit de curativos'], dores: ['Criança ralou o joelho e a caixinha tá vazia?', 'Corte pequeno na cozinha e nada pra cobrir?', 'Caixa de primeiros cuidados desfalcada?', 'Trilha sem nada na mochila pra emergência?'],
    usos: ['Pra mochila da escola', 'Pra carro', 'Pra gaveta da cozinha', 'Pra trilha e viagem'] },
  nebulizador: { item: ['m', 'nebulizador'], dores: ['Pedindo emprestado toda vez que precisa?', 'Aparelho velho fazendo barulho alto?', 'Casa com criança e nenhum em casa?'],
    usos: ['Pra casa com criança', 'Pra deixar guardado no armário', 'Pra viagem em família', 'Pra quem prefere ter o seu'] },
  bolsa_termica: { item: ['f', 'bolsa térmica'], dores: ['Bolsa velha vazando no sofá?', 'Noite fria e nada pra esquentar?', 'Compressa sumida bem quando precisa?'],
    usos: ['Pra noite fria no sofá', 'Pra gaveta de casa', 'Pra deixar no congelador', 'Pra viagem'] },
  organizador_remedio: { item: ['m', 'organizador'], dores: ['Confusão com os horários da semana?', 'Gaveta de cuidados toda bagunçada?', 'Esquecendo se já tomou ou não?'],
    usos: ['Pra rotina da semana', 'Pra quem cuida de alguém da família', 'Pra viagem', 'Pra casa com idoso'] },
  whey: { item: ['m', 'pote novo'], dores: ['Pote no fim no meio da semana?', 'Raspando o fundo do pote?', 'Esqueceu de comprar e o treino é amanhã?', 'Loja de suplemento longe de casa?'],
    usos: ['Pra rotina de treino', 'Pra deixar reserva no armário', 'Pra quem treina cedo', 'Pra reposição do mês'] },
  creatina: { item: ['m', 'pote de reserva'], dores: ['Pote de creatina no fim?', 'Raspando a última colher?', 'Rotina parada porque acabou?', 'Esqueceu de repor de novo?'],
    usos: ['Pra rotina de treino', 'Pra deixar reserva no armário', 'Pra reposição do mês', 'Pra quem treina todo dia'] },
  vitaminas: { item: ['m', 'frasco novo'], dores: ['Frasco no fim e a farmácia fechada?', 'Esqueceu de repor de novo?', 'Rotina parada porque acabou?', 'Passando na farmácia toda semana?'],
    usos: ['Pra reposição do mês', 'Pra deixar reserva', 'Pra rotina organizada', 'Pra quem já tem isso na rotina'] },
  cuidado_adulto: { item: ['m', 'pacote de reserva'], dores: ['Estoque acabando no meio da semana?', 'Correndo na farmácia de última hora?', 'Pacote no fim e a farmácia fechada?', 'Rotina de cuidado corrida demais?'],
    usos: ['Pra estoque do mês', 'Pra quem cuida de alguém em casa', 'Pra viagem', 'Pra deixar reserva no armário'] },

  /* ---------------- tech ---------------- */
  fone_tws: { item: ['m', 'fone sem fio'], dores: ['Fio do fone enroscando na mochila de novo?', 'Fone com fio puxando da orelha no treino?', 'Perdeu o fone no meio da bagunça da bolsa?', 'Um lado do fone parou de funcionar?', 'Cansou de desembaraçar fio no ônibus?'],
    usos: ['Pra academia e corrida', 'Pra ônibus e metrô lotado', 'Pra ligação no meio da rua', 'Pra ouvir música enquanto arruma a casa', 'Pra podcast no caminho do trampo'] },
  headset_gamer: { item: ['m', 'headset'], dores: ['Galera reclamando que seu microfone tá chiando?', 'Não escuta de onde vem o tiro na partida?', 'Jogatina de madrugada acordando a casa?', 'Orelha doendo depois de duas horas de jogo?'],
    usos: ['Pra jogar com a galera online', 'Pra jogatina de madrugada', 'Pra ouvir cada passo na partida', 'Pra conversar no jogo sem eco'] },
  headphone: { item: ['m', 'fone bom'], dores: ['Fone que veio com o celular já não dá conta?', 'Barulho de casa atrapalhando a concentração?', 'Música abafada e sem graça no fone velho?', 'Orelha reclamando do fone apertado?', 'Cansou de som baixo no ônibus?'],
    usos: ['Pra maratona de playlist', 'Pra estudar sem distração', 'Pra viagem longa de ônibus', 'Pra trabalhar em casa com foco', 'Pra ver série sem incomodar ninguém'] },
  caixa_som: { item: ['f', 'caixinha de som'], dores: ['Churrasco com música saindo do celular?', 'Som baixinho que ninguém escuta no quintal?', 'Faxina sem música não rende?', 'Festa em casa e o som não ajuda?'],
    usos: ['Pra churrasco de fim de semana', 'Pra praia e piscina', 'Pra faxina de sábado', 'Pra música no banho', 'Pra receber os amigos em casa'] },
  smartwatch: { item: ['m', 'relógio inteligente'], dores: ['Perdendo mensagem importante com o celular na bolsa?', 'Correndo sem saber o ritmo?', 'Despertador acordando a casa toda?', 'Vive tirando o celular do bolso só pra ver a hora?'],
    usos: ['Pra acompanhar treino e caminhada', 'Pra ver notificação sem pegar o celular', 'Pra quem quer acompanhar o sono', 'Pra corrida sem levar o celular na mão'] },
  tablet: { item: ['m', 'tablet'], dores: ['Celular pequeno demais pra ler e estudar?', 'Criançada brigando pelo seu celular?', 'Série na cama com o celular caindo na cara?', 'Notebook pesado demais só pra ver vídeo?'],
    usos: ['Pra estudar e ler PDF', 'Pra criançada ver desenho', 'Pra série na cama', 'Pra receita na cozinha', 'Pra viagem longa'] },
  celular: { item: ['m', 'celular novo'], dores: ['Celular travando no meio da conversa?', 'Bateria pedindo arrego antes do almoço?', 'Foto da família saindo borrada?', 'Memória cheia toda semana?', 'Aparelho esquentando só de abrir o mapa?', 'Tela trincada que você finge que não vê?'],
    usos: ['Pra quem passa o dia no celular', 'Pra tirar foto boa da família', 'Pra trabalhar pelo celular', 'Pra jogar no intervalo do trampo', 'Pra ver vídeo sem travar'] },
  notebook: { item: ['m', 'notebook novo'], dores: ['Computador demorando uma eternidade pra ligar?', 'Planilha travando no meio do trabalho?', 'Bateria que não dura uma aula inteira?', 'Ventoinha gritando só de abrir o navegador?', 'Notebook pesado demais pra levar na mochila?'],
    usos: ['Pra faculdade e trabalho', 'Pra trabalhar de casa', 'Pra estudar pra concurso', 'Pra levar pra qualquer lugar na mochila', 'Pra série depois do expediente'] },
  monitor: { item: ['m', 'monitor'], dores: ['Planilha e reunião espremidas na tela do notebook?', 'Pescoço doendo de olhar pra tela baixa?', 'Jogo travando na tela velha?', 'Vive trocando de janela pra conseguir trabalhar?'],
    usos: ['Pra segunda tela do trabalho', 'Pra jogar com tudo fluindo', 'Pra estudar com material aberto do lado', 'Pra montar a mesa do computador'] },
  streaming_box: { item: ['m', 'aparelho de streaming'], dores: ['TV antiga sem os aplicativos que você usa?', 'Gambiarra de cabo pra ver série na TV?', 'TV do quarto que não é smart?', 'Sistema da TV lento e travando?'],
    usos: ['Pra transformar a TV antiga em smart', 'Pra TV do quarto', 'Pra levar na viagem', 'Pra maratona de série no sofá'] },
  smart_tv: { item: ['f', 'TV nova'], dores: ['TV com cor estranha e imagem escura?', 'Futebol de domingo numa tela pequena?', 'Aplicativo de streaming travando na TV velha?', 'Família apertada no sofá pra enxergar a tela?', 'Controle remoto lento que irrita toda vez?'],
    usos: ['Pra futebol de domingo', 'Pra maratona de série no fim de semana', 'Pra sala nova', 'Pra jogar videogame', 'Pra noite de filme com a família'] },
  power_bank: { item: ['m', 'carregador portátil'], dores: ['Celular morrendo no meio da rua?', 'Show, viagem e nenhuma tomada por perto?', 'Bateria acabando no meio do trajeto pra casa?', 'Dia inteiro fora e o celular no vermelho?'],
    usos: ['Pra show e festival', 'Pra viagem de ônibus', 'Pra quem passa o dia na rua', 'Pra deixar na mochila', 'Pra trilha e acampamento'] },
  carregador: { item: ['m', 'carregador bom'], dores: ['Cabo que só carrega dobrado?', 'Carregador esquentando mais do que devia?', 'Esqueceu o carregador em casa de novo?', 'Celular carregando devagar demais?'],
    usos: ['Pra deixar um no trampo', 'Pra mochila e bolsa', 'Pra lado da cama', 'Pra viagem'] },
  mouse: { item: ['m', 'mouse'], dores: ['Brigando com o touchpad do notebook?', 'Clique falhando no meio do trabalho?', 'Mão cansada depois de horas no computador?', 'Cursor pulando sozinho na tela?'],
    usos: ['Pra trabalhar no notebook', 'Pra jogar com precisão', 'Pra mesa do computador', 'Pra levar na mochila'] },
  teclado: { item: ['m', 'teclado'], dores: ['Tecla falhando no meio do texto?', 'Digitando apertado no teclado do notebook?', 'Teclado velho com letra apagada?', 'Barulho de tecla que irrita todo mundo?'],
    usos: ['Pra quem escreve o dia todo', 'Pra jogar', 'Pra montar a mesa do computador', 'Pra trabalhar de casa'] },
  webcam: { item: ['f', 'webcam'], dores: ['Imagem borrada na reunião online?', 'Câmera do notebook escura e granulada?', 'Entrevista online chegando e a câmera é ruim?', 'Família reclamando que não te vê direito na chamada?'],
    usos: ['Pra reunião online', 'Pra aula a distância', 'Pra chamada de vídeo com a família', 'Pra gravar vídeo em casa'] },
  roteador: { item: ['m', 'roteador novo'], dores: ['Internet caindo no quarto do fundo?', 'Todo mundo conectado e a internet travando?', 'Reunião online congelando bem na sua vez de falar?', 'Sinal que não chega na varanda?'],
    usos: ['Pra casa grande', 'Pra quem trabalha de casa', 'Pra jogar online', 'Pra família toda conectada ao mesmo tempo'] },
  ssd: { item: ['m', 'SSD'], dores: ['PC demorando uma eternidade pra ligar?', 'Jogo levando minutos pra carregar?', 'Computador travando ao abrir qualquer programa?', 'HD fazendo barulho estranho?'],
    usos: ['Pra dar vida nova ao PC antigo', 'Pra jogo carregar rápido', 'Pra notebook que tá lento', 'Pra trabalhar sem esperar o computador'] },
  armazenamento: { item: ['m', 'espaço extra'], dores: ['Celular avisando que a memória tá cheia?', 'Fotos da família só num lugar?', 'Câmera lotada no meio da viagem?', 'Arquivo do trampo que precisa levar pra outro computador?'],
    usos: ['Pra backup das fotos', 'Pra câmera e videogame', 'Pra levar arquivos no bolso', 'Pra guardar o que não cabe no celular'] },
  impressora: { item: ['f', 'impressora'], dores: ['Correndo na papelaria toda vez que precisa imprimir?', 'Trabalho da escola pra entregar amanhã?', 'Boleto e documento pra imprimir de última hora?', 'Copiadora fechada bem no domingo?'],
    usos: ['Pra trabalho da escola', 'Pra quem estuda em casa', 'Pra escritório em casa', 'Pra documento de última hora'] },
  kindle: { item: ['m', 'leitor digital'], dores: ['Estante sem espaço pra mais livro?', 'Livro pesado na mochila todo dia?', 'Luz acesa atrapalhando quem dorme do lado?', 'Vista cansada de ler no celular?'],
    usos: ['Pra ler no ônibus', 'Pra ler na cama', 'Pra viagem', 'Pra quem lê vários livros por mês'] },
  camera: { item: ['f', 'câmera'], dores: ['Foto da viagem saindo igual à de todo mundo?', 'Medo de molhar o celular na trilha?', 'Celular sem espaço pra filmar a viagem?', 'Lembrança da viagem perdida no meio de mil fotos do celular?'],
    usos: ['Pra viagem', 'Pra trilha e praia', 'Pra registrar a família', 'Pra quem gosta de fotografia'] },
  controle: { item: ['m', 'controle novo'], dores: ['Analógico puxando sozinho no meio da partida?', 'Visita chegou e só tem um controle?', 'Botão falhando bem na hora decisiva?', 'Bateria do controle acabando no meio do jogo?'],
    usos: ['Pra jogar em dupla', 'Pra ter um reserva carregado', 'Pra jogatina com a visita', 'Pra jogar online sem falha'] },
  jogo: { item: ['m', 'jogo novo'], dores: ['Fim de semana chegando e nada novo pra jogar?', 'Todo mundo falando do jogo e você ainda não jogou?', 'Lista de jogos pra zerar crescendo sem parar?', 'Cansou de jogar sempre o mesmo?'],
    usos: ['Pra jogatina de fim de semana', 'Pra jogar com a galera', 'Pra feriado em casa', 'Pra presentear quem joga'] },
  console: { item: ['m', 'console novo'], dores: ['Ainda na geração passada vendo todo mundo jogar os lançamentos?', 'Console velho fazendo barulho de turbina?', 'Jogo novo que não roda no seu aparelho?', 'Família toda brigando pelo único videogame?'],
    usos: ['Pra jogar os lançamentos', 'Pra presente da família toda', 'Pra jogatina com a galera em casa', 'Pra fim de semana de jogo'] },
  cadeira: { item: ['f', 'cadeira boa'], dores: ['Trabalhando o dia todo numa cadeira de cozinha?', 'Cadeira de plástico no lugar de cadeira de escritório?', 'Cadeira velha rangendo a cada movimento?', 'Encosto que não ajuda em nada?'],
    usos: ['Pra trabalhar de casa', 'Pra jogar por horas', 'Pra estudar', 'Pra montar a mesa do computador'] },

  /* ---------------- casa / eletro ---------------- */
  robo_aspirador: { item: ['m', 'robô aspirador'], dores: ['Pelo de pet espalhado pela casa todo dia?', 'Sem tempo nem pra passar vassoura?', 'Chão com farelo antes mesmo de terminar a faxina?', 'Chega do trampo e a casa tá pedindo limpeza?'],
    usos: ['Pra quem trabalha fora o dia todo', 'Pra casa com pet', 'Pra limpeza diária no automático', 'Pra quem odeia varrer'] },
  aspirador: { item: ['m', 'aspirador'], dores: ['Faxina tomando o sábado inteiro?', 'Pelo de pet no sofá e no tapete?', 'Farelo no chão da cozinha todo dia?', 'Vassoura que só espalha a poeira?'],
    usos: ['Pra faxina de fim de semana', 'Pra casa com pet', 'Pra limpar sofá e tapete', 'Pra limpeza rápida do dia a dia', 'Pra limpar o carro'] },
  air_fryer: { item: ['f', 'air fryer'], dores: ['Chegou cansado e ainda tem que fritar alguma coisa?', 'Cheiro de fritura impregnando a casa toda?', 'Pia cheia de panela engordurada?', 'Pizza de ontem esquentada e borrachuda?', 'Óleo espirrando no fogão?'],
    usos: ['Pra janta rápida durante a semana', 'Pra quem mora sozinho', 'Pra batata crocante sem óleo', 'Pra marmita da semana', 'Pra lanche das crianças'] },
  cafeteira: { item: ['f', 'cafeteira'], dores: ['Manhã começando sem café?', 'Esperando a água ferver com pressa pro trampo?', 'Café da padaria todo dia pesando no mês?', 'Visita chegando e o café é solúvel?'],
    usos: ['Pra manhã antes do trampo', 'Pra café da tarde de domingo', 'Pra receber visita', 'Pra quem toma café o dia todo'] },
  liquidificador: { item: ['m', 'liquidificador'], dores: ['Liquidificador velho engasgando com gelo?', 'Suco natural que nunca sai porque dá trabalho?', 'Massa de bolo batida no braço?', 'Motor fazendo barulho de quem vai desistir?'],
    usos: ['Pra vitamina da manhã', 'Pra suco natural', 'Pra massa de bolo', 'Pra sopa e molho caseiro'] },
  batedeira: { item: ['f', 'batedeira'], dores: ['Braço cansado de bater massa de bolo?', 'Clara em neve que nunca chega no ponto?', 'Encomenda de doce acumulando?', 'Bolo de domingo dando trabalho demais?'],
    usos: ['Pra bolo de domingo', 'Pra quem faz doce pra vender', 'Pra confeitaria em casa', 'Pra aniversário da família'] },
  micro_ondas: { item: ['m', 'micro-ondas'], dores: ['Micro-ondas esquentando só a borda do prato?', 'Marmita fria no meio do expediente?', 'Porta do micro-ondas que não fecha direito?', 'Pipoca queimando toda vez?'],
    usos: ['Pra esquentar a marmita', 'Pra cozinha de casa nova', 'Pra pipoca da sessão de filme', 'Pra quem vive na correria'] },
  forno_eletrico: { item: ['m', 'forno elétrico'], dores: ['Ligar o forno grande só pra um pão de queijo?', 'Cozinha sem forno no apartamento?', 'Forno do fogão que não esquenta por igual?', 'Calor insuportável na cozinha com o forno ligado?'],
    usos: ['Pra apartamento pequeno', 'Pra pão de queijo e lasanha', 'Pra quem mora sozinho', 'Pra gratinado de fim de semana'] },
  panela_eletrica: { item: ['f', 'panela elétrica'], dores: ['Vigiando a panela no fogão com medo de queimar?', 'Feijão que leva a tarde toda?', 'Arroz grudando no fundo de novo?', 'Sem tempo de cozinhar durante a semana?'],
    usos: ['Pra feijão sem vigiar o fogão', 'Pra marmita da semana', 'Pra quem cozinha pouco tempo por dia', 'Pra arroz soltinho'] },
  panelas: { item: ['m', 'jogo de panelas'], dores: ['Ovo grudando no fundo da frigideira?', 'Panela com o fundo descascando?', 'Cabo solto balançando na hora de cozinhar?', 'Jogo de panelas todo desfalcado?'],
    usos: ['Pra casa nova', 'Pra quem cozinha todo dia', 'Pra trocar o jogo velho', 'Pra presente de casamento'] },
  utensilios: { item: ['m', 'kit novo'], dores: ['Faca cega esmagando o tomate?', 'Pote sem tampa no armário de novo?', 'Geladeira bagunçada com marmita espalhada?', 'Faltando utensílio básico na cozinha?'],
    usos: ['Pra casa nova', 'Pra organizar a cozinha', 'Pra marmita da semana', 'Pra quem gosta de cozinhar'] },
  ventilador: { item: ['m', 'ventilador'], dores: ['Virando na cama a noite toda de calor?', 'Quarto abafado no verão?', 'Ventilador velho fazendo barulho de helicóptero?', 'Calor de derreter no sofá?'],
    usos: ['Pra noite de verão', 'Pra trabalhar de casa no calor', 'Pra quarto abafado', 'Pra sala no fim de semana'] },
  ar_condicionado: { item: ['m', 'ar-condicionado'], dores: ['Acordando suado no meio da noite?', 'Calor de rachar sem trégua?', 'Trabalhar de casa no verão virou sauna?', 'Ventilador que só joga ar quente?'],
    usos: ['Pra dormir bem no verão', 'Pra quarto de casal', 'Pra trabalhar de casa', 'Pra quem mora em cidade quente'] },
  geladeira: { item: ['f', 'geladeira nova'], dores: ['Geladeira fazendo barulho a noite toda?', 'Compra do mês que não cabe?', 'Gelo acumulando no congelador?', 'Comida estragando antes do tempo?'],
    usos: ['Pra casa nova', 'Pra família grande', 'Pra quem congela marmita', 'Pra compra do mês caber inteira'] },
  lava_roupas: { item: ['f', 'máquina de lavar'], dores: ['Domingo inteiro no tanque?', 'Roupa da família acumulando no cesto?', 'Máquina velha andando pela lavanderia?', 'Roupa saindo encharcada da centrifugação?'],
    usos: ['Pra família com criança', 'Pra quem lava roupa todo dia', 'Pra apartamento novo', 'Pra roupa de cama e toalha'] },
  ferro: { item: ['m', 'ferro bom'], dores: ['Camisa amassada no dia da reunião?', 'Ferro velho grudando no tecido?', 'Domingo passando roupa da família toda?', 'Roupa amassada saindo da mala?'],
    usos: ['Pra roupa de trabalho', 'Pra viagem', 'Pra passar roupa da família', 'Pra camisa social'] },
  purificador: { item: ['m', 'purificador'], dores: ['Carregando galão escada acima?', 'Comprando garrafa de água toda semana?', 'Água da torneira com gosto estranho?', 'Galão acabando no domingo?'],
    usos: ['Pra cozinha', 'Pra família que bebe muita água', 'Pra escritório', 'Pra parar de comprar galão'] },
  garrafa_termica: { item: ['f', 'garrafa térmica'], dores: ['Água esquentando na mesa em meia hora?', 'Café gelando antes do fim da manhã?', 'Comprando garrafinha na rua todo dia?', 'Copo descartável se acumulando no lixo?'],
    usos: ['Pra academia', 'Pra levar pro trampo', 'Pra estrada e viagem', 'Pra beber mais água no dia', 'Pra café quente o dia todo'] },
  colchao: { item: ['m', 'colchão novo'], dores: ['Colchão com a marca do seu corpo?', 'Colchão afundando de um lado só?', 'Mola aparecendo no meio da noite?', 'Afundando pro meio da cama?'],
    usos: ['Pra quarto novo', 'Pra quem tá montando casa', 'Pra quarto de visita', 'Pra noite bem dormida'] },
  travesseiro: { item: ['m', 'travesseiro novo'], dores: ['Travesseiro achatado igual panqueca?', 'Travesseiro que perdeu o formato faz tempo?', 'Dobrando o travesseiro pra conseguir dormir?', 'Faz anos que não troca o travesseiro?'],
    usos: ['Pra noite render', 'Pra quarto de visita', 'Pra trocar o da casa toda', 'Pra quem dorme de lado'] },
  cama_banho: { item: ['m', 'jogo novo'], dores: ['Lençol desbotado de tanto lavar?', 'Toalha áspera que nem seca direito?', 'Frio chegando e só um cobertor fino?', 'Visita chegando e falta roupa de cama?'],
    usos: ['Pra renovar o enxoval', 'Pra casa nova', 'Pra quarto de visita', 'Pra inverno'] },
  casa_inteligente: { item: ['m', 'assistente'], dores: ['Levantando da cama só pra apagar a luz?', 'Esquecendo a luz acesa quando sai?', 'Despertador que não toca a música que você quer?', 'Mãos ocupadas na cozinha e precisando de um timer?'],
    usos: ['Pra rotina da manhã', 'Pra controlar a luz por voz', 'Pra música na cozinha', 'Pra quem quer começar a casa inteligente'] },
  organizacao: { item: ['m', 'organizador'], dores: ['Armário virando bagunça toda semana?', 'Procurando as coisas toda manhã?', 'Sapato espalhado pela casa?', 'Apartamento pequeno sem lugar pra nada?'],
    usos: ['Pra apartamento pequeno', 'Pra arrumar o armário', 'Pra quarto das crianças', 'Pra casa nova'] },
  umidificador: { item: ['m', 'umidificador'], dores: ['Tempo seco castigando no inverno?', 'Ar do quarto seco demais pra dormir bem?', 'Ar do quarto pesado com o ar-condicionado?', 'Clima seco no home office?'],
    usos: ['Pra quarto no inverno', 'Pra quem trabalha de casa', 'Pra quarto das crianças', 'Pra tempo seco'] },
  limpeza_consumo: { item: ['m', 'estoque de limpeza'], dores: ['Faxina parada porque acabou o produto?', 'Sabão acabando no meio da roupa suja?', 'Lista do mercado esquecendo a limpeza de novo?', 'Armário da limpeza no vazio?'],
    usos: ['Pra faxina de fim de semana', 'Pra compra do mês', 'Pra casa com criança e pet', 'Pra não ir ao mercado toda semana'] },
  lavadora_pressao: { item: ['f', 'lavadora de alta pressão'], dores: ['Limo no quintal que nenhuma vassoura tira?', 'Calçada encardida há meses?', 'Carro sujo e lava-rápido caro?', 'Sábado inteiro esfregando o chão?'],
    usos: ['Pra quintal e calçada', 'Pra lavar o carro em casa', 'Pra área da churrasqueira', 'Pra limpeza pesada de fim de ano'] },
  ferramenta_eletrica: { item: ['f', 'ferramenta própria'], dores: ['Pedindo furadeira emprestada pro vizinho de novo?', 'Quadro esperando há meses pra ser pendurado?', 'Mudou de casa e tem mil furos pela frente?', 'Pagando alguém pra um serviço de cinco minutos?'],
    usos: ['Pra pendurar quadro e prateleira', 'Pra mudança', 'Pra pequena reforma', 'Pra quem gosta de resolver em casa'] },
  ferramentas_manuais: { item: ['m', 'kit de ferramentas'], dores: ['Parafuso solto esperando há semanas?', 'Faltou a chave certa bem na hora?', 'Improvisando com faca de cozinha?', 'Móvel pra montar e nenhuma ferramenta?'],
    usos: ['Pra montar móvel', 'Pra reparo de casa', 'Pra deixar no carro', 'Pra presente de quem gosta de mexer em tudo'] },

  /* ---------------- beleza ---------------- */
  protetor_solar: { item: ['m', 'protetor solar'], dores: ['Pulou o protetor de novo de manhã?', 'Protetor acabando bem no verão?', 'Sol no caminho do trampo todo dia?', 'Esqueceu o protetor na praia?'],
    usos: ['Pra rotina da manhã', 'Pra praia e piscina', 'Pra deixar na bolsa', 'Pra quem trabalha na rua'] },
  barbeador: { item: ['m', 'aparador'], dores: ['Barbeiro com agenda cheia?', 'Pezinho crescendo entre um corte e outro?', 'Lâmina irritando a pele toda semana?', 'Barba falhada por falta de acabamento?'],
    usos: ['Pra barba em casa', 'Pra acabamento entre cortes', 'Pra levar na viagem', 'Pra quem faz a barba toda semana'] },
  aparelho_cabelo: { item: ['m', 'aparelho bom'], dores: ['Secador velho que demora uma eternidade?', 'Cabelo armado minutos antes de sair?', 'Agenda do salão sempre cheia?', 'Chapinha que não esquenta direito?'],
    usos: ['Pra arrumar o cabelo antes do trampo', 'Pra evento e festa', 'Pra quem arruma o cabelo todo dia', 'Pra viagem'] },
  serum_facial: { item: ['m', 'frasco novo'], dores: ['Frasco do skincare no fim?', 'Rotina de pele pela metade porque faltou um passo?', 'Começou a rotina e não quer parar agora?', 'Gotinha final sendo disputada no frasco?'],
    usos: ['Pra rotina da manhã', 'Pra rotina da noite', 'Pra quem tá começando no skincare', 'Pra reposição antes de acabar'] },
  hidratante: { item: ['m', 'hidratante'], dores: ['Pele repuxando depois do banho?', 'Tempo seco castigando as mãos?', 'Pote acabando sem perceber?', 'Pé ressecado no inverno?'],
    usos: ['Pra depois do banho', 'Pra deixar na bolsa', 'Pra inverno', 'Pra rotina de autocuidado'] },
  cabelo: { item: ['m', 'kit de cabelo'], dores: ['Frasco de shampoo no fim de novo?', 'Cabelo sem jeito na correria?', 'Casa toda usando o mesmo frasco?', 'Condicionador acabando antes do shampoo?'],
    usos: ['Pra rotina de cabelo', 'Pra família toda', 'Pra kit de viagem', 'Pra deixar reserva no banheiro'] },
  maquiagem: { item: ['m', 'produto novo'], dores: ['Base no fim e evento chegando?', 'Rímel seco de tanto usar?', 'Batom favorito sumindo da bolsinha?', 'Make do dia a dia sempre acabando na pior hora?'],
    usos: ['Pra maquiagem do dia a dia', 'Pra festa e evento', 'Pra bolsinha de maquiagem', 'Pra quem tá montando a coleção'] },
  unhas: { item: ['m', 'kit'], dores: ['Manicure sem horário na semana?', 'Esmalte favorito ressecado no vidro?', 'Unha descascada no meio da semana?', 'Gastando com salão toda semana?'],
    usos: ['Pra unha em casa', 'Pra renovar as cores', 'Pra quem faz a unha toda semana', 'Pra presentear'] },

  /* ---------------- moda ---------------- */
  tenis_corrida: { item: ['m', 'tênis de corrida'], dores: ['Sola lisa escorregando no asfalto?', 'Tênis velho de corrida já no fim da vida?', 'Começou a correr de tênis de passeio?', 'Treino de rua cobrando o tênis gasto?'],
    usos: ['Pra treino de rua', 'Pra quem tá começando a correr', 'Pra corrida de fim de semana', 'Pra caminhada diária'] },
  tenis: { item: ['m', 'tênis novo'], dores: ['Tênis surrado pedindo aposentadoria?', 'Sola descolando no meio da rua?', 'Só um par pra tudo e ele já cansou?', 'Look bom estragado pelo tênis velho?'],
    usos: ['Pra usar com jeans e bermuda', 'Pra rodar a cidade a pé', 'Pra trabalho e fim de semana', 'Pra renovar o par do dia a dia'] },
  chinelo_sandalia: { item: ['m', 'par novo'], dores: ['Tira do chinelo frouxa de tanto usar?', 'Verão chegando e o chinelo velho já não aguenta?', 'Esqueceu o chinelo na viagem?', 'Sandália apertando o pé?'],
    usos: ['Pra praia e piscina', 'Pra casa', 'Pra rolê rápido', 'Pra mala de viagem'] },
  sapato_bota: { item: ['m', 'par certo'], dores: ['Casamento chegando e nenhum sapato arrumado?', 'Bota velha descolando no inverno?', 'Sapato social apertando no trabalho?', 'Look de trabalho sem par que combine?'],
    usos: ['Pra reunião e trabalho', 'Pra casamento e evento', 'Pra inverno', 'Pra saída de sábado'] },
  roupa_intima: { item: ['m', 'kit novo'], dores: ['Elástico frouxo em metade da gaveta?', 'Meia furada no dedão?', 'Faz tempo que não renova a gaveta?', 'Lavando roupa no meio da semana porque faltou peça?'],
    usos: ['Pra renovar a gaveta', 'Pra semana inteira', 'Pra mala de viagem', 'Pra presente'] },
  agasalho: { item: ['m', 'agasalho'], dores: ['Frio chegando e o moletom velho não dá conta?', 'Tremendo no ponto de ônibus de manhã?', 'Tempo virou e você saiu sem casaco?', 'Jaqueta velha com zíper quebrado?'],
    usos: ['Pra manhã fria', 'Pra levar na mochila', 'Pra viagem pra serra', 'Pra ficar em casa no fim de semana'] },
  camiseta: { item: ['f', 'camiseta nova'], dores: ['Camisetas desbotadas de tanto lavar?', 'Gola larga e deformada?', 'Sempre com a mesma roupa nas fotos?', 'Nada pra vestir no fim de semana?'],
    usos: ['Pra montar look sem pensar', 'Pra trabalho casual', 'Pra fim de semana', 'Pra renovar o básico do armário'] },
  calca_bermuda: { item: ['f', 'peça nova'], dores: ['Jeans desbotado no joelho?', 'Calça apertando na cintura?', 'Bermuda velha que já perdeu a forma?', 'Faltando peça básica pro trabalho?'],
    usos: ['Pra trabalho', 'Pra fim de semana', 'Pra renovar o básico', 'Pra viagem'] },
  mochila_bolsa: { item: ['f', 'mochila nova'], dores: ['Zíper da mochila falhando?', 'Alça arrebentando com o peso do notebook?', 'Bolsa sem espaço pra marmita e garrafa?', 'Mala que não cabe no bagageiro?'],
    usos: ['Pra trampo e faculdade', 'Pra viagem curta', 'Pra carregar notebook', 'Pra academia'] },
  relogio: { item: ['m', 'relógio'], dores: ['Olhando a hora no celular toda hora?', 'Pulseira do relógio velho arrebentada?', 'Look sem aquele acessório que fecha tudo?', 'Presente de aniversário sem ideia?'],
    usos: ['Pra completar o look', 'Pra presentear', 'Pra trabalho', 'Pra ocasião especial'] },
  oculos: { item: ['m', 'óculos de sol'], dores: ['Sol forte na cara dirigindo?', 'Óculos velho arranhado?', 'Esqueceu os óculos na praia de novo?', 'Apertando os olhos no sol do meio-dia?'],
    usos: ['Pra praia', 'Pra dirigir', 'Pra viagem', 'Pra completar o look'] },

  /* ---------------- bebê e criança ---------------- */
  lenco_umedecido: { item: ['m', 'pacote de lencinho'], dores: ['Lencinho acabando bem na troca?', 'Bolsa do bebê sem lenço na rua?', 'Sujeira no carro e nada pra limpar?', 'Usa pra tudo e acaba rápido?'],
    usos: ['Pra bolsa do bebê', 'Pra carro', 'Pra trocador', 'Pra passeio'] },
  fralda: { item: ['m', 'pacote de fralda'], dores: ['Última fralda do pacote às duas da manhã?', 'Correndo na farmácia de madrugada?', 'Estoque de fralda no fim no meio da semana?', 'Bebê crescendo e o tamanho mudando?'],
    usos: ['Pra estoque do mês', 'Pra bolsa do bebê', 'Pra casa da avó', 'Pra viagem com o pequeno'] },
  enxoval: { item: ['m', 'item de enxoval'], dores: ['Mamadeira faltando na madrugada?', 'Enxoval ainda incompleto?', 'Chupeta perdida bem na hora de dormir?', 'Rotina do bebê corrida demais?'],
    usos: ['Pra montar o enxoval', 'Pra chá de bebê', 'Pra bolsa da maternidade', 'Pra reserva em casa'] },
  bebe_grande: { item: ['m', 'item do enxoval'], dores: ['Passeio com o bebê virando operação de guerra?', 'Bebê chegando e o enxoval grande ainda em aberto?', 'Carrinho emprestado já no fim?', 'Bebê crescendo e a cadeirinha ficou pequena?'],
    usos: ['Pra quem tá esperando bebê', 'Pra passeio', 'Pra viagem de carro', 'Pra chá de bebê'] },
  brinquedo: { item: ['m', 'brinquedo'], dores: ['Criançada grudada na tela o dia todo?', 'Aniversário chegando e sem ideia de presente?', 'Domingo chuvoso sem ter o que fazer?', 'Caixa de brinquedo cheia do que ninguém usa?'],
    usos: ['Pra aniversário', 'Pra Dia das Crianças', 'Pra brincar em família', 'Pra domingo em casa'] },

  /* ---------------- pet ---------------- */
  areia_tapete: { item: ['m', 'estoque'], dores: ['Areia acabando no fim de semana?', 'Carregando pacote pesado do pet shop?', 'Caixa de areia precisando de reposição de novo?', 'Tapete higiênico no fim?'],
    usos: ['Pra casa com gato', 'Pra filhote aprendendo', 'Pra estoque do mês', 'Pra apartamento'] },
  higiene_pet: { item: ['m', 'kit de banho'], dores: ['Pet shop caro todo mês?', 'Pelo espalhado pela casa?', 'Cheirinho de cachorro tomando a sala?', 'Banho em casa sem o produto certo?'],
    usos: ['Pra banho em casa', 'Pra escovar o pet', 'Pra rotina de cuidado', 'Pra pet que odeia pet shop'] },
  racao_gato: { item: ['f', 'ração'], dores: ['Gato miando de pote vazio?', 'Ração acabando de surpresa no domingo?', 'Trocou de ração e o gato rejeitou?', 'Correndo no pet shop toda semana?'],
    usos: ['Pra estoque do mês', 'Pra gato castrado', 'Pra quem tem mais de um gato', 'Pra não faltar no fim de semana'] },
  racao_cao: { item: ['m', 'saco de ração'], dores: ['Pote vazio e o cachorro te encarando?', 'Ração acabando no meio da semana?', 'Carregando saco pesado toda hora?', 'Pet shop fechado justo quando acabou?'],
    usos: ['Pra estoque do mês', 'Pra cachorro grande', 'Pra quem tem mais de um cachorro', 'Pra não faltar no feriado'] },
  petisco: { item: ['m', 'petisco'], dores: ['Treinando o pet sem recompensa?', 'Pet pedindo agrado com aquele olhar?', 'Adestramento parado por falta de petisco?', 'Saquinho de petisco no fim?'],
    usos: ['Pra adestramento', 'Pra mimo de fim de tarde', 'Pra recompensa no passeio', 'Pra deixar reserva'] },
  acessorio_pet: { item: ['m', 'mimo'], dores: ['Caminha toda roída?', 'Coleira velha desfiando?', 'Gato arranhando o sofá?', 'Passeio difícil com guia ruim?'],
    usos: ['Pra cantinho do pet', 'Pra passeio', 'Pra viagem com o pet', 'Pra pet que destrói tudo'] },

  /* ---------------- mercado ---------------- */
  cafe: { item: ['m', 'café'], dores: ['Pó de café acabando no meio da semana?', 'Manhã sem café virou crise?', 'Visita chegando e o café acabou?', 'Esqueceu o café na lista do mercado?'],
    usos: ['Pra manhã antes do trampo', 'Pra café da tarde', 'Pra quem toma café o dia todo', 'Pra estoque da despensa'] },
  bebida_alcool: { item: ['f', 'bebida'], dores: ['Churrasco marcado e a geladeira vazia?', 'Visita surpresa e nada pra oferecer?', 'Jantar especial sem aquele vinho?', 'Presente de última hora sem ideia?'],
    usos: ['Pra churrasco de fim de semana', 'Pra jantar especial', 'Pra presentear', 'Pra receber os amigos'] },
  bebida: { item: ['m', 'fardo'], dores: ['Geladeira sem nada gelado no calor?', 'Carregando garrafa do mercado toda semana?', 'Festa em casa e a bebida acabou?', 'Visita chegando e só tem água da torneira?'],
    usos: ['Pra fim de semana', 'Pra festa em casa', 'Pra deixar gelando', 'Pra estoque da despensa'] },
  doces: { item: ['m', 'docinho'], dores: ['Vontade de doce depois do almoço?', 'Sessão de filme sem nada pra beliscar?', 'Lancheira das crianças vazia?', 'Presente de última hora sem ideia?'],
    usos: ['Pra sessão de filme', 'Pra lancheira das crianças', 'Pra presentear', 'Pra lanche da tarde'] },
  despensa: { item: ['m', 'item da despensa'], dores: ['Despensa vazia no meio do mês?', 'Esqueceu o básico na lista do mercado?', 'Indo ao mercado toda semana por um item?', 'Faltou bem na hora de cozinhar?'],
    usos: ['Pra compra do mês', 'Pra estocar o básico', 'Pra família grande', 'Pra cozinha do dia a dia'] },

  /* ---------------- auto e moto ---------------- */
  moto: { item: ['m', 'equipamento novo'], dores: ['Chegando encharcado no trampo em dia de chuva?', 'Capacete velho com a viseira riscada?', 'Sem lugar pra levar a marmita na moto?', 'Luva velha furada?'],
    usos: ['Pra rodar todo dia no trânsito', 'Pra dia de chuva', 'Pra viagem de moto', 'Pra quem trabalha de moto'] },
  pneu: { item: ['m', 'pneu novo'], dores: ['Pneu careca e viagem chegando?', 'Carro escorregando na chuva?', 'Pneu murchando toda semana?', 'Borracharia pedindo troca há meses?'],
    usos: ['Pra viagem de fim de ano', 'Pra quem roda muito', 'Pra trocar o jogo todo', 'Pra dia de chuva'] },
  cuidado_carro: { item: ['m', 'kit de limpeza'], dores: ['Carro sujo e sem tempo de ir ao lava-rápido?', 'Pintura sem brilho?', 'Cheiro estranho dentro do carro?', 'Pneu sem aquele pretinho?'],
    usos: ['Pra domingo de garagem', 'Pra lavar o carro em casa', 'Pra deixar o carro apresentável', 'Pra quem cuida do carro com carinho'] },
  acessorio_carro: { item: ['m', 'acessório'], dores: ['Celular solto no banco enquanto dirige?', 'Pneu murcho e nenhum posto perto?', 'Bateria do celular acabando no trânsito?', 'Manobra apertada sem enxergar atrás?'],
    usos: ['Pra quem roda muito', 'Pra viagem de carro', 'Pra trânsito do dia a dia', 'Pra motorista de aplicativo'] },

  /* ---------------- papelaria e esporte ---------------- */
  caderno_planner: { item: ['m', 'caderno novo'], dores: ['Anotação espalhada em papel solto?', 'Semana desorganizada e compromisso esquecido?', 'Caderno velho sem folha?', 'Volta às aulas chegando?'],
    usos: ['Pra organizar a semana', 'Pra volta às aulas', 'Pra estudar pra concurso', 'Pra mesa do escritório'] },
  material_escolar: { item: ['m', 'estojo completo'], dores: ['Caneta sumindo de casa toda semana?', 'Estojo desfalcado na volta às aulas?', 'Marca-texto seco bem na hora de estudar?', 'Criança pedindo material novo?'],
    usos: ['Pra volta às aulas', 'Pra estudar pra prova', 'Pra escritório em casa', 'Pra mochila da criança'] },
  arte: { item: ['m', 'material novo'], dores: ['Material de desenho acabando no meio do projeto?', 'Vontade de pintar e nada em casa?', 'Tinta seca no pote?', 'Presente pra quem é da arte sem ideia?'],
    usos: ['Pra projeto criativo', 'Pra quem tá começando a pintar', 'Pra presentear', 'Pra fim de semana em casa'] },
  escritorio: { item: ['m', 'item de escritório'], dores: ['Mesa bagunçada atrapalhando o trabalho?', 'Pasta sem etiqueta e documento perdido?', 'Tinta da impressora acabando no meio do mês?', 'Notebook baixo demais na mesa?'],
    usos: ['Pra escritório em casa', 'Pra organizar documentos', 'Pra mesa de trabalho', 'Pra pequena empresa'] },
  fitness: { item: ['m', 'equipamento'], dores: ['Academia lotada no horário que você pode?', 'Treino parado por falta de tempo?', 'Mensalidade da academia pesando?', 'Dia corrido sem tempo de sair de casa?'],
    usos: ['Pra treinar em casa', 'Pra treino de manhã cedo', 'Pra montar o cantinho de treino', 'Pra quem tá começando'] },
  bike: { item: ['f', 'bicicleta'], dores: ['Ônibus lotado todo dia?', 'Fim de semana parado em casa?', 'Querendo se mexer sem academia?', 'Criança pedindo pra passear?'],
    usos: ['Pra passeio no parque', 'Pra ir ao trabalho', 'Pra fim de semana em família', 'Pra se exercitar'] },
};

// Depois de uma dor ("…?"): conclusão com o item. {Um} = "Um celular novo", {um} minúsculo, {bom} = bom/boa.
const CONCLUSOES_DOR = [
  '{Um} resolve isso.',
  '{Um} resolve isso de vez.',
  'É aí que {um} faz falta.',
  'Tá na hora de {um}.',
  '{Um} acaba com esse drama.',
  'Com {um}, isso fica pra trás.',
  'Esse aqui resolve.',
  'Esse resolve sem complicação.',
  'Sinal de que tá na hora de trocar.',
  '{Um} {bom} muda essa história.',
  'Quem já trocou não volta atrás.',
  'Esse aqui dá conta do recado.',
  'Daí a gente entende por que {um} faz falta.',
  '{Um} {bom} acaba com isso.',
  'Isso some com {um} {bom}.',
  'Pra isso, {um} resolve fácil.',
  'Esse aqui chega pra resolver.',
  'Dá pra resolver sem complicar.',
  '{Um} {bom} dá jeito nisso.',
  'Melhor resolver de uma vez.',
  'A troca compensa no primeiro dia.',
  'Esse aqui encerra o assunto.',
  '{Um} resolve e você nem lembra do problema.',
  'Hora de resolver isso direito.',
  'Sinal claro de que vale olhar esse aqui.',
  'Com esse aqui, assunto encerrado.',
  '{Um} {certo} muda o dia a dia.',
  'Esse aqui facilita a vida.',
  'Fica a dica: {um} {bom} resolve.',
];

// Depois de um uso ("Pra maratona de série no domingo"): ", " + conclusão.
const CONCLUSOES_USO = [
  '{um} {bom} faz toda a diferença.',
  '{um_desses} resolve.',
  'esse aqui é a pedida.',
  'vale ter {um} à mão.',
  'esse dá conta do recado.',
  'nada como {um} {bom}.',
  '{um} {certo} muda tudo.',
  'esse aqui encaixa direitinho.',
  'esse resolve sem complicar.',
  '{um} {bom} é meio caminho andado.',
  'esse aqui cai como uma luva.',
  '{um} {bom} faz falta.',
  'vale olhar esse aqui.',
  'esse é dos que valem a pena.',
  '{um} {bom} resolve a vida.',
  'esse aqui encaixa na rotina.',
  '{um_desses} vira item de casa.',
  'esse aqui dá conta.',
  '{um} {bom} muda a experiência.',
  'esse vale a olhada.',
  'esse aqui é escolha certeira.',
  'nada melhor que {um} {bom}.',
  'esse aqui chega pra somar.',
  '{um} {certo} faz o dia render.',
];

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

/** Preenche {Um}/{um}/{bom}/{certo}/{um_desses} com o item do tipo. */
function preencherItem(tpl, item) {
  const [g, nome] = item;
  const um = `${g === 'f' ? 'uma' : 'um'} ${nome}`;
  return tpl
    .replace(/\{Um\}/g, cap(um))
    .replace(/\{um\}/g, um)
    .replace(/\{bom\}/g, g === 'f' ? 'boa' : 'bom')
    .replace(/\{certo\}/g, g === 'f' ? 'certa' : 'certo')
    .replace(/\{um_desses\}/g, g === 'f' ? 'uma dessas' : 'um desses');
}

/**
 * Frases combinadas do tipo: { texto, modelo, conclusao } (modelo = id da dor/uso; conclusao = id da conclusão),
 * para a memória anti-repetição girar entre elas.
 */
function frasesCombinadasTipo(id, fechosPreco) {
  const ex = EXTRA[id];
  if (!ex) return [];
  const out = [];
  const fp = fechosPreco || [];
  // Com queda/cupom, a frase pode fechar com o preço quando ainda fica curta.
  const comPreco = (base, modelo, conclusao) => fp.forEach((f, k) => {
    const t = `${base} ${f}`;
    if (t.length <= 105) out.push({ texto: t, modelo, conclusao, preco: `fp${k}` });
  });
  ex.dores.forEach((d, i) => CONCLUSOES_DOR.forEach((c, j) => {
    const t = `${d} ${cap(preencherItem(c, ex.item))}`;
    out.push({ texto: t, modelo: `tipo:${id}:d${i}`, conclusao: `cd${j}` });
    comPreco(t, `tipo:${id}:d${i}`, `cd${j}`);
  }));
  ex.usos.forEach((u, i) => CONCLUSOES_USO.forEach((c, j) => {
    const t = `${u}, ${preencherItem(c, ex.item)}`;
    out.push({ texto: t, modelo: `tipo:${id}:u${i}`, conclusao: `cu${j}` });
    comPreco(t, `tipo:${id}:u${i}`, `cu${j}`);
  }));
  return out;
}

module.exports = { EXTRA_TIPOS: EXTRA, CONCLUSOES_DOR, CONCLUSOES_USO, frasesCombinadasTipo };
