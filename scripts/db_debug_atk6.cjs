const fs = require('fs');
const os = require('os');
const path = require('path');

const URL = 'https://bhwsybgsyvvhqtkdqozb.supabase.co';
const KEYS = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'sb_keys.json'), 'utf8'));
const ANON = KEYS.find((k) => k.name === 'anon').api_key;
const SR = KEYS.find((k) => k.name === 'service_role').api_key;
const TENANT_B = '99999999-9999-9999-9999-999999999999';
const PASSWORD = 'R3dT3am!@2026#';

async function main() {
  // cria um admin no tenant A temporário p/ testar
  const email = `rt-dbg-${Date.now()}@sobremidia.com.br`;
  let r = await fetch(`${URL}/auth/v1/admin/users`, { method: 'POST', headers: { apikey: SR, Authorization: 'Bearer ' + SR, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }) });
  const au = await r.json();
  const mgmt = await fetch(`https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + fs.readFileSync(path.join(os.tmpdir(), 'sb_token2.tmp'), 'utf8').trim(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `INSERT INTO public.usuarios (id, email, nome, empresa_operadora_id, perfil_id, is_owner, ativo, status) VALUES ('${au.id}', '${email}', 'Dbg', '7d62aaec-e24d-4273-b257-867183cf658c', '039a07d6-e7ae-485e-8961-81ead9640f5d', false, true, 'ACTIVE')` }),
  });
  r = await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });
  const sess = await r.json();
  const tok = sess.access_token;
  // tentativa que deu 400
  r = await fetch(`${URL}/rest/v1/representantes?select=nome&empresa_operadora_id=eq.${TENANT_B}`, { headers: { apikey: ANON, Authorization: 'Bearer ' + tok } });
  console.log('STATUS:', r.status);
  console.log('BODY:', await r.text());
  // limpeza
  await fetch(`${URL}/auth/v1/admin/users/${au.id}`, { method: 'DELETE', headers: { apikey: SR, Authorization: 'Bearer ' + SR } });
  await fetch(`https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + fs.readFileSync(path.join(os.tmpdir(), 'sb_token2.tmp'), 'utf8').trim(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `DELETE FROM public.usuarios WHERE id = '${au.id}'` }),
  });
}
main().catch((e) => { console.error(e); process.exit(1); });