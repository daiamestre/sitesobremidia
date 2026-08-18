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
const results = [];
function rec(test, ok, detail) { results.push({ test, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} | ${test} | ${detail}`); }

async function main() {
  // ---------- ANON ----------
  const anonSb = createClient(url, anon);
  for (const t of ['screens','remote_commands','app_releases','media','widgets','playlists','playlist_items','devices','playback_logs','device_logs','monitoring_logs','proof_of_play','screenshots_logs']) {
    const { data, error } = await anonSb.from(t).select('*').limit(5);
    if (error) { rec(`anon READ ${t}`, false, 'ERR: ' + error.message); continue; }
    rec(`anon READ ${t}`, !(data && data.length > 0), data && data.length > 0 ? `OPEN: ${data.length} rows (${data.map(r=>r.id||r.screen_id).slice(0,2).join(',')})` : 'blocked/empty');
  }
  // anon INSERT attempt (must be denied)
  const { error: anonIns } = await anonSb.from('remote_commands').insert({ screen_id: '00000000-0000-0000-0000-000000000000', command: 'reboot', status: 'pending' });
  rec('anon INSERT remote_commands', !!anonIns, anonIns ? 'blocked: ' + anonIns.message : 'OPEN: insert accepted!');

  // ---------- AUTHENTICATED (e2e owner) ----------
  const sb = createClient(url, anon);
  const { data: login } = await sb.auth.signInWithPassword({ email: process.env.TEST_USER_EMAIL, password: process.env.TEST_USER_PASSWORD });
  if (!login.user) { console.log('LOGIN FAILED'); return; }
  const uid = login.user.id;
  console.log('AUTH USER:', uid, 'email:', login.user.email);

  // All screens visible to this user + owners
  const { data: screens } = await sb.from('screens').select('id, user_id, custom_id, empresa_operadora_id');
  const owners = [...new Set((screens || []).map(s => s.user_id))];
  rec('AUTH sees ONLY own screens', owners.length === 1 && owners[0] === uid, `owners=${owners.join(',')} uid=${uid}`);
  const foreignScreen = (screens || []).find(s => s.user_id !== uid);
  rec('foreign screen exists to test', !!foreignScreen, foreignScreen ? `screen=${foreignScreen.id} owner=${foreignScreen.user_id}` : 'none found');

  if (foreignScreen) {
    // SELECT on foreign screen's commands
    const { data: foreignCmds, error: fe } = await sb.from('remote_commands').select('id').eq('screen_id', foreignScreen.id).limit(1);
    rec('AUTH SELECT foreign remote_commands', !(foreignCmds && foreignCmds.length > 0), fe ? 'ERR:' + fe.message : (foreignCmds && foreignCmds.length ? `OPEN: ${foreignCmds.length} rows` : 'blocked/empty'));

    // INSERT command for foreign screen
    const { error: insErr } = await sb.from('remote_commands').insert({ screen_id: foreignScreen.id, command: 'screenshot', status: 'pending' });
    rec('AUTH INSERT command on foreign screen', !!insErr, insErr ? 'blocked: ' + insErr.message : 'OPEN: cross-tenant command accepted!');

    // UPDATE foreign screen (heartbeat spoof)
    const { error: updErr } = await sb.from('screens').update({ last_ping_at: new Date().toISOString() }).eq('id', foreignScreen.id);
    rec('AUTH UPDATE foreign screen', !!updErr, updErr ? 'blocked: ' + updErr.message : 'OPEN: cross-tenant update accepted!');

    // INSERT playback_logs for foreign screen
    const { error: plErr } = await sb.from('playback_logs').insert({ screen_id: foreignScreen.id, media_id: null, duration: 1, started_at: new Date().toISOString(), status: 'COMPLETED' });
    rec('AUTH INSERT playback_logs foreign screen', !!plErr, plErr ? 'blocked: ' + plErr.message : 'OPEN: cross-tenant PoP accepted!');
  }

  fs.writeFileSync('scripts/cross_tenant_results.json', JSON.stringify(results, null, 2));
}
main().catch(e => console.error('FATAL', e));