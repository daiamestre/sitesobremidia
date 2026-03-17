import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { S3Client, PutObjectCommand } from "https://esm.sh/@aws-sdk/client-s3@3.529.1";
import { getSignedUrl } from "https://esm.sh/@aws-sdk/s3-request-presigner@3.529.1";

/**
 * [PRESIGNED URL] get-upload-url Edge Function
 * 
 * Gera URLs assinadas temporarias para upload direto do navegador para o R2.
 * O arquivo vai DIRETO do browser para o Cloudflare, sem passar pela Vercel.
 * 
 * Fluxo:
 * 1. Dashboard chama esta funcao com fileName + contentType
 * 2. Funcao gera URL assinada (valida por 5 minutos)
 * 3. Dashboard faz PUT direto para a URL assinada
 * 
 * Seguranca:
 * - Chaves R2 ficam SOMENTE no servidor (Edge Function)
 * - URL assinada expira em 5 minutos
 * - Cada URL serve para UM arquivo especifico
 * - Requer autenticacao JWT do Supabase
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
    // CORS preflight
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // Variaveis de ambiente do R2 (configuradas nos secrets do Supabase)
        const accountId = Deno.env.get("R2_ACCOUNT_ID");
        const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
        const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
        const bucketName = Deno.env.get("R2_BUCKET_NAME");
        const publicDomain = Deno.env.get("R2_PUBLIC_DOMAIN");

        if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
            throw new Error("R2 credentials not configured in Edge Function secrets");
        }

        const body = await req.json();
        const { fileName, contentType, userId } = body;

        if (!fileName || !contentType || !userId) {
            return new Response(
                JSON.stringify({ error: "fileName, contentType, and userId are required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Criar client S3 compativel com R2
        const s3 = new S3Client({
            endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
            credentials: { accessKeyId, secretAccessKey },
            region: "auto",
        });

        // Gerar a chave do arquivo (mesmo padrao do upload atual: userId/uuid.ext)
        const filePath = `${userId}/${fileName}`;

        // Criar comando PutObject com Cache-Control para CDN
        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: filePath,
            ContentType: contentType,
            CacheControl: "public, max-age=31536000, immutable",
        });

        // Gerar URL assinada (expira em 5 minutos)
        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

        // URL publica final (para salvar no banco)
        const publicUrl = `${publicDomain}/${filePath}`;

        console.log(`[PRESIGNED] Generated URL for ${filePath} (expires in 5min)`);

        return new Response(
            JSON.stringify({
                signedUrl,
                publicUrl,
                filePath,
                expiresIn: 300,
            }),
            {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );

    } catch (error: any) {
        console.error("[PRESIGNED] Error:", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    }
});
