import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cardsDoPerfil, filtrarAlertas, type Alerta } from '@/lib/dashboardResumo';
import { montarAlertasRepresentante, type ResumoRepresentante } from '@/lib/dashboardResumoRepresentante';
import { montarAlertasGestor, type ResumoGestor } from '@/lib/dashboardResumoGestor';

const REP: ResumoRepresentante = {
  status: 'OK', gerado_em: '2026-09-25T15:00:00Z', parametros: { dias_vencer: 7 },
  propostas: { rascunho: 20, aprovadas: 0, mes: 0, paradas: [{ id: 'p1', titulo: 'Campanha X', cliente: 'Cliente A', valor: 1000, criada_em: '2026-09-01T00:00:00Z' }] },
  contratos: { aguardando_assinatura: 2, aguardando_pagamento: 0, ativos: 1, pendentes: [], terminam_30d: [] },
  cobrancas: { vencidas_qtd: 1, vencidas_total: 300, vencendo_qtd: 0, vencendo_total: 0, itens: [{ id: 'c1', cliente: 'Cliente A', valor: 300, data_vencimento: '2026-09-01', dias_atraso: 24 }] },
  clientes: { total: 21, novos_mes: 0, recentes: [{ id: 'cl1', nome: 'Cliente A', criado_em: '2026-09-01T00:00:00Z' }] },
  agenda_hoje: [],
};

const GESTOR: ResumoGestor = {
  status: 'OK', gerado_em: '2026-09-25T15:00:00Z', parametros: { offline_min: 10 },
  telas: { total: 3, online: 1, offline: 2, sem_playlist: 1, offline_itens: [{ id: 's1', nome: 'Tela Loja', local: 'SP', ultimo_sinal: null }], sem_playlist_itens: [{ id: 's2', nome: 'Tela Vazia' }] },
  exibicoes: { hoje: 0, semana: 10, serie_7d: [{ dia: '2026-09-25', total: 0 }] },
  playlists: { total: 12, em_uso: 2, itens_agendados: 0, recentes: [{ id: 'pl1', nome: 'Principal', alterada_em: '2026-09-25T10:00:00Z', itens: 5 }] },
  midias: { total: 10, videos: 5, imagens: 5, semana: 0, recentes: [{ id: 'm1', nome: 'Vídeo A', tipo: 'video', duration_ms: 17764, enviada_em: '2026-09-20T00:00:00Z' }] },
};

describe('Central do Dia — o que cada perfil vê', () => {
  it('Financeiro vê só a área financeira; Supervisor a operação; Owner/Admin tudo', () => {
    expect([...cardsDoPerfil('FINANCEIRO')].sort()).toEqual(['aprovacoes', 'atividade', 'cobrancas', 'financeiro']);
    expect(cardsDoPerfil('SUPERVISOR').has('financeiro')).toBe(false);
    expect(cardsDoPerfil('SUPERVISOR').has('telas')).toBe(true);
    expect(cardsDoPerfil('OWNER').size).toBe(9);
    expect(cardsDoPerfil('ADMIN').size).toBe(9);
    expect(cardsDoPerfil(null).size).toBe(9);
  });

  it('alertas seguem os cards do perfil (mensagens valem para todos)', () => {
    const alertas: Alerta[] = [
      { id: 'telas', nivel: 'critico', titulo: '', detalhe: '', link: '' },
      { id: 'vencidas', nivel: 'critico', titulo: '', detalhe: '', link: '' },
      { id: 'mensagens', nivel: 'atencao', titulo: '', detalhe: '', link: '' },
    ];
    expect(filtrarAlertas(alertas, cardsDoPerfil('FINANCEIRO')).map((a) => a.id)).toEqual(['vencidas', 'mensagens']);
    expect(filtrarAlertas(alertas, cardsDoPerfil('SUPERVISOR')).map((a) => a.id)).toEqual(['telas', 'mensagens']);
    expect(filtrarAlertas([alertas[0]], cardsDoPerfil('FINANCEIRO'))[0].id).toBe('tudo-ok');
  });

  it('Representante: cobrança vencida da carteira é crítica; rascunhos e assinaturas pedem ação', () => {
    const a = montarAlertasRepresentante(REP, 3);
    expect(a.map((x) => x.id)).toEqual(['vencidas', 'assinatura', 'rascunhos', 'mensagens']);
    expect(a[0]).toMatchObject({ nivel: 'critico', link: '/representantes/financeiro/recebiveis' });
    expect(a[1]).toMatchObject({ titulo: '2 contratos aguardando assinatura', link: '/representantes/contratos' });
    expect(a[2]).toMatchObject({ titulo: '20 propostas em rascunho', link: '/representantes/propostas' });
  });

  it('Gestor: telas offline, sem playlist e dia sem exibição viram alerta', () => {
    const a = montarAlertasGestor(GESTOR, 0);
    expect(a.map((x) => x.id)).toEqual(['telas', 'sem-playlist', 'sem-exibicao']);
    expect(a[0]).toMatchObject({ titulo: '2 de 3 telas offline', link: '/dashboard/screens' });
  });
});

// ------------------------------------------------------------------ render dos painéis por perfil

vi.mock('@/hooks/useCentral', () => ({ useCentralUnread: () => ({ total: 0 }) }));
vi.mock('@/lib/dashboardResumoRepresentante', async () => {
  const actual = await vi.importActual<typeof import('@/lib/dashboardResumoRepresentante')>('@/lib/dashboardResumoRepresentante');
  return { ...actual, fetchResumoRepresentante: vi.fn(async () => REP) };
});
vi.mock('@/lib/dashboardResumoGestor', async () => {
  const actual = await vi.importActual<typeof import('@/lib/dashboardResumoGestor')>('@/lib/dashboardResumoGestor');
  return { ...actual, fetchResumoGestor: vi.fn(async () => GESTOR) };
});
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(async (fn: string) => fn === 'fn_dashboard_resumo_anunciante'
      ? { data: { status: 'OK', parametros: { dias_vencer: 7 }, faturas: { vencidas_qtd: 1, vencidas_total: 450, abertas_qtd: 0, abertas_total: 0, vencendo_qtd: 0, itens: [{ id: 'f1', valor: 450, data_vencimento: '2026-09-01', codigo: 'COB-9', dias_atraso: 24 }] }, campanhas: { no_ar: 0, proximas: [] } }, error: null }
      : { data: null, error: null }),
  },
}));

import { CentralDoDiaRepresentante } from '@/components/central/CentralDoDiaRepresentante';
import { CentralDoDiaGestor } from '@/components/central/CentralDoDiaGestor';
import { CentralDoDiaAnunciante } from '@/components/central/CentralDoDiaAnunciante';

const wrap = (ui: React.ReactNode) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{ui}</MemoryRouter>
  </QueryClientProvider>
);

describe('Painéis por perfil: cada card leva à tela completa do próprio portal', () => {
  beforeAll(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); });

  it('Representante', async () => {
    wrap(<CentralDoDiaRepresentante />);
    const destinos = { 'rep-card-propostas': '/representantes/propostas', 'rep-card-contratos': '/representantes/contratos', 'rep-card-cobrancas': '/representantes/financeiro/recebiveis', 'rep-card-clientes': '/representantes/clientes', 'rep-card-agenda': '/representantes/agenda' };
    for (const [id, href] of Object.entries(destinos)) {
      const card = await screen.findByTestId(id);
      expect(within(card).getAllByRole('link')[0]).toHaveAttribute('href', href);
    }
    await waitFor(() => expect(within(screen.getByTestId('rep-card-clientes')).getByText('Cliente A').closest('a')).toHaveAttribute('href', '/representantes/clientes/cl1'));
  });

  it('Gestor', async () => {
    wrap(<CentralDoDiaGestor />);
    const destinos = { 'gestor-card-telas': '/dashboard/screens', 'gestor-card-exibicoes': '/dashboard/analytics', 'gestor-card-playlists': '/dashboard/playlists', 'gestor-card-midias': '/dashboard/medias' };
    for (const [id, href] of Object.entries(destinos)) {
      const card = await screen.findByTestId(id);
      expect(within(card).getAllByRole('link')[0]).toHaveAttribute('href', href);
    }
    await waitFor(() => expect(within(screen.getByTestId('gestor-card-telas')).getByText('Tela Loja').closest('a')).toHaveAttribute('href', '/dashboard/screens/s1'));
    expect(within(screen.getByTestId('gestor-card-midias')).getByText('17,764 s')).toBeInTheDocument();
  });

  it('Anunciante: fatura vencida vira alerta crítico e o card leva a Contratos e Faturas', async () => {
    wrap(<CentralDoDiaAnunciante naoLidas={0} />);
    const alerta = await screen.findByTestId('alerta-faturas-vencidas');
    expect(alerta).toHaveAttribute('href', '/portal/financeiro');
    expect(alerta.textContent).toContain('1 fatura vencida');
    const card = screen.getByTestId('anu-card-faturas');
    expect(within(card).getAllByRole('link')[0]).toHaveAttribute('href', '/portal/financeiro');
    expect(within(card).getByText('COB-9')).toBeInTheDocument();
  });
});
