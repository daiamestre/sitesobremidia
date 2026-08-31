import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MESES_TITULO = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function slugify(text: string): string {
  return String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-+/g,'-').replace(/^-+|-+$/g,'') || 'estabelecimento';
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const path = url.searchParams.get("path") || url.pathname || "";
    // Extract codigo as last segment
    // path like /cobranca/hotel-maxsuel/fatura-julho/COB-5JH7SWAF or /cobranca/COB-5JH7SWAF/COB-5JH7SWAF
    const segments = path.split("/").filter(Boolean);
    let codigo = "";
    if (segments.length > 0) {
      codigo = segments[segments.length - 1];
      // decode
      try { codigo = decodeURIComponent(codigo); } catch {}
    }
    // also support ?codigo= query
    if (!codigo || codigo === "public-billing-og") {
      codigo = url.searchParams.get("codigo") || url.searchParams.get("public_identifier") || "";
    }
    if (!codigo) {
      return new Response(JSON.stringify({ error: "codigo ausente" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRole) {
      return new Response(JSON.stringify({ error: "config ausente" }), { status: 500, headers: corsHeaders });
    }
    const sb = createClient(supabaseUrl, serviceRole);

    // RPC publica
    const { data, error } = await sb.rpc("rpc_get_public_billing", { p_codigo: codigo, p_identifier: codigo });
    if (error || !data) {
      // Return SPA fallback with 404 OG but still HTML
      const html404 = `<!doctype html><html><head><title>Cobrança não encontrada — Sobre Mídia</title><meta property="og:title" content="Cobrança não encontrada"><meta property="og:description" content="Verifique o link da cobrança."></head><body>404</body></html>`;
      return new Response(html404, { status: 404, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
    }

    const establishment = (data as any).establishment_name || (data as any).cliente_nome || "Cliente";
    const invoiceMonth = (data as any).invoice_month;
    let faturaTitle = "Fatura Mensal";
    if (invoiceMonth && invoiceMonth >=1 && invoiceMonth <=12) {
      faturaTitle = `Fatura ${MESES_TITULO[invoiceMonth-1]}`;
    } else if ((data as any).competencia || (data as any).vencimento) {
      const ref = (data as any).competencia || (data as any).vencimento;
      try {
        const parts = String(ref).split("-");
        if (parts.length >=2) {
          const m = parseInt(parts[1],10);
          if (m>=1&&m<=12) faturaTitle = `Fatura ${MESES_TITULO[m-1]}`;
        }
      } catch {}
    }
    const serviceName = (data as any).service_name || (data as any).servico_faturado || "Aluguel de Software de Mídia";
    const issuer = (data as any).issuer_name || "Sobre Mídia Designer Ltda";
    const codigoOp = (data as any).codigo_operacional || codigo;
    const estabSlug = (data as any).establishment_slug || slugify(establishment);
    const invoiceSlug = invoiceMonth ? `fatura-${String(MESES_TITULO[invoiceMonth-1]).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}` : "fatura-mensal";
    const canonicalPath = `/cobranca/${estabSlug}/${invoiceSlug}/${encodeURIComponent(codigoOp)}`;
    const origin = "https://sitesobremidia.vercel.app";
    const canonicalUrl = origin + canonicalPath;
    const ogTitle = `${establishment.toUpperCase()} — ${faturaTitle}`;
    const ogDesc = `${serviceName} — Cobrança ${codigoOp} emitida por ${issuer}. Acesse e pague com PIX ou Boleto.`;

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${ogTitle} | ${issuer}</title>
<meta name="description" content="${ogDesc}">
<meta property="og:title" content="${ogTitle}">
<meta property="og:description" content="${ogDesc}">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${issuer}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${ogTitle}">
<meta name="twitter:description" content="${ogDesc}">
<link rel="canonical" href="${canonicalUrl}">
<meta http-equiv="refresh" content="0; url=${canonicalUrl}">
</head>
<body>
<p>Redirecionando para <a href="${canonicalUrl}">${canonicalUrl}</a></p>
</body>
</html>`;

    // If request is from bot/crawler, return HTML with OG. For browser, we could also return same HTML with refresh, but we want SPA to handle normal navigation.
    // The caller (Vercel or direct) will get this HTML; bots will read OG, browsers will follow refresh or be handled by Vercel rewrite.
    // Add cache headers for OG
    return new Response(html, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
