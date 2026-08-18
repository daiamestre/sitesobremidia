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
  const x = await q("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='notificacoes_central' ORDER BY ordinal_position");
  console.log(JSON.stringify(x.data, null, 1));
})();
