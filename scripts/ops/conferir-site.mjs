/**
 * Confere se um texto/código novo já está no site em produção (varre todos os arquivos JS, inclusive os carregados
 * sob demanda).  node scripts/ops/conferir-site.mjs "texto1" "texto2" ...
 */
const base = 'https://sitesobremidia.vercel.app';
const alvos = process.argv.slice(2);
if (!alvos.length) { console.error('uso: node scripts/ops/conferir-site.mjs "texto" ...'); process.exit(2); }
const vistos = new Set(); const fila = []; const achados = Object.fromEntries(alvos.map((a) => [a, 0]));
const html = await (await fetch(base + '/')).text();
for (const m of html.matchAll(/\/assets\/[^"']+\.js/g)) fila.push(m[0]);
while (fila.length) {
  const u = fila.shift(); if (vistos.has(u)) continue; vistos.add(u);
  const t = await (await fetch(base + u)).text();
  for (const a of alvos) if (t.includes(a)) achados[a]++;
  for (const m of t.matchAll(/(?:\/assets\/|\.\/|")([A-Za-z0-9_.-]+-[A-Za-z0-9_-]{6,}\.js)/g)) fila.push('/assets/' + m[1]);
}
console.log(`arquivos varridos: ${vistos.size}`);
for (const [a, n] of Object.entries(achados)) console.log(`${n ? 'NO AR ' : 'AUSENTE'} ${a} (${n})`);
process.exitCode = Object.values(achados).every((n) => n > 0) ? 0 : 1;
