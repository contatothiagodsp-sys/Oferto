# A7 (sintetizador): log de decisões e suposições, fase 1

Data: 18/11/2026 · commit `f6ab859`. Somente leitura do código. Arquivos escritos: `docs/backlog.md` (novo), `docs/questions.md` (novo), `docs/audit.md` (só **acréscimo** da §10; as §1-9 do A1 ficaram intactas) e este log.

## O que foi executado
- Leitura de `docs/audit.md` e de `docs/decisions/A1-fase1.md`.
- Conferência pontual (`sed` nas linhas citadas, sem busca às cegas) das lacunas do A6 de maior impacto antes de colocá-las no topo do backlog:
  - `lib/radar.js:1192-1193`, `:1226`, `:1300`: `/radar` em modo comando pula `avaliarOfertaReal`, e `modoAuto` não depende do modo.
  - `lib/config.js:664-672`, `:688-694`: `/modo piloto` grava `selo.exigir_ref90=nao` e `radar.publicar_direto=sim`.
  - `lib/config.js:706-713`: `/modo aprovar` só zera `auto.publicar_direto` e `radar.publicar_direto`.
  - `servidor-local/preparar.sh:1-18`: importa e publica quando o hash muda.
  - `servidor-local/vigia.sh:3`: chama o workflow 90 quando o túnel muda.
  - `build/build-workflows.js:1266`: o build reescreve `docs/CONFIG.md`.
  - `package.json:5`: diz "n8n Cloud".
- **Não** executei `npm test`, build, e2e, docker nem nada de rede. Nenhuma chamada ao Telegram.

## Decisões de síntese

### S-01: Deduplicação por ID consolidado
Os ~95 achados sobreviventes e as 24 lacunas do A6 viraram 58 linhas de ação (17 + 21 + 10 + 10) (P1-01..P4-10) e 12 linhas "OK". Cada linha lista entre parênteses **todos** os IDs originais que absorve. Nenhum ID sobrevivente ficou de fora:

| Original | Destino |
|---|---|
| A1-01..26 | P1-01, P1-16, P1-13, P1-09, P2-15, P2-16, P2-07, P2-03, P2-17, P2-12, P3-02, P3-01, P3-10, OK-05, P2-06/P3-08, P4-01, OK-03, P4-08, P4-07, OK-04, P4-09, OK-01, P1-04, P2-11, P4-05, OK-02 |
| A2-01..20 | P1-01 (+P2-02), P2-16, P2-15, P2-20, P2-10, P2-08, P2-17, P2-07, P2-03, P2-11, P2-12, P2-13, P2-14, P2-06, P2-18, P3-05, OK-09, OK-10, P2-19, OK-01 |
| A3-01..20 | P1-16/P1-10, P1-13, P1-11, P1-17, P1-12, P3-02, P3-03, OK-05, P3-07, P3-01, P3-04, OK-06, P2-05, P3-05, P2-08, P3-10, P3-09, P1-07, P1-01, OK-07 |
| A4-01..17 | P1-01, P1-09, P1-10, P1-16, P1-14, P1-06, OK-08, P2-06, P2-21, P2-17, P2-03/P2-07, P1-15, OK-12/P3-08, P3-02/P3-01, OK-11, OK-01, P4-07/P4-01 |
| A5-01..16 | P1-01, P1-03, P1-06, P1-13/P4-07, P4-07, P4-07, P4-01, P4-02, OK-03, P4-04, P4-08, P1-04, OK-01, OK-04, P4-06, P4-10 |

Lacunas do A6 (numeração própria, A6-01..A6-24, citada nas linhas do backlog):
01 outros publicadores → P1-01 · 02 dois alvos de deploy → P4-03 · 03 republicação de terceiros → P2-04 · 04 carteira do brmarket → P2-12 · 05 taxonomia → P1-11 · 06 hotlink de CDN → P1-12 · 07 `grupo.js` → P1-09 · 08 `/radar` por comando → P2-01 · 09 `/modo piloto` → P2-02 · 10 cupons de loja → P2-09 · 11 provas fracas → P2-15 · 12 mercado com cupom / R$ 40 → P2-11 · 13 estado de produção não lido → P1-01 e Q-01 · 14 WhatsApp só texto → P1-08 · 15 imagem × edição → P1-15 · 16 fallback para texto → P1-10 · 17 "De" no ramo de cupom → P2-05 · 18 X 280 → P3-06 · 19 em_alta ≥8% → P2-15 · 20 build = deploy → P1-03 · 21 WhatsApp fora do dry-run → P1-06 · 22 padrões → P1-02 · 23 vigia → P1-05 · 24 escopo `gh` → P4-02. A lacuna "package.json diz Cloud" foi fundida com a 02.

### S-02: Portão 1A dentro do bucket 1
O prompt pede buckets 1-4. Os itens de segurança operacional (pausa da produção, build = deploy, padrões, dry-run, vigia, porta do e2e) não pertencem a nenhum bucket, mas são **pré-requisitos** para testar qualquer coisa. Em vez de criar um "bucket 0", coloquei-os em "1A: portão" no topo do bucket 1, que é o primeiro a ser executado.

### S-03: Ritmo/cota diária e fila no bucket 2
Ritmo de 3-5/dia não está na lista de prioridades do prompt. Coloquei-o no bucket 2 porque é o que **limita a auto-publicação**, junto da whitelist e da fila de revisão (mesmo ponto de decisão no Despachante). O digest ficou no bucket 3 (formato de texto/grade).

### S-04: Notas ajustadas pelas ressalvas do A6
Quando o A6 apontou exagero ou subestimação, usei a nota corrigida e registrei o ajuste na tabela "Ressalvas incorporadas" do backlog. Exemplos: P1-04 impacto 2; P1-06 esforço 4; P1-09 esforço 2; P4-01 impacto 4 (repo PUBLIC); P3-04 impacto 2.

### S-05: Ordenação
Dentro de cada sub-bucket, impacto ÷ esforço em ordem decrescente; no empate, maior impacto primeiro. Com isso o épico P1-16 (imagem, 5/4) aparece depois de seus componentes mais baratos. Isso é intencional: os componentes (P1-10, P1-13, P1-14) são as entregas incrementais do épico.

### D-S1: Motor de imagem (decisão proposta, aguarda Q-04)
- **Escolha:** sidecar Node (`render`) no `servidor-local/docker-compose.yml`, só na rede interna, com Dockerfile próprio (`node:20-slim`).
  - O template é um **SVG gerado por função pura** em `lib/imagem.js`: 5 templates, grade de 1-6 fotos, preço/desconto como maior texto, fonte ≥32 px. É testável com `node --test` sem rede e sem binários.
  - O serviço usa **`sharp`** (libvips, Apache-2.0) para baixar e redimensionar as fotos (com allowlist de hosts, timeout e limite de bytes), compor sobre o SVG e codificar o JPEG 1080x1080 em memória. A fonte OFL fica embutida na imagem do contêiner (fontconfig).
- **Reserva:** `@resvg/resvg-js` (MPL-2.0) para rasterizar o SVG com fonte carregada por arquivo, se a renderização de texto do librsvg/sharp falhar. `satori` + resvg e `@napi-rs/canvas` são alternativas equivalentes (A1/A5).
- **Descartados:**
  - Pillow: segundo runtime (Python) só para isso, e os testes do projeto são `node --test`.
  - Nó Edit Image do n8n: GraphicsMagick na `n8nio/n8n:2.47.7` NÃO VERIFICADO e difícil de testar.
  - Módulos externos no Code node: contraria a convenção do projeto; suporte no task-runner NÃO VERIFICADO.
  - Serviços externos (Cloudinary, wsrv): custo, limites e dependência; já houve 404 do wsrv (`docs/SALVAMENTO-PROJETO.md:80`).
- **Por que SVG + sharp e não canvas:** o template SVG puro em `lib/` mantém a lógica de layout testável no padrão atual do repo (lib pura, zero dependências), e só a rasterização fica no contêiner. O canvas imperativo exigiria testar o layout dentro do sidecar.
- **NÃO VERIFICADO:** versões exatas e binários prebuilt para a arquitetura do host. Fixar com lockfile na Fase 2.

## Suposições
- O estado de produção é inferido pelos padrões do código; a `bfx_config` não foi lida (Q-01).
- Nenhum achado foi refutado (lista vazia recebida). As ressalvas foram tratadas como ajuste de nota/evidência, não como remoção.
- As evidências externas (brmarket-mcp, ReefAPI) não foram reverificadas por mim; uso o que A2 e A6 registraram, mantendo os NÃO VERIFICADO.
- O backlog não promete datas nem estimativa em horas: o esforço é relativo (1-5).
