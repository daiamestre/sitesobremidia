import { TipoUsuario } from './enums';

export interface Representante {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  cpfCnpj?: string;
  tipoUsuario: TipoUsuario.REPRESENTATIVE;
  comissaoPorcentagem?: number;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
}
