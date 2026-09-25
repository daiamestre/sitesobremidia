import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));

import { fillStatsBuckets, statsLabels, statsWindow } from '@/lib/playbackStats';

const NOW = new Date(2026, 8, 25, 14, 30, 0); // 25/09/2026 14:30 (hora local do teste)

describe('playbackStats', () => {
    it('rótulos: 24 horas no Hoje, 7 e 30 dias nos demais, sempre completos', () => {
        expect(statsLabels('today', NOW)).toHaveLength(24);
        expect(statsLabels('today', NOW)[0]).toBe('00:00');
        const week = statsLabels('week', NOW);
        expect(week).toHaveLength(7);
        expect(week[6]).toBe('25/09');
        expect(week[0]).toBe('19/09');
        expect(statsLabels('month', NOW)).toHaveLength(30);
    });

    it('janela: hora no Hoje, dia nos demais', () => {
        expect(statsWindow('today', NOW).bucket).toBe('hour');
        expect(statsWindow('week', NOW).bucket).toBe('day');
    });

    it('soma o que o banco agregou e mantém barras zeradas', () => {
        const rows = [
            { bucket: new Date(2026, 8, 23, 0, 0, 0).toISOString(), total: '1228' }, // bigint vem como string
            { bucket: new Date(2026, 8, 25, 0, 0, 0).toISOString(), total: 4 },
        ];
        const out = fillStatsBuckets('week', NOW, rows);
        expect(out.find(p => p.name === '23/09')?.value).toBe(1228);
        expect(out.find(p => p.name === '25/09')?.value).toBe(4);
        expect(out.find(p => p.name === '24/09')?.value).toBe(0);
        expect(out.reduce((a, p) => a + p.value, 0)).toBe(1232);
    });

    it('Hoje: uma barra por hora', () => {
        const rows = [{ bucket: new Date(2026, 8, 25, 9, 0, 0).toISOString(), total: 57 }];
        const out = fillStatsBuckets('today', NOW, rows);
        expect(out.find(p => p.name === '09:00')?.value).toBe(57);
        expect(out).toHaveLength(24);
    });

    it('descarta linhas fora da janela em vez de quebrar', () => {
        const rows = [{ bucket: new Date(2026, 0, 1).toISOString(), total: 9 }];
        expect(fillStatsBuckets('week', NOW, rows).every(p => p.value === 0)).toBe(true);
    });
});
