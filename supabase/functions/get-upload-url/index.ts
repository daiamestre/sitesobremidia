/**
 * [PRESIGNED URL] get-upload-url Edge Function — HARDENED
 *
 * Generates presigned URLs for direct browser-to-R2 uploads.
 * Uses native Deno Web Crypto API (no AWS SDK - avoids fs.readFile errors).
 *
 * [SECURITY HARDENING FASE F — P0]
 * - JWT OBRIGATÓRIO: sem Authorization Bearer válido → 401.
 * - userId NUNCA é aceito do body: é derivado do `sub` do JWT.
 * - O caminho do objeto é validado SERVER-SIDE pela RPC
 *   `fn_r2_validate_object_scope` (SECURITY DEFINER): o usuário só
 *   consegue escrever em `{user_id}/...` ou `tenants/{seu_tenant}/...`.
 * - Nenhuma credencial R2 trafega no browser (removido r2Client S3).
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
  const datetimeStr = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z'; // YYYYMMDDTHHmmssZ

  const host = `${accountId}.r2.cloudflarestorage.com`;
  const credentialScope = `${dateStr}/${region}/${service}/aws4_request`;
  const credential = `${accessKeyId}/${credentialScope}`;

  const canonicalQueryParams = new URLSearchParams();
  canonicalQueryParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  canonicalQueryParams.set('X-Amz-Credential', credential);
  canonicalQueryParams.set('X-Amz-Date', datetimeStr);
  canonicalQueryParams.set('X-Amz-Expires', String(expiresIn));
  canonicalQueryParams.set('X-Amz-SignedHeaders', 'host');

  const sortedQueryString = Array.from(canonicalQueryParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const canonicalPath = `/${bucketName}/${key}`;
  const canonicalRequest = [
    method,
    canonicalPath,
    sortedQueryString,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    datetimeStr,
    credentialScope,
    await sha256(canonicalRequest),
  ].join('\n');

  const kDate = await hmac(encode(`AWS4${secretAccessKey}`), dateStr);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, 'aws4_request');
  const signingKey = await crypto.subtle.importKey('raw', kSigning, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

  const signature = toHex(await crypto.subtle.sign('HMAC', signingKey, encode(stringToSign)));

  const presignedUrl = `${endpoint}/${bucketName}/${key}?${sortedQueryString}&X-Amz-Signature=${signature}`;
  return presignedUrl;
}

// Valida o JWT do usuário e retorna o sub (userId) — ou null
async function resolveUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return null;

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.1");
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // [SECURITY] JWT obrigatório
    const userId = await resolveUserId(req);
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Autenticacao obrigatoria." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
    const { fileName, contentType } = body;

    if (!fileName || typeof fileName !== "string" || !contentType || typeof contentType !== "string") {
      return new Response(
        JSON.stringify({ error: "fileName and contentType are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // [SECURITY] Escopo do objeto validado no banco (SECURITY DEFINER):
    // só {user_id}/... ou tenants/{tenant do usuário}/...
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) {
      return new Response(
        JSON.stringify({ error: "Supabase environment missing." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.1");
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${req.headers.get("authorization")}` } },
    });

    const { data: allowed, error: scopeError } = await supabase.rpc("fn_r2_validate_object_scope", {
      p_object_key: fileName,
    });

    if (scopeError || allowed !== true) {
      console.error("[get-upload-url] Escopo negado:", fileName, scopeError?.message);
      return new Response(
        JSON.stringify({ error: "Acesso negado: caminho fora do seu escopo." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const signedUrl = await generatePresignedUrl({
      accountId,
      accessKeyId,
      secretAccessKey,
      bucketName,
      region: 'auto',
      key: fileName,
      contentType,
      expiresIn: 300,
    });

    const publicUrl = publicDomain ? `${publicDomain}/${fileName}` : signedUrl;

    console.log(`[PRESIGNED] Generated PUT URL for ${fileName} (user ${userId}, expires in 5min)`);

    return new Response(
      JSON.stringify({ signedUrl, publicUrl, filePath: fileName, expiresIn: 300 }),
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