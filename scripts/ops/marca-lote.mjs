/**
 * Missão do catálogo: roda marca-site.mjs em vários sites, na ordem de prioridade de <pasta marcas>/lista/sites.json (Pernambuco primeiro).
 *   node scripts/ops/marca-lote.mjs <pasta marcas> <inicio> <quantos>
 * Grava <pasta marcas>/lista/lote.jsonl, uma linha por site. Site já registrado não roda de novo.
 */
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const [marcas, inicio = '0', quantos = '30'] = process.argv.slice(2);
if (!marcas) { console.log('uso: <pasta marcas> <inicio> <quantos>'); process.exit(1); }
// domínios errados ou com conteúdo estranho, vistos na pesquisa: não baixar
const FORA = new Set(['arcor.com.br', 'cacique.com.br', 'queensberry.com.br']);
const LIMITE_MS = 9 * 60 * 1000;
const sites = JSON.parse(fs.readFileSync(`${marcas}/lista/sites.json`, 'utf8')).slice(Number(inicio), Number(inicio) + Number(quantos));
const reg = `${marcas}/lista/lote.jsonl`;
const feitos = new Set(fs.existsSync(reg) ? fs.readFileSync(reg, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).dominio) : []);
const fila = sites.filter((s) => !feitos.has(s.dominio) && !FORA.has(s.dominio));
const rodar = (s) => new Promise((ok) => {
  const pasta = `${marcas}/${s.dominio.replace(/\.(com\.br|com|net\.br|ind\.br)$/, '').replace(/[^a-z0-9-]/g, '-')}`;
  fs.mkdirSync(pasta, { recursive: true });
  const p = spawn(process.execPath, ['scripts/ops/marca-site.mjs', s.dominio, pasta], { stdio: ['ignore', 'pipe', 'pipe'] });
  let texto = '';
  p.stdout.on('data', (d) => { texto += d; });
  const t = setTimeout(() => { texto += '\nRESULTADO tempo esgotado'; p.kill(); }, LIMITE_MS);
  p.on('close', () => {
    clearTimeout(t);
    const r = texto.match(/RESULTADO .*/)?.[0] ?? 'RESULTADO sem saída';
    fs.appendFileSync(reg, `${JSON.stringify({ dominio: s.dominio, marcas: s.marcas, pasta, resultado: r })}\n`);
    console.log(s.dominio.padEnd(30), r.slice(10, 80));
    ok();
  });
});
const trabalhador = async () => { while (fila.length) await rodar(fila.shift()); };
await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
console.log('FIM');
