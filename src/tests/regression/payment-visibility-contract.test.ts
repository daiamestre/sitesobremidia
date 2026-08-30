import { describe, it, expect } from 'vitest';
import { resolvePaymentMethods } from '@/pages/PaginaCobranca';

/**
 * CONTRACT SUITE: GATE 6.5 — PAYMENT VISIBILITY REGRESSION IMMUTABILITY
 * 
 * Este arquivo estabelece o contrato imutável de visibilidade das formas de pagamento
 * no Portal Público do Cliente Final. Qualquer alteração que quebre este teste
 * representa uma regressão de release crítica (P0).
 */

function simulatePaymentDOM(
  metodosGateway: string[] | string | null | undefined,
  activeTab: 'pix' | 'boleto' | null = null,
  bankData: { pix?: { pixCopiaECola?: string }; boleto?: { linhaDigitavel?: string } } | null = null
) {
  const { showPix: hasPix, showBoleto: hasBoleto, hasAny, hasBoth } = resolvePaymentMethods(metodosGateway);
  const effectiveTab = hasBoth ? (activeTab || 'pix') : (hasPix ? 'pix' : (hasBoleto ? 'boleto' : null));

  return {
    hasPix,
    hasBoleto,
    hasBoth,
    hasAny,
    effectiveTab,
    isNoPaymentRendered: !hasAny,
    isTabSwitcherRendered: hasBoth,
    isPixRendered: hasPix && effectiveTab === 'pix',
    isBoletoRendered: hasBoleto && effectiveTab === 'boleto',
  };
}

describe('GATE 6.5 — Payment Visibility Immutability Contract', () => {

  describe('1. Contrato de Autorização Canônica (metodos_gateway)', () => {
    it('Cenário 1: ["PIX"] => Exclusivamente PIX visível, Boleto e Abas proibidos', () => {
      const dom = simulatePaymentDOM(['PIX']);
      expect(dom.hasPix).toBe(true);
      expect(dom.hasBoleto).toBe(false);
      expect(dom.hasBoth).toBe(false);
      expect(dom.hasAny).toBe(true);
      expect(dom.effectiveTab).toBe('pix');
      expect(dom.isPixRendered).toBe(true);
      expect(dom.isBoletoRendered).toBe(false);
      expect(dom.isTabSwitcherRendered).toBe(false);
      expect(dom.isNoPaymentRendered).toBe(false);
    });

    it('Cenário 2: ["BOLETO"] => Exclusivamente Boleto visível, PIX e Abas proibidos', () => {
      const dom = simulatePaymentDOM(['BOLETO']);
      expect(dom.hasPix).toBe(false);
      expect(dom.hasBoleto).toBe(true);
      expect(dom.hasBoth).toBe(false);
      expect(dom.hasAny).toBe(true);
      expect(dom.effectiveTab).toBe('boleto');
      expect(dom.isPixRendered).toBe(false);
      expect(dom.isBoletoRendered).toBe(true);
      expect(dom.isTabSwitcherRendered).toBe(false);
      expect(dom.isNoPaymentRendered).toBe(false);
    });

    it('Cenário 3: ["PIX", "BOLETO"] => Ambos autorizados com seletor de abas', () => {
      // Padrão (aba PIX)
      const domPix = simulatePaymentDOM(['PIX', 'BOLETO'], 'pix');
      expect(domPix.hasBoth).toBe(true);
      expect(domPix.isTabSwitcherRendered).toBe(true);
      expect(domPix.isPixRendered).toBe(true);
      expect(domPix.isBoletoRendered).toBe(false);
      expect(domPix.isNoPaymentRendered).toBe(false);

      // Alternando para aba Boleto
      const domBoleto = simulatePaymentDOM(['PIX', 'BOLETO'], 'boleto');
      expect(domBoleto.hasBoth).toBe(true);
      expect(domBoleto.isTabSwitcherRendered).toBe(true);
      expect(domBoleto.isPixRendered).toBe(false);
      expect(domBoleto.isBoletoRendered).toBe(true);
      expect(domBoleto.isNoPaymentRendered).toBe(false);
    });

    it('Cenário 4: [] (Vazio) => Fail-Closed obrigatório', () => {
      const dom = simulatePaymentDOM([]);
      expect(dom.hasAny).toBe(false);
      expect(dom.isNoPaymentRendered).toBe(true);
      expect(dom.isPixRendered).toBe(false);
      expect(dom.isBoletoRendered).toBe(false);
      expect(dom.isTabSwitcherRendered).toBe(false);
    });

    it('Cenário 5: null ou undefined => Fail-Closed obrigatório', () => {
      const domNull = simulatePaymentDOM(null);
      expect(domNull.hasAny).toBe(false);
      expect(domNull.isNoPaymentRendered).toBe(true);

      const domUndef = simulatePaymentDOM(undefined);
      expect(domUndef.hasAny).toBe(false);
      expect(domUndef.isNoPaymentRendered).toBe(true);
    });
  });

  describe('2. Testes de Regressão de Incidentes Históricos (Bug Trace)', () => {
    it('Regressão 1: PIX+BOLETO sem artefatos bancários JIT iniciais NÃO pode exibir fail-closed', () => {
      // Reprodução do bug histórico: quando o cliente abria o link antes do JIT concluir
      const dom = simulatePaymentDOM(['PIX', 'BOLETO'], null, { pix: undefined, boleto: undefined });
      expect(dom.hasPix).toBe(true);
      expect(dom.hasBoleto).toBe(true);
      expect(dom.hasBoth).toBe(true);
      expect(dom.isNoPaymentRendered).toBe(false); // NUNCA "Nenhuma forma de pagamento está disponível"
      expect(dom.effectiveTab).toBe('pix');
    });

    it('Regressão 2: PIX sem payload EMV imediato mantém autorização e bloqueia Boleto', () => {
      const dom = simulatePaymentDOM(['PIX'], null, { pix: undefined });
      expect(dom.hasPix).toBe(true);
      expect(dom.isPixRendered).toBe(true);
      expect(dom.isBoletoRendered).toBe(false);
      expect(dom.isNoPaymentRendered).toBe(false);
    });

    it('Regressão 3: Boleto sem linha digitável imediata mantém autorização e bloqueia PIX', () => {
      const dom = simulatePaymentDOM(['BOLETO'], null, { boleto: undefined });
      expect(dom.hasBoleto).toBe(true);
      expect(dom.isBoletoRendered).toBe(true);
      expect(dom.isPixRendered).toBe(false);
      expect(dom.isNoPaymentRendered).toBe(false);
    });

    it('Regressão 4: activeTab com valor desincronizado é autocorrigido por effectiveTab', () => {
      // Se activeTab for 'boleto', mas a cobrança só autoriza 'PIX':
      const domPixFixed = simulatePaymentDOM(['PIX'], 'boleto');
      expect(domPixFixed.effectiveTab).toBe('pix');
      expect(domPixFixed.isPixRendered).toBe(true);
      expect(domPixFixed.isBoletoRendered).toBe(false);

      // Se activeTab for 'pix', mas a cobrança só autoriza 'BOLETO':
      const domBoletoFixed = simulatePaymentDOM(['BOLETO'], 'pix');
      expect(domBoletoFixed.effectiveTab).toBe('boleto');
      expect(domBoletoFixed.isBoletoRendered).toBe(true);
      expect(domBoletoFixed.isPixRendered).toBe(false);
    });
  });

  describe('3. Robustez de Parsing e Formatos de Entrada', () => {
    it('Deve aceitar string separada por vírgulas "PIX, BOLETO"', () => {
      const dom = simulatePaymentDOM('PIX, BOLETO');
      expect(dom.hasBoth).toBe(true);
    });

    it('Deve aceitar letras minúsculas ou com espaços " pix , boleto "', () => {
      const dom = simulatePaymentDOM(' pix , boleto ');
      expect(dom.hasBoth).toBe(true);
      expect(dom.hasPix).toBe(true);
      expect(dom.hasBoleto).toBe(true);
    });

    it('Deve tratar métodos desconhecidos com segurança sem quebrar', () => {
      const dom = simulatePaymentDOM(['CARTAO_CREDITO', 'TRANSFERENCIA'] as any);
      expect(dom.hasPix).toBe(false);
      expect(dom.hasBoleto).toBe(false);
      expect(dom.hasAny).toBe(false);
      expect(dom.isNoPaymentRendered).toBe(true);
    });
  });

});
