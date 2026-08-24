import fs from 'fs'; import os from 'os'; import path from 'path';
const token = fs.readFileSync(path.join(os.tmpdir(), 'sb_token2.tmp'), 'utf8').trim();
const sqlPath = 'supabase/migrations/20260824_billing_central_operacional.sql';
const sql = fs.readFileSync(sqlPath, 'utf8');
const res = await fetch('https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query', {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql })
});
console.log('re-apply:', res.status);
if (!res.ok) console.log((await res.text()).slice(0, 400));
