/**
 * Sports Engine (supabase/functions/_shared/sports) — parsers, fuso, times e reconciliação.
 * Os dados abaixo são AMOSTRAS DE TESTE no formato real das fontes (não são resultados reais).
 */
import { describe, it, expect } from 'vitest';
import { parseOpenfootball, parseTabelaWiki, parseFootballBoxes, lerPlacar } from '../../../supabase/functions/_shared/sports/fontes';
import { localParaUtc, dataNoFuso } from '../../../supabase/functions/_shared/sports/fuso';
import { corresponderTimes } from '../../../supabase/functions/_shared/sports/times';
import { reconciliarLiga, reconciliarBoxes, type Publicado } from '../../../supabase/functions/_shared/sports/reconciliacao';
import { COMPETICOES } from '../../../supabase/functions/_shared/sports/competicoes';
import type { Leitura, JogoOpenfootball, TabelaWiki } from '../../../supabase/functions/_shared/sports/tipos';

const BR = COMPETICOES.find((c) => c.slug === 'brasileirao')!;
const CL = COMPETICOES.find((c) => c.slug === 'champions-league')!;
const leitura = (fonte: 'openfootball' | 'wikipedia', versao: string): Leitura => ({ fonte, versao, url: `https://exemplo/${versao}`, publicadoEm: null });

const tabelaBR = parseTabelaWiki(`
|team1=FLA |team2=PAL |team3=ATP
|name_FLA={{Futebol Flamengo}}
|name_PAL={{Futebol Palmeiras}}
|name_ATP={{Futebol Athletico-PR}}
|match_FLA_PAL=2–1
|match_PAL_FLA=[[Clássico|a]]
|match_FLA_ATP=
|match_ATP_FLA=1-1
|match_PAL_ATP=
|match_ATP_PAL=`);

const jogo = (o: Partial<JogoOpenfootball>): JogoOpenfootball => ({ rodada: 'Matchday 1', data: '2026-09-20', hora: '16:00', mandante: 'CR Flamengo', visitante: 'SE Palmeiras', placar: null, ...o });
const AGORA = new Date('2026-09-26T12:00:00Z');

function liga(jogos: JogoOpenfootball[], anteriores: JogoOpenfootball[] | null, tabela: TabelaWiki = tabelaBR, publicados?: Map<string, Publicado>) {
  return reconciliarLiga({
    cfg: BR, agora: AGORA,
    openfootball: { leitura: leitura('openfootball', 'sha-atual'), jogos },
    openfootballAnterior: anteriores ? { leitura: leitura('openfootball', 'sha-anterior'), jogos: anteriores } : null,
    wikipedia: { leitura: leitura('wikipedia', 'rev-1'), tabela },
    publicadosAntes: publicados,
  });
}

describe('fontes', () => {
  it('openfootball: [0,0] sem ft NÃO é 0x0; ft é o placar', () => {
    const j = parseOpenfootball({ matches: [
      { round: 'Matchday 7', date: '2026-03-19', time: '21:30', team1: 'A', team2: 'B', score: [0, 0] },
      { round: 'Matchday 8', date: '2026-03-22', time: '16:00', team1: 'C', team2: 'D', score: { ht: [1, 0], ft: [2, 1] } },
      { round: 'Matchday 9', date: 'data-ruim', team1: 'E', team2: 'F' },
    ] });
    expect(j).toHaveLength(2);
    expect(j[0].placar).toBeNull();
    expect(j[1].placar).toEqual([2, 1]);
    expect(() => parseOpenfootball({ nada: 1 })).toThrow('openfootball_formato_invalido');
  });

  it('placar da Wikipédia: travessão, hífen e link; "a" e vazio = não disputado', () => {
    expect(lerPlacar('2–1')).toEqual([2, 1]);
    expect(lerPlacar('0-3')).toEqual([0, 3]);
    expect(lerPlacar('[[Atletiba|2–0]]')).toEqual([2, 0]);
    expect(lerPlacar('a')).toBeNull();
    expect(lerPlacar('[[North London derby|a]]')).toBeNull();
    expect(lerPlacar('')).toBeNull();
    expect(lerPlacar('{{Abd}}')).toBeNull();
  });

  it('tabela da Wikipédia (pt e en): times e confrontos', () => {
    expect(tabelaBR.times.ATP.rotulo).toBe('Athletico-PR');
    expect(tabelaBR.confrontos.find((c) => c.mandante === 'FLA' && c.visitante === 'PAL')?.placar).toEqual([2, 1]);
    expect(tabelaBR.confrontos.find((c) => c.mandante === 'PAL' && c.visitante === 'FLA')?.placar).toBeNull();
    const en = parseTabelaWiki(`|name_ARS=[[Arsenal F.C.|Arsenal]]\n|name_CHE=[[Chelsea F.C.|Chelsea]]\n| match_ARS_CHE = [[Arsenal F.C.–Chelsea F.C. rivalry|2–2]]\n|match_CHE_ARS=`);
    expect(en.times.ARS).toEqual({ rotulo: 'Arsenal', artigo: 'Arsenal F.C.' });
    expect(en.confrontos[0].placar).toEqual([2, 2]);
  });

  it('football box (Champions): data, hora CET, times sem bandeira, placar', () => {
    const b = parseFootballBoxes(`{{#invoke:Football box|main
|date       = {{Start date|2026|9|8|df=y}}
|time       = 18:45&nbsp;{{small|(19:45 [[UTC+03:00|UTC+3]])}}
|team1      = [[AEK Athens F.C.|AEK Athens]] {{fbaicon|GRE}}
|score      = 1–0
|team2      = {{fbaicon|AUT}} [[LASK]]
|stadium    = [[Agia Sophia Stadium|OPAP Arena]], Athens
}}`);
    expect(b).toEqual([{ data: '2026-09-08', hora: '18:45', mandante: 'AEK Athens', visitante: 'LASK', placar: [1, 0], estadio: 'OPAP Arena' }]);
  });
});

describe('fuso', () => {
  it('converte horário local de cada competição para UTC (com horário de verão)', () => {
    expect(localParaUtc('2026-09-27', '16:00', 'America/Sao_Paulo')).toBe('2026-09-27T19:00:00.000Z');
    expect(localParaUtc('2026-08-22', '12:30', 'Europe/London')).toBe('2026-08-22T11:30:00.000Z'); // BST
    expect(localParaUtc('2026-12-05', '15:00', 'Europe/London')).toBe('2026-12-05T15:00:00.000Z'); // GMT
    expect(localParaUtc('2026-10-13', '21:00', 'Europe/Paris')).toBe('2026-10-13T19:00:00.000Z');  // CEST
    expect(localParaUtc('2026-11-03', '21:00', 'Europe/Paris')).toBe('2026-11-03T20:00:00.000Z');  // CET
    expect(localParaUtc('2026-02-31', '20:00', 'Europe/Madrid')).toBeNull();
    expect(localParaUtc('2026-09-27', '25:00', 'Europe/Madrid')).toBeNull();
  });
  it('data de hoje no fuso de Brasília', () => {
    expect(dataNoFuso(new Date('2026-09-27T02:30:00Z'), 'America/Sao_Paulo')).toBe('2026-09-26');
  });
});

describe('times', () => {
  it('bijeção com apelidos; time desconhecido bloqueia', () => {
    const ok = corresponderTimes(['CR Flamengo', 'SE Palmeiras', 'CA Paranaense'], tabelaBR, BR.apelidos);
    expect(ok.ok).toBe(true);
    expect(ok.mapa).toEqual({ 'CR Flamengo': 'FLA', 'SE Palmeiras': 'PAL', 'CA Paranaense': 'ATP' });
    const falha = corresponderTimes(['CR Flamengo', 'Time Inexistente FC'], tabelaBR, BR.apelidos);
    expect(falha.ok).toBe(false);
    expect(falha.faltando).toEqual(['Time Inexistente FC']);
  });
});

describe('reconciliação — ligas (openfootball + Wikipédia)', () => {
  it('resultado igual nas duas fontes: publica (DUAL_SOURCE)', () => {
    const r = liga([jogo({ placar: [2, 1] })], null);
    expect(r.partidas[0]).toMatchObject({ estado: 'VALIDATED', publicar: true, status: 'FINISHED', placar: [2, 1], confianca: 'DUAL_SOURCE', mandante: 'Flamengo', visitante: 'Palmeiras' });
    expect(r.partidas[0].kickoff_utc).toBe('2026-09-20T19:00:00.000Z');
  });

  it('fontes divergem: CONFLICT, não publica e registra evento', () => {
    const r = liga([jogo({ placar: [3, 1] })], null);
    expect(r.partidas[0]).toMatchObject({ estado: 'CONFLICT', publicar: false });
    expect(r.eventos.map((e) => e.tipo)).toContain('CONFLICT');
  });

  it('resultado só no openfootball ou só na Wikipédia: pendente', () => {
    const soOF = liga([jogo({ mandante: 'CR Flamengo', visitante: 'CA Paranaense', placar: [1, 0] })], null);
    expect(soOF.partidas[0]).toMatchObject({ estado: 'PENDING_VALIDATION', publicar: false, motivo: 'aguardando_confirmacao_wikipedia' });
    const soWiki = liga([jogo({ mandante: 'CA Paranaense', visitante: 'CR Flamengo', data: '2026-09-21', placar: null })], null);
    expect(soWiki.partidas[0]).toMatchObject({ publicar: false, motivo: 'aguardando_confirmacao_openfootball' });
  });

  it('próximo jogo: exige 2 commits iguais + confronto na Wikipédia', () => {
    const futuro = jogo({ mandante: 'SE Palmeiras', visitante: 'CR Flamengo', data: '2026-09-30', hora: '21:30' });
    const semSegunda = liga([futuro], null);
    expect(semSegunda.partidas[0]).toMatchObject({ status: 'SCHEDULED', publicar: false, motivo: 'sem_segunda_leitura' });
    const ok = liga([futuro], [futuro]);
    expect(ok.partidas[0]).toMatchObject({ status: 'SCHEDULED', publicar: true, confianca: 'DUAL_SOURCE+DOUBLE_READ', kickoff_utc: '2026-10-01T00:30:00.000Z' });
  });

  it('mudança de horário: MATCH_SCHEDULE_CHANGED e aguarda confirmação (sem duplicar o jogo)', () => {
    const antes = jogo({ mandante: 'SE Palmeiras', visitante: 'CR Flamengo', data: '2026-09-30', hora: '20:00' });
    const depois = { ...antes, hora: '21:30' };
    const r = liga([depois], [antes]);
    expect(r.partidas).toHaveLength(1);
    expect(r.partidas[0]).toMatchObject({ publicar: false, motivo: 'horario_alterado_aguardando_confirmacao' });
    expect(r.eventos.find((e) => e.tipo === 'MATCH_SCHEDULE_CHANGED')).toBeTruthy();
  });

  it('jogo passado sem placar: UNKNOWN; em andamento: não aparece (sem placar ao vivo)', () => {
    const passado = liga([jogo({ mandante: 'SE Palmeiras', visitante: 'CA Paranaense', data: '2026-09-10' })], null);
    expect(passado.partidas[0]).toMatchObject({ status: 'UNKNOWN', publicar: false, motivo: 'jogo_passado_sem_resultado' });
    const andamento = liga([jogo({ mandante: 'SE Palmeiras', visitante: 'CA Paranaense', data: '2026-09-26', hora: '08:30' })], null);
    expect(andamento.partidas[0]).toMatchObject({ publicar: false, motivo: 'em_andamento_sem_placar_ao_vivo' });
  });

  it('goleada exige segunda leitura; placar implausível é rejeitado', () => {
    const tab = parseTabelaWiki('|name_FLA={{Futebol Flamengo}}\n|name_PAL={{Futebol Palmeiras}}\n|match_FLA_PAL=7–0\n|match_PAL_FLA=16–0');
    const g = jogo({ placar: [7, 0] });
    expect(liga([g], null, tab).partidas[0]).toMatchObject({ estado: 'SUSPICIOUS', publicar: false });
    expect(liga([g], [g], tab).partidas[0]).toMatchObject({ estado: 'VALIDATED', publicar: true });
    const absurdo = jogo({ mandante: 'SE Palmeiras', visitante: 'CR Flamengo', placar: [16, 0] });
    expect(liga([absurdo], null, tab).partidas[0]).toMatchObject({ estado: 'REJECTED', publicar: false });
  });

  it('placar já publicado que muda: SUSPICIOUS_CHANGE e sai do ar', () => {
    const chave = 'brasileirao|2026|FLA|PAL';
    const publicados = new Map<string, Publicado>([[chave, { status: 'FINISHED', placar: [1, 1], kickoff_utc: null, data_local: '2026-09-20', hora_local: '16:00' }]]);
    const r = liga([jogo({ placar: [2, 1] })], null, tabelaBR, publicados);
    expect(r.partidas[0]).toMatchObject({ estado: 'SUSPICIOUS', publicar: false });
    expect(r.eventos.map((e) => e.tipo)).toContain('SUSPICIOUS_CHANGE');
  });

  it('mesma partida repetida na fonte: uma só linha', () => {
    const r = liga([jogo({ placar: [2, 1] }), jogo({ placar: [2, 1] })], null);
    expect(r.partidas).toHaveLength(1);
  });

  it('time sem correspondência: nada é publicado na competição', () => {
    const r = liga([jogo({ placar: [2, 1] }), jogo({ mandante: 'Clube Novo FC', visitante: 'SE Palmeiras', data: '2026-10-01' })], null);
    expect(r.diagnostico.times_ok).toBe(false);
    expect(r.partidas.every((p) => !p.publicar)).toBe(true);
  });
});

describe('reconciliação — Champions (PARTIAL, 2 revisões)', () => {
  const box = { data: '2026-10-13', hora: '21:00', mandante: 'Arsenal', visitante: 'Lille', placar: null, estadio: null };
  const boxes = (atual: typeof box[], anterior: typeof box[] | null) => reconciliarBoxes({
    cfg: CL, agora: AGORA,
    atual: { leitura: leitura('wikipedia', 'rev-2'), jogos: atual },
    anterior: anterior ? { leitura: leitura('wikipedia', 'rev-1'), jogos: anterior } : null,
  });
  it('duas revisões iguais: publica (DOUBLE_READ) com horário CET convertido', () => {
    const r = boxes([box], [box]);
    expect(r.partidas[0]).toMatchObject({ publicar: true, confianca: 'DOUBLE_READ', status: 'SCHEDULED', kickoff_utc: '2026-10-13T19:00:00.000Z' });
  });
  it('sem revisão anterior ou revisões divergentes: não publica', () => {
    expect(boxes([box], null).partidas[0]).toMatchObject({ publicar: false, motivo: 'sem_segunda_revisao' });
    const r = boxes([{ ...box, hora: '18:45' }], [box]);
    expect(r.partidas[0]).toMatchObject({ publicar: false, motivo: 'revisoes_divergem' });
    expect(r.eventos.map((e) => e.tipo)).toContain('MATCH_SCHEDULE_CHANGED');
  });
  it('resultado confirmado em duas revisões', () => {
    const fim = { ...box, data: '2026-09-08', hora: '18:45', placar: [1, 0] as [number, number] };
    expect(boxes([fim], [fim]).partidas[0]).toMatchObject({ publicar: true, status: 'FINISHED', placar: [1, 0] });
  });
});
