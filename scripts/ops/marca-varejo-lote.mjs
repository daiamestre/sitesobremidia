/**
 * Missão do catálogo (F-275) — processa em lote o que marca-varejo.mjs trouxe (lista/varejo.jsonl):
 *   node scripts/ops/marca-varejo-lote.mjs <pasta marcas> [--fase=recortar|filtrar|gravar|tudo]
 *   recortar → marca-recortar-local.mjs em cada marca (fotos só no PC, recorte e inspeção iguais aos do site, sem cota)
 *   filtrar  → foto GENÉRICA da loja (a mesma imagem em 3+ produtos diferentes, ex.: "imagem indisponível", "venda sob
 *              prescrição") vai para recusados.txt; folhas de conferência (marca-conferir.mjs) para a amostra visual
 *   gravar   → marca-oficial.mjs gravar, uma marca por vez (a API do Supabase recusa pedidos em paralelo), POR LINK
 * Marca já gravada ganha <pasta>/gravado.txt e não é gravada de novo.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const marcas = args.find((a) => !a.startsWith('--'));
if (!marcas) { console.log('uso: <pasta marcas> [--fase=recortar|filtrar|gravar|tudo]'); process.exit(1); }
const fase = (args.find((a) => a.startsWith('--fase=')) ?? '--fase=tudo').slice(7);
const ler = (f, d = []) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const rodar = (a) => { const r = spawnSync(process.execPath, a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); return `${r.stdout}${r.stderr}`.trim(); };

const registro = fs.readFileSync(path.join(marcas, 'lista', 'varejo.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const porPasta = new Map();
for (const x of registro) if (x.itens > 0 && fs.existsSync(path.join(x.pasta, 'com-fundo.json'))) porPasta.set(x.pasta, x);
const pastas = [...porPasta.values()];

if (fase === 'recortar' || fase === 'tudo') {
  for (const x of pastas) {
    if (fs.existsSync(path.join(x.pasta, 'prontos.json'))) continue;
    const r = rodar(['scripts/ops/marca-recortar-local.mjs', x.pasta]).split('\n').pop();
    console.log(`${x.marca.slice(0, 26).padEnd(27)} ${r.replace(/^RESULTADO /, '').slice(0, 120)}`);
  }
}

if (fase === 'filtrar' || fase === 'tudo') {
  const usos = new Map(); // hash da foto → nomes diferentes que a usam
  const itens = [];
  for (const x of pastas) for (const p of ler(path.join(x.pasta, 'prontos.json'))) {
    const f = path.join(x.pasta, 'oficial', p.arq);
    if (!fs.existsSync(f)) continue;
    const h = crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
    itens.push({ pasta: x.pasta, slug: p.slug, h });
    const s = usos.get(h) ?? new Set();
    s.add(String(p.titulo).toLowerCase().replace(/\d+\s*(ml|l|g|kg|un|comprimidos?|capsulas?)\b/g, '').replace(/\s+/g, ' ').trim());
    usos.set(h, s);
  }
  const genericas = new Set([...usos].filter(([, s]) => s.size >= 3).map(([h]) => h));
  const fora = new Map();
  for (const it of itens) if (genericas.has(it.h)) fora.set(it.pasta, [...(fora.get(it.pasta) ?? []), it.slug]);
  for (const [pasta, slugs] of fora) {
    const arq = path.join(pasta, 'recusados.txt');
    const ja = new Set(fs.existsSync(arq) ? fs.readFileSync(arq, 'utf8').split(/\s+/).filter(Boolean) : []);
    slugs.forEach((s) => ja.add(s));
    fs.writeFileSync(arq, [...ja].join('\n'));
  }
  console.log(`fotos genéricas: ${genericas.size} imagens em ${[...fora.values()].flat().length} produtos (recusados)`);
  // folhas de conferência só quando pedidas (node scripts/ops/marca-conferir.mjs <pasta>): milhares de folhas lotam o disco do PC
}

if (fase === 'gravar' || fase === 'tudo') {
  let total = 0;
  for (const x of pastas) {
    const marca = x.marca;
    if (fs.existsSync(path.join(x.pasta, 'gravado.txt')) || !ler(path.join(x.pasta, 'prontos.json')).length) continue;
    // F-276: só entra no catálogo o que passou na CONFERÊNCIA DUPLA com a IA (marca-conferir-ia.mjs)
    if (!fs.existsSync(path.join(x.pasta, 'conferencia-ia.json'))) continue;
    const saida = rodar(['scripts/ops/marca-oficial.mjs', 'gravar', x.pasta, marca]);
    const n = Number(/produtos gravados (\d+)/.exec(saida)?.[1] ?? 0);
    total += n;
    if (n > 0) fs.writeFileSync(path.join(x.pasta, 'gravado.txt'), `${n} ${new Date().toISOString()}`);
    console.log(`${marca.slice(0, 26).padEnd(27)} gravados ${n}${n ? '' : ` | ${saida.split('\n').slice(-2).join(' · ').slice(0, 120)}`}`);
  }
  console.log('TOTAL gravados', total);
}
