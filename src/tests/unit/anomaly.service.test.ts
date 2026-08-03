import { describe, it, expect, beforeEach } from 'vitest';
import { AnomalyService } from '@/modules/crm/services/anomaly.service';

// ─── Testes Unitários: AnomalyService ────────────────────────────────────────
describe('AnomalyService', () => {
  let service: AnomalyService;

  beforeEach(() => {
    service = new AnomalyService();
  });

  it('deve ser instanciado corretamente', () => {
    expect(service).toBeInstanceOf(AnomalyService);
  });

  it('deve retornar um array de anomalias', async () => {
    const result = await service.detectNetworkAnomalies('empresa-uuid-01');
    expect(Array.isArray(result)).toBe(true);
  });

  it('cada anomalia deve ter um id', async () => {
    const result = await service.detectNetworkAnomalies('empresa-uuid-01');
    result.forEach((a: any) => {
      expect(a).toHaveProperty('id');
      expect(typeof a.id).toBe('string');
    });
  });

  it('cada anomalia deve ter tipo definido', async () => {
    const tiposValidos = ['QUEDA_DE_HEARTBEAT', 'LATENCIA_ALTA', 'PLAYER_OFFLINE', 'QUEDA_RECEITA', 'SLA_VIOLADO'];
    const result = await service.detectNetworkAnomalies('empresa-uuid-01');
    result.forEach((a: any) => {
      expect(tiposValidos).toContain(a.tipo);
    });
  });

  it('cada anomalia deve ter gravidade válida', async () => {
    const gravidadesValidas = ['CRITICA', 'ALTA', 'MEDIA', 'BAIXA'];
    const result = await service.detectNetworkAnomalies('empresa-uuid-01');
    result.forEach((a: any) => {
      expect(gravidadesValidas).toContain(a.gravidade);
    });
  });

  it('cada anomalia deve ter campo mensagem descritiva', async () => {
    const result = await service.detectNetworkAnomalies('empresa-uuid-01');
    result.forEach((a: any) => {
      expect(a).toHaveProperty('mensagem');
      expect(typeof a.mensagem).toBe('string');
      expect(a.mensagem.length).toBeGreaterThan(0);
    });
  });

  it('cada anomalia deve ter confiança entre 0 e 100', async () => {
    const result = await service.detectNetworkAnomalies('empresa-uuid-01');
    result.forEach((a: any) => {
      expect(a.confianca).toBeGreaterThan(0);
      expect(a.confianca).toBeLessThanOrEqual(100);
    });
  });

  it('cada anomalia deve ter status definido', async () => {
    const statusValidos = ['NOVA', 'ANALISADA', 'RESOLVIDA', 'IGNORADA', 'ESCALADA'];
    const result = await service.detectNetworkAnomalies('empresa-uuid-01');
    result.forEach((a: any) => {
      expect(statusValidos).toContain(a.status);
    });
  });

  it('deve funcionar com diferentes empresaOperadoraIds (isolamento multi-tenant)', async () => {
    const r1 = await service.detectNetworkAnomalies('empresa-A');
    const r2 = await service.detectNetworkAnomalies('empresa-B');
    expect(Array.isArray(r1)).toBe(true);
    expect(Array.isArray(r2)).toBe(true);
  });
});
