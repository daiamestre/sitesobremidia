import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const COB_GOLDEN = {
  id: '09d8a6f7-7d2b-4554-82ef-e23bc96ff4b8',
  codigo_operacional: 'COB-2026-000030',
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

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ usuario: { id: 'u1' }, empresaOperadoraId: 't1' }) }));
vi.mock('@/hooks/useRbac', () => ({ useRbac: () => ({ isOwner: true, isAdmin: true, role: 'OWNER' }) }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

let resolverCobranca: ((v: any) => void) | null = null;
let cobrancaResolvida = false;
vi.mock('@/modules/crm/services/financeiro.service', () => ({
  financeiroService: {
    getCobranca: vi.fn(() =>
      new Promise((res) => {
        if (cobrancaResolvida) res({ data: COB_GOLDEN, error: null });
        else resolverCobranca = res;
      })
    ),
    getHistoricoCobranca: vi.fn(() => Promise.resolve({ eventos: [], jobsCobranca: [] })),
    listarContatosFinanceiros: vi.fn(() => Promise.resolve([])),
    listServicosDeContrato: vi.fn(() => Promise.resolve([
      { item_contrato_id: 'i1', servico_id: 's1', nome: 'Plano de mídia mensal', codigo: null, valor_unitario: 1152, valor_total: 1152, quantidade: 1 },
    ])),
    marcarComoPaga: vi.fn(), cancelarCobranca: vi.fn(), reabrirCobranca: vi.fn(), desbloquearCliente: vi.fn(),
  },
  deriveCobrancaSituacao: vi.fn((s: string) => (s === 'PENDENTE' ? 'ABERTA' : s === 'ATRASADO' ? 'ATRASADA' : s === 'CANCELADO' || s === 'CANCELADA' ? 'CANCELADA' : s === 'PARCIAL_PAGA' ? 'PARCIAL' : 'ABERTA')),
  formatarNomeCliente: vi.fn((c: any) => c?.cliente?.empresas?.[0]?.nome_fantasia || 'Golden Supermercados'),
  isUuid: (v?: string | null) => !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
  codigoOperacionalCobranca: (c?: any) => c?.codigo_operacional?.trim() || '',
  rotaCobranca: (c: any) => `/financeiro/cobrancas/${encodeURIComponent(c?.codigo_operacional || c?.id)}`,
}));

import BillingDetailPage from '@/modules/crm/pages/BillingDetailPage';

function Montador({ inicial }: { inicial: string }) {
  const loc = useLocation();
  return (
    <>
      <div data-testid="url-atual">{loc.pathname}</div>
      <Routes>
        <Route path="/financeiro/cobrancas/:id" element={<BillingDetailPage />} />
      </Routes>
    </>
  );
}

function renderEm(caminho: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[caminho]}>
        <Montador inicial={caminho} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Central — identificadores operacionais na URL e interface', () => {
  it('URL por código operacional resolve e exibe COB-2026-000030 (não o UUID)', async () => {
    renderEm('/financeiro/cobrancas/COB-2026-000030');
    expect(screen.getByText(/Carregando detalhes/i)).toBeInTheDocument();

    await React.act(async () => {
      resolverCobranca?.({ data: COB_GOLDEN, error: null });
    });

    await waitFor(() => expect(screen.getByText('Contas a Receber')).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText('COB-2026-000030')).toBeInTheDocument();
    // UUID pode existir apenas como área técnica secundária (botão discreto)
    expect(screen.getByTitle(/Identificador técnico interno/i)).toBeInTheDocument();
    expect(document.body.textContent).toContain('Golden Supermercados');
    expect(document.body.textContent).toContain('CTR-GOLDEN-7738');
    expect(document.body.textContent).toContain('PIX');
    expect(document.body.textContent!.replace(/\u00A0/g, ' ')).toContain('R$ 1.152,00');
  });

  it('URL legada por UUID redireciona para a URL do código operacional', async () => {
    renderEm('/financeiro/cobrancas/09d8a6f7-7d2b-4554-82ef-e23bc96ff4b8');
    await React.act(async () => {
      resolverCobranca?.({ data: COB_GOLDEN, error: null });
      cobrancaResolvida = true;
    });
    await waitFor(
      () => expect(screen.getByTestId('url-atual').textContent).toBe('/financeiro/cobrancas/COB-2026-000030'),
      { timeout: 3000 }
    );
    await waitFor(() => expect(screen.getByText('Contas a Receber')).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText('COB-2026-000030')).toBeInTheDocument();
  });
});
