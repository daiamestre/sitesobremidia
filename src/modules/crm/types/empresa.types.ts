export interface Empresa {
  id: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  segmento: string;
  telefone?: string;
  whatsapp: string;
  email: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  representanteLegal?: string;
  cargoRepresentante?: string;
  observacoes?: string;
  createdAt: string;
  updatedAt: string;
}
