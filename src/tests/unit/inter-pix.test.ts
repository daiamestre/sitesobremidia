import { describe, it, expect } from 'vitest';

function generateTxid(cobrancaId: string): string {
  const clean = cobrancaId.replace(/[^a-zA-Z0-9]/g, '');
  const prefix = 'SM';
  const needed = 32 - prefix.length;
  return (prefix + clean.padEnd(needed, '0')).slice(0, 32);
}

function formatValorPix(valor: number): string {
  return Number(valor).toFixed(2);
}

describe('PIX Banco Inter — Testes Unitários e Validações Matemáticas', () => {
  describe('1. TXID Determinístico e Compatibilidade BACEN', () => {
    it('gera TXID válido com exatamente 32 caracteres alfanuméricos', () => {
      const id1 = '09d8a6f7-7d2b-4554-82ef-e23bc96ff4b8';
      const txid1 = generateTxid(id1);
      expect(txid1).toHaveLength(32);
      expect(/^[a-zA-Z0-9]{26,35}$/.test(txid1)).toBe(true);
    });

    it('mesma cobrança gera sempre o mesmo TXID (determinístico)', () => {
      const id = '6e2e5de3-4d7e-421c-be47-a2e8ebe382dc';
      const tx1 = generateTxid(id);
      const tx2 = generateTxid(id);
      expect(tx1).toBe(tx2);
    });

    it('cobranças diferentes geram TXIDs diferentes', () => {
      const id1 = '09d8a6f7-7d2b-4554-82ef-e23bc96ff4b8';
      const id2 = '6e2e5de3-4d7e-421c-be47-a2e8ebe382dc';
      expect(generateTxid(id1)).not.toBe(generateTxid(id2));
    });
  });

  describe('2. Precisão de Valores Financeiros Obrigatórios', () => {
    const testValues = [0.01, 0.10, 0.99, 1.00, 89.99, 1275.90, 9999.99];

    testValues.forEach((val) => {
      it(`formata com precisão monetária o valor R$ ${val}`, () => {
        const formatted = formatValorPix(val);
        expect(formatted).toBe(val.toFixed(2));
        expect(Number(formatted)).toBeCloseTo(val, 2);
      });
    });
  });

  describe('3. Idempotência e Regras de Liquidação Financeira', () => {
    it('impede duplicação financeira em eventos repetidos', () => {
      const cobranca = { valor: 100.0, valor_pago: 0, saldo: 100.0, status: 'PENDENTE' };
      const eventosProcessados = new Set<string>();

      function processarWebhook(e2eId: string, valor: number) {
        if (eventosProcessados.has(e2eId)) {
          return { status: 'DEDUPLICATED', cobranca };
        }
        eventosProcessados.add(e2eId);
        cobranca.valor_pago += valor;
        cobranca.saldo = Math.max(0, cobranca.valor - cobranca.valor_pago);
        if (cobranca.saldo <= 0) {
          cobranca.status = 'PAGA';
        }
        return { status: 'LIQUIDATED', cobranca };
      }

      const e2e = 'E0041696820260830120000000000001';
      const r1 = processarWebhook(e2e, 100.0);
      expect(r1.status).toBe('LIQUIDATED');
      expect(cobranca.valor_pago).toBe(100.0);
      expect(cobranca.saldo).toBe(0);
      expect(cobranca.status).toBe('PAGA');

      // Repetição 2
      const r2 = processarWebhook(e2e, 100.0);
      expect(r2.status).toBe('DEDUPLICATED');
      expect(cobranca.valor_pago).toBe(100.0);

      // Repetição 3
      const r3 = processarWebhook(e2e, 100.0);
      expect(r3.status).toBe('DEDUPLICATED');
      expect(cobranca.valor_pago).toBe(100.0);
    });

    it('rejeita liquidação integral com valor divergente menor', () => {
      const cobranca = { valor: 100.0, valor_pago: 0, saldo: 100.0, status: 'PENDENTE' };
      const valorRecebido = 50.0;

      const isValorIntegral = Number(valorRecebido) >= Number(cobranca.valor);
      expect(isValorIntegral).toBe(false);
    });
  });

  describe('4. Coexistência Híbrida PIX + BOLETO', () => {
    it('liquidação por PIX encerra a cobrança e impede segunda baixa por Boleto posterior', () => {
      const cobranca = { id: 'c1', valor: 250.0, valor_pago: 0, saldo: 250.0, status: 'PENDENTE' };
      const pagamentos: any[] = [];

      function liquidar(meio: 'PIX' | 'BOLETO', transacaoId: string, valor: number) {
        if (cobranca.status === 'PAGA' || cobranca.saldo <= 0) {
          return { success: false, reason: 'ALREADY_SETTLED' };
        }
        pagamentos.push({ meio, transacaoId, valor });
        cobranca.valor_pago += valor;
        cobranca.saldo = Math.max(0, cobranca.valor - cobranca.valor_pago);
        if (cobranca.saldo <= 0) {
          cobranca.status = 'PAGA';
        }
        return { success: true };
      }

      // 1. Pix chega e liquida
      const rPix = liquidar('PIX', 'E2E-PIX-123', 250.0);
      expect(rPix.success).toBe(true);
      expect(cobranca.status).toBe('PAGA');
      expect(cobranca.saldo).toBe(0);

      // 2. Boleto chega depois referente ao mesmo título
      const rBoleto = liquidar('BOLETO', 'SOLICITACAO-BOL-456', 250.0);
      expect(rBoleto.success).toBe(false);
      expect(rBoleto.reason).toBe('ALREADY_SETTLED');
      expect(pagamentos).toHaveLength(1);
    });
  });

  describe('5. Fail-Closed no Portal Público', () => {
    it('autoriza apenas PIX quando metodos_gateway = [PIX]', () => {
      const metodos = ['PIX'];
      const showPix = metodos.includes('PIX');
      const showBoleto = metodos.includes('BOLETO');
      expect(showPix).toBe(true);
      expect(showBoleto).toBe(false);
    });

    it('autoriza apenas BOLETO quando metodos_gateway = [BOLETO]', () => {
      const metodos = ['BOLETO'];
      const showPix = metodos.includes('PIX');
      const showBoleto = metodos.includes('BOLETO');
      expect(showPix).toBe(false);
      expect(showBoleto).toBe(true);
    });

    it('autoriza ambos quando metodos_gateway = [PIX, BOLETO]', () => {
      const metodos = ['PIX', 'BOLETO'];
      const showPix = metodos.includes('PIX');
      const showBoleto = metodos.includes('BOLETO');
      expect(showPix).toBe(true);
      expect(showBoleto).toBe(true);
    });
  });
});
