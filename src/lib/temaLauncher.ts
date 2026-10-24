/**
 * F-213 — tema da launcher Sobre Mídia a partir da cor escolhida no painel. A cor pinta o fundo E o app inteiro (botões
 * Player e Menu, opções do Menu, pílulas e o painel do Menu); com imagem de capa o app continua na mesma cor.
 * A MESMA conta existe no aparelho (native-android-player/.../launcher/TemaDaLauncher.kt): a prévia sai igual à TV.
 * Sem cor = o tema padrão Sobre Mídia (índigo → violeta).
 */
export interface PaletaDaLauncher {
  /** degradê dos botões Player e Menu */
  botaoInicio: string;
  botaoFim: string;
  /** fundo das opções do Menu e das pílulas */
  superficie: string;
  /** opção do Menu selecionada */
  superficieFoco: string;
  /** contorno discreto das opções e pílulas */
  borda: string;
  /** painel do Menu (quase opaco) */
  gaveta: string;
  /** véu por cima da imagem de capa */
  veu: string;
}

const lerHex = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export function rgbParaHsv(r: number, g: number, b: number): [number, number, number] {
  const R = r / 255; const G = g / 255; const B = b / 255;
  const max = Math.max(R, G, B); const min = Math.min(R, G, B); const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === R) h = 60 * (((G - B) / d) % 6);
    else if (max === G) h = 60 * ((B - R) / d + 2);
    else h = 60 * ((R - G) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, max === 0 ? 0 : d / max, max];
}

export function hsvParaHex(h: number, s: number, v: number, alfa?: number): string {
  const c = v * s; const x = c * (1 - Math.abs(((h / 60) % 2) - 1)); const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const p = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0').toUpperCase();
  const a = alfa === undefined ? '' : Math.round(alfa * 255).toString(16).padStart(2, '0').toUpperCase();
  return `#${p(r)}${p(g)}${p(b)}${a}`;
}

/** Paleta do app na cor [corDoFundo] (#RRGGBB). null = tema padrão. Cor acinzentada continua acinzentada. */
export function paletaDaLauncher(corDoFundo?: string | null): PaletaDaLauncher | null {
  const rgb = corDoFundo ? lerHex(corDoFundo) : null;
  if (!rgb) return null;
  const [h, s] = rgbParaHsv(...rgb);
  const viva = s < 0.12 ? s : Math.max(s, 0.62);
  return {
    botaoInicio: hsvParaHex(h, viva, 0.78),
    botaoFim: hsvParaHex(h, Math.min(1, viva + 0.1), 0.52),
    superficie: hsvParaHex(h, Math.min(viva, 0.6), 0.22, 0.8),
    superficieFoco: hsvParaHex(h, viva, 0.45, 0.95),
    borda: hsvParaHex(h, viva * 0.6, 0.85, 0.4),
    gaveta: hsvParaHex(h, Math.min(viva, 0.7), 0.1, 0.99),
    veu: hsvParaHex(h, Math.min(viva, 0.7), 0.1, 0.55),
  };
}
