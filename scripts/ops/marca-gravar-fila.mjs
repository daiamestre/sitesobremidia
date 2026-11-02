/**
 * Missão do catálogo: grava as marcas já conferidas que estão em <pasta marcas>/lista/fila.json, uma a uma.
 *   node scripts/ops/marca-gravar-fila.mjs <pasta marcas>
 * fila.json: [{ pasta, marca }]. Marca gravada sai da fila; se o banco recusar, para e o resto continua na fila.
 * Pode rodar de novo sem risco: a gravação substitui a linha da mesma marca e produto.
 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const marcas = process.argv[2];
if (!marcas) { console.log('uso: node scripts/ops/marca-gravar-fila.mjs <pasta marcas>'); process.exit(1); }
const arq = `${marcas}/lista/fila.json`;
let fila = JSON.parse(fs.readFileSync(arq, 'utf8'));
while (fila.length) {
  const { pasta, marca } = fila[0];
  const r = spawnSync(process.execPath, ['scripts/ops/marca-oficial.mjs', 'gravar', `${marcas}/${pasta}`, marca], { encoding: 'utf8' });
  const ok = /produtos gravados (\d+)/.exec(r.stdout ?? '');
  if (!ok) { console.log(`PAROU em ${marca}:`, (r.stderr || r.stdout || '').match(/Invalid access token|Error[^\n]*/)?.[0] ?? 'sem detalhe'); process.exit(1); }
  console.log(marca, ok[1]);
  fila = fila.slice(1);
  fs.writeFileSync(arq, JSON.stringify(fila, null, 1));
}
console.log('fila vazia');
