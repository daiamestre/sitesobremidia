import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const R2_PUBLIC_DOMAIN = process.env.VITE_R2_PUBLIC_DOMAIN;
const R2_ACCOUNT_ID = 'c4aed6562921664931bb6c83f6031f02';
const BUCKET = 'sobremidia-storage';

async function run() {
  console.log('=== DIAGNÓSTICO DE UPLOAD PARA R2 ===\n');

  // Step 1: Get presigned URL
  console.log('1. Obtendo URL assinada do Edge Function...');
  const efRes = await fetch(`${SUPABASE_URL}/functions/v1/get-upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify({
      fileName: 'temp/diagnostico-test.mp4',
      contentType: 'video/mp4',
      userId: 'diag-test-user'
    })
  });
  
  console.log(`   Edge Function status: ${efRes.status}`);
  const efData = await efRes.json();
  
  if (efRes.status !== 200 || !efData.signedUrl) {
    console.log('   ❌ FALHA ao obter URL assinada:', JSON.stringify(efData));
    return;
  }
  console.log('   ✅ URL assinada obtida!');
  console.log(`   signedUrl prefix: ${efData.signedUrl.substring(0, 80)}...`);
  console.log(`   publicUrl: ${efData.publicUrl}`);
  console.log(`   filePath: ${efData.filePath}`);

  // Step 2: Try PUT to R2 with a small test payload
  console.log('\n2. Fazendo PUT para Cloudflare R2...');
  const testContent = 'Teste de upload - arquivo pequeno para diagnóstico - ' + Date.now();
  const testBlob = Buffer.from(testContent);

  try {
    const putRes = await fetch(efData.signedUrl, {
      method: 'PUT',
      body: testBlob,
      headers: { 'Content-Type': 'video/mp4' }
    });
    console.log(`   R2 PUT status: ${putRes.status}`);
    if (putRes.status >= 200 && putRes.status < 300) {
      console.log('   ✅ Upload para R2 OK!');
    } else {
      const body = await putRes.text();
      console.log(`   ❌ FALHA no upload para R2: ${body}`);
    }
  } catch(e) {
    console.log(`   ❌ FALHA no upload para R2 (exceção): ${e.message}`);
  }

  // Step 3: Check CORS preflight (OPTIONS to R2)  
  console.log('\n3. Testando CORS do R2 (OPTIONS)...');
  try {
    const corsRes = await fetch(`https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}/`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://app.sobremidia.com.br',
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type'
      }
    });
    console.log(`   CORS OPTIONS status: ${corsRes.status}`);
    console.log(`   Access-Control-Allow-Origin: ${corsRes.headers.get('access-control-allow-origin') || '(não retornado)'}`);
    console.log(`   Access-Control-Allow-Methods: ${corsRes.headers.get('access-control-allow-methods') || '(não retornado)'}`);
  } catch(e) {
    console.log(`   CORS OPTIONS exceção: ${e.message}`);
  }

  // Step 4: Check if public URL is accessible after upload
  console.log('\n4. Verificando URL pública do arquivo...');
  try {
    const pubRes = await fetch(efData.publicUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    console.log(`   URL pública status: ${pubRes.status}`);
    if (pubRes.status === 200) {
      console.log('   ✅ Arquivo acessível publicamente!');
    } else if (pubRes.status === 404) {
      console.log('   ℹ️  Arquivo ainda não existe (OK se o PUT falhou acima)');
    }
  } catch(e) {
    console.log(`   URL pública exceção: ${e.message}`);
  }

  console.log('\n=== FIM DO DIAGNÓSTICO ===');
}

run();
