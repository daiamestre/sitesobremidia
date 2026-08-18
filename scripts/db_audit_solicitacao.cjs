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
  const data = await r.json();
  if (r.status !== 200 && !Array.isArray(data)) console.log('ERRO:', r.status, JSON.stringify(data).slice(0, 300));
  return data;
}

(async () => {
  console.log('=== COLUNAS solicitacoes_acesso ===');
  console.log(JSON.stringify(await q(`SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns WHERE table_schema='public' AND table_name='solicitacoes_acesso'
    ORDER BY ordinal_position`), null, 1));

  console.log('\n=== POLICIES solicitacoes_acesso ===');
  console.log(JSON.stringify(await q(`SELECT policyname, cmd, qual, with_check
    FROM pg_policies WHERE schemaname='public' AND tablename='solicitacoes_acesso'`), null, 1));

  console.log('\n=== TRIGGERS solicitacoes_acesso ===');
  console.log(JSON.stringify(await q(`SELECT tgname, pg_get_triggerdef(t.oid) AS def
    FROM pg_trigger t WHERE t.tgrelid = 'public.solicitacoes_acesso'::regclass AND NOT tgisinternal`), null, 1));

  console.log('\n=== RLS STATUS solicitacoes_acesso ===');
  console.log(JSON.stringify(await q(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class
    WHERE oid = 'public.solicitacoes_acesso'::regclass`)));

  console.log('\n=== TRIGGERS usuarios (todas) ===');
  console.log(JSON.stringify(await q(`SELECT tgname, pg_get_triggerdef(t.oid) AS def
    FROM pg_trigger t WHERE t.tgrelid = 'public.usuarios'::regclass AND NOT tgisinternal`), null, 1));

  console.log('\n=== TRIGGERS representantes ===');
  console.log(JSON.stringify(await q(`SELECT tgname, pg_get_triggerdef(t.oid) AS def
    FROM pg_trigger t WHERE t.tgrelid = 'public.representantes'::regclass AND NOT tgisinternal`), null, 1));
})();
