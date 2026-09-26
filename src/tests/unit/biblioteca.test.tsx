import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ---------- supabase: registra as RPCs chamadas (a regra de permissão está no banco; aqui provamos o contrato)
const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), functions: { invoke: vi.fn(async () => ({ error: null })) } } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import {
  adicionarATelas, adicionarAPlaylists, buscarPlaylists, buscarTelas, contagemPasta, duracaoCurta, excluirPastaDefinitivo, mensagemAmigavel,
  type MidiaBiblioteca, type PastaBiblioteca,
} from '@/lib/biblioteca';
import { erroNomePasta } from '@/components/biblioteca/BibliotecaDialogs';
import { MidiaBibliotecaCard } from '@/components/biblioteca/MidiaBibliotecaCard';
import { DestinoDialog } from '@/components/biblioteca/DestinoDialog';
import { BibliotecaMidias } from '@/components/biblioteca/BibliotecaMidias';

const PASTAS: PastaBiblioteca[] = [
  { id: 'p1', nome: 'Vídeos Esporte', descricao: null, ordem: 0, total: 2, videos: 2, imagens: 0, capa_url: null },
  { id: 'p2', nome: 'Memes', descricao: null, ordem: 1, total: 1, videos: 0, imagens: 1, capa_url: null },
];
const MIDIA: MidiaBiblioteca = {
  item_id: 'i1', media_id: 'm1', nome: 'Gol de Placa', file_type: 'video', file_url: 'https://r2/x.mp4', thumbnail_url: 'https://r2/t.jpg',
  duration_ms: 14997, mime_type: 'video/mp4', file_size: 1, aspect_ratio: '16x9', pasta_id: 'p1', pasta_nome: 'Vídeos Esporte',
  tags: ['futebol'], descricao: null, created_at: '2026-09-26',
};

/** Responde cada RPC como o banco responderia para o perfil dado. */
function banco(admin: boolean) {
  rpc.mockImplementation(async (nome: string) => {
    if (nome === 'fn_biblioteca_admin') return { data: admin, error: null };
    if (nome === 'biblioteca_listar_pastas') return { data: PASTAS, error: null };
    if (nome === 'biblioteca_buscar') return { data: [MIDIA], error: null };
    if (nome === 'biblioteca_telas_cliente') return { data: [{ id: 's1', nome: 'Tela Loja', ponto_nome: 'Ponto Centro', playlist_nome: 'Minha PL' }], error: null };
    if (nome === 'biblioteca_minhas_telas') return { data: [{ id: 's9', nome: 'Tela Recepção', ativa: true, playlist_nome: null, pode_adicionar: true, motivo: 'Sem playlist' }], error: null };
    return { data: null, error: null };
  });
}

beforeAll(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); });
beforeEach(() => rpc.mockReset());

describe('Biblioteca de Mídias — regras de apresentação', () => {
  it('traduz os erros do banco e formata duração/contagem', () => {
    expect(mensagemAmigavel('sem_permissao: apenas Owner/ADM administram a Biblioteca')).toBe('Apenas Owner/ADM podem administrar a Biblioteca.');
    expect(mensagemAmigavel('nome_duplicado: já existe')).toBe('Já existe uma pasta com esse nome.');
    expect(mensagemAmigavel('midia_indisponivel: x')).toBe('Esta mídia não está mais disponível na Biblioteca.');
    expect(duracaoCurta(14997)).toBe('00:15');
    expect(duracaoCurta(null)).toBeNull();
    expect(contagemPasta({ total: 1 })).toBe('1 mídia');
    expect(contagemPasta({ total: 24 })).toBe('24 mídias');
  });

  it('valida o nome da pasta como o banco (vazio, longo, caracteres inválidos)', () => {
    expect(erroNomePasta('   ')).toBe('Informe o nome da pasta.');
    expect(erroNomePasta('a/b')).toMatch(/Não use/);
    expect(erroNomePasta('x'.repeat(81))).toMatch(/80/);
    expect(erroNomePasta('Vídeos Esporte')).toBeNull();
  });
});

describe('Biblioteca de Mídias — contrato com o banco (painel x portal)', () => {
  it('painel usa as playlists/telas próprias; portal usa as playlists do portal e as telas publicadas', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await buscarPlaylists('painel', 'hot'); await buscarPlaylists('portal', 'hot');
    await buscarTelas('painel', ''); await buscarTelas('portal', '');
    await adicionarAPlaylists('painel', 'm1', ['a']); await adicionarAPlaylists('portal', 'm1', ['b']);
    await adicionarATelas('painel', 'm1', ['s']); await adicionarATelas('portal', 'm1', ['s']);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual([
      'biblioteca_minhas_playlists', 'biblioteca_playlists_cliente', 'biblioteca_minhas_telas', 'biblioteca_telas_cliente',
      'biblioteca_adicionar_playlists', 'biblioteca_adicionar_playlist_cliente', 'biblioteca_adicionar_telas', 'biblioteca_adicionar_telas_cliente',
    ]);
    expect(rpc.mock.calls[4][1]).toEqual({ p_media_id: 'm1', p_playlist_ids: ['a'] });
  });

  it('erro do banco chega traduzido; exclusão definitiva limpa só as chaves que o banco liberou', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'sem_permissao: apenas Owner/ADM administram a Biblioteca' } });
    await expect(buscarPlaylists('painel', '')).rejects.toThrow('Apenas Owner/ADM podem administrar a Biblioteca.');
    rpc.mockResolvedValueOnce({ data: { chaves_r2: [], preservadas_em_uso: 1 }, error: null });
    await expect(excluirPastaDefinitivo('p1')).resolves.toEqual({ chaves_r2: [], preservadas_em_uso: 1 });
  });
});

describe('Biblioteca de Mídias — cartão e seletor de destino', () => {
  it('cartão: miniatura, duração, pasta de origem e as 3 ações; menu ⋮ só para Owner/ADM', () => {
    const noop = vi.fn();
    const { rerender } = render(<MidiaBibliotecaCard midia={MIDIA} mostrarPasta onPreview={noop} onPlaylist={noop} onTela={noop} />);
    expect(screen.getByText('00:15')).toBeInTheDocument();
    expect(screen.getByText('Vídeos Esporte')).toBeInTheDocument();
    ['Preview', 'Adicionar à Playlist', 'Adicionar à Tela'].forEach((t) => expect(screen.getByRole('button', { name: new RegExp(t) })).toBeInTheDocument());
    expect(screen.queryByLabelText('Mais ações')).toBeNull();
    rerender(<MidiaBibliotecaCard midia={MIDIA} onPreview={noop} onPlaylist={noop} onTela={noop}
      admin={{ onEditar: noop, onMover: noop, onDuplicar: noop, onExcluir: noop }} />);
    expect(screen.getByLabelText('Mais ações')).toBeInTheDocument();
  });

  it('seletor: busca no servidor, seleção múltipla, item bloqueado não seleciona, confirma com os ids', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const buscar = vi.fn(async (t: string) => [
      { id: 'a', nome: `Hotel Maxsuel ${t}`.trim() }, { id: 'b', nome: 'Hotel Maxsuel - Campanha' },
      { id: 'c', nome: 'Totem', habilitada: false, motivo: 'A tela usa a playlist de outro responsável' },
    ]);
    const confirmar = vi.fn(async () => ({ adicionadas: 2, recusadas: [] }));
    render(<DestinoDialog open onOpenChange={() => {}} titulo="Adicionar à Playlist" descricao="" grupo="Minhas Playlists" placeholder="Pesquisar Playlist..."
      vazio="nada" buscar={buscar} confirmar={confirmar} rotuloSucesso={(n) => `${n}`} />);
    fireEvent.change(screen.getByTestId('destino-busca'), { target: { value: 'hotel' } });
    await act(async () => { vi.advanceTimersByTime(400); });
    await waitFor(() => expect(buscar).toHaveBeenLastCalledWith('hotel'));
    const lista = await screen.findByTestId('destino-lista');
    await within(lista).findByText('Hotel Maxsuel hotel');
    fireEvent.click(within(lista).getByRole('checkbox', { name: 'Hotel Maxsuel hotel' }));
    fireEvent.click(within(lista).getByRole('checkbox', { name: 'Hotel Maxsuel - Campanha' }));
    expect(within(lista).getByRole('checkbox', { name: 'Totem' })).toBeDisabled();
    fireEvent.click(screen.getByTestId('destino-confirmar'));
    await waitFor(() => expect(confirmar).toHaveBeenCalledWith(['a', 'b']));
    vi.useRealTimers();
  });
});

describe('Biblioteca de Mídias — página', () => {
  const pagina = (contexto: 'painel' | 'portal', url = '/') =>
    render(<MemoryRouter initialEntries={[url]}><BibliotecaMidias contexto={contexto} /></MemoryRouter>);

  it('Anunciante/Gestor: vê as pastas com a contagem, sem nenhuma ação administrativa', async () => {
    banco(false);
    pagina('portal');
    expect(await screen.findByText('Vídeos Esporte')).toBeInTheDocument();
    expect(screen.getByText('2 mídias')).toBeInTheDocument();
    expect(screen.getByText('Encontre conteúdos prontos para usar nas suas telas.')).toBeInTheDocument();
    expect(screen.queryByTestId('nova-pasta')).toBeNull();
    expect(screen.queryByTestId('abrir-lixeira')).toBeNull();
    expect(screen.queryByLabelText(/Ações da pasta/)).toBeNull();
  });

  it('Owner/ADM: Nova Pasta, Lixeira e menu da pasta; dentro da pasta, Adicionar mídia', async () => {
    banco(true);
    const { unmount } = pagina('painel');
    expect(await screen.findByTestId('nova-pasta')).toBeInTheDocument();
    expect(screen.getByTestId('abrir-lixeira')).toBeInTheDocument();
    expect(screen.getByLabelText('Ações da pasta Vídeos Esporte')).toBeInTheDocument();
    unmount();
    pagina('painel', '/?pasta=p1');
    expect(await screen.findByTestId('adicionar-midia')).toBeInTheDocument();
    expect(await screen.findByText('Gol de Placa')).toBeInTheDocument();
    expect(rpc.mock.calls.find((c) => c[0] === 'biblioteca_buscar')?.[1]).toMatchObject({ p_pasta_id: 'p1' });
  });

  it('Conteúdo automático (esportes/notícias) aparece no painel e leva ao widget no modelo certo; não aparece no portal', async () => {
    banco(true);
    const { unmount } = pagina('painel');
    expect(await screen.findByTestId('conteudo-automatico')).toBeInTheDocument();
    for (const id of ['sports-resultados', 'sports-proximos', 'sports-hoje', 'rss-esportes']) expect(screen.getByTestId(`usar-${id}`)).toBeInTheDocument();
    unmount();
    banco(false);
    pagina('portal');
    expect(await screen.findByText('Vídeos Esporte')).toBeInTheDocument();
    expect(screen.queryByTestId('conteudo-automatico')).toBeNull();
  });

  it('portal: "Adicionar à Tela" lista só as telas com playlist publicada do anunciante', async () => {
    banco(false);
    pagina('portal', '/?pasta=p1');
    fireEvent.click(await screen.findByRole('button', { name: /Adicionar à Tela/ }));
    expect(await screen.findByText('Tela Loja')).toBeInTheDocument();
    expect(screen.getByText(/Ponto Centro · Playlist: Minha PL/)).toBeInTheDocument();
    expect(rpc.mock.calls.some((c) => c[0] === 'biblioteca_telas_cliente')).toBe(true);
    expect(rpc.mock.calls.some((c) => c[0] === 'biblioteca_minhas_telas')).toBe(false);
  });
});
