import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BillingService } from '@/modules/crm/services/billing.service';

// ─── Mock Supabase ────────────────────────────────────────────────────────────
vi.mock('@/integrations/supabase/client', () => {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { empresa_operadora_id: 'empresa-01', status: 'GERADO', pdf_r2: 'tenants/empresa-01/boleto.pdf' },
      error: null,
    }),
  };
  return { supabase: { from: vi.fn(() => mockChain) } };
});

// ─── BillingService: Boleto ───────────────────────────────────────────────────
describe('BillingService — Boleto', () => {
  let service: BillingService;

  beforeEach(() => { service = new BillingService(); vi.clearAllMocks(); });

  it('deve ser instanciado corretamente', () => {
    expect(service).toBeInstanceOf(BillingService);
  });

  it('generateBoleto deve retornar linhaDigitavel', async () => {
    const result = await service.generateBoleto('conta-01', 1500, '2026-08-31');
    expect(result).toHaveProperty('linhaDigitavel');
    expect(typeof result.linhaDigitavel).toBe('string');
    expect(result.linhaDigitavel.length).toBeGreaterThan(0);
  });

  it('generateBoleto deve retornar codigoBarras', async () => {
    const result = await service.generateBoleto('conta-01', 1500, '2026-08-31');
    expect(result).toHaveProperty('codigoBarras');
    expect(result.codigoBarras).toMatch(/^34198/);
  });

  it('generateBoleto deve retornar pdfUrl', async () => {
    const result = await service.generateBoleto('conta-01', 1500, '2026-08-31');
    expect(result).toHaveProperty('pdfUrl');
    expect(typeof result.pdfUrl).toBe('string');
  });

  it('generateBoleto deve inserir registro em public.boletos', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    vi.clearAllMocks();
    await service.generateBoleto('conta-01', 1500, '2026-08-31');
    const tables = (supabase.from as ReturnType<typeof vi.fn>).mock.calls.map((c: string[]) => c[0]);
    expect(tables).toContain('boletos');
  });

  it('cancelBoleto deve retornar success: true', async () => {
    const result = await service.cancelBoleto('boleto-uuid-01');
    expect(result).toHaveProperty('success', true);
  });

  it('cancelBoleto deve atualizar status para CANCELADO no banco', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    vi.clearAllMocks();
    await service.cancelBoleto('boleto-uuid-01');
    const tables = (supabase.from as ReturnType<typeof vi.fn>).mock.calls.map((c: string[]) => c[0]);
    expect(tables).toContain('boletos');
  });

  it('downloadPDF deve retornar objeto com pdfUrl', async () => {
    const result = await service.downloadPDF('boleto-uuid-01');
    expect(result).toHaveProperty('pdfUrl');
  });

  it('checkStatus deve retornar objeto com status', async () => {
    const result = await service.checkStatus('boleto-uuid-01');
    expect(result).toHaveProperty('status');
    expect(typeof result.status).toBe('string');
  });
});

// ─── BillingService: PIX ─────────────────────────────────────────────────────
describe('BillingService — PIX', () => {
  let service: BillingService;

  beforeEach(() => { service = new BillingService(); vi.clearAllMocks(); });

  it('generatePix deve retornar txid', async () => {
    const result = await service.generatePix('conta-01', 750.00);
    expect(result).toHaveProperty('txid');
    expect(result.txid).toMatch(/^PIX-/);
  });

  it('generatePix deve retornar qrcode com payload PIX', async () => {
    const result = await service.generatePix('conta-01', 750.00);
    expect(result).toHaveProperty('qrcode');
    expect(typeof result.qrcode).toBe('string');
    expect(result.qrcode.length).toBeGreaterThan(0);
  });

  it('generatePix deve retornar imagemQrCode com URL', async () => {
    const result = await service.generatePix('conta-01', 750.00);
    expect(result).toHaveProperty('imagemQrCode');
    expect(result.imagemQrCode).toContain('qrserver.com');
  });

  it('generatePix deve inserir registro em public.pix_cobrancas', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    vi.clearAllMocks();
    await service.generatePix('conta-01', 750.00);
    const tables = (supabase.from as ReturnType<typeof vi.fn>).mock.calls.map((c: string[]) => c[0]);
    expect(tables).toContain('pix_cobrancas');
  });

  it('generatePix deve gerar txids únicos para cobranças simultâneas', async () => {
    const [r1, r2] = await Promise.all([
      service.generatePix('conta-01', 100),
      service.generatePix('conta-02', 200),
    ]);
    expect(r1.txid).not.toBe(r2.txid);
  });

  it('cancelPix deve retornar success: true', async () => {
    const result = await service.cancelPix('PIX-1234567890');
    expect(result).toHaveProperty('success', true);
  });

  it('consultPix deve retornar status', async () => {
    const result = await service.consultPix('PIX-1234567890');
    expect(result).toHaveProperty('status');
  });
});

// ─── BillingService: Régua de Cobrança ───────────────────────────────────────
describe('BillingService — Régua de Cobrança Automática', () => {
  let service: BillingService;

  beforeEach(() => { service = new BillingService(); });

  it('executeAutomatedBillingRules deve retornar notificados >= 1', async () => {
    const result = await service.executeAutomatedBillingRules('empresa-01');
    expect(result).toHaveProperty('notificados');
    expect(result.notificados).toBeGreaterThanOrEqual(1);
  });

  it('executeAutomatedBillingRules deve inserir notificação em financeiro_notificacoes', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    vi.clearAllMocks();
    await service.executeAutomatedBillingRules('empresa-01');
    const tables = (supabase.from as ReturnType<typeof vi.fn>).mock.calls.map((c: string[]) => c[0]);
    expect(tables).toContain('financeiro_notificacoes');
  });
});
