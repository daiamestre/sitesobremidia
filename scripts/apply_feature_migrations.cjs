// Aplicador de migrations de restauração (Representantes + fechamento de exposição de tenant).
// Mesmo mecanismo seguro já adotado pelo projeto (Management API do Supabase, ver apply_central_hardening.cjs).
// Cada arquivo é aplicado em uma única transação (BEGIN/COMMIT) — falha = rollback total do arquivo.
// Uso: node scripts/apply_feature_migrations.cjs <arquivo1.sql> [arquivo2.sql ...]
const fs = require('fs');
const os = require('os');
const path = require('path');

const token = fs.readFileSync(path.join(os.tmpdir(), 'sb_token2.tmp'), 'utf8').trim();
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Uso: node scripts/apply_feature_migrations.cjs <arquivo.sql> [...]');
  process.exit(2);
}

async function run(query, label) {
  const r = await fetch('https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await r.text();
  console.log(`===== ${label} -> HTTP ${r.status}`);
  if (!r.ok) {
    console.log(text.slice(0, 4000));
    return false;
  }
  console.log('OK');
  return true;
}

async function main() {
  let allOk = true;
  for (const file of files) {
    const sql = fs.readFileSync(file, 'utf8');
    const wrapped = 'BEGIN;\n' + sql + '\nCOMMIT;';
    const ok = await run(wrapped, path.basename(file));
    if (!ok) allOk = false;
  }
  process.exitCode = allOk ? 0 : 1;
}

main();
