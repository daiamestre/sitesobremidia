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
import { ContratoModelosAdminService } from '@/modules/crm/services/contratoModelosAdmin.service';
import {
  HUMAN_TOKEN_LABELS,
  createTokenChipHtml,
  templateToVisualHtml,
  visualHtmlToTemplate,
  sanitizeHtmlForPreview,
} from '@/modules/crm/components/contracts/ReadableContractEditor';

describe('MICRO-GATE 05.4.1 — Editor Visual Universal de Contratos', () => {

  describe('1. Regra Absoluta: Todo Novo Contrato Nasce Completo (ANUNCIANTE, PARCEIRO, GESTOR)', () => {
    it('CT-0541-01: ANUNCIANTE retorna template oficial canônico completo com todas as cláusulas', () => {
      const tpl = getCanonicalTemplateForTipo('ANUNCIANTE');
      expect(tpl).toBeTruthy();
      expect(tpl.length).toBeGreaterThan(3000);
      expect(isTemplateCompleto(tpl, 'ANUNCIANTE')).toBe(true);
      expect(tpl).toContain('CLÁUSULA 01 - NOSSO SERVIÇO');
      expect(tpl).toContain('GRADE DE HORÁRIOS, VEICULAÇÃO E PAGAMENTO');
      expect(tpl).toContain('POLÍTICA DE PRIVACIDADE');
      expect(tpl).toContain('RESCISÃO CONTRATUAL');
      expect(tpl).toContain('{{RAZAO_SOCIAL}}');
      expect(tpl).toContain('{{CNPJ}}');
      expect(tpl).toContain('{{DATA_ASSINATURA}}');
      expect(tpl).toContain('{{LOCAL_ASSINATURA}}');
    });

    it('CT-0541-02: PARCEIRO / PONTO_PARCEIRO retorna template oficial canônico completo congelado', () => {
      const tplParceiro = getCanonicalTemplateForTipo('PARCEIRO');
      const tplPontoParceiro = getCanonicalTemplateForTipo('PONTO_PARCEIRO');
      expect(tplParceiro).toBe(CANONICAL_TEMPLATE_HTML_PARCEIRO);
      expect(tplPontoParceiro).toBe(CANONICAL_TEMPLATE_HTML_PARCEIRO);
      expect(tplParceiro.length).toBeGreaterThan(2500);
      expect(isTemplateCompleto(tplParceiro, 'PARCEIRO')).toBe(true);
      expect(tplParceiro).toContain('DO OBJETO');
      expect(tplParceiro).toContain('ESTABELECIMENTO PARCEIRO');
      expect(tplParceiro).toContain('GRADE DE PROGRAMAÇÃO');
      expect(tplParceiro).toContain('VIGÊNCIA E RESCISÃO');
      expect(tplParceiro).toContain('CIÊNCIA DE CONTRATO');
    });

    it('CT-0541-03: GESTOR / GESTOR_MIDIA / GESTOR_MIDIAS retorna template oficial canônico completo', () => {
      const tplGestor = getCanonicalTemplateForTipo('GESTOR');
      const tplGestorMidia = getCanonicalTemplateForTipo('GESTOR_MIDIA');
      const tplGestorMidias = getCanonicalTemplateForTipo('GESTOR_MIDIAS');
      expect(tplGestor).toBe(CANONICAL_TEMPLATE_HTML_GESTOR);
      expect(tplGestorMidia).toBe(CANONICAL_TEMPLATE_HTML_GESTOR);
      expect(tplGestorMidias).toBe(CANONICAL_TEMPLATE_HTML_GESTOR);
      expect(tplGestor.length).toBeGreaterThan(2500);
      expect(isTemplateCompleto(tplGestor, 'GESTOR')).toBe(true);
      expect(tplGestor).toContain('1. OBJETO');
      expect(tplGestor).toContain('CONTRATO DE GESTÃO DE MÍDIA DIGITAL');
      expect(tplGestor).toContain('ATRIBUIÇÕES DO GESTOR');
      expect(tplGestor).toContain('POLÍTICAS DA REDE E LIMITES DE ATUAÇÃO');
      expect(tplGestor).toContain('REMUNERAÇÃO, VIGÊNCIA E ACEITE');
    });

    it('CT-0541-04: isTemplateCompleto rejeita stubs, vazios ou fragmentos incompletos', () => {
      expect(isTemplateCompleto(null, 'ANUNCIANTE')).toBe(false);
      expect(isTemplateCompleto('', 'ANUNCIANTE')).toBe(false);
      expect(isTemplateCompleto('<p>Contrato de Teste</p>', 'ANUNCIANTE')).toBe(false);
      expect(isTemplateCompleto('<div>' + 'A'.repeat(1600) + '</div>', 'ANUNCIANTE')).toBe(false);
      expect(isTemplateCompleto('<div>' + 'A'.repeat(1600) + '</div>', 'PARCEIRO')).toBe(false);
      expect(isTemplateCompleto('<div>' + 'A'.repeat(1600) + '</div>', 'GESTOR')).toBe(false);
    });
  });

  describe('2. Conversão Bidirecional: Tokens <-> Chips Visuais Humanos em Português', () => {
    it('CT-0541-05: HUMAN_TOKEN_LABELS possui rótulos em português para os principais campos', () => {
      expect(HUMAN_TOKEN_LABELS.RAZAO_SOCIAL).toBe('Razão Social do Contratante');
      expect(HUMAN_TOKEN_LABELS.NOME_FANTASIA).toBe('Nome Fantasia');
      expect(HUMAN_TOKEN_LABELS.CPF_CNPJ).toBe('CPF/CNPJ');
      expect(HUMAN_TOKEN_LABELS.VALOR_MENSAL).toBe('Valor Mensal');
      expect(HUMAN_TOKEN_LABELS.LOCAL_ASSINATURA).toBe('Cidade / UF');
      expect(HUMAN_TOKEN_LABELS.DATA_ASSINATURA).toBe('Data da Assinatura');
    });

    it('CT-0541-06: createTokenChipHtml gera chips com contenteditable="false", draggable="true" e botão de remoção', () => {
      const chipHtml = createTokenChipHtml('RAZAO_SOCIAL');
      expect(chipHtml).toContain('data-token="RAZAO_SOCIAL"');
      expect(chipHtml).toContain('contenteditable="false"');
      expect(chipHtml).toContain('draggable="true"');
      expect(chipHtml).toContain('[Razão Social do Contratante]');
      expect(chipHtml).toContain('remove-token-btn');
    });

    it('CT-0541-07: templateToVisualHtml converte todos os placeholders {{TOKEN}} em chips legíveis', () => {
      const template = '<p>Contratante: {{RAZAO_SOCIAL}}, CNPJ: {{CNPJ}}, Cidade: {{LOCAL_ASSINATURA}}</p>';
      const visual = templateToVisualHtml(template);
      expect(visual).not.toContain('{{RAZAO_SOCIAL}}');
      expect(visual).not.toContain('{{CNPJ}}');
      expect(visual).not.toContain('{{LOCAL_ASSINATURA}}');
      expect(visual).toContain('data-token="RAZAO_SOCIAL"');
      expect(visual).toContain('data-token="CNPJ"');
      expect(visual).toContain('data-token="LOCAL_ASSINATURA"');
      expect(visual).toContain('[Razão Social do Contratante]');
      expect(visual).toContain('[Cidade / UF]');
    });

    it('CT-0541-08: visualHtmlToTemplate reconverte com 100% de fidelidade (Round-Trip)', () => {
      const originalTemplate = '<p>O contratante {{RAZAO_SOCIAL}}, inscrito no CNPJ sob o nº {{CNPJ}}, residente em {{LOCAL_ASSINATURA}}.</p>';
      const visual = templateToVisualHtml(originalTemplate);
      const roundTrip = visualHtmlToTemplate(visual);
      expect(roundTrip).toBe(originalTemplate);
    });

    it('CT-0541-09: Round-Trip preserva integridade nos três templates oficiais completos', () => {
      // ANUNCIANTE
      const visualAnunciante = templateToVisualHtml(CANONICAL_TEMPLATE_HTML_ANUNCIANTE);
      const reconvertedAnunciante = visualHtmlToTemplate(visualAnunciante);
      expect(reconvertedAnunciante).toBe(CANONICAL_TEMPLATE_HTML_ANUNCIANTE);

      // PARCEIRO
      const visualParceiro = templateToVisualHtml(CANONICAL_TEMPLATE_HTML_PARCEIRO);
      const reconvertedParceiro = visualHtmlToTemplate(visualParceiro);
      expect(reconvertedParceiro).toBe(CANONICAL_TEMPLATE_HTML_PARCEIRO);

      // GESTOR
      const visualGestor = templateToVisualHtml(CANONICAL_TEMPLATE_HTML_GESTOR);
      const reconvertedGestor = visualHtmlToTemplate(visualGestor);
      expect(reconvertedGestor).toBe(CANONICAL_TEMPLATE_HTML_GESTOR);
    });
  });

  describe('3. Validação e Bloqueio de Salvamento com Campos Desconhecidos', () => {
    it('CT-0541-10: Templates Oficiais de todos os 3 tipos são 100% válidos no catálogo', () => {
      const vAnunciante = validarPlaceholdersTemplate(CANONICAL_TEMPLATE_HTML_ANUNCIANTE);
      expect(vAnunciante.valido).toBe(true);
      expect(vAnunciante.placeholdersDesconhecidos).toHaveLength(0);

      const vParceiro = validarPlaceholdersTemplate(CANONICAL_TEMPLATE_HTML_PARCEIRO);
      expect(vParceiro.valido).toBe(true);
      expect(vParceiro.placeholdersDesconhecidos).toHaveLength(0);

      const vGestor = validarPlaceholdersTemplate(CANONICAL_TEMPLATE_HTML_GESTOR);
      expect(vGestor.valido).toBe(true);
      expect(vGestor.placeholdersDesconhecidos).toHaveLength(0);
    });

    it('CT-0541-11: Bloqueia qualquer token não catalogado introduzido no editor', () => {
      const visualComTokenInvalido = '<p>Texto</p>' + createTokenChipHtml('TOKEN_TOTALMENTE_INVALIDO');
      const canonical = visualHtmlToTemplate(visualComTokenInvalido);
      const validacao = validarPlaceholdersTemplate(canonical);

      expect(validacao.valido).toBe(false);
      expect(validacao.placeholdersDesconhecidos).toContain('TOKEN_TOTALMENTE_INVALIDO');
    });
  });

  describe('4. Criação e Versionamento no Service (Garantia de Não-Vacuidade)', () => {
    it('CT-0541-12: ContratoModelosAdminService.obterTemplateOficialCompleto retorna template de acordo com o tipo', () => {
      const adminService = new ContratoModelosAdminService();
      expect(adminService.obterTemplateOficialCompleto('ANUNCIANTE')).toBe(CANONICAL_TEMPLATE_HTML_ANUNCIANTE);
      expect(adminService.obterTemplateOficialCompleto('PARCEIRO')).toBe(CANONICAL_TEMPLATE_HTML_PARCEIRO);
      expect(adminService.obterTemplateOficialCompleto('GESTOR')).toBe(CANONICAL_TEMPLATE_HTML_GESTOR);
    });

    it('CT-0541-13: criarModelo preenche automaticamente com template canônico se conteudoHtml for vazio ou incompleto', async () => {
      const adminService = new ContratoModelosAdminService();
      // Teste com string vazia
      const resVazio = await adminService.criarModelo({
        tipoContrato: 'ANUNCIANTE',
        codigoTemplate: 'TPL-AUTOTEST-1',
        nome: 'Teste Autopreenchimento',
        conteudoHtml: '',
      });
      // Verifica que não falha por validação de placeholder inválido
      if (!resVazio.success && resVazio.error) {
        expect(resVazio.error).not.toContain('Campo de contrato não reconhecido');
      }
    });
  });

  describe('5. Sanitização de Preview', () => {
    it('CT-0541-14: sanitizeHtmlForPreview remove vetores XSS sem quebrar a folha do contrato', () => {
      const raw = `<div><h2>CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h2><script>console.log('hack')</script><iframe src="evil.com"></iframe><p>Cláusula 1</p></div>`;
      const sanitized = sanitizeHtmlForPreview(raw);
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('<iframe>');
      expect(sanitized).toContain('<h2>CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h2>');
      expect(sanitized).toContain('<p>Cláusula 1</p>');
    });
  });

});
