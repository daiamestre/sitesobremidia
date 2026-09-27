/**
 * SOBRE MÍDIA — conteúdo automático das pastas da Biblioteca (F-94).
 * O robô (GitHub Actions `conteudo-automatico.yml`) gera as imagens, envia ao R2 e chama esta função para publicar
 * nas pastas marcadas (biblioteca_pastas.conteudo_automatico). Toda a regra fica no banco (conteudo_auto_publicar).
 *
 * Autenticação: Authorization: Bearer <CONTENT_FACTORY_SECRET> (segredo só do robô; nunca a chave service_role).
 * Corpo: { "conteudo": "loterias", "itens": [{ chave, nome, descricao?, url, path, hash, bytes, mime, tipo, aspecto }] }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const SEGREDO = Deno.env.get('CONTENT_FACTORY_SECRET');
const PREFIXO_URL = 'https://pub-560b3bffe687403695c61035c8c8f7a7.r2.dev/conteudo/';

const resposta = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!SEGREDO || token.length < 32 || token !== SEGREDO) return resposta(401, { error: 'nao_autorizado' });
  if (req.method !== 'POST') return resposta(405, { error: 'metodo' });
  let corpo: { conteudo?: string; itens?: Array<Record<string, unknown>> };
  try { corpo = await req.json(); } catch { return resposta(400, { error: 'json_invalido' }); }
  const itens = Array.isArray(corpo.itens) ? corpo.itens : null;
  if (!corpo.conteudo || !itens || itens.length > 200) return resposta(400, { error: 'corpo_invalido' });
  // só arquivos do próprio bucket, na área de conteúdo automático (nunca URL de terceiros)
  if (itens.some((i) => typeof i.url !== 'string' || !i.url.startsWith(PREFIXO_URL) || typeof i.path !== 'string' || !String(i.path).startsWith('conteudo/'))) {
    return resposta(400, { error: 'url_fora_do_bucket' });
  }
  const { data, error } = await db.rpc('conteudo_auto_publicar', { p_conteudo: corpo.conteudo, p_itens: itens });
  if (error) return resposta(422, { error: error.message });
  return resposta(200, data);
});
