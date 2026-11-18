# A1 · Auditor Técnico — log de decisões e suposições (fase 0-1)

Data: 18/11/2026 · commit `f6ab859`. Somente leitura; arquivos criados: `docs/audit.md` e este.

## O que foi executado (e por que era seguro)
- `npm test` → 88/88 passando. Antes conferi que `lib/` não importa `http/https/net/child_process` nem usa `fetch`, e os testes só usam `node:fs`, `node:vm`, `node:crypto` → nenhum acesso de rede.
- `docker ps` (somente leitura) → containers de produção `oferto-*` em execução. Nada foi parado/alterado.
- Varredura do histórico git por padrões de segredo (token de bot Telegram, `sk-`, `ghp_`, `AKIA`, PEM, `authtoken`, atribuições `token/secret/senha = '...'`). Só fixtures de teste.
- 2 buscas web pontuais (brmarket-mcp, ReefAPI). Nenhuma chamada à API do Telegram; nenhum `npm run build` (ele reescreve arquivos versionados).

## Decisões

### D-01 — Geração de imagem 1080x1080: sidecar Node, não Pillow, não Code node
- **Contexto:** toda a lógica roda em Code nodes do n8n com sandbox sem `Buffer`/`require`/`crypto` (`docs/SALVAMENTO-PROJETO.md:45`); o projeto não tem Python em produção (só `teste-local/cenarios.py`).
- **Decisão (proposta):** novo serviço `render` no `servidor-local/docker-compose.yml`, em Node ≥20, imagem própria (único `Dockerfile` do projeto), endpoint interno `POST /render` (só na rede do compose, sem porta publicada). O n8n chama via HTTP Request (resposta binária) e envia `sendPhoto` multipart.
- **Biblioteca:** preferência por `@napi-rs/canvas` (binários pré-compilados, sem libs de sistema, desenho 2D direto) ou `satori` + `@resvg/resvg-js` (templates JSX/SVG declarativos). Ambos MIT e custo zero. Fontes (ex.: Inter/Roboto, OFL/Apache) **embutidas no repo** para render determinístico. Versões exatas e compatibilidade com Alpine/musl **NÃO VERIFICADAS** — validar na fase de implementação.
- **Por que não Pillow:** introduziria um segundo runtime (Python) só para isso; manter uma linguagem facilita testes (`node --test`) e o build. Pillow continua alternativa válida se a equipe preferir.
- **Por que não serviço externo (wsrv, Cloudinary, etc.):** custo/limites e dependência de terceiros; o projeto já sofreu com wsrv.nl 404 (`docs/SALVAMENTO-PROJETO.md:80`).

### D-02 — Fonte de histórico de preço: não adotar brmarket-mcp sem decisão do dono
- Busca web indica que o brmarket-mcp cobra **por chamada via x402 em USDC (~US$ 0,01)** e exige carteira cripto → conflita com "custo zero absoluto". Não confirmei que ele forneça histórico de 30 dias (parece ser busca/comparação de preço atual). ReefAPI: créditos grátis e endpoint de histórico NÃO VERIFICADOS.
- Proposta: usar o histórico próprio já gravado em `bfx_precos` (`lib/selo.js:71-78` grava snapshot quando o preço muda ou a cada 20 h) para a mediana de 30d; enquanto houver < 30 dias de cobertura, integridade = "provisória/insuficiente" → fila humana. Keepa (pago, já integrado) fica opcional.

### D-03 — Não desligar a autopublicação em produção
- Produção publica sozinha (radar `*/2 * * * *`, `radar.publicar_direto` padrão `sim`). Pelas regras desta fase eu não altero nada; registro como risco R-01 e pergunta ao dono. Existe caminho reversível já pronto: `/modo aprovar` (descrito em `lib/config.js:107`).

### D-04 — Priorização dos achados
- Bucket 1 = /setup + imagem; 2 = anti-falso-desconto; 3 = textos; 4 = Docker/Git/CI/segurança de repo. Achados de segurança de baixo esforço (`.gitignore`) ficam no bucket 4 por regra, mas marcados impacto alto.

## Suposições
- S-01: o `docker ps` reflete a produção real (o compose `name: oferto` e o `SALVAMENTO` chamam isso de "produção"). Não verifiquei os canais/grupo de destino.
- S-02: a visibilidade do repositório GitHub (público/privado) é desconhecida; não consultei a rede para não expor dados do projeto.
- S-03: o prompt-mestre diz "200 caracteres" contando a legenda inteira; assumo que avisos legais (#publi, afiliado, Associado Amazon) também contariam — o que torna o limite apertado (ver pergunta).
- S-04: "whitelist ML, Amazon, Magalu, Shopee" substitui (não soma) a lista atual de 28 lojas do radar para autopublicação; as demais iriam para fila humana.

## Perguntas levantadas (para o sintetizador)
1. Pausar a autopublicação em produção (ex.: `/modo aprovar`) enquanto a fase "zero publicação real" vale?
2. brmarket-mcp é pago por chamada em USDC: aceita custo/carteira cripto, ou fica proibido e usamos histórico próprio (+ Keepa opcional)?
3. Os avisos obrigatórios (#publi, "Contém link de afiliado", frase do Associado Amazon) entram nos 200 caracteres, vão para a imagem, ou viram exceção ao limite?
4. Existe domínio próprio para o link curto (oferto.ai ou outro)? Onde hospedar o redirecionador a custo zero?
5. O repositório no GitHub é público ou privado (afeta CI gratuito e risco de vazamento)?
6. Lojas fora da whitelist hoje autopublicadas (Shein, TikTok, farmácias, moda) passam todas para fila humana? Magalu precisa ser adicionada ao radar?
7. Sem imagem gerada → não publica (bloqueio) ou fallback? O prompt diz "obrigatória"; o código atual cai para texto.
