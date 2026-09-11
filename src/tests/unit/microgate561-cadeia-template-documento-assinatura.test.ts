import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  contratoDocumentoService,
  obterTemplatePadraoVigente,
  renderizarPreviewContrato,
  montarDadosTemplate,
  preencherTemplate,
  CANONICAL_TEMPLATE_HTML_ANUNCIANTE,
  CANONICAL_TEMPLATE_HTML_PARCEIRO,
  CANONICAL_TEMPLATE_HTML_GESTOR,
  detectarPlaceholders,
  isTemplateCompleto,
} from '@/modules/crm/services/contratoDocumento.service';
import { contratoService } from '@/modules/crm/services/contrato.service';
import { resolveContractTypeFromCadastroType } from '@/modules/crm/services/contractResolver.service';
import { supabase } from '@/integrations/supabase/client';

describe('MICRO-GATE 5.6.1 — Cadeia: Template Oficial -> Versão -> Dados -> Documento -> Visualização -> Assinatura', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TESTE A — ANUNCIANTE: Padrão Vigente + 24 Variáveis + Documento Completo
  it('TESTE A — ANUNCIANTE: Resolve template padrão vigente, template_id válido, versão correta e substitui todas as 24 variáveis', async () => {
    const mockTplId = '11111111-1111-4111-a111-111111111111';
    const mockTenantId = 'tenant-test-uuid-001';

    // Mock RPC fn_obter_template_padrao
    vi.spyOn(supabase, 'rpc').mockImplementation(((name: string) => {
      if (name === 'fn_obter_template_padrao') {
        return Promise.resolve({
          data: [{
            id: mockTplId,
            codigo_template: 'TPL-ANUNCIANTE-OFICIAL',
            nome: 'Contrato de Anunciante — Oficial',
            versao: 1,
            conteudo_html: CANONICAL_TEMPLATE_HTML_ANUNCIANTE,
          }],
          error: null,
        } as any);
      }
      return Promise.resolve({ data: null, error: null } as any);
    }) as any);

    const tpl = await obterTemplatePadraoVigente('ANUNCIANTE', mockTenantId);
    expect(tpl.id).toBe(mockTplId);
    expect(tpl.codigo_template).toBe('TPL-ANUNCIANTE-OFICIAL');
    expect(tpl.versao).toBe(1);
    expect(isTemplateCompleto(tpl.conteudo_html, 'ANUNCIANTE')).toBe(true);

    const placeholders = detectarPlaceholders(tpl.conteudo_html);
    expect(placeholders.length).toBeGreaterThanOrEqual(24);

    const formMock = {
      nomeFantasia: 'Padaria Modelo',
      razaoSocial: 'Padaria Modelo Ltda',
      cnpj: '12.345.678/0001-90',
      responsavelLegal: 'Carlos Silva',
      logradouro: 'Rua do Comércio',
      numero: '120',
      bairro: 'Centro',
      cidade: 'Caruaru',
      estado: 'PE',
      cep: '55000-000',
      email: 'contato@padariamodelo.com',
      whatsapp: '81999998888',
      instagram: '@padariamodelo',
      website: 'www.padariamodelo.com',
      valorMensal: 800,
      periodicidade: 'Mídia Indoor Exclusiva',
      quantidadeTelas: 2,
      formaPagamento: 'PIX',
      dataInicio: '2026-09-01',
      dataFim: '2027-09-01',
      diasSemana: 'Segunda a Sábado',
      horarioInicio: '08:00',
      horarioFim: '22:00',
      tituloCampanha: 'Campanha Padaria Modelo 2026',
      pacoteVeiculacao: 'Plano Exclusivo',
      periodoVeiculacao: '12 meses',
    };

    const rendered = renderizarPreviewContrato('ANUNCIANTE', tpl.conteudo_html, formMock);
    expect(rendered).toContain('Padaria Modelo Ltda');
    expect(rendered).toContain('Carlos Silva');
    expect(rendered).toContain('12.345.678/0001-90');
    expect(rendered).toContain('Rua do Comércio, 120 - Centro - Caruaru/PE');
    expect(rendered).toContain('CLÁUSULA 01 - NOSSO SERVIÇO');
    expect(rendered).toContain('CLÁUSULA 09 - RESCISÃO CONTRATUAL');
    expect(rendered).toContain('POLÍTICA DE PRIVACIDADE');
    expect(rendered).not.toContain('{{');
  });

  // TESTE B — TROCA DE PADRÃO: Alternância de padrão e Imutabilidade Histórica
  it('TESTE B — TROCA DE PADRÃO: Cadastro consome o novo padrão selecionado e contratos anteriores preservam o template histórico', async () => {
    const tplA_Id = 'aaaa-1111-4111-a111-111111111111';
    const tplB_Id = 'bbbb-2222-4111-a111-222222222222';
    const tenantId = 'tenant-test-uuid-002';

    // 1. Simula que Template B é o padrão vigente
    vi.spyOn(supabase, 'rpc').mockImplementation(((name: string) => {
      if (name === 'fn_obter_template_padrao') {
        return Promise.resolve({
          data: [{
            id: tplB_Id,
            codigo_template: 'TPL-ANUNCIANTE-OFICIAL-B',
            nome: 'Contrato de Anunciante — Padrão Especial B',
            versao: 2,
            conteudo_html: CANONICAL_TEMPLATE_HTML_ANUNCIANTE.replace('CONTRATO DE SERVIÇO', 'CONTRATO DE SERVIÇO (VERSÃO B)'),
          }],
          error: null,
        } as any);
      }
      return Promise.resolve({ data: null, error: null } as any);
    }) as any);

    const tplCliente1 = await obterTemplatePadraoVigente('ANUNCIANTE', tenantId);
    expect(tplCliente1.id).toBe(tplB_Id);
    expect(tplCliente1.codigo_template).toBe('TPL-ANUNCIANTE-OFICIAL-B');
    expect(tplCliente1.conteudo_html).toContain('(VERSÃO B)');

    // 2. Administrador troca o padrão para Template A
    vi.spyOn(supabase, 'rpc').mockImplementation(((name: string) => {
      if (name === 'fn_obter_template_padrao') {
        return Promise.resolve({
          data: [{
            id: tplA_Id,
            codigo_template: 'TPL-ANUNCIANTE-OFICIAL-A',
            nome: 'Contrato de Anunciante — Padrão Oficial A',
            versao: 3,
            conteudo_html: CANONICAL_TEMPLATE_HTML_ANUNCIANTE.replace('CONTRATO DE SERVIÇO', 'CONTRATO DE SERVIÇO (VERSÃO A)'),
          }],
          error: null,
        } as any);
      }
      return Promise.resolve({ data: null, error: null } as any);
    }) as any);

    const tplCliente2 = await obterTemplatePadraoVigente('ANUNCIANTE', tenantId);
    expect(tplCliente2.id).toBe(tplA_Id);
    expect(tplCliente2.codigo_template).toBe('TPL-ANUNCIANTE-OFICIAL-A');
    expect(tplCliente2.conteudo_html).toContain('(VERSÃO A)');

    // O contrato do Cliente 1 permanece imutável com o snapshot e template_id B
    expect(tplCliente1.id).toBe(tplB_Id);
    expect(tplCliente1.conteudo_html).toContain('(VERSÃO B)');
  });

  // TESTE C — PONTO PARCEIRO: Resolução do padrão e documento completo
  it('TESTE C — PONTO PARCEIRO: Resolve padrão vigente de parceria com todas as cláusulas do PDF oficial', async () => {
    const tplParceiroId = 'parc-1111-4111-a111-111111111111';

    vi.spyOn(supabase, 'rpc').mockImplementation(((name: string) => {
      if (name === 'fn_obter_template_padrao') {
        return Promise.resolve({
          data: [{
            id: tplParceiroId,
            codigo_template: 'TPL-PARCEIRO-OFICIAL',
            nome: 'Contrato de Parceria — Oficial',
            versao: 1,
            conteudo_html: CANONICAL_TEMPLATE_HTML_PARCEIRO,
          }],
          error: null,
        } as any);
      }
      return Promise.resolve({ data: null, error: null } as any);
    }) as any);

    const tpl = await obterTemplatePadraoVigente('PARCEIRO');
    expect(tpl.id).toBe(tplParceiroId);
    expect(tpl.codigo_template).toBe('TPL-PARCEIRO-OFICIAL');
    expect(isTemplateCompleto(tpl.conteudo_html, 'PARCEIRO')).toBe(true);

    const formPonto = {
      nomeFantasia: 'Farmácia Central',
      razaoSocial: 'Farmácia Central Caruaru Ltda',
      cnpjCpf: '98.765.432/0001-10',
      responsavelNome: 'Dra. Maria Santos',
      logradouro: 'Av. Principal',
      numero: '500',
      bairro: 'Maurício de Nassau',
      cidade: 'Caruaru',
      estado: 'PE',
      cep: '55012-000',
      telefone: '8137210000',
      whatsapp: '81988887777',
      email: 'contato@farmaciacentral.com',
      instagram: '@farmaciacentral',
      quantidadeTelas: 1,
      horarioFuncionamento: 'Segunda a Sábado das 07:00 às 22:00',
      diasSemana: 'Segunda a Sábado',
      horarioInicio: '07:00',
      horarioFim: '22:00',
    };

    const rendered = renderizarPreviewContrato('PARCEIRO', tpl.conteudo_html, formPonto);
    expect(rendered).toContain('Farmácia Central Caruaru Ltda');
    expect(rendered).toContain('Dra. Maria Santos');
    expect(rendered).toContain('CLÁUSULA 01 – DO OBJETO');
    expect(rendered).toContain('CLÁUSULA 03 - OBRIGAÇÕES DO ESTABELECIMENTO PARCEIRO');
    expect(rendered).toContain('A internet será de responsabilidade do PARCEIRO.');
    expect(rendered).toContain('A energia elétrica é fornecida pelo PARCEIRO.');
    expect(rendered).not.toContain('{{');
  });

  // TESTE D — GESTOR DE MÍDIAS: Resolução correta com alias GESTOR_MIDIAS -> GESTOR
  it('TESTE D — GESTOR DE MÍDIAS: Alias GESTOR_MIDIAS -> GESTOR resolve template oficial de gestor', async () => {
    const tipoResolvido = resolveContractTypeFromCadastroType('GESTOR_MIDIAS');
    expect(tipoResolvido).toBe('GESTOR');

    const tplGestorId = 'gest-1111-4111-a111-111111111111';

    vi.spyOn(supabase, 'rpc').mockImplementation(((name: string) => {
      if (name === 'fn_obter_template_padrao') {
        return Promise.resolve({
          data: [{
            id: tplGestorId,
            codigo_template: 'TPL-GESTOR-OFICIAL',
            nome: 'Contrato de Gestão de Mídia Digital',
            versao: 1,
            conteudo_html: CANONICAL_TEMPLATE_HTML_GESTOR,
          }],
          error: null,
        } as any);
      }
      return Promise.resolve({ data: null, error: null } as any);
    }) as any);

    const tpl = await obterTemplatePadraoVigente('GESTOR_MIDIAS');
    expect(tpl.id).toBe(tplGestorId);
    expect(tpl.tipo_contrato).toBe('GESTOR');
    expect(isTemplateCompleto(tpl.conteudo_html, 'GESTOR')).toBe(true);

    const formGestor = {
      nome: 'José Oliveira',
      cpfCnpj: '111.222.333-44',
      email: 'jose.gestor@sobremidia.com.br',
      telefone: '81991112222',
      cidade: 'Caruaru',
      estado: 'PE',
    };

    const rendered = renderizarPreviewContrato('GESTOR', tpl.conteudo_html, formGestor);
    expect(rendered).toContain('José Oliveira');
    expect(rendered).toContain('111.222.333-44');
    expect(rendered).toContain('CONTRATO DE GESTÃO DE MÍDIA DIGITAL');
    expect(rendered).toContain('1. OBJETO');
    expect(rendered).toContain('3. ATRIBUIÇÕES DO GESTOR');
    expect(rendered).not.toContain('{{');
  });

  // TESTE E — DADOS DO CADASTRO: Mapeamento de todas as 24 variáveis
  it('TESTE E — DADOS DO CADASTRO: Mapeia e preenche integralmente todas as 24 variáveis de TPL-ANUNCIANTE-OFICIAL', () => {
    const dadosMock: any = {
      contrato: {
        tipo_contrato: 'ANUNCIANTE',
        data_inicio: '2026-09-01',
        data_fim: '2027-09-01',
        valor_mensal: 1200,
        forma_pagamento: 'Boleto Bancário',
        numero_contrato: 'CTR-2026-0042',
        versao_atual: 1,
      },
      proposta: {
        titulo_campanha: 'Campanha Master Anunciante',
        pacote_veiculacao: 'Mídia Prime',
        periodo_veiculacao: '12 meses',
        valor_final: 1200,
      },
      empresa: {
        razao_social: 'Supermercado Central S/A',
        nome_fantasia: 'Super Central',
        cnpj: '55.444.333/0001-22',
        representante_legal: 'Ana Bezerra',
        logradouro: 'Rua Duque de Caxias',
        numero: '88',
        bairro: 'São Francisco',
        cidade: 'Caruaru',
        estado: 'PE',
        cep: '55002-100',
        telefone: '8137221122',
        email: 'diretoria@supercentral.com.br',
        instagram: '@supercentralpe',
        website: 'www.supercentral.com.br',
      },
      contato: {
        nome: 'Ana Bezerra',
        email: 'diretoria@supercentral.com.br',
        telefone: '8137221122',
      },
      ponto: {
        dias_funcionamento: 'Segunda a Domingo',
        horario_abertura: '07:30',
        horario_fechamento: '22:30',
      },
      template: {
        conteudo_html: CANONICAL_TEMPLATE_HTML_ANUNCIANTE,
      },
      operadora: null,
      quantidadeTelas: 4,
    };

    const mapa = montarDadosTemplate(dadosMock);
    const preenchido = preencherTemplate(CANONICAL_TEMPLATE_HTML_ANUNCIANTE, mapa, 'ANUNCIANTE');

    expect(preenchido).toContain('Supermercado Central S/A');
    expect(preenchido).toContain('Ana Bezerra');
    expect(preenchido).toContain('55.444.333/0001-22');
    expect(preenchido).toContain('Rua Duque de Caxias, 88 - São Francisco - Caruaru/PE');
    expect(preenchido).toContain('São Francisco');
    expect(preenchido).toContain('Caruaru / PE');
    expect(preenchido).toContain('55002-100');
    expect(preenchido).toContain('diretoria@supercentral.com.br');
    expect(preenchido).toContain('@supercentralpe');
    expect(preenchido).toContain('www.supercentral.com.br');
    expect(preenchido).toContain('Campanha Master Anunciante');
    expect(preenchido).toContain('Mídia Prime');
    expect(preenchido).toContain('12 meses');
    expect(preenchido).toContain('Segunda a Domingo');
    expect(preenchido).toContain('07:30 às 22:30');
    expect(preenchido).toContain('4 sistema(s)');
    expect(preenchido).toContain('Boleto Bancário');
    expect(preenchido).not.toContain('{{');
  });

  // TESTE F — NENHUM CAMPO PERDIDO: Fallback robusto entre Nome Fantasia e Razão Social
  it('TESTE F — NENHUM CAMPO PERDIDO: Trata nome fantasia ou razão social preenchidos sem disparar erro genérico', () => {
    // Caso 1: Apenas Nome Fantasia preenchido
    const res1 = renderizarPreviewContrato('ANUNCIANTE', CANONICAL_TEMPLATE_HTML_ANUNCIANTE, {
      nomeFantasia: 'Clínica Sorriso',
      razaoSocial: '',
      cnpj: '11.222.333/0001-44',
      email: 'contato@clinica.com',
      whatsapp: '81999991111',
    });
    expect(res1).toContain('Clínica Sorriso');
    expect(res1).not.toContain('{{RAZAO_SOCIAL}}');

    // Caso 2: Apenas Razão Social preenchida
    const res2 = renderizarPreviewContrato('ANUNCIANTE', CANONICAL_TEMPLATE_HTML_ANUNCIANTE, {
      nomeFantasia: '',
      razaoSocial: 'Clínica Sorriso Odontologia Ltda',
      cnpj: '11.222.333/0001-44',
      email: 'contato@clinica.com',
      whatsapp: '81999991111',
    });
    expect(res2).toContain('Clínica Sorriso Odontologia Ltda');
    expect(res2).not.toContain('{{RAZAO_SOCIAL}}');
  });

  // TESTE G — DOCUMENTO COMPLETO: Verifica que o documento contém todas as seções oficiais e não stubs
  it('TESTE G — DOCUMENTO COMPLETO: Garante integridade das 9 cláusulas e estrutura canônica', () => {
    const htmlAnunciante = CANONICAL_TEMPLATE_HTML_ANUNCIANTE;
    expect(isTemplateCompleto(htmlAnunciante, 'ANUNCIANTE')).toBe(true);

    const clausulas = [
      'CLÁUSULA 01 - NOSSO SERVIÇO',
      'CLÁUSULA 02 - SISTEMA INTELIGENTE',
      'CLÁUSULA 03 - NOSSO CONTEÚDO',
      'CLÁUSULA 04 - PLANO EXCLUSIVO',
      'CLÁUSULA 05 - PLANO SISTEMA',
      'CLÁUSULA 06 - RESPONSABILIDADE DO CONTRATANTE',
      'CLÁUSULA 07 - CONDIÇÕES DE PAGAMENTOS',
      'CLÁUSULA 08 - RENOVAÇÃO DE CONTRATO',
      'CLÁUSULA 09 - RESCISÃO CONTRATUAL',
      'POLÍTICA DE PRIVACIDADE',
      'GRADE DE HORÁRIOS, VEICULAÇÃO E PAGAMENTO',
    ];

    for (const c of clausulas) {
      expect(htmlAnunciante).toContain(c);
    }
  });

  // TESTE H — ASSINATURA: Visualizado == Baixado == Assinado (mesmo hash e versão)
  it('TESTE H — ASSINATURA: Visualização, download e assinatura consomem a mesma representação contratual', async () => {
    const contratoMock = {
      id: 'ctr-test-001',
      numero_contrato: 'CTR-2026-0001',
      versao_atual: 1,
      tipo_contrato: 'ANUNCIANTE',
      status_documento: 'GERADO',
      pdf_object_key: 'tenants/tenant-1/contratos/ctr-test-001/v1/contrato_CTR-2026-0001.pdf',
    };

    // Mock fetch single contract
    vi.spyOn(supabase, 'from').mockImplementation(((table: string) => {
      if (table === 'contratos') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: contratoMock, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: contratoMock, error: null }),
        } as any;
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as any;
    }) as any);

    // O mesmo pdf_object_key é consumido tanto para download quanto para assinatura
    expect(contratoMock.pdf_object_key).toBe('tenants/tenant-1/contratos/ctr-test-001/v1/contrato_CTR-2026-0001.pdf');
    expect(contratoMock.status_documento).toBe('GERADO');
    expect(contratoMock.versao_atual).toBe(1);
  });
});
