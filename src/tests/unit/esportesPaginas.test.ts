/**
 * F-86 — regra do widget Esportes v2 com o exemplo do proprietário: hoje é SÁBADO -> resultados de quarta, quinta e sexta;
 * próximos jogos de sábado, domingo e segunda; 3 + 3 por página; campeonato por campeonato; 3 páginas por exibição e
 * a próxima exibição continua de onde parou. Jogos de TESTE.
 */
import { describe, it, expect } from 'vitest';
import {
  cursorDepois, diaEmBrasilia, iniciaisDoTime, montarPaginas, paginasDaExibicao, rotuloDia, somarDias, type JogoJanela,
} from '@/lib/esportesPaginas';

const SABADO_MEIO_DIA = Date.parse('2026-10-10T12:00:00-03:00');

let n = 0;
function jogo(slug: string, data: string, hora: string, status: 'FINISHED' | 'SCHEDULED', placar?: [number, number]): JogoJanela {
  n++;
  return {
    competicao: slug === 'brasileirao' ? 'Brasileirão Série A' : 'La Liga', codigo: slug === 'brasileirao' ? 'BSA' : 'PD', slug,
    mandante: `Casa ${n}`, visitante: `Fora ${n}`, placarMandante: placar?.[0] ?? null, placarVisitante: placar?.[1] ?? null,
    status, data, hora, kickoffUtc: new Date(`${data}T${hora}:00-03:00`).toISOString(),
  };
}
const COMPS = [{ slug: 'brasileirao', nome: 'Brasileirão Série A', ordem: 0 }, { slug: 'la-liga', nome: 'La Liga', ordem: 2 }];

describe('Esportes v2: janela de 3 dias', () => {
  it('sábado: resultados de qua/qui/sex (não de terça nem de hoje); próximos de sáb/dom/seg (não de terça)', () => {
    const janela = [
      jogo('brasileirao', '2026-10-06', '20:00', 'FINISHED', [1, 0]), // terça: fora (D-4)
      jogo('brasileirao', '2026-10-07', '19:00', 'FINISHED', [2, 1]), // quarta
      jogo('brasileirao', '2026-10-08', '21:30', 'FINISHED', [0, 0]), // quinta
      jogo('brasileirao', '2026-10-09', '20:00', 'FINISHED', [3, 2]), // sexta
      jogo('brasileirao', '2026-10-10', '10:00', 'FINISHED', [1, 1]), // sábado já jogado: não é resultado (D-1 é o limite) nem próximo
      jogo('brasileirao', '2026-10-10', '16:00', 'SCHEDULED'),        // sábado, ainda vai começar
      jogo('brasileirao', '2026-10-11', '16:00', 'SCHEDULED'),        // domingo
      jogo('brasileirao', '2026-10-12', '20:00', 'SCHEDULED'),        // segunda
      jogo('brasileirao', '2026-10-13', '20:00', 'SCHEDULED'),        // terça: fora (D+3)
    ];
    const [p] = montarPaginas(janela, COMPS, SABADO_MEIO_DIA);
    expect(p.resultados.map((j) => j.data)).toEqual(['2026-10-07', '2026-10-08', '2026-10-09']);
    expect(p.proximos.map((j) => j.data)).toEqual(['2026-10-10', '2026-10-11', '2026-10-12']);
  });

  it('3 + 3 por página, em ordem de data e horário, campeonato por campeonato (Brasileirão antes de La Liga)', () => {
    const janela = [
      jogo('la-liga', '2026-10-08', '16:00', 'FINISHED', [1, 0]),
      ...['2026-10-07', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-09'].map((d, i) => jogo('brasileirao', d, `1${i}:00`, 'FINISHED', [i, 0])),
      ...['2026-10-10', '2026-10-11'].map((d) => jogo('brasileirao', d, '18:00', 'SCHEDULED')),
      jogo('la-liga', '2026-10-11', '11:00', 'SCHEDULED'),
    ];
    const paginas = montarPaginas(janela, COMPS, SABADO_MEIO_DIA);
    expect(paginas.map((p) => [p.slug, p.resultados.length, p.proximos.length, `${p.parte}/${p.partes}`])).toEqual([
      ['brasileirao', 3, 2, '1/2'],
      ['brasileirao', 2, 0, '2/2'],
      ['la-liga', 1, 1, '1/1'],
    ]);
    const r = paginas[0].resultados;
    expect(r.every((j, i) => i === 0 || Date.parse(j.kickoffUtc!) >= Date.parse(r[i - 1].kickoffUtc!))).toBe(true);
  });

  it('só as competições escolhidas entram (a seleção vem do servidor); sem jogos na janela -> nenhuma página', () => {
    expect(montarPaginas([jogo('brasileirao', '2026-09-30', '20:00', 'FINISHED', [1, 0])], COMPS, SABADO_MEIO_DIA)).toEqual([]);
  });
});

describe('Esportes v2: 3 páginas por exibição e continuação na próxima', () => {
  it('começa do zero, mostra 3 e a próxima exibição continua de onde parou; no fim dá a volta', () => {
    const hoje = '2026-10-10';
    expect(paginasDaExibicao(7, null, hoje)).toEqual([0, 1, 2]);
    let cursor = cursorDepois(2, 7, hoje);
    expect(paginasDaExibicao(7, cursor, hoje)).toEqual([3, 4, 5]);
    cursor = cursorDepois(5, 7, hoje);
    expect(paginasDaExibicao(7, cursor, hoje)).toEqual([6, 0, 1]);
  });
  it('exibição cortada no meio: recomeça na primeira página que não passou', () => {
    expect(paginasDaExibicao(7, cursorDepois(3, 7, '2026-10-10'), '2026-10-10')).toEqual([4, 5, 6]);
  });
  it('dia novo (janela nova) ou cursor fora do total -> começa do início; sem páginas -> nada', () => {
    expect(paginasDaExibicao(7, { dia: '2026-10-09', proxima: 5 }, '2026-10-10')).toEqual([0, 1, 2]);
    expect(paginasDaExibicao(4, { dia: '2026-10-10', proxima: 6 }, '2026-10-10')).toEqual([0, 1, 2]);
    expect(paginasDaExibicao(0, null, '2026-10-10')).toEqual([]);
  });
});

describe('Esportes v2: datas e rótulos', () => {
  it('dia de Brasília (UTC-3) e soma de dias', () => {
    expect(diaEmBrasilia(Date.parse('2026-10-11T02:30:00Z'))).toBe('2026-10-10');
    expect(somarDias('2026-10-01', -3)).toBe('2026-09-28');
    // nunca lança erro: um widget não pode derrubar a tela
    expect(somarDias('', 1)).toBe('');
    expect(rotuloDia('2026-09-19', '')).toBe('SÁB 19/09');
  });
  it('HOJE / AMANHÃ / ONTEM / dia da semana', () => {
    expect(rotuloDia('2026-10-10', '2026-10-10')).toBe('HOJE');
    expect(rotuloDia('2026-10-11', '2026-10-10')).toBe('AMANHÃ');
    expect(rotuloDia('2026-10-09', '2026-10-10')).toBe('ONTEM');
    expect(rotuloDia('2026-10-07', '2026-10-10')).toBe('QUA 07/10');
  });
  it('iniciais do selo de reserva', () => {
    expect(iniciaisDoTime('Flamengo')).toBe('FLA');
    expect(iniciaisDoTime('Manchester United')).toBe('MU');
    expect(iniciaisDoTime('Bodø/Glimt')).toBe('BG');
  });
});
