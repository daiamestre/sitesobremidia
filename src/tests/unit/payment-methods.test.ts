import { describe, it, expect } from 'vitest';
import { resolvePaymentMethods } from '../../pages/PaginaCobranca';

describe('GATE 5.1 — Determinismo de Resolução de Métodos de Pagamento (resolvePaymentMethods)', () => {
  it('Caso A: [PIX] habilita somente PIX', () => {
    const res = resolvePaymentMethods(['PIX']);
    expect(res.showPix).toBe(true);
    expect(res.showBoleto).toBe(false);
    expect(res.hasBoth).toBe(false);
    expect(res.hasAny).toBe(true);
  });

  it('Caso B: [BOLETO] habilita somente BOLETO', () => {
    const res = resolvePaymentMethods(['BOLETO']);
    expect(res.showPix).toBe(false);
    expect(res.showBoleto).toBe(true);
    expect(res.hasBoth).toBe(false);
    expect(res.hasAny).toBe(true);
  });

  it('Caso C: [PIX, BOLETO] habilita ambos os métodos', () => {
    const res = resolvePaymentMethods(['PIX', 'BOLETO']);
    expect(res.showPix).toBe(true);
    expect(res.showBoleto).toBe(true);
    expect(res.hasBoth).toBe(true);
    expect(res.hasAny).toBe(true);
  });

  it('Caso D: [] (array vazio) fail-closed -> nenhum método', () => {
    const res = resolvePaymentMethods([]);
    expect(res.showPix).toBe(false);
    expect(res.showBoleto).toBe(false);
    expect(res.hasBoth).toBe(false);
    expect(res.hasAny).toBe(false);
  });

  it('Caso E: null / undefined fail-closed -> nenhum método', () => {
    const rNull = resolvePaymentMethods(null);
    expect(rNull.showPix).toBe(false);
    expect(rNull.showBoleto).toBe(false);
    expect(rNull.hasAny).toBe(false);

    const rUndef = resolvePaymentMethods(undefined);
    expect(rUndef.showPix).toBe(false);
    expect(rUndef.showBoleto).toBe(false);
    expect(rUndef.hasAny).toBe(false);
  });

  it('Caso F: String CSV "PIX, BOLETO"', () => {
    const res = resolvePaymentMethods('PIX, BOLETO');
    expect(res.showPix).toBe(true);
    expect(res.showBoleto).toBe(true);
    expect(res.hasBoth).toBe(true);
  });

  it('Caso G: Métodos inválidos fail-closed', () => {
    const res = resolvePaymentMethods(['CARTAO_CREDITO_INVALIDO', 'TED']);
    expect(res.showPix).toBe(false);
    expect(res.showBoleto).toBe(false);
    expect(res.hasAny).toBe(false);
  });
});
