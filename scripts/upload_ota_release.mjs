import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv('.env');

const R2_ENDPOINT = process.env.VITE_R2_ENDPOINT;
const R2_ACCESS_KEY = process.env.VITE_R2_ACCESS_KEY;
const R2_SECRET_KEY = process.env.VITE_R2_SECRET_KEY;
const R2_BUCKET = process.env.VITE_R2_BUCKET_NAME || 'sobremidia-storage';
const R2_PUBLIC_DOMAIN = (process.env.VITE_R2_PUBLIC_DOMAIN || 'https://pub-560b3bffe687403695c61035c8c8f7a7.r2.dev').replace(/\/$/, '');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;

const s3Client = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY,
    secretAccessKey: R2_SECRET_KEY,
  },
});

const keysJson = fs.readFileSync(process.env.TEMP + '/sb_keys.json', 'utf8');
const keys = JSON.parse(keysJson);
const serviceRole = keys.find(k => k.name === 'service_role').api_key;

const supabase = createClient(SUPABASE_URL, serviceRole, { auth: { persistSession: false } });

async function main() {
  const apkPath = path.resolve('native-android-player/app/build/outputs/apk/release/app-release.apk');
  if (!fs.existsSync(apkPath)) {
    throw new Error('APK not found at ' + apkPath);
  }

  const fileBuffer = fs.readFileSync(apkPath);
  const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const fileSize = fileBuffer.length;
  const versionCode = Number(process.env.VERSION_CODE || 523);
  const versionName = process.env.VERSION_NAME || '5.2.3-MicroGate';
  const key = `releases/sobremidia-player-v${versionCode}.apk`;
  const publicUrl = `${R2_PUBLIC_DOMAIN}/${key}`;

  console.log('--- PREPARING OFFICIAL SIGNED RELEASE OTA ---');
  console.log(`Version Code: ${versionCode}`);
  console.log(`Version Name: ${versionName}`);
  console.log(`File Size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`SHA-256: ${sha256}`);
  console.log(`Target R2 Key: ${key}`);
  console.log(`Public HTTPS URL: ${publicUrl}`);

  // 1. Upload to Cloudflare R2
  console.log('\n[1/3] Uploading APK to Cloudflare R2...');
  await s3Client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: fileBuffer,
    ContentType: 'application/vnd.android.package-archive',
    ContentLength: fileSize,
    Metadata: {
      'version-code': String(versionCode),
      'version-name': versionName,
      'sha256': sha256,
    }
  }));
  console.log('[1/3] R2 Upload SUCCESS!');

  // 2. Verify HTTPS accessibility
  console.log('\n[2/3] Verifying public HTTPS accessibility...');
  const httpsRes = await fetch(publicUrl, { method: 'HEAD' });
  if (!httpsRes.ok) {
    throw new Error(`Public HTTPS verification failed: ${httpsRes.status} ${httpsRes.statusText}`);
  }
  const contentLength = Number(httpsRes.headers.get('content-length') || 0);
  console.log(`[2/3] HTTPS Verification SUCCESS! (Status: ${httpsRes.status}, Content-Length: ${contentLength})`);

  // 3. Register in Supabase app_releases
  console.log('\n[3/3] Registering release in Supabase app_releases using service_role...');
  await supabase.from('app_releases').delete().eq('version_code', versionCode);

  const releaseData = {
    version_code: versionCode,
    version_name: versionName,
    apk_url: publicUrl,
    sha256: sha256,
    is_mandatory: true,
    release_notes: 'Atualização crítica da frota: sincronização contínua de tela, eliminação de tela preta, cache local com dupla camada, modo manutenção de 3 toques com retorno soberano e recuperação pós-boot.',
  };

  const { data: inserted, error: insertErr } = await supabase
    .from('app_releases')
    .insert(releaseData)
    .select()
    .single();

  if (insertErr) {
    console.error('Insert error:', insertErr);
    throw insertErr;
  }

  console.log('[3/3] Release successfully registered in app_releases:');
  console.log(JSON.stringify(inserted, null, 2));
  console.log('\n>>> OTA MANIFEST PUBLISHED AND READY FOR FLEET DISTRIBUTION <<<');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
