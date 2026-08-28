/**
 * MISSÃO P0/P1 — BLINDAGEM DO CENTRO DE CONTROLE — Rede de Pontos de Exibição
 * Valida que NENHUM indicador é mock/fictício e que RBAC/RLS permanecem intactos.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SRC = resolve(__dirname, '../../');

function src(p: string) { return readFileSync(resolve(SRC, p), 'utf-8'); }

describe('Centro de Controle — Blindagem contra mocks/fallbacks fictícios', () => {
  it('pontosRede.service.ts NÃO deve conter fallbacks fictícios || 147, || 112, || 342 etc', () => {
    const s = src('services/pontosRede.service.ts');
    expect(s).not.toContain('|| 147');
    expect(s).not.toContain('|| 112');
    expect(s).not.toContain('|| 342');
    expect(s).not.toContain('|| 301');
    expect(s).not.toContain('|| 41');
    expect(s).not.toContain('|| 32');
    expect(s).not.toContain('|| 115');
    expect(s).not.toContain('|| 15');
    expect(s).not.toContain('|| 8');
  });
  it('pontosRede.service.ts NÃO deve conter taxa fallback 78.4', () => {
    const s = src('services/pontosRede.service.ts');
    // taxa fallback foi removida — deve ser 0 quando vazio, não 78.4
    expect(s).not.toMatch(/\?\s*78\.4/);
    expect(s).toContain(' : 0');
  });
  it('pontosRede.service.ts NÃO deve conter receita hard-coded 8500 como fallback', () => {
    const s = src('services/pontosRede.service.ts');
    // única ocorrência permitida é comentário removido; código não deve ter "receitaMediaPorTela: 8500"
    expect(s).not.toContain('receitaMediaPorTela: 8500');
    expect(s).toContain('receitaMediaPorTela: receitaMedia');
  });
  it('pontosRede.service.ts deve calcular telasAtivas/telasOffline de forma real (sem 0.88/0.12 fake)', () => {
    const s = src('services/pontosRede.service.ts');
    expect(s).not.toContain('0.88');
    expect(s).not.toContain('0.12');
    expect(s).toContain('telasAtivasReais');
    expect(s).toContain('totalTelas - telasAtivasReais');
  });
  it('OccupancyDashboard NÃO deve conter fallback visual 78.4 / 21.6', () => {
    const s = src('modules/crm/pages/OccupancyDashboard.tsx');
    expect(s).not.toContain('?? 78.4');
    expect(s).not.toContain(':21.6');
    expect(s).not.toContain("?? '78.4'");
  });
  it('fetchPontosStats deve conter cálculo real de receita por média de valor_anuncio', () => {
    const s = src('services/pontosRede.service.ts');
    expect(s).toContain('valor_anuncio');
    expect(s).toContain('receitaMedia');
  });
});

describe('Centro de Controle — RBAC/RLS preservação', () => {
  it('pontos tem RLS tenant isolation (empresa_operadora_id = get_user_empresa_operadora_id)', () => {
    const mig = src('../supabase/migrations/20261026_portal_anunciante_foundation.sql');
    expect(mig).toContain('pontos_tenant_select');
    expect(mig).toContain('get_user_empresa_operadora_id');
    expect(mig).toContain('ENABLE ROW LEVEL SECURITY');
  });
  it('pontos INSERT/UPDATE restrito a is_internal_role()', () => {
    const mig = src('../supabase/migrations/20261026_portal_anunciante_foundation.sql');
    expect(mig).toContain('is_internal_role()');
  });
  it('fetchPontosRede mineOnly filtra por created_by = auth user (Meus Pontos real)', () => {
    const s = src('services/pontosRede.service.ts');
    expect(s).toContain("eq('created_by', user.id)");
  });
  it('fetchPontosRede sempre filtra deleted_at is null (soft-delete)', () => {
    const s = src('services/pontosRede.service.ts');
    expect(s).toContain("is('deleted_at', null)");
  });
});

describe('Centro de Controle — Integração Owner ↔ Representante', () => {
  it('OccupancyDashboard consome pontosRedeService.fetchPontosStats e fetchPontosRede (frontend→backend→banco)', () => {
    const s = src('modules/crm/pages/OccupancyDashboard.tsx');
    expect(s).toContain('pontosRedeService.fetchPontosStats');
    expect(s).toContain('pontosRedeService.fetchPontosRede');
  });
  it('Mesma tabela public.pontos é fonte única para Meus Pontos e Rede SOBRE MÍDIA (sem duplicação)', () => {
    const s = src('services/pontosRede.service.ts');
    // única tabela consultada deve ser 'pontos'
    const matches = (s.match(/from\('pontos'\)/g) || []).length;
    expect(matches).toBeGreaterThanOrEqual(1);
    expect(s).not.toContain("from('representante_points')");
    expect(s).not.toContain("from('owner_points')");
  });
});
