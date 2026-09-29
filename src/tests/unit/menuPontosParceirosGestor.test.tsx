import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// F-116 — estrutura de pontos parceiros some para o GESTOR e fica para OWNER/ADMIN (menu abre a página nova de Telas).
let perfil = 'GESTOR';
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, profile: null, signOut: vi.fn(), isOwner: false, perfilNome: perfil }),
}));
vi.mock('@/hooks/useCentral', () => ({ useCentralUnread: () => ({ total: 0 }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => { const q: Record<string, unknown> = {}; for (const m of ['select', 'eq']) q[m] = () => q; q.maybeSingle = async () => ({ data: null }); return q; } },
}));

import { Sidebar } from '@/components/dashboard/Sidebar';

const abrir = () => render(<MemoryRouter initialEntries={['/dashboard']}><Sidebar hideCollapse /></MemoryRouter>);

describe('Menu do painel: pontos parceiros só para OWNER/ADMIN (F-116)', () => {
  it('gestor não vê "Telas de pontos parceiros" nem "Pontos parceiros"', () => {
    perfil = 'GESTOR';
    abrir();
    expect(screen.queryByText('Telas de pontos parceiros')).toBeNull();
    expect(screen.queryByText('Pontos parceiros')).toBeNull();
    expect(screen.getByText('Telas')).toBeInTheDocument();
  });

  it('ADMIN vê os dois; "Telas de pontos parceiros" abre os cartões e "Pontos parceiros" abre a sala (F-119)', () => {
    perfil = 'ADMIN';
    abrir();
    expect(screen.getByText('Telas de pontos parceiros').closest('a')).toHaveAttribute('href', '/dashboard/screens?secao=parceiros');
    expect(screen.getByText('Pontos parceiros').closest('a')).toHaveAttribute('href', '/dashboard/pontos-parceiros');
  });

  it('página Telas: gestor vai direto às próprias telas; rota do cadastro de ponto só OWNER/ADMIN', () => {
    const telas = readFileSync(path.join(process.cwd(), 'src/pages/dashboard/Screens.tsx'), 'utf8');
    expect(telas).toContain("const secao = !podeTelasParceiras ? 'anunciantes'");
    expect(telas).toContain('useTelasDosPontos(podeTelasParceiras)');
    const app = readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');
    expect(app).toContain("<Route path=\"prospeccao/ponto-parceiro\" element={<RequireRole roles={['OWNER', 'ADMIN']}><PontoParceiroWizardPage /></RequireRole>} />");
  });
});
