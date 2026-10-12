/**
 * F-187 — o painel avisa quando a tela dá sinal mas não está reproduzindo, com a causa e o que fazer.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/services/DeviceService', () => ({
  fetchTelasSemReproducao: vi.fn(),
}));

import { fetchTelasSemReproducao } from '@/services/DeviceService';
import { TelasSemReproducao } from '@/components/central/TelasSemReproducao';

const sql = readFileSync('supabase/migrations/20261328_telas_sem_reproducao.sql', 'utf8');

describe('F-187 · telas sem reprodução', () => {
  it('sem defeito, a Central não mostra nada', async () => {
    vi.mocked(fetchTelasSemReproducao).mockResolvedValue([]);
    const { container } = render(<TelasSemReproducao />);
    await waitFor(() => expect(fetchTelasSemReproducao).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="telas-sem-reproducao"]')).toBeNull();
  });

  it('mostra a tela, que não está reproduzindo, a causa e o que fazer', async () => {
    vi.mocked(fetchTelasSemReproducao).mockResolvedValue([{
      screen_id: 't1', tela: 'TOTEM HOTEL', motivo: 'PLAYER_SEM_IMAGEM',
      causa: 'Preso na tela de sincronização há 120 s', o_que_fazer: 'Confira a internet do aparelho',
      ultimo_sinal: '2026-10-12T17:00:00Z', ultima_exibicao: null, app_version: '5.7.5-MicroGate',
    }]);
    render(<TelasSemReproducao />);
    expect(await screen.findByText('TOTEM HOTEL')).toBeTruthy();
    expect(screen.getByText('Não está reproduzindo')).toBeTruthy();
    expect(screen.getByText(/Preso na tela de sincronização há 120 s/)).toBeTruthy();
    expect(screen.getByText(/Confira a internet do aparelho/)).toBeTruthy();
    expect(screen.getByText(/Há 1 tela dando sinal que não está reproduzindo/)).toBeTruthy();
  });

  it('o banco só alerta tela conectada, com sinal, ativa e que o usuário pode gerir', () => {
    expect(sql).toContain('s.bound_device_id IS NOT NULL');
    expect(sql).toContain("s.last_ping_at > now() - interval '3 minutes'");
    expect(sql).toContain('s.is_active AND NOT coalesce(s.bloqueada_por_inadimplencia, false)');
    expect(sql).toContain('public.fn_player_can_access_screen(s.id)');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.fn_telas_sem_reproducao() FROM PUBLIC, anon;');
  });

  it('cobre as causas: sem playlist, playlist vazia, aparelho desvinculado, Player sem imagem e sem exibição', () => {
    for (const m of ['SEM_PLAYLIST', 'PLAYLIST_VAZIA', 'APARELHO_NAO_VINCULADO', 'PLAYER_SEM_IMAGEM', 'SEM_EXIBICAO']) {
      expect(sql, m).toContain(`'${m}'`);
    }
    // vídeo longo não vira alarme falso: a tolerância acompanha o maior item da playlist
    expect(sql).toContain('2 * b.maior_item_s + 60');
  });
});
