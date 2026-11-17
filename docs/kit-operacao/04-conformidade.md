# Conformidade

> **Isto não é parecer jurídico.** São os pontos de atenção do plano (seção 9) transformados em checklist. Na dúvida, principalmente no conteúdo de "desconto falso", consulte um advogado.

## Checklist rápido (antes de cada publicação)

- [ ] A 1ª linha tem `#publi`, e o fim tem "Contém link de afiliado"? O bot já inclui; confira quando colar.
- [ ] Tem "Preço e disponibilidade de DD/MM às HH:MM, sujeitos a alteração. Frete: confira na loja."? O bot já inclui.
- [ ] O selo tem fonte: nosso histórico ou um comparador? Com 0%, o texto diz "igual ao menor preço", sem a palavra "desconto".
- [ ] Histórico com menos de 90 dias? O post diz "menor preço desde DD/MM" (o bot faz, se `min90_dias` vier preenchido).
- [ ] Com cupom: "preço com cupom da loja, sujeito a limite e validade".
- [ ] Post da Amazon: tem "Como Associado da Amazon, ganhamos com compras qualificadas."?
- [ ] O texto não promete o que a loja não promete ("o menor preço do Brasil", "último dia", "pode acabar a qualquer momento")?
- [ ] Nenhum dado de membro aparece (print com nome, número etc.)?

## CONAR: identificação de publicidade

- O CONAR (Guia de Publicidade por Influenciadores Digitais e as regras de 2026) pede que a relação comercial seja **identificada de forma clara e logo no início**. Link de afiliado é relação comercial.
- **Como cumprimos:**
  - `#publi` na **1ª linha** de todo post: Telegram (`🏠 Casa & Eletro · #publi`), WhatsApp canal e grupo (`⚡ ALERTA DE PREÇO · … · #publi`) e X (`#publi · título`);
  - "Contém link de afiliado" no fim de todo post e na resposta do X (que também leva `#publi`);
  - aviso na descrição de cada espaço e o aviso completo fixado (texto em [02](02-textos-fixados.md#aviso-completo-de-afiliado)).
- O aviso vai **no próprio post**, não só na bio. Quem recebe um encaminhamento não vê a bio.

## CDC: preço e oferta

- Pelo CDC (arts. 30, 31 e 37), a oferta publicada **vincula quem anuncia** e a publicidade não pode ser enganosa. Nós **não somos o fornecedor**, mas divulgamos a oferta. Por isso:
  - nunca arredonde preço nem invente "de/por";
  - o "de" que mostramos é o **menor preço em 90 dias**, nunca o preço riscado da loja;
  - **selo honesto:** com desconto de 1% ou mais, "X% abaixo do menor preço dos últimos 90 dias (R$ Y)"; com 0%, "igual ao menor preço dos últimos 90 dias", **sem** a palavra "desconto";
  - **cobertura:** se a referência cobre menos de 90 dias, o post diz "menor preço desde DD/MM";
  - **fonte:** o post público não cita a ferramenta de histórico (ex.: Keepa), porque os termos de uso dela não estão confirmados. O card de aprovação mostra a origem (Keepa, histórico próprio ou manual) só para o admin;
  - sempre informe a **data e a hora**, que o preço e a disponibilidade podem mudar e que o frete se confere na loja;
  - se o preço mudou, encerre o post ("⛔ Oferta encerrada às HH:MM · o preço mudou", título riscado e sem link) ou corrija com a resposta R2 em [03-moderacao.md](03-moderacao.md).
- **Cupom:** o post diz "preço com cupom da loja, sujeito a limite e validade". Se o preço depende também de frete grátis ou de pagamento no Pix, escreva isso no título. Exemplo: `Air Fryer Mondial 4L (no Pix)`.
- **Urgência:** nada de "corre", "últimas unidades" ou "pode acabar a qualquer momento". Não sabemos o estoque. O alerta do grupo do WhatsApp é `⚡ ALERTA DE PREÇO`, sem prometer escassez.

## Conteúdo "Desconto FALSO do dia" (X)

É o conteúdo de maior alcance e também o de **maior risco**: ele aponta um problema numa loja identificável.

- **Mostre fatos com fonte:** "Anunciado: de R$ 299 por R$ 199. Menor preço em 90 dias: R$ 189 (fonte: [comparador], [data])."
- **Critique o anúncio, não acuse a empresa.** Evite "golpe", "fraude", "enganação", "roubo". Prefira "o desconto não se sustenta no histórico".
- Guarde **print com data** do anúncio e do histórico para cada caso publicado. Uma pasta por dia basta.
- Se a loja contestar com dados, corrija ou apague e registre o caso.
- **Não use o logo da loja** na arte. O nome do produto e o da loja em texto bastam.
- **OPINIÃO:** comece pelo formato "ranking de descontos reais × anunciados" (comparação neutra) e só use "desconto falso" quando a diferença for grande e documentada.

## LGPD

- **Grupos:**
  - o que guardamos de quem entra ou sai do Telegram: um **código pseudonimizado** (`user_hash`, feito a partir do ID com um segredo), o **nome do link de convite** e a **data**. Serve para medir campanhas. Não guardamos nome, @ nem telefone;
  - código pseudonimizado ainda é dado pessoal na LGPD: por isso **não** escrevemos "não coletamos dados". A mensagem 🔒 Segurança e privacidade diz o que guardamos e como pedir a exclusão;
  - **pedido de exclusão:** o membro fala com um admin. O admin pede o `/id` da pessoa, calcula o código e apaga as linhas dela na tabela `bfx_entradas` (ou, se não der para calcular, apaga pelo dia e pelo link de convite que ela informar). Responda em até 15 dias;
  - não exporte listas de membros;
  - não adicione ninguém sem pedido.
- **Comunidade do WhatsApp:** use o formato com números ocultos para os membros (**VERIFICAR**), para reduzir a exposição a golpistas.
- **Sem site, sem Pixel:** não há cookies nem formulário, então não é preciso política de cookies. Se um dia houver lista de e-mail, só com consentimento explícito e link para descadastrar.
- **Prints de reclamação:** não poste print com dados de outra pessoa; corte antes.

## Termos dos programas de afiliados

**VERIFICAR** item por item nos termos atuais, antes de 20/11. São os pontos que mais derrubam contas.

### Amazon (Associados)

- [x] **Divulgação obrigatória:** "Como Associado da Amazon, ganhamos com compras qualificadas." Está em todo post da Amazon (Telegram, WhatsApp e resposta do X), na mensagem 🔒 Segurança e privacidade e no aviso completo de afiliado.
- [ ] **Exibição de preço:**
  - os termos têm regras sobre mostrar preço que não veio da API oficial (atualização e horário);
  - o post já traz "Preço e disponibilidade de DD/MM às HH:MM, sujeitos a alteração";
  - se a Amazon exigir preço vindo da API oficial, mude `amazon.mostrar_preco` para `nao`: os posts da Amazon passam a dizer só "no menor preço dos últimos 90 dias" e "👉 Veja o preço atual na Amazon", sem valor nem %. **Ponto mais importante desta lista.**
- [ ] **Cadastro sem site:** conferir se a Amazon aceita perfis (X, Instagram) e canais de mensagem (WhatsApp, Telegram) como "Sites e apps móveis". **Sem site, é o 2º ponto mais importante:** se não aceitar, declare o X e o Instagram e confirme com o suporte do Associates se os grupos podem receber os links.
- [ ] **Canais permitidos:** declarar todos os espaços onde os links aparecem.
- [ ] **Anúncios:**
  - proibido usar a marca Amazon em anúncios pagos e comprar palavras-chave com a marca;
  - os anúncios levam aos grupos e canais, **nunca** direto a um link de afiliado.
- [ ] **Tags:** a separação por categoria e plataforma é permitida (há limite de quantidade de tags: conferir se 16 cabem).
- [ ] **Encurtadores:** conferir se link encurtado de terceiros é permitido (o bot usa o link completo com `?tag=`, que é seguro).

### Shopee (Afiliados)

- [ ] Tráfego pago: os anúncios levam ao grupo, não ao link de afiliado. Conferir se isso é permitido.
- [ ] Uso do nome e do logo "Shopee" em anúncios e no nome dos espaços.
- [ ] Regras dos subIds: caracteres e tamanho (o bot usa só letras minúsculas e números).

### Mercado Livre (Afiliados)

- [ ] Canais aceitos (grupos de WhatsApp e Telegram) e se é preciso declará-los.
- [ ] Tráfego pago e uso da marca.
- [ ] Validade dos links gerados: se eles expiram, regere os do cache antes de 26/11.

## Meta Ads

- [ ] Sem logo nem nome das lojas na arte do anúncio (regra do plano).
- [ ] Destino do anúncio: link de convite do Telegram (`t.me/+…`), link de canal do WhatsApp (`whatsapp.com/channel/…`) ou da Comunidade. **VERIFICAR** se a Meta aceita esses destinos no objetivo Tráfego. Teste com R$ 10 no aquecimento.
- [ ] O anúncio diz o que a pessoa vai encontrar ("grupo de ofertas no WhatsApp/Telegram"), sem fingir que é uma loja.
- [ ] Sem promessa absoluta: "o menor preço garantido" não; "só desconto real, com critério público" sim.
- [ ] Categoria especial: não se aplica (não é crédito, emprego nem moradia), mas **VERIFICAR** se o gerenciador pedir.
