import { describe, it, expect, vi, beforeEach } from 'vitest';
import { financeiroService, deriveCobrancaSituacao } from '@/modules/crm/services/financeiro.service';

const rpc = vi.fn();
const chain = {
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  contains: vi.fn().mockReturnThis(),
  like: vi.fn().mockReturnThis(),
  not: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  single: vi.fn().mockResolvedValue({ data: { id: 'cob-1' }, error: null }),
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => chain),
    rpc: (...a: any[]) => rpc(...a),
  },
}));

describe('Central de Cobranças v2 — deriveCobrancaSituacao (legados e novos)', () => {
  it('mantém compatibilidade com status legados', () => {
    expect(deriveCobrancaSituacao('PENDENTE', '2099-01-01')).toBe('ABERTA');
    expect(deriveCobrancaSituacao('PAGO', '2020-01-01')).toBe('PAGA');
    expect(deriveCobrancaSituacao('ATRASADO', '2020-01-01')).toBe('ATRASADA');
    expect(deriveCobrancaSituacao('CANCELADO', '2020-01-01')).toBe('CANCELADA');
    expect(deriveCobrancaSituacao('PARCIAL_PAGA', '2020-01-01')).toBe('PARCIAL');
  });

  it('deriva VENCENDO_HOJE e ATRASADA por data', () => {
    const hoje = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1);
    expect(deriveCobrancaSituacao('PENDENTE', iso(hoje))).toBe('VENCENDO_HOJE');
    expect(deriveCobrancaSituacao('PENDENTE', iso(ontem))).toBe('ATRASADA');
  });
});

describe('Central de Cobranças v2 — régua e histórico via RPC/tabelas reais', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('processarReguaCobranca delega ao RPC com tenant informado', async () => {
    rpc.mockResolvedValueOnce({ data: { recorrencia: { cobrancas_geradas: 2 }, estagios_avancados: 1 }, error: null });
    const r = await financeiroService.processarReguaCobranca('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(r.success).toBe(true);
    expect(rpc).toHaveBeenCalledWith('processar_regua_cobranca', { p_empresa_operadora_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
  });

  it('processarReguaCobranca aceita tenant nulo (todas as operadoras)', async () => {
    rpc.mockResolvedValueOnce({ data: {}, error: null });
    await financeiroService.processarReguaCobranca(undefined);
    expect(rpc).toHaveBeenCalledWith('processar_regua_cobranca', { p_empresa_operadora_id: null });
  });

  it('createCobranca envia campos v2 (competência, método, recorrência)', async () => {
    chain.insert.mockClear();
    await financeiroService.createCobranca({
      empresaOperadoraId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      clienteId: 'c1',
      contratoId: 'ct1',
      valor: 2000,
      dataVencimento: '2026-09-10',
      competenciaDate: '2026-09-01',
      metodoCobranca: 'PIX',
      recorrencia: 'MENSAL',
      descricao: 'Plano de mídia mensal',
    });
    const payload = chain.insert.mock.calls[0][0];
    expect(payload.competencia_date).toBe('2026-09-01');
    expect(payload.metodo_cobranca).toBe('PIX');
    expect(payload.recorrencia).toBe('MENSAL');
    expect(payload.notes).toBe('Plano de mídia mensal');
    expect(payload.status).toBe('PENDENTE');
  });

  it('desbloquearCliente interpreta retorno do RPC', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true }, error: null });
    const ok = await financeiroService.desbloquearCliente('c1');
    expect(ok.success).toBe(true);

    rpc.mockResolvedValueOnce({ data: { ok: false, erro: 'cliente_nao_estava_bloqueado' }, error: null });
    const nao = await financeiroService.desbloquearCliente('c2');
    expect(nao.success).toBe(false);
  });

  it('getHistoricoCobranca agrega auditoria, pagamentos e jobs COLECTION', async () => {
    chain.single.mockImplementation(async () => ({ data: [], error: null }));
    let call = 0;
    chain.contains.mockImplementation(() => { call++; return chain; });
    const h = await financeiroService.getHistoricoCobranca('cob-9');
    expect(h).toHaveProperty('eventos');
    expect(h).toHaveProperty('jobsCobranca');
    expect(Array.isArray(h.eventos)).toBe(true);
  });
});
