import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const envFile = fs.readFileSync(file, 'utf8');
  for (const line of envFile.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv('.env');
loadEnv('.env.e2e.local');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) { console.error('missing service role'); process.exit(1); }
const supabase = createClient(supabaseUrl, serviceKey);

async function q(sql) {
  const { data, error } = await supabase.rpc('exec_sql_audit', { sql_text: sql });
  if (error) return { error: error.message };
  return { data };
}

async function main() {
  // 1. Tabelas alvo: policies
  const pol = await q(`
    SELECT p.schemaname, p.tablename, p.policyname, p.cmd, p.roles, p.qual, p.with_check
    FROM pg_policies p
    WHERE p.tablename IN ('screens','devices','remote_commands','playback_logs','device_health','player_heartbeats','download_status','app_releases','media','widgets','playlists','playlist_items','monitoring_logs','proof_of_play','screenshots_logs','device_logs')
       OR (p.schemaname='storage' AND p.tablename='objects')
    ORDER BY p.tablename, p.policyname;
  `);
  console.log(JSON.stringify(pol, null, 1));

  // 2. Row counts
  const cnt = await q(`
    SELECT 'screens' t, count(*) n FROM public.screens
    UNION ALL SELECT 'devices', count(*) FROM public.devices
    UNION ALL SELECT 'remote_commands', count(*) FROM public.remote_commands
    UNION ALL SELECT 'playback_logs', count(*) FROM public.playback_logs
    UNION ALL SELECT 'media', count(*) FROM public.media
    UNION ALL SELECT 'widgets', count(*) FROM public.widgets
    UNION ALL SELECT 'playlists', count(*) FROM public.playlists
    UNION ALL SELECT 'playlist_items', count(*) FROM public.playlist_items
    UNION ALL SELECT 'app_releases', count(*) FROM public.app_releases
    UNION ALL SELECT 'device_logs', count(*) FROM public.device_logs;
  `);
  console.log('ROWCOUNTS:', JSON.stringify(cnt, null, 1));
}
main().catch(e => console.error('FATAL', e.message));