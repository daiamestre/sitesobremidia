import type { WidgetConfig } from '@/types/models';

/**
 * Cores dos widgets Relógio Futurista e Clima Futurista.
 * O widget guarda a escolha (`config.paleta` = id, ou `config.corBase` na Personalizada) E as cores já resolvidas
 * (`config.cores`): o Player Android usa `cores` direto, então novas paletas não exigem APK novo.
 */
export interface CoresWidget {
  /** gradiente: escuro -> meio -> claro */
  c1: string; c2: string; c3: string;
  /** brilho (glow) do texto grande e do halo */
  brilho: string;
  /** selo (pílula) e destaques; seloTexto = cor do texto sobre o selo */
  selo: string; seloTexto: string;
}
export interface PaletaWidget extends CoresWidget { id: string; nome: string }

export const PALETA_PADRAO = 'sobremidia';
export const PALETA_PERSONALIZADA = 'personalizada';

/** Paletas prontas: texto branco legível em todas (fundo escuro no início, meio saturado). */
export const PALETAS: PaletaWidget[] = [
  { id: 'sobremidia', nome: 'Roxo SOBRE MÍDIA', c1: '#22004A', c2: '#5D1BFF', c3: '#8A2EFF', brilho: '#B04DFF', selo: '#FFD400', seloTexto: '#22004A' },
  { id: 'oceano', nome: 'Azul Oceano', c1: '#031B4E', c2: '#0A5BD8', c3: '#1A7FD0', brilho: '#4CC3FF', selo: '#FFD400', seloTexto: '#031B4E' },
  { id: 'turquesa', nome: 'Turquesa', c1: '#002B33', c2: '#00838F', c3: '#0F9690', brilho: '#4DE8DF', selo: '#FFD400', seloTexto: '#002B33' },
  { id: 'esmeralda', nome: 'Verde Esmeralda', c1: '#03281C', c2: '#0B7A4B', c3: '#128A57', brilho: '#4CE3A0', selo: '#FFD400', seloTexto: '#03281C' },
  { id: 'por-do-sol', nome: 'Pôr do Sol', c1: '#3A0A00', c2: '#C2410C', c3: '#D95A12', brilho: '#FFA858', selo: '#FFE08A', seloTexto: '#3A0A00' },
  { id: 'rubi', nome: 'Vermelho Rubi', c1: '#3B0010', c2: '#B0102F', c3: '#D1203F', brilho: '#FF6F8E', selo: '#FFD400', seloTexto: '#3B0010' },
  { id: 'magenta', nome: 'Rosa Magenta', c1: '#3A0030', c2: '#B0126E', c3: '#C92A8A', brilho: '#FF7AC6', selo: '#FFD400', seloTexto: '#3A0030' },
  { id: 'dourado', nome: 'Dourado', c1: '#241600', c2: '#8A5A00', c3: '#A87400', brilho: '#FFD76A', selo: '#FFFFFF', seloTexto: '#241600' },
  { id: 'grafite', nome: 'Grafite', c1: '#0B0B10', c2: '#23252E', c3: '#3D404D', brilho: '#9AA3BD', selo: '#FFD400', seloTexto: '#0B0B10' },
];

const HEX = /^#[0-9a-fA-F]{6}$/;
export const hexValido = (v: unknown): v is string => typeof v === 'string' && HEX.test(v);

function hexParaHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslParaHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Luminância relativa (WCAG) de #RRGGBB. */
export function luminancia(hex: string): number {
  const canal = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}
/** Contraste do texto BRANCO sobre a cor (WCAG): 3 = mínimo para texto grande. */
export const contrasteComBranco = (hex: string) => 1.05 / (luminancia(hex) + 0.05);

/** Tom mais claro possível (até lMax) que ainda deixa o texto branco com o contraste pedido. */
function tomLegivel(h: number, s: number, lMax: number, contrasteMin: number): string {
  for (let l = lMax; l > 0.05; l -= 0.01) {
    const cor = hslParaHex(h, s, l);
    if (contrasteComBranco(cor) >= contrasteMin) return cor;
  }
  return hslParaHex(h, s, 0.08);
}

/**
 * "A cor que o usuário quiser": gera a paleta a partir de UMA cor. Os tons do gradiente são escurecidos até o texto
 * branco ficar legível (amarelo/verde-limão/branco viram tons fechados da mesma cor); o início é sempre escuro.
 */
export function paletaPersonalizada(corBase: string): PaletaWidget {
  const base = hexValido(corBase) ? corBase : PALETAS[0].c2;
  const [h, sBruto] = hexParaHsl(base);
  const cinza = sBruto < 0.08; // preto/branco/cinza: mantém neutro
  const s = cinza ? 0.06 : limitar(sBruto, 0.5, 0.95);
  const amareloso = !cinza && h >= 38 && h <= 70;
  const c1 = hslParaHex(h, s, 0.1);
  return {
    id: PALETA_PERSONALIZADA, nome: 'Personalizada',
    c1, c2: tomLegivel(h, s, 0.42, 4.5), c3: tomLegivel((h + 12) % 360, s, 0.5, 3.5), brilho: hslParaHex(h, s, 0.68),
    selo: amareloso ? '#FFFFFF' : '#FFD400', seloTexto: c1,
  };
}

const PADRAO = PALETAS[0];
const semId = ({ id: _i, nome: _n, ...c }: PaletaWidget): CoresWidget => c;

/** Cores que o widget usa: a paleta escolhida (pronta ou personalizada), as cores gravadas, ou o padrão. */
export function coresDoConfig(config: Partial<WidgetConfig> | null | undefined): CoresWidget {
  const c = config ?? {};
  const pronta = PALETAS.find((p) => p.id === c.paleta);
  if (pronta) return semId(pronta);
  if (c.paleta === PALETA_PERSONALIZADA && hexValido(c.corBase)) return semId(paletaPersonalizada(c.corBase));
  const g = c.cores;
  if (g && [g.c1, g.c2, g.c3, g.brilho, g.selo, g.seloTexto].every(hexValido)) return { ...g };
  return semId(PADRAO);
}

/** O que gravar no config quando o usuário escolhe uma paleta pronta ou uma cor personalizada. */
export function escolhaDePaleta(id: string, corBase?: string): Pick<WidgetConfig, 'paleta' | 'corBase' | 'cores'> {
  if (id === PALETA_PERSONALIZADA && hexValido(corBase)) return { paleta: id, corBase, cores: semId(paletaPersonalizada(corBase)) };
  const p = PALETAS.find((x) => x.id === id) ?? PADRAO;
  return { paleta: p.id, corBase: undefined, cores: semId(p) };
}

/** rgba() a partir de #RRGGBB (véus, halos e sombras). */
export function rgba(hex: string, a: number): string {
  const h = hexValido(hex) ? hex : PADRAO.c1;
  return `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${a})`;
}
export const gradienteDe = (c: CoresWidget) => `linear-gradient(135deg,${c.c1} 0%,${c.c2} 55%,${c.c3} 100%)`;
