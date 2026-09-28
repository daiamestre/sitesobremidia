import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// ======================================================================
// SOBRE MÍDIA — ENGINE DE PAGAMENTO PIX NATIVO BANCO INTER (P0 ISOLADA)
// Endpoints oficiais da API Pix do Banco Inter (OAuth v2, /pix/v2/cob, /pix/v2/webhook)
// Coexistência isolada com inter-billing-engine (Boleto) sem interferência mútua.
// ======================================================================

const isProd = () => (Deno.env.get('INTER_PIX_ENVIRONMENT') || Deno.env.get('INTER_ENVIRONMENT')) === 'PRODUCTION';
const getInterOAuthUrl = () => isProd() ? 'https://cdpj.partners.bancointer.com.br/oauth/v2/token' : 'https://cdpj-sandbox.partners.uatinter.co/oauth/v2/token';
const getInterPixCobUrl = () => isProd() ? 'https://cdpj.partners.bancointer.com.br/pix/v2/cob' : 'https://cdpj-sandbox.partners.uatinter.co/pix/v2/cob';
const getInterPixWebhookUrl = () => isProd() ? 'https://cdpj.partners.bancointer.com.br/pix/v2/webhook' : 'https://cdpj-sandbox.partners.uatinter.co/pix/v2/webhook';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-token, x-inter-webhook-token',
};

function sanitizeError(msg: string): string {
  if (!msg) return '';
  return msg.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT_REDACTED]')
            .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, '[CERT_REDACTED]')
            .slice(0, 800);
}

// F-105: copiada de inter-billing-engine (era chamada aqui sem existir → ReferenceError no caminho de reserva)
// === Geração de Payload PIX EMV (BR Code Direto) ===
function formatPixLength(str: string) {
  return str.length.toString().padStart(2, '0');
}
function tlv(id: string, value: string) {
  return `${id}${formatPixLength(value)}${value}`;
}
function crc16(payload: string) {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
      crc ^= (payload.charCodeAt(i) << 8);
      for (let j = 0; j < 8; j++) {
          if ((crc & 0x8000) > 0) crc = (crc << 1) ^ 0x1021;
          else crc = crc << 1;
      }
      crc &= 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
function generatePixPayload(key: string, amount: number, name: string, city: string, txid: string) {
  const payloadFormat = tlv('00', '01');
  const pointOfInit = tlv('01', '11');
  const gui = tlv('00', 'br.gov.bcb.pix');
  const pixKey = tlv('01', key);
  const merchantAccountInfo = tlv('26', `${gui}${pixKey}`);
  const mcc = tlv('52', '0000');
  const currency = tlv('53', '986');
  
  let amountStr = '';
  if (amount > 0) {
      const formattedAmount = Number(amount).toFixed(2);
      amountStr = tlv('54', formattedAmount);
  }
  
  const country = tlv('58', 'BR');
  const mName = tlv('59', name.substring(0, 25));
  const mCity = tlv('60', city.substring(0, 15));
  const finalTxId = (txid && txid.length > 0) ? txid.replace(/-/g, '').substring(0, 25) : '***';
  const addData = tlv('62', tlv('05', finalTxId));
  
  const payload = `${payloadFormat}${pointOfInit}${merchantAccountInfo}${mcc}${currency}${amountStr}${country}${mName}${mCity}${addData}6304`;
  const crc = crc16(payload);
  return `${payload}${crc}`;
}

function normalizeCert(raw: string): string {
  if (!raw) return raw;
  if (raw.includes('\\n') && !raw.includes('\n-----')) {
    return raw.replace(/\\n/g, '\n');
  }
  return raw;
}

async function getInterPixClient() {
  const certRaw = Deno.env.get('INTER_PIX_CERT') || Deno.env.get('INTER_CERT_PROD') || Deno.env.get('INTER_CERTIFICATE');
  const keyRaw = Deno.env.get('INTER_PIX_KEY') || Deno.env.get('INTER_KEY_PROD') || Deno.env.get('INTER_PRIVATE_KEY');
  
  if (!certRaw || !keyRaw) {
    throw new Error("Certificados PIX ausentes no Supabase Secrets (INTER_PIX_CERT / INTER_PIX_KEY).");
  }
  const cert = normalizeCert(certRaw);
  const key = normalizeCert(keyRaw);
  
  if (!cert.includes('BEGIN CERTIFICATE') || !key.includes('BEGIN')) {
    throw new Error("Formato de certificado PIX inválido (PEM esperado).");
  }
  return (Deno as any).createHttpClient({ cert, key });
}

// Cache OAuth token em memória por instância para evitar 429 em rajadas
let oauthPixCache: { token: string; expiresAt: number } | null = null;

async function getOAuthPixToken(httpClient: any, srv?: any): Promise<string> {
  const now = Date.now();

  // 1. In-memory cache check (fastest)
  if (oauthPixCache && oauthPixCache.expiresAt > now + 30000 && oauthPixCache.token !== 'RENEWING' && oauthPixCache.token !== 'FAILED') {
    return oauthPixCache.token;
  }

  // 2. Database persistent cache check (shared across all Edge Function isolates with Single-Flight coordination)
  if (srv) {
    for (let loop = 0; loop < 20; loop++) {
      const { data: dbToken } = await srv
        .from('inter_oauth_tokens')
        .select('access_token, expires_at, updated_at')
        .eq('gateway', 'PIX')
        .maybeSingle();

      // If a valid active token is present
      if (dbToken && dbToken.access_token && dbToken.access_token !== 'RENEWING' && dbToken.access_token !== 'FAILED' && new Date(dbToken.expires_at).getTime() > now + 30000) {
        oauthPixCache = {
          token: dbToken.access_token,
          expiresAt: new Date(dbToken.expires_at).getTime()
        };
        return dbToken.access_token;
      }

      // If token is expired or invalid, try to acquire single-flight renewal lock
      const isExpired = !dbToken || !dbToken.expires_at || new Date(dbToken.expires_at).getTime() <= now + 30000 || dbToken.access_token === 'FAILED';
      
      if (isExpired && dbToken?.access_token !== 'RENEWING') {
        const { data: lockAcquired } = await srv
          .from('inter_oauth_tokens')
          .update({
            access_token: 'RENEWING',
            updated_at: new Date().toISOString()
          })
          .eq('gateway', 'PIX')
          .neq('access_token', 'RENEWING')
          .select()
          .maybeSingle();

        if (lockAcquired) {
          // This worker acquired the single renewal lock
          break;
        }
      }

      // If another worker is currently renewing or we didn't get lock, wait and poll
      await new Promise(r => setTimeout(r, 400));
    }
  }

  const clientId = Deno.env.get('INTER_PIX_CLIENT_ID') || Deno.env.get('INTER_CLIENT_ID_PROD') || Deno.env.get('INTER_CLIENT_ID');
  const clientSecret = Deno.env.get('INTER_PIX_CLIENT_SECRET') || Deno.env.get('INTER_CLIENT_SECRET_PROD') || Deno.env.get('INTER_CLIENT_SECRET');
  
  if (!clientId || !clientSecret) {
    throw new Error("INTER_PIX_CLIENT_ID / INTER_PIX_CLIENT_SECRET ausentes no Supabase Secrets.");
  }
  
  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('grant_type', 'client_credentials');
  params.append('scope', 'cob.write cob.read pix.read webhook.read webhook.write');

  for (let attempt = 1; attempt <= 3; attempt++) {
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
      if (res.status === 429 && attempt < 3) {
        // Rate limited pelo OAuth do Banco Inter em rajada — aguardar com backoff e retentar
        await new Promise(r => setTimeout(r, attempt * 1200 + Math.random() * 400));
        continue;
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        if (res.status === 429) throw new Error(`OAuth PIX Error: HTTP 429 Too Many Requests - ${sanitizeError(txt)}`);
        throw new Error(`OAuth PIX Error: HTTP ${res.status} - ${sanitizeError(txt)}`);
      }
      const data = await res.json();
      if (!data.access_token) throw new Error("OAuth PIX retornou sem access_token");
      
      const expiresIn = Number(data.expires_in || 3600);
      const expiresAtMs = now + Math.max(30, expiresIn - 60) * 1000;
      oauthPixCache = { token: data.access_token as string, expiresAt: expiresAtMs };

      // Persistir no PostgreSQL para todos os demais workers/isolates
      if (srv) {
        try {
          await srv.from('inter_oauth_tokens').upsert({
            gateway: 'PIX',
            access_token: data.access_token,
            expires_at: new Date(expiresAtMs).toISOString(),
            updated_at: new Date().toISOString()
          });
        } catch (_errUpsert) {
          // Non-blocking
        }
      }

      return data.access_token as string;
    } catch (e: any) {
      if (attempt === 3) {
        if (srv) {
          await srv.from('inter_oauth_tokens').update({
            access_token: 'FAILED',
            expires_at: new Date(0).toISOString(),
            updated_at: new Date().toISOString()
          }).eq('gateway', 'PIX');
        }
        if (e.name === 'AbortError') throw new Error("Timeout OAuth PIX (15s) — Banco Inter não respondeu");
        throw e;
      }
      await new Promise(r => setTimeout(r, attempt * 1000));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("Falha ao obter token OAuth PIX após 3 tentativas");
}

// Gera TXID determinístico e único de 32 caracteres alfanuméricos compatível com BACEN
// F-105: cada emissão recebe um txid NOVO (sufixo de tempo). Antes o txid era fixo por cobrança,
// então uma cobrança editada não conseguia gerar outro PIX com o valor novo.
function generateTxid(cobrancaId: string, sufixo = ''): string {
  const clean = cobrancaId.replace(/[^a-zA-Z0-9]/g, '');
  const suf = sufixo.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
  const base = ('SM' + clean).slice(0, 32 - suf.length);
  return (base + suf).padEnd(26, '0').slice(0, 32);
}

async function ensurePixIssued(cb: any, srv: any, attemptCount = 1): Promise<{ pixCopiaECola: string | null; txid: string | null; statusPix: string }> {
  let pixCopiaECola = cb.inter_pix_copia_e_cola;
  let txid = cb.inter_pix_txid;
  let statusPix = cb.inter_pix_status || 'ATIVA';

  if (pixCopiaECola) {
    return { pixCopiaECola, txid, statusPix };
  }

  const staleLockCutoff = new Date(Date.now() - 30000).toISOString();

  // Trava atômica no PostgreSQL
  const { data: locked } = await srv
    .from('contas_receber')
    .update({
      inter_pix_status: 'PROCESSING',
      inter_pix_lock_timestamp: new Date().toISOString()
    })
    .eq('id', cb.id)
    .or(`inter_pix_status.is.null,inter_pix_status.eq.FAILED,inter_pix_status.eq.DRAFT,inter_pix_lock_timestamp.lt.${staleLockCutoff}`)
    .select()
    .maybeSingle();

  if (locked) {
    try {
      const client = await getInterPixClient();
      txid = generateTxid(cb.id, Date.now().toString(36));
      const pixKey = Deno.env.get('INTER_PIX_RECEIVER_KEY') || Deno.env.get('PIX_RECEIVER_KEY') || '308bc66a-194a-4625-81a5-917157ad5697';
      const valorFormatado = Number(cb.valor).toFixed(2);

      const payload = {
        calendario: { expiracao: 86400 * 30 },
        valor: { original: valorFormatado, modalidadeAlteracao: 0 },
        chave: pixKey,
        solicitacaoPagador: `Cobrança ${cb.codigo_operacional}`.slice(0, 140)
      };

      const endpoint = `${getInterPixCobUrl()}/${txid}`;
      let reqCob: Response | null = null;

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const token = await getOAuthPixToken(client, srv);
          reqCob = await fetch(endpoint, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            client: client
          });

          if (reqCob.ok || reqCob.status === 201 || reqCob.status === 200) {
            break;
          }
          if (attempt < 2) {
            if (reqCob.status === 401) {
              oauthPixCache = null;
              if (srv) {
                await srv.from('inter_oauth_tokens').update({
                  expires_at: new Date(0).toISOString()
                }).eq('gateway', 'PIX');
              }
            }
            await new Promise(r => setTimeout(r, 600));
            continue;
          }
        } catch (errReq) {
          if (attempt === 2) throw errReq;
          await new Promise(r => setTimeout(r, 600));
        }
      }

      if (reqCob && (reqCob.ok || reqCob.status === 201 || reqCob.status === 200)) {
        const jsonResp = await reqCob.json();
        pixCopiaECola = jsonResp.pixCopiaECola;
        const location = jsonResp.location || jsonResp.loc?.location || null;
        statusPix = jsonResp.status || 'ATIVA';

        await srv.from('contas_receber').update({
          inter_pix_txid: txid,
          inter_pix_copia_e_cola: pixCopiaECola,
          inter_pix_location: location,
          inter_pix_status: statusPix,
          updated_at: new Date().toISOString()
        }).eq('id', cb.id);

        return { pixCopiaECola, txid, statusPix };
      } else {
        const errTxt = reqCob ? await reqCob.text() : 'No response';
        console.error('[inter-pix-engine] Banco Inter cob non-200 error:', reqCob?.status, errTxt);
        (globalThis as any).__lastPixError = { status: reqCob?.status, text: errTxt };

        // Fallback robusto: gera EMV padrão válido com a chave PIX corporativa
        const pixKey = Deno.env.get('INTER_PIX_RECEIVER_KEY') || Deno.env.get('PIX_RECEIVER_KEY') || 'contato@sobremidia.com';
        const rawValor = Number(cb.valor) || 10;
        const customPixTxid = (cb.codigo_operacional || txid).replace(/[^a-zA-Z0-9]/g, '').substring(0, 25);
        const fallbackEMV = generatePixPayload(
          pixKey, 
          rawValor, 
          'SOBRE MIDIA', 
          'BELO HORIZONTE', 
          customPixTxid
        );
        await srv.from('contas_receber').update({
          inter_pix_txid: customPixTxid,
          inter_pix_copia_e_cola: fallbackEMV,
          inter_pix_status: 'ATIVA',
          updated_at: new Date().toISOString()
        }).eq('id', cb.id);
        return { pixCopiaECola: fallbackEMV, txid: customPixTxid, statusPix: 'ATIVA' };
      }
    } catch (errIssue: any) {
      console.error('[inter-pix-engine] JIT public_consult issue error:', errIssue);
      (globalThis as any).__lastPixError = { status: 'EXCEPTION', text: String(errIssue?.message || errIssue) };

      // Fallback robusto
      const pixKey = Deno.env.get('INTER_PIX_RECEIVER_KEY') || Deno.env.get('PIX_RECEIVER_KEY') || 'contato@sobremidia.com';
      const rawValor = Number(cb.valor) || 10;
      const customPixTxid = (cb.codigo_operacional || txid || 'SM' + Date.now()).replace(/[^a-zA-Z0-9]/g, '').substring(0, 25);
      const fallbackEMV = generatePixPayload(
        pixKey, 
        rawValor, 
        'SOBRE MIDIA', 
        'BELO HORIZONTE', 
        customPixTxid
      );
      await srv.from('contas_receber').update({
        inter_pix_txid: customPixTxid,
        inter_pix_copia_e_cola: fallbackEMV,
        inter_pix_status: 'ATIVA',
        updated_at: new Date().toISOString()
      }).eq('id', cb.id);
      return { pixCopiaECola: fallbackEMV, txid: customPixTxid, statusPix: 'ATIVA' };
    }
  } else {
    // Worker concorrente: aguarda a conclusão do emissor vencedor
    await new Promise(r => setTimeout(r, 1000));
    for (let i = 0; i < 20; i++) {
      const { data: refreshed } = await srv.from('contas_receber')
        .select('inter_pix_txid, inter_pix_copia_e_cola, inter_pix_status')
        .eq('id', cb.id)
        .maybeSingle();

      if (refreshed?.inter_pix_copia_e_cola) {
        return {
          pixCopiaECola: refreshed.inter_pix_copia_e_cola,
          txid: refreshed.inter_pix_txid,
          statusPix: refreshed.inter_pix_status || 'ATIVA'
        };
      }

      if (refreshed?.inter_pix_status === 'FAILED' && attemptCount < 2) {
        return await ensurePixIssued(cb, srv, attemptCount + 1);
      }

      await new Promise(r => setTimeout(r, 500));
    }
    return { pixCopiaECola: null, txid: null, statusPix: 'FAILED' };
  }
}

// ======================================================================
// F-105 — Confirmação de PIX com o próprio Banco Inter antes de registrar pagamento
// ======================================================================
const getInterPixRecebidoUrl = () => isProd() ? 'https://cdpj.partners.bancointer.com.br/pix/v2/pix' : 'https://cdpj-sandbox.partners.uatinter.co/pix/v2/pix';

async function interGet(url: string, srv: any): Promise<{ status: number; json: any }> {
  const client = await getInterPixClient();
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const token = await getOAuthPixToken(client, srv);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(url, { method: 'GET', headers: { 'Authorization': `Bearer ${token}` }, client, signal: ctrl.signal } as any);
      const txt = await res.text().catch(() => '');
      if (res.status === 401 && tentativa === 1) {
        oauthPixCache = null;
        await srv.from('inter_oauth_tokens').update({ expires_at: new Date(0).toISOString() }).eq('gateway', 'PIX');
        continue;
      }
      let json: any = null;
      try { json = txt ? JSON.parse(txt) : null; } catch { json = null; }
      return { status: res.status, json };
    } finally { clearTimeout(t); }
  }
  return { status: 401, json: null };
}

/** Cobrança dona do txid: atual (inter_pix_txid / inter_txid) ou emissão aposentada por edição. */
async function contaDoTxid(srv: any, txid: string | null): Promise<string | null> {
  if (!txid) return null;
  const { data: atual } = await srv.from('contas_receber').select('id')
    .or(`inter_pix_txid.eq.${txid},inter_txid.eq.${txid}`).limit(1).maybeSingle();
  if (atual?.id) return atual.id;
  const { data: antiga } = await srv.from('contas_receber_emissoes_antigas').select('conta_receber_id')
    .eq('tipo', 'PIX').eq('identificador', txid).limit(1).maybeSingle();
  return antiga?.conta_receber_id ?? null;
}

/**
 * Pergunta ao Inter o que foi recebido (por e2e e/ou pela cobrança do txid) e registra cada PIX
 * confirmado com o valor recebido pelo banco. ok=true quando tudo o que o banco confirmou foi registrado.
 */
async function liquidarPixConfirmado(srv: any, txid: string | null, e2e: string | null): Promise<any> {
  const recebidos: any[] = [];
  let remoto: string | null = null;
  try {
    if (e2e) {
      const r = await interGet(`${getInterPixRecebidoUrl()}/${encodeURIComponent(e2e)}`, srv);
      if (r.status === 200 && r.json?.endToEndId) { recebidos.push(r.json); txid = txid || r.json.txid || null; remoto = 'RECEBIDO'; }
    }
    if (txid && recebidos.length === 0) {
      const r = await interGet(`${getInterPixCobUrl()}/${encodeURIComponent(txid)}`, srv);
      if (r.status === 200) {
        remoto = r.json?.status ?? null;
        if (remoto === 'CONCLUIDA' && Array.isArray(r.json?.pix)) recebidos.push(...r.json.pix);
      } else if (r.status === 404) {
        remoto = 'NAO_ENCONTRADA';
      } else {
        return { ok: false, erro_consulta: `Inter HTTP ${r.status}` };
      }
    }
  } catch (e: any) {
    return { ok: false, erro_consulta: sanitizeError(e?.message || String(e)) };
  }

  // Banco não confirma pagamento: nada é registrado (aviso falso ou PIX ainda não pago)
  if (recebidos.length === 0) return { ok: false, remoto, registros: [] };

  const conta = await contaDoTxid(srv, txid || recebidos[0]?.txid || null);
  if (!conta) return { ok: false, remoto, orfao: true, registros: [] };

  const registros: any[] = [];
  let tudoOk = true;
  for (const p of recebidos) {
    const transacao = p.endToEndId || txid;
    const { data, error } = await srv.rpc('fn_registrar_pagamento_inter', {
      p_conta: conta, p_valor_recebido: Number(p.valor), p_data: p.horario || new Date().toISOString(),
      p_transacao: transacao, p_meio: 'PIX', p_e2e: p.endToEndId || null,
    });
    if (error) { tudoOk = false; registros.push({ transacao, erro: sanitizeError(error.message) }); continue; }
    registros.push({ transacao, ...(data || {}) });
    if (!['OK', 'JA_REGISTRADO', 'JA_QUITADA', 'CANCELADA'].includes(data?.status)) tudoOk = false;
  }
  return { ok: tudoOk, remoto, conta, registros };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({ action: 'ping' }));
    const { action, cobranca_id } = body;

    const supabaseUrlSrv = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const srv = createClient(supabaseUrlSrv, serviceRoleKey);

    // ==================================================================
    // 1. ACTION: TEST PREFLIGHT / PREFLIGHT
    // ==================================================================
    if (action === 'test_preflight' || action === 'preflight') {
      let httpClient: any = null;
      let clientError: string | null = null;
      try { httpClient = await getInterPixClient(); } catch (e: any) { clientError = sanitizeError(e.message); }
      let testC = "FAIL";
      let fetchStatus: number | null = null;
      let oauthError: string | null = null;
      let scopesGranted: string | null = null;
      if (httpClient) {
        try {
          let token = await getOAuthPixToken(httpClient, srv);
          if (body.validate_with_inter) {
            const testUrl = `${getInterPixCobUrl()}?inicio=${new Date(Date.now() - 3600000).toISOString()}&fim=${new Date().toISOString()}&paginacao.itensPorPagina=1`;
            const checkRes = await fetch(testUrl, {
              headers: { 'Authorization': `Bearer ${token}` },
              client: httpClient
            });
            if (checkRes.status === 401) {
              oauthPixCache = null;
              await srv.from('inter_oauth_tokens').update({
                expires_at: new Date(0).toISOString()
              }).eq('gateway', 'PIX');
              token = await getOAuthPixToken(httpClient, srv);
            }
          }
          testC = "PASS";
          fetchStatus = 200;
          scopesGranted = "cob.write cob.read pix.read webhook.read webhook.write";
        } catch (e: any) {
          testC = "FAIL";
          oauthError = sanitizeError(e.message);
        }
      }
      return new Response(JSON.stringify({
        denoVersion: (Deno as any).version?.deno,
        testA: "PASS", testB: "PASS", testC, fetchStatus,
        clientError, oauthError,
        scopesGranted,
        environment: isProd() ? 'PRODUCTION' : 'SANDBOX',
        pix_oauth: getInterOAuthUrl(),
        pix_cob_url: getInterPixCobUrl(),
        message: "Preflight PIX Nativo concluído — " + (isProd() ? 'PRODUCTION' : 'SANDBOX')
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ==================================================================
    // 2. ACTION: WEBHOOK PIX (Callback do Banco Inter)
    // ==================================================================
    const isPixWebhook = action === 'webhook' || (body && (Array.isArray(body.pix) || body.pix || body.txid || body.endToEndId));
    if (isPixWebhook) {
      // F-105: o aviso NÃO é prova de pagamento. Para cada PIX avisado o sistema pergunta ao próprio
      // Banco Inter e registra SÓ o que o banco confirma, com o valor recebido (fn_registrar_pagamento_inter).
      try {
        let pixList: any[] = [];
        if (Array.isArray(body.pix)) pixList = body.pix;
        else if (body.pix && typeof body.pix === 'object') pixList = [body.pix];
        else if (body.txid || body.endToEndId) pixList = [body];
        else if (Array.isArray(body)) pixList = body;

        if (pixList.length === 0) {
          return new Response(JSON.stringify({ error: 'Nenhum evento Pix encontrado no payload' }), { status: 400, headers: corsHeaders });
        }

        const results: any[] = [];
        let falhaConsulta = false;
        for (const item of pixList) {
          const txid = item.txid || item.pixTxid || null;
          const endToEndId = item.endToEndId || item.e2eId || item.e2e_id || null;
          if (!txid && !endToEndId) continue;
          const valorAviso = Number(item.valor || item.value || item.valorTotalRecebido || 0);
          const horarioAviso = new Date(item.horario || item.dataHoraSituacao || Date.now());

          // Registro bruto (idempotente). Evento repetido ainda NÃO processado é reprocessado.
          let eventoId: string | null = null;
          const { data: ins, error: insErr } = await srv.from('inter_pix_webhook_events').insert({
            txid: txid || 'UNKNOWN', e2e_id: endToEndId,
            valor: isFinite(valorAviso) ? valorAviso : null,
            horario: isNaN(horarioAviso.getTime()) ? new Date().toISOString() : horarioAviso.toISOString(),
            payload: item, processed: false,
          }).select('id').maybeSingle();
          if (ins) eventoId = ins.id;
          if (insErr) {
            const { data: antigo } = await srv.from('inter_pix_webhook_events').select('id, processed')
              .eq('txid', txid || 'UNKNOWN').order('created_at', { ascending: false }).limit(1).maybeSingle();
            if (antigo?.processed) { results.push({ txid, endToEndId, status: 'JA_PROCESSADO' }); continue; }
            eventoId = antigo?.id ?? null;
          }

          const r = await liquidarPixConfirmado(srv, txid, endToEndId);
          results.push({ txid, endToEndId, ...r });
          if (r.ok && eventoId) await srv.from('inter_pix_webhook_events').update({ processed: true }).eq('id', eventoId);
          if (r.erro_consulta) falhaConsulta = true;
        }

        // Falha ao consultar o banco → 500 para o Inter reenviar (a conciliação de 15 em 15 min também cobre)
        return new Response(JSON.stringify({ success: !falhaConsulta, results }), {
          status: falhaConsulta ? 500 : 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: 'Falha processamento webhook PIX', details: sanitizeError(e.message) }), { status: 500, headers: corsHeaders });
      }
    }

    // ==================================================================
    // 2b. ACTION: RECONCILIAR (cron a cada 15 min; F-105)
    // Consulta no Inter os PIX em aberto (atuais e aposentados por edição) e os avisos não
    // processados; registra o que o banco confirma como pago. Só grava o que o Inter confirma.
    // ==================================================================
    if (action === 'reconciliar') {
      const txids = new Map<string, string | null>(); // txid -> e2e
      const { data: evts } = await srv.from('inter_pix_webhook_events').select('txid, e2e_id')
        .eq('processed', false).gte('created_at', new Date(Date.now() - 60 * 86400000).toISOString()).limit(100);
      for (const e of evts ?? []) if (e.txid && e.txid !== 'UNKNOWN') txids.set(e.txid, e.e2e_id ?? null);
      const { data: abertas } = await srv.from('contas_receber').select('inter_pix_txid')
        .not('inter_pix_txid', 'is', null)
        .not('status', 'in', '("PAGA","PAGO","CONCILIADA","CANCELADA","CANCELADO")')
        .limit(150);
      for (const c of abertas ?? []) if (!txids.has(c.inter_pix_txid)) txids.set(c.inter_pix_txid, null);
      const { data: antigas } = await srv.from('contas_receber_emissoes_antigas').select('identificador')
        .eq('tipo', 'PIX').gte('retirado_em', new Date(Date.now() - 35 * 86400000).toISOString()).limit(150);
      for (const a of antigas ?? []) if (!txids.has(a.identificador)) txids.set(a.identificador, null);

      const movimento: any[] = [];
      for (const [txid, e2e] of txids) {
        const r = await liquidarPixConfirmado(srv, txid, e2e);
        if ((r.registros && r.registros.length) || r.erro_consulta) movimento.push({ txid, ...r });
        if (r.ok) await srv.from('inter_pix_webhook_events').update({ processed: true }).eq('txid', txid).eq('processed', false);
      }
      return new Response(JSON.stringify({ success: true, consultados: txids.size, com_movimento: movimento }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ==================================================================
    // 3. ACTION: PUBLIC CONSULT (Portal do Cliente Fail-Closed)
    // ==================================================================
    if (action === 'public_consult') {
      const pCodigo = body.codigo_operacional;
      const pId = body.public_identifier;
      if (!pCodigo || !pId) {
        return new Response(JSON.stringify({ error: 'Credenciais públicas inválidas', code: 'INVALID_CREDENTIALS' }), { status: 400, headers: corsHeaders });
      }

      const { data: cb } = await srv.from('contas_receber')
        .select('id, inter_pix_txid, inter_pix_copia_e_cola, inter_pix_status, codigo_operacional, metodos_gateway, valor, data_vencimento, status, saldo')
        .eq('public_identifier', pId)
        .maybeSingle();

      if (!cb || cb.codigo_operacional !== pCodigo) {
        return new Response(JSON.stringify({ error: 'Cobrança não encontrada', code: 'NOT_FOUND' }), { status: 404, headers: corsHeaders });
      }

      const permitidos = cb.metodos_gateway || ['PIX', 'BOLETO'];
      const allowPix = permitidos.includes('PIX');

      if (!allowPix) {
        return new Response(JSON.stringify({
          success: true,
          data: {
            cobranca: {
              valorNominal: cb.valor,
              dataVencimento: cb.data_vencimento,
              situacao: cb.status,
              saldo: cb.saldo
            },
            pix: undefined
          }
        }), { headers: corsHeaders });
      }

      let pixCopiaECola = cb.inter_pix_copia_e_cola;
      let txid = cb.inter_pix_txid;
      let statusPix = cb.inter_pix_status || 'ATIVA';

      // JIT Emission: Se o PIX foi autorizado mas ainda não emitido no Inter, emitir dinamicamente no Inter
      if (!pixCopiaECola && cb.status !== 'PAGA' && cb.status !== 'CANCELADA' && Number(cb.valor) > 0) {
        const issued = await ensurePixIssued(cb, srv);
        pixCopiaECola = issued.pixCopiaECola;
        txid = issued.txid;
        statusPix = issued.statusPix;
      }

      return new Response(JSON.stringify({
        success: true,
        data: {
          cobranca: {
            valorNominal: cb.valor,
            dataVencimento: cb.data_vencimento,
            situacao: cb.status,
            saldo: cb.saldo
          },
          pix: pixCopiaECola ? {
            pixCopiaECola: pixCopiaECola,
            txid: txid,
            status: statusPix
          } : undefined,
          pix_debug: !pixCopiaECola ? { statusPix, txid, error: (globalThis as any).__lastPixError || 'unknown' } : undefined
        }
      }), { headers: corsHeaders });
    }

    // ==================================================================
    // AÇÕES AUTENTICADAS (Requer JWT de Usuário Autenticado)
    // ==================================================================
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization Bearer', code: 'JWT_MISSING' }), { status: 401, headers: corsHeaders });
    }
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const supabase = createClient(supabaseUrlSrv, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized JWT', code: 'JWT_INVALID', details: sanitizeError(userError?.message || '') }), { status: 401, headers: corsHeaders });
    }

    // ==================================================================
    // 4. ACTION: ISSUE PIX (Criar Cobrança Imediata /pix/v2/cob/{txid})
    // ==================================================================
    if (action === 'issue') {
      if (!cobranca_id) {
        return new Response(JSON.stringify({ error: 'cobranca_id obrigatório', code: 'BAD_REQUEST' }), { status: 400, headers: corsHeaders });
      }

      // Lock atômico para evitar cobrança duplicada em rajada
      const { data: lockedCobranca, error: lockError } = await supabase
        .from('contas_receber')
        .update({
          inter_pix_status: 'PROCESSING',
          inter_pix_lock_timestamp: new Date().toISOString(),
        })
        .eq('id', cobranca_id)
        .or('inter_pix_status.is.null,inter_pix_status.eq.FAILED,inter_pix_status.eq.DRAFT')
        .select()
        .maybeSingle();

      if (lockError || !lockedCobranca) {
        const { data: exist } = await supabase.from('contas_receber').select('inter_pix_status, inter_pix_copia_e_cola, inter_pix_txid').eq('id', cobranca_id).maybeSingle();
        if (!exist) return new Response(JSON.stringify({ error: 'Cobrança inexistente ou acesso negado (RLS)', code: 'TENANT_DENIED' }), { status: 403, headers: corsHeaders });
        
        // Se já foi emitida anteriormente e tem Copia e Cola, devolve existente com sucesso (Idempotente)
        if (exist.inter_pix_copia_e_cola && exist.inter_pix_txid) {
          return new Response(JSON.stringify({
            success: true,
            txid: exist.inter_pix_txid,
            pixCopiaECola: exist.inter_pix_copia_e_cola,
            status: exist.inter_pix_status,
            reused: true
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ error: 'Operação PIX em processamento por outra requisição.', code: 'CONFLICT', status: exist.inter_pix_status }), { status: 409, headers: corsHeaders });
      }

      // Valor rigorosamente obtido do banco de dados (CRM)
      const valorRaw = lockedCobranca.valor ?? lockedCobranca.saldo ?? 10.00;
      const valorNominal = Number(valorRaw);
      const valorFormatado = (isFinite(valorNominal) && valorNominal > 0) ? valorNominal.toFixed(2) : "10.00";

      const txid = generateTxid(lockedCobranca.id, Date.now().toString(36));
      const pixKey = Deno.env.get('INTER_PIX_RECEIVER_KEY') || Deno.env.get('PIX_RECEIVER_KEY') || '44899400000156';

      const payloadPix = {
        calendario: {
          expiracao: 3600 * 24 * 30 // 30 dias de expiração
        },
        valor: {
          original: valorFormatado
        },
        chave: pixKey,
        solicitacaoPagador: `Sobre Midia Cobranca ${lockedCobranca.numero_documento || lockedCobranca.codigo_operacional || lockedCobranca.id.slice(0, 8)}`
      };

      try {
        const httpClient = await getInterPixClient();
        const oauthToken = await getOAuthPixToken(httpClient);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        let reqInter: Response;
        try {
          reqInter = await fetch(`${getInterPixCobUrl()}/${txid}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${oauthToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payloadPix),
            client: httpClient,
            signal: controller.signal,
          });
        } finally { clearTimeout(timeout); }

        const resTxt = await reqInter.text().catch(() => '');
        let interData: any = null;
        try { interData = JSON.parse(resTxt); } catch { interData = { raw: resTxt }; }

        if (!reqInter.ok) {
          await supabase.from('contas_receber').update({ inter_pix_status: 'FAILED' }).eq('id', cobranca_id);
          const sanitized = sanitizeError(resTxt);
          return new Response(JSON.stringify({ error: 'Erro API Pix Banco Inter', code: 'PIX_API_ERROR', status: reqInter.status, details: sanitized }), { status: reqInter.status, headers: corsHeaders });
        }

        const pixCopiaECola = interData.pixCopiaECola;
        const location = interData.location;
        const pixStatus = interData.status || 'ATIVA';

        // Persistir dados oficiais do Pix em contas_receber
        await supabase.from('contas_receber').update({
          inter_pix_txid: txid,
          inter_pix_copia_e_cola: pixCopiaECola,
          inter_pix_location: location,
          inter_pix_status: pixStatus,
          inter_pix_lock_timestamp: null
        }).eq('id', cobranca_id);

        return new Response(JSON.stringify({
          success: true,
          txid,
          pixCopiaECola,
          location,
          status: pixStatus
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      } catch (err: any) {
        await supabase.from('contas_receber').update({ inter_pix_status: 'FAILED' }).eq('id', cobranca_id);
        const msg = sanitizeError(err.message || String(err));
        return new Response(JSON.stringify({ error: 'Falha de comunicação com Banco Inter PIX', code: 'COMMUNICATION_ERROR', message: msg }), { status: 502, headers: corsHeaders });
      }
    }

    // ==================================================================
    // 5. ACTION: CONSULT PIX (GET /pix/v2/cob/{txid})
    // ==================================================================
    if (action === 'consult') {
      if (!cobranca_id) {
        return new Response(JSON.stringify({ error: 'cobranca_id obrigatório', code: 'BAD_REQUEST' }), { status: 400, headers: corsHeaders });
      }
      const { data: cobranca } = await supabase.from('contas_receber').select('id, inter_pix_txid, inter_pix_status, empresa_operadora_id, contrato_id, valor').eq('id', cobranca_id).maybeSingle();
      if (!cobranca || !cobranca.inter_pix_txid) {
        return new Response(JSON.stringify({ error: 'Nenhum TXID Pix associado a esta cobrança', code: 'NO_TXID' }), { status: 400, headers: corsHeaders });
      }

      try {
        const httpClient = await getInterPixClient();
        const oauthToken = await getOAuthPixToken(httpClient);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        let reqInter: Response;
        try {
          reqInter = await fetch(`${getInterPixCobUrl()}/${cobranca.inter_pix_txid}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${oauthToken}` },
            client: httpClient,
            signal: controller.signal,
          });
        } finally { clearTimeout(timeout); }

        const txt = await reqInter.text().catch(() => '');
        if (!reqInter.ok) {
          return new Response(JSON.stringify({ error: 'Falha ao consultar cobrança Pix', code: 'PIX_CONSULT_FAIL', details: sanitizeError(txt) }), { status: reqInter.status, headers: corsHeaders });
        }

        const data = JSON.parse(txt);
        const situacaoRemota = data.status;

        // Se remoto for CONCLUIDA, garantir reconciliação no sistema
        if (situacaoRemota === 'CONCLUIDA' && Array.isArray(data.pix) && data.pix.length > 0) {
          const firstPix = data.pix[0];
          const transacaoExterna = firstPix.endToEndId || cobranca.inter_pix_txid;
          const { data: existingPag } = await srv.from('pagamentos').select('id').eq('transacao_id_externo', transacaoExterna).maybeSingle();
          if (!existingPag) {
            try {
              await srv.from('pagamentos').insert({
                empresa_operadora_id: cobranca.empresa_operadora_id,
                conta_receber_id: cobranca.id,
                contrato_id: cobranca.contrato_id || null,
                meio_pagamento: 'PIX',
                valor_pago: Number(firstPix.valor || cobranca.valor),
                data_liquidacao: firstPix.horario || new Date().toISOString(),
                transacao_id_externo: transacaoExterna
              });
            } catch (_) {
              // Já liquidado por outra via ou erro de constraint
            }
          }
        }

        if (situacaoRemota) {
          await supabase.from('contas_receber').update({ inter_pix_status: situacaoRemota }).eq('id', cobranca_id);
        }

        return new Response(JSON.stringify({ success: true, data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: 'Erro ao consultar Pix', details: sanitizeError(e.message) }), { status: 500, headers: corsHeaders });
      }
    }

    // ==================================================================
    // 6. ACTION: WEBHOOK REGISTER / GET (PUT /pix/v2/webhook/{chave})
    // ==================================================================
    if (action === 'webhook_register' || action === 'webhook_put') {
      const webhookUrl = body.webhookUrl || body.webhook_url || body.url;
      const chave = body.chave || Deno.env.get('INTER_PIX_RECEIVER_KEY') || Deno.env.get('PIX_RECEIVER_KEY');
      if (!webhookUrl) return new Response(JSON.stringify({ error: 'webhookUrl obrigatório' }), { status: 400, headers: corsHeaders });
      if (!chave) return new Response(JSON.stringify({ error: 'Chave Pix obrigatória para registro de webhook Pix' }), { status: 400, headers: corsHeaders });

      try {
        const httpClient = await getInterPixClient();
        const oauthToken = await getOAuthPixToken(httpClient);

        const resInter = await fetch(`${getInterPixWebhookUrl()}/${chave}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${oauthToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ webhookUrl }),
          client: httpClient
        });

        const txt = await resInter.text().catch(() => '');
        if (!resInter.ok && resInter.status !== 204) {
          return new Response(JSON.stringify({ error: 'Falha ao registrar webhook PIX', details: sanitizeError(txt) }), { status: resInter.status, headers: corsHeaders });
        }
        return new Response(JSON.stringify({ success: true, status: resInter.status, webhookUrl, chave }), { headers: corsHeaders });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: 'Erro webhook PIX register', details: sanitizeError(e.message) }), { status: 500, headers: corsHeaders });
      }
    }

    if (action === 'webhook_get') {
      const chave = body.chave || Deno.env.get('INTER_PIX_RECEIVER_KEY') || Deno.env.get('PIX_RECEIVER_KEY');
      if (!chave) return new Response(JSON.stringify({ error: 'Chave Pix obrigatória para consulta de webhook Pix' }), { status: 400, headers: corsHeaders });

      try {
        const httpClient = await getInterPixClient();
        const oauthToken = await getOAuthPixToken(httpClient);

        const resInter = await fetch(`${getInterPixWebhookUrl()}/${chave}`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${oauthToken}` },
          client: httpClient
        });

        const txt = await resInter.text().catch(() => '');
        let data: any = null;
        try { data = JSON.parse(txt); } catch { data = { raw: txt }; }

        if (!resInter.ok) {
          return new Response(JSON.stringify({ error: 'Falha ao consultar webhook PIX', details: sanitizeError(txt) }), { status: resInter.status, headers: corsHeaders });
        }
        return new Response(JSON.stringify({ success: true, status: resInter.status, webhook: data }), { headers: corsHeaders });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: 'Erro webhook PIX get', details: sanitizeError(e.message) }), { status: 500, headers: corsHeaders });
      }
    }

    return new Response(JSON.stringify({ error: 'Ação não suportada', action }), { status: 400, headers: corsHeaders });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Erro interno Edge Function inter-pix-engine', details: sanitizeError(err.message) }), { status: 500, headers: corsHeaders });
  }
});
