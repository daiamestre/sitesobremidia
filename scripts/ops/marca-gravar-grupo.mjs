/**
 * Missão do catálogo (F-273): grava POR LINK um site de grupo com várias marcas (ex.: Ajinomoto → Sazón, Vono, MID).
 * Cada item de <pasta>/prontos.json que tem `marca_certa` é gravado com a sua própria marca (nome e crédito certos);
 * itens sem `marca_certa` usam a marca padrão. Recusados (recusados.txt) ficam de fora, como no marca-oficial.mjs.
 *   node scripts/ops/marca-gravar-grupo.mjs <pasta da marca> <Marca padrão>
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [pasta, padrao] = process.argv.slice(2);
if (!pasta || !padrao) { console.log('uso: <pasta da marca> <Marca padrão>'); process.exit(1); }
const fora = new Set(fs.existsSync(`${pasta}/recusados.txt`) ? fs.readFileSync(`${pasta}/recusados.txt`, 'utf8').split(/\s+/).filter(Boolean) : []);
const itens = JSON.parse(fs.readFileSync(`${pasta}/prontos.json`, 'utf8')).filter((p) => !fora.has(p.slug));
const grupos = new Map();
for (const p of itens) { const m = p.marca_certa || padrao; grupos.set(m, [...(grupos.get(m) ?? []), p]); }
let total = 0;
for (const [marca, lista] of grupos) {
  // pasta curta (o Windows recusa caminhos longos) com só os itens dessa marca
  const tmp = path.join(pasta, `_g${total}`);
  fs.mkdirSync(path.join(tmp, 'oficial'), { recursive: true });
  const copia = lista.map((p, i) => {
    const arq = `${i}${path.extname(p.arq) || '.png'}`;
    fs.copyFileSync(path.join(pasta, 'oficial', p.arq), path.join(tmp, 'oficial', arq));
    return { ...p, arq, url: String(p.url).replace(/^http:/, 'https:') };
  });
  fs.writeFileSync(path.join(tmp, 'prontos.json'), JSON.stringify(copia));
  fs.writeFileSync(path.join(tmp, 'produtos.json'), JSON.stringify(copia));
  const r = spawnSync(process.execPath, ['scripts/ops/marca-oficial.mjs', 'gravar', tmp, marca], { encoding: 'utf8' });
  const saida = `${r.stdout}${r.stderr}`.trim().split('\n');
  const n = Number(/produtos gravados (\d+)/.exec(saida.join('\n'))?.[1] ?? 0);
  total += n;
  console.log(marca.padEnd(16), `gravados ${n}/${lista.length}`, n < lista.length ? `| ${saida.filter((l) => /não abriu|Error/.test(l)).slice(0, 2).join(' · ')}` : '');
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log('TOTAL gravados', total);
