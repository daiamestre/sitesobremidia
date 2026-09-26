/**
 * SOBRE MÍDIA — motor de notícias (pg_cron 2x/hora -> pg_net -> aqui).
 * Fonte: Agência Brasil / EBC (CC BY 4.0), cadastrada em content_news_sources (dado global da plataforma).
 * Só texto (título + resumo) com crédito "Agência Brasil"; sem fotos de terceiros. O Player recebe as notícias
 * prontas pelo widget (fn_widget_config_resolvido) — nunca lê o feed.
 *
 * Autenticação: Authorization: Bearer <CONTENT_ENGINE_SECRET>.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { parseRss } from '../_shared/noticias/rss.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const SEGREDO = Deno.env.get('CONTENT_ENGINE_SECRET');
const USER_AGENT = 'SobreMidiaNewsEngine/1.0 (+https://sitesobremidia.vercel.app)';
const VALIDADE_DIAS = 5;
const MANTER_ATIVAS = 30;

const resposta = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function sha256(texto: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

interface Fonte { id: string; slug: string; nome: string; url: string; categoria: string; licenca: string | null; etag: string | null; last_modified: string | null }

async function processar(f: Fonte, forcar: boolean) {
  const agora = new Date();
  const base = { last_fetch_at: agora.toISOString(), updated_at: agora.toISOString() };
  const h: Record<string, string> = { 'User-Agent': USER_AGENT };
  if (!forcar && f.etag) h['If-None-Match'] = f.etag;
  if (!forcar && f.last_modified) h['If-Modified-Since'] = f.last_modified;
  try {
    const r = await fetch(f.url, { headers: h, signal: AbortSignal.timeout(20000) });
    if (r.status === 304) {
      await db.from('content_news_sources').update({ ...base, health: 'HEALTHY', last_success_at: agora.toISOString(), last_fetch_error: null }).eq('id', f.id);
      return { fonte: f.slug, status: 'SEM_MUDANCA', novas: 0, expiradas: await expirar(f.id) };
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const xml = await r.text();
    const dominio = new URL(f.url).hostname;
    const { itens, recusados } = parseRss(xml, dominio, agora);
    if (!itens.length && !recusados.length) throw new Error('feed_sem_itens_ou_formato_mudou');

    const hashes = await Promise.all(itens.map((i) => sha256(`${f.slug}|${i.guid}`)));
    const { data: existentes } = await db.from('content_news_items').select('content_hash').is('empresa_operadora_id', null).in('content_hash', hashes);
    const ja = new Set((existentes ?? []).map((e: { content_hash: string }) => e.content_hash));
    const novas = itens.map((i, k) => ({ i, hash: hashes[k] })).filter((x) => !ja.has(x.hash)).map(({ i, hash }) => ({
      empresa_operadora_id: null, source_id: f.id, categoria: f.categoria, external_guid: i.guid, content_hash: hash,
      title: i.titulo, summary: i.resumo, image_url: null, source_name: f.nome, source_url: f.url, article_url: i.link,
      autor: i.autor, licenca: f.licenca, published_at: i.publicadoEm,
      expires_at: new Date(Date.parse(i.publicadoEm) + VALIDADE_DIAS * 86400e3).toISOString(), status: 'ACTIVE', is_active: true, fetched_at: agora.toISOString(),
    }));
    if (novas.length) {
      const { error } = await db.from('content_news_items').insert(novas);
      if (error) throw new Error(`gravar: ${error.message}`);
    }
    const expiradas = await expirar(f.id);
    await db.from('content_news_sources').update({
      ...base, health: 'HEALTHY', last_success_at: agora.toISOString(), last_fetch_error: null, last_fetch_items: itens.length,
      etag: r.headers.get('ETag'), last_modified: r.headers.get('Last-Modified'),
    }).eq('id', f.id);
    return { fonte: f.slug, status: 'OK', recebidas: itens.length, novas: novas.length, recusadas: recusados, expiradas };
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 300);
    await db.from('content_news_sources').update({ ...base, health: 'FAILED', last_fetch_error: msg }).eq('id', f.id);
    return { fonte: f.slug, status: 'FALHA', erro: msg, novas: 0, expiradas: 0 }; // notícias já publicadas continuam
  }
}

/** Vencidas -> EXPIRED; além das 30 mais novas -> ARCHIVED (nada é apagado). */
async function expirar(fonteId: string): Promise<number> {
  const agora = new Date().toISOString();
  const { data: venc } = await db.from('content_news_items').update({ status: 'EXPIRED', updated_at: agora })
    .eq('source_id', fonteId).eq('status', 'ACTIVE').lt('expires_at', agora).select('id');
  const { data: ativas } = await db.from('content_news_items').select('id').eq('source_id', fonteId).eq('status', 'ACTIVE')
    .order('published_at', { ascending: false }).range(MANTER_ATIVAS, MANTER_ATIVAS + 500);
  if (ativas?.length) await db.from('content_news_items').update({ status: 'ARCHIVED', updated_at: agora }).in('id', ativas.map((a: { id: string }) => a.id));
  return (venc?.length ?? 0) + (ativas?.length ?? 0);
}

Deno.serve(async (req) => {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!SEGREDO || token !== SEGREDO) return resposta(401, { error: 'nao_autorizado' });
  let corpo: { forcar?: boolean } = {};
  try { corpo = await req.json(); } catch { /* vazio */ }

  const { data: fontes } = await db.from('content_news_sources')
    .select('id, slug, nome, url, categoria, licenca, etag, last_modified').is('empresa_operadora_id', null).eq('ativo', true);
  const resultados = [];
  for (const f of (fontes ?? []) as Fonte[]) resultados.push(await processar(f, corpo.forcar === true));
  const mudou = resultados.some((r) => (r.novas ?? 0) > 0 || (r.expiradas ?? 0) > 0);
  let playlistsTocadas = 0;
  if (mudou) {
    const { data } = await db.rpc('content_touch_widgets', { p_tipo: 'noticias' });
    playlistsTocadas = Number(data ?? 0);
  }
  return resposta(200, { fontes: resultados, playlistsTocadas });
});
