/**
 * Missão do catálogo: prepara para conferência toda marca do lote que trouxe imagem e ainda não foi preparada.
 *   node scripts/ops/marca-preparar-lote.mjs <pasta marcas>
 * Faz códigos, recorte de sobras, filtro de caixa branca, recusa do que tem lado maior abaixo de 350 px e folhas de conferência.
 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const marcas = process.argv[2];
if (!marcas) { console.log('uso: <pasta marcas>'); process.exit(1); }
const LADO_MIN = 350;
const sites = new Map(JSON.parse(fs.readFileSync(`${marcas}/lista/sites.json`, 'utf8')).map((s) => [s.dominio, s]));
const lote = fs.readFileSync(`${marcas}/lista/lote.jsonl`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rodar = (a) => spawnSync(process.execPath, a, { encoding: 'utf8' }).stdout ?? '';
for (const x of lote) {
  const n = Number(/sem fundo (\d+)/.exec(x.resultado)?.[1] ?? 0);
  if (!n || fs.existsSync(`${x.pasta}/prontos.json`)) continue;
  const s = sites.get(x.dominio);
  const marca = s.marcas[0], segmento = s.segmentos[0];
  const f = `${x.pasta}/produtos.json`;
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const p of j) { p.segmento = segmento; p.titulo = p.titulo.replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim(); }
  fs.writeFileSync(f, JSON.stringify(j, null, 1));
  const cod = rodar(['scripts/ops/marca-codigos.mjs', x.pasta, marca]).match(/código seguro (\d+)/)?.[1] ?? '?';
  rodar(['scripts/ops/marca-oficial.mjs', 'preparar', x.pasta, marca]);
  if (!fs.existsSync(`${x.pasta}/prontos.json`)) { console.log(x.dominio, 'falhou ao preparar'); continue; }
  const filtro = rodar(['scripts/ops/marca-filtro.mjs', x.pasta]).match(/reprovadas (\d+)/)?.[1] ?? '?';
  const pr = JSON.parse(fs.readFileSync(`${x.pasta}/prontos.json`, 'utf8'));
  const peq = pr.filter((p) => Math.max(p.W, p.H) < LADO_MIN).map((p) => p.slug);
  if (peq.length) fs.appendFileSync(`${x.pasta}/recusados.txt`, `${peq.join('\n')}\n`);
  rodar(['scripts/ops/marca-conferir.mjs', x.pasta]);
  console.log(x.pasta.replace(`${marcas}/`, '').padEnd(22), marca.slice(0, 18).padEnd(19), segmento.slice(0, 22).padEnd(23), 'imgs', pr.length, 'pequenas', peq.length, 'caixa', filtro, 'cód', cod);
}
console.log('FIM');
