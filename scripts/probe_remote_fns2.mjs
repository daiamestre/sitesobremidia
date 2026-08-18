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
const url = process.env.VITE_SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const sb = createClient(url, anon);

async function main() {
  const { error: e1 } = await sb.rpc('has_role', { user_id: '11111111-0000-0000-0000-000000000000', role_name: 'admin' });
  console.log('has_role(uuid,text):', e1 ? 'ERR ' + e1.message.slice(0,100) : 'EXISTS');
  const { error: e2 } = await sb.rpc('get_user_empresa_operadora_id', { user_id: '11111111-0000-0000-0000-000000000000' });
  console.log('get_user_empresa_operadora_id:', e2 ? 'ERR ' + e2.message.slice(0,100) : 'EXISTS');
  const { error: e3 } = await sb.rpc('fn_player_can_access_screen', { p_screen_id: '11111111-0000-0000-0001-000000000001' });
  console.log('fn_player_can_access_screen:', e3 ? 'ERR ' + e3.message.slice(0,100) : 'EXISTS');
}
main();