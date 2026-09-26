/** Frente 4: todo widget tem capa (Galeria e Meus Widgets) e todo tipo aceita imagem de fundo (inclusive YouTube). */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { WidgetCatalog } from '@/components/dashboard/widgets/WidgetCatalog';
import { CapaWidget } from '@/components/dashboard/widgets/CapaWidget';
import { YouTubeWidget } from '@/components/player/YouTubeWidget';
import { WIDGET_TEMPLATES } from '@/lib/widgetCatalog';
import { exemploDoModelo } from '@/lib/widgetExemplos';

describe('capas dos widgets', () => {
  it('Galeria: TODO modelo tem capa; só conteúdo de exemplo leva o selo EXEMPLO', () => {
    render(<WidgetCatalog onUsar={vi.fn()} />);
    for (const t of WIDGET_TEMPLATES) {
      const capa = screen.getByTestId(`capa-${t.id}`);
      expect(capa.firstElementChild, `sem capa: ${t.id}`).not.toBeNull();
      const temSelo = !!within(capa).queryByTestId('capa-exemplo');
      expect(temSelo, `selo EXEMPLO em ${t.id}`).toBe(exemploDoModelo(t.id).exemplo);
    }
  });

  it('todo modelo aceita imagem de fundo (YouTube inclusive)', () => {
    expect(WIDGET_TEMPLATES.filter((t) => !t.suportaFundo).map((t) => t.id)).toEqual([]);
  });

  it('Meus Widgets: imagem de fundo vira a capa; sem imagem, o próprio widget', () => {
    const { unmount } = render(<CapaWidget widgetType="social" nome="Post" config={{ backgroundImageLandscape: 'https://cdn.exemplo/fundo.jpg', titulo: 'x' }} />);
    expect(screen.getByTestId('capa-imagem')).toHaveAttribute('src', 'https://cdn.exemplo/fundo.jpg');
    unmount();
    const casos: Array<[string, string, Record<string, unknown>]> = [
      ['institutional', 'capa-institucional', { titulo: 'Aviso' }],
      ['social', 'capa-social', { titulo: 'Novidade' }],
      ['instagram', 'capa-social', { titulo: 'Post' }],
      ['youtube', 'capa-youtube', { youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' }],
    ];
    for (const [tipo, testId, config] of casos) {
      const r = render(<CapaWidget widgetType={tipo} nome={tipo} config={config} />);
      expect(screen.getByTestId(testId)).toBeInTheDocument();
      r.unmount();
    }
  });

  it('YouTube: capa é a miniatura oficial do vídeo (sem abrir o player)', () => {
    render(<CapaWidget widgetType="youtube" nome="Vídeo" config={{ youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }} />);
    const capa = screen.getByTestId('capa-youtube');
    expect(capa.querySelector('img')).toHaveAttribute('src', 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(capa.querySelector('iframe')).toBeNull();
  });

  it('YouTube com imagem de fundo: vídeo 16:9 sobre o fundo; sem fundo, tela cheia como antes', () => {
    const { unmount } = render(<YouTubeWidget config={{ youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' }} backgroundImage="https://cdn.exemplo/fundo.jpg" />);
    const com = screen.getByTestId('youtube-widget-com-fundo');
    expect(com.querySelector('img')).toHaveAttribute('src', 'https://cdn.exemplo/fundo.jpg');
    expect(com.querySelector('iframe')).not.toBeNull();
    unmount();
    render(<YouTubeWidget config={{ youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' }} />);
    expect(screen.getByTestId('youtube-widget')).toBeInTheDocument();
  });
});
