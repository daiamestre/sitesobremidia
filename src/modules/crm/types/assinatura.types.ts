export interface Assinatura {
  id: string;
  contratoId: string;
  signatarioNome: string;
  signatarioEmail: string;
  signatarioCpf: string;
  status: 'pending' | 'signed' | 'rejected' | 'expired';
  tokenAssinatura?: string;
  assinadoEm?: string;
  ipAssinatura?: string;
  createdAt: string;
  updatedAt: string;
}
