/**
 * sports-escudos-sync — escudos oficiais dos times (F-86).
 *
 * Para cada time com jogo publicado: artigo do clube na Wikipédia (mesmo vínculo do Sports Engine) -> imagem principal
 * do artigo (o escudo do infobox) -> PNG 256 px copiado para o Storage (bucket escudos-times) -> content_sports_teams.
 * Escudo já conferido (verificado_em) nunca é trocado sozinho: se a Wikipédia mudar o arquivo, a cópia conferida
 * continua em uso e a linha fica pendente_revisao com o arquivo_candidato.
 * Autenticação: Authorization: Bearer <CONTENT_ENGINE_SECRET> (Vault; mesmo valor no ambiente da função).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { COMPETICOES, USER_AGENT } from '../_shared/sports/competicoes.ts';
import { caminhoEscudo, timesDaTabela, timesDasCaixasClassicas, timesDosBoxes, type TimeDaFonte } from '../_shared/sports/escudos.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const SEGREDO = Deno.env.get('CONTENT_ENGINE_SECRET');
const BUCKET = 'escudos-times';
const LIMITE_BYTES = 262144;
/** A Wikimedia recusa (429) rajadas de downloads: um por vez, com intervalo, e nova tentativa após espera. */
const INTERVALO_MS = 350;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function baixar(url: string): Promise<Response> {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (r.status !== 429) return r;
    await r.body?.cancel();
    await espera(2000 * (tentativa + 1));
  }
  return fetch(url, { headers: { 'User-Agent': USER_AGENT } });
}

const resposta = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

async function api(host: string, params: Record<string, string>) {
  const u = `https://${host}/w/api.php?` + new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  const r = await fetch(u, { headers: { 'User-Agent': USER_AGENT } });
  if (!r.ok) throw new Error(`wikipedia ${host} ${r.status}`);
  return r.json();
}

/** Artigo para o qual uma predefinição ({{Futebol Flamengo}}) aponta, expandida pela própria Wikipédia. */
async function expandir(host: string, tpl: string): Promise<string | null> {
  const j = await api(host, { action: 'parse', text: tpl, prop: 'links', contentmodel: 'wikitext' });
  return j.parse?.links?.find((l: { ns: number; title: string }) => l.ns === 0)?.title ?? null;
}

function lotes<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

interface Resolvido { nome: string; host: string; artigo: string; qid: string | null; arquivo: string | null; sha1?: string; thumb?: string }

Deno.serve(async (req) => {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!SEGREDO || token !== SEGREDO) return resposta(401, { error: 'nao_autorizado' });

  const relatorio = { times: 0, novos: 0, atualizados: 0, iguais: 0, pendentes_revisao: 0, sem_artigo: [] as string[], sem_escudo: [] as string[], falhas: [] as string[] };
  try {
    const { data: publicados, error: e1 } = await db.rpc('content_sports_times_publicados');
    if (e1) throw e1;
    const porCompeticao = new Map<string, Set<string>>();
    for (const r of publicados as { competicao: string; nome: string }[]) {
      (porCompeticao.get(r.competicao) ?? porCompeticao.set(r.competicao, new Set()).get(r.competicao)!).add(r.nome);
    }

    // 1) nome -> artigo, competição por competição (o primeiro vínculo encontrado vale para o nome)
    const alvo = new Map<string, { host: string; artigo: string }>();
    for (const cfg of COMPETICOES) {
      const nomes = porCompeticao.get(cfg.slug);
      if (!nomes?.size) continue;
      const host = cfg.wikipedia.host;
      const wt = (await api(host, { action: 'parse', page: cfg.wikipedia.pagina, prop: 'wikitext', redirects: '1' })).parse.wikitext as string;
      const fonte: TimeDaFonte[] = cfg.wikipedia.tipo === 'tabela' ? timesDaTabela(wt, cfg.exibicao)
        : cfg.wikipedia.formato === 'classico' ? timesDasCaixasClassicas(wt, cfg.exibicaoPorRotulo) : timesDosBoxes(wt);
      const porRotulo = new Map(fonte.map((t) => [t.rotulo, t]));
      for (const nome of nomes) {
        if (alvo.has(nome)) continue;
        const t = porRotulo.get(nome);
        const artigo = t ? (t.artigo ?? (t.predefinicao ? await expandir(host, t.predefinicao) : null)) : null;
        if (artigo) alvo.set(nome, { host, artigo }); else relatorio.sem_artigo.push(`${cfg.slug}:${nome}`);
      }
    }
    relatorio.times = alvo.size;

    // 2) artigo -> imagem principal (inclui não livres: escudos da en.wikipedia são "non-free") + item Wikidata
    const resolvidos: Resolvido[] = [];
    const porHost = new Map<string, [string, { host: string; artigo: string }][]>();
    for (const e of alvo) (porHost.get(e[1].host) ?? porHost.set(e[1].host, []).get(e[1].host)!).push(e);
    for (const [host, itens] of porHost) {
      for (const lote of lotes(itens, 40)) {
        const j = await api(host, { action: 'query', titles: lote.map(([, a]) => a.artigo).join('|'), redirects: '1',
          prop: 'pageimages|pageprops', piprop: 'name', pilicense: 'any', ppprop: 'wikibase_item' });
        const redir = new Map<string, string>();
        for (const r of [...(j.query.normalized ?? []), ...(j.query.redirects ?? [])]) redir.set(r.from, r.to);
        const final = (t: string) => { let x = t; for (let i = 0; i < 3 && redir.has(x); i++) x = redir.get(x)!; return x; };
        const pag = new Map((j.query.pages as { title: string; pageimage?: string; pageprops?: { wikibase_item?: string } }[]).map((p) => [p.title, p]));
        for (const [nome, a] of lote) {
          const p = pag.get(final(a.artigo));
          resolvidos.push({ nome, host, artigo: p?.title ?? a.artigo, qid: p?.pageprops?.wikibase_item ?? null, arquivo: p?.pageimage ?? null });
        }
      }
      // 3) arquivo -> miniatura PNG 256 px + sha1
      const comArquivo = resolvidos.filter((r) => r.host === host && r.arquivo);
      for (const lote of lotes(comArquivo, 40)) {
        const j = await api(host, { action: 'query', titles: lote.map((r) => 'File:' + r.arquivo).join('|'),
          prop: 'imageinfo', iiprop: 'url|sha1|mime', iiurlwidth: '256' });
        const chave = (t: string) => t.replace(/^[^:]+:/, '').replace(/_/g, ' ').trim();
        const info = new Map((j.query.pages as { title: string; imageinfo?: { thumburl?: string; sha1?: string }[] }[])
          .map((p) => [chave(p.title), p.imageinfo?.[0]]));
        for (const r of lote) {
          const ii = info.get(chave('File:' + r.arquivo));
          r.thumb = ii?.thumburl; r.sha1 = ii?.sha1;
        }
      }
    }

    // 4) grava: novo / igual / pendente de revisão (conferido não troca sozinho)
    const { data: atuais, error: e2 } = await db.from('content_sports_teams').select('*');
    if (e2) throw e2;
    const existente = new Map((atuais ?? []).map((t: Record<string, unknown>) => [t.nome as string, t]));
    for (const r of resolvidos) {
      if (!r.arquivo || !r.thumb || !r.sha1) { relatorio.sem_escudo.push(r.nome); continue; }
      const atual = existente.get(r.nome) as { arquivo?: string; arquivo_sha1?: string; escudo_url?: string; verificado_em?: string } | undefined;
      if (atual && atual.arquivo === r.arquivo && atual.arquivo_sha1 === r.sha1 && atual.escudo_url) { relatorio.iguais++; continue; }
      if (atual?.verificado_em) {
        await db.from('content_sports_teams').update({ pendente_revisao: true, arquivo_candidato: r.arquivo, atualizado_em: new Date().toISOString() }).eq('nome', r.nome);
        relatorio.pendentes_revisao++;
        continue;
      }
      try {
        await espera(INTERVALO_MS);
        const img = await baixar(r.thumb);
        const tipo = img.headers.get('content-type') ?? '';
        const bytes = new Uint8Array(await img.arrayBuffer());
        const png = tipo.startsWith('image/png');
        if (!img.ok || !(png || tipo.startsWith('image/jpeg')) || bytes.length === 0 || bytes.length > LIMITE_BYTES) throw new Error(`imagem ${img.status} ${tipo} ${bytes.length}`);
        const caminho = png ? caminhoEscudo(r.nome, r.sha1) : caminhoEscudo(r.nome, r.sha1).replace(/\.png$/, '.jpg');
        const up = await db.storage.from(BUCKET).upload(caminho, bytes, { contentType: png ? 'image/png' : 'image/jpeg', upsert: true, cacheControl: '31536000' });
        if (up.error) throw up.error;
        const url = db.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
        const { error } = await db.from('content_sports_teams').upsert({
          nome: r.nome, wiki_host: r.host, artigo: r.artigo, wikidata_qid: r.qid, arquivo: r.arquivo, arquivo_sha1: r.sha1,
          escudo_url: url, pendente_revisao: false, arquivo_candidato: null, atualizado_em: new Date().toISOString(),
        }, { onConflict: 'nome' });
        if (error) throw error;
        if (atual) relatorio.atualizados++; else relatorio.novos++;
      } catch (e) {
        relatorio.falhas.push(`${r.nome}: ${(e as Error).message}`);
      }
    }
    if (relatorio.novos || relatorio.atualizados) await db.rpc('content_touch_widgets', { p_tipo: 'sports' });
    return resposta(200, relatorio);
  } catch (e) {
    return resposta(500, { error: (e as Error).message, relatorio });
  }
});
