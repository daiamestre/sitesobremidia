import { z } from 'zod';
import { StatusCliente } from '../types/enums';

/**
 * Lista oficial de Unidades Federativas (padrão do banco: VARCHAR(2), ex.: "PE", "SP").
 * O frontend nunca deve enviar nome por extenso (ex.: "Pernambuco") para o campo estado.
 */
export const UFS_VALIDAS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
] as const;

export type UF = (typeof UFS_VALIDAS)[number];

/**
 * Validação real de CNPJ com cálculo dos dígitos verificadores (algoritmo oficial).
 * Aceita formatado ("00.000.000/0001-00") ou apenas dígitos (14).
 */
export function validarCnpj(cnpj: string): boolean {
  const digitos = cnpj.replace(/\D/g, '');
  if (digitos.length !== 14) return false;

  const todosIguais = /^(\d)\1{13}$/.test(digitos);
  if (todosIguais) return false;

  const calcularDigito = (base: string, pesos: number[]): number => {
    const soma = base.split('').reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const pesos1 = [5,4,3,2,9,8,7,6,5,4,3,2];
  const d1 = calcularDigito(digitos.slice(0, 12), pesos1);
  if (d1 !== Number(digitos[12])) return false;

  const pesos2 = [6,5,4,3,2,9,8,7,6,5,4,3,2];
  const d2 = calcularDigito(digitos.slice(0, 13), pesos2);
  return d2 === Number(digitos[13]);
}

/**
 * Validação real de CPF com cálculo dos dígitos verificadores (algoritmo oficial).
 * Aceita formatado ("000.000.000-00") ou apenas dígitos (11).
 */
export function validarCpf(cpf: string): boolean {
  const digitos = cpf.replace(/\D/g, '');
  if (digitos.length !== 11) return false;

  const todosIguais = /^(\d)\1{10}$/.test(digitos);
  if (todosIguais) return false;

  const calcularDigito = (base: string, pesos: number[]): number => {
    const soma = base.split('').reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const d1 = calcularDigito(digitos.slice(0, 9), [10,9,8,7,6,5,4,3,2]);
  if (d1 !== Number(digitos[9])) return false;

  const d2 = calcularDigito(digitos.slice(0, 10), [11,10,9,8,7,6,5,4,3,2]);
  return d2 === Number(digitos[10]);
}

/**
 * Valida CPF ou CNPJ conforme a quantidade de dígitos (campo opcional).
 * Vazio/undefined: válido (campo opcional). 11 dígitos: CPF. 14 dígitos: CNPJ.
 * Qualquer outra quantidade: inválido.
 */
export function validarCpfCnpj(valor: string): boolean {
  const bruto = valor.trim();
  if (bruto === '') return true;
  const digitos = bruto.replace(/\D/g, '');
  if (digitos.length === 11) return validarCpf(digitos);
  if (digitos.length === 14) return validarCnpj(digitos);
  return false;
}

/** Normaliza CNPJ para apenas dígitos (comparação/uso em RPC). */
export function normalizarCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, '');
}

/** Normaliza CEP para o padrão 00000-000 aceito pelo banco (VARCHAR(9)). */
export function normalizarCep(cep: string): string {
  const digitos = cep.replace(/\D/g, '');
  if (digitos.length !== 8) return cep;
  return `${digitos.slice(0, 5)}-${digitos.slice(5)}`;
}

/**
 * Schema de validação do formulário de Cliente (cadastro e edição).
 * Os campos com * são obrigatórios conforme o fluxo comercial real.
 */
export const clienteFormSchema = z
  .object({
    nomeFantasia: z.string().min(2, 'Nome fantasia é obrigatório (mín. 2 caracteres).'),
    razaoSocial: z.string().min(3, 'Razão social é obrigatória (mín. 3 caracteres).'),
    cnpj: z
      .string()
      .optional()
      .refine(
        (v) => v === undefined || v === '' || validarCpfCnpj(v),
        'CPF ou CNPJ inválido. Verifique os dígitos verificadores.'
      ),
    whatsapp: z
      .string()
      .min(8, 'WhatsApp comercial é obrigatório (mín. 8 dígitos).')
      .refine((v) => /^\d{10,13}$/.test(v.replace(/\D/g, '')), 'WhatsApp comercial inválido. Use apenas números (DDD + número).'),
    email: z.string().email('E-mail inválido. Verifique o formato.'),
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

    segmento: z.string().optional(),
    telefone: z
      .string()
      .optional()
      .refine(
        (v) => v === undefined || v === '' || /^\d{10,11}$/.test(v.replace(/\D/g, '')),
        'Telefone fixo inválido. Use apenas números (DDD + número).'
      ),
    cep: z
      .string()
      .optional()
      .refine(
        (v) => v === undefined || v === '' || /^\d{8}$/.test(v.replace(/\D/g, '')),
        'CEP inválido. Use 8 dígitos (ex.: 50720-001).'
      ),
    logradouro: z.string().optional(),
    numero: z.string().optional(),
    complemento: z.string().optional(),
    bairro: z.string().optional(),

    representanteLegal: z.string().optional(),
    cargoRepresentante: z.string().optional(),
    observacoes: z.string().optional(),

    contatoNome: z.string().optional(),
    contatoCargo: z.string().optional(),
    contatoEmail: z.string().email('E-mail do contato inválido.').optional().or(z.literal('')),
    contatoTelefone: z
      .string()
      .optional()
      .refine(
        (v) => v === undefined || v === '' || /^\d{10,13}$/.test(v.replace(/\D/g, '')),
        'Telefone do contato inválido. Use apenas números.'
      ),

    status: z.nativeEnum(StatusCliente).optional(),
  });

export type ClienteFormInput = z.infer<typeof clienteFormSchema>;

/** Schema legado de vínculo (mantido por compatibilidade). */
export const clienteSchema = z.object({
  empresaId: z.string().uuid('ID da empresa inválido'),
  representanteId: z.string().uuid('ID do representante inválido'),
  status: z.nativeEnum(StatusCliente),
});

export type ClienteSchemaInput = z.infer<typeof clienteSchema>;