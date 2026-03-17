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
        const formData = await req.formData();
        const playerName = formData.get("player_name") as string;
        const file = formData.get("relatorio") as File;

        if (!playerName || !file) {
            return new Response(JSON.stringify({ error: "player_name and relatorio are required" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Save to bucket: screenId/filename
        const filePath = `${playerName}/${file.name}`;
        const { data, error } = await supabase.storage
            .from("audit_logs")
            .upload(filePath, file, {
                contentType: "text/csv",
                upsert: true,
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
