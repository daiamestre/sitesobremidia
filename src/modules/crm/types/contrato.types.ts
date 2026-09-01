import { StatusContrato, FormaPagamento } from './enums';

export interface ContratoItem {
  id: string;
  contrato_id: string;
  servico_id: string;
  quantidade: number;
  valor_unitario: number;
  desconto: number;
  valor_total: number;
  servico?: {
    id: string;
    codigo_servico: string;
    nome: string;
    descricao: string;
    valor_tabela: number;
  };
}

export interface Contrato {
  id: string;
  clienteId: string;
  numeroContrato: string;
  inicio: string;
  fim: string;
  valorMensal: number;
  formaPagamento: FormaPagamento;
  status: StatusContrato;
  pdfUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContratoCompleto {
  id: string;
  empresa_operadora_id: string;
  numero_contrato: string;
  cliente_id: string | null;
  ponto_id?: string | null;
  empresa_id: string | null;
  representante_id: string | null;
  proposta_id: string | null;
  tipo_contrato?: 'ANUNCIANTE' | 'PARCEIRO';
  template_id?: string;
  template_nome?: string;
  template_versao?: number;
  usuario_responsavel_id?: string;
  data_selecao?: string;
  status_documento: 'RASCUNHO' | 'GERADO' | 'ENVIADO' | 'ASSINADO' | 'CANCELADO';
  pdf_object_key?: string;
  pdf_assinado_key?: string | null;
  valor_mensal: number;
  forma_pagamento: string;
  data_inicio: string;
  data_fim: string;
  versao_atual?: number;
  status_workflow?: string;
  itens?: ContratoItem[];
  cliente?: unknown;
  empresa?: unknown;
  proposta?: unknown;
  ponto?: unknown;
}

export interface ContratoVigente {
  id: string;
  numero_contrato: string;
  data_inicio: string;
  data_fim: string;
  valor_mensal: number;
  forma_pagamento: string;
  status_documento: string;
  status_workflow?: string;
  itens: ContratoItem[];
  max_pontos?: number;
  max_telas?: number;
}
