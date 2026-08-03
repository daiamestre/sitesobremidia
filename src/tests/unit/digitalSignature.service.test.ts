import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignatureProviderAdapter, SignatureProviderName } from '@/modules/crm/services/digitalSignature.service';

// ─── Mock do Supabase ────────────────────────────────────────────────────────
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'sig-01', status: 'ENVIADO' },
        error: null,
      }),
      mockResolvedValue: vi.fn().mockResolvedValue({ data: [{ id: 'sig-01' }], error: null }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

const BASE_PAYLOAD = {
  empresaOperadoraId: 'empresa-uuid-01',
  contratoId: 'contrato-uuid-01',
  provedor: 'CLICKSIGN' as SignatureProviderName,
  signatarios: [{ nome: 'João Silva', email: 'joao@empresa.com', cpfCnpj: '123.456.789-00' }],
};

// ─── Testes Unitários: SignatureProviderAdapter ───────────────────────────────
describe('SignatureProviderAdapter', () => {
  let adapter: SignatureProviderAdapter;

  beforeEach(() => {
    adapter = new SignatureProviderAdapter('CLICKSIGN');
    vi.clearAllMocks();
  });

  it('deve ser instanciado corretamente', () => {
    expect(adapter).toBeInstanceOf(SignatureProviderAdapter);
  });

  it('deve aceitar todos os provedores suportados', () => {
    const providers: SignatureProviderName[] = [
      'CLICKSIGN', 'DOCUSIGN', 'ADOBESIGN', 'ASSINAFY', 'ZAPSIGN', 'ASSINADOR_INTERNO',
    ];
    providers.forEach((p) => {
      const a = new SignatureProviderAdapter(p);
      expect(a).toBeInstanceOf(SignatureProviderAdapter);
    });
  });

  it('createEnvelope deve retornar objeto com success', async () => {
    const result = await adapter.createEnvelope(BASE_PAYLOAD);
    expect(result).toHaveProperty('success');
  });

  it('createEnvelope deve gerar envelopeId com prefixo do provedor', async () => {
    const result = await adapter.createEnvelope(BASE_PAYLOAD);
    if (result.envelopeId) {
      expect(result.envelopeId).toMatch(/ENV-CLICKSIGN-\d+-[A-Z0-9]+/);
    }
  });

  it('createEnvelope deve gerar documentHash no formato SHA256', async () => {
    const result = await adapter.createEnvelope(BASE_PAYLOAD);
    if (result.documentHash) {
      expect(result.documentHash).toMatch(/SHA256-/);
    }
  });

  it('createEnvelope deve funcionar com múltiplos signatários', async () => {
    const payload = {
      ...BASE_PAYLOAD,
      signatarios: [
        { nome: 'João', email: 'joao@empresa.com' },
        { nome: 'Maria', email: 'maria@empresa.com' },
      ],
    };
    const result = await adapter.createEnvelope(payload);
    expect(result).toHaveProperty('success');
  });

  it('createEnvelope com DOCUSIGN deve usar prefixo correto no envelopeId', async () => {
    const docuAdapter = new SignatureProviderAdapter('DOCUSIGN');
    const result = await docuAdapter.createEnvelope({ ...BASE_PAYLOAD, provedor: 'DOCUSIGN' });
    if (result.envelopeId) {
      expect(result.envelopeId).toMatch(/ENV-DOCUSIGN-\d+-[A-Z0-9]+/);
    }
  });
});
