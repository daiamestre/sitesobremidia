/**
 * Missão do catálogo, Fase 1: lê o arquivo público do Open Food Facts direto da fonte, sem guardar o arquivo inteiro,
 * e separa os produtos vendidos no Brasil que têm foto.
 *   node scripts/ops/inventario-open-facts.mjs <pasta>     grava <pasta>/off-brasil.jsonl
 * Cada linha: { codigo, nome, marca, quantidade, categorias, foto }. Dados ODbL; fotos CC BY-SA (https://world.openfoodfacts.org/data).
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { Readable } from 'node:stream';

const pasta = process.argv[2];
if (!pasta) { console.log('uso: node scripts/ops/inventario-open-facts.mjs <pasta>'); process.exit(1); }
const URL_DUMP = 'https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz';
const r = await fetch(URL_DUMP, { headers: { 'User-Agent': 'SobreMidia-Tabloide/1.0 (contato@sobremidia.com.br)' } });
if (!r.ok) throw new Error(`arquivo HTTP ${r.status}`);
console.log('tamanho', Math.round(Number(r.headers.get('content-length') ?? 0) / 1e6), 'MB');
const linhas = readline.createInterface({ input: Readable.fromWeb(r.body).pipe(zlib.createGunzip()), crlfDelay: Infinity });
const saida = fs.createWriteStream(`${pasta}/off-brasil.jsonl`);
let col = null, lidas = 0, brasil = 0, comFoto = 0;
for await (const l of linhas) {
  const c = l.split('\t');
  if (!col) { col = Object.fromEntries(c.map((n, i) => [n, i])); continue; }
  lidas++;
  if (lidas % 500000 === 0) console.log('lidas', lidas, 'brasil', brasil, 'com foto', comFoto);
  if (!/en:brazil/.test(c[col.countries_tags] ?? '')) continue;
  brasil++;
  const foto = c[col.image_url] ?? '';
  if (!foto) continue;
  comFoto++;
  saida.write(`${JSON.stringify({ codigo: c[col.code], nome: c[col.product_name] ?? '', marca: c[col.brands] ?? '', quantidade: c[col.quantity] ?? '', categorias: c[col.categories_tags] ?? '', foto })}\n`);
}
saida.end();
console.log('FIM lidas', lidas, 'brasil', brasil, 'com foto', comFoto);
