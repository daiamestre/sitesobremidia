import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();

function read(p: string) {
  return fs.readFileSync(path.join(ROOT, p), 'utf8');
}

describe('GATE 6.7 — Client Type Gate unificado', () => {
  it('ClientTypeGate existe e declara 3 tipos explícitos', () => {
    const src = read('src/modules/crm/components/ClientTypeGate.tsx');
    expect(src).toContain('ANUNCIANTE');
    expect(src).toContain('PONTO_PARCEIRO');
    expect(src).toContain('GESTOR_MIDIAS');
    expect(src).toContain('Cadastrar anunciante');
    expect(src).toContain('Cadastrar ponto parceiro');
    expect(src).toContain('Cadastrar gestor');
    // Não há inferência por heurística
    expect(src).not.toContain('heuristic');
  });

  it('Gate não concede autorização — comentário e sem RBAC bypass', () => {
    const src = read('src/modules/crm/components/ClientTypeGate.tsx');
    expect(src).toContain('Não concede autorização');
    // não cria permissão nova
    expect(src).not.toContain('grant');
  });

  it('Gate tem proteção contra duplo clique', () => {
    const src = read('src/modules/crm/components/ClientTypeGate.tsx');
    expect(src).toContain('pending');
    expect(src).toMatch(/if\s*\(pending\)\s*return/);
    expect(src).toContain('disabled');
  });

  it('Gate persiste intenção explícita no state de navegação', () => {
    const src = read('src/modules/crm/components/ClientTypeGate.tsx');
    expect(src).toContain('clientType');
    expect(src).toContain('navigate(dest');
  });

  it('App.tsx: /clientes/novo renderiza Gate para ambos os namespaces', () => {
    const app = read('src/App.tsx');
    // representante
    expect(app).toContain("path=\"clientes/novo\" element={<NovoClientePage />}");
    // workspace também deve ter gate
    // contar ocorrências — deve ter pelo menos 2 (representantes e workspace)
    const count = (app.match(/clientes\/novo\" element=\{<NovoClientePage/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('App.tsx: wizard de anunciante está em /clientes/novo/anunciante', () => {
    const app = read('src/App.tsx');
    expect(app).toContain('clientes/novo/anunciante');
    expect(app).toContain('NovoClienteWizardPage');
  });

  it('App.tsx: workspace possui prospeccao/ponto-parceiro e prospeccao/gestor', () => {
    const app = read('src/App.tsx');
    // workspace section after second "clientes/novo/anunciante"
    // garantir que PontoParceiroWizardPage e GestorMidiiasProspeccaoPage aparecem para workspace
    const workspaceIdx = app.indexOf('UNIFIED CORPORATE WORKSPACE ROUTES');
    const wsSlice = app.slice(workspaceIdx);
    expect(wsSlice).toContain('prospeccao/ponto-parceiro');
    expect(wsSlice).toContain('prospeccao/gestor');
    expect(wsSlice).toContain('PontoParceiroWizardPage');
    expect(wsSlice).toContain('GestorMidiiasProspeccaoPage');
  });

  it('NovoClientePage é Gate (não wizard)', () => {
    const src = read('src/modules/crm/pages/NovoClientePage.tsx');
    expect(src).toContain('ClientTypeGate');
    expect(src).not.toContain('IntelligentCommercialWizard');
  });

  it('NovaProspeccaoPage preservada como alias do Gate', () => {
    const src = read('src/modules/crm/pages/NovaProspeccaoPage.tsx');
    expect(src).toContain('ClientTypeGate');
  });

  it('Sidebar: Nova Prospecção unificada usa basePath/clientes/novo (não hardcode representante)', () => {
    const src = read('src/modules/crm/components/Sidebar.tsx');
    expect(src).toContain('Nova Prospecção');
    expect(src).toContain('basePath');
    expect(src).toContain('/clientes/novo');
    // não deve ter hardcode isolado apenas para representante
    expect(src).not.toContain("path: '/representantes/prospeccao'");
  });

  it('Header: + Novo Cliente navega para basePath/clientes/novo (Gate)', () => {
    const src = read('src/modules/crm/components/Header.tsx');
    expect(src).toContain('clientes/novo');
    expect(src).toContain('basePath');
  });

  it('ClientesListPage e CrmDashboardHome e EmptyDashboard usam basePath', () => {
    const cl = read('src/modules/crm/pages/ClientesListPage.tsx');
    const dash = read('src/modules/crm/pages/CrmDashboardHome.tsx');
    const empty = read('src/modules/crm/components/EmptyDashboard.tsx');
    for (const s of [cl, dash, empty]) {
      expect(s).toContain('basePath');
      expect(s).toContain('clientes/novo');
    }
  });

  it('Wizard não foi duplicado', () => {
    const app = read('src/App.tsx');
    const wizardImports = (app.match(/IntelligentCommercialWizard/g) || []).length;
    // deve existir apenas no NovoClienteWizardPage import, não duplicado no App
    expect(app).not.toContain('IntelligentCommercialWizard');
    // verificar que NovoClienteWizardPage reutiliza o mesmo componente
    const wz = read('src/modules/crm/pages/NovoClienteWizardPage.tsx');
    expect(wz).toContain('IntelligentCommercialWizard');
  });
});
