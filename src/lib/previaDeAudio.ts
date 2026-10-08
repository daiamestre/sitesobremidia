/**
 * F-162 — Prévia de áudio (tocar, pausar, avançar, volume). Regras puras do player; a tela está em
 * src/components/audio/PreviaDeAudio.tsx.
 */

/** 65 -> "1:05"; 3725 -> "1:02:05"; inválido -> "0:00". */
export function formatarTempo(segundos: number | null | undefined): string {
  const s = Number.isFinite(segundos) && (segundos as number) > 0 ? Math.floor(segundos as number) : 0;
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

/** Mantém o valor entre 0 e o máximo (e trata NaN como 0). */
export const limitar = (v: number, max: number) => (Number.isFinite(v) ? Math.min(Math.max(v, 0), Math.max(max, 0)) : 0);

/** Porcentagem já tocada (0–100) para a barra. */
export const porcentagemTocada = (atual: number, duracao: number) => (duracao > 0 ? Math.round((limitar(atual, duracao) / duracao) * 100) : 0);

/**
 * Só um áudio toca por vez em toda a tela: ao começar um, o que estava tocando é pausado.
 * Guardamos apenas o "pausador" do que está tocando.
 */
let pausarAtual: (() => void) | null = null;
export function anunciarQueComecou(pausar: () => void): void {
  if (pausarAtual && pausarAtual !== pausar) pausarAtual();
  pausarAtual = pausar;
}
export function anunciarQueParou(pausar: () => void): void {
  if (pausarAtual === pausar) pausarAtual = null;
}
