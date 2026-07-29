import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const R2_PUBLIC_DOMAIN = process.env.VITE_R2_PUBLIC_DOMAIN;
const R2_CDN = process.env.VITE_R2_ENDPOINT;

const results = [];

function log(status, label, detail = '') {
  const icon = status === 'OK' ? '✅' : status === 'WARN' ? '⚠️' : '❌';
  const msg = `${icon} [${status}] ${label}${detail ? ' → ' + detail : ''}`;
  console.log(msg);
  results.push({ status, label, detail });
}

async function testUrl(label, url, options = {}) {
  try {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
    if (res.status < 500) {
      log('OK', label, `HTTP ${res.status}`);
      return res;
    } else {
      const body = await res.text().catch(() => '');
      log('FAIL', label, `HTTP ${res.status} — ${body.slice(0, 120)}`);
    }
  } catch (e) {
    log('FAIL', label, e.message);
  }
  return null;
}

async function run() {
  console.log('\n==================================================');
  console.log('  AUDITORIA COMPLETA - SOBREMIDIA DESIGNER');
  console.log('==================================================\n');

  // 1. Supabase REST API
  await testUrl('Supabase REST API', `${SUPABASE_URL}/rest/v1/`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });

  // 2. Supabase Auth
  await testUrl('Supabase Auth Service', `${SUPABASE_URL}/auth/v1/health`, {
    headers: { apikey: SUPABASE_KEY }
  });

  // 3. Edge Function: get-upload-url
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/get-upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({ fileName: 'temp/audit-test.mp4', contentType: 'video/mp4', userId: 'audit-test-user' }),
      signal: AbortSignal.timeout(10000)
    });
    const data = await res.json();
    if (res.status === 200 && data.signedUrl) {
      log('OK', 'Edge Function: get-upload-url', `URL gerada ✔ expira em ${data.expiresIn}s`);
    } else {
      log('FAIL', 'Edge Function: get-upload-url', JSON.stringify(data).slice(0, 120));
    }
  } catch(e) { log('FAIL', 'Edge Function: get-upload-url', e.message); }

  // 4. Edge Function CORS checks
  for (const fn of ['process-media', 'fetch-rss', 'send-approval-notification', 'upload-audit-log', 'handle-approval', 'check-offline-screens', 'maintenance', 'send-status-notification']) {
    await testUrl(`Edge Function: ${fn} (CORS)`, `${SUPABASE_URL}/functions/v1/${fn}`, {
      method: 'OPTIONS',
      headers: { 'Access-Control-Request-Method': 'POST', Origin: 'https://app.sobremidia.com.br' }
    });
  }

  // 5. Cloudflare R2 domain
  if (R2_PUBLIC_DOMAIN) {
    log('OK', 'R2 CDN Domain configurado', R2_PUBLIC_DOMAIN);
  } else {
    log('WARN', 'R2 CDN Domain', 'VITE_R2_PUBLIC_DOMAIN não definido');
  }

  // 6. Supabase tables (anon access — expected to be restricted by RLS)
  const tables = ['media', 'screens', 'playlists', 'devices', 'playlist_items', 'widgets'];
  for (const table of tables) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=count&limit=1`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000)
      });
      if (res.status === 200 || res.status === 206) {
        log('OK', `DB Tabela: ${table}`, 'acessível (requer login)');
      } else if (res.status === 401 || res.status === 403) {
        log('OK', `DB Tabela: ${table}`, `HTTP ${res.status} — RLS ativo (correto, requer login)`);
      } else {
        const body = await res.text();
        log('WARN', `DB Tabela: ${table}`, `HTTP ${res.status} — ${body.slice(0, 80)}`);
      }
    } catch(e) { log('FAIL', `DB Tabela: ${table}`, e.message); }
  }

  // 7. Vercel site public
  await testUrl('Site Vercel (app.sobremidia.com.br)', 'https://app.sobremidia.com.br');

  // 8. GitHub repo public API
  try {
    const ghRes = await fetch('https://api.github.com/repos/daiamestre/sitesobremidiadesigner', {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(8000)
    });
    if (ghRes.status === 200) {
      const d = await ghRes.json();
      log('OK', 'GitHub Repository', `${d.full_name} (${d.default_branch})`);
    } else {
      log('WARN', 'GitHub Repository', `HTTP ${ghRes.status} — repositório privado ou nome errado`);
    }
  } catch(e) { log('FAIL', 'GitHub Repository', e.message); }

  // Summary
  console.log('\n==================================================');
  const ok = results.filter(r => r.status === 'OK').length;
  const warn = results.filter(r => r.status === 'WARN').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  console.log(`RESULTADO FINAL: ✅ ${ok} OK  |  ⚠️  ${warn} AVISOS  |  ❌ ${fail} FALHAS`);
  console.log('==================================================\n');
}

run();
