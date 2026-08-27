export interface PontoComLimite {
  id: string;
  nome: string;
  tipo: 'tv_corporativa' | 'painel_led' | 'display_digital' | 'totem';
  cidade: string;
  estado: string;
  endereco: string;
  resolucao: string;
  ativo: boolean;
  tela_id?: string;
  tela_nome?: string;
  tela_capa_url?: string;
  tela_resolucao?: string;
  tela_orientacao?: 'horizontal' | 'vertical';
  unidade_id?: string;
  unidade_nome?: string;
  pi_id?: string;
  pi_status?: string;
  quantidade_telas: number;
}

export interface PontosResumo {
  total_pontos: number;
  total_telas: number;
  pontos_ativos: number;
  telas_ativas: number;
  limite_pontos_contrato: number | null;
  limite_telas_contrato: number | null;
  pontos_disponiveis: number | null;
  telas_disponiveis: number | null;
  percentual_uso_pontos: number | null;
  percentual_uso_telas: number | null;
}

export interface InsercaoPorDia {
  data: string;
  quantidade: number;
  campanhas: Array<{
    id: string;
    titulo: string;
    duracao_segundos: number;
    status: string;
    ponto_nome?: string;
    tela_nome?: string;
    cidade?: string;
    estado?: string;
  }>;
}

export interface CampanhaComInsercoes {
  id: string;
  titulo: string;
  objetivo?: string;
  inicio: string;
  fim: string;
  duracao_segundos: number;
  status: string;
  pontos_exibicao_ids?: string[];
  insercoes: InsercaoPorDia[];
  total_insercoes: number;
  created_at: string;
  updated_at: string;
}

export interface OcupacaoRede {
  total_pontos_rede: number;
  total_telas_rede: number;
  pontos_ocupados: number;
  telas_ocupadas: number;
  pontos_livres: number;
  telas_livres: number;
  taxa_ocupacao_pontos: number;
  taxa_ocupacao_telas: number;
  por_cidade: Array<{
    cidade: string;
    estado: string;
    pontos: number;
    telas: number;
    ocupados: number;
    livres: number;
  }>;
  por_tipo: Array<{
    tipo: string;
    pontos: number;
    telas: number;
  }>;
}

export interface ContratoDetalhePortal {
  id: string;
  numero_contrato: string;
  tipo_contrato?: string | null;
  data_inicio: string;
  data_fim: string;
  valor_mensal: number;
  forma_pagamento: string;
  status_documento: string;
  status_workflow?: string;
  pdf_object_key?: string | null;
  pdf_assinado_key?: string | null;
  assinatura_envelope_id?: string | null;
  documento_enviado_em?: string | null;
  documento_assinado_em?: string | null;
  itens: Array<{
    servico_nome: string;
    quantidade: number;
    valor_unitario: number;
    valor_total: number;
  }>;
  max_pontos: number | null;
  max_telas: number | null;
  vigente: boolean;
  dias_restantes: number;
}

export interface DashboardKPIsCliente {
  campanhas_ativas: number;
  artes_aprovadas_pct: number;
  contratos_vigentes: number;
  chamados_abertos: number;
  total_pontos: number;
  total_telas: number;
  pontos_disponiveis: number | null;
  telas_disponiveis: number | null;
}