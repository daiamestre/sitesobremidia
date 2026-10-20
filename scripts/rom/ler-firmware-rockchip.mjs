// F-201 — lê (SÓ LÊ) um update.img da Rockchip (formato RKFW/RKAF) e lista o que tem dentro:
// carregador, partições, tamanhos e o parameter (tabela de partições). Não muda nem grava nada.
//   node scripts/rom/ler-firmware-rockchip.mjs "<caminho>/update.img" [--extrair-parameter]
import fs from 'node:fs';

const arquivo = process.argv[2];
if (!arquivo) { console.error('uso: node scripts/rom/ler-firmware-rockchip.mjs <update.img>'); process.exit(2); }
const fd = fs.openSync(arquivo, 'r');
const ler = (pos, n) => { const b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, pos); return b; };
const texto = (b) => b.toString('latin1').replace(/\0.*$/s, '').trim();
const tamanho = fs.fstatSync(fd).size;
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

const cab = ler(0, 0x66);
const relatorio = { arquivo, tamanho: mb(tamanho) };
let inicioRkaf = 0;
if (cab.toString('latin1', 0, 4) === 'RKFW') {
  const versao = cab.readUInt32LE(6);
  const ano = cab.readUInt16LE(0x0e);
  relatorio.formato = 'RKFW (pacote completo: carregador + imagem)';
  relatorio.versaoDoPacote = `${(versao >>> 24) & 0xff}.${(versao >>> 16) & 0xff}.${versao & 0xffff}`;
  relatorio.montadoEm = `${ano}-${String(cab[0x10]).padStart(2, '0')}-${String(cab[0x11]).padStart(2, '0')} ${String(cab[0x12]).padStart(2, '0')}:${String(cab[0x13]).padStart(2, '0')}`;
  const chip = cab.readUInt32LE(0x15);
  const chips = { 0x50: 'RK29', 0x60: 'RK30', 0x70: 'RK31', 0x80: 'RK32 (RK3228/RK3229)', 0x41: 'RK3368', 0x33333043: 'RK330C', 0x33323238: 'RK3228', 0x33323239: 'RK3229', 0x33333238: 'RK3328', 0x33333138: 'RK3318' };
  relatorio.chip = chips[chip] ?? `código 0x${chip.toString(16)} (${Buffer.from(cab.subarray(0x15, 0x19)).reverse().toString('latin1')})`;
  relatorio.carregador = { posicao: cab.readUInt32LE(0x19), tamanho: mb(cab.readUInt32LE(0x1d)) };
  inicioRkaf = cab.readUInt32LE(0x21);
  relatorio.imagem = { posicao: inicioRkaf, tamanho: mb(cab.readUInt32LE(0x25)) };
}

const af = ler(inicioRkaf, 140 + 112 * 16);
if (af.toString('latin1', 0, 4) !== 'RKAF') { console.error('não achei o bloco RKAF: não é update.img da Rockchip'); process.exit(1); }
relatorio.modelo = texto(af.subarray(8, 42));
relatorio.id = texto(af.subarray(42, 72));
relatorio.fabricante = texto(af.subarray(72, 128));
const n = af.readUInt32LE(136);
relatorio.particoes = [];
let parameter = null;
for (let i = 0; i < n && i < 16; i++) {
  const p = af.subarray(140 + 112 * i, 140 + 112 * (i + 1));
  const item = {
    nome: texto(p.subarray(0, 32)), arquivo: texto(p.subarray(32, 92)),
    posicao: p.readUInt32LE(96), tamanho: p.readUInt32LE(108), enderecoNaMemoria: p.readUInt32LE(100),
  };
  relatorio.particoes.push({ ...item, tamanho: mb(item.tamanho) });
  if (item.nome === 'parameter' || item.arquivo.endsWith('parameter.txt') || item.arquivo.endsWith('parameter')) {
    // o parameter vem com 8 bytes de cabeçalho ("PARM" + tamanho) e texto
    const bruto = ler(inicioRkaf + item.posicao, Math.min(item.tamanho, 64 * 1024));
    const ini = bruto.toString('latin1', 0, 4) === 'PARM' ? 8 : 0;
    parameter = bruto.toString('latin1', ini, ini + (ini ? bruto.readUInt32LE(4) : bruto.length));
  }
}
fs.closeSync(fd);
console.log(JSON.stringify(relatorio, null, 2));
if (parameter) {
  console.log('\n--- parameter (tabela de partições, NUNCA mexer) ---\n' + parameter.trim());
  if (process.argv.includes('--extrair-parameter')) fs.writeFileSync('parameter-lido.txt', parameter);
}
