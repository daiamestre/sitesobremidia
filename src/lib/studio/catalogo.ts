// SOBRE MÍDIA STUDIO (MG01/MG02) — catálogo de modelos de arte: segmentos, filtros, busca e ordenação.
// Os números da tela (contagem por segmento, "Mostrando X de Y") saem SEMPRE dos modelos que existem de verdade.
import type { ModeloDeArte } from './modelos';

export type SegmentoId =
  | 'supermercados' | 'alimentacao' | 'saude' | 'beleza' | 'servicos' | 'moda'
  | 'educacao' | 'imobiliaria' | 'fitness' | 'pet' | 'tecnologia';

export interface Segmento { id: SegmentoId; nome: string }

/** Os 11 segmentos, na ordem da referência visual (a categoria "Todos" vem antes deles). */
export const SEGMENTOS: Segmento[] = [
  { id: 'supermercados', nome: 'Supermercados' },
  { id: 'alimentacao', nome: 'Alimentação' },
  { id: 'saude', nome: 'Saúde' },
  { id: 'beleza', nome: 'Beleza' },
  { id: 'servicos', nome: 'Serviços' },
  { id: 'moda', nome: 'Moda' },
  { id: 'educacao', nome: 'Educação' },
  { id: 'imobiliaria', nome: 'Imobiliária' },
  { id: 'fitness', nome: 'Fitness' },
  { id: 'pet', nome: 'Pet' },
  { id: 'tecnologia', nome: 'Tecnologia' },
];

export const nomeDoSegmento = (id: SegmentoId) => SEGMENTOS.find((s) => s.id === id)?.nome ?? id;

export type Formato = '16:9' | '9:16';
export const FORMATOS: { id: Formato; nome: string }[] = [
  { id: '16:9', nome: 'Horizontal 16:9' },
  { id: '9:16', nome: 'Vertical 9:16' },
];

/** Tipos de edição que existem hoje. A edição avançada no Canva entra aqui quando a integração existir (MG04). */
export type TipoDeEdicao = 'rapida';
export const TIPOS_DE_EDICAO: { id: TipoDeEdicao; nome: string }[] = [{ id: 'rapida', nome: 'Edição rápida' }];

export type Ordem = 'recentes' | 'nome' | 'favoritos';
export const ORDENS: { id: Ordem; nome: string }[] = [
  { id: 'recentes', nome: 'Mais recentes' },
  { id: 'nome', nome: 'Nome (A–Z)' },
  { id: 'favoritos', nome: 'Favoritos primeiro' },
];

export interface FiltroDoCatalogo {
  busca: string;
  /** vazio = todos os segmentos */
  segmentos: SegmentoId[];
  formato: Formato | null;
  edicao: TipoDeEdicao | null;
  ordem: Ordem;
}

export const FILTRO_INICIAL: FiltroDoCatalogo = { busca: '', segmentos: [], formato: null, edicao: null, ordem: 'recentes' };

/** minúsculas e sem acento, para a busca achar "saude" em "Saúde" */
export const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function casaBusca(m: ModeloDeArte, busca: string): boolean {
  const termos = normalizar(busca).split(/\s+/).filter(Boolean);
  if (!termos.length) return true;
  const texto = normalizar([m.nome, nomeDoSegmento(m.segmento), m.formato, ...m.etiquetas].join(' '));
  return termos.every((t) => texto.includes(t));
}

export function filtrarModelos(modelos: ModeloDeArte[], f: FiltroDoCatalogo, favoritos: ReadonlySet<string> = new Set()): ModeloDeArte[] {
  const lista = modelos.filter((m) =>
    (f.segmentos.length === 0 || f.segmentos.includes(m.segmento)) &&
    (!f.formato || m.formato === f.formato) &&
    (!f.edicao || m.edicao.includes(f.edicao)) &&
    casaBusca(m, f.busca));
  const porNome = (a: ModeloDeArte, b: ModeloDeArte) => a.nome.localeCompare(b.nome, 'pt-BR');
  const porData = (a: ModeloDeArte, b: ModeloDeArte) => b.criadoEm.localeCompare(a.criadoEm) || porNome(a, b);
  if (f.ordem === 'nome') return lista.sort(porNome);
  if (f.ordem === 'favoritos') return lista.sort((a, b) => Number(favoritos.has(b.id)) - Number(favoritos.has(a.id)) || porData(a, b));
  return lista.sort(porData);
}

/** quantos modelos cada segmento tem (respeita busca, formato e edição, mas não o próprio filtro de segmento) */
export function contarPorSegmento(modelos: ModeloDeArte[], f: FiltroDoCatalogo): Record<SegmentoId, number> {
  const base = filtrarModelos(modelos, { ...f, segmentos: [] });
  const conta = Object.fromEntries(SEGMENTOS.map((s) => [s.id, 0])) as Record<SegmentoId, number>;
  for (const m of base) conta[m.segmento] += 1;
  return conta;
}
