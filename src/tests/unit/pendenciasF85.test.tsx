/**
 * F-85 — pendências abertas.
 * 1. Solicitação de acesso duplicada: com 2 linhas o maybeSingle() do PostgREST falha (PGRST116) e a conta
 *    aprovada via "Acesso Não Liberado". A leitura passa a pegar só a mais recente.
 * 2. Upload múltiplo: cada arquivo recebe o nome digitado numerado, em vez de todos com o mesmo nome.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { supabase } from '@/integrations/supabase/client';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { nomeParaEnvio } from '@/lib/nomeUpload';

/** Cadeia do PostgREST de TESTE: `solicitacoes_acesso` tem 2 linhas; maybeSingle só funciona após limit(1). */
function cadeia(tabela: string) {
  let limitado = false;
  const c: Record<string, unknown> = {};
  const self = () => c;
  Object.assign(c, {
    select: vi.fn(self), eq: vi.fn(self), in: vi.fn(self), order: vi.fn(self),
    limit: vi.fn((n: number) => { limitado = n === 1; return c; }),
    maybeSingle: vi.fn(async () => {
      if (tabela === 'usuarios') return { data: { id: 'u1', ativo: true, perfil: { nome: 'ANUNCIANTE' }, cliente_id: 'c1' }, error: null };
      if (tabela === 'solicitacoes_acesso') {
        return limitado
          ? { data: { status: 'APPROVED' }, error: null }
          : { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
      }
      return { data: null, error: null };
    }),
  });
  return c;
}

function Sonda() {
  const { loading, isApproved, solicitacaoStatus } = useAuth();
  return <span data-testid="estado">{loading ? 'carregando' : `${solicitacaoStatus}|${isApproved}`}</span>;
}

describe('F-85: solicitação de acesso duplicada não tranca a conta aprovada', () => {
  let fromOriginal: typeof supabase.from;
  beforeEach(() => {
    fromOriginal = supabase.from;
    (supabase as { from: unknown }).from = vi.fn((t: string) => cadeia(t));
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: { user: { id: 'u1', email: 't@exemplo.com' } } }, error: null } as never);
  });
  afterEach(() => {
    (supabase as { from: unknown }).from = fromOriginal;
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null }, error: null } as never);
  });

  it('2 linhas APPROVED -> status APPROVED e acesso liberado', async () => {
    render(<AuthProvider><Sonda /></AuthProvider>);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getByTestId('estado')).toHaveTextContent('APPROVED|true');
  });
});

describe('F-85: nome de cada arquivo no envio múltiplo', () => {
  it('um arquivo -> nome digitado', () => {
    expect(nomeParaEnvio('  Academia ', 0, 1)).toBe('Academia');
  });
  it('vários -> prefixo numerado na ordem, com zeros', () => {
    expect([0, 1, 9].map((i) => nomeParaEnvio('Academia', i, 10))).toEqual(['Academia 01', 'Academia 02', 'Academia 10']);
    expect(nomeParaEnvio('Açougue', 104, 120)).toBe('Açougue 105');
  });
  it('sem nome -> vazio (o diálogo usa o nome do arquivo)', () => {
    expect(nomeParaEnvio('', 0, 1)).toBe('');
  });
});
