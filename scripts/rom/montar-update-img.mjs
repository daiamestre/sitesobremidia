// F-201 — remonta um update.img da Rockchip (RKFW/RKAF) trocando SÓ a partição system.
// Tudo o mais (carregador, parameter/tabela de partições, trust, uboot, misc, kernel, resource, boot, recovery) é
// copiado byte a byte do original. Recalcula a tabela interna, o CRC da Rockchip e o MD5 do fim do arquivo.
//   node scripts/rom/montar-update-img.mjs <update.img original> <saida.img> [--system <novo system.img sparse>]
// Sem --system, remonta o original (prova de que o remontador está certo: a saída tem de ser idêntica).
import fs from 'node:fs';
import crypto from 'node:crypto';

const [origem, saida] = process.argv.slice(2);
const iSys = process.argv.indexOf('--system');
const novoSystem = iSys > 0 ? process.argv[iSys + 1] : null;
if (!origem || !saida || saida.startsWith('--')) { console.error('uso: montar-update-img.mjs <original> <saida> [--system <system.img>]'); process.exit(2); }
if (fs.existsSync(saida)) { console.error(`já existe: ${saida} (apague antes; nada foi sobrescrito)`); process.exit(2); }

// CRC da Rockchip (polinômio 0x04C10DB7, sem reflexão, começa em 0), conferido contra o update.img original
const T = new Uint32Array(256);
for (let i = 0; i < 256; i++) { let c = (i << 24) >>> 0; for (let j = 0; j < 8; j++) c = (c & 0x80000000) ? ((c << 1) ^ 0x04c10db7) >>> 0 : (c << 1) >>> 0; T[i] = c >>> 0; }
let crc = 0;
const md5 = crypto.createHash('md5');

const fdIn = fs.openSync(origem, 'r');
const ler = (pos, n) => { const b = Buffer.alloc(n); fs.readSync(fdIn, b, 0, n, pos); return b; };
const fdOut = fs.openSync(saida, 'w');
let posSaida = 0;
const escrever = (b, contarCrc) => {
  fs.writeSync(fdOut, b, 0, b.length, posSaida); posSaida += b.length;
  md5.update(b);
  if (contarCrc) for (let k = 0; k < b.length; k++) crc = ((crc << 8) ^ T[((crc >>> 24) ^ b[k]) & 0xff]) >>> 0;
};
const copiarDe = (fd, de, n, contarCrc) => {
  const buf = Buffer.alloc(8 * 1024 * 1024);
  while (n > 0) { const k = Math.min(n, buf.length); fs.readSync(fd, buf, 0, k, de); escrever(k === buf.length ? buf : buf.subarray(0, k), contarCrc); de += k; n -= k; }
};

const fw = ler(0, 0x66);
if (fw.toString('latin1', 0, 4) !== 'RKFW') throw new Error('original não é RKFW');
const inicioAf = fw.readUInt32LE(0x21);
const tabela = ler(inicioAf, 2048);
if (tabela.toString('latin1', 0, 4) !== 'RKAF') throw new Error('RKAF não encontrado');
const n = tabela.readUInt32LE(136);
const itens = [];
for (let i = 0; i < n; i++) {
  const o = 140 + 112 * i;
  itens.push({ o, nome: tabela.toString('latin1', o, o + 32).replace(/\0.*$/s, ''), pos: tabela.readUInt32LE(o + 96), tam: tabela.readUInt32LE(o + 108) });
}
const sys = itens.find((x) => x.nome === 'system');
if (!sys) throw new Error('item system não encontrado');
let fdSys = null;
if (novoSystem) {
  fdSys = fs.openSync(novoSystem, 'r');
  const m = Buffer.alloc(4); fs.readSync(fdSys, m, 0, 4, 0);
  if (m.readUInt32LE(0) !== 0xed26ff3a) throw new Error('o novo system.img tem de estar no formato sparse (scripts/rom/sparse.mjs fechar)');
}

// nova tabela: mesmas partes, na mesma ordem; posições em blocos de 2048 (blocos = tamanho/2048 + 1, como no original)
const nova = Buffer.from(tabela);
let pos = 2048;
for (const it of itens) {
  if (it.tam === 0 && it.pos === 0) continue; // "backup RESERVED": sem dados
  const tam = it === sys && fdSys ? fs.fstatSync(fdSys).size : it.tam;
  const blocos = Math.floor(tam / 2048) + 1;
  nova.writeUInt32LE(pos, it.o + 96);
  nova.writeUInt32LE(blocos, it.o + 104);
  nova.writeUInt32LE(tam, it.o + 108);
  it.novaPos = pos; it.novoTam = tam; it.blocos = blocos;
  pos += blocos * 2048;
}
const tamanhoAf = pos;
nova.writeUInt32LE(tamanhoAf, 4);

// cabeçalho RKFW (só o tamanho da imagem muda) + carregador, iguais ao original
const fwNovo = Buffer.from(fw);
fwNovo.writeUInt32LE(tamanhoAf + 4, 0x25);
escrever(fwNovo, false);
copiarDe(fdIn, 0x66, inicioAf - 0x66, false);
// RKAF
escrever(nova, true);
for (const it of itens) {
  if (it.novaPos === undefined) continue;
  if (posSaida - inicioAf !== it.novaPos) escrever(Buffer.alloc(it.novaPos - (posSaida - inicioAf)), true);
  if (it === sys && fdSys) copiarDe(fdSys, 0, it.novoTam, true);
  else copiarDe(fdIn, inicioAf + it.pos, it.tam, true);
  const resto = it.blocos * 2048 - it.novoTam;
  if (resto > 0) {
    // o original completa com o que vem depois no arquivo; para a remontagem ficar idêntica, copiamos o mesmo enchimento
    if (!(it === sys && fdSys)) copiarDe(fdIn, inicioAf + it.pos + it.tam, resto, true); else escrever(Buffer.alloc(resto), true);
  }
}
const c = Buffer.alloc(4); c.writeUInt32LE(crc, 0);
escrever(c, false);
const fim = Buffer.from(md5.digest('hex'), 'latin1');
fs.writeSync(fdOut, fim, 0, 32, posSaida); posSaida += 32;
fs.closeSync(fdOut); fs.closeSync(fdIn); if (fdSys) fs.closeSync(fdSys);
console.log(JSON.stringify({ saida, tamanho: posSaida, crcRockchip: crc.toString(16), md5: fim.toString('latin1'),
  particoes: itens.filter((x) => x.novaPos !== undefined).map((x) => ({ nome: x.nome, posicao: x.novaPos, tamanho: x.novoTam, trocada: x === sys && !!fdSys })) }, null, 2));
