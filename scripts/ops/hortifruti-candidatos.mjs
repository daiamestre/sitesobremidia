/**
 * F-288 — HORTIFRÚTI COM ESCOLHA HUMANA: a conferência automática (recorte + IA) aprova a QUALIDADE do recorte, mas não sabe
 * QUAL fruta é (já aprovou maçã como caju e papagaio como jiló). Aqui cada produto ganha várias buscas nos bancos de uso livre
 * (Pexels e Pixabay), TODAS as aprovadas ficam numeradas (../hortifruti/<produto>/cand-N.png) numa folha de conferência, e só a
 * escolhida por quem olhou vira a foto do produto:
 *   node scripts/ops/hortifruti-candidatos.mjs [--so=caju,jilo]        → gera candidatas e ../hortifruti/_folha-candidatas.jpg
 *   node scripts/ops/hortifruti-candidatos.mjs --escolher=caju:3,jilo:1 → grava escolhida.json (depois: hortifruti-fotos.mjs gravar)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { avaliar } from './hortifruti-fotos.mjs';
import { linkDaFoto } from './passa-foto.mjs';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const SAIDA = path.resolve(RAIZ, '..', 'hortifruti');
const cofre = fs.readFileSync(path.join(os.homedir(), '.sobremidia-secrets', 'tokens.env'), 'utf8');
const chave = (n) => (cofre.match(new RegExp(`^${n}=(.*)$`, 'm'))?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
const PEXELS = chave('PEXELS_API_KEY'), PIXABAY = chave('PIXABAY_API_KEY');

export const BUSCAS = {
  'Uva Niágara': ['pink grapes bunch', 'red grapes bunch isolated', 'niagara grapes', 'rose grapes white background'],
  'Banana da Terra': ['plantain', 'plantain bananas isolated', 'ripe plantain', 'green plantain'],
  'Uva Crimson': ['red seedless grapes isolated', 'red grapes on white background'],
  Caju: ['cashew fruit', 'cashew apple', 'caju fruta', 'cashew apple isolated', 'anacardium occidentale fruit'],
  Graviola: ['soursop', 'guanabana fruit', 'graviola'],
  'Batata Doce': ['sweet potatoes isolated', 'raw sweet potato white background'],
  Maxixe: ['maxixe', 'cucumis anguria', 'west indian gherkin', 'maxixe vegetable', 'bur gherkin'],
  'Agrião': ['watercress isolated', 'fresh watercress bunch'],
  Coentro: ['coriander bunch isolated', 'fresh cilantro isolated', 'coriander leaves'],
  'Salsão': ['celery bunch isolated', 'celery stalks white background'],
  'Cogumelo Champignon': ['white mushrooms isolated', 'champignon mushroom isolated'],
  'Cogumelo Shimeji': ['brown shimeji mushroom', 'beech mushrooms isolated'],
  Jabuticaba: ['jabuticaba', 'jaboticaba fruit'],
  Mandioca: ['cassava root isolated', 'yuca root', 'manioc'],
  'Jiló': ['jilo vegetable', 'scarlet eggplant', 'solanum aethiopicum'],
  Salsa: ['parsley bunch isolated', 'fresh parsley white background'],
  'Cheiro-verde': ['parsley and chives', 'parsley and green onion bunch'],
};
const slugDe = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function candidatos(termos) {
  const out = [], vistos = new Set();
  for (const termo of termos) {
    if (PEXELS) {
      const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(termo)}&per_page=10`, { headers: { Authorization: PEXELS }, signal: AbortSignal.timeout(20000) }).catch(() => null);
      const j = r?.ok ? await r.json().catch(() => null) : null;
      for (const f of j?.photos ?? []) out.push({ url: f.src?.large2x ?? f.src?.original, pagina: f.url, loja: 'Pexels', autor: f.photographer });
    }
    if (PIXABAY) {
      const r = await fetch(`https://pixabay.com/api/?key=${encodeURIComponent(PIXABAY)}&q=${encodeURIComponent(termo)}&image_type=photo&per_page=10&safesearch=true`, { signal: AbortSignal.timeout(20000) }).catch(() => null);
      const j = r?.ok ? await r.json().catch(() => null) : null;
      for (const h of j?.hits ?? []) out.push({ url: h.largeImageURL, pagina: h.pageURL, loja: 'Pixabay', autor: h.user });
    }
  }
  return out.filter((c) => c.url && !vistos.has(c.url) && vistos.add(c.url));
}

const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? '').slice(n.length + 3);

if (arg('escolher')) {
  for (const par of arg('escolher').split(',').filter(Boolean)) {
    const [slug, n] = par.split(':');
    const pasta = path.join(SAIDA, slug);
    const lista = JSON.parse(fs.readFileSync(path.join(pasta, 'candidatas.json'), 'utf8'));
    const c = lista.find((x) => String(x.n) === n);
    if (!c) { console.log('sem candidata', par); continue; }
    fs.copyFileSync(path.join(pasta, `cand-${n}.png`), path.join(pasta, 'previa.png'));
    fs.writeFileSync(path.join(pasta, 'escolhida.json'), JSON.stringify({ nome: c.nome, grupo: 'banco', titulo: `${c.nome} (${c.loja}, ${c.autor})`, pagina: c.pagina, url: c.url, loja: `${c.loja} · ${c.autor}`, link: linkDaFoto(c.url, c.caixa, true) }, null, 1));
    console.log('escolhida', slug, n);
  }
  process.exit(0);
}

const so = arg('so').split(',').filter(Boolean);
const folha = [];
for (const [nome, termos] of Object.entries(BUSCAS)) {
  const slug = slugDe(nome);
  if (so.length && !so.includes(slug)) continue;
  const pasta = path.join(SAIDA, slug);
  fs.mkdirSync(pasta, { recursive: true });
  const cands = (await candidatos(termos)).slice(0, 28);
  const aprovadas = [];
  for (const c of cands) {
    if (aprovadas.length >= 8) break;
    const r = await fetch(c.url, { signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (!r?.ok) continue;
    const a = await avaliar(Buffer.from(await r.arrayBuffer())).catch(() => ({ ok: false }));
    if (!a.ok) continue;
    const n = aprovadas.length + 1;
    fs.writeFileSync(path.join(pasta, `cand-${n}.png`), a.previa);
    aprovadas.push({ n, nome, url: c.url, pagina: c.pagina, loja: c.loja, autor: c.autor, caixa: a.caixa, via: a.via });
  }
  fs.writeFileSync(path.join(pasta, 'candidatas.json'), JSON.stringify(aprovadas, null, 1));
  folha.push({ slug, n: aprovadas.length });
  console.log(`${nome.padEnd(22)} candidatas aprovadas ${aprovadas.length} de ${cands.length}`);
}

// folha de conferência: uma linha por produto, as candidatas numeradas
const t = 170, col = 8;
const comp = [];
let linha = 0;
for (const { slug, n } of folha) {
  const rot = Buffer.from(`<svg width="${col * t}" height="22"><rect width="100%" height="100%" fill="#222"/><text x="6" y="16" font-size="15" fill="#fff" font-family="Arial">${slug}</text></svg>`);
  comp.push({ input: rot, left: 0, top: linha * (t + 22) });
  for (let i = 1; i <= n; i++) {
    const img = await sharp(path.join(SAIDA, slug, `cand-${i}.png`)).resize(t - 8, t - 8, { fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' }).toBuffer();
    const num = Buffer.from(`<svg width="26" height="22"><rect width="100%" height="100%" fill="#5D1BFF"/><text x="7" y="16" font-size="15" fill="#fff" font-family="Arial">${i}</text></svg>`);
    comp.push({ input: img, left: (i - 1) * t + 4, top: linha * (t + 22) + 22 + 4 }, { input: num, left: (i - 1) * t + 4, top: linha * (t + 22) + 26 });
  }
  linha++;
}
if (linha) await sharp({ create: { width: col * t, height: linha * (t + 22), channels: 3, background: '#ffffff' } }).composite(comp).jpeg({ quality: 78 }).toFile(path.join(SAIDA, '_folha-candidatas.jpg'));
console.log('folha', path.join(SAIDA, '_folha-candidatas.jpg'));
