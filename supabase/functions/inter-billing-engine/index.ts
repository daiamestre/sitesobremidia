import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// BANCO INTER — FASE 3 PRODUÇÃO — ENDPOINTS DINÂMICOS FAIL-CLOSED
// Regra Suprema §1, §5, §6: Coexistência de Produção e Sandbox com Roteamento Seguro
const isProd = () => Deno.env.get('INTER_ENVIRONMENT') === 'PRODUCTION';
const getInterOAuthUrl = () => isProd() ? 'https://cdpj.partners.bancointer.com.br/oauth/v2/token' : 'https://cdpj-sandbox.partners.uatinter.co/oauth/v2/token';
const getInterCobrancaUrl = () => isProd() ? 'https://cdpj.partners.bancointer.com.br/cobranca/v3/cobrancas' : 'https://cdpj-sandbox.partners.uatinter.co/cobranca/v3/cobrancas';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-token, x-inter-webhook-token',
};

function sanitizeError(msg: string): string {
  // Nunca revelar secrets/cert/key/token bruto nos logs externos sanitizados (§15, §18)
  return msg.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT_REDACTED]')
            .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, '[CERT_REDACTED]')
            .slice(0, 800);
}

function normalizeCert(raw: string): string {
  // Supabase secrets podem armazenar PEM com \n escapado ou quebras reais
  if (!raw) return raw;
  // Se contém literal \n mas poucas quebras reais, converter
  if (raw.includes('\\n') && !raw.includes('\n-----')) {
    return raw.replace(/\\n/g, '\n');
  }
  return raw;
}

async function getInterClient() {
  const envType = Deno.env.get('INTER_ENVIRONMENT');
  // Roteamento Fail-closed — §6
  if (envType !== 'SANDBOX' && envType !== 'PRODUCTION') throw new Error(`Operação bloqueada. Ambiente=${envType || 'undefined'} inválido.`);
  const prod = envType === 'PRODUCTION';
  const certRaw = prod ? Deno.env.get('INTER_CERT_PROD') : Deno.env.get('INTER_CERTIFICATE');
  const keyRaw = prod ? Deno.env.get('INTER_KEY_PROD') : Deno.env.get('INTER_PRIVATE_KEY');
  if (!certRaw || !keyRaw) throw new Error("Certificados ausentes para o ambiente " + envType);
  const cert = normalizeCert(certRaw);
  const key = normalizeCert(keyRaw);
  // Validação mínima PEM §6, §15
  if (!cert.includes('BEGIN CERTIFICATE') || !key.includes('BEGIN')) {
    throw new Error("Formato de certificado inválido (PEM esperado).");
  }
  return Deno.createHttpClient({ cert, key });
}

// Cache OAuth token em memória por instância (evita 429 em rajada) — §14
let oauthCache: { token: string; expiresAt: number } | null = null;
async function getOAuthToken(httpClient: any) {
  const now = Date.now();
  if (oauthCache && oauthCache.expiresAt > now + 10000) {
    return oauthCache.token;
  }
  const prod = Deno.env.get('INTER_ENVIRONMENT') === 'PRODUCTION';
  const clientId = prod ? Deno.env.get('INTER_CLIENT_ID_PROD') : Deno.env.get('INTER_CLIENT_ID');
  const clientSecret = prod ? Deno.env.get('INTER_CLIENT_SECRET_PROD') : Deno.env.get('INTER_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error("INTER_CLIENT_ID / INTER_CLIENT_SECRET ausentes para o ambiente ativo.");
  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('grant_type', 'client_credentials');
  params.append('scope', 'boleto-cobranca.read boleto-cobranca.write');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(getInterOAuthUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      client: httpClient,
      signal: controller.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      // 429 rate-limit: propagar com código específico para backoff no caller
      if (res.status === 429) throw new Error(`OAuth Error: HTTP 429 Too Many Requests - ${sanitizeError(txt)}`);
      throw new Error(`OAuth Error: HTTP ${res.status} - ${sanitizeError(txt)}`);
    }
    const data = await res.json();
    if (!data.access_token) throw new Error("OAuth sem access_token");
    // Inter devolve expires_in (geralmente 3600) — cachear 90% do tempo
    const expiresIn = Number(data.expires_in || 3600);
    oauthCache = { token: data.access_token as string, expiresAt: now + Math.max(30, expiresIn - 60) * 1000 };
    return data.access_token as string;
  } catch (e: any) {
    if (e.name === 'AbortError') throw new Error("Timeout OAuth (15s) — Inter não respondeu");
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => ({ action: 'ping' }));
    const { action, cobranca_id } = body;
    // Rejeitar empresa_operadora_id arbitrário do frontend (§4.5) — ignorar se enviado
    // Não utilizar body.empresa_operadora_id em nenhuma query

    const envType = Deno.env.get('INTER_ENVIRONMENT');
    if (envType !== 'SANDBOX' && envType !== 'PRODUCTION') {
      return new Response(JSON.stringify({ error: `Bloqueado: Ambiente atual inválido (${envType}). Use SANDBOX ou PRODUCTION.` }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === 'test_preflight') {
      let httpClient: any = null;
      let clientError: string | null = null;
      try { httpClient = await getInterClient(); } catch (e: any) { clientError = sanitizeError(e.message); }
      let testC = "FAIL";
      let fetchStatus: number | null = null;
      let oauthError: string | null = null;
      if (httpClient) {
        try {
          await getOAuthToken(httpClient);
          testC = "PASS";
          fetchStatus = 200;
        } catch (e: any) {
          testC = "FAIL";
          oauthError = sanitizeError(e.message);
        }
      }
      return new Response(JSON.stringify({
        denoVersion: (Deno as any).version?.deno,
        testA: "PASS", testB: "PASS", testC, fetchStatus,
        clientError, oauthError,
        environment: envType,
        sandbox_oauth: getInterOAuthUrl(),
        sandbox_cobranca: getInterCobrancaUrl(),
        message: "Preflight finalizado — " + envType
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // WEBHOOK — §11 (A controlado + B real) — não exige JWT
    // Compatível com T13 action=webhook e callback real sem action (payload direto ou array)
    const isRealWebhookObj = (o: any): boolean => {
      if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
      const hasCodigo = !!(o.codigoSolicitacao || o.codigo_solicitacao);
      const hasSituacao = !!(o.situacao || o.status);
      const hasData = !!(o.dataHoraSituacao || o.data_hora_situacao || o.datahora);
      return hasCodigo && hasSituacao && hasData;
    };
    const isMaybeWebhookObj = (o: any): boolean => {
      if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
      return !!(o.codigoSolicitacao || o.codigo_solicitacao || o.situacao || o.status || o.dataHoraSituacao || o.data_hora_situacao || o.datahora);
    };
    const isWebhookArrayPayload = Array.isArray(body) && (body as any[]).length > 0;
    const shouldHandleWebhook = action === 'webhook' || isWebhookArrayPayload || isMaybeWebhookObj(body) || (!action && body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body as object).length === 0);
    if (shouldHandleWebhook) {
      try {
        let events: any[] = [];
        if (action === 'webhook') {
          const raw = (body as any).webhook_payload || (body as any).payload || (body as any).data || body;
          if (Array.isArray(raw)) {
            events = raw as any[];
          } else if (raw && typeof raw === 'object') {
            const flatCandidate: any = raw;
            if (flatCandidate.codigoSolicitacao || flatCandidate.codigo_solicitacao || flatCandidate.situacao || flatCandidate.status) {
              events = [flatCandidate];
            } else {
              const combined: any = { ...flatCandidate };
              if ((body as any).codigoSolicitacao) combined.codigoSolicitacao = (body as any).codigoSolicitacao;
              if ((body as any).codigo_solicitacao) combined.codigo_solicitacao = (body as any).codigo_solicitacao;
              if ((body as any).situacao) combined.situacao = (body as any).situacao;
              if ((body as any).status) combined.status = (body as any).status;
              if ((body as any).dataHoraSituacao) combined.dataHoraSituacao = (body as any).dataHoraSituacao;
              if ((body as any).data_hora_situacao) combined.data_hora_situacao = (body as any).data_hora_situacao;
              events = [combined];
            }
          } else {
            events = [raw];
          }
        } else if (Array.isArray(body)) {
          events = body as any[];
        } else if (isRealWebhookObj(body) || isMaybeWebhookObj(body)) {
          events = [body];
        } else {
          events = [body];
        }
        if (events.length === 0) {
          return new Response(JSON.stringify({ error: 'Webhook payload inválido: requer codigoSolicitacao, situacao e dataHoraSituacao' }), { status: 400, headers: corsHeaders });
        }
        const expectedToken = Deno.env.get('INTER_WEBHOOK_TOKEN');
        if (expectedToken) {
          const provided = req.headers.get('x-webhook-token') || req.headers.get('x-inter-webhook-token') || '';
          if (provided !== expectedToken) {
            return new Response(JSON.stringify({ error: 'Webhook não autorizado' }), { status: 401, headers: corsHeaders });
          }
        }
        const supabaseUrlSrv = Deno.env.get('SUPABASE_URL') || '';
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        if (!serviceRoleKey) {
          return new Response(JSON.stringify({ error: 'Webhook não configurado: SERVICE_ROLE ausente' }), { status: 500, headers: corsHeaders });
        }
        const srv = createClient(supabaseUrlSrv, serviceRoleKey);
        let lastResult: any = null;
        let processedCount = 0;
        let deduplicatedCount = 0;
        for (const evt of events) {
          const flat: any = evt && typeof evt === 'object' ? evt : {};
          const codigo_solicitacao = flat.codigoSolicitacao || flat.codigo_solicitacao || null;
          const situacao = flat.situacao || flat.status || null;
          const dataHoraSituacaoRaw = flat.dataHoraSituacao || flat.data_hora_situacao || flat.datahora || null;
          if (!codigo_solicitacao || !situacao || !dataHoraSituacaoRaw) {
            return new Response(JSON.stringify({ error: 'Webhook payload inválido: requer codigoSolicitacao, situacao e dataHoraSituacao' }), { status: 400, headers: corsHeaders });
          }
          const normalizedCodigo = String(codigo_solicitacao).trim();
          const normalizedSituacao = String(situacao).trim().toUpperCase();
          const parsedDate = new Date(dataHoraSituacaoRaw);
          if (isNaN(parsedDate.getTime())) {
            return new Response(JSON.stringify({ error: 'Webhook payload inválido: dataHoraSituacao inválida' }), { status: 400, headers: corsHeaders });
          }
          const nosso_numero = flat.nossoNumero || flat.nosso_numero || null;
          const txid = flat.txid || flat.pixTxid || null;
          const valor_total_recebido = flat.valorTotalRecebido ?? flat.valor_total_recebido ?? null;
          const { data: inserted, error: insertError } = await srv.from('inter_webhook_events').insert({
            codigo_solicitacao: normalizedCodigo,
            nosso_numero: nosso_numero ? String(nosso_numero) : null,
            txid: txid ? String(txid) : null,
            situacao: normalizedSituacao,
            data_hora_situacao: parsedDate.toISOString(),
            valor_total_recebido: valor_total_recebido,
            payload: flat,
            processed: false,
          }).select().maybeSingle();
          if (insertError) {
            if ((insertError as any).code === '23505' || String((insertError as any).message).includes('duplicate key') || String((insertError as any).message).includes('uk_inter_webhook_dedup')) {
              deduplicatedCount++;
              lastResult = { success: true, deduplicated: true, message: 'Evento já processado (idempotente)' };
              continue;
            }
            return new Response(JSON.stringify({ error: 'Falha ao persistir webhook', details: sanitizeError(insertError.message) }), { status: 500, headers: corsHeaders });
          }
          const { data: target } = await srv.from('contas_receber').select('id, inter_status').eq('inter_codigo_solicitacao', normalizedCodigo).maybeSingle();
          if (target) {
            await srv.from('contas_receber').update({ inter_status: normalizedSituacao }).eq('id', target.id);
            await srv.from('inter_webhook_events').update({ processed: true }).eq('id', inserted.id);
            processedCount++;
            lastResult = { success: true, deduplicated: false, processed: true };
          } else {
            lastResult = { success: true, deduplicated: false, processed: false };
          }
        }
        if (events.length > 1) {
          return new Response(JSON.stringify({ success: true, total: events.length, processedCount, deduplicatedCount, last: lastResult }), { headers: corsHeaders });
        }
        return new Response(JSON.stringify(lastResult), { headers: corsHeaders });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: 'Erro webhook', details: sanitizeError(e.message) }), { status: 500, headers: corsHeaders });
      }
    }

    // === Ações públicas seguras — §6.4.1 ===
    if (action === 'public_consult' || action === 'public_pdf') {
      const pCodigo = body.codigo_operacional;
      const pId = body.public_identifier;
      if (!pCodigo || !pId) {
        return new Response(JSON.stringify({ error: 'Credenciais públicas inválidas', code: 'INVALID_PUBLIC_CREDENTIALS' }), { status: 400, headers: corsHeaders });
      }

      const supabaseUrlSrv = Deno.env.get('SUPABASE_URL') || '';
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      const srv = createClient(supabaseUrlSrv, serviceRoleKey);

      const { data: cb } = await srv.from('contas_receber')
        .select('inter_codigo_solicitacao, codigo_operacional, metodos_gateway')
        .eq('public_identifier', pId)
        .maybeSingle();

      if (!cb || cb.codigo_operacional !== pCodigo || !cb.inter_codigo_solicitacao) {
        return new Response(JSON.stringify({ error: 'Cobrança não encontrada ou inválida', code: 'NOT_FOUND_OR_UNAUTHORIZED' }), { status: 404, headers: corsHeaders });
      }

      let httpClient: any;
      try {
        httpClient = await getInterClient();
        await getOAuthToken(httpClient);
      } catch (e: any) {
        return new Response(JSON.stringify({ error: 'Erro de gateway financeiro' }), { status: 502, headers: corsHeaders });
      }

      const endpoint = action === 'public_pdf' 
        ? getInterCobrancaUrl() + `/${cb.inter_codigo_solicitacao}/pdf`
        : getInterCobrancaUrl() + `/${cb.inter_codigo_solicitacao}`;

      const reqInter = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${oauthCache?.token}` },
        client: httpClient
      });

      const dataStr = await reqInter.text();
      if (!reqInter.ok) return new Response(JSON.stringify({ error: 'Erro ao consultar banco' }), { status: 502, headers: corsHeaders });
      
      let parsed;
      try { parsed = JSON.parse(dataStr); } catch (e) { parsed = {}; }
      
      if (action === 'public_pdf') {
        return new Response(JSON.stringify({ success: true, pdf: parsed.pdf }), { headers: corsHeaders });
      }

      const permitidos = cb.metodos_gateway || ['PIX', 'BOLETO'];
      const allowPix = permitidos.includes('PIX');
      const allowBoleto = permitidos.includes('BOLETO');

      if (action === 'public_pdf' && !allowBoleto) {
        return new Response(JSON.stringify({ error: 'Método Boleto não autorizado' }), { status: 403, headers: corsHeaders });
      }

      const safeData = {
        success: true,
        data: {
          cobranca: {
            valorNominal: parsed.cobranca?.valorNominal,
            dataVencimento: parsed.cobranca?.dataVencimento,
            situacao: parsed.cobranca?.situacao,
          },
          boleto: (parsed.boleto && allowBoleto) ? {
            linhaDigitavel: parsed.boleto.linhaDigitavel,
            codigoBarras: parsed.boleto.codigoBarras,
          } : undefined,
          pix: ((parsed.pix || parsed.cobranca?.pix) && allowPix) ? {
            pixCopiaECola: parsed.pix?.pixCopiaECola || parsed.cobranca?.pix?.pixCopiaECola,
            txid: parsed.pix?.txid || parsed.cobranca?.pix?.txid
          } : undefined
        }
      };

      return new Response(JSON.stringify(safeData), { headers: corsHeaders });
    }

    // === Ações autenticadas — §4, §8, §9, §10 ===
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization Bearer', code: 'JWT_MISSING' }), { status: 401, headers: corsHeaders });
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized JWT', code: 'JWT_INVALID', details: sanitizeError(userError?.message || 'no user') }), { status: 401, headers: corsHeaders });
    }
    if (action === 'webhook_get' || action === 'webhook_status') {
      try {
        const httpClient = await getInterClient();
        const oauthToken = await getOAuthToken(httpClient);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        let reqInter: Response;
        try {
          reqInter = await fetch(`${getInterCobrancaUrl()}/webhook`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${oauthToken}` },
            client: httpClient,
            signal: controller.signal,
          });
        } finally { clearTimeout(timeout); }
        const txt = await reqInter.text().catch(() => '');
        let data: any = null;
        try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
        if (!reqInter.ok) {
          return new Response(JSON.stringify({ error: 'Falha ao consultar webhook', code: 'WEBHOOK_GET_FAIL', status: reqInter.status, details: sanitizeError(txt) }), { status: reqInter.status, headers: corsHeaders });
        }
        return new Response(JSON.stringify({ success: true, status: reqInter.status, webhook: data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e: any) {
        const msg = sanitizeError(e.message || '');
        if (e.name === 'AbortError' || msg.includes('Timeout')) return new Response(JSON.stringify({ error: 'Timeout webhook_get', code: 'TIMEOUT', details: msg }), { status: 504, headers: corsHeaders });
        return new Response(JSON.stringify({ error: msg, code: 'INTERNAL' }), { status: 500, headers: corsHeaders });
      }
    }

    if (action === 'webhook_put' || action === 'webhook_register') {
      const webhookUrl = (body as any).webhookUrl || (body as any).webhook_url || (body as any).url;
      if (!webhookUrl || typeof webhookUrl !== 'string') {
        return new Response(JSON.stringify({ error: 'webhookUrl obrigatório', code: 'BAD_REQUEST' }), { status: 400, headers: corsHeaders });
      }
      try {
        const httpClient = await getInterClient();
        const oauthToken = await getOAuthToken(httpClient);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        let reqInter: Response;
        try {
          reqInter = await fetch(`${getInterCobrancaUrl()}/webhook`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${oauthToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ webhookUrl }),
            client: httpClient,
            signal: controller.signal,
          });
        } finally { clearTimeout(timeout); }
        const txt = await reqInter.text().catch(() => '');
        let data: any = null;
        try { data = JSON.parse(txt); } catch { data = txt ? { raw: txt } : null; }
        if (!reqInter.ok && reqInter.status !== 204) {
          return new Response(JSON.stringify({ error: 'Falha ao registrar webhook', code: 'WEBHOOK_PUT_FAIL', status: reqInter.status, details: sanitizeError(txt) }), { status: reqInter.status, headers: corsHeaders });
        }
        return new Response(JSON.stringify({ success: true, status: reqInter.status, webhookUrl, data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e: any) {
        const msg = sanitizeError(e.message || '');
        if (e.name === 'AbortError' || msg.includes('Timeout')) return new Response(JSON.stringify({ error: 'Timeout webhook_put', code: 'TIMEOUT', details: msg }), { status: 504, headers: corsHeaders });
        return new Response(JSON.stringify({ error: msg, code: 'INTERNAL' }), { status: 500, headers: corsHeaders });
      }
    }

    if (!cobranca_id) {
      return new Response(JSON.stringify({ error: 'cobranca_id obrigatório', code: 'BAD_REQUEST' }), { status: 400, headers: corsHeaders });
    }
    // Validar cobranca_id formato UUID para evitar injection/log
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(cobranca_id)) {
      return new Response(JSON.stringify({ error: 'cobranca_id inválido' }), { status: 400, headers: corsHeaders });
    }

    if (action === 'issue') {
      // §4.9 LOCK ATÔMICO — não é SELECT→verificar→UPDATE separado; é UPDATE condicional atômico (§5)
      const { data: lockedCobranca, error: lockError } = await supabase
        .from('contas_receber')
        .update({
          inter_status: 'PROCESSING',
          inter_lock_timestamp: new Date().toISOString(),
        })
        .eq('id', cobranca_id)
        .or('inter_status.is.null,inter_status.eq.FAILED,inter_status.eq.DRAFT')
        .select()
        .maybeSingle();

      if (lockError || !lockedCobranca) {
        const { data: exist } = await supabase.from('contas_receber').select('inter_status').eq('id', cobranca_id).maybeSingle();
        if (!exist) return new Response(JSON.stringify({ error: 'Cobrança inexistente ou tenant negado (RLS)', code: 'TENANT_DENIED' }), { status: 403, headers: corsHeaders });
        return new Response(JSON.stringify({ error: 'Conflito. Operação já processada/em processamento.', code: 'CONFLICT', status: exist.inter_status }), { status: 409, headers: corsHeaders });
      }

      // Construir payload Inter com dados reais quando disponíveis (§4.6) — fallback Sandbox
      // Identificadores §13: seuNumero -> inter_seu_numero, codigoSolicitacao -> inter_codigo_solicitacao
      const seuNumero = (lockedCobranca.id as string).substring(0, 15);
      const valorRaw = (lockedCobranca as any).valor ?? (lockedCobranca as any).valor_original ?? 10.00;
      const valorNominal = Number(valorRaw);
      const vencRaw = (lockedCobranca as any).data_vencimento || (lockedCobranca as any).vencimento || (lockedCobranca as any).competencia_date;
      const dataVencimento = vencRaw ? new Date(vencRaw).toISOString().split('T')[0] : new Date(Date.now() + 86400000).toISOString().split('T')[0];

      let metodosConfig = lockedCobranca.metodos_gateway;
      if (typeof metodosConfig === 'string') {
        try { metodosConfig = JSON.parse(metodosConfig); } catch (e) { }
      }
      const permitidos = Array.isArray(metodosConfig) && metodosConfig.length > 0 ? metodosConfig : ['PIX', 'BOLETO'];

      const payloadInter = {
        seuNumero,
        valorNominal: isFinite(valorNominal) && valorNominal > 0 ? Number(valorNominal.toFixed(2)) : 10.00,
        dataVencimento,
        numDiasAgenda: 60,
        formasRecebimento: permitidos,
        pagador: {
          tipoPessoa: "FISICA",
          nome: "Teste Sandbox SobreMidia",
          endereco: "Rua Sandbox",
          numero: "123",
          bairro: "Bairro Sandbox",
          cidade: "Belo Horizonte",
          uf: "MG",
          cep: "30130000",
          email: "sandbox@bancointer.com.br",
          cpfCnpj: "85332361076",
        },
      };

      try {
        const httpClient = await getInterClient();
        const oauthToken = await getOAuthToken(httpClient);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        let reqInter: Response;
        try {
          reqInter = await fetch(getInterCobrancaUrl(), {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${oauthToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payloadInter),
            client: httpClient,
            signal: controller.signal,
          });
        } finally { clearTimeout(timeout); }

        if (!reqInter.ok) {
          const errTxt = await reqInter.text().catch(() => '');
          // Erro 4xx/5xx do Inter — destravar para FAILED apenas quando certeza de rejeição (§6, §15)
          await supabase.from('contas_receber').update({ inter_status: 'FAILED' }).eq('id', cobranca_id);
          const sanitized = sanitizeError(errTxt);
          if (reqInter.status >= 400 && reqInter.status < 500) {
            return new Response(JSON.stringify({ error: 'Erro API Inter (4xx)', code: 'INTER_4XX', details: sanitized }), { status: reqInter.status, headers: corsHeaders });
          }
          return new Response(JSON.stringify({ error: 'Erro API Inter (5xx)', code: 'INTER_5XX', details: sanitized }), { status: 502, headers: corsHeaders });
        }
        const interData = await reqInter.json();
        const codigoSolicitacao = interData.codigoSolicitacao || interData.codigo_solicitacao;
        if (!codigoSolicitacao) {
          await supabase.from('contas_receber').update({ inter_status: 'FAILED' }).eq('id', cobranca_id);
          return new Response(JSON.stringify({ error: 'Inter não retornou codigoSolicitacao', code: 'MISSING_CODIGO' }), { status: 502, headers: corsHeaders });
        }
        // Persistir codigoSolicitacao (§7) — identificador operacional remoto
        await supabase.from('contas_receber').update({
          inter_codigo_solicitacao: String(codigoSolicitacao),
          inter_seu_numero: seuNumero,
          inter_status: 'ISSUED',
        }).eq('id', cobranca_id);

        return new Response(JSON.stringify({ success: true, codigoSolicitacao: String(codigoSolicitacao) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (error: any) {
        const msg = sanitizeError(error.message || String(error));
        // TIMEOUT / TLS / rede: permanecer PROCESSING — sem retry cego, sem segunda emissão (§6)
        // Operação indeterminada — requer conciliação futura via codigoSolicitacao se já emitido, ou intervenção manual se antes dele
        if (error.name === 'AbortError' || msg.includes('Timeout') || msg.includes('timeout')) {
          return new Response(JSON.stringify({ error: 'Timeout ao emitir cobrança (estado indeterminado — sem retry automático)', code: 'TIMEOUT_INDETERMINATE', message: msg, state: 'PROCESSING' }), { status: 504, headers: corsHeaders });
        }
        if (msg.includes('TLS') || msg.includes('cert') || msg.includes('mTLS')) {
          return new Response(JSON.stringify({ error: 'Erro mTLS', code: 'MTLS_ERROR', message: msg, state: 'PROCESSING' }), { status: 502, headers: corsHeaders });
        }
        return new Response(JSON.stringify({ error: 'Erro de comunicação com Inter', code: 'NETWORK_ERROR', message: msg, state: 'PROCESSING' }), { status: 504, headers: corsHeaders });
      }
    }

    if (action === 'consult') {
      // §8 — obter codigoSolicitacao via registro autorizado pelo tenant (não confiar no frontend)
      const { data: cobranca } = await supabase.from('contas_receber').select('inter_codigo_solicitacao, inter_status').eq('id', cobranca_id).maybeSingle();
      if (!cobranca || !cobranca.inter_codigo_solicitacao) {
        return new Response(JSON.stringify({ error: 'Nenhum codigoSolicitacao associado a esta cobranca.', code: 'NO_CODIGO' }), { status: 400, headers: corsHeaders });
      }
      try {
        const httpClient = await getInterClient();
        const oauthToken = await getOAuthToken(httpClient);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        let reqInter: Response;
        try {
          reqInter = await fetch(`${getInterCobrancaUrl()}/${cobranca.inter_codigo_solicitacao}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${oauthToken}` },
            client: httpClient,
            signal: controller.signal,
          });
        } finally { clearTimeout(timeout); }
        if (!reqInter.ok) {
          const txt = await reqInter.text().catch(() => '');
          if (reqInter.status >= 400 && reqInter.status < 500) {
            return new Response(JSON.stringify({ error: 'Consulta rejeitada pelo Inter', code: 'INTER_4XX', details: sanitizeError(txt) }), { status: reqInter.status, headers: corsHeaders });
          }
          return new Response(JSON.stringify({ error: 'Falha na consulta Inter (5xx)', code: 'INTER_5XX', status: reqInter.status, details: sanitizeError(txt) }), { status: 502, headers: corsHeaders });
        }
        const data = await reqInter.json();
        const situacaoRemota = data?.cobranca?.situacao || data?.situacao || data?.status || null;
        const nossoNumeroRemoto = data?.cobranca?.nossoNumero || data?.boleto?.nossoNumero || data?.nossoNumero || null;
        const txidRemoto = data?.cobranca?.pix?.txid || data?.pix?.txid || data?.txid || null;
        if (situacaoRemota) {
          const patch: any = { inter_status: String(situacaoRemota).toUpperCase() };
          if (nossoNumeroRemoto) patch.inter_nosso_numero = String(nossoNumeroRemoto);
          if (txidRemoto) patch.inter_txid = String(txidRemoto);
          await supabase.from('contas_receber').update(patch).eq('id', cobranca_id);
        }
        return new Response(JSON.stringify({ success: true, data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e: any) {
        const msg = sanitizeError(e.message || '');
        if (e.name === 'AbortError' || msg.includes('Timeout')) return new Response(JSON.stringify({ error: 'Timeout ao consultar Inter', code: 'TIMEOUT', details: msg }), { status: 504, headers: corsHeaders });
        if (msg.includes('cert') || msg.includes('TLS')) return new Response(JSON.stringify({ error: 'Erro mTLS', code: 'MTLS_ERROR', details: msg }), { status: 502, headers: corsHeaders });
        return new Response(JSON.stringify({ error: 'Erro interno consult', code: 'INTERNAL', details: msg }), { status: 500, headers: corsHeaders });
      }
    }

    if (action === 'cancel') {
      const { data: cobranca } = await supabase.from('contas_receber').select('inter_codigo_solicitacao, inter_status').eq('id', cobranca_id).maybeSingle();
      if (!cobranca || !cobranca.inter_codigo_solicitacao) return new Response(JSON.stringify({ error: 'Nenhum codigoSolicitacao associado', code: 'NO_CODIGO' }), { status: 400, headers: corsHeaders });
      if (cobranca.inter_status === 'CANCELED' || cobranca.inter_status === 'CANCELADO') {
        return new Response(JSON.stringify({ error: 'Cobrança já cancelada', code: 'ALREADY_CANCELED', status: cobranca.inter_status }), { status: 409, headers: corsHeaders });
      }
      // Validar estado §9 — só cancela se ISSUED ou equivalente
      try {
        const httpClient = await getInterClient();
        const oauthToken = await getOAuthToken(httpClient);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        let reqInter: Response;
        try {
          reqInter = await fetch(`${getInterCobrancaUrl()}/${cobranca.inter_codigo_solicitacao}/cancelar`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${oauthToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ motivoCancelamento: "APEDIDOCLIENTE" }),
            client: httpClient,
            signal: controller.signal,
          });
        } finally { clearTimeout(timeout); }
        const errTxt = await reqInter.text().catch(() => '');
        if (reqInter.ok || reqInter.status === 204) {
          await supabase.from('contas_receber').update({ inter_status: 'CANCELED' }).eq('id', cobranca_id);
          return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        // Idempotência: já cancelado no banco Inter
        if (errTxt && (errTxt.includes('CANCELAD') || errTxt.includes('cancelad'))) {
          await supabase.from('contas_receber').update({ inter_status: 'CANCELED' }).eq('id', cobranca_id);
          return new Response(JSON.stringify({ success: true, deduplicated: true }), { headers: corsHeaders });
        }
        return new Response(JSON.stringify({ error: 'Falha ao cancelar', code: 'INTER_CANCEL_FAIL', details: sanitizeError(errTxt), status: reqInter.status }), { status: reqInter.status, headers: corsHeaders });
      } catch (e: any) {
        const msg = sanitizeError(e.message || '');
        if (e.name === 'AbortError' || msg.includes('Timeout')) return new Response(JSON.stringify({ error: 'Timeout ao cancelar', code: 'TIMEOUT', details: msg }), { status: 504, headers: corsHeaders });
        return new Response(JSON.stringify({ error: msg, code: 'INTERNAL' }), { status: 500, headers: corsHeaders });
      }
    }

    if (action === 'pdf') {
      const { data: cobranca } = await supabase.from('contas_receber').select('inter_codigo_solicitacao').eq('id', cobranca_id).maybeSingle();
      if (!cobranca || !cobranca.inter_codigo_solicitacao) return new Response(JSON.stringify({ error: 'Nenhum codigoSolicitacao', code: 'NO_CODIGO' }), { status: 400, headers: corsHeaders });
      try {
        const httpClient = await getInterClient();
        const oauthToken = await getOAuthToken(httpClient);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        let reqInter: Response;
        try {
          reqInter = await fetch(`${getInterCobrancaUrl()}/${cobranca.inter_codigo_solicitacao}/pdf`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${oauthToken}` },
            client: httpClient,
            signal: controller.signal,
          });
        } finally { clearTimeout(timeout); }
        if (!reqInter.ok) {
          const txt = await reqInter.text().catch(() => '');
          return new Response(JSON.stringify({ error: 'Falha PDF', code: 'PDF_FETCH_FAIL', status: reqInter.status, details: sanitizeError(txt) }), { status: reqInter.status, headers: corsHeaders });
        }
        const contentType = reqInter.headers.get('content-type') || '';
        const data = await reqInter.json().catch(async () => ({ raw: await reqInter.text().catch(() => '') }));
        const b64 = (data as any).pdf || (data as any).base64 || (data as any).arquivo || null;
        if (!b64 || typeof b64 !== 'string') {
          return new Response(JSON.stringify({ error: 'PDF inválido: campo base64 ausente', code: 'PDF_INVALID', contentType }), { status: 502, headers: corsHeaders });
        }
        if (b64.length < 100) {
          return new Response(JSON.stringify({ error: 'PDF inválido: tamanho insuficiente', code: 'PDF_INVALID_SIZE', pdf_size: b64.length }), { status: 502, headers: corsHeaders });
        }
        let decoded: Uint8Array;
        try {
          const binStr = atob(b64);
          decoded = Uint8Array.from(binStr, (c) => c.charCodeAt(0));
        } catch {
          return new Response(JSON.stringify({ error: 'PDF inválido: Base64 malformado', code: 'PDF_BASE64' }), { status: 502, headers: corsHeaders });
        }
        const header = new TextDecoder().decode(decoded.slice(0, 4));
        if (header !== '%PDF') {
          return new Response(JSON.stringify({ error: 'PDF inválido: header %PDF ausente', code: 'PDF_HEADER', header }), { status: 502, headers: corsHeaders });
        }
        // Nunca colocar Base64 em logs (§10) — retornar apenas metadados
        return new Response(JSON.stringify({ success: true, pdf_size: b64.length, contentType, validated: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e: any) {
        const msg = sanitizeError(e.message || '');
        if (e.name === 'AbortError' || msg.includes('Timeout')) return new Response(JSON.stringify({ error: 'Timeout PDF', code: 'TIMEOUT', details: msg }), { status: 504, headers: corsHeaders });
        return new Response(JSON.stringify({ error: msg, code: 'INTERNAL' }), { status: 500, headers: corsHeaders });
      }
    }

    if (action === 'pagar' || action === 'pagar_pix' || action === 'pay_pix') {
      // Gate 4 — operação REAL Sandbox que provoca callback automático PIX
      // Inter: POST /cobranca/v3/cobrancas/{codigoSolicitacao}/pagar  Body: {"pagarCom":"PIX"}
      // Isolamento: busca codigoSolicitacao via RLS (supabase client autenticado); cross-tenant -> 403
      const { data: cobranca } = await supabase.from('contas_receber').select('inter_codigo_solicitacao, inter_status').eq('id', cobranca_id).maybeSingle();
      if (!cobranca || !cobranca.inter_codigo_solicitacao) return new Response(JSON.stringify({ error: 'Nenhum codigoSolicitacao associado', code: 'NO_CODIGO' }), { status: 400, headers: corsHeaders });
      const pagarComRaw = (body as any).pagarCom || (body as any).pagar_com || 'PIX';
      const pagarCom = String(pagarComRaw).toUpperCase();
      if (pagarCom !== 'PIX' && pagarCom !== 'BOLETO') return new Response(JSON.stringify({ error: 'pagarCom inválido: apenas PIX ou BOLETO suportado neste Gate', code: 'BAD_REQUEST' }), { status: 400, headers: corsHeaders });
      try {
        const httpClient = await getInterClient();
        const oauthToken = await getOAuthToken(httpClient);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        let reqInter: Response;
        try {
          reqInter = await fetch(`${getInterCobrancaUrl()}/${cobranca.inter_codigo_solicitacao}/pagar`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${oauthToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ pagarCom }),
            client: httpClient,
            signal: controller.signal,
          });
        } finally { clearTimeout(timeout); }
        const txt = await reqInter.text().catch(() => '');
        let data: any = null;
        try { data = JSON.parse(txt); } catch { data = txt ? { raw: txt } : null; }
        // Captura sanitizada: nunca logar tokens/certs — apenas status/codigo/situacao/correlation
        const correlationId = reqInter.headers.get('x-correlation-id') || reqInter.headers.get('x-request-id') || null;
        if (!reqInter.ok) {
          if (reqInter.status === 429) return new Response(JSON.stringify({ error: 'Throttle Inter', code: 'INTER_429', status: 429, details: sanitizeError(txt), correlationId }), { status: 429, headers: corsHeaders });
          if (reqInter.status >= 400 && reqInter.status < 500) return new Response(JSON.stringify({ error: 'Pagar rejeitado', code: 'INTER_4XX', status: reqInter.status, details: sanitizeError(txt), correlationId }), { status: reqInter.status, headers: corsHeaders });
          return new Response(JSON.stringify({ error: 'Falha pagar Inter', code: 'INTER_5XX', status: reqInter.status, details: sanitizeError(txt), correlationId }), { status: 502, headers: corsHeaders });
        }
        return new Response(JSON.stringify({ success: true, status: reqInter.status, correlationId, codigoSolicitacao: cobranca.inter_codigo_solicitacao, pagarCom, data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e: any) {
        const msg = sanitizeError(e.message || '');
        if (e.name === 'AbortError' || msg.includes('Timeout')) return new Response(JSON.stringify({ error: 'Timeout pagar', code: 'TIMEOUT', details: msg }), { status: 504, headers: corsHeaders });
        if (msg.includes('cert') || msg.includes('TLS')) return new Response(JSON.stringify({ error: 'Erro mTLS', code: 'MTLS_ERROR', details: msg }), { status: 502, headers: corsHeaders });
        return new Response(JSON.stringify({ error: msg, code: 'INTERNAL' }), { status: 500, headers: corsHeaders });
      }
    }

    return new Response(JSON.stringify({ error: 'Ação inválida', code: 'BAD_ACTION' }), { status: 400, headers: corsHeaders });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Erro interno', code: 'INTERNAL', details: sanitizeError(err.message || String(err)) }), { status: 500, headers: corsHeaders });
  }
});
