import { describe, it, expect, beforeEach } from 'vitest';
import { RecommendationService } from '@/modules/crm/services/recommendation.service';

// ─── Testes Unitários: RecommendationService ─────────────────────────────────
describe('RecommendationService', () => {
  let service: RecommendationService;

  beforeEach(() => {
    service = new RecommendationService();
  });

  it('deve ser instanciado corretamente', () => {
    expect(service).toBeInstanceOf(RecommendationService);
  });

  it('deve retornar um array de recomendações', async () => {
    const result = await service.getSmartRecommendations('empresa-uuid-01');
    expect(Array.isArray(result)).toBe(true);
  });

  it('deve retornar pelo menos uma recomendação', async () => {
    const result = await service.getSmartRecommendations('empresa-uuid-01');
    expect(result.length).toBeGreaterThan(0);
  });

  it('cada recomendação deve ter um id único', async () => {
    const result = await service.getSmartRecommendations('empresa-uuid-01');
    const ids = result.map((r: any) => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('cada recomendação deve ter campo titulo', async () => {
    const result = await service.getSmartRecommendations('empresa-uuid-01');
    result.forEach((r: any) => {
      expect(r).toHaveProperty('titulo');
      expect(typeof r.titulo).toBe('string');
      expect(r.titulo.length).toBeGreaterThan(0);
    });
  });

  it('cada recomendação deve ter campo recomendacao (descrição)', async () => {
    const result = await service.getSmartRecommendations('empresa-uuid-01');
    result.forEach((r: any) => {
      expect(r).toHaveProperty('recomendacao');
      expect(typeof r.recomendacao).toBe('string');
    });
  });

  it('cada recomendação deve ter prioridade válida', async () => {
    const prioridadesValidas = ['ALTA', 'MEDIA', 'BAIXA'];
    const result = await service.getSmartRecommendations('empresa-uuid-01');
    result.forEach((r: any) => {
      expect(prioridadesValidas).toContain(r.prioridade);
    });
  });

  it('cada recomendação deve ter impacto definido', async () => {
    const impactosValidos = ['AUMENTO_RECEITA', 'REDUCAO_CUSTO', 'RETENCAO', 'EXPANSAO', 'OTIMIZACAO'];
    const result = await service.getSmartRecommendations('empresa-uuid-01');
    result.forEach((r: any) => {
      expect(impactosValidos).toContain(r.impacto);
    });
  });

  it('deve conter pelo menos uma recomendação de alta prioridade', async () => {
    const result = await service.getSmartRecommendations('empresa-uuid-01');
    const hasAlta = result.some((r: any) => r.prioridade === 'ALTA');
    expect(hasAlta).toBe(true);
  });

  it('deve funcionar com diferentes empresaOperadoraIds (contrato multi-tenant)', async () => {
    const resultA = await service.getSmartRecommendations('empresa-A');
    const resultB = await service.getSmartRecommendations('empresa-B');
    expect(Array.isArray(resultA)).toBe(true);
    expect(Array.isArray(resultB)).toBe(true);
  });
});
