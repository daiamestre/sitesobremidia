import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { contratoService } from '@/modules/crm/services/contrato.service';
import { resolveContractTypeFromCadastroType, getOfficialPdfForCadastro } from '@/modules/crm/services/contractResolver.service';

vi.mock('@/integrations/supabase/client', () => {
  return {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn(),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'usr-tester-uuid' } } }),
      },
    },
  };
});

describe('MICRO-GATE 5.6.1 — Diagnóstico e Correção do Vínculo Automático de Contratos no Cadastro', () => {
  const TENANT_A = '11111111-1111-1111-1111-111111111111';
  const TENANT_B = '22222222-2222-2222-2222-222222222222';
  const TEMPLATE_ANUNCIANTE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const TEMPLATE_PARCEIRO_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const TEMPLATE_GESTOR_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TESTE 1 — ANUNCIANTE
  // ──────────────────────────────────────────────────────────────────────────
  it('TESTE 1 — ANUNCIANTE: resolver encontra template correto, template_id válido e vincula contrato', async () => {
    const tipo = resolveContractTypeFromCadastroType('ANUNCIANTE');
    expect(tipo).toBe('ANUNCIANTE');

    const pdf = getOfficialPdfForCadastro('ANUNCIANTE');
    expect(pdf).toBeDefined();
    expect(pdf?.tipoContrato).toBe('ANUNCIANTE');
    expect(pdf?.publicPath).toBe('/official-contracts/contrato-anunciante.pdf');

    vi.mocked(supabase.rpc).mockImplementation((fnName: string, args: any) => {
      if (fnName === 'fn_obter_template_padrao' && args?.p_tipo_contrato === 'ANUNCIANTE') {
        return Promise.resolve({
          data: [{ id: TEMPLATE_ANUNCIANTE_ID, nome: 'Contrato Anunciante Oficial', versao: 1, conteudo_html: '<p>Contrato Anunciante</p>' }],
          error: null,
        } as any);
      }
      if (fnName === 'fn_gerar_numero_contrato_atomo') {
        return Promise.resolve({ data: 'CTR-2026-0001', error: null } as any);
      }
      return Promise.resolve({ data: null, error: null } as any);
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      const b: any = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockImplementation(() => ({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'ctr-anunciante-novo-id' }, error: null }),
          }),
        })),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'ctr-anunciante-novo-id' }, error: null }),
        maybeSingle: vi.fn().mockImplementation(() => {
          if (table === 'clientes') {
            return Promise.resolve({ data: { id: 'cli-001', empresa_operadora_id: TENANT_A, representante_id: null }, error: null });
          }
          if (table === 'contratos') {
            return Promise.resolve({ data: null, error: null });
          }
          if (table === 'empresas') {
            return Promise.resolve({ data: { id: 'emp-001' }, error: null });
          }
          return Promise.resolve({ data: { empresa_operadora_id: TENANT_A }, error: null });
        }),
      };
      return b;
    });

    const res = await contratoService.ensureContractForCadastro({
      cadastroType: 'ANUNCIANTE',
      clienteId: 'cli-001',
      usuarioResponsavelId: 'usr-tester-uuid',
    });

    expect(res.success).toBe(true);
    expect(res.contratoId).toBe('ctr-anunciante-novo-id');
    expect(res.tipoContrato).toBe('ANUNCIANTE');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TESTE 2 — PONTO PARCEIRO
  // ──────────────────────────────────────────────────────────────────────────
  it('TESTE 2 — PONTO PARCEIRO: resolver encontra template correto, template_id válido e vincula contrato', async () => {
    const tipo = resolveContractTypeFromCadastroType('PONTO_PARCEIRO');
    expect(tipo).toBe('PARCEIRO');

    const pdf = getOfficialPdfForCadastro('PONTO_PARCEIRO');
    expect(pdf).toBeDefined();
    expect(pdf?.tipoContrato).toBe('PARCEIRO');
    expect(pdf?.publicPath).toBe('/official-contracts/contrato-parceria.pdf');

    vi.mocked(supabase.rpc).mockImplementation((fnName: string, args: any) => {
      if (fnName === 'fn_obter_template_padrao' && args?.p_tipo_contrato === 'PARCEIRO') {
        return Promise.resolve({
          data: [{ id: TEMPLATE_PARCEIRO_ID, nome: 'Contrato Parceria Oficial', versao: 1, conteudo_html: '<p>Contrato Parceria</p>' }],
          error: null,
        } as any);
      }
      if (fnName === 'fn_gerar_numero_contrato_atomo') {
        return Promise.resolve({ data: 'CTR-2026-0002', error: null } as any);
      }
      return Promise.resolve({ data: null, error: null } as any);
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      const b: any = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockImplementation(() => ({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'ctr-parceiro-novo-id' }, error: null }),
          }),
        })),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'ctr-parceiro-novo-id' }, error: null }),
        maybeSingle: vi.fn().mockImplementation(() => {
          if (table === 'pontos') {
            return Promise.resolve({ data: { id: 'ponto-001', empresa_operadora_id: TENANT_A }, error: null });
          }
          if (table === 'contratos') {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: { empresa_operadora_id: TENANT_A }, error: null });
        }),
      };
      return b;
    });

    const res = await contratoService.ensureContractForCadastro({
      cadastroType: 'PONTO_PARCEIRO',
      pontoId: 'ponto-001',
      usuarioResponsavelId: 'usr-tester-uuid',
    });

    expect(res.success).toBe(true);
    expect(res.contratoId).toBe('ctr-parceiro-novo-id');
    expect(res.tipoContrato).toBe('PARCEIRO');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TESTE 3 — GESTOR & ALIAS GESTOR_MIDIAS
  // ──────────────────────────────────────────────────────────────────────────
  it('TESTE 3 — GESTOR: resolver mapeia GESTOR e GESTOR_MIDIAS para GESTOR e vincula contrato', async () => {
    expect(resolveContractTypeFromCadastroType('GESTOR')).toBe('GESTOR');
    expect(resolveContractTypeFromCadastroType('GESTOR_MIDIAS')).toBe('GESTOR');

    const pdf = getOfficialPdfForCadastro('GESTOR_MIDIAS');
    expect(pdf).toBeDefined();
    expect(pdf?.tipoContrato).toBe('GESTOR');
    expect(pdf?.publicPath).toBe('/official-contracts/contrato-gestor.pdf');

    vi.mocked(supabase.rpc).mockImplementation((fnName: string, args: any) => {
      if (fnName === 'fn_obter_template_padrao' && args?.p_tipo_contrato === 'GESTOR') {
        return Promise.resolve({
          data: [{ id: TEMPLATE_GESTOR_ID, nome: 'Contrato Gestão Oficial', versao: 1, conteudo_html: '<p>Contrato Gestor</p>' }],
          error: null,
        } as any);
      }
      if (fnName === 'fn_gerar_numero_contrato_atomo') {
        return Promise.resolve({ data: 'CTR-2026-0003', error: null } as any);
      }
      return Promise.resolve({ data: null, error: null } as any);
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      const b: any = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockImplementation(() => ({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'ctr-gestor-novo-id' }, error: null }),
          }),
        })),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'ctr-gestor-novo-id' }, error: null }),
        maybeSingle: vi.fn().mockImplementation(() => {
          if (table === 'usuarios') {
            return Promise.resolve({ data: { id: 'usr-tester-uuid', empresa_operadora_id: TENANT_A }, error: null });
          }
          if (table === 'contratos') {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: { empresa_operadora_id: TENANT_A }, error: null });
        }),
      };
      return b;
    });

    const res = await contratoService.ensureContractForCadastro({
      cadastroType: 'GESTOR_MIDIAS',
      gestorUsuarioId: 'usr-gestor-001',
      usuarioResponsavelId: 'usr-tester-uuid',
    });

    expect(res.success).toBe(true);
    expect(res.contratoId).toBe('ctr-gestor-novo-id');
    expect(res.tipoContrato).toBe('GESTOR');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TESTE 4 — TEMPLATE INEXISTENTE
  // ──────────────────────────────────────────────────────────────────────────
  it('TESTE 4 — TEMPLATE INEXISTENTE: cadastro NÃO conclui com sucesso e retorna erro explícito', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as any);

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      const b: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockImplementation(() => {
          if (table === 'clientes') {
            return Promise.resolve({ data: { id: 'cli-sem-template', empresa_operadora_id: TENANT_A }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };
      return b;
    });

    const res = await contratoService.ensureContractForCadastro({
      cadastroType: 'ANUNCIANTE',
      clienteId: 'cli-sem-template',
      usuarioResponsavelId: 'usr-tester-uuid',
    });

    expect(res.success).toBe(false);
    expect(res.contratoId).toBeUndefined();
    expect(res.error).toMatch(/Template oficial ANUNCIANTE não encontrado/i);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TESTE 5 — TEMPLATE ID INVÁLIDO
  // ──────────────────────────────────────────────────────────────────────────
  it('TESTE 5 — TEMPLATE ID INVÁLIDO: rejeita template sem ID ou com string vazia', async () => {
    const res = await contratoService.selectContractModel({
      tipoContrato: 'ANUNCIANTE',
      templateId: '',
      templateNome: 'Template Sem ID',
      templateVersao: 1,
      usuarioResponsavelId: 'usr-tester-uuid',
      clienteId: 'cli-001',
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Template ID inválido ou ausente/i);

    const resDesconhecido = await contratoService.ensureContractForCadastro({
      cadastroType: 'DESCONHECIDO' as any,
      clienteId: 'cli-001',
      usuarioResponsavelId: 'usr-tester-uuid',
    });

    expect(resDesconhecido.success).toBe(false);
    expect(resDesconhecido.error).toMatch(/Tipo de cadastro inválido/i);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TESTE 6 — TENANT ISOLATION
  // ──────────────────────────────────────────────────────────────────────────
  it('TESTE 6 — TENANT ISOLATION: templates de outro tenant não vazam na resolução', async () => {
    const templatesBanco = [
      { id: 'tpl-tenant-a', empresa_operadora_id: TENANT_A, tipo_contrato: 'ANUNCIANTE', is_default: true, ativo: true },
      { id: 'tpl-tenant-b', empresa_operadora_id: TENANT_B, tipo_contrato: 'ANUNCIANTE', is_default: true, ativo: true },
    ];

    vi.mocked(supabase.rpc).mockImplementation((fnName: string, args: any) => {
      if (fnName === 'fn_obter_template_padrao') {
        const found = templatesBanco.filter(
          (t) => t.empresa_operadora_id === args?.p_empresa_operadora_id && t.tipo_contrato === args?.p_tipo_contrato
        );
        return Promise.resolve({ data: found, error: null } as any);
      }
      if (fnName === 'fn_gerar_numero_contrato_atomo') {
        return Promise.resolve({ data: 'CTR-2026-0004', error: null } as any);
      }
      return Promise.resolve({ data: null, error: null } as any);
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      const b: any = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockImplementation(() => ({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'ctr-tenant-a-id' }, error: null }),
          }),
        })),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'ctr-tenant-a-id' }, error: null }),
        maybeSingle: vi.fn().mockImplementation(() => {
          if (table === 'clientes') {
            return Promise.resolve({ data: { id: 'cli-tenant-a', empresa_operadora_id: TENANT_A }, error: null });
          }
          if (table === 'contratos') {
            return Promise.resolve({ data: null, error: null });
          }
          if (table === 'empresas') {
            return Promise.resolve({ data: { id: 'emp-001' }, error: null });
          }
          return Promise.resolve({ data: { empresa_operadora_id: TENANT_A }, error: null });
        }),
      };
      return b;
    });

    const res = await contratoService.ensureContractForCadastro({
      cadastroType: 'ANUNCIANTE',
      clienteId: 'cli-tenant-a',
      usuarioResponsavelId: 'usr-tester-uuid',
    });

    expect(res.success).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith('fn_obter_template_padrao', {
      p_empresa_operadora_id: TENANT_A,
      p_tipo_contrato: 'ANUNCIANTE',
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TESTE 7 — REGRESSÃO & IDEMPOTÊNCIA
  // ──────────────────────────────────────────────────────────────────────────
  it('TESTE 7 — REGRESSÃO & IDEMPOTÊNCIA: contrato existente com template_id válido é preservado', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      const b: any = {
        select: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: 'ctr-existente-001',
            numero_contrato: 'CTR-2026-0001',
            template_id: TEMPLATE_ANUNCIANTE_ID,
            template_versao: 1,
            tipo_contrato: 'ANUNCIANTE',
          },
          error: null,
        }),
      };
      return b;
    });

    const res = await contratoService.ensureContractForCadastro({
      cadastroType: 'ANUNCIANTE',
      clienteId: 'cli-001',
      usuarioResponsavelId: 'usr-tester-uuid',
    });

    expect(res.success).toBe(true);
    expect(res.contratoId).toBe('ctr-existente-001');
    expect(res.tipoContrato).toBe('ANUNCIANTE');
  });
});
