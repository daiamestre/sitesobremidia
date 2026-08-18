import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.9.1/mod.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
// [SECURITY HARDENING] Sem fallback hardcoded: se JWT_SECRET não estiver no
// ambiente, a função recusa gerar tokens (fail-closed).
const JWT_SECRET = Deno.env.get("JWT_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
// In production, this should point to your deployed function URL
const FUNCTION_BASE_URL = `${SUPABASE_URL}/functions/v1`;

const ADMIN_EMAIL = "sobremidiadesigner@gmail.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NewUserNotification {
  user_id: string;
  full_name: string;
  email: string;
  company_name: string;
}

async function createToken(userId: string, action: 'approve' | 'reject') {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const jwt = await create(
    { alg: "HS256", typ: "JWT" },
    {
      sub: userId,
      action,
      exp: getNumericDate(60 * 60 * 24 * 7) // 7 days expiration
    },
    key
  );

  return jwt;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("send-approval-notification function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // [SECURITY HARDENING] JWT_SECRET obrigatório (sem fallback hardcoded)
    if (!JWT_SECRET || !SUPABASE_URL) {
      return new Response(
        JSON.stringify({ error: "JWT_SECRET/SUPABASE_URL nao configurados no ambiente." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { user_id, full_name, email, company_name }: NewUserNotification = await req.json();

    console.log(`Processing notification for user: ${email} (${user_id})`);

    // Generate tokens
    const approveToken = await createToken(user_id, 'approve');
    const rejectToken = await createToken(user_id, 'reject');

    // Construct links
    // Note: In local dev it might differ, but typically functions are at /functions/v1/name
    const approveLink = `${FUNCTION_BASE_URL}/handle-approval?token=${approveToken}&action=approve`;
    const rejectLink = `${FUNCTION_BASE_URL}/handle-approval?token=${rejectToken}&action=reject`;

    console.log("Links generated (preview):", { approveLink, rejectLink });

    // Send notification to admin
    const adminEmailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "SOBRE MÍDIA <onboarding@resend.dev>",
        to: [ADMIN_EMAIL],
        subject: `🔔 Nova solicitação de acesso - ${full_name}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0a0a0a; color: #ffffff; padding: 40px; }
              .container { max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); border-radius: 16px; padding: 40px; border: 1px solid #333; }
              .header { text-align: center; margin-bottom: 30px; }
              .logo { font-size: 28px; font-weight: bold; background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
              .content { background: #262626; border-radius: 12px; padding: 24px; margin: 20px 0; }
              .field { margin-bottom: 16px; }
              .field-label { color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
              .field-value { color: #fff; font-size: 16px; margin-top: 4px; }
              .actions { display: flex; gap: 16px; margin-top: 30px; justify-content: center; }
              .btn { padding: 12px 24px; border-radius: 8px; font-weight: bold; text-decoration: none; display: inline-block; transition: opacity 0.2s; }
              .btn:hover { opacity: 0.9; }
              .btn-approve { background-color: #22c55e; color: #fff; }
              .btn-reject { background-color: #ef4444; color: #fff; }
              .footer { text-align: center; margin-top: 40px; color: #666; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="logo">SOBRE MÍDIA</div>
                <p style="color: #888; margin-top: 8px;">Nova Solicitação de Acesso</p>
              </div>
              
              <div class="content">
                <div class="field">
                  <div class="field-label">Nome Completo</div>
                  <div class="field-value">${full_name}</div>
                </div>
                <div class="field">
                  <div class="field-label">E-mail</div>
                  <div class="field-value">${email}</div>
                </div>
                <div class="field">
                  <div class="field-label">Empresa</div>
                  <div class="field-value">${company_name}</div>
                </div>
                <div class="field">
                  <div class="field-label">Status</div>
                  <div class="field-value" style="color: #fbbf24;">⏳ Aguardando Aprovação</div>
                </div>

                <div class="actions">
                  <a href="${approveLink}" class="btn btn-approve">ACEITAR</a>
                  <a href="${rejectLink}" class="btn btn-reject">RECUSAR</a>
                </div>
                <p style="text-align: center; color: #666; font-size: 11px; margin-top: 10px;">Links válidos por 7 dias.</p>
              </div>
              
              <div class="footer">
                <p>Este é um e-mail automático do sistema SOBRE MÍDIA.</p>
                <p>User ID: ${user_id}</p>
              </div>
            </div>
          </body>
          </html>
        `,
      }),
    });

    const adminResult = await adminEmailResponse.json();
    console.log("Admin notification email sent:", adminResult);

    // Send confirmation email to user
    const userEmailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "SOBRE MÍDIA <onboarding@resend.dev>",
        to: [email],
        subject: "📩 Sua solicitação foi recebida - SOBRE MÍDIA",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0a0a0a; color: #ffffff; padding: 40px; }
              .container { max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); border-radius: 16px; padding: 40px; border: 1px solid #333; }
              .header { text-align: center; margin-bottom: 30px; }
              .logo { font-size: 28px; font-weight: bold; background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
              .content { background: #262626; border-radius: 12px; padding: 24px; margin: 20px 0; text-align: center; }
              .icon { font-size: 48px; margin-bottom: 16px; }
              h2 { color: #fff; margin-bottom: 16px; }
              p { color: #aaa; line-height: 1.6; }
              .footer { text-align: center; margin-top: 40px; color: #666; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="logo">SOBRE MÍDIA</div>
              </div>
              
              <div class="content">
                <div class="icon">✅</div>
                <h2>Olá, ${full_name}!</h2>
                <p>Sua solicitação de acesso ao sistema SOBRE MÍDIA foi recebida com sucesso.</p>
                <p style="margin-top: 16px;">Nossa equipe irá analisar seu cadastro e você receberá um e-mail assim que sua conta for aprovada.</p>
                <p style="margin-top: 24px; color: #888;">Prazo médio de aprovação: <strong style="color: #3b82f6;">24-48 horas úteis</strong></p>
              </div>
              
              <div class="footer">
                <p>Obrigado por escolher a SOBRE MÍDIA!</p>
                <p>Este é um e-mail automático, por favor não responda.</p>
              </div>
            </div>
          </body>
          </html>
        `,
      }),
    });

    const userResult = await userEmailResponse.json();
    console.log("User confirmation email sent:", userResult);

    return new Response(
      JSON.stringify({
        success: true,
        adminEmail: adminResult,
        userEmail: userResult
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-approval-notification function:", error);
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
