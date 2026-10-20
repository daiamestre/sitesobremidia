// F-201 — imagem "sparse" do Android <-> imagem comum (raw), sem ferramentas de fora.
//   node scripts/rom/sparse.mjs abrir  <entrada.img> <saida.raw> [--posicao N]   (sparse -> raw; N = onde começa dentro do arquivo)
//   node scripts/rom/sparse.mjs fechar <entrada.raw> <saida.img>                 (raw -> sparse, TODOS os blocos como dados)
// SEGURANÇA: blocos zerados NÃO viram "não importa" (DONT_CARE): o gravador não escreve esses blocos e, se um arquivo do
// Android tiver um bloco realmente zerado, ficaria sujeira antiga ali. A ROM base só usa RAW e DONT_CARE (sem FILL), então
// o seguro é gravar tudo como RAW. --pular-zeros existe só para comparação e NUNCA deve ir para aparelho.
// Formato: cabeçalho 28 bytes (magia 0xED26FF3A) + partes de 12 bytes: RAW 0xCAC1, FILL 0xCAC2, DONT_CARE 0xCAC3, CRC 0xCAC4.
import fs from 'node:fs';

const [modo, entrada, saida] = process.argv.slice(2);
const posArg = process.argv.indexOf('--posicao');
const posicao = posArg > 0 ? Number(process.argv[posArg + 1]) : 0;
if (!['abrir', 'fechar'].includes(modo) || !entrada || !saida) {
  console.error('uso: node scripts/rom/sparse.mjs abrir|fechar <entrada> <saida> [--posicao N]'); process.exit(2);
}

function abrir() {
  const fd = fs.openSync(entrada, 'r');
  const out = fs.openSync(saida, 'w');
  const cab = Buffer.alloc(28); fs.readSync(fd, cab, 0, 28, posicao);
  if (cab.readUInt32LE(0) !== 0xed26ff3a) throw new Error('não é imagem sparse');
  const cabTam = cab.readUInt16LE(8), parteCab = cab.readUInt16LE(10), bloco = cab.readUInt32LE(12);
  const totalBlocos = cab.readUInt32LE(16), partes = cab.readUInt32LE(20);
  let p = posicao + cabTam, blocoAtual = 0;
  const buf = Buffer.alloc(16 * 1024 * 1024);
  for (let i = 0; i < partes; i++) {
    const c = Buffer.alloc(parteCab); fs.readSync(fd, c, 0, parteCab, p);
    const tipo = c.readUInt16LE(0), blocos = c.readUInt32LE(4), total = c.readUInt32LE(8);
    p += parteCab;
    const bytes = blocos * bloco;
    if (tipo === 0xcac1) {
      let falta = bytes, de = p, para = blocoAtual * bloco;
      while (falta > 0) { const n = Math.min(falta, buf.length); fs.readSync(fd, buf, 0, n, de); fs.writeSync(out, buf, 0, n, para); de += n; para += n; falta -= n; }
    } else if (tipo === 0xcac2) {
      const v = Buffer.alloc(4); fs.readSync(fd, v, 0, 4, p);
      if (v.readUInt32LE(0) !== 0) {
        const cheio = Buffer.alloc(Math.min(bytes, buf.length));
        for (let k = 0; k < cheio.length; k += 4) v.copy(cheio, k);
        let falta = bytes, para = blocoAtual * bloco;
        while (falta > 0) { const n = Math.min(falta, cheio.length); fs.writeSync(out, cheio, 0, n, para); para += n; falta -= n; }
      }
    } else if (tipo !== 0xcac3 && tipo !== 0xcac4) throw new Error(`parte desconhecida 0x${tipo.toString(16)}`);
    p += total - parteCab;
    if (tipo !== 0xcac4) blocoAtual += blocos;
  }
  fs.ftruncateSync(out, totalBlocos * bloco);
  fs.closeSync(out); fs.closeSync(fd);
  console.log(`aberta: ${(totalBlocos * bloco / 1048576).toFixed(0)} MB (${partes} partes) -> ${saida}`);
}

function fechar() {
  const bloco = 4096;
  const tam = fs.statSync(entrada).size;
  if (tam % bloco) throw new Error('tamanho não é múltiplo de 4096');
  const totalBlocos = tam / bloco;
  const fd = fs.openSync(entrada, 'r');
  const out = fs.openSync(saida, 'w');
  let escrito = 28, partes = 0;
  const b = Buffer.alloc(bloco);
  const pularZeros = process.argv.includes('--pular-zeros');
  const zero = (x) => { if (!pularZeros) return false; for (let k = 0; k < x.length; k += 8) if (x.readBigUInt64LE(k) !== 0n) return false; return true; };
  let i = 0;
  while (i < totalBlocos) {
    fs.readSync(fd, b, 0, bloco, i * bloco);
    const vazio = zero(b);
    let j = i + 1;
    const lote = [];
    if (!vazio) lote.push(Buffer.from(b));
    while (j < totalBlocos && j - i < 32768) { // até 128 MB por parte
      fs.readSync(fd, b, 0, bloco, j * bloco);
      if (zero(b) !== vazio) break;
      if (!vazio) lote.push(Buffer.from(b));
      j++;
    }
    const n = j - i;
    const c = Buffer.alloc(12);
    c.writeUInt16LE(vazio ? 0xcac3 : 0xcac1, 0); c.writeUInt32LE(n, 4); c.writeUInt32LE(12 + (vazio ? 0 : n * bloco), 8);
    fs.writeSync(out, c, 0, 12, escrito); escrito += 12;
    if (!vazio) { const dados = Buffer.concat(lote); fs.writeSync(out, dados, 0, dados.length, escrito); escrito += dados.length; }
    partes++;
    i = j;
  }
  const cab = Buffer.alloc(28);
  cab.writeUInt32LE(0xed26ff3a, 0); cab.writeUInt16LE(1, 4); cab.writeUInt16LE(0, 6); cab.writeUInt16LE(28, 8); cab.writeUInt16LE(12, 10);
  cab.writeUInt32LE(bloco, 12); cab.writeUInt32LE(totalBlocos, 16); cab.writeUInt32LE(partes, 20); cab.writeUInt32LE(0, 24);
  fs.writeSync(out, cab, 0, 28, 0);
  fs.closeSync(out); fs.closeSync(fd);
  console.log(`fechada: ${(escrito / 1048576).toFixed(0)} MB (${partes} partes) -> ${saida}`);
}

if (modo === 'abrir') abrir(); else fechar();
