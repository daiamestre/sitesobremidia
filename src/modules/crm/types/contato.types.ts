export interface Contato {
  id: string;
  empresaId: string;
  nome: string;
  cargo: string;
  telefone: string;
  email: string;
  isPrincipal?: boolean;
  createdAt: string;
  updatedAt: string;
}
