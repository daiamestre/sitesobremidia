// F-355 — EXCEÇÃO PEDIDA PELO DONO (22/11/2026): nas logos com dizeres de modelo ("YOUR LOGO HERE", "SUA LOGO",
// "ALPHA BACKGROUND" e o xadrez pintado), SÓ esses dizeres saem. NADA do desenho é inventado nem recortado: o aro, o disco
// e o pano continuam onde o dono desenhou (a 1ª versão tirava o círculo inteiro e "inventava" o fundo atrás dele: ficou
// recortada, e o dono reprovou).
//   aro     → letras em cima de um aro/alça: cada ponto da letra recebe a cor do PRÓPRIO aro ao lado, na mesma curva
//   xadrez  → o xadrez pintado vira branco (o "em branco" do dono); vira também a VAGA da logo do usuário
//   colunas → letras em cima de tábuas verticais: os veios de cima e de baixo continuam (espelhados) pelo lugar das letras
//   liso    → letras em pano/superfície lisa: o pano em volta preenche suave (equação de Laplace); letra vermelha ou branca (letra.branco)
//   acento  → acento/enfeite em cima da letra (o til do "Año", pedido do dono): o fundo escovado continua por baixo dele
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
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) { const k = y * W + x; if (!z.faixaInteira && naFaixa(x, y) && !xadrezAchado[k] && data[k * 4 + 3] > 0 && lum(k) >= z.letra.lum && neutro(k) <= z.letra.neutro) M[k] = 1; }
    // faixaInteira: a faixa das letras sai toda (letras + borda + sombra delas) e o aro liso continua de uma ponta à outra
    crescer(M, z.crescer ?? 2, (x, y) => naFaixa(x, y) && !xadrezAchado[y * W + x] && (z.crescerNeutro == null || neutro(y * W + x) <= z.crescerNeutro || lum(y * W + x) <= (z.crescerEscuro ?? -1)));
    // a cor que vale como "aro": escuro (alça e aro pretos) ou vermelho (aro vermelho)
    const corDoAro = (q) => (z.fonte?.vermelho ? data[q * 4] - data[q * 4 + 1] >= z.fonte.vermelho : lum(q) <= (z.fonte?.lumMax ?? 255) && neutro(q) <= (z.fonte?.neutro ?? 255));
    if (z.faixaInteira) {
      // POR RAIO: em cada direção mede o aro (1º e último ponto vermelho) e onde estão as letras dentro dele; só esse trecho
      // (letras + sombra) é trocado, ligando o vermelho limpo de antes ao de depois (média de raios vizinhos: sem riscos)
      const PASSO = 0.1, nb = Math.ceil((z.angulos[1] - z.angulos[0]) / PASSO) + 1;
      const ehAro = (q) => data[q * 4 + 3] > 200 && corDoAro(q);
      const raio = new Array(nb);
      for (let b = 0; b < nb; b++) {
        const t = ((z.angulos[0] + b * PASSO) * Math.PI) / 180; const pts = [];
        for (let r = z.faixaInteira[0] - 20; r <= z.faixaInteira[1] + 20; r += 0.5) { const x = Math.round(cx + r * Math.cos(t)), y = Math.round(cy + r * Math.sin(t)); pts.push([r, y * W + x]); }
        const vermelhos = pts.filter(([, q]) => ehAro(q)); if (!vermelhos.length) { raio[b] = null; continue; }
        const rin = vermelhos[0][0], rout = vermelhos[vermelhos.length - 1][0];
        const letras = pts.filter(([r, q]) => r > rin + 1 && r < rout - 1 && !ehAro(q));
        raio[b] = { t, rin, rout, l0: letras.length ? Math.max(rin + 1.5, letras[0][0] - (z.margemLetra ?? 3)) : null, l1: letras.length ? Math.min(rout - 1.5, letras[letras.length - 1][0] + (z.margemLetra ?? 3)) : null };
      }
      // a faixa trocada tem a MESMA posição dentro do aro em todos os ângulos (cobre todas as letras): as bordas dela são
      // sempre aro limpo, então a média dos raios vizinhos nunca puxa cor de letra (isso deixava "letras fantasma")
      let d0 = Infinity, d1 = -Infinity;
      for (const R of raio) if (R && R.l0 !== null) { d0 = Math.min(d0, R.l0 - R.rin); d1 = Math.max(d1, R.l1 - R.rin); }
      for (const R of raio) if (R) { R.l0 = R.rin + d0; R.l1 = Math.min(R.rout - 1.5, R.rin + d1); }
      const corEm = (b, r) => { const R = raio[b]; return amostra(data, cx + r * Math.cos(R.t), cy + r * Math.sin(R.t)); };
      // média só de cor de aro (fogo, carne e letras que encostam no aro ficam de fora); sem nenhuma, busca mais longe
      const aroOk = (c) => c[3] > 200 && (z.fonte?.vermelho ? c[0] - c[1] >= z.fonte.vermelho : (c[0] + c[1] + c[2]) / 3 <= (z.fonte?.lumMax ?? 255));
      const media = (b, r) => { for (const L of [15, 60, 200]) { const acc = [0, 0, 0, 0]; let n = 0; for (let d = -L; d <= L; d++) { const bb = b + d; if (bb < 0 || bb >= nb || !raio[bb]) continue; const c = corEm(bb, r); if (!aroOk(c)) continue; for (let i = 0; i < 4; i++) acc[i] += c[i]; n++; } if (n) return acc.map((v) => v / n); } return corEm(b, r); };
      for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
        const k = y * W + x; if (!dentro(x, y)) continue;
        const ang = (Math.atan2(y - cy, x - cx) * 180) / Math.PI; const b = Math.round((ang - z.angulos[0]) / PASSO); if (b < 0 || b >= nb || !raio[b] || raio[b].l0 === null) continue;
        const r = Math.hypot(x - cx, y - cy), R = raio[b]; if (r < R.l0 || r > R.l1) continue;
        const ci = media(b, R.l0 - 1), co = media(b, R.l1 + 1), p = (r - R.l0) / Math.max(1, R.l1 - R.l0);
        const ponta = Math.min(b, nb - 1 - b) * PASSO, w = Math.min(1, ponta / (z.emenda ?? 3)); // 0 na ponta → 1 a 3° dela
        for (let c = 0; c < 4; c++) out[k * 4 + c] = Math.round((ci[c] * (1 - p) + co[c] * p) * w + data[k * 4 + c] * (1 - w));
        M[k] = 2;
      }
    }
    // cada ponto das letras: a cor do aro na MESMA distância do centro, logo antes e logo depois da letra (na curva)
    for (let k = 0; k < N; k++) {
      if (M[k] !== 1) continue; const x = k % W, y = (k / W) | 0; const r = Math.hypot(x - cx, y - cy), a = Math.atan2(y - cy, x - cx);
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
    // alfa: xadrez pintado meio transparente (vidro) — só conta quem está nessa faixa de transparência; o desenho opaco (balões) nunca
    const alfaOk = (k) => (z.alfa ? data[k * 4 + 3] >= z.alfa[0] && data[k * 4 + 3] <= z.alfa[1] : data[k * 4 + 3] > 240);
    const somaD = new Float64Array((W + 1) * (H + 1)), somaC = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x, v = data[k * 4], ok = neutro(k) <= (z.neutro ?? 5) && alfaOk(k), i = (y + 1) * (W + 1) + x + 1;
      somaD[i] = (ok && v >= e0 && v <= e1 ? 1 : 0) + somaD[i - 1] + somaD[i - W - 1] - somaD[i - W - 2];
      somaC[i] = (ok && v >= c0 && v <= c1 ? 1 : 0) + somaC[i - 1] + somaC[i - W - 1] - somaC[i - W - 2];
    }
    const R = z.janela ?? 10, conta = (S, x, y) => { const xa = Math.max(0, x - R), ya = Math.max(0, y - R), xb = Math.min(W, x + R + 1), yb = Math.min(H, y + R + 1); return S[yb * (W + 1) + xb] - S[ya * (W + 1) + xb] - S[yb * (W + 1) + xa] + S[ya * (W + 1) + xa]; };
    const area = (2 * R + 1) ** 2;
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
      const k = y * W + x; if (!dentro(x, y) || neutro(k) > (z.neutro ?? 5) + 3 || !alfaOk(k) || data[k * 4] < e0 - 6) continue;
      if (conta(somaD, x, y) >= area * (z.minimo ?? 0.1) && conta(somaC, x, y) >= area * (z.minimo ?? 0.1)) M[k] = 1;
    }
    // porAlfa: o vidro de xadrez é TODO meio transparente — todo ponto neutro nessa transparência é xadrez (as bordas mais escuras também)
    if (z.porAlfa) for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) { const k = y * W + x; if (dentro(x, y) && alfaOk(k) && neutro(k) <= z.porAlfa) M[k] = 1; }
    // circulo [cx, cy, r]: o vidro é um círculo exato — dentro dele tudo vira branco, menos o desenho opaco e claro (balões) que passa na frente;
    // a borda escura de dentro do aro também entra, para o branco ficar redondo e liso (sem dentes)
    if (z.circulo) { const [ccx, ccy, cr] = z.circulo; for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) { const k = y * W + x; if (dentro(x, y) && Math.hypot(x - ccx, y - ccy) <= cr && (z.circuloTudo || !(data[k * 4 + 3] >= 245 && lum(k) >= 95))) M[k] = 1; } } // circuloTudo: o que está na frente já é protegido pelo polígono
    // pedacinhos soltos (o miolo branco de uma letra encostada no xadrez) não são xadrez: ficam com as letras
    { const visto = new Uint8Array(N); for (let k0 = 0; k0 < N; k0++) { if (!M[k0] || visto[k0]) continue; const comp = [k0], pilha = [k0]; visto[k0] = 1;
      while (pilha.length) { const k = pilha.pop(); for (const d of [1, -1, W, -W]) { const q = k + d; if (M[q] && !visto[q]) { visto[q] = 1; comp.push(q); pilha.push(q); } } }
      if (comp.length < (z.pedaco ?? 40)) for (const k of comp) M[k] = 0; } }
    // pontinhos claros que ficaram cercados de xadrez (bordas dos quadradinhos) também saem; a prata do K e do garfo não fica cercada
    for (let volta = 0; volta < 3; volta++) { const n = M.slice(); for (let y = by0 + 1; y < by1 - 1; y++) for (let x = bx0 + 1; x < bx1 - 1; x++) { const k = y * W + x; if (M[k] || !dentro(x, y) || lum(k) < 200 || neutro(k) > 12) continue; let v = 0; for (const d of [1, -1, W, -W, W + 1, W - 1, -W + 1, -W - 1]) v += M[k + d]; if (v >= 5) n[k] = 1; } M.set(n); }
    // cantinhos de xadrez pequenos demais para a janela (presos entre o tubo e o aro): caixa conferida à mão, só cinza claro
    for (const c of z.forcar ?? []) for (let y = c[1]; y < c[3]; y++) for (let x = c[0]; x < c[2]; x++) { const k = y * W + x; if (dentro(x, y) && neutro(k) <= (z.expNeutro ?? 15) && lum(k) >= (z.claroMin ?? 120) && data[k * 4 + 3] > 200) M[k] = 1; }
    // RESTOS DO XADREZ: o cinza claro neutro grudado no xadrez (quadradinhos escurecidos pela sombra do K, do tubo e do aro)
    // também sai. Só cinza claro e neutro: o contorno laranja/preto das letras e o aro preto seguram a expansão.
    for (let volta = 0; volta < (z.expandir ?? 0); volta++) {
      const n = M.slice(); let cresceu = 0;
      for (let y = by0 + 1; y < by1 - 1; y++) for (let x = bx0 + 1; x < bx1 - 1; x++) { const k = y * W + x; if (M[k] || !dentro(x, y) || neutro(k) > (z.expNeutro ?? 15) || lum(k) < (z.claroMin ?? 120) || data[k * 4 + 3] < 200) continue; if (M[k - 1] || M[k + 1] || M[k - W] || M[k + W]) { n[k] = 1; cresceu++; } }
      M.set(n); if (!cresceu) break;
    }
    for (let volta = 0; volta < (z.rosado ?? 0); volta++) { const n = M.slice();
      for (let y = by0 + 1; y < by1 - 1; y++) for (let x = bx0 + 1; x < bx1 - 1; x++) { const k = y * W + x; if (M[k] || !dentro(x, y)) continue; const r = data[k * 4], g = data[k * 4 + 1], bl = data[k * 4 + 2];
        if (lum(k) >= 195 && g - bl >= -4 && g - bl <= (lum(k) >= 225 ? 48 : 32) && r - g <= 60 && r >= g && (M[k - 1] || M[k + 1] || M[k - W] || M[k + W])) n[k] = 1; }
      M.set(n); }
    // ILHAS: pedacinhos (bordas cinza dos quadradinhos, sombras soltas) totalmente cercados de xadrez também saem.
    // O desenho do dono (K, tubo, carne, garfo) nunca fica cercado, porque continua até fora do xadrez.
    { const visto = new Uint8Array(N);
      for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
        const k0 = y * W + x; if (M[k0] || visto[k0] || !dentro(x, y)) continue;
        const comp = [k0], pilha = [k0]; visto[k0] = 1; let preso = true;
        // percorre o pedaço INTEIRO (parar no meio deixava sobras marcadas por engano)
        while (pilha.length) { const k = pilha.pop(), kx = k % W, ky = (k / W) | 0;
          for (const [dx, dy] of VIZ4) { const nx = kx + dx, ny = ky + dy; if (!dentro(nx, ny)) { preso = false; continue; } const q = ny * W + nx; if (M[q] || visto[q]) continue; visto[q] = 1; comp.push(q); pilha.push(q); } }
        if (preso && comp.length <= (z.ilha ?? 600)) for (const k of comp) M[k] = 1;
      } }
    if (z.circulo) { const [ccx, ccy, cr] = z.circulo; for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) { const k = y * W + x, d = Math.hypot(x - ccx, y - ccy); if (M[k] || !dentro(x, y) || d <= cr || d > cr + 1.5 || (data[k * 4 + 3] >= 245 && lum(k) >= 95)) continue; const f2 = (cr + 1.5 - d) / 1.5; for (let c = 0; c < 3; c++) out[k * 4 + c] = Math.round(255 * f2 + data[k * 4 + c] * (1 - f2)); } } // borda suave
    for (let k = 0; k < N; k++) if (M[k]) { out[k * 4] = out[k * 4 + 1] = out[k * 4 + 2] = 255; out[k * 4 + 3] = 255; if (!z.vagaNeutro || neutro(k) <= z.vagaNeutro) vaga[k] = 1; xadrezAchado[k] = 1; } // vagaNeutro: o xadrez tingido pelo brilho do aro fica branco, mas a logo do usuário não passa por cima dele
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
    // pontinhas de letra na beirada do miolo: entram junto e são trocadas pela MESMA tábua (sem borrão)
    const restos = new Uint8Array(N);
    // só a parte das letras que ENCOSTA no que já saiu (a letra continua pelo sulco); o brilho da beirada do disco fica
    // todo ponto de letra (branco/cinza claro) dentro da caixa das letras e até a beirada do miolo, mesmo sem encostar
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) { const k = y * W + x; if (!M[k] && dentro(x, y) && naFace(x, y, z.folgaRestos ?? -3) && (!z.caixaLetras || naCaixa(x, y, z.caixaLetras)) && lum(k) >= (z.letra.lumRestos ?? 120) && neutro(k) <= z.letra.neutro) restos[k] = 1; }
    crescer(restos, z.crescerRestos ?? 3, (x, y) => dentro(x, y) && !M[y * W + x] && naFace(x, y, -6));
    for (let k = 0; k < N; k++) if (restos[k]) M[k] = 1;
    const valido = (x, y) => y >= 0 && y < H && naFace(x, y, (z.margem ?? 2) + 2) && !M[y * W + x];
    const media = (x, ys, c) => ys.reduce((t, yy) => t + data[(yy * W + x) * 4 + c], 0) / ys.length;
    const detalhe = new Float32Array(N * 4); // detalhe = ponto − média dos vizinhos na linha (os veios são verticais)
    for (let y = Math.max(0, by0 - 130); y < Math.min(H, by1 + 130); y++) for (let x = bx0; x < bx1; x++) { const k = y * W + x; for (let c = 0; c < 3; c++) { let t = 0, n = 0; for (let d = -5; d <= 5; d++) { const q = k + d; if (!M[q]) { t += data[q * 4 + c]; n++; } } detalhe[k * 4 + c] = n ? data[k * 4 + c] - t / n : 0; } }
    // a madeira é alaranjada: ponto acinzentado e claro na madeira "boa" é resto de letra (contorno), não veio — não é copiado
    for (let k = 0; k < N; k++) if (neutro(k) <= (z.letra.neutroResto ?? 90) && lum(k) >= (z.letra.lumResto ?? 90) && data[k * 4 + 3] > 200) { detalhe[k * 4] = detalhe[k * 4 + 1] = detalhe[k * 4 + 2] = 0; }
    for (let x = bx0; x < bx1; x++) {
      let y = by0;
      while (y < by1) {
        if (!M[y * W + x]) { y++; continue; }
        const a = y; while (y < by1 && M[y * W + x]) y++; const b = y - 1, L = b - a + 1;
        // madeira boa acima e abaixo; na beirada do miolo (coluna curta) aceita até a beira do sulco
        let acima = [], abaixo = [];
        for (const folga of [(z.margem ?? 2) + 2, 0, -2]) {
          const ok = (yy) => yy >= 0 && yy < H && naFace(x, yy, folga) && !M[yy * W + x];
          acima = []; abaixo = []; for (let yy = a - 1; ok(yy) && acima.length < (z.alcance ?? 200); yy--) acima.push(yy); for (let yy = b + 1; ok(yy) && abaixo.length < (z.alcance ?? 200); yy++) abaixo.push(yy);
          if (acima.length + abaixo.length >= 6) break;
        }
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
            const det0 = c === 3 ? 0 : dc === null ? db : db === null ? dc : dc * (1 - t) + db * t, lim = z.veioMax ?? 255;
            const det = Math.max(-lim, Math.min(lim, det0)); // um brilho forte (beirada do sulco) não vira risco no meio da tábua
            out[k * 4 + c] = Math.max(0, Math.min(255, Math.round(base + det)));
          }
        }
      }
    }
    // última passada: ponto trocado que ficou ACINZENTADO (a madeira é alaranjada) recebe a média da madeira em volta
    const nOut = (k) => Math.max(out[k * 4], out[k * 4 + 1], out[k * 4 + 2]) - Math.min(out[k * 4], out[k * 4 + 1], out[k * 4 + 2]);
    for (let volta = 0; volta < 3; volta++) for (let k = W * 3; k < N - W * 3; k++) {
      const lOut = (q) => (out[q * 4] + out[q * 4 + 1] + out[q * 4 + 2]) / 3;
      if (!M[k] || nOut(k) > (z.cinzaMax ?? 75) || lOut(k) < 90) continue; const acc = [0, 0, 0, 0]; let n = 0; // cinza CLARO (o sulco escuro fica)
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const q = k + dy * W + dx; if (nOut(q) > (z.cinzaMax ?? 75) + 10 && lOut(q) >= 90 && out[q * 4 + 3] > 200) { for (let c = 0; c < 4; c++) acc[c] += out[q * 4 + c]; n++; } }
      if (n) for (let c = 0; c < 4; c++) out[k * 4 + c] = Math.round(acc[c] / n);
    }
    // na BEIRADA (sulco escuro e o brilho dele, por cima dos quais as letras passavam): cada ponto recebe o próprio sulco,
    // ao longo da elipse do disco (mesma distância relativa do centro), como nos aros
    for (let k = 0; k < N; k++) {
      if (!M[k]) continue; const x = k % W, y = (k / W) | 0; if (naFace(x, y, z.beiradaDoSulco ?? -1)) continue;
      const u = (x - fx) / ea, v = (y - fy) / eb, rho = Math.hypot(u, v), t0 = Math.atan2(v, u), passo = 0.4 / (rho * Math.max(ea, eb)), achados = [];
      for (const sn of [-1, 1]) for (let i = 1; i < 4000; i++) { const t = t0 + sn * i * passo, sx = fx + ea * rho * Math.cos(t), sy = fy + eb * rho * Math.sin(t); const q = Math.round(sy) * W + Math.round(sx); if (M[q] || (lum(q) >= z.letra.lum && neutro(q) <= z.letra.neutro)) continue; achados.push([i, amostra(data, sx, sy)]); break; }
      if (!achados.length) continue; const tot = achados.reduce((t, [d]) => t + 1 / d, 0);
      for (let c = 0; c < 4; c++) out[k * 4 + c] = Math.round(achados.reduce((t, [d, cc]) => t + cc[c] / d, 0) / tot);
    }
  }

  if (z.modo === 'liso') {
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) { const k = y * W + x; const r = data[k * 4], g = data[k * 4 + 1], b = data[k * 4 + 2]; const branca = z.letra.branco && Math.max(r, g, b) - Math.min(r, g, b) < z.letra.neutro && Math.min(r, g, b) > z.letra.branco; // letras brancas (YOUR TEXT HERE)
      const preta = z.letra.preto && Math.max(r, g, b) < z.letra.preto; // letras pretas (SUA LOGO AQUI)
      if (dentro(x, y) && (branca || preta || (z.letra.vermelho != null && r - g > z.letra.vermelho && r - b > z.letra.vermelho))) M[k] = 1; }
    if (z.letra.espessura) { // brilho fino da faixa (1-3 px) não é letra: letra tem traço grosso na vertical
      const corrida = new Uint16Array(N);
      for (let x = bx0; x < bx1; x++) { let y = by0; while (y < by1) { if (!M[y * W + x]) { y++; continue; } let y2 = y; while (y2 < by1 && M[y2 * W + x]) y2++; for (let k = y; k < y2; k++) corrida[k * W + x] = y2 - y; y = y2; } }
      for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) { const k = y * W + x; if (M[k] && corrida[k] < z.letra.espessura) M[k] = 0; }
    }
    const friso = (k) => z.friso && data[k * 4 + 1] < z.friso && data[k * 4] - data[k * 4 + 1] > 60; // friso vermelho-escuro da faixa: não entra
    const colada = z.friso ? Math.min(6, z.crescer ?? 3) : (z.crescer ?? 3); // a sombra colada na letra sai sempre; depois disso o friso fica
    crescer(M, colada, dentro);
    crescer(M, (z.crescer ?? 3) - colada, (x, y) => dentro(x, y) && !friso(y * W + x));
    let T = null, B = null, naFaixa = null;
    if (z.aoLongo) {
      // frisos de cima e de baixo da faixa → curvas T(x) e B(x); u = altura relativa entre eles (0 = friso de cima, 1 = de baixo)
      const [sy0, sy1] = z.aoLongo.busca, cima = [], baixo = [];
      // só frisos FINOS (≤ 7 px; o disco colorido acima da faixa não conta), o mais perto acima e abaixo do meio das letras
      for (let x = bx0; x < bx1; x += 3) {
        let s = 0, n = 0; for (let y = by0; y < by1; y++) if (M[y * W + x]) { s += y; n++; } if (n < 6) continue; const meio = s / n;
        const g = []; for (let y = sy0; y < sy1; y++) { const k = y * W + x; if (data[k * 4 + 3] > 200 && friso(k)) { if (!g.length || y - g[g.length - 1][1] > 3) g.push([y, y]); else g[g.length - 1][1] = y; } }
        const finos = g.filter(([p, q]) => q - p <= 7).map(([p, q]) => (p + q) / 2);
        const em = finos.filter((y) => y < meio).pop(), eb = finos.find((y) => y > meio);
        if (em != null && eb != null) { cima.push([x, em]); baixo.push([x, eb]); }
      }
      const parabola = (pts) => { // mínimos quadrados y = a + b·x + c·x² (x centrado), 2 passadas tirando pontos fora da curva
        const ajusta = (ps) => { const m = ps.reduce((s, p) => s + p[0], 0) / ps.length; const S = Array(5).fill(0), T = [0, 0, 0];
          for (const [x0, y] of ps) { const x = x0 - m; for (let i = 0; i < 5; i++) S[i] += x ** i; for (let i = 0; i < 3; i++) T[i] += y * x ** i; }
          const A = [[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]], det = (M3) => M3[0][0] * (M3[1][1] * M3[2][2] - M3[1][2] * M3[2][1]) - M3[0][1] * (M3[1][0] * M3[2][2] - M3[1][2] * M3[2][0]) + M3[0][2] * (M3[1][0] * M3[2][1] - M3[1][1] * M3[2][0]);
          const D = det(A), co = [0, 1, 2].map((j) => det(A.map((l, i) => l.map((v2, jj) => (jj === j ? T[i] : v2)))) / D); return (x) => co[0] + co[1] * (x - m) + co[2] * (x - m) ** 2; };
        let f = ajusta(pts); f = ajusta(pts.filter(([x, y]) => Math.abs(f(x) - y) < 4)); return f; };
      const fr = z.aoLongo.frisos; // medidos com conferir-logo.mjs grade (mais seguro que achar sozinho)
      const xs = [280, 354, 428, 502, 576, 650, 724, 798, 872, 946, 1020];
      T = parabola(fr ? fr.cima.map((y, i) => [fr.x?.[i] ?? xs[i], y]) : cima); B = parabola(fr ? fr.baixo.map((y, i) => [fr.x?.[i] ?? xs[i], y]) : baixo); naFaixa = (x, u) => T(x) + u * (B(x) - T(x));
      // a área limpa ACOMPANHA A CURVA da faixa (de u0 a u1, ponta a ponta das letras): uma área reta cortava o brilho curvo e deixava
      // linha, degrau e emenda (conferência de 23/11/2026). Miolos (O, R) e vãos entre letras entram junto.
      let u0 = 1, u1 = 0, xa = W, xb = 0;
      for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) { const k = y * W + x; if (!M[k]) continue; const u = (y - T(x)) / (B(x) - T(x)); if (u < (z.aoLongo.uMin ?? 0.03) || u > (z.aoLongo.uMax ?? 0.97)) { M[k] = 0; continue; } u0 = Math.min(u0, u); u1 = Math.max(u1, u); xa = Math.min(xa, x); xb = Math.max(xb, x); }
      const alt = B((xa + xb) / 2) - T((xa + xb) / 2), mg = z.aoLongo.margem ?? 4;
      u0 = Math.max(z.aoLongo.uMin ?? 0.03, u0 - (mg + (z.aoLongo.acima ?? 0)) / alt); // uMin perto de 0: vai até o friso de cima
      u1 = Math.min(z.aoLongo.uMax ?? 0.97, u1 + ((z.aoLongo.abaixo ?? 0) + mg) / alt); // uMax perto de 1: a área vai até o friso de baixo (a sombra das letras não fica na borda)
      if (process.env.DEPURAR_U) console.log(`u ${u0.toFixed(3)}..${u1.toFixed(3)} x ${xa}..${xb} altura ${alt.toFixed(1)}`);
      // topo: segue o TOPO DAS LETRAS (o brilho logo abaixo do friso de cima fica como o dono desenhou); embaixo: até o friso (u1)
      const topo = new Map(); for (let x = xa; x <= xb; x++) { for (let y = by0; y < by1; y++) if (M[y * W + x]) { topo.set(x, y); break; } }
      const janela = z.aoLongo.janela ?? 40, acima = mg + (z.aoLongo.acima ?? 0);
      for (let x = xa - mg; x <= xb + mg; x++) {
        let yt = Infinity; for (let d = -janela; d <= janela; d++) { const v2 = topo.get(Math.min(xb, Math.max(xa, x + d))); if (v2 != null) yt = Math.min(yt, v2); }
        const y0 = z.aoLongo.topoPelasLetras ? Math.max(Math.floor(naFaixa(x, u0)), yt - acima) : Math.floor(naFaixa(x, u0));
        for (let y = y0; y <= Math.ceil(naFaixa(x, u1)); y++) { const k = y * W + x; if (dentro(x, y) && !friso(k)) M[k] = 1; }
      }
    }
    const ks = []; for (let k = 0; k < N; k++) if (M[k]) ks.push(k);
    const v = new Float32Array(N * 4); for (let i = 0; i < N * 4; i++) v[i] = data[i];
    for (const k of ks) { // começa com a média das bordas da linha (acelera a convergência)
      const x = k % W, y = (k / W) | 0; let a = x, b = x; while (M[y * W + a]) a--; while (M[y * W + b]) b++;
      const t = (x - a) / (b - a); for (let c = 0; c < 4; c++) v[k * 4 + c] = data[(y * W + a) * 4 + c] * (1 - t) + data[(y * W + b) * 4 + c] * t;
    }
    if (z.aoLongo) {
      // F-355 (dono, 23/11/2026: "a faixa tem de ficar EXATAMENTE igual à original, mesma coloração e estilo, só em branco"):
      // a faixa é desenhada AO LONGO da curva dela (brilhos e frisos correm de ponta a ponta). Cada ponto da letra recebe a cor da
      // própria faixa na MESMA altura relativa entre o friso de cima e o de baixo (u), vinda dos dois lados da letra; depois uma
      // correção de Poisson só acerta o brilho nas bordas. Assim o brilho, o degradê e os frisos continuam como o dono desenhou.
      const cor = (x, y) => amostra(data, x, y);
      const base = new Float32Array(N * 4);
      for (const k of ks) {
        const x = k % W, y = (k / W) | 0, u = (y - T(x)) / (B(x) - T(x));
        const limpo = (xx, d) => { for (let i = 0; i < 5; i++) if (M[Math.round(naFaixa(xx + d * i, u)) * W + xx + d * i]) return false; return true; };
        let xl = x - 1; while (xl > x - 900 && !limpo(xl, -1)) xl--;
        let xr = x + 1; while (xr < x + 900 && !limpo(xr, 1)) xr++;
        const media = (x0, d) => { const s = [0, 0, 0, 0]; for (const i of [2, 3, 4]) { const p = cor(x0 + d * i, naFaixa(x0 + d * i, u)); for (let c = 0; c < 4; c++) s[c] += p[c] / 3; } return s; };
        const a = media(xl, -1), b = media(xr, 1), t = (x - xl) / (xr - xl);
        for (let c = 0; c < 4; c++) base[k * 4 + c] = a[c] * (1 - t) + b[c] * t;
      }
      const L = new Float32Array(N * 4); // correção harmônica: só o que falta para casar com as bordas
      for (let it = 0; it < 1500; it++) for (const k of ks) for (let c = 0; c < 4; c++) {
        let s = 0; for (const q of [k - 1, k + 1, k - W, k + W]) s += M[q] ? L[q * 4 + c] : data[q * 4 + c] - base[k * 4 + c];
        L[k * 4 + c] += 1.9 * (s / 4 - L[k * 4 + c]);
      }
      for (const k of ks) for (let c = 0; c < 4; c++) v[k * 4 + c] = base[k * 4 + c] + L[k * 4 + c];
    } else
    for (let it = 0; it < 3000; it++) for (const k of ks) for (let c = 0; c < 4; c++) { const m = (v[(k - 1) * 4 + c] + v[(k + 1) * 4 + c] + v[(k - W) * 4 + c] + v[(k + W) * 4 + c]) / 4; v[k * 4 + c] += 1.9 * (m - v[k * 4 + c]); }
    for (const k of ks) for (let c = 0; c < 4; c++) out[k * 4 + c] = Math.max(0, Math.min(255, Math.round(v[k * 4 + c])));
  }

  if (z.modo === 'acento') {
    // F-355 (dono, 23/11/2026: "corrija o Año"): tira um acento/enfeite que está EM CIMA da letra, sobre um fundo escovado.
    // 'curva' = contorno de cima da letra que fica (pontos [x,y]); dali para baixo nada muda. À direita da curva, até 'base'.
    // O fundo volta continuando cada listra da esquerda para a direita (o escovado é horizontal) + correção de Poisson do brilho.
    const fundo = (x, y) => { const i = (y * W + x) * 4, mx = Math.max(data[i], data[i + 1], data[i + 2]), mn = Math.min(data[i], data[i + 1], data[i + 2]); return (mx - mn) / (mx || 1) < 0.2 && mx > 140; };
    const cv = z.curva, xFim = cv[cv.length - 1][0];
    const Bc = (x) => { if (x < cv[0][0]) return 0; if (x > xFim + 2) return z.base; for (let k = 1; k < cv.length; k++) { const [x0, y0] = cv[k - 1], [x1, y1] = cv[k]; if (x <= x1) return Math.min(z.base, y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)); } return z.base; };
    const B = (x) => Math.floor(Bc(x));
    for (let x = bx0; x < bx1; x++) { let y = by0 + 3; while (y < B(x) && fundo(x, y)) y++; if (y >= B(x)) continue; for (let yy = Math.max(by0, y - 3); yy < B(x); yy++) if (dentro(x, yy)) M[yy * W + x] = 1; }
    crescer(M, z.crescer ?? 3, (x, y) => dentro(x, y) && y < B(x) && fundo(x, y));
    const [ox, oy] = z.outraLetra ?? [W, H]; // a letra seguinte (à direita, de oy para baixo) também não é fundo
    const fixo = (x, y) => !M[y * W + x] && !(x >= cv[0][0] - 1 && x <= xFim + 2 && y >= B(x)) && !(x >= ox && y >= oy);
    const linhas = {};
    const ponta = (x, y, d) => { const v = [0, 0, 0]; let n = 0; for (let k = 0; k < 3; k++) { const xx = x + d * k; if (fixo(xx, y)) { for (let c = 0; c < 3; c++) v[c] += data[(y * W + xx) * 4 + c]; n++; } } return n ? v.map((t) => t / n) : null; };
    const linha = (y) => { if (linhas[y]) return linhas[y]; let xl = W, xr = -1; for (let x = bx0; x < bx1; x++) if (M[y * W + x]) { xl = Math.min(xl, x); xr = Math.max(xr, x); } const a = xr >= 0 ? ponta(xl - 1, y, -1) : null, b = xr >= 0 ? ponta(xr + 1, y, 1) : null; return (linhas[y] = { xl, xr, a: a || b, b: b || a }); };
    const base = (x, y, c) => { const r = linha(y); if (r.xr < 0 || !r.a) return data[(y * W + x) * 4 + c]; const t = (x - r.xl + 1) / (r.xr - r.xl + 2); return r.a[c] * (1 - t) + r.b[c] * t; };
    const ks = []; for (let k = 0; k < N; k++) if (M[k]) ks.push(k);
    const L = new Float32Array(N * 3);
    for (let it = 0; it < 6000; it++) for (const k of ks) {
      const x = k % W, y = (k / W) | 0, s = [0, 0, 0]; let n = 0;
      for (const [dx, dy] of VIZ4) { const xx = x + dx, yy = y + dy, q = yy * W + xx;
        if (M[q]) { for (let c = 0; c < 3; c++) s[c] += L[q * 3 + c]; n++; } else if (fixo(xx, yy)) { for (let c = 0; c < 3; c++) s[c] += data[q * 4 + c] - base(x, y, c); n++; } }
      if (n) for (let c = 0; c < 3; c++) L[k * 3 + c] = s[c] / n;
    }
    for (const k of ks) { const x = k % W, y = (k / W) | 0; for (let c = 0; c < 3; c++) out[k * 4 + c] = Math.max(0, Math.min(255, Math.round(base(x, y, c) + L[k * 3 + c]))); out[k * 4 + 3] = 255; }
    for (let x = cv[0][0]; x <= xFim + 2; x++) { const b = Bc(x), yb = Math.floor(b), f = b - yb; if (f <= 0 || !M[(yb - 1) * W + x] || !dentro(x, yb)) continue; const i = (yb * W + x) * 4, j = i - W * 4; for (let c = 0; c < 3; c++) out[i + c] = Math.round(out[j + c] * f + data[i + c] * (1 - f)); }
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
