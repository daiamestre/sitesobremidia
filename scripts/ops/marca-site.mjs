/**
 * Missão do catálogo: lê o site oficial de uma marca e baixa a imagem de cada produto, no tamanho original. Não mexe no catálogo.
 *   node scripts/ops/marca-site.mjs <dominio> <pasta> [caminho da lista]
 * Acha as páginas pelo sitemap e pelas listas de produtos. Em cada página, fica a maior imagem SEM FUNDO; logotipo, ícone e imagem
 * que se repete em várias páginas saem. Foto com fundo não entra: é o padrão do dono.
 * Respeita o robots.txt, faz uma página por vez e não contorna bloqueio: site que recusar fica de fora.
 * Depois: conferir as imagens e seguir com marca-oficial.mjs (preparar, gravar). Grava <pasta>/produtos.json.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const [dominio, pasta, caminho] = process.argv.slice(2);
if (!dominio || !pasta) { console.log('uso: <dominio> <pasta> [caminho]'); process.exit(1); }
const UA = { 'User-Agent': 'SobreMidia-Catalogo/1.0 (contato@sobremidia.com.br)' };
const espera = (ms) => new Promise((o) => setTimeout(o, ms));
const MAX_PAGINAS = 250, IMAGENS_POR_PAGINA = 5;
const ler = (u) => fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) }).then(async (r) => (r.ok ? { texto: await r.text(), url: r.url } : null)).catch(() => null);

let raiz = null;
for (const c of [`https://www.${dominio}`, `https://${dominio}`]) { const r = await ler(`${c}/`); if (r) { raiz = new URL(r.url).origin; break; } }
if (!raiz) { console.log('RESULTADO site não abriu'); process.exit(0); }
const host = new URL(raiz).hostname;

const robots = (await ler(`${raiz}/robots.txt`))?.texto ?? '';
const proibidos = [];
{
  let vale = false;
  for (const l of robots.split(/\r?\n/)) {
    const m = l.match(/^\s*(user-agent|disallow)\s*:\s*(.*?)\s*$/i);
    if (!m) continue;
    if (m[1].toLowerCase() === 'user-agent') vale = m[2] === '*';
    else if (vale && m[2]) proibidos.push(m[2].replace(/\*.*$/, ''));
  }
}
if (proibidos.includes('/')) { console.log('RESULTADO robots.txt proíbe a leitura'); process.exit(0); }
const liberado = (u) => { const p = new URL(u).pathname; return !proibidos.some((d) => d && p.startsWith(d)); };

const NAO_PRODUTO = /\/(categoria|category|tag|author|receitas?|promocoes?|blog|noticias?|fale-conosco|contato|sobre|institucional|a-marca|quem-somos|historia|politica|privacidade|termos|trabalhe|sac|wp-|feed|page\/|carrinho|cart|checkout|minha-conta|login)/i;
const paginas = new Set();
const guardar = (u) => { try { const x = new URL(u, raiz); if (x.hostname.replace(/^www\./, '') === host.replace(/^www\./, '') && !NAO_PRODUTO.test(x.pathname) && !/\.(png|jpe?g|webp|pdf|xml|zip|css|js)$/i.test(x.pathname) && x.pathname.split('/').filter(Boolean).length >= 1 && liberado(x.href)) paginas.add(`${x.origin}${x.pathname.replace(/\/?$/, '/')}`); } catch { /* endereço inválido */ } };

// sitemap: só o que tem cara de produto
const fila = [...robots.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]);
if (!fila.length) fila.push(`${raiz}/sitemap_index.xml`, `${raiz}/sitemap.xml`);
const vistos = new Set();
while (fila.length && vistos.size < 30) {
  const s = fila.shift();
  if (vistos.has(s)) continue;
  vistos.add(s);
  const x = await ler(s);
  if (!x || !/<(urlset|sitemapindex)/.test(x.texto)) continue;
  const locs = [...x.texto.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  if (/<sitemapindex/.test(x.texto)) fila.push(...locs.filter((l) => /produt|product|item|linha|marca|page|post-type|custom/i.test(l)));
  else for (const l of locs) if (/produt|product|\/linha|\/item/i.test(l) || /produt|product/i.test(s)) guardar(l);
}
// listas de produtos
for (const c of caminho ? [caminho] : ['/produtos/', '/produto/', '/nossos-produtos/', '/linha-de-produtos/', '/products/', '/linhas/', '/nossas-marcas/']) {
  const l = await ler(`${raiz}${c}`);
  if (!l) continue;
  for (const m of l.texto.matchAll(/href=["']([^"'#?]+)["']/g)) guardar(m[1]);
  await espera(400);
}
const links = [...paginas].slice(0, MAX_PAGINAS);
console.log('páginas candidatas', links.length);
if (!links.length) { console.log('RESULTADO nenhuma página de produto'); process.exit(0); }

fs.mkdirSync(`${pasta}/oficial`, { recursive: true });
const pesoDe = (t) => { const m = t.toLowerCase().replace(/(\d)-(\d)/g, '$1.$2').replace(/,/g, '.').match(/(\d+(?:\.\d+)?)\s*-?(kg|g)\b/); return m ? (m[2] === 'kg' ? Number(m[1]) * 1000 : Number(m[1])) : null; };
const FORA = /logo|favicon|icon|icone|banner|header|footer|rodape|sprite|selo|background|\bbg\b|placeholder|avatar|whatsapp|facebook|instagram/i;
const achados = [];
let semFundo = 0, comFundo = 0;
for (const u of links) {
  await espera(600);
  const h = (await ler(u))?.texto;
  if (!h) continue;
  const titulo = (h.match(/<h1[^>]*>\s*([^<]+)/)?.[1] ?? h.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ?? '').replace(/\s+[-|–]\s+.*$/, '').replace(/&#\d+;|&amp;/g, ' ').replace(/\s+/g, ' ').trim();
  if (!titulo) continue;
  const brutas = [...h.matchAll(/(?:src|data-src|data-lazy-src|href|content)=["']([^"']+\.(?:png|webp)(?:\?[^"']*)?)["']/gi), ...h.matchAll(/([^\s"',]+\.(?:png|webp))(?:\s+\d+w)/gi)].map((m) => m[1]);
  const urls = [...new Set(brutas.map((x) => { try { return new URL(x.replace(/\.(png|jpe?g)\.webp$/i, '.$1').replace(/-\d+x\d+(\.\w+)(\?.*)?$/, '$1'), u).href; } catch { return null; } }).filter(Boolean))].filter((x) => !FORA.test(x.split('/').pop()));
  let melhor = null;
  for (const url of urls.slice(0, IMAGENS_POR_PAGINA)) {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (!r?.ok) continue;
    const b = Buffer.from(await r.arrayBuffer());
    const m = await sharp(b).metadata().catch(() => null);
    if (!m?.width || Math.max(m.width, m.height) < 300) continue;
    if (!m.hasAlpha) { comFundo++; continue; }
    const a = await sharp(b).ensureAlpha().extractChannel(3).raw().toBuffer();
    let z = 0;
    for (const v of a) if (v < 16) z++;
    const t = z / a.length;
    if (t < 0.05 || t > 0.97) { comFundo++; continue; }
    if (!melhor || m.width * m.height > melhor.m.width * melhor.m.height) melhor = { b, m, url, t, hash: crypto.createHash('md5').update(b).digest('hex') };
  }
  if (!melhor) continue;
  semFundo++;
  achados.push({ u, titulo, ...melhor });
}
// imagem que se repete em várias páginas é logotipo ou peça do site
const vezes = new Map();
for (const a of achados) vezes.set(a.hash, (vezes.get(a.hash) ?? 0) + 1);
const unicos = new Set();
const saida = [];
for (const a of achados) {
  if (vezes.get(a.hash) >= 3 || unicos.has(a.hash)) continue;
  unicos.add(a.hash);
  const slug = decodeURIComponent(a.u.split('/').filter(Boolean).pop()).replace(/[^a-z0-9-]+/gi, '-').toLowerCase().slice(0, 80);
  const arq = `${slug}.${a.m.format === 'jpeg' ? 'jpg' : a.m.format}`;
  fs.writeFileSync(`${pasta}/oficial/${arq}`, a.b);
  saida.push({ slug, titulo: a.titulo, pagina: a.u, url: a.url, arq, w: a.m.width, h: a.m.height, formato: a.m.format, transparente: +a.t.toFixed(3), peso: pesoDe(slug) ?? pesoDe(a.titulo) });
}
fs.writeFileSync(`${pasta}/produtos.json`, JSON.stringify(saida, null, 1));
console.log('RESULTADO imagens sem fundo', saida.length, '| lado >= 700', saida.filter((x) => Math.max(x.w, x.h) >= 700).length, '| fotos com fundo ignoradas', comFundo);
