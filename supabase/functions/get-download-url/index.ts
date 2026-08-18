/**
 * [PRESIGNED GET] get-download-url Edge Function
 *
 * Gera URL presigned de DOWNLOAD/visualização de objetos R2 com autorização REAL:
 *  - O JWT do usuário autenticado é usado no Supabase Client (RLS aplica o escopo real
 *    de tenant/representante/cliente).
 *  - O objeto só é servido se existir um contrato/assinatura com acesso liberado ao
 *    usuário autenticado (pdf_object_key / pdf_assinado_key / pdf_original_key).
 *  - Assinatura SigV4 para GET presigned no Cloudflare R2.
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
    .map((b) => b.toString(16).padStart(2, "0"))
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

async function generatePresignedGetUrl(params: {
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

  const sortedQueryString = Array.from(canonicalQueryParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const canonicalPath = `/${bucketName}/${key}`;
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

  return `${endpoint}/${bucketName}/${key}?${sortedQueryString}&X-Amz-Signature=${signature}`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    // JWT obrigatório: sem ele, nada é servido
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!jwt) {
      return new Response(
        JSON.stringify({ error: "Autenticação obrigatória." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { objectKey } = body;

    if (!objectKey || typeof objectKey !== "string") {
      return new Response(
        JSON.stringify({ error: "objectKey é obrigatório." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validação de acesso REAL: usa o JWT do usuário para que a RLS do banco
    // (tenant/representante/cliente) determine se o objeto pode ser servido.
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) {
      return new Response(
        JSON.stringify({ error: "Supabase environment missing." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.39.0");
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: contrato, error: ctrError } = await supabase
      .from("contratos")
      .select("id, numero_contrato, pdf_object_key, pdf_assinado_key")
      .or(`pdf_object_key.eq.${objectKey},pdf_assinado_key.eq.${objectKey}`)
      .limit(1)
      .maybeSingle();

    if (ctrError) {
      console.error("[get-download-url] Erro de RLS/consulta:", ctrError.message);
      return new Response(
        JSON.stringify({ error: "Falha na validação de acesso." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!contrato) {
      // Fallback: envelope de assinatura (cliente pode baixar via assinatura)
      const { data: assinatura } = await supabase
        .from("assinaturas")
        .select("id, contrato_id, pdf_original_key, pdf_assinado_key, status")
        .or(`pdf_original_key.eq.${objectKey},pdf_assinado_key.eq.${objectKey}`)
        .limit(1)
        .maybeSingle();

      if (!assinatura) {
        // Fallback: anexo oficial do template de contrato (ex.: PDF de parceria).
        // A RLS de contrato_templates (SELECT TO authenticated) é quem autoriza.
        const { data: template } = await supabase
          .from("contrato_templates")
          .select("id, codigo_template")
          .eq("pdf_anexo_key", objectKey)
          .limit(1)
          .maybeSingle();

        if (!template) {
          return new Response(
            JSON.stringify({ error: "Acesso negado: documento não pertence a um contrato seu." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    const signedUrl = await generatePresignedGetUrl({
      accountId,
      accessKeyId,
      secretAccessKey,
      bucketName,
      region: "auto",
      key: objectKey,
      expiresIn: 900,
    });

    const fileName = objectKey.split("/").pop() || "documento.pdf";

    return new Response(
      JSON.stringify({ signedUrl, fileName, contentType: "application/pdf", expiresIn: 900 }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[get-download-url] Erro:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});