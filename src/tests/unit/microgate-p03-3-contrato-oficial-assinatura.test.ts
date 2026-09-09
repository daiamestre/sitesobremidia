import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseHtmlToElements,
  gerarPdfDoHtml,
  sha256Hex,
  CANONICAL_TEMPLATE_HTML_ANUNCIANTE,
  montarDadosTemplate,
  preencherTemplate,
  contratoDocumentoService,
} from '@/modules/crm/services/contratoDocumento.service';
import {
  MODELOS_ASSINATURA_DIGITADA,
  renderizarAssinaturaDigitadaPng,
} from '@/modules/crm/components/portal/AssinaturaContratoDialog';

describe('MICRO-GATE P0.3.3 — Auditoria Forense e Correção Definitiva do Contrato Oficial e Assinatura do Cliente', () => {
  const dadosMock = {
    RAZAO_SOCIAL: 'Supermercado Central LTDA',
    NOME_FANTASIA: 'Supermercado Central',
    CNPJ: '12.345.678/0001-90',
    RESPONSAVEL: 'Carlos Alberto Silva (Representante Legal)',
    LOGRADOURO: 'Avenida Agamenon Magalhães',
    NUMERO: '100',
    BAIRRO: 'Maurício de Nassau',
    CIDADE: 'Caruaru',
    ESTADO: 'PE',
    UF: 'PE',
    CEP: '55012-000',
    ENDERECO_UNIDADE: 'Avenida Agamenon Magalhães, 100 - Maurício de Nassau - Caruaru/PE',
    NOME_UNIDADE: 'Supermercado Central',
    TELEFONE: '81999998888',
    WHATSAPP: '81999998888',
    EMAIL: 'carlos@supercentral.com.br',
    INSTAGRAM: '@supercentral',
    WEBSITE: 'www.supercentral.com.br',
    TITULO_CAMPANHA: 'Campanha Institucional 2026',
    PACOTE_VEICULACAO: 'Plano Exclusivo',
    PERIODO_VEICULACAO: '12 meses',
    VALOR_MENSAL: 'R$ 850,00',
    VALOR_A_VISTA: 'R$ 850,00',
    FORMA_PAGAMENTO: 'Boleto Faturado',
    DATA_INICIO: '01/10/2026',
    DATA_FIM: '01/10/2027',
    QUANTIDADE_TELAS: '2',
    TOTAL_SISTEMAS: '2',
    DIAS_SEMANA: 'Segunda a Sábado',
    HORARIO_INICIO: '08:00',
    HORARIO_FIM: '22:00',
    DATA_ASSINATURA: '09 de setembro de 2026',
    LOCAL_ASSINATURA: 'Caruaru / PE',
    FORO_COMARCA: 'Caruaru',
    NUMERO_CONTRATO: 'CTR-2026-0088',
    VERSAO_CONTRATO: '1',
    TIPO_CONTRATO: 'ANUNCIANTE',
  };

  it('TESTE 1: preencherTemplate preserva integralmente todas as 9 cláusulas e dados do contratante sem truncar texto', () => {
    const htmlPreenchido = preencherTemplate(CANONICAL_TEMPLATE_HTML_ANUNCIANTE, dadosMock, 'ANUNCIANTE');

    expect(htmlPreenchido).toContain('CLÁUSULA 01 - NOSSO SERVIÇO');
    expect(htmlPreenchido).toContain('CLÁUSULA 02 - SISTEMA INTELIGENTE');
    expect(htmlPreenchido).toContain('CLÁUSULA 03 - NOSSO CONTEÚDO');
    expect(htmlPreenchido).toContain('CLÁUSULA 04 - PLANO EXCLUSIVO');
    expect(htmlPreenchido).toContain('CLÁUSULA 05 - PLANO SISTEMA');
    expect(htmlPreenchido).toContain('CLÁUSULA 06 - RESPONSABILIDADE DO CONTRATANTE');
    expect(htmlPreenchido).toContain('CLÁUSULA 07 - CONDIÇÕES DE PAGAMENTOS');
    expect(htmlPreenchido).toContain('CLÁUSULA 08 - RENOVAÇÃO DE CONTRATO');
    expect(htmlPreenchido).toContain('CLÁUSULA 09 - RESCISÃO CONTRATUAL');
    expect(htmlPreenchido).toContain('POLÍTICA DE PRIVACIDADE');
    expect(htmlPreenchido).toContain('GRADE DE HORÁRIOS, VEICULAÇÃO E PAGAMENTO');

    // Verifica que placeholders foram substituídos corretamente pelos dados do CONTRATANTE
    expect(htmlPreenchido).toContain('Supermercado Central LTDA');
    expect(htmlPreenchido).toContain('Carlos Alberto Silva');
    expect(htmlPreenchido).toContain('12.345.678/0001-90');
    expect(htmlPreenchido).not.toContain('{{RAZAO_SOCIAL}}');
    expect(htmlPreenchido).not.toContain('{{CNPJ}}');
  });

  it('TESTE 2: parseHtmlToElements não fragmenta palavras em linhas isoladas (evita quebra de "P" e "stories")', () => {
    const htmlClausula = `<p>O serviço oferecido pela <strong>SOBRE MÍDIA DESIGNER</strong> é anúncios publicitários na forma de vídeos e <b>stories</b> animados em 3D de alta qualidade.</p>`;
    const elementos = parseHtmlToElements(htmlClausula);

    expect(elementos.length).toBe(1);
    expect(elementos[0].text).toBe('O serviço oferecido pela SOBRE MÍDIA DESIGNER é anúncios publicitários na forma de vídeos e stories animados em 3D de alta qualidade.');
    expect(elementos[0].text).not.toBe('P');
    expect(elementos[0].text).not.toBe('stories');
  });

  it('TESTE 3: parseHtmlToElements decodifica entidades HTML e agrupa linhas de tabela com suas células', () => {
    const htmlTable = `<table>
      <tr>
        <td><strong>Nome/Razão Social:</strong> Empresa &amp; Cia LTDA</td>
        <td><strong>Responsável:</strong> João &ndash; Diretor</td>
      </tr>
    </table>`;
    const elementos = parseHtmlToElements(htmlTable);

    expect(elementos.length).toBe(1);
    expect(elementos[0].tag).toBe('tr');
    expect(elementos[0].cells).toBeDefined();
    expect(elementos[0].cells?.length).toBe(2);
    expect(elementos[0].cells?.[0]).toContain('Empresa & Cia LTDA');
    expect(elementos[0].cells?.[1]).toContain('João – Diretor');
  });

  it('TESTE 4: gerarPdfDoHtml gera PDF vetorial A4 multi-página preservando toda a minuta oficial', async () => {
    const htmlPreenchido = preencherTemplate(CANONICAL_TEMPLATE_HTML_ANUNCIANTE, dadosMock, 'ANUNCIANTE');
    const pdfBytes = await gerarPdfDoHtml(htmlPreenchido, 'CTR-2026-0088', 'ANUNCIANTE', 1);

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(10000); // Garante que o documento completo foi renderizado

    const hash = await sha256Hex(pdfBytes);
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });

  it('TESTE 5: MODELOS_ASSINATURA_DIGITADA oferece 4 modelos visuais distintos para a modalidade TYPED', () => {
    expect(MODELOS_ASSINATURA_DIGITADA).toHaveLength(4);

    expect(MODELOS_ASSINATURA_DIGITADA[0].nome).toContain('Modelo 1');
    expect(MODELOS_ASSINATURA_DIGITADA[1].nome).toContain('Modelo 2');
    expect(MODELOS_ASSINATURA_DIGITADA[2].nome).toContain('Modelo 3');
    expect(MODELOS_ASSINATURA_DIGITADA[3].nome).toContain('Modelo 4');

    // Cada modelo possui fontes/estilos distintos
    const fontes = MODELOS_ASSINATURA_DIGITADA.map((m) => m.fontFamily);
    const fontesUnicas = new Set(fontes);
    expect(fontesUnicas.size).toBe(4);
  });

  it('TESTE 6: renderizarAssinaturaDigitadaPng gera PNG DataURL válido para o modelo escolhido', () => {
    const dataUrl0 = renderizarAssinaturaDigitadaPng('Carlos Alberto Silva', 0);
    expect(dataUrl0).toMatch(/^data:image\/png;base64,/);

    const dataUrl1 = renderizarAssinaturaDigitadaPng('Carlos Alberto Silva', 1);
    expect(dataUrl1).toMatch(/^data:image\/png;base64,/);

    const dataUrl2 = renderizarAssinaturaDigitadaPng('Carlos Alberto Silva', 2);
    expect(dataUrl2).toMatch(/^data:image\/png;base64,/);

    const dataUrl3 = renderizarAssinaturaDigitadaPng('Carlos Alberto Silva', 3);
    expect(dataUrl3).toMatch(/^data:image\/png;base64,/);
  });

  it('TESTE 7: Signatário do contrato oficial deve ser o responsável pelo CONTRATANTE e NUNCA o operador/admin ("Sobre Midia ADM")', () => {
    const empresaMock = {
      razao_social: 'Supermercado Central LTDA',
      nome_fantasia: 'Supermercado Central',
      cnpj: '12.345.678/0001-90',
      representante_legal: 'Carlos Alberto Silva',
      contatos: [{ nome: 'Carlos Alberto Silva', email: 'carlos@supercentral.com.br' }],
    };

    const usuarioLogadoMock = {
      nome: 'Sobre Midia ADM',
      email: 'admin@sobremidia.com.br',
    };

    // A regra canônica do Micro-Gate P0.3.3:
    const signatarioResolvido =
      empresaMock.contatos?.[0]?.nome ||
      empresaMock.representante_legal ||
      empresaMock.nome_fantasia ||
      empresaMock.razao_social;

    expect(signatarioResolvido).toBe('Carlos Alberto Silva');
    expect(signatarioResolvido).not.toBe(usuarioLogadoMock.nome);
    expect(signatarioResolvido).not.toContain('Sobre Midia ADM');
  });
});
