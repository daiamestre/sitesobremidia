/**
 * produto-imagem — acha fotos para o Tabloide Digital (F-172).
 *
 * Recebe `{ termo }` (ex.: "Coca-Cola 2L") e devolve candidatos de 3 fontes públicas:
 *  - Open Food Facts: embalagens reais de produtos de mercado (foto da frente, licença CC-BY-SA);
 *  - Pexels e Pixabay: fotos de alimentos frescos, pratos, serviços (chaves ficam nos segredos da função).
 * Só entra foto cuja descrição/etiqueta tem relação com o que foi digitado.
 * O JWT é verificado pelo gateway do Supabase (função publicada COM verificação).
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Candidato = { url: string; miniatura: string; fonte: 'OPENFOODFACTS' | 'PEXELS' | 'PIXABAY'; credito: string; legenda: string };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Palavras que dizem o que é o produto (tira peso, volume, marca de quantidade). */
function palavras(termo: string): string[] {
  return norm(termo)
    .replace(/\b\d+([.,]\d+)?\s*(kg|g|gr|ml|l|lt|un|und|cx|pct|mg)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length >= 3 && !/^\d+$/.test(p) && !['com', 'sem', 'para', 'por', 'dos', 'das', 'tipo'].includes(p));
}

/** A legenda precisa citar a palavra principal (a 1ª que não é número). */
function relacionado(legenda: string, ps: string[]): boolean {
  if (!ps.length) return true;
  const l = norm(legenda);
  return l.includes(ps[0]) || (ps.length > 1 && ps.slice(1).every((p) => l.includes(p)));
}

async function comTempo<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return await Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

async function openFoodFacts(termo: string, ps: string[]): Promise<Candidato[]> {
  const url =
    'https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1&page_size=12' +
    '&fields=product_name,brands,image_front_url,image_front_small_url&tagtype_0=countries&tag_contains_0=contains&tag_0=brazil' +
    `&search_terms=${encodeURIComponent(termo)}`;
  // o Open Food Facts às vezes responde com página de erro; tenta de novo uma vez
  let j: any = null;
  for (let tentativa = 0; tentativa < 2 && !j; tentativa++) {
    const r = await fetch(url, { headers: { 'User-Agent': 'SobreMidia-Tabloide/1.0 (contato@sobremidia.com.br)' } });
    if (r.ok) j = await r.json().catch(() => null);
  }
  if (!j) return [];
  const out: Candidato[] = [];
  for (const p of j?.products ?? []) {
    const nome = `${p.product_name ?? ''} ${p.brands ?? ''}`.trim();
    if (!p.image_front_url || !relacionado(nome, ps)) continue;
    out.push({
      url: p.image_front_url,
      miniatura: p.image_front_small_url || p.image_front_url,
      fonte: 'OPENFOODFACTS',
      credito: 'Open Food Facts (CC BY-SA)',
      legenda: nome.slice(0, 80),
    });
    if (out.length >= 5) break;
  }
  return out;
}

async function pexels(termo: string, ps: string[]): Promise<Candidato[]> {
  const chave = Deno.env.get('PEXELS_API_KEY');
  if (!chave) return [];
  const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(termo)}&locale=pt-BR&per_page=10`, { headers: { Authorization: chave } });
  if (!r.ok) return [];
  const j = await r.json().catch(() => null);
  return (j?.photos ?? [])
    .filter((f: any) => relacionado(f.alt ?? '', ps))
    .slice(0, 4)
    .map((f: any) => ({
      url: f.src?.large ?? f.src?.medium,
      miniatura: f.src?.small ?? f.src?.medium,
      fonte: 'PEXELS' as const,
      credito: `Foto: ${f.photographer ?? 'Pexels'} / Pexels`,
      legenda: String(f.alt ?? '').slice(0, 80),
    }))
    .filter((c: Candidato) => c.url);
}

async function pixabay(termo: string, ps: string[]): Promise<Candidato[]> {
  const chave = Deno.env.get('PIXABAY_API_KEY');
  if (!chave) return [];
  const r = await fetch(`https://pixabay.com/api/?key=${chave}&q=${encodeURIComponent(termo)}&lang=pt&image_type=photo&per_page=10&safesearch=true`);
  if (!r.ok) return [];
  const j = await r.json().catch(() => null);
  return (j?.hits ?? [])
    .filter((f: any) => relacionado(f.tags ?? '', ps))
    .slice(0, 4)
    .map((f: any) => ({
      url: f.webformatURL,
      miniatura: f.previewURL ?? f.webformatURL,
      fonte: 'PIXABAY' as const,
      credito: `Foto: ${f.user ?? 'Pixabay'} / Pixabay`,
      legenda: String(f.tags ?? '').slice(0, 80),
    }))
    .filter((c: Candidato) => c.url);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    const { termo } = await req.json();
    const t = String(termo ?? '').trim().slice(0, 80);
    if (t.length < 2) return json({ candidatos: [] });
    const ps = palavras(t);
    const consulta = ps.length ? ps.join(' ') : t;
    const [off, pex, pix] = await Promise.all([
      comTempo(openFoodFacts(t, ps).catch(() => []), 14000),
      comTempo(pexels(consulta, ps).catch(() => []), 7000),
      comTempo(pixabay(consulta, ps).catch(() => []), 7000),
    ]);
    return json({ candidatos: [...(off ?? []), ...(pex ?? []), ...(pix ?? [])] });
  } catch {
    return json({ candidatos: [], erro: 'consulta inválida' }, 400);
  }
});
