/**
 * Frente 5 — "às vezes atualizo a página e o dashboard só fica carregando".
 * Causa comprovada no AuthContext: a verificação da sessão ao abrir a página não tratava falha
 * (getSession rejeitado) nem demora sem fim (rede travada) -> `loading` ficava true para sempre (spinner eterno).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { supabase } from '@/integrations/supabase/client';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { TEMPO_MAX_VERIFICACAO_MS } from '@/lib/tempoLimites';

function Sonda() {
  const { loading } = useAuth();
  return <span data-testid="estado">{loading ? 'carregando' : 'pronto'}</span>;
}

describe('AuthContext: a carga inicial sempre termina', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null }, error: null } as never); });

  it('getSession falhou (rejeitado) -> não fica carregando para sempre', async () => {
    vi.mocked(supabase.auth.getSession).mockRejectedValueOnce(new Error('falha de rede ao renovar o token'));
    render(<AuthProvider><Sonda /></AuthProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(screen.getByTestId('estado')).toHaveTextContent('pronto');
  });

  it('getSession travado (rede sem resposta) -> libera a tela após o tempo máximo', async () => {
    vi.mocked(supabase.auth.getSession).mockReturnValueOnce(new Promise(() => {}) as never);
    render(<AuthProvider><Sonda /></AuthProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(TEMPO_MAX_VERIFICACAO_MS - 100); });
    expect(screen.getByTestId('estado')).toHaveTextContent('carregando');
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(screen.getByTestId('estado')).toHaveTextContent('pronto');
  });

  it('caminho normal continua igual', async () => {
    render(<AuthProvider><Sonda /></AuthProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(screen.getByTestId('estado')).toHaveTextContent('pronto');
  });
});
