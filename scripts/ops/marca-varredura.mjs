/**
 * Missão do catálogo (F-274) — VARREDURA RÁPIDA de muitas marcas de uma vez.
 *   node scripts/ops/marca-varredura.mjs <arquivo dominio|Marca por linha> <pasta marcas> [paralelos=4]
 * Para cada site: 1) marca-loja.mjs (catálogo estruturado da loja oficial: nome exato, peso, EAN); 2) se o site não tem loja,
 * marca-site.mjs (página por página). Site já registrado em <pasta marcas>/lista/varredura.jsonl não roda de novo.
 * Depois: marca-oficial preparar + marca-recortar-link + marca-conferir, conferência a olho e gravação por link.
 */
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const [arquivo, marcas, paralelos = '4'] = process.argv.slice(2);
if (!arquivo || !marcas) { console.log('uso: <arquivo dominio|Marca> <pasta marcas> [paralelos]'); process.exit(1); }
const reg = `${marcas}/lista/varredura.jsonl`;
const feitos = new Set(fs.existsSync(reg) ? fs.readFileSync(reg, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).dominio) : []);
const fila = fs.readFileSync(arquivo, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => l.split('|')).filter(([d]) => !feitos.has(d));
const LIMITE_MS = 25 * 60 * 1000;
const rodar = (args) => new Promise((ok) => {
  const p = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let s = '';
  p.stdout.on('data', (d) => { s += d; });
  const t = setTimeout(() => { s += '\nRESULTADO tempo esgotado'; p.kill(); }, LIMITE_MS);
  p.on('close', () => { clearTimeout(t); ok(s.match(/RESULTADO .*/)?.[0] ?? 'RESULTADO sem saída'); });
});
const um = async ([dominio, marca]) => {
  const pasta = `${marcas}/${dominio.replace(/\.(com\.br|com|net\.br|ind\.br|coop\.br)$/, '').replace(/[^a-z0-9-]/gi, '-')}`;
  fs.mkdirSync(pasta, { recursive: true });
  let modo = 'loja', r = await rodar(['scripts/ops/marca-loja.mjs', dominio, pasta, marca ?? '']);
  if (/sem loja estruturada|site não abriu/.test(r)) { modo = 'site'; r = await rodar(['scripts/ops/marca-site.mjs', dominio, pasta]); }
  fs.appendFileSync(reg, `${JSON.stringify({ dominio, marca, pasta, modo, resultado: r, em: new Date().toISOString() })}\n`);
  console.log(`${dominio.padEnd(30)} ${modo.padEnd(5)} ${r.slice(10, 120)}`);
};
const trabalhador = async () => { while (fila.length) await um(fila.shift()); };
await Promise.all(Array.from({ length: Number(paralelos) }, trabalhador));
console.log('FIM');
