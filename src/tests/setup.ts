import '@testing-library/jest-dom';
import { vi } from 'vitest';

// ─── Mock global do Supabase ────────────────────────────────────────────────
// Evita qualquer chamada de rede real durante os testes com encadeamento robusto
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => {
      const chainable: any = {
        select: vi.fn(() => chainable),
        insert: vi.fn(() => chainable),
        update: vi.fn(() => chainable),
        delete: vi.fn(() => chainable),
        eq: vi.fn(() => chainable),
        is: vi.fn(() => chainable),
        order: vi.fn(() => chainable),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn().mockResolvedValue({ data: { id: 'mock-id-123', numero_proposta: 'PROP-2026-0001' }, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        then: (resolve: any) => resolve({ data: [], error: null }),
      };
      return chainable;
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    rpc: vi.fn().mockResolvedValue({ data: 'DOC-RPC-001', error: null }),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { success: true, htmlContent: '<h1>Preview</h1>' }, error: null }),
    },
  },
}));

// ─── Mock matchMedia (não disponível em jsdom) ───────────────────────────────
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ─── Mock ResizeObserver ─────────────────────────────────────────────────────
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
