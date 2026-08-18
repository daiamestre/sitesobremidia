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
  const { error: e1 } = await sb.rpc('has_role', { role_name: 'admin' });
  console.log('has_role:', e1 ? 'ERR ' + e1.message.slice(0,80) : 'EXISTS');

  const { error: e2 } = await sb.rpc('fn_player_can_access_screen', { p_screen_id: '11111111-0000-0000-0001-000000000001' });
  console.log('fn_player_can_access_screen:', e2 ? 'ERR ' + e2.message.slice(0,80) : 'EXISTS');

  const { error: e3 } = await sb.rpc('fn_device_bind', { p_identity_hash: 'x', p_screen_id: '11111111-0000-0000-0001-000000000001' });
  console.log('fn_device_bind:', e3 ? 'ERR ' + e3.message.slice(0,80) : 'EXISTS');

  const { error: e4 } = await sb.rpc('fn_player_report_telemetry', {});
  console.log('fn_player_report_telemetry:', e4 ? 'ERR ' + e4.message.slice(0,80) : 'EXISTS');
}
main();