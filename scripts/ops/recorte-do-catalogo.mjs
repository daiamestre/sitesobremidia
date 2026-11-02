/**
 * Partes comuns do trabalho em lote no catálogo de produtos: baixar a foto, recortar na Cloudflare, inspecionar (mesmas contas do
 * site, qualidadeRecorte.ts), IA de visão e envio ao R2. Usado por refazer-recortes-catalogo.mjs e importar-open-facts.mjs.
 */
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { exigir } from './segredos.mjs';
import { acabamento, inspecionar, realcar, repararMordidas } from '../../src/lib/tabloide/qualidadeRecorte.ts';

const require = createRequire(import.meta.url);
export const sharp = require('sharp');
exigir('TABLOIDE_IA_URL', 'TABLOIDE_IA_SEGREDO', 'SUPABASE_ACCESS_TOKEN');
export const UA = { 'User-Agent': 'SobreMidia-Tabloide/1.0 (contato@sobremidia.com.br)' };
export const LADO = 1200;

export const sqlBruto = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  if (!r.ok) throw new Error(`sql ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
};

export const tamanhoReal = (u) => (/openfoodfacts\.org\/images\/products\//.test(u) ? u.replace(/\.\d+\.(jpg|jpeg|png)$/i, '.full.$1') : u);

export async function baixar(url) {
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
export async function recortar(url, bytes, nome) {
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

/** Assinatura do R2, igual à de cadastrar-logo-cabecalho.mjs. */
export async function enviar(chave, corpo) {
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
