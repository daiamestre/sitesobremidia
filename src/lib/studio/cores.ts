// SOBRE MÍDIA STUDIO — cores do editor (F-224): paleta pronta + as últimas cores usadas, guardadas no aparelho,
// para a cor escolhida não se perder (e poder ser repetida em outro texto, como no Canva).
import type { Documento } from './documento';

export const PALETA = [
  '#ffffff', '#000000', '#1f2937', '#9ca3af', '#ffd21f', '#ffb000', '#ff7a00', '#ff3b30', '#e11d48', '#ff3df2',
  '#8a2eff', '#5d1bff', '#2563eb', '#22d3ee', '#14b8a6', '#25d366', '#84cc16', '#d4ff00', '#7c2d12', '#f5e6c8',
];
const CHAVE = 'studio-cores-recentes';

export const corHex = (c: string | null | undefined) => (c && /^#[0-9a-f]{6}/i.test(c) ? c.slice(0, 7).toLowerCase() : null);

export function coresRecentes(): string[] {
  try { const l = JSON.parse(localStorage.getItem(CHAVE) ?? '[]'); return Array.isArray(l) ? l.filter((c) => corHex(c)).slice(0, 12) : []; } catch { return []; }
}

export function lembrarCor(c: string) {
  const h = corHex(c);
  if (!h) return;
  try { localStorage.setItem(CHAVE, JSON.stringify([h, ...coresRecentes().filter((x) => x !== h)].slice(0, 12))); } catch { /* sem armazenamento */ }
}

/** Cores já usadas na arte (para repetir a mesma cor em outro elemento). */
export function coresDoDocumento(d: Documento): string[] {
  const s = new Set<string>();
  const add = (c?: string | null) => { const h = corHex(c); if (h) s.add(h); };
  add(d.fundo);
  for (const c of d.camadas) {
    if (c.tipo === 'texto') { add(c.cor); add(c.corUltimaLinha); add(c.fundo?.cor); }
    else if (c.tipo === 'forma') { add(c.cor); add(c.borda?.cor); }
    else if (c.tipo === 'selo') { add(c.cor); add(c.corTexto); }
    else if (c.tipo === 'itens') { add(c.cor); add(c.destaque); }
  }
  return [...s].slice(0, 14);
}
