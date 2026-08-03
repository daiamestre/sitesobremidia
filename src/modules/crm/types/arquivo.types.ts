export interface Arquivo {
  id: string;
  entidadeTipo: 'cliente' | 'campanha' | 'contrato' | 'proposta';
  entidadeId: string;
  nomeArquivo: string;
  tamanhoBytes: number;
  mimeType: string;
  url: string;
  enviadoPorId?: string;
  createdAt: string;
  updatedAt: string;
}
