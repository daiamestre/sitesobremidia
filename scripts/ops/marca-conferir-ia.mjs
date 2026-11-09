/**
 * Missão do catálogo (F-276) — CONFERÊNCIA DUPLA DO RECORTE (ordem do dono, 09/11/2026: nenhum produto com parte cortada, sobra,
 * sombra ou reflexo). Cada foto aprovada por marca-recortar-local.mjs é recortada DE NOVO pela IA (BiRefNet_lite, a mesma família
 * do recorte da Cloudflare e do Removedor de Fundo SOBRE MÍDIA) e os dois contornos são comparados:
 *   - "comido": a IA tem certeza de que é produto e o recorte apagou  → parte do produto cortada  → RECUSADA
 *   - "sobra":  a IA tem certeza de que é fundo e o recorte manteve     → sombra/reflexo/sobra       → RECUSADA
 * Só entra no catálogo o que os dois métodos concordam. Recusados vão para <pasta>/recusados.txt (motivo em conferencia-ia.json).
 *   node scripts/ops/marca-conferir-ia.mjs <pasta> [<pasta>...]      (ou --lista=arquivo.txt com uma pasta por linha)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const jiti = require('jiti')(import.meta.filename);
const { recortarFundo, apagarSelosSoltos } = jiti('../../src/lib/tabloide/recorte.ts');
const RAIZ = path.resolve(import.meta.dirname, '../..');
const { AutoModel, AutoProcessor, RawImage, env } = await import(pathToFileURL(path.join(RAIZ, 'node_modules/@huggingface/transformers/dist/transformers.node.mjs')).href);
env.cacheDir = path.resolve(RAIZ, '..', 'modelos-ia');

export const LIMITES_IA = { comido: 0.002, sobra: 0.008, certeza: 0.9 };
const LADO = 1400;
const args = process.argv.slice(2);
const lista = args.find((a) => a.startsWith('--lista='));
const pastas = lista ? fs.readFileSync(lista.slice(8), 'utf8').split(/\r?\n/).filter(Boolean) : args.filter((a) => !a.startsWith('--'));
if (!pastas.length) { console.log('uso: <pasta> [...] | --lista=arquivo'); process.exit(1); }

const ID = 'studioludens/birefnet-lite-512';
const modelo = await AutoModel.from_pretrained(ID, { dtype: 'fp32' });
const processador = await AutoProcessor.from_pretrained(ID);

/** Compara o recorte (alfa) com a máscara da IA (0–255) nos pontos em que a IA tem CERTEZA. */
export function compararComIA(alfa, mascara, n) {
  const sim = 255 * LIMITES_IA.certeza, nao = 255 * (1 - LIMITES_IA.certeza);
  let produto = 0, comido = 0, sobra = 0;
  for (let i = 0; i < n; i++) {
    const m = mascara[i], a = alfa[i * 4 + 3];
    if (m >= 128) produto++;
    if (m >= sim && a < 16) comido++;
    else if (m <= nao && a >= 128) sobra++;
  }
  produto = Math.max(1, produto);
  return { comido: comido / produto, sobra: sobra / produto, aprovado: comido / produto <= LIMITES_IA.comido && sobra / produto <= LIMITES_IA.sobra };
}

let total = 0, aprovados = 0;
for (const pasta of pastas) {
  const arqP = path.join(pasta, 'prontos.json');
  if (!fs.existsSync(arqP) || fs.existsSync(path.join(pasta, 'conferencia-ia.json'))) continue;
  const prontos = JSON.parse(fs.readFileSync(arqP, 'utf8'));
  const arqR = path.join(pasta, 'recusados.txt');
  const fora = new Set(fs.existsSync(arqR) ? fs.readFileSync(arqR, 'utf8').split(/\s+/).filter(Boolean) : []);
  const relatorio = {};
  let ok = 0, n = 0;
  for (const p of prontos) {
    if (fora.has(p.slug) || p.recorte !== 'local') continue;
    n++;
    try {
      const { data, info } = await sharp(path.join(pasta, 'oficial', p.arq)).rotate().resize(LADO, LADO, { fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const w = info.width, h = info.height;
      const alfa = new Uint8ClampedArray(data);
      if (!recortarFundo({ data: alfa, width: w, height: h })) { fora.add(p.slug); relatorio[p.slug] = 'recorte não refez'; continue; }
      const antes = new Uint8ClampedArray(alfa);
      apagarSelosSoltos(alfa, w, h);
      const rgb = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).removeAlpha().raw().toBuffer();
      const imagem = new RawImage(new Uint8ClampedArray(rgb), w, h, 3);
      const { pixel_values } = await processador(imagem);
      const saida = await modelo({ input_image: pixel_values });
      const logits = saida.logits ?? saida.output_image;
      const mascara = await RawImage.fromTensor(logits[0].sigmoid().mul(255).to('uint8')).resize(w, h);
      // selo solto fora do produto: a IA também não conta
      const m = new Uint8ClampedArray(mascara.data);
      for (let i = 0; i < w * h; i++) if (antes[i * 4 + 3] >= 16 && alfa[i * 4 + 3] < 16) m[i] = 0;
      const r = compararComIA(alfa, m, w * h);
      if (r.aprovado) { ok++; relatorio[p.slug] = `ok comido ${(r.comido * 100).toFixed(2)}% sobra ${(r.sobra * 100).toFixed(2)}%`; }
      else { fora.add(p.slug); relatorio[p.slug] = `RECUSADA comido ${(r.comido * 100).toFixed(2)}% sobra ${(r.sobra * 100).toFixed(2)}%`; }
    } catch (e) { fora.add(p.slug); relatorio[p.slug] = `erro ${String(e?.message ?? e).slice(0, 60)}`; }
  }
  fs.writeFileSync(arqR, [...fora].join('\n'));
  fs.writeFileSync(path.join(pasta, 'conferencia-ia.json'), JSON.stringify(relatorio, null, 1));
  total += n; aprovados += ok;
  console.log(`${path.basename(pasta).slice(0, 28).padEnd(29)} conferidas ${String(n).padStart(4)} | aprovadas pela IA ${String(ok).padStart(4)} | recusadas ${n - ok}`);
}
console.log(`RESULTADO conferidas ${total} | aprovadas ${aprovados} | recusadas ${total - aprovados}`);
