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
  let x = await q('SELECT id, nome, status FROM public.empresa_operadora ORDER BY created_at');
  console.log('TENANTS:', JSON.stringify(x.data, null, 1));
  x = await q("SELECT u.email, u.is_owner, p.nome AS perfil, u.ativo, u.status FROM public.usuarios u LEFT JOIN public.perfis p ON p.id=u.perfil_id ORDER BY u.created_at DESC LIMIT 25");
  console.log('USERS:', JSON.stringify(x.data, null, 1));
  x = await q('SELECT id, nome, ativo FROM public.perfis ORDER BY nome');
  console.log('PERFIS:', JSON.stringify(x.data, null, 1));
  x = await q("SELECT policyname, cmd, tablename FROM pg_policies WHERE tablename IN ('usuarios','representantes','empresa_operadora','auditoria_logs','permissoes_usuarios') ORDER BY tablename, policyname");
  console.log('POLICIES:', JSON.stringify(x.data, null, 1));
})();
