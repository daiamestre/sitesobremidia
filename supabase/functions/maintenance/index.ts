import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const results = [];

        // 1. Cleanup Screenshots (3 days retention)
        const screenshotsCutoff = new Date();
        screenshotsCutoff.setDate(screenshotsCutoff.getDate() - 3);

        results.push(await cleanupBucket(supabase, "screenshots", screenshotsCutoff));

        // 2. Cleanup Audit Logs (7 days retention)
        const auditLogsCutoff = new Date();
        auditLogsCutoff.setDate(auditLogsCutoff.getDate() - 7);

        results.push(await cleanupBucket(supabase, "audit_logs", auditLogsCutoff));

        return new Response(JSON.stringify({ message: "Maintenance completed", results }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Maintenance error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});

async function cleanupBucket(supabase: any, bucketName: string, cutoffDate: Date) {
    console.log(`Cleaning bucket: ${bucketName}, items older than: ${cutoffDate.toISOString()}`);

    // We query the storage.objects table to find old files but use the API to delete them
    // This bypasses the protect_delete trigger because the API handles it correctly
    const { data: objects, error: listError } = await supabase
        .from("objects")
        .select("name, created_at, id")
        .eq("bucket_id", bucketName)
        .lt("created_at", cutoffDate.toISOString());

    if (listError) {
        console.error(`Error listing ${bucketName}:`, listError);
        return { bucket: bucketName, error: listError.message };
    }

    if (!objects || objects.length === 0) {
        return { bucket: bucketName, deleted: 0 };
    }

    const pathsToDelete = objects.map((obj: any) => obj.name);

    // Delete in batches of 100 to avoid timeouts
    let deletedCount = 0;
    for (let i = 0; i < pathsToDelete.length; i += 100) {
        const batch = pathsToDelete.slice(i, i + 100);
        const { error: deleteError } = await supabase.storage
            .from(bucketName)
            .remove(batch);

        if (deleteError) {
            console.error(`Error deleting batch from ${bucketName}:`, deleteError);
        } else {
            deletedCount += batch.length;
        }
    }

    return { bucket: bucketName, deleted: deletedCount };
}
