import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));

import { brasiliaDateLong, brasiliaDateShort, brasiliaHour, brasiliaTime, msUntilNextTick, BRASILIA_TZ } from '@/lib/brasiliaTime';

/**
 * Prova (item 38): instante UTC conhecido -> America/Sao_Paulo -> texto exibido. O Intl recebe o fuso de Brasília
 * explicitamente, então o resultado não depende do fuso do processo/navegador (TZ do processo aqui é o da máquina).
 */
describe('Horário de Brasília (web)', () => {
  const instante = new Date(Date.UTC(2026, 8, 25, 17, 37, 52)); // 14:37:52 em Brasília

  it('usa explicitamente America/Sao_Paulo', () => {
    expect(BRASILIA_TZ).toBe('America/Sao_Paulo');
    expect(brasiliaTime(instante, true)).toBe('14:37:52');
    expect(brasiliaTime(instante, false)).toBe('14:37');
    expect(brasiliaDateLong(instante)).toBe('SEXTA-FEIRA · 25 DE SETEMBRO DE 2026');
    expect(brasiliaDateShort(instante)).toBe('25/09/2026');
    expect(brasiliaHour(instante)).toBe(14);
  });

  it('não é o horário UTC nem o do processo', () => {
    expect(instante.getUTCHours()).toBe(17);
    expect(brasiliaTime(instante, false)).not.toBe('17:37');
  });

  it('virada do dia segue Brasília (02:59:59Z ainda é o dia anterior)', () => {
    const antes = new Date(Date.UTC(2026, 8, 26, 2, 59, 59));
    expect(brasiliaTime(antes, true)).toBe('23:59:59');
    expect(brasiliaDateShort(antes)).toBe('25/09/2026');
    const depois = new Date(antes.getTime() + 1000);
    expect(brasiliaTime(depois, true)).toBe('00:00:00');
    expect(brasiliaDateLong(depois)).toBe('SÁBADO · 26 DE SETEMBRO DE 2026');
  });

  it('agenda a atualização exatamente na virada de segundo/minuto', () => {
    const t = instante.getTime() + 250;
    expect(msUntilNextTick(t, true)).toBe(750);
    expect(msUntilNextTick(t, false)).toBe(7750);
    expect(msUntilNextTick(instante.getTime(), true)).toBe(1000);
  });
});
