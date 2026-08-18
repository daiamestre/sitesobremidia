import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignatureProviderAdapter, SignatureProviderName } from '@/modules/crm/services/digitalSignature.service';
import { contratoDocumentoService } from '@/modules/crm/services/contratoDocumento.service';

// ─── Mock do fluxo interno real ───────────────────────────────────────────────
vi.mock('@/modules/crm/services/contratoDocumento.service', () => ({
  contratoDocumentoService: {
    criarEnvelopeInterno: vi.fn().mockResolvedValue({
      success: true,
      assinaturaId: 'sig-01',
      envelopeId: 'ENV-SM-ABC-123',
    }),
    obterUrlDownload: vi.fn().mockResolvedValue('https://url-teste/documento.pdf'),
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'sig-01',
          status: 'ENVIADO',
          document_hash: 'abc123',
          signatario_nome: 'João Silva',
          signatario_email: 'joao@empresa.com',
        },
        error: null,
      }),
    })),
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

  it('provedor externo sem credenciais deve recusar explicitamente (sem envelope falso)', async () => {
    const result = await adapter.createEnvelope(BASE_PAYLOAD);
    expect(result.success).toBe(false);
    expect(result.error).toContain('não configurado');
    expect(result.envelopeId).toBeUndefined();
    expect(contratoDocumentoService.criarEnvelopeInterno).not.toHaveBeenCalled();
  });

  it('DOCUSIGN deve recusar explicitamente (sem envelope falso)', async () => {
    const docuAdapter = new SignatureProviderAdapter('DOCUSIGN');
    const result = await docuAdapter.createEnvelope({ ...BASE_PAYLOAD, provedor: 'DOCUSIGN' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('DOCUSIGN');
    expect(result.envelopeId).toBeUndefined();
  });

  it('ASSINADOR_INTERNO deve delegar ao criarEnvelopeInterno real', async () => {
    const internoAdapter = new SignatureProviderAdapter('ASSINADOR_INTERNO');
    const result = await internoAdapter.createEnvelope({
      ...BASE_PAYLOAD,
      provedor: 'ASSINADOR_INTERNO',
      usuarioId: 'usuario-uuid-01',
    });
    expect(contratoDocumentoService.criarEnvelopeInterno).toHaveBeenCalledWith('contrato-uuid-01', 'usuario-uuid-01');
    expect(result.success).toBe(true);
    expect(result.assinaturaId).toBe('sig-01');
    expect(result.envelopeId).toBe('ENV-SM-ABC-123');
  });

  it('ASSINADOR_INTERNO deve retornar erro quando o envio falha', async () => {
    vi.mocked(contratoDocumentoService.criarEnvelopeInterno).mockResolvedValueOnce({
      success: false,
      error: 'Gere o documento do contrato antes de enviar para assinatura.',
    });
    const internoAdapter = new SignatureProviderAdapter('ASSINADOR_INTERNO');
    const result = await internoAdapter.createEnvelope({
      ...BASE_PAYLOAD,
      provedor: 'ASSINADOR_INTERNO',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Gere o documento');
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
});
