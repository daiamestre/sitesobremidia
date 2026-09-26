import type { ConfigCompeticao } from './competicoes.ts';
import { localParaUtc, dataNoFuso } from './fuso.ts';
import { corresponderTimes, normalizarNome } from './times.ts';
import type { JogoOpenfootball, JogoWikiBox, Leitura, PartidaCanonica, Placar, StatusPartida, TabelaWiki } from './tipos.ts';

/** Estado publicado antes desta execução (para detectar mudanças e mudanças suspeitas). */
export interface Publicado { status: StatusPartida; placar: Placar | null; kickoff_utc: string | null; data_local: string; hora_local: string | null }

export type TipoEvento = 'MATCH_SCHEDULE_CHANGED' | 'RESULT_CONFIRMED' | 'CONFLICT' | 'SUSPICIOUS_CHANGE' | 'MATCH_UNPUBLISHED' | 'MATCH_PUBLISHED';
export interface Evento { tipo: TipoEvento; match_key: string; antes: unknown; depois: unknown }

export interface Resultado {
  partidas: PartidaCanonica[];
  eventos: Evento[];
  diagnostico: { recebidos: number; publicados: number; pendentes: number; conflitos: number; suspeitos: number; desconhecidos: number; times_ok: boolean; times_faltando: string[]; times_ambiguos: string[] };
}

/** Goleada ou placar implausível exige confirmação extra antes de publicar. */
export const LIMITE_GOLEADA = 7;
export const LIMITE_GOLS = 15;
/** Depois do início, um jogo sem resultado não é "próximo" nem "resultado" (não há placar ao vivo). */
const JANELA_JOGO_MS = 3 * 60 * 60 * 1000;

const igualPlacar = (a: Placar | null, b: Placar | null) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
const goleada = (p: Placar) => Math.abs(p[0] - p[1]) >= LIMITE_GOLEADA;
const implausivel = (p: Placar) => p[0] > LIMITE_GOLS || p[1] > LIMITE_GOLS;

function finalizar(partidas: PartidaCanonica[], publicadosAntes: Map<string, Publicado>, eventos: Evento[], times: { ok: boolean; faltando: string[]; ambiguos: string[] }): Resultado {
  for (const p of partidas) {
    const antes = publicadosAntes.get(p.match_key);
    if (!antes) { if (p.publicar) eventos.push({ tipo: 'MATCH_PUBLISHED', match_key: p.match_key, antes: null, depois: resumo(p) }); continue; }
    // Placar já publicado que muda: suspeito. Sai do ar e só volta quando as fontes concordarem de novo (execução seguinte).
    if (antes.status === 'FINISHED' && antes.placar && p.placar && !igualPlacar(antes.placar, p.placar)) {
      eventos.push({ tipo: 'SUSPICIOUS_CHANGE', match_key: p.match_key, antes, depois: resumo(p) });
      p.publicar = false; p.estado = 'SUSPICIOUS'; p.motivo = 'placar_publicado_mudou';
      continue;
    }
    if (p.publicar && antes.status === 'SCHEDULED' && p.status === 'FINISHED') eventos.push({ tipo: 'RESULT_CONFIRMED', match_key: p.match_key, antes, depois: resumo(p) });
    if (p.publicar && (antes.kickoff_utc !== p.kickoff_utc || antes.data_local !== p.data_local) && p.status === 'SCHEDULED') eventos.push({ tipo: 'MATCH_SCHEDULE_CHANGED', match_key: p.match_key, antes, depois: resumo(p) });
    if (!p.publicar) eventos.push({ tipo: 'MATCH_UNPUBLISHED', match_key: p.match_key, antes, depois: { estado: p.estado, motivo: p.motivo } });
  }
  const conta = (f: (p: PartidaCanonica) => boolean) => partidas.filter(f).length;
  return {
    partidas, eventos,
    diagnostico: {
      recebidos: partidas.length,
      publicados: conta((p) => p.publicar),
      pendentes: conta((p) => p.estado === 'PENDING_VALIDATION'),
      conflitos: conta((p) => p.estado === 'CONFLICT'),
      suspeitos: conta((p) => p.estado === 'SUSPICIOUS'),
      desconhecidos: conta((p) => p.status === 'UNKNOWN'),
      times_ok: times.ok, times_faltando: times.faltando, times_ambiguos: times.ambiguos,
    },
  };
}

function resumo(p: PartidaCanonica) {
  return { status: p.status, placar: p.placar, kickoff_utc: p.kickoff_utc, data_local: p.data_local, hora_local: p.hora_local };
}

/** Situação temporal de um jogo sem placar. */
function momento(data: string, kickoff: string | null, agora: Date, fuso: string): 'futuro' | 'andamento' | 'passado' {
  if (kickoff) {
    const k = Date.parse(kickoff);
    if (k > agora.getTime()) return 'futuro';
    return agora.getTime() - k < JANELA_JOGO_MS ? 'andamento' : 'passado';
  }
  const hoje = dataNoFuso(agora, fuso);
  return data > hoje ? 'futuro' : data === hoje ? 'andamento' : 'passado';
}

// ------------------------------------------------------------------ Ligas FULL: openfootball + Wikipédia

export interface EntradaLiga {
  cfg: ConfigCompeticao;
  agora: Date;
  openfootball: { leitura: Leitura; jogos: JogoOpenfootball[] };
  openfootballAnterior: { leitura: Leitura; jogos: JogoOpenfootball[] } | null;
  wikipedia: { leitura: Leitura; tabela: TabelaWiki };
  publicadosAntes?: Map<string, Publicado>;
}

export function reconciliarLiga(e: EntradaLiga): Resultado {
  const { cfg, agora } = e;
  const times = corresponderTimes(e.openfootball.jogos.flatMap((j) => [j.mandante, j.visitante]), e.wikipedia.tabela, cfg.apelidos);
  const wiki = new Map(e.wikipedia.tabela.confrontos.map((c) => [`${c.mandante}_${c.visitante}`, c]));
  const anterior = new Map((e.openfootballAnterior?.jogos ?? []).map((j) => [`${j.mandante}_${j.visitante}`, j]));
  const nome = (codigo: string | undefined, fonte: string) => (codigo && (cfg.exibicao?.[codigo] ?? e.wikipedia.tabela.times[codigo]?.rotulo)) || fonte;
  const partidas: PartidaCanonica[] = [];
  const eventos: Evento[] = [];
  const vistos = new Set<string>();

  for (const j of e.openfootball.jogos) {
    const cM = times.mapa[j.mandante];
    const cV = times.mapa[j.visitante];
    const chave = `${cfg.slug}|${cfg.temporada}|${cM ?? normalizarNome(j.mandante)}|${cV ?? normalizarNome(j.visitante)}`;
    if (vistos.has(chave)) continue; // a mesma partida nunca vira duas
    vistos.add(chave);
    const w = cM && cV ? wiki.get(`${cM}_${cV}`) : undefined;
    const prev = anterior.get(`${j.mandante}_${j.visitante}`);
    const kickoff = j.hora ? localParaUtc(j.data, j.hora, cfg.fuso) : null;
    const p: PartidaCanonica = {
      match_key: chave, competicao: cfg.slug, codigo: cfg.codigo, temporada: cfg.temporada, rodada: j.rodada,
      mandante: nome(cM, j.mandante), visitante: nome(cV, j.visitante), mandante_fonte: j.mandante, visitante_fonte: j.visitante,
      data_local: j.data, hora_local: j.hora, fuso_fonte: cfg.fuso, kickoff_utc: kickoff,
      placar: null, status: 'UNKNOWN', estado: 'PENDING_VALIDATION', publicar: false, confianca: null, motivo: null,
      fonte: e.openfootball.leitura, validacao: null,
      evidencia: {
        openfootball: { versao: e.openfootball.leitura.versao, data: j.data, hora: j.hora, placar: j.placar },
        openfootball_anterior: prev ? { versao: e.openfootballAnterior!.leitura.versao, data: prev.data, hora: prev.hora, placar: prev.placar } : null,
        wikipedia: w ? { versao: e.wikipedia.leitura.versao, placar: w.placar, bruto: w.bruto } : null,
      },
    };
    partidas.push(p);

    if (!times.ok || !cM || !cV) { p.motivo = 'times_sem_correspondencia'; continue; }
    if (j.hora && !kickoff) { p.estado = 'REJECTED'; p.motivo = 'data_hora_impossivel'; continue; }

    if (j.placar) {
      p.status = 'FINISHED'; p.placar = j.placar;
      if (implausivel(j.placar)) { p.estado = 'REJECTED'; p.motivo = 'placar_implausivel'; continue; }
      if (!w?.placar) { p.motivo = 'aguardando_confirmacao_wikipedia'; continue; }
      if (!igualPlacar(j.placar, w.placar)) {
        p.estado = 'CONFLICT'; p.motivo = 'fontes_divergem';
        eventos.push({ tipo: 'CONFLICT', match_key: chave, antes: { openfootball: j.placar }, depois: { wikipedia: w.placar } });
        continue;
      }
      if (goleada(j.placar) && !igualPlacar(prev?.placar ?? null, j.placar)) { p.estado = 'SUSPICIOUS'; p.motivo = 'goleada_exige_segunda_leitura'; continue; }
      p.estado = 'VALIDATED'; p.publicar = true; p.confianca = 'DUAL_SOURCE'; p.validacao = e.wikipedia.leitura;
      continue;
    }

    if (w?.placar) { p.motivo = 'aguardando_confirmacao_openfootball'; continue; } // só a Wikipédia tem o resultado
    const quando = momento(j.data, kickoff, agora, cfg.fuso);
    if (quando === 'passado') { p.motivo = 'jogo_passado_sem_resultado'; continue; }
    if (quando === 'andamento') { p.motivo = 'em_andamento_sem_placar_ao_vivo'; continue; }
    p.status = 'SCHEDULED';
    if (!w) { p.motivo = 'confronto_ausente_na_wikipedia'; continue; }
    if (!e.openfootballAnterior || !prev) { p.motivo = 'sem_segunda_leitura'; continue; }
    if (prev.data !== j.data || prev.hora !== j.hora) {
      p.motivo = 'horario_alterado_aguardando_confirmacao';
      eventos.push({ tipo: 'MATCH_SCHEDULE_CHANGED', match_key: chave, antes: { data: prev.data, hora: prev.hora }, depois: { data: j.data, hora: j.hora, confirmado: false } });
      continue;
    }
    p.estado = 'VALIDATED'; p.publicar = true; p.confianca = 'DUAL_SOURCE+DOUBLE_READ'; p.validacao = e.wikipedia.leitura;
  }
  return finalizar(partidas, e.publicadosAntes ?? new Map(), eventos, times);
}

// ------------------------------------------------------------------ Champions (PARTIAL): duas revisões da Wikipédia

export interface EntradaBoxes {
  cfg: ConfigCompeticao;
  agora: Date;
  atual: { leitura: Leitura; jogos: JogoWikiBox[] };
  anterior: { leitura: Leitura; jogos: JogoWikiBox[] } | null;
  publicadosAntes?: Map<string, Publicado>;
}

export function reconciliarBoxes(e: EntradaBoxes): Resultado {
  const { cfg, agora } = e;
  const chaveDe = (j: JogoWikiBox) => `${cfg.slug}|${cfg.temporada}|${normalizarNome(j.mandante)}|${normalizarNome(j.visitante)}`;
  const anterior = new Map((e.anterior?.jogos ?? []).map((j) => [chaveDe(j), j]));
  const partidas: PartidaCanonica[] = [];
  const eventos: Evento[] = [];
  const vistos = new Set<string>();
  for (const j of e.atual.jogos) {
    const chave = chaveDe(j);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const prev = anterior.get(chave);
    const kickoff = j.hora ? localParaUtc(j.data, j.hora, cfg.fuso) : null;
    const p: PartidaCanonica = {
      match_key: chave, competicao: cfg.slug, codigo: cfg.codigo, temporada: cfg.temporada, rodada: null,
      mandante: j.mandante, visitante: j.visitante, mandante_fonte: j.mandante, visitante_fonte: j.visitante,
      data_local: j.data, hora_local: j.hora, fuso_fonte: cfg.fuso, kickoff_utc: kickoff,
      placar: j.placar, status: 'UNKNOWN', estado: 'PENDING_VALIDATION', publicar: false, confianca: null, motivo: null,
      fonte: e.atual.leitura, validacao: null,
      evidencia: {
        wikipedia: { versao: e.atual.leitura.versao, data: j.data, hora: j.hora, placar: j.placar, estadio: j.estadio },
        wikipedia_anterior: prev ? { versao: e.anterior!.leitura.versao, data: prev.data, hora: prev.hora, placar: prev.placar } : null,
      },
    };
    partidas.push(p);
    if (j.hora && !kickoff) { p.estado = 'REJECTED'; p.motivo = 'data_hora_impossivel'; continue; }
    if (j.placar) {
      p.status = 'FINISHED';
      if (implausivel(j.placar)) { p.estado = 'REJECTED'; p.motivo = 'placar_implausivel'; continue; }
    } else {
      const quando = momento(j.data, kickoff, agora, cfg.fuso);
      if (quando === 'passado') { p.motivo = 'jogo_passado_sem_resultado'; continue; }
      if (quando === 'andamento') { p.motivo = 'em_andamento_sem_placar_ao_vivo'; continue; }
      p.status = 'SCHEDULED';
    }
    if (!e.anterior || !prev) { p.motivo = 'sem_segunda_revisao'; continue; }
    if (prev.data !== j.data || prev.hora !== j.hora || JSON.stringify(prev.placar) !== JSON.stringify(j.placar)) {
      p.motivo = 'revisoes_divergem';
      if (prev.data !== j.data || prev.hora !== j.hora) eventos.push({ tipo: 'MATCH_SCHEDULE_CHANGED', match_key: chave, antes: { data: prev.data, hora: prev.hora }, depois: { data: j.data, hora: j.hora, confirmado: false } });
      continue;
    }
    p.estado = 'VALIDATED'; p.publicar = true; p.confianca = 'DOUBLE_READ'; p.validacao = e.anterior.leitura;
  }
  return finalizar(partidas, e.publicadosAntes ?? new Map(), eventos, { ok: true, faltando: [], ambiguos: [] });
}
