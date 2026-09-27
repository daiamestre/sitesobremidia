/** Esportes News (F-90): widget próprio, separado de Notícias (RSS); notícia sempre com a imagem da notícia. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
import { render, screen, act } from '@testing-library/react';
import { SportsNewsWidget } from '@/components/player/SportsNewsWidget';
import {
  creditoDaNoticia, DURACAO_WIDGET_ESPORTES_NEWS, indicesDaExibicao, noticiasComImagem, proximaDepois, quandoPublicada,
  type DadosEsportesNews, type NoticiaEsporte,
} from '@/lib/esportesNews';
import { TIPO_LABEL, WIDGET_TEMPLATES } from '@/lib/widgetCatalog';

const N = (id: string, o: Partial<NoticiaEsporte> = {}): NoticiaEsporte => ({
  id, titulo: `Notícia ${id}`, resumo: `Resumo ${id}`, imagem: `https://imagens.ebc.com.br/${id}/1170x700/smart/foto.jpg`,
  creditoImagem: 'Tânia Rêgo/Agência Brasil', fonte: 'Agência Brasil', licenca: 'CC BY 4.0', publicadoEm: '2026-09-27T15:30:00Z', ...o,
});
const dados = (itens: NoticiaEsporte[]): DadosEsportesNews => ({ geradoEm: '2026-09-27T16:00:00Z', itens });

beforeEach(() => { rpc.mockReset(); localStorage.clear(); });

describe('Esportes News — regras', () => {
  it('notícia sem imagem https (ou sem título) nunca entra', () => {
    const itens = [N('a'), N('b', { imagem: '' }), N('c', { imagem: 'http://x.com/a.jpg' }), N('d', { titulo: ' ' }), N('e')];
    expect(noticiasComImagem(itens).map((n) => n.id)).toEqual(['a', 'e']);
    expect(noticiasComImagem(null)).toEqual([]);
  });

  it('3 notícias por exibição, continuando da seguinte; poucas notícias não se repetem na mesma exibição', () => {
    const itens = ['a', 'b', 'c', 'd', 'e'].map((id) => N(id));
    expect(indicesDaExibicao(itens, null)).toEqual([0, 1, 2]);
    expect(proximaDepois(itens, 2)).toBe('d');
    expect(indicesDaExibicao(itens, 'd')).toEqual([3, 4, 0]);
    expect(indicesDaExibicao(itens, 'sumiu')).toEqual([0, 1, 2]); // notícia que expirou: recomeça da mais nova
    expect(indicesDaExibicao([N('x')], null)).toEqual([0]);
    expect(indicesDaExibicao([], null)).toEqual([]);
    expect(DURACAO_WIDGET_ESPORTES_NEWS).toBe(24);
  });

  it('crédito da imagem sempre na tela', () => {
    expect(creditoDaNoticia({ creditoImagem: 'Tânia Rêgo/Agência Brasil', fonte: 'Agência Brasil' })).toBe('Foto: Tânia Rêgo/Agência Brasil');
    expect(creditoDaNoticia({ creditoImagem: 'Arte/EBC', fonte: 'Agência Brasil' })).toBe('Arte/EBC · Agência Brasil');
    expect(creditoDaNoticia({ creditoImagem: null, fonte: 'Fonte X' })).toBe('Imagem: Fonte X');
  });

  it('horário da publicação em Brasília', () => {
    const agora = Date.parse('2026-09-27T20:00:00Z');
    expect(quandoPublicada('2026-09-27T15:30:00Z', agora)).toBe('Hoje, 12:30');
    expect(quandoPublicada('2026-09-26T12:05:00Z', agora)).toBe('Ontem, 09:05');
    expect(quandoPublicada('2026-09-20T23:10:00Z', agora)).toBe('20/09, 20:10');
    expect(quandoPublicada('x', agora)).toBe('');
  });

  it('catálogo: "Esportes News" é um tipo próprio, separado de Notícias (RSS)', () => {
    const t = WIDGET_TEMPLATES.find((x) => x.id === 'esportes-news');
    expect(t).toMatchObject({ tipo: 'sports_news', nome: 'Esportes News', noPlayer: true, suportaFundo: false });
    expect(WIDGET_TEMPLATES.filter((x) => x.tipo === 'rss').map((x) => x.id)).toEqual(['rss-classic']);
    expect(TIPO_LABEL.sports_news).toBe('Esportes News');
  });
});

describe('Esportes News — widget', () => {
  it('player: mostra a notícia com imagem, manchete, resumo e crédito; troca a cada 8 s e para na 3ª', () => {
    vi.useFakeTimers();
    try {
      render(<SportsNewsWidget config={{}} dados={dados(['a', 'b', 'c', 'd'].map((id) => N(id)))} widgetId="w1" modo="player" />);
      expect(screen.getByTestId('sports-news-titulo')).toHaveTextContent('Notícia a');
      expect(screen.getByTestId('sports-news-imagem')).toHaveAttribute('src', N('a').imagem);
      expect(screen.getByTestId('sports-news-resumo')).toHaveTextContent('Resumo a');
      expect(screen.getByTestId('sports-news-credito')).toHaveTextContent('Foto: Tânia Rêgo/Agência Brasil');
      act(() => { vi.advanceTimersByTime(8000); });
      expect(screen.getByTestId('sports-news-titulo')).toHaveTextContent('Notícia b');
      act(() => { vi.advanceTimersByTime(8000); });
      expect(screen.getByTestId('sports-news-titulo')).toHaveTextContent('Notícia c');
      act(() => { vi.advanceTimersByTime(16000); });
      expect(screen.getByTestId('sports-news-titulo')).toHaveTextContent('Notícia c');
      expect(localStorage.getItem('sm:esportesnews:proxima:w1')).toBe('d');
    } finally { vi.useRealTimers(); }
  });

  it('player: a exibição seguinte continua da próxima notícia', () => {
    localStorage.setItem('sm:esportesnews:proxima:w1', 'd');
    render(<SportsNewsWidget config={{}} dados={dados(['a', 'b', 'c', 'd'].map((id) => N(id)))} widgetId="w1" modo="player" />);
    expect(screen.getByTestId('sports-news-titulo')).toHaveTextContent('Notícia d');
  });

  it('notícia sem imagem não aparece; sem nenhuma com imagem, avisa (nas telas o servidor nem envia o widget)', () => {
    render(<SportsNewsWidget config={{}} dados={dados([N('a', { imagem: '' })])} modo="player" />);
    expect(screen.queryByTestId('sports-news-item')).toBeNull();
    expect(screen.getByTestId('sports-news-vazio')).toHaveTextContent('Nenhuma notícia de esporte com imagem no momento');
  });

  it('prévia do painel busca no servidor (content_esportes_news_preview)', async () => {
    rpc.mockResolvedValue({ data: dados([N('p')]), error: null });
    render(<SportsNewsWidget config={{ maxItems: 5 }} />);
    expect(await screen.findByTestId('sports-news-titulo')).toHaveTextContent('Notícia p');
    expect(rpc).toHaveBeenCalledWith('content_esportes_news_preview', { p_config: { maxItems: 5 } });
  });
});

describe('Notícias (RSS) — sempre com imagem (F-91)', () => {
  it('só as notícias com imagem aparecem, no desenho com foto e selo NOTÍCIAS', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    (supabase as unknown as { functions: { invoke: unknown } }).functions = {
      invoke: vi.fn(async () => ({ error: null, data: { items: [
        { title: 'Sem foto', description: 'x', link: 'https://site.com/1' },
        { title: 'Com foto', description: '<p>Resumo da notícia</p>', link: 'https://site.com/2', imageUrl: 'https://site.com/foto.jpg', pubDate: 'Sat, 26 Sep 2026 22:00:00 -0300' },
      ] } })),
    };
    const { RssWidget } = await import('@/components/player/RssWidget');
    render(<RssWidget feedUrl="https://site.com/feed.xml" />);
    expect(await screen.findByTestId('sports-news-titulo', {}, { timeout: 3000 })).toHaveTextContent('Com foto');
    expect(screen.getByTestId('sports-news-imagem')).toHaveAttribute('src', 'https://site.com/foto.jpg');
    expect(screen.getByText('NOTÍCIAS')).toBeInTheDocument();
    expect(screen.getByTestId('sports-news-credito')).toHaveTextContent('Imagem: site.com');
    expect(screen.queryByText('Sem foto')).toBeNull();
  });
});
