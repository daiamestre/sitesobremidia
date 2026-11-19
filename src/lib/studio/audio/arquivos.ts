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

// ——— F-323 (pedido do dono, 18/11/2026): a MARCA "Editado no SOBRE MÍDIA Studio" ———
// Todo áudio salvo/baixado pelo editor leva, nas informações do arquivo (ID3 no MP3, LIST/INFO no WAV), que foi editado no
// SOBRE MÍDIA Studio: nome, data, versão e o código da edição. É uma marca VERDADEIRA de edição — não apaga nem disfarça o
// conteúdo, e não declara autoria ou direitos autorais (quem tem os direitos continua sendo quem tem a licença do material).
export const PROGRAMA = 'SOBRE MÍDIA Studio — Editor de Áudio';
const CHAVE_DA_MARCA = 'SOBREMIDIA_EDICAO';
export interface MarcaDoStudio { nome: string; codigo: string; versao: number; editadoEm: string }

const utf16 = (s: string) => { const b = new Uint8Array(2 + s.length * 2); b[0] = 0xff; b[1] = 0xfe; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); b[2 + i * 2] = c & 255; b[3 + i * 2] = c >> 8; } return b; };
const juntarBytes = (...ps: Uint8Array[]) => { const o = new Uint8Array(ps.reduce((t, p) => t + p.length, 0)); let k = 0; for (const p of ps) { o.set(p, k); k += p.length; } return o; };
function quadroId3(id: string, corpo: Uint8Array): Uint8Array {
  const h = new Uint8Array(10); for (let i = 0; i < 4; i++) h[i] = id.charCodeAt(i);
  new DataView(h.buffer).setUint32(4, corpo.length); return juntarBytes(h, corpo);
}
const textoId3 = (id: string, s: string) => quadroId3(id, juntarBytes(new Uint8Array([1]), utf16(s)));
const fim16 = new Uint8Array([0, 0]);
const dataBr = (iso: string) => new Date(iso).toLocaleString('pt-BR');
const textoDaMarca = (m: MarcaDoStudio) => `Editado no SOBRE MÍDIA Studio em ${dataBr(m.editadoEm)} (versão ${m.versao}, edição ${m.codigo})`;

/** ID3v2.3 no começo do MP3 */
export function marcarMp3(mp3: Uint8Array, m: MarcaDoStudio): Uint8Array {
  const quadros = juntarBytes(
    textoId3('TIT2', m.nome),
    textoId3('TSSE', PROGRAMA),
    textoId3('TENC', 'SOBRE MÍDIA Studio'),
    quadroId3('COMM', juntarBytes(new Uint8Array([1]), new TextEncoder().encode('por'), utf16(''), fim16, utf16(textoDaMarca(m)))),
    quadroId3('TXXX', juntarBytes(new Uint8Array([1]), utf16(CHAVE_DA_MARCA), fim16, utf16(JSON.stringify(m)))),
  );
  const n = quadros.length, cab = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, (n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127]);
  return juntarBytes(cab, quadros, mp3);
}

/** bloco LIST/INFO no fim do WAV */
export function marcarWav(wav: Uint8Array, m: MarcaDoStudio): Uint8Array {
  const sub = (id: string, s: string) => {
    const t = new TextEncoder().encode(s), n = t.length + 1, b = new Uint8Array(8 + n + (n & 1));
    for (let i = 0; i < 4; i++) b[i] = id.charCodeAt(i); new DataView(b.buffer).setUint32(4, n, true); b.set(t, 8); return b;
  };
  const info = juntarBytes(new TextEncoder().encode('INFO'), sub('INAM', m.nome), sub('ISFT', PROGRAMA), sub('ICMT', textoDaMarca(m)), sub('ICRD', m.editadoEm.slice(0, 10)), sub('ISBJ', `${CHAVE_DA_MARCA}=${JSON.stringify(m)}`));
  const lista = juntarBytes(new TextEncoder().encode('LIST'), new Uint8Array(4), info);
  new DataView(lista.buffer).setUint32(4, info.length, true);
  const out = juntarBytes(wav, lista);
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  return out;
}

/** lê a marca do Studio de um MP3/WAV (null = não foi editado no Studio) */
export function lerMarcaDoStudio(bytes: Uint8Array): MarcaDoStudio | null {
  const procurar = (texto: string) => {
    const i = texto.indexOf(CHAVE_DA_MARCA); if (i < 0) return null;
    const j = texto.indexOf('{', i); if (j < 0) return null;
    // o nome pode ter chaves: tenta cada '}' até o JSON fechar
    for (let k = texto.indexOf('}', j); k > j && k - j < 2000; k = texto.indexOf('}', k + 1)) { try { return JSON.parse(texto.slice(j, k + 1)) as MarcaDoStudio; } catch { /* segue */ } }
    return null;
  };
  const cabeca = bytes.subarray(0, 4);
  if (String.fromCharCode(...cabeca.subarray(0, 3)) === 'ID3') {
    const n = ((bytes[6] & 127) << 21) | ((bytes[7] & 127) << 14) | ((bytes[8] & 127) << 7) | (bytes[9] & 127);
    const area = bytes.subarray(10, 10 + n);
    // texto UTF-16LE: tira os zeros para achar a chave e o JSON
    let s = ''; for (let i = 0; i + 1 < area.length; i += 2) s += String.fromCharCode(area[i] | (area[i + 1] << 8));
    let s2 = ''; for (let i = 1; i + 1 < area.length; i += 2) s2 += String.fromCharCode(area[i] | (area[i + 1] << 8));
    return procurar(s) ?? procurar(s2);
  }
  if (String.fromCharCode(...cabeca) === 'RIFF') {
    const fim = bytes.subarray(Math.max(0, bytes.length - 4096));
    return procurar(new TextDecoder().decode(fim));
  }
  return null;
}

export function codificar(s: Som, formato: FormatoDeAudio, kbps = 192, marca?: MarcaDoStudio): { bytes: Uint8Array; tipo: string; ext: string } {
  if (formato === 'mp3') { const b = codificarMp3(s, kbps); return { bytes: marca ? marcarMp3(b, marca) : b, tipo: 'audio/mpeg', ext: 'mp3' }; }
  const w = codificarWav(s, formato === 'wav24' ? 24 : formato === 'wav32' ? 32 : 16);
  return { bytes: marca ? marcarWav(w, marca) : w, tipo: 'audio/wav', ext: 'wav' };
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

/**
 * abre qualquer áudio (ou vídeo com áudio) que o navegador entende.
 * F-330: lê com um contexto OFFLINE (não ocupa o alto-falante). Antes, cada arquivo aberto criava um AudioContext de verdade;
 * o iPhone aceita poucos ao mesmo tempo e, depois de alguns, o editor ficava SEM SOM.
 */
export async function decodificarArquivo(dados: ArrayBuffer): Promise<Som> {
  const b = new Uint8Array(dados);
  try {
    const Off = (window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext);
    const ctx = new Off(2, 1, 44100);
    return deAudioBuffer(await ctx.decodeAudioData(dados.slice(0)));
  } catch (e) {
    if (String.fromCharCode(...b.subarray(0, 4)) === 'RIFF') return lerWav(b);
    throw e;
  }
}

export function baixarArquivo(bytes: Uint8Array, tipo: string, nome: string) {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: tipo }));
  const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
