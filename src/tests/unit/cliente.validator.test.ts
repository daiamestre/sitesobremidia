import { describe, it, expect } from 'vitest';
import {
  clienteFormSchema,
  validarCnpj,
  validarCpf,
  validarCpfCnpj,
  normalizarCnpj,
  normalizarCep,
  UFS_VALIDAS,
} from '@/modules/crm/validators/cliente.validator';

const baseForm = {
  nomeFantasia: 'Empresa Teste',
  razaoSocial: 'Empresa Teste LTDA',
  cnpj: '11.222.333/0001-81',
  whatsapp: '(11) 99999-8888',
  email: 'contato@empresa.com',
  cidade: 'São Paulo',
  estado: 'SP',
  segmento: 'Varejo',
  telefone: '',
  cep: '01310-100',
  logradouro: 'Av. Paulista',
  numero: '1000',
  complemento: 'Sala 04',
  bairro: 'Bela Vista',
  representanteLegal: 'João da Silva',
  cargoRepresentante: 'Sócio-Administrador',
  observacoes: '',
  contatoNome: 'Carlos Roberto',
  contatoCargo: 'Gerente',
  contatoEmail: 'carlos@empresa.com',
  contatoTelefone: '(11) 98888-7777',
  status: 'PROSPECT',
};

describe('clienteFormSchema — validação real do cadastro de cliente', () => {
  it('aceita um formulário completo e válido', () => {
    const parsed = clienteFormSchema.safeParse(baseForm);
    expect(parsed.success).toBe(true);
  });

  it('rejeita CNPJ com dígitos verificadores inválidos', () => {
    const parsed = clienteFormSchema.safeParse({ ...baseForm, cnpj: '11.222.333/0001-82' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path[0] === 'cnpj')).toBe(true);
    }
  });

  it('rejeita CNPJ com menos de 14 dígitos', () => {
    expect(validarCnpj('00.000.000/0000-00')).toBe(false);
    expect(validarCnpj('123')).toBe(false);
  });

  it('rejeita CNPJ com dígitos todos iguais', () => {
    expect(validarCnpj('11.111.111/1111-11')).toBe(false);
  });

  it('aceita CNPJ válido formatado ou apenas dígitos', () => {
    expect(validarCnpj('11.222.333/0001-81')).toBe(true);
    expect(validarCnpj('11222333000181')).toBe(true);
  });

  it('rejeita UF fora da lista oficial (nunca aceita "Pernambuco")', () => {
    const parsed = clienteFormSchema.safeParse({ ...baseForm, estado: 'Pernambuco' });
    expect(parsed.success).toBe(false);
  });

  it('aceita apenas UFs da lista oficial', () => {
    expect(UFS_VALIDAS).toContain('PE');
    expect(UFS_VALIDAS).toContain('SP');
    expect(UFS_VALIDAS).toHaveLength(27);
    const parsed = clienteFormSchema.safeParse({ ...baseForm, estado: 'pe' });
    expect(parsed.success).toBe(true);
  });

  it('rejeita e-mail corporativo inválido', () => {
    const parsed = clienteFormSchema.safeParse({ ...baseForm, email: 'nao-e-email' });
    expect(parsed.success).toBe(false);
  });

  it('rejeita WhatsApp com menos de 8 dígitos', () => {
    const parsed = clienteFormSchema.safeParse({ ...baseForm, whatsapp: '9999' });
    expect(parsed.success).toBe(false);
  });

  it('rejeita CEP com quantidade de dígitos incorreta', () => {
    const parsed = clienteFormSchema.safeParse({ ...baseForm, cep: '12345' });
    expect(parsed.success).toBe(false);
  });

  it('rejeita telefone fixo com menos de 10 dígitos', () => {
    const parsed = clienteFormSchema.safeParse({ ...baseForm, telefone: '(81) 3222' });
    expect(parsed.success).toBe(false);
  });

  it('rejeita nome fantasia vazio (obrigatório)', () => {
    const parsed = clienteFormSchema.safeParse({ ...baseForm, nomeFantasia: '' });
    expect(parsed.success).toBe(false);
  });

  it('normaliza CNPJ para apenas dígitos', () => {
    expect(normalizarCnpj('11.222.333/0001-81')).toBe('11222333000181');
  });

  it('normaliza CEP para o padrão 00000-000 do banco', () => {
    expect(normalizarCep('01310100')).toBe('01310-100');
    expect(normalizarCep('01310-100')).toBe('01310-100');
  });
});

describe('CNPJ/CPF opcional — campo de documento do cliente', () => {
  it('CPF VÁLIDO -> PASS (formatado ou apenas dígitos)', () => {
    expect(validarCpf('529.982.247-25')).toBe(true);
    expect(validarCpf('52998224725')).toBe(true);
    const parsed = clienteFormSchema.safeParse({ ...baseForm, cnpj: '529.982.247-25' });
    expect(parsed.success).toBe(true);
  });

  it('CPF INVÁLIDO -> FAIL (dígitos verificadores errados)', () => {
    expect(validarCpf('529.982.247-26')).toBe(false);
    const parsed = clienteFormSchema.safeParse({ ...baseForm, cnpj: '529.982.247-26' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path[0] === 'cnpj')).toBe(true);
    }
  });

  it('CPF com dígitos todos iguais -> FAIL', () => {
    expect(validarCpf('111.111.111-11')).toBe(false);
  });

  it('CNPJ VÁLIDO -> PASS (regressão)', () => {
    expect(validarCpfCnpj('11.222.333/0001-81')).toBe(true);
    expect(validarCnpj('11.222.333/0001-81')).toBe(true);
    const parsed = clienteFormSchema.safeParse({ ...baseForm, cnpj: '11.222.333/0001-81' });
    expect(parsed.success).toBe(true);
  });

  it('CNPJ INVÁLIDO -> FAIL (regressão)', () => {
    expect(validarCpfCnpj('11.222.333/0001-82')).toBe(false);
    expect(validarCnpj('11.222.333/0001-82')).toBe(false);
  });

  it('SEM DOCUMENTO -> PASS (campo opcional: vazio ou ausente)', () => {
    const semDocVazio = clienteFormSchema.safeParse({ ...baseForm, cnpj: '' });
    expect(semDocVazio.success).toBe(true);
    const semDocUndefined = clienteFormSchema.safeParse({ ...baseForm, cnpj: undefined });
    expect(semDocUndefined.success).toBe(true);
    expect(validarCpfCnpj('')).toBe(true);
  });

  it('FORMATO INVÁLIDO -> FAIL (12 dígitos ou letras)', () => {
    const parsed = clienteFormSchema.safeParse({ ...baseForm, cnpj: '12.345.678/90-1' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path[0] === 'cnpj')).toBe(true);
    }
    expect(validarCpfCnpj('abc')).toBe(false);
    expect(validarCpfCnpj('123456789012')).toBe(false);
  });

  it('validarCpfCnpj roteia por quantidade de dígitos (0/11/14)', () => {
    expect(validarCpfCnpj('52998224725')).toBe(true);
    expect(validarCpfCnpj('11222333000181')).toBe(true);
    expect(validarCpfCnpj('111.111.111-11')).toBe(false);
    expect(validarCpfCnpj('11.111.111/1111-11')).toBe(false);
  });

  it('REGRESSÃO: documento opcional não enfraquece os demais obrigatórios', () => {
    const parsed = clienteFormSchema.safeParse({
      ...baseForm,
      cnpj: '',
      nomeFantasia: '',
      email: 'nao-e-email',
      whatsapp: '9999',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const campos = parsed.error.issues.map((i) => String(i.path[0]));
      expect(campos).toContain('nomeFantasia');
      expect(campos).toContain('email');
      expect(campos).toContain('whatsapp');
      expect(campos).not.toContain('cnpj');
    }
  });
});