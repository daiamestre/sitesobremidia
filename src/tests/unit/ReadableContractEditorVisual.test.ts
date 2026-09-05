import { describe, it, expect } from 'vitest';
import {
  templateToVisualHtml,
  visualHtmlToTemplate,
  HUMAN_TOKEN_LABELS,
} from '@/modules/crm/components/contracts/ReadableContractEditor';
import {
  PLACEHOLDER_CATALOG,
  validarPlaceholdersTemplate,
  preencherTemplate,
  CANONICAL_TEMPLATE_HTML_ANUNCIANTE,
} from '@/modules/crm/services/contratoDocumento.service';

describe('EDITOR DE CONTRATOS VISUAL — MICRO-GATE 05.4 CORREÇÃO', () => {

  describe('1. Mapeamento e Representação Humana dos Campos (Português)', () => {
    it('CT-VIS-01: Todos os tokens do catálogo possuem mapeamento humano em português', () => {
      for (const token of Object.keys(PLACEHOLDER_CATALOG)) {
        const label = HUMAN_TOKEN_LABELS[token];
        expect(label).toBeTruthy();
        expect(typeof label).toBe('string');
        // Não deve ser o token bruto em formato de código
        expect(label).not.toBe(`{{${token}}}`);
      }
    });

    it('CT-VIS-02: Principais tokens são exibidos com frases legíveis humanas', () => {
      expect(HUMAN_TOKEN_LABELS.RAZAO_SOCIAL).toBe('Razão Social do Contratante');
      expect(HUMAN_TOKEN_LABELS.RESPONSAVEL).toBe('Responsável Legal');
      expect(HUMAN_TOKEN_LABELS.CNPJ).toBe('CPF/CNPJ');
      expect(HUMAN_TOKEN_LABELS.ENDERECO_UNIDADE).toBe('Endereço do Contratante');
      expect(HUMAN_TOKEN_LABELS.LOCAL_ASSINATURA).toBe('Cidade / UF');
      expect(HUMAN_TOKEN_LABELS.DATA_ASSINATURA).toBe('Data da Assinatura');
      expect(HUMAN_TOKEN_LABELS.VALOR_MENSAL).toBe('Valor Mensal');
    });
  });

  describe('2. Conversão Template Canônico -> Visual Documento (templateToVisualHtml)', () => {
    it('CT-VIS-03: Substitui {{RAZAO_SOCIAL}} pelo chip visual humano e não expõe {{...}}', () => {
      const template = '<p>Nome/Razão Social: {{RAZAO_SOCIAL}}</p>';
      const visual = templateToVisualHtml(template);

      expect(visual).not.toContain('{{RAZAO_SOCIAL}}');
      expect(visual).toContain('data-token="RAZAO_SOCIAL"');
      expect(visual).toContain('[Razão Social do Contratante]');
      expect(visual).toContain('contenteditable="false"');
    });

    it('CT-VIS-04: Substitui múltiplos tokens preservando toda a estrutura do documento', () => {
      const template = `
        <h2>CONTRATO DE SERVIÇO</h2>
        <p>Contratante: {{RAZAO_SOCIAL}} ({{CNPJ}})</p>
        <p>Local: {{LOCAL_ASSINATURA}}, Data: {{DATA_ASSINATURA}}</p>
      `;
      const visual = templateToVisualHtml(template);

      expect(visual).toContain('<h2>CONTRATO DE SERVIÇO</h2>');
      expect(visual).toContain('[Razão Social do Contratante]');
      expect(visual).toContain('[CPF/CNPJ]');
      expect(visual).toContain('[Cidade / UF]');
      expect(visual).toContain('[Data da Assinatura]');
      expect(visual).not.toContain('{{');
    });

    it('CT-VIS-05: Tokens desconhecidos recebem chip de alerta', () => {
      const template = '<p>{{CAMPO_INEXISTENTE}}</p>';
      const visual = templateToVisualHtml(template);

      expect(visual).toContain('data-token="CAMPO_INEXISTENTE"');
      expect(visual).toContain('Não Reconhecido');
    });
  });

  describe('3. Conversão Visual Documento -> Template Canônico (visualHtmlToTemplate)', () => {
    it('CT-VIS-06: Converte o chip humano de volta para {{RAZAO_SOCIAL}}', () => {
      const visual = '<p>Nome/Razão Social: <span class="contract-token-chip" contenteditable="false" data-token="RAZAO_SOCIAL">[Razão Social do Contratante]</span></p>';
      const canonical = visualHtmlToTemplate(visual);

      expect(canonical).toBe('<p>Nome/Razão Social: {{RAZAO_SOCIAL}}</p>');
    });

    it('CT-VIS-07: Preserva edições manuais feitas pelo usuário no texto das cláusulas', () => {
      const visualModificado = `
        <h2>CONTRATO DE SERVIÇO ALTERADO</h2>
        <p>CLÁUSULA 01 - NOSSO SERVIÇO EXCLUSIVO E PERSONALIZADO</p>
        <p>Contratante: <span contenteditable="false" data-token="RAZAO_SOCIAL">[Razão Social do Contratante]</span></p>
      `;
      const canonical = visualHtmlToTemplate(visualModificado);

      expect(canonical).toContain('<h2>CONTRATO DE SERVIÇO ALTERADO</h2>');
      expect(canonical).toContain('CLÁUSULA 01 - NOSSO SERVIÇO EXCLUSIVO E PERSONALIZADO');
      expect(canonical).toContain('{{RAZAO_SOCIAL}}');
      expect(canonical).not.toContain('data-token');
    });

    it('CT-VIS-08: Ciclo completo (Template -> Visual -> Template) é idempotente e preserva tokens', () => {
      const original = '<p>Local: {{LOCAL_ASSINATURA}} na data {{DATA_ASSINATURA}} pelo valor de {{VALOR_MENSAL}}.</p>';
      const visual = templateToVisualHtml(original);
      const reconstructed = visualHtmlToTemplate(visual);

      expect(reconstructed).toBe(original);
      const validacao = validarPlaceholdersTemplate(reconstructed);
      expect(validacao.valido).toBe(true);
    });
  });

  describe('4. Identidade Documental (Editor == Prévia == Documento)', () => {
    it('CT-VIS-09: O template canônico oficial completo gera visual idêntico à prévia', () => {
      const visualHtml = templateToVisualHtml(CANONICAL_TEMPLATE_HTML_ANUNCIANTE);

      // Não contém nenhum token bruto
      expect(visualHtml).not.toMatch(/\{\{[A-Z_]+\}\}/);

      // Contém os chips humanos
      expect(visualHtml).toContain('[Razão Social do Contratante]');
      expect(visualHtml).toContain('[CPF/CNPJ]');
      expect(visualHtml).toContain('[Cidade / UF]');
      expect(visualHtml).toContain('[Data da Assinatura]');

      // Contém as cláusulas integrais em português
      expect(visualHtml).toContain('CLÁUSULA 01 - NOSSO SERVIÇO');
      expect(visualHtml).toContain('CLÁUSULA 02 - SISTEMA INTELIGENTE');
      expect(visualHtml).toContain('CLÁUSULA 09 - RESCISÃO CONTRATUAL');

      // Ao resolver com dados na prévia, substitui todos os campos
      const dadosExemplo = {
        RAZAO_SOCIAL: 'EMPRESA TESTE LTDA',
        CNPJ: '11.222.333/0001-44',
        LOCAL_ASSINATURA: 'Caruaru / PE',
        DATA_ASSINATURA: '05 de setembro de 2026',
        DATA_INICIO: '05/09/2026',
        DATA_FIM: '05/09/2027',
        VALOR_MENSAL: 'R$ 1.500,00',
        FORMA_PAGAMENTO: 'Boleto',
      };
      const canonicalReconstruido = visualHtmlToTemplate(visualHtml);
      const previa = preencherTemplate(canonicalReconstruido, dadosExemplo, 'ANUNCIANTE');

      expect(previa).toContain('EMPRESA TESTE LTDA');
      expect(previa).toContain('11.222.333/0001-44');
      expect(previa).toContain('Caruaru / PE');
      expect(previa).toContain('05 de setembro de 2026');
      expect(previa).not.toContain('[Razão Social do Contratante]');
      expect(previa).not.toContain('{{RAZAO_SOCIAL}}');
    });
  });
});
