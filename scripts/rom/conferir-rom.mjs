// F-201 — confere uma ROM gerada ANTES de gravar em qualquer aparelho:
//   - carregador, parameter (tabela de partições), trust, uboot, misc, kernel, resource, boot, recovery: IDÊNTICOS ao original;
//   - CRC da Rockchip e MD5 do fim do arquivo corretos (o FactoryTool recusa arquivo corrompido);
//   - system: só ele mudou, cabe na partição do parameter.
//   node scripts/rom/conferir-rom.mjs <update.img original> <update.img gerado>
import crypto from 'node:crypto';
import fs from 'node:fs';

const [orig, novo] = process.argv.slice(2);
if (!orig || !novo) { console.error('uso: conferir-rom.mjs <original> <gerado>'); process.exit(2); }
const T = new Uint32Array(256);
for (let i = 0; i < 256; i++) { let c = (i << 24) >>> 0; for (let j = 0; j < 8; j++) c = (c & 0x80000000) ? ((c << 1) ^ 0x04c10db7) >>> 0 : (c << 1) >>> 0; T[i] = c >>> 0; }

function abrir(f) {
  const fd = fs.openSync(f, 'r');
  const ler = (p, n) => { const b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, p); return b; };
  const fw = ler(0, 0x66);
  const base = fw.readUInt32LE(0x21);
  const af = ler(base, 2048);
  const itens = {};
  for (let i = 0; i < af.readUInt32LE(136); i++) {
    const o = 140 + 112 * i;
    itens[af.toString('latin1', o, o + 32).replace(/\0.*$/s, '')] = { pos: af.readUInt32LE(o + 96), tam: af.readUInt32LE(o + 108), nand: af.readUInt32LE(o + 92) };
  }
  return { fd, ler, fw, base, af, itens, tamanho: fs.fstatSync(fd).size, imgLen: fw.readUInt32LE(0x25), afLen: af.readUInt32LE(4) };
}
const hashDe = (a, pos, tam) => {
  const h = crypto.createHash('sha256'); const buf = Buffer.alloc(8 << 20);
  while (tam > 0) { const k = Math.min(tam, buf.length); fs.readSync(a.fd, buf, 0, k, pos); h.update(k === buf.length ? buf : buf.subarray(0, k)); pos += k; tam -= k; }
  return h.digest('hex');
};
const o = abrir(orig), g = abrir(novo);
const problemas = [];
const ok = (cond, msg) => { console.log(`${cond ? 'OK   ' : 'FALHA'} ${msg}`); if (!cond) problemas.push(msg); };

ok(g.fw.toString('latin1', 0, 4) === 'RKFW' && g.af.toString('latin1', 0, 4) === 'RKAF', 'formato RKFW/RKAF');
ok(g.ler(0x66, o.base - 0x66).equals(o.ler(0x66, o.base - 0x66)), 'carregador (MiniLoader) idêntico');
for (const nome of Object.keys(o.itens)) {
  if (nome === 'system' || o.itens[nome].tam === 0) continue;
  const a = o.itens[nome], b = g.itens[nome];
  ok(!!b && b.tam === a.tam && hashDe(o, o.base + a.pos, a.tam) === hashDe(g, g.base + b.pos, b.tam), `${nome} idêntico ao original`);
}
const sys = g.itens.system;
const limite = o.itens.system.nand * 512;
const mag = g.ler(g.base + sys.pos, 28);
const abertoBytes = mag.readUInt32LE(12) * mag.readUInt32LE(16);
ok(mag.readUInt32LE(0) === 0xed26ff3a, 'system no formato sparse');
ok(abertoBytes <= limite, `system cabe na partição (${(abertoBytes / 1048576).toFixed(0)} MB de ${(limite / 1048576).toFixed(0)} MB)`);
ok(g.imgLen === g.afLen + 4 && g.tamanho === g.base + g.imgLen + 32, 'tamanhos internos coerentes');

let crc = 0;
await new Promise((res) => {
  fs.createReadStream(novo, { start: g.base, end: g.base + g.afLen - 1, highWaterMark: 8 << 20 })
    .on('data', (d) => { for (let k = 0; k < d.length; k++) crc = ((crc << 8) ^ T[((crc >>> 24) ^ d[k]) & 0xff]) >>> 0; })
    .on('end', res);
});
ok(g.ler(g.base + g.afLen, 4).readUInt32LE(0) === crc, 'CRC da Rockchip correto');
const md5 = crypto.createHash('md5');
await new Promise((res) => fs.createReadStream(novo, { start: 0, end: g.tamanho - 33, highWaterMark: 8 << 20 }).on('data', (d) => md5.update(d)).on('end', res));
ok(g.ler(g.tamanho - 32, 32).toString('latin1') === md5.digest('hex'), 'MD5 do fim do arquivo correto');
console.log(problemas.length ? `\nNÃO GRAVAR: ${problemas.length} problema(s)` : '\nROM CONFERIDA: só o system mudou; o resto é idêntico à ROM base');
process.exitCode = problemas.length ? 1 : 0;
