// Verificacao cross-tenant definitiva pos-hardening (somente leitura do fluxo autenticado).
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
const FOREIGN_SCREEN = '11111111-0000-0000-0001-000000000002'; // tenant 7d62aaec-e24d-4273-b257-867183cf658c

async function main() {
  const sb = createClient(url, anon);
  const { data: login, error: lerr } = await sb.auth.signInWithPassword({
    email: process.env.TEST_USER_EMAIL,
    password: process.env.TEST_USER_PASSWORD,
  });
  if (!login?.user) { console.log('LOGIN FAILED:', lerr?.message); return; }
  console.log('AUTH USER:', login.user.id, login.user.email);

  const { data: own, error: oe } = await sb.from('usuarios').select('id, email, empresa_operadora_id').eq('id', login.user.id).single();
  console.log('OWNER TENANT:', own?.empresa_operadora_id, '| err:', oe?.message || '-');

  const { data: screens, error: se } = await sb.from('screens').select('id, user_id, empresa_operadora_id');
  console.log('SCREENS VISIVEIS (SELECT):', screens?.length ?? 'ERR ' + se?.message);
  for (const s of screens || []) console.log('  ', s.id, '| tenant:', s.empresa_operadora_id, '| user:', s.user_id);

  const { data: foreign, error: fe } = await sb.from('screens').select('id').eq('id', FOREIGN_SCREEN).limit(1);
  console.log('SELECT tela OUTRO tenant:', foreign?.length ? 'VAZOU (' + foreign[0].id + ')' : 'bloqueada', '| err:', fe?.message || '-');

  const { data: updData, error: upd } = await sb.from('screens').update({ last_ping_at: new Date().toISOString() }).eq('id', FOREIGN_SCREEN).select('id');
  console.log('UPDATE tela OUTRO tenant:', upd ? 'bloqueado (' + upd.message + ')' : updData?.length ? 'VAZOU (' + updData.length + ' linhas afetadas)' : 'bloqueado (0 linhas afetadas)');

  const { error: ins } = await sb.from('playback_logs').insert({
    screen_id: FOREIGN_SCREEN, media_id: null, duration: 1,
    started_at: new Date().toISOString(), status: 'COMPLETED',
  });
  console.log('INSERT playback_logs OUTRO tenant:', ins ? 'bloqueado (' + ins.message + ')' : 'VAZOU');

  const { error: cmd } = await sb.from('remote_commands').insert({ screen_id: FOREIGN_SCREEN, command: 'screenshot', status: 'pending' });
  console.log('INSERT remote_command OUTRO tenant:', cmd ? 'bloqueado (' + cmd.message + ')' : 'VAZOU');
}

main().catch((e) => console.error('FATAL', e));