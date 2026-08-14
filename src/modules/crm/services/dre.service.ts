import { supabase } from '@/integrations/supabase/client';

export interface DREResult {
  receitaBruta: number;
  descontos: number;
  receitaLiquida: number;
  custosOperacionais: number;
  margemBruta: number;
  despesasAdministrativas: number;
  ebitda: number;
  resultadoLiquido: number;
}

export class DREService {
  /**
   * Consulta DRE Consolidado a partir da View do Data Warehouse (v_dre_consolidado)
   */
  async calculateDRE(empresaOperadoraId?: string, ano: number = 2026): Promise<DREResult> {
    // Zero Mock: Empty State padrão — nunca fabricar dados financeiros
    const emptyDRE: DREResult = {
      receitaBruta: 0,
      descontos: 0,
      receitaLiquida: 0,
      custosOperacionais: 0,
      margemBruta: 0,
      despesasAdministrativas: 0,
      ebitda: 0,
      resultadoLiquido: 0,
    };

    try {
      let query = supabase.from('v_dre_consolidado').select('*');
      if (empresaOperadoraId) query = query.eq('empresa_operadora_id', empresaOperadoraId);

      const { data, error } = await query.maybeSingle();

      if (error) {
        console.error('[DREService] Erro ao consultar v_dre_consolidado:', error.message);
        return emptyDRE; // Error State → zeros reais, não dados fabricados
      }

      if (!data) return emptyDRE; // Empty State → sem registros no banco

      // Campos reais do banco — sem fallback para valores fictícios
      const receitaBruta = Number(data.receita_bruta) || 0;
      const impostos = Number(data.impostos_estimados) || 0;
      const comissoes = Number(data.comissoes_vendas) || 0;
      const custosOperacionais = Number(data.custos_operacionais_rede) || 0;
      const ebitda = Number(data.ebitda) || 0;
      const resultadoLiquido = Number(data.resultado_liquido) || 0;

      return {
        receitaBruta,
        descontos: impostos + comissoes,
        receitaLiquida: receitaBruta - impostos - comissoes,
        custosOperacionais,
        margemBruta: receitaBruta - impostos - comissoes - custosOperacionais,
        despesasAdministrativas: 0,
        ebitda,
        resultadoLiquido,
      };
    } catch (err) {
      console.error('[DREService] Exceção ao calcular DRE:', err);
      return emptyDRE; // Nunca fabricar dados em catch
    }
  }
}

export const dreService = new DREService();
