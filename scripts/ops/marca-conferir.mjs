/**
 * Missão do catálogo: monta as folhas de conferência de uma marca já preparada, sobre magenta, em tamanho que mostra os defeitos.
 *   node scripts/ops/marca-conferir.mjs <pasta da marca>     grava <pasta>/rev0.png, rev1.png...
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const d = process.argv[2];
const it = JSON.parse(fs.readFileSync(`${d}/prontos.json`, 'utf8'));
const T = 300, N = 6, L = 4;
let pag = 0;
for (let k = 0; k < it.length; k += N * L, pag++) {
  const c = [];
  for (let j = 0; j < Math.min(N * L, it.length - k); j++) {
    const b = await sharp(`${d}/pronto/${it[k + j].final}`).resize({ width: T - 8, height: T - 8, fit: 'inside' }).png().toBuffer();
    const s = Buffer.from(`<svg width="46" height="22"><rect width="46" height="22" fill="#000"/><text x="4" y="17" font-size="16" fill="#fff" font-family="Arial">${k + j}</text></svg>`);
    const X = (j % N) * T, Y = Math.floor(j / N) * T;
    c.push({ input: b, left: X + 4, top: Y + 4 }, { input: s, left: X, top: Y });
  }
  await sharp({ create: { width: N * T, height: L * T, channels: 3, background: '#ff2bd6' } }).composite(c).png().toFile(`${d}/rev${pag}.png`);
}
console.log(it.length, 'imagens', pag, 'folhas');
