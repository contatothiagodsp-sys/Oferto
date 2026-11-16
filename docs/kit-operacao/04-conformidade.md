# Conformidade

> **Isto não é parecer jurídico.** São os pontos de atenção do plano (seção 9) transformados em checklist. Na dúvida, principalmente no conteúdo de "desconto falso", consulte um advogado.

## Checklist rápido (antes de cada publicação)

- [ ] Tem "Contém link de afiliado" ou `#publi`? O bot já inclui; confira quando colar.
- [ ] Tem a data e a hora do preço? O bot já inclui.
- [ ] O selo ✓ tem fonte: nosso histórico ou um comparador citado?
- [ ] O texto não promete o que a loja não promete ("o menor preço do Brasil", "último dia")?
- [ ] Nenhum dado de membro aparece (print com nome, número etc.)?

## CONAR: identificação de publicidade

- O **Guia de Publicidade por Influenciadores Digitais** do CONAR (2021) pede que a relação comercial seja **identificada de forma clara**. Link de afiliado é relação comercial.
- **Como cumprimos:**
  - "Contém link de afiliado" em todo post: Telegram, WhatsApp e na resposta do X;
  - `#publi` nos posts do X;
  - aviso na descrição de cada espaço e o aviso completo fixado (texto em [02](02-textos-fixados.md#aviso-completo-de-afiliado)).
- O aviso vai **no próprio post**, não só na bio. Quem recebe um encaminhamento não vê a bio.

## CDC: preço e oferta

- Pelo CDC (arts. 30, 31 e 37), a oferta publicada **vincula quem anuncia** e a publicidade não pode ser enganosa. Nós **não somos o fornecedor**, mas divulgamos a oferta. Por isso:
  - nunca arredonde preço nem invente "de/por";
  - o "de" que mostramos é o **menor preço em 90 dias**, nunca o preço riscado da loja;
  - sempre informe a **data e a hora** e que o preço pode mudar;
  - se o preço mudou, corrija no próprio post (resposta R2 em [03-moderacao.md](03-moderacao.md)).
- **Frete e cupom:** se o preço depende de cupom, de frete grátis ou de pagamento à vista no Pix, escreva isso no título. Exemplo: `Air Fryer Mondial 4L (com cupom BF10, no Pix)`.

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
  - não guardamos nome, número ou ID de quem entra; o bot grava só um código irreversível (`user_hash`);
  - não exporte listas de membros;
  - não adicione ninguém sem pedido.
- **Comunidade do WhatsApp:** use o formato com números ocultos para os membros (**VERIFICAR**), para reduzir a exposição a golpistas.
- **Sem site, sem Pixel:** não há cookies nem formulário, então não é preciso política de cookies. Se um dia houver lista de e-mail, só com consentimento explícito e link para descadastrar.
- **Prints de reclamação:** não poste print com dados de outra pessoa; corte antes.

## Termos dos programas de afiliados

**VERIFICAR** item por item nos termos atuais, antes de 20/11. São os pontos que mais derrubam contas.

### Amazon (Associados)

- [ ] **Divulgação obrigatória:**
  - a Amazon exige uma frase de identificação específica, algo como "Como Associado da Amazon, recebo por compras qualificadas";
  - conferir o texto exato e incluir na descrição dos canais e na mensagem fixada do Telegram.
- [ ] **Exibição de preço:**
  - os termos têm regras sobre mostrar preço que não veio da API oficial (atualização e horário);
  - conferir se o preço manual com data e hora atende. **Ponto mais importante desta lista.**
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
