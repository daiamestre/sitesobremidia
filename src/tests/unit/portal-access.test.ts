/**
 * MATRIZ DE ACESSO â€” porta de entrada Ã— RBAC real (mandato Â§16)
 * 16 combinações: Anunciante / Representante / Gestor / Corporativo Ã— portais.
 * OWNER = soberano (constitucional). CLIENTE = legado do portal Anunciante.
 */
import { describe, it, expect } from 'vitest';
import {
  podeAcessarPortal,
  resolverPortalSolicitado,
  ROTULO_PORTAL,
  LOGIN_DO_PORTAL,
  areaDoPerfil,
  loginDoPerfil,
  areaDaRota,
  podeAbrirRota,
  type PortalEntrada,
} from '@/lib/portalAccess';

const P: Record<string, PortalEntrada> = {
  ANU: 'ANUNCIANTES',
  REP: 'REPRESENTANTES',
  GES: 'GESTOR',
  CORP: 'CORPORATIVO',
};

describe('Anunciante (ANUNCIANTE)', () => {
  it('â†’ Anunciantes PASS', () => expect(podeAcessarPortal(P.ANU, 'ANUNCIANTE')).toBe(true));
  it('â†’ Representantes DENY', () => expect(podeAcessarPortal(P.REP, 'ANUNCIANTE')).toBe(false));
  it('â†’ Gestor DENY', () => expect(podeAcessarPortal(P.GES, 'ANUNCIANTE')).toBe(false));
  it('â†’ Corporate DENY', () => expect(podeAcessarPortal(P.CORP, 'ANUNCIANTE')).toBe(false));
});

describe('Representante (REPRESENTANTE)', () => {
  it('â†’ Representantes PASS', () => expect(podeAcessarPortal(P.REP, 'REPRESENTANTE')).toBe(true));
  it('â†’ Anunciantes DENY', () => expect(podeAcessarPortal(P.ANU, 'REPRESENTANTE')).toBe(false));
  it('â†’ Gestor DENY', () => expect(podeAcessarPortal(P.GES, 'REPRESENTANTE')).toBe(false));
  it('â†’ Corporate DENY', () => expect(podeAcessarPortal(P.CORP, 'REPRESENTANTE')).toBe(false));
});

describe('Gestor (GESTOR)', () => {
  it('â†’ Gestor PASS', () => expect(podeAcessarPortal(P.GES, 'GESTOR')).toBe(true));
  it('â†’ Anunciantes DENY', () => expect(podeAcessarPortal(P.ANU, 'GESTOR')).toBe(false));
  it('â†’ Representantes DENY', () => expect(podeAcessarPortal(P.REP, 'GESTOR')).toBe(false));
  it('F-204: Corporate DENY (o Gestor entra só pela área do Gestor)', () =>
    expect(podeAcessarPortal(P.CORP, 'GESTOR')).toBe(false));
});

describe('Corporativos existentes â†’ Corporate', () => {
  it.each(['OWNER', 'ADMIN', 'GERENTE', 'FINANCEIRO', 'SUPERVISOR'])(
    '%s PASS',
    (p) => expect(podeAcessarPortal(P.CORP, p)).toBe(true),
  );
  it.each(['OWNER', 'ADMIN'])('%s é soberano em TODOS os portais', (p) => {
    expect(podeAcessarPortal(P.ANU, p)).toBe(true);
    expect(podeAcessarPortal(P.REP, p)).toBe(true);
    expect(podeAcessarPortal(P.GES, p)).toBe(true);
  });
});

describe('Casos especiais legados e negativos', () => {
  it('CLIENTE (legado) mantém acesso histórico ao Portal do Anunciante', () =>
    expect(podeAcessarPortal(P.ANU, 'CLIENTE')).toBe(true));
  it('CLIENTE NÃƒO acessa Representantes/Gestor/Corporate', () => {
    expect(podeAcessarPortal(P.REP, 'CLIENTE')).toBe(false);
    expect(podeAcessarPortal(P.GES, 'CLIENTE')).toBe(false);
    expect(podeAcessarPortal(P.CORP, 'CLIENTE')).toBe(false);
  });
  it('PARCEIRO não acessa nenhum dos quatro portais de entrada', () => {
    expect(podeAcessarPortal(P.ANU, 'PARCEIRO')).toBe(false);
    expect(podeAcessarPortal(P.REP, 'PARCEIRO')).toBe(false);
    expect(podeAcessarPortal(P.GES, 'PARCEIRO')).toBe(false);
    expect(podeAcessarPortal(P.CORP, 'PARCEIRO')).toBe(false);
  });
  it('sem perfil â†’ NEGADO sempre (não autenticado/RBAC vazio)', () => {
    for (const portal of Object.values(P)) {
      expect(podeAcessarPortal(portal, null)).toBe(false);
      expect(podeAcessarPortal(portal, '')).toBe(false);
    }
  });
});

describe('resolverPortalSolicitado â€” query string só DECLARA a porta, nunca autoriza', () => {
  it('?role=anunciantes â†’ ANUNCIANTES', () =>
    expect(resolverPortalSolicitado('anunciantes', '/auth')).toBe('ANUNCIANTES'));
  it('?role=gestor â†’ GESTOR', () =>
    expect(resolverPortalSolicitado('gestor', '/auth')).toBe('GESTOR'));
  it('?role=representantes â†’ REPRESENTANTES', () =>
    expect(resolverPortalSolicitado('representantes', '/auth')).toBe('REPRESENTANTES'));
  it('/auth/corporate (pathname) â†’ CORPORATIVO mesmo sem role', () =>
    expect(resolverPortalSolicitado(null, '/auth/corporate')).toBe('CORPORATIVO'));
  it('/auth genérico sem role â†’ null (login corporativo válido)', () =>
    expect(resolverPortalSolicitado(null, '/auth')).toBeNull());
  it('role desconhecido â†’ null', () =>
    expect(resolverPortalSolicitado('owner-hack', '/auth')).toBeNull());
});

describe('Rótulos sem vazamento de arquitetura', () => {
  it.each(Object.entries(ROTULO_PORTAL) as [PortalEntrada, string][])('%s â†’ "%s"', (k, label) => {
    expect(label).not.toMatch(/supabase|rpc|rls|role|perfil_id/i);
  });
});

describe('F-204 — cada perfil só pela sua área; porta errada leva para a certa', () => {
  const PERFIS = ['ANUNCIANTE', 'CLIENTE', 'REPRESENTANTE', 'GESTOR', 'FUNCIONARIO', 'OPERACIONAL', 'DESIGNER', 'PARCEIRO',
    'FINANCEIRO', 'GERENTE', 'SUPERVISOR', 'OWNER', 'ADMIN'];
  // o mesmo início de área do AuthContext.workspaceRoute
  const INICIO: Record<string, string> = {
    ANUNCIANTE: '/portal', CLIENTE: '/portal', REPRESENTANTE: '/representantes/dashboard', GESTOR: '/dashboard',
    FUNCIONARIO: '/dashboard', OPERACIONAL: '/dashboard', DESIGNER: '/dashboard', PARCEIRO: '/dashboard',
    FINANCEIRO: '/workspace/financeiro', GERENTE: '/workspace/corporate', SUPERVISOR: '/workspace/corporate',
    OWNER: '/workspace/corporate', ADMIN: '/workspace/corporate',
  };

  it('Gestor NÃO entra pelo Representante nem pelo Corporativo', () => {
    expect(podeAcessarPortal('REPRESENTANTES', 'GESTOR')).toBe(false);
    expect(podeAcessarPortal('CORPORATIVO', 'GESTOR')).toBe(false);
    expect(podeAbrirRota('/representantes/dashboard', 'GESTOR')).toBe(false);
    expect(podeAbrirRota('/workspace/corporate', 'GESTOR')).toBe(false);
    expect(podeAbrirRota('/financeiro/cobrancas', 'GESTOR')).toBe(false);
    expect(podeAbrirRota('/dashboard/screens', 'GESTOR')).toBe(true);
  });

  it('cada perfil só abre a sua área; dono/ADM abrem todas', () => {
    const areas = ['/portal/contrato', '/representantes/clientes', '/dashboard/screens', '/workspace/corporate'];
    for (const perfil of PERFIS) {
      const abre = areas.filter((r) => podeAbrirRota(r, perfil));
      if (perfil === 'OWNER' || perfil === 'ADMIN') expect(abre).toHaveLength(4);
      else expect(abre).toHaveLength(1);
    }
    expect(podeAbrirRota('/dashboard', 'REPRESENTANTE')).toBe(false);
    expect(podeAbrirRota('/workspace/clientes', 'REPRESENTANTE')).toBe(false);
    expect(podeAbrirRota('/representantes/dashboard', 'FINANCEIRO')).toBe(false);
    expect(podeAbrirRota('/dashboard', 'FINANCEIRO')).toBe(false);
    expect(podeAbrirRota('/portal', 'GESTOR')).toBe(false);
  });

  it('rotas sem área (login, player, cobrança pública) ficam livres', () => {
    for (const r of ['/representantes/login', '/auth', '/auth/corporate', '/player/x', '/cobranca/abc', '/']) {
      expect(areaDaRota(r)).toBeNull();
      expect(podeAbrirRota(r, 'ANUNCIANTE')).toBe(true);
    }
    expect(areaDaRota('/dashboardx')).toBeNull();
  });

  it('sem laço: a porta certa aceita o perfil e o início da área dele é uma rota que ele pode abrir', () => {
    for (const perfil of PERFIS) {
      expect(podeAbrirRota(INICIO[perfil], perfil)).toBe(true);
      const destino = loginDoPerfil(perfil);
      const url = new URL(destino, 'https://x.local');
      const portal = resolverPortalSolicitado(url.searchParams.get('role'), url.pathname);
      if (portal) expect(podeAcessarPortal(portal, perfil)).toBe(true);
    }
  });

  it('porta certa de cada perfil', () => {
    expect(loginDoPerfil('GESTOR')).toBe(LOGIN_DO_PORTAL.GESTOR);
    expect(loginDoPerfil('REPRESENTANTE')).toBe('/representantes/login');
    expect(loginDoPerfil('ANUNCIANTE')).toBe(LOGIN_DO_PORTAL.ANUNCIANTES);
    expect(loginDoPerfil('FINANCEIRO')).toBe('/auth/corporate');
    expect(loginDoPerfil('PARCEIRO')).toBe('/auth?tab=login');
    expect(areaDoPerfil('ADMIN')).toBe('TODAS');
    expect(areaDoPerfil('GESTOR', true)).toBe('TODAS');
  });
});
