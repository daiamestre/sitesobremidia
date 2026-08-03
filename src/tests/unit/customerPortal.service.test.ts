import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CustomerPortalService, CustomerApprovalPayload } from '@/modules/crm/services/customerPortal.service';

// ─── Mock Supabase ────────────────────────────────────────────────────────────
vi.mock('@/integrations/supabase/client', () => {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [{ id: 'pop-01', status: 'exibido' }], error: null }),
    single: vi.fn().mockResolvedValue({ data: { id: 'ticket-uuid-01' }, error: null }),
  };
  return { supabase: { from: vi.fn(() => mockChain) } };
});

const BASE_APPROVAL: CustomerApprovalPayload = {
  empresaOperadoraId: 'empresa-01',
  producaoId: 'producao-uuid-01',
  versao: 1,
  status: 'APROVADO',
};

// ─── CustomerPortalService: Aprovação de Arte ────────────────────────────────
describe('CustomerPortalService — Aprovação de Arte', () => {
  let service: CustomerPortalService;

  beforeEach(() => { service = new CustomerPortalService(); vi.clearAllMocks(); });

  it('deve ser instanciado corretamente', () => {
    expect(service).toBeInstanceOf(CustomerPortalService);
  });

  it('submitArtworkApproval com APROVADO deve retornar success: true', async () => {
    const result = await service.submitArtworkApproval(BASE_APPROVAL);
    expect(result.success).toBe(true);
  });

  it('submitArtworkApproval com REJEITADO deve retornar success: true', async () => {
    const result = await service.submitArtworkApproval({ ...BASE_APPROVAL, status: 'REJEITADO', comentario: 'Cor incorreta' });
    expect(result.success).toBe(true);
  });

  it('submitArtworkApproval deve inserir em portal_aprovacoes', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    vi.clearAllMocks();
    await service.submitArtworkApproval(BASE_APPROVAL);
    const tables = (supabase.from as ReturnType<typeof vi.fn>).mock.calls.map((c: string[]) => c[0]);
    expect(tables).toContain('portal_aprovacoes');
  });

  it('submitArtworkApproval deve atualizar status em producao_midia', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    vi.clearAllMocks();
    await service.submitArtworkApproval(BASE_APPROVAL);
    const tables = (supabase.from as ReturnType<typeof vi.fn>).mock.calls.map((c: string[]) => c[0]);
    expect(tables).toContain('producao_midia');
  });

  it('submitArtworkApproval deve registrar em portal_auditoria', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    vi.clearAllMocks();
    await service.submitArtworkApproval(BASE_APPROVAL);
    const tables = (supabase.from as ReturnType<typeof vi.fn>).mock.calls.map((c: string[]) => c[0]);
    expect(tables).toContain('portal_auditoria');
  });

  it('submitArtworkApproval deve aceitar comentário opcional', async () => {
    const result = await service.submitArtworkApproval({ ...BASE_APPROVAL, comentario: 'Aprovado com ressalvas' });
    expect(result.success).toBe(true);
  });

  it('submitArtworkApproval deve funcionar sem comentário', async () => {
    const { comentario, ...withoutComment } = BASE_APPROVAL;
    const result = await service.submitArtworkApproval(withoutComment);
    expect(result.success).toBe(true);
  });
});

// ─── CustomerPortalService: Proof of Play ────────────────────────────────────
describe('CustomerPortalService — Proof of Play', () => {
  let service: CustomerPortalService;

  beforeEach(() => { service = new CustomerPortalService(); vi.clearAllMocks(); });

  it('getProofOfPlayList deve retornar um array', async () => {
    const result = await service.getProofOfPlayList('cliente-01');
    expect(Array.isArray(result)).toBe(true);
  });

  it('getProofOfPlayList deve retornar dados do DW Operacional', async () => {
    const result = await service.getProofOfPlayList('cliente-01');
    // Deve retornar dados (mockados como [{ id: 'pop-01' }])
    expect(result).toBeDefined();
  });
});

// ─── CustomerPortalService: Chamados de Suporte ───────────────────────────────
describe('CustomerPortalService — Chamados de Suporte', () => {
  let service: CustomerPortalService;

  beforeEach(() => { service = new CustomerPortalService(); vi.clearAllMocks(); });

  it('createSupportTicket deve retornar success: true', async () => {
    const result = await service.createSupportTicket({
      empresaOperadoraId: 'empresa-01',
      clienteId: 'cliente-01',
      titulo: 'Anúncio não está exibindo',
      descricao: 'O painel da Av. Paulista parou de exibir minha campanha.',
      categoria: 'OPERACIONAL',
    });
    expect(result.success).toBe(true);
  });

  it('createSupportTicket deve retornar ticketId', async () => {
    const result = await service.createSupportTicket({
      empresaOperadoraId: 'empresa-01',
      clienteId: 'cliente-01',
      titulo: 'Dúvida sobre fatura',
      descricao: 'Gostaria de entender os valores da fatura de julho.',
      categoria: 'FINANCEIRO',
    });
    expect(result).toHaveProperty('ticketId');
  });

  it('createSupportTicket deve inserir em portal_chamados', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    vi.clearAllMocks();
    await service.createSupportTicket({
      empresaOperadoraId: 'empresa-01',
      clienteId: 'cliente-01',
      titulo: 'Teste',
      descricao: 'Descrição do chamado.',
      categoria: 'TÉCNICO',
    });
    const tables = (supabase.from as ReturnType<typeof vi.fn>).mock.calls.map((c: string[]) => c[0]);
    expect(tables).toContain('portal_chamados');
  });

  it('listSupportTickets deve retornar um array', async () => {
    const result = await service.listSupportTickets('cliente-01');
    expect(Array.isArray(result)).toBe(true);
  });

  it('criação de chamados de clientes diferentes deve ser independente (isolamento)', async () => {
    const [r1, r2] = await Promise.all([
      service.createSupportTicket({ empresaOperadoraId: 'emp-A', clienteId: 'cli-1', titulo: 'Chamado A', descricao: '...', categoria: 'OPERACIONAL' }),
      service.createSupportTicket({ empresaOperadoraId: 'emp-B', clienteId: 'cli-2', titulo: 'Chamado B', descricao: '...', categoria: 'FINANCEIRO' }),
    ]);
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
  });
});
