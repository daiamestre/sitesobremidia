import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─────────────────────────────────────────────────────────────────────
// Mock do serviço financeiro (padrão billing-detail-page.render.test.tsx)
// ─────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cobrancaAtual: any = null;

const cobrancaGolden = {
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
  codigo_operacional: 'COB-2026-000184',
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

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ usuario: { id: 'u1' }, empresaOperadoraId: 't1' }),
}));
vi.mock('@/hooks/useRbac', () => ({
  useRbac: () => ({ isOwner: true, isAdmin: true, role: 'OWNER' }),
}));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

vi.mock('@/modules/crm/services/financeiro.service', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/modules/crm/services/financeiro.service')>();
  return {
    ...original,
    financeiroService: {
      getCobranca: vi.fn(() => Promise.resolve({ data: cobrancaAtual, error: null })),
      getHistoricoCobranca: vi.fn(() => Promise.resolve({ eventos: [], jobsCobranca: [] })),
      listarContatosFinanceiros: vi.fn(() => Promise.resolve([])),
      listServicosDeContrato: vi.fn(() => Promise.resolve([])),
      listCobrancas: vi.fn(() => Promise.resolve({ data: cobrancaAtual ? [cobrancaAtual] : [], error: null })),
      contarBloqueados: vi.fn(() => Promise.resolve(0)),
      listTiposContrato: vi.fn(() => Promise.resolve([])),
      listContratosResumo: vi.fn(() => Promise.resolve([])),
      processarReguaCobranca: vi.fn(),
      marcarComoPaga: vi.fn(),
      cancelarCobranca: vi.fn(),
      reabrirCobranca: vi.fn(),
      desbloquearCliente: vi.fn(),
    },
    deriveCobrancaSituacao: original.deriveCobrancaSituacao,
    formatarNomeCliente: original.formatarNomeCliente,
  };
});

import BillingDetailPage from '@/modules/crm/pages/BillingDetailPage';
import BillingDashboard from '@/modules/crm/pages/BillingDashboard';
import { isUuid, rotaCobranca, codigoOperacionalCobranca } from '@/modules/crm/services/financeiro.service';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

const renderRoutes = (initialEntry: string) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/financeiro/cobrancas/:id"
            element={
              <>
                <BillingDetailPage />
                <LocationProbe />
              </>
            }
          />
          <Route
            path="/financeiro/cobrancas"
            element={
              <>
                <BillingDashboard />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('Identificadores operacionais — helpers puros', () => {
  it('isUuid reconhece UUID v4 e rejeita código operacional', () => {
    expect(isUuid('09d8a6f7-7d2b-4554-82ef-e23bc96ff4b8')).toBe(true);
    expect(isUuid('COB-2026-000184')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid(null)).toBe(false);
  });

  it('rotaCobranca prioriza o código operacional e cai para UUID apenas como fallback', () => {
    expect(rotaCobranca({ id: 'uuid-1', codigo_operacional: 'COB-2026-000184' })).toBe('/financeiro/cobrancas/COB-2026-000184');
    expect(rotaCobranca({ id: 'uuid-1', codigo_operacional: null })).toBe('/financeiro/cobrancas/uuid-1');
  });

  it('codigoOperacionalCobranca nunca devolve UUID', () => {
    expect(codigoOperacionalCobranca({ id: 'u1', codigo_operacional: ' COB-2026-000001 ' })).toBe('COB-2026-000001');
    expect(codigoOperacionalCobranca({ id: 'u1', codigo_operacional: null })).toBe('');
    expect(codigoOperacionalCobranca(null)).toBe('');
  });
});

describe('BillingDetailPage — URL legada (UUID) redireciona para URL do código', () => {
  it('reconhece UUID na URL, resolve a cobrança e redireciona com replace', async () => {
    cobrancaAtual = cobrancaGolden;
    renderRoutes('/financeiro/cobrancas/09d8a6f7-7d2b-4554-82ef-e23bc96ff4b8');

    await waitFor(
      () =>
        expect(screen.getByTestId('location-probe').textContent).toBe('/financeiro/cobrancas/COB-2026-000184'),
      { timeout: 3000 }
    );

    await waitFor(() => expect(screen.getByText('Contas a Receber')).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getAllByText('COB-2026-000184').length).toBeGreaterThan(0);
    // UUID completo jamais aparece na interface
    expect(screen.queryByText(/09d8a6f7-7d2b-4554-82ef-e23bc96ff4b8/)).not.toBeInTheDocument();
  });
});

describe('BillingDetailPage — URL nova (código) resolve e renderiza sem redirect', () => {
  it('carrega a cobrança pela URL /financeiro/cobrancas/COB-2026-000184', async () => {
    cobrancaAtual = cobrancaGolden;
    renderRoutes('/financeiro/cobrancas/COB-2026-000184');

    await waitFor(() => expect(screen.getByText('Contas a Receber')).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByTestId('location-probe').textContent).toBe('/financeiro/cobrancas/COB-2026-000184');
    expect(screen.getByText('CTR-GOLDEN-7738')).toBeInTheDocument();
    expect(screen.getAllByText(/R\$ 1\.152,00/).length).toBeGreaterThan(0);
  });
});

describe('Central de Cobranças — navegação usa o código operacional', () => {
  it('clique na cobrança navega para /financeiro/cobrancas/COB-2026-XXXXXX', async () => {
    const user = userEvent.setup();
    cobrancaAtual = cobrancaGolden;
    renderRoutes('/financeiro/cobrancas');

    await waitFor(() => expect(screen.getAllByText('Golden Supermercados').length).toBeGreaterThan(0), { timeout: 3000 });

    await user.click(screen.getAllByText('Golden Supermercados')[0]);

    expect(screen.getByTestId('location-probe').textContent).toBe('/financeiro/cobrancas/COB-2026-000184');
  });
});
