/**
 * Missão do catálogo: procura o site oficial das marcas da lista que ainda não têm endereço, tentando <marca>.com.br e <marca>.com.
 * Só aceita a página cujo título ou descrição cita a marca. Lê só a página inicial e o robots.txt; não baixa imagem.
 *   node scripts/ops/marca-descobrir-sites.mjs <pasta marcas>     grava <pasta>/lista/sites-novos.json, na ordem de prioridade
 * Conferir a lista antes de rodar o lote: um domínio com o nome da marca pode ser de outra empresa.
 */
import fs from 'node:fs';

const marcas = process.argv[2];
if (!marcas) { console.log('uso: <pasta marcas>'); process.exit(1); }
const UA = { 'User-Agent': 'SobreMidia-Catalogo/1.0 (contato@sobremidia.com.br)' };
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const FORA = /apost|cassino|casino|bet\b|slot|agencia de viagens|hospedagem|dominio a venda|domain for sale|buy this domain|parked/i;
const todas = JSON.parse(fs.readFileSync(`${marcas}/lista/consolidado.json`, 'utf8'));
const conhecidos = new Set(JSON.parse(fs.readFileSync(`${marcas}/lista/sites.json`, 'utf8')).map((s) => s.dominio));
const por = new Map();
for (const x of todas) {
  if (x.status !== 'pesquisar' || x.site) continue;
  const k = norm(x.marca).replace(/[^a-z0-9]+/g, '');
  if (k.length < 3) continue;
  const a = por.get(k) ?? { k, marcas: new Set(), segmentos: new Set(), pe: 9, not: 9, ok: false };
  a.marcas.add(x.marca); a.segmentos.add(x.segmento);
  a.pe = Math.min(a.pe, x.prioridade_pe ?? 9);
  a.not = Math.min(a.not, { alta: 1, media: 2, regional: 3 }[x.notoriedade] ?? 4);
  a.ok ||= x.confirmado;
  por.set(k, a);
}
// marca regional só com o nome, de tabela fiscal, fica de fora: o domínio quase sempre é de outro negócio
const fila = [...por.values()].filter((a) => a.pe < 9 || a.not <= 2 || a.ok).sort((a, b) => a.pe - b.pe || a.not - b.not);
console.log('marcas sem site para testar', fila.length);
const saida = [];
const achar = async (a) => {
  const nome = norm([...a.marcas][0]);
  for (const dom of [`${a.k}.com.br`, `${a.k}.com`]) {
    if (conhecidos.has(dom)) return;
    const r = await fetch(`https://www.${dom}/`, { headers: UA, signal: AbortSignal.timeout(12000) }).catch(() => null);
    if (!r?.ok) continue;
    const h = await r.text().catch(() => '');
    const cab = norm(`${h.match(/<title[^>]*>([^<]*)/i)?.[1] ?? ''} ${h.match(/<meta[^>]+description[^>]+content="([^"]*)"/i)?.[1] ?? ''}`);
    if (FORA.test(cab) || !cab.replace(/[^a-z0-9]+/g, '').includes(a.k)) continue;
    saida.push({ dominio: new URL(r.url).hostname.replace(/^www\./, ''), site: r.url, marcas: [...a.marcas], segmentos: [...a.segmentos], pe: a.pe, notoriedade: a.not, titulo: cab.slice(0, 90) });
    console.log(dom.padEnd(30), 'pe', a.pe, cab.slice(0, 60));
    return;
  }
};
let i = 0;
await Promise.all(Array.from({ length: 6 }, async () => { while (i < fila.length) await achar(fila[i++]); }));
fs.writeFileSync(`${marcas}/lista/sites-novos.json`, JSON.stringify(saida.sort((a, b) => a.pe - b.pe || a.notoriedade - b.notoriedade), null, 1));
console.log('FIM encontrados', saida.length);
