/**
 * Duração EXATA (ms) de um MP4/MOV lida das caixas do arquivo, igual ao que o Player (ExoPlayer) usa: a maior entre
 * `mvhd` e as trilhas (vídeo/áudio). Funciona também com MP4 fragmentado (duração 0 no `mvhd`), que o `<video>` do
 * navegador não consegue medir. Retorna null se não for MP4 ou se não houver duração.
 */

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'mvex', 'moof', 'traf', 'edts']);

interface Box { type: string; start: number; end: number; body: number }

function readBoxes(v: DataView, start: number, end: number, out: Box[]): void {
  let p = start;
  while (p + 8 <= end) {
    let size = v.getUint32(p);
    const type = String.fromCharCode(v.getUint8(p + 4), v.getUint8(p + 5), v.getUint8(p + 6), v.getUint8(p + 7));
    let header = 8;
    if (size === 1) {
      if (p + 16 > end) return;
      size = Number(v.getBigUint64(p + 8));
      header = 16;
    } else if (size === 0) {
      size = end - p;
    }
    if (size < header || p + size > end) return;
    const box = { type, start: p, end: p + size, body: p + header };
    out.push(box);
    if (CONTAINERS.has(type)) readBoxes(v, box.body, box.end, out);
    p += size;
  }
}

const inside = (boxes: Box[], parent: Box) => boxes.filter(b => b.start > parent.start && b.end <= parent.end);

function fullBoxTime(v: DataView, box: Box, offsetV0: number, offsetV1: number): { timescale: number; duration: number } {
  const version = v.getUint8(box.body);
  if (version === 1) return { timescale: v.getUint32(box.body + offsetV1), duration: Number(v.getBigUint64(box.body + offsetV1 + 4)) };
  return { timescale: v.getUint32(box.body + offsetV0), duration: v.getUint32(box.body + offsetV0 + 4) };
}

export function mp4DurationMs(buffer: ArrayBuffer): number | null {
  try {
    const v = new DataView(buffer);
    const boxes: Box[] = [];
    readBoxes(v, 0, buffer.byteLength, boxes);
    if (!boxes.some(b => b.type === 'moov')) return null;

    let best = 0;
    const mvhd = boxes.find(b => b.type === 'mvhd');
    if (mvhd) {
      const t = fullBoxTime(v, mvhd, 12, 20);
      if (t.timescale > 0) best = Math.max(best, (t.duration / t.timescale) * 1000);
    }

    const trackScale: Record<number, number> = {};
    const trexDefault: Record<number, number> = {};
    for (const trak of boxes.filter(b => b.type === 'trak')) {
      const kids = inside(boxes, trak);
      const tkhd = kids.find(b => b.type === 'tkhd');
      const mdhd = kids.find(b => b.type === 'mdhd');
      if (!mdhd) continue;
      const t = fullBoxTime(v, mdhd, 12, 20);
      if (tkhd) {
        const trackId = v.getUint32(tkhd.body + (v.getUint8(tkhd.body) === 1 ? 20 : 12));
        trackScale[trackId] = t.timescale;
      }
      let ticks = 0;
      const stts = kids.find(b => b.type === 'stts');
      if (stts) {
        const n = v.getUint32(stts.body + 4);
        for (let i = 0; i < n; i++) ticks += v.getUint32(stts.body + 8 + 8 * i) * v.getUint32(stts.body + 12 + 8 * i);
      }
      if (!ticks) ticks = t.duration;
      if (t.timescale > 0) best = Math.max(best, (ticks / t.timescale) * 1000);
    }

    for (const trex of boxes.filter(b => b.type === 'trex')) {
      trexDefault[v.getUint32(trex.body + 4)] = v.getUint32(trex.body + 12);
    }
    const fragTicks: Record<number, number> = {};
    for (const traf of boxes.filter(b => b.type === 'traf')) {
      const kids = inside(boxes, traf);
      const tfhd = kids.find(b => b.type === 'tfhd');
      if (!tfhd) continue;
      const flags = v.getUint32(tfhd.body) & 0xffffff;
      const trackId = v.getUint32(tfhd.body + 4);
      let o = tfhd.body + 8;
      if (flags & 0x1) o += 8;
      if (flags & 0x2) o += 4;
      let defaultDuration = trexDefault[trackId] ?? 0;
      if (flags & 0x8) defaultDuration = v.getUint32(o);
      for (const trun of kids.filter(b => b.type === 'trun')) {
        const f = v.getUint32(trun.body) & 0xffffff;
        const count = v.getUint32(trun.body + 4);
        let q = trun.body + 8;
        if (f & 0x1) q += 4;
        if (f & 0x4) q += 4;
        for (let i = 0; i < count; i++) {
          let d = defaultDuration;
          if (f & 0x100) { d = v.getUint32(q); q += 4; }
          if (f & 0x200) q += 4;
          if (f & 0x400) q += 4;
          if (f & 0x800) q += 4;
          fragTicks[trackId] = (fragTicks[trackId] ?? 0) + d;
        }
      }
    }
    for (const [id, ticks] of Object.entries(fragTicks)) {
      const scale = trackScale[Number(id)];
      if (scale > 0) best = Math.max(best, (ticks / scale) * 1000);
    }

    return best > 0 ? Math.round(best) : null;
  } catch {
    return null;
  }
}
