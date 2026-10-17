/**
 * F-190 — conta sem telas: "Rede por estabelecimento" e "Saúde da Frota" continuam na tela, zeradas.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: { totais: { telas: 0, zonas: 0, midias: 0, online: 0, offline: 0 }, estabelecimentos: [] }, error: null }) },
}));

import { RedePorEstabelecimento } from '@/components/rede/RedePorEstabelecimento';

describe('F-190 · seções do gestor sempre visíveis com dados verdadeiros', () => {
  it('rede por estabelecimento aparece zerada, com aviso, quando a conta não tem telas', async () => {
    render(<RedePorEstabelecimento />);
    expect(await screen.findByTestId('rede-por-estabelecimento')).toBeTruthy();
    expect(screen.getByTestId('rede-vazia').textContent).toContain('Nenhuma tela cadastrada ainda');
    const totais = screen.getByTestId('rede-totais').textContent ?? '';
    expect(totais).toContain('Telas0');
    expect(totais).toContain('Online0');
  });

  it('a Saúde da Frota não some mais quando não há aparelhos', () => {
    const home = readFileSync('src/pages/dashboard/DashboardHome.tsx', 'utf8');
    expect(home).not.toContain('fleet && fleet.total > 0 &&');
    expect(home).toContain('{fleet && (');
  });
});
