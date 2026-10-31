// ZIP sem compressão (PNG/WebP já são comprimidos), com data fixa: o mesmo conteúdo gera sempre o mesmo arquivo.
// Usado no "Baixar todas (ZIP)" das logos (montado no navegador: um ZIP fixo de 10 MB passaria do teto de 2 MB por
// arquivo do site, trava da Vercel) e no script scripts/marca/montar-pasta-logos.mjs.

export interface ArquivoDoZip { nome: string; dados: Uint8Array }

const TAB = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
export const crc32 = (b: Uint8Array) => { let c = -1; for (const x of b) c = TAB[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };

export function montarZip(arquivos: ArquivoDoZip[]): Uint8Array<ArrayBuffer> {
  const DATA = ((2026 - 1980) << 9) | (10 << 5) | 24, HORA = 12 << 11;
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [], central: Uint8Array[] = [];
  let pos = 0;
  for (const a of arquivos) {
    const n = enc.encode(a.nome), crc = crc32(a.dados);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 10, true); h.setUint16(6, 0x0800, true); h.setUint16(10, HORA, true); h.setUint16(12, DATA, true);
    h.setUint32(14, crc, true); h.setUint32(18, a.dados.length, true); h.setUint32(22, a.dados.length, true); h.setUint16(26, n.length, true);
    partes.push(new Uint8Array(h.buffer), n, a.dados);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 10, true); c.setUint16(8, 0x0800, true); c.setUint16(12, HORA, true); c.setUint16(14, DATA, true);
    c.setUint32(16, crc, true); c.setUint32(20, a.dados.length, true); c.setUint32(24, a.dados.length, true); c.setUint16(28, n.length, true); c.setUint32(42, pos, true);
    central.push(new Uint8Array(c.buffer), n);
    pos += 30 + n.length + a.dados.length;
  }
  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, arquivos.length, true); fim.setUint16(10, arquivos.length, true); fim.setUint32(12, tamCentral, true); fim.setUint32(16, pos, true);
  const tudo = [...partes, ...central, new Uint8Array(fim.buffer)];
  const out = new Uint8Array(new ArrayBuffer(tudo.reduce((s, p) => s + p.length, 0)));
  let i = 0;
  for (const p of tudo) { out.set(p, i); i += p.length; }
  return out;
}
