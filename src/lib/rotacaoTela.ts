/**
 * F-194 — Rotação da tela em 4 posições. O número é quanto o Player gira a imagem (sentido horário) para ela ficar EM PÉ
 * para quem olha a TV montada daquele jeito. A "base" é a borda de baixo da TV deitada (onde fica o pé e a marca).
 *  - 0   = TV deitada, normal (base embaixo)
 *  - 90  = TV em pé com a base à DIREITA
 *  - 180 = TV de cabeça para baixo (base em cima)
 *  - 270 = TV em pé com a base à ESQUERDA — padrão de toda tela 9x16 (totem)
 * Vale no Player 5.7.9+; o Player 5.7.8 entende só 90/270 (em pé).
 */
export type Rotacao = 0 | 90 | 180 | 270;

export const ROTACOES: { valor: Rotacao; titulo: string; base: string }[] = [
  { valor: 0, titulo: 'Deitada (normal)', base: 'Base da TV embaixo' },
  { valor: 270, titulo: 'Em pé — base à esquerda', base: 'Padrão para 9x16 (totem)' },
  { valor: 90, titulo: 'Em pé — base à direita', base: 'Totem montado do outro lado' },
  { valor: 180, titulo: 'De cabeça para baixo', base: 'Base da TV em cima' },
];

export const ehRotacao = (v: unknown): v is Rotacao => v === 0 || v === 90 || v === 180 || v === 270;

export const telaEmPe = (resolution?: string | null, orientation?: string | null): boolean => {
  if (orientation === 'portrait' || orientation === 'vertical' || resolution === '9x16') return true;
  const m = /^(\d+)x(\d+)$/.exec(resolution ?? '');
  return !!m && Number(m[1]) < Number(m[2]);
};

/** Rotação com que a tela nasce: 9x16 (em pé) = 270; deitada = 0. */
export const rotacaoPadrao = (resolution?: string | null, orientation?: string | null): Rotacao =>
  telaEmPe(resolution, orientation) ? 270 : 0;

export const tituloDaRotacao = (r: number | null | undefined) => ROTACOES.find((x) => x.valor === r)?.titulo ?? 'Deitada (normal)';

/** Próxima posição a cada toque no botão de rotação: 0° → 90° → 180° → 270° → 0°. */
export const proximaRotacao = (r: Rotacao): Rotacao => (((r + 90) % 360) as Rotacao);
