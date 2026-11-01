/**
 * F-253 — refaz as fotos do catálogo de produtos no padrão profissional: maior foto original que existe, recorte na Cloudflare,
 * inspeção (mesmas contas do site, qualidadeRecorte.ts) e IA de visão. Nada de ruim entra: reprovado continua como estava.
 *   node scripts/ops/refazer-recortes-catalogo.mjs gerar <pasta>     só gera os PNGs e o manifesto na pasta (não mexe em nada)
 *   node scripts/ops/refazer-recortes-catalogo.mjs gravar <pasta>    envia ao R2 e troca no catálogo o que está no manifesto
 * `gerar` guarda em <pasta>/antes.json as fotos atuais: é o rollback do catálogo.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { exigir, R2_PUBLICO } from './segredos.mjs';
import { acabamento, inspecionar, realcar, repararMordidas } from '../../src/lib/tabloide/qualidadeRecorte.ts';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
exigir('TABLOIDE_IA_URL', 'TABLOIDE_IA_SEGREDO');
const [modo, pasta] = process.argv.slice(2);
if (!['gerar', 'gravar', 'retocar'].includes(modo) || !pasta) { console.log('uso: gerar|gravar|retocar <pasta>'); process.exit(1); }
fs.mkdirSync(pasta, { recursive: true });
const UA = { 'User-Agent': 'SobreMidia-Tabloide/1.0 (contato@sobremidia.com.br)' };
const LADO = 1200;
const R2 = /r2\.dev|r2\.cloudflarestorage/;

const sqlBruto = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  if (!r.ok) throw new Error(`sql ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
};

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const texto = (v) => (Array.isArray(v) ? v.join(' ') : String(v ?? ''));
const medidas = (t) => [...norm(t).replace(/(\d),(\d)/g, '$1.$2').matchAll(/(\d+(?:\.\d+)?)\s*(kg|g|gr|ml|l|lt|mg)\b/g)].map((m) => m[1] + (m[2] === 'lt' ? 'l' : m[2] === 'gr' ? 'g' : m[2]));
const palavras = (t) => norm(t).replace(/(\d),(\d)/g, '$1.$2').replace(/\b\d+(\.\d+)?\s*(kg|g|gr|ml|l|lt|un|und|mg)\b/g, ' ').replace(/[^a-z0-9\s]/g, ' ')
  .split(/\s+/).filter((p) => p.length >= 2 && !/^\d+$/.test(p) && !['com', 'sem', 'para', 'por', 'dos', 'das', 'tipo', 'de', 'da', 'do', 'em'].includes(p));
/** Mesma conta do catálogo: tudo que foi pedido precisa aparecer no nome+marca, com a mesma medida. */
function nota(p, ps, ms) {
  const nome = norm(texto(p.product_name)).replace(/[^a-z0-9.,\s]/g, ' ').replace(/(\d)\s+(kg|g|ml|l)\b/g, '$1$2').replace(/,/g, '.');
  const todas = `${nome} ${norm(texto(p.brands)).replace(/[^a-z0-9\s]/g, ' ')} ${norm(texto(p.quantity)).replace(/\s+/g, '')}`;
  const lista = todas.split(/\s+/).filter(Boolean);
  if (!ps.every((w) => lista.includes(w))) return 0;
  for (const m of ms) if (!new RegExp(`(^|[^0-9.])${m.replace('.', '\\.')}($|[^a-z0-9])`).test(todas)) return 0;
  const pos = nome.split(/\s+/).indexOf(ps[0]);
  return 1 + ps.length + (pos === 0 ? 4 : pos === 1 ? 2 : 0);
}
const tamanhoReal = (u) => (/openfoodfacts\.org\/images\/products\//.test(u) ? u.replace(/\.\d+\.(jpg|jpeg|png)$/i, '.full.$1') : u);

async function buscarFotos(nome) {
  const q = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(`${nome} countries_tags:"en:brazil"`)}&page_size=30&langs=pt&fields=product_name,brands,quantity,image_front_url`;
  const r = await fetch(q, { headers: UA, signal: AbortSignal.timeout(15000) }).catch(() => null);
  const j = r?.ok ? await r.json().catch(() => null) : null;
  const ps = palavras(nome), ms = medidas(nome);
  return (j?.hits ?? []).filter((h) => h.image_front_url).map((h) => ({ u: h.image_front_url, n: nota(h, ps, ms) })).filter((x) => x.n >= 4).sort((a, b) => b.n - a.n).slice(0, 5).map((x) => x.u);
}

async function baixar(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) }).catch(() => null);
  if (!r?.ok) return null;
  const b = Buffer.from(await r.arrayBuffer());
  const m = await sharp(b).metadata().catch(() => null);
  return m?.width ? { b, area: m.width * m.height } : null;
}

async function reprovadoPelaIA(png, nome) {
  const b = await sharp(png).resize({ width: 640, height: 640, fit: 'contain', background: '#ff2bd6' }).flatten({ background: '#ff2bd6' }).jpeg({ quality: 85 }).toBuffer();
  const pedido = 'This image shows a retail product cut out from its background and placed on a flat magenta backdrop. You are a strict quality inspector. Answer with JSON only: {"completo": true|false, "em_pe": true|false, "eh_o_produto": true|false}. completo=false if any part of the product is missing, bitten off, torn, has an irregular jagged edge, a notch, holes, or if leftover pieces of the original background remain attached, or if the package is visibly cut off by the photo frame (text or artwork ending abruptly at a straight edge). em_pe=false if the product is rotated sideways, tilted more than about 15 degrees, or upside down (its main text is not horizontal and readable). eh_o_produto=false if the image is not a retail package of the product named below: for example only a logo, only a barcode, a label, a cup or glass of the drink, the raw food, a different product, or a combo with other products. Product name: ' + nome;
  const r = await fetch(process.env.TABLOIDE_IA_URL, { method: 'POST', headers: { 'x-segredo': process.env.TABLOIDE_IA_SEGREDO, 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'studio-modelo', modelo: '@cf/meta/llama-4-scout-17b-16e-instruct', entrada: { max_tokens: 60, temperature: 0, messages: [{ role: 'user', content: [{ type: 'text', text: pedido }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b.toString('base64')}` } }] }] } }), signal: AbortSignal.timeout(20000) }).catch(() => null);
  const j = r?.ok ? await r.json().catch(() => null) : null;
  const t = j?.response ?? j?.choices?.[0]?.message?.content;
  try { const o = typeof t === 'object' && t ? t : JSON.parse(String(t).match(/\{[\s\S]*\}/)?.[0] ?? 'null'); if (o?.completo === false) return 'ia-contorno'; if (o?.eh_o_produto === false) return 'ia-nao-e-o-produto'; if (o?.em_pe === false) return 'ia-deitado'; return ''; } catch { return ''; }
}

/** Mesmo caminho do site (finalizarRecorte), com o sharp no lugar do canvas. */
async function recortar(url, bytes, nome) {
  const r = await fetch(process.env.TABLOIDE_IA_URL, { method: 'POST', headers: { 'x-segredo': process.env.TABLOIDE_IA_SEGREDO, 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'recortar', url }), signal: AbortSignal.timeout(45000) }).catch(() => null);
  if (!r?.ok) return { erro: `nuvem ${r?.status ?? 'sem resposta'}` };
  const { data, info } = await sharp(Buffer.from(await r.arrayBuffer())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const foto = new Uint8ClampedArray(await sharp(bytes).rotate().resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer());
  const rec = new Uint8ClampedArray(data);
  repararMordidas(foto, rec, w, h);
  const ins = inspecionar(rec, w, h, foto);
  if (!ins.aprovado) return { erro: ins.defeitos.join('+') };
  acabamento(foto, rec, w, h);
  const cortado = await sharp(Buffer.from(rec), { raw: { width: w, height: h, channels: 4 } }).trim({ threshold: 0, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const m = await sharp(cortado).metadata();
  const escala = Math.max(1, Math.min(2.5, LADO / Math.max(m.width, m.height)));
  const W = Math.round(m.width * escala), H = Math.round(m.height * escala);
  const fin = new Uint8ClampedArray(await sharp(cortado).resize(W, H, { kernel: 'lanczos3' }).raw().toBuffer());
  realcar(fin, W, H, escala > 1 ? 0.8 : 0.4);
  const png = await sharp(Buffer.from(fin), { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
  const reprovado = await reprovadoPelaIA(png, nome);
  if (reprovado) return { erro: reprovado };
  return { png, origemLado: Math.max(w, h), W, H };
}

async function gerar() {
  const linhas = await sqlBruto('select id, nome, nome_norm, imagem_url, fonte, recortada, cliente_id, origem from public.tabloide_catalogo order by nome');
  fs.writeFileSync(`${pasta}/antes.json`, JSON.stringify(linhas, null, 1));
  const arq = `${pasta}/manifesto.jsonl`;
  // o que a conferência a olho recusou (recusados.txt) sai do manifesto e volta a ser tentado com outra foto; o reprovado também
  const fora = new Set(fs.existsSync(`${pasta}/recusados.txt`) ? fs.readFileSync(`${pasta}/recusados.txt`, 'utf8').split(/\s+/).filter(Boolean) : []);
  const anteriores = fs.existsSync(arq) ? fs.readFileSync(arq, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const excluidas = new Set(anteriores.filter((x) => fora.has(x.arquivo)).map((x) => x.origem));
  const validos = anteriores.filter((x) => x.arquivo && !fora.has(x.arquivo));
  fs.writeFileSync(arq, validos.map((x) => `${JSON.stringify(x)}\n`).join(''));
  const feitos = new Set(validos.map((x) => x.id));
  // a mesma foto em várias chaves (nome e código de barras) sai uma vez só
  const resolvidas = new Map();
  let i = 0;
  const trabalhador = async () => {
    while (i < linhas.length) {
      const l = linhas[i++];
      if (feitos.has(l.id)) continue;
      const nome = l.nome ?? l.nome_norm;
      const chave = norm(nome);
      if (!resolvidas.has(chave)) resolvidas.set(chave, (async () => {
        const atual = R2.test(l.imagem_url) ? [] : [tamanhoReal(l.imagem_url), l.imagem_url];
        const lista = [...new Set([...atual, ...(await buscarFotos(nome)).map(tamanhoReal)])];
        const fotos = [];
        for (const u of lista) { const b = await baixar(u); if (b) fotos.push({ u, ...b, peso: b.area * (atual.includes(u) ? 2 : 1) }); }
        fotos.sort((a, c) => c.peso - a.peso);
        const erros = [];
        for (const f of fotos.filter((x) => !excluidas.has(x.u)).slice(0, 4)) {
          const r = await recortar(f.u, f.b, nome).catch((e) => ({ erro: String(e).slice(0, 80) }));
          if (r.png) { const arquivo = `${crypto.createHash('md5').update(r.png).digest('hex').slice(0, 16)}.png`; fs.writeFileSync(`${pasta}/${arquivo}`, r.png); return { arquivo, origem: f.u, lado: r.origemLado, W: r.W, H: r.H }; }
          erros.push(r.erro);
        }
        return { erros: erros.length ? erros : ['sem foto'] };
      })());
      const r = await resolvidas.get(chave);
      fs.appendFileSync(arq, `${JSON.stringify({ id: l.id, nome, cut: !!l.recortada, ...r })}\n`);
      console.log(i, '/', linhas.length, String(nome).slice(0, 40), r.arquivo ? `OK lado ${r.lado}` : `REPROVADO ${r.erros.join(', ')}`);
    }
  };
  await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
}

/** Assinatura do R2, igual à de cadastrar-logo-cabecalho.mjs. */
async function enviar(chave, corpo) {
  exigir('CF_R2_ACCESS_KEY_ID', 'CF_R2_SECRET_ACCESS_KEY', 'CF_R2_S3_ENDPOINT');
  const BUCKET = process.env.TABLOIDE_R2_BUCKET ?? 'sobremidia-storage';
  const host = new URL(process.env.CF_R2_S3_ENDPOINT).host;
  const sha = (x) => crypto.createHash('sha256').update(x).digest('hex');
  const hmac = (k, x) => crypto.createHmac('sha256', k).update(x).digest();
  const amz = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dia = amz.slice(0, 8), hashCorpo = sha(corpo);
  const cab = { 'content-type': 'image/png', host, 'x-amz-content-sha256': hashCorpo, 'x-amz-date': amz };
  const nomes = Object.keys(cab).sort();
  const canon = ['PUT', `/${BUCKET}/${chave}`, '', nomes.map((n) => `${n}:${cab[n]}\n`).join(''), nomes.join(';'), hashCorpo].join('\n');
  const escopo = `${dia}/auto/s3/aws4_request`;
  const assinar = ['AWS4-HMAC-SHA256', amz, escopo, sha(canon)].join('\n');
  const k = hmac(hmac(hmac(hmac(`AWS4${process.env.CF_R2_SECRET_ACCESS_KEY}`, dia), 'auto'), 's3'), 'aws4_request');
  const r = await fetch(`https://${host}/${BUCKET}/${chave}`, { method: 'PUT', headers: { 'Content-Type': 'image/png', 'x-amz-content-sha256': hashCorpo, 'x-amz-date': amz, 'Cache-Control': 'public, max-age=31536000, immutable', Authorization: `AWS4-HMAC-SHA256 Credential=${process.env.CF_R2_ACCESS_KEY_ID}/${escopo}, SignedHeaders=${nomes.join(';')}, Signature=${crypto.createHmac('sha256', k).update(assinar).digest('hex')}` }, body: corpo });
  if (!r.ok) throw new Error(`R2 ${r.status} ${(await r.text()).slice(0, 160)}`);
}

async function gravar() {
  const fora = new Set(fs.existsSync(`${pasta}/recusados.txt`) ? fs.readFileSync(`${pasta}/recusados.txt`, 'utf8').split(/\s+/).filter(Boolean) : []);
  const itens = fs.readFileSync(`${pasta}/manifesto.jsonl`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.arquivo && !fora.has(x.arquivo));
  const enviados = new Map();
  let n = 0;
  for (const x of itens) {
    if (!enviados.has(x.arquivo)) { const chave = `catalogo/recortes/${x.arquivo}`; await enviar(chave, fs.readFileSync(`${pasta}/${x.arquivo}`)); enviados.set(x.arquivo, `${R2_PUBLICO}${chave}`); }
    // a foto pode ter vindo de outra fonte: o crédito acompanha a foto que entrou
    const fonte = /openfoodfacts/.test(x.origem) ? ", fonte = 'OPENFOODFACTS', credito = 'Open Food Facts (CC BY-SA)'" : '';
    await sqlBruto(`update public.tabloide_catalogo set imagem_url = '${enviados.get(x.arquivo)}', recortada = true, recorte_tentado = true${fonte}, updated_at = now() where id = '${x.id}'`);
    n++;
  }
  console.log('linhas trocadas', n, 'arquivos', enviados.size);
}

/** Recorte antigo sem foto original para refazer: só limpa o contorno e dá nitidez. <pasta>/retocar.json = [{ id, url }]. */
async function retocar() {
  for (const { id, url } of JSON.parse(fs.readFileSync(`${pasta}/retocar.json`, 'utf8'))) {
    const b = Buffer.from(await (await fetch(url, { headers: UA })).arrayBuffer());
    const { data, info } = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height;
    const rec = new Uint8ClampedArray(data), foto = new Uint8ClampedArray(data);
    repararMordidas(foto, rec, w, h);
    acabamento(foto, rec, w, h);
    const escala = Math.max(1, Math.min(2.5, LADO / Math.max(w, h)));
    const W = Math.round(w * escala), H = Math.round(h * escala);
    const fin = new Uint8ClampedArray(await sharp(Buffer.from(rec), { raw: { width: w, height: h, channels: 4 } }).resize(W, H, { kernel: 'lanczos3' }).raw().toBuffer());
    realcar(fin, W, H, escala > 1 ? 0.8 : 0.4);
    const png = await sharp(Buffer.from(fin), { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
    const chave = `catalogo/recortes/${crypto.createHash('md5').update(png).digest('hex').slice(0, 16)}.png`;
    await enviar(chave, png);
    await sqlBruto(`update public.tabloide_catalogo set imagem_url = '${R2_PUBLICO}${chave}', updated_at = now() where id = '${id}'`);
    fs.writeFileSync(`${pasta}/retocada-${id}.png`, png);
    console.log('retocada', id);
  }
}

await (modo === 'gerar' ? gerar() : modo === 'retocar' ? retocar() : gravar());
