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

async function tryLogin(email, password) {
  const sb = createClient(url, anon);
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, client: sb, user: data.user };
}

async function probe(client, table) {
  const { data, error } = await client.from(table).select('*').limit(3);
  return { table, error: error ? error.message : null, rows: data ? data.length : 0 };
}

async function main() {
  const emails = ['e2e-owner@sobremidia.com.br', process.env.TEST_USER_EMAIL].filter(Boolean);
  for (const email of emails) {
    const pw = process.env.TEST_USER_PASSWORD;
    if (!pw) continue;
    const login = await tryLogin(email, pw);
    console.log(`LOGIN ${email}: ${login.ok ? 'OK' : 'FAIL ' + login.error}`);
    if (!login.ok) continue;
    const tables = ['screens','devices','remote_commands','playback_logs','device_health','player_heartbeats','download_status','app_releases','media','widgets','playlists','playlist_items','monitoring_logs','proof_of_play','screenshots_logs','device_logs'];
    for (const t of tables) {
      const r = await probe(login.client, t);
      console.log(`  [${r.table}] ${r.error ? 'ERR:' + r.error : r.rows + ' rows visible'}`);
    }
    break;
  }
}
main();