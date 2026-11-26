// SOBRE MÍDIA STUDIO — desenha um documento de camadas num canvas 2D (F-221). O mesmo código pinta a miniatura do
// catálogo, a prévia do editor e o PNG final (1920×1080 / 1080×1920): o que o usuário vê é o que vai para a tela.
import { carregarFonteStudio, fonteCanvas } from './fontes';
import { arranjoDoBalao, type Medir } from './balao';
import {
  TAMANHO_DOC, fontesDo, imagensDo, linhasDoTexto,
  type Camada, type CamadaForma, type CamadaImagem, type CamadaItens, type CamadaRedes, type CamadaSelo, type CamadaTexto, type CamadaVaga, type Degrade, type Documento, type RedeSocial,
} from './documento';
import { duracaoDoVideo, estadoNoTempo } from './animacao';
import { logoParaImagem } from './logo3d';
import { desenharEfeito, prepararEfeitos } from './efeitosReais';
import { finalizarRecorte, semFundoNoNavegador } from '../tabloide/recorte';
import { caixaDoLink, linkSemTransformacao, pedeSemFundo } from '../tabloide/fotoPorLink';
import { aplicarCamera, desenharChamas, desenharEstrelas, desenharExplosaoAtras, desenharExplosaoFrente, desenharFogoNaLogo, desenharQuebraAtras, desenharQuebraFrente, indiceDoFundo, instanteDoImpacto, tremorDoImpacto } from './efeitosDeImpacto';

export type Imagens = Map<string, HTMLImageElement>;

/** F-353: os efeitos de fogo do FUNDO e do PREÇO (nomes das camadas em EFEITOS_DO_PALCO) — o dono proibiu */
export const FOGO_PROIBIDO = new Set(['Brasas (efeito)', 'Fogo no chão (efeito)', 'Explosão do preço (efeito)']);

/**
 * F-351 (ordem do dono: "não quero fundo nos produtos"): a foto do produto que pede SEM FUNDO (link do passa-foto com s=1) e
 * chegou COM fundo — a cota grátis do mês da Cloudflare acabou e ela devolve a original — tem o fundo tirado AQUI, no aparelho,
 * antes de ir para qualquer arte (prévia, capa, palco, encarte, vídeo). Fundo liso na hora, com a MESMA inspeção do recorte da
 * nuvem (finalizarRecorte): recorte reprovado não é usado. O resultado fica guardado no aparelho (Cache Storage).
 */
const GUARDA_SEM_FUNDO = 'sm-produto-sem-fundo-v2'; // v2 (F-359): refaz os recortes guardados com a 2ª passada do produto branco
async function recorteGuardado(src: string): Promise<Blob | null> {
  try { const c = await caches.open(GUARDA_SEM_FUNDO); const r = await c.match(src); return r ? await r.blob() : null; } catch { return null; }
}
async function guardarRecorte(src: string, png: Blob) {
  try { const c = await caches.open(GUARDA_SEM_FUNDO); await c.put(src, new Response(png, { headers: { 'Content-Type': 'image/png' } })); } catch { /* sem guarda: refaz na próxima */ }
}
const imagemDoBlob = (png: Blob) => new Promise<HTMLImageElement | null>((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = URL.createObjectURL(png); });
/** a foto tem fundo de verdade? (borda opaca — a recortada tem a borda transparente) */
function temFundo(img: HTMLImageElement): boolean {
  try {
    const lado = 64, k = lado / Math.max(img.naturalWidth, img.naturalHeight);
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true }); if (!x) return false;
    x.drawImage(img, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data;
    let opacos = 0, total = 0;
    const ver = (px: number, py: number) => { total++; if (d[(py * w + px) * 4 + 3] > 240) opacos++; };
    for (let px = 0; px < w; px++) { ver(px, 0); ver(px, h - 1); }
    for (let py = 0; py < h; py++) { ver(0, py); ver(w - 1, py); }
    return opacos / total > 0.6;
  } catch { return false; }
}
// um recorte por vez: o tablet/celular não trava com vários produtos chegando juntos
let filaDeRecortes: Promise<unknown> = Promise.resolve();
export async function produtoSemFundo(src: string, img: HTMLImageElement, forcar = false): Promise<HTMLImageElement> {
  // forcar (F-359): é a camada de um PRODUTO — produto NUNCA tem fundo (ordem do dono), venha a foto de onde vier
  if (!(forcar || pedeSemFundo(src)) || !temFundo(img)) return img;
  const guardado = await recorteGuardado(src);
  if (guardado) return (await imagemDoBlob(guardado)) ?? img;
  const vez = filaDeRecortes.then(async () => {
    const original = linkSemTransformacao(src);
    const bruto = await semFundoNoNavegador(original, 1400, caixaDoLink(src));
    if (!bruto) return null;
    const { png } = await finalizarRecorte(original, bruto);
    return png;
  }).catch(() => null);
  filaDeRecortes = vez;
  const png = await vez;
  if (!png) return img;
  void guardarRecorte(src, png);
  return (await imagemDoBlob(png)) ?? img;
}

const cache = new Map<string, Promise<HTMLImageElement | null>>();
export function carregarImagem(src: string): Promise<HTMLImageElement | null> {
  let p = cache.get(src);
  if (p) return p;
  // F-351: produto que pediu "sem fundo" e chegou com fundo: o fundo sai aqui, antes de qualquer arte
  if (pedeSemFundo(src)) {
    p = carregarImagemSimples(src).then((i) => (i ? produtoSemFundo(src, i) : null));
    cache.set(src, p);
    void p.then((i) => { if (!i) cache.delete(src); });
    return p;
  }
  return carregarImagemSimples(src);
}

/** F-359: as camadas de produto ("Produto", "Produto 2"…) do palco, do encarte e do vídeo */
export const ehCamadaDeProduto = (nome: string) => /^Produto( \d+)?$/.test(nome);
/**
 * F-359 (dono, 24/11/2026, bravo: "não admito produto com fundo branco, nem nas capas nem na criação"): a foto de PRODUTO
 * que chega com fundo (borda opaca) — PNG da marca com fundo branco, link sem o pedido "sem fundo", foto da loja — tem o
 * fundo tirado aqui, antes de qualquer arte, com a mesma inspeção do recorte da nuvem.
 */
const cacheDoProduto = new Map<string, Promise<HTMLImageElement | null>>();
export function carregarImagemDoProduto(src: string): Promise<HTMLImageElement | null> {
  let p = cacheDoProduto.get(src);
  if (p) return p;
  p = carregarImagem(src).then((i) => (i ? produtoSemFundo(src, i, true) : null));
  cacheDoProduto.set(src, p);
  void p.then((i) => { if (!i) cacheDoProduto.delete(src); });
  return p;
}

const cacheSimples = new Map<string, Promise<HTMLImageElement | null>>();
function carregarImagemSimples(src: string): Promise<HTMLImageElement | null> {
  const cache = cacheSimples;
  let p = cache.get(src);
  // F-317: logo 3D de campanha desenhado na hora (o documento guarda a receita, não um arquivo)
  if (!p && src.startsWith('logo3d:')) {
    p = (async () => { try { const cfg = JSON.parse(decodeURIComponent(src.slice(7))); return await logoParaImagem(cfg); } catch { return null; } })();
    cache.set(src, p);
    return p;
  }
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
  // F-359: foto de camada de PRODUTO sempre sem fundo (as outras imagens — fundo, logo, ícones — como vieram)
  const deProduto = new Set(d.camadas.filter((c) => c.tipo === 'imagem' && ehCamadaDeProduto(c.nome)).map((c) => (c as { src: string }).src));
  await Promise.all([...imagensDo(d).map(async (s) => { const i = await (deProduto.has(s) ? carregarImagemDoProduto(s) : carregarImagem(s)); if (i) mapa.set(s, i); }), prepararEfeitos(d)]);
  nomeAcimaDoProduto(d, mapa);
  return mapa;
}

/** F-361: onde o desenho VISÍVEL começa e termina numa foto (fração da altura), sem a margem transparente */
const faixaVisivel = new WeakMap<HTMLImageElement, [number, number]>();
function visivelDaFoto(img: HTMLImageElement): [number, number] {
  const g = faixaVisivel.get(img);
  if (g) return g;
  let r: [number, number] = [0, 1];
  try {
    const lado = 96, k = lado / Math.max(img.naturalWidth, img.naturalHeight);
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    if (x) {
      x.drawImage(img, 0, 0, w, h);
      const dd = x.getImageData(0, 0, w, h).data;
      const linhaTem = (py: number) => { for (let px = 0; px < w; px++) if (dd[(py * w + px) * 4 + 3] > 40) return true; return false; };
      let t = 0; while (t < h && !linhaTem(t)) t++;
      let b = h - 1; while (b > t && !linhaTem(b)) b--;
      if (t < h) r = [t / h, (b + 1) / h];
    }
  } catch { /* foto sem permissão de leitura: usa a caixa inteira */ }
  faixaVisivel.set(img, r);
  return r;
}
/** F-361: topo e base REAIS (na arte) do que está visível numa camada de imagem */
function limitesDaImagem(c: CamadaImagem, img: HTMLImageElement): [number, number] {
  const s = (c.ajuste === 'conter' ? Math.min : Math.max)(c.w / img.naturalWidth, c.h / img.naturalHeight) * Math.max(1, c.zoom);
  const dh = img.naturalHeight * s;
  const y0 = c.y + (c.h - dh) * (c.focoY / 100);
  const [t, b] = visivelDaFoto(img);
  // sem o recorte da caixa (produto e logo soltos, F-240) a foto não é cortada; com ele, nada passa da caixa
  return [Math.max(c.ajuste === 'conter' ? -Infinity : c.y, y0 + dh * t), Math.min(c.ajuste === 'conter' ? Infinity : c.y + c.h, y0 + dh * b)];
}
const baseDoNome = new WeakMap<CamadaTexto, { y: number; h: number; tamanho: number }>();
/**
 * F-361 (dono, 24–25/11/2026: "o nome do produto fica SEMPRE ACIMA do produto, nunca por cima, a uma distância mínima, e
 * acompanha o produto"): o NOME marcado pelo palco (`acimaDoProduto`, que sai se o cliente arrastar o nome à mão) fica colado
 * no TOPO REAL da foto do produto (sem a margem transparente). Produto baixo → o nome desce; produto alto → o nome sobe, até
 * o fim da logo. Se não couber entre a logo e o produto, o nome diminui (até 60%) em vez de ficar por cima. A conta parte
 * sempre da posição original (chamar de novo não acumula).
 */
export function nomeAcimaDoProduto(d: Documento, mapa: Imagens) {
  const nome = d.camadas.find((c): c is CamadaTexto => c.tipo === 'texto' && c.nome === 'Nome do produto' && !!c.acimaDoProduto && c.visivel !== false);
  if (!nome) return;
  const produtos = d.camadas.filter((c): c is CamadaImagem => c.tipo === 'imagem' && ehCamadaDeProduto(c.nome) && c.visivel !== false && c.w > 0 && c.h > 0);
  const base = baseDoNome.get(nome) ?? { y: nome.y, h: nome.h, tamanho: nome.tamanho };
  baseDoNome.set(nome, base);
  let topo = Infinity, fundo = -Infinity, esquerda = Infinity, direita = -Infinity;
  for (const p of produtos) {
    const img = mapa.get(p.src);
    if (!img?.naturalWidth || !img.naturalHeight) continue;
    const [t, b] = limitesDaImagem(p, img);
    topo = Math.min(topo, t); fundo = Math.max(fundo, b);
    esquerda = Math.min(esquerda, p.x); direita = Math.max(direita, p.x + p.w);
  }
  if (!Number.isFinite(topo)) return;
  // só quando o nome fica EM CIMA do produto (em pé); deitado, o nome fica ao lado e não muda. "Em cima" = o meio do nome
  // acima do MEIO do produto (o produto aumentado pelo cliente pode subir além do nome e o nome tem de subir junto)
  const cruza = Math.min(nome.x + nome.w, direita) - Math.max(nome.x, esquerda);
  if (cruza < Math.min(nome.w, direita - esquerda) * 0.3 || base.y + base.h / 2 > (topo + fundo) / 2) return;
  // limite de cima: o fim da LOGO — a logo do palco (mesmo transparente: aí a logo é a pintada no fundo, na mesma caixa),
  // a logo editável em peças ("Logo – base", "Logo – faixa", "Logo – frase", "Logo no círculo") e a logo do cliente
  let limite = 0;
  for (const l of d.camadas) {
    if (!/^Logo( |$)|^Sua logo$/.test(l.nome) || l.visivel === false) continue;
    if (l.y + l.h / 2 > base.y + base.h) continue; // só a logo que fica ACIMA do nome
    if (Math.min(nome.x + nome.w, l.x + l.w) - Math.max(nome.x, l.x) <= 0) continue; // e na mesma coluna (deitado, a logo fica ao lado)
    // logo transparente (a pintada no fundo é a MESMA arte, na mesma caixa): mede o que aparece dela, não a caixa inteira
    const img = l.tipo === 'imagem' ? mapa.get(l.src) : undefined;
    limite = Math.max(limite, l.tipo === 'imagem' && img?.naturalWidth ? limitesDaImagem(l, img)[1] : l.y + l.h);
  }
  limite += 8;
  const folga = Math.max(10, base.h * 0.12);
  let k = 1, y = topo - folga - base.h;
  if (y < limite) {
    // cabe se diminuir até 60%? diminui. Se nem assim (o cliente aumentou o produto até a logo), mantém o tamanho logo abaixo da logo
    const cabe = (topo - folga - limite) / base.h;
    k = cabe >= 0.6 ? cabe : 1;
    y = cabe >= 0.6 ? topo - folga - base.h * k : limite;
  }
  // o nome nunca encosta no BALÃO de preço que fica na mesma linha (ao lado do produto): desce só até logo acima dele
  for (const s of d.camadas) {
    if (s.tipo !== 'selo' || s.visivel === false) continue;
    const lado = Math.min(nome.x + nome.w, s.x + s.w) - Math.max(nome.x, s.x);
    if (lado <= 0 || s.y < base.y + base.h) continue; // balão acima do nome original não limita
    y = Math.max(limite, Math.min(y, s.y - 8 - base.h * k));
  }
  nome.tamanho = base.tamanho * k;
  nome.h = base.h * k;
  nome.y = y;
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
  const filtros = [c.brilho !== 100 && `brightness(${c.brilho}%)`, c.contraste !== 100 && `contrast(${c.contraste}%)`, c.saturacao !== 100 && `saturate(${c.saturacao}%)`, !!c.matiz && `hue-rotate(${c.matiz}deg)`, c.desfoque > 0 && `blur(${c.desfoque * e}px)`].filter(Boolean).join(' ');
  if (filtros) ctx.filter = filtros;
  if (c.espelhar) { ctx.scale(-1, 1); ctx.drawImage(img, -dx - dw, dy, dw, dh); } else ctx.drawImage(img, dx, dy, dw, dh);
  ctx.filter = 'none';
}

function comEspacamento(ctx: CanvasRenderingContext2D, px: number) {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ('letterSpacing' in c) c.letterSpacing = `${px}px`;
}

function desenharTexto(ctx: CanvasRenderingContext2D, c: CamadaTexto) {
  // F-288: texto que encolhe para caber na largura da caixa
  if (c.caber && c.w > 0) {
    ctx.font = fonteCanvas(c.fonte, c.tamanho, c.peso, c.italico);
    comEspacamento(ctx, c.espacamento * c.tamanho);
    // F-290: mede a linha INTEIRA (sem deixar quebrar): "DA PADARIA" encolhe e fica numa linha só, nunca vira "DA / PADARIA"
    const inteiras = (c.maiusculas ? c.texto.toLocaleUpperCase('pt-BR') : c.texto).split('\n');
    const maior = Math.max(1, ...inteiras.map((l) => ctx.measureText(l).width));
    if (maior > c.w * 0.98) c = { ...c, tamanho: Math.max(6, (c.tamanho * c.w * 0.98) / maior) };
  }
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
    ctx.font = fonteCanvas('poppins', p.tamanho, 800);
    // F-353: na estrela o OFERTA!!! tem contorno branco (lê bem em cima das pontas)
    if (c.formato === 'estrela') { ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, p.tamanho * 0.22); ctx.strokeStyle = '#ffffff'; ctx.strokeText(p.texto, p.x, p.y); }
    ctx.fillStyle = cor; ctx.fillText(p.texto, p.x, p.y);
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

/**
 * F-353 (vídeo de referência do dono): a ESTRELA "OFERTA!!!" — estrela de pontas com borda, e o preço num OVAL no meio dela.
 * Os textos saem de arranjoDoBalao (formato 'estrela'), centralizados como em todo balão; o oval acompanha a linha do valor.
 */
function desenharBalaoEstrela(ctx: CanvasRenderingContext2D, c: CamadaSelo) {
  const rx = c.w / 2, ry = c.h / 2, pontas = 18;
  ctx.beginPath();
  for (let k = 0; k < pontas * 2; k++) {
    const a = (k / (pontas * 2)) * Math.PI * 2 - Math.PI / 2;
    const f = k % 2 ? 0.8 : 1;
    const x = Math.cos(a) * rx * f, y = Math.sin(a) * ry * f;
    if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = c.aroFora || c.cor; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, Math.min(c.w, c.h) * 0.03); ctx.strokeStyle = c.borda; ctx.stroke();
  // o oval do preço, na altura do valor (a mesma conta dos textos)
  const medir: Medir = (txt, tam, f) => { ctx.font = f === 'valor' ? fonteCanvas(c.fonte, tam) : fonteCanvas('poppins', tam, 800); const m = ctx.measureText(txt); return { largura: m.width, sobe: m.actualBoundingBoxAscent || tam * 0.75, desce: m.actualBoundingBoxDescent || 0 }; };
  const arr = arranjoDoBalao(c, medir);
  const cy = arr.valor.y - arr.valor.tamanho * 0.36;
  const ow = c.w * 0.74, oh = Math.min(c.h * 0.5, arr.valor.tamanho * 1.3);
  ctx.beginPath(); ctx.ellipse(0, cy, ow / 2 + Math.max(3, c.h * 0.02), oh / 2 + Math.max(3, c.h * 0.02), 0, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
  const g = ctx.createLinearGradient(0, cy - oh / 2, 0, cy + oh / 2);
  g.addColorStop(0, c.cor); g.addColorStop(1, c.corFim || c.cor);
  ctx.beginPath(); ctx.ellipse(0, cy, ow / 2, oh / 2, 0, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = Math.max(4, c.h * 0.035); ctx.strokeStyle = c.borda; ctx.stroke();
  textosDoSelo(ctx, c, false);
}

function desenharSelo(ctx: CanvasRenderingContext2D, c: CamadaSelo) {
  if (c.formato === 'estrela') { desenharBalaoEstrela(ctx, c); return; }
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
  // pedido do dono: o texto pode passar para a DIREITA (o olho lê melhor a faixa do Alerta de Oferta)
  const inicio = l.sentido === 'direita' ? -c.w / 2 - periodo + passo : -c.w / 2 - passo;
  for (let x = inicio; x < c.w / 2; x += periodo) ctx.fillText(txt, x, alto / 2);
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

/** F-278: "SUA LOGO AQUI": quadrado pontilhado com o texto em 3 linhas, centralizado */
function desenharVaga(ctx: CanvasRenderingContext2D, c: CamadaVaga) {
  const r = Math.min(c.w, c.h) * 0.08, lw = Math.max(2, Math.min(c.w, c.h) * 0.014);
  ctx.save();
  caminho(ctx, -c.w / 2 + lw / 2, -c.h / 2 + lw / 2, c.w - lw, c.h - lw, r);
  ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fill();
  ctx.setLineDash([lw * 4, lw * 3]); ctx.lineWidth = lw; ctx.strokeStyle = c.cor; ctx.stroke();
  ctx.restore();
  const linhas = c.texto.split(/s+/).filter(Boolean);
  const t = Math.min(c.h * 0.78 / Math.max(1, linhas.length), c.w * 0.8 / Math.max(...linhas.map((l) => l.length * 0.5), 1));
  ctx.font = fonteCanvas('anton', t, 400); ctx.fillStyle = c.cor; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  linhas.forEach((l, i) => ctx.fillText(l, 0, (i - (linhas.length - 1) / 2) * t * 1.02));
}

/** F-278: um ícone de rede social (branco, com o detalhe na cor de destaque), centro (0,0) e lado t */
function iconeDaRede(ctx: CanvasRenderingContext2D, rede: RedeSocial, t: number, cor: string, destaque: string) {
  const h = t / 2;
  ctx.lineWidth = t * 0.1; ctx.strokeStyle = cor; ctx.fillStyle = cor; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (rede === 'instagram') {
    caminho(ctx, -h, -h, t, t, t * 0.28); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, t * 0.22, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(t * 0.27, -t * 0.27, t * 0.05, 0, Math.PI * 2); ctx.fill();
  } else if (rede === 'facebook') {
    caminho(ctx, -h, -h, t, t, t * 0.18); ctx.fill();
    ctx.fillStyle = destaque; ctx.font = fonteCanvas('poppins', t * 0.85, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('f', t * 0.08, t * 0.08);
  } else if (rede === 'youtube') {
    caminho(ctx, -t * 0.65, -t * 0.4, t * 1.3, t * 0.8, t * 0.22); ctx.fill();
    ctx.fillStyle = destaque; ctx.beginPath(); ctx.moveTo(-t * 0.14, -t * 0.2); ctx.lineTo(t * 0.22, 0); ctx.lineTo(-t * 0.14, t * 0.2); ctx.closePath(); ctx.fill();
  } else if (rede === 'loja') {
    ctx.beginPath(); ctx.moveTo(-h, -h * 0.8); ctx.lineTo(-h * 0.62, -h * 0.8); ctx.lineTo(-h * 0.3, h * 0.35); ctx.lineTo(h * 0.75, h * 0.35); ctx.lineTo(h, -h * 0.45); ctx.lineTo(-h * 0.5, -h * 0.45); ctx.stroke();
    for (const x of [-h * 0.2, h * 0.6]) { ctx.beginPath(); ctx.arc(x, h * 0.75, t * 0.08, 0, Math.PI * 2); ctx.fill(); }
  } else if (rede === 'tiktok') {
    ctx.lineWidth = t * 0.16;
    ctx.beginPath(); ctx.moveTo(t * 0.05, -h); ctx.lineTo(t * 0.05, h * 0.45); ctx.stroke();
    ctx.beginPath(); ctx.arc(-t * 0.13, h * 0.45, t * 0.18, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(t * 0.05, -h); ctx.quadraticCurveTo(t * 0.12, -h * 0.4, h, -h * 0.35); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(0, -t * 0.04, h * 0.88, Math.PI * 0.72, Math.PI * 2.62); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-h * 0.62, h * 0.55); ctx.lineTo(-h * 0.9, h * 0.95); ctx.lineTo(-h * 0.35, h * 0.8); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -t * 0.04, h * 0.38, 0, Math.PI * 2); ctx.fill();
  }
}

/** F-278: a linha das redes sociais: ícones lado a lado, centralizados, e o nome de cada rede embaixo do ícone */
function desenharRedes(ctx: CanvasRenderingContext2D, c: CamadaRedes) {
  const n = c.redes.length;
  if (!n) return;
  const comNome = c.redes.some((r) => r.nome.trim());
  const casa = c.w / n;
  const t = Math.min(comNome ? c.h * 0.58 : c.h * 0.9, casa * 0.62);
  const tNome = Math.min(c.h * 0.24, casa * 0.17);
  const yIcone = comNome ? -c.h / 2 + t / 2 + c.h * 0.03 : 0;
  c.redes.forEach((r, i) => {
    const x = -c.w / 2 + casa * (i + 0.5);
    ctx.save(); ctx.translate(x, yIcone); iconeDaRede(ctx, r.rede, t, c.cor, c.destaque); ctx.restore();
    if (r.nome.trim()) {
      ctx.font = fonteCanvas(c.fonte, tNome, 800); ctx.fillStyle = c.cor; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      let nome = r.nome.trim();
      while (nome.length > 3 && ctx.measureText(nome).width > casa * 0.96) nome = `${nome.slice(0, -2)}…`;
      ctx.fillText(nome, x, yIcone + t / 2 + c.h * 0.06);
    }
  });
}

/** Pinta uma camada (com a animação no instante `tempo`, se houver). Usado pela arte e pelo editor de vídeo (F-227). */
/** o desenho do elemento em si, já com a origem no centro dele (sem posição, giro nem animação de movimento) */
function desenharConteudo(ctx: CanvasRenderingContext2D, c: Camada, imgs: Imagens, escala: number, a: ReturnType<typeof estadoNoTempo> | null, tempo?: number, total = 8) {
  // F-319: o efeito real (filmagem) — sem sombra, no modo de mistura dele
  if (c.tipo === 'efeito') { desenharEfeito(ctx, c, tempo, total); return; }
  sombra(ctx, c, escala);
  if (c.tipo === 'forma') desenharForma(ctx, c);
  else if (c.tipo === 'imagem') desenharImagem(ctx, a && a.zoom !== 1 ? { ...c, zoom: Math.max(1, c.zoom) * a.zoom } : c, imgs.get(c.src), escala);
  else if (c.tipo === 'texto' && c.letreiro) desenharLetreiro(ctx, c, tempo ?? 0);
  else if (c.tipo === 'texto') desenharTexto(ctx, a?.letras != null ? { ...c, texto: c.texto.slice(0, a.letras) } : c);
  else if (c.tipo === 'selo') desenharSelo(ctx, c);
  else if (c.tipo === 'vaga') desenharVaga(ctx, c);
  else if (c.tipo === 'redes') desenharRedes(ctx, c);
  else desenharItens(ctx, c);
}

/**
 * F-290 — MOVIMENTO LISO (regra do dono: nada de pular quadro): na prévia animada cada elemento é desenhado UMA vez numa
 * imagem guardada (com sombra, contorno e filtros) e, a cada quadro, só essa imagem é movida, aumentada, girada e esmaecida.
 * Antes a tela inteira era redesenhada 60 vezes por segundo (textos 3D, sombras, fotos com filtro) e o tablet pulava quadros:
 * o balão "pulsando" saltava. Fica de fora só o que muda por dentro (letreiro, máquina de escrever, panorâmica na foto).
 */
const SPRITES = new Map<string, { tela: HTMLCanvasElement; m: number }>();
function spriteDaCamada(c: Camada, imgs: Imagens, escala: number): { tela: HTMLCanvasElement; m: number } | null {
  const { animacao: _a, x: _x, y: _y, rot: _r, opacidade: _o, id: _i, ...forma } = c as Camada & Record<string, unknown>;
  const src = (c as { src?: string }).src;
  const chave = `${escala.toFixed(4)}|${src && imgs.get(src) ? 1 : 0}|${JSON.stringify(forma)}`;
  const achado = SPRITES.get(chave);
  if (achado) { SPRITES.delete(chave); SPRITES.set(chave, achado); return achado; }
  const extraSombra = c.sombra ? c.sombra.desfoque * 2 + Math.abs(c.sombra.dx) + Math.abs(c.sombra.dy) : 0;
  const m = Math.ceil((c.tipo === 'imagem' || c.tipo === 'forma' ? 6 : Math.min(500, Math.max(c.w, c.h) * 0.45)) + extraSombra);
  const W = c.w + 2 * m, H = c.h + 2 * m;
  const lw = Math.ceil(W * escala), lh = Math.ceil(H * escala);
  if (lw < 1 || lh < 1 || lw * lh > 9e6) return null;
  const tela = document.createElement('canvas');
  tela.width = lw; tela.height = lh;
  const g = tela.getContext('2d');
  if (!g) return null;
  g.setTransform(escala, 0, 0, escala, 0, 0);
  g.translate(W / 2, H / 2);
  desenharConteudo(g, c, imgs, escala, null);
  const s = { tela, m };
  SPRITES.set(chave, s);
  if (SPRITES.size > 160) SPRITES.delete(SPRITES.keys().next().value as string);
  return s;
}

export function desenharCamada(ctx: CanvasRenderingContext2D, c: Camada, imgs: Imagens, escala: number, tempo?: number, total = 8, rapido = false) {
  if (!c.visivel || c.opacidade <= 0) return;
  const a = tempo === undefined ? null : estadoNoTempo(c, tempo, total);
  if (a && a.alfa <= 0) return;
  ctx.save();
  ctx.globalAlpha *= c.opacidade * (a?.alfa ?? 1);
  ctx.translate(c.x + c.w / 2 + (a?.dx ?? 0), c.y + c.h / 2 + (a?.dy ?? 0));
  const giro = c.rot + (a?.rot ?? 0);
  if (giro) ctx.rotate((giro * Math.PI) / 180);
  if (a && (a.escala !== 1 || a.ex !== 1)) ctx.scale(a.escala * a.ex, a.escala);
  const vivo = c.tipo === 'efeito' || (c.tipo === 'texto' && (c.letreiro || a?.letras != null)) || (a != null && a.zoom !== 1);
  const sp = rapido && !vivo ? spriteDaCamada(c, imgs, escala) : null;
  if (sp) {
    ctx.shadowColor = 'transparent';
    ctx.drawImage(sp.tela, -c.w / 2 - sp.m, -c.h / 2 - sp.m, c.w + 2 * sp.m, c.h + 2 * sp.m);
  } else desenharConteudo(ctx, c, imgs, escala, a, tempo, total);
  ctx.restore();
}

/** Pinta o documento inteiro; `escala` = pixels do canvas por pixel do documento. Com `tempo` (segundos), aplica as animações (F-225). */
export function desenharDocumento(ctx: CanvasRenderingContext2D, d: Documento, imgs: Imagens, escala = 1, ocultar?: string | null, tempo?: number, rapido = false) {
  const total = duracaoDoVideo(d);
  const { w, h } = TAMANHO_DOC[d.formato];
  ctx.save();
  ctx.setTransform(escala, 0, 0, escala, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = d.fundo; ctx.fillRect(0, 0, w, h);
  // P-34: efeitos de impacto (só com o tempo: animação e vídeo) — câmera no fundo, chamas e estrelas na frente do fundo,
  // explosão em volta do preço
  // F-353 (ordem do dono): fogo no fundo (chamas, brasas, parede de fogo) e no preço (explosão) não existem mais — nem nos
  // vídeos e projetos salvos antes
  const fx = tempo !== undefined && d.efeitos ? { ...d.efeitos, chamas: false, explosao: false } : null;
  const iFundo = fx ? indiceDoFundo(d) : -1;
  const particulas = () => { if (fx?.chamas) desenharChamas(ctx, tempo!, w, h); if (fx?.estrelas) desenharEstrelas(ctx, tempo!, w, h); };
  if (fx && iFundo < 0) particulas();
  // F-317: a câmera treme quando a logo de campanha bate no centro
  if (fx?.quebra) for (const c of d.camadas) { const ti = instanteDoImpacto(c); const tr = ti != null ? tremorDoImpacto(tempo!, ti, w, h) : null; if (tr) { ctx.translate(tr.dx, tr.dy); break; } }
  d.camadas.forEach((c, i) => {
    if (c.id === ocultar) return;
    if (c.tipo === 'efeito' && FOGO_PROIBIDO.has(c.nome)) return; // F-353: brasas, fogo no chão e explosão do preço
    // F-317: a logo que cai do céu — atrás dela as rachaduras e o fogo; na frente os blocos, a poeira e o clarão
    if (fx && (fx.quebra || fx.fogo) && instanteDoImpacto(c) != null) {
      const ti = instanteDoImpacto(c)!;
      if (fx.quebra) desenharQuebraAtras(ctx, c, tempo!, w, h, !!fx.fogo, !!fx.quebraReal);
      else if (tempo! >= ti) desenharFogoNaLogo(ctx, c, tempo!, Math.min(1, (tempo! - ti) / 0.35));
      desenharCamada(ctx, c, imgs, escala, tempo, total, rapido);
      if (fx.quebra) desenharQuebraFrente(ctx, c, tempo!, w, h, !!fx.quebraReal);
      if (i === iFundo) particulas();
      return;
    }
    if (fx?.camera && i === iFundo) { ctx.save(); aplicarCamera(ctx, tempo!, w, h); desenharCamada(ctx, c, imgs, escala, tempo, total, rapido); ctx.restore(); }
    else if (fx?.explosao && c.nome === 'Preço') {
      desenharExplosaoAtras(ctx, c, tempo!, total, d.corTema ?? '#d40c0c');
      desenharCamada(ctx, c, imgs, escala, tempo, total, rapido);
      desenharExplosaoFrente(ctx, c, tempo!, total);
    } else desenharCamada(ctx, c, imgs, escala, tempo, total, rapido);
    if (fx && i === iFundo) particulas();
  });
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
