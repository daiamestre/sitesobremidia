import { describe, it, expect } from 'vitest';
import {
  CANONICAL_TEMPLATE_HTML_ANUNCIANTE,
  CANONICAL_TEMPLATE_HTML_PARCEIRO,
  CANONICAL_TEMPLATE_HTML_GESTOR,
  preencherTemplate,
  gerarPdfDoHtml,
  sha256Hex,
} from '@/modules/crm/services/contratoDocumento.service';
import { sanitizeHtmlForPreview } from '@/modules/crm/pages/admin/ContratosAdminPage';

describe('MICRO-GATE CONTRATOS-GESTAO-05.3 — Templates Oficiais e Gestão de Contratos', () => {
  describe('1. Integridade das Cláusulas Oficiais dos Templates', () => {
    it('CANONICAL_TEMPLATE_HTML_ANUNCIANTE contém todas as 9 cláusulas oficiais e seções', () => {
      expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('CONTRATO DE SERVIÇO E VEICULAÇÃO DE PUBLICIDADE');
      expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('CLÁUSULA 01 - NOSSO SERVIÇO');
      expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('CLÁUSULA 02 - SISTEMA INTELIGENTE');
      expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('CLÁUSULA 03 - NOSSO CONTEÚDO');
      expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('CLÁUSULA 04 - PLANO EXCLUSIVO');
      expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('CLÁUSULA 05 - PLANO SISTEMA');
      expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('CLÁUSULA 06 - RESPONSABILIDADE DO CONTRATANTE');
      expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('CLÁUSULA 07 - CONDIÇÕES DE PAGAMENTOS');
      expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('CLÁUSULA 08 - RENOVAÇÃO DE CONTRATO');
      expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('CLÁUSULA 09 - RESCISÃO CONTRATUAL');
      expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('POLÍTICA DE PRIVACIDADE');
      expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE).toContain('GRADE DE HORÁRIOS, VEICULAÇÃO E PAGAMENTO');
      expect(CANONICAL_TEMPLATE_HTML_ANUNCIANTE.length).toBeGreaterThan(5000);
    });

    it('CANONICAL_TEMPLATE_HTML_PARCEIRO permanece 100% frozen conforme homologado no Gate 03.2', () => {
      expect(CANONICAL_TEMPLATE_HTML_PARCEIRO).toContain('CONTRATO DE PARCERIA ENTRE SOBRE MÍDIA &amp; ESTABELECIMENTO PARCEIRO');
      expect(CANONICAL_TEMPLATE_HTML_PARCEIRO).toContain('CLÁUSULA 01 – DO OBJETO');
      expect(CANONICAL_TEMPLATE_HTML_PARCEIRO).toContain('CLÁUSULA 02 - SERVIÇOS REALIZADOS PELA SOBRE MÍDIA:');
      expect(CANONICAL_TEMPLATE_HTML_PARCEIRO).toContain('CLÁUSULA 03 - OBRIGAÇÕES DO ESTABELECIMENTO PARCEIRO');
      expect(CANONICAL_TEMPLATE_HTML_PARCEIRO).toContain('CLÁUSULA 04 - OBRIGAÇÕES DO GESTOR DE MÍDIA');
      expect(CANONICAL_TEMPLATE_HTML_PARCEIRO).toContain('CLÁUSULA 05 – GRADE DE PROGRAMAÇÃO');
      expect(CANONICAL_TEMPLATE_HTML_PARCEIRO).toContain('CLÁUSULA 06 - VIGÊNCIA E RESCISÃO');
      expect(CANONICAL_TEMPLATE_HTML_PARCEIRO).toContain('CLÁUSULA 07 – CIÊNCIA DE CONTRATO');
      expect(CANONICAL_TEMPLATE_HTML_PARCEIRO.length).toBeGreaterThan(10000);
    });

    it('CANONICAL_TEMPLATE_HTML_GESTOR contém as 5 cláusulas oficiais e preâmbulo', () => {
      expect(CANONICAL_TEMPLATE_HTML_GESTOR).toContain('CONTRATO DE GESTÃO DE MÍDIA DIGITAL');
      expect(CANONICAL_TEMPLATE_HTML_GESTOR).toContain('1. OBJETO');
      expect(CANONICAL_TEMPLATE_HTML_GESTOR).toContain('2. COMO FUNCIONA A REDE SOBRE MÍDIA');
      expect(CANONICAL_TEMPLATE_HTML_GESTOR).toContain('3. ATRIBUIÇÕES DO GESTOR');
      expect(CANONICAL_TEMPLATE_HTML_GESTOR).toContain('4. POLÍTICAS DA REDE E LIMITES DE ATUAÇÃO');
      expect(CANONICAL_TEMPLATE_HTML_GESTOR).toContain('5. REMUNERAÇÃO, VIGÊNCIA E ACEITE');
      expect(CANONICAL_TEMPLATE_HTML_GESTOR).toContain('ASSINATURAS E ANEXOS');
      expect(CANONICAL_TEMPLATE_HTML_GESTOR.length).toBeGreaterThan(3000);
    });
  });

  describe('2. Resolução Dinâmica de Placeholders (preencherTemplate)', () => {
    it('Preenche contrato ANUNCIANTE sem deixar nenhum placeholder residual', () => {
      const dadosAnunciante = {
        RAZAO_SOCIAL: 'PADARIA CENTRAL LTDA',
        RESPONSAVEL: 'João da Silva',
        CNPJ: '12.345.678/0001-90',
        ENDERECO_UNIDADE: 'Rua das Flores, 123',
        BAIRRO: 'Centro',
        CIDADE: 'Caruaru',
        UF: 'PE',
        CEP: '55000-000',
        EMAIL: 'contato@padariacentral.com',
        INSTAGRAM: '@padariacentral',
        WEBSITE: 'www.padariacentral.com',
        DATA_INICIO: '01/01/2026',
        DATA_FIM: '31/12/2026',
        PERIODO_VEICULACAO: '12 Meses',
        DIAS_SEMANA: 'Segunda a Sábado',
        HORARIO_INICIO: '07:00',
        HORARIO_FIM: '20:00',
        PACOTE_VEICULACAO: 'Plano Sistema',
        QUANTIDADE_TELAS: '2',
        VALOR_MENSAL: '250,00',
        FORMA_PAGAMENTO: 'Boleto Bancário',
        LOCAL_ASSINATURA: 'Caruaru/PE',
        DATA_ASSINATURA: '01/01/2026',
      };

      const html = preencherTemplate(CANONICAL_TEMPLATE_HTML_ANUNCIANTE, dadosAnunciante, 'ANUNCIANTE');
      expect(html).toContain('PADARIA CENTRAL LTDA');
      expect(html).toContain('12.345.678/0001-90');
      expect(html).not.toMatch(/\{\{[A-Z_0-9]+\}\}/);
    });

    it('Preenche contrato PARCEIRO sem deixar nenhum placeholder residual', () => {
      const dadosParceiro = {
        RAZAO_SOCIAL: 'MERCADO BOM PRECO LTDA',
        RESPONSAVEL: 'Maria Santos',
        CNPJ: '98.765.432/0001-11',
        ENDERECO_UNIDADE: 'Av. Principal, 500',
        BAIRRO: 'Boa Vista',
        CIDADE: 'Caruaru',
        UF: 'PE',
        TELEFONE: '(81) 98888-7777',
        WHATSAPP: '(81) 98888-7777',
        EMAIL: 'bompreco@mercado.com',
        INSTAGRAM: '@mercadobompreco',
        DIAS_SEMANA: 'Segunda a Domingo',
        HORARIO_INICIO: '06:00',
        HORARIO_FIM: '22:00',
        DATA_INICIO: '01/02/2026',
        DATA_FIM: '01/08/2026',
        QUANTIDADE_TELAS: '1',
        FORO_COMARCA: 'Caruaru',
        LOCAL_ASSINATURA: 'Caruaru/PE',
        DATA_ASSINATURA: '01/02/2026',
      };

      const html = preencherTemplate(CANONICAL_TEMPLATE_HTML_PARCEIRO, dadosParceiro, 'PARCEIRO');
      expect(html).toContain('MERCADO BOM PRECO LTDA');
      expect(html).toContain('98.765.432/0001-11');
      expect(html).not.toMatch(/\{\{[A-Z_0-9]+\}\}/);
    });

    it('Preenche contrato GESTOR sem deixar nenhum placeholder residual', () => {
      const dadosGestor = {
        NOME_GESTOR: 'Carlos Eduardo Oliveira',
        CPF_CNPJ: '111.222.333-44',
        ENDERECO_UNIDADE: 'Rua do Comércio, 45',
        CIDADE: 'Caruaru',
        UF: 'PE',
        TELEFONE: '(81) 99999-1111',
        EMAIL: 'carlos.gestor@gmail.com',
        DATA_INICIO: '01/03/2026',
        DATA_FIM: '01/03/2027',
        LOCAL_ASSINATURA: 'Caruaru/PE',
        DATA_ASSINATURA: '01/03/2026',
      };

      const html = preencherTemplate(CANONICAL_TEMPLATE_HTML_GESTOR, dadosGestor, 'GESTOR');
      expect(html).toContain('Carlos Eduardo Oliveira');
      expect(html).toContain('111.222.333-44');
      expect(html).not.toMatch(/\{\{[A-Z_0-9]+\}\}/);
    });
  });

  describe('3. Sanitização de Preview na UI (sanitizeHtmlForPreview)', () => {
    it('Preserva tags HTML válidas de visualização e remove scripts/iframes', () => {
      const raw = `<div class="contract"><script>alert('xss')</script><h3>CLÁUSULA 01</h3><p>Texto oficial</p><iframe src="evil.com"></iframe></div>`;
      const clean = sanitizeHtmlForPreview(raw);
      expect(clean).toContain('<h3>CLÁUSULA 01</h3>');
      expect(clean).toContain('<p>Texto oficial</p>');
      expect(clean).not.toContain('<script');
      expect(clean).not.toContain('<iframe');
    });
  });

  describe('4. Geração de PDF a partir do HTML Oficial', () => {
    it('Gera PDF vetorial válido a partir do HTML oficial de Anunciante', async () => {
      const bytes = await gerarPdfDoHtml(CANONICAL_TEMPLATE_HTML_ANUNCIANTE, 'CTR-TEST-001', 'ANUNCIANTE', 1);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(1000);
      const hash = await sha256Hex(bytes);
      expect(hash).toHaveLength(64);
    });

    it('Gera PDF vetorial válido a partir do HTML oficial de Parceiro', async () => {
      const bytes = await gerarPdfDoHtml(CANONICAL_TEMPLATE_HTML_PARCEIRO, 'CTR-TEST-002', 'PARCEIRO', 1);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(1000);
      const hash = await sha256Hex(bytes);
      expect(hash).toHaveLength(64);
    });

    it('Gera PDF vetorial válido a partir do HTML oficial de Gestor', async () => {
      const bytes = await gerarPdfDoHtml(CANONICAL_TEMPLATE_HTML_GESTOR, 'CTR-TEST-003', 'GESTOR', 1);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(1000);
      const hash = await sha256Hex(bytes);
      expect(hash).toHaveLength(64);
    });
  });
});
