import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// F-107 — ficha do ponto parceiro, "Anunciar aqui" e "Crie sua primeira mídia".
const ponto = {
  id: 'p1', nome: 'Farmácia Capital do Agreste', categoria: 'Farmácia', descricao: 'Farmácia no Centro.',
  foto_url: 'https://x/capa.jpg',
  galeria: [{ url: 'https://x/capa.jpg', legenda: 'Fachada', credito: 'Foto: X / Pexels' }, { url: 'https://x/balcao.jpg', legenda: 'Balcão de atendimento', credito: 'Foto: Y / Pexels' }],
  onde_ficam_as_telas: [{ local: 'Balcão de atendimento', detalhe: 'Tela de 43 polegadas.' }],
  cep: '55002-000', logradouro: 'Rua Duque de Caxias', numero: '412', complemento: null, bairro: 'Centro', cidade: 'Caruaru', estado: 'PE',
  latitude: -8.28307, longitude: -35.97571, horario_funcionamento: 'Seg a sáb, 7h às 22h', publico_estimado_dia: 900,
  valor_anuncio: 149.9, periodicidade: 'MENSAL', quantidade_telas: 2, regras_comerciais: null,
  telas_conectadas: 0, telas_online: 0, meus_anuncios: [],
};
let midias: unknown[] = [];
const rpc = vi.fn(async (fn: string) => (fn === 'portal_ponto_parceiro' ? { data: ponto, error: null } : { data: { status: 'OK', telas_no_ponto: 0 }, error: null }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, a?: unknown) => rpc(fn, a),
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'not', 'order']) q[m] = () => q;
      (q as { then: unknown }).then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: midias, error: null }).then(ok);
      return q;
    },
  },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ usuario: { id: 'u1', cliente_id: 'c1' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import PontoParceiroPage from '@/modules/crm/pages/portal/PontoParceiroPage';

const abrir = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={['/portal/pontos-parceiros/p1']}>
      <Routes>
        <Route path="/portal/pontos-parceiros/:id" element={<PontoParceiroPage />} />
        <Route path="/portal/criar-midia" element={<p>tela de criação</p>} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>
);

describe('Ponto parceiro no portal (F-107)', () => {
  beforeEach(() => { rpc.mockClear(); midias = []; });

  it('mostra capa, endereço, mapa e informações', async () => {
    abrir();
    expect(await screen.findByText('Farmácia Capital do Agreste')).toBeInTheDocument();
    expect(screen.getByTitle(/Mapa de Farmácia Capital do Agreste/)).toHaveAttribute('src', expect.stringContaining('openstreetmap.org'));
    expect(screen.getByText(/~900 pessoas/)).toBeInTheDocument();
    expect(screen.getByText(/Foto: X \/ Pexels/)).toBeInTheDocument();
  });

  it('F-108: galeria dos locais e onde ficam as telas', async () => {
    abrir();
    const g = await screen.findByTestId('galeria-do-ponto');
    expect(g.querySelectorAll('img')).toHaveLength(2);
    expect(screen.getByTestId('onde-ficam-as-telas').textContent).toContain('Tela 1 · Balcão de atendimento');
  });

  it('sem mídia: avisa e leva para "Crie sua primeira mídia"', async () => {
    abrir();
    fireEvent.click(await screen.findByTestId('botao-anunciar-aqui'));
    expect(await screen.findByText('Você ainda não tem mídias para anúncios criadas.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Crie sua primeira mídia/ }));
    expect(await screen.findByText('tela de criação')).toBeInTheDocument();
  });

  it('com mídia: escolhe e chama anunciar_no_ponto', async () => {
    midias = [{ id: 'a1', nome: 'Promo', tipo: 'imagem', object_url: 'https://x/promo.jpg' }];
    abrir();
    fireEvent.click(await screen.findByTestId('botao-anunciar-aqui'));
    fireEvent.click(await screen.findByText('Promo'));
    fireEvent.click(screen.getByRole('button', { name: /Colocar no ar neste ponto/ }));
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledWith('anunciar_no_ponto', { p_ponto: 'p1', p_asset: 'a1' }));
  });

  it('banco: só imagem/vídeo; Player recebe anúncios só em tela com ponto_id; mesmo formato de mídia', () => {
    const sql = readFileSync(path.join(process.cwd(), 'supabase', 'migrations', '20261276_pontos_parceiros_anunciar.sql'), 'utf8');
    expect(sql).toContain("v_asset.tipo NOT IN ('imagem', 'video')");
    expect(sql).toContain('WHERE v_screen.ponto_id IS NOT NULL');
    expect(sql).toContain("AND pa.status = 'ATIVO'");
  });
});
