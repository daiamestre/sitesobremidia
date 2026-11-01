// F-248 — prepara as logos oficiais do dono para o Studio: tira o fundo branco e corta as sobras.
// O fundo é o branco ligado à borda da imagem (o branco de dentro da logo fica); nessa área, o branco vira transparência
// por cor, o que preserva o brilho das luzes em volta da logo sobre qualquer fundo.
// Uso: node scripts/studio/preparar-logos.mjs
import os from 'node:os';
import sharp from 'sharp';

const DOWNLOADS = `${os.homedir()}/Downloads`;
const LOGOS = [
  ['mega-oferta', 'Emblema 3D Mega Oferta com Luzes.png'],
  ['semana-do-frango', 'Logo 3D Semana do Frango.png'],
  ['alerta-de-oferta', 'Alerta de Oferta em 3D (1).png'],
];

for (const [id, arquivo] of LOGOS) {
  const { data, info } = await sharp(`${DOWNLOADS}/${arquivo}`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const claro = (i) => Math.min(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]) > 150; // fundo e o brilho que se apaga nele
  const fora = new Uint8Array(W * H);
  const fila = [];
  const marcar = (i) => { if (!fora[i] && claro(i)) { fora[i] = 1; fila.push(i); } };
  for (let x = 0; x < W; x++) { marcar(x); marcar((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { marcar(y * W); marcar(y * W + W - 1); }
  while (fila.length) {
    const i = fila.pop();
    const x = i % W;
    if (x > 0) marcar(i - 1);
    if (x < W - 1) marcar(i + 1);
    if (i >= W) marcar(i - W);
    if (i < W * (H - 1)) marcar(i + W);
  }
  const rgba = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    let a = 255, cr = r, cg = g, cb = b;
    if (fora[i]) {
      // "cor para transparência": o quanto este pixel é branco some; a cor que sobra mantém o brilho
      const alfa = (255 - Math.min(r, g, b)) / 255;
      a = Math.round(alfa * 255);
      if (alfa > 0) { cr = (r - 255 * (1 - alfa)) / alfa; cg = (g - 255 * (1 - alfa)) / alfa; cb = (b - 255 * (1 - alfa)) / alfa; }
    }
    rgba[i * 4] = Math.max(0, Math.min(255, Math.round(cr)));
    rgba[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(cg)));
    rgba[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(cb)));
    rgba[i * 4 + 3] = a;
  }
  const png = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  const saida = `public/studio/logos/${id}.webp`;
  await sharp(await sharp(png).trim({ threshold: 2, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer().catch(() => png)).webp({ quality: 95, alphaQuality: 100 }).toFile(saida);
  const m = await sharp(saida).metadata();
  console.log(id, m.width, m.height, m.hasAlpha);
}
