import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// F-165 — Inserções do anunciante: uma fonte de verdade (exibições reais do Player) para KPI, card, página e campanhas.
const lerArquivo = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const sql = lerArquivo('supabase/migrations/20261311_insercoes_do_anunciante.sql');

const rpc = vi.fn();
const fromMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), from: (...a: unknown[]) => fromMock(...a) } }));

import { customerPortalDataService } from '@/modules/crm/services/customerPortalData.service';
import InsercoesPorDiaPage from '@/modules/crm/pages/portal/InsercoesPorDiaPage';

const RESPOSTA = {
  status: 'OK',
  periodo_dias: 30,
  total: 7,
  hoje: 2,
  ultimos_7_dias: 5,
  ultima_exibicao: '2026-10-08T07:23:48+00:00',
  por_dia: [
    { data: '2026-10-07', quantidade: 5, midias: [{ media_id: 'm1', nome: 'Promoção Verão', quantidade: 5 }], locais: [{ chave: 'p:1', nome: 'Academia Forró Fit', tipo: 'PARCEIRO', cidade: 'Caruaru', quantidade: 5 }] },
    { data: '2026-10-08', quantidade: 2, midias: [{ media_id: 'm1', nome: 'Promoção Verão', quantidade: 2 }], locais: [{ chave: 's:9', nome: 'Minha loja', tipo: 'PROPRIA', cidade: null, quantidade: 2 }] },
  ],
  por_anuncio: [
    { media_id: 'm1', nome: 'Promoção Verão', total: 7, hoje: 2, ultimos_7_dias: 7, ultima: '2026-10-08T07:23:48+00:00',
      locais: [{ chave: 'p:1', nome: 'Academia Forró Fit', tipo: 'PARCEIRO', quantidade: 5 }, { chave: 's:9', nome: 'Minha loja', tipo: 'PROPRIA', quantidade: 2 }] },
  ],
  por_local: [
    { chave: 'p:1', tipo: 'PARCEIRO', nome: 'Academia Forró Fit', cidade: 'Caruaru', total: 5, hoje: 0, ultimos_7_dias: 5, ultima: '2026-10-07T10:00:00+00:00' },
    { chave: 's:9', tipo: 'PROPRIA', nome: 'Minha loja', cidade: null, total: 2, hoje: 2, ultimos_7_dias: 2, ultima: '2026-10-08T07:23:48+00:00' },
  ],
  por_campanha: [{ id: 'c1', titulo: 'Campanha Verão', status: 'ACTIVE', total: 7, por_dia: [{ data: '2026-10-07', quantidade: 5 }, { data: '2026-10-08', quantidade: 2 }] }],
};

beforeEach(() => { rpc.mockReset(); fromMock.mockReset(); });

describe('Migração 20261311 — fonte única das inserções', () => {
  it('a base junta linhas recentes + resumo permanente, atribuindo o anúncio pela MÍDIA (o Player só grava screen_id + media_id)', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.fn_anunciante_exibicoes_base(p_cliente uuid, p_desde date)');
    expect(sql).toContain('FROM public.playback_logs pl');
    expect(sql).toContain('FROM public.exibicoes_diarias ed');
    expect(sql).toContain('pl.media_id IN (SELECT id FROM minhas_midias)');
    // mídia do anunciante: campanha, enviada por usuário dele, playlist dele, anúncio em ponto
    expect(sql).toContain('FROM public.cliente_playlist_itens i');
    expect(sql).toContain('FROM public.ponto_anuncios pa');
    expect(sql).toContain('JOIN public.usuarios u ON u.id = m.user_id');
    // ainda aceita registros que tragam contrato/agendamento
    expect(sql).toContain('pl.contrato_id IN (SELECT id FROM meus_contratos)');
    expect(sql).toContain('pl.agendamento_id IN (SELECT id FROM minhas_campanhas)');
  });

  it('a base é interna: ninguém de fora a chama (senão leria exibição de outro cliente)', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.fn_anunciante_exibicoes_base(uuid, date) FROM PUBLIC, anon, authenticated;');
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.fn_anunciante_exibicoes_base/);
  });

  it('a função da página só enxerga o cliente do próprio usuário e limita o período', () => {
    expect(sql).toContain('v_cliente uuid := public.get_user_cliente_id();');
    expect(sql).toContain("RETURN jsonb_build_object('status', 'SEM_PERMISSAO');");
    expect(sql).toContain('least(greatest(coalesce(p_dias, 30), 1), 365)');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.fn_portal_anunciante_insercoes(integer) FROM PUBLIC, anon;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.fn_portal_anunciante_insercoes(integer) TO authenticated;');
  });

  it('separa ponto parceiro, tela própria e tela da rede', () => {
    expect(sql).toContain("WHEN s.cliente_id = v_cliente THEN 'PROPRIA'");
    expect(sql).toContain("WHEN s.ponto_id IS NOT NULL THEN 'PARCEIRO'");
    expect(sql).toContain("ELSE 'REDE' END AS tipo");
  });

  it('KPI do início e card "Onde seu anúncio passa" usam a MESMA base (números batem)', () => {
    expect(sql.match(/public\.fn_anunciante_exibicoes_base\(/g)!.length).toBeGreaterThanOrEqual(4);
    expect(sql).toContain('FROM public.fn_anunciante_exibicoes_base(v_cliente, v_hoje - 29) e');
    // o KPI não depende mais do contrato_id (sempre vazio nos registros do Player)
    const kpi = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.get_kpis_portal_anunciante'), sql.indexOf('-- Card "Onde seu anúncio passa"'));
    expect(kpi).toContain("'insercoes', (");
    expect(kpi).not.toContain('pl.contrato_id');
    expect(kpi).not.toContain('FROM public.playback_logs');
  });

  it('o Player não é tocado (nenhuma função do Player alterada)', () => {
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.(fn_player_|get_player_)/);
  });
});

describe('Serviço — getInsercoesDoAnunciante', () => {
  it('lê as exibições reais pela função do banco e devolve os totais', async () => {
    rpc.mockResolvedValue({ data: RESPOSTA, error: null });
    const r = await customerPortalDataService.getInsercoesDoAnunciante(30);
    expect(rpc).toHaveBeenCalledWith('fn_portal_anunciante_insercoes', { p_dias: 30 });
    expect(r.total).toBe(7);
    expect(r.por_dia.reduce((s, d) => s + d.quantidade, 0)).toBe(r.total);
    expect(r.por_local.reduce((s, l) => s + l.total, 0)).toBe(r.total);
    expect(r.por_anuncio.reduce((s, a) => s + a.total, 0)).toBe(r.total);
  });

  it('erro ou sem permissão => lista vazia, sem estourar a tela', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'x' } });
    expect((await customerPortalDataService.getInsercoesDoAnunciante(30)).total).toBe(0);
    rpc.mockResolvedValue({ data: { status: 'SEM_PERMISSAO' }, error: null });
    const r = await customerPortalDataService.getInsercoesDoAnunciante(7);
    expect(r.total).toBe(0);
    expect(r.por_dia).toEqual([]);
  });

  it('campanhas mostram as inserções reais (não a conta de dias da agenda)', async () => {
    rpc.mockResolvedValue({ data: RESPOSTA, error: null });
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => Promise.resolve({ data: [{ id: 'c1', titulo: 'Campanha Verão', objetivo: null, data_inicio: '2026-10-01', data_fim: '2026-10-31', duracao_segundos: 15, status: 'ACTIVE', created_at: 'x', updated_at: 'y' }], error: null });
    fromMock.mockReturnValue(chain);
    const camp = await customerPortalDataService.getCampanhasComInsercoes('cli');
    expect(camp).toHaveLength(1);
    expect(camp[0].total_insercoes).toBe(7);
    expect(camp[0].insercoes.map(i => i.quantidade)).toEqual([5, 2]);
  });

  it('o cálculo antigo (multiplicar dias de agenda) saiu do serviço', () => {
    const src = lerArquivo('src/modules/crm/services/customerPortalData.service.ts');
    expect(src).not.toContain('getInsercoesPorDiaCampanha');
    expect(src).not.toContain("from('pedidos_insercao')\n        .select('id, contrato_id')");
  });
});

describe('Página Inserções por Dia', () => {
  it('mostra total, hoje, por anúncio, por local (parceiro × sua tela) e por dia', async () => {
    rpc.mockResolvedValue({ data: RESPOSTA, error: null });
    render(<InsercoesPorDiaPage />);
    await waitFor(() => expect(screen.getByTestId('pagina-insercoes')).toBeTruthy());
    expect(screen.getByTestId('resumo-total').textContent).toContain('7');
    expect(screen.getByTestId('resumo-hoje').textContent).toContain('2');
    const porLocal = screen.getByTestId('lista-por-local').textContent!;
    expect(porLocal).toContain('Academia Forró Fit');
    expect(porLocal).toContain('Ponto parceiro');
    expect(porLocal).toContain('Minha loja');
    expect(porLocal).toContain('Sua tela');
    expect(screen.getByTestId('lista-por-anuncio').textContent).toContain('Promoção Verão');
    expect(screen.getAllByTestId('linha-do-dia')).toHaveLength(2);
    // o dia mostrado é o dia gravado (sem deslocar para o dia anterior por causa do fuso)
    const dias = screen.getAllByTestId('linha-do-dia').map(l => l.textContent!);
    expect(dias[0]).toContain('08/10/2026');
    expect(dias[1]).toContain('07/10/2026');
  });

  it('trocar o período pede de novo ao banco', async () => {
    rpc.mockResolvedValue({ data: RESPOSTA, error: null });
    render(<InsercoesPorDiaPage />);
    await waitFor(() => expect(screen.getByTestId('pagina-insercoes')).toBeTruthy());
    fireEvent.click(screen.getByTestId('periodo-7'));
    await waitFor(() => expect(rpc).toHaveBeenLastCalledWith('fn_portal_anunciante_insercoes', { p_dias: 7 }));
  });

  it('sem exibição: explica o que acontece em vez de mostrar números inventados', async () => {
    rpc.mockResolvedValue({ data: { ...RESPOSTA, total: 0, hoje: 0, ultimos_7_dias: 0, ultima_exibicao: null, por_dia: [], por_anuncio: [], por_local: [], por_campanha: [] }, error: null });
    render(<InsercoesPorDiaPage />);
    await waitFor(() => expect(screen.getByTestId('sem-insercoes')).toBeTruthy());
    expect(screen.getByTestId('sem-insercoes').textContent).toContain('Nenhuma exibição registrada');
  });
});

describe('Início do portal', () => {
  it('o cartão de inserções diz que são os últimos 30 dias (mesmo período do card de pontos)', () => {
    const src = lerArquivo('src/modules/crm/pages/CustomerPortalDashboard.tsx');
    expect(src).toContain("label: 'Inserções (30 dias)'");
    expect(src).toContain("path: '/portal/insercoes'");
  });
});
