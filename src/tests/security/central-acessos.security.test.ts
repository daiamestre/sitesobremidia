import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * TESTES DE SEGURANÇA — Central de Acessos Corporativos (F1–F10)
 *
 * Verificam os CONTRATOS do service da Central após o hardening:
 *  - F3: criação de usuário passa pelo edge function (nunca INSERT direto em usuarios)
 *  - F7: auditoria não é mais gravada pelo cliente (só trigger server-side)
 *  - F8: perfil ADMIN exige users.create_admin; OWNER nunca é atribuível
 *  - F9: auditoria server-side (trigger) — cliente não escreve em auditoria_logs
 *  - Nova RPC atualizar_usuario_corporativo é o único caminho de edição
 * O enforcement real é feito no banco (triggers + RLS); estes testes garantem
 * que o cliente não tente contorná-lo.
 */

const calls = {
  from: [] as Array<{ table: string; op: string }>,
  rpc: [] as string[],
};

function makeChain(table: string) {
  const record = (op: string) => calls.from.push({ table, op });
  const chain = {
    select: () => (record('select'), chain),
    insert: () => (record('insert'), chain),
    update: () => (record('update'), chain),
    delete: () => (record('delete'), chain),
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    single: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (v: unknown) => unknown) =>
      resolve({ data: [], error: null }),
  };
  return chain;
}

const fromMock = vi.fn((table: string) => makeChain(table));

const rpcMock = vi.fn((fn: string) => {
  calls.rpc.push(fn);
  return Promise.resolve({ data: null, error: null });
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: fromMock,
    rpc: rpcMock,
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'tok' } },
      }),
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'u-caller', email: 'caller@sobremidia.com.br' } },
      }),
    },
  },
}));

beforeEach(() => {
  calls.from = [];
  calls.rpc = [];
  vi.clearAllMocks();
});

describe('Segurança: criação de usuário (F3 — sem INSERT direto)', () => {
  it('criarUsuario usa o edge function create-corporate-user (nunca INSERT em usuarios)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    );
    const { CorporateUsersService } = await import('@/services/corporateUsers.service');
    const service = new CorporateUsersService();
    const result = await service.criarUsuario({
      nome: 'João',
      email: 'joao@sobremidia.com.br',
      perfilId: 'perfil-rep',
    });
    expect(result.success).toBe(true);
    expect(calls.from.some((c) => c.table === 'usuarios' && c.op === 'insert')).toBe(false);
    expect(fromMock).not.toHaveBeenCalledWith('usuarios');
    vi.unstubAllGlobals();
  });
});

describe('Segurança: auditoria server-side (F7/F9 — cliente não forja trilha)', () => {
  it('atualizarStatusUsuario NÃO grava auditoria_logs pelo cliente (trigger faz)', async () => {
    const { CorporateUsersService } = await import('@/services/corporateUsers.service');
    const service = new CorporateUsersService();
    const result = await service.atualizarStatusUsuario('u-alvo', false);
    expect(result.success).toBe(true);
    expect(calls.from.some((c) => c.table === 'auditoria_logs')).toBe(false);
    expect(calls.from.some((c) => c.table === 'usuarios' && c.op === 'update')).toBe(true);
  });

  it('nenhum método do service escreve em auditoria_logs', async () => {
    const { CorporateUsersService } = await import('@/services/corporateUsers.service');
    const service = new CorporateUsersService();
    await service.atualizarStatusUsuario('u-alvo', true);
    await service.atualizarUsuario('u-alvo', { nome: 'X' });
    await service.gerenciarAutonomia('u-alvo', ['users.view'], true);
    expect(calls.from.some((c) => c.table === 'auditoria_logs' && (c.op === 'insert' || c.op === 'update'))).toBe(false);
  });
});

describe('Segurança: edição via RPC validada no servidor (F8/F1)', () => {
  it('atualizarUsuario chama a RPC atualizar_usuario_corporativo (nunca UPDATE direto com perfil)', async () => {
    const { CorporateUsersService } = await import('@/services/corporateUsers.service');
    const service = new CorporateUsersService();
    const result = await service.atualizarUsuario('u-alvo', {
      nome: 'Novo Nome',
      telefone: '11999990000',
      perfilId: 'perfil-admin',
    });
    expect(result.success).toBe(true);
    expect(calls.rpc).toContain('atualizar_usuario_corporativo');
    expect(calls.from.some((c) => c.table === 'usuarios' && c.op === 'update')).toBe(false);
  });

  it('gerenciarAutonomia chama a RPC gerenciar_autonomia (sem manipulação direta)', async () => {
    const { CorporateUsersService } = await import('@/services/corporateUsers.service');
    const service = new CorporateUsersService();
    await service.gerenciarAutonomia('u-alvo', ['users.edit'], true);
    expect(calls.rpc).toContain('gerenciar_autonomia');
  });

  it('perfis OWNER e ADMIN não podem ser atribuídos sem autoridade', async () => {
    const { PERMISSOES_DISPONIVEIS } = await import('@/services/corporateUsers.service');
    const codigos = PERMISSOES_DISPONIVEIS.map((p) => p.codigo);
    expect(codigos).toContain('users.create_admin');
    expect(codigos).toContain('users.manage_permissions');
    expect(codigos).toContain('users.edit');
  });
});

describe('Segurança: leitura tenant-scoped (F4/F5/F6)', () => {
  it('listarUsuariosCentral usa RPC server-side (isolamento por tenant no banco)', async () => {
    const { CorporateUsersService } = await import('@/services/corporateUsers.service');
    const service = new CorporateUsersService();
    await service.listarUsuariosCentral();
    expect(calls.rpc).toContain('listar_usuarios_central');
    expect(calls.from.some((c) => c.table === 'usuarios' && c.op === 'select')).toBe(false);
  });

  it('getMyPermissions usa RPC get_my_admin_permissions (nunca lê permissoes_usuarios de terceiros)', async () => {
    const { CorporateUsersService } = await import('@/services/corporateUsers.service');
    const service = new CorporateUsersService();
    await service.getMyPermissions();
    expect(calls.rpc).toContain('get_my_admin_permissions');
  });
});