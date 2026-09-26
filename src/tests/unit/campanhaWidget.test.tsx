import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { campanhaParaWidget, campanhaVigente, ehCriativoImagem, type CampanhaWidgetDados } from '@/lib/campanhaWidget';
import { AdvertisingWidgetView, SEGUNDOS_POR_CRIATIVO } from '@/components/player/AdvertisingWidget';

// 25/09/2026 23:30 em Brasília = 26/09 02:30 UTC
const NOITE_25_BRT = new Date('2026-09-26T02:30:00Z');
const dados = (p: Partial<CampanhaWidgetDados> = {}): CampanhaWidgetDados => ({
  id: 'c1', titulo: 'Black Friday', status: 'ACTIVE', data_inicio: '2026-09-20', data_fim: '2026-09-25', vigente: true,
  criativos: ['https://x/a.jpg', 'https://x/b.png'], ...p,
});

afterEach(() => vi.useRealTimers());

describe('W8 — widget de Publicidade (criativos da campanha, nunca copiados)', () => {
  it('no ar: APPROVED/ACTIVE, não excluída, dentro das datas no dia de Brasília', () => {
    expect(campanhaVigente(dados(), NOITE_25_BRT)).toBe(true);
    expect(campanhaVigente(dados({ status: 'APPROVED' }), NOITE_25_BRT)).toBe(true);
    expect(campanhaVigente(dados({ status: 'PAUSED' }), NOITE_25_BRT)).toBe(false);
    expect(campanhaVigente(dados({ status: 'DRAFT' }), NOITE_25_BRT)).toBe(false);
    expect(campanhaVigente({ ...dados(), deleted_at: '2026-09-24T00:00:00Z' }, NOITE_25_BRT)).toBe(false);
    expect(campanhaVigente(dados(), new Date('2026-09-26T03:00:00Z'))).toBe(false); // 00:00 do dia 26 em Brasília
  });

  it('só imagens entram, na ordem de envio, com a URL pública do bucket', () => {
    expect(ehCriativoImagem({ content_type: 'image/jpeg', storage_path: 'c/a' })).toBe(true);
    expect(ehCriativoImagem({ content_type: 'video/mp4', storage_path: 'c/a.mp4' })).toBe(false);
    expect(ehCriativoImagem({ content_type: null, storage_path: 'c/a.webp' })).toBe(true);
    const w = campanhaParaWidget({
      id: 'c1', titulo: 'T', status: 'ACTIVE', data_inicio: '2026-09-25', data_fim: '2026-09-25', deleted_at: null,
      midias: [
        { storage_path: 'c1/2.png', content_type: 'image/png', created_at: '2026-09-02' },
        { storage_path: 'c1/v.mp4', content_type: 'video/mp4', created_at: '2026-09-01' },
        { storage_path: 'c1/1.jpg', content_type: 'image/jpeg', created_at: '2026-09-01' },
      ],
    }, (p) => `https://bucket/${p}`, NOITE_25_BRT);
    expect(w.criativos).toEqual(['https://bucket/c1/1.jpg', 'https://bucket/c1/2.png']);
    expect(w.vigente).toBe(true);
  });

  it('mostra o criativo, o título e a chamada; alterna os criativos; fora do ar não mostra criativo', () => {
    vi.useFakeTimers({ now: NOITE_25_BRT });
    const { unmount, container } = render(<AdvertisingWidgetView dados={dados()} config={{ cta: 'Compre já' }} agora={NOITE_25_BRT} />);
    expect(screen.getByTestId('advertising-widget')).toBeTruthy();
    expect(screen.getByText('Compre já')).toBeTruthy();
    const opacidades = () => [...container.querySelectorAll('img')].map((i) => (i as HTMLImageElement).style.opacity);
    expect(opacidades()).toEqual(['1', '0']);
    act(() => { vi.advanceTimersByTime(SEGUNDOS_POR_CRIATIVO * 1000); });
    expect(opacidades()).toEqual(['0', '1']);
    unmount();

    render(<AdvertisingWidgetView dados={dados({ status: 'PAUSED' })} config={{}} agora={NOITE_25_BRT} />);
    expect(screen.getByTestId('advertising-widget-fora')).toBeTruthy();
    expect(document.querySelectorAll('img').length).toBe(0);
  });
});
