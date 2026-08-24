import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

describe('Central de Cobranças — registro de rota e menu', () => {
  it('App.tsx registra grupo top-level /financeiro com cobrancas e detalhe', () => {
    const app = read('src/App.tsx');
    expect(app).toMatch(/path="\/financeiro"/);
    expect(app).toMatch(/path="cobrancas" element=\{<BillingDashboard \/>}/);
    expect(app).toMatch(/path="cobrancas\/:id" element=\{<BillingDetailPage \/>}/);
    expect(app).toMatch(/index element=\{<Navigate to="\/financeiro\/cobrancas" replace \/>}/);
  });

  it('rotas aninhadas existentes em /representantes e /workspace continuam registradas', () => {
    const app = read('src/App.tsx');
    const matches = app.match(/path="financeiro\/cobrancas" element=\{<BillingDashboard \/>}/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('menu do painel de mídias aponta para /financeiro/cobrancas protegido por ADMIN/OWNER', () => {
    const sidebar = read('src/components/dashboard/Sidebar.tsx');
    expect(sidebar).toContain("label: 'Central de Cobranças'");
    expect(sidebar).toMatch(/\(isAdmin \|\| isOwner\)/);
  });

  it('menu do painel CRM aponta para /financeiro/cobrancas protegido por OWNER/ADMIN', () => {
    const sidebar = read('src/modules/crm/components/Sidebar.tsx');
    expect(sidebar).toContain("/financeiro/cobrancas");
    expect(sidebar).toMatch(/isOwner \|\| isAdmin/);
  });

  it('páginas da Central aplicam guarda RBAC client-side', () => {
    expect(read('src/modules/crm/pages/BillingDashboard.tsx')).toMatch(/isOwner \|\| isAdmin/);
    expect(read('src/modules/crm/pages/BillingDetailPage.tsx')).toMatch(/isOwner \|\| isAdmin/);
  });
});
