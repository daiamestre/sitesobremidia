import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// F-171 — financeiro conectado: cobranças pagas = entradas, comissões = saídas, um resumo único, Central de Cobranças ligada.
const ler = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const sql = ler('supabase/migrations/20261317_financeiro_conectado.sql');

const rpc = vi.fn();
const linhas = vi.hoisted(() => ({ lista: [] as unknown[] }));
vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  for (const k of ['select', 'neq', 'eq', 'order']) chain[k] = () => chain;
  chain.then = (res: (v: unknown) => unknown) => res({ data: linhas.lista, error: null });
  return { supabase: { rpc: (...a: unknown[]) => rpc(...a), from: () => chain, auth: { getSession: () => Promise.resolve({ data: { session: null } }) } } };
});
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ empresaOperadoraId: 'emp1' }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { ResumoFinanceiro } from '@/modules/crm/components/financeiro/ResumoFinanceiro';
import CashFlowPage from '@/modules/crm/pages/CashFlowPage';
import { financeiroService } from '@/modules/crm/services/financeiro.service';

const RESUMO = {
  status: 'OK', periodo: { inicio: '2026-10-01', fim: '2026-10-08', hoje: '2026-10-08' },
  entradas_realizadas: 4000, saidas_realizadas: 2500, entradas_previstas: 900, saidas_previstas: 1350, saldo_acumulado: 13239.35,
  a_receber: { valor: 151639.89, qtd: 146 }, vencido: { valor: 127128.01, qtd: 98, clientes: 38 },
  a_vencer: { valor: 24511.48, qtd: 48, em_7_dias: 7500, qtd_7_dias: 5 }, inadimplencia_pct: 91.8,
  recebido_total: 11739.35, faturado_total: 163378.84,
  por_mes: [{ mes: '2026-09', entradas: 1827, saidas: 0, previsto: 5000 }, { mes: '2026-10', entradas: 4000, saidas: 2500, previsto: 9000 }],
  devedores: [{ cliente_id: 'c1', nome: 'Restaurante Alpha Premium', qtd: 14, valor: 17820, dias_max: 75 }],
  recebimentos_recentes: [{ descricao: 'Cobrança REC-1', valor: 1208, data: '2026-09-30', cliente_id: 'c9' }],
};

function montar(ui: React.ReactNode, caminho = '/workspace/financeiro') {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[caminho]}>{ui}</MemoryRouter></QueryClientProvider>);
}

beforeEach(() => { rpc.mockReset(); linhas.lista = []; });

describe('Migração 20261317 — fluxo de caixa alimentado pelo banco', () => {
  it('colunas que o código já usava e não existiam; sem duplicar a mesma origem', () => {
    for (const c of ['valor_previsto', 'valor_realizado', 'data_prevista', 'data_realizada', 'origem_tipo', 'origem_id', 'cliente_id']) {
      expect(sql, c).toContain(`ADD COLUMN IF NOT EXISTS ${c}`);
    }
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS ux_fluxo_origem ON public.fluxo_caixa (origem_tipo, origem_id) WHERE origem_id IS NOT NULL;');
  });
  it('cobrança vira entrada (prevista até pagar; realizada ao pagar, nunca acima do valor); cancelada sai do caixa', () => {
    expect(sql).toContain('CREATE TRIGGER tg_fluxo_conta AFTER INSERT OR UPDATE OR DELETE ON public.contas_receber');
    expect(sql).toContain("v_pago := c.status IN ('PAGA', 'PAGO');");
    expect(sql).toContain('least(coalesce(nullif(c.valor_pago, 0), c.valor), c.valor)');
    expect(sql).toContain("CASE WHEN v_cancelada THEN 'CANCELADO' WHEN v_pago THEN 'REALIZADO' ELSE 'PREVISTO' END");
  });
  it('comissão vira saída; lançamento avulso só para quem cuida do financeiro; só avulso se remove', () => {
    expect(sql).toContain('CREATE TRIGGER tg_fluxo_comissao AFTER INSERT OR UPDATE OR DELETE ON public.comissoes');
    expect(sql).toContain("'SAIDA', 'COMISSAO'");
    expect(sql).toContain("IN ('OWNER', 'ADMIN', 'FINANCEIRO', 'GERENTE')");
    expect(sql).toContain("origem_tipo = 'MANUAL'");
  });
  it('"vencido" é calculado pela data (não marca ninguém como atrasado nem bloqueia cliente) e o DRE sai do realizado', () => {
    expect(sql).toContain('venc AS (SELECT * FROM aberta WHERE data_vencimento < v_hoje)');
    expect(sql).not.toMatch(/UPDATE public\.contas_receber SET status/);
    expect(sql).toContain('WITH (security_invoker = true) AS');
    expect(sql).toContain('FROM public.fluxo_caixa f');
  });
  it('o Player não é tocado', () => {
    expect(sql).not.toMatch(/FUNCTION public\.(fn_player_|get_player_)/);
  });
});

describe('Serviço financeiro', () => {
  it('lê o resumo único e devolve nulo sem permissão', async () => {
    rpc.mockResolvedValueOnce({ data: RESUMO, error: null });
    expect((await financeiroService.getResumoFinanceiro('2026-10-01', '2026-10-08'))?.vencido.qtd).toBe(98);
    expect(rpc).toHaveBeenCalledWith('fn_financeiro_resumo', { p_inicio: '2026-10-01', p_fim: '2026-10-08' });
    rpc.mockResolvedValueOnce({ data: { status: 'SEM_PERMISSAO' }, error: null });
    expect(await financeiroService.getResumoFinanceiro()).toBeNull();
  });
  it('lança e remove movimento avulso pelo banco', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    expect((await financeiroService.lancarMovimento({ tipo: 'SAIDA', categoria: 'ALUGUEL', descricao: 'Aluguel', valor: 2500, data: '2026-10-08', realizado: true })).success).toBe(true);
    expect(rpc).toHaveBeenCalledWith('fluxo_caixa_lancar', { p_tipo: 'SAIDA', p_categoria: 'ALUGUEL', p_descricao: 'Aluguel', p_valor: 2500, p_data: '2026-10-08', p_realizado: true });
    expect((await financeiroService.removerMovimento('x')).success).toBe(true);
  });
  it('a gravação antiga com colunas inexistentes saiu', () => {
    const s = ler('src/modules/crm/services/financeiro.service.ts');
    expect(s).not.toContain('valor_previsto: payload.valorOriginal');
    expect(s).toContain("order('data_movimento', { ascending: false })");
  });
});

describe('Visão geral do financeiro', () => {
  it('mostra entradas, saídas, saldo, a receber, vencido e quem está devendo, ligados à Central de Cobranças', async () => {
    rpc.mockResolvedValue({ data: RESUMO, error: null });
    montar(<ResumoFinanceiro />);
    expect((await screen.findByTestId('fin-entradas')).textContent).toContain('4.000,00');
    expect(screen.getByTestId('fin-saidas').textContent).toContain('2.500,00');
    expect(screen.getByTestId('fin-saldo').textContent).toContain('1.500,00');
    expect(screen.getByTestId('fin-a-receber').textContent).toContain('146 cobrança(s)');
    const vencido = screen.getByTestId('fin-vencido');
    expect(vencido.textContent).toContain('98 cobrança(s)');
    expect(vencido.getAttribute('href')).toBe('/workspace/financeiro/cobrancas');
    const devedor = screen.getByTestId('devedor');
    expect(devedor.textContent).toContain('Restaurante Alpha Premium');
    expect(devedor.getAttribute('href')).toBe('/workspace/financeiro/cobrancas?cliente=c1');
  });
  it('trocar o período pede de novo ao banco', async () => {
    rpc.mockResolvedValue({ data: RESUMO, error: null });
    montar(<ResumoFinanceiro />);
    await screen.findByTestId('fin-entradas');
    fireEvent.click(screen.getByTestId('periodo-ano'));
    await waitFor(() => expect(rpc.mock.calls.some(([, a]) => (a as { p_inicio: string }).p_inicio.endsWith('-01-01'))).toBe(true));
  });
  it('sem permissão, explica em vez de mostrar zeros', async () => {
    rpc.mockResolvedValue({ data: { status: 'SEM_PERMISSAO' }, error: null });
    montar(<ResumoFinanceiro />);
    expect(await screen.findByTestId('resumo-indisponivel')).toBeTruthy();
  });
  it('o painel financeiro usa o resumo e não manda Owner/ADM para o menu de representantes', () => {
    const f = ler('src/modules/crm/pages/FinanceDashboard.tsx');
    expect(f).toContain('<ResumoFinanceiro />');
    expect(f).not.toContain("navigate('/representantes/");
  });
  it('a Central de Cobranças abre filtrada no cliente que veio do painel', () => {
    const b = ler('src/modules/crm/pages/BillingDashboard.tsx');
    expect(b).toContain("searchParams.get('cliente')");
  });
});

describe('Fluxo de Caixa', () => {
  const l = (o: Record<string, unknown>) => ({ id: Math.random().toString(), categoria: 'COBRANCA', status: 'REALIZADO', valor_previsto: 100, valor_realizado: 100, data_prevista: '2026-09-30', data_realizada: '2026-09-30', data_movimento: '2026-09-30', origem_tipo: 'CONTA_RECEBER', ...o });

  it('soma realizado e previsto de entradas e saídas', async () => {
    linhas.lista = [
      l({ tipo: 'ENTRADA', descricao: 'Cobrança A', valor_previsto: 1000, valor_realizado: 1000 }),
      l({ tipo: 'ENTRADA', descricao: 'Cobrança B', status: 'PREVISTO', valor_previsto: 500, valor_realizado: 0, data_realizada: null }),
      l({ tipo: 'SAIDA', descricao: 'Comissão X', categoria: 'COMISSAO', origem_tipo: 'COMISSAO', valor_previsto: 300, valor_realizado: 300 }),
      l({ tipo: 'SAIDA', descricao: 'Comissão Y', categoria: 'COMISSAO', origem_tipo: 'COMISSAO', status: 'PREVISTO', valor_previsto: 700, valor_realizado: 0, data_realizada: null }),
    ];
    montar(<CashFlowPage />);
    await screen.findByTestId('totais-fluxo');
    expect(screen.getByTestId('total-entradas').textContent).toContain('1.000,00');
    expect(screen.getByTestId('total-saidas').textContent).toContain('300,00');
    expect(screen.getByTestId('total-saldo').textContent).toContain('700,00');
    expect(screen.getByTestId('total-a-receber').textContent).toContain('500,00');
    expect(screen.getByTestId('total-a-pagar').textContent).toContain('700,00');
    expect(screen.getAllByTestId('linha-fluxo')).toHaveLength(4);
  });

  it('lança uma despesa avulsa pelo banco', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    montar(<CashFlowPage />);
    fireEvent.click(await screen.findByTestId('novo-lancamento'));
    fireEvent.change(await screen.findByTestId('lanc-descricao'), { target: { value: 'Aluguel da sala' } });
    fireEvent.change(screen.getByTestId('lanc-valor'), { target: { value: '2.500,00' } });
    fireEvent.click(screen.getByTestId('salvar-lancamento'));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('fluxo_caixa_lancar', expect.objectContaining({ p_tipo: 'SAIDA', p_descricao: 'Aluguel da sala', p_valor: 2500, p_realizado: true })));
  });

  it('a segunda tela de fluxo é a mesma (uma só verdade)', () => {
    expect(ler('src/modules/crm/pages/CashFlowDashboard.tsx')).toContain("export { default } from './CashFlowPage';");
  });
});

describe('Menu: Central de Cobranças dentro do mesmo painel (sem remontar o menu)', () => {
  it('os menus apontam para a rota do próprio painel', () => {
    expect(ler('src/modules/crm/components/Sidebar.tsx')).toContain('path: `${basePath}/financeiro/cobrancas`');
    expect(ler('src/components/dashboard/Sidebar.tsx')).toContain("path: '/workspace/financeiro/cobrancas'");
  });
});
