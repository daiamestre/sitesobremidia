import { StatusCliente } from './enums';

export interface Cliente {
  id: string;
  empresaId: string;
  representanteId: string;
  status: StatusCliente;
  createdAt: string;
  updatedAt: string;
}

export interface ClienteCompleto {
  id: string;
  empresa_operadora_id: string;
  representante_id: string | null;
  codigo_cliente: number;
  status: string;
  created_at: string;
  updated_at: string;
  empresas?: Array<{
    id: string;
    razao_social: string;
    nome_fantasia: string;
    cnpj: string;
    segmento?: string;
    telefone?: string;
    whatsapp: string;
    email: string;
    cep?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade: string;
    estado: string;
    representante_legal?: string;
    cargo_representante?: string;
    observacoes?: string;
    contatos?: Array<{
      id: string;
      nome: string;
      cargo: string;
      email: string;
      telefone: string;
      is_principal: boolean;
    }>;
  }>;
  representante?: {
    id: string;
    codigo_representante?: number;
    cpf_cnpj: string;
    usuario?: {
      nome: string;
      email: string;
    };
  };
}

export interface ClientePortal {
  id: string;
  nome_fantasia: string;
  razao_social: string;
  cnpj: string;
  cidade: string;
  estado: string;
  email: string;
  whatsapp: string;
}
