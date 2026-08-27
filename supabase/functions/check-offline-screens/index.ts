import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";



const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OfflineScreen {
  id: string;
  name: string;
  location: string | null;
  last_ping_at: string | null;
  user_id: string;
  user_email: string;
  minutes_offline: number;
}

interface UserSettings {
  email: string;
  name: string;
  notifications_enabled: boolean;
  threshold_minutes: number;
  empresa_operadora_id?: string;
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // [SECURITY HARDENING] Função de cron (envia e-mails em massa e lê todas
  // as telas): somente chamadas internas com CRON_SECRET são aceitas.
  const expectedSecret = Deno.env.get("CRON_SECRET");
  if (!expectedSecret) {
    return new Response(JSON.stringify({ error: "CRON_SECRET nao configurado." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const provided = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (provided !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Acesso negado." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    console.log("Starting offline screen check...");

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all active screens with their last ping time
    const { data: allScreens, error: screensError } = await supabase
      .from("screens")
      .select(`
        id,
        name,
        location,
        last_ping_at,
        user_id
      `)
      .eq("is_active", true)
      .not("last_ping_at", "is", null);

    if (screensError) {
      console.error("Error fetching screens:", screensError);
      throw screensError;
    }

    console.log(`Found ${allScreens?.length || 0} active screens with ping data`);

    if (!allScreens || allScreens.length === 0) {
      return new Response(
        JSON.stringify({ message: "No screens with ping data found", notified: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get unique user IDs
    const userIds = [...new Set(allScreens.map(s => s.user_id))];

    // Fetch user profiles with notification settings
    // [FIX 20261102] profiles NÃO possui empresa_operadora_id (nem nunca teve):
    // o tenant oficial do usuário vive em public.usuarios. Buscar os dois
    // mapas separadamente evita PGRST 400 no cron inteiro.
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, email, full_name, offline_notification_enabled, offline_notification_threshold")
      .in("user_id", userIds);

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      throw profilesError;
    }

    const { data: usuarioRows, error: usuariosError } = await supabase
      .from("usuarios")
      .select("id, empresa_operadora_id")
      .in("id", userIds);

    if (usuariosError) {
      console.error("Error fetching usuarios:", usuariosError);
      throw usuariosError;
    }

    const tenantMap = new Map<string, string | null>(
      (usuarioRows || []).map((u: { id: string; empresa_operadora_id: string | null }) => [u.id, u.empresa_operadora_id])
    );

    // Create a map of user_id to settings
    const userSettingsMap = new Map<string, UserSettings>(
      profiles?.map(p => [
        p.user_id, 
        { 
          email: p.email, 
          name: p.full_name,
          notifications_enabled: p.offline_notification_enabled ?? true,
          threshold_minutes: p.offline_notification_threshold ?? 5,
          empresa_operadora_id: tenantMap.get(p.user_id) ?? undefined
        }
      ]) || []
    );

    // Group screens by user and filter by their individual threshold
    const screensByUser = new Map<string, OfflineScreen[]>();
    
    for (const screen of allScreens) {
      const userSettings = userSettingsMap.get(screen.user_id);
      if (!userSettings?.email || !userSettings.notifications_enabled) {
        console.log(`Skipping user ${screen.user_id}: notifications disabled or no email`);
        continue;
      }

      // Calculate if screen is offline based on user's threshold
      const thresholdMs = userSettings.threshold_minutes * 60 * 1000;
      const lastPingTime = new Date(screen.last_ping_at!).getTime();
      const timeSinceLastPing = Date.now() - lastPingTime;
      
      if (timeSinceLastPing < thresholdMs) {
        // Screen is still within threshold, skip
        continue;
      }

      const minutesOffline = Math.round(timeSinceLastPing / 60000);

      const offlineScreen: OfflineScreen = {
        ...screen,
        user_email: userSettings.email,
        minutes_offline: minutesOffline,
      };

      if (!screensByUser.has(screen.user_id)) {
        screensByUser.set(screen.user_id, []);
      }
      screensByUser.get(screen.user_id)!.push(offlineScreen);
    }

    console.log(`Found ${screensByUser.size} users with offline screens`);

    let notifiedCount = 0;
    const errors: string[] = [];

    // Send notification email to each user
    for (const [userId, screens] of screensByUser) {
      const userSettings = userSettingsMap.get(userId);
      if (!userSettings?.email) continue;

      const screenListHTML = screens
        .map(s => `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;">${s.name}</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${s.location || "Não definida"}</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${s.minutes_offline} minutos</td></tr>`)
        .join("");

      try {
        const { error: jobError } = await supabase.rpc('enfileirar_job', {
          p_empresa_operadora_id: userSettings.empresa_operadora_id || '00000000-0000-0000-0000-000000000000',
          p_event_name: 'OFFLINE_SCREEN_ALERT',
          p_payload: {
            to: userSettings.email,
            template_key: 'offline_screen_alert',
            vars: {
              nome_usuario: userSettings.name,
              quantidade_telas: screens.length,
              minutos_offline: userSettings.threshold_minutes,
              screen_list_html: screenListHTML
            }
          }
        });

        if (jobError) {
          throw new Error(`Job enqueuing error: ${jobError.message}`);
        }

        console.log(`Alert job enqueued for ${userSettings.email}`);
        notifiedCount++;
      } catch (jobError: any) {
        console.error(`Error enqueuing job for ${userSettings.email}:`, jobError);
        errors.push(`Failed to enqueue for ${userSettings.email}: ${jobError.message}`);
      }
    }

    console.log(`Notification complete. Sent: ${notifiedCount}, Errors: ${errors.length}`);

    return new Response(
      JSON.stringify({ 
        message: "Offline check complete",
        screensChecked: allScreens.length,
        notified: notifiedCount,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error: any) {
    console.error("Error in check-offline-screens:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
