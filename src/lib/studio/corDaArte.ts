// F-296 (pedido do dono, 10/11/2026): o FLASH, a LUZ e o BRILHO das trocas de cena (palco, encarte e editor de vídeo) saem
// na COR DA ARTE que o cliente está vendo. Se ele girou o tom do fundo para rosa, o clarão é rosa; nunca branco fixo nem a
// cor de outro encarte. A cor base vem do encarte/palco (`corTema`) e gira pelo mesmo `hue-rotate` que a tela aplica no fundo.
import type { Documento } from './documento';

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
function rgb(cor: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(cor.trim()) ?? /^#?([0-9a-f]{3})$/i.exec(cor.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
const paraHex = ([r, g, b]: [number, number, number]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

/** Gira a cor como o filtro CSS `hue-rotate(graus)` (a mesma matriz do navegador): o efeito acompanha o tom da tela. */
export function girarMatiz(cor: string, graus: number): string {
  const c = rgb(cor);
  if (!c || !graus) return c ? paraHex(c) : cor;
  const a = (graus * Math.PI) / 180, cos = Math.cos(a), sen = Math.sin(a);
  const m = [
    0.213 + cos * 0.787 - sen * 0.213, 0.715 - cos * 0.715 - sen * 0.715, 0.072 - cos * 0.072 + sen * 0.928,
    0.213 - cos * 0.213 + sen * 0.143, 0.715 + cos * 0.285 + sen * 0.14, 0.072 - cos * 0.072 - sen * 0.283,
    0.213 - cos * 0.213 - sen * 0.787, 0.715 - cos * 0.715 + sen * 0.715, 0.072 + cos * 0.928 + sen * 0.072,
  ];
  const [r, g, b] = c;
  return paraHex([m[0] * r + m[1] * g + m[2] * b, m[3] * r + m[4] * g + m[5] * b, m[6] * r + m[7] * g + m[8] * b]);
}
/** mistura com branco (k de 0 a 1) */
export function clarear(cor: string, k: number): string {
  const c = rgb(cor);
  return c ? paraHex(c.map((v) => v + (255 - v) * k) as [number, number, number]) : cor;
}
/** mistura com preto (k de 0 a 1) */
export function escurecer(cor: string, k: number): string {
  const c = rgb(cor);
  return c ? paraHex(c.map((v) => v * (1 - k)) as [number, number, number]) : cor;
}
/** rgba() da cor com transparência */
export function comAlfa(cor: string, a: number): string {
  const c = rgb(cor);
  return c ? `rgba(${c[0]},${c[1]},${c[2]},${a})` : cor;
}

/** A cor da arte NESTE momento: a do encarte/palco (corTema ou o fundo), girada pelo tom escolhido no fundo oficial. */
export function corDoDocumento(d: Pick<Documento, 'fundo' | 'corTema' | 'camadas'> | null | undefined): string {
  if (!d) return '#ffffff';
  const base = d.corTema ?? (rgb(d.fundo) ? d.fundo : '#ffffff');
  const fundo = d.camadas.find((c) => c.nome === 'Fundo oficial' || c.nome === 'Fundo') as { matiz?: number } | undefined;
  return girarMatiz(base, fundo?.matiz ?? 0);
}

/** As cores dos efeitos de troca a partir da cor da arte: o clarão (quase branco, tingido) e a luz que passa (mais viva). */
export function coresDosEfeitos(cor: string) {
  return { clarao: clarear(cor, 0.55), luz: clarear(cor, 0.35), forte: cor };
}
