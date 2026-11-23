// F-355 — EXCEÇÃO PEDIDA PELO DONO (22/11/2026): nas logos com dizeres de modelo ("YOUR LOGO HERE", "SUA LOGO",
// "ALPHA BACKGROUND" e o xadrez pintado), SÓ esses dizeres saem. NADA do desenho é inventado nem recortado: o aro, o disco
// e o pano continuam onde o dono desenhou (a 1ª versão tirava o círculo inteiro e "inventava" o fundo atrás dele: ficou
// recortada, e o dono reprovou).
//   aro     → letras em cima de um aro/alça: cada ponto da letra recebe a cor do PRÓPRIO aro ao lado, na mesma curva
//   xadrez  → o xadrez pintado vira branco (o "em branco" do dono); vira também a VAGA da logo do usuário
//   colunas → letras em cima de tábuas verticais: os veios de cima e de baixo continuam (espelhados) pelo lugar das letras
//   liso    → letras em pano/superfície lisa: o pano em volta preenche suave (equação de Laplace)
// Só mexe dentro dos 'limites' de cada zona (scripts/studio/espaco-da-logo.json); o teste logosDePromocao355 confere
// pixel a pixel que fora deles a logo é idêntica ao arquivo do dono.
// Uso: node scripts/studio/espaco-da-logo.mjs <id>
//   lê  ../logos-de-promocao-originais/<id>.png ; grava <id>-limpa-<marca>.png e, se houver xadrez, <id>-vaga-<marca>.png
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ORIGINAIS = path.resolve(process.cwd(), '..', 'logos-de-promocao-originais');
const CFG = JSON.parse(fs.readFileSync('scripts/studio/espaco-da-logo.json', 'utf8'));
const id = process.argv[2];
const cfg = CFG[id];
if (!cfg) { console.error(`Sem configuração para "${id}" em scripts/studio/espaco-da-logo.json`); process.exit(1); }

const bruto = fs.readFileSync(path.join(ORIGINAIS, `${id}.png`));
const marca = crypto.createHash('sha256').update(bruto).digest('hex').slice(0, 8);
const { data, info } = await sharp(bruto).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, N = W * H;
const out = Buffer.from(data);
const vaga = new Uint8Array(N); // onde a logo do usuário aparece
const VIZ4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const lum = (k) => (data[k * 4] + data[k * 4 + 1] + data[k * 4 + 2]) / 3;
const neutro = (k) => Math.max(data[k * 4], data[k * 4 + 1], data[k * 4 + 2]) - Math.min(data[k * 4], data[k * 4 + 1], data[k * 4 + 2]);
const naCaixa = (x, y, c) => x >= c[0] && y >= c[1] && x < c[2] && y < c[3];
function noPoligono(x, y, p) { let d = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d; } return d; }
const protegido = (z, x, y) => (z.proteger ?? []).some((p) => (typeof p[0] === 'number' ? naCaixa(x, y, p) : noPoligono(x, y, p)));
const amostra = (buf, x, y) => { const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0; const o = [0, 0, 0, 0]; for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) { const k = (Math.min(H - 1, y0 + dy) * W + Math.min(W - 1, x0 + dx)) * 4; for (let c = 0; c < 4; c++) o[c] += buf[k + c] * w; } return o; };
const crescer = (m, vezes, pode) => { for (let i = 0; i < vezes; i++) { const n = m.slice(); for (let k = W; k < N - W; k++) if (!m[k] && pode(k % W, (k / W) | 0) && (m[k - 1] || m[k + 1] || m[k - W] || m[k + W])) n[k] = 1; m.set(n); } };
let mexidos = 0;
/** preenche os pontos marcados com a cor de volta, suave (equação de Laplace) */
function laplace(marcados) {
  const ks = []; for (let k = 0; k < N; k++) if (marcados[k]) ks.push(k);
  const v = new Float32Array(N * 4); for (let i = 0; i < N * 4; i++) v[i] = out[i];
  for (const k of ks) { const x = k % W, y = (k / W) | 0; let a = x, b = x; while (a > 0 && marcados[y * W + a]) a--; while (b < W - 1 && marcados[y * W + b]) b++; const t = (x - a) / (b - a || 1); for (let c = 0; c < 4; c++) v[k * 4 + c] = out[(y * W + a) * 4 + c] * (1 - t) + out[(y * W + b) * 4 + c] * t; }
  for (let it = 0; it < 3000; it++) for (const k of ks) for (let c = 0; c < 4; c++) { const m = (v[(k - 1) * 4 + c] + v[(k + 1) * 4 + c] + v[(k - W) * 4 + c] + v[(k + W) * 4 + c]) / 4; v[k * 4 + c] += 1.9 * (m - v[k * 4 + c]); }
  for (const k of ks) for (let c = 0; c < 4; c++) out[k * 4 + c] = Math.max(0, Math.min(255, Math.round(v[k * 4 + c])));
}
const depura = new Uint8Array(N);
const xadrezAchado = new Uint8Array(N); // o xadrez é achado ANTES do aro: o aro nunca copia nem cobre o xadrez
const ordem = (z) => (z.modo === 'xadrez' ? 0 : 1);

for (const z of [...cfg.zonas].sort((a, b) => ordem(a) - ordem(b))) {
  const [bx0, by0, bx1, by1] = z.limites;
  const dentro = (x, y) => x >= bx0 && y >= by0 && x < bx1 && y < by1 && !protegido(z, x, y);
  const M = new Uint8Array(N);

  if (z.modo === 'aro') {
    const [cx, cy] = z.centro, [r0, r1] = z.raios, [a0, a1] = z.angulos.map((a) => (a * Math.PI) / 180);
    // o fio claro da beirada de fora (contorno do aro, encostado no transparente) é desenho do dono: nunca entra
    const naBeirada = (x, y) => { if (!z.beirada) return false; const a = Math.atan2(y - cy, x - cx); for (let d = 1; d <= z.beirada; d++) { const q = Math.round(y + d * Math.sin(a)) * W + Math.round(x + d * Math.cos(a)); if (data[q * 4 + 3] < 128) return true; } return false; };
    const naFaixa = (x, y) => { const r = Math.hypot(x - cx, y - cy), a = Math.atan2(y - cy, x - cx); return r >= r0 && r <= r1 && a >= a0 && a <= a1 && dentro(x, y) && !naBeirada(x, y); };
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) { const k = y * W + x; if (naFaixa(x, y) && !xadrezAchado[k] && data[k * 4 + 3] > 0 && lum(k) >= z.letra.lum && neutro(k) <= z.letra.neutro) M[k] = 1; }
    crescer(M, z.crescer ?? 2, (x, y) => naFaixa(x, y) && !xadrezAchado[y * W + x] && (z.crescerNeutro == null || neutro(y * W + x) <= z.crescerNeutro || lum(y * W + x) <= (z.crescerEscuro ?? -1)));
    // a cor que vale como "aro": escuro (alça e aro pretos) ou vermelho (aro vermelho)
    const corDoAro = (q) => (z.fonte?.vermelho ? data[q * 4] - data[q * 4 + 1] >= z.fonte.vermelho : lum(q) <= (z.fonte?.lumMax ?? 255) && neutro(q) <= (z.fonte?.neutro ?? 255));
    // cada ponto das letras: a cor do aro na MESMA distância do centro, logo antes e logo depois da letra (na curva)
    for (let k = 0; k < N; k++) {
      if (!M[k]) continue; const x = k % W, y = (k / W) | 0; const r = Math.hypot(x - cx, y - cy), a = Math.atan2(y - cy, x - cx);
      const passo = 0.5 / r, achados = [];
      for (const s of [-1, 1]) for (let i = 1; i < 2400; i++) {
        const b = a + s * i * passo, sx = cx + r * Math.cos(b), sy = cy + r * Math.sin(b);
        if (sx < 0 || sy < 0 || sx >= W - 1 || sy >= H - 1) break;
        const q = Math.round(sy) * W + Math.round(sx);
        // só copia o próprio aro: nem letra, nem desenho protegido, nem o miolo claro (xadrez) do outro lado da borda
        if (M[q] || xadrezAchado[q] || protegido(z, Math.round(sx), Math.round(sy)) || data[q * 4 + 3] < 20 || !corDoAro(q)) continue; // vale o aro opaco e a borda suave dele (meio transparente, mesma cor)
        achados.push([i, amostra(data, sx, sy)]); break;
      }
      if (!achados.length) continue;
      const tot = achados.reduce((s, [d]) => s + 1 / d, 0); const cor = [0, 0, 0, 0];
      for (const [d, c] of achados) for (let i = 0; i < 4; i++) cor[i] += (c[i] / d) / tot;
      for (let i = 0; i < 4; i++) out[k * 4 + i] = Math.round(cor[i]);
    }
  }

  if (z.modo === 'xadrez') {
    // o xadrez pintado: ponto cinza neutro que tem, em volta (janela de 21 px), os DOIS tons do xadrez. Assim os pedacinhos
    // presos entre o garfo, a carne e as letras também saem; a face branca de uma letra (só o tom claro) fica como está.
    const [[e0, e1], [c0, c1]] = z.tons;
    const somaD = new Float64Array((W + 1) * (H + 1)), somaC = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x, v = data[k * 4], ok = neutro(k) <= (z.neutro ?? 5) && data[k * 4 + 3] > 240, i = (y + 1) * (W + 1) + x + 1;
      somaD[i] = (ok && v >= e0 && v <= e1 ? 1 : 0) + somaD[i - 1] + somaD[i - W - 1] - somaD[i - W - 2];
      somaC[i] = (ok && v >= c0 && v <= c1 ? 1 : 0) + somaC[i - 1] + somaC[i - W - 1] - somaC[i - W - 2];
    }
    const R = z.janela ?? 10, conta = (S, x, y) => { const xa = Math.max(0, x - R), ya = Math.max(0, y - R), xb = Math.min(W, x + R + 1), yb = Math.min(H, y + R + 1); return S[yb * (W + 1) + xb] - S[ya * (W + 1) + xb] - S[yb * (W + 1) + xa] + S[ya * (W + 1) + xa]; };
    const area = (2 * R + 1) ** 2;
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
      const k = y * W + x; if (!dentro(x, y) || neutro(k) > (z.neutro ?? 5) + 3 || data[k * 4 + 3] <= 240 || data[k * 4] < e0 - 6) continue;
      if (conta(somaD, x, y) >= area * (z.minimo ?? 0.1) && conta(somaC, x, y) >= area * (z.minimo ?? 0.1)) M[k] = 1;
    }
    // pedacinhos soltos (o miolo branco de uma letra encostada no xadrez) não são xadrez: ficam com as letras
    { const visto = new Uint8Array(N); for (let k0 = 0; k0 < N; k0++) { if (!M[k0] || visto[k0]) continue; const comp = [k0], pilha = [k0]; visto[k0] = 1;
      while (pilha.length) { const k = pilha.pop(); for (const d of [1, -1, W, -W]) { const q = k + d; if (M[q] && !visto[q]) { visto[q] = 1; comp.push(q); pilha.push(q); } } }
      if (comp.length < (z.pedaco ?? 40)) for (const k of comp) M[k] = 0; } }
    // pontinhos claros que ficaram cercados de xadrez (bordas dos quadradinhos) também saem; a prata do K e do garfo não fica cercada
    for (let volta = 0; volta < 3; volta++) { const n = M.slice(); for (let y = by0 + 1; y < by1 - 1; y++) for (let x = bx0 + 1; x < bx1 - 1; x++) { const k = y * W + x; if (M[k] || !dentro(x, y) || lum(k) < 200 || neutro(k) > 12) continue; let v = 0; for (const d of [1, -1, W, -W, W + 1, W - 1, -W + 1, -W - 1]) v += M[k + d]; if (v >= 5) n[k] = 1; } M.set(n); }
    for (let k = 0; k < N; k++) if (M[k]) { out[k * 4] = out[k * 4 + 1] = out[k * 4 + 2] = 255; out[k * 4 + 3] = 255; vaga[k] = 1; xadrezAchado[k] = 1; }
    // as bordas meio-cinza entre o xadrez e o aro/desenhos também ficam sob a logo do usuário (não aparecem com ela)
    const v2 = vaga.slice(); for (let k = W; k < N - W; k++) if (!vaga[k] && (vaga[k - 1] || vaga[k + 1] || vaga[k - W] || vaga[k + W]) && dentro(k % W, (k / W) | 0) && lum(k) > 150 && neutro(k) <= 12) v2[k] = 1; vaga.set(v2);
  }

  if (z.modo === 'colunas') {
    // DISCO DE TÁBUAS: só as LETRAS (e a sombra delas) saem, e só dentro do miolo (elipse do sulco, que fica intacto).
    // Cor de cada coluna ligada de cima a baixo (sem manchas) + os veios da própria tábua (detalhe copiado da madeira boa
    // da mesma coluna, espelhada), então a tábua continua com textura.
    const [fx, fy, ea, eb] = z.face;
    const naFace = (x, y, m = 0) => ((x - fx) / (ea - m)) ** 2 + ((y - fy) / (eb - m)) ** 2 <= 1;
    const pode = (x, y) => dentro(x, y) && naFace(x, y, z.margem ?? 2);
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) { const k = y * W + x; if (pode(x, y) && lum(k) >= z.letra.lum && neutro(k) <= z.letra.neutro) M[k] = 1; }
    crescer(M, z.crescer ?? 8, pode);
    const valido = (x, y) => y >= 0 && y < H && naFace(x, y, (z.margem ?? 2) + 2) && !M[y * W + x];
    const media = (x, ys, c) => ys.reduce((t, yy) => t + data[(yy * W + x) * 4 + c], 0) / ys.length;
    const detalhe = new Float32Array(N * 4); // detalhe = ponto − média dos vizinhos na linha (os veios são verticais)
    for (let y = Math.max(0, by0 - 130); y < Math.min(H, by1 + 130); y++) for (let x = bx0; x < bx1; x++) { const k = y * W + x; for (let c = 0; c < 3; c++) { let t = 0, n = 0; for (let d = -5; d <= 5; d++) { const q = k + d; if (!M[q]) { t += data[q * 4 + c]; n++; } } detalhe[k * 4 + c] = n ? data[k * 4 + c] - t / n : 0; } }
    for (let x = bx0; x < bx1; x++) {
      let y = by0;
      while (y < by1) {
        if (!M[y * W + x]) { y++; continue; }
        const a = y; while (y < by1 && M[y * W + x]) y++; const b = y - 1, L = b - a + 1;
        const acima = [], abaixo = []; for (let yy = a - 1; valido(x, yy) && acima.length < 200; yy--) acima.push(yy); for (let yy = b + 1; valido(x, yy) && abaixo.length < 200; yy++) abaixo.push(yy);
        if (!acima.length && !abaixo.length) continue;
        const pega = (lista, i) => { const p = 2 * lista.length; const j = i % p; return lista[j < lista.length ? j : p - 1 - j]; };
        const cA = [0, 1, 2, 3].map((c) => (acima.length ? media(x, acima.slice(0, 4), c) : media(x, abaixo.slice(0, 4), c)));
        const cB = [0, 1, 2, 3].map((c) => (abaixo.length ? media(x, abaixo.slice(0, 4), c) : cA[c]));
        for (let i = 0; i < L; i++) {
          const k = (a + i) * W + x, t = (i + 1) / (L + 1);
          const sc = acima.length ? pega(acima, i) : null, sb = abaixo.length ? pega(abaixo, L - 1 - i) : null;
          for (let c = 0; c < 4; c++) {
            const base = cA[c] * (1 - t) + cB[c] * t;
            const dc = sc === null ? null : detalhe[(sc * W + x) * 4 + c], db = sb === null ? null : detalhe[(sb * W + x) * 4 + c];
            const det = c === 3 ? 0 : dc === null ? db : db === null ? dc : dc * (1 - t) + db * t;
            out[k * 4 + c] = Math.max(0, Math.min(255, Math.round(base + det)));
          }
        }
      }
    }
    // pontinhas de letra fora do miolo (no sulco): o sulco em volta preenche suave
    const restos = new Uint8Array(N);
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) { const k = y * W + x; if (!M[k] && dentro(x, y) && lum(k) >= z.letra.lum && neutro(k) <= z.letra.neutro) restos[k] = 1; }
    crescer(restos, 3, (x, y) => dentro(x, y) && !M[y * W + x]);
    laplace(restos);
    for (let k = 0; k < N; k++) if (restos[k]) M[k] = 1;
  }

  if (z.modo === 'liso') {
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) { const k = y * W + x; const r = data[k * 4], g = data[k * 4 + 1], b = data[k * 4 + 2]; if (dentro(x, y) && r - g > z.letra.vermelho && r - b > z.letra.vermelho) M[k] = 1; }
    crescer(M, z.crescer ?? 3, dentro);
    const ks = []; for (let k = 0; k < N; k++) if (M[k]) ks.push(k);
    const v = new Float32Array(N * 4); for (let i = 0; i < N * 4; i++) v[i] = data[i];
    for (const k of ks) { // começa com a média das bordas da linha (acelera a convergência)
      const x = k % W, y = (k / W) | 0; let a = x, b = x; while (M[y * W + a]) a--; while (M[y * W + b]) b++;
      const t = (x - a) / (b - a); for (let c = 0; c < 4; c++) v[k * 4 + c] = data[(y * W + a) * 4 + c] * (1 - t) + data[(y * W + b) * 4 + c] * t;
    }
    for (let it = 0; it < 3000; it++) for (const k of ks) for (let c = 0; c < 4; c++) { const m = (v[(k - 1) * 4 + c] + v[(k + 1) * 4 + c] + v[(k - W) * 4 + c] + v[(k + W) * 4 + c]) / 4; v[k * 4 + c] += 1.9 * (m - v[k * 4 + c]); }
    for (const k of ks) for (let c = 0; c < 4; c++) out[k * 4 + c] = Math.max(0, Math.min(255, Math.round(v[k * 4 + c])));
  }

  for (let k = 0; k < N; k++) if (M[k]) { mexidos++; if (process.env.DEPURAR) depura[k] = z.modo === 'xadrez' ? 2 : 1; }
}

// NADA RECORTADO: a forma da logo é a do dono (o contorno nunca fica mais transparente do que era)
for (let k = 0; k < N; k++) if (out[k * 4 + 3] < data[k * 4 + 3]) out[k * 4 + 3] = data[k * 4 + 3];
for (const x of fs.readdirSync(ORIGINAIS)) if (/^(.+)-(limpa|frente|vaga)-[0-9a-f]{8}\.png$/.exec(x)?.[1] === id) fs.rmSync(path.join(ORIGINAIS, x));
await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toFile(path.join(ORIGINAIS, `${id}-limpa-${marca}.png`));
if (vaga.some(Boolean)) {
  const m = Buffer.alloc(N * 4); for (let k = 0; k < N; k++) if (vaga[k]) m[k * 4] = m[k * 4 + 1] = m[k * 4 + 2] = m[k * 4 + 3] = 255;
  await sharp(m, { raw: { width: W, height: H, channels: 4 } }).blur(0.6).png({ compressionLevel: 9 }).toFile(path.join(ORIGINAIS, `${id}-vaga-${marca}.png`));
}
if (process.env.DEPURAR) { const d = Buffer.from(data); for (let k = 0; k < N; k++) if (depura[k]) { d[k * 4] = depura[k] === 1 ? 255 : 0; d[k * 4 + 1] = depura[k] === 1 ? 0 : 255; d[k * 4 + 2] = 255; d[k * 4 + 3] = 255; } await sharp(d, { raw: { width: W, height: H, channels: 4 } }).png().toFile(process.env.DEPURAR); }
console.log(`ok ${id}: ${mexidos} pontos dos dizeres trocados (só dentro dos limites); o resto é o arquivo do dono`);
