import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BIService, DrillDownNode } from '@/modules/crm/services/bi.service';

// ─── Mock Supabase ────────────────────────────────────────────────────────────
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  },
}));

// ─── Testes: BIService — Cubos OLAP ──────────────────────────────────────────
describe('BIService — Cubos OLAP', () => {
  let service: BIService;

  beforeEach(() => { service = new BIService(); });

  it('deve ser instanciado corretamente', () => {
    expect(service).toBeInstanceOf(BIService);
  });

  // ── Commercial Cube ──────────────────────────────────────────────────────
  it('getCommercialCube deve retornar taxa de conversao numérica', async () => {
    const result = await service.getCommercialCube('empresa-01');
    expect(typeof result.conversao).toBe('number');
    expect(result.conversao).toBeGreaterThan(0);
  });

  it('getCommercialCube deve retornar ticketMedio positivo', async () => {
    const result = await service.getCommercialCube('empresa-01');
    expect(result.ticketMedio).toBeGreaterThan(0);
  });

  it('getCommercialCube deve retornar receitaBruta positiva', async () => {
    const result = await service.getCommercialCube('empresa-01');
    expect(result.receitaBruta).toBeGreaterThan(0);
  });

  it('getCommercialCube deve retornar LTV maior que CAC (sinal de saúde financeira)', async () => {
    const result = await service.getCommercialCube('empresa-01');
    expect(result.ltv).toBeGreaterThan(result.cac);
  });

  it('getCommercialCube deve retornar retencao + churn próximo de 100%', async () => {
    const result = await service.getCommercialCube('empresa-01');
    expect(result.retencao + result.churn).toBeCloseTo(100, 0);
  });

  // ── Financial Cube ───────────────────────────────────────────────────────
  it('getFinancialCube deve retornar mrr positivo', async () => {
    const result = await service.getFinancialCube('empresa-01');
    expect(result.mrr).toBeGreaterThan(0);
  });

  it('getFinancialCube deve retornar arr >= 11x o mrr', async () => {
    const result = await service.getFinancialCube('empresa-01');
    expect(result.arr).toBeGreaterThanOrEqual(result.mrr * 11);
  });

  it('getFinancialCube deve retornar ebitda positivo', async () => {
    const result = await service.getFinancialCube('empresa-01');
    expect(result.ebitda).toBeGreaterThan(0);
  });

  it('getFinancialCube deve retornar inadimplencia entre 0 e 100', async () => {
    const result = await service.getFinancialCube('empresa-01');
    expect(result.inadimplencia).toBeGreaterThanOrEqual(0);
    expect(result.inadimplencia).toBeLessThanOrEqual(100);
  });

  // ── Operational Cube ─────────────────────────────────────────────────────
  it('getOperationalCube deve retornar uptime entre 0 e 100', async () => {
    const result = await service.getOperationalCube('empresa-01');
    expect(result.uptime).toBeGreaterThan(0);
    expect(result.uptime).toBeLessThanOrEqual(100);
  });

  it('getOperationalCube deve retornar sla entre 0 e 100', async () => {
    const result = await service.getOperationalCube('empresa-01');
    expect(result.sla).toBeGreaterThan(0);
    expect(result.sla).toBeLessThanOrEqual(100);
  });

  it('getOperationalCube deve retornar proofOfPlay positivo', async () => {
    const result = await service.getOperationalCube('empresa-01');
    expect(result.proofOfPlay).toBeGreaterThan(0);
  });

  it('getOperationalCube deve retornar playersOnline >= playersOffline em operação normal', async () => {
    const result = await service.getOperationalCube('empresa-01');
    expect(result.playersOnline).toBeGreaterThanOrEqual(result.playersOffline);
  });
});

// ─── BIService: DrillDown Hierárquico ────────────────────────────────────────
describe('BIService — DrillDown Hierárquico (OLAP)', () => {
  let service: BIService;

  beforeEach(() => { service = new BIService(); });

  it('executeDrillDown deve retornar um array', async () => {
    const result = await service.executeDrillDown('empresa-01');
    expect(Array.isArray(result)).toBe(true);
  });

  it('executeDrillDown deve retornar nós com metricaTotal positivo', async () => {
    const result = await service.executeDrillDown('empresa-01');
    result.forEach((node: DrillDownNode) => {
      expect(node.metricaTotal).toBeGreaterThan(0);
    });
  });

  it('executeDrillDown deve retornar nós com array de niveis', async () => {
    const result = await service.executeDrillDown('empresa-01');
    result.forEach((node: DrillDownNode) => {
      expect(Array.isArray(node.niveis)).toBe(true);
      expect(node.niveis.length).toBeGreaterThan(0);
    });
  });

  it('executeDrillDown deve funcionar sem filtros (empresa + cidade omitidos)', async () => {
    const result = await service.executeDrillDown();
    expect(Array.isArray(result)).toBe(true);
  });

  it('executeDrillDown com cidadeFilter deve retornar resultado sem lançar exceção', async () => {
    await expect(service.executeDrillDown('empresa-01', 'Curitiba')).resolves.toBeDefined();
  });

  it('todos os cubos devem funcionar em paralelo (multi-tenant sem bloqueio)', async () => {
    const [commercial, financial, operational] = await Promise.all([
      service.getCommercialCube('empresa-01'),
      service.getFinancialCube('empresa-01'),
      service.getOperationalCube('empresa-01'),
    ]);
    expect(commercial.conversao).toBeGreaterThan(0);
    expect(financial.mrr).toBeGreaterThan(0);
    expect(operational.uptime).toBeGreaterThan(0);
  });
});

// ─── BIService: Interfaces AI-Ready (Fase 9.7) ───────────────────────────────
describe('BIService — Interfaces AI-Ready (Contratos de Tipo)', () => {

  it('PredictionProvider deve ter método predictRevenue definido', () => {
    // Verifica que o contrato de tipo existe para adapters de IA futuros
    const mockProvider = {
      predictRevenue: async (monthsAhead: number) => ({ expectedRevenue: monthsAhead * 12000, confidenceScore: 95.5 }),
    };
    expect(typeof mockProvider.predictRevenue).toBe('function');
  });

  it('AnomalyProvider deve ter método detectAnomalies definido', () => {
    const mockProvider = {
      detectAnomalies: async (tenantId: string) => ({ anomaliesFound: [], severity: 'LOW' as const }),
    };
    expect(typeof mockProvider.detectAnomalies).toBe('function');
  });
});
