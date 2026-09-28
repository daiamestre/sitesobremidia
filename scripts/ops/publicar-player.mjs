/**
 * Publica o APK de PRODUÇÃO já compilado (./gradlew :app:assembleRelease) no GitHub, no R2 e no OTA (app_releases).
 *   node scripts/ops/publicar-player.mjs "Notas da versão em português"
 * Confere antes: versão (aapt2), que NÃO é depurável e o certificado de produção (95a973c3…). Depois do envio ao R2,
 * confere o hash público. Só publica no OTA depois do canário aprovado (AGENTS.md, regra 14).
 */
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sql } from './sql.mjs';
import { R2_PUBLICO } from './segredos.mjs';

const notas = process.argv[2];
if (!notas) { console.error('uso: node scripts/ops/publicar-player.mjs "notas da versão"'); process.exit(2); }
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
const tag = `player-v${nome.replace(/-.*$/, '')}`;
const asset = `sobremidia-player-v${code}.apk`;
console.log(`APK ${nome} (${code}) · ${buf.length} bytes · sha256 ${sha}`);

const tmp = path.join(os.tmpdir(), asset);
fs.copyFileSync(apk, tmp);
const alvo = sh('git rev-parse HEAD').trim();
sh(`gh release create ${tag} "${tmp}" -R ${REPO} --target ${alvo} --title "Player ${nome.replace(/-.*$/, '')} (${code})" --notes "${notas.replace(/"/g, "'")} SHA-256 ${sha}"`);
console.log(`release ${tag} criada`);
sh(`gh workflow run publish-player-apk.yml -R ${REPO} -f tag=${tag} -f asset=${asset} -f sha256=${sha}`);
await new Promise((ok) => setTimeout(ok, 10000));
const id = sh(`gh run list -R ${REPO} -w publish-player-apk.yml -L 1 --json databaseId -q ".[0].databaseId"`).trim();
sh(`gh run watch ${id} -R ${REPO} --exit-status`);
const publico = Buffer.from(await (await fetch(`${R2_PUBLICO}releases/${asset}`)).arrayBuffer());
if (crypto.createHash('sha256').update(publico).digest('hex') !== sha) throw new Error('hash público no R2 diferente');
console.log('R2 conferido');
const r = await sql(`insert into app_releases (version_code, version_name, apk_url, release_notes, is_mandatory, sha256)
  select ${Number(code)}, '${nome}', '${R2_PUBLICO}releases/${asset}', $n$${notas}$n$, true, '${sha}'
  where not exists (select 1 from app_releases where version_code = ${Number(code)}) returning version_code;`);
console.log('OTA:', JSON.stringify(r));
fs.rmSync(tmp, { force: true });
