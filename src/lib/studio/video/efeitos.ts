// SOBRE MÍDIA STUDIO — EDITOR DE VÍDEO (F-227): filtros, ajustes, vinheta e transições, desenhados no canvas.
import type { Ajustes, Clipe, TipoDeFiltro, TipoDeTransicao } from './linha';

export const FILTROS: { id: TipoDeFiltro; nome: string; css: string }[] = [
  { id: 'nenhum', nome: 'Original', css: '' },
  { id: 'vivido', nome: 'Vívido', css: 'saturate(1.55) contrast(1.08)' },
  { id: 'quente', nome: 'Quente', css: 'sepia(0.28) saturate(1.35) brightness(1.03)' },
  { id: 'frio', nome: 'Frio', css: 'saturate(1.1) hue-rotate(-12deg) brightness(1.02) contrast(1.05)' },
  { id: 'drama', nome: 'Drama', css: 'contrast(1.4) brightness(0.9) saturate(1.15)' },
  { id: 'pb', nome: 'Preto e branco', css: 'grayscale(1) contrast(1.12)' },
  { id: 'sepia', nome: 'Sépia', css: 'sepia(0.85)' },
  { id: 'vintage', nome: 'Vintage', css: 'sepia(0.45) contrast(0.92) brightness(1.05) saturate(0.85)' },
  { id: 'desbotado', nome: 'Desbotado', css: 'saturate(0.6) contrast(0.85) brightness(1.1)' },
  { id: 'noite', nome: 'Noite', css: 'brightness(0.75) contrast(1.2) hue-rotate(-20deg) saturate(1.2)' },
  { id: 'neon', nome: 'Neon', css: 'saturate(2) contrast(1.25) hue-rotate(15deg)' },
  { id: 'pastel', nome: 'Pastel', css: 'saturate(0.75) brightness(1.15) contrast(0.9)' },
];

export const TRANSICOES: { id: TipoDeTransicao; nome: string }[] = [
  { id: 'corte', nome: 'Corte seco' }, { id: 'dissolver', nome: 'Dissolver' }, { id: 'preto', nome: 'Escurecer' }, { id: 'branco', nome: 'Clarão' },
  { id: 'deslizar-esquerda', nome: 'Deslizar ←' }, { id: 'deslizar-direita', nome: 'Deslizar →' }, { id: 'deslizar-cima', nome: 'Subir' },
  { id: 'zoom', nome: 'Zoom' }, { id: 'cortina', nome: 'Cortina' }, { id: 'circulo', nome: 'Círculo' }, { id: 'girar', nome: 'Girar' },
];

/** Texto do `ctx.filter` para o clipe: filtro escolhido + ajustes finos. */
export function filtroDoClipe(f: TipoDeFiltro, a: Ajustes, escala = 1): string {
  const partes = [FILTROS.find((x) => x.id === f)?.css ?? ''];
  if (a.brilho !== 100) partes.push(`brightness(${a.brilho}%)`);
  if (a.contraste !== 100) partes.push(`contrast(${a.contraste}%)`);
  if (a.saturacao !== 100) partes.push(`saturate(${a.saturacao}%)`);
  if (a.matiz) partes.push(`hue-rotate(${a.matiz}deg)`);
  if (a.desfoque > 0) partes.push(`blur(${(a.desfoque * escala).toFixed(1)}px)`);
  return partes.filter(Boolean).join(' ') || 'none';
}

/** Escurece as bordas (0–100). */
export function desenharVinheta(ctx: CanvasRenderingContext2D, w: number, h: number, forca: number) {
  if (forca <= 0) return;
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) / 2);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${Math.min(0.95, forca / 100)})`);
  ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.restore();
}

/** Onde e de que tamanho a mídia é desenhada: cobrir (corta) ou conter (inteira), com zoom e foco. */
export function caixaDaMidia(mw: number, mh: number, w: number, h: number, c: Pick<Clipe, 'ajuste' | 'focoX' | 'focoY'>, zoom: number) {
  const s = (c.ajuste === 'conter' ? Math.min(w / mw, h / mh) : Math.max(w / mw, h / mh)) * zoom;
  const dw = mw * s, dh = mh * s;
  const dx = c.ajuste === 'conter' && zoom <= 1 ? (w - dw) / 2 : (w - dw) * (c.focoX / 100);
  const dy = c.ajuste === 'conter' && zoom <= 1 ? (h - dh) / 2 : (h - dh) * (c.focoY / 100);
  return { dx, dy, dw, dh };
}

/** Mistura dois quadros durante a transição (p de 0 a 1). `a` e `b` desenham cada clipe por inteiro. */
export function desenharTransicao(ctx: CanvasRenderingContext2D, tipo: TipoDeTransicao, p: number, w: number, h: number, a: () => void, b: () => void) {
  const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // suave nas pontas
  const camada = (f: () => void, prep: () => void) => { ctx.save(); prep(); f(); ctx.restore(); };
  switch (tipo) {
    case 'corte': b(); return;
    case 'dissolver': a(); camada(b, () => { ctx.globalAlpha = e; }); return;
    case 'preto': case 'branco': {
      if (p < 0.5) a(); else b();
      ctx.save(); ctx.globalAlpha = 1 - Math.abs(1 - 2 * p); ctx.fillStyle = tipo === 'preto' ? '#000' : '#fff'; ctx.fillRect(0, 0, w, h); ctx.restore();
      return;
    }
    case 'deslizar-esquerda': camada(a, () => ctx.translate(-e * w, 0)); camada(b, () => ctx.translate((1 - e) * w, 0)); return;
    case 'deslizar-direita': camada(a, () => ctx.translate(e * w, 0)); camada(b, () => ctx.translate(-(1 - e) * w, 0)); return;
    case 'deslizar-cima': camada(a, () => ctx.translate(0, -e * h)); camada(b, () => ctx.translate(0, (1 - e) * h)); return;
    case 'zoom':
      camada(a, () => { ctx.globalAlpha = 1 - e; ctx.translate(w / 2, h / 2); ctx.scale(1 + e * 0.6, 1 + e * 0.6); ctx.translate(-w / 2, -h / 2); });
      camada(b, () => { ctx.globalAlpha = e; ctx.translate(w / 2, h / 2); ctx.scale(0.7 + 0.3 * e, 0.7 + 0.3 * e); ctx.translate(-w / 2, -h / 2); });
      return;
    case 'cortina': a(); camada(b, () => { ctx.beginPath(); ctx.rect(0, 0, w * e, h); ctx.clip(); }); return;
    case 'circulo': a(); camada(b, () => { ctx.beginPath(); ctx.arc(w / 2, h / 2, (Math.hypot(w, h) / 2) * e, 0, Math.PI * 2); ctx.clip(); }); return;
    case 'girar':
      a();
      camada(b, () => { ctx.globalAlpha = e; ctx.translate(w / 2, h / 2); ctx.rotate((1 - e) * -0.5); ctx.scale(0.6 + 0.4 * e, 0.6 + 0.4 * e); ctx.translate(-w / 2, -h / 2); });
      return;
  }
}
