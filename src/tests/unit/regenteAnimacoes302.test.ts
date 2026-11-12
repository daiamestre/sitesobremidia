/**
 * F-302 (pedido do dono, 11/11/2026: tablet Multilaser M10 tem que rodar liso) — o REGENTE das animações:
 * um relógio só, orçamento por quadro, rodízio, pausa em segundo plano e menos quadros no aparelho fraco.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';

let filaRaf: Array<(t: number) => void> = [];
let relogio = 0;

beforeEach(() => {
  vi.resetModules();
  filaRaf = []; relogio = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => { filaRaf.push(cb); return filaRaf.length; });
  vi.spyOn(performance, 'now').mockImplementation(() => relogio);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/** roda um quadro da tela no instante t */
function quadro(t: number) { relogio = t; const f = filaRaf; filaRaf = []; f.forEach((cb) => cb(t)); }

describe('F-302: regente das animações', () => {
  it('nunca passa do orçamento do quadro: com muitas prévias, desenha algumas por quadro e as outras no seguinte (rodízio)', async () => {
    const r = await import('@/lib/studio/regente');
    r._redefinirAparelho(false);
    const desenhos: number[] = [];
    // cada desenho "gasta" 3 ms
    for (let i = 0; i < 20; i++) r.registrarAnimacao(null, () => { desenhos.push(i); relogio += 3; });
    quadro(100);
    const noPrimeiro = desenhos.length;
    expect(noPrimeiro).toBeGreaterThan(0);
    expect(noPrimeiro).toBeLessThan(20);           // orçamento de 9 ms → poucos por quadro, a tela fica livre
    quadro(117);
    expect(desenhos.slice(noPrimeiro)[0]).toBe(noPrimeiro); // o próximo quadro continua de onde parou (ninguém fica para trás)
  });
  it('cada prévia respeita os quadros por segundo (30 no aparelho bom, 15 no fraco)', async () => {
    const r = await import('@/lib/studio/regente');
    r._redefinirAparelho(true);
    expect(r.quadrosPorSegundo()).toBe(15);
    expect(r.densidadeDasPrevias()).toBe(1);
    let n = 0;
    r.registrarAnimacao(null, () => { n++; });
    for (let t = 1000; t <= 2000; t += 16) quadro(t);  // 1 s de tela a 60 Hz
    expect(n).toBeGreaterThanOrEqual(13);
    expect(n).toBeLessThanOrEqual(17);
    r._redefinirAparelho(false);
    expect(r.quadrosPorSegundo()).toBe(30);
  });
  it('fora da tela ou em segundo plano não desenha; ao tirar o registro para de vez', async () => {
    const r = await import('@/lib/studio/regente');
    r._redefinirAparelho(false);
    let n = 0;
    const tirar = r.registrarAnimacao(null, () => { n++; });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    quadro(500); quadro(600);
    expect(n).toBe(0);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    r.acordar(); quadro(700);
    expect(n).toBe(1);
    tirar();
    quadro(800); quadro(900);
    expect(n).toBe(1);
    expect(filaRaf.length).toBe(0); // sem nada registrado o relógio dorme
  });
  it('a prévia animada e o editor de vídeo usam o regente (sem relógio próprio a 60 qps)', () => {
    const previa = fs.readFileSync('src/components/studio/PreviaDocumento.tsx', 'utf8');
    expect(previa).toContain('registrarAnimacao(caixa.current');
    expect(previa).not.toContain('requestAnimationFrame(quadro)');
    expect(previa).toContain('densidadeDasPrevias()');
    const motor = fs.readFileSync('src/lib/studio/video/motor.ts', 'utf8');
    expect(motor).toContain('const PREVIA = aparelhoFraco() ? 0.34 : 0.5;');
  });
});
