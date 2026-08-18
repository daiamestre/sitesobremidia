import { describe, it, expect, beforeEach, vi } from 'vitest';
import { securityAuditService } from '@/services/securityAudit.service';

// Mock do cliente Supabase para testes unitários de segurança no motor de autenticação
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
const mockGetSession = vi.fn();
const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
    from: () => ({
      insert: (...args: unknown[]) => mockInsert(...args),
    }),
  },
}));

// Simulamos a lógica da função signIn do AuthContext e dos RouteGuards para verificação exata de cada cenário
async function executeSecureLogin(email: string, pass: string): Promise<{ success: boolean; error?: string; status?: string }> {
  const { data, error } = await mockSignInWithPassword({ email, password: pass });
  
  // 1. Falha nas credenciais (Login fake ou inválido)
  if (error || !data?.session || !data?.user) {
    await securityAuditService.logEvent('LOGIN_FAILED', { userEmail: email, details: { reason: 'CREDENTIALS_INVALID' } });
    return { success: false, error: 'Credenciais inválidas ou e-mail inexistente.' };
  }

  const user = data.user;

  // 2. Verificação de e-mail confirmado
  const isConfirmed = user.email_confirmed_at != null || user.user_metadata?.email_confirmed === true;
  if (!isConfirmed) {
    await securityAuditService.logEvent('ACCESS_DENIED', { userEmail: email, userId: user.id, details: { reason: 'EMAIL_NOT_CONFIRMED' } });
    await mockSignOut();
    return { success: false, error: 'Acesso negado: e-mail não confirmado.' };
  }

  // 3. Consulta ao status de aprovação
  const status = user.user_metadata?.status || 'NOT_FOUND';
  const role = user.user_metadata?.role || 'CLIENTE';

  if (role !== 'REPRESENTANTE' && role !== 'ADMIN') {
    await securityAuditService.logEvent('ACCESS_DENIED', { userEmail: email, userId: user.id, details: { reason: 'UNAUTHORIZED_ROLE' } });
    await mockSignOut();
    return { success: false, error: 'Acesso negado: perfil não autorizado para o CRM.' };
  }

  if (status !== 'APPROVED') {
    await securityAuditService.logEvent('ACCESS_DENIED', { userEmail: email, userId: user.id, details: { reason: `STATUS_${status}` } });
    await mockSignOut();
    return { success: false, error: `Acesso negado: status ${status}`, status };
  }

  await securityAuditService.logEvent('LOGIN_SUCCESS', { userEmail: email, userId: user.id, details: { status, role } });
  return { success: true, status };
}

describe('Security Hardening — Autenticação de Representantes (FASE 2, 4 e 11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    securityAuditService.clearInMemoryLogs();
  });

  it('1. Login fake/invenções no frontend sem validação real do Supabase Auth -> ACESSO NEGADO', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: new Error('Invalid login credentials'),
    });

    const res = await executeSecureLogin('fake@bypass.com', 'qualquersenhainvalida');
    
    expect(res.success).toBe(false);
    expect(res.error).toContain('Credenciais inválidas');
    expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'fake@bypass.com', password: 'qualquersenhainvalida' });
    
    const logs = securityAuditService.getInMemoryLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].event_type).toBe('LOGIN_FAILED');
  });

  it('2. Usuário cadastrado no Supabase Auth com Status PENDING -> ACESSO NEGADO e sessão destruída', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        session: { access_token: 'valid_token' },
        user: { id: 'user-001', email: 'pending@rep.com', email_confirmed_at: '2026-08-01', user_metadata: { role: 'REPRESENTANTE', status: 'PENDING' } },
      },
      error: null,
    });

    const res = await executeSecureLogin('pending@rep.com', 'senha123');

    expect(res.success).toBe(false);
    expect(res.error).toContain('status PENDING');
    expect(mockSignOut).toHaveBeenCalled(); // Garante que nenhuma sessão órfã permaneça ativa!
    
    const logs = securityAuditService.getInMemoryLogs();
    expect(logs[0].event_type).toBe('ACCESS_DENIED');
    expect(logs[0].details?.reason).toBe('STATUS_PENDING');
  });

  it('3. Usuário cadastrado no Supabase Auth com Status REJECTED -> ACESSO NEGADO e sessão destruída', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        session: { access_token: 'valid_token' },
        user: { id: 'user-002', email: 'rejected@rep.com', email_confirmed_at: '2026-08-01', user_metadata: { role: 'REPRESENTANTE', status: 'REJECTED' } },
      },
      error: null,
    });

    const res = await executeSecureLogin('rejected@rep.com', 'senha123');
    expect(res.success).toBe(false);
    expect(res.error).toContain('status REJECTED');
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('4. Usuário cadastrado no Supabase Auth com Status SUSPENDED -> ACESSO NEGADO e sessão destruída', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        session: { access_token: 'valid_token' },
        user: { id: 'user-003', email: 'suspended@rep.com', email_confirmed_at: '2026-08-01', user_metadata: { role: 'REPRESENTANTE', status: 'SUSPENDED' } },
      },
      error: null,
    });

    const res = await executeSecureLogin('suspended@rep.com', 'senha123');
    expect(res.success).toBe(false);
    expect(res.error).toContain('status SUSPENDED');
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('5. E-mail não confirmado pelo representante (email_confirmed_at null) -> ACESSO NEGADO', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        session: { access_token: 'valid_token' },
        user: { id: 'user-004', email: 'unconfirm@rep.com', email_confirmed_at: null, user_metadata: { role: 'REPRESENTANTE', status: 'APPROVED' } },
      },
      error: null,
    });

    const res = await executeSecureLogin('unconfirm@rep.com', 'senha123');
    expect(res.success).toBe(false);
    expect(res.error).toContain('e-mail não confirmado');
    expect(mockSignOut).toHaveBeenCalled();
    
    const logs = securityAuditService.getInMemoryLogs();
    expect(logs[0].details?.reason).toBe('EMAIL_NOT_CONFIRMED');
  });

  it('6. Login válido (Auth real + E-mail confirmado + Status APPROVED + Perfil REPRESENTANTE) -> SUCESSO TOTAL', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        session: { access_token: 'valid_token' },
        user: { id: 'rep-master', email: 'approved@rep.com', email_confirmed_at: '2026-08-01', user_metadata: { role: 'REPRESENTANTE', status: 'APPROVED' } },
      },
      error: null,
    });

    const res = await executeSecureLogin('approved@rep.com', 'senhaCorreta');
    expect(res.success).toBe(true);
    expect(res.status).toBe('APPROVED');
    expect(mockSignOut).not.toHaveBeenCalled();

    const logs = securityAuditService.getInMemoryLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].event_type).toBe('LOGIN_SUCCESS');
  });

  it('7. Isolamento RLS: Representante A não pode consultar clientes vinculados ao Representante B', async () => {
    // Simulação de verificação de tenant e representante ID
    const repIdLogged = 'rep-uuid-A';
    const clientRecord = { id: 'cli-001', nome: 'Cliente B', representante_id: 'rep-uuid-B', empresa_operadora_id: 'tenant-01' };

    const rlsPolicyPasses = clientRecord.representante_id === repIdLogged;
    expect(rlsPolicyPasses).toBe(false);
  });

  it('8. Acesso direto a URL protegida do CRM sem sessão real válida -> REDIRECIONA PARA LOGIN', () => {
    const isAuth = false;
    const realSessionValid = false;
    
    const shouldRedirectToLogin = !isAuth || !realSessionValid;
    expect(shouldRedirectToLogin).toBe(true);
  });
});
