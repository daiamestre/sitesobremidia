import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent } from '@testing-library/react';
import { duplicateItem, buildSaveItems, type EditableItem } from '@/lib/playlistItems';
import { ItemDuplicateButton } from '@/components/playlists/PlaylistItemControls';

type Row = EditableItem & { position: number; media?: { id: string; name: string } };

const row = (over: Partial<Row> = {}): Row => ({
  id: 'i1', media_id: 'm1', widget_id: null, external_link_id: null, position: 0,
  duration: 30, start_time: '08:00:00', end_time: '18:30:00', days: [1, 3, 5],
  media: { id: 'm1', name: 'Promo' }, ...over,
});

describe('duplicateItem — duplicar mídia na lista de reprodução', () => {
  it('a cópia entra logo depois do original', () => {
    const items = [row({ id: 'a', position: 0 }), row({ id: 'b', media_id: 'm2', position: 1 }), row({ id: 'c', media_id: 'm3', position: 2 })];
    const out = duplicateItem(items, 0, 'copia');
    expect(out.map((i) => i.id)).toEqual(['a', 'copia', 'b', 'c']);
    expect(out.map((i) => i.media_id)).toEqual(['m1', 'm1', 'm2', 'm3']);
  });

  it('copia mídia, duração e agendamento; o id é novo', () => {
    const [orig, copy] = duplicateItem([row()], 0, 'nova');
    expect(copy.id).toBe('nova');
    expect(copy.id).not.toBe(orig.id);
    expect(copy).toMatchObject({ media_id: 'm1', duration: 30, start_time: '08:00:00', end_time: '18:30:00', days: [1, 3, 5] });
    expect(copy.media).toEqual({ id: 'm1', name: 'Promo' });
  });

  it('a cópia é independente: mudar os dias/duração da cópia não altera o original', () => {
    const items = duplicateItem([row()], 0, 'nova');
    items[1].days!.push(6);
    items[1].duration = 5;
    expect(items[0].days).toEqual([1, 3, 5]);
    expect(items[0].duration).toBe(30);
  });

  it('não altera a lista original (imutável) e renumera as posições', () => {
    const items = [row({ id: 'a', position: 0 }), row({ id: 'b', position: 1 })];
    const out = duplicateItem(items, 0, 'x');
    expect(items).toHaveLength(2);
    expect(out.map((i) => i.position)).toEqual([0, 1, 2]);
  });

  it('duplicar o último item coloca a cópia no fim', () => {
    const out = duplicateItem([row({ id: 'a', position: 0 }), row({ id: 'b', media_id: 'm2', position: 1 })], 1, 'x');
    expect(out.map((i) => i.id)).toEqual(['a', 'b', 'x']);
  });

  it('funciona para widget e link', () => {
    const w = duplicateItem([row({ media_id: null, widget_id: 'w1' })], 0, 'x');
    expect(w[1]).toMatchObject({ media_id: null, widget_id: 'w1' });
    const l = duplicateItem([row({ media_id: null, external_link_id: 'l1' })], 0, 'x');
    expect(l[1]).toMatchObject({ media_id: null, external_link_id: 'l1' });
  });

  it('índice inválido não altera nada', () => {
    const items = [row()];
    expect(duplicateItem(items, 5, 'x')).toEqual(items);
    expect(duplicateItem(items, -1, 'x')).toEqual(items);
  });
});

describe('duplicar -> salvar (conectado ao banco)', () => {
  it('o payload do RPC leva os DOIS itens da mesma mídia, com duração e agendamento', () => {
    const payload = buildSaveItems(duplicateItem([row()], 0, 'x'));
    expect(payload).toHaveLength(2);
    expect(payload[0]).toEqual(payload[1]);
    expect(payload[1]).toMatchObject({ media_id: 'm1', duration: 30, start_time: '08:00', end_time: '18:30', days: [1, 3, 5] });
  });
});

describe('ItemDuplicateButton', () => {
  it('tem rótulo acessível e dispara o callback', () => {
    const onDuplicate = vi.fn();
    render(<ItemDuplicateButton onDuplicate={onDuplicate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar mídia' }));
    expect(onDuplicate).toHaveBeenCalledTimes(1);
  });
});

describe('fiação nas duas telas', () => {
  const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
  it('Lista de Reprodução da tela: duração, agendamento, duplicar e lixeira, nessa ordem', () => {
    const src = read('src/pages/dashboard/ScreenDetails.tsx');
    const a = src.indexOf('<ItemDurationInput');
    const b = src.indexOf('<ItemScheduleButton');
    const c = src.indexOf('<ItemDuplicateButton');
    const d = src.indexOf('aria-label="Remover da playlist"');
    expect(a).toBeGreaterThan(-1);
    expect(a < b && b < c && c < d).toBe(true);
    expect(src).toContain('duplicateItem(');
  });
  it('Editor da playlist: mesmo conjunto de controles', () => {
    const src = read('src/components/playlists/PlaylistItemsDialog.tsx');
    expect(src).toContain('<ItemDuplicateButton');
    expect(src).toContain('duplicateItem(');
  });
});
