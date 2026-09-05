import { describe, it, expect, vi } from 'vitest';
import {
  PLACEHOLDER_CATALOG,
  detectarPlaceholders,
  validarPlaceholdersTemplate,
  formatarDataExtensa,
  preencherTemplate,
  montarDadosTemplate,
  CANONICAL_TEMPLATE_HTML_ANUNCIANTE,
  CANONICAL_TEMPLATE_HTML_PARCEIRO,
  CANONICAL_TEMPLATE_HTML_GESTOR,
  DadosDocumentoContrato,
} from '@/modules/crm/services/contratoDocumento.service';
import { ContratoModelosAdminService } from '@/modules/crm/services/contratoModelosAdmin.service';
import { sanitizeHtmlForPreview } from '@/modules/crm/components/contracts/ReadableContractEditor';

describe('MICRO-GATE 05.4 — Motor de Preenchimento Automático, Editor Legível e Snapshot Histórico', () => {

  describe('1. Catálogo Canônico de Placeholders (FASE 2.1)', () => {
    it('CT-054-01: Possui catálogo oficial com todas as categorias obrigatórias', () => {
      const categorias = new Set(Object.values(PLACEHOLDER_CATALOG).map((p) => p.categoria));
      expect(categorias.has('CADASTRO')).toBe(true);
      expect(categorias.has('COMERCIAL')).toBe(true);
      expect(categorias.has('FINANCEIRO')).toBe(true);
      expect(categorias.has('DERIVADO')).toBe(true);
      expect(categorias.has('SISTEMA')).toBe(true);
      expect(categorias.has('MANUAL')).toBe(true);
    });

    it('CT-054-02: Cada item do catálogo possui metadados completos (nome, tipo, origem, resolver, obrigatorio, categoria)', () => {
      for (const [key, item] of Object.entries(PLACEHOLDER_CATALOG)) {
        expect(item.nome).toBe(key);
        expect(item.descricao).toBeTruthy();
        expect(item.tipo).toMatch(/^(texto|data|moeda|numero|endereco)$/);
        expect(item.origem).toBeTruthy();
        expect(item.resolver).toBeTruthy();
        expect(typeof item.obrigatorio).toBe('boolean');
        expect(item.categoria).toMatch(/^(CADASTRO|COMERCIAL|FINANCEIRO|DERIVADO|SISTEMA|MANUAL)$/);
      }
    });

    it('CT-054-03: Detecta corretamente tokens {{CAMPO}} no texto HTML', () => {
      const html = '<div>{{RAZAO_SOCIAL}} - {{CNPJ}} - {{LOCAL_ASSINATURA}} - {{DATA_ASSINATURA}}</div>';
      const detectados = detectarPlaceholders(html);
      expect(detectados).toEqual(['RAZAO_SOCIAL', 'CNPJ', 'LOCAL_ASSINATURA', 'DATA_ASSINATURA']);
    });
  });

  describe('2. Validação e Bloqueio de Placeholders Desconhecidos (FASE 2.5)', () => {
    it('CT-054-04: validarPlaceholdersTemplate aprova templates contendo apenas tokens catalogados', () => {
      const html = '<p>{{RAZAO_SOCIAL}} / {{CNPJ}} / {{DATA_INICIO}} / {{DATA_FIM}} / {{VALOR_MENSAL}}</p>';
      const res = validarPlaceholdersTemplate(html);
      expect(res.valido).toBe(true);
      expect(res.placeholdersDesconhecidos.length).toBe(0);
      expect(res.erros.length).toBe(0);
    });

    it('CT-054-05: validarPlaceholdersTemplate bloqueia tokens desconhecidos com mensagem legível exata', () => {
      const html = '<p>{{RAZAO_SOCIAL}} / {{CAMPO_INEXISTENTE}} / {{OUTRO_FALSO}}</p>';
      const res = validarPlaceholdersTemplate(html);
      expect(res.valido).toBe(false);
      expect(res.placeholdersDesconhecidos).toContain('CAMPO_INEXISTENTE');
      expect(res.placeholdersDesconhecidos).toContain('OUTRO_FALSO');
      expect(res.erros).toContain('Campo de contrato não reconhecido ou sem origem configurada: {{CAMPO_INEXISTENTE}}');
      expect(res.erros).toContain('Campo de contrato não reconhecido ou sem origem configurada: {{OUTRO_FALSO}}');
    });

    it('CT-054-06: preencherTemplate LANÇA ERRO e bloqueia geração quando há token desconhecido', () => {
      const html = '<p>{{RAZAO_SOCIAL}} {{CNPJ}} {{CAMPO_TESTE_INEXISTENTE}} {{DATA_INICIO}} {{DATA_FIM}}</p>';
      const dados = {
        RAZAO_SOCIAL: 'TESTE',
        CNPJ: '00.000.000/0001-00',
        DATA_INICIO: '01/01/2026',
        DATA_FIM: '01/01/2027',
      };

      expect(() => preencherTemplate(html, dados, 'ANUNCIANTE')).toThrowError(
        /Campo de contrato não reconhecido ou sem origem configurada: \{\{CAMPO_TESTE_INEXISTENTE\}\}/
      );
    });

    it('CT-054-07: ContratoModelosAdminService.criarModelo bloqueia templates com tokens desconhecidos', async () => {
      const adminService = new ContratoModelosAdminService();
      const res = await adminService.criarModelo({
        tipoContrato: 'ANUNCIANTE',
        codigoTemplate: 'TPL-INVALIDO',
        nome: 'Modelo Inválido',
        conteudoHtml: '<div>{{RAZAO_SOCIAL}} {{CAMPO_FALSO_TOKEN}}</div>',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Campo de contrato não reconhecido ou sem origem configurada: {{CAMPO_FALSO_TOKEN}}');
    });

    it('CT-054-08: ContratoModelosAdminService.criarNovaVersao bloqueia templates com tokens desconhecidos', async () => {
      const adminService = new ContratoModelosAdminService();
      const res = await adminService.criarNovaVersao(
        'tpl-qualquer',
        '<div>{{RAZAO_SOCIAL}} {{TOKEN_NAO_EXISTENTE}}</div>',
        'Nova Versão Inválida'
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('Campo de contrato não reconhecido ou sem origem configurada: {{TOKEN_NAO_EXISTENTE}}');
    });
  });

  describe('3. Campos Automáticos: Data por Extenso e Local Cidade / UF (FASE 2.4)', () => {
    it('CT-054-09: formatarDataExtensa formata em português por extenso no fuso de Brasília', () => {
      const data = new Date('2026-09-05T15:00:00-03:00');
      const resultado = formatarDataExtensa(data);
      expect(resultado).toBe('05 de setembro de 2026');
    });

    it('CT-054-10: montarDadosTemplate gera LOCAL_ASSINATURA no padrão "Cidade / UF"', () => {
      const mockDoc: DadosDocumentoContrato = {
        contrato: {
          id: 'ctr-1',
          tipo_contrato: 'ANUNCIANTE',
          data_inicio: '2026-09-05',
          data_fim: '2027-09-05',
          valor_mensal: 1500,
          forma_pagamento: 'PIX',
        },
        proposta: null,
        empresa: {
          razao_social: 'EMPRESA TESTE CONTRATO 05.4',
          cnpj: '12.345.678/0001-90',
          cidade: 'Caruaru',
          estado: 'PE',
        },
        contato: {
          nome: 'RESPONSÁVEL TESTE',
        },
        ponto: null,
        template: { id: 'tpl-1' },
        operadora: null,
        quantidadeTelas: 2,
      };

      const dados = montarDadosTemplate(mockDoc);
      expect(dados.LOCAL_ASSINATURA).toBe('Caruaru / PE');
      expect(dados.DATA_ASSINATURA).toMatch(/^\d{2} de [a-zç]+ de \d{4}$/);
      expect(dados.DATA_ASSINATURA).toContain('2026');
    });
  });

  describe('4. Templates Oficiais Canônicos Completos (FASE 2.6)', () => {
    it('CT-054-11: Templates Canônicos possuem todas as cláusulas e são 100% válidos', () => {
      const valAnunciante = validarPlaceholdersTemplate(CANONICAL_TEMPLATE_HTML_ANUNCIANTE);
      expect(valAnunciante.valido).toBe(true);
      expect(valAnunciante.placeholdersDesconhecidos.length).toBe(0);
      expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('CLÁUSULA 01 - NOSSO SERVIÇO');
      expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('GRADE DE HORÁRIOS, VEICULAÇÃO E PAGAMENTO');

      const valParceiro = validarPlaceholdersTemplate(CANONICAL_TEMPLATE_HTML_PARCEIRO);
      expect(valParceiro.valido).toBe(true);
      expect(valParceiro.placeholdersDesconhecidos.length).toBe(0);
      expect(CANONICAL_TEMPLATE_HTML_PARCEIRO).toContain('CLÁUSULA 01 – DO OBJETO');

      const valGestor = validarPlaceholdersTemplate(CANONICAL_TEMPLATE_HTML_GESTOR);
      expect(valGestor.valido).toBe(true);
      expect(valGestor.placeholdersDesconhecidos.length).toBe(0);
      expect(CANONICAL_TEMPLATE_HTML_GESTOR).toContain('1. OBJETO');
    });
  });

  describe('5. Editor Legível e Sanitização (FASE 2.7)', () => {
    it('CT-054-12: sanitizeHtmlForPreview remove scripts e handlers maliciosos mantendo formatação', () => {
      const rawHtml = `<div><h4>Título</h4><script>alert(1)</script><p onclick="steal()">Texto com <span style="color:red">estilo</span></p></div>`;
      const sanitized = sanitizeHtmlForPreview(rawHtml);
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('onclick=');
      expect(sanitized).toContain('<h4>Título</h4>');
      expect(sanitized).toContain('<span style="color:red">estilo</span>');
    });
  });

});
