import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

// F-112 — Telas dos pontos parceiros em pastas: uma pasta por estabelecimento, telas separadas, cada uma abre o painel dela.
const ponto = (id: string, nome: string) => ({ id, nome, bairro: 'Centro', cidade: 'Caruaru', foto_url: null });
const tela = (id: string, name: string, pontoId: string, nomePonto: string, extra = {}) => ({
  id, name, custom_id: null, codigo_operacional: `TEL-${id}`, local_instalacao: name.split('· ')[1] ?? null, foto_local_url: null,
  orientation: 'landscape', tamanho_polegadas: 50, status_grade: 'AGUARDANDO_GRADE', last_ping_at: null, bound_device_id: null,
  is_active: true, ponto_id: pontoId, ponto: ponto(pontoId, nomePonto), playlist: null, ...extra,
});
const dados = [
  tela('a2', 'Restaurante Alpha — Tela 2 · Hortifruti', 'p1', 'Restaurante Alpha'),
  tela('a1', 'Restaurante Alpha — Tela 1 · Caixa', 'p1', 'Restaurante Alpha', { playlist: { name: 'Grade do caixa' } }),
  tela('a3', 'Restaurante Alpha — Tela 3 · Salão', 'p1', 'Restaurante Alpha'),
  tela('b1', 'Academia — Tela 1 · Recepção', 'p2', 'Academia'),
];
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order']) q[m] = () => q;
      (q as { then: unknown }).then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: dados, error: null }).then(ok);
      return q;
    },
  },
}));

import { PastasPontosParceiros } from '@/components/screens/PastasPontosParceiros';

function Pagina() {
  const [ponto, setPonto] = useState<string | null>(null);
  return <PastasPontosParceiros pontoId={ponto} onAbrirPonto={setPonto} onVoltar={() => setPonto(null)} />;
}
const abrir = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={['/dashboard/screens']}>
      <Routes>
        <Route path="/dashboard/screens" element={<Pagina />} />
        <Route path="/dashboard/screens/:id" element={<p>painel da tela</p>} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>
);

describe('Pastas dos pontos parceiros (F-112)', () => {
  it('uma pasta por estabelecimento; dentro, cada tela separada e na ordem do nome', async () => {
    abrir();
    const pastas = await screen.findAllByTestId('pasta-ponto');
    expect(pastas.map((p) => p.textContent)).toEqual([expect.stringContaining('Academia'), expect.stringContaining('Restaurante Alpha')]);
    expect(pastas[1].textContent).toContain('3 telas');
    fireEvent.click(pastas[1]);
    const telas = await screen.findAllByTestId('tela-do-ponto');
    expect(telas.map((t) => t.textContent?.match(/Tela \d/)?.[0])).toEqual(['Tela 1', 'Tela 2', 'Tela 3']);
    expect(telas[0].textContent).toContain('Grade do caixa');
    expect(telas[1].textContent).toContain('Aguardando grade');
  });

  it('tocar na Tela 2 abre só o painel dela', async () => {
    abrir();
    fireEvent.click((await screen.findAllByTestId('pasta-ponto'))[1]);
    fireEvent.click((await screen.findAllByTestId('tela-do-ponto'))[1]);
    expect(await screen.findByText('painel da tela')).toBeInTheDocument();
  });
});
