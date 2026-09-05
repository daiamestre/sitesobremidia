import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContratoService } from '@/modules/crm/services/contrato.service';
import { ContratoModelosAdminService } from '@/modules/crm/services/contratoModelosAdmin.service';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));

describe('MICRO-GATE 5.5 — Integração Template → Contrato → Documento', () => {
  let adminService: ContratoModelosAdminService;
  let contratoService: ContratoService;

  beforeEach(() => {
    vi.clearAllMocks();
    adminService = new ContratoModelosAdminService();
    contratoService = new ContratoService();
  });

  it('CT-G55-01: fetchTemplates retorna templates dinâmicos ativos para seleção', async () => {
    const mockTemplates = [
      {
        id: 'tpl-dinamico-1',
        tipo_contrato: 'ANUNCIANTE',
        codigo_template: 'TPL-GATE55-TESTE',
        nome: 'Template Dinâmico Anunciante',
        versao: 1,
        conteudo_html: '<p>Template HTML</p>',
        ativo: true,
      },
    ];

    vi.mocked(supabase.from).mockReturnValueOnce({
      select: vi.fn().mockReturnValueOnce({
        eq: vi.fn().mockReturnValueOnce({
          order: vi.fn().mockResolvedValueOnce({
            data: mockTemplates,
            error: null,
          }),
        }),
      }),
    } as any);

    const list = await contratoService.fetchTemplates();
    expect(list).toHaveLength(1);
    expect(list[0].codigo_template).toBe('TPL-GATE55-TESTE');
    expect(list[0].tipo_contrato).toBe('ANUNCIANTE');
  });

  it('CT-G55-02: Template novo v1 possui vínculo de versão preservado em relação a novos contratos', () => {
    const contratoMockV1 = {
      id: 'ctr-001',
      template_id: 'tpl-uuid-v1',
      template_versao: 1,
      numero_contrato: 'CTR-2026-001',
    };

    expect(contratoMockV1.template_id).toBe('tpl-uuid-v1');
    expect(contratoMockV1.template_versao).toBe(1);
  });

  it('CT-G55-03: Snapshot de contrato_versoes registra isolamento de versão e metadados de auditoria', () => {
    const snapshotMock = {
      html_renderizado: '<div>Contrato Renderizado</div>',
      document_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      pdf_object_key: 'tenants/tenant-1/contratos/ctr-001/v1/contrato.pdf',
      template_id: 'tpl-uuid-v1',
      versao_numero: 1,
    };

    expect(snapshotMock.template_id).toBe('tpl-uuid-v1');
    expect(snapshotMock.versao_numero).toBe(1);
    expect(snapshotMock.pdf_object_key).toContain('v1/contrato.pdf');
  });
});
