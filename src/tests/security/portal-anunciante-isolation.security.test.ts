/**
 * MISSÃO P0 — TESTES NEGATIVOS DE ISOLAMENTO DO PORTAL DO ANUNCIANTE
 *
 * Valida que o ANUNCIANTE:
 * - Não pode acessar ERP, CRM, Admin, Representante, Gestor, Owner
 * - Pode acessar exclusivamente as rotas do /portal/*
 *
 * Estratégia:
 * 1. Testa a lógica de resolução de acesso (replica RouteGuards) sem rede/Supabase
 * 2. Valida conteúdo dos arquivos fonte para garantir ausência de links proibidos
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ──────────────────────────────────────────────────────────────────────
// Função que replica a lógica de bloqueio do RouteGuards
// (sem dependência de React, Router ou Supabase)
// ──────────────────────────────────────────────────────────────────────
type AccessResult =
  | 'ALLOWED'
  | 'BLOCKED_TO_PORTAL'
  | 'BLOCKED_TO_REPRESENTANTES'
  | 'BLOCKED_TO_DASHBOARD';

function resolvePortalAccess(role: string, pathname: string): AccessResult {
  const isAnunciante = role === 'ANUNCIANTE' || role === 'CLIENTE';
  const isRepresentante = role === 'REPRESENTANTE';
  const isGestor =
    role === 'GESTOR' ||
    role === 'GERENTE' ||
    role === 'FINANCEIRO' ||
    role === 'SUPERVISOR';

  if (isAnunciante) {
    if (pathname.startsWith('/representantes')) return 'BLOCKED_TO_PORTAL';
    if (pathname.startsWith('/workspace')) return 'BLOCKED_TO_PORTAL';
    if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) return 'BLOCKED_TO_PORTAL';
    if (pathname.startsWith('/financeiro')) return 'BLOCKED_TO_PORTAL';
    if (pathname.startsWith('/admin')) return 'BLOCKED_TO_PORTAL';
  }
  if (isRepresentante) {
    if (pathname === '/portal' || pathname.startsWith('/portal/')) return 'BLOCKED_TO_REPRESENTANTES';
  }
  if (isGestor) {
    if (pathname === '/portal' || pathname.startsWith('/portal/')) return 'BLOCKED_TO_DASHBOARD';
  }
  return 'ALLOWED';
}

const SRC_ROOT = resolve(__dirname, '../../');

// ──────────────────────────────────────────────────────────────────────
// §12 TESTES NEGATIVOS — ANUNCIANTE BLOQUEADO
// ──────────────────────────────────────────────────────────────────────
describe('MISSÃO P0 — Isolamento do Portal do Anunciante', () => {

  describe('ANUNCIANTE → rotas proibidas = NEGADO', () => {
    const BLOCKED_ROUTES = [
      // ERP / Workspace
      '/workspace',
      '/workspace/corporate',
      '/workspace/financeiro',
      '/workspace/representantes',
      '/workspace/campanhas',
      '/workspace/clientes',
      '/workspace/usuarios',
      '/workspace/noc',
      '/workspace/bi',
      '/workspace/configuracoes',
      // CRM / Representante
      '/representantes',
      '/representantes/dashboard',
      '/representantes/clientes',
      '/representantes/financeiro',
      '/representantes/campanhas',
      '/representantes/prospeccao',
      '/representantes/bi',
      // Dashboard do Gestor de Mídias
      '/dashboard',
      '/dashboard/medias',
      '/dashboard/playlists',
      '/dashboard/screens',
      '/dashboard/analytics',
      '/dashboard/settings',
      '/dashboard/admin/users',
      // Financeiro standalone
      '/financeiro',
      '/financeiro/cobrancas',
      '/financeiro/cobrancas/abc123',
      // Admin
      '/admin',
      '/admin/solicitacoes',
      '/admin/solicitacoes/abc123',
    ];

    BLOCKED_ROUTES.forEach((route) => {
      it(`ANUNCIANTE → ${route} = NEGADO (redirect /portal)`, () => {
        const result = resolvePortalAccess('ANUNCIANTE', route);
        expect(result).toBe('BLOCKED_TO_PORTAL');
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // §12 TESTES POSITIVOS — ANUNCIANTE PERMITIDO
  // ──────────────────────────────────────────────────────────────────────
  describe('ANUNCIANTE → rotas permitidas = AUTORIZADO', () => {
    const ALLOWED_ROUTES = [
      '/portal',
      '/portal/campanhas',
      '/portal/nova-campanha',
      '/portal/assets',
      '/portal/playlists',
      '/portal/pontos',
      '/portal/expansao',
      '/portal/financeiro',
      '/portal/central',
      '/portal/configuracoes',
      '/portal/contrato',
      '/portal/onboarding',
      '/portal/produtos',
      '/portal/ofertas',
      '/portal/encarte',
      '/portal/brand-kit',
      '/portal/equipe',
      '/portal/insercoes',
    ];

    ALLOWED_ROUTES.forEach((route) => {
      it(`ANUNCIANTE → ${route} = PERMITIDO`, () => {
        const result = resolvePortalAccess('ANUNCIANTE', route);
        expect(result).toBe('ALLOWED');
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // §13 REGRESSÃO — outros perfis mantêm seus acessos próprios
  // ──────────────────────────────────────────────────────────────────────
  describe('REGRESSÃO — outros perfis mantêm seus acessos', () => {
    it('REPRESENTANTE → /representantes/dashboard = PERMITIDO', () => {
      expect(resolvePortalAccess('REPRESENTANTE', '/representantes/dashboard')).toBe('ALLOWED');
    });
    it('REPRESENTANTE → /representantes/clientes = PERMITIDO', () => {
      expect(resolvePortalAccess('REPRESENTANTE', '/representantes/clientes')).toBe('ALLOWED');
    });
    it('GESTOR → /dashboard = PERMITIDO', () => {
      expect(resolvePortalAccess('GESTOR', '/dashboard')).toBe('ALLOWED');
    });
    it('GESTOR → /dashboard/medias = PERMITIDO', () => {
      expect(resolvePortalAccess('GESTOR', '/dashboard/medias')).toBe('ALLOWED');
    });
    it('OWNER → /workspace/corporate = PERMITIDO', () => {
      expect(resolvePortalAccess('OWNER', '/workspace/corporate')).toBe('ALLOWED');
    });
    it('ADMIN → /workspace/usuarios = PERMITIDO', () => {
      expect(resolvePortalAccess('ADMIN', '/workspace/usuarios')).toBe('ALLOWED');
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // §13 REGRESSÃO — outros perfis bloqueados do portal do anunciante
  // ──────────────────────────────────────────────────────────────────────
  describe('REGRESSÃO — outros perfis bloqueados do /portal', () => {
    it('REPRESENTANTE → /portal = NEGADO (redirect /representantes/dashboard)', () => {
      expect(resolvePortalAccess('REPRESENTANTE', '/portal')).toBe('BLOCKED_TO_REPRESENTANTES');
    });
    it('REPRESENTANTE → /portal/campanhas = NEGADO', () => {
      expect(resolvePortalAccess('REPRESENTANTE', '/portal/campanhas')).toBe('BLOCKED_TO_REPRESENTANTES');
    });
    it('GESTOR → /portal = NEGADO (redirect /dashboard)', () => {
      expect(resolvePortalAccess('GESTOR', '/portal')).toBe('BLOCKED_TO_DASHBOARD');
    });
    it('GESTOR → /portal/financeiro = NEGADO', () => {
      expect(resolvePortalAccess('GESTOR', '/portal/financeiro')).toBe('BLOCKED_TO_DASHBOARD');
    });
    it('SUPERVISOR → /portal/campanhas = NEGADO', () => {
      expect(resolvePortalAccess('SUPERVISOR', '/portal/campanhas')).toBe('BLOCKED_TO_DASHBOARD');
    });
    it('FINANCEIRO → /portal = NEGADO (redirect /dashboard)', () => {
      expect(resolvePortalAccess('FINANCEIRO', '/portal')).toBe('BLOCKED_TO_DASHBOARD');
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Dashboard do Anunciante — auditoria de conteúdo do arquivo fonte
  // ──────────────────────────────────────────────────────────────────────
  describe('CustomerPortalDashboard — ausência de links para ERP', () => {
    let dashboardSrc: string;

    beforeAll(() => {
      dashboardSrc = readFileSync(
        resolve(SRC_ROOT, 'modules/crm/pages/CustomerPortalDashboard.tsx'),
        'utf-8'
      );
    });

    it('Não deve conter texto "Voltar ao ERP"', () => {
      expect(dashboardSrc).not.toContain('Voltar ao ERP');
    });

    it('Não deve navegar para /workspace', () => {
      expect(dashboardSrc).not.toContain("navigate('/workspace')");
    });

    it('Não deve importar ArrowLeft (removido junto com botão ERP)', () => {
      // ArrowLeft foi importado junto com o botão ERP — deve ter sido removido
      // Se ainda presente, pode indicar regressão futura
      const arrowLeftUsage = dashboardSrc.match(/ArrowLeft/g);
      expect(arrowLeftUsage).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // CustomerPortalLayout — auditoria de links de navegação
  // ──────────────────────────────────────────────────────────────────────
  describe('CustomerPortalLayout — isolamento de links de navegação', () => {
    let layoutSrc: string;

    beforeAll(() => {
      layoutSrc = readFileSync(
        resolve(SRC_ROOT, 'modules/crm/layout/CustomerPortalLayout.tsx'),
        'utf-8'
      );
    });

    it('Layout não deve conter link to="/workspace"', () => {
      expect(layoutSrc).not.toContain('to="/workspace');
    });

    it('Layout não deve conter link to="/representantes"', () => {
      expect(layoutSrc).not.toContain('to="/representantes');
    });

    it('Layout não deve conter link to="/dashboard" (rota do Gestor)', () => {
      // /dashboard sem /portal não deve aparecer como destino de link
      const dashLinks = layoutSrc.match(/to="\/dashboard[^/]/g) || [];
      expect(dashLinks.length).toBe(0);
    });

    it('Layout não deve conter "Voltar ao ERP"', () => {
      expect(layoutSrc).not.toContain('Voltar ao ERP');
    });

    it('Layout deve ter Briefcase importado', () => {
      expect(layoutSrc).toContain('Briefcase');
    });

    it('Layout deve ter isLoggingOut declarado', () => {
      expect(layoutSrc).toContain('isLoggingOut');
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // RouteGuards — auditoria de cobertura de bloqueios
  // ──────────────────────────────────────────────────────────────────────
  describe('RouteGuards — cobertura de bloqueios ampliada', () => {
    let guardSrc: string;

    beforeAll(() => {
      guardSrc = readFileSync(
        resolve(SRC_ROOT, 'components/auth/RouteGuards.tsx'),
        'utf-8'
      );
    });

    it('Guard deve bloquear /dashboard/ (subpaths)', () => {
      expect(guardSrc).toContain("startsWith('/dashboard/')");
    });

    it('Guard deve bloquear /financeiro (todas subpaths)', () => {
      expect(guardSrc).toContain("startsWith('/financeiro')");
    });

    it('Guard deve bloquear /admin', () => {
      expect(guardSrc).toContain("startsWith('/admin')");
    });

    it('Guard deve bloquear /workspace (todas subpaths)', () => {
      expect(guardSrc).toContain("startsWith('/workspace')");
    });

    it('Guard deve bloquear /representantes (todas subpaths)', () => {
      expect(guardSrc).toContain("startsWith('/representantes')");
    });
  });
});
