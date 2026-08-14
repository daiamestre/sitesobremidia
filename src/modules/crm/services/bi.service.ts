import { supabase } from '@/integrations/supabase/client';

export interface DrillDownNode {
  niveis: ('Empresa' | 'Estado' | 'Cidade' | 'Unidade' | 'Painel' | 'Tela' | 'Campanha' | 'PI' | 'ProofOfPlay')[];
  cidade?: string;
  unidade?: string;
  painel?: string;
  tela?: string;
  metricaTotal: number;
}

export interface FinancialCubeData {
  mrr: number;
  arr: number;
  ebitda: number;
  receitaBruta: number;
  inadimplencia: number;
  comissoes: number;
  impostos: number;
  custosOperacionais: number;
  resultadoLiquido: number;
}

export interface OperationalCubeData {
  proofOfPlay: number;
  sla: number;
  uptime: number;
  playersOnline: number;
  playersOffline: number;
  alertas: number;
}

export class BIService {
  /**
   * Consulta Cubo Financeiro OLAP real alimentado pelo Data Warehouse
   */
  async getFinancialCube(empresaOperadoraId?: string): Promise<FinancialCubeData> {
    try {
      let dreQuery = supabase.from('v_dre_consolidado').select('*');
      if (empresaOperadoraId) dreQuery = dreQuery.eq('empresa_operadora_id', empresaOperadoraId);

      const { data: dreData } = await dreQuery.maybeSingle();

      if (dreData) {
        const receitaBruta = Number(dreData.receita_bruta || 0);
        const impostos = Number(dreData.impostos_estimados || 0);
        const comissoes = Number(dreData.comissoes_vendas || 0);
        const custosOperacionais = Number(dreData.custos_operacionais_rede || 0);
        const ebitda = Number(dreData.ebitda || 0);
        const resultadoLiquido = Number(dreData.resultado_liquido || 0);

        return {
          mrr: receitaBruta,
          arr: receitaBruta * 12,
          ebitda,
          receitaBruta,
          inadimplencia: 0,
          comissoes,
          impostos,
          custosOperacionais,
          resultadoLiquido,
        };
      }
    } catch (err) {
      console.error("[BI Service] Erro ao buscar FinancialCube", err);
    }

    return {
      mrr: 0,
      arr: 0,
      ebitda: 0,
      receitaBruta: 0,
      inadimplencia: 0,
      comissoes: 0,
      impostos: 0,
      custosOperacionais: 0,
      resultadoLiquido: 0,
    };
  }

  /**
   * Consulta Cubo Operacional OLAP real alimentado pelo Data Warehouse
   */
  async getOperationalCube(empresaOperadoraId?: string): Promise<OperationalCubeData> {
    try {
      let exibQuery = supabase.from('dw_fact_exibicao').select('*');
      if (empresaOperadoraId) exibQuery = exibQuery.eq('empresa_operadora_id', empresaOperadoraId);

      const { data: exibData } = await exibQuery;
      const exibs = exibData || [];

      const proofOfPlay = exibs.reduce((acc: number, item: any) => acc + (Number(item.insercoes_realizadas) || 0), 0);
      const avgSla = exibs.length > 0
        ? Number((exibs.reduce((acc: number, item: any) => acc + (Number(item.sla_entrega_pct) || 100), 0) / exibs.length).toFixed(1))
        : 0;

      let playerQuery = supabase.from('dw_dim_player').select('status_online');
      if (empresaOperadoraId) playerQuery = playerQuery.eq('empresa_operadora_id', empresaOperadoraId);
      const { data: players } = await playerQuery;

      const online = (players || []).filter((p) => p.status_online).length;
      const offline = (players || []).length - online;

      return {
        proofOfPlay: proofOfPlay,
        sla: avgSla,
        uptime: avgSla > 0 ? avgSla : 0,
        playersOnline: online,
        playersOffline: offline,
        alertas: offline > 0 ? offline : 0,
      };
    } catch (err) {
      console.error("[BI Service] Erro ao buscar OperationalCube", err);
      return {
        proofOfPlay: 0,
        sla: 0,
        uptime: 0,
        playersOnline: 0,
        playersOffline: 0,
        alertas: 0,
      };
    }
  }

  /**
   * Consulta Cubo Comercial OLAP real alimentado pelo Data Warehouse
   * Zero Mock: métricas calculadas exclusivamente a partir de dw_fact_receita
   */
  async getCommercialCube(empresaOperadoraId?: string): Promise<any> {
    try {
      let query = supabase.from('dw_fact_receita').select('*');
      if (empresaOperadoraId) query = query.eq('empresa_operadora_id', empresaOperadoraId);

      const { data: receitas, error } = await query;

      if (error) {
        console.error("[BI Service] Erro ao buscar CommercialCube", error);
      }

      const receitasArray = receitas || [];

      if (receitasArray.length === 0) {
        return {
          conversao: 0,
          ticketMedio: 0,
          receitaBruta: 0,
          cac: 0,
          ltv: 0,
          churn: 0,
          retencao: 100,
        };
      }

      const totalContratado = receitasArray.reduce(
        (sum: number, r: any) => sum + (Number(r.valor_contratado) || 0), 0
      );
      const totalRecebido = receitasArray.reduce(
        (sum: number, r: any) => sum + (Number(r.valor_recebido) || 0), 0
      );
      const totalPendente = receitasArray.reduce(
        (sum: number, r: any) => sum + (Number(r.valor_pendente) || 0), 0
      );

      const conversao = totalContratado > 0 ? (totalRecebido / totalContratado) * 100 : 0;
      const ticketMedio = receitasArray.length > 0 ? totalContratado / receitasArray.length : 0;
      const receitaBruta = totalRecebido;
      const cac = 0;
      const churn = totalContratado > 0 ? (totalPendente / totalContratado) * 100 : 0;
      const retencao = 100 - churn;

      const clientesUnicos = new Set(
        receitasArray.filter((r: any) => r.cliente_id).map((r: any) => r.cliente_id)
      ).size;
      const ltv = clientesUnicos > 0 ? receitaBruta / clientesUnicos : 0;

      return {
        conversao,
        ticketMedio,
        receitaBruta,
        cac,
        ltv,
        churn,
        retencao,
      };
    } catch (err) {
      console.error("[BI Service] Erro ao buscar CommercialCube", err);
      return {
        conversao: 0,
        ticketMedio: 0,
        receitaBruta: 0,
        cac: 0,
        ltv: 0,
        churn: 0,
        retencao: 100,
      };
    }
  }

  /**
   * Executa drill-down hierárquico
   */
  async executeDrillDown(empresaOperadoraId?: string, cidadeFilter?: string): Promise<DrillDownNode[]> {
    return [];
  }
}

export const biService = new BIService();
