// F-357 (pedido do dono, 23/11/2026): no fundo de Black Friday com fitas, vários "BLACK FRIDAY" das plaquinhas amarelas
// vieram com letras quebradas ("PRIDAY", letras brancas pela metade). Corrige SÓ o texto: em cada plaquinha indicada,
// as letras saem (o lugar recebe o próprio amarelo em volta, suave) e "BLACK / FRIDAY" é escrito de novo no mesmo lugar,
// tamanho e inclinação, na fonte grossa (Montserrat 800) e na cor das letras originais. A fita, as listras pretas e todo o
// resto continuam idênticos ao arquivo do dono. Plaquinha cortada (na borda ou embaixo da outra fita) fica como está.
// Uso: node scripts/studio/corrigir-texto-das-fitas.mjs <entrada.png> <saida.png> [mascara.png]
import fs from 'node:fs';
import { chromium } from 'playwright';

const [entrada, saida, mascara] = process.argv.slice(2);
const pontos = JSON.parse(fs.readFileSync('scripts/studio/fitas-black-friday.json', 'utf8')).plaquinhas;
const b64 = fs.readFileSync(entrada).toString('base64');
const navegador = await chromium.launch();
const pagina = await navegador.newPage();
await pagina.setContent(`<html><head><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@900&display=block" rel="stylesheet"></head><body></body></html>`);
await pagina.evaluate(() => document.fonts.load('900 40px Montserrat'));
const r = await pagina.evaluate(async ({ b64, comMascara, pontos }) => {
  const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
  const W = img.width, H = img.height, N = W * H;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, W, H), d = id.data;
  const amarelo = (k) => { const r = d[k * 4], g = d[k * 4 + 1], b = d[k * 4 + 2]; return r > 120 && g > 70 && r - b > 70 && r >= g && g - b > 30; };
  const texto = new Uint8Array(N); const placas = [];
  // cada plaquinha com defeito é indicada à mão (centro do texto em scripts/studio/fitas-black-friday.json): as letras são os
  // pedaços não-amarelos perto do centro que NÃO encostam na borda da janela (as listras pretas encostam e ficam de fora)
  for (const [sx, sy, J0] of pontos) {
    const J = Math.round(J0 * 1.4);
    const x0 = Math.max(0, sx - J), y0 = Math.max(0, sy - J), x1 = Math.min(W - 1, sx + J), y1 = Math.min(H - 1, sy + J);
    const naJanela = (x, y) => x >= x0 && y >= y0 && x <= x1 && y <= y1;
    // 1) a PLAQUINHA: o amarelo ligado ao centro (dentro da janela)
    let semente = -1; for (let r = 0; r < 30 && semente < 0; r++) for (let dy = -r; dy <= r && semente < 0; dy++) for (let dx = -r; dx <= r; dx++) { const q = (sy + dy) * W + sx + dx; if (amarelo(q)) { semente = q; break; } }
    if (semente < 0) continue;
    const placa = new Uint8Array(N); { const pilha = [semente]; placa[semente] = 1; while (pilha.length) { const k = pilha.pop(), x = k % W, y = (k / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!naJanela(nx, ny)) continue; const q = ny * W + nx; if (!placa[q] && amarelo(q)) { placa[q] = 1; pilha.push(q); } } } }
    // 2) o que fica FORA da plaquinha (listras, tijolos, fundo): tudo o que se alcança da borda da janela sem cruzar o amarelo
    const fora = new Uint8Array(N); { const pilha = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ((x === x0 || y === y0 || x === x1 || y === y1) && !placa[y * W + x]) { fora[y * W + x] = 1; pilha.push(y * W + x); }
      while (pilha.length) { const k = pilha.pop(), x = k % W, y = (k / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!naJanela(nx, ny)) continue; const q = ny * W + nx; if (!fora[q] && !placa[q]) { fora[q] = 1; pilha.push(q); } } } }
    // 3) as LETRAS: o que fica cercado pela plaquinha (preto, branco ou dourado, quebrado ou não)
    const letras = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const q = y * W + x; if (!placa[q] && !fora[q]) letras.push(q); }
    if (letras.length < 150) continue;
    let mx = 0, my = 0; for (const k of letras) { mx += k % W; my += (k / W) | 0; } mx /= letras.length; my /= letras.length;
    let sxx = 0, syy = 0, sxy = 0; for (const k of letras) { const x = (k % W) - mx, y = ((k / W) | 0) - my; sxx += x * x; syy += y * y; sxy += x * y; }
    let th = 0.5 * Math.atan2(2 * sxy, sxx - syy); if (Math.cos(th) < 0) th += Math.PI;
    const cu = Math.cos(th), su = Math.sin(th);
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9; for (const k of letras) { const x = (k % W) - mx, y = ((k / W) | 0) - my; const u = x * cu + y * su, v = -x * su + y * cu; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const esc = letras.map((k) => [d[k * 4], d[k * 4 + 1], d[k * 4 + 2]]).filter(([r, g, b]) => r + g + b < 150);
    const cor = esc.length ? esc.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]).map((v) => Math.round(v / esc.length)) : [20, 14, 8];
    // 4) sai: as letras + o amarelo da plaquinha no retângulo do texto (restos dourados), menos a beirada (3 px do lado de fora)
    const pertoDoFora = (x, y) => { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const q = (y + dy) * W + x + dx; if (fora[q]) return true; } return false; };
    const fol = Math.max(3, (v1 - v0) * 0.1);
    for (const k of letras) texto[k] = 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const q = y * W + x; if (!placa[q]) continue; const X = x - mx, Y = y - my; const u = X * cu + Y * su, v = -X * su + Y * cu; if (u >= u0 - fol && u <= u1 + fol && v >= v0 - fol && v <= v1 + fol && !pertoDoFora(x, y)) texto[q] = 1; }
    placas.push({ mx, my, th, u0, u1, v0, v1, cor, letras, J });
  }
  // as letras (e a borda suave delas) saem: o amarelo em volta preenche suave
  // a borda suave das letras (não a das listras: listra é grande e encosta na janela, já ficou de fora)
  for (let i = 0; i < 2; i++) { const n = texto.slice(); for (let k = W; k < N - W; k++) if (!texto[k] && (texto[k - 1] || texto[k + 1] || texto[k - W] || texto[k + W]) && !amarelo(k) && (d[k * 4] + d[k * 4 + 1] + d[k * 4 + 2]) > 90) n[k] = 1; texto.set(n); }
  const ks = []; for (let k = 0; k < N; k++) if (texto[k]) ks.push(k);
  const v = new Float32Array(N * 3); for (let k = 0; k < N; k++) for (let c2 = 0; c2 < 3; c2++) v[k * 3 + c2] = d[k * 4 + c2];
  for (const k of ks) { const y = (k / W) | 0, x = k % W; let a = x, b = x; while (texto[y * W + a]) a--; while (texto[y * W + b]) b++; const t = (x - a) / (b - a); for (let c2 = 0; c2 < 3; c2++) v[k * 3 + c2] = d[(y * W + a) * 4 + c2] * (1 - t) + d[(y * W + b) * 4 + c2] * t; }
  const vale = new Uint8Array(N); for (let k = 0; k < N; k++) vale[k] = texto[k] || amarelo(k) ? 1 : 0;
  for (let it = 0; it < 1500; it++) for (const k of ks) for (let c2 = 0; c2 < 3; c2++) { let t = 0, n = 0; for (const q of [k - 1, k + 1, k - W, k + W]) if (vale[q]) { t += v[q * 3 + c2]; n++; } if (n) v[k * 3 + c2] += 1.9 * (t / n - v[k * 3 + c2]); }
  for (const k of ks) for (let c2 = 0; c2 < 3; c2++) d[k * 4 + c2] = Math.max(0, Math.min(255, Math.round(v[k * 3 + c2])));
  ctx.putImageData(id, 0, 0);
  // a inclinação do texto = a da FITA: borda de cima e de baixo da plaquinha (já sem as letras), em várias colunas
  const am2 = (x, y) => { const k = (y * W + x) * 4; const r = d[k], g = d[k + 1], b = d[k + 2]; return r > 120 && g > 70 && r - b > 70 && r >= g && g - b > 30; };
  for (const p of placas) {
    const ajustar = (pts) => { const n = pts.length; if (n < 4) return null; const ax = pts.reduce((a, q) => a + q[0], 0) / n, ay = pts.reduce((a, q) => a + q[1], 0) / n; let sxx = 0, sxy = 0; for (const [x, y] of pts) { sxx += (x - ax) ** 2; sxy += (x - ax) * (y - ay); } return Math.atan(sxy / sxx); };
    const cima = [], baixo = [];
    for (let x = Math.round(p.mx - p.J * 0.5); x <= Math.round(p.mx + p.J * 0.5); x += 2) {
      let y = Math.round(p.my); if (!am2(x, y)) continue;
      let a = y; while (a > 0 && am2(x, a - 1)) a--; let b = y; while (b < H - 1 && am2(x, b + 1)) b++;
      if (y - a < p.J * 1.3) cima.push([x, a]); if (b - y < p.J * 1.3) baixo.push([x, b]);
    }
    const t1 = ajustar(cima), t2 = ajustar(baixo); const ts = [t1, t2].filter((t) => t !== null && Math.abs(t - p.th) < 0.35);
    if (ts.length) {
      p.th = ts.reduce((a, t) => a + t, 0) / ts.length;
      const cu = Math.cos(p.th), su = Math.sin(p.th); p.u0 = 1e9; p.u1 = -1e9; p.v0 = 1e9; p.v1 = -1e9;
      for (const k of p.letras) { const X = (k % W) - p.mx, Y = ((k / W) | 0) - p.my; const u = X * cu + Y * su, v = -X * su + Y * cu; p.u0 = Math.min(p.u0, u); p.u1 = Math.max(p.u1, u); p.v0 = Math.min(p.v0, v); p.v1 = Math.max(p.v1, v); }
    }
  }
  // "BLACK / FRIDAY" de novo, alinhado à esquerda, no lugar exato do texto antigo
  for (const p of placas) {
    const alt = p.v1 - p.v0, larg = p.u1 - p.u0;
    ctx.save(); ctx.translate(p.mx, p.my); ctx.rotate(p.th);
    ctx.font = '900 100px Montserrat';
    const mB = ctx.measureText('BLACK'), mF = ctx.measureText('FRIDAY');
    const capa = mB.actualBoundingBoxAscent; // altura da letra maiúscula a 100px
    const gap = 0.32; // espaço entre as linhas em relação à altura da letra
    const s = (alt * 0.86) / (capa * (2 + gap)) * 100; // as 2 linhas um pouco menores que o espaço do texto antigo
    const kx = Math.min(1.15, Math.max(0.85, (larg * 0.86) / ((Math.max(mB.width, mF.width) * s) / 100)));
    ctx.font = `900 ${s}px Montserrat`; ctx.fillStyle = `rgb(${p.cor.join(',')})`; ctx.textBaseline = 'alphabetic';
    const cap = (capa * s) / 100;
    ctx.scale(kx, 1);
    const largN = (Math.max(mB.width, mF.width) * s / 100) * kx, altN = cap * (2 + gap);
    const ux = (p.u0 + p.u1) / 2 - largN / 2, vy = (p.v0 + p.v1) / 2 - altN / 2; // centralizado no lugar do texto antigo
    ctx.fillText('BLACK', ux / kx - mB.actualBoundingBoxLeft * s / 100, vy + cap);
    ctx.fillText('FRIDAY', ux / kx - mF.actualBoundingBoxLeft * s / 100, vy + cap * (2 + gap));
    ctx.restore();
  }
  let m = null;
  if (comMascara) { const c3 = document.createElement('canvas'); c3.width = W; c3.height = H; const x3 = c3.getContext('2d'); x3.drawImage(c, 0, 0); x3.fillStyle = 'rgba(255,0,255,0.55)'; for (const k of ks) x3.fillRect(k % W, (k / W) | 0, 1, 1); m = c3.toDataURL('image/png'); }
  return { png: c.toDataURL('image/png'), mascara: m, placas: placas.length };
}, { b64, comMascara: !!mascara, pontos });
fs.writeFileSync(saida, Buffer.from(r.png.split(',')[1], 'base64'));
if (mascara && r.mascara) fs.writeFileSync(mascara, Buffer.from(r.mascara.split(',')[1], 'base64'));
await navegador.close();
console.log(`ok: ${r.placas} plaquinhas com "BLACK FRIDAY" reescrito → ${saida}`);
