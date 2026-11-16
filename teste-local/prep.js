// Prepara cópias de teste dos workflows: ids fixos, gatilhos agendados → manuais, e um workflow que grava a config de teste.
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'n8n', 'workflows');
const OUT = path.join(__dirname, 'tmp', 'wf');
fs.mkdirSync(OUT, { recursive: true });
const ids = { '00-setup.json': 'wfSetup000000001', '01-telegram-router.json': 'wfRouter00000001', '02-coleta-shopee.json': 'wfShopee00000001', '03-relatorio-diario.json': 'wfRelat000000001' };
for (const [arq, id] of Object.entries(ids)) {
  const wf = JSON.parse(fs.readFileSync(path.join(SRC, arq), 'utf8'));
  wf.id = id;
  // Gatilhos manuais/agendados viram webhooks de teste: o "n8n execute" da CLI não carrega o módulo de Data Tables.
  for (const n of wf.nodes) {
    if (['n8n-nodes-base.scheduleTrigger', 'n8n-nodes-base.manualTrigger'].includes(n.type)) {
      Object.assign(n, { type: 'n8n-nodes-base.webhook', typeVersion: 2, webhookId: 'hook-' + id, parameters: { httpMethod: 'POST', path: 'teste-' + id, responseMode: 'onReceived', options: {} } });
    }
  }
  fs.writeFileSync(path.join(OUT, arq), JSON.stringify(wf));
}
const cfg = {
  marca: 'Marca Teste', admins: '111,222', bot_token: 'TOKADMIN', bot_token_grupo: 'TOKGRUPO', grupo_id: '-1001234567890',
  n8n_webhook_url: 'http://localhost:5678/webhook/telegram-ofertas', telegram_api: 'http://127.0.0.1:8787',
  'shopee.app_id': '123456', 'shopee.secret': 'segredo-shopee', 'shopee.endpoint': 'http://127.0.0.1:8787/graphql',
  'shopee.busca.casa': 'air fryer', 'shopee.busca.beleza': 'perfume', 'shopee.busca.bebe': '', 'shopee.busca.tech': '',
  'amazon.tag.casa_tg': 'marca-casatg-20', 'amazon.tag.casa_wac': 'marca-casawac-20', 'amazon.tag.casa_wag': 'marca-casawag-20', 'amazon.tag.casa_x': 'marca-casax-20',
};
const linhas = Object.entries(cfg).map(([chave, valor]) => ({ chave, valor }));
const wf = {
  id: 'wfConfTeste00001', name: '99 · config de teste', active: false, settings: { executionOrder: 'v1' }, connections: {
    Start: { main: [[{ node: 'Linhas', type: 'main', index: 0 }]] },
    Linhas: { main: [[{ node: 'Upsert', type: 'main', index: 0 }]] },
  },
  nodes: [
    { id: 'a1', name: 'Start', type: 'n8n-nodes-base.webhook', typeVersion: 2, webhookId: 'hook-wfConfTeste00001', position: [0, 0], parameters: { httpMethod: 'POST', path: 'teste-wfConfTeste00001', responseMode: 'onReceived', options: {} } },
    { id: 'a2', name: 'Linhas', type: 'n8n-nodes-base.code', typeVersion: 2, position: [200, 0], parameters: { jsCode: `return ${JSON.stringify(linhas)}.map(j => ({json: j}));` } },
    { id: 'a3', name: 'Upsert', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: [400, 0], parameters: {
      resource: 'row', operation: 'upsert', dataTableId: { __rl: true, mode: 'name', value: 'bfx_config' }, matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'chave', condition: 'eq', keyValue: '={{ $json.chave }}' }] },
      columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: [], schema: [] }, options: {} } },
  ],
};
fs.writeFileSync(path.join(OUT, '99-config-teste.json'), JSON.stringify(wf));
console.log('workflows de teste em', OUT);
