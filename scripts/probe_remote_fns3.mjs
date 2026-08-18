import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv('.env');
loadEnv('.env.e2e.local');
const url = process.env.VITE_SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const sb = createClient(url, anon);

async function main() {
  const { data: login, error: le } = await sb.auth.signInWithPassword({ email: process.env.TEST_USER_EMAIL, password: process.env.TEST_USER_PASSWORD });
  if (le) { console.log('login fail', le.message); return; }
  const a = login.session.access_token;

  const r1 = await sb.rpc('has_role', { _user_id: login.user.id, _role: 'admin' });
  console.log('has_role(_user_id,_role):', r1.error ? 'ERR ' + r1.error.message.slice(0,100) : 'EXISTS result=' + r1.data);

  const r2 = await sb.rpc('get_user_empresa_operadora_id', { p_user_id: login.user.id });
  console.log('get_user_empresa_operadora_id(p_user_id):', r2.error ? 'ERR ' + r2.error.message.slice(0,100) : 'EXISTS result=' + r2.data);

  const r3 = await sb.rpc('fn_player_can_access_screen', { p_screen_id: '11111111-0000-0000-0001-000000000001' });
  console.log('fn_player_can_access_screen:', r3.error ? 'ERR ' + r3.error.message.slice(0,100) : 'EXISTS result=' + r3.data);
}
main();