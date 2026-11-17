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
| `bot_grupo_username` |  | Gerado pelo setup: @ do bot publicador (usado nos links de divulgação do /links). Não precisa mexer |
| `hash_sal` |  | Gerado pelo setup: sal do hash de quem entra/sai do grupo. Não mude (os hashes antigos deixam de bater) |
| `grupo.textos` | `pendente` | pendente = o setup arruma o grupo uma vez (descrição, 💬 Conversa, textos fixados, tópicos fechados) · atualizar = reescreve os textos já fixados, sem mandar mensagem nova · limpar = apaga TODAS as mensagens do grupo (inclusive de membros) e arruma de novo; leva ~4 min · ok = não mexe |
| `grupo.mensagens` |  | Gerado pelo setup: IDs das mensagens fixadas (usado pelo modo atualizar). Não precisa mexer |
| `grupo.limpar_avisos` | `sim` | sim/nao: o bot publicador apaga os avisos automáticos do grupo (entrou, saiu, fixou, fechou tópico, mudou nome/foto). Precisa da permissão Apagar mensagens. Com o bot admin, cada mensagem do grupo vira 1 execução do n8n |
| `grupo.antispam` | `sim` | sim/nao: com grupo.limpar_avisos ligado, o bot publicador apaga mensagens de membros com link de outro grupo, WhatsApp ou encurtador (links de loja viram sugestão para os admins) |
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
| `link_curto_api` |  | Deixe vazio (usado só em testes para abrir links curtos a.co/amzn.to) |
| `amazon.tag_padrao` |  | Tag usada quando não há tag específica (perde a atribuição por plataforma) |
| `tunel.dominio` |  | Servidor local: domínio próprio aceito pelo workflow 90 · Túnel além de trycloudflare.com e ngrok (ex.: bot.seudominio.com.br). Vazio = só esses |
| `saude.ultimo_alerta` |  | Servidor local: gerado pelo workflow 91 · Saúde (anti-spam dos alertas). Não precisa mexer |
| `amazon.mostrar_preco` | `sim` | sim/nao: os posts da Amazon mostram o preço e o %. Com nao, dizem só "no menor preço dos últimos 90 dias" e "Veja o preço atual na Amazon" (use se os termos exigirem preço vindo da API oficial) |
| `keepa.chave` |  | Chave da API da Keepa (plano pago). Com ela, o /oferta da Amazon aceita só o link: título, preço e ref90 vêm da Keepa. Vazio = desligado |
| `keepa.api` | `https://api.keepa.com` | Endereço da API da Keepa (não altere; usado em testes) |
| `keepa.buybox` | `nao` | sim/nao: usar o preço da Buy Box (com frete) em vez do preço da Amazon/novo. Pode custar tokens extras (VERIFICAR) |
| `topico.top` |  | message_thread_id do tópico Top do Dia (preenchido pelo setup) |
| `canal.top` |  | Opcional: canal só de Top do Dia (@usuario do canal ou ID -100…). O bot publicador, admin do canal, posta lá também. Vazio = sem canal |
| `canal_link.top` |  | Opcional: link de entrada do canal Top do Dia (para canal privado; com @usuario o link é automático) |
| `topico.casa` |  | message_thread_id do tópico Casa & Eletro (preenchido pelo setup) |
| `canal.casa` |  | Opcional: canal só de Casa & Eletro (@usuario do canal ou ID -100…). O bot publicador, admin do canal, posta lá também. Vazio = sem canal |
| `canal_link.casa` |  | Opcional: link de entrada do canal Casa & Eletro (para canal privado; com @usuario o link é automático) |
| `topico.beleza` |  | message_thread_id do tópico Beleza & Presentes (preenchido pelo setup) |
| `canal.beleza` |  | Opcional: canal só de Beleza & Presentes (@usuario do canal ou ID -100…). O bot publicador, admin do canal, posta lá também. Vazio = sem canal |
| `canal_link.beleza` |  | Opcional: link de entrada do canal Beleza & Presentes (para canal privado; com @usuario o link é automático) |
| `topico.bebe` |  | message_thread_id do tópico Bebê & Família (preenchido pelo setup) |
| `canal.bebe` |  | Opcional: canal só de Bebê & Família (@usuario do canal ou ID -100…). O bot publicador, admin do canal, posta lá também. Vazio = sem canal |
| `canal_link.bebe` |  | Opcional: link de entrada do canal Bebê & Família (para canal privado; com @usuario o link é automático) |
| `topico.tech` |  | message_thread_id do tópico Tech – BF Honesta (preenchido pelo setup) |
| `canal.tech` |  | Opcional: canal só de Tech – BF Honesta (@usuario do canal ou ID -100…). O bot publicador, admin do canal, posta lá também. Vazio = sem canal |
| `canal_link.tech` |  | Opcional: link de entrada do canal Tech – BF Honesta (para canal privado; com @usuario o link é automático) |
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
