/**
 * Chama uma Edge Function de produção com a chave pública (anon) e mostra a resposta. Nunca imprime chaves.
 *   node scripts/ops/chamar-funcao.mjs <funcao> '<json do corpo>'
 * Ex.: node scripts/ops/chamar-funcao.mjs inter-pix-engine '{"action":"preflight","validate_with_inter":true}'
 */
import { exigir, REF } from './segredos.mjs';

exigir('SUPABASE_ACCESS_TOKEN');
const [funcao, corpo = '{}'] = process.argv.slice(2);
if (!funcao) { console.error('uso: node scripts/ops/chamar-funcao.mjs <funcao> \'<json>\''); process.exit(2); }
const ref = REF();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, { headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` } })).json();
const anon = keys.find((k) => k.name === 'anon').api_key;
const r = await fetch(`https://${ref}.supabase.co/functions/v1/${funcao}`, {
  method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' }, body: corpo,
});
console.log(r.status, (await r.text()).slice(0, 3000));
