/**
 * F-145 — "O Player encontrou um problema: Attempt to use history.replaceState() more than 100 times per 10 seconds"
 * logo depois do login. Causa: o cadastro entrava no estado antes da situação de aprovação; nesse intervalo o dono /
 * administrador contava como aprovado com a situação "NOT_FOUND" — o login mandava para o painel e o guarda do painel
 * mandava de volta, sem parar.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, act } from '@testing-library/react';
import { supabase } from '@/integrations/supabase/client';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

const estados: string[] = [];
function Sonda() {
  const { isApproved, solicitacaoStatus, loading } = useAuth();
  estados.push(`${loading ? 'carregando' : 'pronto'}|${isApproved ? 'aprovado' : 'nao'}|${solicitacaoStatus}`);
  return null;
}

/** Consulta encadeável que responde depois de `ms`. */
function consulta(resposta: unknown, ms: number) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit']) q[m] = () => q;
  q.maybeSingle = () => new Promise((ok) => setTimeout(() => ok({ data: resposta, error: null }), ms));
  return q;
}

describe('F-145 — login sem laço de redirecionamento', () => {
  afterEach(() => { vi.useRealTimers(); vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null }, error: null } as never); });

  it('com as consultas lentas, o dono nunca aparece "aprovado" com a situação ainda não encontrada', async () => {
    vi.useFakeTimers();
    estados.length = 0;
    const sessao = { user: { id: 'u1', email: 'dono@exemplo.test' } };
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: sessao }, error: null } as never);
    const fromOriginal = vi.mocked(supabase.from).getMockImplementation();
    vi.mocked(supabase.from).mockImplementation(((tabela: string) => {
      if (tabela === 'usuarios') return consulta({ id: 'u1', nome: 'Dono', ativo: true, is_owner: true, perfil: { nome: 'OWNER' } }, 50);
      if (tabela === 'representantes') return consulta(null, 800);
      return consulta(null, 800); // solicitacoes_acesso
    }) as never);
    try {
      render(<AuthProvider><Sonda /></AuthProvider>);
      for (let i = 0; i < 40; i++) await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    } finally {
      vi.mocked(supabase.from).mockImplementation(fromOriginal as never);
    }
    expect(estados.filter((e) => e.includes('|aprovado|NOT_FOUND'))).toEqual([]);
    expect(estados[estados.length - 1]).toBe('pronto|aprovado|APPROVED');
  });

  it('login e guarda usam a mesma condição para liberar a entrada', () => {
    const login = readFileSync('src/pages/Auth.tsx', 'utf8');
    const guarda = readFileSync('src/components/auth/RouteGuards.tsx', 'utf8');
    expect(login).toContain("if (user && isApproved && (solicitacaoStatus === 'APPROVED' || solicitacaoStatus === 'ACTIVE'))");
    expect(guarda).toContain("if (!isApproved || (solicitacaoStatus !== 'APPROVED' && solicitacaoStatus !== 'ACTIVE'))");
  });
});
