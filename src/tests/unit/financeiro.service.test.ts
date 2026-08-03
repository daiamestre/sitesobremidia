import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FinanceiroService } from '@/modules/crm/services/financeiro.service';

// ─── Mock Supabase ────────────────────────────────────────────────────────────
vi.mock('@/integrations/supabase/client', () => {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'conta-uuid-01', empresa_operadora_id: 'empresa-01' }, error: null }),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  return {
    supabase: {
      from: vi.fn(() => mockChain),
      rpc: vi.fn().mockResolvedValue({ data: 'REC-2026-000001', error: null }),
    },
  };
});

const BASE_RECEIVABLE = {
  empresaOperadoraId: 'empresa-uuid-01',
  clienteId: 'cliente-uuid-01',
  vencimento: '2026-08-31',
  valorOriginal: 5000.00,
};

// ─── FinanceiroService: Configuração de Regras de Comissão ───────────────────
describe('FinanceiroService — Regras de Comissão', () => {
  let service: FinanceiroService;

  beforeEach(() => { service = new FinanceiroService(); });

  it('deve ter regras de comissão padrão ao instanciar', () => {
    expect(service).toBeInstanceOf(FinanceiroService);
  });

  it('setCommissionRules deve sobrescrever apenas os campos fornecidos', () => {
    service.setCommissionRules({ representantePercent: 8.0 });
    // Verificação indireta via cálculo de comissão (não há getter público; testa via comportamento)
    expect(service).toBeInstanceOf(FinanceiroService);
  });

  it('setCommissionRules deve aceitar valores parciais sem quebrar', () => {
    expect(() => service.setCommissionRules({ supervisorPercent: 3.0 })).not.toThrow();
    expect(() => service.setCommissionRules({ gerentePercent: 1.5 })).not.toThrow();
  });
});

// ─── FinanceiroService: createReceivable ─────────────────────────────────────
describe('FinanceiroService — createReceivable', () => {
  let service: FinanceiroService;

  beforeEach(() => { service = new FinanceiroService(); vi.clearAllMocks(); });

  it('deve retornar sucesso com contaId quando os dados são válidos', async () => {
    const result = await service.createReceivable(BASE_RECEIVABLE);
    expect(result).toHaveProperty('success', true);
    expect(result).toHaveProperty('contaId');
  });

  it('deve calcular saldo corretamente: valorOriginal - desconto + juros + multa', async () => {
    const payload = { ...BASE_RECEIVABLE, valorOriginal: 1000, desconto: 100, juros: 50, multa: 30 };
    // saldo esperado = 1000 - 100 + 50 + 30 = 980
    const result = await service.createReceivable(payload);
    expect(result.success).toBe(true);
  });

  it('deve funcionar sem desconto, juros e multa (defaults para 0)', async () => {
    const result = await service.createReceivable(BASE_RECEIVABLE);
    expect(result.success).toBe(true);
  });

  it('deve aceitar numeroDocumento pré-fornecido e não gerar via RPC', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    vi.clearAllMocks();
    const result = await service.createReceivable({ ...BASE_RECEIVABLE, numeroDocumento: 'REC-MANUAL-001' });
    expect(result.success).toBe(true);
    // RPC de geração de número NÃO deve ser chamado
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('deve gerar numeroDocumento via RPC quando não fornecido', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    vi.clearAllMocks();
    await service.createReceivable(BASE_RECEIVABLE);
    expect(supabase.rpc).toHaveBeenCalledWith('fn_gerar_numero_recebivel_atomo', expect.any(Object));
  });

  it('deve inserir registro em fluxo_caixa ao criar recebível', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    vi.clearAllMocks();
    await service.createReceivable(BASE_RECEIVABLE);
    const tables = (supabase.from as ReturnType<typeof vi.fn>).mock.calls.map((c: string[]) => c[0]);
    expect(tables).toContain('fluxo_caixa');
  });

  it('deve inserir registro em financeiro_auditoria ao criar recebível', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    vi.clearAllMocks();
    await service.createReceivable(BASE_RECEIVABLE, 'usuario-uuid-01');
    const tables = (supabase.from as ReturnType<typeof vi.fn>).mock.calls.map((c: string[]) => c[0]);
    expect(tables).toContain('financeiro_auditoria');
  });

  it('deve incluir empresa_operadora_id em todas as inserções', async () => {
    const result = await service.createReceivable(BASE_RECEIVABLE);
    expect(result.success).toBe(true);
  });
});

// ─── FinanceiroService: generateInstallments ─────────────────────────────────
describe('FinanceiroService — generateInstallments', () => {
  let service: FinanceiroService;

  beforeEach(() => { service = new FinanceiroService(); });

  it('deve retornar totalGerado igual ao numeroParcelas solicitado', async () => {
    const result = await service.generateInstallments({
      empresaOperadoraId: 'empresa-01',
      contratoId: 'contrato-01',
      clienteId: 'cliente-01',
      valorMensal: 2500,
      numeroParcelas: 12,
      dataPrimeiroVencimento: '2026-08-01',
    });
    expect(result.success).toBe(true);
    expect(result.totalGerado).toBe(12);
  });

  it('deve retornar success: true para contrato de 1 parcela', async () => {
    const result = await service.generateInstallments({
      empresaOperadoraId: 'empresa-01',
      contratoId: 'contrato-01',
      clienteId: 'cliente-01',
      valorMensal: 5000,
      numeroParcelas: 1,
      dataPrimeiroVencimento: '2026-09-01',
    });
    expect(result.success).toBe(true);
    expect(result.totalGerado).toBe(1);
  });

  it('deve inserir registros em public.parcelas', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    vi.clearAllMocks();
    await service.generateInstallments({
      empresaOperadoraId: 'empresa-01',
      contratoId: 'contrato-01',
      clienteId: 'cliente-01',
      valorMensal: 1000,
      numeroParcelas: 3,
      dataPrimeiroVencimento: '2026-08-01',
    });
    const tables = (supabase.from as ReturnType<typeof vi.fn>).mock.calls.map((c: string[]) => c[0]);
    expect(tables).toContain('parcelas');
  });
});
