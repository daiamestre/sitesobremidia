/**
 * SOBRE MÍDIA Sports Engine — ingestão automática (pg_cron a cada 15 min -> pg_net -> aqui).
 * Contrato: docs/engineering/SPORTS_ENGINE_CONTRATO.md
 *
 * Fontes a custo zero: openfootball (CC0) + Wikipédia (CC BY-SA). NENHUM dado é inventado: só é publicado o que
 * as fontes confirmam (reconciliação em ../_shared/sports). O Player nunca consulta estas fontes.
 *
 * Autenticação: Authorization: Bearer <CONTENT_ENGINE_SECRET> (Vault; mesmo valor no ambiente da função).
 * Corpo opcional: { "trigger": "cron" | "manual", "forcar": true, "competicoes": ["brasileirao"] }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { COMPETICOES, OPENFOOTBALL_REPO, USER_AGENT, type ConfigCompeticao } from '../_shared/sports/competicoes.ts';
import { parseFootballBoxes, parseOpenfootball, parseTabelaWiki } from '../_shared/sports/fontes.ts';
import { reconciliarBoxes, reconciliarLiga, type Publicado, type Resultado } from '../_shared/sports/reconciliacao.ts';
import { PARSER_VERSION, type JogoOpenfootball, type JogoWikiBox, type Leitura, type PartidaCanonica } from '../_shared/sports/tipos.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const SEGREDO = Deno.env.get('CONTENT_ENGINE_SECRET');
const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN'); // opcional: só aumenta o limite da API do GitHub

const INTERVALO_NORMAL_MS = 60 * 60 * 1000;       // fora de dia de jogo: no máximo 1 coleta por hora
const REPROCESSAR_MS = 3 * 60 * 60 * 1000;        // sem mudança nas fontes, reconcilia de novo a cada 3 h
const REVISAO_MIN_DIFERENCA_MS = 30 * 60 * 1000;  // Champions: 2ª revisão ao menos 30 min mais antiga
const MANTER_SNAPSHOTS = 10;

const resposta = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function sha256(texto: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function buscar(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT, ...headers }, signal: AbortSignal.timeout(25000) });
  if (!r.ok && r.status !== 304) throw new Error(`HTTP ${r.status} em ${url.split('?')[0]}`);
  return r;
}

// ------------------------------------------------------------------ Wikipédia
const wikiApi = (host: string, p: Record<string, string>) =>
  `https://${host}/w/api.php?${new URLSearchParams({ format: 'json', formatversion: '2', maxlag: '5', ...p })}`;

async function wikiRevisoes(host: string, pagina: string, limite: number): Promise<Array<{ revid: number; timestamp: string }>> {
  const j = await (await buscar(wikiApi(host, { action: 'query', prop: 'revisions', titles: pagina, rvprop: 'ids|timestamp', rvlimit: String(limite) }))).json();
  const revs = j?.query?.pages?.[0]?.revisions;
  if (!Array.isArray(revs) || !revs.length) throw new Error(`wikipedia_sem_revisoes: ${pagina}`);
  return revs;
}

async function wikiTexto(host: string, revid: number): Promise<string> {
  const j = await (await buscar(wikiApi(host, { action: 'parse', oldid: String(revid), prop: 'wikitext' }))).json();
  const t = j?.parse?.wikitext;
  if (typeof t !== 'string') throw new Error(`wikipedia_sem_texto: ${revid}`);
  return t;
}

const wikiLeitura = (host: string, pagina: string, rev: { revid: number; timestamp: string }): Leitura => ({
  fonte: 'wikipedia', versao: String(rev.revid), publicadoEm: rev.timestamp,
  url: `https://${host}/w/index.php?title=${encodeURIComponent(pagina.replace(/ /g, '_'))}&oldid=${rev.revid}`,
});

// ------------------------------------------------------------------ openfootball
interface VersaoOF { sha: string; data: string | null }

/** Últimos 2 commits que tocaram o arquivo (null se a API do GitHub não responder: usa-se o arquivo atual). */
async function commitsOpenfootball(caminho: string): Promise<VersaoOF[] | null> {
  try {
    const h: Record<string, string> = { Accept: 'application/vnd.github+json' };
    if (GITHUB_TOKEN) h.Authorization = `Bearer ${GITHUB_TOKEN}`;
    const r = await buscar(`https://api.github.com/repos/${OPENFOOTBALL_REPO}/commits?per_page=2&path=${encodeURIComponent(caminho)}`, h);
    const lista = await r.json();
    return Array.isArray(lista) ? lista.map((c: { sha: string; commit?: { author?: { date?: string } } }) => ({ sha: c.sha, data: c.commit?.author?.date ?? null })) : null;
  } catch {
    return null;
  }
}

async function arquivoOpenfootball(ref: string, caminho: string): Promise<{ jogos: JogoOpenfootball[]; bruto: string; url: string }> {
  const url = `https://raw.githubusercontent.com/${OPENFOOTBALL_REPO}/${ref}/${caminho}`;
  const bruto = await (await buscar(url)).text();
  return { jogos: parseOpenfootball(JSON.parse(bruto)), bruto, url };
}

// ------------------------------------------------------------------ persistência
type Saude = 'HEALTHY' | 'DEGRADED' | 'FAILED';
async function registrarSaude(fonte: string, competicao: string, status: Saude, extra: Record<string, unknown>) {
  const agora = new Date().toISOString();
  const linha: Record<string, unknown> = { fonte, competicao, status, updated_at: agora, ...extra };
  if (status === 'FAILED') linha.last_failure_at = agora; else linha.last_success_at = agora;
  if (status === 'HEALTHY') linha.failure_reason = null;
  await db.from('content_sports_source_health').upsert(linha, { onConflict: 'fonte,competicao' });
}

async function saudeAtual(fonte: string, competicao: string) {
  const { data } = await db.from('content_sports_source_health').select('last_version').eq('fonte', fonte).eq('competicao', competicao).maybeSingle();
  return data as { last_version: string | null } | null;
}

async function guardarSnapshot(competicao: string, leitura: Leitura, payload: unknown) {
  const texto = JSON.stringify(payload);
  await db.from('content_sports_snapshots').upsert({
    competicao, fonte: leitura.fonte, versao: leitura.versao, url: leitura.url, publicado_em: leitura.publicadoEm,
    payload_hash: await sha256(texto), total: Array.isArray(payload) ? payload.length : 0, payload,
  }, { onConflict: 'competicao,fonte,versao', ignoreDuplicates: true });
  const { data } = await db.from('content_sports_snapshots').select('id').eq('competicao', competicao).eq('fonte', leitura.fonte)
    .order('lido_em', { ascending: false }).range(MANTER_SNAPSHOTS, MANTER_SNAPSHOTS + 50);
  if (data?.length) await db.from('content_sports_snapshots').delete().in('id', data.map((x: { id: string }) => x.id));
}

/** Snapshot anterior (versão diferente da atual) já guardado: é a "segunda leitura" independente. */
async function snapshotAnterior(competicao: string, fonte: string, versaoAtual: string) {
  const { data } = await db.from('content_sports_snapshots').select('versao, url, publicado_em, payload')
    .eq('competicao', competicao).eq('fonte', fonte).neq('versao', versaoAtual).order('lido_em', { ascending: false }).limit(1).maybeSingle();
  return data as { versao: string; url: string; publicado_em: string | null; payload: unknown } | null;
}

function linhaDaPartida(p: PartidaCanonica, competitionId: string) {
  const conteudo = {
    match_key: p.match_key, competition_id: competitionId, competition_code: p.codigo, temporada: p.temporada, rodada: p.rodada,
    match_date: p.data_local, scheduled_date: p.data_local, kickoff_utc: p.kickoff_utc, time_known: !!p.hora_local, source_timezone: p.fuso_fonte,
    home_team_name: p.mandante, away_team_name: p.visitante, home_team_source: p.mandante_fonte, away_team_source: p.visitante_fonte,
    home_score: p.placar?.[0] ?? null, away_score: p.placar?.[1] ?? null, status: p.status,
    validation_state: p.estado, published: p.publicar, confidence: p.confianca, reject_reason: p.motivo,
  };
  return {
    conteudo,
    proveniencia: {
      empresa_operadora_id: null, source: p.fonte.fonte, source_url: p.fonte.url, source_version: p.fonte.versao, source_updated_at: p.fonte.publicadoEm,
      validation_source: p.validacao?.fonte ?? null, validation_url: p.validacao?.url ?? null, validation_version: p.validacao?.versao ?? null,
      parser_version: PARSER_VERSION, evidence: p.evidencia,
    },
  };
}

interface Estatistica { competicao: string; status: 'OK' | 'SEM_MUDANCA' | 'FALHA' | 'DEGRADADO'; detalhe?: string; recebidos?: number; publicados?: number; alterados?: number; pendentes?: number; conflitos?: number; suspeitos?: number; mudouPublicacao?: boolean }

async function persistir(cfg: ConfigCompeticao, competitionId: string, r: Resultado, runId: string): Promise<{ alterados: number; mudouPublicacao: boolean }> {
  const agora = new Date().toISOString();
  const { data: existentes } = await db.from('content_sports_fixtures')
    .select('match_key, row_hash, published, validated_at, published_at').eq('competition_id', competitionId);
  const porChave = new Map((existentes ?? []).map((e: { match_key: string }) => [e.match_key, e as { match_key: string; row_hash: string | null; published: boolean; validated_at: string | null; published_at: string | null }]));
  const gravar: Record<string, unknown>[] = [];
  let mudouPublicacao = false;
  for (const p of r.partidas) {
    const { conteudo, proveniencia } = linhaDaPartida(p, competitionId);
    const hash = await sha256(JSON.stringify(conteudo));
    const antes = porChave.get(p.match_key);
    porChave.delete(p.match_key);
    if (antes?.row_hash === hash) continue; // nada mudou: não regrava
    if ((antes?.published ?? false) !== p.publicar || p.publicar) mudouPublicacao = true;
    gravar.push({
      ...conteudo, ...proveniencia, row_hash: hash, collected_at: agora, updated_at: agora,
      validated_at: p.estado === 'VALIDATED' ? agora : null,
      published_at: p.publicar ? agora : null,
    });
  }
  // Jogo que sumiu da fonte: sai do ar (nunca é apagado).
  for (const sobra of porChave.values()) {
    if (!sobra.published) continue;
    mudouPublicacao = true;
    await db.from('content_sports_fixtures').update({ published: false, validation_state: 'PENDING_VALIDATION', reject_reason: 'ausente_na_fonte', row_hash: null, updated_at: agora })
      .eq('match_key', sobra.match_key);
  }
  for (let i = 0; i < gravar.length; i += 200) {
    const { error } = await db.from('content_sports_fixtures').upsert(gravar.slice(i, i + 200), { onConflict: 'match_key' });
    if (error) throw new Error(`gravar_partidas: ${error.message}`);
  }
  if (r.eventos.length) {
    await db.from('content_sports_events').insert(r.eventos.map((e) => ({ run_id: runId, competicao: cfg.slug, match_key: e.match_key, tipo: e.tipo, antes: e.antes, depois: e.depois })));
  }
  const { count } = await db.from('content_sports_fixtures').select('id', { count: 'exact', head: true }).eq('competition_id', competitionId).eq('published', true);
  await db.from('content_sports_competitions').update({ last_sync_at: agora, last_sync_error: null, fixtures_count: count ?? 0, updated_at: agora }).eq('id', competitionId);
  return { alterados: gravar.length, mudouPublicacao };
}

async function publicadosAntes(competitionId: string): Promise<Map<string, Publicado>> {
  const { data } = await db.from('content_sports_fixtures')
    .select('match_key, status, home_score, away_score, kickoff_utc, scheduled_date').eq('competition_id', competitionId).eq('published', true);
  return new Map((data ?? []).map((f: Record<string, unknown>) => [f.match_key as string, {
    status: f.status as Publicado['status'],
    placar: f.home_score === null || f.away_score === null ? null : [f.home_score as number, f.away_score as number],
    kickoff_utc: f.kickoff_utc ? new Date(f.kickoff_utc as string).toISOString() : null,
    data_local: f.scheduled_date as string, hora_local: null,
  }]));
}

// ------------------------------------------------------------------ uma competição (isolada: falha aqui não afeta as outras)
async function processar(cfg: ConfigCompeticao, comp: { id: string; last_sync_at: string | null }, forcar: boolean, runId: string): Promise<Estatistica> {
  const agora = new Date();
  const recente = comp.last_sync_at && agora.getTime() - Date.parse(comp.last_sync_at) < REPROCESSAR_MS;
  let resultado: Resultado;

  if (cfg.openfootball) {
    // --- openfootball: versão atual (commit) + segunda leitura (commit anterior ou snapshot anterior guardado)
    let ofLeitura: Leitura; let ofAtual: JogoOpenfootball[]; let ofAnterior: { leitura: Leitura; jogos: JogoOpenfootball[] } | null = null;
    let degradado: string | null = null;
    try {
      const commits = await commitsOpenfootball(cfg.openfootball.caminho);
      const ref = commits?.[0]?.sha ?? 'master';
      const atual = await arquivoOpenfootball(ref, cfg.openfootball.caminho);
      const versao = commits?.[0]?.sha ?? `raw-${(await sha256(atual.bruto)).slice(0, 16)}`;
      if (!commits) degradado = 'api_github_indisponivel_usando_arquivo_atual';
      ofLeitura = { fonte: 'openfootball', versao, url: atual.url, publicadoEm: commits?.[0]?.data ?? null };
      ofAtual = atual.jogos;
      const ultimaWiki = await saudeAtual('wikipedia', cfg.slug);
      const ultimaOF = await saudeAtual('openfootball', cfg.slug);
      const revs = await wikiRevisoes(cfg.wikipedia.host, cfg.wikipedia.pagina, 1);
      if (!forcar && recente && ultimaOF?.last_version === versao && ultimaWiki?.last_version === String(revs[0].revid)) {
        return { competicao: cfg.slug, status: 'SEM_MUDANCA' };
      }
      const snap = await snapshotAnterior(cfg.slug, 'openfootball', versao);
      if (snap && Array.isArray(snap.payload)) {
        ofAnterior = { leitura: { fonte: 'openfootball', versao: snap.versao, url: snap.url, publicadoEm: snap.publicado_em }, jogos: snap.payload as JogoOpenfootball[] };
      } else if (commits?.[1]) {
        const ant = await arquivoOpenfootball(commits[1].sha, cfg.openfootball.caminho);
        ofAnterior = { leitura: { fonte: 'openfootball', versao: commits[1].sha, url: ant.url, publicadoEm: commits[1].data }, jogos: ant.jogos };
        await guardarSnapshot(cfg.slug, ofAnterior.leitura, ofAnterior.jogos);
      }
      await guardarSnapshot(cfg.slug, ofLeitura, ofAtual);
      await registrarSaude('openfootball', cfg.slug, degradado ? 'DEGRADED' : 'HEALTHY', { last_version: versao, failure_reason: degradado, records_received: ofAtual.length });

      // --- Wikipédia: validação
      let wiki;
      try {
        const texto = await wikiTexto(cfg.wikipedia.host, revs[0].revid);
        wiki = { leitura: wikiLeitura(cfg.wikipedia.host, cfg.wikipedia.pagina, revs[0]), tabela: parseTabelaWiki(texto) };
        if (!wiki.tabela.confrontos.length) throw new Error('wikipedia_tabela_vazia_ou_formato_mudou');
      } catch (e) {
        await registrarSaude('wikipedia', cfg.slug, 'FAILED', { failure_reason: String((e as Error).message ?? e) });
        return { competicao: cfg.slug, status: 'FALHA', detalhe: `wikipedia: ${(e as Error).message}` }; // mantém o último publicado
      }
      resultado = reconciliarLiga({ cfg, agora, openfootball: { leitura: ofLeitura, jogos: ofAtual }, openfootballAnterior: ofAnterior, wikipedia: wiki, publicadosAntes: await publicadosAntes(comp.id) });
      const d = resultado.diagnostico;
      await registrarSaude('wikipedia', cfg.slug, d.times_ok ? 'HEALTHY' : 'DEGRADED', {
        last_version: wiki.leitura.versao, records_received: wiki.tabela.confrontos.length,
        failure_reason: d.times_ok ? null : `times_sem_correspondencia: ${[...d.times_faltando, ...d.times_ambiguos].join(', ')}`,
      });
    } catch (e) {
      await registrarSaude('openfootball', cfg.slug, 'FAILED', { failure_reason: String((e as Error).message ?? e) });
      throw e;
    }
  } else {
    // --- Champions (PARTIAL): revisão atual + revisão >= 30 min mais antiga
    const revs = await wikiRevisoes(cfg.wikipedia.host, cfg.wikipedia.pagina, 50);
    const atualRev = revs[0];
    const anteriorRev = revs.find((r) => Date.parse(atualRev.timestamp) - Date.parse(r.timestamp) >= REVISAO_MIN_DIFERENCA_MS) ?? null;
    const ultima = await saudeAtual('wikipedia', cfg.slug);
    if (!forcar && recente && ultima?.last_version === String(atualRev.revid)) return { competicao: cfg.slug, status: 'SEM_MUDANCA' };
    let atual: { leitura: Leitura; jogos: JogoWikiBox[] }; let anterior: { leitura: Leitura; jogos: JogoWikiBox[] } | null = null;
    try {
      atual = { leitura: wikiLeitura(cfg.wikipedia.host, cfg.wikipedia.pagina, atualRev), jogos: parseFootballBoxes(await wikiTexto(cfg.wikipedia.host, atualRev.revid)) };
      if (!atual.jogos.length) throw new Error('wikipedia_sem_jogos_ou_formato_mudou');
      if (anteriorRev) anterior = { leitura: wikiLeitura(cfg.wikipedia.host, cfg.wikipedia.pagina, anteriorRev), jogos: parseFootballBoxes(await wikiTexto(cfg.wikipedia.host, anteriorRev.revid)) };
    } catch (e) {
      await registrarSaude('wikipedia', cfg.slug, 'FAILED', { failure_reason: String((e as Error).message ?? e) });
      throw e;
    }
    await guardarSnapshot(cfg.slug, atual.leitura, atual.jogos);
    resultado = reconciliarBoxes({ cfg, agora, atual, anterior, publicadosAntes: await publicadosAntes(comp.id) });
    await registrarSaude('wikipedia', cfg.slug, anterior ? 'HEALTHY' : 'DEGRADED', {
      last_version: atual.leitura.versao, records_received: atual.jogos.length, failure_reason: anterior ? null : 'sem_revisao_anterior_30min',
    });
  }

  const { alterados, mudouPublicacao } = await persistir(cfg, comp.id, resultado, runId);
  const d = resultado.diagnostico;
  await db.from('content_sports_source_health').update({
    records_accepted: d.publicados, records_rejected: d.recebidos - d.publicados, records_changed: alterados,
  }).eq('competicao', cfg.slug);
  return { competicao: cfg.slug, status: d.times_ok ? 'OK' : 'DEGRADADO', recebidos: d.recebidos, publicados: d.publicados, alterados, pendentes: d.pendentes, conflitos: d.conflitos, suspeitos: d.suspeitos, mudouPublicacao };
}

// ------------------------------------------------------------------ entrada
Deno.serve(async (req) => {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!SEGREDO || token !== SEGREDO) return resposta(401, { error: 'nao_autorizado' });

  let corpo: { trigger?: string; forcar?: boolean; competicoes?: string[] } = {};
  try { corpo = await req.json(); } catch { /* corpo vazio */ }
  const forcar = corpo.forcar === true;
  const trigger = corpo.trigger === 'manual' ? 'manual' : 'cron';

  // Modo: MATCHDAY quando há jogo terminando/começando perto de agora; NORMAL no máximo 1x/hora.
  const agora = Date.now();
  const { count: perto } = await db.from('content_sports_fixtures').select('id', { count: 'exact', head: true })
    .gte('kickoff_utc', new Date(agora - 8 * 3600e3).toISOString()).lte('kickoff_utc', new Date(agora + 2 * 3600e3).toISOString());
  const modo = forcar ? 'FORCED' : (perto ?? 0) > 0 ? 'MATCHDAY' : 'NORMAL';
  if (modo === 'NORMAL') {
    const { data: ultima } = await db.from('content_sports_runs').select('started_at').in('status', ['SUCCESS', 'PARTIAL'])
      .order('started_at', { ascending: false }).limit(1).maybeSingle();
    if (ultima && agora - Date.parse(ultima.started_at) < INTERVALO_NORMAL_MS) return resposta(200, { status: 'SKIPPED', modo, motivo: 'intervalo_normal' });
  }

  const { data: run } = await db.from('content_sports_runs').insert({ trigger, modo }).select('id').single();
  const runId = (run as { id: string }).id;
  const { data: comps } = await db.from('content_sports_competitions').select('id, slug, last_sync_at').is('empresa_operadora_id', null).eq('ativo', true);
  const porSlug = new Map((comps ?? []).map((c: { id: string; slug: string; last_sync_at: string | null }) => [c.slug, c]));
  const estatisticas: Estatistica[] = [];
  for (const cfg of COMPETICOES) {
    if (corpo.competicoes?.length && !corpo.competicoes.includes(cfg.slug)) continue;
    const comp = porSlug.get(cfg.slug);
    if (!comp) continue;
    try {
      estatisticas.push(await processar(cfg, comp, forcar, runId));
    } catch (e) {
      const msg = String((e as Error).message ?? e).slice(0, 500);
      await db.from('content_sports_competitions').update({ last_sync_error: msg, updated_at: new Date().toISOString() }).eq('id', comp.id);
      estatisticas.push({ competicao: cfg.slug, status: 'FALHA', detalhe: msg });
    }
  }

  const mudou = estatisticas.some((s) => s.mudouPublicacao);
  let playlistsTocadas = 0;
  if (mudou) {
    const { data } = await db.rpc('content_touch_widgets', { p_tipo: 'sports' });
    playlistsTocadas = Number(data ?? 0);
  }
  const falhas = estatisticas.filter((s) => s.status === 'FALHA').length;
  const status = falhas === 0 ? 'SUCCESS' : falhas === estatisticas.length ? 'FAILED' : 'PARTIAL';
  await db.from('content_sports_runs').update({ finished_at: new Date().toISOString(), status, publicou_mudancas: mudou, detalhes: { competicoes: estatisticas, playlistsTocadas } }).eq('id', runId);
  // Histórico de execuções: 30 dias.
  await db.from('content_sports_runs').delete().lt('started_at', new Date(agora - 30 * 86400e3).toISOString());
  return resposta(200, { status, modo, runId, competicoes: estatisticas, playlistsTocadas });
});
