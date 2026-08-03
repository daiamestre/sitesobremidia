import { TipoPlano } from './enums';

export interface Plano {
  id: string;
  tipo: TipoPlano;
  nome: string;
  descricao?: string;
  duracaoMeses: number;
  descontoPorcentagem: number;
  valorBase: number;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
}
