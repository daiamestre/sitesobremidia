// SOBRE MÍDIA STUDIO — P-34 (pedido do dono, 16/11/2026): EFEITOS DE IMPACTO do vídeo, no padrão do concorrente que gera
// vídeos de ofertas com IA. Tudo calculado por fórmula para o instante t (mesmo desenho na tela, na prévia e no MP4):
//  · CHAMAS: brasas laranja e amarelas subindo na frente do fundo e o brilho do fogo pulsando embaixo;
//  · ESTRELAS: estrelinhas de 4 pontas passando na frente do fundo, piscando e girando;
//  · CÂMERA NA MÃO: o fundo balança de leve (produto, nome e preço ficam firmes);
//  · EXPLOSÃO NO PREÇO: estrela de 16 pontas girando atrás do balão, faíscas saindo dele e um brilho passando por cima.
// Desenhos e números nossos (a ideia vem do concorrente; nada copiado dele).
import { estadoNoTempo, type EstadoAnimado } from './animacao';
import type { Camada, Documento } from './documento';

const K = (x: number) => Math.max(0, Math.min(1, x));
const saida = (p: number) => 1 - Math.pow(1 - p, 3);
/** número "aleatório" fixo por partícula (o mesmo em todo quadro e em todo aparelho) */
const sorte = (a: number, b: number) => { const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return n - Math.floor(n); };

/** pontinho de luz (degradê redondo) guardado pronto: desenhar 40 por quadro custa quase nada no tablet */
const LUZES = new Map<string, HTMLCanvasElement>();
function luz(cor: string): HTMLCanvasElement | null {
  const ja = LUZES.get(cor);
  if (ja) return ja;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, '#ffffff'); r.addColorStop(0.18, cor); r.addColorStop(0.5, `${cor}88`); r.addColorStop(1, `${cor}00`);
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  LUZES.set(cor, c);
  return c;
}

// ───────────────────────────── câmera na mão
const CAMERA = { ax: 22, ay: 14, rot: 0.55, zoom: 0.012 };
/** quanto o fundo precisa crescer para, girando e balançando, nunca mostrar borda */
function cobrir(W: number, H: number, k: number) {
  const r = (CAMERA.rot * Math.PI) / 180;
  const a = W * Math.cos(r) + H * Math.sin(r) + 2 * CAMERA.ax * k, b = H * Math.cos(r) + W * Math.sin(r) + 2 * CAMERA.ay * k;
  return Math.max(a / W, b / H);
}
/** aplica no contexto o balanço da câmera no instante t (em volta do centro da tela) */
export function aplicarCamera(ctx: CanvasRenderingContext2D, t: number, W: number, H: number) {
  const k = Math.min(W, H) / 1080;
  const dx = CAMERA.ax * k * (0.7 * Math.sin(t * 0.9) + 0.3 * Math.sin(t * 2.17 + 1.3));
  const dy = CAMERA.ay * k * (0.65 * Math.sin(t * 1.23 + 0.7) + 0.35 * Math.sin(t * 2.71));
  const rot = (CAMERA.rot * (0.75 * Math.sin(t * 0.71 + 2.1) + 0.25 * Math.sin(t * 1.9)) * Math.PI) / 180;
  const s = cobrir(W, H, k) + CAMERA.zoom * (0.5 + 0.5 * Math.sin(t * 0.43));
  ctx.translate(W / 2 + dx, H / 2 + dy); ctx.rotate(rot); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2);
}

// ───────────────────────────── chamas (brasas subindo + fogo embaixo)
const CORES_DO_FOGO = ['#ffd166', '#ff9f1c', '#ff6b00', '#ffb703', '#ff3d00'];
export function desenharChamas(ctx: CanvasRenderingContext2D, t: number, W: number, H: number) {
  const k = Math.min(W, H) / 1080;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // o fogo embaixo: manchas de luz laranja que respiram em tempos diferentes
  for (let i = 0; i < 6; i++) {
    const x = (W * (i + 0.5)) / 6 + Math.sin(t * 1.3 + i) * 30 * k;
    const r = (H * 0.16 + Math.sin(t * (2.1 + i * 0.37) + i * 2) * H * 0.03) * (0.8 + 0.4 * sorte(i, 9));
    const g = ctx.createRadialGradient(x, H + r * 0.25, 0, x, H + r * 0.25, r);
    const a = 0.34 + 0.12 * Math.sin(t * (3.1 + i * 0.5) + i);
    g.addColorStop(0, `rgba(255,150,30,${a.toFixed(3)})`); g.addColorStop(0.55, `rgba(255,70,0,${(a * 0.5).toFixed(3)})`); g.addColorStop(1, 'rgba(255,40,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, H - r, 2 * r, r * 1.3);
  }
  // as brasas: sobem balançando, nascem e somem devagar, piscando como fogo
  const n = 44;
  for (let i = 0; i < n; i++) {
    const vel = 70 + sorte(i, 1) * 120; // px/s
    const ciclo = (H + 160 * k) / (vel * k);
    const c = ((t + sorte(i, 2) * ciclo) % ciclo) / ciclo;
    const x = sorte(i, 3) * W + (30 + sorte(i, 4) * 40) * k * Math.sin(t * (0.6 + sorte(i, 5)) + i);
    const y = H + 80 * k - c * (H + 160 * k);
    const vida = Math.min(1, c / 0.12, (1 - c) / 0.25);
    const pisca = 0.75 + 0.25 * Math.sin(t * (5 + sorte(i, 6) * 4) + i * 2);
    const r = (6 + sorte(i, 7) * 12) * k * 2.4;
    const img = luz(CORES_DO_FOGO[i % CORES_DO_FOGO.length]);
    if (!img || vida <= 0) continue;
    ctx.globalAlpha = Math.max(0, 0.95 * vida * pisca);
    ctx.drawImage(img, x - r, y - r, 2 * r, 2 * r);
  }
  ctx.restore();
}

// ───────────────────────────── estrelas passando na frente do fundo
function estrela4(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.18;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
}
export function desenharEstrelas(ctx: CanvasRenderingContext2D, t: number, W: number, H: number) {
  const k = Math.min(W, H) / 1080;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const n = 18;
  for (let i = 0; i < n; i++) {
    // atravessam a tela na diagonal, cada uma no seu ritmo
    const vel = 60 + sorte(i, 11) * 90;
    const caminho = W + H * 0.4 + 200 * k;
    const ciclo = caminho / (vel * k);
    const c = ((t + sorte(i, 12) * ciclo) % ciclo) / ciclo;
    const x = -100 * k + c * caminho;
    const y = sorte(i, 13) * H * 1.1 - c * H * 0.4 + Math.sin(t * 0.8 + i) * 20 * k;
    const pisca = 0.5 + 0.5 * Math.sin(t * (3 + sorte(i, 14) * 3) + i * 1.7);
    const r = (16 + sorte(i, 15) * 30) * k * (0.6 + 0.6 * pisca);
    const vida = Math.min(1, c / 0.08, (1 - c) / 0.08);
    if (vida <= 0) continue;
    const cor = i % 3 === 0 ? '#ffe680' : '#ffffff';
    ctx.globalAlpha = Math.max(0, vida * (0.45 + 0.55 * pisca));
    const img = luz(cor);
    if (img) ctx.drawImage(img, x - r * 1.3, y - r * 1.3, r * 2.6, r * 2.6);
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * (0.6 + sorte(i, 16)) + i);
    estrela4(ctx, r); ctx.fillStyle = cor; ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// ───────────────────────────── explosão no preço
/** o mesmo lugar, giro e tamanho com que o balão é desenhado no instante (para os efeitos andarem junto) */
function noLugar(ctx: CanvasRenderingContext2D, c: Camada, e: EstadoAnimado) {
  ctx.translate(c.x + c.w / 2 + e.dx, c.y + c.h / 2 + e.dy);
  const giro = c.rot + e.rot;
  if (giro) ctx.rotate((giro * Math.PI) / 180);
  ctx.scale(e.escala * e.ex, e.escala);
}
function tempos(c: Camada) {
  const a = c.animacao;
  const ini = a ? a.atraso : 0, dur = a ? Math.max(0.1, a.duracao) : 0.5;
  return { ini, dur, pronto: ini + dur };
}
/** estrela de 16 pontas girando ATRÁS do balão (na cor do palco, com borda amarela) */
export function desenharExplosaoAtras(ctx: CanvasRenderingContext2D, c: Camada, t: number, total: number, cor: string) {
  if (!c.visivel || c.opacidade <= 0) return;
  const e = estadoNoTempo(c, t, total);
  if (e.alfa <= 0) return;
  const { ini, dur } = tempos(c);
  const entra = K((t - ini - dur * 0.15) / (dur * 0.9));
  if (entra <= 0) return;
  const R = (Math.min(c.w, c.h) / 2) * (c.tipo === 'selo' && (c.formato ?? 'circulo') === 'circulo' ? 1.3 : 0.95) * (c.tipo === 'selo' && c.formato !== 'circulo' && c.formato ? Math.max(c.w, c.h) / Math.min(c.w, c.h) : 1);
  ctx.save();
  ctx.globalAlpha *= c.opacidade * e.alfa * Math.min(1, entra * 1.5);
  noLugar(ctx, c, e);
  ctx.rotate((t * 18 * Math.PI) / 180);
  const s = 0.35 + 0.65 * saida(entra);
  ctx.scale(s, s);
  ctx.beginPath();
  for (let i = 0; i < 32; i++) {
    const a = (i * Math.PI) / 16;
    const rr = i % 2 === 0 ? R : R * 0.82;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = cor; ctx.fill();
  ctx.lineJoin = 'round'; ctx.lineWidth = R * 0.05; ctx.strokeStyle = '#ffd400'; ctx.stroke();
  ctx.restore();
}
/** faíscas saindo do balão e um brilho passando por cima dele (repete de tempos em tempos) */
export function desenharExplosaoFrente(ctx: CanvasRenderingContext2D, c: Camada, t: number, total: number) {
  if (!c.visivel || c.opacidade <= 0) return;
  const e = estadoNoTempo(c, t, total);
  if (e.alfa <= 0) return;
  const { ini, dur, pronto } = tempos(c);
  const d = Math.min(c.w, c.h);
  // faíscas: 16, em roda, saindo no "soco" do preço
  const r = (t - (ini + dur * 0.55)) / 0.85;
  if (r > 0 && r < 1) {
    const cx = c.x + c.w / 2 + e.dx, cy = c.y + c.h / 2 + e.dy;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 16; i++) {
      const s = Math.sin(i * 12.9898) * 0.5;
      const ang = (i / 16) * Math.PI * 2 + s * 0.4;
      const dist = d * (0.55 + 0.5 * (0.5 + s)) * saida(r);
      const rr = (d / 300) * (11 * (1 - r) + 2) * 2.2;
      const img = luz(i % 2 ? '#ffd400' : '#ffffff');
      if (!img) continue;
      ctx.globalAlpha = 1 - r;
      ctx.drawImage(img, cx + Math.cos(ang) * dist - rr, cy + Math.sin(ang) * dist * 0.9 - rr, 2 * rr, 2 * rr);
    }
    ctx.restore();
  }
  // brilho: uma faixa de luz atravessa o balão, a primeira logo depois de ele chegar e depois a cada 3,2 s
  const desde = t - (pronto + 0.15);
  if (desde > 0) {
    const n = (desde % 3.2) / 0.75;
    if (n < 1) {
      ctx.save();
      ctx.globalAlpha *= c.opacidade * e.alfa;
      noLugar(ctx, c, e);
      ctx.beginPath();
      if (c.tipo === 'selo' && c.formato === 'oval') ctx.ellipse(0, 0, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
      else if (c.tipo === 'selo' && c.formato === 'placa') ctx.rect(-c.w / 2, -c.h / 2, c.w, c.h);
      else ctx.arc(0, 0, d / 2, 0, Math.PI * 2);
      ctx.clip();
      const x = -c.w * 0.9 + n * c.w * 1.8;
      const g = ctx.createLinearGradient(x - c.w * 0.18, -c.h / 2, x + c.w * 0.18, c.h / 2);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g; ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      ctx.restore();
    }
  }
}

/** o índice da camada do FUNDO da arte (os efeitos passam na frente dela); -1 = sem fundo em camada */
export function indiceDoFundo(d: Documento): number {
  return d.camadas.findIndex((c) => c.nome === 'Fundo oficial' || c.nome === 'Fundo');
}

// ───────────────────────────── F-317: a LOGO CAI, QUEBRA A PAREDE E PEGA FOGO
/** o instante em que a logo bate (fim da queda); null = a camada não cai */
export function instanteDoImpacto(c: Camada): number | null {
  const a = c.animacao;
  return a && a.tipo === 'cair-do-ceu' ? a.atraso + a.duracao : null;
}
/** o tremor da câmera logo depois do impacto (forte e some em ~0,5 s) */
export function tremorDoImpacto(t: number, ti: number, W: number, H: number): { dx: number; dy: number } | null {
  const s = t - ti;
  if (s < 0 || s > 0.55) return null;
  const k = (Math.min(W, H) / 1080) * 34 * Math.pow(1 - s / 0.55, 2);
  return { dx: k * Math.sin(s * 95), dy: k * Math.cos(s * 77) };
}
/** rachaduras que saem do ponto da batida (fixas: o mesmo desenho em todo quadro): curtas, recortadas, com ramos; crescem em 0,2 s */
function rachaduras(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, cresce: number) {
  const galho = (x: number, y: number, ang: number, compr: number, larg: number, semente: number, nivel: number) => {
    const passos = 6;
    const pts: Array<[number, number]> = [[x, y]];
    for (let i = 0; i < passos; i++) {
      ang += (sorte(semente, i) - 0.5) * 1.3; // zigue-zague
      x += Math.cos(ang) * (compr / passos); y += Math.sin(ang) * (compr / passos);
      pts.push([x, y]);
    }
    const tracar = () => { ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.stroke(); };
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,110,20,0.6)'; ctx.lineWidth = larg * 2.6; ctx.shadowColor = '#ff6a00'; ctx.shadowBlur = larg * 4; tracar(); ctx.restore();
    ctx.strokeStyle = 'rgba(15,6,3,0.95)'; ctx.lineWidth = larg; tracar();
    if (nivel < 1) for (let r = 0; r < 2; r++) {
      const k = 2 + r * 2; const [bx, by] = pts[k];
      galho(bx, by, ang + (r ? 0.9 : -0.9) * (0.6 + sorte(semente, 40 + r)), compr * 0.42, larg * 0.6, semente * 7 + r + 3, nivel + 1);
    }
  };
  ctx.save(); ctx.lineJoin = 'miter'; ctx.lineCap = 'round';
  for (let g = 0; g < 14; g++) {
    const ang = (g / 14) * Math.PI * 2 + (sorte(g, 21) - 0.5) * 0.4;
    galho(cx + Math.cos(ang) * R * 0.08, cy + Math.sin(ang) * R * 0.05, ang, R * (0.45 + 0.4 * sorte(g, 23)) * cresce, Math.max(2, R * 0.014), g + 1, 0);
  }
  ctx.restore();
}
/** ATRÁS da logo: a cratera e as rachaduras na parede e o fogo pegando nela */
export function desenharQuebraAtras(ctx: CanvasRenderingContext2D, c: Camada, t: number, W: number, H: number, fogo: boolean, real = false) {
  const ti = instanteDoImpacto(c);
  if (ti == null || t < ti || !c.visivel) return;
  // F-320 (pedido do dono: "a listra quebrando está horrível"): com as filmagens, nada de rachadura nem bloco desenhado
  if (real) { if (fogo) desenharFogoNaLogo(ctx, c, t, Math.min(1, (t - ti) / 0.35)); return; }
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  // as rachaduras ficam em volta da batida (não cruzam o topo nem o rodapé da arte)
  // F-319: pelo tamanho que a logo APARECE (inteira na caixa, ~1,4 : 1), não pela caixa (deitado, a caixa é bem maior)
  const vw = Math.min(c.w, c.h * 1.4);
  const R = Math.max(vw, vw / 1.4) * 0.62;
  const s = t - ti;
  ctx.save();
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  rachaduras(ctx, cx, cy, R, Math.min(1, s / 0.2));
  ctx.restore();
  if (fogo) desenharFogoNaLogo(ctx, c, t, Math.min(1, s / 0.35));
  blocos(ctx, c, s, W, H);
}
/** NA FRENTE: blocos de concreto voando, a poeira e o clarão da batida */
export function desenharQuebraFrente(ctx: CanvasRenderingContext2D, c: Camada, t: number, W: number, H: number, real = false) {
  const ti = instanteDoImpacto(c);
  if (ti == null || !c.visivel) return;
  const s = t - ti;
  if (s < 0 || s > 1.6) return;
  const k = Math.min(W, H) / 1080;
  const cx = c.x + c.w / 2, cy = c.y + c.h * 0.6;
  ctx.save();
  if (s < 0.2) { ctx.fillStyle = `rgba(255,245,220,${(0.7 * (1 - s / 0.2)).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
  // F-320: a poeira é a filmagem (fumaça de verdade); fica só o clarão
  if (real) { ctx.restore(); return; }
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * Math.PI * 2 + sorte(i, 41);
    const d = (120 + 260 * sorte(i, 42)) * k * saida(Math.min(1, s / 1.1));
    const r = (120 + 140 * sorte(i, 43)) * k * (0.6 + s);
    const x = cx + Math.cos(ang) * d * 1.4, y = cy + Math.sin(ang) * d * 0.6;
    const a = Math.max(0, 0.55 * (1 - s / 1.3));
    const p = ctx.createRadialGradient(x, y, 0, x, y, r);
    p.addColorStop(0, `rgba(170,160,150,${a.toFixed(3)})`); p.addColorStop(1, 'rgba(170,160,150,0)');
    ctx.fillStyle = p; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  ctx.restore();
}
/** a logo PEGANDO FOGO: línguas de fogo atrás dela, subindo e tremulando (desenhadas antes da logo, as letras ficam legíveis) */
export function desenharFogoNaLogo(ctx: CanvasRenderingContext2D, c: Camada, t: number, forca = 1) {
  if (forca <= 0) return;
  const n = 16;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const base = c.x + c.w * (0.04 + 0.92 * (i / (n - 1)));
    const yb = c.y + c.h * (0.62 + 0.12 * Math.sin(i * 1.7));
    const tremula = 0.75 + 0.25 * Math.sin(t * (7 + sorte(i, 71) * 5) + i * 2.1) + 0.12 * Math.sin(t * 17 + i);
    const alto = c.h * (0.55 + 0.6 * sorte(i, 72)) * tremula * forca;
    const largo = c.w * (0.07 + 0.05 * sorte(i, 73));
    const balanco = Math.sin(t * 3.1 + i) * largo * 0.6;
    const g = ctx.createLinearGradient(base, yb, base, yb - alto);
    g.addColorStop(0, 'rgba(255,240,170,0.9)'); g.addColorStop(0.25, 'rgba(255,170,30,0.8)'); g.addColorStop(0.6, 'rgba(255,70,0,0.55)'); g.addColorStop(1, 'rgba(180,10,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(base - largo, yb);
    ctx.quadraticCurveTo(base - largo * 0.9 + balanco * 0.3, yb - alto * 0.55, base + balanco, yb - alto);
    ctx.quadraticCurveTo(base + largo * 0.9 + balanco * 0.3, yb - alto * 0.55, base + largo, yb);
    ctx.closePath();
    ctx.fill();
  }
  for (let i = 0; i < 14; i++) {
    const ciclo = 1.2 + sorte(i, 81);
    const q = ((t + sorte(i, 82) * ciclo) % ciclo) / ciclo;
    const x = c.x + c.w * sorte(i, 83) + Math.sin(t * 2 + i) * 14;
    const y = c.y + c.h * 0.5 - q * c.h * 1.1;
    const img = luz(i % 2 ? '#ffb703' : '#ff6b00');
    const r = 10 + 10 * sorte(i, 84);
    if (img) { ctx.globalAlpha = forca * Math.min(1, (1 - q) * 1.5); ctx.drawImage(img, x - r, y - r, 2 * r, 2 * r); }
  }
  ctx.restore();
}

/** os blocos de concreto saindo da batida para os lados, girando e caindo (desenhados ATRÁS da logo) */
function blocos(ctx: CanvasRenderingContext2D, c: Camada, s: number, W: number, H: number) {
  if (s < 0 || s > 1.6) return;
  const k = Math.min(W, H) / 1080;
  ctx.save();
  // os blocos saem da BORDA de baixo da logo (nunca por cima das letras)
  for (let i = 0; i < 26; i++) {
    const lado = i % 2 ? 1 : -1; // para a direita ou para a esquerda, um pouco para cima
    const ang = lado > 0 ? -0.15 - 0.75 * sorte(i, 51) : Math.PI + 0.15 + 0.75 * sorte(i, 51);
    const vel = (700 + 1100 * sorte(i, 52)) * k;
    const x0 = c.x + c.w * (0.08 + 0.84 * sorte(i, 56)), y0 = c.y + c.h * 0.96;
    const x = x0 + Math.cos(ang) * vel * s;
    const y = y0 + Math.sin(ang) * vel * s + 0.5 * 2600 * k * s * s;
    const tam = (16 + 38 * sorte(i, 53)) * k;
    const vida = s > 1.2 ? Math.max(0, 1 - (s - 1.2) / 0.4) : 1;
    ctx.save();
    ctx.globalAlpha = vida;
    ctx.translate(x, y); ctx.rotate(s * (4 + 8 * sorte(i, 54)) * (i % 2 ? 1 : -1));
    ctx.beginPath();
    const lados = 5 + (i % 3);
    for (let v = 0; v < lados; v++) { const a2 = (v / lados) * Math.PI * 2; const rr = tam * (0.6 + 0.5 * sorte(i, 60 + v)); ctx.lineTo(Math.cos(a2) * rr, Math.sin(a2) * rr * 0.8); }
    ctx.closePath();
    const cinza = 120 + Math.floor(70 * sorte(i, 55));
    ctx.fillStyle = `rgb(${cinza},${cinza - 8},${cinza - 18})`; ctx.fill();
    ctx.lineWidth = 2 * k; ctx.strokeStyle = 'rgba(40,30,25,0.7)'; ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
