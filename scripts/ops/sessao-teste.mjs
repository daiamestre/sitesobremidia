/**
 * Sessão da conta de TESTE (nunca conta pessoal) para conferir o painel no navegador do Claude, sem digitar senha.
 *   node scripts/ops/sessao-teste.mjs [email-de-teste] [origem]
 * Gera a sessão em memória e a entrega UMA vez em http://127.0.0.1:8767 (só para a origem informada, padrão
 * http://localhost:5199), depois encerra. No navegador:
 *   const j = await (await fetch('http://127.0.0.1:8767/')).json(); localStorage.setItem(j.key, JSON.stringify(j.session));
 * Ao terminar: apagar as chaves "sb-" do localStorage.
 */
import http from 'node:http';
import { exigir, REF } from './segredos.mjs';

exigir('SUPABASE_ACCESS_TOKEN');
const email = process.argv[2] ?? 'e2e-owner@sobremidia.com.br';
if (/@gmail\.com$/i.test(email)) { console.error('use só contas de teste, nunca conta pessoal'); process.exit(2); }
const origem = process.argv[3] ?? 'http://localhost:5199';
const ref = REF();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, { headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` } })).json();
const svc = keys.find((k) => k.name === 'service_role').api_key;
const anon = keys.find((k) => k.name === 'anon').api_key;
const base = `https://${ref}.supabase.co`;
const gl = await (await fetch(`${base}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: svc, Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'magiclink', email }) })).json();
const sessao = await (await fetch(`${base}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'magiclink', token_hash: gl.hashed_token }) })).json();
if (!sessao.access_token) { console.error('não foi possível gerar a sessão'); process.exit(1); }
const corpo = JSON.stringify({ key: `sb-${ref}-auth-token`, session: sessao });
http.createServer((req, res) => {
  const h = { 'Access-Control-Allow-Origin': origem, 'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Allow-Headers': '*' };
  if (req.method === 'OPTIONS') { res.writeHead(204, h); return res.end(); }
  res.writeHead(200, { ...h, 'Content-Type': 'application/json' }); res.end(corpo);
  console.log('sessão entregue — encerrando'); setTimeout(() => process.exit(0), 200);
}).listen(8767, '127.0.0.1', () => console.log(`pronto: sessão de ${email} disponível uma vez em http://127.0.0.1:8767`));
setTimeout(() => process.exit(0), 300000);
