import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

let cobrancaAtual: any = null;
let resolverCobranca: ((v: any) => void) | null = null;
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ usuario: { id: 'u1' }, empresaOperadoraId: 't1' }),
}));
vi.mock('@/hooks/useRbac', () => ({
  useRbac: () => ({ isOwner: true, isAdmin: true, role: 'OWNER' }),
}));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/modules/crm/services/financeiro.service', () => ({
  financeiroService: {
    getCobranca: vi.fn(() =>
      new Promise((res) => {
        if (cobrancaAtual) res({ data: cobrancaAtual, error: null });
        else resolverCobranca = res;
      })
    ),
    getHistoricoCobranca: vi.fn(() => Promise.resolve({ eventos: [], jobsCobranca: [] })),
    listarContatosFinanceiros: vi.fn(() => Promise.resolve([])),
    listServicosDeContrato: vi.fn(() => Promise.resolve([
      { item_contrato_id: 'i1', servico_id: 's1', nome: 'Plano de mídia mensal', codigo: null, valor_unitario: 1152, valor_total: 1152, quantidade: 1 },
    ])),
    marcarComoPaga: vi.fn(),
    cancelarCobranca: vi.fn(),
    reabrirCobranca: vi.fn(),
    desbloquearCliente: vi.fn(),
  },
  deriveCobrancaSituacao: vi.fn((status: string) => (status === 'PAGO' || status === 'PAGA' ? 'PAGA' : status === 'CANCELADO' || status === 'CANCELADA' ? 'CANCELADA' : 'ABERTA')),
  formatarNomeCliente: vi.fn((c: any) => c?.cliente?.empresas?.[0]?.nome_fantasia || 'Golden Supermercados'),
}));

import BillingDetailPage from '@/modules/crm/pages/BillingDetailPage';

const COBRANCA_GOLDEN = {
  id: '09d8a6f7-7d2b-4554-82ef-e23bc96ff4b8',
  empresa_operadora_id: 't1',
  contrato_id: 'ct1',
  cliente_id: 'cl1',
  numero_parcela: 1,
  total_parcelas: 1,
  valor: 1152,
  data_vencimento: '2026-08-26',
  data_recebimento: null,
  status: 'PENDENTE',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  numero_documento: null,
  competencia_date: '2026-08-01',
  metodo_cobranca: 'PIX',
  recorrencia: 'AVULSA',
  gerada_automaticamente: false,
  situacao_cobranca: 'NENHUMA',
  valor_pago: 0,
  saldo: 1152,
  notes: null,
  cliente: { id: 'cl1', empresas: [{ nome_fantasia: 'Golden Supermercados', razao_social: null }] },
  contrato: { id: 'ct1', numero_contrato: 'CTR-GOLDEN-7738', tipo_contrato: 'ANUNCIANTE' },
  pagamentos: [],
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/financeiro/cobrancas/09d8a6f7']}>
        <Routes>
          <Route path="/financeiro/cobrancas/:id" element={<BillingDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('BillingDetailPage — regressão React #310 e seção Contas a Receber', () => {
  it('transição loading→dados NÃO altera a ordem de hooks (React #310) e mostra Contas a Receber', async () => {
    cobrancaAtual = null;
    const { container } = renderPage();
    expect(screen.getByText(/Carregando detalhes/i)).toBeInTheDocument();

    cobrancaAtual = COBRANCA_GOLDEN;
    await React.act(async () => {
      resolverCobranca?.({ data: COBRANCA_GOLDEN, error: null });
    });

    await waitFor(() => expect(screen.getByText('Contas a Receber')).toBeInTheDocument(), { timeout: 3000 });

    expect(container.textContent).toContain('Golden Supermercados');
    expect(container.textContent).toContain('CTR-GOLDEN-7738');
    expect(container.textContent).toContain('ANUNCIANTE');
    expect(container.textContent).toContain('Plano de mídia mensal');
    expect(container.textContent).toContain('PIX');
    expect(container.textContent).toContain('PENDENTE');
    expect(container.textContent?.replace(/\u00A0/g, ' ')).toContain('R$ 1.152,00');
    expect(container.textContent).toContain('Saldo em aberto');
    expect(container.textContent).toContain('Valor recebido');
    expect(container.textContent).not.toContain('SYSTEM RECOVERY');
  });
});
