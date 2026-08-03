import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OfflineStorageService, OfflineQueueItem } from '@/modules/crm/services/offlineStorage.service';

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

// ─── Testes: OfflineStorageService ───────────────────────────────────────────
describe('OfflineStorageService', () => {
  let service: OfflineStorageService;

  beforeEach(() => {
    service = new OfflineStorageService();
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => { localStorageMock.clear(); });

  it('deve ser instanciado corretamente', () => {
    expect(service).toBeInstanceOf(OfflineStorageService);
  });

  it('getQueue deve retornar array vazio quando localStorage está vazio', () => {
    const queue = service.getQueue();
    expect(Array.isArray(queue)).toBe(true);
    expect(queue.length).toBe(0);
  });

  it('enqueue deve adicionar um item à fila', () => {
    service.enqueue('CHECKIN', { clienteId: 'c-01', latitude: -23.5, longitude: -46.6 });
    const queue = service.getQueue();
    expect(queue.length).toBe(1);
  });

  it('enqueue deve retornar o item criado com id, type, payload e createdAt', () => {
    const item = service.enqueue('CHECKIN', { lat: -23.5, lng: -46.6 });
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('type', 'CHECKIN');
    expect(item).toHaveProperty('payload');
    expect(item).toHaveProperty('createdAt');
  });

  it('enqueue deve gerar id único com prefixo OFF-', () => {
    const item = service.enqueue('VISITA', { tipo: 'PROSPECÇÃO' });
    expect(item.id).toMatch(/^OFF-/);
  });

  it('enqueue deve gerar ids diferentes para múltiplos itens', () => {
    const a = service.enqueue('CHECKIN', {});
    const b = service.enqueue('VISITA', {});
    expect(a.id).not.toBe(b.id);
  });

  it('deve aceitar todos os tipos de OfflineQueueItem', () => {
    const tipos: OfflineQueueItem['type'][] = ['CHECKIN', 'VISITA', 'FOTO_UPLOAD', 'ROTA'];
    tipos.forEach((tipo) => {
      const item = service.enqueue(tipo, { dado: 'teste' });
      expect(item.type).toBe(tipo);
    });
  });

  it('getQueue deve retornar todos os itens na ordem de inserção (FIFO)', () => {
    service.enqueue('CHECKIN', { ordem: 1 });
    service.enqueue('VISITA', { ordem: 2 });
    service.enqueue('FOTO_UPLOAD', { ordem: 3 });
    const queue = service.getQueue();
    expect(queue.length).toBe(3);
    expect(queue[0].type).toBe('CHECKIN');
    expect(queue[1].type).toBe('VISITA');
    expect(queue[2].type).toBe('FOTO_UPLOAD');
  });

  it('clearQueue deve esvaziar a fila completamente', () => {
    service.enqueue('CHECKIN', {});
    service.enqueue('VISITA', {});
    service.clearQueue();
    const queue = service.getQueue();
    expect(queue.length).toBe(0);
  });

  it('clearQueue deve chamar localStorage.removeItem', () => {
    service.clearQueue();
    expect(localStorageMock.removeItem).toHaveBeenCalled();
  });

  it('getQueue deve ser tolerante a JSON inválido no localStorage (retorna [])', () => {
    localStorageMock.getItem.mockReturnValueOnce('INVALID_JSON_{{{{');
    const queue = service.getQueue();
    expect(Array.isArray(queue)).toBe(true);
    expect(queue.length).toBe(0);
  });

  it('createdAt deve ser ISO 8601 válido', () => {
    const item = service.enqueue('ROTA', { pontos: [] });
    expect(() => new Date(item.createdAt).toISOString()).not.toThrow();
  });
});
