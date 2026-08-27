import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface StatusNotification {
  user_id?: string;
  empresa_operadora_id?: string;
  full_name: string;
  email: string;
  status: 'approved' | 'rejected';
  company_name: string;
}

interface TestNotification {
  type: 'test';
}

const handler = async (req: Request): Promise<Response> => {
  console.log("send-status-notification function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Handle test notification
    if (body.type === 'test') {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Get authorization header
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        throw new Error("No authorization header");
      }

      // Verify user
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !user) {
        throw new Error("Unauthorized");
      }

      // Get user profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("email, full_name, offline_notification_threshold")
        .eq("user_id", user.id)
        .single();

      if (profileError || !profile) {
        throw new Error("Profile not found");
      }

      // Tenant canônico vem de `usuarios` (profiles é legado e NÃO possui
      // empresa_operadora_id — enviá-la como undefined quebrava a RPC
      // enfileirar_job com chamada de 2 argumentos).
      const { data: usuarioRow } = await supabase
        .from("usuarios")
        .select("empresa_operadora_id")
        .eq("id", user.id)
        .maybeSingle();

      const empresaOperadoraId = usuarioRow?.empresa_operadora_id;
      if (!empresaOperadoraId) {
        throw new Error("Usuário sem tenant (empresa_operadora) vinculado.");
      }

      const { error: jobError } = await supabase.rpc('enfileirar_job', {
        p_empresa_operadora_id: empresaOperadoraId,
        p_event_name: 'TEST_NOTIFICATION',
        p_payload: {
          to: profile.email,
          template_key: 'test_notification',
          vars: {
            full_name: profile.full_name,
            offline_notification_threshold: profile.offline_notification_threshold
          }
        }
      });

      if (jobError) {
        throw new Error(`Job enqueuing error: ${jobError.message}`);
      }

      console.log(`Test notification job enqueued for ${profile.email}`);

      return new Response(
        JSON.stringify({ success: true, message: "Email enviado com sucesso" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle status notification (approved/rejected)
    const { full_name, email, status, company_name, empresa_operadora_id }: StatusNotification = body;

    if (!email || !status || !empresa_operadora_id) {
      return new Response(
        JSON.stringify({ error: "Parâmetros obrigatórios: full_name/email/status/empresa_operadora_id." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Enqueuing ${status} notification job to: ${email}`);

    const isApproved = status === 'approved';
    const eventName = isApproved ? 'USER_APPROVED' : 'USER_REJECTED';
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error: jobError } = await supabase.rpc('enfileirar_job', {
      p_empresa_operadora_id: empresa_operadora_id,
      p_event_name: eventName,
      p_payload: {
        to: email,
        template_key: isApproved ? 'user_approved' : 'user_rejected',
        vars: {
          full_name,
          company_name
        }
      }
    });

    if (jobError) {
      throw new Error(`Job enqueuing error: ${jobError.message}`);
    }

    console.log("Status notification job enqueued");

    return new Response(
      JSON.stringify({ success: true, message: "Job enqueued successfully" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-status-notification function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
