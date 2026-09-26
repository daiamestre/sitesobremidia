import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * process-media — pipeline de compressão de vídeo (F-85 / OF-F81-2).
 *
 * 1. POST do painel (JWT do usuário) com { media_id }:
 *    - o caminho do arquivo vem do BANCO (antes vinha do corpo da requisição: qualquer usuário logado podia mandar
 *      o workflow baixar/sobrescrever/APAGAR um objeto qualquer do R2);
 *    - o objeto precisa estar no escopo do usuário (fn_r2_validate_object_scope, a mesma trava do delete-media-object);
 *    - dispara o workflow compress-video (repository_dispatch novo_video).
 * 2. POST do workflow (cabeçalho x-pipeline-secret = MEDIA_PIPELINE_SECRET) com o resultado:
 *    - ready: grava o novo arquivo (file_path, file_url, file_hash MD5, file_size). O Player compara o MD5 do arquivo
 *      com media.file_hash — sem o hash novo ele apagaria e baixaria de novo a cada sincronização;
 *    - skipped: o vídeo já estava leve, nada muda;
 *    - error: só marca o estado.
 *    Só troca se o arquivo da mídia ainda for o original (não sobrescreve uma troca feita depois).
 */

const SUPPORTED_VIDEO_FORMATS = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"];
const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function segredoIgual(a: string, b: string): boolean {
    if (!a || !b || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    try {
        const body = await req.json();

        // ---------- 2. Retorno do workflow ----------
        const segredo = req.headers.get("x-pipeline-secret") ?? "";
        if (segredo) {
            if (!segredoIgual(segredo, Deno.env.get("MEDIA_PIPELINE_SECRET") ?? "")) {
                return json({ error: "unauthorized_pipeline" }, 401);
            }
            return await registrarResultado(admin, body);
        }

        // ---------- 1. Disparo pelo painel ----------
        const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!jwt) return json({ error: "Autenticacao obrigatoria." }, 401);
        const usuario = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
            global: { headers: { Authorization: `Bearer ${jwt}` } },
        });
        const { data: quem, error: erroQuem } = await usuario.auth.getUser(jwt);
        if (erroQuem || !quem?.user?.id) return json({ error: "Token invalido." }, 401);

        const mediaId = typeof body?.media_id === "string" ? body.media_id : "";
        if (!mediaId) return json({ error: "media_id obrigatorio" }, 400);

        const { data: media } = await admin.from("media")
            .select("id, file_path, file_type, mime_type").eq("id", mediaId).maybeSingle();
        if (!media?.file_path) return json({ error: "midia_nao_encontrada" }, 404);

        const { data: permitido } = await usuario.rpc("fn_r2_validate_object_scope", { p_object_key: media.file_path });
        if (permitido !== true) return json({ error: "Acesso negado: objeto fora do seu escopo." }, 403);

        if (media.file_type !== "video" || (media.mime_type && !SUPPORTED_VIDEO_FORMATS.includes(media.mime_type))) {
            return json({ success: true, media_id: mediaId, status: "not_video" });
        }

        const githubToken = Deno.env.get("GITHUB_TOKEN");
        const githubRepo = Deno.env.get("GITHUB_REPO");
        if (!githubToken || !githubRepo) throw new Error("GITHUB_TOKEN/GITHUB_REPO ausentes");

        const gh = await fetch(`https://api.github.com/repos/${githubRepo}/dispatches`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${githubToken}`,
                Accept: "application/vnd.github+json",
                "Content-Type": "application/json",
                "User-Agent": "sobremidia-process-media",
            },
            body: JSON.stringify({ event_type: "novo_video", client_payload: { media_id: mediaId, file_path: media.file_path } }),
        });
        if (!gh.ok) {
            console.error("[PROCESS-MEDIA] dispatch falhou", gh.status, (await gh.text()).slice(0, 300));
            await admin.from("media").update({ processing_status: "error" }).eq("id", mediaId);
            return json({ error: "Falha ao acionar o worker de compressao", github_status: gh.status }, 502);
        }

        const { error: erroEstado } = await admin.from("media").update({ processing_status: "processing" }).eq("id", mediaId);
        if (erroEstado) console.error("[PROCESS-MEDIA] estado:", erroEstado.message);
        console.log(`[PROCESS-MEDIA] workflow disparado para ${mediaId}`);
        return json({ success: true, media_id: mediaId, status: "processing" });
    } catch (e) {
        console.error("[PROCESS-MEDIA] erro:", e);
        return json({ error: (e as Error).message }, 500);
    }
});

// deno-lint-ignore no-explicit-any
async function registrarResultado(admin: any, body: any): Promise<Response> {
    const { media_id, status, original_path, file_path, file_hash, file_size } = body ?? {};
    if (typeof media_id !== "string" || !["ready", "skipped", "error"].includes(status)) {
        return json({ error: "payload_invalido" }, 400);
    }
    console.log(`[PROCESS-MEDIA-WEBHOOK] ${media_id}: ${status}`);

    if (status !== "ready") {
        const { error } = await admin.from("media").update({ processing_status: status }).eq("id", media_id);
        if (error) throw error;
        return json({ success: true, status });
    }

    if (typeof original_path !== "string" || typeof file_path !== "string" || !/^[A-Za-z0-9._/-]+$/.test(file_path)
        || file_path === original_path || typeof file_hash !== "string" || !/^[a-f0-9]{32}$/.test(file_hash)
        || !(Number(file_size) > 0)) {
        return json({ error: "payload_ready_invalido" }, 400);
    }

    // Só troca se a mídia ainda aponta para o arquivo que foi comprimido. A URL nova sai da URL original
    // (mesmo domínio público do R2 + caminho novo), sem depender de configuração do workflow.
    const { data: atual } = await admin.from("media").select("file_path, file_url").eq("id", media_id).maybeSingle();
    if (!atual || atual.file_path !== original_path || typeof atual.file_url !== "string" || !atual.file_url.endsWith(original_path)) {
        return json({ success: false, status: "arquivo_mudou_antes" }, 409);
    }
    const file_url = atual.file_url.slice(0, atual.file_url.length - original_path.length) + file_path;

    const { data, error } = await admin.from("media")
        .update({ processing_status: "ready", file_path, file_url, file_hash, file_size: Number(file_size) })
        .eq("id", media_id).eq("file_path", original_path)
        .select("id");
    if (error) throw error;
    if (!data?.length) return json({ success: false, status: "arquivo_mudou_antes" }, 409);
    return json({ success: true, status: "ready", file_url });
}
