/**
 * F-156 — Painel completo (imagens 2 e 4 do modelo de referência): regras puras, tela e função do banco.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (f: string, a: unknown) => rpc(f, a) } }));

import { PainelCompleto } from '@/components/dashboard/PainelCompleto';
import {
  CHAVE_CARTOES_OCULTOS, afastarPontos, alternarCartao, arcosDaRosca, diaDaSemana, formatarMb, formatarTamanho, lerCartoesOcultos, localizarTelas,
  normalizarPainel, porcentagem, resumoDePresenca, salvarCartoesOcultos, tendencia, textoDaVariacao, variacaoPercentual,
} from '@/lib/painelCompleto';

const ler = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const BRUTO = {
  gerado_em: '2026-10-07T12:00:00Z',
  telas: { total: 20, online: 5, hoje: 3, offline: 12 },
  sincronizacao: { atualizado: 3, baixando: 1, pendente: 1, sem_info: 15, reportando: 5 },
  telas_sync: [
    { id: 't1', nome: 'Academia Forró', cidade: 'Caruaru', uf: 'PE', sync: 'atualizado', online: true, pendentes: 0, midias: 10, ultimo_sync: '2026-10-07T11:55:00Z' },
    { id: 't2', nome: 'Hotel Max', cidade: 'Caruaru', uf: 'PE', sync: 'pendente', online: true, pendentes: 312, midias: 1054, ultimo_sync: '2026-10-07T11:00:00Z' },
    { id: 't3', nome: 'Loja sem estado', cidade: null, uf: null, sync: 'sem_info', online: false, pendentes: 0, midias: 0, ultimo_sync: null },
  ],
  desatualizados: [{ id: 't2', nome: 'Hotel Max', sync: 'pendente', pendentes: 312, midias: 1054, ultimo_sync: '2026-10-07T11:00:00Z' }],
  disco: { aparelhos: 2, aparelhos_usado_mb: 9768, aparelhos_total_mb: 28322, nuvem_bytes: 114957022, nuvem_arquivos: 26 },
  exibicoes: { atual: 32364, anterior: 16182, por_dia: [{ dia: '2026-10-07', n: 5 }] },
  presenca: {
    dias: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'].map((dia, i) => ({ dia, ligadas: i + 1, exibiram: Math.min(i, i + 1) })),
    soma_atual: 28, soma_anterior: 14,
  },
};

describe('regras puras', () => {
  it('resposta vazia ou torta vira painel completo com zeros (nada quebra)', () => {
    for (const raw of [null, undefined, {}, 'x', 7]) {
      const p = normalizarPainel(raw);
      expect(p.telas).toEqual({ total: 0, online: 0, hoje: 0, offline: 0 });
      expect(p.telas_sync).toEqual([]);
      expect(p.presenca.dias).toEqual([]);
      expect(p.sincronizacao.sem_info).toBe(0);
    }
    const p = normalizarPainel({ telas_sync: [{ id: 1, sync: 'inventado' }] });
    expect(p.telas_sync[0]).toMatchObject({ id: '1', sync: 'sem_info', online: false, pendentes: 0 });
  });

  it('porcentagem e variação contra o período anterior', () => {
    expect(porcentagem(5, 20)).toBe(25);
    expect(porcentagem(1, 0)).toBe(0);
    expect(variacaoPercentual(150, 100)).toBe(50);
    expect(variacaoPercentual(50, 100)).toBe(-50);
    expect(variacaoPercentual(10, 0)).toBeNull(); // sem período anterior não existe porcentagem
    expect(textoDaVariacao(50)).toBe('▲ +50%');
    expect(textoDaVariacao(-12)).toBe('▼ −12%');
    expect(textoDaVariacao(0)).toBe('= 0%');
    expect(textoDaVariacao(null)).toBe('sem período anterior');
    expect(tendencia(5)).toBe('sobe'); expect(tendencia(-5)).toBe('desce'); expect(tendencia(0)).toBe('igual'); expect(tendencia(null)).toBe('sem_base');
  });

  it('tamanhos legíveis', () => {
    expect(formatarTamanho(0)).toBe('0 B');
    expect(formatarTamanho(114957022)).toBe('110 MB');
    expect(formatarTamanho(1536)).toBe('1,5 KB');
    expect(formatarMb(28322)).toBe('27,7 GB');
  });

  it('rosca: os arcos somam a volta inteira, em sequência, e item zero não desenha', () => {
    const circ = 2 * Math.PI * 40;
    const a = arcosDaRosca([{ chave: 'a', valor: 3 }, { chave: 'b', valor: 1 }, { chave: 'c', valor: 0 }]);
    expect(a.map((x) => x.pct)).toEqual([75, 25, 0]);
    const comp = a.map((x) => Number(x.dasharray.split(' ')[0]));
    expect(comp[0] + comp[1]).toBeCloseTo(circ, 1);
    expect(a[0].dashoffset).toBe(-0);
    expect(a[1].dashoffset).toBeCloseTo(-comp[0], 2);
    expect(arcosDaRosca([{ chave: 'a', valor: 0 }])[0].pct).toBe(0);
  });

  it('telas ligadas: média diária, pico (com o dia) e semana anterior', () => {
    const r = resumoDePresenca(normalizarPainel(BRUTO).presenca);
    expect(r.media).toBe(4);
    expect(r.pico).toBe(7);
    expect(r.picoDia).toBe('2026-10-07');
    expect(r.semanaAnterior).toBe(100);
    expect(resumoDePresenca({ dias: [], soma_atual: 0, soma_anterior: 0 })).toEqual({ media: 0, pico: 0, picoDia: null, semanaAnterior: null });
    expect(diaDaSemana('2026-10-07')).toBe('qua');
  });

  it('mapa: tela na cidade conhecida, só no estado ou fora do mapa', () => {
    const municipios = { PE: [['Caruaru', -8.28, -35.97]] as Array<[string, number, number]> };
    const { noMapa, semLocal } = localizarTelas(normalizarPainel(BRUTO).telas_sync, municipios);
    expect(noMapa.map((t) => [t.id, t.lat, t.lon])).toEqual([['t1', -8.28, -35.97], ['t2', -8.28, -35.97]]);
    expect(semLocal.map((t) => t.id)).toEqual(['t3']);
    const soEstado = localizarTelas([{ ...normalizarPainel(BRUTO).telas_sync[0], cidade: 'Cidade que não existe' }], municipios).noMapa[0];
    expect(soEstado.lat).toBeNull();
    expect(soEstado.uf).toBe('PE');
  });

  it('telas na mesma posição não se escondem (espiral em volta do ponto)', () => {
    expect(afastarPontos(1)).toEqual([[0, 0]]);
    const p = afastarPontos(8);
    expect(new Set(p.map((x) => x.map((v) => v.toFixed(2)).join('|'))).size).toBe(8);
    for (let i = 1; i <= 6; i++) expect(Math.hypot(p[i][0], p[i][1])).toBeCloseTo(9, 5);
    expect(Math.hypot(p[7][0], p[7][1])).toBeCloseTo(18, 5);
  });

  it('"Editar painel": esconder/mostrar e lembrar; armazenamento quebrado não derruba', () => {
    const mem = new Map<string, string>();
    const arm = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    expect(lerCartoesOcultos(arm)).toEqual([]);
    const o = alternarCartao([], 'mapa');
    salvarCartoesOcultos(arm, o);
    expect(lerCartoesOcultos(arm)).toEqual(['mapa']);
    expect(alternarCartao(o, 'mapa')).toEqual([]);
    mem.set(CHAVE_CARTOES_OCULTOS, '{lixo');
    expect(lerCartoesOcultos(arm)).toEqual([]);
    mem.set(CHAVE_CARTOES_OCULTOS, JSON.stringify(['mapa', 'inventado']));
    expect(lerCartoesOcultos(arm)).toEqual(['mapa']);
    expect(lerCartoesOcultos(null)).toEqual([]);
    expect(() => salvarCartoesOcultos({ getItem: () => null, setItem: () => { throw new Error('cheio'); } }, ['mapa'])).not.toThrow();
  });
});

describe('tela do painel', () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: BRUTO, error: null });
    window.localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      json: async () => (String(url).includes('municipios') ? { PE: [['Caruaru', -8.28, -35.97]] } : [{ uf: 'PE', nome: 'Pernambuco', lat: -8.3, lon: -37.9, aneis: [[[-41.3, -7.3], [-34.8, -7.3], [-34.8, -9.5], [-41.3, -9.5]]] }]),
    })));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  const abrir = () => render(<MemoryRouter><PainelCompleto /></MemoryRouter>);

  it('mostra telas online, disco, exibições com variação e os cartões do painel', async () => {
    abrir();
    await waitFor(() => expect(screen.getByTestId('painel-completo')).toBeTruthy());
    expect(rpc).toHaveBeenCalledWith('fn_dashboard_completo', { p_offline_min: 10 });
    expect(screen.getByTestId('kpi-online').textContent).toBe('5');
    expect(screen.getByTestId('cartao-telas').textContent).toContain('/20');
    expect(screen.getByTestId('cartao-telas').textContent).toContain('25%');
    expect(screen.getByTestId('kpi-disco').textContent).toContain('34%');
    expect(screen.getByTestId('cartao-disco').textContent).toContain('2 aparelhos informaram');
    expect(screen.getByTestId('kpi-exibicoes').textContent).toBe('32.364');
    expect(screen.getByTestId('kpi-variacao').textContent).toContain('▲ +100%');
    for (const id of ['mapa', 'sincronizacao', 'ligadas', 'status', 'desatualizado']) expect(screen.getByTestId(`cartao-${id}`)).toBeTruthy();
    expect(within(screen.getByTestId('status-contagem')).getByText('Offline').parentElement!.textContent).toContain('12');
    expect(within(screen.getByTestId('resumo-ligadas')).getByText('+100%')).toBeTruthy();
    expect(screen.getByTestId('desatualizado-lista').textContent).toContain('312/1054');
    expect(screen.getByTestId('ativar-tela').getAttribute('href')).toBe('/dashboard/screens');
  });

  it('mapa da sincronização: um ponto por tela localizada, na cor do estado, com legenda e contagem', async () => {
    abrir();
    await waitFor(() => expect(screen.getAllByTestId('ponto-tela').length).toBe(2));
    expect(screen.getAllByTestId('ponto-tela').map((p) => p.getAttribute('data-sync')).sort()).toEqual(['atualizado', 'pendente']);
    const legenda = screen.getByTestId('legenda-sincronizacao');
    for (const t of ['Atualizado', 'Baixando', 'Pendente', 'Sem informação']) expect(legenda.textContent).toContain(t);
    expect(legenda.textContent).toContain('1 tela sem estado cadastrado');
  });

  it('sem nenhum aparelho informando, avisa em vez de inventar sincronização', async () => {
    rpc.mockResolvedValue({ data: { ...BRUTO, sincronizacao: { atualizado: 0, baixando: 0, pendente: 0, sem_info: 20, reportando: 0 }, desatualizados: [], telas_sync: [] }, error: null });
    abrir();
    await waitFor(() => expect(screen.getByTestId('painel-completo')).toBeTruthy());
    expect(screen.getByTestId('cartao-sincronizacao').textContent).toContain('Nenhum aparelho informou a sincronização ainda');
    expect(screen.getByTestId('desatualizado-vazio').textContent).toContain('Ainda sem informação dos aparelhos');
  });

  it('Editar painel: esconde um cartão e lembra a escolha neste navegador', async () => {
    abrir();
    await waitFor(() => expect(screen.getByTestId('painel-completo')).toBeTruthy());
    fireEvent.click(screen.getByTestId('editar-painel'));
    fireEvent.click(screen.getByTestId('mostrar-mapa'));
    expect(screen.queryByTestId('cartao-mapa')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(CHAVE_CARTOES_OCULTOS) || '[]')).toEqual(['mapa']);
    fireEvent.click(screen.getByTestId('mostrar-mapa'));
    expect(screen.getByTestId('cartao-mapa')).toBeTruthy();
  });

  it('sem telas visíveis ou com erro, o painel some sem quebrar a página', async () => {
    rpc.mockResolvedValue({ data: { ...BRUTO, telas: { total: 0, online: 0, hoje: 0, offline: 0 } }, error: null });
    const a = abrir();
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    await waitFor(() => expect(a.container.querySelector('[data-testid=painel-completo]')).toBeNull());
    a.unmount();
    rpc.mockResolvedValue({ data: null, error: { message: 'x' } });
    const b = abrir();
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(b.container.querySelector('[data-testid=painel-completo]')).toBeNull());
  });
});

describe('banco (migração 20261307)', () => {
  const sql = ler('supabase/migrations/20261307_painel_completo_sincronizacao_e_presenca.sql');
  it('só leitura, sem SECURITY DEFINER (cada perfil vê só o que a RLS já deixa) e fechada para anônimos', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.fn_dashboard_completo(p_offline_min integer DEFAULT 10)');
    expect(sql).toContain('STABLE');
    expect(sql).not.toMatch(/SECURITY DEFINER\s*\n\s*SET/);
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\s+(INTO\s+)?public\./i);
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.fn_dashboard_completo(integer) FROM public, anon;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.fn_dashboard_completo(integer) TO authenticated;');
  });
  it('sincronização vem do que o Player informa; tela sem relatório fica "sem informação"', () => {
    expect(sql).toContain("WHEN NOT m.online THEN 'sem_info'");
    expect(sql).toContain("'UPDATED', 'SYNCED', 'OK', 'UP_TO_DATE'");
    expect(sql).toContain("ELSE 'sem_info' END AS estado_sync");
  });
  it('não toca no contrato do Player', () => {
    expect(sql).not.toContain('get_player_playlist_for_screen');
    expect(sql).not.toContain('get_player_layout_for_screen');
  });
});
