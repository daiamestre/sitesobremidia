/**
 * Publica o APK de PRODUÇÃO já compilado (./gradlew :app:assembleRelease) no GitHub e no R2, e registra em app_releases.
 *
 * F-198 — REGRA DO DONO (18/10/2026): o Player 5.7.10 é a versão COMERCIAL. Toda versão nova sai como TESTE:
 *   node scripts/ops/publicar-player.mjs "Notas"                 -> canal TESTE: GitHub "pre-release", NÃO vai aos aparelhos
 *   node scripts/ops/publicar-player.mjs --promover <codigo>     -> depois do teste aprovado pelo dono: vira ESTÁVEL (OTA)
 * O canal estável é o único que get_latest_app_release() entrega aos aparelhos. Nunca publicar direto como estável.
 *
 * Confere antes: versão (aapt2), que NÃO é depurável e o certificado de produção (95a973c3…). Depois do envio ao R2,
 * confere o hash público.
 */
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sql } from './sql.mjs';
import { R2_PUBLICO } from './segredos.mjs';

// --promover <codigo>: só muda o canal de uma versão de teste JÁ publicada para estável (vai aos aparelhos pelo OTA)
if (process.argv[2] === '--promover') {
  const codigo = Number(process.argv[3]);
  if (!Number.isInteger(codigo) || codigo <= 0) { console.error('uso: node scripts/ops/publicar-player.mjs --promover <version_code>'); process.exit(2); }
  const r = await sql(`update app_releases set canal = 'estavel' where version_code = ${codigo} and canal = 'teste' returning version_name, canal;`);
  if (!Array.isArray(r) || !r.length) { console.error(`versão ${codigo} não encontrada no canal de teste`); process.exit(1); }
  console.log('PROMOVIDA a estável (os aparelhos atualizam pelo OTA):', JSON.stringify(r));
  process.exit(0);
}
const notas = process.argv[2];
if (!notas) { console.error('uso: node scripts/ops/publicar-player.mjs "notas da versão"  |  --promover <codigo>'); process.exit(2); }
const REPO = 'daiamestre/sitesobremidia';
const CERT = '95a973c314138283d9ab0c7b7c30cd24217f4d658d9082956637af0eae14de15';
const apk = 'native-android-player/app/build/outputs/apk/release/app-release.apk';
const bt = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'Android', 'Sdk', 'build-tools', '36.1.0');
const sh = (c) => execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const badging = sh(`"${path.join(bt, 'aapt2.exe')}" dump badging "${apk}"`);
const code = /versionCode='(\d+)'/.exec(badging)?.[1];
const nome = /versionName='([^']+)'/.exec(badging)?.[1];
if (/application-debuggable/.test(badging)) throw new Error('APK depurável — use o de produção (assembleRelease)');
if (!sh(`"${path.join(bt, 'apksigner.bat')}" verify --print-certs "${apk}"`).includes(CERT)) throw new Error('certificado não é o de produção');
const buf = fs.readFileSync(apk);
const sha = crypto.createHash('sha256').update(buf).digest('hex');
const tag = `player-v${nome.replace(/-.*$/, '')}-teste`;
const asset = `sobremidia-player-v${code}.apk`;
console.log(`APK ${nome} (${code}) · ${buf.length} bytes · sha256 ${sha}`);

const tmp = path.join(os.tmpdir(), asset);
fs.copyFileSync(apk, tmp);
const alvo = sh('git rev-parse HEAD').trim();
sh(`gh release create ${tag} "${tmp}" -R ${REPO} --target ${alvo} --prerelease --title "Player ${nome.replace(/-.*$/, '')} (${code}) — TESTE" --notes "VERSÃO DE TESTE (não vai aos aparelhos sozinha). ${notas.replace(/"/g, "'")} SHA-256 ${sha}"`);
console.log(`release ${tag} criada`);
sh(`gh workflow run publish-player-apk.yml -R ${REPO} -f tag=${tag} -f asset=${asset} -f sha256=${sha}`);
await new Promise((ok) => setTimeout(ok, 10000));
const id = sh(`gh run list -R ${REPO} -w publish-player-apk.yml -L 1 --json databaseId -q ".[0].databaseId"`).trim();
sh(`gh run watch ${id} -R ${REPO} --exit-status`);
const publico = Buffer.from(await (await fetch(`${R2_PUBLICO}releases/${asset}`)).arrayBuffer());
if (crypto.createHash('sha256').update(publico).digest('hex') !== sha) throw new Error('hash público no R2 diferente');
console.log('R2 conferido');
const r = await sql(`insert into app_releases (version_code, version_name, apk_url, release_notes, is_mandatory, sha256, canal)
  select ${Number(code)}, '${nome}', '${R2_PUBLICO}releases/${asset}', $n$${notas}$n$, true, '${sha}', 'teste'
  where not exists (select 1 from app_releases where version_code = ${Number(code)}) returning version_code, canal;`);
console.log('Registrada no canal TESTE (não vai aos aparelhos):', JSON.stringify(r));
console.log(`Para instalar no aparelho de teste: ${R2_PUBLICO}releases/${asset}`);
console.log(`Depois do teste aprovado pelo dono: node scripts/ops/publicar-player.mjs --promover ${code}`);
fs.rmSync(tmp, { force: true });
