// SOBRE MÍDIA STUDIO — os dois formatos andam juntos (F-224): texto, fonte, cores, foto e ajustes mudados num formato
// valem também no outro; posição, tamanho e giro são de cada formato. A camada "irmã" é a de mesmo tipo e nome
// (e a mesma ordem entre as repetidas, como os cubos da Black Friday).
import type { Camada, Documento } from './documento';

const CHAVES = new Set([
  'texto', 'fonte', 'peso', 'italico', 'cor', 'degrade', 'corUltimaLinha', 'maiusculas', 'espacamento', 'entrelinha',
  'src', 'espelhar', 'brilho', 'contraste', 'saturacao', 'desfoque',
  'topo', 'valor', 'sufixo', 'base', 'corTexto', 'borda', 'itens', 'destaque', 'forma',
  'visivel', 'opacidade', 'animacao',
]);

function irmas(d: Documento, c: Pick<Camada, 'tipo' | 'nome'>) {
  return d.camadas.filter((x) => x.tipo === c.tipo && x.nome === c.nome);
}

/** A camada do outro formato que corresponde a esta (ou nada, se ela só existe aqui). */
export function correspondente(origem: Documento, id: string, destino: Documento): Camada | undefined {
  const c = origem.camadas.find((x) => x.id === id);
  if (!c) return undefined;
  return irmas(destino, c)[irmas(origem, c).indexOf(c)];
}

/** Só a parte do pedido que é "aparência/conteúdo" (nunca posição e tamanho). Caixa e contorno levam só a cor. */
export function estiloDoPedido(p: Partial<Camada>, alvo: Camada): Partial<Camada> | null {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (CHAVES.has(k)) out[k] = v;
    else if ((k === 'fundo' || k === 'contorno') && alvo.tipo === 'texto') {
      const atual = alvo[k] as { cor: string } | null | undefined;
      out[k] = v && atual ? { ...atual, cor: (v as { cor: string }).cor } : v ?? null;
    }
  }
  return Object.keys(out).length ? (out as Partial<Camada>) : null;
}

/** Leva a mudança feita numa camada para a irmã no outro formato. */
export function levarMudanca(origem: Documento, id: string, pedido: Partial<Camada>, destino: Documento): Documento {
  const alvo = correspondente(origem, id, destino);
  const estilo = alvo && estiloDoPedido(pedido, alvo);
  if (!alvo || !estilo) return destino;
  return { ...destino, camadas: destino.camadas.map((c) => (c.id === alvo.id ? ({ ...c, ...estilo } as Camada) : c)) };
}

/** O formato que nasce agora herda o que já foi editado no outro (textos, cores, fontes, foto e fundo). */
export function herdarEstilo(origem: Documento, destino: Documento): Documento {
  let d: Documento = { ...destino, fundo: origem.fundo };
  for (const c of origem.camadas) d = levarMudanca(origem, c.id, c, d);
  return d;
}
