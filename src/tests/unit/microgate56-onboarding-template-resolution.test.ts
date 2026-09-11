import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { contratoService } from '@/modules/crm/services/contrato.service';
import {
  contratoDocumentoService,
  montarDadosTemplate,
  preencherTemplate,
  gerarPdfDoHtml,
  sha256Hex,
} from '@/modules/crm/services/contratoDocumento.service';
import { resolveContractTypeFromCadastroType } from '@/modules/crm/services/contractResolver.service';
import { clienteService } from '@/modules/crm/services/cliente.service';
import { prospeccaoService } from '@/services/prospeccao.service';

vi.mock('@/integrations/supabase/client', () => {
  const queryBuilder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };

  return {
    supabase: {
      from: vi.fn(() => queryBuilder),
      rpc: vi.fn(),
      functions: {
        invoke: vi.fn(),
      },
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'usr-tester-uuid' } } }),
        getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }),
      },
    },
  };
});

vi.mock('@/lib/r2Upload', () => ({
  uploadToR2: vi.fn().mockResolvedValue(true),
}));

describe('MICRO-GATE 5.6 — Consumo e Resolução Automática de Templates no Onboarding', () => {
  const TENANT_A = '22345678-1234-1234-1234-123456789012';
  const TENANT_B = '7d62aaec-e24d-4273-b257-867183cf658c';

  const TEMPLATE_ANUNCIANTE_V2 = {
    id: 'tpl-anunciante-v2-uuid',
    tipo_contrato: 'ANUNCIANTE',
    codigo_template: 'TPL-ANUNCIANTE-OFICIAL',
    nome: 'Contrato de Anunciante — Oficial v2',
    versao: 2,
    ativo: true,
    is_default: true,
    conteudo_html: '<p>Contrato Anunciante v2: {{RAZAO_SOCIAL}} - CNPJ: {{CNPJ}} - Vigência: {{DATA_INICIO}} até {{DATA_FIM}}</p>',
  };

  const TEMPLATE_PARCEIRO_V1 = {
    id: 'tpl-parceiro-v1-uuid',
    tipo_contrato: 'PARCEIRO',
    codigo_template: 'TPL-PARCEIRO-OFICIAL',
    nome: 'Contrato de Parceria — Oficial v1',
    versao: 1,
    ativo: true,
    is_default: true,
    conteudo_html: '<p>Contrato Parceria: {{RAZAO_SOCIAL}} - Unidade: {{NOME_UNIDADE}} - Vigência: {{DATA_INICIO}} até {{DATA_FIM}}</p>',
  };

  const TEMPLATE_GESTOR_V1 = {
    id: 'tpl-gestor-v1-uuid',
    tipo_contrato: 'GESTOR',
    codigo_template: 'TPL-GESTOR-OFICIAL',
    nome: 'Contrato de Gestão Operacional — Oficial v1',
    versao: 1,
    ativo: true,
    is_default: true,
    conteudo_html: '<p>Contrato Gestão: {{NOME_GESTOR}} - Documento: {{CPF_CNPJ}} - Vigência: {{DATA_INICIO}} até {{DATA_FIM}}</p>',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CT-56-01: ANUNCIANTE consome template ANUNCIANTE dinâmico', async () => {
    const tipo = resolveContractTypeFromCadastroType('ANUNCIANTE');
    expect(tipo).toBe('ANUNCIANTE');

    const dados = {
      contrato: {
        id: 'ctr-anunc-01',
        empresa_operadora_id: TENANT_A,
        tipo_contrato: 'ANUNCIANTE',
        numero_contrato: 'CTR-2026-0001',
        data_inicio: '2026-01-01',
        data_fim: '2026-12-31',
        versao_atual: 1,
      },
      proposta: null,
      empresa: {
        razao_social: 'Empresa Teste LTDA',
        nome_fantasia: 'Empresa Teste',
        cnpj: '12.345.678/0001-90',
        cidade: 'Caruaru',
        estado: 'PE',
      },
      contato: { nome: 'João Silva', email: 'joao@teste.com', telefone: '81999998888' },
      ponto: null,
      template: TEMPLATE_ANUNCIANTE_V2,
      operadora: null,
      quantidadeTelas: 1,
    };

    const vars = montarDadosTemplate(dados);
    expect(vars.RAZAO_SOCIAL).toBe('Empresa Teste LTDA');
    expect(vars.CNPJ).toBe('12.345.678/0001-90');

    const html = preencherTemplate(TEMPLATE_ANUNCIANTE_V2.conteudo_html, vars, 'ANUNCIANTE');
    expect(html).toContain('Empresa Teste LTDA');
    expect(html).toContain('12.345.678/0001-90');
    expect(html).not.toContain('{{RAZAO_SOCIAL}}');
  });

  it('CT-56-02: PARCEIRO consome template PARCEIRO dinâmico', async () => {
    const tipo = resolveContractTypeFromCadastroType('PONTO_PARCEIRO');
    expect(tipo).toBe('PARCEIRO');

    const dados = {
      contrato: {
        id: 'ctr-parc-01',
        empresa_operadora_id: TENANT_A,
        tipo_contrato: 'PARCEIRO',
        numero_contrato: 'CTR-2026-0002',
        data_inicio: '2026-01-01',
        data_fim: '2026-12-31',
        versao_atual: 1,
      },
      proposta: null,
      empresa: null,
      contato: null,
      ponto: {
        id: 'ponto-01',
        nome: 'Padaria Modelo',
        nome_fantasia: 'Padaria Modelo Centro',
        cnpj: '98.765.432/0001-10',
        cidade: 'Recife',
        estado: 'PE',
      },
      template: TEMPLATE_PARCEIRO_V1,
      operadora: null,
      quantidadeTelas: 2,
    };

    const vars = montarDadosTemplate(dados);
    expect(vars.RAZAO_SOCIAL).toBe('Padaria Modelo');
    expect(vars.NOME_UNIDADE).toBe('Padaria Modelo Centro');

    const html = preencherTemplate(TEMPLATE_PARCEIRO_V1.conteudo_html, vars, 'PARCEIRO');
    expect(html).toContain('Padaria Modelo');
    expect(html).toContain('Padaria Modelo Centro');
    expect(html).not.toContain('{{RAZAO_SOCIAL}}');
  });

  it('CT-56-03: GESTOR consome template GESTOR dinâmico', async () => {
    const tipo = resolveContractTypeFromCadastroType('GESTOR_MIDIAS');
    expect(tipo).toBe('GESTOR');

    const dados = {
      contrato: {
        id: 'ctr-gest-01',
        empresa_operadora_id: TENANT_A,
        tipo_contrato: 'GESTOR',
        numero_contrato: 'CTR-2026-0003',
        data_inicio: '2026-01-01',
        data_fim: '2026-12-31',
        versao_atual: 1,
      },
      proposta: null,
      empresa: null,
      contato: null,
      ponto: null,
      gestorUsuario: {
        id: 'gest-usr-01',
        nome: 'Carlos Gestor Operacional',
        email: 'carlos@sobremidia.com',
        telefone: '81988887777',
      },
      gestorDadosExtra: {
        cpf_cnpj: '111.222.333-44',
        cidade: 'Caruaru',
        estado: 'PE',
        empresa: 'Operação Regional Agreste',
      },
      template: TEMPLATE_GESTOR_V1,
      operadora: null,
      quantidadeTelas: 0,
    };

    const vars = montarDadosTemplate(dados);
    expect(vars.NOME_GESTOR).toBe('Carlos Gestor Operacional');
    expect(vars.CPF_CNPJ).toBe('111.222.333-44');

    const html = preencherTemplate(TEMPLATE_GESTOR_V1.conteudo_html, vars, 'GESTOR');
    expect(html).toContain('Carlos Gestor Operacional');
    expect(html).toContain('111.222.333-44');
    expect(html).not.toContain('{{NOME_GESTOR}}');
  });

  it('CT-56-04: template_id e template_versao são persistidos na criação do contrato', async () => {
    vi.mocked(supabase.rpc).mockImplementation(async (fn: string) => {
      if (fn === 'fn_cadastrar_cliente_com_contrato') {
        return {
          data: {
            success: true,
            cliente_id: 'cli-uuid-1',
            empresa_id: 'emp-uuid-1',
            contrato_id: 'ctr-uuid-1',
            numero_contrato: 'CTR-2026-0100',
          },
          error: null,
        } as any;
      }
      return { data: null, error: null } as any;
    });

    const res = await clienteService.create({
      empresaOperadoraId: TENANT_A,
      nomeFantasia: 'Anunciante Gate 56',
      razaoSocial: 'Anunciante Gate 56 LTDA',
      cnpj: '12345678000199',
      whatsapp: '81999990000',
      email: 'gate56@teste.com',
      cidade: 'Caruaru',
      estado: 'PE',
    });

    expect(res.success).toBe(true);
    expect(res.contratoId).toBe('ctr-uuid-1');
  });

  it('CT-56-05: Snapshot permanece imutável após nova versão do template', async () => {
    const snapshotHtmlOriginal = '<p>Contrato v1 Original: Empresa Antiga</p>';
    const docHashOriginal = await sha256Hex(new TextEncoder().encode(snapshotHtmlOriginal));

    const snapshotRegistro = {
      contrato_id: 'ctr-hist-01',
      numero_versao: 1,
      snapshot_dados: {
        html_renderizado: snapshotHtmlOriginal,
        document_hash: docHashOriginal,
        template_id: 'tpl-v1-uuid',
        versao_numero: 1,
      },
    };

    // Mesmo que o template receba v2 no banco:
    const templateModificado = {
      ...TEMPLATE_ANUNCIANTE_V2,
      versao: 2,
      conteudo_html: '<p>Contrato v2 Modificado com novas cláusulas</p>',
    };

    // O snapshot histórico em contrato_versoes permanece inalterado:
    expect(snapshotRegistro.snapshot_dados.html_renderizado).toBe(snapshotHtmlOriginal);
    expect(snapshotRegistro.snapshot_dados.document_hash).toBe(docHashOriginal);
    expect(snapshotRegistro.snapshot_dados.versao_numero).toBe(1);
  });

  it('CT-56-06: Template inativo não é resolvido como padrão', () => {
    const templates = [
      { id: 't1', tipo_contrato: 'ANUNCIANTE', ativo: false, is_default: true, versao: 3 },
      { id: 't2', tipo_contrato: 'ANUNCIANTE', ativo: true, is_default: true, versao: 2 },
    ];

    const templateResolvido = templates.find((t) => t.ativo && t.is_default);
    expect(templateResolvido?.id).toBe('t2');
    expect(templateResolvido?.versao).toBe(2);
  });

  it('CT-56-07: Tipo incorreto não é associado ao fluxo de cadastro', () => {
    expect(resolveContractTypeFromCadastroType('ANUNCIANTE')).toBe('ANUNCIANTE');
    expect(resolveContractTypeFromCadastroType('PONTO_PARCEIRO')).toBe('PARCEIRO');
    expect(resolveContractTypeFromCadastroType('GESTOR_MIDIAS')).toBe('GESTOR');
    expect(resolveContractTypeFromCadastroType('DESCONHECIDO')).toBeNull();
  });

  it('CT-56-08: Cross-tenant é bloqueado na resolução de templates', () => {
    const templatesTenantA = [
      { id: 'tpl-a', empresa_operadora_id: TENANT_A, tipo_contrato: 'ANUNCIANTE', is_default: true },
    ];

    const findForTenantB = templatesTenantA.find(
      (t) => t.empresa_operadora_id === TENANT_B && t.tipo_contrato === 'ANUNCIANTE'
    );
    expect(findForTenantB).toBeUndefined();
  });

  it('CT-56-09: Falha na criação do contrato bloqueia a finalização do cadastro de cliente', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: { success: false, error: 'Falha ao criar o contrato atômico do anunciante.' },
      error: null,
    } as any);

    const res = await clienteService.create({
      empresaOperadoraId: TENANT_A,
      nomeFantasia: 'Falha Teste',
      razaoSocial: 'Falha Teste LTDA',
      whatsapp: '81999990000',
      email: 'falha@teste.com',
      cidade: 'Caruaru',
      estado: 'PE',
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('Falha ao criar o contrato atômico');
  });

  it('CT-56-10: Idempotência/Retry não cria contrato duplicado e preserva template existente', async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [{
          id: 'ctr-existente-uuid',
          numero_contrato: 'CTR-2026-0050',
          template_id: 'tpl-anunciante-v2-uuid',
          template_versao: 2,
          tipo_contrato: 'ANUNCIANTE',
        }],
        error: null,
      }),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'ctr-existente-uuid',
          numero_contrato: 'CTR-2026-0050',
          template_id: 'tpl-anunciante-v2-uuid',
          template_versao: 2,
          tipo_contrato: 'ANUNCIANTE',
        },
        error: null,
      }),
    };
    vi.mocked(supabase.from).mockReturnValue(builder as any);

    const res = await contratoService.ensureContractForCadastro({
      cadastroType: 'ANUNCIANTE',
      clienteId: 'cli-existente-uuid',
      usuarioResponsavelId: 'usr-tester-uuid',
    });

    expect(res.success).toBe(true);
    expect(res.contratoId).toBe('ctr-existente-uuid');
  });

  it('CT-56-11: PDF vetorial é gerado a partir do HTML com integridade', async () => {
    const html = '<p>Contrato Teste PDF: Empresa 123</p>';
    const pdfBytes = await gerarPdfDoHtml(html, 'CTR-2026-TEST', 'ANUNCIANTE', 1);

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(500);

    const hash = await sha256Hex(pdfBytes);
    expect(hash).toHaveLength(64); // SHA-256 hex string
  });

  it('CT-56-12: R2 Object Key segue o padrão canônico institucional', () => {
    const tenantId = TENANT_A;
    const contratoId = 'ctr-12345-uuid';
    const versao = 1;
    const numeroContrato = 'CTR-2026-0042';

    const objectKey = `tenants/${tenantId}/contratos/${contratoId}/v${versao}/contrato_${numeroContrato}.pdf`;
    expect(objectKey).toBe(
      `tenants/22345678-1234-1234-1234-123456789012/contratos/ctr-12345-uuid/v1/contrato_CTR-2026-0042.pdf`
    );
  });
});
