import { supabase } from '@/integrations/supabase/client';

export interface RepresentativeDashboardMetrics {
  totalClientesCarteira: number;
  propostasAbertas: number;
  propostasAprovadas: number;
  contratosAtivos: number;
  receitaGeradaMes: number;
  comissoesPendentes: number;
  comissoesLiberadas: number;
  comissoesPagas: number;
  metaMensal: number;
  metaRealizada: number;
  percentualMeta: number;
  posicaoRanking: number;
}

export interface CarteiraClienteItem {
  id: string;
  codigo_cliente: number;
  razao_social?: string;
  nome_fantasia?: string;
  cnpj_cpf?: string;
  status: string;
  cidade?: string;
  contratos_ativos: number;
  receita_mensal: number;
  created_at: string;
}

export interface PropostaItem {
  id: string;
  numero_proposta: string;
  cliente_id: string;
  cliente_nome?: string;
  valor_total: number;
  status: string;
  created_at: string;
}

export interface ContratoCarteiraItem {
  id: string;
  numero_contrato: string;
  cliente_id: string;
  cliente_nome?: string;
  valor_mensal: number;
  status_workflow: string;
  data_inicio: string;
  data_fim: string;
}

export interface ComissaoItem {
  id: string;
  contrato_id: string;
  numero_contrato?: string;
  cliente_nome?: string;
  valor_base: number;
  porcentagem: number;
  valor_comissao: number;
  status: string;
  created_at: string;
  data_liberacao?: string;
  data_pagamento?: string;
}

export interface MetaItem {
  id: string;
  ano: number;
  mes: number;
  valor_meta: number;
  valor_realizado: number;
  status: string;
  percentual: number;
}

export interface RankingItem {
  posicao: number;
  representante_id: string;
  nome_representante: string;
  total_receita: number;
  contratos_fechados: number;
}

export class RepresentativeService {
  /**
   * Obtém métricas executivas do Portal do Representante com dados reais do banco
   */
  async getDashboardMetrics(
    representanteId?: string,
    empresaOperadoraId?: string
  ): Promise<RepresentativeDashboardMetrics> {
    try {
      // 1. Clientes da Carteira
      let queryClientes = supabase.from('clientes').select('id', { count: 'exact' });
      if (empresaOperadoraId) queryClientes = queryClientes.eq('empresa_operadora_id', empresaOperadoraId);
      if (representanteId) queryClientes = queryClientes.eq('representante_id', representanteId);
      const { count: countClientes } = await queryClientes;

      // 2. Contratos Ativos
      let queryContratos = supabase.from('contratos').select('id, valor_mensal');
      if (empresaOperadoraId) queryContratos = queryContratos.eq('empresa_operadora_id', empresaOperadoraId);
      if (representanteId) queryContratos = queryContratos.eq('representante_id', representanteId);
      const { data: contratos } = await queryContratos;

      const totalContratosAtivos = (contratos || []).length;
      const receitaGeradaMes = (contratos || []).reduce((acc, c) => acc + (Number(c.valor_mensal) || 0), 0);

      // 3. Comissões
      let queryComissoes = supabase.from('comissoes').select('valor_comissao, status');
      if (empresaOperadoraId) queryComissoes = queryComissoes.eq('empresa_operadora_id', empresaOperadoraId);
      if (representanteId) queryComissoes = queryComissoes.eq('representante_id', representanteId);
      const { data: comissoes } = await queryComissoes;

      const comissoesList = comissoes || [];
      const comissoesPendentes = comissoesList.filter(c => c.status === 'PENDENTE').reduce((a, c) => a + Number(c.valor_comissao), 0);
      const comissoesLiberadas = comissoesList.filter(c => c.status === 'LIBERADA').reduce((a, c) => a + Number(c.valor_comissao), 0);
      const comissoesPagas = comissoesList.filter(c => c.status === 'PAGA').reduce((a, c) => a + Number(c.valor_comissao), 0);

      // 4. Metas — mês atual dinâmico
      const now = new Date();
      let queryMeta = supabase
        .from('metas_representantes')
        .select('valor_meta, valor_realizado')
        .eq('ano', now.getFullYear())
        .eq('mes', now.getMonth() + 1);
      if (empresaOperadoraId) queryMeta = queryMeta.eq('empresa_operadora_id', empresaOperadoraId);
      if (representanteId) queryMeta = queryMeta.eq('representante_id', representanteId);
      const { data: metaData } = await queryMeta.maybeSingle();

      // Zero Mock: sem fallbacks de valores fictícios
      const metaMensal = Number(metaData?.valor_meta) || 0;
      const metaRealizada = Number(metaData?.valor_realizado) || receitaGeradaMes;
      const percentualMeta = metaMensal > 0 ? Number(((metaRealizada / metaMensal) * 100).toFixed(1)) : 0;

      // 5. Propostas — contagens reais
      let queryPropostas = supabase.from('propostas').select('id, status');
      if (empresaOperadoraId) queryPropostas = queryPropostas.eq('empresa_operadora_id', empresaOperadoraId);
      if (representanteId) queryPropostas = queryPropostas.eq('representante_id', representanteId);
      const { data: propostasData } = await queryPropostas;
      const propostasAbertas = (propostasData || []).filter((p: any) => ['ENVIADA', 'NEGOCIACAO', 'REVISAO'].includes(p.status)).length;
      const propostasAprovadas = (propostasData || []).filter((p: any) => p.status === 'APROVADA').length;

      return {
        totalClientesCarteira: countClientes || 0,
        propostasAbertas,
        propostasAprovadas,
        contratosAtivos: totalContratosAtivos,
        receitaGeradaMes,
        comissoesPendentes,
        comissoesLiberadas,
        comissoesPagas,
        metaMensal,
        metaRealizada,
        percentualMeta,
        posicaoRanking: 0, // ranking calculado separadamente via getRankingComercial
      };
    } catch (err) {
      console.error('[RepresentativeService] Erro ao calcular métricas do dashboard:', err);
      // Zero Mock: Empty State com zeros reais — nunca fabricar dados financeiros
      return {
        totalClientesCarteira: 0,
        propostasAbertas: 0,
        propostasAprovadas: 0,
        contratosAtivos: 0,
        receitaGeradaMes: 0,
        comissoesPendentes: 0,
        comissoesLiberadas: 0,
        comissoesPagas: 0,
        metaMensal: 0,
        metaRealizada: 0,
        percentualMeta: 0,
        posicaoRanking: 0,
      };
    }
  }

  /**
   * Busca clientes da carteira filtrados por representante
   */
  async getCarteiraClientes(
    representanteId?: string,
    empresaOperadoraId?: string,
    searchTerm?: string
  ): Promise<CarteiraClienteItem[]> {
    try {
      let query = supabase
        .from('clientes')
        .select('id, codigo_cliente, status, created_at, contratos(id, valor_mensal), empresas(razao_social, nome_fantasia, cnpj_cpf, cidade)');

      if (empresaOperadoraId) query = query.eq('empresa_operadora_id', empresaOperadoraId);
      if (representanteId) query = query.eq('representante_id', representanteId);

      const { data } = await query;

      // Zero Mock: dados reais do JOIN com empresas — sem campos hardcoded
      return (data || []).map((cli: any) => {
        const contratos = cli.contratos || [];
        const empresa = cli.empresas?.[0] || null; // primeiro CNPJ/empresa vinculada
        const receita = contratos.reduce((a: number, c: any) => a + (Number(c.valor_mensal) || 0), 0);
        return {
          id: cli.id,
          codigo_cliente: cli.codigo_cliente,
          razao_social: empresa?.razao_social || undefined,
          nome_fantasia: empresa?.nome_fantasia || undefined,
          cnpj_cpf: empresa?.cnpj_cpf || undefined,
          status: cli.status,
          cidade: empresa?.cidade || undefined,
          contratos_ativos: contratos.length,
          receita_mensal: receita,
          created_at: cli.created_at,
        };
      });
    } catch (err) {
      return [];
    }
  }

  /**
   * Busca comissões do representante
   */
  async getComissoes(
    representanteId?: string,
    empresaOperadoraId?: string
  ): Promise<ComissaoItem[]> {
    try {
      let query = supabase
        .from('comissoes')
        .select('*, contratos(numero_contrato, clientes(empresas(nome_fantasia, razao_social)))');
      if (empresaOperadoraId) query = query.eq('empresa_operadora_id', empresaOperadoraId);
      if (representanteId) query = query.eq('representante_id', representanteId);

      const { data } = await query;

      // Zero Mock: todos os campos derivados de dados reais do banco — sem strings ou valores fictícios
      return (data || []).map((item: any) => {
        const contrato = item.contratos;
        const empresa = contrato?.clientes?.empresas;
        return {
          id: item.id,
          contrato_id: item.contrato_id,
          numero_contrato: contrato?.numero_contrato || undefined,
          cliente_nome: empresa?.nome_fantasia || empresa?.razao_social || undefined,
          valor_base: Number(item.valor_base) || 0,
          porcentagem: Number(item.porcentagem) || 0,
          valor_comissao: Number(item.valor_comissao) || 0,
          status: item.status || 'PENDENTE',
          created_at: item.created_at,
          data_liberacao: item.data_liberacao || undefined,
          data_pagamento: item.data_pagamento || undefined,
        };
      });
    } catch (err) {
      console.error('[RepresentativeService] Erro ao buscar comissões:', err);
      return [];
    }
  }

  /**
   * Busca metas de vendas do representante
   */
  async getMetas(
    representanteId?: string,
    empresaOperadoraId?: string
  ): Promise<MetaItem[]> {
    try {
      let query = supabase.from('metas_representantes').select('*');
      if (empresaOperadoraId) query = query.eq('empresa_operadora_id', empresaOperadoraId);
      if (representanteId) query = query.eq('representante_id', representanteId);

      const { data } = await query;

      return (data || []).map((m: any) => {
        const meta = Number(m.valor_meta) || 0;
        const realizado = Number(m.valor_realizado) || 0;
        return {
          id: m.id,
          ano: m.ano,
          mes: m.mes,
          valor_meta: meta,
          valor_realizado: realizado,
          status: m.status,
          percentual: meta > 0 ? Number(((realizado / meta) * 100).toFixed(1)) : 0,
        };
      });
    } catch (err) {
      return [];
    }
  }

  /**
   * Ranking comercial — dados reais calculados sobre contratos e comissões no banco
   */
  async getRankingComercial(empresaOperadoraId?: string): Promise<RankingItem[]> {
    try {
      let query = supabase
        .from('representantes')
        .select('id, usuarios(nome), contratos(id, valor_mensal)');
      if (empresaOperadoraId) query = (query as any).eq('empresa_operadora_id', empresaOperadoraId);

      const { data, error } = await query;
      if (error || !data) return [];

      const ranking = (data as any[]).map((rep: any) => {
        const contratos = rep.contratos || [];
        const totalReceita = contratos.reduce((a: number, c: any) => a + (Number(c.valor_mensal) || 0), 0);
        return {
          representante_id: rep.id,
          nome_representante: rep.usuarios?.nome || 'Representante',
          total_receita: totalReceita,
          contratos_fechados: contratos.length,
        };
      });

      // Ordena por receita desc e atribui posição real
      return ranking
        .sort((a: any, b: any) => b.total_receita - a.total_receita)
        .map((item: any, idx: number) => ({ posicao: idx + 1, ...item }));
    } catch (err) {
      console.error('[RepresentativeService] Erro ao calcular ranking comercial:', err);
      return []; // Zero Mock: lista vazia real, nunca dados fabricados
    }
  }
}

export const representativeService = new RepresentativeService();
