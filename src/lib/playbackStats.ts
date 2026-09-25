import { addDays, endOfDay, format, startOfDay, subDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

export type StatsPeriod = 'today' | 'week' | 'month';
export interface StatsPoint { name: string; value: number }
export interface BucketRow { bucket: string; total: number | string }

const PERIOD_DAYS: Record<Exclude<StatsPeriod, 'today'>, number> = { week: 7, month: 30 };

/** Janela [início, fim] e granularidade (hora no "Hoje", dia nos demais). */
export function statsWindow(period: StatsPeriod, now: Date) {
    if (period === 'today') return { start: startOfDay(now), end: endOfDay(now), bucket: 'hour' as const };
    const days = PERIOD_DAYS[period];
    return { start: startOfDay(subDays(now, days - 1)), end: endOfDay(now), bucket: 'day' as const };
}

/** Rótulos do eixo X, na ordem, todos presentes mesmo sem exibições (barra zero). */
export function statsLabels(period: StatsPeriod, now: Date): string[] {
    const { start } = statsWindow(period, now);
    if (period === 'today') {
        return Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);
    }
    const days = PERIOD_DAYS[period];
    return Array.from({ length: days }, (_, i) => format(addDays(start, i), 'dd/MM'));
}

/** Converte as linhas agregadas pelo banco no formato do gráfico. */
export function fillStatsBuckets(period: StatsPeriod, now: Date, rows: BucketRow[]): StatsPoint[] {
    const labels = statsLabels(period, now);
    const counts: Record<string, number> = Object.fromEntries(labels.map(l => [l, 0]));
    const fmt = period === 'today' ? 'HH:00' : 'dd/MM';
    for (const r of rows) {
        const label = format(new Date(r.bucket), fmt);
        if (counts[label] !== undefined) counts[label] += Number(r.total) || 0;
    }
    return labels.map(name => ({ name, value: counts[name] }));
}

function browserTimeZone(): string {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo'; } catch { return 'America/Sao_Paulo'; }
}

/**
 * Exibições por hora/dia. A contagem é feita NO BANCO (fn_playback_stats): o PostgREST corta consultas em 1000 linhas e
 * telas com mais de 1000 exibições/dia apareciam zeradas ou incompletas quando o painel contava no navegador.
 * `screenId = null` soma todas as telas que o usuário pode ver (RLS).
 */
export async function fetchPlaybackStats(screenId: string | null, period: StatsPeriod, now: Date = new Date()): Promise<StatsPoint[]> {
    const { start, end, bucket } = statsWindow(period, now);
    const { data, error } = await supabase.rpc('fn_playback_stats' as never, {
        p_screen_id: screenId,
        p_from: start.toISOString(),
        p_to: end.toISOString(),
        p_bucket: bucket,
        p_tz: browserTimeZone(),
    } as never);
    if (error) throw error;
    return fillStatsBuckets(period, now, (data as unknown as BucketRow[]) || []);
}

export interface ScreenPlaybackTotal { count: number; last_playback: string | null }

/** Total e última exibição por tela (agregado no banco). */
export async function fetchPlaybackTotals(screenIds: string[]): Promise<Record<string, ScreenPlaybackTotal>> {
    if (screenIds.length === 0) return {};
    const { data, error } = await supabase.rpc('fn_playback_totals' as never, { p_screen_ids: screenIds } as never);
    if (error) throw error;
    const out: Record<string, ScreenPlaybackTotal> = {};
    for (const r of ((data as unknown as Array<{ screen_id: string; total: number | string; last_at: string | null }>) || [])) {
        out[r.screen_id] = { count: Number(r.total) || 0, last_playback: r.last_at };
    }
    return out;
}
