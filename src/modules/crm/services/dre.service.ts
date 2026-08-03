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
   * Calcula a Demonstração do Resultado do Exercício (DRE) para a empresa operadora
   */
  async calculateDRE(empresaOperadoraId?: string, ano: number = 2026): Promise<DREResult> {
    try {
      let queryContas = supabase.from('contas_receber').select('valor_original, desconto, valor_recebido');
      if (empresaOperadoraId) queryContas = queryContas.eq('empresa_operadora_id', empresaOperadoraId);

      const { data: contas } = await queryContas;
      const receitaBruta = (contas || []).reduce((a, c) => a + Number(c.valor_original), 0);
      const descontos = (contas || []).reduce((a, c) => a + Number(c.desconto), 0);
      const receitaLiquida = receitaBruta - descontos;

      const custosOperacionais = receitaLiquida * 0.35; // 35% Custo Operacional NOC & Player
      const margemBruta = receitaLiquida - custosOperacionais;
      const despesasAdministrativas = receitaLiquida * 0.15; // 15% Despesas Adms
      const ebitda = margemBruta - despesasAdministrativas;
      const resultadoLiquido = ebitda * 0.85; // Após Impostos (15%)

      return {
        receitaBruta,
        descontos,
        receitaLiquida,
        custosOperacionais,
        margemBruta,
        despesasAdministrativas,
        ebitda,
        resultadoLiquido,
      };
    } catch (err) {
      return {
        receitaBruta: 0,
        descontos: 0,
        receitaLiquida: 0,
        custosOperacionais: 0,
        margemBruta: 0,
        despesasAdministrativas: 0,
        ebitda: 0,
        resultadoLiquido: 0,
      };
    }
  }
}

export const dreService = new DREService();
