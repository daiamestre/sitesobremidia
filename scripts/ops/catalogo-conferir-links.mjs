/**
 * F-275 — CONFERE CADA FOTO OFICIAL do catálogo que é servida por link (passa-foto): abre? é imagem? veio transformada?
 *   node scripts/ops/catalogo-conferir-links.mjs            → relatório em ../backup-pesquisa-marcas/links-auditoria.json
 *   node scripts/ops/catalogo-conferir-links.mjs --tirar     → também tira do catálogo as linhas cujo link NÃO abre (404/502)
 * "original" = a Cloudflare não transformou (cota do mês): a foto abre, e o site tira o fundo no navegador (F-275).
 * Só lê os cabeçalhos (o corpo é descartado), 8 por vez.
 */
import fs from 'node:fs';
import path from 'node:path';
import { sqlBruto } from './recorte-do-catalogo.mjs';

const tirar = process.argv.includes('--tirar');
const SAIDA = path.resolve(import.meta.dirname, '../../../backup-pesquisa-marcas');
fs.mkdirSync(SAIDA, { recursive: true });
const linhas = await sqlBruto(`select distinct imagem_url from public.tabloide_catalogo where fonte = 'MARCA' and imagem_url like '%/foto?u=%'`);
const urls = linhas.map((l) => l.imagem_url);
const res = { total: urls.length, ok: 0, original: 0, quebrado: [], porMotivo: {} };
let i = 0;
const trabalhar = async () => {
  while (i < urls.length) {
    const u = urls[i++];
    let motivo = '';
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const r = await fetch(u, { signal: AbortSignal.timeout(45000) }).catch((e) => ({ status: `erro ${e?.name ?? ''}` }));
      try { await r.body?.cancel(); } catch { /* corpo descartado */ }
      const tipo = r.headers?.get?.('content-type') ?? '';
      if (r.status === 200 && /^image\//.test(tipo)) { motivo = r.headers.get('x-passa-foto') === 'original' ? 'original' : 'ok'; break; }
      motivo = `http ${r.status}`;
    }
    if (motivo === 'ok') res.ok++;
    else if (motivo === 'original') res.original++;
    else { res.quebrado.push({ url: u, motivo }); res.porMotivo[motivo] = (res.porMotivo[motivo] ?? 0) + 1; }
    if (i % 500 === 0) console.log(`${i}/${urls.length} ok ${res.ok} original ${res.original} quebrado ${res.quebrado.length}`);
  }
};
await Promise.all(Array.from({ length: 8 }, trabalhar));
fs.writeFileSync(path.join(SAIDA, 'links-auditoria.json'), JSON.stringify(res, null, 1));
console.log(`RESULTADO links ${res.total} | ok ${res.ok} | sem transformação (cota) ${res.original} | quebrados ${res.quebrado.length} ${JSON.stringify(res.porMotivo)}`);
if (tirar && res.quebrado.length) {
  const esc = (s) => String(s).replace(/'/g, "''");
  for (let k = 0; k < res.quebrado.length; k += 100) {
    const lote = res.quebrado.slice(k, k + 100).filter((q) => /http (404|410|502)/.test(q.motivo)).map((q) => `'${esc(q.url)}'`);
    if (lote.length) await sqlBruto(`delete from public.tabloide_catalogo where fonte = 'MARCA' and imagem_url in (${lote.join(',')})`);
  }
  console.log('linhas com link quebrado retiradas do catálogo');
}
