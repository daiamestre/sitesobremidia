/**
 * SOBRE MÍDIA — Billing Worker (Edge Function)
 * Consome a fila public.jobs (tipo_job LIKE 'COLECTION%'), reconcilia o estado
 * financeiro REAL, resolve o contato financeiro do cliente, renderiza template
 * de comunicacao_templates e envia via Resend. Registra tentativa/retry via RPC.
 *
 * AUTENTICAÇÃO (dual):
 *   - Authorization: Bearer <BILLING_WORKER_SECRET>            (cron / dispatch pg_net)
 *   - Authorization: Bearer <JWT de usuario do mesmo tenant>   (botão "Processar régua")
 *
 * Body: { job_id } para um job específico ou { action: "process_queue", limit?: number }
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BILLING_WORKER_SECRET = Deno.env.get("BILLING_WORKER_SECRET");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("BILLING_EMAIL_FROM") || "cobranca@sobremidia.com.br";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function json(status: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

interface JobRow {
  id: string;
  empresa_operadora_id: string;
  tipo_job: string;
  payload: Record<string, any>;
  tentativas: number;
  max_tentativas: number;
}

async function autenticar(req: Request): Promise<{ ok: boolean; userId?: string }> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false };
  if (BILLING_WORKER_SECRET && token === BILLING_WORKER_SECRET) return { ok: true };

  // JWT de usuário: valida assinatura e pertencimento ao tenant no processamento
  const { data, error } = await admin.auth.getUser(token);
  if (!error && data?.user) return { ok: true, userId: data.user.id };
  return { ok: false };
}

async function usuarioPertenceAoTenant(userId: string, tenantId: string): Promise<boolean> {
  const { data, error } = await admin.rpc("get_user_empresa_operadora_id" as any, { p_user_id: userId });
  if (error || !data) {
    const { data: d2 } = await admin.rpc("get_user_empresa_operadora_id" as any, { user_id: userId });
    return d2 === tenantId;
  }
  return data === tenantId;
}

async function reconciliada(contaReceberId: string): Promise<{ paga: boolean; motivo?: string }> {
  const { data: conta } = await admin
    .from("contas_receber")
    .select("status, valor, saldo")
    .eq("id", contaReceberId)
    .maybeSingle();
  if (!conta) return { paga: true, motivo: "conta_nao_encontrada" };
  if (["PAGA", "PAGO", "CONCILIADA", "CANCELADA", "CANCELADO"].includes(conta.status)) {
    return { paga: true, motivo: `status_${conta.status}` };
  }
  const saldo = Number(conta.saldo ?? conta.valor ?? 0);
  if (saldo <= 0) return { paga: true, motivo: "saldo_zero" };
  return { paga: false };
}

// Contato financeiro: cargo financeiro > principal > e-mail da empresa
async function resolverDestinatarios(clienteId: string | null, tenantId: string): Promise<string[]> {
  const destinos: string[] = [];
  if (clienteId) {
    const { data: fin } = await admin
      .from("contatos")
      .select("email, cargo, is_principal, empresas!inner(cliente_id)")
      .eq("empresas.cliente_id", clienteId)
      .or("cargo.ilike.%financ%,cargo.ilike.%fatur%,cargo.ilike.%contab%,cargo.ilike.%pagamento%,is_principal.eq.true")
      .limit(5);
    for (const c of fin || []) if (c.email && !destinos.includes(c.email)) destinos.push(c.email);
  }
  if (destinos.length === 0) {
    const { data: emp } = await admin
      .from("empresas")
      .select("id")
      .eq("cliente_id", clienteId || "")
      .limit(1)
      .maybeSingle();
    if (emp) {
      const { data: principal } = await admin
        .from("contatos")
        .select("email")
        .eq("empresa_id", emp.id)
        .order("is_principal", { ascending: false })
        .limit(1);
      for (const c of principal || []) if (c.email && !destinos.includes(c.email)) destinos.push(c.email);
    }
  }
  if (destinos.length === 0 && tenantId) {
    const { data: tenantRow } = await admin
      .from("empresa_operadora")
      .select("email")
      .eq("id", tenantId)
      .maybeSingle();
    if (tenantRow?.email) destinos.push(tenantRow.email);
  }
  return destinos.slice(0, 5);
}

function escapar(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

function renderizar(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => escapar(vars[k] ?? ""));
}

async function carregarTemplate(eventName: string): Promise<{ assunto: string; corpo: string } | null> {
  const { data: cat } = await admin
    .from("comunicacao_eventos_catalogo")
    .select("template_key_padrao")
    .eq("event_name", eventName)
    .maybeSingle();
  let key = cat?.template_key_padrao;
  if (!key) {
    if (eventName.startsWith("COLECTION_REMINDER")) key = "collection_reminder";
    else if (eventName.startsWith("COLECTION_OVERDUE")) key = "collection_overdue";
    else key = "collection_overdue";
  }
  const { data: tpl } = await admin
    .from("comunicacao_templates")
    .select("assunto, corpo")
    .eq("template_key", key!)
    .eq("canal", "email")
    .eq("status", "ACTIVE")
    .order("versao", { ascending: false })
    .limit(1)
    .maybeSingle();
  return tpl ? { assunto: tpl.assunto, corpo: tpl.corpo } : null;
}

async function enviarEmail(to: string[], subject: string, html: string): Promise<{ ok: boolean; erro?: string }> {
  if (!RESEND_API_KEY) return { ok: false, erro: "RESEND_API_KEY ausente" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
    });
    const bodyText = await res.text();
    if (!res.ok) return { ok: false, erro: `${res.status}: ${bodyText.slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: String(e) };
  }
}

async function avancarSituacao(contaReceberId: string, tenantId: string, eventoSituacao?: string, evento?: string) {
  const mapa: Record<string, string> = {
    LEMBRETE: "EM_COBRANCA",
    VENCIMENTO: "EM_COBRANCA",
    CONTATO_1: "CONTATO_1",
    CONTATO_2: "CONTATO_2",
    CONTATO_3_INADIMPLENCIA: "CONTATO_3",
  };
  const nova = eventoSituacao ? mapa[eventoSituacao] : undefined;
  if (nova) {
    const ordem = ["NENHUMA", "EM_COBRANCA", "CONTATO_1", "CONTATO_2", "CONTATO_3", "INADIMPLENTE", "BLOQUEADO"];
    const { data: atual } = await admin.from("contas_receber").select("situacao_cobranca").eq("id", contaReceberId).maybeSingle();
    if (atual && ordem.indexOf(nova) > ordem.indexOf(atual.situacao_cobranca)) {
      await admin.from("contas_receber").update({ situacao_cobranca: nova }).eq("id", contaReceberId);
    }
  }
  await admin.from("financeiro_auditoria").insert({
    empresa_operadora_id: tenantId,
    evento: "COBRANCA_ENVIADA",
    detalhes: { conta_receber_id: contaReceberId, evento_enviado: evento ?? null, canal: "email" },
  });
}

async function processarJob(jobId: string): Promise<object> {
  const { data: job, error: jobErr } = await admin.from("jobs").select("*").eq("id", jobId).maybeSingle();
  if (jobErr || !job) return { ok: false, erro: "job nao encontrado" };
  const j = job as unknown as JobRow;

  const { error: claimErr } = await admin
    .from("jobs")
    .update({ status: "PROCESSING" })
    .eq("id", j.id)
    .eq("status", "PENDING");
  if (claimErr) return { ok: false, erro: claimErr.message };

  try {
    const payload = j.payload || {};
    const contaReceberId: string | undefined = payload.conta_receber_id;

    if (j.tipo_job === "COLECTION_PAID" && contaReceberId) {
      // Confirmação de pagamento — sempre enviável
    } else if (contaReceberId) {
      const rec = await reconciliada(contaReceberId);
      if (rec.paga) {
        await admin.rpc("registrar_tentativa_job" as any, { p_job_id: j.id, p_ok: true, p_erro: null });
        await admin.from("jobs").update({ status: "CANCELLED", processed_at: new Date().toISOString(), erro_ultimo: `reconciliado:${rec.motivo}` }).eq("id", j.id);
        return { ok: true, skipped: true, motivo: rec.motivo };
      }
    }

    const clienteNome: string = payload.cliente_nome || "Cliente";
    const tenantId: string = j.empresa_operadora_id;
    const { data: tenant } = await admin.from("empresa_operadora").select("nome, nome_fantasia").eq("id", tenantId).maybeSingle();
    const empresaNome: string = tenant?.nome_fantasia || tenant?.nome || "SOBRE MÍDIA";

    const vars: Record<string, string> = {
      cliente_nome: clienteNome,
      empresa_nome: empresaNome,
      numero_documento: payload.numero_documento || "",
      valor: payload.valor != null ? Number(payload.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "",
      vencimento: payload.vencimento ? new Date(String(payload.vencimento) + "T00:00:00").toLocaleDateString("pt-BR") : "",
      dias_para_vencimento: String(payload.dias_para_vencimento ?? ""),
      dias_em_atraso: String(payload.dias_em_atraso ?? ""),
    };

    const tpl = await carregarTemplate(j.tipo_job);
    const destinos = await resolverDestinatarios(payload.cliente_id ?? null, tenantId);

    if (destinos.length === 0) {
      await admin.rpc("registrar_tentativa_job" as any, { p_job_id: j.id, p_ok: false, p_erro: "sem_contato_financeiro_configurado" });
      await admin.from("financeiro_auditoria").insert({
        empresa_operadora_id: tenantId,
        evento: "COBRANCA_FALHA_ENVIO",
        detalhes: { conta_receber_id: contaReceberId ?? null, motivo: "sem_contato_financeiro_configurado", fallback_registrado: true },
      });
      return { ok: false, erro: "sem destinatario" };
    }

    const html = renderizar(tpl?.corpo || "<p>{{cliente_nome}}, fatura {{numero_documento}} de {{valor}}.</p>", vars);
    const subject = renderizar(tpl?.assunto || "Fatura {{numero_documento}}", vars);

    const resultado = await enviarEmail(destinos, subject, html);

    if (resultado.ok) {
      await admin.rpc("registrar_tentativa_job" as any, { p_job_id: j.id, p_ok: true, p_erro: null });
      await avancarSituacao(contaReceberId || "", tenantId, payload.evento_situacao, j.tipo_job);
      return { ok: true, enviado_para: destinos };
    }

    await admin.rpc("registrar_tentativa_job" as any, { p_job_id: j.id, p_ok: false, p_erro: resultado.erro });
    return { ok: false, erro: resultado.erro };
  } catch (e) {
    await admin.rpc("registrar_tentativa_job" as any, { p_job_id: j.id, p_ok: false, p_erro: String(e).slice(0, 400) });
    return { ok: false, erro: String(e) };
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { erro: "metodo não permitido" });

  const auth = await autenticar(req);
  if (!auth.ok) return json(401, { erro: "nao autorizado" });

  let body: any = {};
  try { body = await req.json(); } catch { /* vazio */ }

  if (body.action === "process_queue") {
    if (auth.userId && body.empresa_operadora_id) {
      const pertence = await usuarioPertenceAoTenant(auth.userId, String(body.empresa_operadora_id));
      if (!pertence) return json(403, { erro: "tenant divergente" });
    }
    const limite = Math.min(Number(body.limit) || 25, 100);
    let q = admin.from("jobs").select("id").like("tipo_job", "COLECTION%").eq("status", "PENDING").lte("retry_at", new Date().toISOString()).limit(limite);
    if (body.empresa_operadora_id) q = q.eq("empresa_operadora_id", String(body.empresa_operadora_id));
    const { data: pendentes, error } = await q;
    if (error) return json(500, { erro: error.message });
    const resultados = [];
    for (const row of pendentes || []) {
      resultados.push(await processarJob(row.id));
    }
    return json(200, { processados: resultados.length, resultados });
  }

  if (!body.job_id) return json(400, { erro: "informe job_id ou action=process_queue" });
  const r = await processarJob(String(body.job_id));
  return json(r.ok ? 200 : 500, r);
});
