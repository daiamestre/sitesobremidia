import { FormaPagamento } from './enums';

export interface Proposta {
  id: string;
  clienteId: string;
  representanteId: string;
  numeroProposta: string;
  valorTotal: number;
  desconto: number;
  valorFinal: number;
  formaPagamento: FormaPagamento;
  validadeDias: number;
  status: 'draft' | 'sent' | 'approved' | 'rejected' | 'expired';
  pdfUrl?: string;
  createdAt: string;
  updatedAt: string;
}
