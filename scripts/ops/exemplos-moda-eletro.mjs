/**
 * F-287 — EXEMPLOS DE MODA E ELETRÔNICOS com produtos REAIS das lojas oficiais (Malwee, Olympikus, Multilaser): escolhe 1 item por
 * padrão, limpa o nome (sem tamanho/código), copia para ../marcas-v3/_exemplos e grava a lista que vai para segmentosDeOferta.ts.
 *   node scripts/ops/exemplos-moda-eletro.mjs    → depois: marca-conferir-ia.mjs ../marcas-v3/_exemplos e marca-gravar-grupo.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const V3 = path.resolve(import.meta.dirname, '../../../marcas-v3');
const ESCOLHAS = [
  ['malwee', 'Malwee', /^Camiseta Básica Feminina Slim/i, 'moda'], ['malwee', 'Malwee', /^Blusa Feminina Box Larga/i, 'moda'],
  ['malwee', 'Malwee', /^Regata Básica Feminina/i, 'moda'], ['malwee', 'Malwee', /^Vestido Infantil/i, 'moda'],
  ['malwee', 'Malwee', /^Bermuda Infantil Menino/i, 'moda'], ['olympikus', 'Olympikus', /^Tênis Olympikus Corre Max \d+ Preto/i, 'moda'],
  ['olympikus', 'Olympikus', /^Tênis Olympikus Corre 5 \d+ Branco/i, 'moda'], ['olympikus', 'Olympikus', /^Tênis Olympikus Neblina Feminino/i, 'moda'],
  ['multilaser', 'Multilaser', /^Smart TV/i, 'eletronicos'], ['multilaser', 'Multilaser', /^Fritadeira Elétrica Air Fryer/i, 'eletronicos'],
  ['multilaser', 'Multilaser', /^Fone/i, 'eletronicos'], ['multilaser', 'Multilaser', /Caixa de Som/i, 'eletronicos'],
  ['multilaser', 'Multilaser', /^Controle Gamer/i, 'eletronicos'], ['multilaser', 'Multilaser', /^(Mouse|Teclado)/i, 'eletronicos'],
  ['multilaser', 'Multilaser', /^(Carregador|Power Bank|Cabo)/i, 'eletronicos'], ['multilaser', 'Multilaser', /^Pipoqueira/i, 'eletronicos'],
];
/** sem tamanho ("- G", "34"), sem código ("- GO304 GO304") e sem "[Reembalado]" */
const limpar = (t) => t.replace(/\[Reembalado\]/gi, '').replace(/\s+-\s+[A-Z0-9]{2,}\d[A-Z0-9]*(\s+[A-Z0-9]+)?\s*$/, '').replace(/\s+-\s+(PP|P|M|G|GG|XG|U|\d{1,2})\s*$/i, '')
  .replace(/^(Tênis Olympikus [A-Za-zÀ-ú]+(?: \d| Max| Feminino)?) \d{2} /, '$1 ').replace(/\s+/g, ' ').trim();
const destino = path.join(V3, '_exemplos');
fs.mkdirSync(path.join(destino, 'oficial'), { recursive: true });
const saida = [], usados = new Set();
for (const [pasta, marca, re, seg] of ESCOLHAS) {
  const prontos = JSON.parse(fs.readFileSync(path.join(V3, pasta, 'prontos.json'), 'utf8'));
  const x = prontos.find((p) => re.test(p.titulo) && !/kit|combo|reembalado/i.test(p.titulo) && !usados.has(p.slug));
  if (!x) { console.log('sem item para', re); continue; }
  usados.add(x.slug);
  fs.copyFileSync(path.join(V3, pasta, 'oficial', x.arq), path.join(destino, 'oficial', x.arq));
  if (fs.existsSync(path.join(V3, pasta, 'pronto', x.final))) { fs.mkdirSync(path.join(destino, 'pronto'), { recursive: true }); fs.copyFileSync(path.join(V3, pasta, 'pronto', x.final), path.join(destino, 'pronto', x.final)); }
  saida.push({ ...x, titulo: limpar(x.titulo), marca_certa: marca, segmento: seg, credito: `Imagem oficial ${marca}` });
  console.log(`${seg.padEnd(12)} ${limpar(x.titulo)}`);
}
fs.writeFileSync(path.join(destino, 'prontos.json'), JSON.stringify(saida, null, 1));
console.log('itens', saida.length);
