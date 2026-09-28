import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// F-110 — a fatura pública mostrava o vencimento um dia antes no Brasil:
// "2026-10-01" era lido como meia-noite UTC (= 30/09 às 21h em Brasília).
const fatura = {
  id: 'f1', codigo_operacional: 'COB-2026-002487', public_identifier: 'COB-49Z5M5XF',
  competencia: '2026-10-01', vencimento: '2026-10-01', valor_original: 149.9, valor_pago: 0, saldo: 149.9,
  status: 'PENDENTE', numero_parcela: 1, total_parcelas: 1, metodo: 'PIX', metodos_gateway: ['PIX', 'BOLETO'],
  recorrencia: 'AVULSA', billing_origin_type: 'ANUNCIANTE', establishment_name: 'Restaurante Alpha Premium',
  establishment_slug: 'restaurante-alpha-premium', invoice_month: 10, invoice_year: 2026,
  service_name: 'Aluguel de Software de Mídia', servico_faturado: 'Aluguel de Software de Mídia',
  cliente_nome: 'Restaurante Alpha Premium', empresa_nome: 'Sobre Mídia Designer Ltda', pagamentos: [],
};
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn(async () => ({ data: fatura, error: null })) },
}));

import PaginaCobranca from '@/pages/PaginaCobranca';

describe('Fatura pública — datas no fuso local (F-110)', () => {
  it('vencimento 2026-10-01 aparece como 01/10/2026 e competência OUTUBRO', async () => {
    vi.useFakeTimers({ now: new Date(2026, 8, 28, 22, 0), shouldAdvanceTime: true });
    render(
      <MemoryRouter initialEntries={['/cobranca/COB-2026-002487/COB-49Z5M5XF']}>
        <Routes><Route path="/cobranca/:codigo/:identificador" element={<PaginaCobranca />} /><Route path="*" element={<PaginaCobranca />} /></Routes>
      </MemoryRouter>
    );
    expect((await screen.findAllByText('01/10/2026')).length).toBeGreaterThan(0);
    expect(screen.queryByText('30/09/2026')).toBeNull();
    expect(screen.getByText(/OUTUBRO \/ 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/ATRASADA/)).toBeNull();
    vi.useRealTimers();
  });
});
