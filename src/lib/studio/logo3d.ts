/**
 * F-235 — CRIADOR DE LOGOS 3D do SOBRE MÍDIA Studio (títulos de encarte como "AQUI TEM ECONOMIA", "SHOW DE OFERTAS").
 * Desenho próprio, em canvas, com as técnicas das logos 3D de varejo: letras grossas com degradê na face, CHANFRO
 * (contorno interno metálico), EXTRUSÃO em camadas (o volume), contorno externo largo envolvendo o volume, BRILHO na metade
 * de cima, sombra projetada, inclinação e ARCO; atrás do texto, balão/círculo/faixa; em volta, moedas de $, estrelas,
 * sirene, raios e brilhos. 12 estilos de fábrica inspirados nas composições de encarte de mercado — o usuário troca o texto,
 * as cores e os enfeites e salva como logo do cabeçalho (vale nos encartes, no Cartaz Digital e no Palco de Ofertas).
 */

export type Enfeite = 'moedas' | 'estrelas' | 'sirene' | 'raios' | 'brilhos';
export type FundoDoLogo = 'nenhum' | 'balao' | 'circulo' | 'faixa';

/** Pintura de uma linha de letras. */
export interface PinturaDeLetra {
  /** degradê da face, de cima para baixo */
  face: string[];
  /** cor do volume (extrusão), da frente para o fundo */
  volume: [string, string];
  /** contorno externo (envolve o volume) */
  contorno: string;
  /** chanfro: traço fino metálico na borda da face */
  chanfro: string;
}

export interface LinhaDoLogo { texto: string; /** tamanho relativo (1 = principal) */ escala: number; pintura: PinturaDeLetra; /** letra pequena dentro de uma pílula/círculo ("DA", "DE") */ pilula?: { cor: string; texto: string } | null }

export interface ConfigLogo3D {
  estilo: string;
  linhas: LinhaDoLogo[];
  fonte: string;
  /** profundidade do volume (px no tamanho 1) */
  profundidade: number;
  /** direção do volume em graus (90 = para baixo) */
  direcao: number;
  /** inclinação do logo inteiro (graus) */
  inclinacao: number;
  /** curva das linhas (0 = reto; 1 = arco forte) */
  arco: number;
  fundo: FundoDoLogo;
  corFundo: [string, string];
  enfeites: Enfeite[];
}

const FONTES: Record<string, string> = {
  anton: "'Anton', 'Arial Black', sans-serif",
  baloo: "'Baloo 2', 'Arial Rounded MT Bold', 'Arial Black', sans-serif",
  archivo: "'Archivo Black', 'Arial Black', sans-serif",
  montserrat: "italic 900 {T} 'Montserrat', 'Arial Black', sans-serif",
  bebas: "'Bebas Neue', 'Arial Black', sans-serif",
};
export const FONTES_DO_LOGO = [
  { id: 'anton', nome: 'Anton (condensada)', google: 'Anton' },
  { id: 'baloo', nome: 'Baloo (arredondada)', google: 'Baloo+2:wght@800' },
  { id: 'archivo', nome: 'Archivo Black (larga)', google: 'Archivo+Black' },
  { id: 'montserrat', nome: 'Montserrat itálico', google: 'Montserrat:ital,wght@1,900' },
  { id: 'bebas', nome: 'Bebas Neue', google: 'Bebas+Neue' },
];
const fonteCss = (id: string, px: number) => {
  const f = FONTES[id] ?? FONTES.anton;
  if (f.includes('{T}')) return f.replace('{T}', `${px}px`);
  return `${id === 'baloo' ? 800 : 400} ${px}px ${f}`;
};

/** Carrega as fontes do criador (Google Fonts) antes de desenhar. */
export async function carregarFontesDoLogo(): Promise<void> {
  if (typeof document === 'undefined') return;
  const id = 'sm-fontes-logo3d';
  if (!document.getElementById(id)) {
    const l = document.createElement('link');
    l.id = id; l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?${FONTES_DO_LOGO.map((f) => `family=${f.google}`).join('&')}&display=swap`;
    document.head.appendChild(l);
  }
  await Promise.all(FONTES_DO_LOGO.map((f) => document.fonts?.load(fonteCss(f.id, 64), 'ABC').catch(() => undefined)));
}

// ───────────────────────────────────────── pinturas e estilos de fábrica
const OURO: PinturaDeLetra = { face: ['#fff7c2', '#ffd84a', '#f2a900', '#c97800'], volume: ['#a8480a', '#4a1500'], contorno: '#ffffff', chanfro: '#fff1a8' };
const OURO_VERMELHO: PinturaDeLetra = { face: ['#fff6b8', '#ffd21f', '#f5a300', '#d97a00'], volume: ['#b3101f', '#4d0008'], contorno: '#ffffff', chanfro: '#fff3b0' };
const VERMELHO: PinturaDeLetra = { face: ['#ff8a8a', '#ff3b3b', '#d90f1f', '#8f0a15'], volume: ['#5c0610', '#2a0206'], contorno: '#ffffff', chanfro: '#ffd0d0' };
const VERMELHO_OURO: PinturaDeLetra = { face: ['#ff6b6b', '#e8122a', '#b30d20', '#7a0712'], volume: ['#f2a900', '#8a5200'], contorno: '#fff3c4', chanfro: '#ffe27a' };
const PRATA: PinturaDeLetra = { face: ['#ffffff', '#eef1f6', '#b9c2d0', '#7b8798'], volume: ['#4a5568', '#1e2430'], contorno: '#7a0a14', chanfro: '#ffffff' };
const BRANCO_VERMELHO: PinturaDeLetra = { face: ['#ffffff', '#fbfbfb', '#e6e6e6', '#cfcfcf'], volume: ['#c40f24', '#5a0610'], contorno: '#ffd21f', chanfro: '#ffffff' };
const VERDE: PinturaDeLetra = { face: ['#e1ff9e', '#9be04a', '#3fae2a', '#1d6b14'], volume: ['#0f4a0b', '#062604'], contorno: '#ffffff', chanfro: '#f4ffd8' };
const LARANJA: PinturaDeLetra = { face: ['#fff1b0', '#ffc02e', '#ff8a00', '#d95a00'], volume: ['#9e2a00', '#4a1200'], contorno: '#ffffff', chanfro: '#fff5c8' };
const AZUL: PinturaDeLetra = { face: ['#e6f6ff', '#7cd0ff', '#1e8fe0', '#0b4f9e'], volume: ['#08306b', '#031533'], contorno: '#ffffff', chanfro: '#e6f6ff' };

const L = (texto: string, escala: number, pintura: PinturaDeLetra, pilula?: LinhaDoLogo['pilula']): LinhaDoLogo => ({ texto, escala, pintura, pilula: pilula ?? null });

export const ESTILOS_DE_LOGO: Array<{ id: string; nome: string; config: ConfigLogo3D }> = [
  { id: 'aqui-tem-economia', nome: 'Aqui Tem Economia (balão vermelho)', config: { estilo: 'aqui-tem-economia', fonte: 'archivo', profundidade: 16, direcao: 90, inclinacao: -5, arco: 0.15, fundo: 'balao', corFundo: ['#ef2b3c', '#9c0a1c'], enfeites: ['moedas', 'brilhos'], linhas: [L('AQUI TEM', 0.62, BRANCO_VERMELHO), L('ECONOMIA', 1, OURO_VERMELHO)] } },
  { id: 'ofertas-da-semana', nome: 'Ofertas da Semana (ouro e prata)', config: { estilo: 'ofertas-da-semana', fonte: 'baloo', profundidade: 18, direcao: 90, inclinacao: -4, arco: 0.1, fundo: 'nenhum', corFundo: ['#d90f1f', '#7a0712'], enfeites: ['moedas'], linhas: [L('OFERTA$', 1, OURO, null), L('SEMANA', 0.95, PRATA, { cor: '#d90f1f', texto: 'DA' })] } },
  { id: 'super-ofertas', nome: 'Super Ofertas (cromado)', config: { estilo: 'super-ofertas', fonte: 'anton', profundidade: 14, direcao: 90, inclinacao: 0, arco: 0.22, fundo: 'nenhum', corFundo: ['#d90f1f', '#7a0712'], enfeites: ['brilhos'], linhas: [L('SUPER', 0.8, OURO), L('OFERTAS', 1, PRATA)] } },
  { id: 'show-de-ofertas', nome: 'Show de Ofertas (vermelho e holofote)', config: { estilo: 'show-de-ofertas', fonte: 'archivo', profundidade: 14, direcao: 90, inclinacao: 0, arco: 0.18, fundo: 'circulo', corFundo: ['#ffd21f', '#f29a00'], enfeites: ['raios', 'brilhos'], linhas: [L('SHOW', 0.85, VERMELHO, null), L('OFERTA$', 1, VERMELHO, { cor: '#ffffff', texto: 'DE' })] } },
  { id: 'mega-oferta', nome: 'Mega Oferta (ouro com volume vermelho)', config: { estilo: 'mega-oferta', fonte: 'archivo', profundidade: 18, direcao: 100, inclinacao: -7, arco: 0, fundo: 'nenhum', corFundo: ['#1e3fd0', '#0b1f6b'], enfeites: ['moedas', 'brilhos'], linhas: [L('MEGA', 0.9, OURO_VERMELHO), L('OFERTA', 1, OURO_VERMELHO)] } },
  { id: 'alerta-de-oferta', nome: 'Alerta de Oferta (sirene)', config: { estilo: 'alerta-de-oferta', fonte: 'anton', profundidade: 16, direcao: 90, inclinacao: -3, arco: 0, fundo: 'nenhum', corFundo: ['#d90f1f', '#7a0712'], enfeites: ['sirene', 'moedas'], linhas: [L('ALERTA', 1, OURO_VERMELHO), L('OFERTA', 0.9, OURO_VERMELHO, { cor: '#d90f1f', texto: 'DE' })] } },
  { id: 'hortifruti', nome: 'Hortifruti (verde)', config: { estilo: 'hortifruti', fonte: 'baloo', profundidade: 14, direcao: 90, inclinacao: -4, arco: 0.12, fundo: 'nenhum', corFundo: ['#2f9e2a', '#14532d'], enfeites: ['brilhos'], linhas: [L('HORTI', 1, VERDE), L('FRUTI', 1, OURO)] } },
  { id: 'quinta-da-carne', nome: 'Quinta da Carne (vermelho e branco)', config: { estilo: 'quinta-da-carne', fonte: 'montserrat', profundidade: 14, direcao: 90, inclinacao: -6, arco: 0, fundo: 'nenhum', corFundo: ['#d90f1f', '#7a0712'], enfeites: [], linhas: [L('QUINTA', 0.85, BRANCO_VERMELHO), L('CARNE', 1, VERMELHO_OURO, { cor: '#ffd21f', texto: 'DA' })] } },
  { id: 'semana-do-frango', nome: 'Semana do Frango (laranja)', config: { estilo: 'semana-do-frango', fonte: 'baloo', profundidade: 16, direcao: 90, inclinacao: -5, arco: 0.15, fundo: 'nenhum', corFundo: ['#1e8fe0', '#0b4f9e'], enfeites: ['estrelas'], linhas: [L('SEMANA', 0.7, AZUL), L('FRANGO', 1, LARANJA, { cor: '#1e8fe0', texto: 'DO' })] } },
  { id: 'dia-de-economia', nome: 'Dia de Economia (selo redondo)', config: { estilo: 'dia-de-economia', fonte: 'archivo', profundidade: 12, direcao: 90, inclinacao: 0, arco: 0.25, fundo: 'circulo', corFundo: ['#b30d20', '#5c0610'], enfeites: ['estrelas', 'moedas'], linhas: [L('DIA', 0.7, OURO, null), L('ECONOMIA', 1, VERMELHO_OURO, { cor: '#ffd21f', texto: 'DE' })] } },
  { id: 'explosao-de-ofertas', nome: 'Explosão de Ofertas (raios)', config: { estilo: 'explosao-de-ofertas', fonte: 'anton', profundidade: 16, direcao: 90, inclinacao: 0, arco: 0, fundo: 'faixa', corFundo: ['#d90f1f', '#7a0712'], enfeites: ['raios', 'brilhos'], linhas: [L('EXPLOSÃO', 1, OURO), L('OFERTAS', 0.9, BRANCO_VERMELHO, { cor: '#ffd21f', texto: 'DE' })] } },
  { id: 'hora-de-economizar', nome: 'Hora de Economizar (vermelho e azul)', config: { estilo: 'hora-de-economizar', fonte: 'archivo', profundidade: 16, direcao: 90, inclinacao: -4, arco: 0.1, fundo: 'nenhum', corFundo: ['#1e3fd0', '#0b1f6b'], enfeites: ['moedas', 'estrelas'], linhas: [L('HORA', 0.65, AZUL, { cor: '#ffd21f', texto: 'DE' }), L('ECONOMIZAR', 1, VERMELHO)] } },
];
export const estiloPorId = (id: string) => ESTILOS_DE_LOGO.find((e) => e.id === id) ?? ESTILOS_DE_LOGO[0];
export const clonarConfig = (c: ConfigLogo3D): ConfigLogo3D => JSON.parse(JSON.stringify(c));

// ───────────────────────────────────────── desenho
interface Medida { linha: LinhaDoLogo; px: number; largura: number; larguraPilula: number }

function medirLinhas(ctx: CanvasRenderingContext2D, cfg: ConfigLogo3D, base: number): Medida[] {
  return cfg.linhas.filter((l) => l.texto.trim()).map((linha) => {
    const px = base * linha.escala;
    ctx.font = fonteCss(cfg.fonte, px);
    const largura = ctx.measureText(linha.texto.toUpperCase()).width;
    const larguraPilula = linha.pilula ? px * 0.62 : 0;
    return { linha, px, largura, larguraPilula };
  });
}

/** Desenha o texto da linha (reto ou em arco), com uma operação por letra (preencher ou contornar). */
function letras(ctx: CanvasRenderingContext2D, texto: string, cx: number, y: number, px: number, arco: number, acao: (t: string, x: number, y: number) => void) {
  const chars = [...texto];
  const larguras = chars.map((c) => ctx.measureText(c).width);
  const total = larguras.reduce((a, b) => a + b, 0);
  if (!arco) { ctx.textAlign = 'left'; acao(texto, cx - total / 2, y); return; }
  // arco: raio decresce com o "arco" (0 reto, 1 forte); letras giram com a tangente
  const raio = (total * 1.6) / Math.max(0.05, arco);
  let x = -total / 2;
  chars.forEach((c, i) => {
    const meio = x + larguras[i] / 2;
    const ang = meio / raio;
    ctx.save();
    ctx.translate(cx + Math.sin(ang) * raio, y - (raio - Math.cos(ang) * raio) * 1);
    ctx.rotate(ang);
    ctx.textAlign = 'center';
    acao(c, 0, 0);
    ctx.restore();
    x += larguras[i];
  });
  void px;
}

function degradeVertical(ctx: CanvasRenderingContext2D, y: number, px: number, cores: string[]) {
  const g = ctx.createLinearGradient(0, y - px * 0.82, 0, y + px * 0.08);
  cores.forEach((c, i) => g.addColorStop(i / Math.max(1, cores.length - 1), c));
  return g;
}

function misturar(a: string, b: string, t: number): string {
  const h = (x: string) => { const s = x.replace('#', ''); const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const [r1, g1, b1] = h(a), [r2, g2, b2] = h(b);
  return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`;
}

/** UMA linha de letras 3D: contorno do volume → volume → face com degradê → chanfro → brilho. */
function linha3D(ctx: CanvasRenderingContext2D, cfg: ConfigLogo3D, m: Medida, cx: number, y: number) {
  const { linha, px } = m;
  const t = linha.texto.toUpperCase();
  const p = linha.pintura;
  const prof = Math.round(cfg.profundidade * linha.escala * (px / 160));
  const dx = Math.cos((cfg.direcao * Math.PI) / 180), dy = Math.sin((cfg.direcao * Math.PI) / 180);
  const arco = cfg.arco * 0.6;
  const contorno = Math.max(6, px * 0.13);
  ctx.font = fonteCss(cfg.fonte, px);
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  // 1) contorno externo, envolvendo também o volume
  ctx.strokeStyle = p.contorno;
  ctx.lineWidth = contorno * 2;
  for (let i = prof; i >= 0; i -= 2) letras(ctx, t, cx + dx * i, y + dy * i, px, arco, (s, x, yy) => ctx.strokeText(s, x, yy));
  // sombra projetada suave do bloco inteiro
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = px * 0.25; ctx.shadowOffsetY = px * 0.08;
  ctx.fillStyle = p.volume[1];
  letras(ctx, t, cx + dx * prof, y + dy * prof, px, arco, (s, x, yy) => ctx.fillText(s, x, yy));
  ctx.restore();
  // 2) volume: camada a camada, do fundo (escuro) para a frente
  for (let i = prof; i >= 1; i--) {
    ctx.fillStyle = misturar(p.volume[0], p.volume[1], i / Math.max(1, prof));
    letras(ctx, t, cx + dx * i, y + dy * i, px, arco, (s, x, yy) => ctx.fillText(s, x, yy));
  }
  // 3) face com degradê
  ctx.fillStyle = degradeVertical(ctx, y, px, p.face);
  letras(ctx, t, cx, y, px, arco, (s, x, yy) => ctx.fillText(s, x, yy));
  // 4) chanfro: traço fino claro na borda da face
  ctx.strokeStyle = p.chanfro;
  ctx.lineWidth = Math.max(2, px * 0.025);
  letras(ctx, t, cx, y, px, arco, (s, x, yy) => ctx.strokeText(s, x, yy));
  // 5) brilho na metade de cima — só na FACE (desenhado à parte, para não clarear o volume nem o contorno)
  if (typeof document === 'undefined') return;
  const off = document.createElement('canvas');
  off.width = ctx.canvas.width; off.height = ctx.canvas.height;
  const o = off.getContext('2d');
  if (!o) return;
  o.setTransform(ctx.getTransform());
  o.font = ctx.font; o.textBaseline = 'alphabetic';
  o.fillStyle = '#ffffff';
  letras(o, t, cx, y, px, arco, (s, x, yy) => o.fillText(s, x, yy));
  o.globalCompositeOperation = 'source-in';
  const g = o.createLinearGradient(0, y - px * 0.82, 0, y - px * 0.36);
  g.addColorStop(0, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  o.fillStyle = g;
  o.fillRect(cx - px * 20, y - px * 3, px * 40, px * 6);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(off, 0, 0);
  ctx.restore();
}

function pilula(ctx: CanvasRenderingContext2D, cfg: ConfigLogo3D, texto: string, cor: string, x: number, y: number, px: number) {
  const r = px * 0.31;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = r * 0.4; ctx.shadowOffsetY = r * 0.15;
  ctx.fillStyle = cor;
  ctx.beginPath(); ctx.arc(x, y - px * 0.36, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.lineWidth = r * 0.14; ctx.strokeStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(x, y - px * 0.36, r, 0, Math.PI * 2); ctx.stroke();
  ctx.font = fonteCss(cfg.fonte, r * 0.95);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = cor.toLowerCase() === '#ffffff' ? '#d90f1f' : '#ffffff';
  ctx.fillText(texto, x, y - px * 0.36 + r * 0.06);
  ctx.textBaseline = 'alphabetic';
}

function moeda(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1, 0.92);
  ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = r * 0.4; ctx.shadowOffsetY = r * 0.15;
  ctx.fillStyle = '#a86a00';
  ctx.beginPath(); ctx.ellipse(r * 0.14, r * 0.1, r, r, 0, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent';
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#fff6b0'); g.addColorStop(0.45, '#ffcc2e'); g.addColorStop(1, '#d48a00');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = r * 0.1; ctx.strokeStyle = '#f2a900';
  ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2); ctx.stroke();
  ctx.font = `900 ${r * 1.15}px 'Archivo Black', 'Arial Black', sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#b36b00'; ctx.fillText('$', r * 0.05, r * 0.08);
  ctx.fillStyle = '#fff2a0'; ctx.fillText('$', 0, 0);
  ctx.restore();
}

function estrela(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save(); ctx.translate(x, y);
  const g = ctx.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, '#fff6b0'); g.addColorStop(1, '#f2a900');
  ctx.fillStyle = g; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2; const rr = i % 2 ? r * 0.45 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.stroke(); ctx.fill();
  ctx.restore();
}

function brilho(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save(); ctx.translate(x, y);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,250,210,.7)'); g.addColorStop(1, 'rgba(255,250,210,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(0, -r); ctx.quadraticCurveTo(0, 0, r, 0); ctx.quadraticCurveTo(0, 0, 0, r); ctx.quadraticCurveTo(0, 0, -r, 0); ctx.quadraticCurveTo(0, 0, 0, -r); ctx.fill();
  ctx.restore();
}

function sirene(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save(); ctx.translate(x, y);
  const halo = ctx.createRadialGradient(0, -r * 0.4, 0, 0, -r * 0.4, r * 2.6);
  halo.addColorStop(0, 'rgba(255,90,60,.55)'); halo.addColorStop(1, 'rgba(255,90,60,0)');
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, -r * 0.4, r * 2.6, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createLinearGradient(-r, 0, r, 0);
  g.addColorStop(0, '#9e0010'); g.addColorStop(0.4, '#ff3b3b'); g.addColorStop(0.55, '#ffb3b3'); g.addColorStop(1, '#9e0010');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(-r * 0.8, -r * 1.1); ctx.quadraticCurveTo(0, -r * 1.7, r * 0.8, -r * 1.1); ctx.lineTo(r, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c7cdd6'; ctx.fillRect(-r * 1.25, 0, r * 2.5, r * 0.35);
  ctx.fillStyle = '#7b8798'; ctx.fillRect(-r * 1.25, r * 0.28, r * 2.5, r * 0.1);
  ctx.restore();
}

function raios(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.save(); ctx.translate(cx, cy);
  for (let i = 0; i < 24; i++) {
    ctx.rotate((Math.PI * 2) / 24);
    const g = ctx.createLinearGradient(0, 0, r, 0);
    g.addColorStop(0, 'rgba(255,240,170,.55)'); g.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r, -r * 0.06); ctx.lineTo(r, r * 0.06); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function fundoAtras(ctx: CanvasRenderingContext2D, cfg: ConfigLogo3D, cx: number, cy: number, w: number, h: number, alturaPrimeira: number) {
  const [c1, c2] = cfg.corFundo;
  const g = ctx.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
  g.addColorStop(0, c1); g.addColorStop(1, c2);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = h * 0.08; ctx.shadowOffsetY = h * 0.04;
  ctx.lineWidth = Math.max(6, h * 0.035); ctx.strokeStyle = '#ffd21f'; ctx.fillStyle = g;
  if (cfg.fundo === 'circulo') {
    const r = Math.max(w, h) * 0.56;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.shadowColor = 'transparent'; ctx.stroke();
    ctx.lineWidth /= 2; ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2); ctx.stroke();
  } else if (cfg.fundo === 'balao') {
    // balão de fala atrás da 1ª linha (como "AQUI TEM")
    const bw = w * 0.78, bh = alturaPrimeira * 1.25, bx = cx - bw / 2, by = cy - h / 2 - bh * 0.15;
    const r = bh * 0.3;
    ctx.beginPath();
    ctx.moveTo(bx + r, by); ctx.lineTo(bx + bw - r, by); ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r); ctx.lineTo(bx + bw, by + bh - r); ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
    ctx.lineTo(bx + bw * 0.62, by + bh); ctx.lineTo(bx + bw * 0.55, by + bh * 1.35); ctx.lineTo(bx + bw * 0.5, by + bh);
    ctx.lineTo(bx + r, by + bh); ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r); ctx.lineTo(bx, by + r); ctx.quadraticCurveTo(bx, by, bx + r, by);
    ctx.closePath(); ctx.fill(); ctx.shadowColor = 'transparent'; ctx.stroke();
  } else if (cfg.fundo === 'faixa') {
    const fh = h * 0.55, fy = cy - fh / 2 + h * 0.18;
    ctx.beginPath(); ctx.moveTo(cx - w * 0.6, fy); ctx.lineTo(cx + w * 0.62, fy - fh * 0.12); ctx.lineTo(cx + w * 0.6, fy + fh); ctx.lineTo(cx - w * 0.62, fy + fh * 1.08); ctx.closePath();
    ctx.fill(); ctx.shadowColor = 'transparent'; ctx.stroke();
  }
  ctx.restore();
}

/**
 * Desenha o logo inteiro num canvas (fundo transparente). Devolve a caixa ocupada, para recortar o PNG sem sobras.
 */
export function desenharLogo3D(ctx: CanvasRenderingContext2D, W: number, H: number, cfg: ConfigLogo3D): void {
  ctx.clearRect(0, 0, W, H);
  if (!cfg.linhas.some((l) => l.texto.trim())) return;
  // tamanho base: a linha mais larga ocupa ~74% da largura
  ctx.font = fonteCss(cfg.fonte, 100);
  const medidas0 = medirLinhas(ctx, cfg, 100);
  const larg0 = Math.max(...medidas0.map((m) => m.largura + m.larguraPilula * 1.1));
  const alt0 = medidas0.reduce((a, m) => a + m.px * 0.92, 0);
  const base = Math.min((W * 0.74) / Math.max(1, larg0), (H * 0.62) / Math.max(1, alt0)) * 100;
  const medidas = medirLinhas(ctx, cfg, base);
  const alturaTotal = medidas.reduce((a, m) => a + m.px * 0.92, 0);
  const larguraTotal = Math.max(...medidas.map((m) => m.largura + m.larguraPilula * 1.1));
  const cx = W / 2, cy = H / 2;

  ctx.save();
  ctx.translate(cx, cy); ctx.rotate((cfg.inclinacao * Math.PI) / 180); ctx.translate(-cx, -cy);
  if (cfg.enfeites.includes('raios')) raios(ctx, cx, cy, Math.max(W, H) * 0.6);
  if (cfg.fundo !== 'nenhum') fundoAtras(ctx, cfg, cx, cy, larguraTotal, alturaTotal, medidas[0].px);
  if (cfg.enfeites.includes('sirene')) sirene(ctx, cx, cy - alturaTotal / 2 - base * 0.05, base * 0.38);
  let y = cy - alturaTotal / 2;
  for (const m of medidas) {
    y += m.px * 0.82;
    const desloc = m.larguraPilula ? m.larguraPilula * 0.55 : 0;
    linha3D(ctx, cfg, m, cx + desloc, y);
    if (m.linha.pilula) pilula(ctx, cfg, m.linha.pilula.texto, m.linha.pilula.cor, cx + desloc - m.largura / 2 - m.larguraPilula * 0.55, y, m.px);
    y += m.px * 0.1;
  }
  ctx.restore();
  // enfeites em volta (fora da inclinação, para não "andarem" com o texto)
  if (cfg.enfeites.includes('moedas')) {
    moeda(ctx, cx - larguraTotal * 0.56, cy - alturaTotal * 0.25, base * 0.32, -0.4);
    moeda(ctx, cx + larguraTotal * 0.55, cy + alturaTotal * 0.2, base * 0.26, 0.5);
    moeda(ctx, cx + larguraTotal * 0.42, cy - alturaTotal * 0.55, base * 0.18, 0.2);
  }
  if (cfg.enfeites.includes('estrelas')) {
    estrela(ctx, cx - larguraTotal * 0.5, cy + alturaTotal * 0.45, base * 0.16);
    estrela(ctx, cx + larguraTotal * 0.5, cy - alturaTotal * 0.48, base * 0.13);
  }
  if (cfg.enfeites.includes('brilhos')) {
    brilho(ctx, cx - larguraTotal * 0.38, cy - alturaTotal * 0.45, base * 0.22);
    brilho(ctx, cx + larguraTotal * 0.3, cy + alturaTotal * 0.38, base * 0.16);
  }
}

/** PNG transparente do logo, recortado sem sobras (para o cabeçalho dos encartes e o Palco). */
export async function logoParaPng(cfg: ConfigLogo3D, largura = 1800, altura = 1000): Promise<Blob> {
  await carregarFontesDoLogo();
  const tela = document.createElement('canvas');
  tela.width = largura; tela.height = altura;
  const ctx = tela.getContext('2d')!;
  desenharLogo3D(ctx, largura, altura, cfg);
  const { data } = ctx.getImageData(0, 0, largura, altura);
  let x0 = largura, y0 = altura, x1 = 0, y1 = 0;
  for (let y = 0; y < altura; y += 2) for (let x = 0; x < largura; x += 2) if (data[(y * largura + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const m = 12;
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(largura, x1 + m); y1 = Math.min(altura, y1 + m);
  const corte = document.createElement('canvas');
  corte.width = Math.max(1, x1 - x0); corte.height = Math.max(1, y1 - y0);
  corte.getContext('2d')!.drawImage(tela, x0, y0, corte.width, corte.height, 0, 0, corte.width, corte.height);
  return await new Promise<Blob>((ok, falha) => corte.toBlob((b) => (b ? ok(b) : falha(new Error('Não foi possível gerar o PNG do logo.'))), 'image/png'));
}
