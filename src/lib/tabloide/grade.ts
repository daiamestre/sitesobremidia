/**
 * Cartaz Digital (F-172) — distribui os produtos no cartaz (grade automática, grades fixas e destaques).
 * Tudo em pixels do tamanho de projeto do formato (1920×1080, 1080×1920...). O cartaz depois só é escalado.
 */
import type { Formato } from './temas';
import type { ProdutoTabloide } from './parseProdutos';

export interface Medidas {
  largura: number;
  altura: number;
  pad: number;
  gap: number;
  cabecalho: number;
  rodape: number;
  /** Área dos produtos (dentro das margens, entre cabeçalho e rodapé). */
  corpoX: number;
  corpoY: number;
  corpoL: number;
  corpoA: number;
}

export function medidasDoFormato(f: Pick<Formato, 'largura' | 'altura'>, linhasRodape = 1): Medidas {
  const { largura: l, altura: a } = f;
  const u = Math.min(l, a);
  const horizontal = l > a * 1.15;
  const pad = Math.round(u * 0.028);
  const gap = Math.round(u * 0.016);
  const cabecalho = Math.round(horizontal ? a * 0.2 : l > a * 0.95 ? a * 0.19 : a * 0.135);
  // linhas a mais no rodapé: contato da loja (telefone, endereço, redes, pagamento) e advertência de medicamento
  const rodape = Math.round(u * (0.05 + 0.038 * (Math.min(3, Math.max(1, linhasRodape)) - 1)));
  return {
    largura: l, altura: a, pad, gap, cabecalho, rodape,
    corpoX: pad, corpoY: cabecalho + gap, corpoL: l - pad * 2, corpoA: a - cabecalho - rodape - gap * 2 - pad * 0.4,
  };
}

export interface Celula {
  produto: ProdutoTabloide;
  x: number;
  y: number;
  w: number;
  h: number;
  destaque: boolean;
}

export interface PaginaLayout {
  celulas: Celula[];
  cols: number;
  rows: number;
}

export const GRADES_FIXAS = [
  '1x1', '2x1', '1x2', '2x2', '3x1', '3x2', '2x3', '3x3', '4x2', '4x3', '3x4', '4x4', '5x3', '5x4', '4x5', '6x4', '5x5',
] as const;

export const rotuloGrade = (id: string): string => (id === 'auto' ? 'Automática' : id.replace('x', ' × '));

const LIMITE_AUTO = 20;

/** Melhor grade (colunas × linhas) para N produtos numa área de L×A. */
export function melhorGrade(n: number, largura: number, altura: number): { cols: number; rows: number } {
  let melhor = { cols: 1, rows: Math.max(1, n) };
  let nota = Infinity;
  for (let cols = 1; cols <= 6; cols++) {
    for (let rows = 1; rows <= 6; rows++) {
      if (cols * rows < n) continue;
      const vazias = cols * rows - n;
      const aspecto = (largura / cols) / (altura / rows);
      // cartão entre 0,8 (um pouco mais alto que largo) e 1,7 (largo, foto de um lado e preço do outro) fica bom;
      // fora disso custa mais, e muito alto e estreito custa mais ainda
      const desvio = aspecto < 0.8 ? Math.log(0.8 / aspecto) * 9 : aspecto > 1.7 ? Math.log(aspecto / 1.7) * 4 : 0;
      const s = vazias * 1.2 + desvio + (cols * rows) * 0.05;
      if (s < nota) { nota = s; melhor = { cols, rows }; }
    }
  }
  return melhor;
}

function parseGrade(id: string): { cols: number; rows: number } | null {
  const m = /^(\d)x(\d)$/.exec(id);
  return m ? { cols: Number(m[1]), rows: Number(m[2]) } : null;
}

function posicionarGrade(itens: ProdutoTabloide[], cols: number, rows: number, x0: number, y0: number, l: number, a: number, gap: number): Celula[] {
  const w = (l - gap * (cols - 1)) / cols;
  const h = (a - gap * (rows - 1)) / rows;
  const out: Celula[] = [];
  itens.forEach((produto, i) => {
    const linha = Math.floor(i / cols);
    const naLinha = Math.min(cols, itens.length - linha * cols);
    const sobra = (cols - naLinha) * (w + gap) / 2; // última linha incompleta fica centralizada
    const col = i % cols;
    out.push({ produto, x: x0 + sobra + col * (w + gap), y: y0 + linha * (h + gap), w, h, destaque: false });
  });
  return out;
}

function montarPagina(itens: ProdutoTabloide[], m: Medidas, gradeId: string, destaques: number): PaginaLayout {
  const d = Math.min(destaques, itens.length, 2);
  const top = itens.slice(0, d);
  const resto = itens.slice(d);
  const fixa = parseGrade(gradeId);
  const horizontal = m.largura > m.altura * 1.15;
  const celulas: Celula[] = [];
  let yResto = m.corpoY;
  let altResto = m.corpoA;

  if (d > 0) {
    const altDest = resto.length ? Math.round(m.corpoA * (horizontal ? 0.46 : 0.36)) : m.corpoA;
    const wDest = (m.corpoL - m.gap * (d - 1)) / d;
    top.forEach((produto, i) => celulas.push({ produto, x: m.corpoX + i * (wDest + m.gap), y: m.corpoY, w: wDest, h: altDest, destaque: true }));
    yResto = m.corpoY + altDest + m.gap;
    altResto = m.corpoA - altDest - m.gap;
  }

  let cols = 1; let rows = 1;
  if (resto.length) {
    if (fixa) { cols = fixa.cols; rows = Math.max(fixa.rows, Math.ceil(resto.length / fixa.cols)); }
    else ({ cols, rows } = melhorGrade(resto.length, m.corpoL, altResto));
    celulas.push(...posicionarGrade(resto, cols, rows, m.corpoX, yResto, m.corpoL, altResto, m.gap));
  }
  return { celulas, cols, rows };
}

/** Divide a lista em páginas e posiciona os produtos de cada uma. */
export function montarPaginas(produtos: ProdutoTabloide[], formato: Pick<Formato, 'largura' | 'altura'>, gradeId: string, destaques: number, linhasRodape = 1): PaginaLayout[] {
  const m = medidasDoFormato(formato, linhasRodape);
  if (!produtos.length) return [{ celulas: [], cols: 1, rows: 1 }];
  const fixa = parseGrade(gradeId);
  const porPagina = fixa ? Math.max(1, fixa.cols * fixa.rows + Math.min(destaques, 2)) : LIMITE_AUTO + Math.min(destaques, 2);
  const paginas = Math.ceil(produtos.length / porPagina);
  const tamanho = Math.ceil(produtos.length / paginas); // páginas equilibradas
  const out: PaginaLayout[] = [];
  for (let i = 0; i < produtos.length; i += tamanho) out.push(montarPagina(produtos.slice(i, i + tamanho), m, gradeId, destaques));
  return out;
}
