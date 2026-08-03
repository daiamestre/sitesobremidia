import { z } from 'zod';

export const empresaSchema = z.object({
  nomeFantasia: z.string().min(2, 'Nome Fantasia é obrigatório'),
  razaoSocial: z.string().min(2, 'Razão Social é obrigatória'),
  cnpj: z.string().min(14, 'CNPJ deve conter no mínimo 14 caracteres'),
  segmento: z.string().optional(),
  telefone: z.string().optional(),
  whatsapp: z.string().min(8, 'WhatsApp é obrigatório'),
  email: z.string().email('E-mail inválido'),
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().max(2).optional(),
  representanteLegal: z.string().optional(),
  cargoRepresentante: z.string().optional(),
  observacoes: z.string().optional(),
});

export type EmpresaSchemaInput = z.infer<typeof empresaSchema>;
