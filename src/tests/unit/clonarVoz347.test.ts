// F-347/F-348: a voz é TRATADA antes de clonar, com edição profissional: sem estalo, respiro só sai das pausas,
// pausa longa fica natural, palavra NUNCA é cortada e NADA é acelerado
import { describe, expect, it } from 'vitest';
import { editarPausas, pausaNatural, tirarEstalos, VOZES_PARA_CLONAR, deBase64, paraBase64 } from '@/lib/studio/audio/clonarVoz';
import type { Som } from '@/lib/studio/audio/som';

const sr = 8000;
const tom = (seg: number, amp = 0.3) => Float32Array.from({ length: Math.round(seg * sr) }, (_, i) => amp * Math.sin((2 * Math.PI * 200 * i) / sr));
/** fala 0–0,5 s · respiro fraco 0,9–1,3 s · fala 2,0–2,5 s */
function gravacao(): Som {
  const c = new Float32Array(Math.round(3 * sr));
  c.set(tom(0.5), 0); c.set(tom(0.4, 0.01), Math.round(0.9 * sr)); c.set(tom(0.5), Math.round(2 * sr));
  return { sr, canais: [c] };
}
const palavras = [{ texto: 'Atenção!', ini: 0, fim: 0.5 }, { texto: 'Corre', ini: 2, fim: 2.5 }];

describe('F-347/F-348 clonar voz no Editor de Áudio', () => {
  it('a voz Sérgio Vaz está na lista para clonar', () => { expect(VOZES_PARA_CLONAR.map((v) => v.nome)).toContain('Sérgio Vaz'); });
  it('tira o estalo (pico curtíssimo) e mantém a fala', () => {
    const c = tom(0.5, 0.1); c[2000] = 0.95; c[2001] = -0.9;
    const r = tirarEstalos({ sr, canais: [c] }).canais[0];
    expect(Math.abs(r[2000])).toBeLessThan(0.2);
    expect(Math.abs(r[1000] - c[1000])).toBeLessThan(1e-6);
  });
  it('a pausa longa de 1,5 s fica natural (0,30 s depois de "!"), o respiro dentro dela sai, e as palavras ficam inteiras', () => {
    const r = editarPausas(gravacao(), palavras);
    const y = r.som.canais[0];
    expect(r.pausas).toBe(1);
    expect(r.depois).toBeGreaterThan(1.0 + pausaNatural('Atenção!') - 0.02); // as duas falas (1 s) inteiras + a pausa
    expect(r.depois).toBeLessThan(1.6);
    // nenhum som de respiro na pausa: o meio dela é silêncio puro
    const meio = Math.round((0.5 + 0.06 + 0.12) * sr);
    expect(Math.abs(y[meio])).toBe(0);
    // a 2ª palavra chega inteira (o fim dela ainda tem som)
    expect(Math.max(...Array.from(y.slice(y.length - Math.round(0.2 * sr), y.length - Math.round(0.1 * sr))).map(Math.abs))).toBeGreaterThan(0.1);
  });
  it('pausa curta (menos de 0,22 s) não é mexida e nada é acelerado', () => {
    const c = new Float32Array(Math.round(1.2 * sr)); c.set(tom(0.5), 0); c.set(tom(0.5), Math.round(0.65 * sr));
    const r = editarPausas({ sr, canais: [c] }, [{ texto: 'Chegou', ini: 0, fim: 0.5 }, { texto: 'o', ini: 0.65, fim: 1.15 }]);
    expect(r.pausas).toBe(0);
    expect(r.depois).toBeGreaterThan(1.15);
  });
  it('base64 vai e volta igual', () => {
    const b = Uint8Array.from({ length: 70000 }, (_, i) => i % 251);
    expect(deBase64(paraBase64(b))).toEqual(b);
  });
});
