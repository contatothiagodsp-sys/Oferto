# Plano de canais por categoria

Plano para os canais do Telegram por categoria. **Nenhum canal foi criado**: criar é ação do dono no app do Telegram. Depois de criado, o canal é configurado com `/setup @canal [título]` (ver `docs/channel-setup.md`).

Base: taxonomia-alvo da Fase 2 (Q-14). `tech` se divide em Eletrônicos e Games por palavra-chave; `perfumes` entra em Beleza; `saude` e `bebe` são sensíveis (Q-17) e não auto-publicam.

## Regras comuns

- **Ritmo**: de 3 a 5 ofertas por dia por canal (`ritmo.min_dia=3`, `ritmo.max_dia=5`, Q-23). A cota cobre todos os publicadores automáticos. O excedente não sai (digest opcional fica para a Fase 2b, Q-24).
- **Só sai oferta com**: referência de preço própria (sem `sem_ref`), loja na whitelist (ML, Amazon, Magalu, Shopee), frete conhecido e imagem gerada. Em dúvida, vai para revisão.
- **Legenda**: `#publi` + "link de afiliado" (e a frase curta de Associado nos posts Amazon). A frase completa fica na mensagem fixada (Q-06).
- **Mensagem fixada**: a mesma estrutura em todos os canais (gerada por `textoFixadoCanal` em `lib/setup-canal.js`): preço conferido, aviso de conferir o valor final, ritmo, "nunca pedimos Pix", link de avisos (quando `grupo_link` existe) e a frase completa de afiliado e de Associado da Amazon.
- **Sugestão de @**: livre (precisa estar disponível no Telegram). Os nomes abaixo são sugestões, não reservas.

## Canais

As descrições abaixo têm menos de 255 caracteres já contando o sufixo "Só desconto real. #publi · Contém links de afiliado." que o `/setup` acrescenta. Na prática, o `/setup` usa `canal_desc.<cat>` da `bfx_config` quando preenchido e, sem ele, a descrição sugerida do código; o texto desta tabela é o que se recomenda gravar em `canal_desc.<cat>`.

| Canal (título) | Chave | Descrição para `canal_desc.<cat>` | Publicação |
|---|---|---|---|
| Ofertô VIP · Top Ofertas | `top` | Só as maiores quedas de preço do dia nas lojas oficiais, conferidas no nosso histórico. | Automática, 3-5/dia |
| Ofertô Eletrônicos | `tech` (palavra-chave: celular, notebook, TV, fone, monitor, SSD) | Celulares, notebooks, TVs, fones e periféricos com preço conferido no histórico. | Automática, 3-5/dia |
| Ofertô Games | `tech` (palavra-chave: PS5, Xbox, Switch, jogo, controle, placa de vídeo) | Consoles, jogos, controles e hardware gamer com preço conferido no histórico. | Automática, 3-5/dia |
| Ofertô Casa & Eletro | `casa` | Air fryer, robô aspirador, cafeteira e casa inteligente com preço conferido no histórico. | Automática, 3-5/dia |
| Ofertô Moda & Tênis | `moda` | Tênis, roupas e acessórios de lojas oficiais com preço conferido no histórico. | Automática, 3-5/dia |
| Ofertô Beleza & Perfumes | `beleza` + `perfumes` | Skincare, maquiagem, cabelo e perfumes de lojas oficiais com preço conferido no histórico. | Automática, 3-5/dia |
| Ofertô Saúde & Farmácia | `saude` (sensível) | Suplementos e itens de farmácia de lojas oficiais, revisados um a um pela equipe. | **Só revisão humana**. Sem auto-publicação |
| Ofertô Bebê & Família | `bebe` (sensível) | Fraldas, lenços e itens infantis de lojas oficiais, revisados um a um pela equipe. | **Só revisão humana**. Sem auto-publicação |

Observações:

- Eletrônicos e Games dependem da divisão de `tech` por palavra-chave (Q-14). Até essa divisão existir no código, os dois canais compartilham a fila de `tech` e o dono decide se cria só um ("Ofertô Eletrônicos & Games") no começo.
- Beleza e Perfumes em um canal só segue Q-14. As chaves `beleza` e `perfumes` continuam separadas na config; as duas apontam para o mesmo `@canal`.
- Saúde e Bebê: canal opcional. Se o dono não quiser o trabalho de revisão diária, não crie esses dois.
- Fórmula infantil, medicamento e produto financeiro (cartão, empréstimo, seguro, investimento, conta digital) nunca saem automaticamente em nenhum canal (Q-17).

## Ordem sugerida de criação

1. Top Ofertas (mais alcance com menos volume).
2. Casa & Eletro e Eletrônicos (maior volume de ofertas com histórico).
3. Moda & Tênis e Beleza & Perfumes.
4. Games (quando a divisão de `tech` estiver pronta).
5. Saúde e Bebê, só se houver quem revise todo dia.

Para cada canal: criar no app > adicionar o bot publicador como admin com as permissões de `docs/channel-setup.md` > `/canais` (ou `canal.<cat>`) > `/setup @canal Título`.

## Fora do escopo

- Criar canais ou reservar `@` (ação do dono).
- Mudar a taxonomia no código (P1-11, outro item).
- Cota diária no código (P2-06, outro item).
