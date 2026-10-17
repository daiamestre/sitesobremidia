/**
 * F-190 — contas novas nascem limpas (gestor de mídia e representante só veem o que é deles) e o dono/ADM
 * tem a Visão das Contas.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/services/visaoContas.service', async (orig) => {
  const real = await orig<typeof import('@/services/visaoContas.service')>();
  return { ...real, buscarContas: vi.fn(), buscarDetalheDaConta: vi.fn() };
});

import { buscarContas, buscarDetalheDaConta, type ContaResumo } from '@/services/visaoContas.service';
import VisaoDasContasPage from '@/modules/corporate/pages/VisaoDasContasPage';

const limpas = readFileSync('supabase/migrations/20261330_contas_nascem_limpas.sql', 'utf8');
const visao = readFileSync('supabase/migrations/20261331_visao_das_contas.sql', 'utf8');

const conta = (c: Partial<ContaResumo>): ContaResumo => ({
  id: 'x', nome: 'X', email: 'x@x', perfil: 'GESTOR', situacao: 'APPROVED', ativo: true, criado_em: null, ultimo_acesso: null,
  telas: 0, telas_online: 0, telas_sem_playlist: 0, playlists: 0, midias: 0, espaco_bytes: 0, exibicoes_7d: 0,
  pontos: 0, campanhas: 0, contratos: 0, clientes_carteira: 0, ...c,
});

const comConsulta = (ui: ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

describe('F-190 · contas novas nascem limpas', () => {
  it('gestor de mídia e representante deixam de ler as telas da empresa do dono', () => {
    expect(limpas).toContain("upper(coalesce(p.nome, '')) IN ('GESTOR', 'REPRESENTANTE')");
    expect(limpas).toContain('(NOT public.fn_perfil_so_proprias_telas()) AND empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())');
    expect(limpas).toContain('RETURN EXISTS (SELECT 1 FROM public.screens s WHERE s.id = p_screen_id AND s.user_id = v_uid);');
  });

  it('as exibições: restrito lê só as próprias telas; os demais, a regra de antes; o perfil é lido uma vez por consulta', () => {
    expect(limpas).toContain('((SELECT public.fn_perfil_so_proprias_telas())');
    expect(limpas).toContain('AND screen_id IN (SELECT s.id::text FROM public.screens s WHERE s.user_id = (SELECT auth.uid())))');
    expect(limpas).toContain('public.fn_player_can_access_screen_text(screen_id)');
  });

  it('tem bloco de ROLLBACK e não mexe no que o Player usa para tocar', () => {
    expect(limpas).toContain('ROLLBACK:');
    expect(limpas).not.toContain('get_player_playlist_for_screen(');
    expect(limpas).not.toContain('FUNCTION public.get_authorized_screens_for_player');
  });
});

describe('F-190 · Visão das Contas (dono e ADM)', () => {
  it('o banco só responde a dono/ADM e só com contas da mesma empresa', () => {
    expect(visao).toContain("upper(coalesce(p.nome, '')) IN ('OWNER', 'ADMIN')");
    expect(visao).toContain("RETURN jsonb_build_object('status', 'SEM_PERMISSAO');");
    expect(visao).toContain('v_alvo.empresa_operadora_id IS DISTINCT FROM v_empresa');
    expect(visao).toContain('REVOKE ALL ON FUNCTION public.fn_visao_contas() FROM PUBLIC, anon;');
  });

  it('a página está no menu do dono/ADM e protegida na rota', () => {
    expect(readFileSync('src/modules/crm/components/Sidebar.tsx', 'utf8')).toContain("{ label: 'Visão das Contas', icon: Eye, path: '/workspace/contas' }");
    expect(readFileSync('src/App.tsx', 'utf8')).toContain(`<Route path="contas" element={<RequireRole roles={['OWNER', 'ADMIN']}><VisaoDasContasPage /></RequireRole>} />`);
  });

  it('lista as contas com os números, filtra por perfil e abre o detalhe', async () => {
    vi.mocked(buscarContas).mockResolvedValue([
      conta({ id: 'g', nome: 'Hotel Maxsuel', perfil: 'GESTOR', telas: 2, telas_online: 1, midias: 5, playlists: 1 }),
      conta({ id: 'a', nome: 'Loja do Zé', perfil: 'ANUNCIANTE', campanhas: 3, pontos: 4 }),
      conta({ id: 'r', nome: 'Rep Ana', perfil: 'REPRESENTANTE', clientes_carteira: 7 }),
    ]);
    vi.mocked(buscarDetalheDaConta).mockResolvedValue({
      telas: [{ id: 't', nome: 'Totem Recepção', cidade: null, uf: null, online: true, conectada: true, ultimo_sinal: null, app: '5.7.7', playlist: 'Principal' }],
      playlists: [], midias: [], pontos: [], campanhas: [], contratos: [], exibicoes_por_dia: [],
    });
    comConsulta(<VisaoDasContasPage />);
    expect(await screen.findByText('Hotel Maxsuel')).toBeTruthy();
    expect(screen.getByText('Loja do Zé')).toBeTruthy();
    expect(screen.getByText('1/2')).toBeTruthy(); // telas online / total do gestor
    fireEvent.click(screen.getByRole('button', { name: 'Anunciantes' }));
    await waitFor(() => expect(screen.queryByText('Hotel Maxsuel')).toBeNull());
    expect(screen.getByText('Loja do Zé')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Todas' }));
    fireEvent.click(await screen.findByText('Hotel Maxsuel'));
    expect(await screen.findByText('Totem Recepção')).toBeTruthy();
    expect(buscarDetalheDaConta).toHaveBeenCalledWith('g');
  });

  it('quem não é dono/ADM vê o aviso de permissão', async () => {
    vi.mocked(buscarContas).mockRejectedValue(new Error('Apenas o dono e o ADM podem ver todas as contas.'));
    comConsulta(<VisaoDasContasPage />);
    expect(await screen.findByText(/Apenas o dono e o ADM/)).toBeTruthy();
  });
});
