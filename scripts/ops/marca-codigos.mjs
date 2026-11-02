/**
 * Missão do catálogo: liga os produtos oficiais de uma marca a códigos de barras das bases abertas.
 *   node scripts/ops/marca-codigos.mjs <pasta da marca> <marca>
 * Só aceita casamento exato de nome, sabor e peso, com um único código possível: código errado mostra o produto errado no leitor.
 */
import fs from 'node:fs';
const [d, marca] = process.argv.slice(2);
const marcaNorm = String(marca ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const UA = { 'User-Agent': 'SobreMidia-Catalogo/1.0 (contato@sobremidia.com.br)' };
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const achar = async () => {
  const todos = new Map();
  for (const base of [`https://world.openfoodfacts.org/api/v2/search?brands_tags=${marcaNorm}`]) {
    for (let p = 1; p <= 6; p++) {
      const r = await fetch(`${base}&fields=code,product_name,product_name_pt,quantity,brands&page_size=100&page=${p}`, { headers: UA, signal: AbortSignal.timeout(30000) }).catch(() => null);
      const j = r?.ok ? await r.json().catch(() => null) : null;
      if (!j?.products?.length) break;
      for (const x of j.products) if (/^\d{13}$/.test(x.code ?? '')) todos.set(x.code, x);
      await new Promise((o) => setTimeout(o, 1500));
    }
  }
  return [...todos.values()];
};
const base = await achar();
for (const l of fs.readFileSync(`${d}/../../recortes-F-253/off-brasil.jsonl`, 'utf8').split('\n').filter(Boolean)) { const p = JSON.parse(l); if (norm(`${p.marca} ${p.nome}`).includes(marcaNorm) && !base.some((b) => b.code === p.codigo)) base.push({ code: p.codigo, product_name: p.nome, quantity: p.quantidade }); }
console.log('códigos encontrados', base.length);
const peso = (t) => { const m = norm(t).replace(/,/g, '.').match(/(\d+(?:\.\d+)?)\s*(kg|g|gr)\b/); return m ? (m[2] === 'kg' ? Number(m[1]) * 1000 : Number(m[1])) : null; };
const VAZIAS = new Set([marcaNorm, 'biscoito', 'de', 'com', 'sabor', 'e', 'o', 'a', 'em', 'tipo', 'pacote', 'macarrao', 'massa']);
const tokens = (t) => norm(t).replace(/\d+(?:[.,]\d+)?\s*(kg|gr|g)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').split(' ').filter((x) => x.length > 1 && !VAZIAS.has(x));
const it = JSON.parse(fs.readFileSync(`${d}/produtos.json`, 'utf8'));
let n = 0;
for (const p of it) {
  const pesoP = peso(p.slug.replace(/-(\d+)-(\d)g$/, '-$1.$2g').replace(/-/g, ' ')) ?? peso(p.titulo);
  p.peso = pesoP;
  const tp = new Set(tokens(`${p.titulo}`));
  const cand = base.filter((b) => {
    const tb = new Set(tokens(`${b.product_name_pt || b.product_name} ${b.quantity ?? ''}`));
    if (!tb.size || !tp.size) return false;
    if (![...tp].every((x) => tb.has(x)) || ![...tb].every((x) => tp.has(x))) return false;
    const pb = peso(`${b.product_name_pt || b.product_name} ${b.quantity ?? ''}`);
    return pesoP != null && pb != null && Math.abs(pesoP - pb) < 0.6;
  });
  const cods = [...new Set(cand.map((c) => c.code))];
  if (cods.length === 1) { p.codigo = cods[0]; n++; console.log(p.codigo, p.titulo, pesoP); }
}
fs.writeFileSync(`${d}/produtos.json`, JSON.stringify(it, null, 1));
fs.writeFileSync(`${d}/codigos-da-marca.json`, JSON.stringify(base.map((b) => ({ codigo: b.code, nome: b.product_name_pt || b.product_name, quantidade: b.quantity })), null, 1));
console.log('produtos com código seguro', n, 'de', it.length, '| sem peso no site', it.filter((x) => x.peso == null).length);
