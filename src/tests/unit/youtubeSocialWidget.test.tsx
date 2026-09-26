import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { lerYoutube, youtubeEmbedUrl } from '@/lib/youtube';
import { YouTubeWidget } from '@/components/player/YouTubeWidget';
import { SocialWidget, redeDoWidget } from '@/components/player/SocialWidget';
import { widgetsQueUsamFundo } from '@/lib/widgetCatalog';

describe('W9 — YouTube pelo player oficial', () => {
  it('reconhece vídeo, Shorts, live, embed, playlist e canal; recusa o resto', () => {
    const v = { tipo: 'video', id: 'dQw4w9WgXcQ' };
    expect(lerYoutube('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s')).toEqual(v);
    expect(lerYoutube('youtu.be/dQw4w9WgXcQ')).toEqual(v);
    expect(lerYoutube('https://m.youtube.com/shorts/dQw4w9WgXcQ')).toEqual(v);
    expect(lerYoutube('https://youtube.com/live/dQw4w9WgXcQ')).toEqual(v);
    expect(lerYoutube('https://www.youtube.com/embed/dQw4w9WgXcQ')).toEqual(v);
    expect(lerYoutube('https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG')).toEqual({ tipo: 'playlist', id: 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG' });
    expect(lerYoutube('https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw')).toEqual({ tipo: 'playlist', id: 'UUuAXFkgsw1L7xaCfnd5JJOw' });
    expect(lerYoutube('UCuAXFkgsw1L7xaCfnd5JJOw')).toEqual({ tipo: 'playlist', id: 'UUuAXFkgsw1L7xaCfnd5JJOw' });
    expect(lerYoutube('https://www.youtube.com/@canal')).toBeNull();
    expect(lerYoutube('https://vimeo.com/123')).toBeNull();
    expect(lerYoutube('https://evil.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(lerYoutube('')).toBeNull();
  });

  it('usa o embed oficial, mudo e em loop', () => {
    expect(youtubeEmbedUrl({ tipo: 'video', id: 'dQw4w9WgXcQ' })).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1&controls=0&rel=0&playsinline=1&modestbranding=1&loop=1&playlist=dQw4w9WgXcQ');
    expect(youtubeEmbedUrl({ tipo: 'playlist', id: 'PLabcdefghij' })).toContain('/embed/videoseries?');
    render(<YouTubeWidget config={{ youtubeUrl: 'youtu.be/dQw4w9WgXcQ' }} />);
    expect(screen.getByTitle('YouTube').getAttribute('src')).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(screen.getByTestId('youtube-widget-carregando')).toBeTruthy();
  });

  it('link inválido não abre nada externo', () => {
    render(<YouTubeWidget config={{ youtubeUrl: 'https://evil.com/x' }} />);
    expect(screen.getByTestId('youtube-widget-invalido')).toBeTruthy();
    expect(document.querySelector('iframe')).toBeNull();
  });
});

describe('W9 — Social / Instagram com o que o usuário enviou', () => {
  it('rede: instagram é sempre Instagram; social usa a escolhida', () => {
    expect(redeDoWidget('instagram', { rede: 'facebook' })).toBe('instagram');
    expect(redeDoWidget('social', { rede: 'facebook' })).toBe('facebook');
    expect(redeDoWidget('social', {})).toBe('geral');
  });

  it('mostra imagem, perfil com @, título e texto', () => {
    render(<SocialWidget widgetType="instagram" config={{ imagemPost: 'https://r2/x.jpg', perfil: 'sualoja', autor: 'Sua Loja', titulo: 'Novidade', texto: 'Chegou!' }} />);
    expect(screen.getByText('INSTAGRAM')).toBeTruthy();
    expect(screen.getByText('@sualoja')).toBeTruthy();
    expect(screen.getByText('Novidade')).toBeTruthy();
    expect(screen.getByTestId('social-imagem').getAttribute('src')).toBe('https://r2/x.jpg');
  });

  it('imagem do post fica protegida na Galeria de Fundo (em uso)', () => {
    const ws = [{ name: 'Post', config: { imagemPost: 'https://pub.r2.dev/u1/widgets/p.jpg' } }, { name: 'Outro', config: {} }];
    expect(widgetsQueUsamFundo(ws, 'u1/widgets/p.jpg').map((w) => w.name)).toEqual(['Post']);
  });
});
