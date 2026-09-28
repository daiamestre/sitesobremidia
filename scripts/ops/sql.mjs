/**
 * Consulta/altera o banco de PRODUÇÃO pela Management API do Supabase.
 *   node scripts/ops/sql.mjs "select count(*) from screens"
 *   node scripts/ops/sql.mjs @supabase/migrations/2026xxxx_nome.sql      (aplica uma migração)
 * Saída: JSON. Só a ÚLTIMA instrução devolve linhas. Para ler sem deixar rastro, use um bloco DO que termina em
 * RAISE EXCEPTION com o resultado (a transação é desfeita) — ver scripts/ops/comparar-telas.mjs.
 */
import fs from 'node:fs';
import { exigir, REF } from './segredos.mjs';

export async function sql(texto) {
  exigir('SUPABASE_ACCESS_TOKEN');
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF()}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: texto }),
  });
  const corpo = await r.text();
  if (!r.ok) throw new Error(corpo);
  return JSON.parse(corpo);
}

if (process.argv[1]?.endsWith('sql.mjs')) {
  const arg = process.argv[2];
  if (!arg) { console.error('uso: node scripts/ops/sql.mjs "<sql>" | @arquivo.sql'); process.exit(2); }
  const texto = arg.startsWith('@') ? fs.readFileSync(arg.slice(1), 'utf8') : arg;
  sql(texto).then((j) => console.log(JSON.stringify(j, null, 1))).catch((e) => { console.error(e.message); process.exit(1); });
}
