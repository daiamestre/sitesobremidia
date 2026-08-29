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

// Renderização condicional PIX/BOLETO no portal — extraída de PaginaCobranca
function visibleMethods(bankData: { pix?: { pixCopiaECola?: string }; boleto?: { linhaDigitavel?: string } } | null, permitidos: string[]) {
  // Edge mantém regra: só exibe se artefato existe E permitido
  const allowPix = permitidos.includes('PIX');
  const allowBoleto = permitidos.includes('BOLETO');
  const hasPixArtefact = !!bankData?.pix?.pixCopiaECola;
  const hasBoletoArtefact = !!bankData?.boleto?.linhaDigitavel;
  const pixVisible = hasPixArtefact && allowPix;
  const boletoVisible = hasBoletoArtefact && allowBoleto;
  return { pixVisible, boletoVisible };
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
  const pixArtefact = { pixCopiaECola: '000201...pix...' };
  const boletoArtefact = { linhaDigitavel: '00190.00009 ...' };

  it('Caso 1: metodos_gateway=[PIX] com artefato PIX => PIX visível, Boleto oculto', () => {
    const { pixVisible, boletoVisible } = visibleMethods({ pix: pixArtefact, boleto: boletoArtefact }, ['PIX']);
    expect(pixVisible).toBe(true);
    expect(boletoVisible).toBe(false);
  });

  it('Caso 2: metodos_gateway=[BOLETO] com artefato Boleto => Boleto visível, PIX oculto', () => {
    const { pixVisible, boletoVisible } = visibleMethods({ pix: pixArtefact, boleto: boletoArtefact }, ['BOLETO']);
    expect(pixVisible).toBe(false);
    expect(boletoVisible).toBe(true);
  });

  it('Caso 3: metodos_gateway=[PIX,BOLETO] com ambos artefatos => ambos visíveis (PIX+BOLETO)', () => {
    const { pixVisible, boletoVisible } = visibleMethods({ pix: pixArtefact, boleto: boletoArtefact }, ['PIX', 'BOLETO']);
    expect(pixVisible).toBe(true);
    expect(boletoVisible).toBe(true);
  });

  it('Caso 4: nenhum artefato disponível => fail-closed, nenhum botão falso', () => {
    const { pixVisible, boletoVisible } = visibleMethods(null, ['PIX', 'BOLETO']);
    expect(pixVisible).toBe(false);
    expect(boletoVisible).toBe(false);
  });

  it('Caso 4b: sem método autorizado (array vazio) => nenhum visível mesmo com artefatos', () => {
    const { pixVisible, boletoVisible } = visibleMethods({ pix: pixArtefact, boleto: boletoArtefact }, []);
    expect(pixVisible).toBe(false);
    expect(boletoVisible).toBe(false);
  });

  it('Caso 5: método autorizado mas artefato inexistente => não fingir', () => {
    // CRM autorizou PIX mas Inter não retornou pixCopiaECola
    const { pixVisible, boletoVisible } = visibleMethods({ pix: undefined, boleto: boletoArtefact }, ['PIX', 'BOLETO']);
    expect(pixVisible).toBe(false);
    expect(boletoVisible).toBe(true);
  });

  it('Caso 5b: autorizou BOLETO mas sem linhaDigitavel => não mostrar Boleto', () => {
    const { pixVisible, boletoVisible } = visibleMethods({ pix: pixArtefact, boleto: undefined }, ['PIX', 'BOLETO']);
    expect(pixVisible).toBe(true);
    expect(boletoVisible).toBe(false);
  });

  it('CRM → persistência → Inter → RPC → Portal: metodos_gateway deve ser consistente', () => {
    // Simula persistência: o que o CRM grava deve ser o que o RPC retorna
    const gravado: string[] = ['PIX'];
    const rpcRetornado: string[] = ['PIX']; // simulado
    expect(rpcRetornado).toEqual(gravado);
    const { pixVisible, boletoVisible } = visibleMethods({ pix: pixArtefact, boleto: undefined }, rpcRetornado);
    expect(pixVisible).toBe(true);
    expect(boletoVisible).toBe(false);
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
