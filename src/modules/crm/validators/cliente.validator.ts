import { z } from 'zod';
import { StatusCliente } from '../types/enums';

export const clienteSchema = z.object({
  empresaId: z.string().uuid('ID da empresa inválido'),
  representanteId: z.string().uuid('ID do representante inválido'),
  status: z.nativeEnum(StatusCliente),
});

export type ClienteSchemaInput = z.infer<typeof clienteSchema>;
