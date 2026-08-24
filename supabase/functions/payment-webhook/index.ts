/**
 * SOBRE MÍDIA — Payment Webhook (Edge Function)
 * Endpoint único de confirmação de pagamento, provider-agnostic.
 * Ao ser chamado por um gateway (quando credenciado), valida assinatura,
 * garante idempotência e insere o pagamento — o trigger trg_concilia_pagamento
 * propaga: contas_receber → PAGA, cancela fila de inadimplência, reativa cliente,
 * registra auditoria e enfileira confirmação ao cliente.
 *
 * AUTENTICAÇÃO:
 *   - x-signature: HMAC-SHA256 hex do corpo bruto com PAYMENT_WEBHOOK_SECRET (se configurado)
 *   - OU Authorization: Bearer <BILLING_WORKER_SECRET>
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("PAYMENT_WEBHOOK_SECRET");
const WORKER_SECRET = Deno.env.get("BILLING_WORKER_SECRET");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-signature",
};

function json(status: number, body: object): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
}

async function hmacValida(bodyText: string, assinatura: string | null): Promise<boolean> {
  if (!WEBHOOK_SECRET) return false;
  if (!assinatura) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(bodyText));
  const esperada = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return esperada === assinatura.trim().toLowerCase();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    return await handle(req);
  } catch (e) {
    console.error("[payment-webhook] erro:", e);
    return json(500, { erro: String(e?.message ?? e) });
  }
});

async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return json(405, { erro: "metodo não permitido" });

  const bodyText = await req.text();

  let autorizado = false;
  const sigHeader = req.headers.get("x-signature");
  if (sigHeader && (await hmacValida(bodyText, sigHeader))) autorizado = true;
  if (!autorizado && WORKER_SECRET) {
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (bearer === WORKER_SECRET) autorizado = true;
  }
  if (!autorizado) return json(401, { erro: "assinatura/credencial inválida" });

  let p: any;
  try { p = JSON.parse(bodyText); } catch { return json(400, { erro: "JSON inválido" }); }

  const transacaoId: string | null = p.transacao_id_externo || p.transaction_id || p.txid || null;
  const contaReceberId: string | null = p.conta_receber_id || p.charge_id || null;
  const numeroDocumento: string | null = p.numero_documento || p.doc_number || null;
  const valorPago = Number(p.valor_pago ?? p.amount ?? p.value ?? 0);
  const meio = String(p.meio_pagamento || p.payment_method || "PIX").toUpperCase().slice(0, 30);
  const dataLiq = p.data_liquidacao || p.paid_at || new Date().toISOString();

  if (!transacaoId) return json(400, { erro: "transacao_id_externo é obrigatório" });
  if (!contaReceberId && !numeroDocumento) return json(400, { erro: "informe conta_receber_id ou numero_documento" });
  if (!(valorPago > 0)) return json(400, { erro: "valor_pago deve ser positivo" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Idempotência forte por transação externa
  const { data: dup } = await admin
    .from("pagamentos")
    .select("id")
    .eq("transacao_id_externo", transacaoId)
    .maybeSingle();
  if (dup) return json(200, { ok: true, idempotente: true, pagamento_id: dup.id });

  // Localizar a cobrança
  let conta: any = null;
  if (contaReceberId) {
    ({ data: conta } = await admin.from("contas_receber").select("id, empresa_operadora_id, status").eq("id", contaReceberId).maybeSingle());
  }
  if (!conta && numeroDocumento) {
    const rpc = await admin.rpc("buscar_conta_por_documento", { p_doc: numeroDocumento });
    const lista = (rpc.data as any[]) || null;
    conta = lista && lista.length > 0 ? lista[0] : null;
    void rpc.error;
  }
  if (!conta) return json(404, { erro: "cobrança não encontrada" });
  if (["CANCELADA", "CANCELADO"].includes(conta.status)) return json(422, { erro: "cobrança cancelada — recusar pagamento" });

  const { data: pag, error: errPag } = await admin
    .from("pagamentos")
    .insert({
      empresa_operadora_id: conta.empresa_operadora_id,
      conta_receber_id: conta.id,
      contrato_id: null,
      meio_pagamento: meio,
      valor_pago: valorPago,
      data_liquidacao: dataLiq,
      transacao_id_externo: transacaoId,
    })
    .select("id")
    .single();

  if (errPag) {
    if (String(errPag.message).includes("uk_pagamentos_transacao_externa")) {
      return json(200, { ok: true, idempotente: true });
    }
    return json(500, { erro: errPag.message });
  }

  // Estado pós-conciliação (o trigger atualizou a conta)
  const { data: depois } = await admin
    .from("contas_receber")
    .select("status, valor_pago, saldo")
    .eq("id", conta.id)
    .single();
  void depois;

  return json(200, {
    ok: true,
    pagamento_id: pag?.id,
    cobranca: { id: conta.id },
  });
}

