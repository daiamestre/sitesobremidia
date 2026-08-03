import { StatusCampanha } from './enums';

export interface Campanha {
  id: string;
  clienteId: string;
  titulo: string;
  objetivo?: string;
  inicio: string;
  fim: string;
  duracaoVideo: number; // em segundos (ex: 15s)
  status: StatusCampanha;
  pontosExibicaoIds?: string[];
  createdAt: string;
  updatedAt: string;
}
