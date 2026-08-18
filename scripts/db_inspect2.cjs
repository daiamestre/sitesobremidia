const fs = require('fs');
const os = require('os');
const path = require('path');

const token = fs.readFileSync(path.join(os.tmpdir(), 'sb_token2.tmp'), 'utf8').trim();

async function q(query) {
  const r = await fetch('https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return { status: r.status, data: await r.json() };
}

(async () => {
  let x = await q("SELECT policyname, cmd, qual, with_check, roles FROM pg_policies WHERE tablename = 'empresa_operadora' ORDER BY policyname");
  console.log('EMP OPERADORA POLICIES:', JSON.stringify(x.data, null, 1));
  x = await q("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='auditoria_logs' ORDER BY ordinal_position");
  console.log('AUDITORIA COLS:', JSON.stringify(x.data, null, 1));
})();