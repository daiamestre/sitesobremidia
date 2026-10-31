// F-217 — pasta "Logos Sobre Mídia" da galeria de mídias: as 9 logos (as mesmas 9 da original, com os mesmos nomes)
// em alta definição, em public/marca/logos-sobre-midia/ (cada arquivo até 2 MB).
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

// teto de 2 MB por arquivo do site: recomprime SEM PERDA (mesmos pixels) os dois maiores; o ZIP do "Baixar todas"
// é montado no navegador (src/lib/zipSimples.ts)
const sharp = (await import('sharp')).default;
const recomprimir = async (nome, f) => { const p = path.join(PASTA, nome); fs.writeFileSync(p, await f(sharp(fs.readFileSync(p)))); };
await recomprimir('logo-sobre-midia.png', (i) => i.png({ compressionLevel: 9, adaptiveFiltering: true, palette: false }).toBuffer());
await recomprimir('xxxhdpi_ic_launcher_foreground.webp', (i) => i.webp({ lossless: true, effort: 6 }).toBuffer());
fs.rmSync(path.join(RAIZ, 'public/marca/logos-sobre-midia.zip'), { force: true });
console.log(JSON.stringify({ pasta: PASTA, logos: LOGOS.length, maior: Math.max(...LOGOS.map(([n]) => fs.statSync(path.join(PASTA, n)).size)) }));
