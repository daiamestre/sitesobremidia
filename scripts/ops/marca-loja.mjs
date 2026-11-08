/**
 * Missão do catálogo (F-274) — LEITOR RÁPIDO DA LOJA OFICIAL DA MARCA. Em vez de abrir página por página (marca-site.mjs),
 * lê o catálogo estruturado da loja da própria marca: nome exato, peso, código de barras (EAN) e foto, de uma vez.
 *   node scripts/ops/marca-loja.mjs <dominio> <pasta> [Marca]
 * Plataformas: Shopify (/products.json), VTEX (/api/catalog_system/pub/products/search) e WooCommerce (Store API).
 * Respeita o robots.txt e não contorna bloqueio. A foto é baixada SÓ PARA O PC (conferência e corte); o catálogo grava o link.
 * Grava <pasta>/produtos.json (fotos SEM fundo, no formato do marca-oficial.mjs) e <pasta>/com-fundo.json (fotos com fundo,
 * para o recorte com inspeção). Saída: "RESULTADO plataforma X | produtos N | sem fundo N | com fundo N | com código N".
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const [dominio, pasta, marcaArg] = process.argv.slice(2);
if (!dominio || !pasta) { console.log('uso: <dominio> <pasta> [Marca]'); process.exit(1); }
const UA = { 'User-Agent': 'SobreMidia-Catalogo/1.0 (contato@sobremidia.com.br)', Accept: 'application/json,text/html;q=0.9,*/*;q=0.8' };
const MAX = 3000;
const espera = (ms) => new Promise((o) => setTimeout(o, ms));
const buscar = (u, ms = 20000) => fetch(u, { headers: UA, signal: AbortSignal.timeout(ms) }).catch(() => null);
const json = async (u) => { const r = await buscar(u); if (!r?.ok || !/json/.test(r.headers.get('content-type') ?? '')) return null; return r.json().catch(() => null); };

let raiz = null;
// a página inicial pode recusar robôs e o catálogo não: vale o primeiro endereço que responde (início ou robots.txt)
for (const c of [`https://www.${dominio}`, `https://${dominio}`]) { const r = await buscar(`${c}/`); if (r?.ok) { raiz = new URL(r.url).origin; break; } }
if (!raiz) for (const c of [`https://www.${dominio}`, `https://${dominio}`]) { const r = await buscar(`${c}/robots.txt`); if (r && r.status < 500) { raiz = c; break; } }
if (!raiz) { console.log('RESULTADO site não abriu'); process.exit(0); }
const robots = (await (await buscar(`${raiz}/robots.txt`))?.text().catch(() => '')) ?? '';
// regras do grupo "User-agent: *" com * e $ como no padrão do robots.txt ("/*.atom" NÃO é "proíbe tudo")
const proibidos = [];
{
  let vale = false, emGrupo = false;
  for (const linha of robots.split(/\r?\n/)) {
    const m = linha.replace(/#.*/, '').match(/^\s*(user-agent|disallow|allow)\s*:\s*(.*?)\s*$/i);
    if (!m) continue;
    const k = m[1].toLowerCase();
    if (k === 'user-agent') { if (!emGrupo) vale = false; emGrupo = true; if (m[2] === '*') vale = true; continue; }
    emGrupo = false;
    if (vale && k === 'disallow' && m[2]) {
      const fim = m[2].endsWith('$');
      const corpo = (fim ? m[2].slice(0, -1) : m[2]).replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      proibidos.push(new RegExp(`^${corpo}${fim ? '$' : ''}`));
    }
  }
}
const liberado = (p) => !proibidos.some((re) => re.test(p));
if (!liberado('/products.json') && !liberado('/api/catalog_system/pub/products/search') && !liberado('/wp-json/wc/store/v1/products')) {
  console.log('RESULTADO robots.txt proíbe a leitura');
  process.exit(0);
}

const semAcento = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '');
const slugDe = (t) => semAcento(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const pesoDe = (t) => { const m = /(\d+(?:[.,]\d+)?)\s*(kg|g)\b/i.exec(t); if (!m) return null; const n = Number(m[1].replace(',', '.')); return Math.round(m[2].toLowerCase() === 'kg' ? n * 1000 : n); };
const limparHtml = (t) => String(t ?? '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#8211;|&ndash;/g, '-').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const gtinValido = (c) => /^\d{8}$|^\d{12,14}$/.test(String(c ?? '')) && !/^0+$/.test(String(c));

/** Cada leitor devolve [{ titulo, pagina, foto, codigo, categoria }] */
async function shopify() {
  if (!liberado('/products.json')) return null;
  const out = [];
  for (let page = 1; page <= 20 && out.length < MAX; page++) {
    const j = await json(`${raiz}/products.json?limit=250&page=${page}`);
    if (!j?.products) return page === 1 ? null : out;
    if (!j.products.length) break;
    for (const p of j.products) {
      const v = (p.variants ?? [])[0] ?? {};
      const varTit = v.title && !/default/i.test(v.title) ? ` ${v.title}` : '';
      out.push({ titulo: limparHtml(p.title) + (p.variants?.length === 1 ? varTit : ''), pagina: `${raiz}/products/${p.handle}`, foto: p.images?.[0]?.src, codigo: v.barcode, categoria: p.product_type });
    }
    await espera(400);
  }
  return out;
}
async function vtex() {
  const base = '/api/catalog_system/pub/products/search';
  if (!liberado(base)) return null;
  const out = [];
  for (let de = 0; de < 2500 && out.length < MAX; de += 50) {
    const j = await json(`${raiz}${base}?_from=${de}&_to=${de + 49}`);
    if (!Array.isArray(j)) return de === 0 ? null : out;
    if (!j.length) break;
    for (const p of j) {
      for (const it of (p.items ?? []).slice(0, 4)) {
        const nome = limparHtml(it.nameComplete || it.name || p.productName);
        out.push({ titulo: nome, pagina: p.link || `${raiz}/${p.linkText}/p`, foto: it.images?.[0]?.imageUrl, codigo: it.ean, categoria: (p.categories?.[0] ?? '').split('/').filter(Boolean).pop() });
      }
    }
    await espera(300);
  }
  return out;
}
async function woo() {
  for (const base of ['/wp-json/wc/store/v1/products', '/wp-json/wc/store/products']) {
    if (!liberado(base)) continue;
    const out = [];
    for (let page = 1; page <= 30 && out.length < MAX; page++) {
      const j = await json(`${raiz}${base}?per_page=100&page=${page}`);
      if (!Array.isArray(j)) { if (page === 1) break; return out; }
      if (!j.length) return out;
      for (const p of j) out.push({ titulo: limparHtml(p.name), pagina: p.permalink, foto: p.images?.[0]?.src, codigo: p.sku, categoria: p.categories?.[0]?.name });
      await espera(300);
    }
    if (out.length) return out;
  }
  return null;
}

let plataforma = '', lidos = null;
for (const [nome, f] of [['shopify', shopify], ['vtex', vtex], ['woocommerce', woo]]) { lidos = await f(); if (lidos?.length) { plataforma = nome; break; } }
if (!lidos?.length) { console.log('RESULTADO sem loja estruturada (usar marca-site.mjs)'); process.exit(0); }

// repetidos (mesma foto ou mesmo nome) e itens sem foto saem
const vistos = new Set();
const itens = lidos.filter((x) => x.foto && x.titulo && !vistos.has(x.foto) && !vistos.has(slugDe(x.titulo)) && vistos.add(x.foto) && vistos.add(slugDe(x.titulo)));
fs.mkdirSync(path.join(pasta, 'oficial'), { recursive: true });
const semFundo = [], comFundo = [];
let i = 0, comCodigo = 0;
const trabalhar = async () => {
  while (i < itens.length) {
    const k = i++;
    const x = itens[k];
    const url = String(x.foto).replace(/^\/\//, 'https://').replace(/^http:/, 'https:').replace(/\?.*$/, (q) => (/[?&](v|width)=/.test(q) ? '' : q));
    try {
      const r = await buscar(url, 30000);
      if (!r?.ok || !/^image\//.test(r.headers.get('content-type') ?? '')) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      const img = sharp(buf);
      const meta = await img.metadata();
      if (!meta.width || Math.max(meta.width, meta.height) < 350) continue;
      const { data, info } = await img.ensureAlpha().resize({ width: 200, height: 200, fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
      let transp = 0; for (let p = 3; p < data.length; p += 4) if (data[p] < 16) transp++;
      const fracao = transp / (info.width * info.height);
      const slug = `${slugDe(x.titulo)}-n${k}`;
      const ext = meta.format === 'jpeg' ? 'jpg' : meta.format;
      const arq = `${slug}.${ext}`;
      fs.writeFileSync(path.join(pasta, 'oficial', arq), buf);
      const codigo = gtinValido(x.codigo) ? String(x.codigo) : undefined;
      if (codigo) comCodigo++;
      const item = { slug, titulo: x.titulo, pagina: x.pagina, url, arq, w: meta.width, h: meta.height, formato: meta.format, transparente: Number(fracao.toFixed(3)), peso: pesoDe(x.titulo), codigo, segmento: x.categoria || undefined, marca: marcaArg };
      (fracao > 0.02 ? semFundo : comFundo).push(item);
    } catch { /* foto que não abriu fica de fora */ }
  }
};
await Promise.all(Array.from({ length: 6 }, trabalhar));
fs.writeFileSync(path.join(pasta, 'produtos.json'), JSON.stringify(semFundo, null, 1));
fs.writeFileSync(path.join(pasta, 'com-fundo.json'), JSON.stringify(comFundo, null, 1));
console.log(`RESULTADO plataforma ${plataforma} | produtos ${itens.length} | sem fundo ${semFundo.length} | com fundo ${comFundo.length} | com código ${comCodigo}`);
