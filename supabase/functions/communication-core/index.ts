/**
 * SOBRE MÍDIA — Communication Core Edge Function
 * ETAPAS 15-16-17: Provider Layer + Resend Integration + Correlation ID
 *
 * ARQUITETURA:
 *   Módulos de negócio (ERP, CRM, Financeiro, Portal, Auth)
 *     → enfileirar_job RPC (PostgreSQL)
 *       → communication-core Edge Function (este arquivo)
 *         → CommunicationProvider (abstração)
 *           → ResendProvider (atual)
 *           → BrevoProvider (futuro)
 *           → SMTPProvider (futuro)
 *
 * PONTOS DE ENTRADA:
 *   POST /functions/v1/communication-core
 *   Body: { job_id, event_name, channel, payload, correlation_id }
 *
 *   Ou chamada direta (fire-and-forget):
 *   Body: { direct: true, event_name, to, template_key, vars, empresa_operadora_id }
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// ======================================================================
// CONFIGURAÇÃO
// ======================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const INTERNAL_CORE_SECRET = Deno.env.get("INTERNAL_CORE_SECRET") || Deno.env.get("CRON_SECRET");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id, x-tenant-id",
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ======================================================================
// INTERFACES (Provider Layer Abstraction — ETAPA 15)
// ======================================================================

interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  correlationId?: string;
}

interface SendResult {
  ok: boolean;
  provider: string;
  reference?: string;       // ID do e-mail no provedor
  error?: string;
  statusCode?: number;
}

/**
 * ETAPA 15 — CommunicationProvider (abstração)
 * Nenhum módulo de negócio deve conhecer Resend, Brevo ou SMTP diretamente.
 */
abstract class CommunicationProvider {
  abstract name: string;
  abstract sendEmail(message: EmailMessage): Promise<SendResult>;
}

// ======================================================================
// ETAPA 16 — ResendProvider
// ======================================================================

class ResendProvider extends CommunicationProvider {
  name = "RESEND";

  constructor(private apiKey: string) {
    super();
  }

  async sendEmail(message: EmailMessage): Promise<SendResult> {
    const from = message.from || "SOBRE MÍDIA <onboarding@resend.dev>";

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
          // ETAPA 17 — Correlation ID: propagado para o provedor via header customizado
          ...(message.correlationId ? { "X-Correlation-Id": message.correlationId } : {}),
        },
        body: JSON.stringify({
          from,
          to: Array.isArray(message.to) ? message.to : [message.to],
          subject: message.subject,
          html: message.html,
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        }),
      });

      const body = await response.json() as { id?: string; name?: string; message?: string };

      if (!response.ok) {
        return {
          ok: false,
          provider: this.name,
          error: body.message || body.name || `HTTP ${response.status}`,
          statusCode: response.status,
        };
      }

      return {
        ok: true,
        provider: this.name,
        reference: body.id,
        statusCode: response.status,
      };

    } catch (err: any) {
      return {
        ok: false,
        provider: this.name,
        error: err.message,
      };
    }
  }
}

// ======================================================================
// ETAPA 16 — Stub para provedores futuros (não implementados ainda)
// ======================================================================

class BrevoProvider extends CommunicationProvider {
  name = "BREVO";
  async sendEmail(_message: EmailMessage): Promise<SendResult> {
    return { ok: false, provider: this.name, error: "BrevoProvider: não implementado nesta fase." };
  }
}

class SMTPProvider extends CommunicationProvider {
  name = "SMTP";
  async sendEmail(_message: EmailMessage): Promise<SendResult> {
    return { ok: false, provider: this.name, error: "SMTPProvider: não implementado nesta fase." };
  }
}

// ======================================================================
// ETAPA 16 — Provider Factory (seleção do provedor ativo)
// ======================================================================

function getProvider(): CommunicationProvider {
  const providerName = Deno.env.get("COMM_PROVIDER") || "RESEND";

  switch (providerName.toUpperCase()) {
    case "BREVO": return new BrevoProvider();
    case "SMTP":  return new SMTPProvider();
    case "RESEND":
    default:
      if (!RESEND_API_KEY) {
        throw new Error("COMM_PROVIDER=RESEND mas RESEND_API_KEY não configurada.");
      }
      return new ResendProvider(RESEND_API_KEY);
  }
}

// ======================================================================
// TEMPLATE RENDERER — Substituição segura de {{variavel}}
// NUNCA executa código — apenas substitui literais
// ======================================================================

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = vars[key];
    if (val === undefined) {
      console.warn(`[communication-core] Variável de template não resolvida: {{${key}}}`);
      return `{{${key}}}`;
    }
    // Sanitização básica: remover scripts inline
    return String(val).replace(/<script/gi, "&lt;script");
  });
}

// ======================================================================
// VERIFICAR PREFERÊNCIAS DO USUÁRIO
// ======================================================================

async function verificarPreferencia(
  usuarioId: string,
  canal: string,
  eventName: string,
): Promise<boolean> {
  // Verificar preferência específica para o evento
  const { data: pref } = await supabase
    .from("comunicacao_preferencias")
    .select("habilitado, pode_desabilitar")
    .eq("usuario_id", usuarioId)
    .eq("canal", canal)
    .eq("event_name", eventName)
    .maybeSingle();

  if (pref) {
    // Se o evento for crítico e não pode desabilitar: sempre enviar
    if (!pref.pode_desabilitar) return true;
    return pref.habilitado;
  }

  // Verificar preferência global para o canal
  const { data: prefGlobal } = await supabase
    .from("comunicacao_preferencias")
    .select("habilitado")
    .eq("usuario_id", usuarioId)
    .eq("canal", canal)
    .is("event_name", null)
    .maybeSingle();

  return prefGlobal?.habilitado ?? true; // default: habilitado
}

// ======================================================================
// HANDLER PRINCIPAL
// ======================================================================

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // [SECURITY HARDENING] Função interna do Communication Core (lê a fila de
  // jobs com service role): somente chamadas internas com INTERNAL_CORE_SECRET
  // (fallback CRON_SECRET) são aceitas. Mesma convenção de check-offline-screens.
  if (!INTERNAL_CORE_SECRET) {
    return new Response(JSON.stringify({ error: "INTERNAL_CORE_SECRET nao configurado." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const providedSecret = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (providedSecret !== INTERNAL_CORE_SECRET) {
    return new Response(JSON.stringify({ error: "Acesso negado." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ETAPA 17 — Correlation ID: extraído do header ou gerado
  const correlationId =
    req.headers.get("x-correlation-id") ||
    crypto.randomUUID();

  const tenantId = req.headers.get("x-tenant-id");

  const json = (status: number, body: object) =>
    new Response(JSON.stringify({ ...body, correlation_id: correlationId }), {
      status,
      headers: {
        "Content-Type": "application/json",
        "X-Correlation-Id": correlationId,
        ...corsHeaders,
      },
    });

  try {
    const body = await req.json();
    const { job_id, event_name, channel, payload, direct } = body;

    // ----------------------------------------------------------------
    // MODO 1: Processar job da fila
    // ----------------------------------------------------------------
    if (job_id && !direct) {
      // Buscar job
      const { data: job, error: jobErr } = await supabase
        .from("jobs")
        .select("*")
        .eq("id", job_id)
        .single();

      if (jobErr || !job) {
        return json(404, { ok: false, error: "Job não encontrado" });
      }

      // Marcar como PROCESSING (schema real: sem started_at/updated_at)
      await supabase
        .from("jobs")
        .update({ status: "PROCESSING" })
        .eq("id", job_id)
        .eq("status", "PENDING"); // race-condition guard

      // Processar notificação baseada no payload do job
      const result = await processarNotificacao({
        eventName: job.tipo_job || job.event_name || job.tipo,
        channel: (job.canal || "EMAIL").toLowerCase(),
        payload: job.payload || {},
        correlationId,
        empresaOperadoraId: job.empresa_operadora_id,
      });

      // Registrar tentativa via RPC (schema real: p_job_id, p_ok, p_erro)
      await supabase.rpc("registrar_tentativa_job", {
        p_job_id: job_id,
        p_ok: !!result.ok,
        p_erro: result.error || null,
      });

      return json(200, { ok: result.ok, job_id, ...result });
    }

    // ----------------------------------------------------------------
    // MODO 2: Fire-and-forget direto (chamada programática imediata)
    // ----------------------------------------------------------------
    if (direct) {
      const { to, template_key, vars, empresa_operadora_id, usuario_id } = body;

      if (!to || !template_key) {
        return json(400, { ok: false, error: "to e template_key são obrigatórios no modo direto." });
      }

      // Verificar preferência do usuário (se disponível)
      if (usuario_id) {
        const podeEnviar = await verificarPreferencia(usuario_id, channel || "email", event_name || "");
        if (!podeEnviar) {
          return json(200, { ok: true, skipped: true, reason: "Canal desabilitado nas preferências do usuário." });
        }
      }

      // Buscar template
      const { data: template } = await supabase
        .from("comunicacao_templates")
        .select("assunto, corpo")
        .eq("template_key", template_key)
        .eq("canal", "email")
        .eq("status", "ACTIVE")
        .or(`empresa_operadora_id.eq.${empresa_operadora_id},empresa_operadora_id.is.null`)
        .order("empresa_operadora_id", { ascending: false }) // tenant override primeiro
        .limit(1)
        .maybeSingle();

      if (!template) {
        return json(404, { ok: false, error: `Template '${template_key}' não encontrado.` });
      }

      const subject = renderTemplate(template.assunto || "", vars || {});
      const html = renderTemplate(template.corpo, vars || {});

      const provider = getProvider();
      const result = await provider.sendEmail({ to, subject, html, correlationId });

      // Log em auditoria
      if (empresa_operadora_id) {
        await supabase.from("auditoria_logs").insert({
          empresa_operadora_id,
          usuario_email: typeof to === "string" ? to : to[0],
          entidade_tipo: "COMUNICACAO",
          entidade_id: correlationId,
          acao: "EMAIL_SENT",
          status_novo: result.ok ? "DELIVERED" : "FAILED",
          observacoes: JSON.stringify({
            provider: result.provider,
            reference: result.reference,
            template_key,
            event_name,
            correlation_id: correlationId,
            error: result.error,
          }),
        });
      }

      return json(result.ok ? 200 : 502, result);
    }

    return json(400, { ok: false, error: "Payload inválido. Forneça job_id ou direct=true." });

  } catch (err: any) {
    console.error("[communication-core] Erro:", err, "correlation_id:", correlationId);
    return json(500, { ok: false, error: err.message });
  }
});

// ======================================================================
// PROCESSADOR DE NOTIFICAÇÃO
// ======================================================================

async function processarNotificacao(opts: {
  eventName: string;
  channel: string;
  payload: Record<string, any>;
  correlationId: string;
  empresaOperadoraId: string;
}): Promise<SendResult & { reference?: string; statusCode?: number }> {
  const { eventName, channel, payload, correlationId, empresaOperadoraId } = opts;

  // 1. Buscar catálogo do evento
  const { data: catalog } = await supabase
    .from("comunicacao_eventos_catalogo")
    .select("template_key_padrao, prioridade, canais_habilitados")
    .eq("event_name", eventName)
    .maybeSingle();

  const templateKey = payload.template_key || catalog?.template_key_padrao;
  if (!templateKey) {
    return { ok: false, provider: "NONE", error: `Nenhum template configurado para evento ${eventName}` };
  }

  // 2. Buscar template
  const { data: template } = await supabase
    .from("comunicacao_templates")
    .select("assunto, corpo")
    .eq("template_key", templateKey)
    .eq("canal", channel.toLowerCase())
    .eq("status", "ACTIVE")
    .or(`empresa_operadora_id.eq.${empresaOperadoraId},empresa_operadora_id.is.null`)
    .order("empresa_operadora_id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!template) {
    return { ok: false, provider: "NONE", error: `Template '${templateKey}' para canal '${channel}' não encontrado.` };
  }

  // 3. Renderizar template
  const vars = payload.vars || {};
  const subject = renderTemplate(template.assunto || "", vars);
  const html = renderTemplate(template.corpo, vars);
  const to = payload.to || payload.email_usuario;

  if (!to) {
    return { ok: false, provider: "NONE", error: "Destinatário (to) não fornecido no payload do job." };
  }

  // 4. Enviar via Provider Layer
  const provider = getProvider();
  return provider.sendEmail({ to, subject, html, correlationId });
}
