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
  ['screens', ['id','user_id','custom_id','empresa_operadora_id','playlist_id','status','last_ping_at','last_heartbeat','version']],
  ['devices', ['id','screen_id','identity_hash','screen_token','status','last_seen','last_heartbeat','registered_at','revoked_at']],
  ['remote_commands', ['id','screen_id','command','status','executed_at','created_at']],
  ['playback_logs', ['id','screen_id','media_id','player_id','duration','started_at','status','signature','empresa_operadora_id']],
  ['app_releases', ['id','version_code','version_name','apk_url','sha256','is_mandatory','created_at']],
  ['players', ['id','empresa_operadora_id','name','status']],
  ['media', ['id','user_id','file_url','file_hash','file_path','file_type']],
  ['widgets', ['id','user_id','type','content']],
  ['playlists', ['id','user_id','name']],
  ['playlist_items', ['id','playlist_id','media_id','position','duration']],
];

async function main() {
  for (const [table, cols] of probes) {
    const { error } = await sb.from(table).select(cols.join(',')).limit(1);
    console.log(`[${table}] ${error ? 'ERR: ' + error.message : 'OK cols present'}`);
  }
}
main();