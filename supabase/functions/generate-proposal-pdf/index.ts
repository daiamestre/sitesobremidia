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

interface GenerateProposalRequest {
  propostaId: string;
  isPreview?: boolean;
  sendEmail?: boolean;
}

interface PropostaRow {
  id: string;
  numero_proposta: string;
  cliente_id: string;
  empresa_operadora_id: string;
  created_at?: string;
  validade_dias?: number;
  valor_total?: number;
  desconto?: number;
  valor_final?: number;
  versao_atual?: number;
  forma_pagamento?: string;
  observacoes?: string;
  status?: string;
  cliente?: unknown;
  representante?: RepresentanteRow | null;
  operadora?: OperadoraRow | null;
}

interface RepresentanteRow {
  usuario?: { nome?: string } | null;
}

interface EmpresaRow {
  nome_fantasia?: string;
  razao_social?: string;
  cnpj?: string;
  cidade?: string;
  estado?: string;
  representante_legal?: string;
  whatsapp?: string;
  email?: string;
  contatos?: Array<{ nome?: string }>;
}

interface OperadoraRow {
  razao_social?: string;
}

interface PropostaItemRow {
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  catalogo_servicos?: { nome?: string } | null;
}

/**
 * Renderiza o modelo HTML oficial de alta fidelidade visual da SOBRE MÍDIA para a Proposta Comercial
 */
function renderProposalHTML(data: {
  proposta: PropostaRow;
  cliente: unknown;
  empresa: EmpresaRow | null;
  contato: { nome?: string } | null;
  representante: RepresentanteRow | null;
  itens: PropostaItemRow[];
  operadora: OperadoraRow | null;
}): string {
  const { proposta, empresa, contato, representante, itens, operadora } = data;
  const dataEmissao = new Date(proposta.created_at || Date.now()).toLocaleDateString("pt-BR");
  const dataValidade = new Date(Date.now() + (proposta.validade_dias || 15) * 24 * 60 * 60 * 1000).toLocaleDateString("pt-BR");

  const formattedValorTotal = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(proposta.valor_total || 0);
  const formattedDesconto = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(proposta.desconto || 0);
  const formattedValorFinal = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(proposta.valor_final || 0);

  const itensHtml = (itens || []).map((item, idx) => `
    <tr style="border-bottom: 1px solid #334155;">
      <td style="padding: 12px; color: #cbd5e1;">${idx + 1}</td>
      <td style="padding: 12px; color: #ffffff; font-weight: 600;">${item.catalogo_servicos?.nome || 'Inserção Mídia Digital Signage HD'}</td>
      <td style="padding: 12px; color: #cbd5e1; text-align: center;">${item.quantidade}</td>
      <td style="padding: 12px; color: #cbd5e1; text-align: right;">${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.valor_unitario)}</td>
      <td style="padding: 12px; color: #10b981; font-weight: 700; text-align: right;">${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.valor_total)}</td>
    </tr>
  `).join("");

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Proposta Comercial - ${proposta.numero_proposta}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #090d16; color: #f8fafc; margin: 0; padding: 40px; }
    .container { max-width: 800px; margin: 0 auto; background: #0f172a; border-radius: 16px; padding: 40px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0284c7; padding-bottom: 20px; margin-bottom: 30px; }
    .brand { font-size: 26px; font-weight: 900; color: #0284c7; letter-spacing: -0.5px; }
    .brand span { color: #ffffff; }
    .prop-badge { background: rgba(2,132,199,0.15); color: #38bdf8; border: 1px solid rgba(2,132,199,0.3); padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: bold; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
    .box { background: rgba(15,23,42,0.8); padding: 20px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); }
    .box h4 { margin: 0 0 10px 0; font-size: 12px; color: #38bdf8; text-transform: uppercase; letter-spacing: 1px; }
    .box p { margin: 4px 0; font-size: 13px; color: #cbd5e1; }
    .box p strong { color: #ffffff; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th { background: #1e293b; color: #94a3b8; font-size: 11px; text-transform: uppercase; padding: 12px; text-align: left; }
    .totals { background: #1e293b; padding: 20px; border-radius: 12px; text-align: right; margin-bottom: 30px; }
    .totals div { font-size: 14px; margin-bottom: 6px; color: #94a3b8; }
    .totals .final { font-size: 22px; font-weight: bold; color: #10b981; margin-top: 8px; }
    .footer { text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">SOBRE <span>MÍDIA</span></div>
      <div class="prop-badge">PROPOSTA ${proposta.numero_proposta} (v${proposta.versao_atual || 1})</div>
    </div>

    <div class="grid">
      <div class="box">
        <h4>Cliente & Empresa</h4>
        <p><strong>${empresa?.nome_fantasia || 'Cliente Comercial'}</strong></p>
        <p>Razão Social: ${empresa?.razao_social || 'N/A'}</p>
        <p>CNPJ: ${empresa?.cnpj || 'N/A'}</p>
        <p>Cidade: ${empresa?.cidade || ''}/${empresa?.estado || ''}</p>
        <p>Contato: ${contato?.nome || empresa?.representante_legal || 'N/A'} (${empresa?.whatsapp || empresa?.email})</p>
      </div>

      <div class="box">
        <h4>Detalhes da Emissão</h4>
        <p>Data de Emissão: <strong>${dataEmissao}</strong></p>
        <p>Validade da Proposta: <strong>${dataValidade} (${proposta.validade_dias || 15} dias)</strong></p>
        <p>Forma de Pagamento: <strong>${proposta.forma_pagamento}</strong></p>
        <p>Representante Responsável: <strong>${representante?.usuario?.nome || 'Equipe Comercial'}</strong></p>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Serviço / Mídia</th>
          <th style="text-align: center;">Qtd Telas</th>
          <th style="text-align: right;">Valor Unit.</th>
          <th style="text-align: right;">Valor Total</th>
        </tr>
      </thead>
      <tbody>
        ${itensHtml || `<tr><td colspan="5" style="padding:12px; text-align:center; color:#94a3b8;">Inserção de Mídia Corporativa Digital Signage HD</td></tr>`}
      </tbody>
    </table>

    <div class="totals">
      <div>Subtotal: <strong>${formattedValorTotal}</strong></div>
      ${proposta.desconto > 0 ? `<div>Desconto Aplicado: <strong style="color:#f43f5e;">-${formattedDesconto}</strong></div>` : ''}
      <div class="final">Valor Mensal Final: ${formattedValorFinal}</div>
    </div>

    <div class="box" style="margin-bottom: 30px;">
      <h4>Observações & Termos Comerciais</h4>
      <p style="white-space: pre-wrap;">${proposta.observacoes || 'Proposta comercial válida mediante confirmação e assinatura de contrato de prestação de serviços de mídia.'}</p>
    </div>

    <div class="footer">
      SOBRE MÍDIA DIGITAL SIGNAGE PLATFORM — ${operadora?.razao_social || 'SOBRE MÍDIA MÍDIAS DIGITAIS LTDA'}<br>
      Documento gerado em ${new Date().toISOString()} • Versão v${proposta.versao_atual || 1}
    </div>
  </div>
</body>
</html>
  `;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // [SECURITY HARDENING] JWT obrigatório — escopo de leitura validado com
    // o token do usuário (RLS aplica). Sem token → 401; sem acesso → 403.
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Autenticacao obrigatoria." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const userSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } }
    );
    const { data: authData, error: authError } = await userSupabase.auth.getUser(jwt);
    if (authError || !authData?.user?.id) {
      return new Response(JSON.stringify({ error: "Token invalido." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { propostaId, isPreview = false, sendEmail = false }: GenerateProposalRequest = await req.json();

    if (!propostaId) {
      return new Response(JSON.stringify({ error: "propostaId é obrigatório." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // [SECURITY] Ownership check via RLS do usuário (anti-IDOR)
    const { data: ownedCheck } = await userSupabase
      .from('propostas')
      .select('id')
      .eq('id', propostaId)
      .maybeSingle();
    if (!ownedCheck) {
      return new Response(JSON.stringify({ error: "Proposta não encontrada ou sem permissão." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 1. Busca proposta e dados relacionados no PostgreSQL
    const { data: proposta, error: propError } = await supabase
      .from('propostas')
      .select(`
        *,
        cliente:clientes(*),
        representante:representantes(*, usuario:usuarios(nome, email)),
        operadora:empresa_operadora(*)
      `)
      .eq('id', propostaId)
      .single();

    if (propError || !proposta) {
      return new Response(JSON.stringify({ error: "Proposta não encontrada." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 2. Busca empresa e contatos do cliente
    const { data: empresa } = await supabase
      .from('empresas')
      .select('*, contatos(*)')
      .eq('cliente_id', proposta.cliente_id)
      .maybeSingle();

    const { data: itens } = await supabase
      .from('itens_proposta')
      .select('*, catalogo_servicos(*)')
      .eq('proposta_id', propostaId);

    const contatoPrincipal = empresa?.contatos?.[0] || null;

    // 3. Renderiza o HTML oficial da Proposta
    const htmlContent = renderProposalHTML({
      proposta,
      cliente: proposta.cliente,
      empresa,
      contato: contatoPrincipal,
      representante: proposta.representante,
      itens: itens || [],
      operadora: proposta.operadora,
    });

    // 4. Define Object Key Privada no Cloudflare R2
    const versao = proposta.versao_atual || 1;
    const objectKey = `tenants/${proposta.empresa_operadora_id}/propostas/${proposta.id}/v${versao}/proposta_${proposta.numero_proposta}.html`;

    // 5. Grava snapshot imutável em public.proposta_versoes
    await supabase.from('proposta_versoes').insert({
      proposta_id: proposta.id,
      numero_versao: versao,
      snapshot_dados: {
        proposta,
        empresa,
        contato: contatoPrincipal,
        itens: itens || [],
        html_rendered: htmlContent,
      },
      pdf_url: objectKey,
    });

    // 6. Atualiza public.propostas.pdf_url com a chave de referência R2
    await supabase
      .from('propostas')
      .update({
        pdf_url: objectKey,
        status: isPreview ? proposta.status : (sendEmail ? 'SENT' : proposta.status),
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposta.id);

    // 7. Se solicitado envio e Resend API Key configurado, envia e-mail com link assinado
    let emailSent = false;
    if (sendEmail && RESEND_API_KEY && empresa?.email) {
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "Sobre Mídia <comercial@sobremidia.com.br>",
          to: [empresa.email],
          subject: `Proposta Comercial ${proposta.numero_proposta} - Sobre Mídia`,
          html: `
            <div style="font-family: Arial, sans-serif; background: #0f172a; color: #fff; padding: 30px; border-radius: 12px;">
              <h2 style="color: #0284c7;">Proposta Comercial ${proposta.numero_proposta}</h2>
              <p>Olá <strong>${empresa.nome_fantasia}</strong>,</p>
              <p>Sua proposta comercial no valor mensal de <strong>${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(proposta.valor_final)}</strong> está pronta!</p>
              <p>Clique no botão abaixo para visualizar o documento oficial completo:</p>
              <a href="${Deno.env.get("PUBLIC_APP_URL") || "https://plataforma.sobremidia.com.br"}/representantes/clientes" style="display: inline-block; padding: 12px 24px; background: #0284c7; color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 15px;">Visualizar Proposta</a>
            </div>
          `,
        }),
      });
      emailSent = emailRes.ok;
    }

    return new Response(JSON.stringify({
      success: true,
      propostaId: proposta.id,
      numeroProposta: proposta.numero_proposta,
      versao: versao,
      objectKey: objectKey,
      htmlContent: htmlContent,
      emailSent: emailSent,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: unknown) {
    console.error("[generate-proposal-pdf] Erro:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message || "Erro interno ao gerar PDF." : "Erro interno ao gerar PDF." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
