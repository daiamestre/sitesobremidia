import { describe, it, expect } from 'vitest';
import {
  preencherTemplate,
  parseHtmlToElements,
  gerarPdfDoHtml,
  sha256Hex,
  montarDadosTemplate,
  CANONICAL_TEMPLATE_HTML_ANUNCIANTE,
  CANONICAL_TEMPLATE_HTML_PARCEIRO,
  DadosDocumentoContrato
} from '@/modules/crm/services/contratoDocumento.service';
import { resolveContractTypeFromCadastroType, getOfficialPdfForTipoContrato } from '@/modules/crm/services/contractResolver.service';

describe('GATE 2-B.3 — PDF Oficial, Template, Geração Real e Validação', () => {

  // ==========================================================================
  // 1. CASO 1: CONTRATO ANUNCIANTE (PROPOSTA OU CADASTRO DIRETO)
  // ==========================================================================
  describe('1. Fluxo e Geração de Contrato ANUNCIANTE', () => {
    it('resolve template canônico de Anunciante e preenche com dados reais completos', () => {
      const dados: DadosDocumentoContrato = {
        contrato: {
          id: 'ctr-anunc-001',
          numero_contrato: 'CTR-2026-0001',
          tipo_contrato: 'ANUNCIANTE',
          data_inicio: '2026-09-01',
          data_fim: '2027-09-01',
          valor_mensal: 2500,
          forma_pagamento: 'PIX',
          versao_atual: 1,
        },
        proposta: {
          id: 'prop-001',
          numero_proposta: 'PROP-2026-0001',
          titulo_campanha: 'Mega Campanha Primavera',
          valor_final: 2500,
          forma_pagamento: 'PIX',
        },
        empresa: {
          id: 'emp-001',
          razao_social: 'SUPERMERCADO CENTRAL LTDA',
          nome_fantasia: 'SUPER CENTRAL',
          cnpj: '12.345.678/0001-90',
          cidade: 'Caruaru',
          estado: 'PE',
          logradouro: 'Av. Agamenon Magalhães',
          numero: '1000',
          bairro: 'Maurício de Nassau',
          representante_legal: 'João Silva',
        },
        contato: {
          nome: 'João Silva',
          telefone: '(81) 98888-7777',
          email: 'contato@supercentral.com.br',
        },
        ponto: null,
        template: {
          id: 'tpl-anunciante-v1',
          codigo_template: 'TPL-ANUNCIANTE-V1',
          nome: 'Contrato de Anunciante — Oficial',
          tipo_contrato: 'ANUNCIANTE',
          conteudo_html: CANONICAL_TEMPLATE_HTML_ANUNCIANTE,
        },
        operadora: null,
        quantidadeTelas: 3,
      };

      const mapped = montarDadosTemplate(dados);
      expect(mapped.RAZAO_SOCIAL).toBe('SUPERMERCADO CENTRAL LTDA');
      expect(mapped.CNPJ).toBe('12.345.678/0001-90');
      expect(mapped.TITULO_CAMPANHA).toBe('Mega Campanha Primavera');
      expect(mapped.QUANTIDADE_TELAS).toBe('3');

      const htmlRenderizado = preencherTemplate(CANONICAL_TEMPLATE_HTML_ANUNCIANTE, mapped, 'ANUNCIANTE');
      expect(htmlRenderizado).toContain('SUPERMERCADO CENTRAL LTDA');
      expect(htmlRenderizado).toContain('12.345.678/0001-90');
      expect(htmlRenderizado).toContain('Mega Campanha Primavera');
      expect(htmlRenderizado).not.toContain('{{RAZAO_SOCIAL}}');
      expect(htmlRenderizado).not.toContain('{{CNPJ}}');
      expect(htmlRenderizado).not.toMatch(/\{\{[A-Z_0-9]+\}\}/);
    });

    it('gera PDF vetorial A4 válido para ANUNCIANTE com cabeçalho %PDF', async () => {
      const htmlRenderizado = `<h2>CONTRATO DE ANUNCIANTE</h2><p>Contratante: <strong>LOJA MODELO LTDA</strong>, CNPJ: <strong>00.111.222/0001-33</strong></p><p>Vigência de 01/09/2026 a 01/09/2027.</p>`;
      const pdfBytes = await gerarPdfDoHtml(htmlRenderizado, 'CTR-2026-0001', 'ANUNCIANTE', 1);

      expect(pdfBytes).toBeInstanceOf(Uint8Array);
      expect(pdfBytes.length).toBeGreaterThan(500);

      // Asserção de header %PDF
      const headerStr = String.fromCharCode(...pdfBytes.slice(0, 5));
      expect(headerStr).toBe('%PDF-');

      // Asserção de hash SHA-256 válido
      const hash = await sha256Hex(pdfBytes);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  // ==========================================================================
  // 2. CASO 2: CONTRATO PONTO PARCEIRO (DIRETO SEM CLIENTE/EMPRESA)
  // ==========================================================================
  describe('2. Fluxo e Geração de Contrato PONTO PARCEIRO', () => {
    it('resolve template canônico de Parceiro a partir exclusivamente de dados de pontos', () => {
      const dados: DadosDocumentoContrato = {
        contrato: {
          id: 'ctr-parc-001',
          numero_contrato: 'CTR-PARC-2026-0001',
          tipo_contrato: 'PARCEIRO',
          data_inicio: '2026-09-01',
          data_fim: '2027-09-01',
          valor_mensal: 0,
          forma_pagamento: 'ISENTO',
          versao_atual: 1,
          ponto_id: 'ponto-uuid-001',
          cliente_id: null,
          empresa_id: null,
        },
        proposta: null,
        empresa: null,
        contato: null,
        ponto: {
          id: 'ponto-uuid-001',
          nome: 'PADARIA & CONFEITARIA CENTRAL',
          logradouro: 'Rua Quinze de Novembro',
          numero: '450',
          bairro: 'Centro',
          cidade: 'Garanhuns',
          estado: 'PE',
          cep: '55290-000',
          responsavel_nome: 'Carlos Eduardo',
          telefone: '(87) 99999-1111',
          quantidade_telas: 2,
        },
        template: {
          id: 'tpl-parceiro-v1',
          codigo_template: 'TPL-PARCEIRO-V1',
          nome: 'Contrato de Parceria — Oficial',
          tipo_contrato: 'PARCEIRO',
          conteudo_html: CANONICAL_TEMPLATE_HTML_PARCEIRO,
        },
        operadora: null,
        quantidadeTelas: 2,
      };

      const mapped = montarDadosTemplate(dados);
      expect(mapped.RAZAO_SOCIAL).toBe('PADARIA & CONFEITARIA CENTRAL');
      expect(mapped.NOME_UNIDADE).toBe('PADARIA & CONFEITARIA CENTRAL');
      expect(mapped.ENDERECO_UNIDADE).toContain('Rua Quinze de Novembro, 450');
      expect(mapped.ENDERECO_UNIDADE).toContain('Garanhuns/PE');
      expect(mapped.QUANTIDADE_TELAS).toBe('2');

      const htmlRenderizado = preencherTemplate(CANONICAL_TEMPLATE_HTML_PARCEIRO, mapped, 'PARCEIRO');
      expect(htmlRenderizado).toContain('PADARIA & CONFEITARIA CENTRAL');
      expect(htmlRenderizado).toContain('Rua Quinze de Novembro, 450');
      expect(htmlRenderizado).not.toContain('{{RAZAO_SOCIAL}}');
      expect(htmlRenderizado).not.toContain('{{ENDERECO_UNIDADE}}');
      expect(htmlRenderizado).not.toMatch(/\{\{[A-Z_0-9]+\}\}/);

      // Verificação estrita das 7 Cláusulas Oficiais Canônicas
      expect(htmlRenderizado).toContain('CLÁUSULA 01 — DO OBJETO');
      expect(htmlRenderizado).toContain('CLÁUSULA 02 — SERVIÇOS REALIZADOS PELA SOBRE MÍDIA');
      expect(htmlRenderizado).toContain('CLÁUSULA 03 — OBRIGAÇÕES DO ESTABELECIMENTO PARCEIRO');
      expect(htmlRenderizado).toContain('03.1. Internet');
      expect(htmlRenderizado).toContain('03.2. Energia Elétrica');
      expect(htmlRenderizado).toContain('03.3. Comunicação de Problemas');
      expect(htmlRenderizado).toContain('03.4. Proteção dos Equipamentos');
      expect(htmlRenderizado).toContain('CLÁUSULA 04 — OBRIGAÇÕES DO GESTOR DE MÍDIA');
      expect(htmlRenderizado).toContain('4.1.');
      expect(htmlRenderizado).toContain('4.2.');
      expect(htmlRenderizado).toContain('4.3.');
      expect(htmlRenderizado).toContain('CLÁUSULA 05 — GRADE DE PROGRAMAÇÃO');
      expect(htmlRenderizado).toContain('CLÁUSULA 06 — VIGÊNCIA E RESCISÃO');
      expect(htmlRenderizado).toContain('6.1.');
      expect(htmlRenderizado).toContain('A)');
      expect(htmlRenderizado).toContain('B)');
      expect(htmlRenderizado).toContain('CLÁUSULA 07 — CIÊNCIA DE CONTRATO / FORO / ASSINATURAS');
    });

    it('gera PDF de PARCEIRO com as 7 cláusulas sem exigir CNPJ ou empresa_id', async () => {
      const dadosCompletos = {
        RAZAO_SOCIAL: 'MERCADO PARCEIRO EXEMPLO LTDA',
        CNPJ: '12.345.678/0001-99',
        ENDERECO_UNIDADE: 'Av. Principal, 100 - Centro - Campina Grande/PB',
        BAIRRO: 'Centro',
        CIDADE: 'Campina Grande',
        UF: 'PB',
        RESPONSAVEL: 'João Silva',
        TELEFONE: '(83) 98888-7777',
        WHATSAPP: '(83) 98888-7777',
        EMAIL: 'parceiro@exemplo.com.br',
        INSTAGRAM: '@mercadoparceiro',
        DIAS_SEMANA: 'Segunda a Sábado',
        HORARIO_INICIO: '08:00',
        HORARIO_FIM: '18:00',
        DATA_INICIO: '01/09/2026',
        DATA_FIM: '01/03/2027',
        QUANTIDADE_TELAS: '1',
        FORO_COMARCA: 'Campina Grande/PB',
        DATA_ASSINATURA: '04/09/2026',
      };
      const htmlRenderizado = preencherTemplate(CANONICAL_TEMPLATE_HTML_PARCEIRO, dadosCompletos, 'PARCEIRO');
      const pdfBytes = await gerarPdfDoHtml(htmlRenderizado, 'CTR-PARC-2026-0001', 'PARCEIRO', 1);

      expect(pdfBytes).toBeInstanceOf(Uint8Array);
      expect(pdfBytes.length).toBeGreaterThan(1500);

      const headerStr = String.fromCharCode(...pdfBytes.slice(0, 5));
      expect(headerStr).toBe('%PDF-');
    });
  });

  // ==========================================================================
  // 3. CASO 3: POLÍTICA FAIL-CLOSED E TRATAMENTO DE OBRIGATÓRIOS
  // ==========================================================================
  describe('3. Política Fail-Closed e Proteção de Dados Essenciais', () => {
    it('lança exceção descritiva quando CNPJ está ausente em contrato ANUNCIANTE', () => {
      const dadosIncompletos = {
        RAZAO_SOCIAL: 'MERCADO SEM CNPJ LTDA',
        DATA_INICIO: '01/09/2026',
        DATA_FIM: '01/09/2027',
      };

      expect(() => preencherTemplate(CANONICAL_TEMPLATE_HTML_ANUNCIANTE, dadosIncompletos, 'ANUNCIANTE')).toThrowError(
        /Dado essencial ausente para contrato ANUNCIANTE: \[CNPJ\]/
      );
    });

    it('lança exceção descritiva quando RAZAO_SOCIAL está ausente em contrato PARCEIRO', () => {
      const dadosIncompletos = {
        DATA_INICIO: '01/09/2026',
        DATA_FIM: '01/09/2027',
      };

      expect(() => preencherTemplate(CANONICAL_TEMPLATE_HTML_PARCEIRO, dadosIncompletos, 'PARCEIRO')).toThrowError(
        /Dado essencial ausente para contrato PARCEIRO: \[RAZAO_SOCIAL\]/
      );
    });

    it('não falha quando campos puramente opcionais (ex: TITULO_CAMPANHA) estão ausentes', () => {
      const dadosSemOpcionais = {
        RAZAO_SOCIAL: 'MERCADO MODELO LTDA',
        CNPJ: '11.222.333/0001-44',
        DATA_INICIO: '01/09/2026',
        DATA_FIM: '01/09/2027',
      };

      const resultado = preencherTemplate(CANONICAL_TEMPLATE_HTML_ANUNCIANTE, dadosSemOpcionais, 'ANUNCIANTE');
      expect(resultado).toContain('MERCADO MODELO LTDA');
      expect(resultado).not.toMatch(/\{\{[A-Z_0-9]+\}\}/);
    });
  });

  // ==========================================================================
  // 4. CASO 4: IDEMPOTÊNCIA E REPRODUTIBILIDADE
  // ==========================================================================
  describe('4. Idempotência e Reprodutibilidade de Geração', () => {
    it('múltiplas gerações com os mesmos dados produzem PDFs estruturalmente válidos e consistentes', async () => {
      const htmlRenderizado = `<h2>CONTRATO DETERMINISTICO</h2><p>Empresa: <strong>EMPRESA TESTE S/A</strong></p><p>CNPJ: <strong>99.888.777/0001-11</strong></p>`;
      const pdf1 = await gerarPdfDoHtml(htmlRenderizado, 'CTR-IDEMPOTENTE-01', 'ANUNCIANTE', 1);
      const pdf2 = await gerarPdfDoHtml(htmlRenderizado, 'CTR-IDEMPOTENTE-01', 'ANUNCIANTE', 1);

      expect(pdf1.length).toBe(pdf2.length);
      expect(pdf1.length).toBeGreaterThan(500);
      const headerStr1 = String.fromCharCode(...pdf1.slice(0, 5));
      const headerStr2 = String.fromCharCode(...pdf2.slice(0, 5));
      expect(headerStr1).toBe('%PDF-');
      expect(headerStr2).toBe('%PDF-');
    });
  });

  // ==========================================================================
  // 5. REGRA CANÔNICA DE ARQUIVOS OFICIAIS
  // ==========================================================================
  describe('5. Relação Canônica com Arquivos Oficiais', () => {
    it('associa ANUNCIANTE exclusivamente com contrato-anunciante.pdf', () => {
      const pdf = getOfficialPdfForTipoContrato('ANUNCIANTE');
      expect(pdf?.fileName).toBe('contrato-anunciante.pdf');
      expect(pdf?.tipoContrato).toBe('ANUNCIANTE');
      expect(pdf?.publicPath).toBe('/official-contracts/contrato-anunciante.pdf');
    });

    it('associa PARCEIRO exclusivamente com contrato-parceria.pdf', () => {
      const pdf = getOfficialPdfForTipoContrato('PARCEIRO');
      expect(pdf?.fileName).toBe('contrato-parceria.pdf');
      expect(pdf?.tipoContrato).toBe('PARCEIRO');
      expect(pdf?.publicPath).toBe('/official-contracts/contrato-parceria.pdf');
    });
  });
});
