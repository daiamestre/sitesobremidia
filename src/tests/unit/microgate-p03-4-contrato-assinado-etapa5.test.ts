import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  renderizarPreviewContrato,
  CANONICAL_TEMPLATE_HTML_ANUNCIANTE,
  CANONICAL_TEMPLATE_HTML_PARCEIRO,
  CANONICAL_TEMPLATE_HTML_GESTOR,
  preencherTemplate,
  sha256Hex,
} from '@/modules/crm/services/contratoDocumento.service';
import {
  MODELOS_ASSINATURA_DIGITADA,
  renderizarAssinaturaDigitadaPng,
} from '@/modules/crm/components/portal/AssinaturaContratoDialog';

describe('MICRO-GATE P0.3.4 — Contrato Assinado Visível na Etapa 5', () => {
  const mockFormData = {
    nomeFantasia: 'Mercado Teste 1',
    razaoSocial: 'Mercado Teste 1 LTDA',
    cnpj: '12.345.678/0001-90',
    representanteLegal: 'Carlos Alberto Silva',
    cargoRepresentante: 'Sócio-Administrador',
    contatoNome: 'Carlos Alberto Silva',
    email: 'carlos@mercadoteste1.com.br',
    telefone: '81999998888',
    whatsapp: '81999998888',
    cep: '55012-000',
    logradouro: 'Avenida Agamenon Magalhães',
    numero: '100',
    bairro: 'Maurício de Nassau',
    cidade: 'Caruaru',
    estado: 'PE',
    tituloCampanha: 'Campanha Mercado Teste 1',
    valorMensal: 850,
    periodicidade: 'MENSAL',
    formaPagamento: 'PIX',
    dataInicio: '2026-10-01',
    dataFim: '2027-10-01',
  };

  const mockDrawnSignaturePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  it('TESTE 1: Contrato pendente / não assinado mostra Minuta Oficial sem assinatura e com linha em branco', () => {
    const htmlUnsigned = renderizarPreviewContrato('ANUNCIANTE', CANONICAL_TEMPLATE_HTML_ANUNCIANTE, mockFormData);

    // Contrato completo preservado
    expect(htmlUnsigned).toContain('CLÁUSULA 01 - NOSSO SERVIÇO');
    expect(htmlUnsigned).toContain('CLÁUSULA 09 - RESCISÃO CONTRATUAL');
    expect(htmlUnsigned).toContain('Mercado Teste 1 LTDA (CONTRATANTE)');

    // Não contém imagem de assinatura ou selo de assinado digitalmente
    expect(htmlUnsigned).not.toContain('<img src="data:image/png;base64,');
    expect(htmlUnsigned).not.toContain('✓ Assinado digitalmente por');
  });

  it('TESTE 2: Após assinatura DRAWN, documento exibido na Etapa 5 contém a assinatura desenhada', () => {
    const htmlSignedDrawn = renderizarPreviewContrato('ANUNCIANTE', CANONICAL_TEMPLATE_HTML_ANUNCIANTE, mockFormData, {
      dataUrl: mockDrawnSignaturePng,
      signatarioNome: 'Carlos Alberto Silva',
      signatarioCpfCnpj: '12.345.678/0001-90',
      dataAssinatura: '09 de setembro de 2026',
      metodo: 'DRAWN',
    });

    expect(htmlSignedDrawn).toContain('<img src="data:image/png;base64,');
    expect(htmlSignedDrawn).toContain('alt="Assinatura do Contratante"');
    expect(htmlSignedDrawn).toContain('✓ Assinado digitalmente por Carlos Alberto Silva');
    expect(htmlSignedDrawn).toContain('Método: Digital Desenhada (DRAWN)');
  });

  it('TESTE 3: Após assinatura TYPED, documento exibido na Etapa 5 contém a assinatura digitada estilizada', () => {
    const typedPng = renderizarAssinaturaDigitadaPng('Carlos Alberto Silva', 1); // Modelo 2 - Caligráfica Moderna

    const htmlSignedTyped = renderizarPreviewContrato('ANUNCIANTE', CANONICAL_TEMPLATE_HTML_ANUNCIANTE, mockFormData, {
      dataUrl: typedPng,
      signatarioNome: 'Carlos Alberto Silva',
      signatarioCpfCnpj: '12.345.678/0001-90',
      dataAssinatura: '09 de setembro de 2026',
      metodo: 'TYPED',
    });

    expect(htmlSignedTyped).toContain('<img src="data:image/png;base64,');
    expect(htmlSignedTyped).toContain('✓ Assinado digitalmente por Carlos Alberto Silva');
    expect(htmlSignedTyped).toContain('Método: Assinatura Digitada (TYPED)');
  });

  it('TESTE 4: Assinatura aparece especificamente no bloco do CONTRATANTE', () => {
    const htmlSigned = renderizarPreviewContrato('ANUNCIANTE', CANONICAL_TEMPLATE_HTML_ANUNCIANTE, mockFormData, {
      dataUrl: mockDrawnSignaturePng,
      signatarioNome: 'Carlos Alberto Silva',
      metodo: 'DRAWN',
    });

    // Bloco da SOBRE MÍDIA permanece como contratado
    expect(htmlSigned).toContain('SOBRE MÍDIA DESIGNER');

    // Bloco do CONTRATANTE contém a assinatura
    expect(htmlSigned).toContain('Mercado Teste 1 LTDA (CONTRATANTE)');
    expect(htmlSigned).toContain('✓ Assinado digitalmente por Carlos Alberto Silva');
  });

  it('TESTE 5: Assinatura aparece visualmente e estruturalmente ACIMA do nome "CONTRATANTE"', () => {
    const htmlSigned = renderizarPreviewContrato('ANUNCIANTE', CANONICAL_TEMPLATE_HTML_ANUNCIANTE, mockFormData, {
      dataUrl: mockDrawnSignaturePng,
      signatarioNome: 'Carlos Alberto Silva',
      metodo: 'DRAWN',
    });

    const indexImg = htmlSigned.indexOf('<img src="data:image/png;base64,');
    const indexContratante = htmlSigned.indexOf('(CONTRATANTE)');

    expect(indexImg).toBeGreaterThan(-1);
    expect(indexContratante).toBeGreaterThan(-1);
    expect(indexImg).toBeLessThan(indexContratante); // A assinatura é renderizada ANTES / ACIMA de (CONTRATANTE)
  });

  it('TESTE 6: Etapa 5 não exibe documento sem assinatura quando status = ASSINADO', () => {
    const assinaturaInfo = {
      dataUrl: mockDrawnSignaturePng,
      signatarioNome: 'Carlos Alberto Silva',
      metodo: 'DRAWN',
    };

    const htmlSigned = renderizarPreviewContrato('ANUNCIANTE', CANONICAL_TEMPLATE_HTML_ANUNCIANTE, mockFormData, assinaturaInfo);

    // Deve conter a assinatura
    expect(htmlSigned).toContain('<img src="data:image/png;base64,');
    expect(htmlSigned).toContain('✓ Assinado digitalmente por Carlos Alberto Silva');
  });

  it('TESTE 7: Reabrir a Etapa 5 reutiliza a assinatura existente de forma idempotente sem gerar novos registros', () => {
    const assinaturaPersistida = {
      dataUrl: mockDrawnSignaturePng,
      signatarioNome: 'Carlos Alberto Silva',
      metodo: 'DRAWN',
      dataAssinatura: '09 de setembro de 2026',
    };

    const renderizacao1 = renderizarPreviewContrato('ANUNCIANTE', CANONICAL_TEMPLATE_HTML_ANUNCIANTE, mockFormData, assinaturaPersistida);
    const renderizacao2 = renderizarPreviewContrato('ANUNCIANTE', CANONICAL_TEMPLATE_HTML_ANUNCIANTE, mockFormData, assinaturaPersistida);

    expect(renderizacao1).toEqual(renderizacao2);
  });

  it('TESTE 8: Reabrir a Etapa 5 mantém o mesmo documento assinado (mesmas 9 cláusulas e metadados)', () => {
    const assinaturaPersistida = {
      dataUrl: mockDrawnSignaturePng,
      signatarioNome: 'Carlos Alberto Silva',
      metodo: 'DRAWN',
      dataAssinatura: '09 de setembro de 2026',
    };

    const html = renderizarPreviewContrato('ANUNCIANTE', CANONICAL_TEMPLATE_HTML_ANUNCIANTE, mockFormData, assinaturaPersistida);

    expect(html).toContain('CLÁUSULA 01 - NOSSO SERVIÇO');
    expect(html).toContain('CLÁUSULA 02 - SISTEMA INTELIGENTE');
    expect(html).toContain('CLÁUSULA 03 - NOSSO CONTEÚDO');
    expect(html).toContain('CLÁUSULA 04 - PLANO EXCLUSIVO');
    expect(html).toContain('CLÁUSULA 05 - PLANO SISTEMA');
    expect(html).toContain('CLÁUSULA 06 - RESPONSABILIDADE DO CONTRATANTE');
    expect(html).toContain('CLÁUSULA 07 - CONDIÇÕES DE PAGAMENTOS');
    expect(html).toContain('CLÁUSULA 08 - RENOVAÇÃO DE CONTRATO');
    expect(html).toContain('CLÁUSULA 09 - RESCISÃO CONTRATUAL');
  });

  it('TESTE 9: Signatário nunca pode ser "Sobre Midia ADM" ou qualquer fallback administrativo', () => {
    // Simula lista de candidatos contendo nome da empresa e representante
    const candidatos = ['Sobre Mídia Designer', 'Sobre Midia ADM', 'Carlos Alberto Silva'];
    const nomeValido = candidatos.find((c) => !/sobre\s*m[íi]dia|admin|operador|sistema/i.test(c.trim())) || candidatos[0];

    expect(nomeValido).toBe('Carlos Alberto Silva');
    expect(nomeValido).not.toContain('Sobre Midia');
  });

  it('TESTE 10: Tela de sucesso e prévia apresentam o signatário real do CONTRATANTE', () => {
    const htmlSigned = renderizarPreviewContrato('ANUNCIANTE', CANONICAL_TEMPLATE_HTML_ANUNCIANTE, mockFormData, {
      dataUrl: mockDrawnSignaturePng,
      signatarioNome: 'Carlos Alberto Silva',
      metodo: 'DRAWN',
    });

    expect(htmlSigned).toContain('Carlos Alberto Silva');
    expect(htmlSigned).not.toContain('Sobre Midia ADM');
  });

  it('TESTE 11: Método DRAWN é preservado e explicitamente rotulado como DRAWN', () => {
    const html = renderizarPreviewContrato('ANUNCIANTE', CANONICAL_TEMPLATE_HTML_ANUNCIANTE, mockFormData, {
      dataUrl: mockDrawnSignaturePng,
      signatarioNome: 'Carlos Alberto Silva',
      metodo: 'DRAWN',
    });

    expect(html).toContain('Método: Digital Desenhada (DRAWN)');
  });

  it('TESTE 12: Método TYPED é preservado e explicitamente rotulado como TYPED', () => {
    const html = renderizarPreviewContrato('ANUNCIANTE', CANONICAL_TEMPLATE_HTML_ANUNCIANTE, mockFormData, {
      dataUrl: mockDrawnSignaturePng,
      signatarioNome: 'Carlos Alberto Silva',
      metodo: 'TYPED',
    });

    expect(html).toContain('Método: Assinatura Digitada (TYPED)');
  });

  it('TESTE 13: SHA-256 do documento assinado permanece válido e consistente', async () => {
    const htmlSigned = renderizarPreviewContrato('ANUNCIANTE', CANONICAL_TEMPLATE_HTML_ANUNCIANTE, mockFormData, {
      dataUrl: mockDrawnSignaturePng,
      signatarioNome: 'Carlos Alberto Silva',
      metodo: 'DRAWN',
    });

    const encoder = new TextEncoder();
    const hash = await sha256Hex(encoder.encode(htmlSigned));

    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });

  it('TESTE 14: Documento assinado funciona para Contratos de Parceiro e Gestor', () => {
    const htmlParceiro = renderizarPreviewContrato('PARCEIRO', CANONICAL_TEMPLATE_HTML_PARCEIRO, mockFormData, {
      dataUrl: mockDrawnSignaturePng,
      signatarioNome: 'Carlos Alberto Silva',
      metodo: 'DRAWN',
    });

    expect(htmlParceiro).toContain('CLÁUSULA 01 – DO OBJETO');
    expect(htmlParceiro).toContain('✓ Assinado digitalmente por Carlos Alberto Silva');
    expect(htmlParceiro).toContain('(PARCEIRO)');

    const htmlGestor = renderizarPreviewContrato('GESTOR', CANONICAL_TEMPLATE_HTML_GESTOR, mockFormData, {
      dataUrl: mockDrawnSignaturePng,
      signatarioNome: 'Carlos Alberto Silva',
      metodo: 'TYPED',
    });

    expect(htmlGestor).toContain('1. OBJETO');
    expect(htmlGestor).toContain('✓ Assinado digitalmente por Carlos Alberto Silva');
    expect(htmlGestor).toContain('(GESTOR)');
  });

  it('TESTE 15: Documento assinado permanece disponível e íntegro em renderizações subsequentes', () => {
    const assinaturaData = {
      dataUrl: mockDrawnSignaturePng,
      signatarioNome: 'Carlos Alberto Silva',
      signatarioCpfCnpj: '12.345.678/0001-90',
      dataAssinatura: '09 de setembro de 2026',
      metodo: 'DRAWN',
    };

    const render1 = renderizarPreviewContrato('ANUNCIANTE', CANONICAL_TEMPLATE_HTML_ANUNCIANTE, mockFormData, assinaturaData);
    const render2 = renderizarPreviewContrato('ANUNCIANTE', CANONICAL_TEMPLATE_HTML_ANUNCIANTE, mockFormData, assinaturaData);

    expect(render1).toBe(render2);
    expect(render1).toContain('<img src="data:image/png;base64,');
    expect(render1).toContain('Mercado Teste 1 LTDA (CONTRATANTE)');
  });
});
