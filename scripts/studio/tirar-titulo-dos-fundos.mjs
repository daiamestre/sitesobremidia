// F-248 — tira a logo que veio gravada nos fundos oficiais, para ela virar uma camada que o cliente pode trocar.
// O que fica atrás é recomposto com o próprio fundo: a área é preenchida dobrando (espelhando) um trecho limpo da mesma arte,
// o que continua a curva, os raios e a textura sem emenda; moedas, ícones e textos ficam de fora da área.
// Gera <id>-v-st.webp, <id>-h-st.webp e as versões -limpo. Depois rode adaptar-encartes.mjs.
// Uso: node scripts/studio/tirar-titulo-dos-fundos.mjs
import sharp from 'sharp';

const PASTA = 'public/studio/encartes-oficiais';
const dobra = (v, a, b) => { const t = b - a, r = ((v - a) % (2 * t) + 2 * t) % (2 * t); return Math.round(a + (r <= t ? r : 2 * t - r)); };
const longe = (x, y, d) => d.every(([cx, cy, r]) => Math.hypot(x - cx, y - cy) > r);

const TRABALHOS = [
  // [id, formato, largura, área(x, y) → 0 a 1, origem(x, y) → [x, y]]
  ['mega-oferta-bicolor', 'v', (x, y) => borda(Math.min(655 - x, 556 - y), 16, y > 500), (x, y) => [x, dobra(y, 556, 1200)]],
  ['mega-oferta-bicolor', 'h', (x, y) => borda(Math.min(900 - x, 520 - y), 16, y > 475), (x, y) => [x, dobra(y, 520, 940)]],
  ['semana-do-frango', 'v', (x, y) => (longe(x, y, [[98, 141, 106], [15, 526, 116]]) ? borda(Math.min(x - 96, (y < 288 ? 745 : 795) - x, 600 - y), 26) : 0), (x, y) => [dobra(x, 150, 560), dobra(y, 660, 1200)]],
  ['semana-do-frango', 'h', (x, y) => (longe(x, y, [[163, 134, 130], [45, 420, 122]]) ? borda(Math.min(x - 190, (y < 240 ? 972 : 1040) - x, 600 - y), 22) : 0), (x, y) => [dobra(x, 230, 900), dobra(y, 610, 960)]],
];
function borda(d, f, semBorda = false) { if (d <= 0) return 0; return semBorda ? 1 : Math.min(1, d / f); }

for (const [id, f, area, origem] of TRABALHOS) {
  for (const fim of ['', '-limpo']) {
    const { data, info } = await sharp(`${PASTA}/${id}-${f}${fim}.webp`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: W, height: H, channels: C } = info;
    const novo = Buffer.from(data);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const a = area(x, y);
      if (a <= 0) continue;
      const [sx, sy] = origem(x, y);
      const i = (y * W + x) * C, j = (Math.min(H - 1, sy) * W + Math.min(W - 1, sx)) * C;
      for (let k = 0; k < 3; k++) novo[i + k] = Math.round(data[j + k] * a + data[i + k] * (1 - a));
    }
    await sharp(novo, { raw: info }).webp({ quality: 90 }).toFile(`${PASTA}/${id}-${f}-st${fim}.webp`);
  }
}
console.log('fundos sem título prontos');

// Palco de Ofertas (Alerta de Oferta): aqui o fundo são raios saindo do centro, então cada ponto da área continua o seu raio:
// a cor vem da borda da área, na mesma direção. A fita amarela do canto fica; a logo sai.
const PALCO = [
  // [formato, centro dos raios, área (x0, x1, y1), fita (a, b: fica o que está acima da reta y = a - b·x)]
  ['v', [540, 130], [46, 1050, 716], [112, 0.22]],
  ['h', [960, 60], [440, 1500, 606], [190, 0.264]],
];
for (const [f, [cx, cy], [x0, x1, y1], [fa, fb]] of PALCO) {
  const { data, info } = await sharp(`public/studio/palco/alerta-de-oferta-${f}.webp`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const preench = Buffer.from(data);
  for (let y = 0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    let dx = x - cx, dy = y - cy;
    if (dy < 0) dy = -dy; // para cima não há fundo limpo: usa a direção espelhada para baixo
    const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
    const t = Math.min(dy > 1e-3 ? (y1 + 14 - cy) / dy : 1e9, dx > 1e-3 ? (x1 + 14 - cx) / dx : dx < -1e-3 ? (x0 - 14 - cx) / dx : 1e9);
    const sx = Math.max(0, Math.min(W - 1, Math.round(cx + dx * t))), sy = Math.max(0, Math.min(H - 1, Math.round(cy + dy * t)));
    // a fita fica de fora: se a borda cair nela, usa o lado oposto
    const tx = sy < fa - fb * sx + 30 ? Math.min(W - 1, 2 * cx - sx) : sx;
    const a = (y * W + x) * C, b = (sy * W + tx) * C;
    for (let k = 0; k < 3; k++) preench[a + k] = data[b + k];
  }
  const suave = await sharp(preench, { raw: info }).blur(7).raw().toBuffer();
  const novo = Buffer.from(data);
  for (let y = 0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (y < fa - fb * x + 10) continue;
    const a = Math.min(1, Math.min(x - x0, x1 - x, y1 - y) / 28);
    if (a <= 0) continue;
    const i = (y * W + x) * C;
    for (let k = 0; k < 3; k++) novo[i + k] = Math.round(suave[i + k] * a + data[i + k] * (1 - a));
  }
  await sharp(novo, { raw: info }).webp({ quality: 90 }).toFile(`public/studio/palco/alerta-de-oferta-${f}-st.webp`);
}
console.log('palco sem título pronto');
