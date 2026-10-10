/**
 * Tabloide Digital (F-173) — selo 3D do título ("OFERTAS / DA SEMANA"), desenhado por nós no canvas.
 * É arte própria do SOBRE MÍDIA: placa com volume, aro dourado, letras com profundidade e faixa inclinada.
 * Qualquer título digitado vira selo 3D, em qualquer tema.
 */

export interface CoresSelo {
  /** Cor da placa (fundo do selo). */
  placa: string;
  /** Cor das letras da 1ª linha. */
  texto: string;
  /** Cor da faixa da 2ª linha e das letras dela. */
  faixa: string;
  textoFaixa: string;
}

const PEQUENAS = new Set(['DA', 'DO', 'DE', 'DAS', 'DOS', 'E', 'A', 'O', 'NO', 'NA', 'EM', 'COM', 'É']);

/** Divide o título em até 2 linhas equilibradas; palavra pequena ("DA", "DO") fica com a linha de baixo. */
export function dividirTitulo(titulo: string): string[] {
  const palavras = titulo.toUpperCase().trim().split(/\s+/).filter(Boolean);
  if (palavras.length <= 1) return palavras;
  let melhor = 1;
  let nota = Infinity;
  for (let i = 1; i < palavras.length; i++) {
    const a = palavras.slice(0, i).join(' ').length;
    const b = palavras.slice(i).join(' ').length;
    // não termina a linha de cima com palavra pequena
    const pena = PEQUENAS.has(palavras[i - 1]) ? 6 : 0;
    const n = Math.abs(a - b) + pena;
    if (n < nota) { nota = n; melhor = i; }
  }
  return [palavras.slice(0, melhor).join(' '), palavras.slice(melhor).join(' ')];
}

function hexParaRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return Number.isFinite(n) && h.length === 6 ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [200, 20, 30];
}

/** Clareia (f > 0) ou escurece (f < 0) uma cor. */
export function tom(hex: string, f: number): string {
  const [r, g, b] = hexParaRgb(hex);
  const m = (v: number) => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

/** Luminância aproximada (0 escuro … 1 claro). */
export function claridade(hex: string): number {
  const [r, g, b] = hexParaRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Cores do selo a partir do selo de preço do tema (sempre com contraste). */
export function coresDoSelo(preco: string, precoCor: string): CoresSelo {
  const placaClara = claridade(preco) > 0.6;
  return placaClara
    ? { placa: preco, texto: precoCor, faixa: precoCor, textoFaixa: preco }
    : { placa: preco, texto: '#ffffff', faixa: '#ffc800', textoFaixa: tom(preco, -0.35) };
}

function caminhoArredondado(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

function placa3D(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, cor: string, prof: number, aro: number) {
  // volume (lado de baixo)
  ctx.fillStyle = tom(cor, -0.55);
  for (let i = prof; i >= 1; i--) { caminhoArredondado(ctx, x, y + i, w, h, r); ctx.fill(); }
  // face
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, tom(cor, 0.28));
  g.addColorStop(0.5, cor);
  g.addColorStop(1, tom(cor, -0.28));
  caminhoArredondado(ctx, x, y, w, h, r);
  ctx.fillStyle = g;
  ctx.fill();
  // aro dourado
  if (aro > 0) {
    const ouro = ctx.createLinearGradient(0, y, 0, y + h);
    ouro.addColorStop(0, '#fff3a6');
    ouro.addColorStop(0.5, '#ffc21a');
    ouro.addColorStop(1, '#b97800');
    ctx.lineWidth = aro;
    ctx.strokeStyle = ouro;
    caminhoArredondado(ctx, x + aro / 2, y + aro / 2, w - aro, h - aro, Math.max(1, r - aro / 2));
    ctx.stroke();
  }
  // brilho na metade de cima
  ctx.save();
  caminhoArredondado(ctx, x, y, w, h, r);
  ctx.clip();
  const brilho = ctx.createLinearGradient(0, y, 0, y + h * 0.55);
  brilho.addColorStop(0, 'rgba(255,255,255,.34)');
  brilho.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = brilho;
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y, w * 0.62, h * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Brilho especular: uma faixa clara na metade de cima das letras, só onde há letra (camada à parte, sem vazar). */
function brilhoDasLetras(ctx: CanvasRenderingContext2D, txt: string, cx: number, cy: number, tamanho: number) {
  if (typeof document === 'undefined') return;
  const margem = Math.ceil(tamanho * 0.3);
  const larg = Math.ceil((ctx.measureText(txt).width || txt.length * tamanho * 0.7) + margem * 2);
  const alt = Math.ceil(tamanho * 1.5);
  const cam = document.createElement('canvas');
  cam.width = larg;
  cam.height = alt;
  const c2 = cam.getContext('2d');
  if (!c2) return;
  c2.font = ctx.font;
  c2.textAlign = 'center';
  c2.textBaseline = 'middle';
  c2.fillStyle = '#fff';
  c2.fillText(txt, larg / 2, alt / 2);
  c2.globalCompositeOperation = 'source-in';
  const g = c2.createLinearGradient(0, alt / 2 - tamanho * 0.5, 0, alt / 2 + tamanho * 0.5);
  g.addColorStop(0, 'rgba(255,255,255,.75)');
  g.addColorStop(0.42, 'rgba(255,255,255,.25)');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c2.fillStyle = g;
  c2.fillRect(0, 0, larg, alt);
  ctx.drawImage(cam, cx - larg / 2, cy - alt / 2);
}

function texto3D(ctx: CanvasRenderingContext2D, txt: string, cx: number, cy: number, tamanho: number, cor: string, sombra: string, prof: number, ouro = false) {
  ctx.font = `900 ${tamanho}px 'Arial Black','Segoe UI Black',Impact,system-ui,sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  // profundidade (extrusão para baixo, bem escura)
  ctx.fillStyle = sombra;
  ctx.strokeStyle = sombra;
  ctx.lineWidth = tamanho * (ouro ? 0.14 : 0.1);
  for (let i = prof; i >= 0; i--) { ctx.strokeText(txt, cx, cy + i); ctx.fillText(txt, cx, cy + i); }
  // contorno dourado metálico (chanfro) em volta da letra
  if (ouro) {
    const og = ctx.createLinearGradient(0, cy - tamanho / 2, 0, cy + tamanho / 2);
    og.addColorStop(0, '#fff3a6');
    og.addColorStop(0.5, '#ffc21a');
    og.addColorStop(1, '#b97800');
    ctx.strokeStyle = og;
    ctx.lineWidth = tamanho * 0.1;
    ctx.strokeText(txt, cx, cy);
  }
  // face com degradê
  const g = ctx.createLinearGradient(0, cy - tamanho / 2, 0, cy + tamanho / 2);
  g.addColorStop(0, tom(cor.startsWith('#') ? cor : '#ffffff', 0.25));
  g.addColorStop(0.55, cor);
  g.addColorStop(1, cor.startsWith('#') ? tom(cor, -0.18) : cor);
  ctx.fillStyle = g;
  ctx.fillText(txt, cx, cy);
  brilhoDasLetras(ctx, txt, cx, cy, tamanho);
}
function tamanhoQueCabe(ctx: CanvasRenderingContext2D, txt: string, larguraMax: number, alturaMax: number): number {
  let t = alturaMax;
  ctx.font = `900 ${t}px 'Arial Black','Segoe UI Black',Impact,system-ui,sans-serif`;
  const l = ctx.measureText(txt).width || txt.length * t * 0.7;
  if (l > larguraMax) t = t * (larguraMax / l);
  return t;
}

/** Desenha o selo ocupando o canvas inteiro (largura × altura em pixels do canvas). */
export function desenharSelo3D(ctx: CanvasRenderingContext2D, largura: number, altura: number, titulo: string, cores: CoresSelo): void {
  ctx.clearRect(0, 0, largura, altura);
  const linhas = dividirTitulo(titulo);
  if (!linhas.length) return;
  const prof = Math.max(3, Math.round(altura * 0.045));
  ctx.save();
  ctx.translate(largura / 2, altura / 2);
  ctx.rotate((-2.5 * Math.PI) / 180);
  ctx.translate(-largura / 2, -altura / 2);

  const mx = largura * 0.05;
  const duas = linhas.length > 1;
  const placaA = altura * (duas ? 0.56 : 0.68);
  const placaY = altura * (duas ? 0.1 : 0.16);
  // medalhão redondo atrás (dá o formato de selo)
  const raio = altura * 0.47;
  const cxM = largura / 2;
  const cyM = altura * 0.5;
  ctx.fillStyle = tom(cores.placa, -0.6);
  ctx.beginPath(); ctx.arc(cxM, cyM + prof, raio, 0, Math.PI * 2); ctx.fill();
  const gm = ctx.createRadialGradient(cxM, cyM - raio * 0.4, raio * 0.1, cxM, cyM, raio);
  gm.addColorStop(0, tom(cores.placa, 0.25));
  gm.addColorStop(1, tom(cores.placa, -0.3));
  ctx.fillStyle = gm;
  ctx.beginPath(); ctx.arc(cxM, cyM, raio, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = altura * 0.03;
  ctx.strokeStyle = '#ffc21a';
  ctx.beginPath(); ctx.arc(cxM, cyM, raio * 0.9, 0, Math.PI * 2); ctx.stroke();
  placa3D(ctx, mx, placaY, largura - mx * 2, placaA, placaA * 0.34, cores.placa, prof, altura * 0.035);
  // bolha de desconto no alto
  const rb = altura * 0.105;
  const bx = largura / 2;
  const by = rb + 1;
  ctx.fillStyle = tom(cores.placa, -0.55);
  ctx.beginPath(); ctx.arc(bx, by + prof * 0.5, rb, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = tom(cores.placa, 0.1);
  ctx.beginPath(); ctx.arc(bx, by, rb, 0, Math.PI * 2); ctx.fill();
  texto3D(ctx, '%', bx, by + rb * 0.05, rb * 1.3, '#ffd400', tom(cores.placa, -0.6), Math.max(1, Math.round(prof * 0.3)));

  const t1 = tamanhoQueCabe(ctx, linhas[0], (largura - mx * 2) * 0.86, placaA * (duas ? 0.62 : 0.66));
  texto3D(ctx, linhas[0], largura / 2, placaY + placaA * (duas ? 0.44 : 0.5), t1, cores.texto, tom(cores.placa, -0.62), Math.round(prof * 0.8), true);

  if (duas) {
    const faixaA = altura * 0.34;
    const faixaY = altura * 0.58;
    ctx.font = `900 ${faixaA * 0.66}px 'Arial Black',Impact,sans-serif`;
    const t2 = tamanhoQueCabe(ctx, linhas[1], largura * 0.8, faixaA * 0.66);
    ctx.font = `900 ${t2}px 'Arial Black',Impact,sans-serif`;
    const larg2 = Math.min(largura * 0.94, (ctx.measureText(linhas[1]).width || linhas[1].length * t2 * 0.7) + faixaA * 1.1);
    ctx.save();
    ctx.translate(largura / 2, faixaY + faixaA / 2);
    ctx.rotate((-1.5 * Math.PI) / 180);
    placa3D(ctx, -larg2 / 2, -faixaA / 2, larg2, faixaA, faixaA * 0.28, cores.faixa, Math.round(prof * 0.8), 0);
    texto3D(ctx, linhas[1], 0, 0, t2, cores.textoFaixa, 'rgba(0,0,0,.28)', Math.max(1, Math.round(prof * 0.3)));
    const rr = faixaA * 0.05;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath(); ctx.arc(sx * (larg2 / 2 - faixaA * 0.2), sy * (faixaA / 2 - faixaA * 0.17) + rr * 0.4, rr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff6c9';
      ctx.beginPath(); ctx.arc(sx * (larg2 / 2 - faixaA * 0.2), sy * (faixaA / 2 - faixaA * 0.17), rr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}

const FONTE_SELO = "'Arial Black','Segoe UI Black',Impact,system-ui,sans-serif";

export interface TextoPreco {
  /** null = produto sem preço ("CONSULTE"). */
  inteiro: string | null;
  centavos: string;
  unidade: string | null;
}

/** Largura (em pixels) que o selo de preço precisa, para uma altura de número `grande`. */
export function larguraDoPreco(p: TextoPreco, grande: number): number {
  if (p.inteiro == null) return grande * 3.4;
  const lado = Math.max(1.1, (p.unidade ?? '').length * 0.16);
  return grande * (0.5 + 0.72 + p.inteiro.length * 0.7 + lado + 0.25);
}

/** Selo de preço com volume: "R$" pequeno, número grande, centavos e unidade ao lado. Encosta na direita do canvas. */
export function desenharPreco(ctx: CanvasRenderingContext2D, largura: number, altura: number, p: TextoPreco, cor: string, corTexto: string): void {
  ctx.clearRect(0, 0, largura, altura);
  const prof = Math.max(2, Math.round(altura * 0.07));
  const caixaA = altura - prof - 2;
  const g = caixaA / 1.16; // altura do número
  const fonte = (t: number) => `900 ${t}px ${FONTE_SELO}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  if (p.inteiro == null) {
    placa3D(ctx, 1, 1, largura - 2, caixaA, caixaA * 0.28, cor, prof, 0);
    ctx.font = fonte(g * 0.5);
    ctx.fillStyle = corTexto;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CONSULTE', largura / 2, 1 + caixaA / 2);
    return;
  }
  ctx.font = fonte(g * 0.3);
  const lRs = ctx.measureText('R$').width || g * 0.6;
  ctx.font = fonte(g);
  const lInt = ctx.measureText(p.inteiro).width || p.inteiro.length * g * 0.7;
  ctx.font = fonte(g * 0.42);
  const lCent = ctx.measureText(',' + p.centavos).width || g * 1.1;
  ctx.font = fonte(g * 0.2);
  const lUn = p.unidade ? (ctx.measureText(p.unidade).width || p.unidade.length * g * 0.14) : 0;
  const lado = Math.max(lCent, lUn + g * 0.06);
  const folga = g * 0.22;
  const conteudo = lRs + g * 0.06 + lInt + g * 0.04 + lado;
  const caixaL = Math.min(largura - 2, conteudo + folga * 2);
  const x0 = largura - 1 - caixaL;
  placa3D(ctx, x0, 1, caixaL, caixaA, caixaA * 0.26, cor, prof, 0);
  ctx.lineWidth = Math.max(2, g * 0.045);
  ctx.strokeStyle = '#ffffff';
  caminhoArredondado(ctx, x0 + ctx.lineWidth / 2, 1 + ctx.lineWidth / 2, caixaL - ctx.lineWidth, caixaA - ctx.lineWidth, caixaA * 0.24);
  ctx.stroke();
  const base = 1 + caixaA * 0.5 + g * 0.36; // linha de base do número
  let x = x0 + (caixaL - conteudo) / 2;
  ctx.fillStyle = corTexto;
  ctx.font = fonte(g * 0.3);
  ctx.fillText('R$', x, base - g * 0.42);
  x += lRs + g * 0.06;
  ctx.font = fonte(g);
  ctx.fillText(p.inteiro, x, base);
  x += lInt + g * 0.04;
  ctx.font = fonte(g * 0.42);
  ctx.fillText(',' + p.centavos, x, base - g * 0.36);
  if (p.unidade) {
    ctx.font = fonte(g * 0.2);
    ctx.fillText(p.unidade, x + g * 0.06, base - g * 0.06);
  }
}
