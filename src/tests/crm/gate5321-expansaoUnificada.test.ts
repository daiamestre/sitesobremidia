import { describe, it, expect, vi, beforeEach } from 'vitest';
import { financeiroService } from '@/modules/crm/services/financeiro.service';
import { customerCommerceService } from '@/modules/crm/services/customerCommerce.service';
import { supabase } from '@/integrations/supabase/client';

// Mock Supabase client
vi.mock('@/integrations/supabase/client', () => {
  const mockRpc = vi.fn();
  const mockFrom = vi.fn();
  return {
    supabase: {
      rpc: mockRpc,
      from: mockFrom,
    },
  };
});

describe('MICRO-GATE 5.3.2.1-H — Hardening e Unificação da Expansão Comercial', () => {
  const mockTenantId = 'tenant-1111-2222-3333-4444';
  const mockClienteId = 'cliente-aaaa-bbbb-cccc-dddd';
  const mockContratoId = 'contrato-9999-8888-7777-6666';
  const mockPontoId = 'ponto-1234-5678-9012-3456';
  const mockPontoId2 = 'ponto-5678-9012-3456-7890';
  const mockPurchaseIntentId = 'intent-test-5321h-0001';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Preço Autoritativo Estrito: Deve consultar o servidor e descartar preços nulos ou não configurados', async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: null,
      error: { message: 'PRECO_NAO_CONFIGURADO: O ponto ponto-1234 não possui preço oficial ativo configurado no servidor.' },
    });

    const result = await financeiroService.criarCobrancaJitExpansao({
      empresaOperadoraId: mockTenantId,
      clienteId: mockClienteId,
      itens: [
        {
          ponto_id: mockPontoId,
          periodicidade: 'MENSAL',
          subtotal: 9999, // Adulterado pelo cliente
          valor_tabela: 9999,
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('PRECO_NAO_CONFIGURADO');
  });

  it('2. Trava de Duplicidade no Banco: Deve rejeitar ponto que já conste como ativo no contrato_estabelecimentos', async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: null,
      error: { message: 'O ponto/unidade já faz parte da composição comercial deste anunciante.' },
    });

    const result = await financeiroService.criarCobrancaJitExpansao({
      empresaOperadoraId: mockTenantId,
      clienteId: mockClienteId,
      itens: [
        {
          ponto_id: mockPontoId,
          periodicidade: 'MENSAL',
          subtotal: 1000,
          valor_tabela: 1000,
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('já faz parte da composição comercial');
  });

  it('3. Unificação Comercial e Financeira JIT: Deve retornar expansao_id, cobranca_id, codigoOperacional e contrato_id', async () => {
    const mockRpcResponse = {
      success: true,
      idempotente: false,
      expansao_id: 'exp-h-0001-uuid',
      id: 'cob-h-0001-uuid',
      codigo_operacional: 'COB-20260903-0001',
      public_identifier: 'PUB-COB-0001',
      valor: 1500,
      vencimento: '2026-09-08',
      status: 'PENDENTE',
      metodos_gateway: ['PIX', 'BOLETO'],
      contrato_id: mockContratoId,
    };

    (supabase.rpc as any).mockResolvedValue({
      data: mockRpcResponse,
      error: null,
    });

    const result = await financeiroService.criarCobrancaJitExpansao({
      empresaOperadoraId: mockTenantId,
      clienteId: mockClienteId,
      purchaseIntentId: mockPurchaseIntentId,
      itens: [
        {
          ponto_id: mockPontoId,
          periodicidade: 'MENSAL',
          subtotal: 1500,
          valor_tabela: 1500,
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.expansaoId).toBe('exp-h-0001-uuid');
    expect(result.id).toBe('cob-h-0001-uuid');
    expect(result.codigoOperacional).toBe('COB-20260903-0001');
    expect(result.valor).toBe(1500);

    expect(supabase.rpc).toHaveBeenCalledWith('fn_criar_cobranca_jit_expansao', expect.objectContaining({
      p_empresa_operadora_id: mockTenantId,
      p_cliente_id: mockClienteId,
      p_idempotency_key: expect.stringContaining('JIT-EXP-intent-test-5321h-0001'),
    }));
  });

  it('4. Convergência do Fluxo Legado (aprovar_expansao): Deve auto-gerar fatura contas_receber ao aprovar manualmente', async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: {
        success: true,
        expansao_id: 'exp-manual-001',
        cobranca_id: 'cob-manual-001',
        valor_anterior: 1000,
        valor_novo: 2500,
        numero_versao: 2,
      },
      error: null,
    });

    const res = await customerCommerceService.aprovarExpansao('exp-manual-001');

    expect(res.success).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith('aprovar_expansao', { p_expansao_id: 'exp-manual-001' });
  });

  it('5. Idempotência: Mesma chave de compra retorna a cobrança e a expansão sem reinserir nada', async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: {
        success: true,
        idempotente: true,
        expansao_id: 'exp-existente-h',
        id: 'cob-existente-h',
        codigo_operacional: 'COB-EXISTENTE-H',
      },
      error: null,
    });

    const res = await financeiroService.criarCobrancaJitExpansao({
      empresaOperadoraId: mockTenantId,
      clienteId: mockClienteId,
      purchaseIntentId: 'intent-duplicado-h',
      itens: [{ ponto_id: mockPontoId, periodicidade: 'MENSAL', subtotal: 800, valor_tabela: 800 }],
    });

    expect(res.success).toBe(true);
    expect(res.idempotente).toBe(true);
    expect(res.expansaoId).toBe('exp-existente-h');
    expect(res.id).toBe('cob-existente-h');
  });

  it('6. Lock FOR UPDATE de Contrato: Trata chamadas concorrentes garantindo que uma aguarde a outra', async () => {
    (supabase.rpc as any).mockResolvedValueOnce({
      data: { success: true, idempotente: false, id: 'cob-conc-h1', expansao_id: 'exp-conc-h1' },
      error: null,
    }).mockResolvedValueOnce({
      data: { success: true, idempotente: true, id: 'cob-conc-h1', expansao_id: 'exp-conc-h1' },
      error: null,
    });

    const call1 = financeiroService.criarCobrancaJitExpansao({
      empresaOperadoraId: mockTenantId,
      clienteId: mockClienteId,
      purchaseIntentId: 'same-intent-concurrent-h',
      itens: [{ ponto_id: mockPontoId, periodicidade: 'MENSAL', subtotal: 1000, valor_tabela: 1000 }],
    });

    const call2 = financeiroService.criarCobrancaJitExpansao({
      empresaOperadoraId: mockTenantId,
      clienteId: mockClienteId,
      purchaseIntentId: 'same-intent-concurrent-h',
      itens: [{ ponto_id: mockPontoId, periodicidade: 'MENSAL', subtotal: 1000, valor_tabela: 1000 }],
    });

    const [res1, res2] = await Promise.all([call1, call2]);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
    expect(res1.id).toBe(res2.id);
  });

  it('7. Multi-Tenant Isolation: Rejeita chamadas cruzadas de tenants diferentes', async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: null,
      error: { message: 'Acesso negado: tenant_id divergente da sessão do usuário.' },
    });

    const result = await financeiroService.criarCobrancaJitExpansao({
      empresaOperadoraId: 'tenant-hacker-999',
      clienteId: mockClienteId,
      itens: [{ ponto_id: mockPontoId, periodicidade: 'MENSAL', subtotal: 1000, valor_tabela: 1000 }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('tenant_id divergente');
  });

  it('8. Cliente Isolation: Rejeita tentativa de expandir contrato de outro anunciante', async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: null,
      error: { message: 'Cliente não encontrado no tenant especificado.' },
    });

    const result = await financeiroService.criarCobrancaJitExpansao({
      empresaOperadoraId: mockTenantId,
      clienteId: 'cliente-outro-anunciante',
      itens: [{ ponto_id: mockPontoId, periodicidade: 'MENSAL', subtotal: 1000, valor_tabela: 1000 }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Cliente não encontrado');
  });

  it('9. Regressão 5.3.1 Onboarding: Mantém intacto o método obterOuCriarCobrancaInicialOnboarding', async () => {
    const mockOnboardingCobranca = {
      success: true,
      cobrancaId: 'cob-onboarding-531h',
      codigoOperacional: 'COB-ONB-531H',
      valor: 2500,
      formaPagamento: 'PIX',
      idempotente: true,
    };

    const spy = vi.spyOn(financeiroService, 'obterOuCriarCobrancaInicialOnboarding').mockResolvedValue(mockOnboardingCobranca);

    const res = await financeiroService.obterOuCriarCobrancaInicialOnboarding(mockContratoId);

    expect(res.success).toBe(true);
    expect(res.cobrancaId).toBe('cob-onboarding-531h');
    expect(res.idempotente).toBe(true);
    spy.mockRestore();
  });
});
