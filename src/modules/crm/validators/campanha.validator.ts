import { z } from 'zod';
import { StatusCampanha } from '../types/enums';

export const campanhaSchema = z.object({
  clienteId: z.string().min(1, 'Cliente é obrigatório'),
  titulo: z.string().min(3, 'Título da campanha deve ter no mínimo 3 caracteres'),
  objetivo: z.string().optional(),
  inicio: z.string().min(1, 'Data de início é obrigatória'),
  fim: z.string().min(1, 'Data de término é obrigatória'),
  duracaoVideo: z.number().int().positive('Duração do vídeo deve ser em segundos'),
  status: z.nativeEnum(StatusCampanha),
});

export type CampanhaSchemaInput = z.infer<typeof campanhaSchema>;
