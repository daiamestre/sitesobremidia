export default async function handler(req, res) {
  const MESES_TITULO = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  function slugify(t){ return String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-+/g,'-').replace(/^-+|-+$/g,'')||'estabelecimento'; }
  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    let path = url.searchParams.get('path') || url.pathname || '';
    // When called via rewrite, path param contains the original path
    if (url.searchParams.has('path')) {
      path = url.searchParams.get('path');
    } else {
      // For direct /api/cobranca-og? Try to get from header x-vercel-rewrite?
      path = req.headers['x-vercel-path'] || path;
    }
    // Extract codigo as last segment after /cobranca/
    let codigo = '';
    if (path) {
      const segs = path.split('/').filter(Boolean);
      // segs like ['cobranca','hotel-maxsuel','fatura-julho','COB-5JH7SWAF']
      // or ['api','cobranca-og']
      // find last segment that starts with COB- or REC- etc
      if (segs.length) {
        // Check query param first
        codigo = url.searchParams.get('codigo') || url.searchParams.get('public_identifier') || '';
        if (!codigo) {
          // last segment is codigo if path contains cobranca
          const idx = segs.indexOf('cobranca');
          if (idx !== -1 && segs.length > idx+1) {
            codigo = segs[segs.length-1];
          } else if (segs[0]==='cobranca') {
            codigo = segs[segs.length-1];
          }
        }
        try { codigo = decodeURIComponent(codigo); } catch {}
      }
    }
    // Fallback: try to get codigo from URL directly if handler is called as /cobranca/... via rewrite destination with query
    if (!codigo) {
      codigo = url.searchParams.get('codigo') || '';
    }
    if (!codigo || codigo==='cobranca-og' || codigo==='og') {
      res.status(400).json({ error: 'codigo ausente', path });
      return;
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://bhwsybgsyvvhqtkdqozb.supabase.co';
    const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJod3N5YmdzeXZ2aHF0a2Rxb3piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNjk5NjgsImV4cCI6MjA4Mzk0NTk2OH0.ejbdSX6xeSC4Cg8unLFSUbN5BOW7dJw2CRcFJACcWfI';

    const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/rpc_get_public_billing`, {
      method: 'POST',
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_codigo: codigo, p_identifier: codigo }),
    });
    if (!rpcRes.ok) {
      const txt = await rpcRes.text();
      res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(`<!doctype html><html><head><title>Cobrança não encontrada</title><meta property="og:title" content="Cobrança não encontrada"><meta property="og:description" content="Verifique o link"></head><body>404 ${txt}</body></html>`);
      return;
    }
    const data = await rpcRes.json();

    const establishment = data.establishment_name || data.cliente_nome || 'Cliente';
    const invoiceMonth = data.invoice_month;
    let faturaTitle = 'Fatura Mensal';
    if (invoiceMonth && invoiceMonth>=1 && invoiceMonth<=12) {
      faturaTitle = `Fatura ${MESES_TITULO[invoiceMonth-1]}`;
    } else if (data.competencia || data.vencimento) {
      const ref = data.competencia || data.vencimento;
      try { const p = String(ref).split('-'); if(p.length>=2){ const m=parseInt(p[1],10); if(m>=1&&m<=12) faturaTitle=`Fatura ${MESES_TITULO[m-1]}`; } } catch {}
    }
    const serviceName = data.service_name || data.servico_faturado || 'Aluguel de Software de Mídia';
    const issuer = data.issuer_name || 'Sobre Mídia Designer Ltda';
    const codigoOp = data.codigo_operacional || codigo;
    const estabSlug = data.establishment_slug || slugify(establishment);
    const invoiceSlug = invoiceMonth ? `fatura-${MESES_TITULO[invoiceMonth-1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}` : 'fatura-mensal';
    const canonicalPath = `/cobranca/${estabSlug}/${invoiceSlug}/${encodeURIComponent(codigoOp)}`;
    const origin = 'https://sitesobremidia.vercel.app';
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
</head>
<body>
<p>Redirecionando para <a href="${canonicalUrl}">${canonicalUrl}</a></p>
<script>window.location.href="${canonicalPath}";</script>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    res.status(200).send(html);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
