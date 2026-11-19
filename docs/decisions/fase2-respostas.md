# Fase 2: respostas adotadas para as perguntas abertas

O dono delegou as respostas ("responde com o que achar melhor e pode implementar"). Em todos os casos, a regra é: **na dúvida, não publica**. Cada resposta pode ser revertida por uma chave de configuração.

| Q | Resposta adotada |
|---|---|
| Q-01 | Os agentes não leem nem alteram a produção. O código passa a vir **seguro por padrão**: `publicacao.dry_run=sim` e todos os publicadores automáticos com padrão `nao`. Nada vai para produção sem build de release explícito (Q-02). Pausar a produção que já roda é **ação do dono** (ver README). |
| Q-01b | Não verificável pelos agentes. A doc deixa de falar em "n8n Cloud" como alvo ativo e registra a dúvida. |
| Q-02 | Sim. `npm run build` passa a escrever **só** em `n8n/workflows/` (ou num `--out` informado). `servidor-local/workflows/` é atualizado apenas por `npm run release`. O `preparar.sh` também exige `PUBLICAR_WORKFLOWS=sim` para importar. |
| Q-03 | O dry-run **não faz nenhuma chamada** ao Telegram nem ao WhatsApp. Grava log/tabela e devolve resposta simulada (`ok:true`, `message_id` sintético). |
| Q-04 | D-S1 aprovado: sidecar Node `render/` com `sharp` (versão fixa e lockfile), template SVG em função pura `lib/imagem.js` e fonte OFL embutida. Só na rede interna do compose. Pillow e o nó Edit Image ficam descartados. |
| Q-05 | Opção (a): **só histórico próprio** (`bfx_precos`). O brmarket-mcp não entra no runtime: as tools pagas exigem carteira cripto e isso fere o custo zero. Fica documentado como fonte futura opcional, só para a busca grátis. Aceito: nos primeiros ~30 dias quase tudo vai para revisão humana. |
| Q-06 | Na legenda ficam `#publi` + "link de afiliado" (curto). Nos posts Amazon entra a frase curta de Associado. Tudo dentro dos ≤200 caracteres; o nome do produto é cortado para caber. A frase completa vai para a mensagem fixada do canal. |
| Q-07 | NÃO VERIFICADO. O template aceita os dois modos. A chave `imagem.usar_foto_produto` vem com padrão `sim` (prática comum dos programas, que fornecem a imagem oficial na API ou na página). Com `nao`, o template usa ícone e cor da categoria. Antes de publicar de verdade, o dono confirma nos termos de cada programa. |
| Q-10 | Sem fallback para texto: se a imagem falhar, a oferta vai para revisão com status `rejeitada_sem_imagem`. |
| Q-11 | A imagem obrigatória vale para o Telegram. O WhatsApp automático fica atrás do dry-run e é desligado por padrão. |
| Q-12 | Cupom de loja: vai sempre para revisão humana e não é auto-publicado. |
| Q-13 | O preço vai na imagem (exigência do prompt). Enquanto não existe `editMessageMedia` com nova renderização, o Guardião **não edita preço** de post com imagem gerada: ele encerra o post (legenda "ENCERRADA") e registra o motivo. O re-render fica para a Fase 2b. |
| Q-14 | `tech` é dividido em Eletrônicos e Games por palavra-chave; `perfumes` vai para Beleza; `casa` fica em Casa e `moda` em Moda. `saude` e `bebe` são sensíveis, vão para revisão e usam o template neutro. |
| Q-14b | O `/setup` só troca o título quando o admin passa o título no comando ou quando o canal tem categoria configurada. Nunca é acionado pelo vigia. |
| Q-15 | Integridade **consistente**: ≥10 amostras cobrindo ≥20 dos 30 dias. **Provisória**: ≥5 amostras cobrindo ≥10 dias. Abaixo disso é insuficiente e vai para revisão. **Suspeita**: alta >25% nos 7 dias antes da queda (padrão "metade do dobro"). Tolerância de "próximo do menor patamar": preço ≤ mínimo de 30d × 1,03. |
| Q-16 | As lojas fora da whitelist (ML, Amazon, Magalu, Shopee) **não auto-publicam** e vão para revisão. A Magalu entra na whitelist, mas sem afiliado configurado vai para revisão (sem link de afiliado não publica). |
| Q-17 | São sensíveis: saúde, bebê/infantil e financeiro (cartão, empréstimo, seguro, investimento, conta digital, por palavra-chave). |
| Q-18 | Frete DESCONHECIDO: não auto-publica e vai para revisão. |
| Q-19 | O cashback **não** entra no `preco_final` automático (é condicional). Fica como 0, configurável. |
| Q-20 | Fontes de terceiros (canais e sites garimpados) nunca auto-publicam, só alimentam a revisão. O scraping com User-Agent falso não é base de bloqueio: o comparador vira fail-closed (sem referência, vai para revisão). |
| Q-21 | ReefAPI e Keepa ficam fora do runtime (desligadas). |
| Q-22 | Sim, já na Fase 2: `sem_ref` nunca auto-publica, e o `/radar` por comando aplica a trava. |
| Q-23 | A cota é por canal Telegram de categoria (`ritmo.max_dia=5`) e cobre todos os publicadores automáticos. |
| Q-24 | O digest é opcional (`ritmo.modo=digest`) e fica para a Fase 2b. |
| Q-08/Q-09 | Não há domínio próprio verificado. Por ora o link vai no botão inline e, no texto, o link curto oficial do programa quando existir. A rota `/l/<id>` fica para a Fase 2b (depende do domínio fixo). |
| Q-25 | Os 200 caracteres valem para o Telegram. X e WhatsApp ficam como estão (atrás do dry-run). |
| Q-26 | O repo continua como está. A doc é corrigida para dizer **público**, e todo commit é tratado como público. Tornar o repo privado é decisão do dono. |
| Q-27 | O ID nos testes é trocado por um placeholder. |
| Q-28 | Branch `feat/audit-e-otimizacao`, sem push direto em `main`. |
| Q-29 | Sim: os padrões passam a ser `publicar_direto=nao`, e o `/modo piloto` deixa de gravar `exigir_ref90=nao`. |
| Q-30 | Documentado. O `/setup` de canal não é ligado ao vigia. |
| Q-31 | O e2e passa a usar a porta 5690 e aborta se a 5678 responder com o mesmo contêiner. |
| Q-32 | Resolução mínima da foto de origem: 600 px no lado menor. Abaixo disso, a oferta vai para revisão. |
| Q-33 | Documentado como recomendação (age/openssl). Não implementado nesta fase. |
