import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CANONICAL_TEMPLATE_HTML_ANUNCIANTE,
  CANONICAL_TEMPLATE_HTML_PARCEIRO,
  CANONICAL_TEMPLATE_HTML_GESTOR,
  getCanonicalTemplateForTipo,
  isTemplateCompleto,
  preencherTemplate,
  obterTemplatePadraoVigente,
  coletarDadosReais,
} from '@/modules/crm/services/contratoDocumento.service';
import { ContratoService } from '@/modules/crm/services/contrato.service';
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

describe('MICRO-GATE P0.3.9 — CANONICAL CONTRACT SINGLE SOURCE OF TRUTH', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const stubHtmlAnunciante = `<h2>CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MÍDIA DIGITAL SIGNAGE</h2>
<p>Pelo presente instrumento particular, de um lado SOBRE MÍDIA PLATAFORMA DIGITAL... Contrato: CTR-2026-0001 | Tipo: ANUNCIANTE. Responsável: Sobre Midia. Valor Mensal: R$ 0,00. CLÁUSULA 01...</p>`;

  const stubHtmlGestor = `<p>Contrato de Gestão Operacional de Displays e Signage. SOBRE MÍDIA e GESTOR.</p>`;
  const stubHtmlParceiro = `<p>Contrato de Parceria e Cessão de Espaço para Ponto de Exibição. SOBRE MÍDIA e PARCEIRO.</p>`;

  it('1. isTemplateCompleto valida rigorosamente templates oficiais e rejeita qualquer stub', () => {
    expect(isTemplateCompleto(stubHtmlAnunciante, 'ANUNCIANTE')).toBe(false);
    expect(isTemplateCompleto(stubHtmlGestor, 'GESTOR')).toBe(false);
    expect(isTemplateCompleto(stubHtmlParceiro, 'PARCEIRO')).toBe(false);
    expect(isTemplateCompleto('', 'ANUNCIANTE')).toBe(false);
    expect(isTemplateCompleto(null, 'ANUNCIANTE')).toBe(false);

    expect(isTemplateCompleto(CANONICAL_TEMPLATE_HTML_ANUNCIANTE, 'ANUNCIANTE')).toBe(true);
    expect(isTemplateCompleto(CANONICAL_TEMPLATE_HTML_PARCEIRO, 'PARCEIRO')).toBe(true);
    expect(isTemplateCompleto(CANONICAL_TEMPLATE_HTML_GESTOR, 'GESTOR')).toBe(true);
  });

  it('2. getCanonicalTemplateForTipo retorna HTML completo (>5.000 caracteres) para todos os 3 tipos', () => {
    const htmlAnunciante = getCanonicalTemplateForTipo('ANUNCIANTE');
    const htmlParceiro = getCanonicalTemplateForTipo('PARCEIRO');
    const htmlGestor = getCanonicalTemplateForTipo('GESTOR');

    expect(htmlAnunciante.length).toBeGreaterThan(10000);
    expect(htmlParceiro.length).toBeGreaterThan(10000);
    expect(htmlGestor.length).toBeGreaterThan(5000);

    expect(htmlAnunciante).toContain('CLÁUSULA 01 - NOSSO SERVIÇO');
    expect(htmlParceiro).toContain('OBRIGAÇÕES DO ESTABELECIMENTO PARCEIRO');
    expect(htmlGestor).toContain('ATRIBUIÇÕES DO GESTOR');
  });

  it('3. obterTemplatePadraoVigente substitui qualquer stub retornado pelo banco pelo template canônico oficial', async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: [{ id: 'stub-anunciante-id', nome: 'Stub Anunciante', conteudo_html: stubHtmlAnunciante, versao: 1 }],
      error: null,
    });

    const res = await obterTemplatePadraoVigente('ANUNCIANTE');
    expect(res.conteudo_html).toContain('CLÁUSULA 01 - NOSSO SERVIÇO');
    expect(res.conteudo_html).toContain('POLÍTICA DE PRIVACIDADE');
    expect(res.conteudo_html.length).toBeGreaterThan(10000);
  });

  it('4. coletarDadosReais força o template canônico rico oficial mesmo se contrato apontar para stub legado', async () => {
    const mockContrato = {
      id: 'ctr-p039-001',
      numero_contrato: 'CTR-2026-9999',
      tipo_contrato: 'ANUNCIANTE',
      template_id: '5699b7f9-d47f-43a8-a6f7-dea85d0c7034', // Legacy stub
      empresa_id: 'emp-001',
      empresa_operadora_id: '7d62aaec-e24d-4273-b257-867183cf658c',
      valor_mensal: 1500,
      forma_pagamento: 'PIX',
      data_inicio: '2026-09-10',
      data_fim: '2027-09-10',
      status_documento: 'GERADO',
      versao_atual: 1,
    };

    const mockEmpresa = {
      id: 'emp-001',
      razao_social: 'EMPRESA CANONICA TESTE LTDA',
      nome_fantasia: 'CANONICA TESTE',
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
            eq: (field: string) => {
              if (field === 'id') {
                return {
                  maybeSingle: () => Promise.resolve({
                    data: {
                      id: '5699b7f9-d47f-43a8-a6f7-dea85d0c7034',
                      nome: 'Stub Legado',
                      conteudo_html: stubHtmlAnunciante, // Stub
                      versao: 1,
                      tipo_contrato: 'ANUNCIANTE',
                    },
                    error: null,
                  }),
                };
              }
              return {
                eq: () => ({
                  order: () => ({
                    order: () => Promise.resolve({
                      data: [{
                        id: 'bf42418d-9988-4bfd-beec-ecac2210b791',
                        nome: 'Contrato de Anunciante — Oficial',
                        conteudo_html: CANONICAL_TEMPLATE_HTML_ANUNCIANTE,
                        versao: 2,
                        is_default: true,
                        ativo: true,
                      }],
                      error: null,
                    }),
                  }),
                }),
              };
            },
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
            order: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        }),
      };
    });

    (supabase.rpc as any).mockResolvedValue({
      data: [{
        id: 'bf42418d-9988-4bfd-beec-ecac2210b791',
        nome: 'Contrato de Anunciante — Oficial',
        versao: 2,
        conteudo_html: CANONICAL_TEMPLATE_HTML_ANUNCIANTE,
      }],
      error: null,
    });

    const dados = await coletarDadosReais('ctr-p039-001');
    expect(dados.template.conteudo_html).toContain('CLÁUSULA 01 - NOSSO SERVIÇO');
    expect(dados.template.conteudo_html).toContain('POLÍTICA DE PRIVACIDADE');
    expect(dados.template.conteudo_html.length).toBeGreaterThan(10000);
  });

  it('5. preencherTemplate preenche dados e substitui todos os placeholders sem quebras', () => {
    const template = getCanonicalTemplateForTipo('ANUNCIANTE');
    const placeholders = {
      NUMERO_CONTRATO: 'CTR-2026-8888',
      RAZAO_SOCIAL: 'PADARIA CANONICA LTDA',
      NOME_FANTASIA: 'PADARIA CANONICA',
      CNPJ: '99.888.777/0001-66',
      VALOR_MENSAL: 'R$ 1.250,00',
      FORMA_PAGAMENTO: 'PIX MENSAL',
      DATA_INICIO: '10/09/2026',
      DATA_FIM: '10/09/2027',
      LOCAL_ASSINATURA: 'Caruaru - PE',
      DATA_ASSINATURA: '10/09/2026',
      NOME_REPRESENTANTE_LEGAL: 'CARLOS SILVA',
      CPF_REPRESENTANTE_LEGAL: '111.222.333-44',
      EMAIL_CONTRATANTE: 'carlos@padariacanonica.com.br',
      TELEFONE_CONTRATANTE: '(81) 99999-8888',
      ENDERECO_COMPLETO_CONTRATANTE: 'Av. Principal, 100, Centro, Caruaru - PE',
      REPRESENTANTE_LEGAL: 'CARLOS SILVA',
      DETALHES_PLANO: 'Exibição em 10 telas Full HD',
    };

    const rendered = preencherTemplate(template, placeholders);
    expect(rendered).toContain('CTR-2026-8888');
    expect(rendered).toContain('PADARIA CANONICA LTDA');
    expect(rendered).toContain('99.888.777/0001-66');
    expect(rendered).toContain('R$ 1.250,00');
    expect(rendered).not.toContain('{{NUMERO_CONTRATO}}');
    expect(rendered).not.toContain('{{RAZAO_SOCIAL}}');
  });
});
