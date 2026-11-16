# Incidentes: o que fazer

## Post com preço ou selo errado

1. **Telegram:**
   - responda ao post com a correção (resposta R2 ou R3 em [03-moderacao.md](03-moderacao.md));
   - se o erro for grave (preço muito diferente), apague o post depois de corrigir.
2. **Canal do WhatsApp:**
   - edite a mensagem, se ainda der (**VERIFICAR** o prazo de edição no app);
   - se não der, publique a correção logo abaixo.
3. **X:** responda ao próprio post com a correção. Não apague sem corrigir antes.
4. Anote o caso em [07-acompanhamento.md](07-acompanhamento.md).
   - Dois erros na mesma loja ou fonte de `ref90` → pare de usar essa fonte.

## Link quebrado ou loja sem estoque

- Responda ao post com `⛔ Esgotou (atualizado às [hora]).`
- Não troque o link por outra loja sem passar pelo `/oferta`, para não perder o sub-ID.

## O bot não responde

1. No n8n Cloud, abra **Executions** do **01 · Telegram**.
   - **Nenhuma execução nova:** o workflow pode estar despublicado ou o webhook caiu. Confira se o 01 está **Published** e rode o **00 · Setup** de novo; ele reaplica os webhooks.
   - **Execução com erro:** abra-a, veja o nó vermelho e me mande o print do erro.
2. **Limite de execuções do plano estourou:** troque `rastrear_entradas` para `nao` na `bfx_config` e rode o 00. Se ainda faltar execução, faça upgrade do plano durante a BF.
3. **Enquanto não volta:**
   - poste manualmente no Telegram, com o link de afiliado da plataforma `tg` gerado na mão;
   - use a tag `amazon.tag.<cat>_tg` e o sub-ID `bf26_<cat>_tg_auto` na Shopee.

## A Shopee não gera link

- O card avisa "⚠️ Falhas na Bot API" ou "sem link".
- Causas prováveis:
  - credencial errada ou expirada (`shopee.app_id` e `shopee.secret`);
  - campos da API diferentes do implementado.
- Me mande a mensagem de erro do n8n.
- Enquanto isso, gere os links no painel de afiliados com os sub-IDs à mão e informe com `tg …`, `wac …` etc. no `/oferta`, como no ML.

## O número do WhatsApp foi banido ou perdido

1. **Os grupos e canais não somem:** o 2º admin (reserva) continua administrando. É por isso que ele precisa estar em **todos** os espaços desde o início.
2. Peça revisão pelo próprio app ("Solicitar análise").
3. Avise no Telegram e no X: `Nosso número de WhatsApp está temporariamente fora. As ofertas continuam no Telegram: [link].`
4. Prevenção:
   - não use automação não oficial;
   - não adicione pessoas aos grupos sem pedido;
   - não mande a mesma mensagem para muitos contatos no privado.

## Golpe usando o nome da Ofertô

1. Fixe de novo e publique a **mensagem antigolpe** em todos os espaços.
2. Peça a quem recebeu o golpe que **denuncie o número** no WhatsApp. Não peça que mande o print com os dados dela.
3. Se houver perfil falso no X ou no Instagram, denuncie como "falsidade ideológica / se passando por marca".
4. Se a pessoa perdeu dinheiro, oriente-a a registrar boletim de ocorrência e a falar com o banco (MED do Pix). Nós não reembolsamos e não intermediamos.

## Anúncio reprovado na Meta

- **Motivo comum:** página-ponte ou promessa exagerada. Confira [04-conformidade.md](04-conformidade.md#meta-ads).
- Corrija e peça revisão. Se a demora passar de 12 h na esquenta, duplique o anúncio com o criativo ajustado.

## Reclamação formal (loja, Procon, notificação)

- **Não discuta em público.** Responda em privado, peça os detalhes por escrito e guarde tudo.
- Se o conteúdo contestado for "desconto falso", **retire do ar** enquanto confere a documentação (prints e fonte).
- Procure orientação jurídica antes de responder a uma notificação formal.
