/** Widget Esportes (painel/Player web) + Conteúdo automático na Biblioteca. Dados de TESTE (formato do servidor). */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SportsWidget } from '@/components/player/SportsWidget';
import { centroDoJogo, dataCurta, jogosVisiveis, type DadosEsportes, type JogoEsporte } from '@/lib/esportes';
import { WidgetCatalog } from '@/components/dashboard/widgets/WidgetCatalog';
import { templateDoWidget, WIDGET_TEMPLATES } from '@/lib/widgetCatalog';

const jogo = (o: Partial<JogoEsporte>): JogoEsporte => ({
  competicao: 'Brasileirão Série A', codigo: 'BSA', slug: 'brasileirao', rodada: 'Matchday 28', mandante: 'Flamengo', visitante: 'Bragantino',
  placarMandante: 2, placarVisitante: 1, status: 'FINISHED', data: '2026-09-20', hora: '18:30', kickoffUtc: '2026-09-20T21:30:00+00:00', ...o,
});
const dados = (modo: DadosEsportes['modo'], jogos: JogoEsporte[]): DadosEsportes => ({
  modo, fuso: 'America/Sao_Paulo', geradoEm: '2026-09-26T08:00:00Z', competicoes: [], jogos, creditos: 'Dados: openfootball (CC0) · Wikipédia (CC BY-SA)',
});

describe('Esportes — regras de exibição', () => {
  it('placar só para jogo encerrado; horário ou "a definir" para os demais', () => {
    expect(centroDoJogo(jogo({}))).toEqual({ principal: '2 × 1', encerrado: true });
    expect(centroDoJogo(jogo({ status: 'SCHEDULED', placarMandante: null, placarVisitante: null, hora: '20:00' }))).toEqual({ principal: '20:00', encerrado: false });
    expect(centroDoJogo(jogo({ status: 'SCHEDULED', placarMandante: null, placarVisitante: null, hora: null }))).toEqual({ principal: 'a definir', encerrado: false });
  });
  it('data curta em pt-BR sem trocar o dia', () => {
    expect(dataCurta('2026-10-02')).toBe('sex 02/10');
    expect(dataCurta('2026-10-03')).toBe('sáb 03/10');
  });
  it('próximos: jogo que já começou sai da lista (sem placar ao vivo)', () => {
    const d = dados('proximos', [
      jogo({ mandante: 'São Paulo', visitante: 'Santos', status: 'SCHEDULED', placarMandante: null, placarVisitante: null, kickoffUtc: '2026-10-02T23:00:00Z' }),
      jogo({ mandante: 'Levante', visitante: 'Athletic', status: 'SCHEDULED', placarMandante: null, placarVisitante: null, hora: null, kickoffUtc: null }),
    ]);
    expect(jogosVisiveis(d, new Date('2026-10-02T22:59:00Z')).map((j) => j.mandante)).toEqual(['São Paulo', 'Levante']);
    expect(jogosVisiveis(d, new Date('2026-10-02T23:01:00Z')).map((j) => j.mandante)).toEqual(['Levante']);
  });
});

describe('Esportes — componente', () => {
  it('mostra os jogos confirmados, placar e FINAL, com créditos e horário de Brasília', () => {
    render(<SportsWidget config={{ modo: 'resultados' }} dados={dados('resultados', [jogo({}), jogo({ mandante: 'Corinthians', visitante: 'Fluminense', placarMandante: 1, placarVisitante: 3 })])} />);
    const linhas = screen.getAllByTestId('sports-jogo');
    expect(linhas).toHaveLength(2);
    expect(within(linhas[0]).getByText('2 × 1')).toBeInTheDocument();
    expect(within(linhas[0]).getByText('FINAL')).toBeInTheDocument();
    expect(screen.getByTestId('sports-competicao')).toHaveTextContent('Brasileirão Série A');
    expect(screen.getByText(/Horário de Brasília · Dados: openfootball/)).toBeInTheDocument();
    expect(screen.getByText(/RESULTADOS/)).toBeInTheDocument();
  });
  it('sem jogo confirmado: avisa (no Player o servidor nem envia o widget)', () => {
    render(<SportsWidget config={{ modo: 'hoje' }} dados={dados('hoje', [])} />);
    expect(screen.getByTestId('sports-vazio')).toHaveTextContent('Sem jogos confirmados');
    expect(screen.getByText(/JOGOS DE HOJE/)).toBeInTheDocument();
  });
});

describe('Esportes — catálogo', () => {
  it('modelos de Esportes e Notícias de Esportes na Galeria, com capa viva; RSS antigo continua "Notícias (RSS)"', () => {
    render(<WidgetCatalog onUsar={vi.fn()} />);
    for (const id of ['sports-resultados', 'sports-proximos', 'sports-hoje', 'rss-esportes']) expect(screen.getByTestId(`template-${id}`)).toBeInTheDocument();
    expect(screen.getByTestId('capa-sports-resultados')).toBeInTheDocument();
    expect(templateDoWidget('rss', {})?.id).toBe('rss-classic');
    expect(templateDoWidget('sports', { template: 'sports-proximos' })?.id).toBe('sports-proximos');
    expect(WIDGET_TEMPLATES.filter((t) => t.tipo === 'sports')).toHaveLength(3);
  });
});
