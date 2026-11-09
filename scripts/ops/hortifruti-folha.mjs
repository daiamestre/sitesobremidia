/**
 * F-291 — CONFERÊNCIA HUMANA do hortifrúti gravado: folhas com a foto e o NOME de cada produto (numerados), para achar foto de um
 * produto com nome de outro. Lê ../hortifruti/<produto>/escolhida.json + previa.png (o que o "gravar" grava).
 *   node scripts/ops/hortifruti-folha.mjs   → ../hortifruti/_conferencia-1.jpg, _conferencia-2.jpg… e _conferencia.json (número → pasta)
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SAIDA = path.resolve(import.meta.dirname, '../../..', 'hortifruti');
const recusados = new Set(fs.existsSync(path.join(SAIDA, 'recusados.txt')) ? fs.readFileSync(path.join(SAIDA, 'recusados.txt'), 'utf8').split(/\s+/).filter(Boolean) : []);
const itens = fs.readdirSync(SAIDA).filter((d) => !d.startsWith('_') && !recusados.has(d) && fs.existsSync(path.join(SAIDA, d, 'escolhida.json')) && fs.existsSync(path.join(SAIDA, d, 'previa.png'))).sort();
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const t = 190, col = 6, porFolha = 36;
const mapa = {};
for (let f = 0; f * porFolha < itens.length; f++) {
  const parte = itens.slice(f * porFolha, (f + 1) * porFolha);
  const comp = [];
  for (let i = 0; i < parte.length; i++) {
    const n = f * porFolha + i + 1;
    const d = parte[i];
    const j = JSON.parse(fs.readFileSync(path.join(SAIDA, d, 'escolhida.json'), 'utf8'));
    mapa[n] = d;
    const img = await sharp(path.join(SAIDA, d, 'previa.png')).resize(t - 10, t - 34, { fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' }).toBuffer();
    const rot = Buffer.from(`<svg width="${t}" height="26"><rect width="100%" height="100%" fill="#222"/><text x="4" y="18" font-size="13" fill="#fff" font-family="Arial">${n} ${esc(String(j.nome).slice(0, 24))}</text></svg>`);
    const x = (i % col) * t, y = Math.floor(i / col) * t;
    comp.push({ input: rot, left: x, top: y }, { input: img, left: x + 5, top: y + 28 });
  }
  await sharp({ create: { width: col * t, height: Math.ceil(parte.length / col) * t, channels: 3, background: '#ffffff' } }).composite(comp).jpeg({ quality: 78 }).toFile(path.join(SAIDA, `_conferencia-${f + 1}.jpg`));
}
fs.writeFileSync(path.join(SAIDA, '_conferencia.json'), JSON.stringify(mapa, null, 1));
console.log('itens', itens.length, 'folhas', Math.ceil(itens.length / porFolha));
