// ======================================================================
// SOBRE MÍDIA CUSTOMER PORTAL — Tipos do módulo Commerce
// (Produtos, Preços, Ofertas, Onboarding, Expansão)
// Espelha o schema da migration 20260916_customer_portal_commerce_foundation
// ======================================================================

export type ModalidadeCliente = 'ANUNCIANTE' | 'HOST' | 'HIBRIDO';

export type OfertaStatus =
  | 'DRAFT'
  | 'GENERATING'
  | 'GENERATED'
  | 'REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'SCHEDULED'
  | 'PUBLISHED'
  | 'ARCHIVED';

export type OfertaCanal =
  | 'TODOS'
  | 'WEB'
  | 'WHATSAPP'
  | 'TELA'
  | 'LED'
  | 'TV'
  | 'INSTAGRAM'
  | 'PORTAL';

export type ExpansaoStatus = 'SOLICITADA' | 'APROVADA' | 'REJEITADA' | 'CANCELADA';

export type OnboardingStatus = 'EM_ANDAMENTO' | 'CONCLUIDO' | 'ABANDONADO' | 'CONVERTIDO';

export interface Produto {
  id: string;
  empresa_operadora_id: string;
  cliente_id: string;
  codigo: string | null;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  marca: string | null;
  unidade_medida: string;
  imagem_url: string | null;
  preco_atual: number;
  preco_promocional: number | null;
  promocao_inicio: string | null;
  promocao_fim: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface ProdutoPreco {
  id: string;
  produto_id: string;
  preco: number;
  preco_promocional: number | null;
  promocao_inicio: string | null;
  promocao_fim: string | null;
  justificativa: string;
  created_at: string;
  created_by: string | null;
}

export interface PrecoAuditoria {
  id: string;
  produto_id: string;
  valor_anterior: number;
  valor_novo: number;
  preco_promocional_anterior: number | null;
  preco_promocional_novo: number | null;
  tipo_alteracao: 'PRECO_OFICIAL' | 'PRECO_PROMOCIONAL' | 'PERIODO_PROMOCAO' | 'TODOS';
  responsavel_id: string | null;
  responsavel_nome: string | null;
  justificativa: string;
  created_at: string;
}

export interface Oferta {
  id: string;
  empresa_operadora_id: string;
  cliente_id: string;
  titulo: string;
  descricao: string | null;
  data_inicio: string;
  data_fim: string;
  status: OfertaStatus;
  canal: OfertaCanal;
  destaque: boolean;
  criada_por_ia: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  itens?: OfertaItem[];
}

export interface OfertaItem {
  id: string;
  oferta_id: string;
  produto_id: string;
  preco_original: number;
  preco_oferta: number;
  desconto_porcentagem: number;
  destaque: boolean;
  created_at: string;
  produto?: Produto | null;
}

export interface OfertaItemInput {
  produto_id: string;
  preco_original: number;
  preco_oferta: number;
  desconto_porcentagem: number;
  destaque?: boolean;
}

export interface PontoPreco {
  id: string;
  empresa_operadora_id: string;
  ponto_id: string;
  periodicidade: 'MENSAL' | 'BIMESTRAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL';
  preco: number;
  ativo: boolean;
  vigencia_inicio: string;
  vigencia_fim?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

export interface ContratoEstabelecimento {
  id: string;
  contrato_id: string;
  unidade_id: string;
  ponto_id?: string | null;
  periodicidade?: 'MENSAL' | 'BIMESTRAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL' | null;
  valor_tabela?: number | null;
  desconto?: number | null;
  subtotal?: number | null;
  observacoes?: string | null;
  quantidade_telas: number;
  valor_unitario: number;
  ativo: boolean;
  created_at: string;
  created_by: string | null;
  unidade?: {
    id: string;
    nome: string;
    cidade: string;
    estado: string;
    endereco: string | null;
  } | null;
}

export interface Expansao {
  id: string;
  empresa_operadora_id: string;
  contrato_id: string;
  solicitado_por: string | null;
  status: ExpansaoStatus;
  valor_contrato_atual: number;
  valor_novo_contrato: number;
  justificativa: string | null;
  aprovado_por: string | null;
  aprovado_em: string | null;
  motivo_rejeicao: string | null;
  created_at: string;
  updated_at: string;
  itens?: ExpansaoItem[];
}

export interface ExpansaoItem {
  id: string;
  expansao_id: string;
  unidade_id: string;
  quantidade_telas: number;
  valor_unitario: number;
  valor_total: number;
  created_at: string;
  unidade?: {
    id: string;
    nome: string;
    cidade: string;
    estado: string;
  } | null;
}

export interface OnboardingSessao {
  id: string;
  empresa_operadora_id: string;
  usuario_id: string;
  cliente_id: string | null;
  modalidade: ModalidadeCliente | null;
  step: string;
  status: OnboardingStatus;
  dados: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EstabelecimentoDisponivel {
  unidade_id: string;
  nome: string;
  cidade: string;
  estado: string;
  endereco: string;
  rede_nome: string;
  quantidade_telas: number;
  valor_unitario: number;
}

export interface CalculoPrecoItem {
  unidade_id: string;
  nome: string;
  cidade: string;
  estado: string;
  quantidade_telas: number;
  valor_unitario: number;
  valor_total: number;
}

export interface CalculoPreco {
  success: boolean;
  error?: string;
  tenant_id?: string;
  duracao_meses?: number;
  total_telas?: number;
  valor_unitario?: number;
  valor_mensal?: number;
  valor_total_periodo?: number;
  itens?: CalculoPrecoItem[];
}

export interface ContratoOnboardingResult {
  success: boolean;
  error?: string;
  contrato_id?: string;
  numero_contrato?: string;
  valor_mensal?: number;
  data_inicio?: string;
  data_fim?: string;
  cliente_id?: string;
  empresa_id?: string;
}

export interface ExpansaoResult {
  success: boolean;
  error?: string;
  expansao_id?: string;
  valor_contrato_atual?: number;
  valor_adicional_mensal?: number;
  valor_novo_contrato?: number;
  total_telas_adicionais?: number;
  itens?: CalculoPrecoItem[];
}

export interface AtualizarPrecoResult {
  success: boolean;
  error?: string;
  produto_id?: string;
  preco_anterior?: number;
  preco_novo?: number;
  auditado?: boolean;
}