import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Função utilitária em Deno para computar HASH SHA-256 de um token string
 */
async function hashToken(token: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

const htmlResponse = (title: string, message: string, color: string = "#3b82f6") => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0f172a; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #1e293b; padding: 40px; border-radius: 16px; text-align: center; max-width: 450px; border: 1px solid #334155; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    h1 { color: ${color}; margin-bottom: 16px; font-size: 24px; }
    p { color: #cbd5e1; line-height: 1.6; }
    .icon { font-size: 48px; margin-bottom: 20px; display: block; }
    .btn { display: inline-block; margin-top: 20px; padding: 12px 24px; background: #0284c7; color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="card">
    <span class="icon">${color === "#10b981" ? "✅" : (color === "#ef4444" ? "❌" : "ℹ️")}</span>
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="${Deno.env.get("PUBLIC_APP_URL") || "https://plataforma.sobremidia.com.br"}" class="btn">Ir para a Plataforma</a>
  </div>
</body>
</html>
`;

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const requestId = url.searchParams.get("id");
  const rawToken = url.searchParams.get("token");
  const action = url.searchParams.get("action"); // 'approve' | 'reject'

  if (!requestId || !action || !['approve', 'reject'].includes(action)) {
    return new Response(htmlResponse("Erro de Solicitação", "Parâmetros inválidos ou malformados na URL.", "#ef4444"), {
      status: 400,
      headers: { "Content-Type": "text/html" }
    });
  }

  try {
    // 1. Busca registro na tabela public.solicitacoes_acesso
    const { data: request, error: fetchError } = await supabase
      .from('solicitacoes_acesso')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchError || !request) {
      return new Response(htmlResponse("Não Encontrado", "A solicitação de acesso não foi encontrada no banco de dados.", "#ef4444"), {
        status: 444,
        headers: { "Content-Type": "text/html" }
      });
    }

    // 2. Validação SERVER-SIDE do Token (Single-Use, Expiration & SHA-256 Hash)
    if (rawToken) {
      // 2.1 Verifica Reutilização (Single-Use)
      if (request.approval_used_at) {
        return new Response(htmlResponse("Token Consumido", "Este link de aprovação já foi utilizado anteriormente.", "#f59e0b"), {
          status: 400,
          headers: { "Content-Type": "text/html" }
        });
      }

      // 2.2 Verifica Expiração (48h)
      if (request.approval_token_expires_at && new Date(request.approval_token_expires_at) < new Date()) {
        return new Response(htmlResponse("Link Expirado", "Este link de aprovação expirou (validade de 48 horas).", "#ef4444"), {
          status: 410,
          headers: { "Content-Type": "text/html" }
        });
      }

      // 2.3 Verifica Hash SHA-256 do Token
      const incomingHash = await hashToken(rawToken);
      if (request.approval_token_hash && request.approval_token_hash !== incomingHash) {
        return new Response(htmlResponse("Token Inválido", "O token de segurança é inválido ou foi adulterado.", "#ef4444"), {
          status: 403,
          headers: { "Content-Type": "text/html" }
        });
      }
    }

    // 3. Executa a transação no banco de dados usando SERVICE_ROLE_KEY
    const newStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';
    const nowIso = new Date().toISOString();

    const updatePayload: Record<string, any> = {
      status: newStatus,
      approval_used_at: nowIso,
      updated_at: nowIso,
    };

    if (action === 'approve') {
      updatePayload.approved_at = nowIso;
    } else {
      updatePayload.rejected_at = nowIso;
      updatePayload.motivo_rejeicao = 'Rejeitado via decisão de link seguro por e-mail.';
    }

    const { error: updateError } = await supabase
      .from('solicitacoes_acesso')
      .update(updatePayload)
      .eq('id', requestId);

    if (updateError) throw updateError;

    // 4. Envia Notificação por E-mail ao Usuário
    if (RESEND_API_KEY && request.email_usuario) {
      const subject = action === 'approve' 
        ? 'Seu cadastro na plataforma SOBRE MÍDIA foi APROVADO!' 
        : 'Informação sobre seu cadastro na plataforma SOBRE MÍDIA';

      const userHtml = action === 'approve'
        ? `<p>Olá <strong>${request.nome_usuario}</strong>,</p><p>Seu cadastro como <strong>${request.tipo_acesso}</strong> foi <strong>APROVADO</strong>!</p><p>Você já pode acessar o sistema normalmente.</p>`
        : `<p>Olá <strong>${request.nome_usuario}</strong>,</p><p>Seu cadastro como <strong>${request.tipo_acesso}</strong> não foi aprovado neste momento.</p>`;

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "Sobre Mídia <notificacoes@sobremidia.com.br>",
          to: [request.email_usuario],
          subject: subject,
          html: userHtml,
        }),
      });
    }

    // 5. Retorna página visual de resposta
    const title = action === 'approve' ? "Cadastro Aprovado!" : "Cadastro Rejeitado";
    const msg = action === 'approve'
      ? `O cadastro de ${request.nome_usuario} (${request.tipo_acesso}) foi APROVADO com sucesso.`
      : `O cadastro de ${request.nome_usuario} (${request.tipo_acesso}) foi REJEITADO.`;
    const color = action === 'approve' ? "#10b981" : "#ef4444";

    return new Response(htmlResponse(title, msg, color), {
      status: 200,
      headers: { "Content-Type": "text/html" }
    });

  } catch (error: any) {
    console.error("[handle-approval] Erro de decisão:", error);
    return new Response(htmlResponse("Erro Interno", "Ocorreu um erro ao processar a decisão no banco.", "#ef4444"), {
      status: 500,
      headers: { "Content-Type": "text/html" }
    });
  }
});
