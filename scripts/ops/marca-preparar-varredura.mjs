/**
 * Missão do catálogo (F-274): prepara para conferência tudo o que a varredura (marca-varredura.mjs) trouxe e ainda não foi
 * preparado: sobras transparentes cortadas (marca-oficial preparar), filtro de caixa branca, recorte das fotos com fundo pelo
 * passa-foto com inspeção (marca-recortar-link) e folhas de conferência (marca-conferir). Fotos só no PC.
 *   node scripts/ops/marca-preparar-varredura.mjs <pasta marcas>
 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const marcas = process.argv[2];
if (!marcas) { console.log('uso: <pasta marcas>'); process.exit(1); }
const reg = `${marcas}/lista/varredura.jsonl`;
const linhas = fs.readFileSync(reg, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rodar = (a) => { const r = spawnSync(process.execPath, a, { encoding: 'utf8' }); return `${r.stdout}${r.stderr}`.trim().split('\n').pop() ?? ''; };
const ler = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : []);
const vistos = new Set();
for (const x of linhas) {
  if (vistos.has(x.pasta)) continue;
  vistos.add(x.pasta);
  if (fs.existsSync(`${x.pasta}/prontos.json`)) continue;
  const semFundo = ler(`${x.pasta}/produtos.json`), comFundo = ler(`${x.pasta}/com-fundo.json`);
  if (!semFundo.length && !comFundo.length) continue;
  const marca = x.marca || x.dominio;
  if (semFundo.length) { rodar(['scripts/ops/marca-oficial.mjs', 'preparar', x.pasta, marca]); rodar(['scripts/ops/marca-filtro.mjs', x.pasta]); }
  else fs.writeFileSync(`${x.pasta}/prontos.json`, '[]');
  const rec = comFundo.length ? rodar(['scripts/ops/marca-recortar-link.mjs', x.pasta]) : '';
  rodar(['scripts/ops/marca-conferir.mjs', x.pasta]);
  const n = ler(`${x.pasta}/prontos.json`).length;
  console.log(`${x.dominio.padEnd(30)} ${marca.slice(0, 18).padEnd(19)} prontos ${String(n).padStart(4)} | sem fundo ${semFundo.length} | com fundo ${comFundo.length} ${rec.replace(/^RESULTADO /, '| ').slice(0, 110)}`);
}
console.log('FIM');
