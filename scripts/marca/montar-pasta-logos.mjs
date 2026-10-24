// F-217 — pasta "Logos Sobre Mídia" da galeria de mídias: as 9 logos (as mesmas 9 da original, com os mesmos nomes)
// em alta definição, em public/marca/logos-sobre-midia/, e o ZIP com todas para o "Baixar todas".
//   node scripts/marca/montar-pasta-logos.mjs
// Rodar de novo sempre que uma logo de docs/marca/alta-definicao/ mudar.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// as 9 em alta definição ficam guardadas em docs/marca/alta-definicao/ com os mesmos nomes das originais:
//  - ícones (modelo 1): os originais ampliados 4x por super-resolução (scripts/marca/ampliar-ia.html + realce-icone.html);
//  - capa/PWA (modelo 2): fundo ampliado pela IA + joia nítida + nome refeito (realce-capa-pwa.html), 1024 px;
//  - logos de nome 3D (modelo 3): reconstrução do F-216 (realce-logo.html), 2000 px e 3064 px.
const HD = 'docs/marca/alta-definicao';
export const LOGOS = ['mdpi_ic_launcher.webp', 'xxxhdpi_ic_launcher.webp', 'xxxhdpi_ic_launcher_round.webp',
  'xxxhdpi_ic_launcher_foreground.webp', 'pwa-512x512.png', 'pwa-maskable-512x512.png', 'logo-3d.png', 'logo-3d-white.png',
  'logo-sobre-midia.png'].map((nome) => [nome, `${HD}/${nome}`]);
const PASTA = path.join(RAIZ, 'public/marca/logos-sobre-midia');
fs.rmSync(PASTA, { recursive: true, force: true });
fs.mkdirSync(PASTA, { recursive: true });
for (const [nome, de] of LOGOS) fs.copyFileSync(path.join(RAIZ, de), path.join(PASTA, nome));

// ZIP sem compressão (PNG/WebP já são comprimidos), com data fixa: o mesmo conteúdo gera sempre o mesmo arquivo
const crcTab = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const x of buf) c = crcTab[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const DATA = ((2026 - 1980) << 9) | (10 << 5) | 24, HORA = 12 << 11;
const locais = [], central = []; let pos = 0;
for (const [nome] of LOGOS) {
  const dados = fs.readFileSync(path.join(PASTA, nome)), n = Buffer.from(`logos-sobre-midia/${nome}`, 'utf8'), crc = crc32(dados);
  const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(10, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(HORA, 10); h.writeUInt16LE(DATA, 12);
  h.writeUInt32LE(crc, 14); h.writeUInt32LE(dados.length, 18); h.writeUInt32LE(dados.length, 22); h.writeUInt16LE(n.length, 26);
  locais.push(h, n, dados);
  const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(10, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(HORA, 12); c.writeUInt16LE(DATA, 14);
  c.writeUInt32LE(crc, 16); c.writeUInt32LE(dados.length, 20); c.writeUInt32LE(dados.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(pos, 42);
  central.push(c, n);
  pos += 30 + n.length + dados.length;
}
const cd = Buffer.concat(central), fim = Buffer.alloc(22);
fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(LOGOS.length, 8); fim.writeUInt16LE(LOGOS.length, 10); fim.writeUInt32LE(cd.length, 12); fim.writeUInt32LE(pos, 16);
const zip = path.join(RAIZ, 'public/marca/logos-sobre-midia.zip');
fs.writeFileSync(zip, Buffer.concat([...locais, cd, fim]));
console.log(JSON.stringify({ pasta: PASTA, logos: LOGOS.length, zip, bytes: fs.statSync(zip).size }));
