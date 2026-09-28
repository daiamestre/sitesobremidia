/**
 * Publica o site em PRODUÇÃO na Vercel (push no GitHub só gera "preview").
 *   node scripts/ops/deploy-vercel.mjs            (usa o commit atual — precisa estar enviado ao GitHub)
 *   node scripts/ops/deploy-vercel.mjs <sha>
 * Espera ficar READY. Depois conferir no ar: node scripts/ops/conferir-site.mjs "<texto novo>"
 */
import { execSync } from 'node:child_process';
import { exigir } from './segredos.mjs';

exigir('VERCEL_TOKEN', 'VERCEL_PROJECT_ID');
const sha = process.argv[2] ?? execSync('git rev-parse HEAD').toString().trim();
if (!/^[0-9a-f]{40}$/.test(sha)) { console.error('use o SHA completo (40 caracteres)'); process.exit(2); }
const H = { Authorization: `Bearer ${process.env.VERCEL_TOKEN}`, 'Content-Type': 'application/json' };
const P = process.env.VERCEL_PROJECT_ID;
const qs = process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : '';
const proj = await (await fetch(`https://api.vercel.com/v9/projects/${P}${qs}`, { headers: H })).json();
const r = await fetch(`https://api.vercel.com/v13/deployments${qs}${qs ? '&' : '?'}forceNew=1`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ name: proj.name, project: P, target: 'production', gitSource: { type: 'github', repoId: 1134797053, ref: 'release/player-5.2.4', sha } }),
});
const d = await r.json();
if (!d.id) { console.error('falha ao criar', r.status, JSON.stringify(d).slice(0, 300)); process.exit(1); }
console.log('deploy criado', d.id, 'commit', sha.slice(0, 7));
for (let i = 0; i < 90; i++) {
  await new Promise((s) => setTimeout(s, 10000));
  const s = await (await fetch(`https://api.vercel.com/v13/deployments/${d.id}${qs}`, { headers: H })).json();
  if (['READY', 'ERROR', 'CANCELED'].includes(s.readyState)) {
    console.log(s.readyState, s.target, (s.alias || []).slice(0, 1).join(' '));
    process.exit(s.readyState === 'READY' ? 0 : 1);
  }
}
console.log('tempo esgotado esperando a Vercel'); process.exit(1);
