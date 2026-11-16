// F-320 (pedido do dono): os dois sons de BATIDA dos vídeos de impacto, montados com gravações REAIS do Pixabay (licença
// Pixabay, ficha em docs/licencas/SONS_PIXABAY.md) + o nosso grave (scripts/studio/sintetizar-sons.mjs → impacto.wav).
// Casados com as batidas ISOLADAS do concorrente (canal lateral L−R, sem a voz) — método em docs/SONS_DO_CONCORRENTE.md.
// uso: node montar-sons-de-batida.mjs <ffmpeg> <pasta-com-os-mp3-do-pixabay> <grave.wav> <saida>
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const [ff, P, grave, saida] = process.argv.slice(2);
const SR = 44100;
const ler = (arq, ini = 0, filtro) => { const raw = execFileSync(ff, ['-v', 'error', '-ss', String(ini), '-i', arq, ...(filtro ? ['-af', filtro] : []), '-ac', '2', '-ar', String(SR), '-f', 's16le', '-'], { maxBuffer: 1 << 28 }); const n = raw.length / 4, L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { L[i] = raw.readInt16LE(i * 4) / 32768; R[i] = raw.readInt16LE(i * 4 + 2) / 32768; } return [L, R]; };
const pico = ([L, R]) => { let m = 0; for (let i = 0; i < L.length; i++) m = Math.max(m, Math.abs(L[i]), Math.abs(R[i])); return m || 1; };
function mixar(nome, camadas, dur) {
  const n = Math.round(dur * SR), L = new Float32Array(n), R = new Float32Array(n);
  for (const c of camadas) {
    const s = ler(c.arq, c.ini, c.filtro); const k = c.ganho / pico(s); const o = Math.round((c.em ?? 0) * SR);
    for (let i = 0; i < s[0].length && i + o < n; i++) { const f = c.corte && i > c.corte * SR ? Math.max(0, 1 - (i - c.corte * SR) / (0.3 * SR)) : 1; L[i + o] += s[0][i] * k * f; R[i + o] += s[1][i] * k * f; }
  }
  for (let i = 0; i < n; i++) { const t = i / SR; const fim = t > dur - 0.4 ? (dur - t) / 0.4 : 1; L[i] = Math.tanh(L[i] * 1.3) * fim; R[i] = Math.tanh(R[i] * 1.3) * fim; }
  const m = Math.max(pico([L, R]), 1e-6), b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { b.writeInt16LE(Math.round(L[i] / m * 0.95 * 32767), 44 + i * 4); b.writeInt16LE(Math.round(R[i] / m * 0.95 * 32767), 46 + i * 4); }
  fs.writeFileSync(`${saida}/${nome}.wav`, b);
}
const X = (n) => `${P}/${n}.mp3`;
const EXP = X('film-special-effects-explosion-42132'), W = X('film-special-effects-hitting-wall-85571'), B4 = X('film-special-effects-cinematic-boom-04-414570'), LB = X('film-special-effects-large-break-363165'), DB = X('film-special-effects-debris-break-253779'), RB = X('film-special-effects-rock-break-hard-184891'), EXD = X('horror-explosion-with-debris-494320');
// TEXTO IMPORTANTE (bater numa parede de concreto) — 69–72% igual ao do concorrente
mixar('concreto', [{ arq: EXD, ini: 0, ganho: 1.0, filtro: 'treble=g=9:f=2500' }, { arq: B4, ini: 1.72, ganho: 0.8 }, { arq: LB, ini: 0.05, ganho: 0.6, filtro: 'treble=g=6:f=2500' }, { arq: grave, ini: 0, ganho: 0.9 }], 2.6);
// LOGO BATENDO NO CENTRO (estouro brilhante + entulho caindo) — 62% (as do próprio concorrente: 53–55% entre si)
mixar('impacto', [{ arq: EXD, ini: 0, ganho: 1, filtro: 'treble=g=12:f=2000' }, { arq: LB, ini: 0.05, ganho: 0.9, filtro: 'treble=g=8:f=2500' }, { arq: W, ini: 0.2, ganho: 0.8, filtro: 'treble=g=10:f=2200' }, { arq: grave, ini: 0, ganho: 0.5 }], 2.6);
console.log('ok');
