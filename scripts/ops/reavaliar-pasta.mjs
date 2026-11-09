/**
 * F-287 — reavalia as fotos RECUSADAS de uma pasta (ex.: tênis com sombra no chão) pelo avaliar do hortifrúti: recorte + IA e, sem
 * fundo liso, o recorte da própria IA com inspeção. Aprovada sai de recusados.txt e ganha o link novo (s=1 + caixa).
 *   node scripts/ops/reavaliar-pasta.mjs <pasta>
 */
import fs from 'node:fs';
import path from 'node:path';
import { avaliar } from './hortifruti-fotos.mjs';
import { linkDaFoto } from './passa-foto.mjs';

const pasta = process.argv[2];
const prontos = JSON.parse(fs.readFileSync(path.join(pasta, 'prontos.json'), 'utf8'));
const arqR = path.join(pasta, 'recusados.txt');
const fora = new Set(fs.existsSync(arqR) ? fs.readFileSync(arqR, 'utf8').split(/\s+/).filter(Boolean) : []);
let ok = 0;
for (const p of prontos) {
  if (!fora.has(p.slug)) continue;
  const a = await avaliar(fs.readFileSync(path.join(pasta, 'oficial', p.arq))).catch((e) => ({ motivo: String(e?.message ?? e) }));
  if (!a.ok) { console.log('continua fora:', p.titulo.slice(0, 50), '|', a.motivo); continue; }
  p.link = linkDaFoto(p.url, a.caixa, true);
  fs.mkdirSync(path.join(pasta, 'pronto'), { recursive: true });
  fs.writeFileSync(path.join(pasta, 'pronto', p.final), a.previa);
  fora.delete(p.slug); ok++;
  console.log('aprovada:', p.titulo.slice(0, 50), `(${a.via})`);
}
fs.writeFileSync(path.join(pasta, 'prontos.json'), JSON.stringify(prontos, null, 1));
fs.writeFileSync(arqR, [...fora].join('\n'));
console.log('RESULTADO reaprovadas', ok);
