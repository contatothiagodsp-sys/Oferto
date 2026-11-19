# Templates de imagem (arte 1080x1080)

Itens do backlog: P1-11 (templates por categoria), P1-12 (foto de origem), P1-13 (motor), P1-16 (imagem gerada), P1-17 (grade de listas).
Decisões aplicadas: Q-04 (D-S1), Q-07, Q-10, Q-14, Q-17, Q-32 (`docs/decisions/fase2-respostas.md`).

## Arquitetura

| Peça | Onde | O que faz |
|---|---|---|
| `lib/imagem.js` | lib (embutida no n8n pelo build) | Funções **puras**: categoria -> template, layout, escape XML, SVG 1080x1080. Sem `require`, sem I/O. Testada em `tests/w2-imagem.test.js`. |
| `render/` | sidecar Node no compose (só rede interna) | `POST /render` baixa a foto (allowlist), valida a resolução, embute a foto no SVG como data URI e rasteriza com `sharp` 0.34.5. Responde `image/jpeg` em memória. Nunca grava em disco. |
| Fonte | `render/fonts/` | Montserrat Bold/ExtraBold, SIL OFL 1.1 (`render/fonts/OFL.txt`), baixada do repositório oficial `github.com/JulietaUla/Montserrat` (`fonts/ttf/`). O `fonts.conf` só enxerga essa pasta, então o render é determinístico. |

## Regras de toda arte

- Tela 1080x1080, JPEG (qualidade 88, mozjpeg).
- No máximo **3 informações** por oferta: produto, preço e desconto. Sem logo e sem nome de loja (`docs/kit-operacao/04-conformidade.md:46`), sem marca, sem preço antigo.
- **Preço** é o maior texto (até 150 px no post único), e o **desconto** vem logo depois (selo circular, cerca de 90 px). O título fica entre 34 e 44 px, em até 2 linhas, e é cortado com "…" se passar disso.
- Nenhum texto fica abaixo de **32 px** (`FONTE_MIN_ARTE`).
- O selo de desconto só aparece com `desconto_pct` entre 1 e 95 vindo de quem chama. A lib **não calcula nem inventa** desconto.
- Todo texto passa por escape XML. Caracteres de controle, emoji e símbolos fora do Latin estendido saem do título.
- Só entra no SVG a foto que o próprio render embutiu (`data:image/(jpeg|png|webp);base64,...`). URL externa, `file:` e SVG nunca entram. O render também descarta qualquer `foto` vinda no corpo.
- Contraste WCAG de pelo menos 4,5:1 em todo texto, conferido no teste.

## Templates

| Template | Uso | Fundo (gradiente) | Selo de desconto | Ícone (modo sem foto) |
|---|---|---|---|---|
| `eletronicos` | Eletrônicos | `#0B3D91` -> `#06245A` | `#FFD23F`, texto `#1A1A1A` | smartphone |
| `casa` | Casa | `#1D5C4D` -> `#0F3A30` | `#FFB703`, texto `#1A1A1A` | casa |
| `moda` | Moda | `#5E1A47` -> `#3A0E2B` | `#FF8FB1`, texto `#1A1A1A` | camiseta |
| `games` | Games | `#2A0D5E` -> `#14052F` | `#3DF58A`, texto `#1A1A1A` | controle |
| `beleza` | Beleza | `#8E2457` -> `#5A1235` | `#FFD6E5`, texto `#4A0D2A` | gota |
| `neutro` | sensíveis e sem categoria | `#2F3B45` -> `#1B232A` | `#FFC107`, texto `#1A1A1A` | etiqueta |

Em todos os templates o título é branco sobre o fundo, e o preço aparece na cor do fundo sobre uma faixa branca.

## Categoria interna -> template (`templateDaCategoria(categoria, titulo)`)

| Categoria interna (`lib/config.js`) | Template | Sensível (vai para revisão) |
|---|---|---|
| `tech` com palavra de games (ps5, xbox, nintendo, gamer, console, dualsense, controle ps5...) | `games` | não |
| `tech` (demais) | `eletronicos` | não |
| `perfumes`, `beleza` | `beleza` | não |
| `casa` | `casa` | não |
| `moda` | `moda` | não |
| `saude`, `bebe` | `neutro` | **sim** |
| qualquer categoria com palavra sensível no título (saúde, bebê/infantil, financeiro: cartão de crédito, empréstimo, seguro, investimento, conta digital...) | `neutro` | **sim** |
| `top` ou sem categoria | busca por palavra-chave (games > eletrônicos > casa > moda > beleza). Sem resultado: `neutro` | não |

Um template explícito no pedido vence a categoria, **exceto** em oferta sensível, que é sempre `neutro` com `sensivel=true`. As listas de palavras ficam em `PALAVRAS_TEMPLATE`.

## Modos de imagem (`imagem.usar_foto_produto`, Q-07)

- `sim` (padrão): a foto do produto ocupa o cartão central (780x640, com área útil de 732x592), redimensionada sem corte (`contain`) sobre fundo branco. Sem foto válida, o render responde **422 `foto_ausente`**, e a oferta vai para revisão (Q-10, sem fallback para texto).
- `nao`: o cartão central mostra o ícone da categoria sobre um círculo na cor do selo. Não precisa de foto.

## Layout do post único

```
y   48..688   cartão branco com foto/ícone (x 150..930)
    selo de desconto: círculo r=118 em (880,130), sobre o canto do cartão
y  ~758..810  produto (1 ou 2 linhas, 34-44 px, branco)
y   850..1036 faixa branca com o preço (60-150 px, cor do template)
```

## Grade de listas (P1-17)

`svgLista({ template?, categoria?, itens: [1..6], usar_foto? })`

| Itens | Layout | Célula |
|---|---|---|
| 1 | `1` | 1008x1008 |
| 2 | `2x1` | 492x1008 |
| 3-4 | `2x2` | 492x492 |
| 5-6 | `3x2` | 320x492 |

Margem de 36 px e espaço de 24 px entre células. Cada quadro traz foto ou ícone, o produto em 1 linha (32-40 px, cortado com "…"), o preço (a mesma fonte em todos os quadros, a maior que cabe em todos) e o selo de desconto quando houver. Se qualquer item for sensível, a lista inteira vira `neutro` com `sensivel=true`.

## Serviço `render/`

`POST /render` com `Content-Type: application/json`:

```json
{ "template": "casa", "usar_foto": "sim",
  "oferta": { "titulo": "...", "preco": 279.9, "desconto_pct": 40, "categoria": "casa", "imagem": "https://http2.mlstatic.com/..." } }
```

ou `{ "itens": [ { "titulo", "preco", "desconto_pct", "imagem" }, ... ] }` com 1 a 6 itens.

Resposta `200 image/jpeg` (1080x1080) com os cabeçalhos `X-Oferto-Template`, `X-Oferto-Layout`, `X-Oferto-Sensivel` (`1` = mandar para revisão) e `X-Oferto-Com-Foto`.

Erros (JSON `{ ok:false, erro, detalhe, revisao:true }`). Quem chama manda a oferta para revisão com status `rejeitada_sem_imagem`:

| HTTP | `erro` | Quando |
|---|---|---|
| 400 | `json_invalido`, `entrada_invalida`, `preco_invalido`, `titulo_ausente`, `template_invalido`, `itens_invalidos` | entrada ruim |
| 413 | `corpo_grande_demais` | corpo acima de `RENDER_MAX_CORPO` (64 KiB) |
| 415 | `content_type_invalido` | o corpo não é JSON |
| 422 | `foto_ausente`, `foto_pequena` (< 600 px no lado menor, Q-32), `host_nao_permitido`, `url_invalida` (não HTTPS, credenciais ou porta), `foto_indisponivel`, `foto_timeout`, `foto_grande_demais`, `foto_tipo_invalido` (inclusive SVG), `foto_invalida` | problema na foto |
| 503 | `ocupado` | renders simultâneos acima de `RENDER_MAX_SIMULTANEOS` (pode tentar de novo) |

`GET /health` -> `{ ok:true, servico, sharp, ativos }`.

### Allowlist de hosts de foto (SSRF)

Só HTTPS na porta 443, sem credenciais e sem IP literal. Aceita o domínio e seus subdomínios:
`mlstatic.com` (Mercado Livre), `media-amazon.com`, `images-amazon.com`, `ssl-images-amazon.com` (Amazon), `susercontent.com`, `shopee.com.br` (Shopee) e `mlcdn.com.br` (Magalu). Para incluir outros, use `RENDER_HOSTS_EXTRA=dominio1,dominio2`. Cada redirecionamento (no máximo 3) é revalidado. O proxy `wsrv.nl`/`images.weserv.nl` **não** está na lista, porque buscaria URLs arbitrárias.

### Variáveis de ambiente

| Variável | Padrão |
|---|---|
| `PORT` / `HOST` | `8080` / `0.0.0.0` |
| `RENDER_MIN_LADO` | `600` |
| `RENDER_TIMEOUT_MS` | `8000` (download inteiro, corpo incluído) |
| `RENDER_MAX_BYTES` | `8388608` |
| `RENDER_MAX_CORPO` | `65536` |
| `RENDER_MAX_SIMULTANEOS` | `4` |
| `RENDER_QUALIDADE_JPEG` | `88` |
| `RENDER_HOSTS_EXTRA` | vazio |

### Build e testes

```
docker build --build-context lib=lib -t oferto-render render      # da raiz do repo
cd render && npm ci && npm test                                    # testes com sharp (sem rede)
RENDER_AMOSTRAS=<dir> npm test                                     # grava as amostras JPEG em <dir>
```

Imagem `node:20.19.5-slim`, usuário `node` (não-root), `HEALTHCHECK` em `/health`. No compose: `build: { context: ../render, additional_contexts: { lib: ../lib } }`, sem `ports:` (só rede interna) e com `read_only: true` mais `tmpfs: [/tmp]` (só o cache do fontconfig vai para `/tmp`; nenhuma imagem é gravada).

Atenção: no Windows, o `sharp` usa o backend de fontes do sistema (não o fontconfig), então as amostras geradas fora do contêiner saem com outra fonte. A fonte só vale de fato no Linux/contêiner.
