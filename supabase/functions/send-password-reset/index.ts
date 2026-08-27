import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUBLIC_APP_URL = Deno.env.get("PUBLIC_APP_URL") || "https://plataforma.sobremidia.com.br";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function hashToken(token: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateRandomToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (status: number, body: object) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  try {
    const { email } = await req.json();

    if (!email) {
      return json(400, { ok: false, error: "E-mail é obrigatório." });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Buscar usuário na tabela usuarios
    const { data: usuario, error: userError } = await supabase
      .from("usuarios")
      .select("id, nome, email, empresa_operadora_id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    // Sempre retornar sucesso para não revelar se e-mail existe (anti-enumeration)
    // Mas só processar se usuário existir
    if (userError || !usuario) {
      console.log(`[send-password-reset] E-mail não encontrado ou erro: ${normalizedEmail}`);
      return json(200, { ok: true, message: "Se o e-mail existir, você receberá instruções." });
    }

    // Invalidar tokens anteriores não usados
    await supabase
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("usuario_id", usuario.id)
      .is("used_at", null);

    // Gerar novo token
    const rawToken = generateRandomToken();
    const tokenHash = await hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hora

    const { error: insertError } = await supabase.from("password_reset_tokens").insert({
      usuario_id: usuario.id,
      empresa_operadora_id: usuario.empresa_operadora_id,
      token_hash: tokenHash,
      token_expires_at: expiresAt,
    });

    if (insertError) {
      console.error("[send-password-reset] Erro ao inserir token:", insertError);
      return json(500, { ok: false, error: "Erro ao processar solicitação." });
    }

    // Link de reset apontando para nossa página customizada
    const resetLink = `${PUBLIC_APP_URL}/auth/reset-password?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(normalizedEmail)}`;

    // Enfileirar job para communication-core
    const { error: jobError } = await supabase.rpc("enfileirar_job", {
      p_empresa_operadora_id: usuario.empresa_operadora_id,
      p_event_name: "PASSWORD_RESET",
      p_payload: {
        to: normalizedEmail,
        template_key: "password_reset",
        vars: {
          nome_usuario: usuario.nome,
          reset_link: resetLink,
        },
      },
    });

    if (jobError) {
      console.error("[send-password-reset] Erro ao enfileirar job:", jobError);
      return json(500, { ok: false, error: "Erro ao enviar e-mail." });
    }

    // Auditoria
    await supabase.from("auditoria_logs").insert({
      empresa_operadora_id: usuario.empresa_operadora_id,
      usuario_email: normalizedEmail,
      entidade_tipo: "PASSWORD_RESET",
      entidade_id: usuario.id,
      acao: "PASSWORD_RESET_REQUESTED",
      status_novo: "SENT",
      observacoes: `Solicitação de recuperação de senha enviada para ${normalizedEmail}`,
    });

    console.log(`[send-password-reset] E-mail de reset enfileirado para: ${normalizedEmail}`);

    return json(200, { ok: true, message: "Se o e-mail existir, você receberá instruções." });
  } catch (err: any) {
    console.error("[send-password-reset] Erro:", err);
    return json(500, { ok: false, error: "Erro interno do servidor." });
  }
});