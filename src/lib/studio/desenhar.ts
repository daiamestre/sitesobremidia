// SOBRE MÍDIA STUDIO — desenha um documento de camadas num canvas 2D (F-221). O mesmo código pinta a miniatura do
// catálogo, a prévia do editor e o PNG final (1920×1080 / 1080×1920): o que o usuário vê é o que vai para a tela.
import { carregarFonteStudio, fonteCanvas } from './fontes';
import {
  TAMANHO_DOC, fontesDo, imagensDo, linhasDoTexto,
  type Camada, type CamadaForma, type CamadaImagem, type CamadaItens, type CamadaSelo, type CamadaTexto, type Degrade, type Documento,
} from './documento';

export type Imagens = Map<string, HTMLImageElement>;

const cache = new Map<string, Promise<HTMLImageElement | null>>();
export function carregarImagem(src: string): Promise<HTMLImageElement | null> {
  let p = cache.get(src);
  if (!p) {
    p = new Promise((ok) => {
      const i = new Image();
      if (/^https?:/.test(src) && !src.startsWith(location.origin)) i.crossOrigin = 'anonymous';
      i.onload = () => ok(i);
      i.onerror = () => { cache.delete(src); ok(null); };
      i.src = src;
    });
    cache.set(src, p);
  }
  return p;
}

/** Espera fontes e fotos do documento. */
export async function prepararDocumento(d: Documento): Promise<Imagens> {
  await Promise.all(fontesDo(d).map(carregarFonteStudio));
  const mapa: Imagens = new Map();
  await Promise.all(imagensDo(d).map(async (s) => { const i = await carregarImagem(s); if (i) mapa.set(s, i); }));
  return mapa;
}

function preenchimento(ctx: CanvasRenderingContext2D, cor: string, degrade: Degrade | null | undefined, w: number, h: number): string | CanvasGradient {
  if (!degrade) return cor;
  const a = (degrade.angulo * Math.PI) / 180;
  const r = (Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))) / 2;
  const g = ctx.createLinearGradient(-Math.cos(a) * r, -Math.sin(a) * r, Math.cos(a) * r, Math.sin(a) * r);
  g.addColorStop(0, degrade.de);
  if (degrade.meio) g.addColorStop(0.5, degrade.meio);
  g.addColorStop(1, degrade.para);
  return g;
}

function sombra(ctx: CanvasRenderingContext2D, c: Camada, escala: number) {
  if (!c.sombra) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; return; }
  ctx.shadowColor = c.sombra.cor;
  ctx.shadowBlur = c.sombra.desfoque * escala;
  ctx.shadowOffsetX = c.sombra.dx * escala;
  ctx.shadowOffsetY = c.sombra.dy * escala;
}

function caminho(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  const raio = Math.max(0, Math.min(r, w / 2, h / 2));
  if (raio && 'roundRect' in ctx) (ctx as CanvasRenderingContext2D & { roundRect: (...a: number[]) => void }).roundRect(x, y, w, h, raio);
  else ctx.rect(x, y, w, h);
}

function desenharForma(ctx: CanvasRenderingContext2D, c: CamadaForma) {
  if (c.inclinacao) ctx.transform(1, 0, Math.tan((c.inclinacao * Math.PI) / 180), 1, 0, 0);
  ctx.fillStyle = preenchimento(ctx, c.cor, c.degrade, c.w, c.h);
  if (c.forma === 'elipse') { ctx.beginPath(); ctx.ellipse(0, 0, c.w / 2, c.h / 2, 0, 0, Math.PI * 2); } else caminho(ctx, -c.w / 2, -c.h / 2, c.w, c.h, c.raio);
  ctx.fill();
  if (c.borda?.largura) { ctx.lineWidth = c.borda.largura; ctx.strokeStyle = c.borda.cor; ctx.stroke(); }
}

function desenharImagem(ctx: CanvasRenderingContext2D, c: CamadaImagem, img: HTMLImageElement | undefined, e: number) {
  if (c.sombra) { ctx.fillStyle = '#000'; caminho(ctx, -c.w / 2, -c.h / 2, c.w, c.h, c.raio); ctx.fill(); }
  ctx.shadowColor = 'transparent';
  caminho(ctx, -c.w / 2, -c.h / 2, c.w, c.h, c.raio);
  ctx.clip();
  if (!img) { ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h); return; }
  const s = Math.max(c.w / img.naturalWidth, c.h / img.naturalHeight) * Math.max(1, c.zoom);
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
  const dx = -c.w / 2 + (c.w - dw) * (c.focoX / 100);
  const dy = -c.h / 2 + (c.h - dh) * (c.focoY / 100);
  const filtros = [c.brilho !== 100 && `brightness(${c.brilho}%)`, c.contraste !== 100 && `contrast(${c.contraste}%)`, c.saturacao !== 100 && `saturate(${c.saturacao}%)`, c.desfoque > 0 && `blur(${c.desfoque * e}px)`].filter(Boolean).join(' ');
  if (filtros) ctx.filter = filtros;
  if (c.espelhar) { ctx.scale(-1, 1); ctx.drawImage(img, -dx - dw, dy, dw, dh); } else ctx.drawImage(img, dx, dy, dw, dh);
  ctx.filter = 'none';
}

function comEspacamento(ctx: CanvasRenderingContext2D, px: number) {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ('letterSpacing' in c) c.letterSpacing = `${px}px`;
}

function desenharTexto(ctx: CanvasRenderingContext2D, c: CamadaTexto) {
  const linhas = linhasDoTexto(c);
  const lh = c.tamanho * c.entrelinha;
  ctx.font = fonteCanvas(c.fonte, c.tamanho, c.peso, c.italico);
  comEspacamento(ctx, c.espacamento * c.tamanho);
  ctx.textBaseline = 'middle';
  ctx.textAlign = c.alinhamento;
  const larguras = linhas.map((l) => ctx.measureText(l).width);
  const m = c.fundo?.margem ?? 0;
  const topo = -c.h / 2;
  const xLinha = c.alinhamento === 'left' ? -c.w / 2 + m : c.alinhamento === 'right' ? c.w / 2 - m : 0;
  if (c.fundo) {
    const largura = Math.min(c.w, Math.max(...larguras) + 2 * m);
    const x0 = c.alinhamento === 'left' ? -c.w / 2 : c.alinhamento === 'right' ? c.w / 2 - largura : -largura / 2;
    ctx.fillStyle = c.fundo.cor;
    caminho(ctx, x0, topo, largura, c.h, c.fundo.raio);
    ctx.fill();
    ctx.shadowColor = 'transparent';
  }
  const y0 = topo + (c.fundo ? m * 0.55 : 0) + lh / 2;
  const fill = preenchimento(ctx, c.cor, c.degrade, c.w, c.h);
  linhas.forEach((l, i) => {
    const y = y0 + i * lh;
    if (c.contorno?.largura) {
      const s = ctx.shadowColor; ctx.shadowColor = 'transparent';
      ctx.lineJoin = 'round'; ctx.lineWidth = c.contorno.largura * 2; ctx.strokeStyle = c.contorno.cor; ctx.strokeText(l, xLinha, y);
      ctx.shadowColor = s;
    }
    ctx.fillStyle = c.corUltimaLinha && i === linhas.length - 1 && linhas.length > 1 ? c.corUltimaLinha : fill;
    ctx.fillText(l, xLinha, y);
  });
  comEspacamento(ctx, 0);
}

function desenharSelo(ctx: CanvasRenderingContext2D, c: CamadaSelo) {
  const r = Math.min(c.w, c.h) / 2;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = c.cor; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = r * 0.055; ctx.strokeStyle = c.borda; ctx.beginPath(); ctx.arc(0, 0, r - ctx.lineWidth / 2, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = c.corTexto; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const longo = c.valor.length > 3;
  const tv = r * (longo ? 0.48 : 0.8);
  const temTopo = !!c.topo, temBase = !!c.base;
  const yValor = (temTopo ? r * 0.08 : 0) - (temBase ? r * 0.08 : 0);
  if (temTopo) { ctx.font = fonteCanvas('poppins', r * 0.22, 800); ctx.fillText(c.topo, 0, yValor - tv * 0.62); }
  ctx.font = fonteCanvas(c.fonte, tv);
  const wv = ctx.measureText(c.valor).width;
  ctx.font = fonteCanvas(c.fonte, tv * 0.5);
  const ws = c.sufixo ? ctx.measureText(c.sufixo).width : 0;
  ctx.textAlign = 'left';
  ctx.font = fonteCanvas(c.fonte, tv);
  ctx.fillText(c.valor, -(wv + ws) / 2, yValor);
  if (c.sufixo) { ctx.font = fonteCanvas(c.fonte, tv * 0.5); ctx.fillText(c.sufixo, -(wv + ws) / 2 + wv, yValor - tv * 0.2); }
  ctx.textAlign = 'center';
  if (temBase) { ctx.font = fonteCanvas('poppins', r * 0.24, 900); ctx.fillText(c.base, 0, yValor + tv * 0.62); }
}

function desenharItens(ctx: CanvasRenderingContext2D, c: CamadaItens) {
  const t = c.tamanho;
  ctx.font = fonteCanvas(c.fonte, t, 700);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  let x = -c.w / 2, y = -c.h / 2 + t * 0.725;
  for (const item of c.itens) {
    const r = t * 0.72;
    ctx.lineWidth = t * 0.13; ctx.strokeStyle = c.destaque;
    ctx.beginPath(); ctx.arc(x + r, y, r - ctx.lineWidth / 2, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = t * 0.14; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x + r * 0.55, y + r * 0.02); ctx.lineTo(x + r * 0.88, y + r * 0.34); ctx.lineTo(x + r * 1.46, y - r * 0.32); ctx.stroke();
    ctx.fillStyle = c.cor;
    ctx.fillText(item, x + r * 2 + t * 0.35, y);
    if (c.vertical) y += t * 1.75; else x += r * 2 + t * 0.35 + ctx.measureText(item).width + t * 1.1;
  }
}

/** Pinta o documento inteiro; `escala` = pixels do canvas por pixel do documento. */
export function desenharDocumento(ctx: CanvasRenderingContext2D, d: Documento, imgs: Imagens, escala = 1, ocultar?: string | null) {
  const { w, h } = TAMANHO_DOC[d.formato];
  ctx.save();
  ctx.setTransform(escala, 0, 0, escala, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = d.fundo; ctx.fillRect(0, 0, w, h);
  for (const c of d.camadas) {
    if (!c.visivel || c.opacidade <= 0 || c.id === ocultar) continue;
    ctx.save();
    ctx.globalAlpha = c.opacidade;
    ctx.translate(c.x + c.w / 2, c.y + c.h / 2);
    if (c.rot) ctx.rotate((c.rot * Math.PI) / 180);
    sombra(ctx, c, escala);
    if (c.tipo === 'forma') desenharForma(ctx, c);
    else if (c.tipo === 'imagem') desenharImagem(ctx, c, imgs.get(c.src), escala);
    else if (c.tipo === 'texto') desenharTexto(ctx, c);
    else if (c.tipo === 'selo') desenharSelo(ctx, c);
    else desenharItens(ctx, c);
    ctx.restore();
  }
  ctx.restore();
}

/** PNG em tamanho real (1920×1080 ou 1080×1920). */
export async function documentoParaPng(d: Documento): Promise<{ png: Blob; largura: number; altura: number }> {
  const { w, h } = TAMANHO_DOC[d.formato];
  const imgs = await prepararDocumento(d);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Este navegador não consegue desenhar a arte.');
  desenharDocumento(ctx, d, imgs, 1);
  const png = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'));
  if (!png) throw new Error('Não foi possível gerar a imagem da arte (uma foto de outro site bloqueou a exportação).');
  return { png, largura: w, altura: h };
}
