/**
 * Cartaz Digital (F-173) — recorte de fundo da foto do produto, feito no próprio navegador (sem API).
 * Funciona quando o fundo é liso (branco, cinza, cor única), que é o caso das fotos de embalagem:
 * parte das bordas, apaga tudo que é "cor do fundo" e está ligado à borda, suaviza o contorno e corta as sobras.
 * Foto com cenário (mesa, prateleira, pessoa) não é mexida — continua emoldurada no cartaz.
 */
import { acabamento, inspecionar, realcar, repararMordidas, type Inspecao } from './qualidadeRecorte';

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface Caixa { x: number; y: number; w: number; h: number }

const dist = (d: Uint8ClampedArray, i: number, r: number, g: number, b: number) =>
  Math.abs(d[i] - r) + Math.abs(d[i + 1] - g) + Math.abs(d[i + 2] - b);

function mediana(v: number[]): number {
  const o = [...v].sort((a, b) => a - b);
  return o[Math.floor(o.length / 2)] ?? 0;
}

/** Cor do fundo (mediana das bordas) e quanto das bordas tem essa cor. */
export function analisarFundo(p: Pixels): { cor: [number, number, number]; uniformidade: number } {
  const { data, width: w, height: h } = p;
  const idx: number[] = [];
  const passo = Math.max(1, Math.floor(Math.min(w, h) / 120));
  for (let x = 0; x < w; x += passo) { idx.push(x * 4, ((h - 1) * w + x) * 4); }
  for (let y = 0; y < h; y += passo) { idx.push(y * w * 4, (y * w + w - 1) * 4); }
  const cor: [number, number, number] = [mediana(idx.map((i) => data[i])), mediana(idx.map((i) => data[i + 1])), mediana(idx.map((i) => data[i + 2]))];
  const iguais = idx.filter((i) => dist(data, i, cor[0], cor[1], cor[2]) < 60).length;
  return { cor, uniformidade: idx.length ? iguais / idx.length : 0 };
}

/**
 * Apaga o fundo liso (altera `p.data`) e devolve a caixa onde ficou o produto.
 * Devolve null quando o fundo não é liso ou quando o resultado não faz sentido (sobrou quase nada ou quase tudo).
 */
export function recortarFundo(p: Pixels, tolerancia = 54): Caixa | null {
  const { data, width: w, height: h } = p;
  if (w < 8 || h < 8) return null;
  const { cor, uniformidade } = analisarFundo(p);
  if (uniformidade < 0.82) return null;
  const [r, g, b] = cor;
  const visto = new Uint8Array(w * h);
  const fila = new Int32Array(w * h);
  let ini = 0;
  let fim = 0;
  const tentar = (pos: number) => {
    if (visto[pos]) return;
    if (dist(data, pos * 4, r, g, b) < tolerancia) { visto[pos] = 1; fila[fim++] = pos; }
  };
  for (let x = 0; x < w; x++) { tentar(x); tentar((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { tentar(y * w); tentar(y * w + w - 1); }
  while (ini < fim) {
    const pos = fila[ini++];
    const x = pos % w;
    if (x > 0) tentar(pos - 1);
    if (x < w - 1) tentar(pos + 1);
    if (pos >= w) tentar(pos - w);
    if (pos < w * (h - 1)) tentar(pos + w);
  }
  const removidos = fim;
  const total = w * h;
  if (removidos < total * 0.04 || removidos > total * 0.96) return null;

  let x0 = w; let y0 = h; let x1 = -1; let y1 = -1;
  // primeiro e último pixel mantido de cada linha e coluna (para achar áreas apagadas no MEIO do produto)
  const linhaMin = new Int32Array(h).fill(w); const linhaMax = new Int32Array(h).fill(-1);
  const colunaMin = new Int32Array(w).fill(h); const colunaMax = new Int32Array(w).fill(-1);
  for (let pos = 0; pos < total; pos++) {
    const i = pos * 4;
    if (visto[pos]) { data[i + 3] = 0; continue; }
    const x = pos % w;
    const y = (pos - x) / w;
    if (x < linhaMin[y]) linhaMin[y] = x;
    if (x > linhaMax[y]) linhaMax[y] = x;
    if (y < colunaMin[x]) colunaMin[x] = y;
    if (y > colunaMax[x]) colunaMax[x] = y;
    // contorno: pixel do produto encostado no fundo e ainda parecido com ele fica meio transparente (borda suave)
    const vizinhoFundo = (x > 0 && visto[pos - 1]) || (x < w - 1 && visto[pos + 1]) || (y > 0 && visto[pos - w]) || (y < h - 1 && visto[pos + w]);
    if (vizinhoFundo) {
      const d = dist(data, i, r, g, b);
      if (d < tolerancia * 2.2) data[i + 3] = Math.round(255 * Math.min(1, Math.max(0.25, d / (tolerancia * 2.2))));
    }
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x1 < x0 || y1 < y0) return null;
  const caixa = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  // produto branco em fundo branco: o recorte "come" o produto e sobra só um contorno fino — nesse caso não recorta
  const sobrou = total - removidos;
  // (produto pequeno no quadro é normal — imagem criada por IA deixa muita margem —, por isso o piso sobre a foto inteira é baixo)
  if (sobrou < total * 0.02 || sobrou < caixa.w * caixa.h * 0.4) return null;
  // recorte que apagou parte do MEIO do produto (rótulo branco em fundo branco virou buraco): não vale, a foto fica inteira
  let buracos = 0;
  for (let y = caixa.y; y < caixa.y + caixa.h; y++) {
    for (let x = caixa.x; x < caixa.x + caixa.w; x++) {
      if (visto[y * w + x] && x > linhaMin[y] && x < linhaMax[y] && y > colunaMin[x] && y < colunaMax[x]) buracos++;
    }
  }
  if (buracos > caixa.w * caixa.h * 0.06) return null;
  return caixa;
}

/**
 * Caixa do que não é fundo (sem apagar nada): serve para aproximar o produto quando ele ficou pequeno no quadro,
 * mesmo que o recorte de fundo não tenha dado (sombra, objeto fino).
 */
export function caixaDoConteudo(p: Pixels, tolerancia = 60): Caixa | null {
  const { data, width: w, height: h } = p;
  if (w < 8 || h < 8) return null;
  const { cor, uniformidade } = analisarFundo(p);
  if (uniformidade < 0.82) return null;
  let x0 = w; let y0 = h; let x1 = -1; let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (dist(data, (y * w + x) * 4, cor[0], cor[1], cor[2]) >= tolerancia) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < x0 || y1 < y0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function carregar(url: string, repetiu = false): Promise<HTMLImageElement> {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => ok(img);
    // o R2 não manda Vary: Origin: uma cópia sem CORS no cache do navegador recusa a imagem; a segunda tentativa busca outra
    img.onerror = () => {
      if (repetiu || !/^https?:/.test(url)) { erro(new Error('imagem não carregou')); return; }
      carregar(`${url}${url.includes('?') ? '&' : '?'}arte=1`, true).then(ok, erro);
    };
    img.src = url;
  });
}

/** Baixa a foto, tira o fundo liso e devolve um PNG transparente já cortado no produto (ou null se não deu). */
export async function recortarImagem(url: string, ladoMax = 900): Promise<Blob | null> {
  try {
    const img = await carregar(url);
    const escala = Math.min(1, ladoMax / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * escala));
    const h = Math.max(1, Math.round(img.naturalHeight * escala));
    const tela = document.createElement('canvas');
    tela.width = w;
    tela.height = h;
    const ctx = tela.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const pixels = ctx.getImageData(0, 0, w, h);
    const caixa = recortarFundo(pixels);
    if (!caixa) return null;
    ctx.putImageData(pixels, 0, 0);
    const margem = Math.round(Math.max(caixa.w, caixa.h) * 0.03);
    const saida = document.createElement('canvas');
    saida.width = caixa.w + margem * 2;
    saida.height = caixa.h + margem * 2;
    saida.getContext('2d')?.drawImage(tela, caixa.x, caixa.y, caixa.w, caixa.h, margem, margem, caixa.w, caixa.h);
    return await new Promise<Blob | null>((ok) => saida.toBlob(ok, 'image/png'));
  } catch {
    return null;
  }
}

/**
 * F-252: a imagem já vem sem fundo (PNG/WebP transparente)? Devolve o PNG cortado no produto, sem sobras; null se ela tem fundo.
 * Vale quando mais da metade da borda é transparente (também pega produto redondo, que só toca a borda em alguns pontos).
 */
export async function pngSemSobras(url: string, ladoMax = 1200, recortada = false): Promise<Blob | null> {
  try {
    const img = await carregar(url);
    const escala = Math.min(1, ladoMax / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * escala));
    const h = Math.max(1, Math.round(img.naturalHeight * escala));
    const tela = document.createElement('canvas');
    tela.width = w;
    tela.height = h;
    const ctx = tela.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const caixa = caixaOpaca(data, w, h, recortada);
    if (!caixa) return null;
    const saida = document.createElement('canvas');
    saida.width = caixa.w;
    saida.height = caixa.h;
    saida.getContext('2d')?.drawImage(tela, caixa.x, caixa.y, caixa.w, caixa.h, 0, 0, caixa.w, caixa.h);
    return await new Promise<Blob | null>((ok) => saida.toBlob(ok, 'image/png'));
  } catch {
    return null;
  }
}

/**
 * Caixa do que não é transparente, ou null se a imagem tem fundo (borda opaca) ou está vazia.
 * `recortada`: a imagem acabou de sair do recorte, então o produto pode encostar em toda a borda; só não vale se nada saiu.
 */
export function caixaOpaca(data: ArrayLike<number>, w: number, h: number, recortada = false): Caixa | null {
  const alfa = (x: number, y: number) => data[(y * w + x) * 4 + 3];
  let borda = 0, vazia = 0;
  const passo = Math.max(1, Math.round(Math.max(w, h) / 200));
  for (let x = 0; x < w; x += passo) for (const y of [0, h - 1]) { borda++; if (alfa(x, y) < 16) vazia++; }
  for (let y = 0; y < h; y += passo) for (const x of [0, w - 1]) { borda++; if (alfa(x, y) < 16) vazia++; }
  if (!recortada && (!borda || vazia / borda < 0.5)) return null;
  let x0 = w, y0 = h, x1 = -1, y1 = -1, cheios = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (alfa(x, y) >= 16) { cheios++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (recortada && (cheios / (w * h) > 0.995 || cheios / (w * h) < 0.02)) return null; // não tirou nada, ou apagou o produto
  return x1 < x0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Do tamanho do lado maior para baixo, o produto é ampliado (com fidelidade) até este lado: no cartaz ele não pode sair borrado. */
const LADO_PADRAO = 1200;

const pixelsDe = (img: HTMLImageElement, w: number, h: number) => {
  const tela = document.createElement('canvas');
  tela.width = w;
  tela.height = h;
  const ctx = tela.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('sem canvas');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
};

/**
 * F-253 — o recorte que veio da nuvem passa pela inspeção contra a foto original ANTES de ser entregue: conserta o que dá, reprova
 * o que tem defeito e só o aprovado recebe o acabamento (contorno limpo, sem halo) e a nitidez do padrão de qualidade.
 */
export async function finalizarRecorte(fotoUrl: string, recorte: Blob): Promise<{ png: Blob | null; inspecao: Inspecao | null }> {
  const local = URL.createObjectURL(recorte);
  try {
    const [rec, foto] = await Promise.all([carregar(local), carregar(fotoUrl)]);
    const w = rec.naturalWidth, h = rec.naturalHeight;
    const pixels = pixelsDe(rec, w, h), original = pixelsDe(foto, w, h).data;
    repararMordidas(original, pixels.data, w, h);
    const inspecao = inspecionar(pixels.data, w, h, original);
    if (!inspecao.aprovado) return { png: null, inspecao };
    acabamento(original, pixels.data, w, h);
    const caixa = caixaOpaca(pixels.data, w, h, true);
    if (!caixa) return { png: null, inspecao };
    const tela = document.createElement('canvas');
    tela.width = w;
    tela.height = h;
    tela.getContext('2d')?.putImageData(pixels, 0, 0);
    const escala = Math.max(1, Math.min(2.5, LADO_PADRAO / Math.max(caixa.w, caixa.h)));
    const saida = document.createElement('canvas');
    saida.width = Math.round(caixa.w * escala);
    saida.height = Math.round(caixa.h * escala);
    const ctx = saida.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { png: null, inspecao };
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(tela, caixa.x, caixa.y, caixa.w, caixa.h, 0, 0, saida.width, saida.height);
    const final = ctx.getImageData(0, 0, saida.width, saida.height);
    realcar(final.data, saida.width, saida.height, escala > 1 ? 0.8 : 0.4);
    ctx.putImageData(final, 0, 0);
    return { png: await new Promise<Blob | null>((ok) => saida.toBlob(ok, 'image/png')), inspecao };
  } finally {
    URL.revokeObjectURL(local);
  }
}

/** O recorte pronto sobre fundo chapado, em JPEG leve: é o que a IA de visão olha para achar defeito no contorno. */
export async function fotoParaInspecao(png: Blob, lado = 640): Promise<string> {
  const local = URL.createObjectURL(png);
  try {
    const img = await carregar(local);
    const e = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
    const tela = document.createElement('canvas');
    tela.width = lado;
    tela.height = lado;
    const ctx = tela.getContext('2d');
    if (!ctx) return '';
    ctx.fillStyle = '#ff2bd6';
    ctx.fillRect(0, 0, lado, lado);
    const w = img.naturalWidth * e, h = img.naturalHeight * e;
    ctx.drawImage(img, (lado - w) / 2, (lado - h) / 2, w, h);
    return tela.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(local);
  }
}

/** Corta as margens vazias em volta do produto (mantém o fundo). Devolve null se não há o que cortar ou não deu. */
export async function cortarMargens(url: string, ladoMax = 900): Promise<Blob | null> {
  try {
    const img = await carregar(url);
    const escala = Math.min(1, ladoMax / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * escala));
    const h = Math.max(1, Math.round(img.naturalHeight * escala));
    const tela = document.createElement('canvas');
    tela.width = w;
    tela.height = h;
    const ctx = tela.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const caixa = caixaDoConteudo(ctx.getImageData(0, 0, w, h));
    // só vale a pena se o produto ocupa menos de 55% do quadro
    if (!caixa || (caixa.w * caixa.h) / (w * h) > 0.55) return null;
    const margem = Math.round(Math.max(caixa.w, caixa.h) * 0.12);
    const x = Math.max(0, caixa.x - margem);
    const y = Math.max(0, caixa.y - margem);
    const cw = Math.min(w - x, caixa.w + margem * 2);
    const ch = Math.min(h - y, caixa.h + margem * 2);
    const saida = document.createElement('canvas');
    saida.width = cw;
    saida.height = ch;
    saida.getContext('2d')?.drawImage(tela, x, y, cw, ch, 0, 0, cw, ch);
    return await new Promise<Blob | null>((ok) => saida.toBlob(ok, 'image/png'));
  } catch {
    return null;
  }
}
