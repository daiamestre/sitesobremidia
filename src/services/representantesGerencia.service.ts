import { supabase } from '@/integrations/supabase/client';

export interface RepresentanteGerencia {
  id: string;
  codigo_representante: number | null;
  nome: string;
  email: string;
  telefone: string | null;
  cpf_cnpj: string;
  razao_social: string | null;
  comissao_porcentagem: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  usuario_ativo: boolean | null;
  perfil_nome: string;
  total_clientes: number;
  clientes_ativos: number;
  total_propostas: number;
  total_contratos: number;
  receita_mensal: number;
  meta_mensal: number;
  meta_realizado: number;
}

export interface DesempenhoRepresentante {
  representante_id: string;
  codigo_representante: number | null;
  nome: string;
  email: string;
  razao_social: string | null;
  cpf_cnpj: string;
  ativo: boolean;
  comissao_porcentagem: number;
  total_clientes: number;
  clientes_ativos: number;
  clientes_inativos: number;
  clientes_novos: number;
  propostas_criadas: number;
  propostas_aprovadas: number;
  contratos_fechados: number;
  contratos_ativos: number;
  receita_mensal: number;
  meta_mensal: number;
  meta_realizado: number;
}

export interface ClienteDesempenhoItem {
  id: string;
  codigo_cliente: number;
  razao_social: string;
  nome_fantasia: string | null;
  status: string;
  cidade: string | null;
  criado_em: string;
  propostas: number;
  contratos: number;
}

export interface PropostaDesempenhoItem {
  id: string;
  numero_proposta: string;
  titulo_campanha: string | null;
  valor_total: number;
  status: string;
  cliente_nome: string;
  criado_em: string;
}

export interface ContratoDesempenhoItem {
  id: string;
  numero_contrato: string;
  valor_mensal: number;
  status_workflow: string;
  data_inicio: string | null;
  cliente_nome: string;
  criado_em: string;
}

export interface EvolucaoMesItem {
  mes: string;
  mes_nome: string;
  propostas: number;
  contratos: number;
  receita: number;
}

export interface MetaRepresentanteItem {
  ano: number;
  mes: number;
  valor_meta: number;
  valor_realizado: number;
  status: string;
  percentual: number;
}

export interface DesempenhoDetalhe {
  representante: {
    id: string;
    codigo_representante: number | null;
    nome: string;
    email: string;
    telefone: string | null;
    razao_social: string | null;
    cpf_cnpj: string;
    comissao_porcentagem: number;
    ativo: boolean;
    created_at: string;
    perfil_nome: string;
  };
  resumo: {
    total_clientes: number;
    clientes_ativos: number;
    clientes_novos: number;
    propostas_criadas: number;
    propostas_aprovadas: number;
    contratos_fechados: number;
    receita_mensal: number;
    ticket_medio: number;
    meta_mensal: number;
    meta_realizado: number;
  };
  evolucao: EvolucaoMesItem[];
  clientes: ClienteDesempenhoItem[];
  propostas: PropostaDesempenhoItem[];
  contratos: ContratoDesempenhoItem[];
  metas: MetaRepresentanteItem[];
}

export interface EditarRepresentantePayload {
  cpfCnpj?: string;
  razaoSocial?: string;
  comissaoPorcentagem?: number;
  chavePix?: string;
  bancoNome?: string;
  bancoAgencia?: string;
  bancoConta?: string;
}

export class RepresentantesGerenciaService {
  async listarRepresentantes(opts?: {
    empresaOperadoraId?: string;
    status?: string;
    busca?: string;
    representanteId?: string;
  }): Promise<RepresentanteGerencia[]> {
    const { data, error } = await supabase.rpc('listar_representantes_gerencia', {
      p_empresa_operadora_id: opts?.empresaOperadoraId ?? null,
      p_status: opts?.status ?? null,
      p_busca: opts?.busca ?? null,
      p_representante_id: opts?.representanteId ?? null,
    });
    if (error) {
      console.error('[RepresentantesGerenciaService.listarRepresentantes]', error);
      throw new Error(error.message);
    }
    return (data as RepresentanteGerencia[]) ?? [];
  }

  async obterDesempenho(opts?: {
    periodoInicio?: string;
    periodoFim?: string;
    representanteId?: string;
    empresaOperadoraId?: string;
    ordenar?: string;
  }): Promise<DesempenhoRepresentante[]> {
    const { data, error } = await supabase.rpc('get_desempenho_representantes', {
      p_periodo_inicio: opts?.periodoInicio ?? null,
      p_periodo_fim: opts?.periodoFim ?? null,
      p_representante_id: opts?.representanteId ?? null,
      p_empresa_operadora_id: opts?.empresaOperadoraId ?? null,
      p_ordenar: opts?.ordenar ?? 'receita',
    });
    if (error) {
      console.error('[RepresentantesGerenciaService.obterDesempenho]', error);
      throw new Error(error.message);
    }
    return (data as DesempenhoRepresentante[]) ?? [];
  }

  async obterDesempenhoDetalhe(
    representanteId: string,
    periodoInicio?: string,
    periodoFim?: string,
  ): Promise<DesempenhoDetalhe | null> {
    const { data, error } = await supabase.rpc('get_desempenho_representante_detalhe', {
      p_representante_id: representanteId,
      p_periodo_inicio: periodoInicio ?? null,
      p_periodo_fim: periodoFim ?? null,
    });
    if (error) {
      console.error('[RepresentantesGerenciaService.obterDesempenhoDetalhe]', error);
      throw new Error(error.message);
    }
    return (data as DesempenhoDetalhe) ?? null;
  }

  async editarRepresentante(
    representanteId: string,
    payload: EditarRepresentantePayload,
  ): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc('gerenciar_representante', {
      p_acao: 'EDITAR',
      p_representante_id: representanteId,
      p_cpf_cnpj: payload.cpfCnpj ?? null,
      p_razao_social: payload.razaoSocial ?? null,
      p_comissao_porcentagem: payload.comissaoPorcentagem ?? null,
      p_chave_pix: payload.chavePix ?? null,
      p_banco_nome: payload.bancoNome ?? null,
      p_banco_agencia: payload.bancoAgencia ?? null,
      p_banco_conta: payload.bancoConta ?? null,
    });
    if (error) {
      console.error('[RepresentantesGerenciaService.editarRepresentante]', error);
      return { success: false, error: error.message };
    }
    return { success: (data as { success: boolean })?.success ?? true };
  }

  async ativarRepresentante(representanteId: string): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc('gerenciar_representante', {
      p_acao: 'ATIVAR',
      p_representante_id: representanteId,
    });
    if (error) {
      console.error('[RepresentantesGerenciaService.ativarRepresentante]', error);
      return { success: false, error: error.message };
    }
    return { success: (data as { success: boolean })?.success ?? true };
  }

  async desativarRepresentante(representanteId: string): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc('gerenciar_representante', {
      p_acao: 'DESATIVAR',
      p_representante_id: representanteId,
    });
    if (error) {
      console.error('[RepresentantesGerenciaService.desativarRepresentante]', error);
      return { success: false, error: error.message };
    }
    return { success: (data as { success: boolean })?.success ?? true };
  }

  async reassinarCliente(
    clienteId: string,
    representanteId: string | null,
  ): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc('reassinar_cliente_representante', {
      p_cliente_id: clienteId,
      p_representante_id: representanteId,
    });
    if (error) {
      console.error('[RepresentantesGerenciaService.reassinarCliente]', error);
      return { success: false, error: error.message };
    }
    return { success: (data as { success: boolean })?.success ?? true };
  }
}

export const representantesGerenciaService = new RepresentantesGerenciaService();