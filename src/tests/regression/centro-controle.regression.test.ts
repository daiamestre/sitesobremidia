/**
 * REGRESSÃO — Centro de Controle: garante que estrutura do REPRESENTANTE não foi destruída
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const SRC = resolve(__dirname, '../../');
function src(p: string){ return readFileSync(resolve(SRC,p),'utf-8'); }

describe('Regressão — Estrutura do Representante congelada', () => {
  it('App.tsx mantém rota /representantes com CrmLayout', () => {
    const s = src('App.tsx');
    expect(s).toContain("path=\"/representantes\"");
    expect(s).toContain('<CrmLayout');
  });
  it('CrmLayout mantém Sidebar fixa (não removida)', () => {
    const s = src('modules/crm/layout/CrmLayout.tsx');
    expect(s).toContain('CrmSidebar');
    expect(s).toContain('Outlet');
  });
  it('OccupancyDashboard mantém tabs Meus Pontos + Rede SOBRE MÍDIA', () => {
    const s = src('modules/crm/pages/OccupancyDashboard.tsx');
    expect(s).toContain('Meus Pontos');
    expect(s).toContain('Rede SOBRE MÍDIA');
    expect(s).toContain('TabsTrigger');
  });
  it('OccupancyDashboard mantém 12 cards de indicadores', () => {
    const s = src('modules/crm/pages/OccupancyDashboard.tsx');
    ['Total de Pontos','Meus Pontos','Pontos Ativos','Em Implantação','Pendentes Aprovação','Suspensos','Total de Telas','Telas Ativas','Telas Offline','Disponíveis','Ocupados','Novos no período'].forEach(label=>{
      expect(s).toContain(label);
    });
  });
  it('OccupancyDashboard mantém filtros: busca, cidade, categoria, disponibilidade, status + período', () => {
    const s = src('modules/crm/pages/OccupancyDashboard.tsx');
    expect(s).toContain('fCidade');
    expect(s).toContain('fCategoria');
    expect(s).toContain('fDisp');
    expect(s).toContain('fStatus');
    expect(s).toContain("periodo");
    expect(s).toContain("'hoje'");
  });
  it('RepresentantesDashboard permanece como placeholder Em Desenvolvimento (não quebrado)', () => {
    const s = src('pages/representantes/RepresentantesDashboard.tsx');
    expect(s).toContain('CRM Comercial - Em Desenvolvimento');
  });
  it('AuthContext mantém priorização perfilNome sobre is_owner (fix Representante→Owner)', () => {
    const s = src('contexts/AuthContext.tsx');
    // Governança §7: fonte oficial é perfil?.nome || is_owner fallback — NUNCA role?.name
    expect(s).toContain("perfil?.nome || (usuarioData?.is_owner");
    expect(s).toContain("perfil?.nome || (usuario?.is_owner");
    expect(s).not.toContain("role?.name");
  });
  it('CustomerPortalLayout de ANUNCIANTE NÃO foi alterado por esta missão', () => {
    const s = src('modules/crm/layout/CustomerPortalLayout.tsx');
    expect(s).toContain('Portal do Anunciante');
    expect(s).toContain('w-64 bg-slate-950');
  });
});
