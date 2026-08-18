import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Use REST to query pg_policies via rpc (we only have anon key; but this is a server-side check).
// Try SQL via the anon key would fail. Instead use the postgres REST? We'll attempt rpc; if not available, output connection info only.
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const tables = ['screens','devices','remote_commands','playback_logs','device_health','player_heartbeats','download_status','app_releases','media','widgets','playlists','playlist_items','monitoring_logs','proof_of_play','screenshots_logs','device_logs','display_stats','external_links'];

  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*').limit(1);
    console.log(`[${t}] rows_readable_by_anon=${error ? 'ERR:' + error.message : (Array.isArray(data) ? data.length + ' rows (OPEN!)' : '?')}`);
  }
}
main();