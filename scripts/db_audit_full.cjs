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
  // 1. Todas as policies de todas as tabelas públicas (fonte de verdade)
  let x = await q(`SELECT tablename, policyname, cmd, qual, with_check
    FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname`);
  console.log('=== POLICIES (public) ===');
  console.log(JSON.stringify(x.data, null, 1));

  // 2. Triggers em tabelas sensíveis
  x = await q(`SELECT tgname, tgrelid::regclass AS tabela, pg_get_triggerdef(t.oid) AS def
    FROM pg_trigger t WHERE NOT tgisinternal AND tgrelid::regclass::text LIKE 'public.%'
    ORDER BY tabela, tgname`);
  console.log('\n=== TRIGGERS ===');
  for (const t of (x.data || [])) console.log(`[${t.tabela}] ${t.tgname}: ${t.def}`);

  // 3. RPCs da Central
  x = await q(`SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND (p.proname LIKE '%central%' OR p.proname LIKE '%usuario%'
      OR p.proname LIKE '%autonomia%' OR p.proname LIKE '%permiss%' OR p.proname LIKE '%acesso%'
      OR p.proname LIKE '%solicit%' OR p.proname LIKE '%tenant%' OR p.proname LIKE '%owner%')
    ORDER BY p.proname`);
  console.log('\n=== RPCs ===');
  for (const r of (x.data || [])) console.log(`${r.proname}(${r.args})`);
})();
