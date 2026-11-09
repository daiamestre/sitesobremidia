/**
 * F-287 — HORTIFRÚTI QUE AS LOJAS NÃO TÊM EM BOA FOTO: procura nos bancos de imagens de uso comercial livre (Pexels e Pixabay) a foto
 * do produto ISOLADO em fundo branco (padrão de foto oficial), recorta e passa na mesma conferência (avaliar: recorte + IA + inspeção).
 * A melhor aprovada vira a escolhida do produto em ../hortifruti/<produto> (o "gravar" do hortifruti-fotos.mjs grava por link).
 * Chaves PEXELS_API_KEY e PIXABAY_API_KEY do cofre (~/.sobremidia-secrets/tokens.env); nunca são impressas.
 *   node scripts/ops/hortifruti-banco.mjs [--so=caju,figo]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { avaliar } from './hortifruti-fotos.mjs';
import { linkDaFoto } from './passa-foto.mjs';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const SAIDA = path.resolve(RAIZ, '..', 'hortifruti');
const cofre = fs.readFileSync(path.join(os.homedir(), '.sobremidia-secrets', 'tokens.env'), 'utf8');
const chave = (n) => (cofre.match(new RegExp(`^${n}=(.*)$`, 'm'))?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
const PEXELS = chave('PEXELS_API_KEY'), PIXABAY = chave('PIXABAY_API_KEY');

/** produto → busca em inglês (foto de produto isolado) */
export const BUSCAS = {
  'Uva Niágara': 'pink grapes bunch', 'Uva Crimson': 'red seedless grapes bunch', Caju: 'cashew apple fruit', Graviola: 'soursop fruit',
  Figo: 'fresh figs', 'Batata Doce': 'sweet potato', Maxixe: 'west indian gherkin', 'Alface Roxa': 'red leaf lettuce', 'Agrião': 'watercress bunch',
  'Couve Manteiga': 'collard greens', Salsa: 'parsley bunch', Cebolinha: 'green onions bunch', Coentro: 'cilantro bunch', 'Salsão': 'celery stalks',
  'Cheiro-verde': 'parsley and green onion bunch', 'Cogumelo Champignon': 'white button mushrooms', 'Cogumelo Shimeji': 'shimeji mushrooms',
  Cereja: 'cherries', Jabuticaba: 'jabuticaba fruit', Kiwi: 'kiwi fruit', 'Mamão Papaya': 'papaya fruit', Mandioca: 'cassava root', Morango: 'strawberries', 'Jiló': 'green jilo scarlet eggplant',
};
const slugDe = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function candidatos(termo) {
  const out = [];
  const q = `${termo} isolated white background`;
  if (PEXELS) {
    const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=12`, { headers: { Authorization: PEXELS }, signal: AbortSignal.timeout(20000) }).catch(() => null);
    const j = r?.ok ? await r.json().catch(() => null) : null;
    for (const f of j?.photos ?? []) out.push({ url: f.src?.large2x ?? f.src?.original, pagina: f.url, loja: 'Pexels', autor: f.photographer });
  }
  if (PIXABAY) {
    const r = await fetch(`https://pixabay.com/api/?key=${encodeURIComponent(PIXABAY)}&q=${encodeURIComponent(`${termo} isolated`)}&image_type=photo&per_page=15&safesearch=true`, { signal: AbortSignal.timeout(20000) }).catch(() => null);
    const j = r?.ok ? await r.json().catch(() => null) : null;
    for (const h of j?.hits ?? []) out.push({ url: h.largeImageURL, pagina: h.pageURL, loja: 'Pixabay', autor: h.user });
  }
  return out.filter((c) => c.url);
}

const so = (process.argv.find((a) => a.startsWith('--so=')) ?? '').slice(5).split(',').filter(Boolean);
let achadas = 0;
for (const [nome, termo] of Object.entries(BUSCAS)) {
  const slug = slugDe(nome);
  if (so.length && !so.includes(slug)) continue;
  const pasta = path.join(SAIDA, slug);
  fs.mkdirSync(pasta, { recursive: true });
  const cands = await candidatos(termo);
  const aprovadas = [];
  const motivos = [];
  for (const c of cands) {
    if (aprovadas.length >= 3) break;
    const r = await fetch(c.url, { signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (!r?.ok) continue;
    const a = await avaliar(Buffer.from(await r.arrayBuffer())).catch((e) => ({ motivo: String(e?.message ?? e).slice(0, 30) }));
    if (a.ok) aprovadas.push({ ...c, ...a }); else motivos.push(a.motivo);
  }
  // a melhor: recorte confirmado pela IA primeiro, depois a maior
  const melhor = aprovadas.sort((x, y) => (x.via === 'recorte+IA' ? 0 : 1) - (y.via === 'recorte+IA' ? 0 : 1) || y.area - x.area)[0];
  if (melhor) {
    fs.writeFileSync(path.join(pasta, 'previa.png'), melhor.previa);
    fs.writeFileSync(path.join(pasta, 'escolhida.json'), JSON.stringify({ nome, grupo: 'banco', titulo: `${nome} (${melhor.loja}, ${melhor.autor})`, pagina: melhor.pagina, url: melhor.url, loja: `${melhor.loja} · ${melhor.autor}`, link: linkDaFoto(melhor.url, melhor.caixa, true) }, null, 1));
    achadas++;
  }
  console.log(`${nome.padEnd(22)} ${melhor ? `OK (${melhor.loja}, ${melhor.via})` : 'SEM FOTO APROVADA'} | candidatas ${cands.length} | recusas ${motivos.slice(0, 3).join(', ')}`);
}
console.log(`RESULTADO achadas ${achadas} de ${Object.keys(BUSCAS).length}`);
