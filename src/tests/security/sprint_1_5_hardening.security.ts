import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PERMISSIONS, PERMISSION_NODES } from '@/constants/permissions';
import { useRbac } from '@/hooks/useRbac';
import { accessRequestService } from '@/services/accessRequest.service';
import fs from 'fs';
import path from 'path';

// Mock do contexto de autenticação para simular perfis constituídos
const mockAuth = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuth(),
}));

// Mock do Supabase Client para simular comportamento anti-race condition
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockIs = vi.fn();
const mockSelect = vi.fn();
const mockSingle = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      select: (fields?: string) => ({
        eq: (col: string, val: any) => ({
          single: () => {
            if (table === 'solicitacoes_acesso' && val === 'already-approved-id') {
              return Promise.resolve({
                data: {
                  id: 'already-approved-id',
                  status: 'PENDING',
                  nome_usuario: 'Teste Race Condition',
                  email_usuario: 'race@teste.com',
                  tipo_acesso: 'REPRESENTANTE',
                },
                error: null,
              });
            }
            return Promise.resolve({ data: null, error: { message: 'Not found' } });
          },
          maybeSingle: () => Promise.resolve({ data: null }),
        }),
      }),
      update: (payload: any) => {
        const queryObj = {
          eq: (col: string, val: any) => queryObj,
          is: (col: string, val: any) => queryObj,
          select: (fields?: string) => {
            // Se for simulação de segunda requisição concorrente, retorna array vazio
            return Promise.resolve({ data: [], error: null });
          },
        };
        return queryObj;
      },
    }),
  },
}));

describe('🛡️ SPRINT 1.5 — HARDENING, ZERO TRUST & PERMISSION REGISTRY', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ETAPA A: verificação de Blindagem RLS no Arquivo SQL 030', () => {
    it('deve confirmar que a Migration 030 contém o motor is_active_user() para barrar acessos REST de JWTs expirados ou suspensos', () => {
      const sqlPath = path.resolve(__dirname, '../../../supabase/migrations/030_sprint_1_5_zero_trust_rls_and_concurrency.sql');
      const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

      expect(sqlContent).toContain('CREATE OR REPLACE FUNCTION public.is_active_user()');
      expect(sqlContent).toContain('SECURITY DEFINER');
      expect(sqlContent).toContain("IN ('ACTIVE', 'APPROVED')");
      expect(sqlContent).toContain('ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;');
      expect(sqlContent).toContain('USING (public.can_access_client_data(empresa_operadora_id))');
    });
  });

  describe('ETAPA B: Blindagem contra Condição de Corrida em Aprovações', () => {
    it('deve rejeitar e disparar exceção [RACE CONDITION SHIELD] se dois administradores aprovarem simultaneamente a mesma solicitação', async () => {
      const result = await accessRequestService.processDecision('already-approved-id', 'APPROVED', undefined, 'admin-uuid');

      expect(result.success).toBe(false);
      expect(result.error).toContain('[RACE CONDITION SHIELD]');
    });

    it('deve comprovar a existência da trigger PL/pgSQL anti-sobrescritura na Migration 030', () => {
      const sqlPath = path.resolve(__dirname, '../../../supabase/migrations/030_sprint_1_5_zero_trust_rls_and_concurrency.sql');
      const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

      expect(sqlContent).toContain('CREATE OR REPLACE FUNCTION public.fn_guard_approval_concurrency()');
      expect(sqlContent).toContain('CREATE TRIGGER trg_guard_approval_concurrency');
    });
  });

  describe('ETAPA C: Registro Central de Permissões (Enterprise Permission Registry)', () => {
    it('deve exportar 100% das constantes com chaves tipadas e hierarquia Role -> Group -> Permission -> Action', () => {
      expect(PERMISSIONS.MEDIA_UPLOAD).toBe('media.upload');
      expect(PERMISSIONS.BILLING_INVOICE_ISSUE).toBe('billing.invoice.issue');
      expect(PERMISSIONS.USERS_APPROVE).toBe('users.approve');

      // Verifica integridade dos nós do registro
      const uploadNode = PERMISSION_NODES[PERMISSIONS.MEDIA_UPLOAD];
      expect(uploadNode.group).toBe('media');
      expect(uploadNode.action).toBe('create');
      expect(uploadNode.description).toBeDefined();
    });

    it('deve permitir que o hook useRbac valide ações através de constantes em vez de strings literais esparsas', () => {
      // Simula sessão de FUNCIONÁRIO (Operador de Mídia)
      mockAuth.mockReturnValue({
        isAuthenticated: true,
        perfilNome: 'FUNCIONARIO',
        usuario: { id: 'func-1', email: 'func@sobremidia.com' },
      });

      const rbac = useRbac();
      expect(rbac.can(PERMISSIONS.MEDIA_UPLOAD)).toBe(true);
      expect(rbac.can(PERMISSIONS.MEDIA_MANAGE)).toBe(true);
      // Funcionário não deve aprovar usuários na central nem emitir faturas
      expect(rbac.can(PERMISSIONS.USERS_APPROVE)).toBe(false);
      expect(rbac.can(PERMISSIONS.BILLING_INVOICE_ISSUE)).toBe(false);
    });

    it('deve garantir que OWNER e ADMIN gozem de bypass constitucional sobre qualquer constante de permissão', () => {
      mockAuth.mockReturnValue({
        isAuthenticated: true,
        perfilNome: 'OWNER',
        usuario: { id: 'owner-id', email: 'sobremidiadesigner@gmail.com' },
      });

      const rbac = useRbac();
      expect(rbac.can(PERMISSIONS.MEDIA_UPLOAD)).toBe(true);
      expect(rbac.can(PERMISSIONS.BILLING_INVOICE_ISSUE)).toBe(true);
      expect(rbac.can(PERMISSIONS.SYSTEM_MANAGE)).toBe(true);
    });
  });
});
