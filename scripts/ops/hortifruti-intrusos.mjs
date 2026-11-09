/**
 * F-291 — INTRUSOS NO HORTIFRÚTI: linhas do catálogo com nome de fruta/legume/verdura/ovos SEM marca (ehPedidoDeHortifruti) mas que
 * NÃO são do hortifrúti conferido (ex.: "Abacaxi" com foto de refrigerante, "Alface" com pacote de salada). O site já as ignora; aqui
 * elas são listadas e, com --apagar, removidas (só as de nenhum cliente; as do cliente são escolha dele).
 *   node scripts/ops/hortifruti-intrusos.mjs [--apagar]
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { sqlBruto } from './recorte-do-catalogo.mjs';

const require = createRequire(import.meta.url);
globalThis.localStorage ??= { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
const RAIZ = path.resolve(import.meta.dirname, '../..');
const jiti = require('jiti')(import.meta.filename, { alias: { '@': path.join(RAIZ, 'src') } });
const { ehPedidoDeHortifruti } = jiti('../../src/lib/tabloide/hortifruti.ts');

const linhas = await sqlBruto(`select id, nome, nome_norm, credito, imagem_url from public.tabloide_catalogo where cliente_id is null and coalesce(segmento,'') <> 'hortifruti' and length(nome) < 40`);
const intrusos = linhas.filter((l) => ehPedidoDeHortifruti(l.nome));
for (const l of intrusos) console.log(`${l.nome.padEnd(26)} | ${String(l.credito ?? '').slice(0, 45)} | ${decodeURIComponent(String(l.imagem_url).replace(/^.*u=/, '').replace(/&.*$/, '')).slice(-60)}`);
console.log('intrusos', intrusos.length);
if (process.argv.includes('--apagar') && intrusos.length) {
  const ids = intrusos.map((l) => `'${l.id}'`).join(',');
  await sqlBruto(`delete from public.tabloide_catalogo where id in (${ids})`);
  console.log('apagados', intrusos.length);
}
