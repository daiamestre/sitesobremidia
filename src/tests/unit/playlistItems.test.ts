import { describe, it, expect, vi } from 'vitest';
import {
  MIN_DURATION_SECONDS,
  MAX_DURATION_SECONDS,
  clampDuration,
  normalizeTime,
  hasSchedule,
  scheduleSummary,
  buildSaveItems,
  totalDurationSeconds,
  savePlaylistItems,
  type EditableItem,
} from '@/lib/playlistItems';

const item = (over: Partial<EditableItem> = {}): EditableItem => ({
  id: 'i1',
  media_id: 'm1',
  widget_id: null,
  external_link_id: null,
  duration: 10,
  start_time: null,
  end_time: null,
  days: null,
  ...over,
});

describe('clampDuration (auditoria da lista de reprodução)', () => {
  it('nunca aceita 0 ou negativo (o Player pulava/piscava imagem de 0 s)', () => {
    expect(clampDuration(0)).toBe(MIN_DURATION_SECONDS);
    expect(clampDuration(-4)).toBe(MIN_DURATION_SECONDS);
  });
  it('campo vazio/inválido volta ao padrão de 10 s (e não a 0)', () => {
    expect(clampDuration('')).toBe(10);
    expect(clampDuration('abc')).toBe(10);
    expect(clampDuration(null)).toBe(10);
    expect(clampDuration(undefined)).toBe(10);
  });
  it('arredonda e limita a 24 h', () => {
    expect(clampDuration('12.6')).toBe(13);
    expect(clampDuration(999999)).toBe(MAX_DURATION_SECONDS);
    expect(clampDuration('58')).toBe(58);
  });
});

describe('normalizeTime', () => {
  it('aceita HH:MM e HH:MM:SS do banco e devolve HH:MM', () => {
    expect(normalizeTime('08:00')).toBe('08:00');
    expect(normalizeTime('18:30:00')).toBe('18:30');
  });
  it('vazio/inválido = null', () => {
    expect(normalizeTime('')).toBeNull();
    expect(normalizeTime(null)).toBeNull();
    expect(normalizeTime(undefined)).toBeNull();
    expect(normalizeTime('25:99')).toBeNull();
    expect(normalizeTime('abc')).toBeNull();
  });
});

describe('agendamento', () => {
  it('hasSchedule só é verdadeiro com horário ou dias', () => {
    expect(hasSchedule(item())).toBe(false);
    expect(hasSchedule(item({ days: [] }))).toBe(false);
    expect(hasSchedule(item({ start_time: '08:00:00' }))).toBe(true);
    expect(hasSchedule(item({ days: [1, 2] }))).toBe(true);
  });
  it('resumo legível', () => {
    expect(scheduleSummary(item())).toBe('Sempre');
    expect(scheduleSummary(item({ start_time: '08:00:00', end_time: '18:30:00' }))).toBe('08:00–18:30');
    expect(scheduleSummary(item({ days: [1, 3, 5] }))).toBe('Seg, Qua, Sex');
    expect(scheduleSummary(item({ start_time: '08:00', days: [0, 6] }))).toBe('a partir de 08:00 · Dom, Sáb');
    expect(scheduleSummary(item({ end_time: '12:00' }))).toBe('até 12:00');
    expect(scheduleSummary(item({ days: [0, 1, 2, 3, 4, 5, 6] }))).toBe('Todos os dias');
  });
});

describe('buildSaveItems — o que vai para o banco', () => {
  it('leva duração e agendamento (antes o salvar descartava start_time/end_time/days)', () => {
    const out = buildSaveItems([item({ duration: 25, start_time: '08:00:00', end_time: '18:30', days: [5, 1, 3, 3] })]);
    expect(out).toEqual([
      { media_id: 'm1', widget_id: null, external_link_id: null, duration: 25, start_time: '08:00', end_time: '18:30', days: [1, 3, 5] },
    ]);
  });
  it('normaliza duração inválida, vazios viram null e mantém a mesma mídia repetida', () => {
    const out = buildSaveItems([
      item({ id: 'a', duration: 0 }),
      item({ id: 'b', duration: 30, start_time: '', end_time: null, days: [] }),
      item({ id: 'c', duration: 5 }),
    ]);
    expect(out).toHaveLength(3);
    expect(out[0].duration).toBe(1);
    expect(out[1]).toMatchObject({ duration: 30, start_time: null, end_time: null, days: null });
    expect(out.map((o) => o.media_id)).toEqual(['m1', 'm1', 'm1']);
  });
  it('descarta dias fora de 0..6', () => {
    expect(buildSaveItems([item({ days: [1, 9, -1, 2] })])[0].days).toEqual([1, 2]);
  });
});

describe('totalDurationSeconds', () => {
  it('soma com o mesmo critério do que vai ser salvo', () => {
    expect(totalDurationSeconds([item({ duration: 20 }), item({ duration: 0 }), item({ duration: 10 })])).toBe(31);
  });
});

describe('savePlaylistItems — gravação atômica', () => {
  it('chama o RPC único (nunca delete + insert separados)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, count: 1 }, error: null });
    const client = { rpc } as unknown as Parameters<typeof savePlaylistItems>[0];
    const r = await savePlaylistItems(client, 'p1', [item({ duration: 12 })]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('fn_save_playlist_items', {
      p_playlist_id: 'p1',
      p_items: [{ media_id: 'm1', widget_id: null, external_link_id: null, duration: 12, start_time: null, end_time: null, days: null }],
    });
    expect(r.count).toBe(1);
  });
  it('propaga o erro do banco (a playlist antiga continua intacta)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'delete_denied: sem permissao' } });
    const client = { rpc } as unknown as Parameters<typeof savePlaylistItems>[0];
    await expect(savePlaylistItems(client, 'p1', [item()])).rejects.toThrow('delete_denied');
  });
});
