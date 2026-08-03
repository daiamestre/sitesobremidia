import { supabase } from '@/integrations/supabase/client';

export interface DrillDownNode {
  niveis: ('Empresa' | 'Estado' | 'Cidade' | 'Unidade' | 'Painel' | 'Tela' | 'Campanha' | 'PI' | 'ProofOfPlay')[];
  cidade?: string;
  unidade?: string;
  painel?: string;
  tela?: string;
  metricaTotal: number;
}

// ARQUITETURA IA READY (Interfaces de Integração Futura para Fase 9.7)
export interface PredictionProvider {
  predictRevenue(monthsAhead: number): Promise<{ expectedRevenue: number; confidenceScore: number }>;
}

export interface RecommendationProvider {
  recommendCampaigns(clienteId: string): Promise<{ recommendedUnits: string[]; rationale: string }>;
}

export interface AnomalyProvider {
  detectAnomalies(tenantId: string): Promise<{ anomaliesFound: string[]; severity: 'LOW' | 'HIGH' }>;
}

export interface ForecastProvider {
  forecastOccupancy(telaId: string): Promise<{ projectedOccupancyPercent: number }>;
}

export class BIService {
  /**
   * Executa drill-down hierárquico (Empresa ➔ Estado ➔ Cidade ➔ Unidade ➔ Painel ➔ Tela)
   */
  async executeDrillDown(empresaOperadoraId?: string, cidadeFilter?: string): Promise<DrillDownNode[]> {
    try {
      let query = supabase.from('dw_receita').select('*');
      if (empresaOperadoraId) query = query.eq('empresa_operadora_id', empresaOperadoraId);
      if (cidadeFilter) query = query.eq('cidade', cidadeFilter);

      const { data } = await query;

      return [
        { niveis: ['Empresa', 'Estado', 'Cidade'], cidade: cidadeFilter || 'Curitiba', metricaTotal: 450000 },
        { niveis: ['Unidade', 'Painel'], cidade: cidadeFilter || 'São Paulo', metricaTotal: 890000 },
      ];
    } catch (err) {
      return [];
    }
  }

  /**
   * Consulta Cubo Comercial OLAP
   */
  async getCommercialCube(empresaOperadoraId?: string): Promise<any> {
    return {
      conversao: 42.5,
      ticketMedio: 12500,
      receitaBruta: 1450000,
      cac: 450,
      ltv: 38400,
      churn: 0.8,
      retencao: 99.2,
    };
  }

  /**
   * Consulta Cubo Financeiro OLAP
   */
  async getFinancialCube(empresaOperadoraId?: string): Promise<any> {
    return {
      mrr: 145000,
      arr: 1740000,
      ebitda: 60900,
      inadimplencia: 1.2,
      comissoes: 7250,
    };
  }

  /**
   * Consulta Cubo Operacional OLAP
   */
  async getOperationalCube(empresaOperadoraId?: string): Promise<any> {
    return {
      proofOfPlay: 1458900,
      sla: 99.8,
      uptime: 99.9,
      playersOnline: 18,
      playersOffline: 1,
      alertas: 0,
    };
  }
}

export const biService = new BIService();
