import { describe, it, expect, vi, beforeEach } from 'vitest';
import { playlistClienteService, VALOR_VIDEO_ADICIONAL } from '@/modules/crm/services/playlistCliente.service';

// ─── Mock Supabase (RPC + from) ──────────────────────────────────────────────
const rpcMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: vi.fn(() => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      return chain;
    }),
  },
}));

vi.mock('@/modules/gestor/telaPago.service', () => ({
  gerarBrcodePix: vi.fn((codigo: string, valor: number) => `PIX-${codigo}-${valor}`),
}));

// ─────────────────────────────────────────────────────────────────────────────
// REGRA COMERCIAL CRÍTICA (missão §24–§26):
// 1º vídeo de cada playlist = GRATUITO; cada vídeo adicional = R$ 19,99
// com cobrança registrada em contas_receber e liberação APENAS após
// confirmação server-side de pagamento. O frontend NUNCA decide a cobrança.
// ─────────────────────────────────────────────────────────────────────────────
describe('playlistCliente.service — regra do vídeo (1 grátis / R$19,99 adicionais)', () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it('VALOR_VIDEO_ADICIONAL deve ser 19.99', () => {
    expect(VALOR_VIDEO_ADICIONAL).toBe(19.99);
  });

  it('adicionarMidia propaga resposta GRATUITA do backend (cobrado=false)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { cobrado: false, valor: 0, item_liberado: true },
      error: null,
    });
    const r = await playlistClienteService.adicionarMidia('pl-1', 'asset-1', 15);
    expect(rpcMock).toHaveBeenCalledWith('adicionar_midia_playlist', {
      p_playlist_id: 'pl-1',
      p_asset_id: 'asset-1',
      p_duracao_segundos: 15,
    });
    expect(r.cobrado).toBe(false);
    expect(r.valor).toBe(0);
    expect(r.itemLiberado).toBe(true);
  });

  it('adicionarMidia propaga COBRANÇA do backend (cobrado=true, item não liberado)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { cobrado: true, valor: 19.99, cobranca_id: 'cr-9', codigo: 'COB-2026-000123' },
      error: null,
    });
    const r = await playlistClienteService.adicionarMidia('pl-1', 'asset-2', null);
    expect(r.cobrado).toBe(true);
    expect(r.valor).toBe(19.99);
    expect(r.itemLiberado).toBe(false);
    expect(r.cobrancaId).toBe('cr-9');
    expect(r.codigo).toBe('COB-2026-000123');
  });

  it('adicionarMidia REJEITA erro da RPC (bypass nunca é silenciado)', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'Mídia já presente nesta playlist.' } });
    await expect(playlistClienteService.adicionarMidia('pl-1', 'asset-1')).rejects.toThrow(
      'Mídia já presente nesta playlist.'
    );
  });

  it('confirmarVideoPago delega ao gate SERVER-SIDE (exige conta PAGA/PAGO)', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    await playlistClienteService.confirmarVideoPago('cr-9', 'pl-1', 'asset-2', 20);
    expect(rpcMock).toHaveBeenCalledWith('confirmar_video_playlist_pago', {
      p_cobranca_id: 'cr-9',
      p_playlist_id: 'pl-1',
      p_asset_id: 'asset-2',
      p_duracao_segundos: 20,
    });
  });

  it('statusCobranca mapeia PAGA/PAGO para pagamento confirmado', async () => {
    const fromMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { status: 'PAGA' }, error: null }),
    };
    const { supabase } = await import('@/integrations/supabase/client');
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValueOnce(fromMock);
    const st = await playlistClienteService.statusCobranca('cr-9');
    expect(st).toBe('PAGAMENTO CONFIRMADO');
  });

  it('statusCobranca mantém aguardando quando status não é PAGA/PAGO', async () => {
    const fromMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { status: 'ABERTA' }, error: null }),
    };
    const { supabase } = await import('@/integrations/supabase/client');
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValueOnce(fromMock);
    const st = await playlistClienteService.statusCobranca('cr-9');
    expect(st).toBe('AGUARDANDO PAGAMENTO');
  });

  it('publicarNoPlayer consome a ponte server-side (publicar_playlist_cliente)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { playlist_player_id: 'canal-uuid', nome: 'Campanha Agosto', itens: 3 },
      error: null,
    });
    const r = await playlistClienteService.publicarNoPlayer('pl-1');
    expect(rpcMock).toHaveBeenCalledWith('publicar_playlist_cliente', { p_playlist_id: 'pl-1' });
    expect(r.playlist_player_id).toBe('canal-uuid');
    expect(r.itens).toBe(3);
  });
});
