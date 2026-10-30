/**
 * SOBRE MÍDIA Studio — gera as FOTOS das variações das pastas de modelos (F-221) na IA da Cloudflare da própria
 * SOBRE MÍDIA (FLUX schnell, cota grátis diária de 10 mil neurons, ≈ 96 por foto), sem pessoas reais nem marcas.
 * Salva em public/studio/fotos/<foto>.webp (1024×1024, a área da foto é quadrada nos dois formatos) e atualiza
 * src/lib/studio/fotos-prontas.ts. Para sozinho quando a cota do dia acaba; rodar de novo continua de onde parou.
 *   node scripts/studio/gerar-fotos-pastas.mjs [--max 60] [--passos 8]
 */
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import sharp from 'sharp';
import { carregarSegredos, exigir } from '../ops/segredos.mjs';

// importa a lista do próprio site (TypeScript; o Node 24 lê .ts, só falta completar a extensão dos imports)
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx); } catch (e) { if (spec.startsWith('.') && !/\\.[mc]?[jt]s$/.test(spec)) return next(spec + '.ts', ctx); throw e; }
}`));
const { PEDIDOS_DE_FOTO } = await import('../../src/lib/studio/pastas.ts');

carregarSegredos();
exigir('CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN');
const arg = (n, p) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : p; };
const MAX = arg('--max', 999), PASSOS = arg('--passos', 8);
const PASTA = 'public/studio/fotos';
const ESTILO = 'ultra realistic advertising photography, high detail, sharp focus, professional lighting. No text, no letters, no words, no numbers, no logo, no brand, no watermark';

async function gerar(prompt) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: `${prompt}. ${ESTILO}`, steps: PASSOS }), signal: AbortSignal.timeout(120_000),
  });
  const j = await r.json().catch(() => ({}));
  if (j?.result?.image) return Buffer.from(j.result.image, 'base64');
  const msg = JSON.stringify(j?.errors ?? j).slice(0, 200);
  if (r.status === 429 || /neuron|quota|allocation|limit/i.test(msg)) throw Object.assign(new Error('cota'), { cota: true });
  throw new Error(`${r.status} ${msg}`);
}

fs.mkdirSync(PASTA, { recursive: true });
const faltam = PEDIDOS_DE_FOTO.filter((p) => !fs.existsSync(path.join(PASTA, p.foto + '.webp')));
console.log(`fotos: ${PEDIDOS_DE_FOTO.length} pedidas, ${faltam.length} faltando`);
let feitas = 0, parouPorCota = false;
for (const p of faltam.slice(0, MAX)) {
  try {
    const jpg = await gerar(p.prompt);
    await sharp(jpg).resize(1024, 1024, { fit: 'cover' }).webp({ quality: 84 }).toFile(path.join(PASTA, p.foto + '.webp'));
    feitas++; console.log('ok', p.foto);
  } catch (e) {
    if (e.cota) { parouPorCota = true; console.log('COTA do dia acabou — rode de novo depois das 21h (horário de Brasília)'); break; }
    console.log('FALHOU', p.foto, e.message);
  }
}
const prontas = PEDIDOS_DE_FOTO.map((p) => p.foto).filter((f) => fs.existsSync(path.join(PASTA, f + '.webp')));
fs.writeFileSync('src/lib/studio/fotos-prontas.ts', `// Gerado por scripts/studio/gerar-fotos-pastas.mjs: fotos das variações que já existem em public/studio/fotos.
// Variação sem foto pronta não aparece na pasta (nunca mostra modelo quebrado).
export const FOTOS_PRONTAS = new Set<string>([
${prontas.map((f) => `  '${f}',`).join('\n')}
]);
`);
console.log(`geradas agora: ${feitas}; prontas: ${prontas.length}/${PEDIDOS_DE_FOTO.length}${parouPorCota ? ' (parou pela cota)' : ''}`);
process.exitCode = prontas.length === PEDIDOS_DE_FOTO.length ? 0 : 3;
