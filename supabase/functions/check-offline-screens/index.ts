import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

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
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, email, full_name, offline_notification_enabled, offline_notification_threshold")
      .in("user_id", userIds);

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      throw profilesError;
    }

    // Create a map of user_id to settings
    const userSettingsMap = new Map<string, UserSettings>(
      profiles?.map(p => [
        p.user_id, 
        { 
          email: p.email, 
          name: p.full_name,
          notifications_enabled: p.offline_notification_enabled ?? true,
          threshold_minutes: p.offline_notification_threshold ?? 5
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

      const screenList = screens
        .map(s => `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${s.name}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${s.location || "Não definida"}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${s.minutes_offline} minutos</td>
          </tr>
        `)
        .join("");

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
            table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; }
            th { background: #f3f4f6; padding: 12px 8px; text-align: left; }
            .alert { background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px; margin: 16px 0; }
            .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">⚠️ Alerta de Telas Offline</h1>
            </div>
            <div class="content">
              <p>Olá${userSettings.name ? ` ${userSettings.name}` : ""},</p>
              
              <div class="alert">
                <strong>${screens.length} tela(s)</strong> está(ão) offline há mais de ${userSettings.threshold_minutes} minutos.
              </div>
              
              <table>
                <thead>
                  <tr>
                    <th>Tela</th>
                    <th>Localização</th>
                    <th>Tempo Offline</th>
                  </tr>
                </thead>
                <tbody>
                  ${screenList}
                </tbody>
              </table>
              
              <p style="margin-top: 20px;">
                Por favor, verifique a conexão e o status das telas afetadas.
              </p>
              
              <p style="font-size: 12px; color: #6b7280;">
                Você pode alterar suas preferências de notificação em Configurações.
              </p>
              
              <div class="footer">
                <p>Esta é uma notificação automática do sistema SOBRE MÍDIA.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      try {
        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "SOBRE MÍDIA <onboarding@resend.dev>",
            to: [userSettings.email],
            subject: `⚠️ Alerta: ${screens.length} tela(s) offline`,
            html,
          }),
        });

        if (!emailResponse.ok) {
          const errorText = await emailResponse.text();
          throw new Error(`Resend API error: ${errorText}`);
        }

        const emailResult = await emailResponse.json();
        console.log(`Email sent to ${userSettings.email}:`, emailResult);
        notifiedCount++;
      } catch (emailError: any) {
        console.error(`Error sending email to ${userSettings.email}:`, emailError);
        errors.push(`Failed to send to ${userSettings.email}: ${emailError.message}`);
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
