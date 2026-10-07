/**
 * F-159 — "Adicionar mídia" na zona / na criação de tela: "Mídias da galeria" mostra TUDO — Minhas Mídias (vídeos e
 * imagens), widgets e a Biblioteca. Antes uma consulta só (limitada a 60, mais nova primeiro) era tomada pela Biblioteca
 * e as mídias de "Minhas Mídias" nem apareciam; widgets não apareciam.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

interface Chamada { tabela: string; filtros: Array<[string, unknown]>; busca?: string }
const chamadas: Chamada[] = [];
const inserts: Array<{ tabela: string; linhas: unknown }> = [];

const MINHAS = [{ id: 'm1', name: 'Meu vídeo', file_type: 'video', thumbnail_url: null, file_url: 'https://x/m1.mp4', duration_ms: 12400 }, { id: 'm2', name: 'Minha foto', file_type: 'image', thumbnail_url: null, file_url: 'https://x/m2.jpg', duration_ms: null }];
const BIBLIOTECA = [{ id: 'b1', name: 'Vídeo da Biblioteca', file_type: 'video', thumbnail_url: null, file_url: 'https://x/b1.mp4', duration_ms: 30000 }];
const WIDGETS = [{ id: 'w1', name: 'Hora da loja', widget_type: 'clock', thumbnail_url: null }, { id: 'w2', name: 'Tabela do Brasileirão', widget_type: 'sports', thumbnail_url: null }];

function construtor(tabela: string) {
  const c: Chamada = { tabela, filtros: [] };
  chamadas.push(c);
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'limit']) q[m] = () => q;
  q.in = (col: string, v: unknown) => { c.filtros.push([`in:${col}`, v]); return q; };
  q.eq = (col: string, v: unknown) => { c.filtros.push([`eq:${col}`, v]); return q; };
  q.ilike = (_col: string, v: string) => { c.busca = v; return q; };
  q.then = (ok: (r: unknown) => unknown) => {
    const biblioteca = c.filtros.find(([k]) => k === 'eq:biblioteca')?.[1];
    const data = tabela === 'widgets' ? WIDGETS : tabela === 'media' ? (biblioteca === true ? BIBLIOTECA : MINHAS) : [];
    return Promise.resolve({ data, error: null }).then(ok);
  };
  return q;
}
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (t: string) => {
      const q = construtor(t) as Record<string, unknown>;
      q.insert = (linhas: unknown) => {
        inserts.push({ tabela: t, linhas });
        const r = Promise.resolve({ error: null }) as Promise<{ error: null }> & { select?: () => { single: () => Promise<{ data: unknown; error: null }> } };
        r.select = () => ({ single: async () => ({ data: { id: 'nova', name: 'Tela', resolution: '16x9' }, error: null }) });
        return r;
      };
      return q;
    },
  },
}));

import { SeletorDeConteudo, adicionarMidiaNaPlaylist, criarPlaylistComMidias, duracaoPadraoDoItem } from '@/components/screens/SeletorDeConteudo';

const ler = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const abrirGaleria = async (donos?: string[]) => {
  const onMidia = vi.fn();
  render(<SeletorDeConteudo aberto titulo="Adicionar mídia" onFechar={vi.fn()} onMidia={onMidia} onPlaylist={vi.fn()} donos={donos} />);
  fireEvent.click(screen.getByTestId('opcao-galeria'));
  await waitFor(() => expect(screen.getAllByTestId('midia-do-seletor').length).toBeGreaterThan(0));
  return onMidia;
};

describe('galeria do seletor: minhas mídias + widgets + biblioteca', () => {
  beforeEach(() => { chamadas.length = 0; inserts.length = 0; });

  it('mostra as três origens juntas, cada uma na sua seção, com contagem', async () => {
    await abrirGaleria();
    expect(within(screen.getByTestId('secao-minhas')).getAllByTestId('midia-do-seletor').map((b) => b.getAttribute('title'))).toEqual(['Meu vídeo', 'Minha foto']);
    expect(within(screen.getByTestId('secao-widgets')).getAllByTestId('midia-do-seletor').map((b) => b.getAttribute('title'))).toEqual(['Hora da loja', 'Tabela do Brasileirão']);
    expect(within(screen.getByTestId('secao-biblioteca')).getAllByTestId('midia-do-seletor').map((b) => b.getAttribute('title'))).toEqual(['Vídeo da Biblioteca']);
    expect(screen.getByTestId('filtro-todas').textContent).toBe('Tudo (5)');
    expect(screen.getByTestId('filtro-minhas').textContent).toBe('Minhas mídias (2)');
    expect(screen.getByTestId('filtro-widgets').textContent).toBe('Widgets (2)');
    expect(screen.getByTestId('filtro-biblioteca').textContent).toBe('Biblioteca (1)');
  });

  it('cada origem tem a sua consulta: minhas = biblioteca falso, biblioteca = verdadeiro, só vídeo/imagem', async () => {
    await abrirGaleria(['u1', 'u2']);
    const media = chamadas.filter((c) => c.tabela === 'media');
    expect(media).toHaveLength(2);
    expect(media.map((c) => c.filtros.find(([k]) => k === 'eq:biblioteca')?.[1]).sort()).toEqual([false, true]);
    for (const c of media) expect(c.filtros.find(([k]) => k === 'in:file_type')?.[1]).toEqual(['image', 'video']);
    // "Minhas mídias" e widgets só dos donos informados; a Biblioteca é de todos
    const minhas = media.find((c) => c.filtros.some(([k, v]) => k === 'eq:biblioteca' && v === false))!;
    const bib = media.find((c) => c.filtros.some(([k, v]) => k === 'eq:biblioteca' && v === true))!;
    expect(minhas.filtros).toContainEqual(['in:user_id', ['u1', 'u2']]);
    expect(bib.filtros.some(([k]) => k === 'in:user_id')).toBe(false);
    const w = chamadas.find((c) => c.tabela === 'widgets')!;
    expect(w.filtros).toContainEqual(['in:user_id', ['u1', 'u2']]);
    expect(w.filtros).toContainEqual(['eq:is_active', true]);
  });

  it('o filtro mostra só uma origem; a busca vai para as três consultas', async () => {
    await abrirGaleria();
    fireEvent.click(screen.getByTestId('filtro-widgets'));
    expect(screen.queryByTestId('secao-minhas')).toBeNull();
    expect(screen.queryByTestId('secao-biblioteca')).toBeNull();
    expect(screen.getAllByTestId('midia-do-seletor')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('filtro-minhas'));
    expect(screen.getAllByTestId('midia-do-seletor').map((b) => b.getAttribute('data-origem'))).toEqual(['minha', 'minha']);
    chamadas.length = 0;
    fireEvent.change(screen.getByTestId('busca-do-seletor'), { target: { value: 'hora' } });
    await waitFor(() => expect(chamadas.filter((c) => c.busca === '%hora%')).toHaveLength(3));
  });

  it('clicar num widget entrega um item de widget (file_type widget, id do widget)', async () => {
    const onMidia = await abrirGaleria();
    fireEvent.click(within(screen.getByTestId('secao-widgets')).getAllByTestId('midia-do-seletor')[1]);
    await waitFor(() => expect(onMidia).toHaveBeenCalledTimes(1));
    expect(onMidia.mock.calls[0][0]).toMatchObject({ id: 'w2', file_type: 'widget', widget_type: 'sports', origem: 'widget' });
  });
});

describe('gravação na playlist: widget vai em widget_id, mídia em media_id', () => {
  beforeEach(() => { inserts.length = 0; });
  const midia = { id: 'm1', name: 'v', file_type: 'video', thumbnail_url: null, file_url: null, duration_ms: 12400 };
  const widget = { id: 'w1', name: 'Hora', file_type: 'widget', widget_type: 'clock', thumbnail_url: null, file_url: null, duration_ms: null };

  it('durações padrão: widget por tipo (clima/hora 10 s, esportes mais longo), vídeo inteiro, imagem 10 s', () => {
    expect(duracaoPadraoDoItem(widget)).toBe(10);
    expect(duracaoPadraoDoItem({ ...widget, widget_type: 'sports' })).toBeGreaterThan(10);
    expect(duracaoPadraoDoItem(midia)).toBe(12);
    expect(duracaoPadraoDoItem({ ...midia, file_type: 'image' })).toBe(10);
  });

  it('adicionar na playlist existente', async () => {
    await adicionarMidiaNaPlaylist('p1', widget);
    const linha = inserts.find((i) => i.tabela === 'playlist_items')!.linhas as Record<string, unknown>;
    expect(linha).toMatchObject({ playlist_id: 'p1', widget_id: 'w1', duration: 10 });
    expect('media_id' in linha).toBe(false);
    inserts.length = 0;
    await adicionarMidiaNaPlaylist('p1', midia);
    const m = inserts.find((i) => i.tabela === 'playlist_items')!.linhas as Record<string, unknown>;
    expect(m).toMatchObject({ media_id: 'm1', duration: 12 });
    expect('widget_id' in m).toBe(false);
  });

  it('criar playlist já com mídias e widgets na ordem escolhida', async () => {
    const pl = await criarPlaylistComMidias('u1', 'Tela', '16x9', [midia, widget]);
    expect(pl.id).toBe('nova');
    const itens = inserts.find((i) => i.tabela === 'playlist_items')!.linhas as Array<Record<string, unknown>>;
    expect(itens.map((i) => [i.position, 'widget_id' in i ? 'widget' : 'media'])).toEqual([[0, 'media'], [1, 'widget']]);
    expect(itens.every((i) => i.playlist_id === 'nova')).toBe(true);
  });
});

describe('quem usa o seletor', () => {
  it('a zona passa quem está logado e o dono da tela; a criação de tela, quem está logado', () => {
    expect(ler('src/components/screens/EditorDeZonas.tsx')).toContain('donos={[user?.id, tela.user_id].filter(Boolean) as string[]}');
    expect(ler('src/components/screens/ScreenDialog.tsx')).toContain('donos={user?.id ? [user.id] : undefined}');
    expect(ler('src/pages/dashboard/ScreenDetails.tsx')).toContain('user_id: (screen as { user_id?: string | null }).user_id');
  });
});
