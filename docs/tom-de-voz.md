# Tom de voz por nicho (copy dos envios)

Cada post de oferta ganha **uma frase logo abaixo do nome do produto**. Ela tem que soar como alguém do grupo mandando um achado no WhatsApp ou no Telegram: português falado, frase curta, com o vocabulário de quem consome aquele nicho. Não pode parecer descrição de e-commerce, texto traduzido ou verbete.

O resto do post (preço, cupom, link, avisos do CONAR) não muda.

Código: [lib/tom.js](../lib/tom.js) (roteador, banco de frases, validação) e [lib/tom-ia.js](../lib/tom-ia.js) (prompt e chamada à Claude API). Testes: [tests/tom.test.js](../tests/tom.test.js).

## A régua

| Em vez de… | …escreva |
|---|---|
| "Os 180Hz deixam o movimento mais fluido." (explica o óbvio) | "180Hz por esse valor é a deixa pra aposentar o monitor de 60Hz de vez." |
| "Pra cozinhar com mais praticidade na correria da semana." (vitrine) | "A maior aliada de quem chega morto do trampo e não quer nem olhar pra pia." |
| "Controle extra pra partida em dupla." (descrição) | "Nesse preço compensa demais deixar de reserva antes que o seu dê drift." |
| "Fragrância árabe pra quem gosta de ser lembrado." (institucional) | "Pra quem curte perfumaria árabe e tava esperando baixar pra colocar na coleção." |
| "Álbum pra quem coleciona K-pop." (genérico) | "Álbum do BTS nesse valor? Se faltava na coleção, é a deixa pra garantir." |

As quatro diretrizes:

1. **Não explique o produto.** Quem compra já sabe o que é 180Hz ou NVMe. Fale da dor real, do upgrade ou do porquê de valer a pena: aposentar o 60Hz, fugir do drift, não lavar louça, o perfume parado na wishlist, aquele álbum que falta na coleção.
2. **Português falado, ritmo de conversa.** Frase curta e direta; "pra", "tá", "trampo", pergunta, travessão. Use o vocabulário do nicho (fandom, drift, backlog, setup, wishlist, pegada) quando soar natural, sem meme e sem gíria caricata.
3. **Empurrão natural pro clique.** A frase tem cara de curadoria ("é a deixa pra", "compensa demais", "tá esperando o quê?"), não de anúncio.
4. **Dentro das regras de publicidade.** O post é publicidade (CONAR) e [04-conformidade.md](kit-operacao/04-conformidade.md) proíbe urgência que não dá pra provar, porque não sabemos o estoque.

### O que a régua não permite (e por quê)

Os exemplos originais de referência foram ajustados em dois pontos para caber nas regras do projeto:

| Original | Problema | Versão usada |
|---|---|---|
| "…nesse valor **some rápido** — se faltava na coleção, **a hora é agora**." | escassez e pressa sem prova (não sabemos o estoque) | "Álbum do BTS nesse valor? Se faltava na coleção, é a deixa pra garantir." |
| "Aquele árabe de **projeção absurda** saindo **por menos que muito nacional**." | desempenho afirmado como fato e comparação de preço com outros produtos sem verificação | "Pra quem curte perfumaria árabe e tava esperando baixar pra colocar na coleção." |
| "Árabe de **rastro marcante** nesse valor é **blind buy sem medo**." | nem todo árabe projeta muito; oud, couro e especiarias pesadas dividem opiniões, e recomendar compra às cegas gera crítica no grupo | a mesma frase acima |

"Nesse valor", "nesse preço", "baixou" e "com o cupom" só aparecem quando a oferta tem **comparação verificada** (preço abaixo do "De:" da loja ou do menor preço de 90 dias) ou **cupom ativo**. Com preço normal, a frase fala da dor e do uso, sem elogiar o preço.

### Perfumaria e itens de gosto pessoal

Fixação, projeção e rastro dependem do perfume e da pele, e gosto é pessoal. Por isso:

- **Banco de frases:** como não sabe qual é o perfume, fala só da oportunidade e de quem acompanha o nicho, sem performance e sem incentivo a compra às cegas.
  - Com desconto verificado: "Pra quem curte perfumaria árabe e tava esperando baixar pra colocar na coleção."
  - Com preço normal: "Mais um da leva de perfumaria árabe que costuma chamar atenção na coleção."
- **IA:** se reconhecer o perfume com **alta certeza** pelo nome, pode citar em poucas palavras a proposta ou a ocasião pela qual ele é conhecido (pegada noturna, mais fresco pro dia a dia, adocicado, queridinho da galera). Sem certeza, não inventa notas, proposta nem performance e fala só da categoria e da oportunidade. Exemplo com o perfume reconhecido: "Queridinho de quem curte perfume adocicado pra noite, e nesse valor sai fácil da wishlist."
- **Validação:** em perfumaria, qualquer menção a fixação, projeção, rastro, duração, "blind", "às cegas" ou "sem cheirar" reprova a frase. "Blind buy sem medo/sem erro" e "compra certa" reprovam em qualquer nicho.

## Arquitetura

```
oferta (título + categoria + preço/cupom)
   │
   ▼
1. Roteador de tom ── detectarNicho()                                   lib/tom.js
   nicho/subnicho: kpop/album|lightstick|colecionavel, games/console|controle|jogo|periferico|acessorio,
   hardware/pc|monitor|notebook, tech/audio|tv|celular, casa/airfryer|cozinha|limpeza|clima|cama|eletro,
   perfumes/arabe|nicho|geral, beleza/protetor|skincare|cabelo|make, moda/corrida|tenis|calcado|roupa,
   bebe/fralda|geral, pet, suplementos, ferramentas, saude (sem frase)
   + grupo e fandom de K-pop (BTS → ARMY, Stray Kids → STAY, TWICE → ONCE…)
   + especificações do título (Hz, NVMe, DDR, RTX, OLED, 4K, cancelamento de ruído, Wi-Fi)
   + PERFIS[nicho]: público, jeito de falar, dores reais, vocabulário do nicho, o que evitar
   + contexto da oferta: neutro | queda (comparação verificada) | cupom
   │
   ├──► 2. Geração por IA (opcional, copy.ia = sim)                     lib/tom-ia.js
   │       pedidoCopyIA() → nó HTTP "Copy IA (Claude)" → lerCopyIA() → validarCopy()
   │       aprovada: links_manuais.copy_ia (Telegram, WhatsApp e reedições usam a mesma frase)
   │       erro / timeout / recusa / reprovada: links_manuais.copy_ia_falha com o motivo
   │
   └──► 3. Fallback ── fraseNicho()                                     lib/tom.js
           banco por nicho/subnicho e contexto; com especificação no título (hardware/tech),
           frase de upgrade da spec; escolha fixa por produto (mesmo produto, mesma frase)
   │
   ▼
linhaCopy() → textoTelegram / textoWhatsAppGrupo / textoWhatsAppCanal (abaixo do título)
resumoCopy() → card de aprovação: "Tom (K-pop · BTS · IA): …" ou "… · banco de frases · IA: timeout"
```

### Onde entra nos workflows

| Workflow | Ponto | Nós |
|---|---|---|
| 01 · roteador (link colado / `/oferta`) | depois de `Juntar mercado oferta`, antes de gravar a oferta | `Pedir copy IA` → `Gerar copy IA?` → `Copy IA (Claude)` → `Juntar copy IA` |
| 04 · radar (publicação automática) | depois de `Auto radar?`, antes de `Publicar lote radar` | `Pedir copy radar` → `Gerar copy radar?` → `Itens copy radar` → `Copy IA radar` → `Juntar copy radar` |

O system prompt fica em `SYSTEM_COPY` ([lib/tom-ia.js](../lib/tom-ia.js)) e o `npm run build` embute esse texto nos nós acima. Os nós HTTP usam `onError: continueRegularOutput` e `timeout` (`copy.ia_timeout_ms`): se a IA falhar, o fluxo segue com o banco de frases. A chave vai direto da configuração para o cabeçalho `x-api-key` e não passa pelos itens da execução. No radar, só as `copy.ia_max_por_ciclo` primeiras ofertas de cada rodada vão para a IA.

### Validação (IA e banco)

`validarCopy()` reprova a frase, que então cai no fallback, quando ela:

- tem menos de 15 ou mais de 120 caracteres, link, hashtag, `@` ou marcação (`*`, `_`, `~`, `<`);
- cita `R$`, `%`, parcela ou número que não está no título (exceção: "60Hz", a referência do upgrade);
- usa pressa ou escassez sem prova: "corre que", "some rápido", "esgota", "voando", "só hoje", "últimas unidades", "a hora é agora", "antes que acabe", "pode acabar", "imperdível", "não perca";
- afirma o que exige verificação: "menor preço", "histórico", "preço raro", "nunca vi", "mais barato que", "por menos que", "contratipo", "frete", "grátis", "brinde", "original", "oficial", "garantia";
- elogia o preço ("nesse valor", "barato", "baixou", "cupom") quando a oferta não tem comparação verificada nem cupom;
- promete resultado de saúde ou beleza ("emagrece", "cura", "trata", "clareia", "rejuvenesce");
- em perfumaria, promete performance (fixação, projeção, rastro, duração) ou incentiva compra às cegas; em qualquer nicho, garante acerto em item de gosto pessoal ("blind buy sem medo", "compra certa");
- está em caixa alta ou tem mais de uma exclamação.

Emojis e aspas das pontas são removidos. Medicamentos não ganham frase. Saúde e suplementos usam só o banco de frases.

### Prompt de geração

`SYSTEM_COPY` define a persona (quem garimpa e manda os achados no grupo), as quatro diretrizes acima, os limites de publicidade, a regra de **perfumaria e itens de gosto pessoal** e a **régua de naturalidade** com os exemplos aprovados (few-shot). Para perfume, a régua tem três exemplos: árabe não reconhecido com desconto, árabe não reconhecido a preço normal e Lattafa Khamrah reconhecido.

A mensagem do usuário é a **ficha do produto**: nome enxuto, loja, nicho/subnicho, público, jeito de falar, dores e motivos de compra, vocabulário do nicho, o que evitar, grupo/fandom, especificações do título, o momento da oferta e duas frases do banco para aquele contexto. O momento diz se pode ou não falar de preço. Em perfumaria, a ficha também repete a regra de gosto pessoal. A ficha não leva valores.

A resposta vem em JSON (`output_config.format` com o schema `{ copy }`), com `effort: low`. Nos modelos que aceitam, o pedido inclui `fallbacks: "default"` para o caso de recusa.

## Configuração

| Chave | Padrão | Efeito |
|---|---|---|
| `copy.tom` | `sim` | Liga a frase de tom (banco de frases, custo zero). |
| `copy.ia` | `nao` | Usa a Claude API para escrever a frase. |
| `copy.ia_chave` | vazio | Chave da Claude API (só pelo painel do n8n, Data Table `bfx_config`). |
| `copy.ia_modelo` | `claude-opus-5-5` | Modelo usado (ex.: `claude-sonnet-5-5`, `claude-haiku-5-5` para custo menor). |
| `copy.ia_timeout_ms` | `15000` | Espera máxima antes do fallback. |
| `copy.ia_max_por_ciclo` | `5` | Teto de chamadas por rodada do radar. |

## Exemplos de saída (banco de frases)

Gerados pelo código com a IA desligada. Mostra só o nome do produto e a frase.

| Produto | Contexto | Frase |
|---|---|---|
| BTS – Album Proof | abaixo do "De" | ARMY, esse do BTS baixou: dá pra completar a coleção sem chorar no boleto. |
| Controle DualSense | abaixo do "De" | Nesse valor dá pra ter um reserva e não ficar na mão quando o seu der drift. |
| Monitor LG 27" 180Hz | abaixo do "De" | 180Hz por esse valor é a deixa pra aposentar o monitor de 60Hz de vez. |
| Air Fryer Mondial 4L | preço normal | A maior aliada de quem chega morto do trampo e não quer nem olhar pra pia. |
| Lattafa Khamrah EDP | abaixo do "De" | Pra quem curte perfumaria árabe e tava esperando baixar pra colocar na coleção. |
| Lattafa Khamrah EDP | preço normal | Mais um da leva de perfumaria árabe que costuma chamar atenção na coleção. |
| Tênis de corrida Asics Novablast 4 | abaixo do "De" | Tênis de corrida nesse valor é a deixa pra aposentar o surrado. |
| Fralda Pampers XG 76 un. | cupom | Com o cupom, dá pra fazer aquele estoque de fralda. |
| Fone JBL 770NC (cancelamento de ruído) | preço normal | Ônibus lotado e escritório barulhento viram outro mundo com um desses. |
| Protetor La Roche-Posay FPS 70 | abaixo do "De" | Protetor nesse valor é pra fazer estoque pro ano todo. |
| Ventilador Mondial 40cm | preço normal | Noite de calor sem ficar virando na cama. |

Post completo no Telegram (texto visível):

```
👗 Moda, Roupas & Tênis · 👟 CALÇADOS · #publi
Tênis de Corrida Asics Novablast 4 Masculino
Tênis de corrida nesse valor é a deixa pra aposentar o surrado.
💰 R$ 549,90 na Amazon (antes R$ 799,90 · -31%)
```

No WhatsApp a frase entra na mesma posição, logo abaixo do `*nome do produto*`. Posts de atualização ("baixou mais") e de cupom de loja não recebem a frase.

## Como ampliar

- **Novo nicho ou subnicho:** uma regra em `REGRAS_NICHO`, um perfil em `PERFIS` (com `dores`) e um bloco em `BANCO`, com frases `neutro` e, se fizer sentido, `queda` e `cupom`. O teste "banco de frases" valida cada frase no próprio contexto.
- **Novo grupo de K-pop:** uma linha em `GRUPOS_KPOP` (id, nome de exibição, fandom, regex).
- **Nova especificação:** um caso em `especificacoes()` e as frases `neutro`/`queda` em `FRASES_SPEC`, falando do upgrade e não do que a spec faz.
- **Ajustar a régua da IA:** os exemplos ficam no fim de `SYSTEM_COPY`. Depois de mudar, rode `npm run build` para atualizar os workflows.
