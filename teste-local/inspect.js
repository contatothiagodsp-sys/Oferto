// Mostra a última execução de um workflow: status, erro e itens por nó.
const { DatabaseSync } = require('node:sqlite');
const flatted = require(require.resolve('flatted', { paths: [process.env.N8N_DIR] }));
const [wfId, detalhe] = process.argv.slice(2);
const db = new DatabaseSync(require('path').join(__dirname, 'tmp', 'home', '.n8n', 'database.sqlite'), { readOnly: true });
const ex = db.prepare('select id, status, finished from execution_entity where workflowId = ? order by id desc limit 1').get(wfId);
if (!ex) { console.log('sem execução'); process.exit(0); }
const d = db.prepare('select data from execution_data where executionId = ?').get(ex.id);
const data = flatted.parse(d.data);
const rd = data.resultData;
console.log(`exec ${ex.id} status=${ex.status}`);
if (rd.error) console.log('ERRO:', rd.error.message, '@', rd.error.node && rd.error.node.name);
for (const [n, runs] of Object.entries(rd.runData)) {
  const r = runs[0];
  const out = (r.data && r.data.main) || [];
  const cont = out.map((o) => (o ? o.length : 0)).join('/');
  console.log(`  ${n}: ${cont}${r.error ? '  ERRO: ' + r.error.message + ' ' + (r.error.description || '') : ''}`);
  if (detalhe && (detalhe === '*' || n === detalhe)) for (const o of out) for (const it of o || []) console.log('     ', JSON.stringify(it.json).slice(0, 600));
}
