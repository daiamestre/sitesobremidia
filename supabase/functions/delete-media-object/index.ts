/**
 * [DELETE OBJECT] delete-media-object Edge Function
 *
 * Exclusão SERVER-SIDE de objetos do Cloudflare R2.
 * Substitui o delete direto do browser (r2Client.ts), que exigia
 * embutir ACCESS/SECRET KEY do R2 no bundle (P0 — exposição de credencial).
 *
 * [SECURITY FASE F]
 * - JWT OBRIGATÓRIO (401 sem token válido).
 * - Escopo validado server-side por fn_r2_validate_object_scope
 *   (SECURITY DEFINER): só deleta dentro do escopo do usuário/tenant.
 * - Credenciais R2 vivem SOMENTE como secrets da Edge Function.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmac(key: CryptoKey | ArrayBuffer, msg: string): Promise<ArrayBuffer> {
  const cryptoKey = key instanceof CryptoKey ? key : await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encode(msg));
}

async function sha256(msg: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', encode(msg));
  return toHex(hash);
}

async function generatePresignedDeleteUrl(params: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  region: string;
  key: string;
  expiresIn: number;
}): Promise<string> {
  const { accountId, accessKeyId, secretAccessKey, bucketName, region, key, expiresIn } = params;

  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const service = 's3';
  const method = 'DELETE';

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const datetimeStr = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';

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

  return `${endpoint}/${bucketName}/${key}?${sortedQueryString}&X-Amz-Signature=${signature}`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!jwt) {
      return new Response(
        JSON.stringify({ error: "Autenticacao obrigatoria." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) {
      return new Response(
        JSON.stringify({ error: "Supabase environment missing." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Valida o JWT e resolve o usuário
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.1");
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: user, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !user?.user?.id) {
      return new Response(
        JSON.stringify({ error: "Token invalido." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { objectKey } = body;

    if (!objectKey || typeof objectKey !== "string") {
      return new Response(
        JSON.stringify({ error: "objectKey is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // [SECURITY] Escopo validado no banco (SECURITY DEFINER)
    const { data: allowed, error: scopeError } = await supabase.rpc("fn_r2_validate_object_scope", {
      p_object_key: objectKey,
    });

    if (scopeError || allowed !== true) {
      console.error("[delete-media-object] Escopo negado:", objectKey, scopeError?.message);
      return new Response(
        JSON.stringify({ error: "Acesso negado: objeto fora do seu escopo." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accountId = Deno.env.get("R2_ACCOUNT_ID");
    const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
    const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
    const bucketName = Deno.env.get("R2_BUCKET_NAME");

    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
      return new Response(
        JSON.stringify({ error: "R2 credentials not configured in Edge Function secrets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const signedDeleteUrl = await generatePresignedDeleteUrl({
      accountId,
      accessKeyId,
      secretAccessKey,
      bucketName,
      region: 'auto',
      key: objectKey,
      expiresIn: 120,
    });

    const res = await fetch(signedDeleteUrl, { method: "DELETE" });

    if (!res.ok && res.status !== 404) {
      console.error("[delete-media-object] R2 DELETE falhou:", res.status, res.statusText);
      return new Response(
        JSON.stringify({ error: "Falha ao excluir o objeto no R2." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, objectKey }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[delete-media-object] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});