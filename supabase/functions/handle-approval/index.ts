import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { verify } from "https://deno.land/x/djwt@v2.9.1/mod.ts";

// Env vars
const JWT_SECRET = Deno.env.get("JWT_SECRET") || "super-secret-jwt-key-change-this";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const htmlResponse = (title: string, message: string, color: string = "#3b82f6") => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0a0a0a; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #1a1a1a; padding: 40px; border-radius: 16px; text-align: center; max-width: 400px; border: 1px solid #333; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
    h1 { color: ${color}; margin-bottom: 16px; }
    p { color: #aaa; line-height: 1.5; }
    .icon { font-size: 48px; margin-bottom: 20px; display: block; }
  </style>
</head>
<body>
  <div class="card">
    <span class="icon">${color === "#22c55e" ? "✅" : (color === "#ef4444" ? "❌" : "ℹ️")}</span>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>
`;

const handler = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const action = url.searchParams.get("action");

    if (!token || !action || !['approve', 'reject'].includes(action)) {
        return new Response(htmlResponse("Erro", "Link inválido ou malformado.", "#ef4444"), {
            status: 400,
            headers: { "Content-Type": "text/html" }
        });
    }

    try {
        // 1. Verify Token
        const key = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(JWT_SECRET),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["verify"]
        );

        const payload = await verify(token, key);
        const userId = payload.sub;
        const tokenAction = payload.action;

        if (!userId || tokenAction !== action) {
            throw new Error("Token mismatch or invalid payload");
        }

        // 2. Perform DB Update
        const newStatus = action === 'approve' ? 'approved' : 'rejected';

        const { error: updateError } = await supabase
            .from('profiles')
            .update({ status: newStatus })
            .eq('user_id', userId);

        if (updateError) throw updateError;

        // 3. (Optional) Notify User via Email on Approval
        if (action === 'approve') {
            // Get user email
            const { data: profile } = await supabase.from('profiles').select('email, full_name').eq('user_id', userId).single();

            if (profile?.email && RESEND_API_KEY) {
                await fetch("https://api.resend.com/emails", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${RESEND_API_KEY}`,
                    },
                    body: JSON.stringify({
                        from: "SOBRE MÍDIA <onboarding@resend.dev>",
                        to: [profile.email],
                        subject: "🎉 Seu acesso foi APROVADO! - SOBRE MÍDIA",
                        html: `
                <h1>Bem-vindo a bordo!</h1>
                <p>Olá ${profile.full_name}, sua conta foi aprovada.</p>
                <p>Você já pode acessar a plataforma: <a href="https://sobremidiadesigner.com.br">Acessar Sistema</a></p>
              `
                    }),
                });
            }
        }

        // 4. Return HTML Success
        const title = action === 'approve' ? "Usuário Aprovado" : "Usuário Rejeitado";
        const msg = action === 'approve'
            ? "O usuário foi aprovado com sucesso e já pode acessar a plataforma."
            : "O acesso do usuário foi negado.";
        const color = action === 'approve' ? "#22c55e" : "#ef4444";

        return new Response(htmlResponse(title, msg, color), {
            status: 200,
            headers: { "Content-Type": "text/html" }
        });

    } catch (error: any) {
        console.error("Approval error:", error);
        return new Response(htmlResponse("Erro de Processamento", "Token inválido ou expirado.", "#ef4444"), {
            status: 403,
            headers: { "Content-Type": "text/html" }
        });
    }
};

serve(handler);
