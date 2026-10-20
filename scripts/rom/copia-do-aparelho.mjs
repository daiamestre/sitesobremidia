// F-201 — CÓPIA COMPLETA do firmware de uma TV Box ligada por USB (ou ADB pela rede), ANTES de gravar qualquer ROM.
// Só LÊ o aparelho (dd das partições para o PC). Nada é gravado nele.
//   node scripts/rom/copia-do-aparelho.mjs                 (usa o único aparelho que não é emulador)
//   node scripts/rom/copia-do-aparelho.mjs --serial XXXX   (escolhe o aparelho)
//   node scripts/rom/copia-do-aparelho.mjs --so-informacoes (só identifica: chip, placa, Android, Wi-Fi, partições, root)
// Saída: Downloads/ROM TV BOX/copias/<modelo>-<serial>-<data>/  com cada partição .img, SHA-256 dos dois lados e info.json.
// Fica de fora: userdata (dados/apps do usuário) e cache. Precisa de root no aparelho (as ROMs Selenga/R4 já têm).
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const adb = path.join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe');
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const soInfo = process.argv.includes('--so-informacoes');
const PULAR = new Set(['userdata', 'cache', 'data']);

const run = (args, opts = {}) => execFileSync(adb, args, { encoding: 'utf8', maxBuffer: 64 << 20, ...opts }).trim();
const aparelhos = run(['devices']).split('\n').slice(1).map((l) => l.split('\t')).filter((x) => x[1] === 'device').map((x) => x[0]);
let serial = arg('--serial') ?? aparelhos.filter((s) => !s.startsWith('emulator-'))[0];
if (!serial) { console.error(`nenhuma TV Box encontrada (aparelhos: ${aparelhos.join(', ') || 'nenhum'}). Ligue o cabo USB macho-macho ou "adb connect IP:5555".`); process.exit(1); }
const sh = (cmd) => run(['-s', serial, 'shell', cmd]);
const su = (cmd) => sh(`su -c "${cmd.replace(/"/g, '\\"')}"`);

const info = {
  serial,
  modelo: sh('getprop ro.product.model'), placa: sh('getprop ro.product.board'), plataforma: sh('getprop ro.board.platform'),
  android: sh('getprop ro.build.version.release'), firmware: sh('getprop ro.build.display.id'),
  fabricante: sh('getprop ro.product.manufacturer'), hardware: sh('cat /proc/cpuinfo | grep -i hardware | head -1'),
  wifi: sh('lsmod 2>/dev/null | grep -iE "8189|8723|9012|ssv|6051|6x5x|bcm|ap6|rtl|xr819|esp" || echo "(lsmod sem acesso)"'),
  romSobreMidia: sh('getprop ro.sobremidia.rom') === '1',
};
let rootOk = false;
try { rootOk = su('id').includes('uid=0'); } catch { rootOk = false; }
info.root = rootOk;

// partições: por nome (eMMC) ou pela tabela do parameter (mtdparts na linha de comando do kernel)
let particoes = [];
for (const dir of ['/dev/block/by-name', '/dev/block/platform/*/by-name', '/dev/block/platform/*/*/by-name']) {
  const saida = (() => { try { return sh(`ls -l ${dir} 2>/dev/null`); } catch { return ''; } })();
  for (const l of saida.split('\n')) {
    const m = /\s(\S+)\s->\s(\S+)$/.exec(l.trim());
    if (m) particoes.push({ nome: m[1], dispositivo: m[2] });
  }
  if (particoes.length) break;
}
if (!particoes.length) {
  const cmd = sh('cat /proc/cmdline');
  const mtd = /mtdparts=[^:]+:(\S+)/.exec(cmd)?.[1];
  const disco = ['/dev/block/mmcblk0', '/dev/block/rknand0'].find((d) => { try { return sh(`ls ${d} 2>/dev/null`) === d; } catch { return false; } });
  if (mtd && disco) {
    for (const p of mtd.split(',')) {
      const m = /^(-|0x[0-9a-f]+)@(0x[0-9a-f]+)\((\w+)\)/i.exec(p);
      if (m) particoes.push({ nome: m[3], dispositivo: disco, setores: m[1] === '-' ? null : parseInt(m[1], 16), inicio: parseInt(m[2], 16) });
    }
  }
}
info.particoes = particoes.map((p) => ({ ...p, copiar: !PULAR.has(p.nome) }));
console.log(JSON.stringify(info, null, 2));
if (soInfo) process.exit(0);
if (!rootOk) { console.error('\nSEM ROOT: não dá para ler as partições. Use o RKDevTool/PhoenixSuit (modo de gravação) para exportar a imagem.'); process.exit(1); }
if (!particoes.length) { console.error('\nnão achei a lista de partições deste aparelho'); process.exit(1); }

const data = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const pasta = path.join(os.homedir(), 'Downloads', 'ROM TV BOX', 'copias', `${info.modelo || 'tvbox'}-${serial.replace(/[^\w.-]/g, '_')}-${data}`);
fs.mkdirSync(pasta, { recursive: true });
fs.writeFileSync(path.join(pasta, 'info.json'), JSON.stringify(info, null, 2));
const resultado = [];
for (const p of particoes.filter((x) => !PULAR.has(x.nome))) {
  if (p.setores === null) continue; // a última ("-") é userdata
  const ddArgs = p.setores ? `if=${p.dispositivo} bs=512 skip=${p.inicio} count=${p.setores}` : `if=${p.dispositivo} bs=1048576`;
  const destino = path.join(pasta, `${p.nome}.img`);
  process.stdout.write(`copiando ${p.nome}... `);
  const hash = crypto.createHash('sha256');
  await new Promise((ok, falha) => {
    const filho = spawn(adb, ['-s', serial, 'exec-out', `su -c "dd ${ddArgs} 2>/dev/null"`]);
    const out = fs.createWriteStream(destino);
    filho.stdout.on('data', (d) => hash.update(d));
    filho.stdout.pipe(out);
    filho.on('error', falha);
    out.on('finish', ok);
  });
  const local = hash.digest('hex');
  let remoto = '';
  try { remoto = su(`dd ${ddArgs} 2>/dev/null | sha256sum`).split(/\s/)[0]; } catch { remoto = '(o aparelho não tem sha256sum)'; }
  const tamanho = fs.statSync(destino).size;
  const confere = remoto === local;
  console.log(`${(tamanho / 1048576).toFixed(1)} MB ${confere ? 'CONFERE' : remoto.startsWith('(') ? '(sem conferência no aparelho)' : 'DIFERENTE!'}`);
  resultado.push({ nome: p.nome, tamanho, sha256: local, sha256NoAparelho: remoto, confere });
}
fs.writeFileSync(path.join(pasta, 'copia.json'), JSON.stringify({ info, resultado }, null, 2));
const ruins = resultado.filter((r) => !r.confere && !r.sha256NoAparelho.startsWith('('));
console.log(`\ncópia em: ${pasta}\n${ruins.length ? `ATENÇÃO: ${ruins.length} partição(ões) não conferem — repetir a cópia` : 'todas as partições copiadas'}`);
