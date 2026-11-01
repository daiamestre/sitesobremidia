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

/** Ajustes do desenho que mudam as medidas (F-180). */
export interface AjusteDeMedidas {
  /** altura do cabeçalho em pixels (faixa de tema); ausente = altura padrão do modelo */
  cabecalho?: number;
  /** estilo do rodapé: 'grande' e 'redondo' ocupam mais; 'sem' não ocupa nada */
  rodape?: 'faixa' | 'redondo' | 'grande' | 'sem';
  /** proporção (largura ÷ altura) em que o box de produto fica bom: [mínimo, máximo] */
  boxIdeal?: [number, number];
  /** F-236: 'lateral' = destaques numa coluna à direita; 'dividido' = duas metades com cores diferentes */
  layout?: LayoutDoCartaz;
}

export type LayoutDoCartaz = 'padrao' | 'lateral' | 'dividido';
/** Painel colorido atrás de uma área (coluna de destaques, metade da tela). */
export interface Painel { x: number; y: number; w: number; h: number; tipo: 'coluna' | 'metade' }

const ESCALA_RODAPE = { faixa: 1, redondo: 1.18, grande: 1.4, sem: 0 } as const;

export function medidasDoFormato(f: Pick<Formato, 'largura' | 'altura'>, linhasRodape = 1, ajuste: AjusteDeMedidas = {}): Medidas {
  const { largura: l, altura: a } = f;
  const u = Math.min(l, a);
  const horizontal = l > a * 1.15;
  const pad = Math.round(u * 0.028);
  const gap = Math.round(u * 0.016);
  const cabecalhoPadrao = Math.round(horizontal ? a * 0.2 : l > a * 0.95 ? a * 0.19 : a * 0.135);
  // a faixa do tema nunca engole o cartaz: entre 10% e 38% da altura
  const cabecalho = ajuste.cabecalho ? Math.round(Math.min(a * 0.38, Math.max(a * 0.1, ajuste.cabecalho))) : cabecalhoPadrao;
  // linhas a mais no rodapé: contato da loja (telefone, endereço, redes, pagamento) e advertência de medicamento
  const rodape = Math.round(u * (0.05 + 0.038 * (Math.min(3, Math.max(1, linhasRodape)) - 1)) * ESCALA_RODAPE[ajuste.rodape ?? 'faixa']);
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
  paineis?: Painel[];
}

export const GRADES_FIXAS = [
  '1x1', '2x1', '1x2', '2x2', '3x1', '1x3', '3x2', '2x3', '3x3', '4x2', '2x4', '5x2', '2x5', '1x4', '4x3', '3x4', '4x4', '5x3', '5x4', '4x5', '6x4', '5x5',
] as const;

export const rotuloGrade = (id: string): string => (id === 'auto' ? 'Automática' : id.replace('x', ' × '));

const LIMITE_AUTO = 20;

/** Melhor grade (colunas × linhas) para N produtos numa área de L×A. */
export function melhorGrade(n: number, largura: number, altura: number, ideal: [number, number] = [0.8, 1.7]): { cols: number; rows: number } {
  const [minimo, maximo] = ideal;
  let melhor = { cols: 1, rows: Math.max(1, n) };
  let nota = Infinity;
  for (let cols = 1; cols <= 6; cols++) {
    for (let rows = 1; rows <= 6; rows++) {
      if (cols * rows < n) continue;
      const vazias = cols * rows - n;
      const aspecto = (largura / cols) / (altura / rows);
      // cartão entre 0,8 (um pouco mais alto que largo) e 1,7 (largo, foto de um lado e preço do outro) fica bom;
      // fora disso custa mais, e muito alto e estreito custa mais ainda
      const desvio = aspecto < minimo ? Math.log(minimo / aspecto) * 9 : aspecto > maximo ? Math.log(aspecto / maximo) * 4 : 0;
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

/** F-236: destaques empilhados numa coluna à direita (com painel próprio) e a grade à esquerda. */
function paginaLateral(itens: ProdutoTabloide[], m: Medidas, gradeId: string, destaques: number, ideal?: [number, number]): PaginaLayout {
  const d = Math.max(1, Math.min(destaques || 3, itens.length, 4));
  const lat = itens.slice(0, d);
  const resto = itens.slice(d);
  const colW = resto.length ? Math.round(m.corpoL * 0.3) : m.corpoL;
  const xCol = m.corpoX + m.corpoL - colW;
  const hCol = (m.corpoA - m.gap * (d - 1)) / d;
  const celulas: Celula[] = lat.map((produto, i) => ({ produto, x: xCol, y: m.corpoY + i * (hCol + m.gap), w: colW, h: hCol, destaque: true }));
  let cols = 1, rows = 1;
  if (resto.length) {
    const l = m.corpoL - colW - m.gap * 1.5;
    const fixa = parseGrade(gradeId);
    if (fixa) { cols = fixa.cols; rows = Math.max(fixa.rows, Math.ceil(resto.length / fixa.cols)); }
    else ({ cols, rows } = melhorGrade(resto.length, l, m.corpoA, ideal));
    celulas.push(...posicionarGrade(resto, cols, rows, m.corpoX, m.corpoY, l, m.corpoA, m.gap));
  }
  return { celulas, cols, rows, paineis: [{ x: xCol - m.gap * 0.6, y: m.corpoY - m.gap * 0.6, w: colW + m.gap * 1.2, h: m.corpoA + m.gap * 1.2, tipo: 'coluna' }] };
}

/** F-236: duas metades (cores diferentes), cada uma com a sua coluna de produtos. */
function paginaDividida(itens: ProdutoTabloide[], m: Medidas, gradeId: string): PaginaLayout {
  const metade = Math.ceil(itens.length / 2);
  // F-244: grade fixa "CxL" = C colunas somando as duas metades (4x4 = 2 colunas em cada metade, 4 fileiras)
  const fixa = parseGrade(gradeId);
  const cols = fixa ? Math.max(1, Math.floor(fixa.cols / 2)) : 1;
  const rows = Math.ceil(metade / cols);
  const lados = [itens.slice(0, metade), itens.slice(metade)];
  const meioX = m.largura / 2;
  const celulas: Celula[] = [];
  lados.forEach((lista, k) => {
    if (!lista.length) return;
    const x0 = k === 0 ? m.corpoX : meioX + m.gap;
    const l = (k === 0 ? meioX - m.gap - m.corpoX : m.corpoX + m.corpoL - meioX - m.gap);
    celulas.push(...posicionarGrade(lista, cols, rows, x0, m.corpoY, l, m.corpoA, m.gap).map((c) => ({ ...c, destaque: k === 1 })));
  });
  return { celulas, cols: cols * 2, rows, paineis: [{ x: meioX, y: 0, w: m.largura - meioX, h: m.altura, tipo: 'metade' }] };
}

function montarPagina(itens: ProdutoTabloide[], m: Medidas, gradeId: string, destaques: number, ideal?: [number, number], layout: LayoutDoCartaz = 'padrao'): PaginaLayout {
  if (layout === 'lateral') return paginaLateral(itens, m, gradeId, destaques, ideal);
  if (layout === 'dividido') return paginaDividida(itens, m, gradeId);
  const d = Math.min(destaques, itens.length, 3);
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
    else ({ cols, rows } = melhorGrade(resto.length, m.corpoL, altResto, ideal));
    celulas.push(...posicionarGrade(resto, cols, rows, m.corpoX, yResto, m.corpoL, altResto, m.gap));
  }
  return { celulas, cols, rows };
}

/** Divide a lista em páginas e posiciona os produtos de cada uma. */
export function montarPaginas(produtos: ProdutoTabloide[], formato: Pick<Formato, 'largura' | 'altura'>, gradeId: string, destaques: number, linhasRodape = 1, ajuste: AjusteDeMedidas = {}): PaginaLayout[] {
  const m = medidasDoFormato(formato, linhasRodape, ajuste);
  if (!produtos.length) return [{ celulas: [], cols: 1, rows: 1 }];
  const fixa = parseGrade(gradeId);
  const extras = ajuste.layout === 'lateral' ? Math.max(1, Math.min(destaques || 3, 4)) : ajuste.layout === 'dividido' ? 0 : Math.min(destaques, 3);
  const porPagina = ajuste.layout === 'dividido' ? (fixa ? fixa.cols * fixa.rows : 10) : fixa ? Math.max(1, fixa.cols * fixa.rows + extras) : LIMITE_AUTO + extras;
  const paginas = Math.ceil(produtos.length / porPagina);
  const tamanho = Math.ceil(produtos.length / paginas); // páginas equilibradas
  const out: PaginaLayout[] = [];
  for (let i = 0; i < produtos.length; i += tamanho) out.push(montarPagina(produtos.slice(i, i + tamanho), m, gradeId, destaques, ajuste.boxIdeal, ajuste.layout));
  return out;
}
