import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContratoModelosAdminService } from '@/modules/crm/services/contratoModelosAdmin.service';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

describe('MICRO-GATE 05.4 — Criação Segura de Modelos via RPC', () => {
  let service: ContratoModelosAdminService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ContratoModelosAdminService();
  });

  it('CT-054-RPC-01: criarModelo chama a RPC fn_criar_modelo_contrato_template com parâmetros corretos e normalizados', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        template_id: '12345678-1234-1234-1234-123456789abc',
        id: '12345678-1234-1234-1234-123456789abc',
        codigo_template: 'TPL-TESTE-NOVO',
        nome: 'Modelo Teste Unitário',
        tipo_contrato: 'ANUNCIANTE',
        versao: 1,
        empresa_operadora_id: null,
        is_default: true,
      },
      error: null,
    } as any);

    const res = await service.criarModelo({
      tipoContrato: 'ANUNCIANTE',
      codigoTemplate: ' tpl-teste-novo ',
      nome: ' Modelo Teste Unitário ',
      descricao: ' Descrição Teste ',
      conteudoHtml: '<div>[Razão Social do Contratante]</div>',
      isDefault: true,
    });

    expect(supabase.rpc).toHaveBeenCalledWith('fn_criar_modelo_contrato_template', {
      p_tipo_contrato: 'ANUNCIANTE',
      p_codigo_template: 'TPL-TESTE-NOVO',
      p_nome: 'Modelo Teste Unitário',
      p_conteudo_html: '<div>[Razão Social do Contratante]</div>',
      p_descricao: 'Descrição Teste',
      p_empresa_operadora_id: null,
      p_is_default: true,
    });

    expect(res.success).toBe(true);
    expect(res.templateId).toBe('12345678-1234-1234-1234-123456789abc');
  });

  it('CT-054-RPC-02: criarModelo rejeita se RPC retornar success: false com erro de permissão ou tenant', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: false,
        error: 'Acesso Negado: Administrador não pode criar modelo para outro tenant.',
      },
      error: null,
    } as any);

    const res = await service.criarModelo({
      tipoContrato: 'PARCEIRO',
      codigoTemplate: 'TPL-CROSS',
      nome: 'Cross Model',
      conteudoHtml: '<p>Teste</p>',
      empresaOperadoraId: '99999999-9999-9999-9999-999999999999',
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe('Acesso Negado: Administrador não pode criar modelo para outro tenant.');
  });

  it('CT-054-RPC-03: criarModelo bloqueia campos desconhecidos antes de invocar a RPC', async () => {
    const res = await service.criarModelo({
      tipoContrato: 'ANUNCIANTE',
      codigoTemplate: 'TPL-FAIL',
      nome: 'Invalid Placeholders',
      conteudoHtml: '<p>{{PLACEHOLDER_TOTALMENTE_INVALIDO}}</p>',
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('Campo de contrato não reconhecido ou sem origem configurada');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('CT-054-RPC-04: criarModelo usa fallback canônico completo quando HTML nasce vazio', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        template_id: 'tpl-completo-id',
      },
      error: null,
    } as any);

    const res = await service.criarModelo({
      tipoContrato: 'ANUNCIANTE',
      codigoTemplate: 'TPL-EMPTY',
      nome: 'Empty Test',
      conteudoHtml: '   ',
    });

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    const [rpcName, params] = vi.mocked(supabase.rpc).mock.calls[0];
    expect(rpcName).toBe('fn_criar_modelo_contrato_template');
    expect(params.p_tipo_contrato).toBe('ANUNCIANTE');
    expect(params.p_codigo_template).toBe('TPL-EMPTY');
    expect(params.p_nome).toBe('Empty Test');
    expect(params.p_conteudo_html).toContain('CLÁUSULA 01 - NOSSO SERVIÇO');
    expect(res.success).toBe(true);
    expect(res.templateId).toBe('tpl-completo-id');
  });
});
