// SOBRE MÍDIA STUDIO — desenha um documento de camadas num canvas 2D (F-221). O mesmo código pinta a miniatura do
// catálogo, a prévia do editor e o PNG final (1920×1080 / 1080×1920): o que o usuário vê é o que vai para a tela.
import { carregarFonteStudio, fonteCanvas } from './fontes';
import { arranjoDoBalao, type Medir } from './balao';
import {
  TAMANHO_DOC, fontesDo, imagensDo, linhasDoTexto,
  type Camada, type CamadaForma, type CamadaImagem, type CamadaItens, type CamadaSelo, type CamadaTexto, type Degrade, type Documento,
} from './documento';
import { duracaoDoVideo, estadoNoTempo } from './animacao';

export type Imagens = Map<string, HTMLImageElement>;

const cache = new Map<string, Promise<HTMLImageElement | null>>();
export function carregarImagem(src: string): Promise<HTMLImageElement | null> {
  let p = cache.get(src);
  if (!p) {
    p = new Promise((ok) => {
      const externa = /^https?:/.test(src) && !src.startsWith(location.origin);
      const i = new Image();
      if (externa) i.crossOrigin = 'anonymous';
      i.onload = () => ok(i);
      let tentou = false;
      i.onerror = () => {
        // F-243: se a foto já foi exibida como <img> comum, o navegador guarda a cópia sem a permissão (CORS) que a arte
        // exige e o produto saía sem foto; pedir por outro endereço escapa dessa cópia guardada
        if (externa && !tentou) { tentou = true; i.src = `${src}${src.includes('?') ? '&' : '?'}arte=1`; return; }
        cache.delete(src); ok(null);
      };
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
  // F-240: imagem recortada (logo PNG sem fundo, produto) com sombra: a sombra segue o contorno, sem caixa atrás
  const recorte = c.ajuste === 'conter' && !!c.sombra && c.zoom <= 1;
  if (c.sombra && !recorte) { ctx.fillStyle = '#000'; caminho(ctx, -c.w / 2, -c.h / 2, c.w, c.h, c.raio); ctx.fill(); }
  if (!recorte) {
    ctx.shadowColor = 'transparent';
    caminho(ctx, -c.w / 2, -c.h / 2, c.w, c.h, c.raio);
    ctx.clip();
  }
  if (!img) { ctx.shadowColor = 'transparent'; ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h); return; }
  const s = (c.ajuste === 'conter' ? Math.min : Math.max)(c.w / img.naturalWidth, c.h / img.naturalHeight) * Math.max(1, c.zoom);
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
    const largura = c.fundo.cheio ? c.w : Math.min(c.w, Math.max(...larguras) + 2 * m);
    const x0 = c.fundo.cheio ? -c.w / 2 : c.alinhamento === 'left' ? -c.w / 2 : c.alinhamento === 'right' ? c.w / 2 - largura : -largura / 2;
    ctx.fillStyle = c.fundo.cor;
    caminho(ctx, x0, topo, largura, c.h, c.fundo.raio);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    if (c.fundo.borda?.largura) { ctx.lineWidth = c.fundo.borda.largura; ctx.strokeStyle = c.fundo.borda.cor; ctx.stroke(); }
  }
  const y0 = topo + (c.fundo ? m * 0.55 : 0) + lh / 2;
  const fill = preenchimento(ctx, c.cor, c.degrade, c.w, c.h);
  // F-242: cada linha fica com as LETRAS no meio da sua faixa (pela altura real da maiúscula, não pela caixa da fonte, que
  // deixava o texto mais alto ou mais baixo conforme a fonte) — nome e valor centralizados em botões, pílulas e cartões
  const altoDaLetra = ctx.measureText('H').actualBoundingBoxAscent;
  if (altoDaLetra > 0) ctx.textBaseline = 'alphabetic';
  const ajuste = altoDaLetra > 0 ? altoDaLetra / 2 : 0;
  linhas.forEach((l, i) => {
    const y = y0 + i * lh + ajuste;
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

/** F-239: balão de preço realista — volume (degradê radial), aro dourado, brilho em cima; R$ + valor + centavos centralizados. */
function clarear(hex: string, f: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const canal = (v: number) => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f));
  return `rgb(${canal(n >> 16)}, ${canal((n >> 8) & 255)}, ${canal(n & 255)})`;
}
/** borda do volume: escurece puxando para o laranja (amarelo não fica esverdeado) */
function quente(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgb(${Math.round((n >> 16) * 0.98)}, ${Math.round(((n >> 8) & 255) * 0.8)}, ${Math.round((n & 255) * 0.35)})`;
}
function desenharSeloRealista(ctx: CanvasRenderingContext2D, c: CamadaSelo) {
  const r = Math.min(c.w, c.h) / 2;
  const g = ctx.createRadialGradient(-r * 0.32, -r * 0.38, r * 0.05, 0, 0, r);
  // F-242: amarelo limpo (sem puxar para o laranja/esverdeado): claro no reflexo, a cor no meio, dourado na borda
  g.addColorStop(0, clarear(c.cor, 0.45)); g.addColorStop(0.55, c.cor); g.addColorStop(1, quente(c.cor));
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  ctx.shadowColor = 'transparent';
  // aro: branco por fora, dourado escuro por dentro
  const aro = r * 0.06;
  ctx.lineWidth = aro; ctx.strokeStyle = c.borda; ctx.beginPath(); ctx.arc(0, 0, r - aro / 2, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = r * 0.018; ctx.strokeStyle = clarear(c.cor, -0.4); ctx.beginPath(); ctx.arc(0, 0, r - aro - r * 0.01, 0, Math.PI * 2); ctx.stroke();
  // brilho em cima (reflexo)
  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, r - aro, 0, Math.PI * 2); ctx.clip();
  const b = ctx.createLinearGradient(0, -r, 0, -r * 0.1);
  b.addColorStop(0, 'rgba(255,255,255,.55)'); b.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = b; ctx.beginPath(); ctx.ellipse(0, -r * 0.52, r * 0.78, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  textosDoSelo(ctx, c, true);
}

/** REGRA (F-247/F-249): os textos de TODO balão saem de arranjoDoBalao, centralizados pela medida real da letra. */
function textosDoSelo(ctx: CanvasRenderingContext2D, c: CamadaSelo, relevo: boolean) {
  const medir: Medir = (txt, tam, f) => {
    ctx.font = f === 'valor' ? fonteCanvas(c.fonte, tam) : fonteCanvas('poppins', tam, 800);
    const m = ctx.measureText(txt);
    return { largura: m.width, sobe: m.actualBoundingBoxAscent || tam * 0.75, desce: m.actualBoundingBoxDescent || 0 };
  };
  const r = Math.min(c.w, c.h) / 2;
  const arr = arranjoDoBalao({ ...c, classico: !c.realista && (c.formato ?? 'circulo') === 'circulo' }, medir);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  const corValor = c.corValor || c.corTexto;
  const contorno = c.contornoValor?.largura ? c.contornoValor : null;
  const valor = (p: { texto: string; tamanho: number; x: number; y: number } | null, cor: string) => {
    if (!p) return;
    ctx.font = fonteCanvas(c.fonte, p.tamanho);
    if (contorno) { ctx.lineJoin = 'round'; ctx.lineWidth = contorno.largura * (r / 100); ctx.strokeStyle = contorno.cor; ctx.strokeText(p.texto, p.x, p.y); }
    if (relevo && !contorno) { ctx.shadowColor = clarear(c.corTexto, -0.45); ctx.shadowOffsetY = r * 0.025; }
    ctx.fillStyle = cor; ctx.fillText(p.texto, p.x, p.y);
    ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0;
  };
  valor(arr.moeda, c.corMoeda || corValor); valor(arr.valor, corValor); valor(arr.sufixo, corValor);
  const detalhe = (p: { texto: string; tamanho: number; x: number; y: number } | null, cor: string) => {
    if (!p) return;
    ctx.font = fonteCanvas('poppins', p.tamanho, 800); ctx.fillStyle = cor; ctx.fillText(p.texto, p.x, p.y);
  };
  detalhe(arr.topo, c.corTopo || c.corTexto); detalhe(arr.base, c.corTexto);
}

/** F-249: balão oval ou placa, de um objeto só: aro externo, corpo com degradê e borda. */
function desenharBalaoReto(ctx: CanvasRenderingContext2D, c: CamadaSelo) {
  const oval = c.formato === 'oval';
  const contorno = (w: number, h: number) => { ctx.beginPath(); if (oval) ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); else caminho(ctx, -w / 2, -h / 2, w, h, h * 0.22); };
  const aro = c.aroFora ? Math.max(3, c.h * 0.04) : 0;
  if (c.aroFora) { contorno(c.w, c.h); ctx.fillStyle = c.aroFora; ctx.fill(); ctx.shadowColor = 'transparent'; }
  const w = c.w - 2 * aro, h = c.h - 2 * aro;
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, c.cor); g.addColorStop(1, c.corFim || c.cor);
  contorno(w, h); ctx.fillStyle = g; ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.lineWidth = Math.max(3, c.h * 0.05); ctx.strokeStyle = c.borda; contorno(w, h); ctx.stroke();
  textosDoSelo(ctx, c, false);
}

function desenharSelo(ctx: CanvasRenderingContext2D, c: CamadaSelo) {
  if (c.formato === 'oval' || c.formato === 'placa') { desenharBalaoReto(ctx, c); return; }
  if (c.realista) { desenharSeloRealista(ctx, c); return; }
  const r = Math.min(c.w, c.h) / 2;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = c.cor; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = r * 0.055; ctx.strokeStyle = c.borda; ctx.beginPath(); ctx.arc(0, 0, r - ctx.lineWidth / 2, 0, Math.PI * 2); ctx.stroke();
  textosDoSelo(ctx, c, false);
}

/** F-249: faixa com o texto passando sem parar. Sem tempo (imagem parada), mostra a faixa com o texto no começo. */
function desenharLetreiro(ctx: CanvasRenderingContext2D, c: CamadaTexto, tempo: number) {
  const l = c.letreiro!;
  ctx.fillStyle = l.fundo;
  ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
  ctx.shadowColor = 'transparent';
  ctx.save();
  ctx.beginPath(); ctx.rect(-c.w / 2, -c.h / 2, c.w, c.h); ctx.clip();
  ctx.font = fonteCanvas(c.fonte, c.tamanho, c.peso, c.italico);
  const txt = c.maiusculas ? c.texto.toUpperCase() : c.texto;
  const periodo = ctx.measureText(txt).width + c.tamanho * 2;
  const alto = ctx.measureText('H').actualBoundingBoxAscent || c.tamanho * 0.7;
  ctx.fillStyle = c.cor; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  const passo = ((tempo * l.velocidade) % periodo + periodo) % periodo;
  for (let x = -c.w / 2 - passo; x < c.w / 2; x += periodo) ctx.fillText(txt, x, alto / 2);
  ctx.restore();
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

/** Pinta uma camada (com a animação no instante `tempo`, se houver). Usado pela arte e pelo editor de vídeo (F-227). */
export function desenharCamada(ctx: CanvasRenderingContext2D, c: Camada, imgs: Imagens, escala: number, tempo?: number, total = 8) {
  if (!c.visivel || c.opacidade <= 0) return;
  const a = tempo === undefined ? null : estadoNoTempo(c, tempo, total);
  if (a && a.alfa <= 0) return;
  ctx.save();
  ctx.globalAlpha *= c.opacidade * (a?.alfa ?? 1);
  ctx.translate(c.x + c.w / 2 + (a?.dx ?? 0), c.y + c.h / 2 + (a?.dy ?? 0));
  const giro = c.rot + (a?.rot ?? 0);
  if (giro) ctx.rotate((giro * Math.PI) / 180);
  if (a && a.escala !== 1) ctx.scale(a.escala, a.escala);
  sombra(ctx, c, escala);
  if (c.tipo === 'forma') desenharForma(ctx, c);
  else if (c.tipo === 'imagem') desenharImagem(ctx, a && a.zoom !== 1 ? { ...c, zoom: Math.max(1, c.zoom) * a.zoom } : c, imgs.get(c.src), escala);
  else if (c.tipo === 'texto' && c.letreiro) desenharLetreiro(ctx, c, tempo ?? 0);
  else if (c.tipo === 'texto') desenharTexto(ctx, a?.letras != null ? { ...c, texto: c.texto.slice(0, a.letras) } : c);
  else if (c.tipo === 'selo') desenharSelo(ctx, c);
  else desenharItens(ctx, c);
  ctx.restore();
}

/** Pinta o documento inteiro; `escala` = pixels do canvas por pixel do documento. Com `tempo` (segundos), aplica as animações (F-225). */
export function desenharDocumento(ctx: CanvasRenderingContext2D, d: Documento, imgs: Imagens, escala = 1, ocultar?: string | null, tempo?: number) {
  const total = duracaoDoVideo(d);
  const { w, h } = TAMANHO_DOC[d.formato];
  ctx.save();
  ctx.setTransform(escala, 0, 0, escala, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = d.fundo; ctx.fillRect(0, 0, w, h);
  for (const c of d.camadas) if (c.id !== ocultar) desenharCamada(ctx, c, imgs, escala, tempo, total);
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
