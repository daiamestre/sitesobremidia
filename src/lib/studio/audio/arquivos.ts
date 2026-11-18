// SOBRE MÍDIA STUDIO — EDITOR DE ÁUDIO: arquivos. WAV (16 e 24 bits, 32 bits real) e MP3 (lamejs, 100% no navegador).
import { Mp3Encoder } from '@breezystack/lamejs';
import type { Som } from './som';

export type FormatoDeAudio = 'wav16' | 'wav24' | 'wav32' | 'mp3';

const lim = (v: number) => (v > 1 ? 1 : v < -1 ? -1 : v);

/** um WAV (PCM 16/24 bits ou ponto flutuante 32 bits) */
export function codificarWav(s: Som, bits: 16 | 24 | 32 = 16): Uint8Array {
  const nc = s.canais.length, n = s.canais[0]?.length ?? 0, bps = bits / 8, dados = n * nc * bps;
  const buf = new ArrayBuffer(44 + dados), v = new DataView(buf);
  const txt = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  txt(0, 'RIFF'); v.setUint32(4, 36 + dados, true); txt(8, 'WAVE'); txt(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, bits === 32 ? 3 : 1, true); v.setUint16(22, nc, true);
  v.setUint32(24, s.sr, true); v.setUint32(28, s.sr * nc * bps, true); v.setUint16(32, nc * bps, true); v.setUint16(34, bits, true);
  txt(36, 'data'); v.setUint32(40, dados, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
    const x = lim(s.canais[c][i]);
    if (bits === 16) { v.setInt16(o, Math.round(x < 0 ? x * 0x8000 : x * 0x7fff), true); o += 2; }
    else if (bits === 24) { const q = Math.round(x < 0 ? x * 0x800000 : x * 0x7fffff); v.setUint8(o, q & 0xff); v.setUint8(o + 1, (q >> 8) & 0xff); v.setUint8(o + 2, (q >> 16) & 0xff); o += 3; }
    else { v.setFloat32(o, s.canais[c][i], true); o += 4; }
  }
  return new Uint8Array(buf);
}

/** lê um WAV PCM simples (para os testes e para abrir WAV sem o decodificador do navegador) */
export function lerWav(bytes: Uint8Array): Som {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 12, sr = 44100, nc = 2, bits = 16, fmt = 1, dados: [number, number] | null = null;
  while (o + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.subarray(o, o + 4)), tam = v.getUint32(o + 4, true);
    if (id === 'fmt ') { fmt = v.getUint16(o + 8, true); nc = v.getUint16(o + 10, true); sr = v.getUint32(o + 12, true); bits = v.getUint16(o + 22, true); }
    if (id === 'data') { dados = [o + 8, tam]; break; }
    o += 8 + tam + (tam & 1);
  }
  if (!dados) throw new Error('WAV sem dados');
  const bps = bits / 8, n = Math.floor(dados[1] / (bps * nc)), canais = Array.from({ length: nc }, () => new Float32Array(n));
  let p = dados[0];
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
    if (fmt === 3) canais[c][i] = v.getFloat32(p, true);
    else if (bits === 16) canais[c][i] = v.getInt16(p, true) / 0x8000;
    else if (bits === 24) { let q = bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16); if (q & 0x800000) q -= 0x1000000; canais[c][i] = q / 0x800000; }
    else canais[c][i] = (bytes[p] - 128) / 128;
    p += bps;
  }
  return { sr, canais };
}

/** MP3 (CBR) em 1 ou 2 canais; taxas que o MP3 aceita: 32/44,1/48 kHz */
export function codificarMp3(s: Som, kbps = 192): Uint8Array {
  const nc = Math.min(2, s.canais.length);
  const enc = new Mp3Encoder(nc, s.sr, kbps);
  const paraInt16 = (c: Float32Array) => { const o = new Int16Array(c.length); for (let i = 0; i < c.length; i++) { const x = lim(c[i]); o[i] = x < 0 ? x * 0x8000 : x * 0x7fff; } return o; };
  const L = paraInt16(s.canais[0]), R = nc > 1 ? paraInt16(s.canais[1]) : undefined;
  const partes: Uint8Array[] = []; const BLOCO = 1152 * 8;
  for (let i = 0; i < L.length; i += BLOCO) {
    const p = R ? enc.encodeBuffer(L.subarray(i, i + BLOCO), R.subarray(i, i + BLOCO)) : enc.encodeBuffer(L.subarray(i, i + BLOCO));
    if (p.length) partes.push(new Uint8Array(p));
  }
  const fim = enc.flush(); if (fim.length) partes.push(new Uint8Array(fim));
  const total = partes.reduce((t, p) => t + p.length, 0), out = new Uint8Array(total);
  let o = 0; for (const p of partes) { out.set(p, o); o += p.length; }
  return out;
}

export function codificar(s: Som, formato: FormatoDeAudio, kbps = 192): { bytes: Uint8Array; tipo: string; ext: string } {
  if (formato === 'mp3') return { bytes: codificarMp3(s, kbps), tipo: 'audio/mpeg', ext: 'mp3' };
  return { bytes: codificarWav(s, formato === 'wav24' ? 24 : formato === 'wav32' ? 32 : 16), tipo: 'audio/wav', ext: 'wav' };
}

/** Web Audio → Som */
export function deAudioBuffer(b: AudioBuffer): Som {
  return { sr: b.sampleRate, canais: Array.from({ length: b.numberOfChannels }, (_, i) => new Float32Array(b.getChannelData(i))) };
}
/** Som → Web Audio */
export function paraAudioBuffer(ctx: BaseAudioContext, s: Som): AudioBuffer {
  const n = Math.max(1, s.canais[0]?.length ?? 0), b = ctx.createBuffer(Math.max(1, s.canais.length), n, s.sr);
  s.canais.forEach((c, i) => { if (c.length) b.copyToChannel(c as Float32Array<ArrayBuffer>, i); });
  return b;
}

/** abre qualquer áudio (ou vídeo com áudio) que o navegador entende */
export async function decodificarArquivo(dados: ArrayBuffer): Promise<Som> {
  const Ctx = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
  const ctx = new Ctx();
  try { return deAudioBuffer(await ctx.decodeAudioData(dados.slice(0))); }
  catch (e) {
    const b = new Uint8Array(dados);
    if (String.fromCharCode(...b.subarray(0, 4)) === 'RIFF') return lerWav(b);
    throw e;
  } finally { void ctx.close(); }
}

export function baixarArquivo(bytes: Uint8Array, tipo: string, nome: string) {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: tipo }));
  const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
