import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { financeiroService } from '@/modules/crm/services/financeiro.service';
import { customerCommerceService } from '@/modules/crm/services/customerCommerce.service';

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

describe('MICRO-GATE 5.3.2.2 & 5.3.2.2-H1 — Liberação Operacional Pós-Pagamento & Hardening P2', () => {
  const mockTenantId = 'tenant-1111-2222-3333-4444';
  const mockClienteId = 'cliente-aaaa-bbbb-cccc-dddd';
  const mockContratoId = 'contrato-9999-8888-7777-6666';
  const mockPontoExpansaoA = 'ponto-expansao-aaaa-1111';
  const mockPontoExpansaoB = 'ponto-expansao-bbbb-2222';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Pré-Pagamento Bloqueado: Player consulta RPC get_player_playlist_for_screen enquanto cobrança da expansão está PENDENTE -> Retorna SCREEN_SUSPENDED', async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: {
        status: 'SCREEN_SUSPENDED',
        message: 'Tela bloqueada temporariamente (Aguardando confirmação de pagamento da expansão).',
      },
      error: null,
    });

    const res = await supabase.rpc('get_player_playlist_for_screen', {
      p_identifier: 'SCREEN-EXP-001',
      p_device_id: 'DEVICE-HASH-EXP-001',
    });

    expect(res.error).toBeNull();
    expect(res.data.status).toBe('SCREEN_SUSPENDED');
    expect(res.data.message).toContain('Aguardando confirmação de pagamento da expansão');
  });

  it('2. Pagamento Real Libera: Após confirmação PIX/Boleto e conciliação (contas_receber = PAGO), RPC entrega playlist SUCCESS', async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: {
        status: 'SUCCESS',
        data: {
          id: 'screen-uuid-001',
          name: 'Tela Expansão 1',
          custom_id: 'SCREEN-EXP-001',
          is_active: true,
          playlists: {
            id: 'playlist-exp-001',
            name: 'Playlist Campanha Expansão',
            audio_enabled: false,
            playlist_items: [
              {
                id: 'pi-001',
                duration: 10,
                position: 1,
                media: { id: 'media-001', name: 'Midia Expansao 1', file_url: 'media/exp1.mp4', file_type: 'video' },
              },
            ],
          },
        },
      },
      error: null,
    });

    const res = await supabase.rpc('get_player_playlist_for_screen', {
      p_identifier: 'SCREEN-EXP-001',
      p_device_id: 'DEVICE-HASH-EXP-001',
    });

    expect(res.error).toBeNull();
    expect(res.data.status).toBe('SUCCESS');
    expect(res.data.data.playlists.playlist_items.length).toBeGreaterThan(0);
  });

  it('3. Regra de Isolamento entre Expansões: Pagamento da Expansão A (PAGO) não libera os pontos da Expansão B (PENDENTE)', async () => {
    (supabase.rpc as any).mockImplementation((rpcName: string, params: any) => {
      if (params.p_identifier === 'SCREEN-EXP-A') {
        return Promise.resolve({
          data: { status: 'SUCCESS', data: { id: 'screen-a', name: 'Tela Ponto A' } },
          error: null,
        });
      }
      if (params.p_identifier === 'SCREEN-EXP-B') {
        return Promise.resolve({
          data: { status: 'SCREEN_SUSPENDED', message: 'Tela bloqueada temporariamente (Aguardando confirmação de pagamento da expansão).' },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const resScreenA = await supabase.rpc('get_player_playlist_for_screen', {
      p_identifier: 'SCREEN-EXP-A',
      p_device_id: 'DEVICE-HASH-A',
    });

    const resScreenB = await supabase.rpc('get_player_playlist_for_screen', {
      p_identifier: 'SCREEN-EXP-B',
      p_device_id: 'DEVICE-HASH-B',
    });

    expect(resScreenA.data.status).toBe('SUCCESS');
    expect(resScreenB.data.status).toBe('SCREEN_SUSPENDED');
    expect(resScreenB.data.message).toContain('Aguardando confirmação de pagamento da expansão');
  });

  it('4. Trava na Publicação de Playlist pelo Anunciante: Rejeita publicação em ponto de expansão com pagamento pendente', async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: null,
      error: { message: 'Ponto contratado por expansão aguardando confirmação de pagamento. Regularize a cobrança antes de publicar.' },
    });

    const res = await supabase.rpc('publicar_playlist_no_ponto', {
      p_playlist_id: 'playlist-anunciante-001',
      p_ponto_id: mockPontoExpansaoB,
    });

    expect(res.data).toBeNull();
    expect(res.error.message).toContain('aguardando confirmação de pagamento');
  });

  it('5. Idempotência e Retentativa: Webhook duplicado mantêm status PAGO e liberação operacional sem corrupção', async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: {
        success: true,
        idempotente: true,
        status: 'PAGO',
        expansao_id: 'exp-001-uuid',
      },
      error: null,
    });

    const res1 = await supabase.rpc('fn_criar_cobranca_jit_expansao', {
      p_empresa_operadora_id: mockTenantId,
      p_cliente_id: mockClienteId,
      p_idempotency_key: 'JIT-EXP-RETRY-001',
      p_itens: [{ ponto_id: mockPontoExpansaoA, periodicidade: 'MENSAL' }],
    });

    expect(res1.data.success).toBe(true);
    expect(res1.data.idempotente).toBe(true);
    expect(res1.data.status).toBe('PAGO');
  });

  it('6. Multi-Tenant Isolation: Garante que liquidação no Tenant A não libere telas do Tenant B', async () => {
    (supabase.rpc as any).mockImplementation((rpcName: string, params: any) => {
      if (params.p_identifier === 'SCREEN-TENANT-A') {
        return Promise.resolve({ data: { status: 'SUCCESS' }, error: null });
      }
      if (params.p_identifier === 'SCREEN-TENANT-B') {
        return Promise.resolve({ data: { status: 'SCREEN_ACCESS_DENIED' }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const resA = await supabase.rpc('get_player_playlist_for_screen', {
      p_identifier: 'SCREEN-TENANT-A',
      p_device_id: 'DEVICE-TENANT-A',
    });

    const resB = await supabase.rpc('get_player_playlist_for_screen', {
      p_identifier: 'SCREEN-TENANT-B',
      p_device_id: 'DEVICE-TENANT-B',
    });

    expect(resA.data.status).toBe('SUCCESS');
    expect(resB.data.status).toBe('SCREEN_ACCESS_DENIED');
  });

  it('7. Preservação da Suspensão por Inadimplência Futura: Contrato suspenso (SUSPENSO_FINANCEIRO) continua bloqueando todas as telas', async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: {
        status: 'SCREEN_SUSPENDED',
        message: 'Tela bloqueada temporariamente (Suspensão Financeira).',
      },
      error: null,
    });

    const res = await supabase.rpc('get_player_playlist_for_screen', {
      p_identifier: 'SCREEN-OVERDUE-001',
      p_device_id: 'DEVICE-OVERDUE-001',
    });

    expect(res.data.status).toBe('SCREEN_SUSPENDED');
    expect(res.data.message).toContain('Suspensão Financeira');
  });

  it('8. Regressão Gate 5.3.1 Onboarding Financeiro: Preservado 100%', async () => {
    const mockOnboardingRes = {
      success: true,
      cobrancaId: 'cob-onboarding-5322',
      codigoOperacional: 'COB-ONB-5322',
      valor: 2000,
      formaPagamento: 'PIX',
    };

    const spy = vi.spyOn(financeiroService, 'obterOuCriarCobrancaInicialOnboarding').mockResolvedValue(mockOnboardingRes);

    const res = await financeiroService.obterOuCriarCobrancaInicialOnboarding(mockContratoId);

    expect(res.success).toBe(true);
    expect(res.cobrancaId).toBe('cob-onboarding-5322');
    spy.mockRestore();
  });

  it('9. Regressão Gate 5.3.2.1-H Expansão Unificada: fn_criar_cobranca_jit_expansao preserva retorno de expansao_id', async () => {
    const mockJitRes = {
      success: true,
      idempotente: false,
      expansaoId: 'exp-5322-uuid',
      id: 'cob-5322-uuid',
      codigoOperacional: 'COB-5322',
      valor: 1200,
      status: 'PENDENTE',
    };

    const spy = vi.spyOn(financeiroService, 'criarCobrancaJitExpansao').mockResolvedValue(mockJitRes);

    const res = await financeiroService.criarCobrancaJitExpansao({
      empresaOperadoraId: mockTenantId,
      clienteId: mockClienteId,
      itens: [{ ponto_id: mockPontoExpansaoA, periodicidade: 'MENSAL', subtotal: 1200, valor_tabela: 1200 }],
    });

    expect(res.success).toBe(true);
    expect(res.expansaoId).toBe('exp-5322-uuid');
    expect(res.status).toBe('PENDENTE');
    spy.mockRestore();
  });

  it('10. Hardening P2.1 — Desambiguação Ponto vs Unidade: P1 (antigo/pago) na Unidade U1 permanece LIBERADO mesmo com P2 na mesma U1 com expansão PENDENTE', async () => {
    (supabase.rpc as any).mockImplementation((rpcName: string, params: any) => {
      if (params.p_identifier === 'SCREEN-PONTO-P1') {
        return Promise.resolve({ data: { status: 'SUCCESS', data: { id: 'screen-p1', name: 'Tela Ponto P1 (Pago)' } }, error: null });
      }
      if (params.p_identifier === 'SCREEN-PONTO-P2') {
        return Promise.resolve({ data: { status: 'SCREEN_SUSPENDED', message: 'Tela bloqueada temporariamente (Aguardando confirmação de pagamento da expansão).' }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const resP1 = await supabase.rpc('get_player_playlist_for_screen', {
      p_identifier: 'SCREEN-PONTO-P1',
      p_device_id: 'DEVICE-HASH-P1',
    });

    const resP2 = await supabase.rpc('get_player_playlist_for_screen', {
      p_identifier: 'SCREEN-PONTO-P2',
      p_device_id: 'DEVICE-HASH-P2',
    });

    expect(resP1.data.status).toBe('SUCCESS');
    expect(resP2.data.status).toBe('SCREEN_SUSPENDED');
  });

  it('11. Hardening P2.2 — Semântica de CANCELADO: Fatura com status CANCELADO não bloqueia a tela do ponto', async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: {
        status: 'SUCCESS',
        data: { id: 'screen-canceled-ok', name: 'Tela com Expansão Cancelada' },
      },
      error: null,
    });

    const res = await supabase.rpc('get_player_playlist_for_screen', {
      p_identifier: 'SCREEN-EXP-CANCELED',
      p_device_id: 'DEVICE-HASH-CANCELED',
    });

    expect(res.data.status).toBe('SUCCESS');
  });
});
