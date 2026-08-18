import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
    // CORS preflight
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // [SECURITY HARDENING FASE F — P0] JWT obrigatório:
        // antes, qualquer pessoa podia enviar CSV arbitrário ao bucket
        // audit_logs com player_name arbitrário (spoofing de Proof-of-Audit).
        const authHeader = req.headers.get("authorization") || "";
        const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
        if (!jwt) {
            return new Response(JSON.stringify({ error: "Autenticacao obrigatoria." }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
        const supabaseUser = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: `Bearer ${jwt}` } },
        });

        const { data: user, error: userError } = await supabaseUser.auth.getUser(jwt);
        if (userError || !user?.user?.id) {
            return new Response(JSON.stringify({ error: "Token invalido." }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }
        const userId = user.user.id;

        const formData = await req.formData();
        const file = formData.get("relatorio") as File;

        if (!file) {
            return new Response(JSON.stringify({ error: "relatorio is required" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // [SECURITY] Caminho escopado pelo usuário autenticado — o
        // player_name da requisição NUNCA define o caminho (anti-spoofing).
        const filePath = `${userId}/auditoria_${Date.now()}.csv`;
        const { data, error } = await supabase.storage
            .from("audit_logs")
            .upload(filePath, file, {
                contentType: "text/csv",
                upsert: false,
            });

        if (error) throw error;

        return new Response(JSON.stringify({ message: "Upload successful", data }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Upload error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});