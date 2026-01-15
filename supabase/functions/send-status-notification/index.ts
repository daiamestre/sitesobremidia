import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface StatusNotification {
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

      const testHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
            .success { background: #ecfdf5; border-left: 4px solid #10b981; padding: 12px; margin: 16px 0; }
            .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">✅ Teste de Notificação</h1>
            </div>
            <div class="content">
              <p>Olá${profile.full_name ? ` ${profile.full_name}` : ""},</p>
              
              <div class="success">
                <strong>Sucesso!</strong> Suas notificações por e-mail estão funcionando corretamente.
              </div>
              
              <p>Este é um e-mail de teste para confirmar que você receberá alertas quando suas telas ficarem offline por mais de <strong>${profile.offline_notification_threshold || 5} minutos</strong>.</p>
              
              <p>Você pode alterar suas preferências de notificação a qualquer momento em Configurações.</p>
              
              <div class="footer">
                <p>Esta é uma notificação de teste do sistema SOBRE MÍDIA.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "SOBRE MÍDIA <onboarding@resend.dev>",
          to: [profile.email],
          subject: "✅ Teste de Notificação - SOBRE MÍDIA",
          html: testHtml,
        }),
      });

      if (!emailResponse.ok) {
        const errorText = await emailResponse.text();
        throw new Error(`Resend API error: ${errorText}`);
      }

      const result = await emailResponse.json();
      console.log(`Test email sent to ${profile.email}:`, result);

      return new Response(
        JSON.stringify({ success: true, message: "Email enviado com sucesso" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle status notification (approved/rejected)
    const { full_name, email, status, company_name }: StatusNotification = body;

    console.log(`Sending ${status} notification to: ${email}`);

    const isApproved = status === 'approved';
    
    const subject = isApproved 
      ? `✅ Sua conta foi aprovada - SOBRE MÍDIA`
      : `❌ Solicitação de acesso - SOBRE MÍDIA`;

    const htmlContent = isApproved ? `
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
          .icon { font-size: 64px; margin-bottom: 16px; }
          h2 { color: #fff; margin-bottom: 16px; }
          p { color: #aaa; line-height: 1.6; margin: 12px 0; }
          .cta { text-align: center; margin-top: 24px; }
          .button { display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; }
          .footer { text-align: center; margin-top: 40px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">SOBRE MÍDIA</div>
          </div>
          
          <div class="content">
            <div class="icon">🎉</div>
            <h2>Parabéns, ${full_name}!</h2>
            <p>Sua conta na plataforma SOBRE MÍDIA foi <strong style="color: #22c55e;">aprovada</strong>!</p>
            <p>Agora você tem acesso completo ao sistema de Digital Signage.</p>
            <p style="color: #888; margin-top: 20px;">Empresa: <strong style="color: #fff;">${company_name}</strong></p>
          </div>
          
          <div class="cta">
            <p style="color: #888; margin-bottom: 16px;">Acesse agora e comece a criar suas campanhas:</p>
          </div>
          
          <div class="footer">
            <p>Obrigado por escolher a SOBRE MÍDIA!</p>
          </div>
        </div>
      </body>
      </html>
    ` : `
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
          .icon { font-size: 64px; margin-bottom: 16px; }
          h2 { color: #fff; margin-bottom: 16px; }
          p { color: #aaa; line-height: 1.6; margin: 12px 0; }
          .footer { text-align: center; margin-top: 40px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">SOBRE MÍDIA</div>
          </div>
          
          <div class="content">
            <div class="icon">😔</div>
            <h2>Olá, ${full_name}</h2>
            <p>Infelizmente sua solicitação de acesso à plataforma SOBRE MÍDIA foi <strong style="color: #ef4444;">recusada</strong>.</p>
            <p>Se você acredita que isso foi um engano ou deseja mais informações, entre em contato com nossa equipe de suporte.</p>
          </div>
          
          <div class="footer">
            <p>Atenciosamente,<br>Equipe SOBRE MÍDIA</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "SOBRE MÍDIA <onboarding@resend.dev>",
        to: [email],
        subject,
        html: htmlContent,
      }),
    });

    const result = await emailResponse.json();
    console.log("Status notification email sent:", result);

    return new Response(
      JSON.stringify({ success: true, result }),
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
