import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

/**
 * [SECURITY HARDENING — FASE FUNDAÇÃO]
 * Este endpoint era um relay de e-mail ABERTO (qualquer pessoa podia enviar
 * e-mails em nome da SOBRE MÍDIA). Agora exige:
 *   1. JWT de usuário autenticado (Authorization: Bearer <jwt>).
 *   2. O destinatário só pode ser o próprio e-mail do usuário (anti-spam),
 *      OU o chamador precisa ser admin/owner (notificações operacionais).
 * Sem JWT → 401. Sem permissão → 403.
 */
async function resolveUser(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return null;

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data?.user?.id) return null;
  return data.user;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const user = await resolveUser(req);
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Autenticacao obrigatoria." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { to, subject, html } = (await req.json()) as EmailPayload;

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: "Parâmetros to, subject e html são obrigatórios." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // [ANTI-SPAM] Usuário comum só pode enviar PARA O PRÓPRIO e-mail.
    // Envio para terceiros exige admin/owner (RBAC no banco).
    const isSelf = user.email?.toLowerCase() === to.toLowerCase();
    if (!isSelf) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
      if (!supabaseUrl || !anonKey) {
        return new Response(
          JSON.stringify({ error: "Supabase environment missing." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const supabase = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${req.headers.get("authorization")}` } },
      });
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (isAdmin !== true) {
        return new Response(
          JSON.stringify({ error: "Sem permissao para enviar para este destinatario." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Precisamos do empresa_operadora_id
    let empresaOperadoraId = '00000000-0000-0000-0000-000000000000';
    const { data: userData } = await supabaseService.from("usuarios").select("empresa_operadora_id").eq("id", user.id).maybeSingle();
    if (userData && userData.empresa_operadora_id) {
      empresaOperadoraId = userData.empresa_operadora_id;
    }

    const { data: jobId, error: jobError } = await supabaseService.rpc('enfileirar_job', {
      p_empresa_operadora_id: empresaOperadoraId,
      p_event_name: 'GENERIC_EMAIL',
      p_payload: {
        to: to,
        template_key: 'generic_email',
        vars: {
          subject: subject,
          html: html
        }
      }
    });

    if (jobError) {
      console.error("[send-email] Erro ao enfileirar:", jobError);
      return new Response(
        JSON.stringify({ error: jobError.message || "Erro ao enfileirar job" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ id: jobId || `job-${Date.now()}`, status: "sent" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});