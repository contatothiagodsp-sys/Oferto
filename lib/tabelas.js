'use strict';
// Esquema das Data Tables. Os nomes têm prefixo único porque o n8n localiza
// tabela "por nome" com busca do tipo "contém": evite outras tabelas com estes trechos.

const S = 'string';
const N = 'number';
const B = 'boolean';

const TABELAS = {
  bfx_config: { chave: S, valor: S, descricao: S },
  bfx_precos: { produto_id: S, loja: S, preco: N, fonte: S, fonte_url: S, ts: N, data: S },
  bfx_ofertas: {
    oferta_id: S, produto_id: S, loja: S, categoria: S, titulo: S, url: S, imagem: S,
    preco: N, min90: N, desconto_pct: N, ref90: N, ref90_fonte: S, selo: S,
    hist_registros: N, hist_primeira: S, links_manuais: S, origem: S, status: S,
    relampago: B, top: B, comissao_pct: N, vendas: N, criada_por: N, decidida_por: N,
    ts: N, decidida_ts: N, data: S,
  },
  bfx_links: { oferta_id: S, categoria: S, plataforma: S, sub_id: S, url: S, ts: N, data: S },
  bfx_posts: { oferta_id: S, plataforma: S, categoria: S, message_id: N, link: S, ts: N, data: S },
  bfx_convites: { nome: S, categoria: S, url: S, ts: N, data: S },
  bfx_entradas: { user_hash: S, tipo: S, convite_nome: S, ts: N, data: S },
};

/** Confere se uma linha só tem colunas da tabela (o n8n recusa colunas desconhecidas). */
function colunasInvalidas(tabela, linha) {
  const cols = TABELAS[tabela];
  return Object.keys(linha).filter((k) => !(k in cols));
}

module.exports = { TABELAS, colunasInvalidas };
