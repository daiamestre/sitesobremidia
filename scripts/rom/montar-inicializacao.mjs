// F-214 — tela de inicialização da ROM Sobre Mídia (pedido do dono: ao ligar, NUNCA "SELENGA"; a logo Sobre Mídia e,
// embaixo, "Sobre Mídia Player" maior que a logo, ocupando 60% da largura, nas cores da Sobre Mídia, até a launcher
// abrir; animada com um reflexo diagonal "/" passando primeiro na logo e depois no nome, como se estivesse carregando).
// A tela vai para os 2 lugares que aparecem ao ligar:
//   1. logo.bmp da partição resource (a 1ª imagem, antes do Android; o carregador não anima) — a tela parada, com o
//      cabeçalho e o tamanho exatos da logo original;
//   2. /system/media/bootanimation.zip (a animação do Android) — a volta do reflexo, repetindo até o sistema terminar.
//   powershell -File scripts/rom/inicializacao/gerar-tela.ps1 -logo <logo.png do app> -saida <pasta>   (tela.bmp, tela.png, quadros/)
//   node scripts/rom/montar-inicializacao.mjs <pasta da tela> <update.img base> <pasta de saída>
import fs from 'node:fs';
import path from 'node:path';
import { arquivosDoResource, medidasDoBmp } from './logo-resource.mjs';

const [tela, base, saida] = process.argv.slice(2);
if (!tela || !base || !saida) { console.error('uso: montar-inicializacao.mjs <pasta da tela> <update.img base> <pasta de saída>'); process.exit(2); }
const QPS = 20; // quadros por segundo da animação (gerar-tela.ps1 faz uma volta de 2,7 s)
const quadros = fs.readdirSync(path.join(tela, 'quadros')).filter((f) => /\.(jpg|png)$/i.test(f)).sort();
if (!quadros.length) throw new Error(`sem quadros da animação em ${path.join(tela, 'quadros')}`);
fs.mkdirSync(saida, { recursive: true });

// 1) logo.bmp com o cabeçalho e o tamanho exatos da original (a do resource da ROM base)
const fd = fs.openSync(base, 'r');
const ler = (p, n) => { const b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, p); return b; };
const inicioAf = ler(0, 0x66).readUInt32LE(0x21);
const af = ler(inicioAf, 2048);
let resource = null;
for (let i = 0; i < af.readUInt32LE(136); i++) {
  const o = 140 + 112 * i;
  if (af.toString('latin1', o, o + 32).replace(/\0.*$/s, '') === 'resource') resource = ler(inicioAf + af.readUInt32LE(o + 96), af.readUInt32LE(o + 108));
}
if (!resource) throw new Error('partição resource não encontrada na ROM base');
const logo = arquivosDoResource(resource).find((a) => a.nome === 'logo.bmp');
const original = resource.subarray(logo.inicio, logo.inicio + logo.tamanho);
const nova = fs.readFileSync(path.join(tela, 'tela.bmp'));
const a = medidasDoBmp(original), b = medidasDoBmp(nova);
if (a.largura !== b.largura || a.altura !== b.altura || a.bits !== b.bits) throw new Error(`a tela tem de ser ${a.largura}x${a.altura} de ${a.bits} bits`);
const pontos = nova.subarray(b.inicioDosPontos, b.inicioDosPontos + a.largura * a.altura * (a.bits / 8));
const final = Buffer.concat([original.subarray(0, a.inicioDosPontos), pontos, original.subarray(a.inicioDosPontos + pontos.length)]);
if (final.length !== original.length) throw new Error('tamanho da logo diferente do original');
fs.writeFileSync(path.join(saida, 'logo-sobremidia.bmp'), final);

// 2) bootanimation.zip SEM compressão (o Android exige "stored"), repetindo a volta até o boot terminar
const crcTab = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const x of buf) c = crcTab[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const desc = `${a.largura} ${a.altura} ${QPS}\np 0 0 part0\n`;
const entradas = [
  ['desc.txt', Buffer.from(desc, 'latin1')],
  ['part0/', Buffer.alloc(0)],
  ...quadros.map((f) => [`part0/${f}`, fs.readFileSync(path.join(tela, 'quadros', f))]),
];
const locais = []; const central = []; let pos = 0;
for (const [nome, dados] of entradas) {
  const n = Buffer.from(nome, 'latin1'); const crc = crc32(dados);
  const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(10, 4); h.writeUInt32LE(crc, 14);
  h.writeUInt32LE(dados.length, 18); h.writeUInt32LE(dados.length, 22); h.writeUInt16LE(n.length, 26);
  locais.push(h, n, dados);
  const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(10, 6); c.writeUInt32LE(crc, 16);
  c.writeUInt32LE(dados.length, 20); c.writeUInt32LE(dados.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(pos, 42);
  central.push(c, n);
  pos += 30 + n.length + dados.length;
}
const cd = Buffer.concat(central);
const fim = Buffer.alloc(22); fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(entradas.length, 8); fim.writeUInt16LE(entradas.length, 10);
fim.writeUInt32LE(cd.length, 12); fim.writeUInt32LE(pos, 16);
fs.writeFileSync(path.join(saida, 'bootanimation.zip'), Buffer.concat([...locais, cd, fim]));
console.log(JSON.stringify({ logo: path.join(saida, 'logo-sobremidia.bmp'), bytes: final.length, bootanimation: path.join(saida, 'bootanimation.zip'),
  quadros: quadros.length, desc: desc.trim().split('\n').join(' / ') }));
