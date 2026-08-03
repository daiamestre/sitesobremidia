import { TipoPlano } from '../types/enums';

export interface PlanoItem {
  id: TipoPlano;
  nome: string;
  duracaoMeses: number;
  descontoPorcentagem: number;
  recomendado?: boolean;
}

export const TIPOS_PLANO: PlanoItem[] = [
  { id: TipoPlano.MONTHLY, nome: 'Plano Mensal', duracaoMeses: 1, descontoPorcentagem: 0 },
  { id: TipoPlano.QUARTERLY, nome: 'Plano Trimestral', duracaoMeses: 3, descontoPorcentagem: 5 },
  { id: TipoPlano.SEMIANNUAL, nome: 'Plano Semestral', duracaoMeses: 6, descontoPorcentagem: 10 },
  { id: TipoPlano.ANNUAL, nome: 'Plano Anual', duracaoMeses: 12, descontoPorcentagem: 20, recomendado: true },
  { id: TipoPlano.CUSTOM, nome: 'Plano Personalizado', duracaoMeses: 0, descontoPorcentagem: 0 },
];
