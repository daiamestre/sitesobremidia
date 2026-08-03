import { FormaPagamento } from './enums';

export interface Financeiro {
  id: string;
  contratoId: string;
  clienteId: string;
  valor: number;
  vencimento: string;
  dataPagamento?: string;
  statusPagamento: 'pending' | 'paid' | 'overdue' | 'canceled';
  formaPagamento: FormaPagamento;
  linkBoletoPix?: string;
  createdAt: string;
  updatedAt: string;
}
