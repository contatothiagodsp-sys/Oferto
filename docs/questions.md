# Perguntas e suposições: Fase 1

> **Aguardando respostas do usuário antes da Fase 2.** Este arquivo consolida e deduplica as perguntas de A1 a A5 e as lacunas do A6. Os IDs `P*-**` remetem a [`backlog.md`](backlog.md).

Data: 18/11/2026 · commit `f6ab859` · sintetizador: A7.

## BLOQUEIOS: sem estas respostas a Fase 2 não começa

| Q | Pergunta | Por que bloqueia | Origem | Backlog |
|---|---|---|---|---|
| **Q-01** | **A produção está publicando sozinha agora? Pausamos durante as Fases 2-3?** Pedimos que você mesmo leia (só leitura, via `/config` no bot) estas chaves da `bfx_config`: `radar.ativo`, `radar.publicar_direto`, `auto.publicar_direto`, `selo.exigir_ref90`, `radar.auto_top`, `cupons.radar_auto`, `cupons.esquenta_19h`, `vitrine.auto_noite`, `divulgar.auto_diario`, `guardiao.ativo`, `publicar.plataformas`, `whatsapp.webhook_url`. Se a regra "zero publicação real nesta etapa" vale, a pausa precisa cobrir **todos** os publicadores: `/modo aprovar` só desliga `radar.publicar_direto` e `auto.publicar_direto` (`lib/config.js:706-713`). A pausa é feita por você, não por agentes. | Os padrões do código publicam sozinhos (`lib/config.js:106-108`, cron `*/2` em `build/build-workflows.js:1031`). Qualquer teste da Fase 2 com a produção ligada pode gerar publicação real | A1, A2, A3 Q6, A4, A5 P1, A6 | P1-01 |
| Q-01b | Existe também uma instância **n8n Cloud** ativa com os workflows de `n8n/workflows/`? (`package.json:5` diz "n8n Cloud".) E o reinício do `oferto-n8n-1` (~35 min antes da verificação do A6, sem explicação) foi feito por você? | Uma segunda instância publicando escaparia de qualquer pausa local | A6, A3 Q5 | P4-03 |
| **Q-02** | Aceita que, **antes** de qualquer `npm run build` ou e2e, a saída do build seja separada de `servidor-local/workflows/` (ou que o `preparar.sh` passe a exigir `PUBLICAR_WORKFLOWS=sim`)? Até a resposta, nenhum agente roda build nem `teste-local/rodar.sh`. | O build grava direto no que o `preparar.sh` publica no próximo `compose up` (`build/build-workflows.js:11`, `:1245`; `servidor-local/preparar.sh:6-17`). Também reescreve `docs/CONFIG.md` (`:1266`) | A6 (A4, A5) | P1-03 |
| **Q-03** | No dry-run, mandar a prévia (imagem + legenda) no **privado do admin** conta como "publicação"? Ou o dry-run só grava log/tabela, sem nenhuma chamada ao Telegram? Pode ficar `publicacao.dry_run=sim` como padrão? | Define o desenho do portão único (P1-06), que é pré-requisito de todos os testes | A4, A5 | P1-06, P1-02 |
| **Q-04** | Aprova a decisão D-S1: **sidecar Node** (`render`, `sharp`, template SVG em `lib/imagem.js`, fonte OFL embutida, ~150-200 MB de imagem) no **mesmo compose de produção**, só na rede interna? Ou prefere uma stack separada para teste primeiro? Pillow (Python) e o nó Edit Image do n8n ficam descartados, de acordo? | Sem isso não há imagem obrigatória (bucket 1) nem `setChatPhoto` | A1, A3 Q5, A4, A5 P5 | P1-13, P1-16, P4-07 |
| **Q-05** | **Fonte do histórico de 30 dias:** o brmarket-mcp tem busca grátis (~30 consultas/min/IP, cache de 10 min), mas as tools pagas usam x402/USDC com **chave privada de carteira no ambiente**. Ele não tem histórico, não cobre Amazon/Magalu e pede para manter o `affiliateUrl` dele. Opções: (a) vetado, usamos só o histórico próprio (`bfx_precos`); (b) só busca grátis, como amostrador ML/Shopee, sem carteira e sem o affiliateUrl deles. Em ambos os casos: aceita que, **nos primeiros ~30 dias, quase toda oferta vá para revisão humana** por falta de histórico? | Define a mediana de 30d e se haverá auto-publicação no curto prazo | A1, A2, A6 | P2-12, P2-16, P2-20 |
| **Q-06** | **Disclosure × 200 caracteres:** `#publi`, "link de afiliado" e a frase de Associado Amazon precisam ficar todos na legenda? Algo (ex.: data/hora do preço, frase longa) pode ir para a imagem ou para a mensagem fixada? Medição do A3: com o disclosure curto a legenda fica em 161 a 190 caracteres, sobrando ~55 para o nome do produto. | Sem isso não há formato final de legenda (bucket 3). Risco CONAR (`docs/kit-operacao/04-conformidade.md:16-23`) | A1, A3 Q3 | P3-02, P3-03 |
| **Q-07** | Os termos de Amazon Associados, ML Afiliados e Shopee permitem **baixar e recompor** a foto do produto numa arte própria? E reaproveitar fotos da CDN do Promobit e de canais de terceiros? (**NÃO VERIFICADO**) | Define se o template leva a foto do produto ou só texto e ícone | A3 Q4, A6 | P1-07, P1-12 |

## Publicação, operação e ambiente

| Q | Pergunta | Origem | Backlog |
|---|---|---|---|
| Q-29 | Os padrões do código passam a ser `publicar_direto=nao`, e o `/modo piloto` deixa de ligar a publicação e de gravar `selo.exigir_ref90=nao`? | A6 | P1-02, P2-02 |
| Q-30 | O vigia refaz o Setup (setWebhook e textos do grupo) sozinho quando o túnel rápido muda. Migrar para o perfil ngrok de domínio fixo (`servidor-local/docker-compose.yml:65-70`) ou aceitar isso como exceção à regra de não chamar o Telegram? | A6 | P1-05 |
| Q-31 | E2E: pode trocar a porta para outra (ex.: 5690), ou o e2e só roda com a produção parada? | A5 P2 | P1-04 |
| Q-23 | A cota "3-5 ofertas/dia/canal" vale por canal de categoria (`canal.<cat>`), por tópico do supergrupo ou pelo total da marca? Ela inclui Esquenta, Top 5 e reposts do Guardião? Quais os horários fixos do Despachante? | A4 + A6 | P2-06, P2-21 |
| Q-24 | O modo digest **substitui** os posts individuais (todo o excedente vai para um post diário) ou é opcional por canal? | A1, A4 | P3-08 |

## Imagem e /setup

| Q | Pergunta | Origem | Backlog |
|---|---|---|---|
| Q-10 | Se a imagem gerada falhar, a oferta **não é publicada** (vai para revisão) ou mantemos algum fallback? Proposta: sem fallback para texto. | A1 | P1-10 |
| Q-11 | A "imagem obrigatória" vale para o WhatsApp? Hoje todo envio para o WA é só texto. O endpoint de mídia do Evolution/WAHA está **NÃO VERIFICADO**. | A6 | P1-08 |
| Q-12 | Posts de **cupom de loja** (sem produto, hoje com o logo da loja) podem ter imagem gerada com logo + código, ou ficam proibidos pela regra? Também: devem passar pela fila de revisão? | A4, A6 | P2-09 |
| Q-13 | Preço e desconto desenhados **dentro** da imagem (exige `editMessageMedia` com nova renderização quando o preço muda ou a oferta encerra) ou preço só na legenda? | A6 (A4-12) | P1-15 |
| Q-14 | Mapeamento para os 5 templates: separar "Tech & Games" em Eletrônicos e Games (por palavra-chave)? Perfumes → Beleza? Saúde e bebê só em revisão, sem template? | A1, A2, A3 Q9, A4 | P1-11 |
| Q-14b | O `/setup` troca o título do canal (`setChatTitle`) automaticamente pelo nome da categoria ou só quando o admin passa o título no comando? | A4 | P1-09 |
| Q-32 | Resolução mínima da foto de origem para aceitar a oferta (proposta: ~600 px no lado menor)? | A3 | P1-12 |

## Anti-falso-desconto

| Q | Pergunta | Origem | Backlog |
|---|---|---|---|
| Q-15 | Parâmetros de integridade: mínimo de amostras, dias cobertos dos 30 e salto máximo entre fontes que separam "consistente" de "provisória". E qual a tolerância de "próximo do menor patamar" (ex.: 3%)? Hoje o padrão é 0% (`lib/config.js:86`). | A2 | P2-15, P2-20 |
| Q-16 | As 24 lojas fora da whitelist (farmácias, moda, Shein, TikTok, KaBuM etc.) passam para **revisão humana** ou **saem do radar**? A Magalu entra como loja nesta etapa (id + afiliado; o extrator já desempacota links Magalu)? Existe programa de afiliado Magalu do dono? | A1, A2, A4 | P2-07 |
| Q-17 | Confirma saúde e bebê/infantil como sensíveis? O que conta como "financeiro" (não existe essa categoria hoje)? | A2 | P2-03 |
| Q-18 | Frete DESCONHECIDO: a legenda diz "R$ X + frete" e a oferta pode auto-publicar, ou vai para revisão? | A2, A3 Q7 | P2-08 |
| Q-19 | O cashback entra no `preco_final` mesmo sendo condicional (hoje o extrator o descarta)? | A2 | P2-08 |
| Q-20 | Republicar ofertas garimpadas de canais e sites de terceiros (@canaltechofertas, @xetdaspromocoes, Gatry, Promobit) trocando o afiliado é aceitável? E o scraping com User-Agent falso (Amazon/Zoom, `lib/mercado.js:10-20`)? | A6, A1, A2 | P2-04, P2-11 |
| Q-21 | ReefAPI: alguém confirma cobertura de marketplaces BR, endpoint de histórico de 30d e a regra de "1 conta só"? Sem isso, ela fica fora do desenho. Keepa (paga) fica desligada? | A2 | P2-13, P2-14 |
| Q-22 | Já na 1ª entrega da Fase 2: `sem_ref` nunca auto-publica e o `/radar` por comando passa a aplicar a trava (ou só gera card)? | A2 + A6 | P2-01, P2-02 |

## Textos e link

| Q | Pergunta | Origem | Backlog |
|---|---|---|---|
| Q-08 | Existe domínio próprio (oferto.ai está **NÃO VERIFICADO**)? Se não houver: aceitamos link curto que não é da marca (encurtador oficial do programa), link só no botão inline, ou rota `/l/<id>` no próprio n8n via Caddy sobre o domínio fixo do ngrok? | A1, A3 Q1 | P3-09, P3-10 |
| Q-09 | Os termos de Amazon Associados e ML Afiliados permitem redirecionador próprio (cloaking) na frente do link de afiliado? (**NÃO VERIFICADO**; `docs/kit-operacao/04-conformidade.md:78` pendente) | A3 Q2 | P3-10 |
| Q-25 | O limite de 200 caracteres (e a imagem) vale só para o Telegram, ou também para o canal/grupo de WhatsApp e para o X (que hoje tem 280)? Os botões inline continuam (não contam nos 200)? | A3 Q8, A6 | P3-06 |

## Repositório e segurança

| Q | Pergunta | Origem | Backlog |
|---|---|---|---|
| Q-26 | O repo GitHub está **PUBLIC**, mas `servidor-local/README.md:58` diz privado. Tornar privado (gratuito) ou corrigir a doc? Isso afeta o CI (cota) e o uso do token `gh` com escopo `workflow`. | A1, A5 P3, A6 | P4-02, P4-09 |
| Q-27 | O ID `-1003927635700` em `tests/comunidade.test.js` é do grupo real? | A5 P4 | P4-04 |
| Q-28 | Confirma o trabalho na branch `feat/audit-e-otimizacao` a partir de `f6ab859`, sem push direto em `main`? | A5 P6 | P4-06 |
| Q-33 | Cifrar os backups (age/openssl com senha fora do repo)? Onde guardar a senha? | A1, A5 | P4-08 |

---

## Suposições adotadas (valem até serem contestadas)

1. **Nada foi verificado no estado real da produção.** Toda afirmação sobre "publica sozinho" vem dos **padrões** do código e do `docker ps`. A `bfx_config` não foi lida (por isso a Q-01).
2. Os "3 ofertas reais publicadas" (`docs/SALVAMENTO-PROJETO.md:85`) vieram de um e2e em n8n de teste com fontes reais, não comprovam postagem no canal de produção.
3. O render fora do Code node é uma **escolha de projeto**: o n8n permitiria `require` via `NODE_FUNCTION_ALLOW_*`, mas isso contraria a convenção do repo (`docs/SALVAMENTO-PROJETO.md:45`) e o suporte no task-runner 2.47.7 está **NÃO VERIFICADO**.
4. Sem fonte externa de histórico, a mediana de 30d só existe depois de ~30 dias de amostragem própria. Até lá, a integridade é "insuficiente/provisória" e o destino padrão é a revisão humana.
5. Custo zero absoluto exclui: tools pagas do brmarket-mcp, Keepa, domínio próprio pago e qualquer carteira cripto.
6. "Canal" na cota 3-5/dia é, por padrão, cada canal Telegram de categoria. A cota cobre todos os publicadores automáticos até a resposta da Q-23.
7. O dry-run padrão grava em log/tabela e **não** faz nenhuma chamada ao Telegram, nem no privado do admin, até a resposta da Q-03.
8. Afilimax, citado no prompt mestre, **não tem nenhuma referência no repo** e não foi pesquisado: **NÃO VERIFICADO**. Fica fora do plano até o dono dizer qual é o papel dele.
9. Versões exatas de `sharp`, `@resvg/resvg-js` e `@napi-rs/canvas` e a compatibilidade com Alpine/musl estão **NÃO VERIFICADAS**. Serão fixadas na Fase 2 com lockfile.
