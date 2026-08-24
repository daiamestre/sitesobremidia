import fs from 'fs'; import os from 'os'; import path from 'path';
const token = fs.readFileSync(path.join(os.tmpdir(), 'sb_token2.tmp'), 'utf8').trim();
const sqlPath = process.argv[2] || 'supabase/migrations/20260824_billing_central_operacional.sql';
const sql = fs.readFileSync(sqlPath, 'utf8');
console.log(`[+] Aplicando ${sqlPath} (${sql.length} bytes)...`);
const res = await fetch('https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query', {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql })
});
const t = await res.text();
console.log('Status:', res.status);
if (!res.ok) { console.log(t.slice(0, 1500)); process.exit(1); }
console.log(t.slice(0, 500));
