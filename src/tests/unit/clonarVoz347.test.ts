// F-346/F-347: a voz é TRATADA antes de clonar (regra absoluta do dono): sem estalo, sem respiro, sem espaço, no ritmo do locutor
import { describe, expect, it } from 'vitest';
import { blocosDeFala, contarSilabas, fatorDeRitmo, montarSemRespiro, pausaDepois, tirarEstalos, VOZES_PARA_CLONAR, MAX_ACELERAR, deBase64, paraBase64 } from '@/lib/studio/audio/clonarVoz';
import type { Som } from '@/lib/studio/audio/som';

const sr = 8000;
const tom = (seg: number, amp = 0.3): Float32Array => Float32Array.from({ length: Math.round(seg * sr) }, (_, i) => amp * Math.sin((2 * Math.PI * 200 * i) / sr));

describe('F-347 clonar voz no Editor de Áudio', () => {
  it('a voz Sérgio Vaz está na lista para clonar', () => {
    expect(VOZES_PARA_CLONAR.map((v) => v.nome)).toContain('Sérgio Vaz');
  });
  it('tira o estalo (pico curtíssimo) e mantém a fala', () => {
    const c = tom(0.5, 0.1); c[2000] = 0.95; c[2001] = -0.9;
    const r = tirarEstalos({ sr, canais: [c] }).canais[0];
    expect(Math.abs(r[2000])).toBeLessThan(0.2);
    expect(Math.abs(r[1000] - c[1000])).toBeLessThan(1e-6);
  });
  it('junta palavras coladas e separa onde havia pausa/respiro', () => {
    const b = blocosDeFala([{ texto: 'Atenção!', ini: 0, fim: 0.5 }, { texto: 'Chegou', ini: 1.2, fim: 1.5 }, { texto: 'o', ini: 1.52, fim: 1.6 }, { texto: 'fecha', ini: 1.62, fim: 1.9 }]);
    expect(b).toHaveLength(2);
    expect(b[1].texto).toBe('Chegou o fecha');
  });
  it('sem respiro: o silêncio/respiração entre os blocos sai (fica só a micro-pausa)', () => {
    const c = new Float32Array(Math.round(3 * sr)); c.set(tom(0.5), 0); c.set(tom(0.5), Math.round(2 * sr)); // 1,5 s de "respiro" no meio
    const s: Som = { sr, canais: [c] };
    const r = montarSemRespiro(s, [{ ini: 0, fim: 0.5, texto: 'Atenção!' }, { ini: 2, fim: 2.5, texto: 'Corre' }]);
    const dur = r.canais[0].length / sr;
    expect(dur).toBeLessThan(1.2);
    expect(dur).toBeGreaterThan(1 + pausaDepois('Atenção!') - 0.01);
  });
  it('ritmo: acelera até o do locutor, nunca desacelera e nunca passa de 1,5×', () => {
    expect(fatorDeRitmo(60, 10)).toBeCloseTo(7.6 / 6, 2);
    expect(fatorDeRitmo(30, 10)).toBe(MAX_ACELERAR);
    expect(fatorDeRitmo(90, 10)).toBe(1);
    expect(contarSilabas(['Atenção', 'chegou'])).toBe(5);
  });
  it('base64 vai e volta igual', () => {
    const b = Uint8Array.from({ length: 70000 }, (_, i) => i % 251);
    expect(deBase64(paraBase64(b))).toEqual(b);
  });
});
