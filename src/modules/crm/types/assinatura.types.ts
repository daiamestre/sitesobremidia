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

export type SignatureMethod = 'DRAWN' | 'TYPED';

export interface SignatureSigner {
  nome: string;
  email?: string;
  cpfCnpj?: string;
}

export interface SignatureCaptureResult {
  action: 'SIGNED' | 'SKIPPED';
  method?: SignatureMethod;
  signatureImage?: Blob;
  signatureDataUrl?: string;
  signer: SignatureSigner;
  timestamp: string;
}

export interface CanvasSignaturePadRef {
  isEmpty: () => boolean;
  clear: () => void;
  undo: () => void;
  toPngBlob: () => Promise<Blob | null>;
  toDataUrl: () => string | null;
}

export interface TypedSignaturePadRef {
  isEmpty: () => boolean;
  clear: () => void;
  toPngBlob: () => Promise<Blob | null>;
  toDataUrl: () => Promise<string | null>;
  getSelectedName: () => string;
}

