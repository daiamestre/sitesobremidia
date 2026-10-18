/**
 * F-192 — totem com imagem de cabeça para baixo: o painel inverte o sentido do giro (90 -> 270) e o Player recebe pela playlist.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(() => ({ update })) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { GiroDoTotem } from '@/components/screens/GiroDoTotem';

const sql = readFileSync('supabase/migrations/20261333_giro_do_quadro_por_tela.sql', 'utf8');

describe('F-192 · sentido do giro do totem', () => {
  it('o banco guarda 90 ou 270 (padrão 90) e a playlist leva o valor ao Player', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS giro_quadro integer NOT NULL DEFAULT 90');
    expect(sql).toContain('CHECK (giro_quadro IN (90, 270))');
    expect(sql).toContain("'giro_quadro', coalesce(v_screen.giro_quadro, 90),");
    expect(sql).toContain('ROLLBACK:');
  });

  it('o interruptor do painel inverte para 270 e volta para 90', async () => {
    render(<GiroDoTotem tela={{ id: 't1', resolution: '9x16', orientation: 'portrait', giro_quadro: 90 }} />);
    const chave = screen.getByRole('switch');
    fireEvent.click(chave);
    await waitFor(() => expect(update).toHaveBeenCalledWith({ giro_quadro: 270 }));
    fireEvent.click(chave);
    await waitFor(() => expect(update).toHaveBeenLastCalledWith({ giro_quadro: 90 }));
  });

  it('a página da tela mostra a opção', () => {
    expect(readFileSync('src/pages/dashboard/ScreenDetails.tsx', 'utf8')).toContain('<GiroDoTotem');
  });
});
