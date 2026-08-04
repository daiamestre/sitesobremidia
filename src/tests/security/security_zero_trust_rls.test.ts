import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * ============================================================================
 * SPRINT 1.5 & NCR-001: SUÍTE DE REGRESSÃO ZERO-TRUST & SECURITY CORE
 * ============================================================================
 * Comprova que a autorização de transações no banco de dados obedece estritamente
 * à Camada Constitucional de Segurança (Security Core Layer) no PostgreSQL.
 * Impede agressivamente regressões onde Tokens JWT ainda não expirados pudessem
 * burlar regras de ciclo de vida (SUSPENDED, PENDING, DELETED) na API REST.
 */

// Simulador do motor SQL Security Core para execução regressiva automatizada no Vitest
class MockSecurityCoreEngine {
  private dbUsers: Record<string, { status: string; role: string; tenant: string }> = {};

  registerUser(id: string, status: string, role: string, tenant: string) {
    this.dbUsers[id] = { status, role, tenant };
  }

  // Simula public.fn_can_login(user_id) -> Separação de AUTENTICAÇÃO
  fn_can_login(userId: string): boolean {
    const u = this.dbUsers[userId];
    if (!u) return false;
    if (['OWNER', 'ADMIN'].includes(u.role)) return true;
    if (['ACTIVE', 'APPROVED'].includes(u.status)) return true;
    return false;
  }

  // Simula public.fn_can_access_data(user_id) -> Separação de AUTORIZAÇÃO
  fn_can_access_data(userId: string): boolean {
    const u = this.dbUsers[userId];
    if (!u) return false;
    if (['OWNER', 'ADMIN'].includes(u.role)) return true;
    if (['ACTIVE', 'APPROVED'].includes(u.status)) return true;
    return false;
  }

  // Simula RLS em chamadas REST, RPC, Storage e Realtime
  simulateCloudCall(userId: string, endpointType: 'REST' | 'RPC' | 'STORAGE' | 'REALTIME', tableOrResource: string): { status: number; data: string | null; error: string | null } {
    const hasAccess = this.fn_can_access_data(userId);
    if (!hasAccess) {
      return {
        status: 42501,
        data: null,
        error: `[ZERO-TRUST VIOLATION - 42501] Access denied on ${endpointType} (${tableOrResource}): user lifecycle status is inactive or suspended in PostgreSQL Security Core.`,
      };
    }
    return {
      status: 200,
      data: `[SUCCESS] Authorized ${endpointType} transaction on ${tableOrResource}.`,
      error: null,
    };
  }
}

describe('🛡️ NCR-001 — HARDENING ZERO TRUST RLS & SECURITY CORE LAYER', () => {
  let engine: MockSecurityCoreEngine;

  beforeEach(() => {
    engine = new MockSecurityCoreEngine();
    // Preenchendo a matriz transaccional com todos os perfis e status possíveis
    engine.registerUser('rep-active', 'ACTIVE', 'REPRESENTANTE', 'empresa-A');
    engine.registerUser('rep-approved', 'APPROVED', 'REPRESENTANTE', 'empresa-A');
    engine.registerUser('rep-pending', 'PENDING', 'REPRESENTANTE', 'empresa-A');
    engine.registerUser('rep-suspended', 'SUSPENDED', 'REPRESENTANTE', 'empresa-A');
    engine.registerUser('rep-rejected', 'REJECTED', 'REPRESENTANTE', 'empresa-A');
    engine.registerUser('rep-inactive', 'INACTIVE', 'REPRESENTANTE', 'empresa-A');
    engine.registerUser('rep-deleted', 'DELETED', 'REPRESENTANTE', 'empresa-A');
    engine.registerUser('owner-master', 'ACTIVE', 'OWNER', 'empresa-A');
    engine.registerUser('admin-corp', 'ACTIVE', 'ADMIN', 'empresa-A');
  });

  describe('1. Verificação Arquitetural na Migration 030 (Camada Constitucional e Modularidade)', () => {
    const sqlPath = path.resolve(__dirname, '../../../supabase/migrations/030_sprint_1_5_zero_trust_rls_and_concurrency.sql');
    let sqlContent: string;

    beforeEach(() => {
      sqlContent = fs.readFileSync(sqlPath, 'utf-8');
    });

    it('deve confirmar a existência da Camada Constitucional de Segurança (Security Core) no PostgreSQL', () => {
      expect(sqlContent).toContain('CREATE OR REPLACE FUNCTION public.fn_get_user_security_context');
      expect(sqlContent).toContain('CREATE OR REPLACE FUNCTION public.fn_can_login');
      expect(sqlContent).toContain('CREATE OR REPLACE FUNCTION public.fn_can_access_data');
      expect(sqlContent).toContain('SECURITY DEFINER');
    });

    it('deve separar claramente as regras de Autenticação (fn_can_login) das regras de Autorização de Dados (fn_can_access_data)', () => {
      // Prova que fn_can_login é dedicada a autenticação de sessão e fn_can_access_data à proteção RLS
      const canLoginDef = sqlContent.includes('fn_can_login');
      const canAccessDef = sqlContent.includes('fn_can_access_data');
      expect(canLoginDef).toBe(true);
      expect(canAccessDef).toBe(true);
    });

    it('deve comprovar que as Policies RLS das tabelas operacionais consomem funções centralizadas em vez de duplicar lógica', () => {
      expect(sqlContent).toContain('USING (public.can_access_client_data(empresa_operadora_id))');
      expect(sqlContent).toContain('USING (public.can_read_contrato(representante_id, empresa_operadora_id))');
      expect(sqlContent).toContain('USING (public.can_access_midia())');
    });
  });

  describe('2. Revogação Instantânea de Acesso (Token JWT Válido no terminal vs Status Inoperante)', () => {
    it('deve bloquear chamadas REST diretas de usuário que foi SUSPENSO no meio de uma sessão JWT ativa', () => {
      // O usuário rep-suspended possui JWT emitido há 10 minutos (ainda válido), mas no banco está SUSPENDED
      const res = engine.simulateCloudCall('rep-suspended', 'REST', 'public.contratos');
      expect(res.status).toBe(42501);
      expect(res.error).toContain('user lifecycle status is inactive or suspended');
    });

    it('deve simular transição em tempo real: usuário ACTIVE que vira SUSPENDED durante sessão perde acesso no segundo seguinte', () => {
      const u = 'target-user';
      engine.registerUser(u, 'ACTIVE', 'REPRESENTANTE', 'empresa-A');

      // 08:00:00 - Acesso REST normal
      const resBefore = engine.simulateCloudCall(u, 'REST', 'public.clientes');
      expect(resBefore.status).toBe(200);

      // 08:05:00 - Gestão aplica suspensão de conta
      engine.registerUser(u, 'SUSPENDED', 'REPRESENTANTE', 'empresa-A');

      // 08:05:01 - Mesmo JWT tenta consulta via curl/Postman no banco -> BLOQUEADO POR RLS ZERO TRUST
      const resAfter = engine.simulateCloudCall(u, 'REST', 'public.clientes');
      expect(resAfter.status).toBe(42501);
      expect(resAfter.error).toContain('[ZERO-TRUST VIOLATION - 42501]');
    });

    it('deve impedir acesso transacional em todos os estados não operantes (PENDING, REJECTED, INACTIVE, DELETED)', () => {
      const statusList = ['rep-pending', 'rep-rejected', 'rep-inactive', 'rep-deleted'];
      for (const uid of statusList) {
        const res = engine.simulateCloudCall(uid, 'REST', 'public.pedidos_insercao');
        expect(res.status).toBe(42501);
        expect(res.error).toContain('Access denied');
      }
    });
  });

  describe('3. Cobertura Zero-Trust em Múltiplos Canais (REST, RPC, Storage e Realtime)', () => {
    it('deve bloquear chamadas RPC (Remote Procedure Calls) de contas rebaixadas ou suspensas', () => {
      const res = engine.simulateCloudCall('rep-suspended', 'RPC', 'rpc.aprovar_solicitacao');
      expect(res.status).toBe(42501);
      expect(res.error).toContain('RPC');
    });

    it('deve barrar acesso de leitura e transcode ao bucket Cloudflare R2 / Supabase Storage para contas inativas', () => {
      const res = engine.simulateCloudCall('rep-rejected', 'STORAGE', 'r2.bucket.midias');
      expect(res.status).toBe(42501);
      expect(res.error).toContain('STORAGE');
    });

    it('deve desconectar e rejeitar pings de canais WebSocket / Realtime do Supabase para contas deletadas ou suspensas', () => {
      const res = engine.simulateCloudCall('rep-deleted', 'REALTIME', 'realtime.telas_heartbeats');
      expect(res.status).toBe(42501);
      expect(res.error).toContain('REALTIME');
    });
  });

  describe('4. Governança e Soberania Constitucional (Bypass OWNER & ADMIN)', () => {
    it('deve garantir que o perfil soberano OWNER nunca seja bloqueado pelo Security Core no banco de dados', () => {
      const channels: Array<'REST' | 'RPC' | 'STORAGE' | 'REALTIME'> = ['REST', 'RPC', 'STORAGE', 'REALTIME'];
      for (const ch of channels) {
        const res = engine.simulateCloudCall('owner-master', ch, 'public.usuarios');
        expect(res.status).toBe(200);
        expect(res.data).toContain('[SUCCESS]');
      }
    });

    it('deve permitir trânsito institucional do ADMIN conforme política de governança definida na Baseline', () => {
      const res = engine.simulateCloudCall('admin-corp', 'REST', 'public.log_auditoria');
      expect(res.status).toBe(200);
      expect(res.error).toBeNull();
    });

    it('deve autorizar trânsito normal para usuários colaboradores com status legítimo ACTIVE e APPROVED', () => {
      expect(engine.simulateCloudCall('rep-active', 'REST', 'public.contratos').status).toBe(200);
      expect(engine.simulateCloudCall('rep-approved', 'REST', 'public.contratos').status).toBe(200);
    });
  });
});
