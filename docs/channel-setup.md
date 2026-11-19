# /setup de canal (P1-09)

Configura um canal (ou supergrupo) do Telegram sob demanda: título, descrição, foto e a mensagem de regras fixada. O código fica em `lib/setup-canal.js` (função pura: só monta as requisições, quem executa é o fluxo n8n).

## Uso

No privado com o bot de aprovação:

```
/setup @meucanal
/setup @meucanal Ofertô Casa & Eletro
/setup -1001234567890 Ofertô Games
```

- O primeiro argumento é o `@` do canal ou o ID `-100…`.
- O resto da linha (opcional) é o novo título (até 128 caracteres; acima disso é cortado com "…").
- `/setup` sem argumento continua sendo o setup geral (webhook, grupo, tópicos).
- `/setup <algo>` com alvo inválido (link `https://t.me/...`, `@` com menos de 5 caracteres, texto solto) **não** cai no setup geral: responde "Uso: /setup @canal".

Só quem está na linha `admins` da `bfx_config` pode usar. Outra pessoa recebe "Só admins do bot podem usar /setup." e nenhuma chamada é feita ao canal.

O `/setup` de canal **não** é acionado pelo vigia nem por nenhum agendamento (Q-14b, Q-30): só roda quando um admin manda o comando.

## Pré-requisitos

1. **Bot publicador criado no @BotFather** (`/newbot`), com o token na linha `bot_token_grupo` da `bfx_config`. Se essa linha estiver vazia, o bot de aprovação faz o papel de publicador.
2. **Canal criado pelo dono** no app do Telegram. O bot não cria canais (a Bot API não permite).
3. **Bot publicador adicionado como administrador do canal**: abra o canal > toque no nome > Editar (lápis) > Administradores > Adicionar administrador > procure o bot.
4. (Opcional) Para o título vir da categoria, ligue o canal à categoria com `/canais` ou com a linha `canal.<categoria>` da `bfx_config`.
5. (Opcional) Para a mensagem fixada ter o link de avisos e conversa, preencha `grupo_link`. Sem ele, a mensagem sai sem link (o bot não inventa um).

## Permissões que o bot precisa

Os nomes no app podem variar um pouco conforme a versão do Telegram.

### Canal

| Direito (Bot API) | Nome no app | Para quê | Obrigatório |
|---|---|---|---|
| `can_change_info` | Alterar informações do canal | Título, descrição e foto | Sim |
| `can_post_messages` | Publicar mensagens | Mensagem de regras e as ofertas | Sim |
| `can_edit_messages` | Editar mensagens de outros | **Fixar** a mensagem em canal e editar posts encerrados | Sim |
| `can_invite_users` | Convidar usuários via link | Link de convite de canal sem `@` público (não se aplica a supergrupo) | Não (só aviso) |

Em canal, fixar depende de `can_edit_messages`. O direito `can_pin_messages` existe só em grupos e supergrupos. A doc oficial do `pinChatMessage` (https://core.telegram.org/bots/api#pinchatmessage) diz que o bot precisa de "can_pin_messages" em supergrupo ou "can_edit_messages" em canal.

### Supergrupo

| Direito | Nome no app | Para quê | Obrigatório |
|---|---|---|---|
| `can_change_info` | Alterar informações do grupo | Título, descrição e foto | Sim |
| `can_pin_messages` | Fixar mensagens | Fixar a mensagem de regras | Sim |

## O que o bot faz

O fluxo roda em rodadas (cada rodada é uma ida à Bot API):

1. `getMe`: descobre o ID do bot publicador.
2. `getChat` + `getChatMember(canal, id do bot)`: lê o tipo do chat e os direitos do bot.
3. Avalia os direitos.
   - **Faltou algum obrigatório**: manda ao admin a lista do que falta, com o passo a passo de cada um, e **para**. Nada é alterado no canal.
   - **Bot fora do canal ou sem ser admin**: mesma coisa, com o passo a passo para adicioná-lo.
   - **Chat privado**: recusa. Título e foto não podem ser trocados em chat privado.
   - **Tudo certo**: segue para as chamadas abaixo.
4. Configuração:
   - `setChatTitle`: **só** se o admin passou o título no comando ou se o canal tem categoria configurada. Se o título já é igual, não chama.
   - `setChatDescription`: descrição da categoria (ou genérica da marca) + "Só desconto real. #publi · Contém links de afiliado.", com no máximo 255 caracteres. O aviso "#publi · Contém links de afiliado." é reservado e nunca é cortado: só a parte da descrição (por exemplo um `canal_desc.<cat>` longo) é encurtada, sem partir emoji e de preferência no último espaço.
   - `setChatPhoto`: só quando o render entregou a imagem do canal. Vai como multipart (campo `photo`, binário do item do n8n). Sem imagem, a foto é pulada e o resumo avisa.
   - `sendMessage`: a mensagem de regras (preço conferido, ritmo de 3 a 5 ofertas por dia, "nunca pedimos Pix", link de avisos quando configurado e a frase completa de afiliado e de Associado da Amazon).
5. `pinChatMessage`: fixa a mensagem de regras, sem notificar.
6. Resumo ao admin: cada passo como "ok", "já estava assim" ou a falha traduzida.

Mensagem fixada (exemplo, categoria Casa):

> 📌 **Regras do canal · Casa**
>
> • Só publicamos preço conferido no nosso histórico: sem "metade do dobro" nem desconto maquiado.
> • Preço e estoque mudam rápido. Confira o valor final na loja antes de pagar.
> • Ritmo: de 3 a 5 ofertas por dia, sem enxurrada.
> • 🔒 O Ofertô **nunca** chama no privado nem pede Pix. A compra é sempre no site ou app oficial da loja.
>
> 📣 Avisos e conversa: https://t.me/…
>
> *O Ofertô participa de programas de afiliados (Amazon, Shopee, Mercado Livre e outros) e pode ganhar comissão pelas compras feitas pelos links, sem custo extra para você. Como Associado da Amazon, ganhamos com compras qualificadas.*

## Mensagens de erro

| Mensagem ao admin | Causa provável | O que fazer |
|---|---|---|
| Só admins do bot podem usar /setup. | Seu ID não está em `admins` | Mande `/id` ao bot de aprovação e preencha `admins` |
| Uso: /setup @canal [título opcional] | Comando sem `@canal` válido | Use `@` com 5 a 32 caracteres ou o ID `-100…` |
| canal não encontrado | `@` errado ou bot fora do canal | Confira o `@` e adicione o bot publicador |
| o bot publicador não está no canal | Bot removido ou nunca adicionado | Adicione como administrador |
| o bot publicador … não é administrador deste chat | Bot é membro comum | Promova a administrador (passo a passo vem na mensagem) |
| Faltam permissões para o bot publicador | Algum direito obrigatório desligado | Siga o passo a passo de cada direito e rode o `/setup` de novo |
| isso é um chat privado | O alvo é uma pessoa ou bot | Use o `@` de um canal ou supergrupo |
| token do bot publicador inválido | `bot_token_grupo` errado | Gere o token de novo no @BotFather |
| falta permissão de admin para o bot publicador | Direito retirado durante o setup | Confira as permissões e rode de novo |
| o Telegram recusou a imagem do canal | Imagem do render inválida ou pequena | Gere a imagem de novo; o resto do setup segue valendo |
| o Telegram pediu para ir mais devagar | Limite de frequência (429) | Espere 1 minuto. Se vier na checagem de direitos, a mensagem traz só o erro, sem passo a passo de admin (o bot pode já ser admin) |
| já estava assim | Título ou descrição iguais ao atual | Nada (não é erro) |

## Segurança

- Só admins disparam. O bot publicador nunca configura um canal por conta própria a partir deste comando.
- Faltou permissão: o bot **não tenta** configurar o que dá. Ele para e explica.
- As chamadas ao canal passam pelo mesmo executor do fluxo, inclusive pelo dry-run de publicação quando ele estiver ligado (P1-06).
