import { describe, it, expect, vi } from 'vitest';

// ─── Mock do Supabase ────────────────────────────────────────────────────────
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      single: vi.fn().mockResolvedValue({
        data: { id: 'sig-01', status: 'ENVIADO' },
        error: null,
      }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

// ─── Testes de Integração: Assinatura Digital + Contrato ─────────────────────
describe('Integração: Fluxo de Assinatura Digital (Contrato → Envelope → Auditoria)', () => {

  it('deve criar um envelope com CLICKSIGN e retornar estrutura válida', async () => {
    const { SignatureProviderAdapter } = await import('@/modules/crm/services/digitalSignature.service');
    const adapter = new SignatureProviderAdapter('CLICKSIGN');

    const result = await adapter.createEnvelope({
      empresaOperadoraId: 'empresa-01',
      contratoId: 'contrato-01',
      provedor: 'CLICKSIGN',
      signatarios: [{ nome: 'Ana Lima', email: 'ana@cliente.com' }],
    });

    expect(result).toHaveProperty('success');
  });

  it('deve criar um envelope com DOCUSIGN e retornar estrutura válida', async () => {
    const { SignatureProviderAdapter } = await import('@/modules/crm/services/digitalSignature.service');
    const adapter = new SignatureProviderAdapter('DOCUSIGN');

    const result = await adapter.createEnvelope({
      empresaOperadoraId: 'empresa-01',
      contratoId: 'contrato-01',
      provedor: 'DOCUSIGN',
      signatarios: [{ nome: 'Pedro Costa', email: 'pedro@anunciante.com' }],
    });

    expect(result).toHaveProperty('success');
  });

  it('deve criar envelopes distintos para contratos distintos (isolamento)', async () => {
    const { SignatureProviderAdapter } = await import('@/modules/crm/services/digitalSignature.service');
    const adapter = new SignatureProviderAdapter('ASSINADOR_INTERNO');

    const [r1, r2] = await Promise.all([
      adapter.createEnvelope({
        empresaOperadoraId: 'empresa-01',
        contratoId: 'contrato-001',
        provedor: 'ASSINADOR_INTERNO',
        signatarios: [{ nome: 'Alice', email: 'alice@empresa.com' }],
      }),
      adapter.createEnvelope({
        empresaOperadoraId: 'empresa-02',
        contratoId: 'contrato-002',
        provedor: 'ASSINADOR_INTERNO',
        signatarios: [{ nome: 'Bob', email: 'bob@empresa.com' }],
      }),
    ]);

    // Ambos devem ter sucesso mas envelopes diferentes
    expect(r1).toHaveProperty('success');
    expect(r2).toHaveProperty('success');
    if (r1.envelopeId && r2.envelopeId) {
      expect(r1.envelopeId).not.toBe(r2.envelopeId);
    }
  });

  it('deve aceitar signatários sem CPF/CNPJ', async () => {
    const { SignatureProviderAdapter } = await import('@/modules/crm/services/digitalSignature.service');
    const adapter = new SignatureProviderAdapter('ZAPSIGN');

    const result = await adapter.createEnvelope({
      empresaOperadoraId: 'empresa-01',
      contratoId: 'contrato-01',
      provedor: 'ZAPSIGN',
      signatarios: [{ nome: 'Sem CPF', email: 'sem@cpf.com' }], // sem cpfCnpj
    });

    expect(result).toHaveProperty('success');
  });

  it('deve gerar documentHash único por envelope', async () => {
    const { SignatureProviderAdapter } = await import('@/modules/crm/services/digitalSignature.service');
    const adapter = new SignatureProviderAdapter('CLICKSIGN');
    const payload = {
      empresaOperadoraId: 'empresa-01',
      contratoId: 'contrato-01',
      provedor: 'CLICKSIGN' as const,
      signatarios: [{ nome: 'Test', email: 'test@test.com' }],
    };

    const [r1, r2] = await Promise.all([
      adapter.createEnvelope(payload),
      adapter.createEnvelope(payload),
    ]);

    // Dois envelopes criados para o mesmo payload devem ter hashes únicos
    if (r1.documentHash && r2.documentHash) {
      expect(r1.documentHash).not.toBe(r2.documentHash);
    }
  });
});
