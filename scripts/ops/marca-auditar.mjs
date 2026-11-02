/**
 * Missão do catálogo: confere se a imagem de cada produto é mesmo a dele. Compara o nome do arquivo da imagem com o endereço e o
 * título da página: página de produto costuma mostrar produtos relacionados, e a maior imagem pode ser de outro produto.
 *   node scripts/ops/marca-auditar.mjs <pasta marcas>     grava <pasta marcas>/lista/auditoria.json
 */
import fs from 'node:fs';

const marcas = process.argv[2];
const norm = (s) => String(s ?? '').replace(/%[0-9a-f]{2}/gi, ' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const VAZIAS = new Set(['produto', 'produtos', 'img', 'imagem', 'image', 'foto', 'png', 'webp', 'mockup', 'site', 'novo', 'nova', 'scaled', 'copy', 'copia', 'final', 'web', 'de', 'da', 'do', 'com', 'e', 'para', 'sem', 'em', 'the', 'pack', 'embalagem', 'frente', 'front', 'capa']);
const palavras = (s) => norm(s).replace(/\d+(g|kg|ml|l)\b/g, ' ').split(/[^a-z]+/).filter((p) => p.length >= 3 && !VAZIAS.has(p));
const raiz = (p) => p.replace(/(es|s)$/, '').slice(0, 5);
const saida = [];
let total = 0;
for (const d of fs.readdirSync(marcas)) {
  const f = `${marcas}/${d}/prontos.json`;
  if (!fs.existsSync(f)) continue;
  const fora = new Set(fs.existsSync(`${marcas}/${d}/recusados.txt`) ? fs.readFileSync(`${marcas}/${d}/recusados.txt`, 'utf8').split(/\s+/) : []);
  const it = JSON.parse(fs.readFileSync(f, 'utf8')).filter((x) => !fora.has(x.slug));
  const marcaP = new Set(palavras(d).map(raiz));
  let suspeitos = 0, semNome = 0;
  const lista = [];
  for (const x of it) {
    const arq = norm((x.url ?? '').split('/').pop()).replace(/\.\w+(\?.*)?$/, '');
    const pArq = palavras(arq).map(raiz).filter((p) => !marcaP.has(p));
    const pPag = new Set([...palavras(x.slug), ...palavras(x.titulo)].map(raiz));
    if (!pArq.length) { semNome++; continue; } // arquivo sem nome útil: só a conferência a olho diz
    if (!pArq.some((p) => pPag.has(p))) { suspeitos++; lista.push({ slug: x.slug, titulo: x.titulo, arquivo: arq.slice(0, 60) }); }
  }
  total += it.length;
  if (it.length) saida.push({ pasta: d, produtos: it.length, suspeitos, semNome, lista });
}
fs.writeFileSync(`${marcas}/lista/auditoria.json`, JSON.stringify(saida, null, 1));
saida.sort((a, b) => b.suspeitos - a.suspeitos);
for (const s of saida.filter((x) => x.suspeitos || x.semNome > x.produtos / 2)) console.log(s.pasta.padEnd(24), 'produtos', String(s.produtos).padEnd(4), 'suspeitos', String(s.suspeitos).padEnd(4), 'sem nome', s.semNome);
console.log('TOTAL', total, 'suspeitos', saida.reduce((a, x) => a + x.suspeitos, 0), 'sem nome útil', saida.reduce((a, x) => a + x.semNome, 0));
