// SOBRE MÍDIA — roda só no build da Vercel (script "vercel-build"), antes do "vite build".
// Apaga binários de outros sistemas (Mac, Windows, ARM) dos pacotes do analisador de mídia (F-111):
// a Vercel empacota as funções depois do build e o limite é 250 MB por função.
import fs from 'node:fs';
import path from 'node:path';

const raiz = process.cwd();
const apagar = [
  'node_modules/onnxruntime-node/bin/napi-v3/darwin',
  'node_modules/onnxruntime-node/bin/napi-v3/win32',
  'node_modules/onnxruntime-node/bin/napi-v3/linux/arm64',
  'node_modules/onnxruntime-web/dist',
  'node_modules/@img/sharp-libvips-linuxmusl-x64',
  'node_modules/@img/sharp-linuxmusl-x64',
  'node_modules/nsfwjs/dist/models/inception_v3',
];

function tamanho(p) {
  if (!fs.existsSync(p)) return 0;
  const s = fs.statSync(p);
  if (!s.isDirectory()) return s.size;
  return fs.readdirSync(p).reduce((t, f) => t + tamanho(path.join(p, f)), 0);
}

if (process.platform !== 'linux') {
  console.log('[podar-analisadores] só roda no Linux da Vercel; nada feito.');
  process.exit(0);
}
let total = 0;
for (const rel of apagar) {
  const p = path.join(raiz, rel);
  const t = tamanho(p);
  if (t) { fs.rmSync(p, { recursive: true, force: true }); total += t; console.log(`[podar-analisadores] removido ${rel} (${(t / 1e6).toFixed(1)} MB)`); }
}
// Mostra o que sobrou do onnxruntime (esperado: só linux/x64)
const bin = path.join(raiz, 'node_modules/onnxruntime-node/bin');
if (fs.existsSync(bin)) {
  for (const f of fs.readdirSync(bin, { recursive: true })) {
    const p = path.join(bin, String(f));
    if (fs.statSync(p).isFile()) console.log(`[podar-analisadores] fica ${f} (${(fs.statSync(p).size / 1e6).toFixed(1)} MB)`);
  }
}
console.log(`[podar-analisadores] total removido: ${(total / 1e6).toFixed(1)} MB`);
