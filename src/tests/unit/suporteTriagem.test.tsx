import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// F-102 — suporte com triagem: motivo obrigatório; vai para OWNER/ADMIN; um aberto por vez.

const rpc = vi.fn(async (_fn: string, _args?: unknown) => ({ data: { status: 'OK', chamado_id: 'c1' }, error: null }));
const lista = { data: [] as unknown[], error: null };
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args?: unknown) => rpc(fn, args),
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'neq', 'order', 'limit', 'in']) q[m] = () => q;
      (q as { then: unknown }).then = (ok: (v: unknown) => unknown) => Promise.resolve(lista).then(ok);
      return q;
    },
  },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ usuario: { id: 'u1', nome: 'Cliente' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SuporteCliente } from '@/components/suporte/SuporteCliente';

const wrap = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><SuporteCliente /></MemoryRouter>
  </QueryClientProvider>
);

describe('Suporte com triagem (F-102)', () => {
  beforeEach(() => { rpc.mockClear(); lista.data = []; });

  it('só envia depois de escolher o motivo; chama suporte_abrir_chamado com a categoria', async () => {
    wrap();
    fireEvent.click(await screen.findByRole('button', { name: /Falar com o suporte/i }));
    const enviar = screen.getByRole('button', { name: /Enviar ao suporte/i });
    fireEvent.change(screen.getByLabelText(/Resuma o problema/i), { target: { value: 'Boleto não chegou' } });
    fireEvent.change(screen.getByLabelText(/Explique com detalhes/i), { target: { value: 'Não recebi o boleto.' } });
    expect(enviar).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Fatura ou pagamento/i }));
    expect(enviar).not.toBeDisabled();
    fireEvent.click(enviar);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('suporte_abrir_chamado', {
      p_categoria: 'FATURA_PAGAMENTO', p_assunto: 'Boleto não chegou', p_mensagem: 'Não recebi o boleto.',
    }));
  });

  it('com atendimento em andamento, mostra "Continuar atendimento" em vez de abrir outro', async () => {
    lista.data = [{ id: 'c9', aberto_por: 'u1', cliente_id: null, perfil_origem: 'ANUNCIANTE', categoria: 'OUTRO', assunto: 'Dúvida', status: 'ABERTO', created_at: '2026-09-28T10:00:00Z', ultima_mensagem_em: '2026-09-28T10:00:00Z', resolvido_em: null }];
    wrap();
    expect(await screen.findByRole('button', { name: /Continuar atendimento/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Falar com o suporte/i })).toBeNull();
  });

  it('banco: só OWNER/ADMIN atendem e encerram; um suporte aberto por usuário; sem escrita direta', () => {
    const sql = readFileSync(path.join(process.cwd(), 'supabase', 'migrations', '20261270_suporte_chamados.sql'), 'utf8');
    expect(sql).toContain("IN ('OWNER', 'ADMIN')");
    expect(sql).toContain('suporte_um_aberto_por_usuario');
    expect(sql).toContain("Só o dono e os administradores encerram o suporte.");
    expect(sql).not.toMatch(/CREATE POLICY [a-z_]+ ON public\.suporte_(chamados|mensagens) FOR (INSERT|UPDATE|DELETE|ALL)/);
  });

  it('portal do anunciante usa a Central própria (sem chat livre/grupos) e o menu não tem Brand Kit nem Equipe', () => {
    const app = readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8');
    expect(app).toContain('<Route path="central" element={<CentralAnunciantePage />} />');
    const layout = readFileSync(path.join(process.cwd(), 'src', 'modules', 'crm', 'layout', 'CustomerPortalLayout.tsx'), 'utf8');
    expect(layout).not.toContain("'Brand Kit'");
    expect(layout).not.toContain("'Minha Equipe'");
  });
});
