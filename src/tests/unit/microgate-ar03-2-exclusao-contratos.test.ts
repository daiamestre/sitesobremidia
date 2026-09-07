import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { contratoService } from '@/modules/crm/services/contrato.service';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

describe('MICRO-GATE AR-03.2 — Exclusão Atômica e Híbrida de Contratos (contrato.service.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Deve executar HARD DELETE com sucesso para contratos em rascunho sem lastro financeiro ou jurídico', async () => {
    const contratoId = '11111111-2222-3333-4444-555555555555';
    const motivo = 'Contrato cancelado pelo cliente durante a negociação';
    const r2Keys = [
      'tenants/tenant-1/contratos/11111111/v1/contrato.pdf',
      'tenants/tenant-1/contratos/11111111/envelope.pdf',
    ];

    (supabase.rpc as any).mockResolvedValueOnce({
      data: {
        success: true,
        mode: 'HARD_DELETE',
        contrato_id: contratoId,
        r2_keys_to_delete: r2Keys,
        message: 'Contrato e dependências excluídos definitivamente com sucesso.',
      },
      error: null,
    });

    const result = await contratoService.excluirContrato(contratoId, motivo);

    expect(result.success).toBe(true);
    expect(result.mode).toBe('HARD_DELETE');
    expect(supabase.rpc).toHaveBeenCalledWith('fn_excluir_contrato_atomo', {
      p_contrato_id: contratoId,
      p_motivo: motivo,
    });
    // Verifica que disparou o cleanup server-side das chaves R2 retornadas
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(2);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('delete-media-object', {
      body: { objectKey: r2Keys[0] },
    });
    expect(supabase.functions.invoke).toHaveBeenCalledWith('delete-media-object', {
      body: { objectKey: r2Keys[1] },
    });
  });

  it('2. Deve aplicar SOFT DELETE automaticamente quando o contrato possuir assinatura jurídica (ASSINADO)', async () => {
    const contratoId = '22222222-3333-4444-5555-666666666666';
    const motivo = 'Rescisão antecipada de contrato vigente';

    (supabase.rpc as any).mockResolvedValueOnce({
      data: {
        success: true,
        mode: 'SOFT_DELETE',
        contrato_id: contratoId,
        message: 'Contrato desativado e cancelado com preservação integral do histórico fiscal e contábil.',
      },
      error: null,
    });

    const result = await contratoService.excluirContrato(contratoId, motivo);

    expect(result.success).toBe(true);
    expect(result.mode).toBe('SOFT_DELETE');
    // Em Soft Delete, nenhum arquivo do R2 deve ser expurgado
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('3. Deve aplicar SOFT DELETE automaticamente quando houver pagamentos confirmados (valor_pago > 0)', async () => {
    const contratoId = '33333333-4444-5555-6666-777777777777';
    const motivo = 'Cancelamento de cliente pagante';

    (supabase.rpc as any).mockResolvedValueOnce({
      data: {
        success: true,
        mode: 'SOFT_DELETE',
        contrato_id: contratoId,
        message: 'Contrato desativado com preservação de pagamentos.',
      },
      error: null,
    });

    const result = await contratoService.excluirContrato(contratoId, motivo);

    expect(result.success).toBe(true);
    expect(result.mode).toBe('SOFT_DELETE');
  });

  it('4. Deve aplicar SOFT DELETE automaticamente quando houver lançamentos contábeis quitados (status_geral = PAID)', async () => {
    const contratoId = '44444444-5555-6666-7777-888888888888';
    const motivo = 'Encerramento de contrato com lançamento contábil no DRE';

    (supabase.rpc as any).mockResolvedValueOnce({
      data: {
        success: true,
        mode: 'SOFT_DELETE',
        contrato_id: contratoId,
        message: 'Soft delete por retenção contábil.',
      },
      error: null,
    });

    const result = await contratoService.excluirContrato(contratoId, motivo);

    expect(result.success).toBe(true);
    expect(result.mode).toBe('SOFT_DELETE');
  });

  it('5. Deve aplicar SOFT DELETE automaticamente quando houver comissão paga ao representante (status = PAGA)', async () => {
    const contratoId = '55555555-6666-7777-8888-999999999999';
    const motivo = 'Distrato após pagamento de comissão comercial';

    (supabase.rpc as any).mockResolvedValueOnce({
      data: {
        success: true,
        mode: 'SOFT_DELETE',
        contrato_id: contratoId,
        message: 'Soft delete por retenção de repasse comercial.',
      },
      error: null,
    });

    const result = await contratoService.excluirContrato(contratoId, motivo);

    expect(result.success).toBe(true);
    expect(result.mode).toBe('SOFT_DELETE');
  });

  it('6. Deve aplicar SOFT DELETE automaticamente quando houver ordem de produção aprovada ou veiculada', async () => {
    const contratoId = '66666666-7777-8888-9999-000000000000';
    const motivo = 'Cancelamento de campanha com arte aprovada/veiculada';

    (supabase.rpc as any).mockResolvedValueOnce({
      data: {
        success: true,
        mode: 'SOFT_DELETE',
        contrato_id: contratoId,
        message: 'Soft delete por retenção de arte publicitária.',
      },
      error: null,
    });

    const result = await contratoService.excluirContrato(contratoId, motivo);

    expect(result.success).toBe(true);
    expect(result.mode).toBe('SOFT_DELETE');
  });

  it('7. Deve tratar idempotência quando o contrato já tiver sido excluído ou desativado', async () => {
    const contratoId = '77777777-8888-9999-0000-111111111111';
    const motivo = 'Tentativa de exclusão repetida';

    (supabase.rpc as any).mockResolvedValueOnce({
      data: {
        success: true,
        already_deleted: true,
        message: 'Contrato já se encontra cancelado/excluído.',
      },
      error: null,
    });

    const result = await contratoService.excluirContrato(contratoId, motivo);

    expect(result.success).toBe(true);
    expect(result.already_deleted).toBe(true);
  });

  it('8. Deve rejeitar com erro quando a RPC retornar falha de autorização ou tenant mismatch', async () => {
    const contratoId = '88888888-9999-0000-1111-222222222222';
    const motivo = 'Tentativa cross-tenant não autorizada';

    (supabase.rpc as any).mockResolvedValueOnce({
      data: {
        success: false,
        error: 'Acesso Negado: Contrato pertence a outro tenant.',
      },
      error: null,
    });

    const result = await contratoService.excluirContrato(contratoId, motivo);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Acesso Negado');
  });

  it('9. Deve tratar exceções de rede ou falha na RPC graciosamente sem travar a interface', async () => {
    const contratoId = '99999999-0000-1111-2222-333333333333';
    const motivo = 'Teste de falha de conexão';

    (supabase.rpc as any).mockResolvedValueOnce({
      data: null,
      error: { message: 'Connection terminated unexpectedly' },
    });

    const result = await contratoService.excluirContrato(contratoId, motivo);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Connection terminated');
  });
});
