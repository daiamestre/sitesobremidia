/**
 * Regras puras da lista de reprodução (duração + agendamento por item) e gravação atômica.
 *
 * Auditoria playlist Painel -> Banco -> RPC -> Player (2026-09-25):
 *  - o painel salvava com DELETE de tudo + INSERT em chamadas separadas (playlist vazia se o INSERT falhasse);
 *  - o INSERT omitia start_time/end_time/days (o agendamento nunca era gravado e cada "Salvar" apagava o existente);
 *  - a duração aceitava 0/negativo.
 * Agora tudo passa por `savePlaylistItems` -> RPC `fn_save_playlist_items` (uma transação, valida antes de apagar).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const MIN_DURATION_SECONDS = 1;
export const MAX_DURATION_SECONDS = 86400;
export const DEFAULT_DURATION_SECONDS = 10;

export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;
export const WEEKDAY_LETTER = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const;
export const WEEKDAY_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const;

/** Campos de um item de playlist que o painel edita/grava. */
export interface EditableItem {
  id: string;
  media_id: string | null;
  widget_id?: string | null;
  external_link_id?: string | null;
  duration: number;
  start_time?: string | null;
  end_time?: string | null;
  days?: number[] | null;
}

export interface SaveItemPayload {
  media_id: string | null;
  widget_id: string | null;
  external_link_id: string | null;
  duration: number;
  start_time: string | null;
  end_time: string | null;
  days: number[] | null;
}

/** Duração válida (1 s .. 24 h). Vazio/inválido volta ao padrão de 10 s — nunca a 0. */
export function clampDuration(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(n)) return DEFAULT_DURATION_SECONDS;
  return Math.min(MAX_DURATION_SECONDS, Math.max(MIN_DURATION_SECONDS, Math.round(n)));
}

/** "18:30:00" | "18:30" -> "18:30"; vazio ou inválido -> null. */
export function normalizeTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Dias da semana 0=Dom..6=Sáb, sem repetidos, ordenados; vazio -> null (sem restrição). */
export function normalizeDays(days: number[] | null | undefined): number[] | null {
  if (!days || days.length === 0) return null;
  const valid = Array.from(new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))).sort((a, b) => a - b);
  return valid.length > 0 ? valid : null;
}

export function hasSchedule(item: Pick<EditableItem, 'start_time' | 'end_time' | 'days'>): boolean {
  return !!normalizeTime(item.start_time) || !!normalizeTime(item.end_time) || !!normalizeDays(item.days);
}

/** Texto curto do agendamento, ex.: "08:00–18:30", "Seg, Qua, Sex", "a partir de 08:00 · Dom, Sáb". */
export function scheduleSummary(item: Pick<EditableItem, 'start_time' | 'end_time' | 'days'>): string {
  const start = normalizeTime(item.start_time);
  const end = normalizeTime(item.end_time);
  const days = normalizeDays(item.days);
  const parts: string[] = [];
  if (start && end) parts.push(`${start}–${end}`);
  else if (start) parts.push(`a partir de ${start}`);
  else if (end) parts.push(`até ${end}`);
  if (days) parts.push(days.length === 7 ? 'Todos os dias' : days.map((d) => WEEKDAY_SHORT[d]).join(', '));
  return parts.length > 0 ? parts.join(' · ') : 'Sempre';
}

/** Payload EXATO que vai para o banco: duração válida, agendamento normalizado, mesma mídia pode repetir. */
export function buildSaveItems(items: EditableItem[]): SaveItemPayload[] {
  return items.map((i) => ({
    media_id: i.media_id ?? null,
    widget_id: i.widget_id ?? null,
    external_link_id: i.external_link_id ?? null,
    duration: clampDuration(i.duration),
    start_time: normalizeTime(i.start_time),
    end_time: normalizeTime(i.end_time),
    days: normalizeDays(i.days),
  }));
}

export function totalDurationSeconds(items: Pick<EditableItem, 'duration'>[]): number {
  return items.reduce((acc, i) => acc + clampDuration(i.duration), 0);
}

export function formatTotalDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

type RpcClient = Pick<SupabaseClient, 'rpc'>;

/** Grava a lista inteira numa única transação (tudo ou nada). Lança se o banco recusar; a playlist antiga fica intacta. */
export async function savePlaylistItems(
  client: RpcClient,
  playlistId: string,
  items: EditableItem[]
): Promise<{ count: number }> {
  const { data, error } = await client.rpc('fn_save_playlist_items', {
    p_playlist_id: playlistId,
    p_items: buildSaveItems(items),
  });
  if (error) throw new Error(error.message);
  const count = (data as { count?: number } | null)?.count;
  return { count: typeof count === 'number' ? count : items.length };
}

/**
 * Duplica o item `index`: a cópia entra logo depois do original, com a MESMA mídia/widget/link, duração e agendamento
 * (o id é novo e a cópia é independente do original — os dias são clonados). A mesma mídia pode aparecer várias vezes na
 * playlist (o banco, a gravação atômica e o Player aceitam). Imutável; renumera `position` quando o item tem esse campo.
 */
export function duplicateItem<T extends EditableItem>(items: T[], index: number, newId: string): T[] {
  if (!Number.isInteger(index) || index < 0 || index >= items.length) return items;
  const original = items[index];
  const copy = { ...original, id: newId, days: original.days ? [...original.days] : original.days } as T;
  const out = [...items.slice(0, index + 1), copy, ...items.slice(index + 1)];
  return out.map((item, i) => ('position' in item ? ({ ...item, position: i } as T) : item));
}

let tempIdCounter = 0;
/** Id provisório (só existe até salvar; o banco gera o definitivo). Único mesmo em cliques no mesmo milissegundo. */
export function newTempItemId(prefix = 'temp-dup'): string {
  tempIdCounter += 1;
  return `${prefix}-${Date.now()}-${tempIdCounter}`;
}
