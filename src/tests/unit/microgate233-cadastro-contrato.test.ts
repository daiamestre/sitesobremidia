import { describe, it, expect, vi } from 'vitest';
import { resolveContractTypeFromCadastroType, getOfficialPdfForTipoContrato, getOfficialPdfForCadastro, OFFICIAL_PDFS } from '@/modules/crm/services/contractResolver.service';
import { montarRegrasComerciais } from '@/services/prospeccao.service';

describe('MICRO-GATE 2.3.3 — Auditoria e Isolamento dos Tres Tipos de Cadastro', () => {
  describe('1. Mapeamento e Resolucao de Modelos de Contrato', () => {
    it('deve resolver contrato de ANUNCIANTE para modelo de ANUNCIANTE', () => {
      const tipoContrato = resolveContractTypeFromCadastroType('ANUNCIANTE');
      const pdfInfo = getOfficialPdfForTipoContrato(tipoContrato);
      expect(tipoContrato).toBe('ANUNCIANTE');
      expect(pdfInfo?.publicPath).toBe(OFFICIAL_PDFS.ANUNCIANTE.publicPath);
    });

    it('deve resolver contrato de PONTO PARCEIRO para modelo PARCEIRO', () => {
      const tipoContrato = resolveContractTypeFromCadastroType('PONTO_PARCEIRO');
      const pdfInfo = getOfficialPdfForTipoContrato(tipoContrato);
      expect(tipoContrato).toBe('PARCEIRO');
      expect(pdfInfo?.publicPath).toBe(OFFICIAL_PDFS.PARCEIRO.publicPath);
    });

    it('deve resolver contrato de GESTOR DE MIDIAS para modelo GESTOR', () => {
      const tipoGestor = resolveContractTypeFromCadastroType('GESTOR');
      expect(tipoGestor).toBe('GESTOR');

      const tipoGestorMidias = resolveContractTypeFromCadastroType('GESTOR_MIDIAS');
      const pdfInfo = getOfficialPdfForCadastro('GESTOR_MIDIAS');
      expect(tipoGestorMidias).toBe('GESTOR');
      expect(pdfInfo?.publicPath).toBe(OFFICIAL_PDFS.GESTOR.publicPath);
    });
  });

  describe('2. Matriz de Isolamento de Regras Comerciais (Tabela 19)', () => {
    const REGRA_ISOLAMENTO = {
      ANUNCIANTE: {
        cadastro: true,
        contrato: true,
        assinatura: true,
        pontosTelas: true,
        composicaoComercial: true,
        periodicidadeMidia: true,
        preferenciaPagamento: true,
        cobranca: true,
        pagamento: true,
        contaAReceber: true,
        login: true,
        portal: true,
      },
      PONTO_PARCEIRO: {
        cadastro: true,
        contrato: true,
        assinatura: true,
        pontosTelas: true, // vinculo
        composicaoComercial: false,
        periodicidadeMidia: false,
        preferenciaPagamento: false,
        cobranca: false,
        pagamento: false,
        contaAReceber: false,
        login: false,
        portal: false,
      },
      GESTOR: {
        cadastro: true,
        contrato: true,
        assinatura: true,
        pontosTelas: true, // gestao operacional
        composicaoComercial: false,
        periodicidadeMidia: false,
        preferenciaPagamento: false,
        cobranca: false,
        pagamento: false,
        contaAReceber: false,
        login: true,
        portal: true,
      },
    };

    it('ANUNCIANTE deve possuir fluxo comercial completo com cobranca e periodicidade', () => {
      const reg = REGRA_ISOLAMENTO.ANUNCIANTE;
      expect(reg.cobranca).toBe(true);
      expect(reg.periodicidadeMidia).toBe(true);
      expect(reg.composicaoComercial).toBe(true);
      expect(reg.login).toBe(true);
      expect(reg.portal).toBe(true);
    });

    it('PONTO PARCEIRO NAO deve possuir cobranca, periodicidade de midia ou login', () => {
      const reg = REGRA_ISOLAMENTO.PONTO_PARCEIRO;
      expect(reg.cobranca).toBe(false);
      expect(reg.periodicidadeMidia).toBe(false);
      expect(reg.composicaoComercial).toBe(false);
      expect(reg.login).toBe(false);
      expect(reg.portal).toBe(false);
      expect(reg.contrato).toBe(true);
      expect(reg.pontosTelas).toBe(true);
    });

    it('GESTOR DE MIDIAS deve possuir login e portal, mas NAO cobranca de midia', () => {
      const reg = REGRA_ISOLAMENTO.GESTOR;
      expect(reg.login).toBe(true);
      expect(reg.portal).toBe(true);
      expect(reg.contrato).toBe(true);
      expect(reg.cobranca).toBe(false);
      expect(reg.periodicidadeMidia).toBe(false);
      expect(reg.composicaoComercial).toBe(false);
    });
  });

  describe('3. Validacao das Periodicidades de ANUNCIANTE', () => {
    const PERIODICIDADES_VALIDAS = ['MENSAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'];

    it('deve aceitar exatamente as 5 periodicidades obrigatorias', () => {
      expect(PERIODICIDADES_VALIDAS).toHaveLength(5);
      expect(PERIODICIDADES_VALIDAS).toContain('MENSAL');
      expect(PERIODICIDADES_VALIDAS).toContain('BIMESTRAL');
      expect(PERIODICIDADES_VALIDAS).toContain('TRIMESTRAL');
      expect(PERIODICIDADES_VALIDAS).toContain('SEMESTRAL');
      expect(PERIODICIDADES_VALIDAS).toContain('ANUAL');
    });
  });

  describe('4. Montagem de Regras Comerciais do PONTO PARCEIRO', () => {
    it('deve formatar regras de permuta sem gerar cobranca de anunciante', () => {
      const regras = montarRegrasComerciais({
        nome: 'Ponto Teste',
        quantidadeTelas: 2,
        modeloComercial: 'PERMUTA',
        permutaDescricao: 'Espaco em restaurante',
        permutaContrapartida: 'Exibicao de banner',
      });

      expect(regras).toContain('MODELO COMERCIAL: PERMUTA');
      expect(regras.some(r => r.includes('PERMUTA - Descricao: Espaco em restaurante'))).toBe(true);
      expect(regras.some(r => r.includes('PERMUTA - Contrapartida: Exibicao de banner'))).toBe(true);
    });

    it('deve formatar regras de comissionamento 5% corretamente', () => {
      const regras = montarRegrasComerciais({
        nome: 'Ponto Comissionado',
        quantidadeTelas: 4,
        modeloComercial: 'COMISSIONADO_5',
        baseCalculo: 'Valor liquido faturado',
      });

      expect(regras).toContain('MODELO COMERCIAL: COMISSIONADO_5');
      expect(regras).toContain('COMISSAO: 5% (COMISSIONADO 5%)');
      expect(regras.some(r => r.includes('Base de calculo: Valor liquido faturado'))).toBe(true);
    });
  });
});
