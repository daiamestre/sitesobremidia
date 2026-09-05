import { describe, it, expect } from 'vitest';
import {
  PLACEHOLDER_CATALOG,
  validarPlaceholdersTemplate,
  getCanonicalTemplateForTipo,
  isTemplateCompleto,
  preencherTemplate,
  montarDadosTemplate,
  CANONICAL_TEMPLATE_HTML_ANUNCIANTE,
  CANONICAL_TEMPLATE_HTML_PARCEIRO,
  CANONICAL_TEMPLATE_HTML_GESTOR,
} from '@/modules/crm/services/contratoDocumento.service';
import {
  HUMAN_TOKEN_LABELS,
  createTokenChipHtml,
  templateToVisualHtml,
  visualHtmlToTemplate,
  sanitizeHtmlForPreview,
  CATEGORIAS,
} from '@/modules/crm/components/contracts/ReadableContractEditor';

describe('MICRO-GATE 05.4.2 — Editor de Contratos Fullscreen e Layout de 2 Colunas', () => {

  describe('1. Catálogo Completo e Categorização Auxiliar (55 Campos)', () => {
    it('CT-0542-01: Possui 55 campos no catálogo de placeholders com mapeamentos em português', () => {
      const keys = Object.keys(PLACEHOLDER_CATALOG);
      expect(keys.length).toBe(55);
      for (const k of keys) {
        expect(HUMAN_TOKEN_LABELS[k]).toBeTruthy();
        expect(typeof HUMAN_TOKEN_LABELS[k]).toBe('string');
      }
    });

    it('CT-0542-02: Possui todas as categorias auxiliares configuradas para a barra lateral', () => {
      expect(CATEGORIAS).toHaveLength(5);
      const catKeys = CATEGORIAS.map(c => c.key);
      expect(catKeys).toContain('CADASTRO');
      expect(catKeys).toContain('COMERCIAL');
      expect(catKeys).toContain('FINANCEIRO');
      expect(catKeys).toContain('DERIVADO');
      expect(catKeys).toContain('SISTEMA');
    });
  });

  describe('2. Conversão e Suporte a Drag-and-Drop / Inserção', () => {
    it('CT-0542-03: createTokenChipHtml gera chips com suporte a drag-and-drop nativo', () => {
      const chip = createTokenChipHtml('RAZAO_SOCIAL');
      expect(chip).toContain('draggable="true"');
      expect(chip).toContain('data-token="RAZAO_SOCIAL"');
      expect(chip).toContain('contract-token-chip');
      expect(chip).toContain('[Razão Social do Contratante]');
      expect(chip).toContain('remove-token-btn');
    });

    it('CT-0542-04: templateToVisualHtml converte placeholders em chips legíveis sem expor {{...}}', () => {
      const template = '<h2>CONTRATO</h2><p>Contratante: {{RAZAO_SOCIAL}} ({{CNPJ}})</p>';
      const visual = templateToVisualHtml(template);
      expect(visual).not.toContain('{{RAZAO_SOCIAL}}');
      expect(visual).not.toContain('{{CNPJ}}');
      expect(visual).toContain('[Razão Social do Contratante]');
      expect(visual).toContain('[CPF/CNPJ]');
      expect(visual).toContain('data-token="RAZAO_SOCIAL"');
      expect(visual).toContain('data-token="CNPJ"');
    });

    it('CT-0542-05: visualHtmlToTemplate reconverte chips para placeholders canônicos {{...}}', () => {
      const visual = '<p>Empresa: <span class="contract-token-chip" contenteditable="false" draggable="true" data-token="RAZAO_SOCIAL">[Razão Social do Contratante]</span> no valor de <span class="contract-token-chip" contenteditable="false" draggable="true" data-token="VALOR_MENSAL">[Valor Mensal]</span>.</p>';
      const canonical = visualHtmlToTemplate(visual);
      expect(canonical).toContain('{{RAZAO_SOCIAL}}');
      expect(canonical).toContain('{{VALOR_MENSAL}}');
      expect(canonical).not.toContain('data-token');
    });

    it('CT-0542-06: Inserção de chips no topo, meio e rodapé preserva integridade de tags', () => {
      const visualComChips = `
        <div class="header"><span class="contract-token-chip" data-token="RAZAO_SOCIAL">[Razão Social do Contratante]</span></div>
        <div class="corpo"><p>Cláusula com <span class="contract-token-chip" data-token="VALOR_MENSAL">[Valor Mensal]</span></p></div>
        <div class="rodape"><p>Local: <span class="contract-token-chip" data-token="LOCAL_ASSINATURA">[Cidade / UF]</span> Data: <span class="contract-token-chip" data-token="DATA_ASSINATURA">[Data da Assinatura]</span></p></div>
      `;
      const canonical = visualHtmlToTemplate(visualComChips);
      expect(canonical).toContain('{{RAZAO_SOCIAL}}');
      expect(canonical).toContain('{{VALOR_MENSAL}}');
      expect(canonical).toContain('{{LOCAL_ASSINATURA}}');
      expect(canonical).toContain('{{DATA_ASSINATURA}}');
    });
  });

  describe('3. Template Oficial Canônico — Nascimento e Validação', () => {
    it('CT-0542-07: Template oficial de ANUNCIANTE possui todas as 9 cláusulas e estrutura completa', () => {
      const tpl = getCanonicalTemplateForTipo('ANUNCIANTE');
      expect(tpl).toContain('SOBRE MÍDIA DESIGNER');
      expect(tpl).toContain('CLÁUSULA 01 - NOSSO SERVIÇO');
      expect(tpl).toContain('CLÁUSULA 02 - SISTEMA INTELIGENTE');
      expect(tpl).toContain('CLÁUSULA 03 - NOSSO CONTEÚDO');
      expect(tpl).toContain('CLÁUSULA 04 - PLANO EXCLUSIVO');
      expect(tpl).toContain('CLÁUSULA 05 - PLANO SISTEMA');
      expect(tpl).toContain('CLÁUSULA 06 - RESPONSABILIDADE DO CONTRATANTE');
      expect(tpl).toContain('CLÁUSULA 07 - CONDIÇÕES DE PAGAMENTOS');
      expect(tpl).toContain('CLÁUSULA 08 - RENOVAÇÃO DE CONTRATO');
      expect(tpl).toContain('CLÁUSULA 09 - RESCISÃO CONTRATUAL');
      expect(tpl).toContain('POLÍTICA DE PRIVACIDADE');
      expect(tpl).toContain('GRADE DE HORÁRIOS, VEICULAÇÃO E PAGAMENTO');
      expect(tpl).toContain('Autorizo a veiculação');
      expect(isTemplateCompleto(tpl, 'ANUNCIANTE')).toBe(true);

      const val = validarPlaceholdersTemplate(tpl);
      expect(val.valido).toBe(true);
      expect(val.placeholdersDesconhecidos).toHaveLength(0);
    });

    it('CT-0542-08: Templates oficiais de PARCEIRO e GESTOR são válidos e completos', () => {
      const tplParceiro = getCanonicalTemplateForTipo('PARCEIRO');
      const tplGestor = getCanonicalTemplateForTipo('GESTOR');
      expect(isTemplateCompleto(tplParceiro, 'PARCEIRO')).toBe(true);
      expect(isTemplateCompleto(tplGestor, 'GESTOR')).toBe(true);
      expect(validarPlaceholdersTemplate(tplParceiro).valido).toBe(true);
      expect(validarPlaceholdersTemplate(tplGestor).valido).toBe(true);
    });
  });

  describe('4. Renderização e Sanitização para Prévia Real', () => {
    it('CT-0542-09: sanitizeHtmlForPreview remove scripts e iframes mantendo layout', () => {
      const dirty = '<p>Contrato</p><script>alert("xss")</script><iframe src="malicious"></iframe>';
      const clean = sanitizeHtmlForPreview(dirty);
      expect(clean).toContain('<p>Contrato</p>');
      expect(clean).not.toContain('<script');
      expect(clean).not.toContain('<iframe');
    });

    it('CT-0542-10: preencherTemplate preenche todos os tokens com dados reais de teste', () => {
      const tpl = '<p>Contratante {{RAZAO_SOCIAL}} ({{CNPJ}}) em {{LOCAL_ASSINATURA}}.</p>';
      const preenchido = preencherTemplate(tpl, {
        RAZAO_SOCIAL: 'PADARIA CENTRAL LTDA',
        CNPJ: '12.345.678/0001-90',
        LOCAL_ASSINATURA: 'Caruaru / PE',
      });
      expect(preenchido).toBe('<p>Contratante PADARIA CENTRAL LTDA (12.345.678/0001-90) em Caruaru / PE.</p>');
      expect(preenchido).not.toContain('{{');
    });
  });
});
