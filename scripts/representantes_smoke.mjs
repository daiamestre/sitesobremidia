// Smoke test do backend de Representantes como OWNER (RPCs reais do banco).
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
const TENANT = '22345678-1234-1234-1234-123456789012';

async function main() {
  const sb = createClient(url, anon);
  const { data: login, error: lerr } = await sb.auth.signInWithPassword({
    email: process.env.TEST_USER_EMAIL,
    password: process.env.TEST_USER_PASSWORD,
  });
  if (!login?.user) { console.log('LOGIN FAILED:', lerr?.message); return; }

  const { data: rep, error: re } = await sb.rpc('listar_representantes_gerencia', {
    p_empresa_operadora_id: TENANT,
    p_status: null,
    p_busca: '',
    p_representante_id: null,
  });
  console.log('listar_representantes_gerencia:', re ? 'ERR ' + re.message : `OK (${rep?.length ?? 0} representantes)`, rep?.[0] ? `| 1o: ${rep[0].nome}` : '');

  const { data: perf, error: pe } = await sb.rpc('get_desempenho_representantes', {
    p_periodo_inicio: '2026-01-01',
    p_periodo_fim: '2026-12-31',
    p_representante_id: null,
    p_empresa_operadora_id: TENANT,
    p_ordenar: 'receita',
  });
  console.log('get_desempenho_representantes:', pe ? 'ERR ' + pe.message : `OK (${perf?.length ?? 0} linhas)`);

  const { data: admin, error: ae } = await sb.rpc('get_my_admin_permissions');
  console.log('get_my_admin_permissions:', ae ? 'ERR ' + ae.message : `OK (${admin?.length ?? 0} permissoes)`);

  const { data: metas, error: me } = await sb.from('metas_representantes').select('*').limit(3);
  console.log('metas_representantes SELECT:', me ? 'ERR ' + me.message : `OK (${metas?.length ?? 0})`);

  const { data: cli, error: ce } = await sb.from('clientes').select('id, nome').limit(3);
  console.log('clientes SELECT (OWNER):', ce ? 'ERR ' + ce.message : `OK (${cli?.length ?? 0})`);
}

main().catch((e) => console.error('FATAL', e));