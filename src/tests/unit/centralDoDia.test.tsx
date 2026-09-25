import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { montarAlertas, rotuloStatus, tempoDesde, diaMes, formatBRLCompacto, type ResumoOwner } from '@/lib/dashboardResumo';
import { SummaryCard, SummaryRow } from '@/components/central/SummaryCard';

const RESUMO: ResumoOwner = {
  status: 'OK',
  gerado_em: '2026-09-25T15:00:00Z',
  parametros: { offline_min: 10, dias_vencer: 7 },
  telas: {
    total: 10, online: 1, offline: 9, sem_playlist: 3,
    offline_itens: [
      { id: 't1', nome: 'Tela Academia', cidade: 'Manaus', ultimo_sinal: '2026-09-25T12:00:00Z' },
      { id: 't2', nome: 'Tela Hotel', cidade: null, ultimo_sinal: null },
      { id: 't3', nome: 'Tela 3', cidade: null, ultimo_sinal: null },
      { id: 't4', nome: 'Tela 4 extra', cidade: null, ultimo_sinal: null },
    ],
  },
  cobrancas: {
    vencidas: { qtd: 84, total: 88948.99, itens: [{ id: 'c1', cliente: 'Restaurante Alpha', valor: 100, data_vencimento: '2026-07-25', dias: 62, codigo: 'COB-1' }] },
    vencendo: { qtd: 11, total: 31623.02, itens: [{ id: 'c2', cliente: 'Loja Beta', valor: 500, data_vencimento: '2026-09-27', dias: 2, codigo: 'COB-2' }] },
  },
  financeiro: { recebido_mes: 1, previsto_mes: 64514.52, a_receber: 155127.49, vencido_total: 88948.99, serie_30d: [{ dia: '2026-09-25', recebido: 0 }] },
  comercial: {
    propostas_rascunho: 130, propostas_enviadas: 0, propostas_aprovadas: 20, propostas_mes: 41,
    contratos_aguardando_assinatura: 12, contratos_aguardando_pagamento: 48, contratos_ativos: 7, contratos_a_vencer: [],
  },
  aprovacoes: { pendentes: 1, itens: [{ id: 's1', titulo: 'Novo usuário', tipo: 'ACESSO', criada_em: '2026-09-24T10:00:00Z' }] },
  agenda_hoje: [],
  atividade: [{ tipo: 'PROPOSTA', id: 'p1', titulo: 'Campanha exclusiva', detalhe: 'DRAFT', quando: '2026-09-15T07:38:44Z' }],
};

describe('Central do Dia — regras', () => {
  it('alertas do topo: críticos primeiro, cada um com o link da tela onde se resolve', () => {
    const a = montarAlertas(RESUMO, 11);
    expect(a.map((x) => x.id)).toEqual(['telas', 'vencidas', 'vencendo', 'aprovacoes', 'mensagens']);
    expect(a[0]).toMatchObject({ nivel: 'critico', titulo: '9 de 10 telas offline', link: '/workspace/screens' });
    expect(a[1]).toMatchObject({ nivel: 'critico', titulo: '84 cobranças vencidas', link: '/workspace/financeiro/cobrancas' });
    expect(a[1].detalhe).toContain('88.948,99');
    expect(a[2]).toMatchObject({ nivel: 'atencao', titulo: '11 vencem em 7 dias' });
    expect(a[3]).toMatchObject({ titulo: '1 aprovação pendente', link: '/admin/solicitacoes/s1' });
    expect(a[4]).toMatchObject({ titulo: '11 mensagens não lidas', link: '/workspace/central' });
  });

  it('sem pendências: um único alerta "Tudo em dia"', () => {
    const limpo: ResumoOwner = {
      ...RESUMO,
      telas: { ...RESUMO.telas, offline: 0, offline_itens: [] },
      cobrancas: { vencidas: { qtd: 0, total: 0, itens: [] }, vencendo: { qtd: 0, total: 0, itens: [] } },
      aprovacoes: { pendentes: 0, itens: [] },
    };
    const a = montarAlertas(limpo, 0);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ nivel: 'ok', titulo: 'Tudo em dia' });
  });

  it('formatação', () => {
    const agora = new Date('2026-09-25T15:00:00Z');
    expect(tempoDesde('2026-09-25T14:55:00Z', agora)).toBe('há 5 min');
    expect(tempoDesde('2026-09-25T12:00:00Z', agora)).toBe('há 3 h');
    expect(tempoDesde('2026-09-23T15:00:00Z', agora)).toBe('há 2 dias');
    expect(tempoDesde(null, agora)).toBe('nunca');
    expect(diaMes('2026-07-25')).toBe('25/07');
    expect(rotuloStatus('DRAFT')).toBe('Rascunho');
    expect(rotuloStatus('AGUARDANDO_PAGAMENTO')).toBe('Aguardando pagamento');
    expect(rotuloStatus('ALGO_NOVO')).toBe('Algo novo');
    expect(formatBRLCompacto(88948.99)).toContain('mil');
    expect(formatBRLCompacto(500)).toContain('500,00');
  });
});

describe('SummaryCard — resumo que expande e leva à tela completa', () => {
  it('cabeçalho leva à tela completa; Expandir mostra mais itens sem sair da tela', () => {
    render(
      <MemoryRouter>
        <SummaryCard title="Financeiro do mês" icon={Wallet} to="/workspace/financeiro" headline="R$ 10,00"
          expanded={<ul><SummaryRow label="Linha extra" value="R$ 1,00" /></ul>}>
          <p>resumo</p>
        </SummaryCard>
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Financeiro do mês — abrir tela completa' })).toHaveAttribute('href', '/workspace/financeiro');
    expect(screen.queryByText('Linha extra')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Expandir/ }));
    expect(screen.getByText('Linha extra')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Recolher/ })).toHaveAttribute('aria-expanded', 'true');
  });
});

// ------------------------------------------------------------------ tela completa com dados simulados

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ usuario: { nome: 'Sobre Mídia ADM' }, user: { email: 'a@b.com' } }) }));
vi.mock('@/hooks/useCentral', () => ({ useCentralUnread: () => ({ total: 11 }) }));
vi.mock('@/lib/playbackStats', () => ({
  fetchPlaybackStats: vi.fn(async () => [{ name: '24/09', value: 1093 }, { name: '25/09', value: 5164 }]),
}));
vi.mock('@/services/representantesGerencia.service', () => ({
  representantesGerenciaService: {
    obterDesempenho: vi.fn(async () => [
      { representante_id: 'r1', nome: 'Ana', ativo: true, receita_mensal: 5000, contratos_fechados: 3, propostas_criadas: 9, meta_mensal: 4000, meta_realizado: 5000 },
      { representante_id: 'r2', nome: 'Bruno', ativo: true, receita_mensal: 9000, contratos_fechados: 5, propostas_criadas: 12, meta_mensal: 0, meta_realizado: 0 },
      { representante_id: 'r3', nome: 'Inativo', ativo: false, receita_mensal: 99999, contratos_fechados: 0, propostas_criadas: 0, meta_mensal: 0, meta_realizado: 0 },
    ]),
  },
}));
vi.mock('@/lib/dashboardResumo', async () => {
  const actual = await vi.importActual<typeof import('@/lib/dashboardResumo')>('@/lib/dashboardResumo');
  return { ...actual, fetchResumoOwner: vi.fn(async () => RESUMO) };
});

import CorporateCommandCenter from '@/modules/corporate/pages/CorporateCommandCenter';

describe('CorporateCommandCenter (Central do Dia do Owner/Admin)', () => {
  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  });

  it('mostra alertas, resumos reais e cada card leva para a sua tela', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter><CorporateCommandCenter /></MemoryRouter>
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.getByTestId('alerta-telas')).toBeInTheDocument());
    expect(screen.getByTestId('alerta-telas')).toHaveAttribute('href', '/workspace/screens');

    const destinos: Record<string, string> = {
      'card-financeiro': '/workspace/financeiro',
      'card-cobrancas': '/workspace/financeiro/cobrancas',
      'card-telas': '/workspace/screens',
      'card-representantes': '/workspace/representantes/desempenho',
      'card-comercial': '/workspace/propostas',
      'card-exibicoes': '/workspace/bi',
      'card-agenda': '/workspace/agenda',
      'card-aprovacoes': '/workspace/central',
      'card-atividade': '/workspace/contratos',
    };
    for (const [id, href] of Object.entries(destinos)) {
      const card = await screen.findByTestId(id);
      expect(within(card).getAllByRole('link')[0]).toHaveAttribute('href', href);
    }

    // cobrança vencida clicável até o registro
    const cob = screen.getByTestId('card-cobrancas');
    expect(within(cob).getByText('Restaurante Alpha').closest('a')).toHaveAttribute('href', '/workspace/financeiro/cobrancas/c1');
    // tela offline clicável até a tela
    expect(within(screen.getByTestId('card-telas')).getByText('Tela Academia').closest('a')).toHaveAttribute('href', '/workspace/screens/t1');
    // ranking: por receita, sem inativos
    const reps = await screen.findByTestId('card-representantes');
    await waitFor(() => expect(within(reps).getByText('1º Bruno')).toBeInTheDocument());
    expect(within(reps).getByText('2º Ana')).toBeInTheDocument();
    expect(within(reps).queryByText(/Inativo/)).toBeNull();
    // exibições de hoje
    await waitFor(() => expect(within(screen.getByTestId('card-exibicoes')).getByText('5.164')).toBeInTheDocument());
    // status em português
    expect(within(screen.getByTestId('card-atividade')).getByText(/Rascunho/)).toBeInTheDocument();
    // a 4ª tela offline só aparece ao expandir
    const telas = screen.getByTestId('card-telas');
    expect(within(telas).queryByText('Tela 4 extra')).toBeNull();
    fireEvent.click(within(telas).getByRole('button', { name: /Expandir/ }));
    expect(within(telas).getByText('Tela 4 extra')).toBeInTheDocument();
  });
});
