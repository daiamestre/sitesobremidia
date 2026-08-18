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

const probes = [
  ['screens', ['id','user_id','custom_id','empresa_operadora_id','playlist_id','status','last_ping_at','version','name']],
  ['devices', ['id','identity_hash','screen_token','status','last_seen','last_heartbeat','registered_at','activated_at','revoked_at','created_at','name','model']],
  ['app_releases', ['id','version_code','version_name','apk_url','is_mandatory','created_at','description']],
  ['players', ['id','empresa_operadora_id','status','screen_id','user_id','cliente_id']],
  ['widgets', ['id','user_id','content','media_id','name','playlist_id']],
  ['device_health', ['id','device_id','screen_id','app_version','storage_free_mb','last_seen','current_media_id']],
  ['monitoring_logs', ['id','screen_id','device_id','status','payload','created_at']],
  ['proof_of_play', ['id','device_id','screen_id','media_id','status','signature','created_at']],
  ['screenshots_logs', ['id','device_id','screen_id','path','created_at']],
  ['player_heartbeats', ['id','player_id','screen_id','empresa_operadora_id','ip_address','cpu_usage','memory_usage','temp_celsius','storage_free_mb','versao_app','status_ping','ping_at']],
  ['device_logs', ['id','screen_id','device_id','level','message','created_at']],
  ['download_status', ['id','device_id','screen_id','media_id','status','progress','updated_at']],
];

async function main() {
  for (const [table, cols] of probes) {
    const { error } = await sb.from(table).select(cols.join(',')).limit(1);
    console.log(`[${table}] ${error ? 'ERR: ' + error.message : 'OK'}`);
  }
}
main();