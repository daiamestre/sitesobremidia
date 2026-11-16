// F-320: os efeitos sonoros NOSSOS, sintetizados com a mesma "assinatura" medida nos vídeos do concorrente
// (sirene: um único "uóóó-uuu" quase puro 600→2230→620 Hz em 3,5 s; impacto: estalo + grave de ~45 Hz que cai 15 dB em ~1 s;
// subida: o "riser" antes da logo bater). Nada copiado: só a técnica. uso: node sintetizar-sons.mjs <pasta-saida>
import fs from 'node:fs';
const SR = 44100;
const saida = process.argv[2];
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff * 2 - 1; };

function wav(nome, L, R = L) {
  const n = L.length, b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  let pico = 0; for (let i = 0; i < n; i++) pico = Math.max(pico, Math.abs(L[i]), Math.abs(R[i]));
  const k = 0.95 / (pico || 1);
  for (let i = 0; i < n; i++) { b.writeInt16LE(Math.round(L[i] * k * 32767), 44 + i * 4); b.writeInt16LE(Math.round(R[i] * k * 32767), 46 + i * 4); }
  fs.writeFileSync(`${saida}/${nome}.wav`, b);
}
// filtros simples
function passaBaixa(x, fc) { const a = Math.exp(-2 * Math.PI * fc / SR); const y = new Float32Array(x.length); let s = 0; for (let i = 0; i < x.length; i++) { s = (1 - a) * x[i] + a * s; y[i] = s; } return y; }
function passaAlta(x, fc) { const lp = passaBaixa(x, fc); return x.map((v, i) => v - lp[i]); }
function passaBaixaVar(x, fcDe, fcAte, dur) { const y = new Float32Array(x.length); let s = 0; for (let i = 0; i < x.length; i++) { const t = Math.min(1, i / SR / dur); const fc = fcDe * Math.pow(fcAte / fcDe, t); const a = Math.exp(-2 * Math.PI * fc / SR); s = (1 - a) * x[i] + a * s; y[i] = s; } return y; }
// reverberação: ruído com queda exponencial (sala grande), filtrado
function reverb(x, seg, mistura, corte = 4000) {
  const n = Math.round(seg * SR);
  let ir = new Float32Array(n); for (let i = 0; i < n; i++) ir[i] = rnd() * Math.exp(-6.9 * i / n);
  ir = passaBaixa(ir, corte);
  const y = new Float32Array(x.length + n);
  // convolução esparsa (passo 2 no IR já basta para um rabo difuso)
  for (let i = 0; i < x.length; i++) { const v = x[i]; if (Math.abs(v) < 1e-4) continue; for (let k = 0; k < n; k += 2) y[i + k] += v * ir[k] * 0.02; }
  const out = new Float32Array(y.length); for (let i = 0; i < y.length; i++) out[i] = (i < x.length ? x[i] : 0) * (1 - mistura) + y[i] * mistura; return out;
}
const sat = (x, d) => x.map((v) => Math.tanh(v * d) / Math.tanh(d));

// 1) SIRENE: uma subida e uma descida, quase senoidal (h2 -24 dB, h3 -30 dB), como medido
function sirene() {
  const dur = 3.75, n = Math.round(dur * SR), y = new Float32Array(n);
  const f0 = 600, fMax = 2230, fFim = 620, tSobe = 0.15, tTopo = 1.66, tFim = 3.45;
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let f;
    if (t < tSobe) f = f0;
    else if (t < tTopo) { const u = (t - tSobe) / (tTopo - tSobe); f = f0 * Math.pow(fMax / f0, Math.pow(u, 0.5)); }
    else { const u = Math.min(1, (t - tTopo) / (tFim - tTopo)); f = fMax * Math.pow(fFim / fMax, Math.pow(u, 0.95)); }
    fase += 2 * Math.PI * f / SR;
    const env = Math.min(1, t / 0.08) * (t > tFim ? Math.max(0, 1 - (t - tFim) / 0.3) : 1) * (0.8 + 0.2 * Math.min(1, t / 2.5));
    y[i] = env * (Math.sin(fase) + 0.063 * Math.sin(2 * fase) + 0.032 * Math.sin(3 * fase));
  }
  const r = reverb(y, 0.6, 0.18, 6000);
  // um pouco de largura estéreo (o rabo da sala dos dois lados)
  const R = new Float32Array(r.length); for (let i = 0; i < r.length; i++) R[i] = i > 220 ? r[i - 220] * 0.25 + r[i] * 0.75 : r[i];
  wav('sirene', r, R);
}

// 2) IMPACTO: estalo + soco + grave de ~45 Hz com cauda de ~1,4 s + estrondo + sala
function impacto() {
  const dur = 2.6, n = Math.round(dur * SR);
  const estalo = new Float32Array(n), soco = new Float32Array(n), sub = new Float32Array(n), ronco = new Float32Array(n), detrito = new Float32Array(n);
  let fs1 = 0, fs2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    estalo[i] = rnd() * Math.exp(-t / 0.012);
    const fSoco = 50 + 110 * Math.exp(-t / 0.03); fs1 += 2 * Math.PI * fSoco / SR; soco[i] = Math.sin(fs1) * Math.exp(-t / 0.09);
    const fSub = 42 + 26 * Math.exp(-t / 0.25); fs2 += 2 * Math.PI * fSub / SR; sub[i] = Math.sin(fs2) * Math.min(1, t / 0.004) * Math.exp(-t / 0.62);
    ronco[i] = rnd() * Math.min(1, t / 0.01) * Math.exp(-t / 0.6);
    detrito[i] = rnd() * Math.exp(-t / 0.09) * (1 + 0.6 * Math.sin(t * 90));
  }
  const e = passaAlta(estalo, 900), r1 = passaBaixaVar(passaBaixaVar(ronco, 320, 90, 1.4), 320, 90, 1.4), r2 = passaAlta(passaBaixa(ronco, 220), 55), d = passaAlta(passaBaixa(detrito, 2600), 280);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) y[i] = 0.55 * e[i] + 0.9 * soco[i] + 0.7 * sub[i] + 9 * r1[i] + 2.2 * r2[i] + 0.35 * d[i];
  for (let i = 0; i < n; i++) { const t = i / SR; if (t > dur - 0.5) y[i] *= (dur - t) / 0.5; }
  const s = sat(y, 1.8);
  const r = reverb(s, 1.1, 0.12, 500);
  for (let i = 0; i < r.length; i++) { const q = r.length - i; if (q < 4000) r[i] *= q / 4000; }
  const R = new Float32Array(r.length); for (let i = 0; i < r.length; i++) R[i] = i > 330 ? r[i] * 0.8 + r[i - 330] * 0.2 : r[i];
  wav('impacto', r, R);
}

// 3) SUBIDA (riser): ruído que abre o filtro + dois tons que sobem (1600→2200 Hz), 1,6 s, cortando seco na batida
function subida() {
  const dur = 1.6, n = Math.round(dur * SR), ruido = new Float32Array(n), tom = new Float32Array(n);
  let f1 = 0, f2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, u = t / dur;
    ruido[i] = rnd() * Math.pow(u, 1.6);
    f1 += 2 * Math.PI * (1600 * Math.pow(2200 / 1600, u)) / SR; f2 += 2 * Math.PI * (1830 * Math.pow(2500 / 1830, u)) / SR;
    tom[i] = (Math.sin(f1) + 0.6 * Math.sin(f2)) * Math.pow(u, 2) * 0.25;
  }
  const rf = passaBaixaVar(ruido, 400, 9000, dur);
  const y = new Float32Array(n); for (let i = 0; i < n; i++) { const fim = i > n - 400 ? (n - i) / 400 : 1; y[i] = (rf[i] * 1.2 + tom[i]) * fim; }
  wav('subida', y, y.map((v, i) => (i > 150 ? y[i - 150] : v)));
}

// 4) WHOOSH (troca de cena): ruído de 0,5 s com o filtro passando (como no app do concorrente, só que com corpo estéreo)
function whoosh() {
  const dur = 0.7, n = Math.round(dur * SR), x = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; const env = Math.sin(Math.PI * Math.min(1, t / 0.55)) ** 2; x[i] = rnd() * env; }
  const sobe = passaBaixaVar(x, 300, 5000, 0.35);
  const y = passaAlta(sobe, 150);
  wav('whoosh', y, y.map((v, i) => (i > 400 ? y[i - 400] : v) * 0.9));
}

sirene(); impacto(); subida(); whoosh();
console.log('ok');
