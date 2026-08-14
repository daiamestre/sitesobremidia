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
  cliente_id: string;
  empresa_id: string;
  representante_id: string | null;
  proposta_id: string;
  tipo_contrato?: 'ANUNCIANTE' | 'PARCEIRO';
  template_id?: string;
  template_nome?: string;
  template_versao?: number;
  usuario_responsavel_id?: string;
  data_selecao?: string;
  status_documento: 'RASCUNHO' | 'GERADO' | 'ENVIADO' | 'ASSINADO' | 'CANCELADO';
  pdf_object_key?: string;
  valor_mensal: number;
  forma_pagamento: string;
  data_inicio: string;
  data_fim: string;
  versao_atual?: number;
  status_workflow?: string;
  itens?: ContratoItem[];
  cliente?: any;
  empresa?: any;
  proposta?: any;
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
