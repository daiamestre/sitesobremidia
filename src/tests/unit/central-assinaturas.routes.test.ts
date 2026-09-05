import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('MICRO-GATE 05.2: Auditoria e Validação da Central de Assinatura Digital', () => {
  const appFile = fs.readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8');
  const sidebarFile = fs.readFileSync(path.join(process.cwd(), 'src', 'modules', 'crm', 'components', 'Sidebar.tsx'), 'utf8');
  const signatureDashboardFile = fs.readFileSync(path.join(process.cwd(), 'src', 'modules', 'crm', 'pages', 'SignatureDashboard.tsx'), 'utf8');
  const contractsSignaturePageFile = fs.readFileSync(path.join(process.cwd(), 'src', 'modules', 'crm', 'pages', 'ContractsSignaturePage.tsx'), 'utf8');

  it('1. App.tsx registra ContractsSignaturePage sob /workspace e sob /representantes', () => {
    // Check lazy import
    expect(appFile).toContain('const ContractsSignaturePage = lazyWithRetry(() => import("./modules/crm/pages/ContractsSignaturePage"));');

    // Check workspace section
    const workspaceSection = appFile.match(/<Route path="\/workspace"[\s\S]*?<\/Route>/);
    expect(workspaceSection).toBeTruthy();
    expect(workspaceSection![0]).toMatch(/<Route path="assinaturas" element={<ContractsSignaturePage \/>}/);

    // Check representantes section
    const repSection = appFile.match(/<Route path="\/representantes"[\s\S]*?<\/Route>/);
    expect(repSection).toBeTruthy();
    expect(repSection![0]).toMatch(/<Route path="assinaturas" element={<ContractsSignaturePage \/>}/);
  });

  it('2. CrmSidebar expõe o menu Assinaturas com rota dinâmica ${basePath}/assinaturas', () => {
    expect(sidebarFile).toContain("label: 'Assinaturas'");
    expect(sidebarFile).toContain("path: `${basePath}/assinaturas`");
    expect(sidebarFile).toContain('PenLine');
  });

  it('3. SignatureDashboard usa basePath contextual dinâmico para retorno', () => {
    expect(signatureDashboardFile).toContain("location.pathname.startsWith('/workspace') ? '/workspace' : '/representantes'");
    expect(signatureDashboardFile).toContain("navigate(`${basePath}/contratos`)");
  });

  it('4. ContractsSignaturePage delega diretamente para SignatureDashboard', () => {
    expect(contractsSignaturePageFile).toContain('import SignatureDashboard from \'./SignatureDashboard\';');
    expect(contractsSignaturePageFile).toContain('return <SignatureDashboard />;');
  });
});
