/**
 * Missão do catálogo: compara a primeira leitura das marcas com a releitura feita depois da correção do robô (F-258).
 *   node scripts/ops/marca-comparar.mjs <pasta marcas> <pasta releitura>     grava <pasta releitura>/lista/comparacao.json
 * "trocadas": a imagem do produto mudou; "sumiram": a releitura não achou imagem própria para o produto; "novas": produto que só veio agora.
 */
import fs from 'node:fs';

const [m, v] = process.argv.slice(2);
const nome = (u) => String(u ?? '').split('?')[0].split('/').pop().replace(/\.(png|webp)$/i, '').replace(/-\d+x\d+$/, '');
const saida = [];
for (const p of fs.readdirSync(v)) {
  const novo = `${v}/${p}/produtos.json`;
  const velho = `${m}/${p}/prontos.json`;
  if (p === 'lista' || !fs.existsSync(novo)) continue;
  const n = new Map(JSON.parse(fs.readFileSync(novo, 'utf8')).map((x) => [x.slug, x]));
  if (!fs.existsSync(velho)) { if (n.size) saida.push({ pasta: p, antes: 0, iguais: 0, trocadas: [], sumiram: [], novas: [...n.keys()] }); continue; }
  const fora = new Set(fs.existsSync(`${m}/${p}/recusados.txt`) ? fs.readFileSync(`${m}/${p}/recusados.txt`, 'utf8').split(/\s+/) : []);
  const a = JSON.parse(fs.readFileSync(velho, 'utf8'));
  const r = { pasta: p, antes: a.filter((x) => !fora.has(x.slug)).length, iguais: 0, trocadas: [], sumiram: [], novas: [] };
  for (const x of a) {
    if (fora.has(x.slug)) continue;
    const y = n.get(x.slug);
    if (!y) r.sumiram.push(x.slug);
    else if (nome(y.url) === nome(x.url)) r.iguais++;
    else r.trocadas.push({ slug: x.slug, titulo: x.titulo, de: nome(x.url), para: nome(y.url) });
  }
  const conhecidos = new Set(a.map((x) => x.slug));
  r.novas = [...n.keys()].filter((s) => !conhecidos.has(s));
  saida.push(r);
}
fs.writeFileSync(`${v}/lista/comparacao.json`, JSON.stringify(saida, null, 1));
saida.sort((a, b) => b.trocadas.length - a.trocadas.length || b.sumiram.length - a.sumiram.length);
for (const s of saida) console.log(s.pasta.padEnd(24), 'antes', String(s.antes).padEnd(4), 'iguais', String(s.iguais).padEnd(4), 'trocadas', String(s.trocadas.length).padEnd(4), 'sumiram', String(s.sumiram.length).padEnd(4), 'novas', s.novas.length);
const soma = (f) => saida.reduce((t, s) => t + f(s), 0);
console.log('TOTAL antes', soma((s) => s.antes), 'iguais', soma((s) => s.iguais), 'trocadas', soma((s) => s.trocadas.length), 'sumiram', soma((s) => s.sumiram.length), 'novas', soma((s) => s.novas.length));
