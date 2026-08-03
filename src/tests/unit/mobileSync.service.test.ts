import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MobileSyncService } from '@/modules/crm/services/mobileSync.service';
import { OfflineStorageService } from '@/modules/crm/services/offlineStorage.service';

// ─── Mock Supabase ────────────────────────────────────────────────────────────
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ data: [{ id: 'sync-01' }], error: null }),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    })),
  },
}));

// ─── Mock localStorage ───────────────────────────────────────────────────────
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// ─── Testes: MobileSyncService ───────────────────────────────────────────────
describe('MobileSyncService', () => {
  let syncService: MobileSyncService;
  let storageService: OfflineStorageService;

  beforeEach(() => {
    syncService = new MobileSyncService();
    storageService = new OfflineStorageService();
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => { localStorageMock.clear(); });

  it('deve ser instanciado corretamente', () => {
    expect(syncService).toBeInstanceOf(MobileSyncService);
  });

  it('syncOfflineData com fila vazia deve retornar success: true e syncedCount: 0', async () => {
    const result = await syncService.syncOfflineData('empresa-01', 'device-01');
    expect(result.success).toBe(true);
    expect(result.syncedCount).toBe(0);
  });

  it('syncOfflineData deve sincronizar itens do tipo CHECKIN', async () => {
    storageService.enqueue('CHECKIN', { clienteId: 'c-01', latitude: -23.5505, longitude: -46.6333, precisao: 5 });
    const result = await syncService.syncOfflineData('empresa-01', 'device-01');
    expect(result.success).toBe(true);
    expect(result.syncedCount).toBeGreaterThanOrEqual(1);
  });

  it('syncOfflineData deve sincronizar itens do tipo VISITA', async () => {
    storageService.enqueue('VISITA', { clienteId: 'c-02', tipo: 'PROSPECÇÃO', observacao: 'Primeiro contato' });
    const result = await syncService.syncOfflineData('empresa-01', 'device-01');
    expect(result.success).toBe(true);
    expect(result.syncedCount).toBeGreaterThanOrEqual(1);
  });

  it('syncOfflineData deve limpar a fila após sincronização bem-sucedida', async () => {
    storageService.enqueue('CHECKIN', { clienteId: 'c-01', latitude: -23.5, longitude: -46.6, precisao: 10 });
    await syncService.syncOfflineData('empresa-01', 'device-01');
    // Após sync, queue deve estar vazia
    const queueAfterSync = storageService.getQueue();
    expect(queueAfterSync.length).toBe(0);
  });

  it('syncOfflineData deve inserir log em mobile_sincronizacao', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    vi.clearAllMocks();
    storageService.enqueue('CHECKIN', { clienteId: 'c-01', latitude: -23.5, longitude: -46.6, precisao: 5 });
    await syncService.syncOfflineData('empresa-01', 'device-01');
    const tables = (supabase.from as ReturnType<typeof vi.fn>).mock.calls.map((c: string[]) => c[0]);
    expect(tables).toContain('mobile_sincronizacao');
  });

  it('syncOfflineData com múltiplos CHECKINs deve contabilizar todos', async () => {
    storageService.enqueue('CHECKIN', { clienteId: 'c-01', latitude: -23.5, longitude: -46.6, precisao: 5 });
    storageService.enqueue('CHECKIN', { clienteId: 'c-02', latitude: -23.6, longitude: -46.7, precisao: 8 });
    const result = await syncService.syncOfflineData('empresa-01', 'device-01');
    expect(result.syncedCount).toBe(2);
  });

  it('syncOfflineData deve funcionar com múltiplos dispositivoIds (isolamento)', async () => {
    const [r1, r2] = await Promise.all([
      syncService.syncOfflineData('empresa-01', 'device-A'),
      syncService.syncOfflineData('empresa-01', 'device-B'),
    ]);
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
  });
});
