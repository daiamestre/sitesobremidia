import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { decodificar, imagemDoItem } from "../_shared/noticias/rss.ts";
import { imagemDaPagina } from "../_shared/noticias/fotos.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RssItem {
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
  imageUrl?: string;
}

function parseRss(xmlText: string): RssItem[] {
  const items: RssItem[] = [];

  // Simple regex-based parser for RSS items
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  const titleRegex = /<title>(?:<!\[CDATA\[(.*?)]]>|(.*?))<\/title>/i;
  const linkRegex = /<link>(.*?)<\/link>/i;
  const pubDateRegex = /<pubDate>(.*?)<\/pubDate>/i;
  const descRegex = /<description>(?:<!\[CDATA\[(.*?)]]>|(.*?))<\/description>/i;

  let match;
  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemContent = match[1];

    const titleMatch = itemContent.match(titleRegex);
    const linkMatch = itemContent.match(linkRegex);
    const pubDateMatch = itemContent.match(pubDateRegex);
    const descMatch = itemContent.match(descRegex);

    // Imagem do item: mesma regra do motor de notícias (sem logo, SVG ou pixel de rastreio) — F-91
    const imageUrl = imagemDoItem(match[0]) ?? '';

    if (titleMatch) {
      items.push({
        title: decodificar(titleMatch[1] || titleMatch[2] || '').trim(),
        link: linkMatch ? linkMatch[1].trim() : '',
        pubDate: pubDateMatch ? pubDateMatch[1].trim() : undefined,
        description: descMatch ? (descMatch[1] || descMatch[2] || '').trim() : undefined,
        imageUrl: imageUrl || undefined
      });
    }
  }

  return items;
}

/**
 * [SECURITY HARDENING — SSRF]
 * - JWT de usuário autenticado OBRIGATÓRIO (sem token → 401).
 * - Somente https:// (nunca http://, file://, etc.).
 * - Bloqueia endereços privados/link-local/metadata cloud (SSRF).
 */
async function isAllowedUrl(rawUrl: string): Promise<boolean> {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    if (!parsed.hostname) return false;

    const host = parsed.hostname.toLowerCase();
    // Nomes literalmente privados / localhost
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host === 'metadata.google.internal' ||
      host.endsWith('169.254.169.254') // cloud metadata IP
    ) return false;

    // Resolve DNS e bloqueia IPs privados/loopback/link-local/reservados
    const addrs = await Deno.resolveDns(host, 'A').catch(() => [] as string[]);
    const addrs6 = await Deno.resolveDns(host, 'AAAA').catch(() => [] as string[]);
    for (const ip of [...addrs, ...addrs6]) {
      const isPrivate = isPrivateIp(ip);
      if (isPrivate) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function isPrivateIp(ip: string): boolean {
  const ipv4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  // IPv6: loopback ::1, link-local fe80::, ULA fc00::/7
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80')) return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('ff')) return true; // multicast
  return false;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // [SECURITY] JWT obrigatório
    const authHeader = req.headers.get('authorization') || '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!jwt) {
      return new Response(
        JSON.stringify({ error: 'Autenticacao obrigatoria.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !anonKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase environment missing.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.1');
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: user, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !user?.user?.id) {
      return new Response(
        JSON.stringify({ error: 'Token invalido.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { feedUrl, maxItems = 10 } = await req.json();

    if (!feedUrl) {
      return new Response(
        JSON.stringify({ error: 'feedUrl is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // [SSRF] Somente HTTPS + host público
    if (!(await isAllowedUrl(feedUrl))) {
      console.warn(`[fetch-rss] URL rejeitada (SSRF guard): ${feedUrl}`);
      return new Response(
        JSON.stringify({ error: 'URL nao permitida (apenas https publico).' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching RSS feed: ${feedUrl}`);

    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RSSFetcher/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch RSS: ${response.status}`);
    }

    const xmlText = await response.text();
    // Notícia SEMPRE com imagem (pedido do proprietário, F-91): sem imagem no feed, usa a foto da página da matéria
    // (foto principal / og:image, nunca a imagem genérica do site); sem nenhuma, a notícia não vai para a tela.
    const limite = Math.min(Math.max(Number(maxItems) || 10, 1), 20);
    const candidatos = parseRss(xmlText).slice(0, limite * 2);
    await Promise.all(candidatos.map(async (it) => {
      if (it.imageUrl || !/^https:\/\//i.test(it.link) || !(await isAllowedUrl(it.link))) return;
      try {
        const r = await fetch(it.link, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSSFetcher/1.0)' }, signal: AbortSignal.timeout(6000) });
        if (r.ok) it.imageUrl = imagemDaPagina(await r.text())?.url;
      } catch { /* sem imagem: a notícia fica de fora */ }
    }));
    const items = candidatos.filter((it) => /^https:\/\//i.test(it.imageUrl ?? '')).slice(0, limite);

    console.log(`Parsed ${items.length} items from RSS feed`);

    return new Response(
      JSON.stringify({ items }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('RSS fetch error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
