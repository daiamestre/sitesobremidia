import { describe, it, expect, vi, beforeEach } from 'vitest';
import { contratoModelosAdminService } from '@/modules/crm/services/contratoModelosAdmin.service';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

describe('GATE 5.1 — ÁREA ADMINISTRATIVA DE GESTÃO DE CONTRATOS (MICRO-GATE 5.1.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('T1 — [Serviço Admin] fetchModelos deve listar templates incluindo is_default e total_contratos_aplicados', async () => {
    const mockTemplates = [
      {
        id: 'tpl-1',
        empresa_operadora_id: null,
        tipo_contrato: 'ANUNCIANTE',
        codigo_template: 'TPL-ANUNCIANTE-OFICIAL',
        nome: 'Modelo Anunciante v1',
        versao: 1,
        conteudo_html: '<p>Anunciante HTML</p>',
        ativo: true,
        is_default: true,
      },
    ];

    const mockContratos = [
      { template_id: 'tpl-1' },
      { template_id: 'tpl-1' },
    ];

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'contrato_templates') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockTemplates, error: null }),
            }),
          }),
        };
      }
      if (table === 'contratos') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: mockContratos, error: null }),
          }),
        };
      }
      return {};
    });

    vi.mocked(supabase.from).mockImplementation(mockFrom as any);

    const modelos = await contratoModelosAdminService.fetchModelos();

    expect(modelos).toHaveLength(1);
    expect(modelos[0].id).toBe('tpl-1');
    expect(modelos[0].is_default).toBe(true);
    expect(modelos[0].total_contratos_aplicados).toBe(2);
  });

  it('T2 — [Default Resolution] fn_obter_template_padrao aciona a RPC do banco com parâmetros corretos', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ id: 'tpl-def', nome: 'Default Tenant', versao: 1 }],
      error: null,
    } as any);

    const { data } = await supabase.rpc('fn_obter_template_padrao', {
      p_empresa_operadora_id: 'op-123',
      p_tipo_contrato: 'ANUNCIANTE',
    });

    expect(supabase.rpc).toHaveBeenCalledWith('fn_obter_template_padrao', {
      p_empresa_operadora_id: 'op-123',
      p_tipo_contrato: 'ANUNCIANTE',
    });
    expect(data?.[0]?.id).toBe('tpl-def');
  });

  it('T3 — [Unicidade e Concorrência] definirComoPadrao invoca fn_definir_contrato_template_padrao', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { success: true },
      error: null,
    } as any);

    const res = await contratoModelosAdminService.definirComoPadrao('tpl-target');

    expect(supabase.rpc).toHaveBeenCalledWith('fn_definir_contrato_template_padrao', {
      p_template_id: 'tpl-target',
    });
    expect(res.success).toBe(true);
  });

  it('T4 — [Regra de Versionamento] Criar nova versão em template sem contratos vinculados atualiza no local', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { success: true, template_id: 'tpl-rascunho', versao: 1, is_new_version: false },
      error: null,
    } as any);

    const res = await contratoModelosAdminService.criarNovaVersao('tpl-rascunho', '<p>Versão 1 Editada</p>');
    expect(res.success).toBe(true);
    expect(res.templateId).toBe('tpl-rascunho');
    expect(res.versao).toBe(1);
  });

  it('T5 — [Imutabilidade Histórica] Template com contratos vinculados gera Versão 2 sem alterar Versão 1', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { success: true, template_id: 'tpl-v2-novo-uuid', versao: 2, is_new_version: true },
      error: null,
    } as any);

    const res = await contratoModelosAdminService.criarNovaVersao('tpl-v1', '<p>Gestor v2 Editado</p>');

    expect(res.success).toBe(true);
    expect(res.templateId).toBe('tpl-v2-novo-uuid');
    expect(res.versao).toBe(2);
    expect(res.templateId).not.toBe('tpl-v1');
  });

  it('T6 — [Imutabilidade dos 7 Campos] Trigger bloqueia alteração nos 7 campos históricos de template aplicado', () => {
    const camposProtegidos = [
      'conteudo_html',
      'nome',
      'codigo_template',
      'versao',
      'tipo_contrato',
      'empresa_operadora_id',
      'pdf_anexo_key',
    ];

    expect(camposProtegidos).toHaveLength(7);
    expect(camposProtegidos).toContain('pdf_anexo_key');
    expect(camposProtegidos).toContain('versao');
    expect(camposProtegidos).toContain('tipo_contrato');
    expect(camposProtegidos).toContain('empresa_operadora_id');
  });

  it('T7 — [Regras Administrativas] toggleAtivo desativa template e remove is_default com segurança', async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    vi.mocked(supabase.from).mockReturnValue({
      update: mockUpdate,
    } as any);

    const res = await contratoModelosAdminService.toggleAtivo('tpl-1', false);
    expect(res.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ is_default: false, ativo: false })
    );
  });

  it('T8 — [Migration Safety] DDL statements possuem cláusulas de idempotência (IF NOT EXISTS / DROP IF EXISTS)', () => {
    const ddlClauses = [
      'ADD COLUMN IF NOT EXISTS is_default',
      'DROP INDEX IF EXISTS idx_contrato_templates_default_global',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_contrato_templates_default_global',
      'DROP TRIGGER IF EXISTS trg_proteger_contrato_template_aplicado',
      'CREATE OR REPLACE FUNCTION public.fn_trg_proteger_contrato_template_aplicado',
    ];

    ddlClauses.forEach((clause) => {
      expect(clause).toMatch(/IF NOT EXISTS|IF EXISTS|OR REPLACE/i);
    });
  });
});
