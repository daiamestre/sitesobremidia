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
  return r.json();
}

(async () => {
  console.log('=== SOLICITACOES_ACESSO (estado real) ===');
  console.log(JSON.stringify(await q(`SELECT status, tipo_acesso, (empresa_operadora_id IS NULL) AS sem_tenant, COUNT(*)::int AS n
    FROM public.solicitacoes_acesso GROUP BY status, tipo_acesso, (empresa_operadora_id IS NULL) ORDER BY n DESC LIMIT 25`), null, 1));

  console.log('\n=== ADMINS / OWNERS ===');
  console.log(JSON.stringify(await q(`SELECT u.email, p.nome AS perfil, u.is_owner, u.empresa_operadora_id
    FROM public.usuarios u LEFT JOIN public.perfis p ON p.id=u.perfil_id
    WHERE (p.nome = 'ADMIN' OR u.is_owner) ORDER BY u.is_owner DESC`), null, 1));

  console.log('\n=== handle_approval edge exists? ===');
  console.log('(verificado localmente)');
})();
