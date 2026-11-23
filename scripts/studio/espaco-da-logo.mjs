// F-355 — EXCEÇÃO PEDIDA PELO DONO (22/11/2026): nas logos com dizeres de modelo ("YOUR LOGO HERE", "SUA LOGO",
// "ALPHA BACKGROUND" e o círculo de xadrez pintado), SÓ esses dizeres saem; o lugar vira espaço para o nome e a logo da
// empresa do usuário (src/lib/studio/logoPersonalizada.ts). Todo o resto da logo continua IGUAL ao arquivo do dono: a
// receita só mexe dentro dos 'limites' de scripts/studio/espaco-da-logo.json, e o teste logosDePromocao355 confere
// pixel a pixel que fora deles nada mudou.
// Uso: node scripts/studio/espaco-da-logo.mjs <id>
//   lê  ../logos-de-promocao-originais/<id>.png (copiado pela receita logos-de-promocao.mjs)
//   faz ../logos-de-promocao-originais/<id>-limpa-<marca do original>.png  (+ <id>-frente-<marca>.png quando há círculo)
//   depois rode de novo a receita da logo, que publica a versão limpa.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ORIGINAIS = path.resolve(process.cwd(), '..', 'logos-de-promocao-originais');
const CFG = JSON.parse(fs.readFileSync('scripts/studio/espaco-da-logo.json', 'utf8'));
const id = process.argv[2];
const cfg = CFG[id];
if (!cfg) { console.error(`Sem configuração para "${id}" em scripts/studio/espaco-da-logo.json`); process.exit(1); }

const neutro = (r, g, b, tol) => Math.max(r, g, b) - Math.min(r, g, b) <= tol;
const REGRAS = {
  branco: (r, g, b) => neutro(r, g, b, 60) && (r + g + b) / 3 > 165,
  clarinho: (r, g, b) => neutro(r, g, b, 50) && (r + g + b) / 3 > 95,
  claroNeutro: (r, g, b) => neutro(r, g, b, 14) && (r + g + b) / 3 > 150,
  escuroNeutro: (r, g, b) => neutro(r, g, b, 22) && (r + g + b) / 3 < 75,
  vermelhoVivo: (r, g, b) => r > 165 && g < 32 && b < 38,
  vermelhoTexto: (r, g, b) => r - g > 70 && r - b > 70,
};
const naCaixa = (x, y, c) => x >= c[0] && y >= c[1] && x < c[2] && y < c[3];
const noCirculo = (x, y, c) => (x - c[0]) ** 2 + (y - c[1]) ** 2 <= c[2] ** 2;
const dentro = (x, y, z) => (!z.circulo || noCirculo(x, y, z.circulo)) && (!z.caixa || naCaixa(x, y, z.caixa));
function noPoligono(x, y, p) { let d = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d; } return d; }
const VIZ4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const arqOriginal = path.join(ORIGINAIS, `${id}.png`);
const bruto = fs.readFileSync(arqOriginal);
const marca = crypto.createHash('sha256').update(bruto).digest('hex').slice(0, 8);
const { data, info } = await sharp(bruto).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, N = W * H;
const px = new Float32Array(data.length); for (let i = 0; i < data.length; i++) px[i] = data[i];
const M = new Uint8Array(N); // 0 = fica como o dono mandou; 1 espalhar, 2 clonar, 3 vertical

for (const z of cfg.zonas) {
  const [bx0, by0, bx1, by1] = z.limites;
  // quadradinho do xadrez pintado: cinza neutro, liso (vizinhos iguais) e num dos dois tons do xadrez
  const xadrez = (x, y) => { const i = (y * W + x) * 4, r = data[i]; if (!neutro(r, data[i + 1], data[i + 2], 4) || !((r >= 222 && r <= 230) || r >= 249)) return false; return [4, -4, W * 4, -W * 4].every((d) => Math.abs(data[i + d] - r) <= 2); };
  const prot = (x, y) => !(z.xadrezSai && xadrez(x, y)) && (z.proteger ?? []).some((p) => (typeof p[0] === 'number' ? naCaixa(x, y, p) : noPoligono(x, y, p)));
  const pode = (x, y) => x >= bx0 && y >= by0 && x < bx1 && y < by1 && dentro(x, y, z) && !prot(x, y);
  let sel = new Uint8Array(N);
  for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) { const i = (y * W + x) * 4; if (pode(x, y) && z.regras.some((r) => REGRAS[r](data[i], data[i + 1], data[i + 2]))) sel[y * W + x] = 1; }
  if (z.sementes) { // só o que está ligado às sementes (o anel e o xadrez são uma peça só; as letras da logo ficam de fora)
    const cand = sel; sel = new Uint8Array(N); const pilha = [];
    for (const [x, y] of z.sementes) if (cand[y * W + x]) { sel[y * W + x] = 1; pilha.push(y * W + x); }
    while (pilha.length) { const k = pilha.pop(), x = k % W, y = (k / W) | 0; for (const [dx, dy] of VIZ4) { const q = (y + dy) * W + x + dx; if (cand[q] && !sel[q]) { sel[q] = 1; pilha.push(q); } } }
  }
  if (z.buracos) { // o que ficou cercado pelo que sai (as letras de "ALPHA BACKGROUND" dentro do anel) também sai
    const fora = new Uint8Array(N); const pilha = [];
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) { const k = y * W + x; if (!sel[k] && (x === bx0 || y === by0 || x === bx1 - 1 || y === by1 - 1 || !pode(x, y))) { fora[k] = 1; pilha.push(k); } }
    while (pilha.length) { const k = pilha.pop(), x = k % W, y = (k / W) | 0; for (const [dx, dy] of VIZ4) { const nx = x + dx, ny = y + dy; if (nx < bx0 || ny < by0 || nx >= bx1 || ny >= by1) continue; const q = ny * W + nx; if (!sel[q] && !fora[q]) { fora[q] = 1; pilha.push(q); } } }
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) { const k = y * W + x; if (!fora[k]) sel[k] = 1; }
  }
  for (let it = 0; it < (z.crescer ?? 2); it++) { // pega o contorno suave dos dizeres
    const s2 = sel.slice();
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) { const k = y * W + x; if (!sel[k] && pode(x, y) && (sel[k - 1] || sel[k + 1] || sel[k - W] || sel[k + W])) s2[k] = 1; }
    sel = s2;
  }
  if (z.inteiro) for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) if (pode(x, y)) sel[y * W + x] = 1;
  const modo = { espalhar: 1, clonar: 2, vertical: 3 }[z.preencher];
  for (let k = 0; k < N; k++) if (sel[k]) M[k] = modo;
}

// PREENCHER o lugar dos dizeres com o que está em volta
const pend = M.map((m) => (m ? 1 : 0));
const amostra = (x, y) => { const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0; const o = [0, 0, 0, 0]; for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) { const xx = Math.min(W - 1, x0 + dx), yy = Math.min(H - 1, y0 + dy); for (let c = 0; c < 4; c++) o[c] += data[(yy * W + xx) * 4 + c] * w; } return o; };
if (cfg.clonar) { // o círculo sai inteiro: o que ficava atrás dele (borda da tábua, fogo, aro) é a mesma peça girada em volta do centro
  const { centro: [cx, cy], graus, sujo = [], fora = Infinity } = cfg.clonar; const t = (graus * Math.PI) / 180, co = Math.cos(t), si = Math.sin(t);
  for (let k = 0; k < N; k++) {
    if (M[k] !== 2) continue; const dx = (k % W) - cx, dy = ((k / W) | 0) - cy; const sx = cx + dx * co - dy * si, sy = cy + dx * si + dy * co;
    if (Math.hypot(dx, dy) > fora || sx < 0 || sy < 0 || sx >= W - 1 || sy >= H - 1) { px.set([0, 0, 0, 0], k * 4); pend[k] = 0; continue; }
    if (M[Math.round(sy) * W + Math.round(sx)] || sujo.some((c) => naCaixa(sx, sy, c))) continue;
    px.set(amostra(sx, sy), k * 4); pend[k] = 0;
  }
}
for (let k = 0; k < N; k++) if (M[k] === 3 && pend[k]) { // vertical: liga a cor de cima à de baixo (veios da madeira, dobras do pano)
  const x = k % W; let a = (k / W) | 0, b = a; while (a > 0 && M[a * W + x] === 3) a--; while (b < H - 1 && M[b * W + x] === 3) b++;
  for (let y = a + 1; y < b; y++) { const t = (y - a) / (b - a); for (let c = 0; c < 4; c++) px[(y * W + x) * 4 + c] = data[(a * W + x) * 4 + c] * (1 - t) + data[(b * W + x) * 4 + c] * t; pend[y * W + x] = 0; }
}
for (let volta = 0; volta < 4000; volta++) { // o resto: a cor dos vizinhos entra de fora para dentro
  const nov = [];
  for (let k = 0; k < N; k++) {
    if (!pend[k]) continue; const x = k % W, y = (k / W) | 0; const s = [0, 0, 0, 0]; let n = 0;
    for (const [dx, dy] of [...VIZ4, [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const q = ny * W + nx; if (pend[q]) continue; for (let c = 0; c < 4; c++) s[c] += px[q * 4 + c]; n++; }
    if (n >= 2) nov.push([k, s.map((v) => v / n)]);
  }
  for (const [k, v] of nov) { px.set(v, k * 4); pend[k] = 0; }
  if (!nov.length) break;
}

const out = Buffer.alloc(data.length); for (let i = 0; i < data.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(px[i])));
for (const x of fs.readdirSync(ORIGINAIS)) if (x.startsWith(`${id}-limpa-`) || x.startsWith(`${id}-frente-`)) fs.rmSync(path.join(ORIGINAIS, x));
await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toFile(path.join(ORIGINAIS, `${id}-limpa-${marca}.png`));
if (cfg.frente) { // a FRENTE: os pixels do dono que ficavam na frente do círculo (iguais ao original), para voltar por cima da logo do usuário
  const f = Buffer.alloc(data.length);
  for (let k = 0; k < N; k++) { const x = k % W, y = (k / W) | 0; if (!M[k] && noCirculo(x, y, cfg.frente)) for (let c = 0; c < 4; c++) f[k * 4 + c] = data[k * 4 + c]; }
  await sharp(f, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toFile(path.join(ORIGINAIS, `${id}-frente-${marca}.png`));
}
let n = 0; for (let k = 0; k < N; k++) if (M[k]) n++;
console.log(`ok ${id}: ${n} pixels dos dizeres trocados (só dentro dos limites); o resto é o arquivo do dono`);
