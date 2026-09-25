import { describe, it, expect } from 'vitest';
import { mp4DurationMs } from '@/lib/mp4Duration';
import { formatDurationMs, playbackOf, secondsForRealMs } from '@/lib/mediaDuration';

// Monta caixas MP4 mínimas (tamanho + tipo + corpo).
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const box = (type: string, ...body: number[][]) => {
  const inner = body.flat();
  return [...u32(8 + inner.length), ...type.split('').map(c => c.charCodeAt(0)), ...inner];
};
const full = (v: number, flags: number) => [v, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255];
const zeros = (n: number) => new Array(n).fill(0);
const mvhd = (timescale: number, duration: number) => box('mvhd', full(0, 0), u32(0), u32(0), u32(timescale), u32(duration), zeros(80));
const tkhd = (id: number) => box('tkhd', full(0, 0), u32(0), u32(0), u32(id), u32(0), u32(0), zeros(60));
const mdhd = (timescale: number, duration: number) => box('mdhd', full(0, 0), u32(0), u32(0), u32(timescale), u32(duration), u32(0));
const stts = (entries: Array<[number, number]>) =>
  box('stts', full(0, 0), u32(entries.length), ...entries.map(([c, d]) => [...u32(c), ...u32(d)]));
const trak = (id: number, scale: number, mdDur: number, sttsEntries: Array<[number, number]>) =>
  box('trak', tkhd(id), box('mdia', mdhd(scale, mdDur), box('minf', box('stbl', stts(sttsEntries)))));
const buf = (bytes: number[]) => new Uint8Array(bytes).buffer;
const ftyp = () => box('ftyp', [0, 0, 0, 0]);

describe('mp4DurationMs — mesma régua do Player (maior entre mvhd e trilhas)', () => {
  it('MP4 normal: usa a trilha mais longa (áudio 15,180 s > vídeo 15,015 s)', () => {
    // vídeo: 450 amostras x 400 ticks / 11988 = 15,015 s; áudio: (327 x 2048 + 1742) / 44100 = 15,226... -> ajustado abaixo
    const audioTicks = 669438; // 15,180 s a 44100 Hz
    const file = [...ftyp(), ...box('moov', mvhd(1000, 15015), trak(1, 11988, 180000, [[450, 400]]), trak(2, 44100, audioTicks, [[1, audioTicks]]))];
    expect(mp4DurationMs(buf(file))).toBe(15180);
  });

  it('MP4 fragmentado (mvhd = 0): soma os trun da trilha', () => {
    const mvex = box('mvex', box('trex', full(0, 0), u32(1), u32(1), u32(512), u32(0), u32(0)));
    const moov = box('moov', mvhd(1000, 0), trak(1, 15360, 0, []), mvex);
    // 2 fragmentos x 450 amostras x 512 ticks (duração padrão do trex) = 460800 / 15360 = 30,000 s
    const frag = () => box('moof', box('traf', box('tfhd', full(0, 0), u32(1)), box('trun', full(0, 0), u32(450))));
    expect(mp4DurationMs(buf([...ftyp(), ...moov, ...frag(), ...frag()]))).toBe(30000);
  });

  it('não é MP4 / lixo: null (nunca quebra)', () => {
    expect(mp4DurationMs(buf([1, 2, 3, 4, 5]))).toBeNull();
    expect(mp4DurationMs(buf(ftyp()))).toBeNull();
    expect(mp4DurationMs(new ArrayBuffer(0))).toBeNull();
  });
});

describe('Tempo de Mídia exato', () => {
  it('formata com milésimos', () => {
    expect(formatDurationMs(17764)).toBe('17,764 s');
    expect(formatDurationMs(6928)).toBe('6,928 s');
  });

  it('segundo cheio para cima: a tela toca a duração real inteira', () => {
    expect(secondsForRealMs(17764)).toBe(18);
    expect(secondsForRealMs(10000)).toBe(10);
    expect(secondsForRealMs(null)).toBeNull();
  });

  it('o que a tela toca: vídeo inteiro ou corte', () => {
    expect(playbackOf(18, 17764)).toEqual({ playsMs: 17764, cut: false });
    expect(playbackOf(13, 14116)).toEqual({ playsMs: 13000, cut: true });
    expect(playbackOf(10, null)).toBeNull();
  });
});
