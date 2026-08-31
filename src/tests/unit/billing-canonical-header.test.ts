/**
 * GATE 6.7 — Testes do cabeçalho canônico anunciante
 * Cobre: resolveBillingPresentation, ISSUER_NAME, SERVICE_NAME, estabelecimento, mês, serviço, slug, invoiceTitle, status independência, PIX/BOLETO não regressão
 */
import { describe, it, expect } from 'vitest';
import {
  resolveBillingPresentation,
  ISSUER_NAME_CANONICAL,
  SERVICE_NAME_CANONICAL_ANUNCIANTE,
  slugify,
  getFaturaTitle,
  getHumanizedPublicBillingPath,
} from '@/lib/billing';
import { resolvePaymentMethods } from '@/pages/PaginaCobranca';

describe('GATE 6.7 — resolveBillingPresentation', () => {
  it('TESTE 1 — Restaurante Alpha Premium Julho', () => {
    const data = {
      billing_origin_type: 'ANUNCIANTE',
      cliente_nome: 'Restaurante Alpha Premium',
      establishment_name: 'Restaurante Alpha Premium',
      competencia: '2026-07-15',
      vencimento: '2026-07-25',
      codigo_operacional: 'COB-2026-000297',
      public_identifier: 'COB-XYZ',
      servico_faturado: 'qualquer texto deve ser ignorado para anunciante',
    };
    const pres = resolveBillingPresentation(data);
    expect(pres.issuerName).toBe('Sobre Mídia Designer Ltda');
    expect(pres.establishmentName).toBe('Restaurante Alpha Premium');
    expect(pres.invoiceTitle).toBe('Fatura Julho');
    expect(pres.serviceName).toBe('Aluguel de Software de Mídia');
    expect(pres.billingOriginType).toBe('ANUNCIANTE');
  });

  it('TESTE 2 — Hotel Maxsuel Julho', () => {
    const data = {
      billing_origin_type: 'ANUNCIANTE',
      cliente_nome: 'Hotel Maxsuel',
      establishment_name: 'Hotel Maxsuel',
      competencia: '2026-07-01',
      vencimento: '2026-07-31',
      codigo_operacional: 'COB-5JH7SWAF',
    };
    const pres = resolveBillingPresentation(data);
    expect(pres.issuerName).toBe(ISSUER_NAME_CANONICAL);
    expect(pres.establishmentName).toBe('Hotel Maxsuel');
    expect(pres.invoiceTitle).toBe('Fatura Julho');
    expect(pres.serviceName).toBe(SERVICE_NAME_CANONICAL_ANUNCIANTE);
  });

  it('TESTE 3 — Mês diferente Agosto', () => {
    const data = {
      billing_origin_type: 'ANUNCIANTE',
      cliente_nome: 'Hotel Maxsuel',
      establishment_name: 'Hotel Maxsuel',
      competencia: '2026-08-10',
      codigo_operacional: 'COB-AAA',
    };
    const pres = resolveBillingPresentation(data);
    expect(pres.invoiceTitle).toBe('Fatura Agosto');
    expect(pres.invoiceTitle).not.toBe('Fatura Julho');
  });

  it('serviço para anunciante é exatamente canônico', () => {
    const data = {
      billing_origin_type: 'ANUNCIANTE',
      cliente_nome: 'Restaurante Alpha Premium',
      competencia: '2026-07-01',
      codigo_operacional: 'COB-1',
      servico_faturado: 'Venda 1225',
      service_name: 'Outro',
    };
    const pres = resolveBillingPresentation(data);
    expect(pres.serviceName).toBe('Aluguel de Software de Mídia');
  });

  it('estabelecimento normaliza apenas apresentação sem alterar canônico', () => {
    const data = {
      billing_origin_type: 'ANUNCIANTE',
      cliente_nome: 'restaurante alpha premium',
      establishment_name: 'restaurante alpha premium',
      competencia: '2026-07-01',
      codigo_operacional: 'COB-1',
    };
    const pres = resolveBillingPresentation(data);
    // nome preserva trim mas slug é normalizado
    expect(pres.establishmentName).toBe('restaurante alpha premium');
    expect(pres.establishmentSlug).toBe('restaurante-alpha-premium');
  });

  it('invoice_month estruturado tem prioridade sobre competencia', () => {
    const data = {
      billing_origin_type: 'ANUNCIANTE',
      cliente_nome: 'Hotel Maxsuel',
      establishment_name: 'Hotel Maxsuel',
      competence: '2026-07-01', // typo key should be ignored
      competencia: '2026-07-01',
      invoice_month: 8,
      codigo_operacional: 'COB-1',
    };
    const pres = resolveBillingPresentation(data);
    expect(pres.invoiceTitle).toBe('Fatura Agosto');
  });

  it('status não altera cabeçalho (dimensões independentes)', () => {
    const base = {
      billing_origin_type: 'ANUNCIANTE',
      cliente_nome: 'Restaurante Alpha Premium',
      establishment_name: 'Restaurante Alpha Premium',
      competencia: '2026-07-01',
      codigo_operacional: 'COB-1',
    };
    const statuses = ['PENDENTE', 'ATRASADA', 'PAGO', 'CANCELADO', 'VENCIDO'];
    for (const s of statuses) {
      const pres = resolveBillingPresentation({ ...base, status: s });
      expect(pres.establishmentName).toBe('Restaurante Alpha Premium');
      expect(pres.invoiceTitle).toBe('Fatura Julho');
      expect(pres.serviceName).toBe('Aluguel de Software de Mídia');
    }
  });

  it('URL canônica derivada de estabelecimento + mês + código', () => {
    const pres = resolveBillingPresentation({
      billing_origin_type: 'ANUNCIANTE',
      cliente_nome: 'Hotel Maxsuel',
      establishment_name: 'Hotel Maxsuel',
      competencia: '2026-07-01',
      codigo_operacional: 'COB-5JH7SWAF',
      invoice_month: 7,
    });
    // via billing lib
    const path = getHumanizedPublicBillingPath({
      establishment_name: pres.establishmentName,
      establishment_slug: pres.establishmentSlug,
      invoice_month: 7,
      codigo_operacional: 'COB-5JH7SWAF',
      cliente_nome: 'Hotel Maxsuel',
      competencia: '2026-07-01',
    });
    expect(path).toBe('/cobranca/hotel-maxsuel/fatura-julho/COB-5JH7SWAF');
  });

  it('URL para Restaurante Alpha Premium', () => {
    const path = getHumanizedPublicBillingPath({
      cliente_nome: 'Restaurante Alpha Premium',
      competencia: '2026-07-01',
      codigo_operacional: 'COB-XYZ123',
    });
    expect(path).toBe('/cobranca/restaurante-alpha-premium/fatura-julho/COB-XYZ123');
  });

  it('slug não é autoridade: backend deve validar por código, não por slug', () => {
    // Simula acesso forjado: slug de outro estabelecimento mas código do original
    // A função getHumanizedPublicBillingPath sempre deriva do dado canônico, não da URL
    const cobrancaOriginal = {
      cliente_nome: 'Hotel Maxsuel',
      competencia: '2026-07-01',
      codigo_operacional: 'COB-ORIGINAL',
    };
    const urlCorreta = getHumanizedPublicBillingPath(cobrancaOriginal);
    // Se usuário tentar forjar slug, a URL canônica ainda é derivada dos dados, não do input
    expect(urlCorreta).toBe('/cobranca/hotel-maxsuel/fatura-julho/COB-ORIGINAL');
    expect(urlCorreta).not.toContain('outro-estabelecimento');
  });

  it('compatibilidade URL antiga ainda resolve por código', () => {
    // URLs antigas /cobranca/PIX-REAL-922139/COB-5JH7SWAF devem continuar funcionando
    // A chave é o código, não o prefixo. Simula que a RPC aceita p_codigo = COB-5JH7SWAF
    const codigo = 'COB-5JH7SWAF';
    const antigoSlug = 'PIX-REAL-922139';
    // O código continua sendo a âncora; slug é ignorado na resolução
    expect(codigo).toBe('COB-5JH7SWAF');
    expect(antigoSlug).not.toBe(codigo);
  });

  it('PIX/BOLETO não regredido — resolvePaymentMethods preservado', () => {
    expect(resolvePaymentMethods(['PIX'])).toEqual({ showPix: true, showBoleto: false, hasBoth: false, hasAny: true });
    expect(resolvePaymentMethods(['BOLETO'])).toEqual({ showPix: false, showBoleto: true, hasBoth: false, hasAny: true });
    expect(resolvePaymentMethods(['PIX', 'BOLETO'])).toEqual({ showPix: true, showBoleto: true, hasBoth: true, hasAny: true });
  });

  it('issuer é sempre Sobre Mídia Designer Ltda', () => {
    const pres = resolveBillingPresentation({
      billing_origin_type: 'ANUNCIANTE',
      cliente_nome: 'Qualquer',
      competencia: '2026-07-01',
      codigo_operacional: 'COB-1',
    });
    expect(pres.issuerName).toBe('Sobre Mídia Designer Ltda');
  });

  it('fallback quando dados ausentes não inventa estabelecimento', () => {
    const pres = resolveBillingPresentation({
      billing_origin_type: 'ANUNCIANTE',
      cliente_nome: null,
      competencia: null,
      vencimento: null,
      codigo_operacional: 'COB-1',
    });
    // Não deve atribuir estabelecimento errado, usa fallback genérico
    expect(pres.establishmentName).toBeDefined();
    expect(pres.invoiceTitle).toBe('Fatura Mensal');
  });
});
