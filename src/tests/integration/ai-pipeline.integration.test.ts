import { describe, it, expect, vi } from 'vitest';

// ─── Mock do Supabase ────────────────────────────────────────────────────────
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

// ─── Testes de Integração: Fluxo AI Pipeline (DW → BI → AI) ────────────────
describe('Integração: AI Pipeline (Data Warehouse → BI → AI Engine)', () => {

  it('PredictionService deve retornar dados estruturados para o AIService consumir', async () => {
    const { PredictionService } = await import('@/modules/crm/services/prediction.service');
    const predictionService = new PredictionService();
    const metrics = await predictionService.predictFinancialMetrics('empresa-01');

    // Simula como o AIService consome os dados do PredictionService
    expect(metrics).toHaveProperty('mrrProjetado30Dias');
    expect(metrics).toHaveProperty('arrProjetado12Meses');
    expect(metrics).toHaveProperty('confiancaModelo');
    expect(metrics.mrrProjetado30Dias).toBeGreaterThan(0);
  });

  it('AnomalyService deve retornar anomalias que RecommendationService pode priorizar', async () => {
    const { AnomalyService } = await import('@/modules/crm/services/anomaly.service');
    const { RecommendationService } = await import('@/modules/crm/services/recommendation.service');

    const anomalyService = new AnomalyService();
    const recommendationService = new RecommendationService();

    const anomalies = await anomalyService.detectNetworkAnomalies('empresa-01');
    const recommendations = await recommendationService.getSmartRecommendations('empresa-01');

    // Ambos devem retornar arrays estruturados
    expect(Array.isArray(anomalies)).toBe(true);
    expect(Array.isArray(recommendations)).toBe(true);

    // Verificar que anomalias têm gravidade e recomendações têm prioridade
    anomalies.forEach((a: any) => expect(a).toHaveProperty('gravidade'));
    recommendations.forEach((r: any) => expect(r).toHaveProperty('prioridade'));
  });

  it('CopilotService deve agregar resposta do AIService com dados do DW', async () => {
    const { CopilotService } = await import('@/modules/crm/services/copilot.service');

    // Mock do AIService para este teste
    vi.doMock('@/modules/crm/services/ai.service', () => ({
      aiService: {
        askExecutiveCopilot: vi.fn().mockResolvedValue({
          answer: 'MRR: R$ 165.000/mês baseado no dw_receita',
          confidenceScore: 98.5,
          sources: ['dw_receita', 'dw_operacao', 'mv_receita_mensal'],
          executionTimeMs: 38,
        }),
      },
    }));

    const copilot = new CopilotService();
    const response = await copilot.askQuestion('MRR atual?', 'empresa-01');

    // A resposta deve referenciar fontes do Data Warehouse
    expect(response).toHaveProperty('answer');
    expect(response).toHaveProperty('sources');
    expect(response).toHaveProperty('confidenceScore');
  });

  it('Pipeline completo: Predição → Anomalia → Recomendação retornam dados coerentes', async () => {
    const { PredictionService } = await import('@/modules/crm/services/prediction.service');
    const { AnomalyService } = await import('@/modules/crm/services/anomaly.service');
    const { RecommendationService } = await import('@/modules/crm/services/recommendation.service');

    const TENANT_ID = 'empresa-pipeline-test';

    const [metrics, anomalies, recommendations] = await Promise.all([
      new PredictionService().predictFinancialMetrics(TENANT_ID),
      new AnomalyService().detectNetworkAnomalies(TENANT_ID),
      new RecommendationService().getSmartRecommendations(TENANT_ID),
    ]);

    // Todos devem retornar estruturas válidas
    expect(metrics.mrrProjetado30Dias).toBeGreaterThan(0);
    expect(Array.isArray(anomalies)).toBe(true);
    expect(Array.isArray(recommendations)).toBe(true);

    // Verificar que as recomendações têm impacto definido
    expect(recommendations.some((r: any) => r.impacto === 'AUMENTO_RECEITA')).toBe(true);
  });
});

// ─── Testes de Contrato Multi-Tenant ─────────────────────────────────────────
describe('Contrato: Isolamento Multi-Tenant (empresa_operadora_id)', () => {

  it('PredictionService deve aceitar qualquer empresa_operadora_id válido', async () => {
    const { PredictionService } = await import('@/modules/crm/services/prediction.service');
    const service = new PredictionService();

    const tenants = ['empresa-a', 'empresa-b', 'empresa-c', '00000000-0000-0000-0000-000000000001'];
    for (const tenant of tenants) {
      const result = await service.predictFinancialMetrics(tenant);
      expect(result).toHaveProperty('mrrProjetado30Dias');
    }
  });

  it('RecommendationService deve aceitar qualquer empresa_operadora_id válido', async () => {
    const { RecommendationService } = await import('@/modules/crm/services/recommendation.service');
    const service = new RecommendationService();

    const tenants = ['empresa-x', 'empresa-y'];
    for (const tenant of tenants) {
      const result = await service.getSmartRecommendations(tenant);
      expect(Array.isArray(result)).toBe(true);
    }
  });

  it('AnomalyService deve aceitar qualquer empresa_operadora_id válido', async () => {
    const { AnomalyService } = await import('@/modules/crm/services/anomaly.service');
    const service = new AnomalyService();

    const tenants = ['tenant-01', 'tenant-02', 'tenant-03'];
    for (const tenant of tenants) {
      const result = await service.detectNetworkAnomalies(tenant);
      expect(Array.isArray(result)).toBe(true);
    }
  });
});
