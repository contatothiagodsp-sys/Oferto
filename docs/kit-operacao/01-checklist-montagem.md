# Checklist de montagem (16–19/11)

Marque `[x]` conforme avança.

**Meta:** estrutura pronta até **19/11** e anúncios de 20 a 25/11. A BF é sexta, 27/11.

## 16/11 (domingo): o que depende de terceiros

- [ ] **Shopee:** pedir acesso à Affiliate Open API (a aprovação leva dias).
- [ ] **Nome Ofertô:**
  - checar se já existe registro no INPI, na classe 35 (publicidade e varejo); a busca é gratuita em busca.inpi.gov.br;
  - checar domínio (`oferto.com.br`, registro.br) e @ livre no Telegram, X e Instagram;
  - se algum estiver ocupado, decidir uma variação **antes** de criar as tags da Amazon.
- [ ] **Chip dedicado** para o WhatsApp Business da marca, que nunca pode ser o número pessoal.
- [ ] **2º admin de reserva:** escolher a pessoa de confiança que terá acesso de admin a tudo (WhatsApp, Telegram, n8n).
- [ ] **n8n Cloud:**
  - criar a conta, conferir o limite de execuções e a disponibilidade de Data Tables;
  - ajustar o fuso para America/Sao_Paulo.

## 17/11 (segunda): Telegram e bot

- [ ] Montar o bot e o fluxo n8n: passos 1 a 7 do [README principal](../../README.md).
- [ ] Supergrupo **Ofertô** com Tópicos. Usar os textos de [02-textos-fixados.md](02-textos-fixados.md#telegram).
- [ ] Fechar os tópicos de oferta, para só o bot e os admins postarem; o 💬 Conversa fica aberto.
- [ ] Fixar a mensagem de regras em cada tópico.
- [ ] Adicionar o 2º admin.
- [ ] Testar um post de verdade com o bot (`/oferta` + Aprovar).

## 18/11 (terça): WhatsApp e afiliados

- [ ] Instalar o **WhatsApp Business** no chip dedicado e preencher o perfil (texto em [02](02-textos-fixados.md#perfil-do-whatsapp-business)).
- [ ] Criar a **Comunidade Ofertô** e os 4 grupos de avisos por categoria (Casa, Beleza, Bebê, Tech).
  - **VERIFICAR** no app atual se os números dos membros ficam ocultos e qual é o limite de membros.
  - Se precisar de grupos comuns, ativar "Somente admins enviam mensagens" e "Somente admins editam dados".
- [ ] Criar os **5 canais**: Top do Dia + 4 categorias.
- [ ] Adicionar o 2º admin em todos os 9 espaços do WhatsApp.
- [ ] **Amazon:**
  - criar as 16 tags (4 categorias × tg, wac, wag, x) e preenchê-las na `bfx_config`;
  - **declarar** o site, os canais, os grupos e o perfil do X em "Sites e apps móveis" do Associates.
- [ ] **Shopee e Mercado Livre:** declarar os canais nos programas.
- [ ] **Termos dos programas:** ler os pontos marcados em [04-conformidade.md](04-conformidade.md#termos-dos-programas-de-afiliados).
- [ ] **Mercado Livre:** gerar os links dos **20 produtos mais esperados** da BF (4 por plataforma cada) e guardar numa nota.
  - Na BF, é só colar no `/oferta`. O plano pede isso **antes de 26/11**.

## 19/11 (quarta): X, landings e criativos

- [ ] **Perfil no X** `@oferto`:
  - bio, post fixado e cabeçalho conforme [02](02-textos-fixados.md#x);
  - declarar o perfil nos programas de afiliados.
- [ ] **4 landings**, uma por categoria, com as 10 melhores ofertas reais e os botões rastreados (UTM por anúncio).
- [ ] **Links de convite nomeados** do Telegram, um por anúncio: `/convite casa meta_casa_c1` etc.
  - Padrão de nomes em [07](07-acompanhamento.md#nomes-de-campanha).
- [ ] **Criativos:** gravar 2 por categoria, em vídeo vertical de 9 a 15 s, sem logo das lojas.
- [ ] **Meta Ads:**
  - subir as campanhas de aquecimento, R$ 150 de 17 a 19/11, em conversão no clique do botão;
  - instalar o Pixel nas landings.
- [ ] **Teste final:**
  - entrar com outra conta por um link de cada plataforma;
  - conferir que a mensagem de boas-vindas e o aviso de afiliado aparecem.

## Pronto quando

- [ ] Um post aprovado aparece no Telegram, no canal do WhatsApp e no X, com **4 links diferentes**.
- [ ] Todos os espaços têm a mensagem fixada antigolpe e o aviso de afiliado.
- [ ] Há 2 admins em todos os espaços.
- [ ] As landings abrem no celular em menos de 3 s, e os botões registram cliques no Pixel.
- [ ] Os canais estão declarados nos 3 programas de afiliados.
