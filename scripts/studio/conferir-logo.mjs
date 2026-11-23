// F-355 — CONFERÊNCIA da logo do dono (REGRA DE TRABALHO do dono, 22/11/2026): "sempre analise a logo original e compare os erros
// que ainda existem usando as logos originais e as logos que você está consertando até corrigir por completo".
// Toda logo mexida por scripts/studio/espaco-da-logo.mjs é conferida AQUI, de perto, antes de publicar e de responder ao dono.
// Fundo cinza (#5a5e68) para enxergar transparência/furos. Manual completo: docs/studio/LOGOS_E_FUNDOS_DO_DONO.md
//
// Uso:
//   node scripts/studio/conferir-logo.mjs zonas <id> <saida.png>
//        cada zona de espaco-da-logo.json: original | corrigida | o que mudou (magenta), ampliados; conta mudados e furos
//   node scripts/studio/conferir-logo.mjs grade <imagem> <saida.png> [x y w h]     (PASSO=20 muda o espaçamento)
//        recorte com grade de coordenadas: para medir limites, curvas e centros em pixels do arquivo do dono
//   node scripts/studio/conferir-logo.mjs lado <a.png> <b.png> <saida.png> [x y w h] [zoom]
//        dois arquivos lado a lado (inteiros ou o mesmo recorte), para o antes e depois que vai ao dono
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const O = path.resolve(process.cwd(), '..', 'logos-de-promocao-originais');
const BG = { r: 90, g: 94, b: 104, alpha: 1 };
const [cmd, ...a] = process.argv.slice(2);

if (cmd === 'zonas') {
  const [id, saida] = a;
  const cfg = JSON.parse(fs.readFileSync('scripts/studio/espaco-da-logo.json', 'utf8'));
  const orig = path.join(O, `${id}.png`);
  const marca = crypto.createHash('sha256').update(fs.readFileSync(orig)).digest('hex').slice(0, 8);
  const limpa = path.join(O, `${id}-limpa-${marca}.png`);
  const A = await sharp(orig).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const B = await sharp(limpa).ensureAlpha().raw().toBuffer();
  const W = A.info.width, H = A.info.height, dif = Buffer.from(B);
  let mud = 0, furos = 0;
  for (let k = 0; k < W * H; k++) {
    if (A.data.readUInt32LE(k * 4) !== B.readUInt32LE(k * 4)) { mud++; dif.writeUInt32LE(0xffff00ff, k * 4); }
    if (A.data[k * 4 + 3] > 200 && B[k * 4 + 3] < A.data[k * 4 + 3] - 8) furos++;
  }
  const quadros = [];
  for (const z of cfg[id].zonas) {
    const [x0, y0, x1, y1] = z.limites, l = Math.max(0, x0 - 10), t = Math.max(0, y0 - 10);
    const r = { left: l, top: t, width: Math.min(W, x1 + 10) - l, height: Math.min(H, y1 + 10) - t };
    const esc = Math.min(4, 620 / r.width);
    const parte = (src, raw) => sharp(src, raw ? { raw: { width: W, height: H, channels: 4 } } : undefined).extract(r).flatten({ background: BG }).resize(Math.round(r.width * esc)).png().toBuffer();
    const p = [await parte(orig), await parte(limpa), await parte(dif, true)];
    const m = await sharp(p[0]).metadata();
    quadros.push(await sharp({ create: { width: m.width * 3 + 20, height: m.height, channels: 3, background: '#ffffff' } }).composite(p.map((input, i) => ({ input, left: i * (m.width + 10), top: 0 }))).png().toBuffer());
  }
  const ms = await Promise.all(quadros.map((q) => sharp(q).metadata()));
  let y = 0; const comp = quadros.map((input, i) => { const c = { input, left: 0, top: y }; y += ms[i].height + 10; return c; });
  await sharp({ create: { width: Math.max(...ms.map((m) => m.width)), height: y, channels: 3, background: '#ffffff' } }).composite(comp).png().toFile(saida);
  console.log(`${id}: ${mud} pontos mudados, ${furos} furos (tem de ser 0) → ${saida}`);
} else if (cmd === 'grade') {
  const [img, saida, ...r] = a;
  const m = await sharp(img).metadata();
  const [x, y, w, h] = r.length ? r.map(Number) : [0, 0, m.width, m.height];
  const passo = Number(process.env.PASSO) || (w > 900 ? 100 : 50), esc = Math.max(1, Math.min(8, 1100 / w));
  let svg = '';
  for (let gx = Math.ceil(x / passo) * passo; gx < x + w; gx += passo) svg += `<line x1="${(gx - x) * esc}" y1="0" x2="${(gx - x) * esc}" y2="${h * esc}" stroke="#00e5ff" opacity=".7"/><text x="${(gx - x) * esc + 2}" y="14" font-size="13" fill="#00e5ff" font-family="Arial">${gx}</text>`;
  for (let gy = Math.ceil(y / passo) * passo; gy < y + h; gy += passo) svg += `<line x1="0" y1="${(gy - y) * esc}" x2="${w * esc}" y2="${(gy - y) * esc}" stroke="#ff2bd6" opacity=".7"/><text x="2" y="${(gy - y) * esc - 2}" font-size="13" fill="#ff2bd6" font-family="Arial">${gy}</text>`;
  const W2 = Math.round(w * esc), H2 = Math.round(h * esc);
  const recorte = await sharp(img).extract({ left: x, top: y, width: w, height: h }).resize(W2, H2, { kernel: 'lanczos3' }).toBuffer();
  await sharp({ create: { width: W2, height: H2, channels: 4, background: BG } }).composite([{ input: recorte }, { input: Buffer.from(`<svg width="${W2}" height="${H2}">${svg}</svg>`) }]).png().toFile(saida);
  console.log(`${path.basename(img)} ${m.width}x${m.height} → ${saida}`);
} else if (cmd === 'lado') {
  const [fa, fb, saida, ...r] = a;
  const ma = await sharp(fa).metadata();
  const [x, y, w, h, z] = r.length >= 4 ? r.map(Number) : [0, 0, ma.width, ma.height, Number(r[0]) || 0];
  const k = z || Math.min(4, 600 / w);
  const parte = (f) => sharp(f).extract({ left: x, top: y, width: w, height: h }).flatten({ background: BG }).resize(Math.round(w * k)).png().toBuffer();
  const [pa, pb] = [await parte(fa), await parte(fb)];
  const m = await sharp(pa).metadata();
  await sharp({ create: { width: m.width * 2 + 10, height: m.height, channels: 3, background: '#222222' } }).composite([{ input: pa, left: 0, top: 0 }, { input: pb, left: m.width + 10, top: 0 }]).png().toFile(saida);
  console.log(`antes | depois → ${saida}`);
} else {
  console.error('Uso: node scripts/studio/conferir-logo.mjs zonas <id> <saida.png> | grade <imagem> <saida.png> [x y w h] | lado <a> <b> <saida.png> [x y w h] [zoom]');
  process.exit(1);
}
