# Chaves da tabela `bfx_config`

Gerado por `node build/build-workflows.js`. Edite os valores no n8n: **Overview → Data tables → bfx_config**.
Linha vazia = usa o padrão (exceto `shopee.busca.*`: vazio = não coletar aquela categoria).

| Chave | Padrão | Para que serve |
|---|---|---|
| `marca` | `Ofertô` | Nome da marca (aparece nos textos e no relatório) |
| `admins` |  | IDs do Telegram de quem aprova (separados por vírgula). Descubra mandando /id ao bot de aprovação |
| `bot_token` |  | Token do BOT DE APROVAÇÃO (@BotFather). Conversa privada com os admins |
| `bot_token_grupo` |  | Token do BOT PUBLICADOR (admin do supergrupo). Vazio = usa o bot de aprovação |
| `grupo_id` |  | ID do supergrupo (-100…). O bot publicador avisa os admins ao ser adicionado |
| `grupo_link` |  | Link público do grupo (opcional, usado em respostas) |
| `n8n_webhook_url` |  | Production URL do nó Webhook do workflow 01 (copie do n8n) |
| `webhook_secret` |  | Gerado pelo setup. Não precisa mexer |
| `grupo.textos` | `pendente` | pendente = o setup escreve a descrição do grupo, renomeia o General para 💬 Conversa, fixa regras e textos e fecha os tópicos de oferta (vira ok depois). Para refazer, volte para pendente |
| `grupo.limpar_avisos` | `sim` | sim/nao: o bot publicador apaga os avisos automáticos do grupo (entrou, saiu, fixou, fechou tópico, mudou nome/foto). Precisa da permissão Apagar mensagens. Com o bot admin, cada mensagem do grupo vira 1 execução do n8n |
| `rastrear_entradas` | `sim` | sim/nao: grava entradas e saídas por link de convite (1 execução do n8n por evento) |
| `campanha_prefixo` | `bf26` | Prefixo dos sub-IDs |
| `fuso` | `America/Sao_Paulo` | Fuso horário dos textos |
| `selo.tolerancia_pct` | `0` | Tolerância do selo em % acima do menor preço de 90 dias (recomendado: 0) |
| `shopee.app_id` |  | App ID da Shopee Affiliate Open API |
| `shopee.secret` |  | Secret da Shopee Affiliate Open API |
| `shopee.endpoint` | `https://open-api.affiliate.shopee.com.br/graphql` | Endpoint GraphQL (VERIFICAR no painel) |
| `shopee.min_desconto_pct` | `20` | Desconto mínimo anunciado pela loja para virar candidata |
| `shopee.min_comissao_pct` | `3` | Comissão mínima (%) |
| `shopee.min_vendas` | `50` | Vendas mínimas do produto |
| `shopee.max_cards` | `8` | Máximo de cards de aprovação por coleta |
| `shopee.enviar_sem_ref` | `sim` | sim/nao: enviar candidatas sem referência de 90 dias (para você informar o ref90) |
| `telegram_api` | `https://api.telegram.org` | Endereço da Bot API (não altere; usado em testes) |
| `amazon.tag_padrao` |  | Tag usada quando não há tag específica (perde a atribuição por plataforma) |
| `topico.top` |  | message_thread_id do tópico Top do Dia (preenchido pelo setup) |
| `topico.casa` |  | message_thread_id do tópico Casa & Eletro (preenchido pelo setup) |
| `topico.beleza` |  | message_thread_id do tópico Beleza & Presentes (preenchido pelo setup) |
| `topico.bebe` |  | message_thread_id do tópico Bebê & Família (preenchido pelo setup) |
| `topico.tech` |  | message_thread_id do tópico Tech – BF Honesta (preenchido pelo setup) |
| `shopee.busca.casa` | `air fryer; ventilador; aspirador robô; cafeteira; liquidificador` | Palavras-chave da coleta Shopee para Casa & Eletro (separe com ;) |
| `shopee.busca.beleza` | `kit perfume; secador de cabelo; prancha alisadora; kit maquiagem; hidratante corporal` | Palavras-chave da coleta Shopee para Beleza & Presentes (separe com ;) |
| `shopee.busca.bebe` | `fralda; lenço umedecido; brinquedo educativo; mamadeira` | Palavras-chave da coleta Shopee para Bebê & Família (separe com ;) |
| `shopee.busca.tech` | `fone bluetooth; smartwatch; carregador turbo; ssd; mouse sem fio` | Palavras-chave da coleta Shopee para Tech – BF Honesta (separe com ;) |
| `amazon.tag.casa_tg` |  | Tag da Amazon para Casa & Eletro no tg |
| `amazon.tag.casa_wac` |  | Tag da Amazon para Casa & Eletro no wac |
| `amazon.tag.casa_wag` |  | Tag da Amazon para Casa & Eletro no wag |
| `amazon.tag.casa_x` |  | Tag da Amazon para Casa & Eletro no x |
| `amazon.tag.beleza_tg` |  | Tag da Amazon para Beleza & Presentes no tg |
| `amazon.tag.beleza_wac` |  | Tag da Amazon para Beleza & Presentes no wac |
| `amazon.tag.beleza_wag` |  | Tag da Amazon para Beleza & Presentes no wag |
| `amazon.tag.beleza_x` |  | Tag da Amazon para Beleza & Presentes no x |
| `amazon.tag.bebe_tg` |  | Tag da Amazon para Bebê & Família no tg |
| `amazon.tag.bebe_wac` |  | Tag da Amazon para Bebê & Família no wac |
| `amazon.tag.bebe_wag` |  | Tag da Amazon para Bebê & Família no wag |
| `amazon.tag.bebe_x` |  | Tag da Amazon para Bebê & Família no x |
| `amazon.tag.tech_tg` |  | Tag da Amazon para Tech – BF Honesta no tg |
| `amazon.tag.tech_wac` |  | Tag da Amazon para Tech – BF Honesta no wac |
| `amazon.tag.tech_wag` |  | Tag da Amazon para Tech – BF Honesta no wag |
| `amazon.tag.tech_x` |  | Tag da Amazon para Tech – BF Honesta no x |
