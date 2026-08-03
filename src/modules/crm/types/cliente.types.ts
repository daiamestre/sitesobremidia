import { StatusCliente } from './enums';

export interface Cliente {
  id: string;
  empresaId: string;
  representanteId: string;
  status: StatusCliente;
  createdAt: string;
  updatedAt: string;
}
