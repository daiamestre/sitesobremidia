/**
 * [LIST OBJECTS] list-media-objects Edge Function
 *
 * Lista objetos do Cloudflare R2 SERVER-SIDE (SigV4 assinado no próprio
 * edge, sem expor credencial nem presigned URL ao browser).
 * Substitui o ListObjectsV2 do s3Client (que exigia credenciais no bundle).
 *
 * [SECURITY FASE F]
 * - JWT OBRIGATÓRIO.
 * - Prefixo validado por fn_r2_validate_object_scope: usuário só lista
 *   dentro do próprio escopo ({user_id}/... ou tenants/{tenant}/...).
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
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(key: CryptoKey | ArrayBuffer, msg: string): Promise<ArrayBuffer> {
  const cryptoKey = key instanceof CryptoKey ? key : await crypto.subtle.importKey(
    "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encode(msg));
}

async function sha256(msg: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", encode(msg));
  return toHex(hash);
}

async function generatePresignedListUrl(params: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  region: string;
  prefix: string;
  expiresIn: number;
}): Promise<string> {
  const { accountId, accessKeyId, secretAccessKey, bucketName, region, prefix, expiresIn } = params;

  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const service = "s3";
  const method = "GET";

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const datetimeStr = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";

  const host = `${accountId}.r2.cloudflarestorage.com`;
  const credentialScope = `${dateStr}/${region}/${service}/aws4_request`;
  const credential = `${accessKeyId}/${credentialScope}`;

  const canonicalQueryParams = new URLSearchParams();
  canonicalQueryParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  canonicalQueryParams.set("X-Amz-Credential", credential);
  canonicalQueryParams.set("X-Amz-Date", datetimeStr);
  canonicalQueryParams.set("X-Amz-Expires", String(expiresIn));
  canonicalQueryParams.set("X-Amz-SignedHeaders", "host");
  canonicalQueryParams.set("list-type", "2");
  if (prefix) canonicalQueryParams.set("prefix", prefix);
  canonicalQueryParams.set("max-keys", "1000");

  const sortedQueryString = Array.from(canonicalQueryParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const canonicalPath = `/${bucketName}`;
  const canonicalRequest = [
    method,
    canonicalPath,
    sortedQueryString,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    datetimeStr,
    credentialScope,
    await sha256(canonicalRequest),
  ].join("\n");

  const kDate = await hmac(encode(`AWS4${secretAccessKey}`), dateStr);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  const signingKey = await crypto.subtle.importKey("raw", kSigning, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);

  const signature = toHex(await crypto.subtle.sign("HMAC", signingKey, encode(stringToSign)));

  return `${endpoint}/${bucketName}?${sortedQueryString}&X-Amz-Signature=${signature}`;
}

function parseListXml(xml: string): Array<{ key: string; size: number; lastModified: string; etag: string }> {
  const items: Array<{ key: string; size: number; lastModified: string; etag: string }> = [];
  const contents = xml.split("<Contents>").slice(1);
  for (const block of contents) {
    const key = block.match(/<Key>([\s\S]*?)<\/Key>/)?.[1];
    const size = block.match(/<Size>([\s\S]*?)<\/Size>/)?.[1];
    const lastModified = block.match(/<LastModified>([\s\S]*?)<\/LastModified>/)?.[1];
    const etag = block.match(/<ETag>([\s\S]*?)<\/ETag>/)?.[1];
    if (key && size !== undefined) {
      items.push({
        key: key.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"),
        size: parseInt(size, 10) || 0,
        lastModified: lastModified || "",
        etag: etag ? etag.replace(/"/g, "") : "",
      });
    }
  }
  return items;
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
    const { prefix } = body;

    if (!prefix || typeof prefix !== "string") {
      return new Response(
        JSON.stringify({ error: "prefix is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // [SECURITY] Escopo validado no banco (SECURITY DEFINER)
    const { data: allowed, error: scopeError } = await supabase.rpc("fn_r2_validate_object_scope", {
      p_object_key: prefix,
    });

    if (scopeError || allowed !== true) {
      console.error("[list-media-objects] Escopo negado:", prefix, scopeError?.message);
      return new Response(
        JSON.stringify({ error: "Acesso negado: prefixo fora do seu escopo." }),
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

    const signedListUrl = await generatePresignedListUrl({
      accountId,
      accessKeyId,
      secretAccessKey,
      bucketName,
      region: "auto",
      prefix,
      expiresIn: 120,
    });

    const res = await fetch(signedListUrl);

    if (!res.ok) {
      console.error("[list-media-objects] R2 LIST falhou:", res.status, res.statusText);
      return new Response(
        JSON.stringify({ error: "Falha ao listar objetos no R2." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const xml = await res.text();
    const items = parseListXml(xml);

    return new Response(
      JSON.stringify({ items, prefix }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[list-media-objects] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});