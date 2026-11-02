/**
 * Missão do catálogo: reprova sozinha, em <pasta>/prontos.json, a imagem que diz ser sem fundo mas traz uma caixa branca em volta do
 * produto. O reprovado vai para <pasta>/recusados.txt.
 *   node scripts/ops/marca-filtro.mjs <pasta da marca>
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const d = process.argv[2];
const it = JSON.parse(fs.readFileSync(`${d}/prontos.json`, 'utf8'));
const fora = [];
for (const p of it) {
  const { data, info } = await sharp(`${d}/pronto/${p.final}`).ensureAlpha().resize({ width: 400, height: 400, fit: 'inside', kernel: 'nearest' }).raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  let borda = 0, branca = 0;
  const olha = (x, y) => { const i = (y * w + x) * 4; borda++; if (data[i + 3] > 240 && data[i] > 244 && data[i + 1] > 244 && data[i + 2] > 244) branca++; };
  for (let x = 0; x < w; x++) { olha(x, 0); olha(x, h - 1); }
  for (let y = 0; y < h; y++) { olha(0, y); olha(w - 1, y); }
  const motivo = branca / borda > 0.6 ? 'caixa branca' : '';
  if (motivo) { fora.push(p.slug); console.log(motivo, p.slug.slice(0, 50)); }
}
if (fora.length) fs.appendFileSync(`${d}/recusados.txt`, `${fora.join('\n')}\n`);
console.log('reprovadas', fora.length, 'de', it.length);
