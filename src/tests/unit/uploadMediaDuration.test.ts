import { describe, it, expect, vi, afterEach } from 'vitest';
import { defaultDurationForFile, durationForUpload, probeFileDuration } from '@/lib/mediaDuration';

/**
 * Tela de Upload de Mídias: toda mídia adicionada entra JÁ com o tempo dela no campo "Tempo de Mídia".
 * Vídeo/áudio = duração real do arquivo (metadados locais); imagem não tem duração própria = 10 s.
 */
describe('defaultDurationForFile', () => {
  it('vídeo e áudio usam a duração real do arquivo', () => {
    expect(defaultDurationForFile('video', 42)).toBe(42);
    expect(defaultDurationForFile('audio', 185)).toBe(185); // > 2 min: o campo antigo (max 120) não conseguia mostrar
  });
  it('imagem não tem duração própria: 10 s', () => {
    expect(defaultDurationForFile('image', null)).toBe(10);
    expect(defaultDurationForFile('image', 999)).toBe(10);
  });
  it('vídeo cuja duração não pôde ser lida cai em 10 s (nunca 0)', () => {
    expect(defaultDurationForFile('video', null)).toBe(10);
    expect(defaultDurationForFile('video', 0)).toBe(10);
  });
  it('limita a 24 h', () => {
    expect(defaultDurationForFile('video', 999999)).toBe(86400);
  });
});

describe('durationForUpload — qual tempo cada arquivo leva para a playlist', () => {
  it('sem mexer no campo, cada arquivo usa o SEU tempo detectado', () => {
    expect(durationForUpload({ touched: false, typed: 10, detected: 42 })).toBe(42);
    expect(durationForUpload({ touched: false, typed: 10, detected: 7 })).toBe(7);
  });
  it('se o usuário editou o campo, vale o valor digitado para todos', () => {
    expect(durationForUpload({ touched: true, typed: 25, detected: 42 })).toBe(25);
  });
  it('sem detecção usa o valor do campo', () => {
    expect(durationForUpload({ touched: false, typed: 15, detected: undefined })).toBe(15);
  });
});

describe('probeFileDuration', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lê a duração dos metadados do arquivo local e arredonda para cima', async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag !== 'video') return realCreate(tag);
      const fake: Record<string, unknown> = {
        duration: 42.3, load: vi.fn(), removeAttribute: vi.fn(), onloadedmetadata: null, onerror: null,
      };
      Object.defineProperty(fake, 'src', {
        set() { queueMicrotask(() => (fake.onloadedmetadata as () => void)?.()); },
      });
      return fake as unknown as HTMLElement;
    }) as typeof document.createElement);
    const file = new File(['x'], 'v.mp4', { type: 'video/mp4' });
    await expect(probeFileDuration(file)).resolves.toBe(43);
  });

  it('arquivo ilegível/sem metadados = null (o chamador mantém o padrão)', async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
    const file = new File(['x'], 'v.mp4', { type: 'video/mp4' });
    await expect(probeFileDuration(file, 30)).resolves.toBeNull();
  });
});
