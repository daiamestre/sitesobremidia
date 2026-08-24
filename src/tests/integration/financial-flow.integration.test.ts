import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * TESTE DE INTEGRAÇÃO — Fluxo Financeiro Enterprise
 *
 * Simula o fluxo completo:
 * Contrato → Conta a Receber → Parcelas → Pagamento → Boleto → PIX → Régua de Cobrança
 *
 * Todos os serviços devem operar de forma coerente e sem efeitos colaterais entre tenants.
 */

// ─── Mock Supabase ────────────────────────────────────────────────────────────
vi.mock('@/integrations/supabase/client', () => {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { id: 'obj-uuid-01', empresa_operadora_id: 'empresa-01', status: 'PENDENTE' },
      error: null,
    }),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  return {
    supabase: {
      from: vi.fn(() => mockChain),
      rpc: vi.fn().mockResolvedValue({ data: 'REC-2026-000099', error: null }),
    },
  };
});

describe('Integração: Fluxo Financeiro Completo (Contrato → PI → Recebível → Pagamento)', () => {

  beforeEach(() => { vi.clearAllMocks(); });

  it('Passo 1: FinanceiroService.createReceivable deve criar conta a receber para um contrato', async () => {
    const { FinanceiroService } = await import('@/modules/crm/services/financeiro.service');
    const service = new FinanceiroService();

    const result = await service.createReceivable({
      empresaOperadoraId: 'empresa-01',
      contratoId: 'contrato-01',
      clienteId: 'cliente-01',
      vencimento: '2026-08-31',
      valorOriginal: 12000.00,
    }, 'usuario-01');

    expect(result.success).toBe(true);
    expect(result).toHaveProperty('contaId');
    expect(result).toHaveProperty('numeroDocumento');
  });

  it('Passo 2: FinanceiroService.generateInstallments deve parcelar a conta criada', async () => {
    const { FinanceiroService } = await import('@/modules/crm/services/financeiro.service');
    const service = new FinanceiroService();

    const result = await service.generateInstallments({
      empresaOperadoraId: 'empresa-01',
      contratoId: 'contrato-01',
      clienteId: 'cliente-01',
      valorMensal: 1000,
      numeroParcelas: 12,
      dataPrimeiroVencimento: '2026-08-01',
    }, 'usuario-01');

    expect(result.success).toBe(true);
    expect(result.totalGerado).toBe(12);
  });

  it('Passo 3: BillingService.generateBoleto respeita o Zero Mock Protocol (sem dados bancários fake)', async () => {
    const { BillingService } = await import('@/modules/crm/services/billing.service');
    const service = new BillingService();

    // Zero Mock Protocol: sem gateway de pagamentos configurado, boleto NÃO pode
    // retornar linha digitável/código de barras/PDF falsos — deve falhar de forma explícita.
    await expect(service.generateBoleto('conta-uuid-01', 1000, '2026-08-31')).rejects.toThrow(
      'Geração de boleto indisponível. Integração com gateway de pagamentos não configurada.'
    );
  });

  it('Passo 4: BillingService.generatePix deve gerar PIX para a mesma conta', async () => {
    const { BillingService } = await import('@/modules/crm/services/billing.service');
    const service = new BillingService();

    const result = await service.generatePix('conta-uuid-01', 1000);

    expect(result).toHaveProperty('txid');
    expect(result).toHaveProperty('qrcode');
    expect(result).toHaveProperty('imagemQrCode');
  });

  it('Passo 5: Régua de cobrança real exige tenant válido e retorna contadores do RPC', async () => {
    const { BillingService } = await import('@/modules/crm/services/billing.service');
    const service = new BillingService();

    await expect(service.executeAutomatedBillingRules('empresa-01')).rejects.toThrow(/obrigat/);

    const result = await service.executeAutomatedBillingRules('00000000-0000-0000-0000-000000000001');
    expect(result).toHaveProperty('notificados');
    expect(result.resultado).toBeTruthy();
  });

  it('Pipeline completo Boleto + PIX: boleto bloqueado (Zero Mock) e PIX funcional para a mesma conta', async () => {
    const { BillingService } = await import('@/modules/crm/services/billing.service');
    const service = new BillingService();

    await expect(service.generateBoleto('conta-01', 2500, '2026-09-30')).rejects.toThrow(
      'Geração de boleto indisponível. Integração com gateway de pagamentos não configurada.'
    );

    const pix = await service.generatePix('conta-01', 2500);
    expect(pix.txid).toMatch(/^PIX-/);
    expect(pix.qrcode.length).toBeGreaterThan(0);
  });

  it('Multi-tenant: fluxos financeiros de empresa-A e empresa-B devem ser independentes', async () => {
    const { FinanceiroService } = await import('@/modules/crm/services/financeiro.service');
    const serviceA = new FinanceiroService();
    const serviceB = new FinanceiroService();

    const [rA, rB] = await Promise.all([
      serviceA.createReceivable({ empresaOperadoraId: 'empresa-A', clienteId: 'c-01', vencimento: '2026-08-31', valorOriginal: 5000 }),
      serviceB.createReceivable({ empresaOperadoraId: 'empresa-B', clienteId: 'c-02', vencimento: '2026-09-30', valorOriginal: 8000 }),
    ]);

    expect(rA.success).toBe(true);
    expect(rB.success).toBe(true);
  });
});

// ─── Integração: Mobile Offline Sync → DW ────────────────────────────────────
describe('Integração: Mobile Offline → Fila → Sync → Banco', () => {
  const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
      removeItem: vi.fn((key: string) => { delete store[key]; }),
      clear: vi.fn(() => { store = {}; }),
    };
  })();

  beforeEach(() => {
    Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true });
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => { localStorageMock.clear(); });

  it('CHECKIN enfileirado offline deve ser sincronizado com sucesso', async () => {
    const { OfflineStorageService } = await import('@/modules/crm/services/offlineStorage.service');
    const { MobileSyncService } = await import('@/modules/crm/services/mobileSync.service');

    const storage = new OfflineStorageService();
    const sync = new MobileSyncService();

    // Campo técnico enfileirado enquanto offline
    storage.enqueue('CHECKIN', { clienteId: 'cliente-01', latitude: -23.5505, longitude: -46.6333, precisao: 3 });

    // Sincroniza quando voltar online
    const result = await sync.syncOfflineData('empresa-01', 'device-field-01');

    expect(result.success).toBe(true);
    expect(result.syncedCount).toBe(1);
  });

  it('Múltiplos tipos na fila devem ser todos sincronizados', async () => {
    const { OfflineStorageService } = await import('@/modules/crm/services/offlineStorage.service');
    const { MobileSyncService } = await import('@/modules/crm/services/mobileSync.service');

    const storage = new OfflineStorageService();
    const sync = new MobileSyncService();

    storage.enqueue('CHECKIN', { clienteId: 'c-01', latitude: -23.0, longitude: -46.0, precisao: 5 });
    storage.enqueue('VISITA', { clienteId: 'c-01', tipo: 'NEGOCIAÇÃO', observacao: 'Reunião de fechamento' });

    const result = await sync.syncOfflineData('empresa-01', 'device-01');

    expect(result.success).toBe(true);
    expect(result.syncedCount).toBe(2);
  });

  it('Fila deve estar vazia após sincronização', async () => {
    const { OfflineStorageService } = await import('@/modules/crm/services/offlineStorage.service');
    const { MobileSyncService } = await import('@/modules/crm/services/mobileSync.service');

    const storage = new OfflineStorageService();
    const sync = new MobileSyncService();

    storage.enqueue('ROTA', { pontos: [{ lat: -23.5, lng: -46.6 }] });
    await sync.syncOfflineData('empresa-01', 'device-01');

    expect(storage.getQueue().length).toBe(0);
  });
});
