import { z } from 'zod';
import { StatusContrato, FormaPagamento } from '../types/enums';

export const contratoSchema = z.object({
  clienteId: z.string().min(1, 'Cliente é obrigatório'),
  numeroContrato: z.string().min(1, 'Número do contrato é obrigatório'),
  inicio: z.string().min(1, 'Data de início é obrigatória'),
  fim: z.string().min(1, 'Data de término é obrigatória'),
  valorMensal: z.number().positive('Valor mensal deve ser maior que zero'),
  formaPagamento: z.nativeEnum(FormaPagamento),
  status: z.nativeEnum(StatusContrato),
});

export type ContratoSchemaInput = z.infer<typeof contratoSchema>;
