// SOBRE MÍDIA STUDIO — ARRANJO DO BALÃO DE PREÇO (F-247/F-249). REGRA DO DONO, obrigatória em todo o sistema: texto e valor
// organizados e CENTRALIZADOS dentro do balão. Todo balão (redondo, oval ou placa) é UM objeto e passa por esta conta: não
// existe texto de preço posicionado à mão. Ela não desenha nada: recebe como medir a letra e devolve onde cada texto fica,
// com a origem no CENTRO do balão — por isso o teste regraBaloesCentralizados.test.ts confere a regra sem depender de tela.

export type FormatoDoBalao = 'circulo' | 'oval' | 'placa';
export interface TextosDoBalao { w: number; h: number; formato?: FormatoDoBalao; topo: string; moeda?: string | null; valor: string; sufixo: string; base: string; /** selo antigo, com o texto um pouco maior */ classico?: boolean }
/** largura e altura da letra (acima e abaixo da linha de base) */
export interface MedidaDeTexto { largura: number; sobe: number; desce: number }
export type Medir = (texto: string, tamanho: number, fonte: 'valor' | 'detalhe') => MedidaDeTexto;
export interface PecaDoBalao { texto: string; tamanho: number; x: number; y: number; w: number }
export interface ArranjoDoBalao { moeda: PecaDoBalao | null; valor: PecaDoBalao; sufixo: PecaDoBalao | null; topo: PecaDoBalao | null; base: PecaDoBalao | null; centroDoConjunto: number }

export function arranjoDoBalao(c: TextosDoBalao, medir: Medir): ArranjoDoBalao {
  const formato = c.formato ?? 'circulo';
  const r = Math.min(c.w, c.h) / 2;
  // área útil de cada forma: o círculo e o oval têm menos espaço nas pontas
  const larguraUtil = formato === 'circulo' ? 2 * r * 0.8 : c.w * (formato === 'oval' ? 0.74 : 0.86);
  const alturaUtil = c.h * (formato === 'circulo' ? 0.8 : formato === 'oval' ? 0.72 : 0.84);
  const tTopo = formato === 'circulo' ? r * (c.classico ? 0.2 : 0.17) : c.h * 0.16;
  const tBase = formato === 'circulo' ? r * (c.classico ? 0.2 : 0.16) : c.h * 0.14;
  const folga = formato === 'circulo' ? r * 0.085 : c.h * 0.035;
  const extra = (c.topo ? tTopo + folga : 0) + (c.base ? tBase + folga : 0);

  let tv = formato === 'circulo' ? r * 0.95 : c.h * (formato === 'oval' ? 0.66 : 0.78);
  const medidas = () => {
    const tMoeda = tv * 0.32, tSufixo = tv * 0.44, vao = tv * 0.06, vaoSuf = tv * 0.02;
    const moeda = c.moeda ? medir(c.moeda, tMoeda, 'valor') : null;
    const valor = medir(c.valor, tv, 'valor');
    const sufixo = c.sufixo ? medir(c.sufixo, tSufixo, 'valor') : null;
    const wm = moeda ? moeda.largura + vao : 0, ws = sufixo ? sufixo.largura + vaoSuf : 0;
    return { tMoeda, tSufixo, moeda, valor, sufixo, wm, ws, total: wm + valor.largura + ws, alto: valor.sobe + valor.desce };
  };
  let m = medidas();
  while ((m.total > larguraUtil || m.alto + extra > alturaUtil) && tv > r * 0.2) { tv *= 0.95; m = medidas(); }

  // de/por + valor + unidade formam um bloco, e o bloco fica no meio da altura
  const desloc = ((c.topo ? tTopo + folga : 0) - (c.base ? tBase + folga : 0)) / 2;
  const topoValor = -m.alto / 2 + desloc;
  const linhaBase = topoValor + m.valor.sobe;
  let x = -m.total / 2;
  const inicio = x;
  const moeda = m.moeda ? { texto: c.moeda!, tamanho: m.tMoeda, x, y: topoValor + m.alto * 0.22 + m.moeda.sobe, w: m.moeda.largura } : null;
  x += m.wm;
  const valor = { texto: c.valor, tamanho: tv, x, y: linhaBase, w: m.valor.largura };
  x += m.valor.largura + (m.sufixo ? tv * 0.02 : 0);
  const sufixo = m.sufixo ? { texto: c.sufixo, tamanho: m.tSufixo, x, y: topoValor + m.sufixo.sobe, w: m.sufixo.largura } : null;
  const fim = sufixo ? x + sufixo.w : x;
  const linha = (texto: string, tamanho: number, centro: number): PecaDoBalao => { const t = medir(texto, tamanho, 'detalhe'); return { texto, tamanho, x: -t.largura / 2, y: centro + (t.sobe - t.desce) / 2, w: t.largura }; };
  return {
    moeda, valor, sufixo,
    topo: c.topo ? linha(c.topo, tTopo, topoValor - folga - tTopo / 2) : null,
    base: c.base ? linha(c.base, tBase, topoValor + m.alto + folga + tBase / 2) : null,
    centroDoConjunto: (inicio + fim) / 2,
  };
}
