// SOBRE MÍDIA STUDIO — movimento dos carrosséis (F-224), separado da tela para ser testado.
// Anda devagar para sempre; o gesto dá impulso (acelera ou inverte) e depois volta aos poucos à velocidade de
// cruzeiro NO SENTIDO EM QUE FICOU (passar o dedo para o outro lado troca o sentido).

export const CRUZEIRO = 0.035; // px por ms (≈ 35 px/s)
export const IMPULSO_MAXIMO = 4; // px por ms

export interface EstadoDoCarrossel { x: number; v: number }

/** Avança `dt` ms: a velocidade relaxa até o cruzeiro (no sentido atual) e a posição dá a volta em `total` px. */
export function passoDoCarrossel(e: EstadoDoCarrossel, dt: number, direcaoInicial: -1 | 1, total: number): EstadoDoCarrossel {
  const alvo = (Math.sign(e.v) || direcaoInicial) * CRUZEIRO;
  const v = e.v + (alvo - e.v) * (1 - Math.exp(-dt / 1400));
  let x = e.x + v * dt;
  if (total > 0) x = (((x % total) + total) % total) - total;
  return { x, v };
}

/** Velocidade depois de soltar o dedo (gesto curto e lento não muda nada). */
export function impulsoDoGesto(vAtual: number, velocidadeDoDedo: number): number {
  if (Math.abs(velocidadeDoDedo) <= 0.05) return vAtual;
  return Math.max(-IMPULSO_MAXIMO, Math.min(IMPULSO_MAXIMO, velocidadeDoDedo * 1.6));
}
