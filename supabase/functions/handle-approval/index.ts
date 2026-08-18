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
  let requestId = url.searchParams.get("id");
  let rawToken = url.searchParams.get("token");
  let action = url.searchParams.get("action"); // 'approve' | 'reject'
  let motivo = url.searchParams.get("motivo");
  let wantsJson = url.searchParams.get("format") === "json" ||
    (req.headers.get("accept") || "").includes("application/json");

  // Chamadas programáticas (supabase.functions.invoke): aceita JSON no corpo
  if (req.method === "POST" && (req.headers.get("content-type") || "").includes("application/json")) {
    try {
      const body = await req.json();
      requestId = requestId ?? body?.id;
      rawToken = rawToken ?? body?.token;
      action = action ?? body?.action;
      motivo = motivo ?? body?.motivo;
      wantsJson = wantsJson || body?.format === "json";
    } catch {
      return new Response(wantsJson ? JSON.stringify({ ok: false, error: "Corpo JSON invalido." }) : htmlResponse("Erro de Solicitação", "Corpo JSON inválido.", "#ef4444"), {
        status: 400,
        headers: { "Content-Type": wantsJson ? "application/json" : "text/html", ...corsHeaders }
      });
    }
  }

  const json = (status: number, payload: { ok: boolean; error?: string }) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });

  if (!requestId || !action || !["approve", "reject"].includes(action)) {
    if (wantsJson) return json(400, { ok: false, error: "Parâmetros inválidos ou malformados." });
    return new Response(htmlResponse("Erro de Solicitação", "Parâmetros inválidos ou malformados na URL.", "#ef4444"), {
      status: 400,
      headers: { "Content-Type": "text/html", ...corsHeaders }
    });
  }

  // F11: token é OBRIGATÓRIO — sem token não existe autorização de decisão
  if (!rawToken) {
    if (wantsJson) return json(403, { ok: false, error: "Token de autorização é obrigatório." });
    return new Response(htmlResponse("Acesso Negado", "Token de autorização é obrigatório para decidir solicitações.", "#ef4444"), {
      status: 403,
      headers: { "Content-Type": "text/html", ...corsHeaders }
    });
  }

  try {
    // 1. Busca registro na tabela public.solicitacoes_acesso
    const { data: request, error: fetchError } = await supabase
      .from("solicitacoes_acesso")
      .select("*")
      .eq("id", requestId)
      .single();

    if (fetchError || !request) {
      if (wantsJson) return json(404, { ok: false, error: "Solicitação de acesso não encontrada." });
      return new Response(htmlResponse("Não Encontrado", "A solicitação de acesso não foi encontrada no banco de dados.", "#ef4444"), {
        status: 404,
        headers: { "Content-Type": "text/html", ...corsHeaders }
      });
    }

    // 2. Validação SERVER-SIDE do Token (Single-Use, Expiration & SHA-256 Hash)
    // 2.1 Verifica Reutilização (Single-Use)
    if (request.approval_used_at) {
      if (wantsJson) return json(400, { ok: false, error: "Este link de aprovação já foi utilizado anteriormente (Token Consumido)." });
      return new Response(htmlResponse("Token Consumido", "Este link de aprovação já foi utilizado anteriormente.", "#f59e0b"), {
        status: 400,
        headers: { "Content-Type": "text/html", ...corsHeaders }
      });
    }

    // 2.2 Verifica Expiração (48h)
    if (request.approval_token_expires_at && new Date(request.approval_token_expires_at) < new Date()) {
      if (wantsJson) return json(410, { ok: false, error: "Este link de aprovação expirou (validade de 48 horas)." });
      return new Response(htmlResponse("Link Expirado", "Este link de aprovação expirou (validade de 48 horas).", "#ef4444"), {
        status: 410,
        headers: { "Content-Type": "text/html", ...corsHeaders }
      });
    }

    // 2.3 Verifica Hash SHA-256 do Token
    const incomingHash = await hashToken(rawToken);
    if (!request.approval_token_hash || request.approval_token_hash !== incomingHash) {
      if (wantsJson) return json(403, { ok: false, error: "Token de aprovação inválido ou adulterado." });
      return new Response(htmlResponse("Token Inválido", "O token de segurança é inválido ou foi adulterado.", "#ef4444"), {
        status: 403,
        headers: { "Content-Type": "text/html", ...corsHeaders }
      });
    }

    // 2.4 Estado transacionável: somente PENDING pode ser decidido
    if (request.status !== "PENDING") {
      if (wantsJson) return json(409, { ok: false, error: "Esta solicitação já foi processada." });
      return new Response(htmlResponse("Já Processada", "Esta solicitação já foi processada anteriormente.", "#f59e0b"), {
        status: 409,
        headers: { "Content-Type": "text/html", ...corsHeaders }
      });
    }

    // 3. Executa a transação no banco de dados usando SERVICE_ROLE_KEY,
    //    com trava anti-race (status PENDING) e uso único (approval_used_at nulo)
    const newStatus = action === "approve" ? "APPROVED" : "REJECTED";
    const nowIso = new Date().toISOString();

    const updatePayload: Record<string, any> = {
      status: newStatus,
      approval_used_at: nowIso,
      updated_at: nowIso,
    };

    if (action === "approve") {
      updatePayload.approved_at = nowIso;
    } else {
      updatePayload.rejected_at = nowIso;
      updatePayload.motivo_rejeicao = motivo || "Rejeitado via decisão de link seguro por e-mail.";
    }

    const { data: updatedRows, error: updateError } = await supabase
      .from("solicitacoes_acesso")
      .update(updatePayload)
      .eq("id", requestId)
      .eq("status", "PENDING")
      .is("approval_used_at", null)
      .select("id");

    if (updateError) throw updateError;
    if (!updatedRows || updatedRows.length === 0) {
      if (wantsJson) return json(409, { ok: false, error: "[RACE CONDITION SHIELD] Esta solicitação já foi processada por outra requisição." });
      return new Response(htmlResponse("Já Processada", "Esta solicitação já foi processada por outra requisição.", "#f59e0b"), {
        status: 409,
        headers: { "Content-Type": "text/html", ...corsHeaders }
      });
    }

    // 4. Envia Notificação por E-mail ao Usuário
    if (RESEND_API_KEY && request.email_usuario) {
      const subject = action === "approve"
        ? "Seu cadastro na plataforma SOBRE MÍDIA foi APROVADO!"
        : "Informação sobre seu cadastro na plataforma SOBRE MÍDIA";

      const userHtml = action === "approve"
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

    // 5. Retorna página visual de resposta (ou JSON para chamadas programáticas)
    if (wantsJson) return json(200, { ok: true });

    const title = action === "approve" ? "Cadastro Aprovado!" : "Cadastro Rejeitado";
    const msg = action === "approve"
      ? `O cadastro de ${request.nome_usuario} (${request.tipo_acesso}) foi APROVADO com sucesso.`
      : `O cadastro de ${request.nome_usuario} (${request.tipo_acesso}) foi REJEITADO.`;
    const color = action === "approve" ? "#10b981" : "#ef4444";

    return new Response(htmlResponse(title, msg, color), {
      status: 200,
      headers: { "Content-Type": "text/html", ...corsHeaders }
    });

  } catch (error: any) {
    console.error("[handle-approval] Erro de decisão:", error);
    if (wantsJson) return json(500, { ok: false, error: "Ocorreu um erro ao processar a decisão no banco." });
    return new Response(htmlResponse("Erro Interno", "Ocorreu um erro ao processar a decisão no banco.", "#ef4444"), {
      status: 500,
      headers: { "Content-Type": "text/html", ...corsHeaders }
    });
  }
});
