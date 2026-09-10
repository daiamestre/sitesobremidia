import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CANONICAL_TEMPLATE_HTML_ANUNCIANTE,
  CANONICAL_TEMPLATE_HTML_PARCEIRO,
  CANONICAL_TEMPLATE_HTML_GESTOR,
  getCanonicalTemplateForTipo,
  isTemplateCompleto,
  preencherTemplate,
  obterHtmlContratoPorContratoId,
  obterTemplatePadraoVigente,
  coletarDadosReais,
  gerarPdfDoHtml,
} from '@/modules/crm/services/contratoDocumento.service';
import { supabase } from '@/integrations/supabase/client';

// Mock do Supabase Client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe('MICRO-GATE P0.3.7 — CONTRATO OFICIAL PADRÃO ABSOLUTO E ÚNICO DO SISTEMA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const stubHtmlAnunciante = `<h2>CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MÍDIA DIGITAL SIGNAGE</h2>
<p>Pelo presente instrumento particular, de um lado <strong>SOBRE MÍDIA PLATAFORMA DIGITAL</strong>... Contrato: CTR-2026-0001 | Tipo: ANUNCIANTE. Responsável: Sobre Midia. Valor Mensal: R$ 0,00. CLÁUSULA 01...</p>`;

  it('1. isTemplateCompleto deve rejeitar stubs/HTMLs curtos ou sem estrutura oficial', () => {
    expect(isTemplateCompleto(stubHtmlAnunciante, 'ANUNCIANTE')).toBe(false);
    expect(isTemplateCompleto('<div>HTML curto</div>', 'PARCEIRO')).toBe(false);
    expect(isTemplateCompleto(CANONICAL_TEMPLATE_HTML_ANUNCIANTE, 'ANUNCIANTE')).toBe(true);
    expect(isTemplateCompleto(CANONICAL_TEMPLATE_HTML_PARCEIRO, 'PARCEIRO')).toBe(true);
    expect(isTemplateCompleto(CANONICAL_TEMPLATE_HTML_GESTOR, 'GESTOR')).toBe(true);
  });

  it('2. obterTemplatePadraoVigente deve substituir stubs pelo template canônico completo', async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: [{ id: 'stub-id', nome: 'Stub Template', conteudo_html: stubHtmlAnunciante, versao: 1 }],
      error: null,
    });

    const res = await obterTemplatePadraoVigente('ANUNCIANTE');
    expect(res.conteudo_html).toContain('CLÁUSULA 01 - NOSSO SERVIÇO');
    expect(res.conteudo_html).toContain('POLÍTICA DE PRIVACIDADE');
  });

  it('3. coletarDadosReais deve forçar o template rico oficial mesmo se contrato apontar para stub_id', async () => {
    const mockContrato = {
      id: 'ctr-p037-001',
      numero_contrato: 'CTR-2026-9999',
      tipo_contrato: 'ANUNCIANTE',
      template_id: 'stub-template-id',
      empresa_id: 'emp-001',
      empresa_operadora_id: 'op-01',
      valor_mensal: 1500,
      forma_pagamento: 'PIX',
      data_inicio: '2026-09-10',
      data_fim: '2027-09-10',
      status_documento: 'GERADO',
      versao_atual: 1,
    };

    const mockEmpresa = {
      id: 'emp-001',
      razao_social: 'SUPERMERCADO OFICIAL LTDA',
      nome_fantasia: 'SUPERMERCADO OFICIAL',
      cnpj: '12.345.678/0001-90',
      representante_legal: 'JOAO SILVA',
      cidade: 'Caruaru',
      estado: 'PE',
    };

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'contratos') {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                single: () => Promise.resolve({ data: mockContrato, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'empresas') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: mockEmpresa, error: null }),
            }),
          }),
        };
      }
      if (table === 'contrato_templates') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: { id: 'stub-template-id', conteudo_html: stubHtmlAnunciante, tipo_contrato: 'ANUNCIANTE' },
                error: null,
              }),
              eq: () => ({
                order: () => ({
                  order: () => Promise.resolve({
                    data: [{ id: 'bf42418d-9988-4bfd-beec-ecac2210b791', conteudo_html: CANONICAL_TEMPLATE_HTML_ANUNCIANTE, is_default: true, ativo: true }],
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'contatos') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({ data: { nome: 'JOAO SILVA', email: 'joao@supermercado.com' }, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      };
    });

    const dados = await coletarDadosReais('ctr-p037-001');
    expect(dados.template.conteudo_html).toContain('CLÁUSULA 01 - NOSSO SERVIÇO');
    expect(dados.template.conteudo_html).toContain('CLÁUSULA 09 - RESCISÃO CONTRATUAL');
  });

  it('4. obterHtmlContratoPorContratoId deve gerar documento oficial preenchido com dados reais do contratante', async () => {
    const mockContrato = {
      id: 'ctr-p037-002',
      numero_contrato: 'CTR-2026-8888',
      tipo_contrato: 'ANUNCIANTE',
      template_id: 'bf42418d-9988-4bfd-beec-ecac2210b791',
      empresa_id: 'emp-002',
      empresa_operadora_id: 'op-01',
      valor_mensal: 2500,
      forma_pagamento: 'BOLETO',
      data_inicio: '2026-09-10',
      data_fim: '2027-09-10',
      status_documento: 'ASSINADO',
      versao_atual: 1,
    };

    const mockEmpresa = {
      id: 'emp-002',
      razao_social: 'LOJA MODELO S/A',
      nome_fantasia: 'LOJA MODELO',
      cnpj: '98.765.432/0001-10',
      representante_legal: 'CARLOS GERENTE',
      cidade: 'Garanhuns',
      estado: 'PE',
    };

    const mockAssinatura = {
      signatario_nome: 'CARLOS GERENTE',
      signatario_cpf_cnpj: '98.765.432/0001-10',
      assinado_em: '2026-09-10T14:30:00Z',
      metodo: 'DRAWN',
      dados_assinatura: { signatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' },
    };

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'contratos') {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                single: () => Promise.resolve({ data: mockContrato, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'empresas') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: mockEmpresa, error: null }),
            }),
          }),
        };
      }
      if (table === 'contrato_templates') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: { id: 'bf42418d-9988-4bfd-beec-ecac2210b791', conteudo_html: CANONICAL_TEMPLATE_HTML_ANUNCIANTE, tipo_contrato: 'ANUNCIANTE' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'contatos') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({ data: { nome: 'CARLOS GERENTE' }, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'assinaturas') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: () => Promise.resolve({ data: mockAssinatura, error: null }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      };
    });

    const html = await obterHtmlContratoPorContratoId('ctr-p037-002');
    expect(html).toContain('LOJA MODELO S/A');
    expect(html).toContain('98.765.432/0001-10');
    expect(html).toContain('CARLOS GERENTE');
    expect(html).toContain('CLÁUSULA 01');
    expect(html).toContain('Assinado digitalmente por CARLOS GERENTE');
  });

  it('5. pdfBytes deve ser gerado com sucesso a partir do HTML oficial completo', async () => {
    const dadosMapped = {
      RAZAO_SOCIAL: 'EMPRESA TESTE LTDA',
      NOME_FANTASIA: 'EMPRESA TESTE',
      CNPJ: '11.222.333/0001-44',
      RESPONSAVEL: 'MARIA SILVA',
      REPRESENTANTE_LEGAL: 'MARIA SILVA',
      VALOR_MENSAL: 'R$ 1.500,00',
      DATA_INICIO: '10/09/2026',
      DATA_FIM: '10/09/2027',
      DATA_ASSINATURA: '10 de setembro de 2026',
      LOCAL_ASSINATURA: 'Caruaru / PE',
      NUMERO_CONTRATO: 'CTR-2026-7777',
      VERSAO_CONTRATO: '1',
      TIPO_CONTRATO: 'ANUNCIANTE',
    };

    const htmlPreenchido = preencherTemplate(CANONICAL_TEMPLATE_HTML_ANUNCIANTE, dadosMapped, 'ANUNCIANTE');
    const pdfBytes = await gerarPdfDoHtml(htmlPreenchido, 'CTR-2026-7777', 'ANUNCIANTE', 1);

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(5000); // PDF real vetorial deve ter tamanho significativo
  });
});
