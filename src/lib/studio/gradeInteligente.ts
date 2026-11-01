// SOBRE MÍDIA STUDIO — GRADE INTELIGENTE (F-244), regra do dono para TODOS os encartes e para o Palco de Ofertas:
//  - o cliente escolhe quantos produtos mostrar (padrão 16, até 20);
//  - a grade é sempre COMPLETA: toda fileira de uma área tem o mesmo número de produtos, nunca sobra produto sozinho;
//  - a grade preenche toda a área: poucos produtos ficam grandes e, conforme a quantidade cresce, eles diminuem.
// Por isso a escolha é entre quantidades que formam grade completa; com menos produtos na lista, vale a maior quantidade
// que dá grade completa (com 13 produtos, 12).

export const QUANTIDADES = [4, 6, 8, 10, 12, 16, 20] as const;
export const QUANTIDADE_PADRAO = 16;
export const MAX_DE_PRODUTOS = 20;
export const CHAVE_QUANTIDADE = 'studio-quantidade-produtos';

export function lerQuantidade(): number {
  try {
    const n = Number(localStorage.getItem(CHAVE_QUANTIDADE));
    return (QUANTIDADES as readonly number[]).includes(n) ? n : QUANTIDADE_PADRAO;
  } catch { return QUANTIDADE_PADRAO; }
}
export function gravarQuantidade(n: number) {
  try { localStorage.setItem(CHAVE_QUANTIDADE, String(n)); } catch { /* sem armazenamento: vale só nesta tela */ }
}

/** Quantos produtos entram: a maior quantidade que forma grade completa, sem passar do pedido nem do que há na lista. */
export function quantidadeCompleta(pedida: number, disponivel: number): number {
  const limite = Math.min(pedida, disponivel, MAX_DE_PRODUTOS);
  const certa = [...QUANTIDADES].reverse().find((q) => q <= limite);
  if (certa) return certa;
  return limite >= 2 ? 2 : Math.max(0, limite); // lista muito curta: 2 produtos, ou o único que houver
}

export interface Area { w: number; h: number }
export interface GradeDaArea { n: number; cols: number; rows: number }

const GAP = 16;
/** Pares colunas × fileiras que preenchem exatamente n produtos. */
export function fatores(n: number, maxCols = 6, maxRows = 7): Array<{ cols: number; rows: number }> {
  const out: Array<{ cols: number; rows: number }> = [];
  for (let cols = 1; cols <= Math.min(n, maxCols); cols++) {
    if (n % cols === 0 && n / cols <= maxRows) out.push({ cols, rows: n / cols });
  }
  return out;
}
const celulaDe = (a: Area, g: { cols: number; rows: number }, gap = GAP) => ({ w: (a.w - gap * (g.cols - 1)) / g.cols, h: (a.h - gap * (g.rows - 1)) / g.rows });

/**
 * Divide n produtos entre as áreas do fundo, cada área com uma grade completa. Escolhe o arranjo em que os cartões ficam
 * mais perto do formato preferido (`alvo` = largura ÷ altura) e com tamanhos parecidos entre as áreas.
 */
export function planejarAreas(areas: Area[], n: number, alvo: number): GradeDaArea[] {
  if (n <= 0) return areas.map(() => ({ n: 0, cols: 1, rows: 1 }));
  if (n === 1) return areas.map((_, i) => (i === 0 ? { n: 1, cols: 1, rows: 1 } : { n: 0, cols: 1, rows: 1 }));
  let melhor: GradeDaArea[] | null = null;
  let nota = Infinity;
  const avaliar = (plano: GradeDaArea[]) => {
    const celulas = plano.map((g, i) => celulaDe(areas[i], g));
    const forma = plano.reduce((t, g, i) => t + (g.n / n) * Math.abs(Math.log(celulas[i].w / celulas[i].h / alvo)), 0);
    const tamanhos = celulas.map((c) => c.w * c.h);
    const desigual = Math.log(Math.max(...tamanhos) / Math.min(...tamanhos));
    const fileiras = new Set(plano.map((g) => g.rows)).size - 1; // fileiras alinhadas entre as áreas ficam melhores
    const s = forma + 0.6 * desigual + 0.12 * fileiras;
    if (s < nota - 1e-9) { nota = s; melhor = plano; }
  };
  const montar = (i: number, resta: number, plano: GradeDaArea[]) => {
    if (i === areas.length - 1) { for (const f of fatores(resta)) avaliar([...plano, { n: resta, ...f }]); return; }
    for (let q = 1; q <= resta - (areas.length - 1 - i); q++) for (const f of fatores(q)) montar(i + 1, resta - q, [...plano, { n: q, ...f }]);
  };
  montar(0, n, []);
  return melhor ?? areas.map((_, i) => ({ n: i === 0 ? n : 0, cols: 1, rows: Math.max(1, i === 0 ? n : 1) }));
}

/** Reparte a lista conforme as cotas de cada área, alternando na proporção delas (a ordem da lista se mantém). */
export function dividirPorCotas<T>(lista: T[], cotas: number[]): T[][] {
  const out: T[][] = cotas.map(() => []);
  for (const p of lista) {
    let k = -1, nota = Infinity;
    cotas.forEach((c, i) => {
      if (out[i].length >= c) return;
      const n = (out[i].length + 1) / c;
      if (n < nota - 1e-9) { nota = n; k = i; }
    });
    if (k < 0) break;
    out[k].push(p);
  }
  return out;
}
