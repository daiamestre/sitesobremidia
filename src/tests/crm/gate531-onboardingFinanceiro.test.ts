import { describe, it, expect, vi, beforeEach } from 'vitest';
import { financeiroService } from '@/modules/crm/services/financeiro.service';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

describe('MICRO-GATE 5.3.1 — ACOPLAMENTO FINANCEIRO DO ONBOARDING SELF-SERVICE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TESTE 1 — [Fluxo Feliz] obterOuCriarCobrancaInicialOnboarding cria cobrança vinculada ao contrato assinado', async () => {
    const mockContrato = {
      id: 'ctr-onboarding-1',
      empresa_operadora_id: 'tenant-123',
      cliente_id: 'cli-456',
      numero_contrato: 'CT-2026-0001',
      valor_mensal: 450.0,
      forma_pagamento: 'PIX',
      status_documento: 'ASSINADO',
      status_workflow: 'ASSINADO',
    };

    const mockEstabelecimentos = [
      { valor_unitario: 150.0, quantidade_telas: 1 },
      { valor_unitario: 300.0, quantidade_telas: 1 },
    ];

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'contratos') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockContrato, error: null }),
            }),
          }),
        };
      }
      if (table === 'contas_receber') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'cob-123' }, error: null }),
            }),
          }),
        };
      }
      if (table === 'contrato_estabelecimentos') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: mockEstabelecimentos, error: null }),
          }),
        };
      }
      return {};
    });

    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'REC-2026-000001', error: null } as any);
    vi.mocked(supabase.from).mockImplementation(mockFrom as any);

    const res = await financeiroService.obterOuCriarCobrancaInicialOnboarding('ctr-onboarding-1');

    expect(res.success).toBe(true);
    expect(res.cobrancaId).toBe('cob-123');
    expect(res.valor).toBe(450.0);
    expect(res.idempotente).toBe(false);
  });

  it('TESTE 2 — [PIX] Cobrança inicial com contrato PIX configura metodosGateway adequadamente', async () => {
    const mockContrato = {
      id: 'ctr-pix-1',
      empresa_operadora_id: 'tenant-123',
      cliente_id: 'cli-456',
      numero_contrato: 'CT-2026-PIX',
      valor_mensal: 300.0,
      forma_pagamento: 'PIX',
    };

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'contratos') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockContrato, error: null }),
            }),
          }),
        };
      }
      if (table === 'contas_receber') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockImplementation((payload: any) => {
            expect(payload.metodos_gateway).toContain('PIX');
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'cob-pix-123' }, error: null }),
              }),
            };
          }),
        };
      }
      if (table === 'contrato_estabelecimentos') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      return {};
    });

    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'REC-2026-PIX01', error: null } as any);
    vi.mocked(supabase.from).mockImplementation(mockFrom as any);

    const res = await financeiroService.obterOuCriarCobrancaInicialOnboarding('ctr-pix-1');
    expect(res.success).toBe(true);
    expect(res.formaPagamento).toBe('PIX');
  });

  it('TESTE 3 — [BOLETO] Cobrança inicial com contrato BOLETO configura metodosGateway adequadamente', async () => {
    const mockContrato = {
      id: 'ctr-boleto-1',
      empresa_operadora_id: 'tenant-123',
      cliente_id: 'cli-456',
      numero_contrato: 'CT-2026-BOL',
      valor_mensal: 600.0,
      forma_pagamento: 'BOLETO',
    };

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'contratos') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockContrato, error: null }),
            }),
          }),
        };
      }
      if (table === 'contas_receber') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockImplementation((payload: any) => {
            expect(payload.metodos_gateway).toEqual(['BOLETO']);
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'cob-bol-123' }, error: null }),
              }),
            };
          }),
        };
      }
      if (table === 'contrato_estabelecimentos') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      return {};
    });

    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'REC-2026-BOL01', error: null } as any);
    vi.mocked(supabase.from).mockImplementation(mockFrom as any);

    const res = await financeiroService.obterOuCriarCobrancaInicialOnboarding('ctr-boleto-1');
    expect(res.success).toBe(true);
    expect(res.formaPagamento).toBe('BOLETO');
  });

  it('TESTE 4 — [Idempotência] Segunda chamada para o mesmo contrato reutiliza a cobrança existente sem duplicar', async () => {
    const mockContrato = {
      id: 'ctr-repeat-1',
      empresa_operadora_id: 'tenant-123',
      cliente_id: 'cli-456',
      numero_contrato: 'CT-2026-0004',
      valor_mensal: 500.0,
      forma_pagamento: 'PIX',
    };

    const mockCobrancaExistente = {
      id: 'cob-existente-1',
      codigo_operacional: 'REC-2026-000004',
      valor: 500.0,
      status: 'PENDENTE',
    };

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'contratos') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockContrato, error: null }),
            }),
          }),
        };
      }
      if (table === 'contas_receber') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: mockCobrancaExistente, error: null }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    vi.mocked(supabase.from).mockImplementation(mockFrom as any);

    const res = await financeiroService.obterOuCriarCobrancaInicialOnboarding('ctr-repeat-1');

    expect(res.success).toBe(true);
    expect(res.idempotente).toBe(true);
    expect(res.cobrancaId).toBe('cob-existente-1');
    expect(res.codigoOperacional).toBe('REC-2026-000004');
  });

  it('TESTE 5 — [Concorrência] Chamadas paralelas ao mesmo contrato resolvem para a mesma cobrança', async () => {
    const mockContrato = {
      id: 'ctr-concurrent-1',
      empresa_operadora_id: 'tenant-123',
      cliente_id: 'cli-456',
      numero_contrato: 'CT-2026-0005',
      valor_mensal: 350.0,
      forma_pagamento: 'PIX',
    };

    const mockCobranca = {
      id: 'cob-conc-1',
      codigo_operacional: 'REC-2026-000005',
      valor: 350.0,
      status: 'PENDENTE',
    };

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'contratos') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockContrato, error: null }),
            }),
          }),
        };
      }
      if (table === 'contas_receber') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: mockCobranca, error: null }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    vi.mocked(supabase.from).mockImplementation(mockFrom as any);

    const [res1, res2, res3] = await Promise.all([
      financeiroService.obterOuCriarCobrancaInicialOnboarding('ctr-concurrent-1'),
      financeiroService.obterOuCriarCobrancaInicialOnboarding('ctr-concurrent-1'),
      financeiroService.obterOuCriarCobrancaInicialOnboarding('ctr-concurrent-1'),
    ]);

    expect(res1.cobrancaId).toBe('cob-conc-1');
    expect(res2.cobrancaId).toBe('cob-conc-1');
    expect(res3.cobrancaId).toBe('cob-conc-1');
  });

  it('TESTE 6 — [Valor Efetivo] O valor da cobrança utiliza a soma dos subtotais dos estabelecimentos da composição', async () => {
    const mockContrato = {
      id: 'ctr-valor-1',
      empresa_operadora_id: 'tenant-123',
      cliente_id: 'cli-456',
      numero_contrato: 'CT-2026-VALOR',
      valor_mensal: 100.0,
      forma_pagamento: 'PIX',
    };

    const mockEstabelecimentos = [
      { valor_unitario: 200.0, quantidade_telas: 2 }, // 400.0
      { valor_unitario: 150.0, quantidade_telas: 1 }, // 150.0 -> total 550.0
    ];

    let valorInserido = 0;

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'contratos') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockContrato, error: null }),
            }),
          }),
        };
      }
      if (table === 'contrato_estabelecimentos') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: mockEstabelecimentos, error: null }),
          }),
        };
      }
      if (table === 'contas_receber') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockImplementation((payload: any) => {
            valorInserido = payload.valor;
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'cob-val-550' }, error: null }),
              }),
            };
          }),
        };
      }
      return {};
    });

    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'REC-2026-VAL550', error: null } as any);
    vi.mocked(supabase.from).mockImplementation(mockFrom as any);

    const res = await financeiroService.obterOuCriarCobrancaInicialOnboarding('ctr-valor-1');

    expect(res.success).toBe(true);
    expect(res.valor).toBe(550.0);
    expect(valorInserido).toBe(550.0);
  });

  it('TESTE 7 — [Contrato Histórico] Contrato assinado mantém imutabilidade e não falha na emissão de cobrança', async () => {
    const mockContrato = {
      id: 'ctr-hist-1',
      empresa_operadora_id: 'tenant-123',
      cliente_id: 'cli-456',
      numero_contrato: 'CT-2026-HIST',
      valor_mensal: 400.0,
      forma_pagamento: 'PIX',
      status_documento: 'ASSINADO',
      status_workflow: 'ASSINADO',
    };

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'contratos') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockContrato, error: null }),
            }),
          }),
        };
      }
      if (table === 'contas_receber') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'cob-hist-1' }, error: null }),
            }),
          }),
        };
      }
      if (table === 'contrato_estabelecimentos') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      return {};
    });

    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'REC-2026-HIST', error: null } as any);
    vi.mocked(supabase.from).mockImplementation(mockFrom as any);

    const res = await financeiroService.obterOuCriarCobrancaInicialOnboarding('ctr-hist-1');

    expect(res.success).toBe(true);
    expect(res.cobrancaId).toBe('cob-hist-1');
  });

  it('TESTE 8 — [Multi-tenant] Cobrança é vinculada estritamente ao empresa_operadora_id do contrato', async () => {
    const mockContrato = {
      id: 'ctr-tenant-A',
      empresa_operadora_id: 'tenant-ALPHA',
      cliente_id: 'cli-ALPHA',
      numero_contrato: 'CT-TENANT-ALPHA',
      valor_mensal: 700.0,
      forma_pagamento: 'PIX',
    };

    let tenantInjetado = '';

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'contratos') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockContrato, error: null }),
            }),
          }),
        };
      }
      if (table === 'contas_receber') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockImplementation((payload: any) => {
            tenantInjetado = payload.empresa_operadora_id;
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'cob-tenant-alpha' }, error: null }),
              }),
            };
          }),
        };
      }
      if (table === 'contrato_estabelecimentos') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      return {};
    });

    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'REC-ALPHA-01', error: null } as any);
    vi.mocked(supabase.from).mockImplementation(mockFrom as any);

    const res = await financeiroService.obterOuCriarCobrancaInicialOnboarding('ctr-tenant-A');

    expect(res.success).toBe(true);
    expect(tenantInjetado).toBe('tenant-ALPHA');
  });

  it('TESTE 9 — [Status Financeiro] Cobrança criada inicia com status PENDENTE (não PAGO nem LIQUIDADO)', async () => {
    const mockContrato = {
      id: 'ctr-status-1',
      empresa_operadora_id: 'tenant-123',
      cliente_id: 'cli-456',
      numero_contrato: 'CT-STATUS-1',
      valor_mensal: 250.0,
      forma_pagamento: 'PIX',
    };

    let statusInjetado = '';

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'contratos') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockContrato, error: null }),
            }),
          }),
        };
      }
      if (table === 'contas_receber') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockImplementation((payload: any) => {
            statusInjetado = payload.status;
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'cob-status-1' }, error: null }),
              }),
            };
          }),
        };
      }
      if (table === 'contrato_estabelecimentos') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      return {};
    });

    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'REC-STATUS-1', error: null } as any);
    vi.mocked(supabase.from).mockImplementation(mockFrom as any);

    const res = await financeiroService.obterOuCriarCobrancaInicialOnboarding('ctr-status-1');

    expect(res.success).toBe(true);
    expect(statusInjetado).toBe('PENDENTE');
  });

  it('TESTE 10 — [Reprocessamento] Retry pós interrupção não duplica cobrança', async () => {
    const mockContrato = {
      id: 'ctr-retry-1',
      empresa_operadora_id: 'tenant-123',
      cliente_id: 'cli-456',
      numero_contrato: 'CT-RETRY-1',
      valor_mensal: 380.0,
      forma_pagamento: 'PIX',
    };

    let selectCount = 0;
    let insertCount = 0;

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'contratos') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockContrato, error: null }),
            }),
          }),
        };
      }
      if (table === 'contas_receber') {
        return {
          select: vi.fn().mockImplementation(() => {
            selectCount++;
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue(
                    selectCount > 1
                      ? { data: { id: 'cob-retry-1', codigo_operacional: 'REC-RETRY-1', valor: 380.0 }, error: null }
                      : { data: null, error: null }
                  ),
                }),
              }),
            };
          }),
          insert: vi.fn().mockImplementation(() => {
            insertCount++;
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'cob-retry-1' }, error: null }),
              }),
            };
          }),
        };
      }
      if (table === 'contrato_estabelecimentos') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      return {};
    });

    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'REC-RETRY-1', error: null } as any);
    vi.mocked(supabase.from).mockImplementation(mockFrom as any);

    // Primeira chamada: cria cobrança
    const res1 = await financeiroService.obterOuCriarCobrancaInicialOnboarding('ctr-retry-1');
    expect(res1.success).toBe(true);
    expect(res1.idempotente).toBe(false);

    // Segunda chamada (retry): detecta cobrança criada e reutiliza sem chamar insert novamente
    const res2 = await financeiroService.obterOuCriarCobrancaInicialOnboarding('ctr-retry-1');
    expect(res2.success).toBe(true);
    expect(res2.idempotente).toBe(true);
    expect(res2.cobrancaId).toBe('cob-retry-1');
    expect(insertCount).toBe(1);
  });
});
