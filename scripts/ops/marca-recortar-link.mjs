/**
 * Missão do catálogo (F-274) — FOTO COM FUNDO (padrão de loja online) vira foto SEM FUNDO POR LINK, sem guardar cópia.
 *   node scripts/ops/marca-recortar-link.mjs <pasta da marca>
 * Para cada item de <pasta>/com-fundo.json (gerado por marca-loja.mjs):
 *   1) pede ao passa-foto a foto sem fundo (s=1, Cloudflare Images, o mesmo recorte do site);
 *   2) aprova SÓ se passar na inspeção de qualidade do site (src/lib/tabloide/qualidadeRecorte.ts), sem consertos;
 *   3) monta o link final (s=1, e o corte da sobra só quando ela é grande, para gastar menos da cota de transformações);
 *   4) guarda a prévia em <pasta>/pronto (só no PC, para a folha de conferência) e soma o item a <pasta>/prontos.json com `link`.
 * Cota: o plano grátis da Cloudflare Images tem 5.000 transformações diferentes por mês; acima disso o passa-foto devolve a foto
 * original (com fundo) e o item é recusado aqui (não entra com fundo).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { linkDaFoto } from './passa-foto.mjs';
import { inspecionar } from '../../src/lib/tabloide/qualidadeRecorte.ts';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const pasta = process.argv[2];
if (!pasta) { console.log('uso: <pasta da marca>'); process.exit(1); }
const AREA_SEM_CORTE = 0.6;
const itens = JSON.parse(fs.readFileSync(path.join(pasta, 'com-fundo.json'), 'utf8'));
const arqProntos = path.join(pasta, 'prontos.json');
const prontos = fs.existsSync(arqProntos) ? JSON.parse(fs.readFileSync(arqProntos, 'utf8')) : [];
const ja = new Set(prontos.map((p) => p.slug));
fs.mkdirSync(path.join(pasta, 'pronto'), { recursive: true });
const motivos = {};
let i = 0, aprovados = 0, semCota = 0;

const trabalhar = async () => {
  while (i < itens.length) {
    const x = itens[i++];
    if (ja.has(x.slug)) continue;
    const motivo = (m) => { motivos[m] = (motivos[m] ?? 0) + 1; };
    try {
      const r = await fetch(linkDaFoto(x.url, null, true), { signal: AbortSignal.timeout(60000) });
      if (!r.ok) { motivo(`http ${r.status}`); continue; }
      if (r.headers.get('x-passa-foto') !== '1') { semCota++; motivo('sem transformação (cota?)'); continue; }
      const seg = Buffer.from(await r.arrayBuffer());
      const { data, info } = await sharp(seg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const w = info.width, h = info.height;
      const foto = new Uint8ClampedArray(await sharp(path.join(pasta, 'oficial', x.arq)).rotate().resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer());
      const ins = inspecionar(new Uint8ClampedArray(data), w, h, foto);
      if (!ins.aprovado) { motivo(ins.defeitos.join('+') || 'reprovado'); continue; }
      const t = await sharp(seg).trim({ threshold: 0, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer({ resolveWithObject: true });
      const caixa = { left: -(t.info.trimOffsetLeft ?? 0), top: -(t.info.trimOffsetTop ?? 0), width: t.info.width, height: t.info.height };
      const util = (caixa.width * caixa.height) / (w * h);
      const link = linkDaFoto(x.url, util >= AREA_SEM_CORTE ? null : caixa, true);
      const final = `${x.slug}.png`;
      fs.writeFileSync(path.join(pasta, 'pronto', final), t.data);
      prontos.push({ ...x, final, W: caixa.width, H: caixa.height, link, transparente: 1, recorte: 'passa-foto' });
      aprovados++;
    } catch (e) { motivo(`erro ${String(e?.message ?? e).slice(0, 40)}`); }
  }
};
await Promise.all(Array.from({ length: 4 }, trabalhar));
fs.writeFileSync(arqProntos, JSON.stringify(prontos, null, 1));
console.log(`RESULTADO com fundo ${itens.length} | aprovados sem fundo ${aprovados} | reprovados ${itens.length - aprovados} | sem cota ${semCota} | motivos ${JSON.stringify(motivos)}`);
