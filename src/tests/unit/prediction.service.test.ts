import { describe, it, expect, beforeEach } from 'vitest';
import { PredictionService } from '@/modules/crm/services/prediction.service';

// ─── Mock do Supabase ────────────────────────────────────────────────────────
import { vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  },
}));

// ─── Testes Unitários: PredictionService ────────────────────────────────────
describe('PredictionService', () => {
  let service: PredictionService;

  beforeEach(() => {
    service = new PredictionService();
  });

  it('deve ser instanciado corretamente', () => {
    expect(service).toBeInstanceOf(PredictionService);
  });

  it('deve retornar um objeto com mrrProjetado30Dias', async () => {
    const result = await service.predictFinancialMetrics('empresa-uuid-01');
    expect(result).toHaveProperty('mrrProjetado30Dias');
  });

  it('deve retornar mrrProjetado30Dias com valor numérico positivo', async () => {
    const result = await service.predictFinancialMetrics('empresa-uuid-01');
    expect(result.mrrProjetado30Dias).toBeGreaterThan(0);
  });

  it('deve retornar arrProjetado12Meses com valor numérico positivo', async () => {
    const result = await service.predictFinancialMetrics('empresa-uuid-01');
    expect(result.arrProjetado12Meses).toBeGreaterThan(0);
  });

  it('deve retornar ebitdaProjetado com valor positivo', async () => {
    const result = await service.predictFinancialMetrics('empresa-uuid-01');
    expect(result.ebitdaProjetado).toBeGreaterThan(0);
  });

  it('deve retornar churnEsperadoPercent entre 0 e 100', async () => {
    const result = await service.predictFinancialMetrics('empresa-uuid-01');
    expect(result.churnEsperadoPercent).toBeGreaterThanOrEqual(0);
    expect(result.churnEsperadoPercent).toBeLessThanOrEqual(100);
  });

  it('deve retornar confiancaModelo entre 0 e 100', async () => {
    const result = await service.predictFinancialMetrics('empresa-uuid-01');
    expect(result.confiancaModelo).toBeGreaterThan(0);
    expect(result.confiancaModelo).toBeLessThanOrEqual(100);
  });

  it('deve retornar ARR aproximadamente 12x o MRR', async () => {
    const result = await service.predictFinancialMetrics('empresa-uuid-01');
    // ARR deve ser >= 11x MRR (com crescimento esperado)
    expect(result.arrProjetado12Meses).toBeGreaterThanOrEqual(result.mrrProjetado30Dias * 11);
  });

  it('deve funcionar com diferentes empresaOperadoraIds (isolamento multi-tenant)', async () => {
    const resultA = await service.predictFinancialMetrics('empresa-uuid-A');
    const resultB = await service.predictFinancialMetrics('empresa-uuid-B');
    // Ambos devem retornar estrutura válida — teste de isolamento de contrato
    expect(resultA).toHaveProperty('mrrProjetado30Dias');
    expect(resultB).toHaveProperty('mrrProjetado30Dias');
  });
});
