import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// F-169 — Meu Perfil: todos mudam nome/telefone (telefone opcional), função intocável, e-mail só com autorização do Owner/ADM.
const ler = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const sql = ler('supabase/migrations/20261315_perfil_nome_telefone_email.sql');

const rpc = vi.fn();
const refreshUserData = vi.fn();
const auth = vi.hoisted(() => ({
  usuario: { id: 'u1', nome: 'Sobre Midia ADM', telefone: '', email: 'a@b.com', cliente_id: null as string | null, is_owner: true, avatar_url: null, empresa_operadora_id: 'emp1' },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ usuario: auth.usuario, user: { id: 'u1', email: 'a@b.com' }, refreshUserData, signOut: vi.fn(), isOwner: true, perfilNome: 'ADMIN' }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  for (const k of ['select', 'eq', 'order', 'limit']) chain[k] = () => chain;
  chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
  chain.limit = () => Promise.resolve({ data: [{ nome_fantasia: 'Restaurante Alpha' }], error: null });
  chain.then = (res: (v: unknown) => unknown) => res({ data: [], error: null });
  return {
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1', email: 'a@b.com' } } }), getSession: () => Promise.resolve({ data: { session: null } }), updateUser: vi.fn() },
      from: () => chain,
      rpc: (...a: unknown[]) => rpc(...a),
      storage: { from: () => ({}) },
    },
  };
});

import MeuPerfilBase from '@/components/perfil/MeuPerfilBase';

function montar(variante: 'OWNER' | 'ANUNCIANTE' = 'OWNER') {
  return render(<MemoryRouter><MeuPerfilBase variante={variante} /></MemoryRouter>);
}

beforeEach(() => {
  rpc.mockReset(); refreshUserData.mockReset();
  rpc.mockImplementation(async (fn: string) => {
    if (fn === 'perfil_troca_email_pendente') return { data: null, error: null };
    return { data: { ok: true }, error: null };
  });
  auth.usuario.cliente_id = null;
});

describe('Migração 20261315', () => {
  it('Owner pode editar o próprio cadastro: o gatilho só recusa quando a edição realmente inativa a conta', () => {
    expect(sql).toContain("upper(coalesce(NEW.status, '')) NOT IN ('ACTIVE', 'ATIVO') AND NEW.status IS DISTINCT FROM OLD.status");
    expect(sql).toContain('(NEW.ativo = false AND OLD.ativo IS DISTINCT FROM false)');
    expect(sql).not.toContain("NEW.status != 'ACTIVE'");
  });
  it('função (perfil) continua proibida de mudar', () => {
    expect(sql).toContain('Impossível alterar o role_id da conta OWNER');
    expect(sql).not.toMatch(/SET[^;]*perfil_id/); // nenhuma função nova mexe no perfil
  });
  it('telefone opcional, nome mínimo, só o próprio usuário', () => {
    expect(sql).toContain("v_tel text := nullif(btrim(coalesce(p_telefone, '')), '');");
    expect(sql).toContain('WHERE id = auth.uid() RETURNING empresa_operadora_id');
    expect(sql).toContain('Informe o nome (mínimo 3 letras).');
  });
  it('e-mail: ninguém troca o próprio por fora; só Owner/ADM decidem; outro Owner/ADM, não o próprio; usuário avisado', () => {
    expect(sql).toContain('CREATE TRIGGER tg_usuarios_email_so_autorizado BEFORE UPDATE OF email ON public.usuarios');
    expect(sql).toContain("RAISE EXCEPTION 'Somente Owner ou ADM decidem a troca de e-mail.'");
    expect(sql).toContain('Outra pessoa do Owner/ADM precisa autorizar o seu próprio pedido.');
    expect(sql).toContain("'EMAIL_ALTERACAO_AUTORIZADA' ELSE 'EMAIL_ALTERACAO_RECUSADA'");
    expect(sql).toContain("'EMAIL_ALTERACAO_SOLICITADA', 'IN_APP'"); // aviso na Central do Owner/ADM
    expect(sql).toContain('CREATE TRIGGER tg_solicitacao_email_so_pela_decisao BEFORE UPDATE ON public.solicitacoes');
  });
  it('a troca autorizada atualiza o cadastro, o login e a identidade', () => {
    expect(sql).toContain('UPDATE public.usuarios SET email = v_novo');
    expect(sql).toContain('UPDATE auth.users SET email = v_novo');
    expect(sql).toContain('UPDATE auth.identities SET identity_data');
  });
});

describe('Meu Perfil — nome no topo', () => {
  it('"Alterar nome" no topo salva o nome (que aparece nas boas-vindas) e atualiza a sessão', async () => {
    montar();
    expect(screen.getByTestId('nome-no-topo').textContent).toBe('Sobre Midia ADM');
    fireEvent.click(screen.getByTestId('alterar-nome-topo'));
    fireEvent.change(screen.getByTestId('nome-topo'), { target: { value: 'Jairan Santos - DONO' } });
    fireEvent.click(screen.getByTestId('salvar-nome-topo'));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('perfil_atualizar_dados', { p_nome: 'Jairan Santos - DONO', p_telefone: null }));
    await waitFor(() => expect(refreshUserData).toHaveBeenCalled());
  });

  it('nome curto é recusado antes de ir ao banco', async () => {
    montar();
    fireEvent.click(screen.getByTestId('alterar-nome-topo'));
    fireEvent.change(screen.getByTestId('nome-topo'), { target: { value: 'Ab' } });
    fireEvent.click(screen.getByTestId('salvar-nome-topo'));
    await waitFor(() => expect(rpc).not.toHaveBeenCalledWith('perfil_atualizar_dados', expect.anything()));
  });

  it('telefone é opcional: formulário salva sem telefone', async () => {
    montar();
    expect(screen.getByText('(opcional)')).toBeTruthy();
    fireEvent.click(screen.getByText('Salvar alterações'));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('perfil_atualizar_dados', { p_nome: 'Sobre Midia ADM', p_telefone: null }));
  });

  it('a função não é editável', () => {
    montar();
    const campo = screen.getByDisplayValue('Owner') as HTMLInputElement;
    expect(campo.disabled).toBe(true);
  });
});

describe('Meu Perfil — e-mail com autorização', () => {
  it('pede autorização ao Owner/ADM (não troca direto) e mostra o pedido pendente', async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'perfil_troca_email_pendente') return { data: rpc.mock.calls.some(([f]) => f === 'perfil_solicitar_troca_email') ? { id: 's1', novo_email: 'novo@x.com', criado_em: '2026-10-09T10:00:00Z' } : null, error: null };
      return { data: { ok: true }, error: null };
    });
    montar();
    fireEvent.change(await screen.findByTestId('novo-email'), { target: { value: 'novo@x.com' } });
    fireEvent.click(screen.getByTestId('pedir-troca-email'));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('perfil_solicitar_troca_email', { p_novo_email: 'novo@x.com' }));
    expect((await screen.findByTestId('troca-email-pendente')).textContent).toContain('novo@x.com');
    fireEvent.click(screen.getByTestId('cancelar-troca-email'));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('perfil_cancelar_troca_email'));
  });
});

describe('Meu Perfil — anunciante troca o nome do estabelecimento', () => {
  it('o campo aparece e salva pelo banco', async () => {
    auth.usuario.cliente_id = 'cli1';
    montar('ANUNCIANTE');
    const campo = (await screen.findByTestId('nome-estabelecimento')) as HTMLInputElement;
    await waitFor(() => expect(campo.value).toBe('Restaurante Alpha'));
    fireEvent.change(campo, { target: { value: 'Alpha Gourmet' } });
    fireEvent.click(screen.getByTestId('salvar-estabelecimento'));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('perfil_atualizar_nome_estabelecimento', { p_nome: 'Alpha Gourmet' }));
  });
});

describe('Central — Trocas de e-mail', () => {
  it('seção própria com Autorizar/Recusar de verdade; a lista genérica não mostra esse tipo', () => {
    const c = ler('src/pages/Central/CentralDashboard.tsx');
    expect(c).toContain('data-testid="secao-trocas-email"');
    expect(c).toContain("'perfil_decidir_troca_email'");
    expect(c).toContain("s.tipo_solicitacao !== 'EMAIL_CHANGE_REQUEST'");
    expect(c).toContain('data-testid="autorizar-troca-email"');
  });
});
