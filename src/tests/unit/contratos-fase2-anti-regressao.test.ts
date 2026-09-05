import { describe, it, expect } from 'vitest';
import {
  preencherTemplate,
  parseHtmlToElements,
  montarDadosTemplate,
  DadosDocumentoContrato,
} from '@/modules/crm/services/contratoDocumento.service';
import { resolveContractTypeFromCadastroType } from '@/modules/crm/services/contractResolver.service';

describe('FASE 2 — Testes Anti-Regressão do Módulo de Contratos Oficiais', () => {

  // ==========================================================================
  // 1. PLACEHOLDERS & POLÍTICA DE OBRIGATÓRIOS VS OPCIONAIS
  // ==========================================================================
  describe('Motor de Template e Placeholders (preencherTemplate)', () => {
    it('CT-001: Preenche template ANUNCIANTE com dados reais completos sem deixar placeholders', () => {
      const templateHtml = '<h1>CONTRATO</h1><p>Razao: {{RAZAO_SOCIAL}}, CNPJ: {{CNPJ}}, Campanha: {{TITULO_CAMPANHA}}, Telas: {{QUANTIDADE_TELAS}}</p><p>De {{DATA_INICIO}} a {{DATA_FIM}}</p>';
      const dados = {
        RAZAO_SOCIAL: 'MERCADO MODELO LTDA',
        CNPJ: '12.345.678/0001-90',
        TITULO_CAMPANHA: 'Campanha de Primavera 2026',
        QUANTIDADE_TELAS: '5',
        DATA_INICIO: '01/09/2026',
        DATA_FIM: '01/09/2027',
      };

      const resultado = preencherTemplate(templateHtml, dados, 'ANUNCIANTE');
      expect(resultado).toContain('MERCADO MODELO LTDA');
      expect(resultado).toContain('12.345.678/0001-90');
      expect(resultado).toContain('Campanha de Primavera 2026');
      expect(resultado).toContain('5');
      expect(resultado).toContain('01/09/2026');
      expect(resultado).toContain('01/09/2027');
      expect(resultado).not.toMatch(/\{\{[A-Z_0-9]+\}\}/);
    });

    it('CT-002: Campos opcionais ausentes (TITULO_CAMPANHA, QUANTIDADE_TELAS) NÃO lançam exceção e são limpos', () => {
      const templateHtml = '<p>Razao: {{RAZAO_SOCIAL}}, CNPJ: {{CNPJ}}, Campanha: {{TITULO_CAMPANHA}}, Telas: {{QUANTIDADE_TELAS}}</p><p>De {{DATA_INICIO}} a {{DATA_FIM}}</p>';
      const dados = {
        RAZAO_SOCIAL: 'POSTO IPIRANGA MATRIZ',
        CNPJ: '99.888.777/0001-11',
        DATA_INICIO: '01/09/2026',
        DATA_FIM: '01/09/2027',
      };

      // Não deve lançar erro mesmo sem TITULO_CAMPANHA ou QUANTIDADE_TELAS
      const resultado = preencherTemplate(templateHtml, dados, 'ANUNCIANTE');
      expect(resultado).toContain('POSTO IPIRANGA MATRIZ');
      expect(resultado).not.toMatch(/\{\{[A-Z_0-9]+\}\}/);
      expect(resultado).not.toContain('{{TITULO_CAMPANHA}}');
      expect(resultado).not.toContain('{{QUANTIDADE_TELAS}}');
    });

    it('CT-003: Campo estruturalmente obrigatório ausente em ANUNCIANTE (ex: CNPJ) lança erro descritivo', () => {
      const templateHtml = '<p>Razao: {{RAZAO_SOCIAL}}, CNPJ: {{CNPJ}}</p><p>De {{DATA_INICIO}} a {{DATA_FIM}}</p>';
      const dados = {
        RAZAO_SOCIAL: 'MERCADO MODELO LTDA',
        // CNPJ ausente intencionalmente
        DATA_INICIO: '01/09/2026',
        DATA_FIM: '01/09/2027',
      };

      expect(() => preencherTemplate(templateHtml, dados, 'ANUNCIANTE')).toThrowError(
        /Dado essencial ausente para contrato ANUNCIANTE: \[CNPJ\]/
      );
    });

    it('CT-004: Campo estruturalmente obrigatório ausente em PARCEIRO (ex: RAZAO_SOCIAL) lança erro descritivo', () => {
      const templateHtml = '<p>Parceiro: {{RAZAO_SOCIAL}}, Unidade: {{NOME_UNIDADE}}</p><p>De {{DATA_INICIO}} a {{DATA_FIM}}</p>';
      const dados = {
        // RAZAO_SOCIAL ausente intencionalmente
        NOME_UNIDADE: 'Unidade Centro',
        DATA_INICIO: '01/09/2026',
        DATA_FIM: '01/09/2027',
      };

      expect(() => preencherTemplate(templateHtml, dados, 'PARCEIRO')).toThrowError(
        /Dado essencial ausente para contrato PARCEIRO: \[RAZAO_SOCIAL\]/
      );
    });

    it('CT-005: Template PARCEIRO preenchido sem dados de campanha comercial funciona perfeitamente', () => {
      const templateHtml = '<h2>CONTRATO DE PARCERIA</h2><p>Parceiro: {{RAZAO_SOCIAL}}, Endereco: {{ENDERECO_UNIDADE}}</p><p>Vigencia: {{DATA_INICIO}} a {{DATA_FIM}}</p><p>Horario: {{HORARIO_INICIO}} as {{HORARIO_FIM}}</p>';
      const dados = {
        RAZAO_SOCIAL: 'PADARIA REAL CENTRAL',
        ENDERECO_UNIDADE: 'Av. Paulista, 1000 - Bela Vista - Sao Paulo/SP',
        DATA_INICIO: '01/09/2026',
        DATA_FIM: '01/09/2027',
        HORARIO_INICIO: '06:00',
        HORARIO_FIM: '22:00',
      };

      const resultado = preencherTemplate(templateHtml, dados, 'PARCEIRO');
      expect(resultado).toContain('PADARIA REAL CENTRAL');
      expect(resultado).toContain('Av. Paulista, 1000');
      expect(resultado).toContain('06:00 as 22:00');
      expect(resultado).not.toMatch(/\{\{[A-Z_0-9]+\}\}/);
    });
  });

  // ==========================================================================
  // 2. MONTAGEM DE DADOS: ANUNCIANTE VS PARCEIRO
  // ==========================================================================
  describe('Coleta e Mapeamento de Dados (montarDadosTemplate)', () => {
    it('CT-006: ANUNCIANTE com proposta coleta dados de empresa, contato e proposta', () => {
      const dadosEntrada: DadosDocumentoContrato = {
        contrato: {
          id: 'ctr-001',
          tipo_contrato: 'ANUNCIANTE',
          numero_contrato: 'CTR-2026-0001',
          valor_mensal: 1500,
          forma_pagamento: 'PIX',
          data_inicio: '2026-09-01',
          data_fim: '2027-09-01',
        },
        proposta: {
          id: 'prop-001',
          titulo_campanha: 'Campanha Black Friday',
          valor_final: 1500,
          forma_pagamento: 'PIX',
          desconto: 200,
          numero_parcelas: 12,
        },
        empresa: {
          razao_social: 'COMERCIAL ALVORADA LTDA',
          nome_fantasia: 'Alvorada Supermercados',
          cnpj: '11.222.333/0001-44',
          cidade: 'Campinas',
          estado: 'SP',
          logradouro: 'Rua das Flores',
          numero: '123',
          bairro: 'Centro',
        },
        contato: {
          nome: 'Carlos Silva',
          email: 'carlos@alvorada.com',
          telefone: '19999999999',
        },
        ponto: null,
        template: { id: 'tpl-1' },
        operadora: { id: 'op-1' },
        quantidadeTelas: 3,
      };

      const dadosMontados = montarDadosTemplate(dadosEntrada);

      expect(dadosMontados.RAZAO_SOCIAL).toBe('COMERCIAL ALVORADA LTDA');
      expect(dadosMontados.NOME_FANTASIA).toBe('Alvorada Supermercados');
      expect(dadosMontados.CNPJ).toBe('11.222.333/0001-44');
      expect(dadosMontados.RESPONSAVEL).toBe('Carlos Silva');
      expect(dadosMontados.TITULO_CAMPANHA).toBe('Campanha Black Friday');
      expect(dadosMontados.QUANTIDADE_TELAS).toBe('3');
      expect(dadosMontados.CIDADE).toBe('Campinas');
      expect(dadosMontados.ESTADO).toBe('SP');
    });

    it('CT-007: PARCEIRO coleta dados primariamente da entidade ponto', () => {
      const dadosEntrada: DadosDocumentoContrato = {
        contrato: {
          id: 'ctr-002',
          tipo_contrato: 'PARCEIRO',
          numero_contrato: 'CTR-2026-0002',
          valor_mensal: 0,
          forma_pagamento: 'ISENTO',
          data_inicio: '2026-09-01',
          data_fim: '2027-09-01',
          ponto_id: 'ponto-001',
          proposta_id: null,
        },
        proposta: null,
        empresa: null,
        contato: null,
        ponto: {
          id: 'ponto-001',
          nome: 'ACADEMIA SMART FIT CENTRO',
          nome_fantasia: 'Smart Fit Centro',
          cnpj: '55.666.777/0001-88',
          responsavel_nome: 'Mariana Lima',
          responsavel_email: 'mariana@smartfit.com.br',
          responsavel_telefone: '11988887777',
          logradouro: 'Av. Brigadeiro Luis Antonio',
          numero: '2500',
          bairro: 'Jardins',
          cidade: 'Sao Paulo',
          estado: 'SP',
          cep: '01402-000',
          horario_abertura: '06:00',
          horario_fechamento: '23:00',
          dias_funcionamento: 'Segunda a Domingo',
        },
        template: { id: 'tpl-2' },
        operadora: { id: 'op-1' },
        quantidadeTelas: 2,
      };

      const dadosMontados = montarDadosTemplate(dadosEntrada);

      expect(dadosMontados.RAZAO_SOCIAL).toBe('ACADEMIA SMART FIT CENTRO');
      expect(dadosMontados.CNPJ).toBe('55.666.777/0001-88');
      expect(dadosMontados.RESPONSAVEL).toBe('Mariana Lima');
      expect(dadosMontados.EMAIL).toBe('mariana@smartfit.com.br');
      expect(dadosMontados.HORARIO_INICIO).toBe('06:00');
      expect(dadosMontados.HORARIO_FIM).toBe('23:00');
      expect(dadosMontados.DIAS_SEMANA).toBe('Segunda a Domingo');
      expect(dadosMontados.CIDADE).toBe('Sao Paulo');
      expect(dadosMontados.ESTADO).toBe('SP');
      expect(dadosMontados.ENDERECO_UNIDADE).toContain('Av. Brigadeiro Luis Antonio, 2500');
    });

    it('CT-008: ANUNCIANTE por CADASTRO DIRETO (sem proposta) monta dados da empresa sem quebrar', () => {
      const dadosEntrada: DadosDocumentoContrato = {
        contrato: {
          id: 'ctr-003',
          tipo_contrato: 'ANUNCIANTE',
          numero_contrato: 'CTR-2026-0003',
          valor_mensal: 2000,
          forma_pagamento: 'BOLETO',
          data_inicio: '2026-09-01',
          data_fim: '2027-09-01',
          proposta_id: null,
          cliente_id: 'cli-001',
        },
        proposta: null, // Sem proposta de origem
        empresa: {
          razao_social: 'FARMACIA POPULAR SA',
          nome_fantasia: 'Drogaria Popular',
          cnpj: '33.444.555/0001-66',
          representante_legal: 'Roberto Mendes',
          cidade: 'Ribeirao Preto',
          estado: 'SP',
          logradouro: 'Rua Duque de Caxias',
          numero: '450',
          bairro: 'Centro',
        },
        contato: null,
        ponto: null,
        template: { id: 'tpl-1' },
        operadora: { id: 'op-1' },
        quantidadeTelas: 0,
      };

      const dadosMontados = montarDadosTemplate(dadosEntrada);

      expect(dadosMontados.RAZAO_SOCIAL).toBe('FARMACIA POPULAR SA');
      expect(dadosMontados.CNPJ).toBe('33.444.555/0001-66');
      expect(dadosMontados.RESPONSAVEL).toBe('Roberto Mendes');
      expect(dadosMontados.TITULO_CAMPANHA).toBe('');
      expect(dadosMontados.CIDADE).toBe('Ribeirao Preto');
    });
  });

  // ==========================================================================
  // 3. PARSER HTML E ESTRUTURA DO DOCUMENTO VETORIAL
  // ==========================================================================
  describe('Parser HTML de Template (parseHtmlToElements)', () => {
    it('CT-009: Extrai tags de cabeçalho, parágrafos e negrito corretamente', () => {
      const html = '<h1>CONTRATO OFICIAL</h1><p>Texto introdutorio <strong>importante</strong>.</p><h2>1. DO OBJETO</h2><p>Descricao do servico.</p>';
      const elements = parseHtmlToElements(html);

      expect(elements.length).toBeGreaterThanOrEqual(4);
      expect(elements[0].tag).toBe('h1');
      expect(elements[0].text).toBe('CONTRATO OFICIAL');
      expect(elements[1].text).toContain('Texto introdutorio');
      expect(elements.some(e => e.tag === 'h2' && e.text === '1. DO OBJETO')).toBe(true);
    });
  });

  // ==========================================================================
  // 4. TRIAGEM & RESOLVER CENTRAL
  // ==========================================================================
  describe('Resolver Central de Tipo de Contrato (resolveContractTypeFromCadastroType)', () => {
    it('CT-010: ANUNCIANTE resolve para ANUNCIANTE', () => {
      expect(resolveContractTypeFromCadastroType('ANUNCIANTE')).toBe('ANUNCIANTE');
    });

    it('CT-011: PONTO_PARCEIRO resolve para PARCEIRO', () => {
      expect(resolveContractTypeFromCadastroType('PONTO_PARCEIRO')).toBe('PARCEIRO');
    });

    it('CT-012: GESTOR_MIDIAS resolve para GESTOR', () => {
      expect(resolveContractTypeFromCadastroType('GESTOR_MIDIAS')).toBe('GESTOR');
    });

    it('CT-013: Entrada inválida ou vazia retorna null de forma segura', () => {
      expect(resolveContractTypeFromCadastroType(null)).toBeNull();
      expect(resolveContractTypeFromCadastroType(undefined)).toBeNull();
      expect(resolveContractTypeFromCadastroType('')).toBeNull();
    });
  });
});
