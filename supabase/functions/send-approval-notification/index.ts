/**
 * SOBRE MÍDIA — send-approval-notification (v2)
 * ETAPA 9: Código morto substituído pela implementação compatível com handle-approval v2.
 *
 * PROBLEMA DA VERSÃO ANTIGA (v1 — DEAD CODE):
 *   - Gerava token JWT (djwt) mas handle-approval valida SHA-256 raw token
 *   - Links enviados: ?token=JWT&action=approve → handle-approval não validava
 *   - Incompatibilidade confirmada: função nunca funcionou em produção
 *
 * NOVA ARQUITETURA (v2):
 *   - Token gerado pelo cadastro (raw token armazenado como SHA-256 em solicitacoes_acesso)
 *   - send-approval-notification NÃO gera tokens → apenas envia e-mail com link baseado
 *     no token que JÁ EXISTE em solicitacoes_acesso.approval_token_raw (passado como parâmetro)
 *   - handle-approval valida: hash(rawToken) === approval_token_hash ✓
 *
 * FLUXO CORRETO:
 *   AuthContext signUp
 *     → cria registro em solicitacoes_acesso (status: PENDING)
 *     → gera rawToken = crypto.randomUUID()
 *     → armazena approval_token_hash = SHA-256(rawToken)
 *     → invoca send-approval-notification com { request_id, raw_token, ... }
 *     → send-approval-notification envia e-mail com link:
 *         /functions/v1/handle-approval?id={request_id}&token={raw_token}&action=approve
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";


const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUBLIC_APP_URL = Deno.env.get("PUBLIC_APP_URL") || "https://plataforma.sobremidia.com.br";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ApprovalNotificationPayload {
  request_id: string;       // UUID da solicitacao_acesso
  raw_token: string;        // Token raw gerado no cadastro (SHA-256 salvo no banco)
  nome_usuario: string;
  email_usuario: string;
  tipo_acesso: string;
  empresa_nome?: string;
  admin_email?: string;     // Se não passado, busca owner da empresa_operadora_id
  empresa_operadora_id?: string;
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
    const payload: ApprovalNotificationPayload = await req.json();

    const { request_id, raw_token, nome_usuario, email_usuario, tipo_acesso, empresa_nome, empresa_operadora_id } = payload;

    if (!request_id || !raw_token || !email_usuario) {
      return json(400, { ok: false, error: "request_id, raw_token e email_usuario são obrigatórios." });
    }


    // Links de aprovação compatíveis com handle-approval v2
    const functionBaseUrl = `${SUPABASE_URL}/functions/v1`;
    const approveLink = `${functionBaseUrl}/handle-approval?id=${request_id}&token=${encodeURIComponent(raw_token)}&action=approve`;
    const rejectLink  = `${functionBaseUrl}/handle-approval?id=${request_id}&token=${encodeURIComponent(raw_token)}&action=reject`;

    // Resolver e-mail do admin: parâmetro explícito ou buscar owner da empresa
    let adminEmail = payload.admin_email;
    if (!adminEmail && empresa_operadora_id) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: owner } = await supabase
        .from("usuarios")
        .select("email")
        .eq("empresa_operadora_id", empresa_operadora_id)
        .eq("is_owner", true)
        .maybeSingle();
      adminEmail = owner?.email || null;
    }

    const results: Record<string, unknown> = {};

    // 1. Enviar e-mail ao admin com links de aprovação/rejeição
    if (adminEmail) {
      const { error: adminJobError } = await supabase.rpc('enfileirar_job', {
        p_empresa_operadora_id: empresa_operadora_id || '00000000-0000-0000-0000-000000000000',
        p_event_name: 'USER_APPROVAL_REQUEST_ADMIN',
        p_payload: {
          to: adminEmail,
          template_key: 'user_approval_request_admin',
          vars: {
            nome_usuario,
            email_usuario,
            tipo_acesso,
            empresa_nome,
            approveLink,
            rejectLink
          }
        }
      });
      
      if (adminJobError) {
        console.error("[send-approval-notification] Erro ao enfileirar job admin:", adminJobError);
        results.admin = { status: 500, error: adminJobError };
      } else {
        results.admin = { status: 200, message: "Job enfileirado" };
      }
    } else {
      console.warn("[send-approval-notification] Nenhum admin encontrado — e-mail ao admin não enviado.");
      results.admin = { skipped: true, reason: "admin_email não resolvido" };
    }

    // 2. Enviar e-mail de confirmação ao usuário (cadastro recebido)
    const { error: userJobError } = await supabase.rpc('enfileirar_job', {
      p_empresa_operadora_id: empresa_operadora_id || '00000000-0000-0000-0000-000000000000',
      p_event_name: 'USER_REGISTERED',
      p_payload: {
        to: email_usuario,
        template_key: 'user_registered',
        vars: {
          nome_usuario,
          tipo_acesso
        }
      }
    });
    
    if (userJobError) {
      console.error("[send-approval-notification] Erro ao enfileirar job user:", userJobError);
      results.user = { status: 500, error: userJobError };
    } else {
      results.user = { status: 200, message: "Job enfileirado" };
    }

    // 3. Registrar em auditoria_logs via service_role
    if (empresa_operadora_id) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabase.from("auditoria_logs").insert({
        empresa_operadora_id,
        usuario_email: email_usuario,
        usuario_role: tipo_acesso,
        entidade_tipo: "SOLICITACAO_ACESSO",
        entidade_id: request_id,
        acao: "APPROVAL_NOTIFICATION_SENT",
        status_novo: "PENDING",
        observacoes: `E-mail de notificação de aprovação enviado. Admin: ${adminEmail || 'não encontrado'}. Request: ${request_id}`,
      });
    }

    return json(200, { ok: true, results });

  } catch (err: any) {
    console.error("[send-approval-notification] Erro:", err);
    return json(500, { ok: false, error: err.message });
  }
});

