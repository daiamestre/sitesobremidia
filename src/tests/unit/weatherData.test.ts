import { describe, it, expect } from 'vitest';
import { descreverClima, parseOpenMeteo, rotuloDia } from '@/lib/weatherData';

describe('Clima — camada de dados (separada do visual)', () => {
  const body = {
    current: { temperature_2m: 29.2, apparent_temperature: 31.4, relative_humidity_2m: 70, wind_speed_10m: 12.2, is_day: 1, weather_code: 0 },
    daily: { time: ['2026-09-25', '2026-09-26', '2026-09-27'], weather_code: [0, 2, 61], temperature_2m_max: [32.4, 31, 28.6], temperature_2m_min: [24.1, 23.6, 22] },
  };

  it('atual, máxima, mínima e próximos dias', () => {
    const d = parseOpenMeteo(body)!;
    expect(d).toMatchObject({ temp: 29, sensacao: 31, umidade: 70, ventoKmh: 12, max: 32, min: 24, isDay: true });
    expect(d.dias.map((x) => [x.dia, x.max, x.min, x.code])).toEqual([['2026-09-25', 32, 24, 0], ['2026-09-26', 31, 24, 2], ['2026-09-27', 29, 22, 61]]);
  });

  it('sem bloco "current" = indisponível (null), nunca quebra', () => {
    expect(parseOpenMeteo({})).toBeNull();
    expect(parseOpenMeteo(null)).toBeNull();
    const semDaily = parseOpenMeteo({ current: { temperature_2m: 20 } })!;
    expect(semDaily.max).toBeNull();
    expect(semDaily.dias).toEqual([]);
  });

  it('descrição/ícone por código WMO e rótulo dos dias (igual ao Player)', () => {
    expect(descreverClima(0, true)).toEqual({ texto: 'Céu limpo', icone: 'sol' });
    expect(descreverClima(0, false).icone).toBe('lua');
    expect(descreverClima(95, true).texto).toBe('Tempestade');
    expect(rotuloDia('2026-09-25', 0)).toBe('HOJE');
    expect(rotuloDia('2026-09-26', 1)).toBe('SÁB');
    expect(rotuloDia('2026-09-28', 3)).toBe('SEG');
  });
});
