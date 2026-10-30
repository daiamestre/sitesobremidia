// SOBRE MÍDIA Studio — envio de arquivos do SERVIDOR para o R2 (mesma assinatura AWS SigV4 da função get-upload-url,
// URL pré-assinada de PUT com UNSIGNED-PAYLOAD). As chaves R2 ficam só nos segredos da Edge Function.
// Caminho sempre em tenants/{empresa}/studio/{producao}/… (escopo de empresa já aceito pelo validador de caminhos).

const enc = (s: string) => new TextEncoder().encode(s);
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
async function hmac(chave: BufferSource, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', chave, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc(msg));
}

export interface ConfigR2 { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string; dominioPublico: string }

export function configR2(env: (k: string) => string | undefined): ConfigR2 | null {
  const c = {
    accountId: env('R2_ACCOUNT_ID') ?? '', accessKeyId: env('R2_ACCESS_KEY_ID') ?? '', secretAccessKey: env('R2_SECRET_ACCESS_KEY') ?? '',
    bucket: env('R2_BUCKET_NAME') ?? '', dominioPublico: (env('R2_PUBLIC_DOMAIN') ?? '').replace(/\/$/, ''),
  };
  return Object.values(c).every(Boolean) ? c : null;
}

export async function urlDeEnvio(c: ConfigR2, chave: string, segundos = 300): Promise<string> {
  const agora = new Date();
  const dia = agora.toISOString().slice(0, 10).replace(/-/g, '');
  const momento = agora.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const host = `${c.accountId}.r2.cloudflarestorage.com`;
  const escopo = `${dia}/auto/s3/aws4_request`;
  const q = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${c.accessKeyId}/${escopo}`, 'X-Amz-Date': momento,
    'X-Amz-Expires': String(segundos), 'X-Amz-SignedHeaders': 'host',
  });
  const consulta = Array.from(q.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const caminho = `/${c.bucket}/${chave.split('/').map(encodeURIComponent).join('/')}`;
  const canonico = ['PUT', caminho, consulta, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const assinar = ['AWS4-HMAC-SHA256', momento, escopo, hex(await crypto.subtle.digest('SHA-256', enc(canonico)))].join('\n');
  let k = await hmac(enc(`AWS4${c.secretAccessKey}`), dia);
  k = await hmac(k, 'auto');
  k = await hmac(k, 's3');
  k = await hmac(k, 'aws4_request');
  return `https://${host}${caminho}?${consulta}&X-Amz-Signature=${hex(await hmac(k, assinar))}`;
}

export async function enviarAoR2(c: ConfigR2, chave: string, corpo: Uint8Array<ArrayBuffer>, tipo: string): Promise<string> {
  if (!/^tenants\/[0-9a-f-]{36}\/studio\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/.test(chave)) throw new Error(`caminho fora do escopo do Studio: ${chave}`);
  const r = await fetch(await urlDeEnvio(c, chave), { method: 'PUT', headers: { 'Content-Type': tipo }, body: corpo });
  if (!r.ok) throw new Error(`R2 ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return `${c.dominioPublico}/${chave}`;
}
