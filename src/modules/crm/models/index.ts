import { Cliente, Empresa, Contrato, Campanha, Financeiro, Contato, Proposta } from '../types';

export interface CrmDomainModel<T> {
  data: T;
  isNew: boolean;
  isValid: boolean;
}

export function createEmptyEmpresa(): Partial<Empresa> {
  return {
    nomeFantasia: '',
    razaoSocial: '',
    cnpj: '',
    segmento: '',
    whatsapp: '',
    email: '',
  };
}

export function createEmptyCliente(): Partial<Cliente> {
  return {
    status: undefined,
  };
}

export * from '../types';
