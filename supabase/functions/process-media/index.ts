import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * [FASE 4] Process Media - Edge Function
 * 
 * Disparada apos o upload de midia no Dashboard.
 * Responsavel por:
 * 1. Registrar o status de processamento na tabela media
 * 2. Validar o formato do video
 * 3. Gerar metadados de transcodificacao (resolucao, bitrate, codec)
 * 4. Marcar como pronto para transcodificacao externa (FFmpeg worker)
 * 
 * Fluxo: Dashboard Upload -> Webhook -> process-media -> Marca video para transcoding
 * 
 * Nota: A transcodificacao real (FFmpeg) deve ser feita por um worker externo
 * (Cloudflare Worker ou servidor dedicado) pois Edge Functions tem limite de tempo.
 * Esta funcao apenas orquestra o pipeline.
/**
 * [FASE 4] Process Media - Edge Function & Webhook
 * 
 * Responsavel por:
 * 1. (POST normal): Iniciar o pipeline acionando o GitHub Actions para transcoding (se vídeo > 50MB ou configurado)
 * 2. (POST webhook): Receber a confirmação do GitHub Actions que o processamento terminou.
 */

const SUPPORTED_VIDEO_FORMATS = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"];
const TARGET_BITRATE = 2500; // kbps para 1080p
const TARGET_RESOLUTION = "1920x1080";

Deno.serve(async (req: Request) => {
    // CORS
    if (req.method === "OPTIONS") {
        return new Response(null, {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
            },
        });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const body = await req.json();
        
        // Verifica se é uma chamada de Webhook do GitHub Actions
        if (body.status === 'ready' || body.status === 'error') {
            return await handleWebhookAuthAndProcess(req, supabase, body);
        }

        // Fluxo normal (Acionado pelo Frontend após o Upload)
        const { media_id, file_url, file_type, file_size, user_id, file_path } = body;

        if (!media_id || !file_path) {
            return new Response(JSON.stringify({ error: "media_id and file_path are required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const isVideo = SUPPORTED_VIDEO_FORMATS.includes(file_type);
        const fileSizeMB = (file_size || 0) / (1024 * 1024);

        // Videos recebem transcodificação (pode ajustar o limite de MBs futuramente)
        const needsTranscoding = isVideo; 

        if (needsTranscoding) {
            console.log(`[PROCESS-MEDIA] Iniciando transcoding. ID=${media_id}, path=${file_path}`);
            
            // 1. Atualizar banco para 'processing'
            await supabase
                .from("media")
                .update({ processing_status: "processing" })
                .eq("id", media_id);

            // 2. Acionar GitHub Actions (Repository Dispatch)
            const githubToken = Deno.env.get("GITHUB_TOKEN");
            const githubRepo = Deno.env.get("GITHUB_REPO"); // Ex: "seu-usuario/sobremidiadesigner"

            if (!githubToken || !githubRepo) {
                throw new Error("Missing GITHUB_TOKEN or GITHUB_REPO in environment variables");
            }

            const githubRes = await fetch(`https://api.github.com/repos/${githubRepo}/dispatches`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${githubToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    event_type: 'novo_video',
                    client_payload: {
                        file_path: file_path, // O caminho original temp/...
                        media_id: media_id
                    }
                })
            });

            if (!githubRes.ok) {
                const errText = await githubRes.text();
                console.error("[PROCESS-MEDIA] Falha ao acionar GitHub Actions:", errText);
                throw new Error("Falha ao acionar worker de transcodificação");
            }

            console.log(`[PROCESS-MEDIA] GitHub Actions disparado com sucesso para ${media_id}`);
            
            return new Response(JSON.stringify({
                success: true,
                media_id,
                status: "processing",
                message: "Pipeline de transcodificação iniciado."
            }), {
                headers: { "Content-Type": "application/json" },
            });

        } else {
            // Se não for vídeo, só marca como pronto
            await supabase
                .from("media")
                .update({ processing_status: "ready" })
                .eq("id", media_id);

            return new Response(JSON.stringify({
                success: true,
                media_id,
                status: "ready"
            }), {
                headers: { "Content-Type": "application/json" },
            });
        }

    } catch (e) {
        console.error("[PROCESS-MEDIA] Error:", e);
        return new Response(JSON.stringify({ error: (e as Error).message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
});

// Helper para processar o callback do GitHub Actions
async function handleWebhookAuthAndProcess(req: Request, supabase: any, body: any) {
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // Validação básica de segurança (O GitHub deve usar a service role)
    if (authHeader !== `Bearer ${serviceRoleKey}`) {
         return new Response(JSON.stringify({ error: "Unauthorized Workflow Call" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }

    const { media_id, status, file_path, file_url } = body;
    console.log(`[PROCESS-MEDIA-WEBHOOK] Status update for ${media_id}: ${status}`);

    if (status === 'ready') {
        const { error } = await supabase
            .from('media')
            .update({
                processing_status: 'ready',
                file_path: file_path,
                file_url: file_url
                // Idealmente o Github também leria no FFmpeg o novo file_size
                // e mandaria para atualizarmos. Será mantido o original por simplicidade agora.
            })
            .eq('id', media_id);

         if (error) throw error;
    } else {
        const { error } = await supabase
            .from('media')
            .update({ processing_status: 'error' })
            .eq('id', media_id);

         if (error) throw error;
    }

    return new Response(JSON.stringify({ success: true, message: "Media updated" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}
