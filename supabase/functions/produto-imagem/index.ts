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

type Candidato = { url: string; miniatura: string; fonte: 'OPENFOODFACTS' | 'PEXELS' | 'PIXABAY' | 'WIKIMEDIA' | 'OPENVERSE'; credito: string; legenda: string; conferido?: boolean };

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

/** Medidas digitadas ("5kg", "2 l", "500g") no formato sem espaço, para comparar com o nome do produto. */
function medidas(termo: string): string[] {
  return [...norm(termo).matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|g|gr|ml|l|lt|mg)\b/g)].map((m) => m[1].replace(',', '.') + (m[2] === 'lt' ? 'l' : m[2] === 'gr' ? 'g' : m[2]));
}

/**
 * Nota de semelhança entre o que foi digitado e o nome do produto do catálogo (sem a marca).
 * 0 = não serve. Quem começa com a palavra principal ("Leite ...") vale mais que quem só a cita ("Chocolate ao leite").
 */
function nota(nomeProduto: string, termo: string, ps: string[]): number {
  if (!ps.length) return 1;
  const n = norm(nomeProduto).replace(/[^a-z0-9.,\s]/g, ' ');
  const palavrasNome = n.split(/\s+/).filter(Boolean);
  if (!palavrasNome.includes(ps[0])) return 0;
  let s = 1;
  const pos = palavrasNome.indexOf(ps[0]);
  if (pos === 0) s += 4; else if (pos === 1) s += 2;
  for (const p of ps.slice(1)) if (palavrasNome.includes(p)) s += 2;
  const colado = n.replace(/(\d)\s+(kg|g|ml|l)\b/g, '$1$2').replace(/,/g, '.');
  for (const m of medidas(termo)) if (new RegExp(`(^|[^0-9.])${m.replace('.', '\\.')}($|[^a-z0-9])`).test(colado)) s += 3;
  // nome muito comprido costuma ser kit/combo, não o produto simples
  if (palavrasNome.length > 9) s -= 1;
  return Math.max(s, 0.5);
}

/** Legenda que denuncia foto com pessoa/mão/ambiente (não serve de vitrine): descartada antes de qualquer conferência. */
const GENTE = /\b(maos?|mao|pessoas?|homens?|homem|mulher(es)?|menin[oa]s?|crianc[as]s?|bebes?|modelo|monge|frades?|garot[oa]s?|jovens?|segurando|usando|aplicando|lavando|varrendo|limpando|cabelereiro|hands?|man|men|woman|women|girl|boy|child|people|person|holding|using|wearing|portrait|selfie|smiling)\b/;
const temGente = (legenda: string) => GENTE.test(norm(legenda).replace(/[^a-z\s]/g, ' '));

async function comTempo<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return await Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

/** Busca rápida do Open Food Facts (serviço novo de pesquisa): responde em menos de 1 s e não trava como a busca antiga. */
async function buscaRapida(termo: string, ps: string[]): Promise<Candidato[]> {
  const q = `${termo} countries_tags:"en:brazil"`;
  const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=24&langs=pt&fields=product_name,brands,image_front_url,image_front_small_url`;
  const r = await fetch(url, { headers: { 'User-Agent': 'SobreMidia-Tabloide/1.0 (contato@sobremidia.com.br)' } });
  if (!r.ok) return [];
  const j = await r.json().catch(() => null);
  const texto = (v: unknown) => (Array.isArray(v) ? v.join(' ') : String(v ?? ''));
  const achados: Array<{ c: Candidato; n: number }> = [];
  for (const p of j?.hits ?? []) {
    const produto = texto(p.product_name).trim();
    const n = nota(produto, termo, ps);
    if (!p.image_front_url || n <= 0) continue;
    const nome = `${produto} ${texto(p.brands)}`.trim();
    achados.push({ n, c: { url: p.image_front_url, miniatura: p.image_front_small_url || p.image_front_url, fonte: 'OPENFOODFACTS', credito: 'Open Food Facts (CC BY-SA)', legenda: nome.slice(0, 80) } });
  }
  achados.sort((a, b) => b.n - a.n);
  // só ficam os parecidos de verdade: quem apenas cita a palavra no meio do nome ("chocolate ao leite") sai
  const corte = Math.max(3, (achados[0]?.n ?? 0) * 0.6);
  return achados.filter((a) => a.n >= corte).slice(0, 6).map((a) => a.c);
}

// a mesma base aberta tem 4 catálogos: alimentos, beleza/higiene, ração e produtos em geral
const CATALOGOS = ['world.openfoodfacts.org', 'world.openbeautyfacts.org', 'world.openpetfoodfacts.org', 'world.openproductsfacts.org'];

async function openFoodFacts(termo: string, ps: string[], host = CATALOGOS[0]): Promise<Candidato[]> {
  const url =
    `https://${host}/cgi/search.pl?` + 'search_simple=1&action=process&json=1&page_size=12' +
    '&fields=product_name,brands,image_front_url,image_front_small_url&tagtype_0=countries&tag_contains_0=contains&tag_0=brazil' +
    `&search_terms=${encodeURIComponent(termo)}`;
  // o Open Food Facts às vezes responde com página de erro; tenta de novo uma vez
  let j: any = null;
  for (let tentativa = 0; tentativa < (host === CATALOGOS[0] ? 2 : 1) && !j; tentativa++) {
    const r = await fetch(url, { headers: { 'User-Agent': 'SobreMidia-Tabloide/1.0 (contato@sobremidia.com.br)' } });
    if (r.ok) j = await r.json().catch(() => null);
  }
  if (!j) return [];
  const out: Candidato[] = [];
  const ordenados = [...(j?.products ?? [])]
    .map((p: any) => ({ p, n: nota(String(p.product_name ?? ''), termo, ps) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .map((x) => x.p);
  for (const p of ordenados) {
    const nome = `${p.product_name ?? ''} ${p.brands ?? ''}`.trim();
    if (!p.image_front_url) continue;
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

/** Wikimedia Commons: fotos reais de objetos do dia a dia, com licença livre. */
async function wikimedia(termo: string, ps: string[]): Promise<Candidato[]> {
  const u = 'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=640&format=json&origin=*' +
    `&gsrsearch=${encodeURIComponent(termo + ' filetype:bitmap')}`;
  const r = await fetch(u, { headers: { 'User-Agent': 'SobreMidia-Tabloide/1.0 (contato@sobremidia.com.br)' } });
  if (!r.ok) return [];
  const j = await r.json().catch(() => null);
  return Object.values((j?.query?.pages ?? {}) as Record<string, any>)
    .filter((p) => relacionado(String(p.title ?? ''), ps) && p.imageinfo?.[0]?.thumburl && !/\.(svg|gif|tiff?)$/i.test(String(p.title)))
    .slice(0, 4)
    .map((p) => ({
      url: p.imageinfo[0].thumburl,
      miniatura: p.imageinfo[0].thumburl,
      fonte: 'WIKIMEDIA' as const,
      credito: `Wikimedia Commons${p.imageinfo[0].extmetadata?.LicenseShortName?.value ? ' (' + String(p.imageinfo[0].extmetadata.LicenseShortName.value).slice(0, 20) + ')' : ''}`,
      legenda: String(p.title ?? '').replace(/^File:/, '').slice(0, 80),
    }));
}

/** Openverse: fotos reais (Flickr e outras) com licença livre. */
async function openverse(termo: string, ps: string[]): Promise<Candidato[]> {
  const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(termo)}&page_size=8&mature=false&category=photograph`, { headers: { 'User-Agent': 'SobreMidia-Tabloide/1.0 (contato@sobremidia.com.br)' } });
  if (!r.ok) return [];
  const j = await r.json().catch(() => null);
  return ((j?.results ?? []) as any[])
    .filter((x) => relacionado(`${x.title ?? ''} ${(x.tags ?? []).map((g: any) => g.name).join(' ')}`, ps) && (x.thumbnail || x.url))
    .slice(0, 3)
    .map((x) => ({
      url: x.url,
      miniatura: x.thumbnail || x.url,
      fonte: 'OPENVERSE' as const,
      credito: `Foto: ${String(x.creator ?? 'autor desconhecido').slice(0, 30)} (${String(x.license ?? 'cc').toUpperCase()}${x.license_version ? ' ' + x.license_version : ''})`,
      legenda: String(x.title ?? '').slice(0, 80),
    }));
}

/** F-175: pede ao Worker de IA para olhar cada foto e dizer se é mesmo o produto. Sem resposta = sem veredicto (não derruba a busca). */
async function conferirComIA(produto: string, cands: Candidato[]): Promise<void> {
  const url = Deno.env.get('TABLOIDE_IA_URL');
  const segredo = Deno.env.get('TABLOIDE_IA_SEGREDO');
  // só roda depois que o Worker de IA foi atualizado com a conferência (TABLOIDE_IA_CONFERE=1); o Worker antigo gerava imagem em vez de conferir
  if (!url || !segredo || !cands.length || Deno.env.get('TABLOIDE_IA_CONFERE') !== '1') return;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'x-segredo': segredo, 'Content-Type': 'application/json' },
    body: JSON.stringify({ acao: 'conferir', produto, imagens: cands.map((c) => c.miniatura || c.url) }),
  }).catch(() => null);
  const j = r?.ok ? await r.json().catch(() => null) : null;
  if (!j?.resultados) return;
  for (const c of cands) {
    const v = j.resultados[c.miniatura || c.url];
    if (typeof v === 'boolean') c.conferido = v;
  }
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

/**
 * F-174: cria a imagem do produto por IA quando não existe foto real.
 * A geração roda num Worker dentro da Cloudflare do dono (cloudflare/tabloide-ia/worker.js, Workers AI);
 * esta função só o chama com o segredo combinado — nenhum token da Cloudflare fica aqui.
 * Sempre produto genérico, sem marca e sem texto, em fundo branco (o navegador recorta depois).
 * Antes de gerar, o banco confere o limite diário da pessoa e da empresa (tabloide_ia_registrar).
 */
async function gerarPorIA(req: Request, termo: string): Promise<{ imagem?: string; motivo?: string }> {
  const url = Deno.env.get('TABLOIDE_IA_URL');
  const segredo = Deno.env.get('TABLOIDE_IA_SEGREDO');
  if (!url || !segredo) return { motivo: 'A criação de imagem por IA não está configurada.' };
  const limite = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/tabloide_ia_registrar`, {
    method: 'POST',
    headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '', Authorization: req.headers.get('Authorization') ?? '', 'Content-Type': 'application/json' },
    body: '{}',
  }).then((r) => r.json()).catch(() => null);
  if (!limite?.liberado) return { motivo: limite?.motivo ?? 'Não foi possível conferir o limite diário.' };
  // o Worker traduz o nome e monta o pedido (objeto genérico, sem marca e sem texto, em fundo branco)
  const r = await fetch(url, { method: 'POST', headers: { 'x-segredo': segredo, 'Content-Type': 'application/json' }, body: JSON.stringify({ produto: termo }) }).catch(() => null);
  const j = r ? await r.json().catch(() => null) : null;
  if (!r?.ok || !j?.image) {
    // detalhe técnico (código e mensagem, nunca o segredo) para diagnóstico
    const detalhe = `HTTP ${r?.status ?? 'sem resposta'} ${String(j?.erro ?? '').slice(0, 200)}`;
    console.error('[produto-imagem] IA falhou:', detalhe);
    return { motivo: r?.status === 429 ? 'A cota gratuita de imagens por IA acabou por hoje.' : 'A IA não conseguiu criar a imagem agora.', detalhe } as { motivo: string };
  }
  return { imagem: j.image, traduzido: j.nome } as { imagem: string };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    const { termo, acao } = await req.json();
    const t = String(termo ?? '').trim().slice(0, 80);
    if (t.length < 2) return json({ candidatos: [] });
    if (acao === 'gerar') return json(await gerarPorIA(req, t));
    const ps = palavras(t);
    const consulta = ps.length ? ps.join(' ') : t;
    const [off, obf, opff, opf, wik, ove, pex, pix] = await Promise.all([
      // alimentos: busca rápida primeiro; a antiga só entra se a rápida não achar nada
      comTempo(buscaRapida(t, ps).then((r) => (r.length ? r : openFoodFacts(t, ps))).catch(() => []), 14000),
      comTempo(openFoodFacts(t, ps, CATALOGOS[1]).catch(() => []), 9000),
      comTempo(openFoodFacts(t, ps, CATALOGOS[2]).catch(() => []), 9000),
      comTempo(openFoodFacts(t, ps, CATALOGOS[3]).catch(() => []), 9000),
      comTempo(wikimedia(consulta, ps).catch(() => []), 9000),
      comTempo(openverse(consulta, ps).catch(() => []), 9000),
      comTempo(pexels(consulta, ps).catch(() => []), 7000),
      comTempo(pixabay(consulta, ps).catch(() => []), 7000),
    ]);
    const todos = [...(off ?? []), ...(obf ?? []), ...(opff ?? []), ...(opf ?? []), ...(wik ?? []), ...(ove ?? []), ...(pex ?? []), ...(pix ?? [])].filter((c) => !temGente(c.legenda));
    // Catálogos de produto (Open Facts) já casam pelo nome da embalagem: não gastam conferência.
    // A IA olha só as fotos de Wikimedia, Openverse e bancos de imagens (2 melhores de cada, no máximo 6) e tem 15 s.
    const porFonte = new Map<string, number>();
    const aConferir = todos.filter((c) => c.fonte !== 'OPENFOODFACTS').filter((c) => { const n = (porFonte.get(c.fonte) ?? 0) + 1; porFonte.set(c.fonte, n); return n <= 2; }).slice(0, 6);
    await comTempo(conferirComIA(t, aConferir), 15000);
    return json({ candidatos: todos });
  } catch {
    return json({ candidatos: [], erro: 'consulta inválida' }, 400);
  }
});
