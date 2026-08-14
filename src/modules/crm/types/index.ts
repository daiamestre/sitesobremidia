export * from './enums';
export * from './workflow.types';
export * from './rbac.types';
export * from './timeline.types';
export * from './audit.types';
export * from './representante.types';
export * from './cliente.types';
export * from './empresa.types';
export * from './contato.types';
export * from './campanha.types';
export * from './contrato.types';
export * from './plano.types';
export * from './pontoDeExibicao.types';
export * from './financeiro.types';
export * from './assinatura.types';
export * from './arquivo.types';
export * from './proposta.types';
export * from './portal.types';

export type StepperStepId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export interface StepperStep {
  id: StepperStepId;
  label: string;
}
