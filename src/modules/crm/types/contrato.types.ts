import { StatusContrato, FormaPagamento } from './enums';

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
