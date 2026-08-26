import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import fs from 'fs';
import path from 'path';

import { CrmSidebar } from '@/modules/crm/components/Sidebar';
import { RepresentantesGerenciaService } from '@/services/representantesGerencia.service';
import { usePermissoesRepresentantes } from '@/hooks/usePermissoesRepresentantes';

// ---------------------------------------------------------------------------
// REGRESSION GUARD — Central de Acessos + Representantes (OWNER)
// Se qualquer peça protegida (rota, menu, página, service, hook) for removida,
// este teste FALHA => REGRESSION BLOCKED. NUNCA remover peças deste teste.
// ---------------------------------------------------------------------------

vi.mock('@/modules/crm/contexts/CrmSessionContext', () => ({
  useCrmSession: () => ({
    userName: 'Owner Test',
    userEmail: 'owner@sobremidia.com.br',
    userInitials: 'OT',
    userCargo: 'OWNER',
    handleCrmLogout: vi.fn(),
    isLoggingOut: false,
  }),
}));

vi.mock('@/hooks/useCentral', () => ({
  useCentralUnread: () => ({ total: 3 }),
  useCentral: () => ({ data: [], isLoading: false }),
  useConversas: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/hooks/useRbac', () => ({
  useRbac: () => ({ isOwner: true, role: 'OWNER' }),
}));

vi.mock('@/services/corporateUsers.service', () => ({
  corporateUsersService: {
    getMyPermissions: vi.fn().mockResolvedValue(['users.view', 'representantes.view_performance']),
  },
}));

const PROJETO = process.cwd();
const ler = (rel: string) => fs.readFileSync(path.join(PROJETO, rel), 'utf8');

// Migrations protegidas: vivas em migrations/ ou preservadas em
// migrations_archive/ (reconciliação repo=cloud=ledger — conteúdo NUNCA apagado).
const ARTEFATOS_PROTEGIDOS = [
  'src/modules/corporate/pages/UsuariosAcessosPage.tsx',
  'src/modules/crm/pages/RepresentantesPage.tsx',
  'src/modules/crm/pages/DesempenhoRepresentantesPage.tsx',
  'src/modules/crm/pages/RepresentanteDetalhePage.tsx',
  'src/services/representantesGerencia.service.ts',
  'src/hooks/usePermissoesRepresentantes.ts',
  'src/modules/crm/components/Sidebar.tsx',
  'src/App.tsx',
  'supabase/migrations_archive/20260826_representantes_gestao_desempenho.sql',
  'supabase/migrations/20260825_central_acessos_hardening.sql',
];

describe('REGRESSION GUARD — Central de Acessos e Representantes (protecao permanente)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Arquivos protegidos existem (nenhuma peca pode ser removida)', () => {
    for (const rel of ARTEFATOS_PROTEGIDOS) {
      expect(fs.existsSync(path.join(PROJETO, rel)), `ARQUIVO REMOVIDO: ${rel}`).toBe(true);
    }
  });

  it('2. ROTAS da Central e dos Representantes existem no App.tsx', () => {
    const app = ler('src/App.tsx');
    expect(app.includes('path="/workspace"'), 'Parent /workspace removido do App.tsx').toBe(true);
    for (const rota of [
      'path="usuarios"',
      'path="representantes"',
      'path="representantes/desempenho"',
      'path="representantes/:id"',
    ]) {
      expect(app.includes(rota), `ROTA REMOVIDA do App.tsx: ${rota}`).toBe(true);
    }
  });

  it('3. MENU do OWNER: Central de Acessos + Representantes + Desempenho no Sidebar', () => {
    const sidebar = ler('src/modules/crm/components/Sidebar.tsx');
    for (const trecho of [
      'Central de Acessos',
      '/workspace/usuarios',
      'Representantes',
      '/workspace/representantes',
      '/workspace/representantes/desempenho',
      'ShieldCheck',
      'UserCog',
      'useCentralUnread',
      'representantes.view_performance',
      'users.view',
    ]) {
      expect(sidebar.includes(trecho), `MENU protegido removido do Sidebar: ${trecho}`).toBe(true);
    }
  });

  it('3b. PAGINAS de Representantes usam o hook usePermissoesRepresentantes', () => {
    const paginas = [
      'src/modules/crm/pages/RepresentantesPage.tsx',
      'src/modules/crm/pages/DesempenhoRepresentantesPage.tsx',
      'src/modules/crm/pages/RepresentanteDetalhePage.tsx',
    ];
    for (const rel of paginas) {
      const conteudo = ler(rel);
      expect(conteudo.includes('usePermissoesRepresentantes'), `hook removido de ${rel}`).toBe(true);
    }
  });

  it('4. Service RepresentantesGerenciaService expoe os 5 contratos RPC', () => {
    const svc = new RepresentantesGerenciaService();
    for (const metodo of [
      'listarRepresentantes',
      'obterDesempenho',
      'obterDesempenhoDetalhe',
      'editarRepresentante',
      'ativarRepresentante',
      'desativarRepresentante',
      'reassinarCliente',
    ]) {
      expect(typeof (svc as unknown as Record<string, unknown>)[metodo], `METODO removido do service: ${metodo}`).toBe('function');
    }
  });

  it('5. Hook usePermissoesRepresentantes esta exportado e e uma funcao', () => {
    expect(typeof usePermissoesRepresentantes).toBe('function');
  });

  it('6. OWNER ve Central de Acessos, Representantes e Desempenho no menu', () => {
    render(
      <MemoryRouter initialEntries={['/workspace/corporate']}>
        <CrmSidebar />
      </MemoryRouter>
    );
    expect(screen.getByText('Central de Acessos')).toBeInTheDocument();
    expect(screen.getByText('Representantes')).toBeInTheDocument();
    expect(screen.getByText('Desempenho')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('7. Representantes nao aparece fora do workspace (painel de representante)', () => {
    render(
      <MemoryRouter initialEntries={['/representantes/dashboard']}>
        <CrmSidebar />
      </MemoryRouter>
    );
    expect(screen.queryByText('Central de Acessos')).not.toBeInTheDocument();
    expect(screen.queryByText('Representantes')).not.toBeInTheDocument();
  });
});