/** Widget Esportes (painel/Player web) + Conteúdo automático na Biblioteca. Dados de TESTE (formato do servidor). */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import { SportsWidget } from '@/components/player/SportsWidget';
import { centroDoJogo, dataCurta, jogosVisiveis, type DadosEsportes, type JogoEsporte } from '@/lib/esportes';
import { WidgetCatalog } from '@/components/dashboard/widgets/WidgetCatalog';
import { templateDoWidget, WIDGET_TEMPLATES } from '@/lib/widgetCatalog';
import type { JogoJanela } from '@/lib/esportesPaginas';

const jogo = (o: Partial<JogoEsporte>): JogoEsporte => ({
  competicao: 'Brasileirão Série A', codigo: 'BSA', slug: 'brasileirao', rodada: 'Matchday 28', mandante: 'Flamengo', visitante: 'Bragantino',
  placarMandante: 2, placarVisitante: 1, status: 'FINISHED', data: '2026-09-20', hora: '18:30', kickoffUtc: '2026-09-20T21:30:00+00:00', ...o,
});
const dados = (modo: DadosEsportes['modo'], jogos: JogoEsporte[]): DadosEsportes => ({
  modo, fuso: 'America/Sao_Paulo', geradoEm: '2026-09-26T08:00:00Z', competicoes: [], jogos, creditos: 'Dados: openfootball (CC0) · Wikipédia (CC BY-SA)',
});

describe('Esportes — regras antigas (Players 5.6.0/5.6.1 ainda usam a lista "jogos")', () => {
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

const jj = (slug: string, data: string, hora: string, mandante: string, visitante: string, placar: [number, number] | null, escudos = true): JogoJanela => ({
  competicao: slug === 'brasileirao' ? 'Brasileirão Série A' : 'La Liga', codigo: slug === 'brasileirao' ? 'BSA' : 'PD', slug,
  ordemCompeticao: slug === 'brasileirao' ? 0 : 2, mandante, visitante, placarMandante: placar?.[0] ?? null, placarVisitante: placar?.[1] ?? null,
  status: placar ? 'FINISHED' : 'SCHEDULED', data, hora, kickoffUtc: new Date(`${data}T${hora}:00-03:00`).toISOString(),
  escudoMandante: escudos ? `https://teste.exemplo/${mandante}.png` : null, escudoVisitante: escudos ? `https://teste.exemplo/${visitante}.png` : null,
});
const v2 = (janela: JogoJanela[]): DadosEsportes => ({
  ...dados('resultados', []), layout: 2, referencia: '2026-10-10', janela,
  competicoes: [
    { slug: 'brasileirao', nome: 'Brasileirão Série A', codigo: 'BSA', cobertura: 'FULL', ordem: 0 },
    { slug: 'la-liga', nome: 'La Liga', codigo: 'PD', cobertura: 'FULL', ordem: 2 },
  ],
});
// Hoje = sábado 10/10/2026: resultados de qua/qui/sex, próximos de sáb/dom/seg. Jogos de TESTE.
const JANELA = [
  jj('brasileirao', '2026-10-07', '19:00', 'Flamengo', 'Palmeiras', [2, 1]),
  jj('brasileirao', '2026-10-08', '20:00', 'Corinthians', 'Santos', [0, 0]),
  jj('brasileirao', '2026-10-09', '21:00', 'Bahia', 'Vitória', [1, 3]),
  jj('brasileirao', '2026-10-09', '21:30', 'Grêmio', 'Internacional', [2, 2], false),
  jj('brasileirao', '2026-10-10', '16:00', 'São Paulo', 'Vasco', null),
  jj('brasileirao', '2026-10-11', '18:30', 'Cruzeiro', 'Botafogo', null),
  jj('la-liga', '2026-10-08', '16:00', 'Real Madrid', 'Barcelona', [3, 1]),
];

describe('Esportes v2 — componente (Player web)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-10-10T12:00:00-03:00'));
    localStorage.clear();
  });
  afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

  it('campeonato no topo + "Resultados e próximos jogos"; 3 resultados e os próximos, cada time com o próprio escudo', () => {
    render(<SportsWidget config={{}} dados={v2(JANELA)} widgetId="w1" modo="player" />);
    expect(screen.getByTestId('sports-competicao')).toHaveTextContent('Brasileirão Série A');
    expect(screen.getByTestId('sports-subtitulo')).toHaveTextContent('Resultados e próximos jogos');
    const res = within(screen.getByTestId('sports-secao-resultados')).getAllByTestId('sports-jogo');
    expect(res.map((l) => l.textContent)).toEqual([
      expect.stringMatching(/Flamengo.*2 × 1.*QUA 07\/10.*Palmeiras/),
      expect.stringMatching(/Corinthians.*0 × 0.*QUI 08\/10.*Santos/),
      expect.stringMatching(/Bahia.*1 × 3.*ONTEM.*Vitória/),
    ]);
    expect(within(res[0]).getByAltText('Escudo Flamengo')).toHaveAttribute('src', 'https://teste.exemplo/Flamengo.png');
    expect(within(res[0]).getByAltText('Escudo Palmeiras')).toHaveAttribute('src', 'https://teste.exemplo/Palmeiras.png');
    const prox = within(screen.getByTestId('sports-secao-proximos')).getAllByTestId('sports-jogo');
    expect(prox.map((l) => l.textContent)).toEqual([
      expect.stringMatching(/São Paulo.*16:00.*HOJE.*Vasco/),
      expect.stringMatching(/Cruzeiro.*18:30.*AMANHÃ.*Botafogo/),
    ]);
    expect(screen.getByTestId('sports-pagina')).toHaveTextContent('1/3');
  });

  it('8 s por página, 3 páginas na exibição (Brasileirão 1/2, 2/2, La Liga) e para na 3ª; guarda onde parou', () => {
    render(<SportsWidget config={{}} dados={v2(JANELA)} widgetId="w1" modo="player" />);
    act(() => { vi.advanceTimersByTime(8000); });
    expect(screen.getByTestId('sports-pagina')).toHaveTextContent('2/3');
    const semEscudo = within(screen.getByTestId('sports-secao-resultados')).getAllByTestId('sports-jogo')[0];
    // Sem escudo conferido: iniciais — nunca o escudo de outro time
    expect(within(semEscudo).getAllByTestId('sports-escudo-reserva').map((e) => e.textContent)).toEqual(['GRÊ', 'INT']);
    act(() => { vi.advanceTimersByTime(8000); });
    expect(screen.getByTestId('sports-competicao')).toHaveTextContent('La Liga');
    act(() => { vi.advanceTimersByTime(16000); });
    expect(screen.getByTestId('sports-pagina')).toHaveTextContent('3/3');
    expect(JSON.parse(localStorage.getItem('sm:esportes:cursor:w1')!)).toEqual({ dia: '2026-10-10', proxima: 0 });
  });

  it('próxima exibição continua de onde a anterior parou', () => {
    localStorage.setItem('sm:esportes:cursor:w1', JSON.stringify({ dia: '2026-10-10', proxima: 2 }));
    render(<SportsWidget config={{}} dados={v2(JANELA)} widgetId="w1" modo="player" />);
    expect(screen.getByTestId('sports-competicao')).toHaveTextContent('La Liga');
  });

  it('sem jogos na janela: nenhuma mensagem na tela (nas telas o servidor nem envia o widget) — F-91', () => {
    render(<SportsWidget config={{}} dados={v2([])} widgetId="w1" modo="player" />);
    expect(screen.getByTestId('sports-vazio')).toHaveTextContent(/^$/);
    expect(screen.queryByText(/Sem jogos|Não foi possível|EXEMPLO/)).toBeNull();
  });

  it('prévia com a última rodada real (simulado): sem o aviso amarelo de EXEMPLO — F-91', () => {
    render(<SportsWidget config={{}} dados={{ ...v2(JANELA), simulado: true, referencia: '2026-10-10', agoraReferencia: '2026-10-10T15:00:00Z' }} modo="previa" />);
    expect(screen.queryByTestId('sports-exemplo')).toBeNull();
    expect(screen.queryByText(/EXEMPLO/)).toBeNull();
    expect(screen.getAllByTestId('sports-jogo').length).toBeGreaterThan(0);
  });
});

describe('Esportes — catálogo', () => {
  it('um só modelo de Esportes ("Resultados e Próximos Jogos") e o Esportes News (tipo próprio); modelo antigo salvo cai nele', () => {
    render(<WidgetCatalog onUsar={vi.fn()} />);
    for (const id of ['sports-resultados', 'esportes-news']) expect(screen.getByTestId(`template-${id}`)).toBeInTheDocument();
    expect(screen.getByTestId('capa-sports-resultados')).toBeInTheDocument();
    expect(templateDoWidget('rss', {})?.id).toBe('rss-classic');
    expect(templateDoWidget('sports', { template: 'sports-proximos' })?.id).toBe('sports-resultados');
    expect(WIDGET_TEMPLATES.filter((t) => t.tipo === 'sports').map((t) => t.nome)).toEqual(['Resultados e Próximos Jogos']);
  });
});

describe('Esportes v2 — tudo aparece junto (F-87)', () => {
  const pendentes: Array<() => void> = [];
  let srcOriginal: PropertyDescriptor | undefined;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-10-10T12:00:00-03:00'));
    localStorage.clear();
    // Imagens de TESTE que só "chegam" quando o teste manda (como uma rede lenta).
    (HTMLImageElement.prototype as unknown as { decode: () => Promise<void> }).decode = () => Promise.resolve();
    srcOriginal = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: true,
      get() { return this.getAttribute('src') ?? ''; },
      set(v: string) { this.setAttribute('src', v); pendentes.push(() => this.onload?.(new Event('load'))); },
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (HTMLImageElement.prototype as unknown as { decode?: unknown }).decode;
    if (srcOriginal) Object.defineProperty(HTMLImageElement.prototype, 'src', srcOriginal);
    pendentes.length = 0;
  });

  it('nenhum jogo aparece antes de todos os escudos e o fundo carregarem; depois, tudo de uma vez com o fundo do campeonato', async () => {
    const d = v2(JANELA);
    d.competicoes = d.competicoes.map((c) => ({ ...c, fundoH: `https://teste.exemplo/fundo-${c.slug}-h.jpg`, fundoV: `https://teste.exemplo/fundo-${c.slug}-v.jpg` }));
    render(<SportsWidget config={{}} dados={d} widgetId="w2" modo="player" />);
    expect(screen.queryAllByTestId('sports-jogo')).toHaveLength(0);
    expect(screen.getByTestId('sports-vazio')).toHaveTextContent('Carregando jogos');
    await act(async () => { pendentes.splice(0).forEach((f) => f()); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getAllByTestId('sports-jogo').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('sports-escudo').length).toBeGreaterThan(0);
    expect(screen.getByTestId('sports-fundo-tema')).toHaveAttribute('src', 'https://teste.exemplo/fundo-brasileirao-h.jpg');
  });
});

describe('Esportes v2 — fundo com a taça e o nome da competição (F-88)', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }); vi.setSystemTime(new Date('2026-10-10T12:00:00-03:00')); localStorage.clear(); });
  afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

  it('quando a arte já traz o nome, o título escrito sai (sem nome duplicado) e o subtítulo continua', () => {
    const d = v2(JANELA);
    d.competicoes = d.competicoes.map((c) => ({ ...c, fundoH: `https://teste.exemplo/${c.slug}-h.jpg`, fundoV: `https://teste.exemplo/${c.slug}-v.jpg`, fundoComTitulo: true }));
    render(<SportsWidget config={{}} dados={d} widgetId="w3" modo="player" />);
    expect(screen.getByTestId('sports-titulo-na-arte')).toBeInTheDocument();
    expect(screen.getByTestId('sports-competicao')).toHaveClass('sr-only');
    expect(screen.getByTestId('sports-subtitulo')).toHaveTextContent('Resultados e próximos jogos');
  });

  it('sem a arte (ou com fundo próprio do widget), o título escrito continua', () => {
    render(<SportsWidget config={{}} dados={v2(JANELA)} widgetId="w4" modo="player" />);
    expect(screen.queryByTestId('sports-titulo-na-arte')).toBeNull();
    expect(screen.getByTestId('sports-competicao')).not.toHaveClass('sr-only');
  });
});

describe('Esportes v2 — tela limpa (F-89)', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }); vi.setSystemTime(new Date('2026-10-10T12:00:00-03:00')); localStorage.clear(); });
  afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

  it('sem rodapé visível: nem a fonte dos dados, nem "Horário de Brasília", nem o contador de páginas', () => {
    render(<SportsWidget config={{}} dados={v2(JANELA)} widgetId="w5" modo="player" />);
    expect(screen.queryByText(/openfootball|Wikipédia|Horário de Brasília/)).toBeNull();
    expect(screen.getByTestId('sports-pagina')).toHaveClass('sr-only');
  });

  it('RESULTADOS e PRÓXIMOS JOGOS centralizados (linha dos dois lados)', () => {
    render(<SportsWidget config={{}} dados={v2(JANELA)} widgetId="w6" modo="player" />);
    for (const r of screen.getAllByTestId('sports-rotulo-secao')) expect(r.parentElement).toHaveClass('justify-center');
  });
});
