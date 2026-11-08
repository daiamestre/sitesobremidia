// Lê a saída de `scripts/ops/sql.mjs` de um teste que termina com `raise exception 'RESULTADO ...'` (transação desfeita)
// e imprime só as linhas do resultado, com o placar de OK e FALHA. Sai com código 1 se houver FALHA ou se não achar RESULTADO.
//   node scripts/ops/sql.mjs @scripts/ops/teste-pareamento.sql 2>&1 | node scripts/ops/resultado-sql.mjs
let entrada = '';
process.stdin.on('data', (d) => { entrada += d; });
process.stdin.on('end', () => {
  let texto = entrada;
  const json = entrada.indexOf('{');
  if (json >= 0) {
    try { texto = JSON.parse(entrada.slice(json, entrada.lastIndexOf('}') + 1)).message ?? entrada; } catch { /* texto cru */ }
  }
  const i = texto.indexOf('RESULTADO');
  if (i < 0) { console.log('SEM RESULTADO — o teste não chegou ao fim:\n' + texto.slice(0, 1500)); process.exit(1); }
  const linhas = texto.slice(i + 'RESULTADO'.length).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('CONTEXT:'));
  for (const l of linhas) console.log(l);
  const ok = linhas.filter((l) => l.startsWith('OK')).length;
  const falha = linhas.filter((l) => l.startsWith('FALHA')).length;
  console.log(`\nPLACAR: ${ok} OK · ${falha} FALHA`);
  process.exit(falha ? 1 : 0);
});
