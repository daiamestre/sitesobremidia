/**
 * Tabloide Digital (F-173) — recorte de fundo da foto do produto, feito no próprio navegador (sem API).
 * Funciona quando o fundo é liso (branco, cinza, cor única), que é o caso das fotos de embalagem:
 * parte das bordas, apaga tudo que é "cor do fundo" e está ligado à borda, suaviza o contorno e corta as sobras.
 * Foto com cenário (mesa, prateleira, pessoa) não é mexida — continua emoldurada no cartaz.
 */

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
  for (let pos = 0; pos < total; pos++) {
    const i = pos * 4;
    if (visto[pos]) { data[i + 3] = 0; continue; }
    const x = pos % w;
    const y = (pos - x) / w;
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
  if (sobrou < total * 0.1 || sobrou < caixa.w * caixa.h * 0.4) return null;
  return caixa;
}

function carregar(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => ok(img);
    img.onerror = () => erro(new Error('imagem não carregou'));
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
