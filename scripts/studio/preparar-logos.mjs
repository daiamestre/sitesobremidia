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

// a redoma da sirene no arquivo original (o que está dentro dela fica)
const REDOMA = [[596, 310], [618, 190], [640, 90], [690, 42], [772, 32], [855, 42], [905, 90], [930, 190], [952, 310]];
const SOBRA = 140; // espaço acima da arte, para o clarão não cortar
const LAMPADA = [772, 175 + SOBRA];
function naRedoma(x, y) {
  let dentro = false;
  for (let i = 0, j = REDOMA.length - 1; i < REDOMA.length; j = i++) {
    const [xi, yi] = REDOMA[i], [xj, yj] = REDOMA[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}
function tirarClarao(rgba, W, H) {
  for (let y = 0; y < Math.min(H, 240); y++) for (let x = 500; x < 1045; x++) {
    if (naRedoma(x, y)) continue;
    const i = (y * W + x) * 4;
    if (rgba[i + 1] > 70 || rgba[i + 3] < 255) rgba[i + 3] = 0; // laranja e amarelo do clarão; o vermelho da peça fica
  }
}
async function comClarao(png, W, H) {
  const [cx, cy] = LAMPADA;
  const raios = Array.from({ length: 28 }, (_, k) => {
    const a = (k / 28) * Math.PI * 2 + (k % 2 ? 0.05 : 0), comp = k % 2 ? 330 : 430, larg = 0.035;
    const p = (r, t) => `${(cx + Math.cos(t) * r).toFixed(1)},${(cy + Math.sin(t) * r).toFixed(1)}`;
    return `<polygon points="${p(70, a - larg)} ${p(comp, a)} ${p(70, a + larg)}" fill="url(#raio)"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + SOBRA}">
    <defs>
      <radialGradient id="halo" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="360"><stop offset="0" stop-color="#fff6c8" stop-opacity=".95"/><stop offset=".3" stop-color="#ffd23c" stop-opacity=".72"/><stop offset=".62" stop-color="#ff8a1e" stop-opacity=".3"/><stop offset="1" stop-color="#ff5a14" stop-opacity="0"/></radialGradient>
      <radialGradient id="raio" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="430"><stop offset="0" stop-color="#fffbe0" stop-opacity=".95"/><stop offset=".55" stop-color="#ffd84a" stop-opacity=".55"/><stop offset="1" stop-color="#ffb030" stop-opacity="0"/></radialGradient>
      <filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
    </defs>
    <circle cx="${cx}" cy="${cy}" r="360" fill="url(#halo)"/><g filter="url(#b)">${raios}</g>
  </svg>`;
  // só em cima da peça: embaixo, a própria logo cobre
  return sharp(Buffer.from(svg)).composite([{ input: png, left: 0, top: SOBRA }]).png().toBuffer();
}

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
  // Alerta de Oferta: o clarão da sirene sobre o branco não vira transparência limpa (fica com borda dura e recortada).
  // Ele sai e entra um clarão desenhado POR TRÁS da sirene, com raios e queda suave, que funde com qualquer fundo.
  if (id === 'alerta-de-oferta') tirarClarao(rgba, W, H);
  let png = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  if (id === 'alerta-de-oferta') png = await comClarao(png, W, H);
  const saida = `public/studio/logos/${id}.webp`;
  await sharp(await sharp(png).trim({ threshold: 2, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer().catch(() => png)).webp({ quality: 95, alphaQuality: 100 }).toFile(saida);
  const m = await sharp(saida).metadata();
  console.log(id, m.width, m.height, m.hasAlpha);
}
