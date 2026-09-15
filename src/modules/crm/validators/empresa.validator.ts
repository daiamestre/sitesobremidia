import { z } from 'zod';
import {
  validarCnpj,
  normalizarCnpj,
  normalizarCep,
  UFS_VALIDAS
} from './cliente.validator';

/**
 * Schema oficial de validação do formulário de Empresa (CRM).
 * Integra regras canônicas de CNPJ oficial, UFs brasileiras e normalização.
 */
export const empresaSchema = z.object({
  nomeFantasia: z.string().min(2, 'Nome Fantasia é obrigatório (mín. 2 caracteres)'),
  razaoSocial: z.string().min(2, 'Razão Social é obrigatória (mín. 2 caracteres)'),
  cnpj: z
    .string()
    .min(14, 'CNPJ deve conter no mínimo 14 caracteres')
    .refine((v) => validarCnpj(v), 'CNPJ inválido. Verifique os dígitos verificadores.'),
  segmento: z.string().optional(),
  telefone: z
    .string()
    .optional()
    .refine(
      (v) => v === undefined || v === '' || /^\d{10,11}$/.test(v.replace(/\D/g, '')),
      'Telefone fixo inválido. Use apenas números (DDD + número).'
    ),
  whatsapp: z
    .string()
    .min(8, 'WhatsApp é obrigatório (mín. 8 dígitos)')
    .refine(
      (v) => /^\d{10,13}$/.test(v.replace(/\D/g, '')),
      'WhatsApp comercial inválido. Use apenas números (DDD + número).'
    ),
  email: z.string().email('E-mail inválido. Verifique o formato.'),
  cep: z
    .string()
    .optional()
    .refine(
      (v) => v === undefined || v === '' || /^\d{8}$/.test(v.replace(/\D/g, '')),
      'CEP inválido. Use 8 dígitos numéricos (ex.: 50720-001).'
    ),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  estado: z
    .string()
    .transform((v) => (v || '').trim().toUpperCase())
    .refine(
      (v) => v === '' || (UFS_VALIDAS as readonly string[]).includes(v),
      'UF inválida. Use o padrão de 2 letras (ex.: PE, SP, RJ).'
    )
    .optional()
    .or(z.literal('')),
  representanteLegal: z.string().optional(),
  cargoRepresentante: z.string().optional(),
  observacoes: z.string().optional(),
});

export type EmpresaSchemaInput = z.infer<typeof empresaSchema>;

/**
 * Normaliza os campos de documento e endereço do formulário de Empresa
 * antes do envio para serviços ou persistência.
 */
export function normalizarEmpresaInput(input: Partial<EmpresaSchemaInput>): Partial<EmpresaSchemaInput> {
  return {
    ...input,
    cnpj: input.cnpj ? normalizarCnpj(input.cnpj) : input.cnpj,
    cep: input.cep ? normalizarCep(input.cep) : input.cep,
    estado: input.estado ? input.estado.trim().toUpperCase() : input.estado,
  };
}
