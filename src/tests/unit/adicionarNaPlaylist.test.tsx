/**
 * F-155 — Diálogo "Adicionar à playlist" (modelo de referência, imagem 3): abas, sub-abas, categorias, seleção
 * múltipla, painel "Selecionados" com Limpar, posição Início/Final e widgets de um clique.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const listarPastas = vi.fn();
vi.mock('@/lib/biblioteca', () => ({ listarPastas: () => listarPastas() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: [{ id: 'pl-2', name: 'Playlist da manhã', resolution: '16x9' }, { id: 'pl-1', name: 'Atual', resolution: '16x9' }] }) }) }) }) },
}));
vi.mock('@/components/media/MediaThumbnail', () => ({ MediaThumbnail: () => <span data-testid="miniatura" /> }));

import { AdicionarNaPlaylist } from '@/components/playlists/AdicionarNaPlaylist';
import {
  MODELOS_PRONTOS, agruparWidgets, alternarEscolha, categoriaDoTipo, copiaDoItem, duracaoPadraoDoWidget, escolhaDeMidia, escolhaDeWidget,
  inserirNaPosicao, itemTemporario, textoDoConfirmar,
} from '@/lib/adicionarNaPlaylist';
import type { ExternalLink, Media, PlaylistItem, Widget } from '@/types/models';

const media = (id: string, name: string, file_type: string, extra: Partial<Media> = {}) => ({ id, name, file_type, file_url: `https://x/${id}`, ...extra }) as unknown as Media;
const widget = (id: string, name: string, widget_type: string) => ({ id, name, widget_type, config: {}, is_active: true }) as unknown as Widget;
const link = (id: string, title: string) => ({ id, title, url: 'https://exemplo.com', platform: 'Site', thumbnail_url: null }) as ExternalLink;

const MIDIAS = [media('v1', 'Abertura', 'video', { duration_ms: 12400 }), media('v2', 'Promo verão', 'video'), media('i1', 'Cartaz', 'image'), media('a1', 'Trilha', 'audio')];
const WIDGETS = [widget('w1', 'Hora da loja', 'clock'), widget('w2', 'Tabela do Brasileirão', 'sports'), widget('w3', 'Notícias do dia', 'rss')];
const LINKS = [link('l1', 'Site da loja')];

describe('regras puras', () => {
  it('categorias do conteúdo dinâmico (Geral, Futebol, Notícias...)', () => {
    expect(categoriaDoTipo('clock')).toBe('Geral');
    expect(categoriaDoTipo('sports')).toBe('Futebol');
    expect(categoriaDoTipo('sports_news')).toBe('Futebol');
    expect(categoriaDoTipo('rss')).toBe('Notícias');
    expect(categoriaDoTipo('youtube')).toBe('Vídeo e redes');
    expect(categoriaDoTipo('offer')).toBe('Comercial');
    expect(categoriaDoTipo('desconhecido')).toBe('Geral');
    const grupos = agruparWidgets(WIDGETS);
    expect(grupos.map((g) => g.categoria)).toEqual(['Geral', 'Futebol', 'Notícias']);
  });

  it('widgets de um clique: só modelos que funcionam sem dado do usuário (sem Clima, sem Oferta)', () => {
    const tipos = new Set(MODELOS_PRONTOS.map((m) => m.tipo));
    expect(tipos.has('weather')).toBe(false);
    expect(tipos.has('offer')).toBe(false);
    expect(tipos.has('advertising')).toBe(false);
    expect(MODELOS_PRONTOS.filter((m) => m.tipo === 'sports')).toHaveLength(5); // um por campeonato
    const br = MODELOS_PRONTOS.find((m) => m.id === 'pronto-futebol-brasileirao')!;
    expect(br.config()).toMatchObject({ template: 'sports-resultados', competicoes: ['brasileirao'] });
    expect(MODELOS_PRONTOS.find((m) => m.id === 'pronto-noticias-agencia-brasil')!.config()).toMatchObject({ origem: 'agencia-brasil' });
    expect(MODELOS_PRONTOS.find((m) => m.id === 'pronto-esportes-news')!.config()).toMatchObject({ template: 'esportes-news' });
    expect(MODELOS_PRONTOS.find((m) => m.id === 'pronto-relogio')!.config()).toMatchObject({ template: 'clock-futurista', showDate: true });
  });

  it('clicar de novo tira da seleção; a ordem de marcação é mantida', () => {
    let l = alternarEscolha([], escolhaDeMidia(MIDIAS[0]));
    l = alternarEscolha(l, escolhaDeWidget(WIDGETS[0]));
    l = alternarEscolha(l, escolhaDeMidia(MIDIAS[2]));
    expect(l.map((e) => e.chave)).toEqual(['midia:v1', 'widget:w1', 'midia:i1']);
    expect(alternarEscolha(l, escolhaDeWidget(WIDGETS[0])).map((e) => e.chave)).toEqual(['midia:v1', 'midia:i1']);
  });

  it('item temporário: vídeo com o tempo real (segundo cheio), imagem 10 s, widget por tipo, link 30 s, pasta 10 s', () => {
    expect(itemTemporario({ ...escolhaDeMidia(MIDIAS[0]) } as never, 'p').duration).toBe(13);
    expect(itemTemporario({ ...escolhaDeMidia(MIDIAS[2]) } as never, 'p').duration).toBe(10);
    expect(itemTemporario(escolhaDeWidget(WIDGETS[2]) as never, 'p').duration).toBe(15);
    expect(duracaoPadraoDoWidget('sports')).toBeGreaterThan(10);
    const pasta = itemTemporario({ chave: 'pasta:x', tipo: 'pasta', nome: 'Geral', pasta: { id: 'x', nome: 'Geral', descricao: null, ordem: 0, total: 3, videos: 1, imagens: 2, capa_url: null } }, 'p');
    expect(pasta).toMatchObject({ biblioteca_pasta_id: 'x', media_id: null, duration: 10 });
    expect(itemTemporario({ chave: 'link:l1', tipo: 'link', nome: 'x', link: LINKS[0] }, 'p').duration).toBe(30);
  });

  it('Início coloca antes de tudo, Final depois; posições renumeradas e a ordem dos novos é mantida', () => {
    const atuais = [{ id: 'a', position: 0 }, { id: 'b', position: 1 }] as PlaylistItem[];
    const novos = [{ id: 'n1', position: 0 }, { id: 'n2', position: 0 }] as PlaylistItem[];
    expect(inserirNaPosicao(atuais, novos, 'final').map((i) => [i.id, i.position])).toEqual([['a', 0], ['b', 1], ['n1', 2], ['n2', 3]]);
    expect(inserirNaPosicao(atuais, novos, 'inicio').map((i) => [i.id, i.position])).toEqual([['n1', 0], ['n2', 1], ['a', 2], ['b', 3]]);
    expect(inserirNaPosicao([], [], 'final')).toEqual([]);
  });

  it('copiar item de outra playlist: id novo, mesma mídia/duração/agendamento, dias copiados', () => {
    const orig = { id: 'o', playlist_id: 'p2', media_id: 'v1', duration: 20, days: [1, 2], start_time: '08:00' } as unknown as PlaylistItem;
    const c = copiaDoItem(orig, 'p1');
    expect(c.id).not.toBe('o');
    expect(c).toMatchObject({ playlist_id: 'p1', media_id: 'v1', duration: 20, start_time: '08:00' });
    expect(c.days).toEqual([1, 2]);
    expect(c.days).not.toBe(orig.days);
  });

  it('texto do botão', () => {
    expect(textoDoConfirmar(0)).toBe('Adicionar à playlist');
    expect(textoDoConfirmar(1)).toBe('Adicionar 1 item à playlist');
    expect(textoDoConfirmar(3)).toBe('Adicionar 3 itens à playlist');
  });
});

describe('diálogo', () => {
  const onConfirmar = vi.fn();
  const onFechar = vi.fn();
  const abrir = () => render(<AdicionarNaPlaylist aberto onFechar={onFechar} midias={MIDIAS} widgets={WIDGETS} links={LINKS} idsDeMidiaNaPlaylist={['v2']} playlistAtualId="pl-1" onConfirmar={onConfirmar} />);
  beforeEach(() => { onConfirmar.mockReset(); onFechar.mockReset(); listarPastas.mockReset(); listarPastas.mockResolvedValue([{ id: 'f1', nome: 'Geral', descricao: null, ordem: 0, total: 4, videos: 2, imagens: 2, capa_url: null }]); });

  it('abre em Meu conteúdo > Vídeos, com contagem em cada sub-aba', () => {
    abrir();
    expect(screen.getByTestId('aba-meu').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('subaba-videos').textContent).toBe('Vídeos (2)');
    expect(screen.getByTestId('subaba-imagens').textContent).toBe('Imagens (1)');
    expect(screen.getByTestId('subaba-links').textContent).toBe('Links (1)');
    expect(screen.getAllByTestId('item-escolhivel').map((e) => e.dataset.chave)).toEqual(['midia:v1', 'midia:v2']);
    expect(screen.getByText('já está')).toBeTruthy(); // v2 já está na playlist (pode repetir)
  });

  it('seleção múltipla com painel "Selecionados": contagem, ordem, tirar um e Limpar', () => {
    abrir();
    const btn = screen.getByTestId('confirmar-adicionar') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(screen.getAllByTestId('item-escolhivel')[0]);
    fireEvent.click(screen.getByTestId('subaba-imagens'));
    fireEvent.click(screen.getAllByTestId('item-escolhivel')[0]);
    expect(screen.getByTestId('qtd-selecionados').textContent).toBe('2');
    const lista = within(screen.getByTestId('lista-selecionados'));
    expect(lista.getByText('Abertura')).toBeTruthy();
    expect(lista.getByText('Cartaz')).toBeTruthy();
    expect(btn.textContent).toBe('Adicionar 2 itens à playlist');
    fireEvent.click(lista.getByLabelText('Tirar Cartaz'));
    expect(screen.getByTestId('qtd-selecionados').textContent).toBe('1');
    fireEvent.click(screen.getByTestId('limpar-selecao'));
    expect(screen.getByTestId('qtd-selecionados').textContent).toBe('0');
    expect(btn.disabled).toBe(true);
  });

  it('a busca filtra pelo nome', () => {
    abrir();
    fireEvent.change(screen.getByTestId('busca-adicionar'), { target: { value: 'promo' } });
    expect(screen.getAllByTestId('item-escolhivel').map((e) => e.dataset.chave)).toEqual(['midia:v2']);
  });

  it('Conteúdo dinâmico: categorias filtram; prontos para usar + meus widgets agrupados', () => {
    abrir();
    fireEvent.click(screen.getByTestId('aba-dinamico'));
    expect(screen.getAllByTestId('grupo-dinamico')).toHaveLength(3);
    expect(document.querySelector('[data-chave="modelo:pronto-futebol-brasileirao"]')).toBeTruthy();
    fireEvent.click(screen.getByTestId('categoria-Futebol'));
    const chaves = screen.getAllByTestId('item-escolhivel').map((e) => e.dataset.chave);
    expect(chaves).toContain('widget:w2');
    expect(chaves).toContain('modelo:pronto-esportes-news');
    expect(chaves).not.toContain('widget:w1');
    expect(chaves).not.toContain('modelo:pronto-relogio');
  });

  it('Conteúdo da plataforma lista as pastas; Links e Playlists (sem a atual) nas sub-abas', async () => {
    abrir();
    fireEvent.click(screen.getByTestId('aba-plataforma'));
    await waitFor(() => expect(document.querySelector('[data-chave="pasta:f1"]')).toBeTruthy());
    fireEvent.click(screen.getByTestId('aba-meu'));
    fireEvent.click(screen.getByTestId('subaba-links'));
    expect(document.querySelector('[data-chave="link:l1"]')).toBeTruthy();
    fireEvent.click(screen.getByTestId('subaba-playlists'));
    await waitFor(() => expect(document.querySelector('[data-chave="playlist:pl-2"]')).toBeTruthy());
    expect(document.querySelector('[data-chave="playlist:pl-1"]')).toBeNull(); // a própria playlist não entra nela mesma
  });

  it('confirmar entrega os itens na ordem marcada e a posição escolhida (Final por padrão, Início se trocar)', async () => {
    abrir();
    fireEvent.click(screen.getAllByTestId('item-escolhivel')[0]);
    fireEvent.click(screen.getByTestId('aba-dinamico'));
    fireEvent.click(document.querySelector('[data-chave="widget:w1"]') as Element);
    expect(screen.getByTestId('posicao-final').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByTestId('posicao-inicio'));
    fireEvent.click(screen.getByTestId('confirmar-adicionar'));
    await waitFor(() => expect(onConfirmar).toHaveBeenCalledTimes(1));
    const [escolhas, posicao] = onConfirmar.mock.calls[0];
    expect((escolhas as Array<{ chave: string }>).map((e) => e.chave)).toEqual(['midia:v1', 'widget:w1']);
    expect(posicao).toBe('inicio');
    await waitFor(() => expect(onFechar).toHaveBeenCalled());
  });

  it('se a confirmação falhar, o diálogo continua aberto com a seleção', async () => {
    onConfirmar.mockRejectedValueOnce(new Error('falhou'));
    abrir();
    fireEvent.click(screen.getAllByTestId('item-escolhivel')[0]);
    fireEvent.click(screen.getByTestId('confirmar-adicionar'));
    await waitFor(() => expect(onConfirmar).toHaveBeenCalled());
    expect(onFechar).not.toHaveBeenCalled();
    expect(screen.getByTestId('qtd-selecionados').textContent).toBe('1');
  });
});

describe('ligação no editor de playlist', () => {
  const src = readFileSync('src/components/playlists/PlaylistItemsDialog.tsx', 'utf8').replace(/\r\n/g, '\n');
  it('o editor usa o diálogo novo e grava só por "Salvar Alterações"', () => {
    expect(src).toContain('<AdicionarNaPlaylist');
    expect(src).toContain('onConfirmar={confirmarAdicao}');
    expect(src).toContain('savePlaylistItems(supabase, playlist.id, items)');
    expect(src).not.toContain('pickerTab');
  });
  it('o editor usa a resolução compartilhada com o usuário logado', () => {
    expect(src).toContain('resolverEscolhas(escolhas, playlist.id, user.id)');
  });
  it('widgets de um clique são criados com o usuário logado e entram como item do widget criado', () => {
    const lib = readFileSync('src/lib/adicionarNaPlaylist.ts', 'utf8').replace(/\r\n/g, '\n');
    expect(lib).toContain("if (e.tipo === 'modelo')");
    expect(lib).toContain('user_id: userId, name: e.modelo.nome, widget_type: e.modelo.tipo, config: e.modelo.config()');
  });
});

describe('ligação na lista de reprodução da tela', () => {
  const tela = readFileSync('src/pages/dashboard/ScreenDetails.tsx', 'utf8').replace(/\r\n/g, '\n');
  it('a tela tem o botão "Adicionar à playlist" e usa a mesma resolução do editor (sem duplicar regra)', () => {
    expect(tela).toContain('data-testid="abrir-adicionar-na-playlist"');
    expect(tela).toContain('<AdicionarNaPlaylist');
    expect(tela).toContain('resolverEscolhas(escolhas, screen?.playlist_id');
    expect(tela).toContain('inserirNaPosicao(');
    expect(tela).toContain('setHasUnsavedChanges(true);'); // só vale após "Salvar Alterações"
  });
  it('os botões antigos (Mídia, Widget, Link) continuam disponíveis', () => {
    expect(tela).toContain('testId="seletor-midia"');
    expect(tela).toContain('testId="seletor-widget"');
    expect(tela).toContain('testId="seletor-link"');
  });
});
