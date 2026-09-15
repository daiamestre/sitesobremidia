import { describe, it, expect } from 'vitest';
import {
  empresaSchema,
  normalizarEmpresaInput,
  type EmpresaSchemaInput
} from '@/modules/crm/validators/empresa.validator';
import { UFS_VALIDAS } from '@/modules/crm/validators/cliente.validator';

const baseEmpresa: EmpresaSchemaInput = {
  nomeFantasia: 'Empresa Alpha',
  razaoSocial: 'Empresa Alpha Tecnologia LTDA',
  cnpj: '11.222.333/0001-81',
  whatsapp: '(11) 98765-4321',
  email: 'contato@alphatech.com.br',
  cidade: 'Recife',
  estado: 'PE',
  segmento: 'Tecnologia',
  telefone: '(81) 3456-7890',
  cep: '50000-000',
  logradouro: 'Av. Agamenon Magalhães',
  numero: '1234',
  bairro: 'Boa Vista',
  representanteLegal: 'Carlos Silva',
  cargoRepresentante: 'Diretor',
  observacoes: 'Cliente estratégico',
};

describe('empresaSchema — Validação canônica do cadastro de empresa no CRM', () => {
  it('aceita empresa com dados completos e válidos', () => {
    const parsed = empresaSchema.safeParse(baseEmpresa);
    expect(parsed.success).toBe(true);
  });

  it('rejeita CNPJ com dígitos verificadores incorretos', () => {
    const parsed = empresaSchema.safeParse({ ...baseEmpresa, cnpj: '11.222.333/0001-82' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path[0] === 'cnpj')).toBe(true);
    }
  });

  it('rejeita CNPJ com todos os dígitos iguais', () => {
    const parsed = empresaSchema.safeParse({ ...baseEmpresa, cnpj: '11.111.111/1111-11' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path[0] === 'cnpj')).toBe(true);
    }
  });

  it('aceita CNPJ válido com apenas dígitos numéricos', () => {
    const parsed = empresaSchema.safeParse({ ...baseEmpresa, cnpj: '11222333000181' });
    expect(parsed.success).toBe(true);
  });

  it('rejeita UF inválida (ex: nome por extenso)', () => {
    const parsed = empresaSchema.safeParse({ ...baseEmpresa, estado: 'Pernambuco' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path[0] === 'estado')).toBe(true);
    }
  });

  it('aceita UF oficial em minúsculas e transforma para maiúsculas', () => {
    const parsed = empresaSchema.safeParse({ ...baseEmpresa, estado: 'pe' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.estado).toBe('PE');
    }
  });

  it('rejeita CEP com formato inválido', () => {
    const parsed = empresaSchema.safeParse({ ...baseEmpresa, cep: '1234' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path[0] === 'cep')).toBe(true);
    }
  });

  it('aceita CEP válido formatado ou sem traço', () => {
    const parsed1 = empresaSchema.safeParse({ ...baseEmpresa, cep: '50720-001' });
    expect(parsed1.success).toBe(true);
    const parsed2 = empresaSchema.safeParse({ ...baseEmpresa, cep: '50720001' });
    expect(parsed2.success).toBe(true);
  });

  it('rejeita WhatsApp com menos de 10 dígitos', () => {
    const parsed = empresaSchema.safeParse({ ...baseEmpresa, whatsapp: '9999-8888' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path[0] === 'whatsapp')).toBe(true);
    }
  });

  it('rejeita e-mail inválido', () => {
    const parsed = empresaSchema.safeParse({ ...baseEmpresa, email: 'nao-e-email' });
    expect(parsed.success).toBe(false);
  });

  it('normalizarEmpresaInput normaliza CNPJ, CEP e Estado', () => {
    const normalized = normalizarEmpresaInput({
      cnpj: '11.222.333/0001-81',
      cep: '50720001',
      estado: 'pe'
    });
    expect(normalized.cnpj).toBe('11222333000181');
    expect(normalized.cep).toBe('50720-001');
    expect(normalized.estado).toBe('PE');
  });

  it('garante compatibilidade e reutilização com UFS_VALIDAS de cliente.validator.ts', () => {
    expect(UFS_VALIDAS.length).toBe(27);
    expect(UFS_VALIDAS).toContain('PE');
    expect(UFS_VALIDAS).toContain('SP');
  });
});
