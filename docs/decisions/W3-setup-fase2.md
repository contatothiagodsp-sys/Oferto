# W3-setup: decisões da Fase 2 (P1-09)

## Escopo

`lib/setup-canal.js` (puro), `tests/w3-setup.test.js`, `docs/channel-setup.md`, `docs/channels-plan.md`.

## Decisões

1. **Rodadas**: `getMe` → `getChat` + `getChatMember(bot_id)` → plano → `pinChatMessage` → resumo. O ID do bot vem do `getMe`, não do prefixo do token (a lib não lê segredos).
2. **Fixar em canal exige `can_edit_messages`**; em supergrupo, `can_pin_messages`. Fonte: doc oficial do `pinChatMessage` (https://core.telegram.org/bots/api#pinchatmessage). A doc foi citada a partir do conhecimento prévio, **sem acesso à rede nesta sessão** (regra da fase). Antes do uso real, confirmar na página oficial.
3. **Direitos obrigatórios**: canal = `can_change_info`, `can_post_messages`, `can_edit_messages`; supergrupo = `can_change_info`, `can_pin_messages`. `can_invite_users` é só aviso (vale para canal sem `@`). Direito ausente no objeto = falso (mais estrito que o onboarding atual, que usa `!== false`).
4. **Faltou direito: para.** Nenhuma chamada `set*`/`pin*` é planejada. O admin recebe o passo a passo de cada direito.
5. **Título** (Q-14b): só com título no comando ou com o canal ligado a uma categoria (`cfg.telegram.canais`). Igual ao atual = não chama. Nunca em chat privado.
6. **Descrição**: `canal_desc.<cat>` > descrição sugerida da categoria > genérica da marca, mais "Só desconto real. #publi · Contém links de afiliado.". Corte em 255 contado em UTF-16 (conservador), sem partir par substituto, preferindo o último espaço, com "…".
7. **Foto**: só com `opts.foto.binario` (imagem do render). A chamada sai com `multipart: { campo:'photo', binario, mime, nome, origem:'render' }` e payload só com `chat_id`. Sem render, pula e o resumo avisa. O executor multipart é o P1-14.
8. **Mensagem fixada**: regras + link de avisos **só se `grupo_link` existir** (nada inventado) + frase completa de afiliado + `AVISO_AMAZON` de `lib/textos.js` (Q-06).
9. **Admin**: `cfg.admins.includes(from.id)`, a mesma checagem usada nos comandos de `lib/telegram.js`. Não é ligado ao vigia (Q-30).
10. **Dry-run**: a lib só planeja. Quem executa aplica o dry-run (P1-06).

## Suposições

- Os rótulos das permissões no app em PT-BR ("Alterar informações do canal", "Editar mensagens de outros" etc.) podem variar por versão; a doc avisa.
- O `/setup @canal` é recebido pelo bot de aprovação (`origem='admin'`); a resposta volta pelo mesmo bot.

## Correções (revisão)

1. **Disclosure reservado na descrição** (major, confirmado): antes, o texto inteiro `base + sufixo` era cortado em 255 e o "#publi · Contém links de afiliado." sumia quando `canal_desc.<cat>` era longo. Agora `descricaoCanal` corta só a base em `255 - SUFIXO_DESCRICAO.length` e acrescenta o sufixo inteiro. Há teste com várias larguras de `canal_desc.casa`.
2. **getChatMember com erro transitório** (minor, confirmado): antes o erro virava `{status:'left'}` e a mensagem mandava "adicionar administrador". Agora só erros de pertencimento/permissão (`RE_ERRO_DIREITO`: bot is not a member, CHAT_ADMIN_REQUIRED, not enough rights etc.) geram o passo a passo. Rate limit, rede, token ou resposta ausente geram só o erro traduzido. Continua parando sem configurar nada.
3. **can_invite_users só em canal** (minor, confirmado): o aviso de convite agora exige `tipo === 'channel'`. Supergrupo não recebe mais o texto "Canal sem @ público".
4. **Alvo do comando** (minor, confirmado): `@username` agora exige de 5 a 32 caracteres (`{4,31}` depois da letra inicial). `lerComandoSetupCanal` passou a devolver `{ canal: null, titulo: '', invalido: true }` para `/setup <argumento>` com alvo inválido. O `null` fica reservado para `/setup` sem argumento (setup geral). Nesse caso inválido, `iniciarSetupCanal` responde "Uso: /setup @canal". Roteamento: qualquer retorno diferente de null vai para a rota `setup_canal`.
