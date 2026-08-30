import { describe, it, expect } from 'vitest';

class CobrancaLockSimulator {
  private cobranca: { id: string; valor: number; valor_pago: number; saldo: number; status: string };
  private pagamentos: Array<{ id: string; meio: string; transacaoId: string; valor: number }>;
  private eventosDeduplicados: Set<string>;
  private isLocked: boolean = false;

  constructor(valor: number) {
    this.cobranca = { id: 'cob-1', valor, valor_pago: 0, saldo: valor, status: 'PENDENTE' };
    this.pagamentos = [];
    this.eventosDeduplicados = new Set();
  }

  // Simulação da função atômica com SELECT ... FOR UPDATE no banco
  async processarPagamento(meio: 'PIX' | 'BOLETO', transacaoId: string, valorPago: number): Promise<{ success: boolean; reason?: string; status: string; saldo: number; valor_pago: number }> {
    // 1. Idempotência do próprio webhook / transação externa
    if (this.eventosDeduplicados.has(transacaoId)) {
      return { success: true, reason: 'DEDUPLICATED_IDENTICAL_TRANSACTION', status: this.cobranca.status, saldo: this.cobranca.saldo, valor_pago: this.cobranca.valor_pago };
    }

    // 2. Lock transacional (SELECT ... FOR UPDATE)
    while (this.isLocked) {
      await new Promise((r) => setTimeout(r, 1));
    }
    this.isLocked = true;

    try {
      // 3. Regra de Integridade Financeira: Cobrança já liquidada não aceita segundo pagamento
      if (this.cobranca.status === 'PAGA' || this.cobranca.saldo <= 0) {
        this.eventosDeduplicados.add(transacaoId);
        return { success: false, reason: 'ALREADY_SETTLED_REJECTED', status: this.cobranca.status, saldo: this.cobranca.saldo, valor_pago: this.cobranca.valor_pago };
      }

      // 4. Inserção do pagamento e atualização transacional do saldo
      const valorEfetivo = Math.min(valorPago, this.cobranca.saldo);
      this.pagamentos.push({ id: `pag-${Date.now()}`, meio, transacaoId, valor: valorEfetivo });
      this.eventosDeduplicados.add(transacaoId);

      this.cobranca.valor_pago += valorEfetivo;
      this.cobranca.saldo = Math.max(0, this.cobranca.valor - this.cobranca.valor_pago);
      if (this.cobranca.saldo <= 0) {
        this.cobranca.status = 'PAGA';
      }

      return { success: true, reason: 'LIQUIDATED', status: this.cobranca.status, saldo: this.cobranca.saldo, valor_pago: this.cobranca.valor_pago };
    } finally {
      this.isLocked = false;
    }
  }

  getState() {
    return { cobranca: { ...this.cobranca }, pagamentosCount: this.pagamentos.length };
  }
}

describe('GATE 0.1 — Validação Matemática e Transacional de Casos A até H', () => {
  it('A. PIX sozinho → R$100 → PAGA', async () => {
    const sim = new CobrancaLockSimulator(100.0);
    const r = await sim.processarPagamento('PIX', 'E2E-PIX-1', 100.0);
    expect(r.success).toBe(true);
    expect(r.status).toBe('PAGA');
    expect(r.saldo).toBe(0);
    expect(r.valor_pago).toBe(100.0);
    expect(sim.getState().pagamentosCount).toBe(1);
  });

  it('B. Boleto sozinho → R$100 → PAGA', async () => {
    const sim = new CobrancaLockSimulator(100.0);
    const r = await sim.processarPagamento('BOLETO', 'NOSSO-NUM-1', 100.0);
    expect(r.success).toBe(true);
    expect(r.status).toBe('PAGA');
    expect(r.saldo).toBe(0);
    expect(r.valor_pago).toBe(100.0);
    expect(sim.getState().pagamentosCount).toBe(1);
  });

  it('C. PIX + Boleto sequencial → somente R$100 contabilizados', async () => {
    const sim = new CobrancaLockSimulator(100.0);
    const rPix = await sim.processarPagamento('PIX', 'E2E-PIX-1', 100.0);
    expect(rPix.success).toBe(true);
    expect(rPix.status).toBe('PAGA');

    const rBol = await sim.processarPagamento('BOLETO', 'NOSSO-NUM-1', 100.0);
    expect(rBol.success).toBe(false);
    expect(rBol.reason).toBe('ALREADY_SETTLED_REJECTED');
    expect(sim.getState().cobranca.valor_pago).toBe(100.0);
    expect(sim.getState().cobranca.saldo).toBe(0.0);
    expect(sim.getState().pagamentosCount).toBe(1);
  });

  it('D. Boleto + PIX sequencial → somente R$100 contabilizados', async () => {
    const sim = new CobrancaLockSimulator(100.0);
    const rBol = await sim.processarPagamento('BOLETO', 'NOSSO-NUM-1', 100.0);
    expect(rBol.success).toBe(true);
    expect(rBol.status).toBe('PAGA');

    const rPix = await sim.processarPagamento('PIX', 'E2E-PIX-1', 100.0);
    expect(rPix.success).toBe(false);
    expect(rPix.reason).toBe('ALREADY_SETTLED_REJECTED');
    expect(sim.getState().cobranca.valor_pago).toBe(100.0);
    expect(sim.getState().cobranca.saldo).toBe(0.0);
    expect(sim.getState().pagamentosCount).toBe(1);
  });

  it('E. PIX + Boleto concorrente → somente R$100 contabilizados', async () => {
    const sim = new CobrancaLockSimulator(100.0);
    const [rPix, rBol] = await Promise.all([
      sim.processarPagamento('PIX', 'E2E-PIX-CONC', 100.0),
      sim.processarPagamento('BOLETO', 'BOL-CONC', 100.0)
    ]);

    const successes = [rPix, rBol].filter(r => r.success);
    const rejected = [rPix, rBol].filter(r => !r.success);

    expect(successes).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBe('ALREADY_SETTLED_REJECTED');
    expect(sim.getState().cobranca.valor_pago).toBe(100.0);
    expect(sim.getState().cobranca.saldo).toBe(0.0);
    expect(sim.getState().pagamentosCount).toBe(1);
  });

  it('F. webhook PIX duplicado → somente 1 pagamento', async () => {
    const sim = new CobrancaLockSimulator(100.0);
    const r1 = await sim.processarPagamento('PIX', 'E2E-PIX-DUP', 100.0);
    const r2 = await sim.processarPagamento('PIX', 'E2E-PIX-DUP', 100.0);
    const r3 = await sim.processarPagamento('PIX', 'E2E-PIX-DUP', 100.0);

    expect(r1.reason).toBe('LIQUIDATED');
    expect(r2.reason).toBe('DEDUPLICATED_IDENTICAL_TRANSACTION');
    expect(r3.reason).toBe('DEDUPLICATED_IDENTICAL_TRANSACTION');
    expect(sim.getState().cobranca.valor_pago).toBe(100.0);
    expect(sim.getState().pagamentosCount).toBe(1);
  });

  it('G. webhook Boleto duplicado → somente 1 pagamento', async () => {
    const sim = new CobrancaLockSimulator(100.0);
    const r1 = await sim.processarPagamento('BOLETO', 'BOL-DUP', 100.0);
    const r2 = await sim.processarPagamento('BOLETO', 'BOL-DUP', 100.0);

    expect(r1.reason).toBe('LIQUIDATED');
    expect(r2.reason).toBe('DEDUPLICATED_IDENTICAL_TRANSACTION');
    expect(sim.getState().cobranca.valor_pago).toBe(100.0);
    expect(sim.getState().pagamentosCount).toBe(1);
  });

  it('H. PIX duplicado + Boleto → somente 1 liquidação', async () => {
    const sim = new CobrancaLockSimulator(100.0);
    await sim.processarPagamento('PIX', 'E2E-PIX-1', 100.0);
    await sim.processarPagamento('PIX', 'E2E-PIX-1', 100.0);
    const rBol = await sim.processarPagamento('BOLETO', 'BOL-2', 100.0);

    expect(rBol.success).toBe(false);
    expect(rBol.reason).toBe('ALREADY_SETTLED_REJECTED');
    expect(sim.getState().cobranca.valor_pago).toBe(100.0);
    expect(sim.getState().cobranca.saldo).toBe(0.0);
    expect(sim.getState().pagamentosCount).toBe(1);
  });
});
