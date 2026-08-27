import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  financeiroService,
  deriveCobrancaSituacao,
  formatarNomeCliente,
} from '@/modules/crm/services/financeiro.service';

type DbState = { data: any; error: any };

const hoisted = vi.hoisted(() => {
  const queue: DbState[] = [];
  const next = (): DbState => (queue.length ? (queue.shift() as DbState) : { data: [], error: null });
  const unwrap = (r: DbState) => ({ data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error });
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn(() => Promise.resolve(unwrap(next()))),
    maybeSingle: vi.fn(() => Promise.resolve(unwrap(next()))),
    then: (res: any, rej: any) => Promise.resolve(next()).then(res, rej),
    queue,
  };
    return { chain, next, unwrap };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => hoisted.chain),
    // RPCs do serviço (ex.: gerar_numero_documento) consomem a mesma fila.
    rpc: vi.fn(() => Promise.resolve(hoisted.unwrap(hoisted.next()))),
  },
}));

const resetChain = () => {
  hoisted.chain.queue.length = 0;
  vi.clearAllMocks();
};

const enqueue = (data: any, error: any = null) => {
  hoisted.chain.queue.push({ data, error });
};

describe('Central de Cobranças — deriveCobrancaSituacao', () => {
  it.each([
    ['PAGO', '2099-01-01', 'PAGA'],
    ['PAGA', '2020-01-01', 'PAGA'],
    ['CANCELADO', '2099-01-01', 'CANCELADA'],
    ['PARCIAL', '2099-01-01', 'PARCIAL'],
    ['PARCIAL_PAGA', '2020-01-01', 'PARCIAL'],
    ['PENDENTE', '2999-12-31', 'ABERTA'],
    ['PENDENTE', null, 'ABERTA'],
  ])('status %s com vencimento %s → %s', (status, vencimento, esperado) => {
    expect(deriveCobrancaSituacao(status as string, vencimento as string | null)).toBe(esperado);
  });

  it('vencimento hoje → VENCENDO_HOJE', () => {
    const hoje = new Date();
    const iso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    expect(deriveCobrancaSituacao('PENDENTE', iso)).toBe('VENCENDO_HOJE');
  });

  it('status legado VENCIDO com data passada → ATRASADA', () => {
    expect(deriveCobrancaSituacao('VENCIDO', '2001-01-01')).toBe('ATRASADA');
  });
});

describe('Central de Cobranças — FinanceiroService.listCobrancas', () => {
  beforeEach(resetChain);

  it('consulta contas_receber filtrando por tenant', async () => {
    enqueue([{ id: 'c1', valor: 100 }]);
    const { supabase } = await import('@/integrations/supabase/client');
    const resultado = await financeiroService.listCobrancas('tenant-1');
    expect(resultado.error).toBeNull();
    expect(resultado.data).toHaveLength(1);
    expect(supabase.from).toHaveBeenCalledWith('contas_receber');
    expect(hoisted.chain.eq).toHaveBeenCalledWith('empresa_operadora_id', 'tenant-1');
    expect(hoisted.chain.order).toHaveBeenCalledWith('data_vencimento', { ascending: true });
  });

  it('retorna erro estruturado quando a consulta falha', async () => {
    enqueue([], { message: 'boom' });
    const resultado = await financeiroService.listCobrancas();
    expect(resultado.error).toBe('boom');
    expect(resultado.data).toEqual([]);
  });
});

describe('Central de Cobranças — FinanceiroService.createCobranca', () => {
  beforeEach(resetChain);

  it('valida payload sem tocar no banco', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    const r1 = await financeiroService.createCobranca({ empresaOperadoraId: '', contratoId: 'ct', clienteId: 'cl', valor: 10, dataVencimento: '2099-01-01' });
    const r2 = await financeiroService.createCobranca({ empresaOperadoraId: 't', contratoId: '', clienteId: 'cl', valor: 10, dataVencimento: '2099-01-01' });
    const r3 = await financeiroService.createCobranca({ empresaOperadoraId: 't', contratoId: 'ct', clienteId: '', valor: 10, dataVencimento: '2099-01-01' });
    const r4 = await financeiroService.createCobranca({ empresaOperadoraId: 't', contratoId: 'ct', clienteId: 'cl', valor: 0, dataVencimento: '2099-01-01' });
    const r5 = await financeiroService.createCobranca({ empresaOperadoraId: 't', contratoId: 'ct', clienteId: 'cl', valor: 10, dataVencimento: '' });
    expect([r1, r2, r3, r4, r5].every((r) => !r.success && !!r.error)).toBe(true);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('insere em contas_receber com status PENDENTE e parcela padrão', async () => {
    enqueue('COB-2026-000001'); // consumo 1: rpc gerar_numero_documento
    enqueue([{ id: 'novo-id' }]); // consumo 2: insert contas_receber
    const resultado = await financeiroService.createCobranca({
      empresaOperadoraId: 't',
      contratoId: 'ct',
      clienteId: 'cl',
      valor: 250,
      dataVencimento: '2099-02-10',
    });
    expect(resultado.success).toBe(true);
    expect(resultado.cobrancaId).toBe('novo-id');
    expect(hoisted.chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        empresa_operadora_id: 't',
        contrato_id: 'ct',
        cliente_id: 'cl',
        valor: 250,
        data_vencimento: '2099-02-10',
        status: 'PENDENTE',
        numero_parcela: 1,
        total_parcelas: 1,
        codigo_operacional: 'COB-2026-000001',
      })
    );
  });

  it('propaga erro do banco', async () => {
    enqueue('COB-2026-000001'); // consumo 1: rpc gerar_numero_documento
    enqueue(null, { message: 'violacao' }); // consumo 2: insert contas_receber
    const resultado = await financeiroService.createCobranca({
      empresaOperadoraId: 't',
      contratoId: 'ct',
      clienteId: 'cl',
      valor: 250,
      dataVencimento: '2099-02-10',
    });
    expect(resultado.success).toBe(false);
    expect(resultado.error).toContain('violacao');
  });
});

describe('Central de Cobranças — baixa, cancelamento e reabertura', () => {
  beforeEach(resetChain);

  it('marcarComoPaga registra pagamento e atualiza contas_receber para PAGO', async () => {
    enqueue([{ id: 'pag-1' }]);
    enqueue([]);
    const resultado = await financeiroService.marcarComoPaga(
      { id: 'cob-1', valor: 300, contrato_id: 'ct-1', empresa_operadora_id: 't-1' },
      { meioPagamento: 'PIX', usuarioId: 'u-1' }
    );
    expect(resultado.success).toBe(true);
    expect(resultado.pagamentoId).toBe('pag-1');
    expect(hoisted.chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        conta_receber_id: 'cob-1',
        contrato_id: 'ct-1',
        meio_pagamento: 'PIX',
        valor_pago: 300,
      })
    );
    expect(hoisted.chain.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'PAGO' }));
  });

  it('marcarComoPaga desfaz pagamento se a atualização falhar', async () => {
    enqueue([{ id: 'pag-x' }]);
    enqueue([], { message: 'update falhou' });
    const resultado = await financeiroService.marcarComoPaga(
      { id: 'cob-3', valor: 60, contrato_id: null, empresa_operadora_id: null },
      { meioPagamento: 'PIX' }
    );
    expect(resultado.success).toBe(false);
    expect(hoisted.chain.delete).toHaveBeenCalled();
  });

  it('cancelarCobranca atualiza status para CANCELADO', async () => {
    enqueue([]);
    const resultado = await financeiroService.cancelarCobranca('cob-9');
    expect(resultado.success).toBe(true);
    expect(hoisted.chain.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'CANCELADO' }));
    expect(hoisted.chain.eq).toHaveBeenCalledWith('id', 'cob-9');
  });

  it('reabrirCobranca restaura PENDENTE e limpa data_recebimento', async () => {
    enqueue([]);
    const resultado = await financeiroService.reabrirCobranca('cob-10');
    expect(resultado.success).toBe(true);
    expect(hoisted.chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PENDENTE', data_recebimento: null })
    );
  });
});

describe('Central de Cobranças — formatarNomeCliente', () => {
  it('usa nome_fantasia da empresa vinculada', () => {
    const cobranca: any = {
      cliente_id: 'x',
      cliente: { id: 'x', empresas: [{ nome_fantasia: 'Acme', razao_social: 'Acme LTDA' }] },
    };
    expect(formatarNomeCliente(cobranca)).toBe('Acme');
  });

  it('cai para identificador curto sem empresa vinculada', () => {
    const c2: any = { cliente_id: 'abcdefgh-1234', cliente: { id: 'abcdefgh-1234', empresas: [] } };
    expect(formatarNomeCliente(c2)).toBe('Cliente abcdefgh');
  });
});
