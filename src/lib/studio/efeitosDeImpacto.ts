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
