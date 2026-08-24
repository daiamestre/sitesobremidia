import fs from 'fs';

const lockPath = 'package-lock.json';
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));

async function meta(name, version) {
  const r = await fetch(`https://registry.npmjs.org/${name}/${version}`);
  if (!r.ok) throw new Error(`${name}@${version}: ${r.status}`);
  const j = await r.json();
  const dist = j.dist || {};
  return {
    version: j.version,
    resolved: dist.tarball,
    integrity: dist.integrity,
    ...(j.engines ? { engines: j.engines } : {}),
    ...(j.cpu ? { cpu: j.cpu } : {}),
    ...(j.os ? { os: j.os } : {}),
    ...(j.bin ? { bin: j.bin } : {}),
    ...(j.optionalDependencies ? { optionalDependencies: j.optionalDependencies } : {}),
    ...(j.dependencies ? { dependencies: j.dependencies } : {}),
  };
}

// 1) esbuild aninhado ao vitest (satisfaz ^0.27 || ^0.28 do vite8 nested)
const esb = await meta('esbuild', '0.28.2');
lock.packages['node_modules/vitest/node_modules/esbuild'] = esb;

// 2) @emnapi core+runtime exigidos por binding-wasm32-wasi
lock.packages['node_modules/@emnapi/core'] = await meta('@emnapi/core', '2.0.0-alpha.3');
lock.packages['node_modules/@emnapi/runtime'] = await meta('@emnapi/runtime', '2.0.0-alpha.3');

fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
console.log('entradas adicionadas:', ['vitest/node_modules/esbuild', '@emnapi/core', '@emnapi/runtime'].join(', '));
