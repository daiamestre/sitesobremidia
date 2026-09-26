/**
 * Frente 5 — RequireApproval: a checagem da sessão real (getSession) não tinha limite de tempo.
 * Rede travada -> tela protegida ficava no spinner para sempre. Agora: após o tempo máximo, a checagem é dada como
 * NÃO confirmada (fail-closed: volta ao login), nunca libera acesso sem sessão comprovada.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true, isApproved: true, loading: false, solicitacaoStatus: 'APPROVED',
    user: { id: 'u1', email: 'teste@exemplo.com' }, signOut: vi.fn(), empresaOperadoraId: 'e1',
    usuario: { id: 'u1', perfil: { nome: 'ADMIN' } }, perfilNome: 'ADMIN', representante: null,
  }),
}));

import { RequireApproval } from '@/components/auth/RouteGuards';

const app = () => render(
  <MemoryRouter initialEntries={['/dashboard']}>
    <Routes>
      <Route path="/dashboard" element={<RequireApproval><p>conteúdo protegido</p></RequireApproval>} />
      <Route path="/auth" element={<p>tela de login</p>} />
    </Routes>
  </MemoryRouter>,
);

describe('RequireApproval: nunca fica carregando para sempre', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null }, error: null } as never); });

  it('sessão real confirmada -> mostra a tela', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null } as never);
    app();
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(screen.getByText('conteúdo protegido')).toBeInTheDocument();
  });

  it('getSession travado -> depois do tempo máximo volta ao login (fail-closed), sem spinner eterno', async () => {
    vi.mocked(supabase.auth.getSession).mockReturnValue(new Promise(() => {}) as never);
    app();
    await act(async () => { await vi.advanceTimersByTimeAsync(14_000); });
    expect(screen.queryByText('conteúdo protegido')).toBeNull();
    expect(screen.queryByText('tela de login')).toBeNull(); // ainda verificando
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
    expect(screen.getByText('tela de login')).toBeInTheDocument();
  });
});
