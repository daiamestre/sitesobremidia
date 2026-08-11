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
  status: 'APROVADO',
  decididoPor: 'user-01'
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

  it('submitArtworkApproval com REPROVADO_COM_AJUSTES deve retornar success: true', async () => {
    const result = await service.submitArtworkApproval({ ...BASE_APPROVAL, status: 'REPROVADO_COM_AJUSTES', comentarios: 'Cor incorreta' });
    expect(result.success).toBe(true);
  });

  it('submitArtworkApproval deve inserir em portal_aprovacoes', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    vi.clearAllMocks();
    await service.submitArtworkApproval(BASE_APPROVAL);
    const tables = (supabase.from as ReturnType<typeof vi.fn>).mock.calls.map((c: string[]) => c[0]);
    expect(tables).toContain('portal_aprovacoes');
  });

  it('submitArtworkApproval deve atualizar status em producoes', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    vi.clearAllMocks();
    await service.submitArtworkApproval(BASE_APPROVAL);
    const tables = (supabase.from as ReturnType<typeof vi.fn>).mock.calls.map((c: string[]) => c[0]);
    expect(tables).toContain('producoes');
  });

  it('submitArtworkApproval deve aceitar comentário opcional', async () => {
    const result = await service.submitArtworkApproval({ ...BASE_APPROVAL, comentarios: 'Aprovado com ressalvas' });
    expect(result.success).toBe(true);
  });

  it('submitArtworkApproval deve funcionar sem comentário', async () => {
    const { comentarios, ...withoutComment } = BASE_APPROVAL;
    const result = await service.submitArtworkApproval(withoutComment);
    expect(result.success).toBe(true);
  });
});

// ─── CustomerPortalService: Proof of Play ────────────────────────────────────
describe('CustomerPortalService — Proof of Play', () => {
  let service: CustomerPortalService;

  beforeEach(() => { service = new CustomerPortalService(); vi.clearAllMocks(); });

  it('getProofOfPlayList deve retornar um array', async () => {
    const result = await service.getProofOfPlayList();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── CustomerPortalService: Chamados de Suporte ───────────────────────────────
describe('CustomerPortalService — Chamados de Suporte', () => {
  let service: CustomerPortalService;

  beforeEach(() => { service = new CustomerPortalService(); vi.clearAllMocks(); });

  it('createSupportTicket deve retornar success: true', async () => {
    const result = await service.createSupportTicket({
      empresaOperadoraId: 'empresa-01',
      contratoId: 'contrato-01',
      assunto: 'Anúncio não está exibindo',
      descricao: 'O painel da Av. Paulista parou de exibir minha campanha.',
      prioridade: 'NORMAL',
      createdBy: 'user-01'
    });
    expect(result.success).toBe(true);
  });

  it('createSupportTicket deve retornar ticketId', async () => {
    const result = await service.createSupportTicket({
      empresaOperadoraId: 'empresa-01',
      contratoId: 'contrato-01',
      assunto: 'Dúvida sobre fatura',
      descricao: 'Gostaria de entender os valores da fatura de julho.',
      prioridade: 'BAIXA',
      createdBy: 'user-01'
    });
    expect(result).toHaveProperty('ticketId');
  });

  it('createSupportTicket deve inserir em portal_chamados', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    vi.clearAllMocks();
    await service.createSupportTicket({
      empresaOperadoraId: 'empresa-01',
      contratoId: 'contrato-01',
      assunto: 'Teste',
      descricao: 'Descrição do chamado.',
      prioridade: 'ALTA',
      createdBy: 'user-01'
    });
    const tables = (supabase.from as ReturnType<typeof vi.fn>).mock.calls.map((c: string[]) => c[0]);
    expect(tables).toContain('portal_chamados');
  });

  it('listSupportTickets deve retornar um array', async () => {
    const result = await service.listSupportTickets('contrato-01');
    expect(Array.isArray(result)).toBe(true);
  });
});
