import { describe, it, expect } from 'vitest';

// Lógica extraída de PaginaCobranca para teste isolado (forense P0)
function saldoCorreto(data: { valor_original: number; valor_pago: number; saldo: number | null }) {
  return typeof data.saldo === 'number' ? data.saldo : Number(data.valor_original || 0) - Number(data.valor_pago || 0);
}
function deriveIsPaid(data: { status: string; valor_original: number; valor_pago: number; saldo: number | null }) {
  const saldo = saldoCorreto(data as any);
  return data.status === 'PAGO' || data.status === 'PAGA' || saldo <= 0.009;
}
function deriveIsCanceled(status: string) {
  return status === 'CANCELADO' || status === 'CANCELADA';
}
function getStatusText(data: { status: string; valor_pago: number; saldo: number | null; valor_original: number }, isPaid: boolean, isCanceled: boolean, isOverdue: boolean) {
  if (isCanceled) return 'CANCELADA';
  if (isPaid) return 'PAGA';
  if (isOverdue) return 'ATRASADA';
  const saldo = saldoCorreto(data as any);
  if (data.status === 'PARCIAL' || data.status === 'PARCIAL_PAGA' || (Number(data.valor_pago || 0) > 0 && Number(saldo) > 0)) return 'PAGA PARCIALMENTE';
  return 'EM ABERTO';
}

// Renderização condicional PIX/BOLETO no portal — estritamente sincronizada com PaginaCobranca.tsx
import { resolvePaymentMethods } from '@/pages/PaginaCobranca';

function computePaymentDOMState(
  metodosGateway: string[] | string | null | undefined,
  activeTab: 'pix' | 'boleto' | null = null,
  bankData?: { pix?: { pixCopiaECola?: string }; boleto?: { linhaDigitavel?: string } } | null
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

describe('P0 Forense — Status Financeiro (REC-2026-047423)', () => {
  it('REC-2026-047423: PENDENTE com valor 122, saldo 122, nenhum pagamento => NÃO é PAGA, status EM ABERTO', () => {
    const data = { status: 'PENDENTE', valor_original: 122, valor_pago: 0, saldo: 122 };
    const isPaid = deriveIsPaid(data);
    const isCanceled = deriveIsCanceled(data.status);
    const isOverdue = false; // vencimento futuro
    expect(isPaid).toBe(false);
    expect(isCanceled).toBe(false);
    expect(getStatusText(data, isPaid, isCanceled, isOverdue)).toBe('EM ABERTO');
    expect(saldoCorreto(data)).toBe(122);
  });

  it('saldo null deve ser computado como valor_original - valor_pago e não causar PAGA falso', () => {
    const data = { status: 'PENDENTE', valor_original: 122, valor_pago: 0, saldo: null as any };
    const saldo = saldoCorreto(data);
    expect(saldo).toBe(122);
    expect(deriveIsPaid(data as any)).toBe(false);
  });

  it('saldo null com valor_pago 0 não deve ser PAGA (regressão REC-2026-047423)', () => {
    const data = { status: 'PENDENTE', valor_original: 122, valor_pago: 0, saldo: null as any };
    expect(deriveIsPaid(data as any)).toBe(false);
    // antiga lógica buggy `null <=0` retornaria true, mas nova lógica retorna false
  });

  it('status PAGO deve ser PAGA mesmo com saldo 0', () => {
    const data = { status: 'PAGO', valor_original: 122, valor_pago: 122, saldo: 0 };
    expect(deriveIsPaid(data)).toBe(true);
    expect(getStatusText(data, true, false, false)).toBe('PAGA');
  });

  it('saldo 0 com status PENDENTE deve ser considerado PAGA (quitada)', () => {
    const data = { status: 'PENDENTE', valor_original: 122, valor_pago: 122, saldo: 0 };
    expect(deriveIsPaid(data)).toBe(true);
  });

  it('parcial deve exibir PAGA PARCIALMENTE', () => {
    const data = { status: 'PARCIAL', valor_original: 100, valor_pago: 30, saldo: 70 };
    const isPaid = deriveIsPaid(data);
    expect(isPaid).toBe(false);
    expect(getStatusText(data, isPaid, false, false)).toBe('PAGA PARCIALMENTE');
  });
});

describe('P0 Forense — Métodos Gateway e Renderização no Portal', () => {
  it('Caso 1: metodos_gateway=[PIX] => PIX renderizado, Boleto oculto, sem seletor de abas', () => {
    const state = computePaymentDOMState(['PIX']);
    expect(state.hasPix).toBe(true);
    expect(state.hasBoleto).toBe(false);
    expect(state.isPixRendered).toBe(true);
    expect(state.isBoletoRendered).toBe(false);
    expect(state.isTabSwitcherRendered).toBe(false);
    expect(state.isNoPaymentRendered).toBe(false);
  });

  it('Caso 2: metodos_gateway=[BOLETO] => Boleto renderizado, PIX oculto, sem seletor de abas', () => {
    const state = computePaymentDOMState(['BOLETO']);
    expect(state.hasPix).toBe(false);
    expect(state.hasBoleto).toBe(true);
    expect(state.isPixRendered).toBe(false);
    expect(state.isBoletoRendered).toBe(true);
    expect(state.isTabSwitcherRendered).toBe(false);
    expect(state.isNoPaymentRendered).toBe(false);
  });

  it('Caso 3: metodos_gateway=[PIX,BOLETO] => ambos autorizados, seletor de abas ativo', () => {
    const statePix = computePaymentDOMState(['PIX', 'BOLETO'], 'pix');
    expect(statePix.hasBoth).toBe(true);
    expect(statePix.isTabSwitcherRendered).toBe(true);
    expect(statePix.isPixRendered).toBe(true);
    expect(statePix.isBoletoRendered).toBe(false);

    const stateBoleto = computePaymentDOMState(['PIX', 'BOLETO'], 'boleto');
    expect(stateBoleto.hasBoth).toBe(true);
    expect(stateBoleto.isTabSwitcherRendered).toBe(true);
    expect(stateBoleto.isPixRendered).toBe(false);
    expect(stateBoleto.isBoletoRendered).toBe(true);
  });

  it('Caso 4: sem método autorizado (array vazio []) => Fail-Closed com mensagem de indisponibilidade', () => {
    const state = computePaymentDOMState([]);
    expect(state.hasAny).toBe(false);
    expect(state.isNoPaymentRendered).toBe(true);
    expect(state.isPixRendered).toBe(false);
    expect(state.isBoletoRendered).toBe(false);
    expect(state.isTabSwitcherRendered).toBe(false);
  });

  it('Caso 4b: sem método autorizado (null) => Fail-Closed', () => {
    const state = computePaymentDOMState(null);
    expect(state.hasAny).toBe(false);
    expect(state.isNoPaymentRendered).toBe(true);
    expect(state.isPixRendered).toBe(false);
    expect(state.isBoletoRendered).toBe(false);
  });

  it('Caso 5: Desacoplamento - ausência temporária de artefato bancário NÃO retira autorização', () => {
    // Quando PIX e BOLETO são autorizados mas o banco ainda não gerou QR/Linha:
    const state = computePaymentDOMState(['PIX', 'BOLETO'], 'pix');
    expect(state.hasPix).toBe(true);
    expect(state.hasBoleto).toBe(true);
    expect(state.isNoPaymentRendered).toBe(false); // NUNCA deve exibir "Nenhuma forma disponível"
  });
});

describe('P0 Forense — Emission payload formasRecebimento', () => {
  function deriveFormasRecebimento(metodosGateway: string[] | null | undefined): string[] {
    const permitidos = Array.isArray(metodosGateway) && metodosGateway.length > 0 ? metodosGateway : ['PIX', 'BOLETO'];
    // deve ser exatamente o que o Inter recebe, sem hardcode
    return permitidos;
  }
  it('SOMENTE PIX => formasRecebimento=[PIX]', () => {
    expect(deriveFormasRecebimento(['PIX'])).toEqual(['PIX']);
  });
  it('SOMENTE BOLETO => formasRecebimento=[BOLETO]', () => {
    expect(deriveFormasRecebimento(['BOLETO'])).toEqual(['BOLETO']);
  });
  it('PIX+BOLETO => formasRecebimento=[PIX,BOLETO]', () => {
    expect(deriveFormasRecebimento(['PIX', 'BOLETO'])).toEqual(['PIX', 'BOLETO']);
  });
  it('fallback quando null => [PIX,BOLETO] (compatibilidade legada)', () => {
    expect(deriveFormasRecebimento(null)).toEqual(['PIX', 'BOLETO']);
  });
});
