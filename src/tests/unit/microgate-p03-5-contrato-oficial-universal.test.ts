import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CANONICAL_TEMPLATE_HTML_ANUNCIANTE,
  CANONICAL_TEMPLATE_HTML_PARCEIRO,
  CANONICAL_TEMPLATE_HTML_GESTOR,
  getCanonicalTemplateForTipo,
  isTemplateCompleto,
  preencherTemplate,
  montarDadosTemplate,
  renderizarPreviewContrato,
  obterHtmlContratoPorContratoId,
  obterTemplatePadraoVigente,
  parseHtmlToElements,
  gerarPdfDoHtml,
  DadosDocumentoContrato,
  separarHtmlEmPaginas,
  contratoDocumentoService,
} from '@/modules/crm/services/contratoDocumento.service';
import { supabase } from '@/integrations/supabase/client';

// Mock do supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe('MICRO-GATE P0.3.5 — AUDITORIA FORENSE + CORREÇÃO DEFINITIVA DA FONTE DO CONTRATO OFICIAL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockDadosContratacao: DadosDocumentoContrato = {
    contrato: {
      id: 'ctr-p035-test-01',
      empresa_operadora_id: 'op-001',
      numero_contrato: 'CTR-2026-9992',
      tipo_contrato: 'ANUNCIANTE',
      status_documento: 'GERADO',
      versao_atual: 1,
      valor_mensal: 1235.00,
      forma_pagamento: 'PIX',
      data_inicio: '2026-09-08',
      data_fim: '2026-10-08',
    },
    proposta: {
      id: 'prop-001',
      titulo_campanha: 'Campanha Mercado Teste 1',
      pacote_veiculacao: 'TRIMESTRAL',
      periodo_veiculacao: '1 mês',
      valor_final: 1235.00,
      valor_total: 1235.00,
      forma_pagamento: 'PIX',
      dias_semana: 'Segunda a Sábado',
      horario_inicio: '08:00',
      horario_fim: '22:00',
      quantidade_telas: 5,
    },
    empresa: {
      id: 'emp-001',
      razao_social: 'MERCADO TESTE 1 LTDA',
      nome_fantasia: 'MERCADO TESTE 1',
      cnpj: '18.236.120/0001-58',
      logradouro: 'Rua 17 de Dezembro',
      numero: '38',
      bairro: 'Centro',
      cidade: 'Cachoeirinha',
      estado: 'BA',
      cep: '55380-000',
      telefone: '(73) 98888-1111',
      email: 'daiamestre9@gmail.com',
      instagram: '@mercadoteste1',
      website: 'www.mercadoteste1.com.br',
      representante_legal: 'SERGIO REPRESENTANTE',
    },
    contato: {
      id: 'ct-001',
      nome: 'SERGIO REPRESENTANTE',
      email: 'daiamestre9@gmail.com',
      telefone: '(73) 98888-1111',
    },
    ponto: null,
    template: {
      id: '5fb25e19-e654-4f39-9d26-7782629d476e',
      codigo_template: 'TPL-ANUNCIANTE-OFICIAL',
      nome: 'Contrato de Anunciante — Oficial',
      versao: 1,
      conteudo_html: CANONICAL_TEMPLATE_HTML_ANUNCIANTE,
    },
    operadora: {
      id: 'op-001',
      nome: 'SOBRE MÍDIA DESIGNER',
    },
    quantidadeTelas: 5,
  };

  // 1. Template oficial é utilizado
  it('1. Deve utilizar o template oficial universal para o contrato de ANUNCIANTE', () => {
    const tpl = getCanonicalTemplateForTipo('ANUNCIANTE');
    expect(tpl).toBeDefined();
    expect(tpl).toContain('SOBRE MÍDIA DESIGNER');
    expect(tpl).toContain('CONTRATO DE SERVIÇO E VEICULAÇÃO DE PUBLICIDADE POR MEIO DIGITAL EM MÍDIA INDOOR – SOBRE MÍDIA DESIGNER');
  });

  // 2. Contrato ANUNCIANTE utiliza TPL-ANUNCIANTE-OFICIAL
  it('2. Contrato ANUNCIANTE utiliza a estrutura canônica completa', () => {
    expect(isTemplateCompleto(CANONICAL_TEMPLATE_HTML_ANUNCIANTE, 'ANUNCIANTE')).toBe(true);
  });

  // 3. Cláusula 01 existe
  it('3. Cláusula 01 - NOSSO SERVIÇO deve estar presente no template oficial', () => {
    expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('CLÁUSULA 01 - NOSSO SERVIÇO');
  });

  // 4. Cláusula 02 existe
  it('4. Cláusula 02 - SISTEMA INTELIGENTE deve estar presente no template oficial', () => {
    expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('CLÁUSULA 02 - SISTEMA INTELIGENTE');
  });

  // 5. Cláusula 03 existe
  it('5. Cláusula 03 - NOSSO CONTEÚDO deve estar presente no template oficial', () => {
    expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('CLÁUSULA 03 - NOSSO CONTEÚDO');
  });

  // 6. Cláusula 04 existe
  it('6. Cláusula 04 - PLANO EXCLUSIVO deve estar presente no template oficial', () => {
    expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('CLÁUSULA 04 - PLANO EXCLUSIVO');
  });

  // 7. Cláusula 05 existe
  it('7. Cláusula 05 - PLANO SISTEMA deve estar presente no template oficial', () => {
    expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('CLÁUSULA 05 - PLANO SISTEMA');
  });

  // 8. Cláusula 06 existe
  it('8. Cláusula 06 - RESPONSABILIDADE DO CONTRATANTE deve estar presente e íntegra', () => {
    expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('CLÁUSULA 06 - RESPONSABILIDADE DO CONTRATANTE');
    expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('programações desatualizadas');
    // Não deve conter fragmentação 'P\nprogramações'
    expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).not.toMatch(/CLÁUSULA 06[\s\S]*?<p>\s*P\s*<\/p>/i);
  });

  // 9. Cláusula 07 existe
  it('9. Cláusula 07 - CONDIÇÕES DE PAGAMENTOS deve estar presente no template oficial', () => {
    expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('CLÁUSULA 07 - CONDIÇÕES DE PAGAMENTOS');
  });

  // 10. Cláusula 08 existe
  it('10. Cláusula 08 - RENOVAÇÃO DE CONTRATO deve estar presente no template oficial', () => {
    expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('CLÁUSULA 08 - RENOVAÇÃO DE CONTRATO');
  });

  // 11. Cláusula 09 existe
  it('11. Cláusula 09 - RESCISÃO CONTRATUAL deve estar presente no template oficial', () => {
    expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('CLÁUSULA 09 - RESCISÃO CONTRATUAL');
  });

  // 12. Cláusulas aparecem na ordem estrita 01 -> 09
  it('12. As 9 cláusulas devem aparecer rigorosamente na ordem sequencial 01 a 09', () => {
    const idx01 = CANONICAL_TEMPLATE_HTML_ANUNCIANTE.indexOf('CLÁUSULA 01');
    const idx02 = CANONICAL_TEMPLATE_HTML_ANUNCIANTE.indexOf('CLÁUSULA 02');
    const idx03 = CANONICAL_TEMPLATE_HTML_ANUNCIANTE.indexOf('CLÁUSULA 03');
    const idx04 = CANONICAL_TEMPLATE_HTML_ANUNCIANTE.indexOf('CLÁUSULA 04');
    const idx05 = CANONICAL_TEMPLATE_HTML_ANUNCIANTE.indexOf('CLÁUSULA 05');
    const idx06 = CANONICAL_TEMPLATE_HTML_ANUNCIANTE.indexOf('CLÁUSULA 06');
    const idx07 = CANONICAL_TEMPLATE_HTML_ANUNCIANTE.indexOf('CLÁUSULA 07');
    const idx08 = CANONICAL_TEMPLATE_HTML_ANUNCIANTE.indexOf('CLÁUSULA 08');
    const idx09 = CANONICAL_TEMPLATE_HTML_ANUNCIANTE.indexOf('CLÁUSULA 09');

    expect(idx01).toBeGreaterThan(-1);
    expect(idx02).toBeGreaterThan(idx01);
    expect(idx03).toBeGreaterThan(idx02);
    expect(idx04).toBeGreaterThan(idx03);
    expect(idx05).toBeGreaterThan(idx04);
    expect(idx06).toBeGreaterThan(idx05);
    expect(idx07).toBeGreaterThan(idx06);
    expect(idx08).toBeGreaterThan(idx07);
    expect(idx09).toBeGreaterThan(idx08);
  });

  // 13. Política de privacidade existe após cláusula 09
  it('13. Política de Privacidade deve existir após a Cláusula 09', () => {
    const idx09 = CANONICAL_TEMPLATE_HTML_ANUNCIANTE.indexOf('CLÁUSULA 09');
    const idxPriv = CANONICAL_TEMPLATE_HTML_ANUNCIANTE.indexOf('POLÍTICA DE PRIVACIDADE');
    expect(idxPriv).toBeGreaterThan(idx09);
  });

  // 14. Grade comercial existe após a política de privacidade
  it('14. Grade de Horários, Veiculação e Pagamento deve existir após a Política de Privacidade', () => {
    const idxPriv = CANONICAL_TEMPLATE_HTML_ANUNCIANTE.indexOf('POLÍTICA DE PRIVACIDADE');
    const idxGrade = CANONICAL_TEMPLATE_HTML_ANUNCIANTE.indexOf('GRADE DE HORÁRIOS, VEICULAÇÃO E PAGAMENTO');
    expect(idxGrade).toBeGreaterThan(idxPriv);
  });

  // 15. Bloco final de assinaturas existe
  it('15. Bloco final de assinaturas deve conter SOBRE MÍDIA DESIGNER e CONTRATANTE', () => {
    expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('SOBRE MÍDIA DESIGNER');
    expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('{{RAZAO_SOCIAL}} (CONTRATANTE)');
  });

  // 16. Dados do contratante são mapeados da contratação
  it('16. Dados do contratante devem ser preenchidos a partir dos dados reais da contratação', () => {
    const dados = montarDadosTemplate(mockDadosContratacao);
    expect(dados.RAZAO_SOCIAL).toBe('MERCADO TESTE 1 LTDA');
    expect(dados.CNPJ).toBe('18.236.120/0001-58');
    expect(dados.RESPONSAVEL).toBe('SERGIO REPRESENTANTE');
    expect(dados.CIDADE).toBe('Cachoeirinha');
    expect(dados.UF).toBe('BA');
  });

  // 17. Dados da SOBRE MÍDIA são oficiais
  it('17. Dados da SOBRE MÍDIA devem ser os oficiais da empresa', () => {
    expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('Av. Agamenon Magalhães, 1019');
    expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('Caruaru - PE');
    expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('44.899.400/0002-57');
  });

  // 18. Valor comercial é preservado e não produz 'R$ R$'
  it('18. Valor comercial deve ser preservado e não gerar duplicidade R$ R$', () => {
    const dados = montarDadosTemplate(mockDadosContratacao);
    const htmlPreenchido = preencherTemplate(CANONICAL_TEMPLATE_HTML_ANUNCIANTE, dados, 'ANUNCIANTE');
    expect(htmlPreenchido.replace(/\u00A0/g, ' ')).toContain('R$ 1.235,00');
    expect(htmlPreenchido).not.toContain('R$ R$');
    expect(htmlPreenchido).not.toContain('R$ 0,00');
  });

  // 19. Período de veiculação é preservado
  it('19. Período de veiculação deve ser preservado', () => {
    const dados = montarDadosTemplate(mockDadosContratacao);
    const htmlPreenchido = preencherTemplate(CANONICAL_TEMPLATE_HTML_ANUNCIANTE, dados, 'ANUNCIANTE');
    expect(htmlPreenchido).toContain('08/09/2026');
    expect(htmlPreenchido).toContain('08/10/2026');
  });

  // 20. Quantidade de telas/sistemas é preservada
  it('20. Quantidade de telas/sistemas deve ser preservada (5 sistema(s))', () => {
    const dados = montarDadosTemplate(mockDadosContratacao);
    const htmlPreenchido = preencherTemplate(CANONICAL_TEMPLATE_HTML_ANUNCIANTE, dados, 'ANUNCIANTE');
    expect(htmlPreenchido).toContain('5 sistema(s)');
  });

  // 21. Signatário é o contratante real
  it('21. Signatário deve ser o responsável pelo contratante informado no cadastro', () => {
    const dados = montarDadosTemplate(mockDadosContratacao);
    expect(dados.RESPONSAVEL).toBe('SERGIO REPRESENTANTE');
  });

  // 22. 'Sobre Midia ADM' / 'Sobre Midia' nunca é signatário do contratante
  it('22. Usuários administrativos nunca devem ser signatários do Contratante', () => {
    const mockComAdmin = {
      ...mockDadosContratacao,
      contato: { id: 'ct-adm', nome: 'Sobre Midia ADM', email: 'adm@sobremidia.com' },
      empresa: { ...mockDadosContratacao.empresa, representante_legal: 'Sobre Midia ADM' },
    };
    const dados = montarDadosTemplate(mockComAdmin);
    expect(dados.RESPONSAVEL).not.toMatch(/sobre\s*m[íi]dia|admin/i);
    expect(dados.RESPONSAVEL).toBe('MERCADO TESTE 1 LTDA');
  });

  // 23. DRAWN é persistido e renderizado visualmente
  it('23. Modalidade DRAWN deve renderizar imagem visual no bloco de assinatura do Contratante', () => {
    const fakeSignatureDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const htmlRenderizado = renderizarPreviewContrato(
      'ANUNCIANTE',
      CANONICAL_TEMPLATE_HTML_ANUNCIANTE,
      {
        razaoSocial: 'MERCADO TESTE 1',
        cnpj: '18.236.120/0001-58',
        responsavel: 'SERGIO REPRESENTANTE',
        valorMensal: 1235,
        quantidadeTelas: 5,
      },
      {
        dataUrl: fakeSignatureDataUrl,
        signatarioNome: 'SERGIO REPRESENTANTE',
        metodo: 'DRAWN',
        dataAssinatura: '09 de setembro de 2026',
      }
    );

    expect(htmlRenderizado).toContain('data:image/png;base64');
    expect(htmlRenderizado).toContain('Assinado digitalmente por SERGIO REPRESENTANTE');
    expect(htmlRenderizado).toContain('Digital Desenhada (DRAWN)');
  });

  // 24. TYPED é persistido e renderizado visualmente
  it('24. Modalidade TYPED deve renderizar nome estilizado no bloco de assinatura do Contratante', () => {
    const htmlRenderizado = renderizarPreviewContrato(
      'ANUNCIANTE',
      CANONICAL_TEMPLATE_HTML_ANUNCIANTE,
      {
        razaoSocial: 'MERCADO TESTE 1',
        cnpj: '18.236.120/0001-58',
        responsavel: 'SERGIO REPRESENTANTE',
        valorMensal: 1235,
      },
      {
        signatarioNome: 'SERGIO REPRESENTANTE',
        metodo: 'TYPED',
        dataAssinatura: '09 de setembro de 2026',
      }
    );

    expect(htmlRenderizado).toContain('SERGIO REPRESENTANTE');
    expect(htmlRenderizado).toContain('Assinatura Digitada (TYPED)');
  });

  // 25. Assinatura aparece no bloco correto (CONTRATANTE)
  it('25. Assinatura do cliente deve aparecer exclusivamente no bloco do CONTRATANTE', () => {
    const htmlRenderizado = renderizarPreviewContrato(
      'ANUNCIANTE',
      CANONICAL_TEMPLATE_HTML_ANUNCIANTE,
      {
        razaoSocial: 'MERCADO TESTE 1',
        cnpj: '18.236.120/0001-58',
      },
      {
        signatarioNome: 'SERGIO REPRESENTANTE',
        metodo: 'TYPED',
      }
    );

    expect(htmlRenderizado).toContain('MERCADO TESTE 1 (CONTRATANTE)');
    expect(htmlRenderizado).toContain('SOBRE MÍDIA DESIGNER');
  });

  // 26. Contrato assinado mantém assinatura após reload/re-render
  it('26. Contrato assinado mantém assinatura e metadados ao ser re-renderizado', () => {
    const dadosAssinatura = {
      signatarioNome: 'SERGIO REPRESENTANTE',
      metodo: 'DRAWN',
      dataUrl: 'data:image/png;base64,abc12345',
      dataAssinatura: '09 de setembro de 2026',
    };

    const render1 = renderizarPreviewContrato('ANUNCIANTE', CANONICAL_TEMPLATE_HTML_ANUNCIANTE, { razaoSocial: 'MERCADO TESTE 1' }, dadosAssinatura);
    const render2 = renderizarPreviewContrato('ANUNCIANTE', CANONICAL_TEMPLATE_HTML_ANUNCIANTE, { razaoSocial: 'MERCADO TESTE 1' }, dadosAssinatura);

    expect(render1).toEqual(render2);
    expect(render2).toContain('abc12345');
    expect(render2).toContain('SERGIO REPRESENTANTE');
  });

  // 27. Preview de Propostas usa documento canônico
  it('27. Preview de Propostas utiliza a mesma estrutura do template oficial', () => {
    const html = renderizarPreviewContrato('ANUNCIANTE', '', {
      razaoSocial: 'MERCADO TESTE 1',
      valorMensal: 1235,
      diasSemana: 'Segunda a Sábado',
      horarioInicio: '08:00',
      horarioFim: '22:00',
    });
    expect(html).toContain('CLÁUSULA 01 - NOSSO SERVIÇO');
    expect(html).toContain('CLÁUSULA 09 - RESCISÃO CONTRATUAL');
    expect(html).toContain('08:00 às 22:00');
  });

  // 28. Preview de Contratos usa obterHtmlContratoPorContratoId
  it('28. Preview de Contratos por ID resolve dados reais e template oficial', async () => {
    const mockSupabaseQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'ctr-123',
          tipo_contrato: 'ANUNCIANTE',
          numero_contrato: 'CTR-2026-9992',
          status_documento: 'GERADO',
          valor_mensal: 1235,
          data_inicio: '2026-09-08',
          data_fim: '2026-10-08',
          empresa_id: 'emp-123',
        },
        error: null,
      }),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'emp-123',
          razao_social: 'MERCADO TESTE 1',
          cnpj: '18.236.120/0001-58',
          cidade: 'Cachoeirinha',
          estado: 'BA',
        },
        error: null,
      }),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    };

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      return mockSupabaseQuery as any;
    });

    const html = await obterHtmlContratoPorContratoId('ctr-123');
    expect(html).toContain('CLÁUSULA 01 - NOSSO SERVIÇO');
    expect(html).toContain('MERCADO TESTE 1');
    expect(html.replace(/\u00A0/g, ' ')).toContain('R$ 1.235,00');
  });

  // 29. Preview de Assinatura renderiza documento oficial
  it('29. Preview de Assinatura renderiza documento oficial com todas as cláusulas', () => {
    const html = renderizarPreviewContrato('ANUNCIANTE', CANONICAL_TEMPLATE_HTML_ANUNCIANTE, {
      razaoSocial: 'MERCADO TESTE 1',
      cnpj: '18.236.120/0001-58',
    });
    expect(html).toContain('CLÁUSULA 01');
    expect(html).toContain('CLÁUSULA 09');
    expect(html).toContain('POLÍTICA DE PRIVACIDADE');
  });

  // 30. Etapa 5 usa documento oficial preenchido
  it('30. Etapa 5 do cadastro usa documento oficial preenchido em tempo real', () => {
    const html = renderizarPreviewContrato('ANUNCIANTE', CANONICAL_TEMPLATE_HTML_ANUNCIANTE, {
      razaoSocial: 'MERCADO TESTE 1',
      cnpj: '18.236.120/0001-58',
      responsavel: 'SERGIO REPRESENTANTE',
      valorMensal: 1235,
    });
    expect(html).toContain('MERCADO TESTE 1');
    expect(html).toContain('18.236.120/0001-58');
    expect(html).toContain('SERGIO REPRESENTANTE');
    expect(html).toContain('CLÁUSULA 01 - NOSSO SERVIÇO');
  });

  // 31. Nenhum renderer gera contrato genérico após assinatura
  it('31. Nenhum renderer deve voltar a gerar minuta genérica após contrato assinado', () => {
    const htmlAssinado = renderizarPreviewContrato(
      'ANUNCIANTE',
      CANONICAL_TEMPLATE_HTML_ANUNCIANTE,
      { razaoSocial: 'MERCADO TESTE 1' },
      { signatarioNome: 'SERGIO REPRESENTANTE', metodo: 'TYPED' }
    );
    expect(htmlAssinado).toContain('✓ Assinado digitalmente por SERGIO REPRESENTANTE');
    expect(htmlAssinado).not.toContain('SOBRE MÍDIA PLATAFORMA DIGITAL DE MÍDIA INDOOR');
  });

  // 32. Documento assinado permanece imutável e mantém dados da contratação
  it('32. Documento assinado mantém dados originais da contratação mesmo com novos dados cadastrais', () => {
    const dadosContratacaoCongelados = {
      razaoSocial: 'MERCADO TESTE 1 (ORIGINAL)',
      cnpj: '18.236.120/0001-58',
      valorMensal: 1235,
    };
    const htmlAssinado = renderizarPreviewContrato(
      'ANUNCIANTE',
      CANONICAL_TEMPLATE_HTML_ANUNCIANTE,
      dadosContratacaoCongelados,
      { signatarioNome: 'SERGIO REPRESENTANTE', metodo: 'DRAWN' }
    );
    expect(htmlAssinado).toContain('MERCADO TESTE 1 (ORIGINAL)');
    expect(htmlAssinado.replace(/\u00A0/g, ' ')).toContain('R$ 1.235,00');
    expect(htmlAssinado).toContain('Assinado digitalmente por SERGIO REPRESENTANTE');
  });

  // 33. separarHtmlEmPaginas divide estritamente em 2 páginas sem página em branco
  it('33. separarHtmlEmPaginas divide estritamente em 2 páginas sem página em branco inicial', () => {
    const paginas = contratoDocumentoService.separarHtmlEmPaginas(CANONICAL_TEMPLATE_HTML_ANUNCIANTE, 'ANUNCIANTE');
    expect(paginas.length).toBe(2);
    // Página 1: Cláusulas 01 a 05
    expect(paginas[0]).toContain('CLÁUSULA 01 - NOSSO SERVIÇO');
    expect(paginas[0]).toContain('CLÁUSULA 05 - PLANO SISTEMA');
    expect(paginas[0]).not.toContain('CLÁUSULA 06 - RESPONSABILIDADE DO CONTRATANTE');
    // Página 2: Cláusula 06 a 09 + Assinaturas
    expect(paginas[1]).toContain('CLÁUSULA 06 - RESPONSABILIDADE DO CONTRATANTE');
    expect(paginas[1]).toContain('CLÁUSULA 09 - RESCISÃO CONTRATUAL');
    expect(paginas[1]).toContain('SOBRE MÍDIA DESIGNER');
    expect(paginas[1]).not.toContain('CLÁUSULA 01 - NOSSO SERVIÇO');
  });

  // 34. Assinaturas perfeitamente alinhadas na página 2
  it('34. Assinaturas da SOBRE MÍDIA e do CONTRATANTE possuem containers de altura idêntica', () => {
    const paginas = contratoDocumentoService.separarHtmlEmPaginas(CANONICAL_TEMPLATE_HTML_ANUNCIANTE, 'ANUNCIANTE');
    const pagina2 = paginas[1];
    expect(pagina2).toContain('min-height: 48px');
    expect(pagina2).toContain('border-top: 1px solid #111827');
  });
});
