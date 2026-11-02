/**
 * Missão do catálogo: lê o site oficial de uma marca e baixa a imagem de cada produto, no tamanho original. Não mexe no catálogo.
 *   node scripts/ops/marca-site.mjs <dominio> <pasta> [caminho da lista, padrão /produtos/]
 * Respeita o robots.txt, faz uma página por vez e não contorna bloqueio: site que recusar fica de fora.
 * Depois: conferir as imagens e seguir com marca-oficial.mjs (preparar, gravar). Grava <pasta>/produtos.json.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const [dominio, pasta, caminho = '/produtos/'] = process.argv.slice(2);
if (!dominio || !pasta) { console.log('uso: <dominio> <pasta> [caminho]'); process.exit(1); }
const UA = { 'User-Agent': 'SobreMidia-Catalogo/1.0 (contato@sobremidia.com.br)' };
const espera = (ms) => new Promise((o) => setTimeout(o, ms));
const ler = (u) => fetch(u, { headers: UA, signal: AbortSignal.timeout(25000) }).then((r) => (r.ok ? r.text() : null)).catch(() => null);
const raiz = `https://www.${dominio}`;
const robots = (await ler(`${raiz}/robots.txt`)) ?? '';
if (/^\s*user-agent:\s*\*\s*$\s*disallow:\s*\/\s*$/im.test(robots)) { console.log('robots.txt proíbe a leitura: marca fora'); process.exit(0); }
const lista = await ler(`${raiz}${caminho}`);
if (!lista) { console.log('lista de produtos não abriu'); process.exit(0); }
const dom = dominio.replace(/\./g, '\\.');
const IGNORA = /\/(categoria|category|tag|author|receitas?|promocoes|blog|noticias|fale-conosco|contato|sobre|institucional|a-marca|politica|privacidade|termos|wp-|feed|page\/)/;
const links = [...new Set([...lista.matchAll(new RegExp(`href="(https://(?:www\\.)?${dom}/[^"#?]+)"`, 'g'))].map((m) => m[1].replace(/\/?$/, '/')))]
  .filter((u) => !IGNORA.test(u) && u.split('/').filter(Boolean).length >= 3 && !u.endsWith(caminho));
console.log('páginas candidatas', links.length);
fs.mkdirSync(`${pasta}/oficial`, { recursive: true });
const saida = [];
const pesoDe = (t) => { const m = t.toLowerCase().replace(/(\d)-(\d)/g, '$1.$2').replace(/,/g, '.').match(/(\d+(?:\.\d+)?)\s*-?(kg|g)\b/); return m ? (m[2] === 'kg' ? Number(m[1]) * 1000 : Number(m[1])) : null; };
for (const u of links) {
  await espera(700);
  const h = await ler(u);
  if (!h) continue;
  const titulo = (h.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ?? h.match(/<h1[^>]*>([^<]+)/)?.[1] ?? '').replace(/\s+[-|–]\s+.*$/, '').replace(/&#\d+;|&amp;/g, ' ').trim();
  const url = h.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  if (!url || !titulo) continue;
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) }).catch(() => null);
  if (!r?.ok) continue;
  const b = Buffer.from(await r.arrayBuffer());
  const m = await sharp(b).metadata().catch(() => null);
  if (!m?.width) continue;
  let transparente = 0;
  if (m.hasAlpha) { const a = await sharp(b).ensureAlpha().extractChannel(3).raw().toBuffer(); let z = 0; for (const v of a) if (v < 16) z++; transparente = z / a.length; }
  const slug = u.split('/').filter(Boolean).pop();
  const arq = `${slug}.${m.format === 'jpeg' ? 'jpg' : m.format}`;
  fs.writeFileSync(`${pasta}/oficial/${arq}`, b);
  saida.push({ slug, titulo, pagina: u, url, arq, w: m.width, h: m.height, formato: m.format, transparente: +transparente.toFixed(3), peso: pesoDe(slug) ?? pesoDe(titulo) });
}
fs.writeFileSync(`${pasta}/produtos.json`, JSON.stringify(saida, null, 1));
console.log('imagens', saida.length, '| sem fundo', saida.filter((x) => x.transparente > 0.05).length, '| lado >= 700', saida.filter((x) => Math.max(x.w, x.h) >= 700).length);
