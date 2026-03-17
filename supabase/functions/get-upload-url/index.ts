/**
 * [PRESIGNED URL] get-upload-url Edge Function
 * 
 * Generates presigned URLs for direct browser-to-R2 uploads.
 * Uses native Deno Web Crypto API (no AWS SDK - avoids fs.readFile errors).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Encode a string to a Uint8Array
function encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

// Convert Uint8Array to hex string
function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// HMAC-SHA256
async function hmac(key: CryptoKey | ArrayBuffer, msg: string): Promise<ArrayBuffer> {
  const cryptoKey = key instanceof CryptoKey ? key : await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encode(msg));
}

// SHA-256 hash
async function sha256(msg: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', encode(msg));
  return toHex(hash);
}

// Generate AWS Signature V4 presigned URL for R2 (S3-compatible)
async function generatePresignedUrl(params: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  region: string;
  key: string;
  contentType: string;
  expiresIn: number;
}): Promise<string> {
  const { accountId, accessKeyId, secretAccessKey, bucketName, region, key, contentType, expiresIn } = params;
  
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const service = 's3';
  const method = 'PUT';

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const datetimeStr = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').slice(0, 15) + 'Z'; // YYYYMMDDTHHmmssZ

  const host = `${accountId}.r2.cloudflarestorage.com`;
  const credentialScope = `${dateStr}/${region}/${service}/aws4_request`;
  const credential = `${accessKeyId}/${credentialScope}`;

  // Canonical query string (must be sorted alphabetically)
  const queryParams = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': datetimeStr,
    'X-Amz-Expires': String(expiresIn),
    'X-Amz-SignedHeaders': 'host',
    'x-amz-checksum-sha256': '',
  });

  // Actually, for presigned PUT to R2, we just need:
  const canonicalQueryParams = new URLSearchParams();
  canonicalQueryParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  canonicalQueryParams.set('X-Amz-Credential', credential);
  canonicalQueryParams.set('X-Amz-Date', datetimeStr);
  canonicalQueryParams.set('X-Amz-Expires', String(expiresIn));
  canonicalQueryParams.set('X-Amz-SignedHeaders', 'host');

  // Sort query params
  const sortedQueryString = Array.from(canonicalQueryParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  // Canonical request
  const encodedKey = key.split('/').map(p => encodeURIComponent(p)).join('/');
  const canonicalRequest = [
    method,
    `/${encodedKey}`,
    sortedQueryString,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  // String to Sign
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    datetimeStr,
    credentialScope,
    await sha256(canonicalRequest),
  ].join('\n');

  // Signing key
  const kDate = await hmac(encode(`AWS4${secretAccessKey}`), dateStr);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, 'aws4_request');
  const signingKey = await crypto.subtle.importKey('raw', kSigning, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  
  const signature = toHex(await crypto.subtle.sign('HMAC', signingKey, encode(stringToSign)));

  const presignedUrl = `${endpoint}/${encodedKey}?${sortedQueryString}&X-Amz-Signature=${signature}`;
  return presignedUrl;
}

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const accountId = Deno.env.get("R2_ACCOUNT_ID");
    const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
    const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
    const bucketName = Deno.env.get("R2_BUCKET_NAME");
    const publicDomain = Deno.env.get("R2_PUBLIC_DOMAIN");

    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
      return new Response(
        JSON.stringify({ error: "R2 credentials not configured in Edge Function secrets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { fileName, contentType, userId } = body;

    if (!fileName || !contentType || !userId) {
      return new Response(
        JSON.stringify({ error: "fileName, contentType, and userId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const filePath = `${userId}/${fileName}`;

    const signedUrl = await generatePresignedUrl({
      accountId,
      accessKeyId,
      secretAccessKey,
      bucketName,
      region: 'auto',
      key: filePath,
      contentType,
      expiresIn: 300,
    });

    const publicUrl = publicDomain ? `${publicDomain}/${filePath}` : signedUrl;

    console.log(`[PRESIGNED] Generated URL for ${filePath} (expires in 5min)`);

    return new Response(
      JSON.stringify({ signedUrl, publicUrl, filePath, expiresIn: 300 }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[PRESIGNED] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
