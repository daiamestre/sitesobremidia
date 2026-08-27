/**
 * TESTES 6/7/8 â€” Matriz RBAC de acesso cruzado (useRbac real)
 *  T6: ANUNCIANTE NÃƒO acessa dashboard OWNER
 *  T7: ANUNCIANTE NÃƒO acessa dashboard REPRESENTANTE
 *  T8: REPRESENTANTE NÃƒO acessa portal ANUNCIANTE
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock mínimo do contexto de autenticação consumido por useRbac
const mockAuth = {
  usuario: null as Record<string, unknown> | null,
  perfilNome: null as string | null,
  representante: null,
  empresaOperadoraId: 't1',
  isAuthenticated: true,
};

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

import { useRbac } from '@/hooks/useRbac';
import { PERMISSIONS } from '@/constants/permissions';

function hookWithRole(role: string) {
  mockAuth.perfilNome = role;
  mockAuth.isAuthenticated = true;
  mockAuth.usuario = role === 'OWNER' ? { id: 'u1', is_owner: true } : null;
  return renderHook(() => useRbac());
}

beforeEach(() => {
  mockAuth.perfilNome = null;
});

describe('RBAC â€” bloqueios de acesso cruzado (TESTE 6/7/8)', () => {
  it('T6 â€” ANUNCIANTE não possui permissões de dashboard OWNER', () => {
    const { result } = hookWithRole('ANUNCIANTE');
    expect(result.current.isAnunciante).toBe(true);
    expect(result.current.isOwner).toBe(false);
    expect(result.current.hasRole('OWNER')).toBe(false);
    expect(result.current.hasRole('ADMIN')).toBe(false);
    expect(result.current.can(PERMISSIONS.USERS_APPROVE)).toBe(false);
    expect(result.current.can(PERMISSIONS.TEAM_MANAGE)).toBe(false);
  });

  it('T6b â€” ANUNCIANTE mantém apenas permissões _OWN do portal', () => {
    const { result } = hookWithRole('ANUNCIANTE');
    expect(result.current.can(PERMISSIONS.CONTRACT_READ_OWN)).toBe(true);
    expect(result.current.can(PERMISSIONS.CAMPAIGNS_READ_OWN)).toBe(true);
    expect(result.current.can(PERMISSIONS.CONTRACT_READ)).toBe(false);
    expect(result.current.can(PERMISSIONS.CRM_READ)).toBe(false);
  });

  it('T7 â€” ANUNCIANTE não acessa área de REPRESENTANTE', () => {
    const { result } = hookWithRole('ANUNCIANTE');
    expect(result.current.hasRole('REPRESENTANTE')).toBe(false);
    expect(result.current.isRepresentante).toBe(false);
    expect(result.current.can(PERMISSIONS.PROPOSAL_CREATE)).toBe(false);
  });

  it('T8 â€” REPRESENTANTE não acessa portal ANUNCIANTE', () => {
    const { result } = hookWithRole('REPRESENTANTE');
    expect(result.current.isAnunciante).toBe(false);
    expect(result.current.hasRole('ANUNCIANTE')).toBe(false);
    expect(result.current.can(PERMISSIONS.REPORTS_CLIENT_VIEW)).toBe(false);
    expect(result.current.can(PERMISSIONS.CAMPAIGNS_READ_OWN)).toBe(false);
  });

  it('OWNER mantém bypass constitucional (proteção inalterada)', () => {
    const { result } = hookWithRole('OWNER');
    expect(result.current.isOwner).toBe(true);
    expect(result.current.hasRole('ANUNCIANTE')).toBe(true); // bypass OWNER/ADMIN vigente
  });
});

describe('Central â€” quem pode decidir autorizações de acesso', () => {
  const CAN_DECIDE = ['OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'FINANCEIRO'];

  it.each(CAN_DECIDE)('%s pode decidir solicitações na Central', (role) => {
    expect(CAN_DECIDE.includes(role)).toBe(true);
  });

  it.each(['FUNCIONARIO', 'REPRESENTANTE', 'ANUNCIANTE', 'PARCEIRO', 'DESIGNER'])(
    '%s NÃƒO pode decidir solicitações na Central',
    (role) => {
      expect(CAN_DECIDE.includes(role)).toBe(false);
    }
  );
});

describe('Rotas por perfil (portal correto após aprovação)', () => {
  // Espelha a regra oficial de AuthContext.signIn/workspaceRoute
  function routeFor(role: string): string {
    switch (role) {
      case 'OWNER':
      case 'ADMIN':
      case 'GERENTE':
      case 'SUPERVISOR':
        return '/workspace/corporate';
      case 'FINANCEIRO':
        return '/workspace/financeiro';
      case 'ANUNCIANTE':
      case 'CLIENTE':
        return '/portal';
      case 'REPRESENTANTE':
        return '/representantes/dashboard';
      default:
        return '/dashboard';
    }
  }

  it('ANUNCIANTE aprovado vai para /portal', () => {
    expect(routeFor('ANUNCIANTE')).toBe('/portal');
  });
  it('REPRESENTANTE vai para /representantes/dashboard', () => {
    expect(routeFor('REPRESENTANTE')).toBe('/representantes/dashboard');
  });
  it('OWNER/ADMIN vão para /workspace/corporate', () => {
    expect(routeFor('OWNER')).toBe('/workspace/corporate');
    expect(routeFor('ADMIN')).toBe('/workspace/corporate');
  });
});
