/**
 * F-87 — Copa do Brasil (masculino): caixas clássicas da Wikipédia em inglês ({{football box collapsible}}).
 * A primeira caixa é cópia de uma caixa real da página "2026 Copa do Brasil"; as demais são variações de TESTE.
 */
import { describe, it, expect } from 'vitest';
import { lerDataEn, parseCaixasClassicas } from '../../../supabase/functions/_shared/sports/fontes';
import { timesDasCaixasClassicas } from '../../../supabase/functions/_shared/sports/escudos';
import { COMPETICOES, LOCAIS_FORA_DE_BRASILIA } from '../../../supabase/functions/_shared/sports/competicoes';

const REAL = `{{football box collapsible
|round      = G94
|date       = 17 March 2026
|time       = 21:30
|team1      = '''[[Associação Portuguesa de Desportos|Portuguesa]]'''
|score      = 2–3
|report     = https://www.cbf.com.br/futebol-brasileiro/jogos/copa-do-brasil/masculino/2026/portuguesa-saf-x-paysandu/833536
|team2      = [[Paysandu Sport Club|Paysandu]]
|stadium    = [[Estádio do Canindé|Canindé]]
|location   = [[São Paulo]]
}}`;
const caixa = (o: Record<string, string>) => `{{football box collapsible\n${Object.entries(o).map(([k, v]) => `|${k} = ${v}`).join('\n')}\n}}`;
const cdb = COMPETICOES.find((c) => c.slug === 'copa-do-brasil')!;
const op = { exibicao: cdb.exibicaoPorRotulo, locaisForaDoFuso: LOCAIS_FORA_DE_BRASILIA };

describe('Copa do Brasil — caixas da Wikipédia em inglês', () => {
  it('lê a caixa real: data, horário de Brasília, times, placar e estádio', () => {
    expect(parseCaixasClassicas(REAL, op)).toEqual([
      { data: '2026-03-17', hora: '21:30', mandante: 'Portuguesa', visitante: 'Paysandu', placar: [2, 3], estadio: 'Canindé' },
    ]);
  });

  it('nome de exibição igual ao do Brasileirão (mesmo escudo conferido) e jogo futuro sem placar', () => {
    const wt = caixa({ date: '1 November 2026', time: '21:30', team1: "[[Clube Atlético Mineiro|Atlético Mineiro]]", score: 'v', team2: '[[CR Vasco da Gama|Vasco da Gama]]', location: '[[Belo Horizonte]]' });
    expect(parseCaixasClassicas(wt, op)).toEqual([
      { data: '2026-11-01', hora: '21:30', mandante: 'Atlético-MG', visitante: 'Vasco', placar: null, estadio: null },
    ]);
  });

  it('nunca publica horário possivelmente errado: cidade de outro fuso ou outro UTC declarado ficam de fora', () => {
    const emCuiaba = caixa({ date: '2 August 2026', time: '19:00', team1: '[[Cuiabá Esporte Clube|Cuiabá]]', score: '1–0', team2: '[[Santos FC|Santos]]', location: '[[Cuiabá]]' });
    const utc4 = caixa({ date: '2 August 2026', time: '19:00 [[UTC−4]]', team1: '[[A]]', score: '1–0', team2: '[[B]]', location: '[[Belém]]' });
    const utc3 = caixa({ date: '2 August 2026', time: '19:00 [[UTC−3]]', team1: '[[A]]', score: '1–0', team2: '[[B]]', location: '[[Belém]]' });
    expect(parseCaixasClassicas(emCuiaba + '\n' + utc4 + '\n' + utc3, op).map((j) => j.mandante)).toEqual(['A']);
  });

  it('pênaltis: vale o placar do tempo normal; data ilegível: jogo fora', () => {
    const pen = caixa({ date: '5 August 2026', time: '21:30', team1: '[[A]]', score: '1–1 (4–3 [[Penalty shoot-out (association football)|p]])', team2: '[[B]]', location: '[[Recife]]' });
    const semData = caixa({ date: 'TBD', time: '21:30', team1: '[[A]]', score: 'v', team2: '[[B]]', location: '[[Recife]]' });
    expect(parseCaixasClassicas(pen + '\n' + semData, op)).toEqual([
      { data: '2026-08-05', hora: '21:30', mandante: 'A', visitante: 'B', placar: [1, 1], estadio: null },
    ]);
    expect(lerDataEn('{{Start date|2026|11|8}}')).toBe('2026-11-08');
    expect(lerDataEn('November 8, 2026')).toBe('2026-11-08');
  });

  it('escudos: time -> artigo do clube na própria caixa, com o nome de exibição', () => {
    expect(timesDasCaixasClassicas(REAL, cdb.exibicaoPorRotulo)).toEqual([
      { rotulo: 'Portuguesa', artigo: 'Associação Portuguesa de Desportos', predefinicao: null },
      { rotulo: 'Paysandu', artigo: 'Paysandu Sport Club', predefinicao: null },
    ]);
  });
});
