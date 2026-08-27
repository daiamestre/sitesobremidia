import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function hashToken(token: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
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
    if (req.method === "GET") {
      // Validar token via query params (para página de reset)
      const url = new URL(req.url);
      const token = url.searchParams.get("token");
      const email = url.searchParams.get("email");

      if (!token || !email) {
        return json(400, { ok: false, error: "Token e e-mail são obrigatórios." });
      }

      const tokenHash = await hashToken(token);

      const { data: resetToken, error: tokenError } = await supabase
        .from("password_reset_tokens")
        .select("id, usuario_id, token_expires_at, used_at")
        .eq("token_hash", tokenHash)
        .eq("usuario_id", (await supabase.from("usuarios").select("id").eq("email", email.toLowerCase()).maybeSingle()).data?.id)
        .maybeSingle();

      if (tokenError || !resetToken) {
        return json(404, { ok: false, error: "Token inválido ou expirado." });
      }

      if (resetToken.used_at) {
        return json(400, { ok: false, error: "Este token já foi utilizado." });
      }

      if (new Date(resetToken.token_expires_at) < new Date()) {
        return json(410, { ok: false, error: "Token expirado. Solicite uma nova recuperação." });
      }

      return json(200, { ok: true, valid: true });
    }

    if (req.method === "POST") {
      // Processar reset de senha
      const { token, email, newPassword } = await req.json();

      if (!token || !email || !newPassword) {
        return json(400, { ok: false, error: "Token, e-mail e nova senha são obrigatórios." });
      }

      if (newPassword.length < 6) {
        return json(400, { ok: false, error: "A senha deve ter pelo menos 6 caracteres." });
      }

      const tokenHash = await hashToken(token);

      const { data: resetToken, error: tokenError } = await supabase
        .from("password_reset_tokens")
        .select("id, usuario_id, token_expires_at, used_at")
        .eq("token_hash", tokenHash)
        .eq("usuario_id", (await supabase.from("usuarios").select("id").eq("email", email.toLowerCase()).maybeSingle()).data?.id)
        .maybeSingle();

      if (tokenError || !resetToken) {
        return json(404, { ok: false, error: "Token inválido ou expirado." });
      }

      if (resetToken.used_at) {
        return json(400, { ok: false, error: "Este token já foi utilizado." });
      }

      if (new Date(resetToken.token_expires_at) < new Date()) {
        return json(410, { ok: false, error: "Token expirado. Solicite uma nova recuperação." });
      }

      // Atualizar senha no Supabase Auth (usa admin API com service_role)
      const { error: updateError } = await supabase.auth.admin.updateUserById(resetToken.usuario_id, {
        password: newPassword,
      });

      if (updateError) {
        console.error("[handle-password-reset] Erro ao atualizar senha:", updateError);
        return json(500, { ok: false, error: "Erro ao atualizar senha." });
      }

      // Marcar token como usado
      await supabase
        .from("password_reset_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("id", resetToken.id);

      // Auditoria
      const { data: usuario } = await supabase
        .from("usuarios")
        .select("empresa_operadora_id")
        .eq("id", resetToken.usuario_id)
        .maybeSingle();

      if (usuario) {
        await supabase.from("auditoria_logs").insert({
          empresa_operadora_id: usuario.empresa_operadora_id,
          usuario_email: email.toLowerCase(),
          entidade_tipo: "PASSWORD_RESET",
          entidade_id: resetToken.usuario_id,
          acao: "PASSWORD_RESET_COMPLETED",
          status_novo: "COMPLETED",
          observacoes: `Senha redefinida com sucesso via fluxo de recuperação`,
        });
      }

      // Enviar e-mail de confirmação (opcional)
      const { error: jobError } = await supabase.rpc("enfileirar_job", {
        p_empresa_operadora_id: usuario?.empresa_operadora_id || '00000000-0000-0000-0000-000000000000',
        p_event_name: "PASSWORD_RESET",
        p_payload: {
          to: email.toLowerCase(),
          template_key: "password_reset_confirmed",
          vars: {
            nome_usuario: (await supabase.from("usuarios").select("nome").eq("id", resetToken.usuario_id).maybeSingle()).data?.nome || "Usuário",
          },
        },
      });

      if (jobError) {
        console.warn("[handle-password-reset] Falha ao enfileirar e-mail de confirmação:", jobError);
      }

      return json(200, { ok: true, message: "Senha alterada com sucesso." });
    }

    return json(405, { ok: false, error: "Método não permitido." });
  } catch (err: any) {
    console.error("[handle-password-reset] Erro:", err);
    return json(500, { ok: false, error: "Erro interno do servidor." });
  }
});