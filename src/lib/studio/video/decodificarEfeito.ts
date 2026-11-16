// SOBRE MÍDIA STUDIO — F-319: os quadros EXATOS das filmagens de efeito na exportação, sem "pular" o vídeo a cada quadro.
// Pular (currentTime + esperar) custava ~0,1 s por quadro e dobrava o tempo de exportar. Aqui o MP4 do efeito (feito por nós:
// H.264 sem quadros B, moov no começo) é lido aqui mesmo e decodificado em sequência pelo WebCodecs: cada quadro do vídeo final
// decodifica só o quadro seguinte do efeito. Se o aparelho não tiver o decodificador, o chamador volta ao modo de pular.

interface Amostra { off: number; tam: number; chave: boolean; ts: number }
interface Trilha { amostras: Amostra[]; dados: Uint8Array; codec: string; descricao: Uint8Array; w: number; h: number; dur: number }

const u32 = (b: DataView, o: number) => b.getUint32(o);
const tipoEm = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
interface Caixa { tipo: string; ini: number; fim: number }
function caixas(dv: DataView, b: Uint8Array, ini: number, fim: number): Caixa[] {
  const out: Caixa[] = [];
  let o = ini;
  while (o + 8 <= fim) {
    let tam = u32(dv, o); const tipo = tipoEm(b, o + 4); let cab = 8;
    if (tam === 1) { tam = Number(dv.getBigUint64(o + 8)); cab = 16; } else if (tam === 0) tam = fim - o;
    if (tam < cab) break;
    out.push({ tipo, ini: o + cab, fim: o + tam });
    o += tam;
  }
  return out;
}
const filho = (dv: DataView, b: Uint8Array, c: Caixa, tipo: string, pular = 0) => caixas(dv, b, c.ini + pular, c.fim).find((x) => x.tipo === tipo);

/** lê a trilha de vídeo do MP4 (só o necessário para decodificar) */
export function lerMp4(buf: ArrayBuffer): Trilha | null {
  const b = new Uint8Array(buf), dv = new DataView(buf);
  const moov = caixas(dv, b, 0, b.length).find((c) => c.tipo === 'moov');
  if (!moov) return null;
  for (const trak of caixas(dv, b, moov.ini, moov.fim).filter((c) => c.tipo === 'trak')) {
    const mdia = filho(dv, b, trak, 'mdia'); if (!mdia) continue;
    const hdlr = filho(dv, b, mdia, 'hdlr'); if (!hdlr || tipoEm(b, hdlr.ini + 8) !== 'vide') continue;
    const mdhd = filho(dv, b, mdia, 'mdhd')!;
    const escala = b[mdhd.ini] === 1 ? u32(dv, mdhd.ini + 20) : u32(dv, mdhd.ini + 12);
    const stbl = filho(dv, b, filho(dv, b, mdia, 'minf')!, 'stbl')!;
    const stsd = filho(dv, b, stbl, 'stsd')!;
    const avc1 = caixas(dv, b, stsd.ini + 8, stsd.fim)[0];
    if (!avc1 || (avc1.tipo !== 'avc1' && avc1.tipo !== 'avc3')) return null;
    const w = dv.getUint16(avc1.ini + 24), h = dv.getUint16(avc1.ini + 26);
    const avcC = caixas(dv, b, avc1.ini + 78, avc1.fim).find((c) => c.tipo === 'avcC');
    if (!avcC) return null;
    const descricao = b.slice(avcC.ini, avcC.fim);
    const hex = (n: number) => n.toString(16).padStart(2, '0');
    const codec = `avc1.${hex(descricao[1])}${hex(descricao[2])}${hex(descricao[3])}`;
    // tamanhos, chaves, tempos e posições das amostras
    const stsz = filho(dv, b, stbl, 'stsz')!;
    const fixo = u32(dv, stsz.ini + 4), n = u32(dv, stsz.ini + 8);
    const tams = Array.from({ length: n }, (_, i) => (fixo || u32(dv, stsz.ini + 12 + i * 4)));
    const stss = filho(dv, b, stbl, 'stss');
    const chaves = new Set<number>(stss ? Array.from({ length: u32(dv, stss.ini + 4) }, (_, i) => u32(dv, stss.ini + 8 + i * 4) - 1) : tams.map((_, i) => i));
    const stts = filho(dv, b, stbl, 'stts')!;
    const ts: number[] = []; let t = 0;
    for (let e = 0, ne = u32(dv, stts.ini + 4); e < ne; e++) { const cnt = u32(dv, stts.ini + 8 + e * 8), d = u32(dv, stts.ini + 12 + e * 8); for (let k = 0; k < cnt; k++) { ts.push(t); t += d; } }
    const stsc = filho(dv, b, stbl, 'stsc')!;
    const corridas = Array.from({ length: u32(dv, stsc.ini + 4) }, (_, i) => ({ primeiro: u32(dv, stsc.ini + 8 + i * 12), por: u32(dv, stsc.ini + 12 + i * 12) }));
    const stco = filho(dv, b, stbl, 'stco'), co64 = filho(dv, b, stbl, 'co64');
    const nc = stco ? u32(dv, stco.ini + 4) : u32(dv, co64!.ini + 4);
    const blocos = Array.from({ length: nc }, (_, i) => (stco ? u32(dv, stco.ini + 8 + i * 4) : Number(dv.getBigUint64(co64!.ini + 8 + i * 8))));
    const amostras: Amostra[] = [];
    let s = 0;
    for (let c = 0; c < nc && s < n; c++) {
      let por = corridas[0].por;
      for (const r of corridas) if (c + 1 >= r.primeiro) por = r.por;
      let off = blocos[c];
      for (let k = 0; k < por && s < n; k++, s++) { amostras.push({ off, tam: tams[s], chave: chaves.has(s), ts: Math.round(((ts[s] ?? 0) / escala) * 1e6) }); off += tams[s]; }
    }
    return { amostras, dados: b, codec, descricao, w, h, dur: t / escala };
  }
  return null;
}

const ARQUIVOS = new Map<string, Promise<Trilha | null>>();
function trilhaDe(url: string) {
  let p = ARQUIVOS.get(url);
  if (!p) { p = fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).then((a) => (a ? lerMp4(a) : null)).catch(() => null); ARQUIVOS.set(url, p); }
  return p;
}

/** decodifica UMA camada de efeito em sequência; `quadroEm(local)` devolve o quadro daquele instante (o anterior é fechado) */
export class DecodificadorDeEfeito {
  private dec: VideoDecoder | null = null;
  private pos = -1;
  private enviados = 0;
  private recebidos = 0;
  private aviso: (() => void) | null = null;
  private falhou = false;
  quadro: VideoFrame | null = null;
  private constructor(private t: Trilha) {}

  static async abrir(url: string): Promise<DecodificadorDeEfeito | null> {
    if (typeof VideoDecoder === 'undefined') return null;
    const t = await trilhaDe(url);
    if (!t || !t.amostras.length) return null;
    const ok = await VideoDecoder.isConfigSupported({ codec: t.codec, codedWidth: t.w, codedHeight: t.h, description: t.descricao }).catch(() => null);
    return ok?.supported ? new DecodificadorDeEfeito(t) : null;
  }

  private comecar() {
    try { this.dec?.close(); } catch { /* já fechado */ }
    this.dec = new VideoDecoder({
      output: (f) => { this.quadro?.close(); this.quadro = f; this.recebidos++; if (this.recebidos >= this.enviados) this.aviso?.(); },
      error: () => { this.falhou = true; this.aviso?.(); },
    });
    this.dec.configure({ codec: this.t.codec, codedWidth: this.t.w, codedHeight: this.t.h, description: this.t.descricao, optimizeForLatency: true });
    this.enviados = 0; this.recebidos = 0;
  }

  /** o quadro do instante `local` (s) da filmagem; null = falhou (o chamador usa o modo de pular) */
  async quadroEm(local: number): Promise<VideoFrame | null> {
    const a = this.t.amostras;
    const alvoTs = local * 1e6 + 1000;
    let i = a.length - 1;
    while (i > 0 && a[i].ts > alvoTs) i--;
    if (i === this.pos && this.quadro) return this.quadro;
    if (!this.dec || this.falhou || i < this.pos || i - this.pos > 40) {
      if (this.falhou) return null;
      let k = i; while (k > 0 && !a[k].chave) k--;
      this.comecar();
      this.pos = k - 1;
    }
    for (let s = this.pos + 1; s <= i; s++) {
      const m = a[s];
      this.dec!.decode(new EncodedVideoChunk({ type: m.chave ? 'key' : 'delta', timestamp: m.ts, data: this.t.dados.subarray(m.off, m.off + m.tam) }));
      this.enviados++;
    }
    this.pos = i;
    if (this.recebidos < this.enviados) {
      const chegou = await new Promise<boolean>((ok) => { const lim = setTimeout(() => ok(false), 400); this.aviso = () => { clearTimeout(lim); ok(true); }; });
      this.aviso = null;
      if (!chegou && !this.falhou) {
        // o decodificador segurou o quadro: esvazia e recomeça da chave na próxima vez
        try { await this.dec!.flush(); } catch { /* sem efeito */ }
        try { this.dec?.close(); } catch { /* já fechado */ } this.dec = null;
      }
    }
    return this.falhou ? null : this.quadro;
  }

  fechar() { try { this.dec?.close(); } catch { /* sem efeito */ } this.dec = null; this.quadro?.close(); this.quadro = null; }
}
