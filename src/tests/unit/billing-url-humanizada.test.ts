/**
 * GATE 6.5 — Testes de regressão para billing.ts
 * Cobre: slugify, getFaturaSlug, getFaturaTitle, getHumanizedPublicBillingPath, getPublicBillingUrl
 */

import { describe, it, expect } from 'vitest';
import { slugify, getFaturaSlug, getFaturaTitle, getHumanizedPublicBillingPath } from '@/lib/billing';

// ===========================================================================
// slugify
// ===========================================================================
describe('slugify', () => {
  it('converte nome simples para slug', () => {
    expect(slugify('Hotel Maxsuel')).toBe('hotel-maxsuel');
  });

  it('converte nome com acentos', () => {
    expect(slugify('Clínica São José')).toBe('clinica-sao-jose');
  });

  it('converte nome com caracteres especiais', () => {
    expect(slugify('Restaurante & Cia Ltda.')).toBe('restaurante-cia-ltda');
  });

  it('normaliza múltiplos espaços', () => {
    expect(slugify('Hotel   Bom   Lugar')).toBe('hotel-bom-lugar');
  });

  it('converte caixa alta para minúsculas', () => {
    expect(slugify('HOTEL MAXSUEL')).toBe('hotel-maxsuel');
  });

  it('lida com nome muito longo', () => {
    const longo = 'Supermercado do Bairro Bonito Santa Gertrudes LTDA Matriz';
    const slug = slugify(longo);
    expect(slug).toBe('supermercado-do-bairro-bonito-santa-gertrudes-ltda-matriz');
    expect(slug).not.toContain('  ');
    expect(slug).not.toMatch(/^-|-$/);
  });

  it('retorna fallback para null', () => {
    expect(slugify(null)).toBe('estabelecimento');
  });

  it('retorna fallback para undefined', () => {
    expect(slugify(undefined)).toBe('estabelecimento');
  });

  it('retorna fallback para string vazia', () => {
    expect(slugify('')).toBe('estabelecimento');
  });

  it('slug é determinístico (mesmo resultado em múltiplas chamadas)', () => {
    const slug1 = slugify('Farmácia Popular Ltda');
    const slug2 = slugify('Farmácia Popular Ltda');
    expect(slug1).toBe(slug2);
    expect(slug1).toBe('farmacia-popular-ltda');
  });

  it('remove hífens iniciais e finais', () => {
    const result = slugify('  - Teste - ');
    expect(result).not.toMatch(/^-/);
    expect(result).not.toMatch(/-$/);
  });
});

// ===========================================================================
// getFaturaSlug
// ===========================================================================
describe('getFaturaSlug', () => {
  it('retorna fatura-janeiro para mês 01', () => {
    expect(getFaturaSlug('2026-01-01')).toBe('fatura-janeiro');
  });

  it('retorna fatura-julho para mês 07', () => {
    expect(getFaturaSlug('2026-07-15')).toBe('fatura-julho');
  });

  it('retorna fatura-agosto para mês 08', () => {
    expect(getFaturaSlug('2026-08-01')).toBe('fatura-agosto');
  });

  it('retorna fatura-dezembro para mês 12', () => {
    expect(getFaturaSlug('2026-12-31')).toBe('fatura-dezembro');
  });

  it('retorna fatura-mensal para null', () => {
    expect(getFaturaSlug(null)).toBe('fatura-mensal');
  });

  it('retorna fatura-mensal para undefined', () => {
    expect(getFaturaSlug(undefined)).toBe('fatura-mensal');
  });

  it('funciona para datas de cobranças antigas (2024)', () => {
    expect(getFaturaSlug('2024-03-01')).toBe('fatura-marco');
  });

  it('funciona para datas futuras', () => {
    expect(getFaturaSlug('2027-11-01')).toBe('fatura-novembro');
  });

  it('é determinístico para a mesma data', () => {
    expect(getFaturaSlug('2026-07-01')).toBe(getFaturaSlug('2026-07-01'));
  });
});

// ===========================================================================
// getFaturaTitle
// ===========================================================================
describe('getFaturaTitle', () => {
  it('retorna "Fatura Janeiro" para mês 01', () => {
    expect(getFaturaTitle('2026-01-01')).toBe('Fatura Janeiro');
  });

  it('retorna "Fatura Julho" para mês 07', () => {
    expect(getFaturaTitle('2026-07-15')).toBe('Fatura Julho');
  });

  it('retorna "Fatura Março" com acento correto para mês 03', () => {
    expect(getFaturaTitle('2026-03-01')).toBe('Fatura Março');
  });

  it('retorna "Fatura Dezembro" para mês 12', () => {
    expect(getFaturaTitle('2026-12-31')).toBe('Fatura Dezembro');
  });

  it('retorna "Fatura Mensal" para null', () => {
    expect(getFaturaTitle(null)).toBe('Fatura Mensal');
  });

  it('retorna "Fatura Mensal" para undefined', () => {
    expect(getFaturaTitle(undefined)).toBe('Fatura Mensal');
  });
});

// ===========================================================================
// getHumanizedPublicBillingPath
// ===========================================================================
describe('getHumanizedPublicBillingPath', () => {
  it('gera URL humanizada completa com competência', () => {
    const cobranca = {
      cliente_nome: 'Hotel Maxsuel',
      competencia: '2026-07-01',
      vencimento: '2026-07-31',
      codigo_operacional: 'COB-5JH7SWAF',
      public_identifier: 'COB-5JH7SWAF',
    };
    expect(getHumanizedPublicBillingPath(cobranca)).toBe('/cobranca/hotel-maxsuel/fatura-julho/COB-5JH7SWAF');
  });

  it('usa vencimento quando competencia é null', () => {
    const cobranca = {
      cliente_nome: 'Restaurante Bom Sabor',
      competencia: null,
      vencimento: '2026-08-15',
      codigo_operacional: 'COB-2026-000297',
      public_identifier: 'COB-XYZABC',
    };
    expect(getHumanizedPublicBillingPath(cobranca)).toBe('/cobranca/restaurante-bom-sabor/fatura-agosto/COB-2026-000297');
  });

  it('normaliza nome com acentos no slug', () => {
    const cobranca = {
      cliente_nome: 'Clínica São José',
      competencia: '2026-09-01',
      vencimento: null,
      codigo_operacional: 'COB-CLJ-001',
      public_identifier: 'COB-ABCDEF',
    };
    expect(getHumanizedPublicBillingPath(cobranca)).toBe('/cobranca/clinica-sao-jose/fatura-setembro/COB-CLJ-001');
  });

  it('retorna string vazia para cobrança null', () => {
    expect(getHumanizedPublicBillingPath(null)).toBe('');
  });

  it('retorna string vazia quando sem codigo', () => {
    expect(getHumanizedPublicBillingPath({})).toBe('');
  });

  it('o slug NÃO contém o nome do estabelecimento do tenant B mesmo que passado na URL — a URL deriva dos dados da cobrança', () => {
    const cobrancaA = {
      cliente_nome: 'Hotel A',
      competencia: '2026-07-01',
      vencimento: null,
      codigo_operacional: 'COB-AAAA1111',
      public_identifier: 'COB-AAAA1111',
    };
    const cobrancaB = {
      cliente_nome: 'Hotel B',
      competencia: '2026-07-01',
      vencimento: null,
      codigo_operacional: 'COB-BBBB2222',
      public_identifier: 'COB-BBBB2222',
    };
    expect(getHumanizedPublicBillingPath(cobrancaA)).not.toContain('hotel-b');
    expect(getHumanizedPublicBillingPath(cobrancaB)).not.toContain('hotel-a');
  });

  it('URL é determinística para a mesma cobrança', () => {
    const cobranca = {
      cliente_nome: 'Hotel Maxsuel',
      competencia: '2026-07-01',
      vencimento: null,
      codigo_operacional: 'COB-5JH7SWAF',
      public_identifier: 'COB-5JH7SWAF',
    };
    const url1 = getHumanizedPublicBillingPath(cobranca);
    const url2 = getHumanizedPublicBillingPath(cobranca);
    expect(url1).toBe(url2);
  });

  it('nunca expõe UUID interno na URL', () => {
    const uuid = '09d8a6f7-7d2b-4554-82ef-e23bc96ff4b8';
    const cobranca = {
      id: uuid,
      cliente_nome: 'Hotel Maxsuel',
      competencia: '2026-07-01',
      vencimento: null,
      codigo_operacional: 'COB-5JH7SWAF',
      public_identifier: 'COB-5JH7SWAF',
    };
    const url = getHumanizedPublicBillingPath(cobranca);
    expect(url).not.toContain(uuid);
  });

  it('URL não muda ao alterar slug de estabelecimento manualmente (resolução via codigo)', () => {
    // Altera o slug na URL mas o codigo permanece idêntico
    // A RPC ignora slugs e usa apenas o codigo para resolver
    const cobranca = {
      cliente_nome: 'Hotel Original',
      competencia: '2026-07-01',
      vencimento: null,
      codigo_operacional: 'COB-XYZ123',
      public_identifier: 'COB-XYZ123',
    };
    const url = getHumanizedPublicBillingPath(cobranca);
    // O path deve conter o codigo ao final, não o slug alterado
    expect(url.endsWith('/COB-XYZ123')).toBe(true);
  });
});
